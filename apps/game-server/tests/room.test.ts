import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION, roomSnapshotSchema } from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';
import { findFixture } from '@mamalik/question-fixtures';
import { createGameService } from '../src/server.js';

const service = createGameService({
  seed: 2026,
  rules: { maxTurns: 3, selectionMs: 2000, answerMs: 1000 },
  resolutionMs: 100,
  reconnectSeconds: 1,
  readyTimeoutMs: 2000,
});
let endpoint = '';
const rooms: Room[] = [];
beforeAll(async () => {
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server?.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing service address');
  endpoint = `http://127.0.0.1:${address.port}`;
  service.simulateLatency(80);
});
afterAll(async () => {
  await Promise.all(rooms.map((room) => room.leave().catch(() => {})));
  service.simulateLatency(0);
  await service.gracefullyShutdown(false);
});
function observe(room: Room) {
  let current: RoomSnapshot | null = null;
  const waiters = new Set<() => void>();
  room.onMessage('snapshot', (data: unknown) => {
    current = roomSnapshotSchema.parse(data);
    for (const fn of waiters) fn();
  });
  room.onMessage('clock', () => {});
  room.onMessage('event', () => {});
  const wait = (check: (state: RoomSnapshot) => boolean) =>
    new Promise<RoomSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(inspect);
        reject(new Error('Snapshot wait timed out'));
      }, 10000);
      function inspect() {
        if (current && check(current)) {
          clearTimeout(timer);
          waiters.delete(inspect);
          resolve(current);
        }
      }
      waiters.add(inspect);
      inspect();
    });
  room.send('sync', { nonce: 'initial' });
  return { wait, get: () => current! };
}
it('hosts three private guest seats, rejects injected identity, restores a dropped seat, and finishes on server time', async () => {
  const first = await new Client(endpoint).create('kingdom', { name: 'أول' });
  rooms.push(first);
  const one = observe(first);
  await one.wait((state) => state.seats.length === 1);
  const second = await new Client(endpoint).joinById(first.roomId, {
    name: 'ثان',
  });
  rooms.push(second);
  const two = observe(second);
  const third = await new Client(endpoint).joinById(first.roomId, {
    name: 'ثالث',
  });
  rooms.push(third);
  const three = observe(third);
  const views = [one, two, three];
  await Promise.all(
    views.map((view) => view.wait((state) => state.state?.phase === 'LOBBY')),
  );
  await expect(
    new Client(endpoint).joinById(first.roomId, { name: 'رابع' }),
  ).rejects.toThrow();
  const initial = one.get();
  const rejection = new Promise<unknown>((resolve) =>
    first.onMessage('event', resolve),
  );
  first.send('command', {
    protocolVersion: PROTOCOL_VERSION,
    type: 'READY',
    matchId: initial.state!.matchId,
    turn: 0,
    idempotencyKey: 'bad',
    actor: 'p_gold',
  });
  expect(await rejection).toMatchObject({
    type: 'COMMAND_REJECTED',
    error: 'MALFORMED_COMMAND',
  });
  for (const room of rooms)
    room.send('command', {
      protocolVersion: PROTOCOL_VERSION,
      type: 'READY',
      matchId: initial.state!.matchId,
      turn: 0,
      idempotencyKey: 'ready',
    });
  await one.wait((state) => state.state?.phase === 'ATTACK_SELECTION');
  const token = second.reconnectionToken;
  second.reconnection.enabled = false;
  second.connection.close(4010);
  await one.wait((state) =>
    state.seats.some((seat) => seat.playerId === 'p_blue' && !seat.connected),
  );
  const restored = await new Client(endpoint).reconnect(token);
  rooms.push(restored);
  const reconnected = observe(restored);
  expect(
    (
      await reconnected.wait((state) =>
        state.seats.every((seat) => seat.connected),
      )
    ).playerId,
  ).toBe('p_blue');
  expect(JSON.stringify(reconnected.get())).not.toContain('questionDeck');
  const finished = await one.wait((state) => state.state?.phase === 'FINISHED');
  expect(finished.state?.result?.reason).toBe('TURN_LIMIT');
  expect(finished.state?.result?.placements).toHaveLength(3);
}, 20000);

it('rejects client rule/seed overrides and bounds malformed-command traffic', async () => {
  await expect(
    new Client(endpoint).create('kingdom', { name: 'اسم', seed: 1 }),
  ).rejects.toThrow();
  await expect(
    new Client(endpoint).create('kingdom', { name: '<script>' }),
  ).rejects.toThrow();
  const room = await new Client(endpoint).create('kingdom', { name: 'ضيف' });
  rooms.push(room);
  const view = observe(room);
  await view.wait((state) => state.seats.length === 1);
  const limited = new Promise<unknown>((resolve) =>
    room.onMessage('event', (input: unknown) => {
      if (
        typeof input === 'object' &&
        input &&
        'error' in input &&
        input.error === 'RATE_LIMITED'
      )
        resolve(input);
    }),
  );
  for (let index = 0; index < 16; index++)
    room.send('command', { unexpected: true });
  expect(await limited).toMatchObject({ error: 'RATE_LIMITED' });
  await room.leave();
});

it('forfeits only after reconnect grace expires and resolves explicit departures', async () => {
  const first = await new Client(endpoint).create('kingdom', { name: 'أ' });
  rooms.push(first);
  const one = observe(first);
  await one.wait((state) => state.seats.length === 1);
  const second = await new Client(endpoint).joinById(first.roomId, {
    name: 'ب',
  });
  rooms.push(second);
  const two = observe(second);
  const third = await new Client(endpoint).joinById(first.roomId, {
    name: 'ج',
  });
  rooms.push(third);
  const three = observe(third);
  await Promise.all(
    [one, two, three].map((view) =>
      view.wait((state) => state.state?.phase === 'LOBBY'),
    ),
  );
  const id = one.get().state!.matchId;
  for (const client of [first, second, third])
    client.send('command', {
      protocolVersion: PROTOCOL_VERSION,
      type: 'READY',
      matchId: id,
      turn: 0,
      idempotencyKey: 'ready',
    });
  await two.wait((state) => state.state?.phase === 'ATTACK_SELECTION');
  first.reconnection.enabled = false;
  first.connection.close(4010);
  const dropped = await two.wait((state) =>
    state.seats.some((seat) => seat.playerId === 'p_teal' && !seat.connected),
  );
  expect(
    dropped.state!.players.find((p) => p.id === 'p_teal')?.eliminated,
  ).toBe(false);
  const forfeited = await two.wait(
    (state) =>
      !!state.state?.players.find((p) => p.id === 'p_teal')?.eliminated,
  );
  expect(forfeited.state!.territories.some((t) => t.ownerId === 'p_teal')).toBe(
    false,
  );
  await third.leave();
  const result = await two.wait((state) => state.state?.phase === 'FINISHED');
  expect(result.state!.result).toMatchObject({
    reason: 'LAST_PLAYER',
    winners: ['p_blue'],
  });
});

it('packs six concurrent queue guests into two separate three-seat rooms and completes a queued match', async () => {
  const invited = await new Client(endpoint).create('kingdom', {
    name: 'دعوة',
  });
  const queued = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      new Client(endpoint).joinOrCreate('kingdom_queue', {
        name: `مملكة ${index}`,
      }),
    ),
  );
  rooms.push(invited, ...queued);
  try {
    const views = queued.map(observe);
    const snapshots = await Promise.all(
      views.map((view) =>
        view.wait((snapshot) => snapshot.state?.phase === 'LOBBY'),
      ),
    );
    const ids = [...new Set(queued.map((room) => room.roomId))];
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(invited.roomId);
    for (const id of ids) {
      const group = snapshots.filter((snapshot) => snapshot.roomId === id);
      expect(group).toHaveLength(3);
      expect(new Set(group.map((snapshot) => snapshot.playerId)).size).toBe(3);
      expect(group[0]).toMatchObject({ mode: 'matchmaking' });
      expect(group[0]!.seats).toHaveLength(3);
      expect(group[0]!.readyDeadline).toBeGreaterThan(group[0]!.serverNow);
    }
    const playing = queued
      .map((client, index) => ({ client, view: views[index]! }))
      .filter(({ client }) => client.roomId === ids[0]);
    for (const { client, view } of playing)
      client.send('command', {
        protocolVersion: PROTOCOL_VERSION,
        type: 'READY',
        turn: 0,
        matchId: view.get().state!.matchId,
        idempotencyKey: 'ready',
      });
    const first = playing[0]!.view;
    await first.wait(
      (snapshot) => snapshot.state?.phase === 'ATTACK_SELECTION',
    );
    for (let turn = 1; turn <= 3; turn++) {
      const start = await first.wait(
        (snapshot) =>
          snapshot.state?.phase === 'ATTACK_SELECTION' &&
          snapshot.state.turn === turn,
      );
      expect(start.readyDeadline).toBeNull();
      const actor = playing.find(
        ({ view }) => view.get().playerId === start.state!.activePlayerId,
      )!;
      const actorSnapshot = await actor.view.wait(
        (snapshot) =>
          snapshot.state?.turn === turn && snapshot.legalTargetIds.length > 0,
      );
      actor.client.send('command', {
        protocolVersion: PROTOCOL_VERSION,
        type: 'SELECT_TARGET',
        matchId: start.state!.matchId,
        turn,
        idempotencyKey: `target_${turn}`,
        targetId: actorSnapshot.legalTargetIds[0]!,
      });
      const duel = await first.wait(
        (snapshot) => snapshot.state?.phase === 'DUEL',
      );
      const question = duel.state!.question!;
      for (const player of playing.filter(({ view }) =>
        [question.attackerId, question.defenderId].includes(
          view.get().playerId,
        ),
      ))
        player.client.send('command', {
          protocolVersion: PROTOCOL_VERSION,
          type: 'SUBMIT_ANSWER',
          matchId: start.state!.matchId,
          turn,
          idempotencyKey: `answer_${turn}`,
          questionId: question.id,
          choiceId: findFixture(question.id).question.correctChoiceId,
        });
      await first.wait(
        (snapshot) =>
          snapshot.state!.turn > turn || snapshot.state?.phase === 'FINISHED',
      );
    }
    const finished = await Promise.all(
      playing.map(({ view }) =>
        view.wait((snapshot) => snapshot.state?.phase === 'FINISHED'),
      ),
    );
    for (const snapshot of finished) {
      expect(snapshot.state!.result).toEqual(finished[0]!.state!.result);
      expect(snapshot.state!.result!.reason).toBe('TURN_LIMIT');
      expect(
        snapshot.state!.territories.filter(
          (territory) => territory.ownerId !== null,
        ).length,
      ).toBeGreaterThan(3);
    }
  } finally {
    await Promise.all([invited, ...queued].map((client) => client.leave()));
  }
}, 20000);

it('releases cancelled queue seats, reserves dropped seats and excludes prepared rooms from new searches', async () => {
  const first = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'ثابت',
  });
  const one = observe(first);
  await one.wait((snapshot) => snapshot.seats.length === 1);
  const second = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'ملغى',
  });
  const two = observe(second);
  await two.wait((snapshot) => snapshot.seats.length === 2);
  await one.wait((snapshot) => snapshot.seats.length === 2);
  await second.leave();
  await one.wait((snapshot) => snapshot.seats.length === 1);
  const replacement = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'بديل',
  });
  const replacementView = observe(replacement);
  await replacementView.wait((snapshot) => snapshot.seats.length === 2);
  expect(replacement.roomId).toBe(first.roomId);
  const filled = await one.wait((snapshot) => snapshot.seats.length === 2);
  expect(filled.seats.map((seat) => seat.name)).toEqual(['ثابت', 'بديل']);
  const token = replacement.reconnectionToken;
  replacement.reconnection.enabled = false;
  replacement.connection.close(4010);
  await one.wait((snapshot) => snapshot.seats.some((seat) => !seat.connected));
  const third = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'ثالث',
  });
  expect(third.roomId).toBe(first.roomId);
  await one.wait((snapshot) => snapshot.state?.phase === 'LOBBY');
  const restored = await new Client(endpoint).reconnect(token);
  const restoredView = observe(restored);
  expect(
    (
      await restoredView.wait((snapshot) =>
        snapshot.seats.every((seat) => seat.connected),
      )
    ).playerId,
  ).toBe('p_blue');
  const outsider = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'جديد',
  });
  expect(outsider.roomId).not.toBe(first.roomId);
  await third.leave();
  const aborted = await one.wait(
    (snapshot) => snapshot.state?.phase === 'FINISHED',
  );
  expect(aborted.state!.result).toMatchObject({
    reason: 'ABORTED',
    winners: [],
  });
  rooms.push(first, second, replacement, third, restored, outsider);
  await Promise.all(
    [first, restored, outsider].map((client) => client.leave()),
  );
}, 15000);

it('cancels an unready queued lobby on its server deadline and rejects mode/rule injection', async () => {
  await expect(
    new Client(endpoint).joinOrCreate('kingdom_queue', {
      name: 'اسم',
      mode: 'private',
    }),
  ).rejects.toThrow();
  const clients = await Promise.all(
    Array.from({ length: 3 }, () =>
      new Client(endpoint).joinOrCreate('kingdom_queue', { name: 'ضيف' }),
    ),
  );
  rooms.push(...clients);
  try {
    const views = clients.map(observe);
    await Promise.all(
      views.map((view) =>
        view.wait((snapshot) => snapshot.state?.phase === 'LOBBY'),
      ),
    );
    const initial = views[0]!.get();
    for (const client of clients.slice(0, 2))
      client.send('command', {
        protocolVersion: PROTOCOL_VERSION,
        type: 'READY',
        matchId: initial.state!.matchId,
        turn: 0,
        idempotencyKey: 'ready',
      });
    const results = await Promise.all(
      views.map((view) =>
        view.wait((snapshot) => snapshot.state?.phase === 'FINISHED'),
      ),
    );
    for (const snapshot of results) {
      expect(snapshot.serverNow).toBeGreaterThanOrEqual(initial.readyDeadline!);
      expect(snapshot.readyDeadline).toBeNull();
      expect(snapshot.state!.result).toMatchObject({
        reason: 'ABORTED',
        winners: [],
      });
    }
    const rejection = new Promise<unknown>((resolve) =>
      clients[2]!.onMessage('event', resolve),
    );
    clients[2]!.send('command', {
      protocolVersion: PROTOCOL_VERSION,
      type: 'READY',
      matchId: initial.state!.matchId,
      turn: 0,
      idempotencyKey: 'late_ready',
    });
    expect(await rejection).toMatchObject({
      type: 'COMMAND_REJECTED',
      error: 'INVALID_PHASE',
    });
  } finally {
    await Promise.all(clients.map((client) => client.leave()));
  }
}, 15000);

it('releases a queue guest dropped immediately after joining without an unhandled handshake rejection', async () => {
  const first = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'شاهد',
  });
  rooms.push(first);
  const view = observe(first);
  await view.wait((snapshot) => snapshot.seats.length === 1);
  let sawGuest = false;
  const released = view.wait((snapshot) => {
    if (snapshot.seats.some((seat) => seat.name === 'مغادر')) sawGuest = true;
    return sawGuest && snapshot.seats.length === 1;
  });
  const early = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'مغادر',
  });
  rooms.push(early);
  // Do not wait for a snapshot/sync acknowledgement: interrupt the handshake.
  early.reconnection.enabled = false;
  early.connection.close(4010);
  const remaining = await released;
  expect(remaining.seats.map((seat) => seat.name)).toEqual(['شاهد']);
  expect(remaining.state).toBeNull();
  await first.leave();
});
