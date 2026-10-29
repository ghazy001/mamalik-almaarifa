import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import {
  PROTOCOL_VERSION,
  eventSchema,
  roomSnapshotSchema,
} from '@mamalik/shared';
import type { RoomSnapshot, ServerEvent } from '@mamalik/shared';
import { findFixture } from '@mamalik/question-fixtures';
import { createGameService } from '../src/server.js';

const service = createGameService({
  seed: 2026,
  rules: { maxTurns: 18, selectionMs: 5000, answerMs: 4000 },
  resolutionMs: 100,
  reconnectSeconds: 6,
});
let endpoint = '';
let stopped = false;
const clients: Room[] = [];
beforeAll(async () => {
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server?.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing service address');
  endpoint = `http://127.0.0.1:${address.port}`;
  service.simulateLatency(160);
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.leave().catch(() => {})));
  service.simulateLatency(0);
  if (!stopped) await service.gracefullyShutdown(false);
});

function observe(client: Room) {
  clients.push(client);
  let current: RoomSnapshot | null = null;
  const listeners = new Set<() => void>();
  const events: ServerEvent[] = [];
  const wait = <T>(read: () => T | null): Promise<T> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        listeners.delete(inspect);
        reject(new Error('Recovery observation timed out'));
      }, 10000);
      function inspect() {
        const value = read();
        if (value !== null) {
          clearTimeout(timeout);
          listeners.delete(inspect);
          resolve(value);
        }
      }
      listeners.add(inspect);
      inspect();
    });
  client.onMessage('snapshot', (input: unknown) => {
    current = roomSnapshotSchema.parse(input);
    if (current.state?.phase === 'DUEL')
      expect(JSON.stringify(current)).not.toContain('correctChoiceId');
    for (const listener of listeners) listener();
  });
  client.onMessage('clock', () => {});
  client.onMessage('event', (input: unknown) => {
    events.push(eventSchema.parse(input));
    for (const listener of listeners) listener();
  });
  client.send('sync', { nonce: 'initial' });
  return {
    client,
    get: () => current!,
    wait: (check: (snapshot: RoomSnapshot) => boolean) =>
      wait(() => (current && check(current) ? current : null)),
    event: (key: string, type: ServerEvent['type']) =>
      wait(
        () =>
          events.find(
            (event) =>
              event.type === type &&
              'idempotencyKey' in event &&
              event.idempotencyKey === key,
          ) ?? null,
      ),
  };
}
type Guest = ReturnType<typeof observe>;
function send(
  guest: Guest,
  type: string,
  fields: Record<string, string> = {},
  key = `${type}_${guest.get().state!.turn}`,
) {
  const state = guest.get().state!;
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    matchId: state.matchId,
    turn: state.turn,
    type,
    idempotencyKey: key,
    ...fields,
  };
  guest.client.send('command', command);
  return command;
}
async function prepare() {
  const first = observe(
    await new Client(endpoint).create('kingdom', { name: 'أ' }),
  );
  await first.wait((snapshot) => snapshot.seats.length === 1);
  const guests = [first];
  for (const name of ['ب', 'ج'])
    guests.push(
      observe(
        await new Client(endpoint).joinById(first.client.roomId, { name }),
      ),
    );
  await Promise.all(
    guests.map((guest) =>
      guest.wait((snapshot) => snapshot.state?.phase === 'LOBBY'),
    ),
  );
  for (const guest of guests) send(guest, 'READY');
  await Promise.all(
    guests.map((guest) =>
      guest.wait((snapshot) => snapshot.state?.phase === 'ATTACK_SELECTION'),
    ),
  );
  return guests;
}
async function select(guests: Guest[], occupied: boolean) {
  const witness = guests[0]!;
  for (let guard = 0; guard < 18; guard++) {
    const start = await witness.wait(
      (snapshot) => snapshot.state?.phase === 'ATTACK_SELECTION',
    );
    const turn = start.state!.turn;
    const actor = guests.find(
      (guest) => guest.get().playerId === start.state!.activePlayerId,
    )!;
    const own = await actor.wait(
      (snapshot) =>
        snapshot.state?.turn === turn && snapshot.legalTargetIds.length > 0,
    );
    const target = own.legalTargetIds.find(
      (id) =>
        own.state!.territories.find((territory) => territory.id === id)!
          .ownerId !== null,
    );
    send(actor, 'SELECT_TARGET', {
      targetId: (occupied ? target : undefined) ?? own.legalTargetIds[0]!,
    });
    const duel = await witness.wait(
      (snapshot) => snapshot.state?.phase === 'DUEL',
    );
    await Promise.all(
      guests.map((guest) =>
        guest.wait(
          (snapshot) =>
            snapshot.state?.question?.id === duel.state!.question!.id,
        ),
      ),
    );
    if (!occupied || target) return { actor, question: duel.state!.question! };
    const question = duel.state!.question!;
    send(actor, 'SUBMIT_ANSWER', {
      questionId: question.id,
      choiceId: findFixture(question.id).question.correctChoiceId,
    });
    await witness.wait(
      (snapshot) =>
        snapshot.state!.turn > turn || snapshot.state?.phase === 'FINISHED',
    );
  }
  throw new Error('No occupied duel reached through legal moves');
}

it('restores an accepted answer in an occupied duel without resetting its deadline or permitting replacements', async () => {
  const guests = await prepare();
  try {
    const { actor, question } = await select(guests, true);
    expect(question.defenderId).not.toBeNull();
    const defender = guests.find(
      (guest) => guest.get().playerId === question.defenderId,
    )!;
    const spectator = guests.find(
      (guest) => guest !== actor && guest !== defender,
    )!;
    const correct = findFixture(question.id).question.correctChoiceId;
    const wrong = question.choices.find((choice) => choice.id !== correct)!.id;
    const accepted = send(actor, 'SUBMIT_ANSWER', {
      questionId: question.id,
      choiceId: wrong,
    });
    await actor.wait((snapshot) => snapshot.ownChoiceId === wrong);
    expect(defender.get().ownChoiceId).toBeNull();
    const token = actor.client.reconnectionToken;
    actor.client.reconnection.enabled = false;
    actor.client.connection.close(4010);
    await defender.wait((snapshot) =>
      snapshot.seats.some(
        (seat) => seat.playerId === actor.get().playerId && !seat.connected,
      ),
    );
    const restored = observe(await new Client(endpoint).reconnect(token));
    const recovered = await restored.wait(
      (snapshot) => snapshot.state?.question?.id === question.id,
    );
    expect(recovered.playerId).toBe(actor.get().playerId);
    expect(recovered.ownChoiceId).toBe(wrong);
    expect(recovered.state!.question!.deadline).toBe(question.deadline);
    guests[guests.indexOf(actor)] = restored;
    restored.client.send('command', accepted);
    await restored.event(accepted.idempotencyKey, 'ANSWER_ACKNOWLEDGED');
    expect(restored.get().state).toEqual(recovered.state);
    restored.client.send('command', {
      ...accepted,
      choiceId: correct,
      idempotencyKey: 'replacement',
    });
    expect(
      await restored.event('replacement', 'COMMAND_REJECTED'),
    ).toMatchObject({ error: 'ALREADY_ANSWERED' });
    send(
      spectator,
      'SUBMIT_ANSWER',
      { questionId: question.id, choiceId: correct },
      'spectator',
    );
    expect(
      await spectator.event('spectator', 'COMMAND_REJECTED'),
    ).toMatchObject({ error: 'INVALID_ACTOR' });
    send(defender, 'SUBMIT_ANSWER', {
      questionId: question.id,
      choiceId: correct,
    });
    const resolved = await Promise.all(
      guests.map((guest) =>
        guest.wait(
          (snapshot) => snapshot.state?.outcome?.questionId === question.id,
        ),
      ),
    );
    for (const snapshot of resolved) {
      expect(snapshot.state!.outcome).toMatchObject({
        captured: false,
        winner: question.defenderId,
      });
      expect(
        snapshot.state!.territories.find(
          (territory) => territory.id === question.targetId,
        )!.ownerId,
      ).toBe(question.defenderId);
    }
  } finally {
    await Promise.all(guests.map((guest) => guest.client.leave()));
  }
}, 30000);

it('continues an unanswered question while disconnected and rejects its late intent after recovery', async () => {
  const guests = await prepare();
  try {
    const { actor, question } = await select(guests, false);
    const witness = guests.find((guest) => guest !== actor)!;
    const state = actor.get().state!;
    const late = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'SUBMIT_ANSWER',
      matchId: state.matchId,
      turn: state.turn,
      idempotencyKey: 'offline_answer',
      questionId: question.id,
      choiceId: findFixture(question.id).question.correctChoiceId,
    };
    const token = actor.client.reconnectionToken;
    actor.client.reconnection.enabled = false;
    actor.client.connection.close(4010);
    const timedOut = await witness.wait(
      (snapshot) => snapshot.state?.outcome?.questionId === question.id,
    );
    expect(timedOut.serverNow).toBeGreaterThanOrEqual(question.deadline);
    expect(timedOut.state!.outcome?.captured).toBe(false);
    const restored = observe(await new Client(endpoint).reconnect(token));
    const recovered = await restored.wait(
      (snapshot) => snapshot.playerId === actor.get().playerId,
    );
    guests[guests.indexOf(actor)] = restored;
    restored.client.send('command', late);
    const rejection = await restored.event(
      'offline_answer',
      'COMMAND_REJECTED',
    );
    expect(rejection.type).toBe('COMMAND_REJECTED');
    if (rejection.type === 'COMMAND_REJECTED')
      expect(['INVALID_PHASE', 'STALE_TURN']).toContain(rejection.error);
    expect(restored.get().state!.territories).toEqual(
      recovered.state!.territories,
    );
    expect(restored.get().ownChoiceId).toBeNull();
  } finally {
    await Promise.all(guests.map((guest) => guest.client.leave()));
  }
}, 15000);

it('broadcasts an aborted result to connected guests before graceful service shutdown', async () => {
  const guests = await prepare();
  // Avoid the simulator delaying a frame until after the transport is disposed;
  // this case verifies the normal WebSocket close/drain path, not delivery loss.
  service.simulateLatency(0);
  const results = guests.map((guest) =>
    guest.wait(
      (snapshot) =>
        snapshot.closed && snapshot.state?.result?.reason === 'ABORTED',
    ),
  );
  await service.gracefullyShutdown(false);
  stopped = true;
  for (const snapshot of await Promise.all(results))
    expect(snapshot.state!.result!.winners).toEqual([]);
}, 15000);
