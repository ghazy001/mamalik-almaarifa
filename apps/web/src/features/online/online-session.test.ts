import { PROTOCOL_VERSION } from '@mamalik/shared';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMatch, publicView } from '@mamalik/game-core';
import type { RoomSnapshot } from '@mamalik/shared';
import { createOnlineSession } from './online-session';

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  join: vi.fn(),
  queue: vi.fn(),
  reconnect: vi.fn(),
}));
vi.mock('@colyseus/sdk', () => ({
  Client: class {
    create = sdk.create;
    joinById = sdk.join;
    joinOrCreate = sdk.queue;
    reconnect = sdk.reconnect;
  },
}));
function fakeRoom() {
  const messages = new Map<string, (input: unknown) => void>();
  const events = new Map<string, () => void>();
  const bind = (name: string) => (callback: () => void) => {
    events.set(name, callback);
  };
  return {
    messages,
    events,
    reconnectionToken: 'private_test_token',
    reconnection: { minUptime: 0, maxEnqueuedMessages: 0, enabled: true },
    connection: { isOpen: true, close: vi.fn() },
    onMessage: (name: string, callback: (input: unknown) => void) => {
      messages.set(name, callback);
    },
    onDrop: bind('drop'),
    onReconnect: bind('reconnect'),
    onLeave: bind('leave'),
    onError: bind('error'),
    send: vi.fn(),
    leave: vi.fn(async () => {}),
  };
}
const initial = (): RoomSnapshot => ({
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'a'.repeat(16),
  mode: 'private',
  readyDeadline: null,
  playerId: 'p_teal',
  sequence: 1,
  serverNow: 100,
  closed: false,
  seats: [{ playerId: 'p_teal', name: 'معرفة', connected: true }],
  state: null,
  legalTargetIds: [],
  standings: [],
  rules: { maxTurns: 36, selectionMs: 10000, answerMs: 15000 },
  ownChoiceId: null,
  reveal: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
it('rejects malformed/out-of-order snapshots and ignores late messages from a departed room', async () => {
  const old = fakeRoom();
  sdk.create.mockResolvedValueOnce(old);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  old.messages.get('snapshot')!({ ...initial(), hiddenAnswers: {} });
  expect(session.getSnapshot().snapshot).toBeNull();
  old.messages.get('snapshot')!({ ...initial(), sequence: 3 });
  old.messages.get('snapshot')!({ ...initial(), sequence: 2, serverNow: 999 });
  expect(session.getSnapshot().snapshot?.sequence).toBe(3);
  await session.leave();
  old.messages.get('snapshot')!({ ...initial(), sequence: 100 });
  old.events.get('drop')!();
  expect(session.getSnapshot()).toMatchObject({
    snapshot: null,
    status: 'idle',
  });
  const next = fakeRoom();
  sdk.create.mockResolvedValueOnce(next);
  await session.connect('create', 'جديد');
  next.messages.get('snapshot')!({ ...initial(), roomId: 'b'.repeat(16) });
  old.events.get('reconnect')!();
  old.messages.get('snapshot')!({ ...initial(), sequence: 101 });
  expect(session.getSnapshot().snapshot?.roomId).toBe('b'.repeat(16));
  expect(session.getSnapshot().status).toBe('connected');
});
it('sends scoped intent without identity/time or locally changing match outcomes', async () => {
  const room = fakeRoom();
  sdk.create.mockResolvedValueOnce(room);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  const state = createMatch({
    id: 'm_test',
    players: [
      { id: 'p_teal', name: 'أ' },
      { id: 'p_blue', name: 'ب' },
      { id: 'p_gold', name: 'ج' },
    ],
    seed: 1,
    questionIds: Array.from({ length: 36 }, (_, i) => `q_${i}`),
  });
  room.messages.get('snapshot')!({ ...initial(), state: publicView(state) });
  const before = session.getSnapshot().snapshot;
  session.send('READY');
  expect(room.send).toHaveBeenLastCalledWith('command', {
    protocolVersion: PROTOCOL_VERSION,
    type: 'READY',
    matchId: 'm_test',
    turn: 0,
    idempotencyKey: 'READY_0',
  });
  expect(session.getSnapshot().snapshot).toBe(before);
  room.events.get('drop')!();
  room.send.mockClear();
  session.send('READY');
  expect(room.send).not.toHaveBeenCalled();
});
it('closes an asynchronously joined socket after unmount without attaching stale listeners', async () => {
  const room = fakeRoom();
  let resolve!: (value: typeof room) => void;
  sdk.create.mockReturnValueOnce(
    new Promise<typeof room>((done) => {
      resolve = done;
    }),
  );
  const session = createOnlineSession('http://127.0.0.1:2567');
  const joining = session.connect('create', 'معرفة');
  session.suspend();
  resolve(room);
  await joining;
  expect(room.connection.close).toHaveBeenCalledWith(4010);
  expect(room.messages.size).toBe(0);
  expect(session.getSnapshot().snapshot).toBeNull();
});

it('cancels a pending queue reservation with consent and ignores it after another search starts', async () => {
  const cancelled = fakeRoom();
  const next = fakeRoom();
  let resolve!: (value: typeof cancelled) => void;
  sdk.queue.mockReturnValueOnce(
    new Promise<typeof cancelled>((done) => {
      resolve = done;
    }),
  );
  sdk.queue.mockResolvedValueOnce(next);
  const session = createOnlineSession('http://127.0.0.1:2567');
  const pending = session.connect('queue', 'أول');
  expect(sdk.queue).toHaveBeenCalledWith('kingdom_queue', { name: 'أول' });
  expect(session.getSnapshot().searching).toBe(true);
  await session.leave();
  await session.connect('queue', 'ثان');
  next.messages.get('snapshot')!({
    ...initial(),
    mode: 'matchmaking',
    roomId: 'b'.repeat(16),
  });
  resolve(cancelled);
  await pending;
  expect(cancelled.leave).toHaveBeenCalledOnce();
  expect(cancelled.connection.close).not.toHaveBeenCalled();
  expect(cancelled.messages.size).toBe(0);
  expect(session.getSnapshot().snapshot?.roomId).toBe('b'.repeat(16));
  await session.leave();
  expect(next.leave).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({
    status: 'idle',
    searching: false,
    snapshot: null,
  });
});

it('reserves only one seat while connecting or awaiting the first snapshot', async () => {
  const room = fakeRoom();
  let resolve!: (value: typeof room) => void;
  sdk.queue.mockReturnValueOnce(
    new Promise<typeof room>((done) => {
      resolve = done;
    }),
  );
  const session = createOnlineSession('http://127.0.0.1:2567');
  const connecting = session.connect('queue', 'معرفة');
  await session.connect('queue', 'مكرر');
  expect(sdk.queue).toHaveBeenCalledTimes(1);
  resolve(room);
  await connecting;
  expect(session.getSnapshot().snapshot).toBeNull();
  await session.connect('queue', 'مكرر');
  expect(sdk.queue).toHaveBeenCalledTimes(1);
});
