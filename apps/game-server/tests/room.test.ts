import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { roomSnapshotSchema } from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';
import { createGameService } from '../src/server.js';

const service = createGameService({
  seed: 2026,
  rules: { maxTurns: 3, selectionMs: 2000, answerMs: 1000 },
  resolutionMs: 100,
  reconnectSeconds: 1,
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
    protocolVersion: 1,
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
      protocolVersion: 1,
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
      protocolVersion: 1,
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
