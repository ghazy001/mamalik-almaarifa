import { PROTOCOL_VERSION, ROOM_ADMISSION_ERRORS } from '@mamalik/shared';
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
  resultStorage: 'disabled',
  seats: [{ playerId: 'p_teal', name: 'معرفة', connected: true }],
  state: null,
  legalTargetIds: [],
  standings: [],
  rules: { maxTurns: 36, selectionMs: 10000, answerMs: 15000 },
  ownChoiceId: null,
  reveal: null,
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

function duel(): RoomSnapshot {
  const state = publicView(
    createMatch({
      id: 'm_test',
      seed: 1,
      players: ['p_teal', 'p_blue', 'p_gold'].map((id) => ({ id, name: id })),
      questionIds: Array.from({ length: 36 }, (_, index) => `q_${index}`),
    }),
  );
  return {
    ...initial(),
    sequence: 10,
    state: {
      ...state,
      turn: 1,
      phase: 'DUEL',
      activePlayerId: 'p_teal',
      question: {
        id: 'q_0',
        text: 'سؤال اختبار',
        targetId: 't_01',
        attackerId: 'p_teal',
        defenderId: null,
        deadline: 15100,
        choices: [
          { id: 'a', text: 'أ' },
          { id: 'b', text: 'ب' },
          { id: 'c', text: 'ج' },
          { id: 'd', text: 'د' },
        ],
      },
    },
  };
}

it('waits for correlated post-reconnect state, rotates the saved token and restores an accepted answer', async () => {
  const room = fakeRoom();
  sdk.create.mockResolvedValueOnce(room);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  const oldNonce = room.send.mock.calls.at(-1)![1].nonce;
  room.messages.get('snapshot')!(duel());
  session.send('SUBMIT_ANSWER', { questionId: 'q_0', choiceId: 'a' });
  room.connection.isOpen = false;
  room.events.get('drop')!();
  expect(session.getSnapshot().pendingAnswer).toBeNull();
  room.connection.isOpen = true;
  room.events.get('reconnect')!();
  // Match the SDK ordering: callback first, token rotation in its finally block.
  room.reconnectionToken = 'rotated_token';
  room.messages.get('snapshot')!({ ...duel(), sequence: 11, serverNow: 200 });
  expect(session.getSnapshot().status).toBe('reconnecting');
  await Promise.resolve();
  expect(JSON.parse(sessionStorage.getItem('mamalik.room.v3')!).token).toBe(
    'rotated_token',
  );
  const nonce = room.send.mock.calls.at(-1)![1].nonce;
  room.messages.get('clock')!({ nonce: oldNonce, serverNow: 200 });
  room.messages.get('snapshot')!({ ...duel(), sequence: 11, serverNow: 201 });
  expect(session.getSnapshot().status).toBe('reconnecting');
  session.send('SUBMIT_ANSWER', { questionId: 'q_0', choiceId: 'b' });
  room.messages.get('clock')!({ nonce, serverNow: 900 });
  room.messages.get('snapshot')!({ ...duel(), sequence: 11, serverNow: 899 });
  expect(session.getSnapshot().status).toBe('reconnecting');
  room.messages.get('snapshot')!({
    ...duel(),
    sequence: 12,
    serverNow: 910,
    ownChoiceId: 'a',
  });
  expect(session.getSnapshot()).toMatchObject({
    status: 'connected',
    error: '',
    snapshot: { ownChoiceId: 'a' },
  });
  expect(session.getSnapshot().snapshot?.state?.question?.deadline).toBe(15100);
  session.send('SUBMIT_ANSWER', { questionId: 'q_0', choiceId: 'b' });
  expect(
    room.send.mock.calls.filter(([type]) => type === 'command'),
  ).toHaveLength(1);
});

it('ignores delayed rejections and cannot replace a pending answer', async () => {
  const room = fakeRoom();
  sdk.create.mockResolvedValueOnce(room);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  room.messages.get('snapshot')!(duel());
  session.send('SUBMIT_ANSWER', { questionId: 'q_0', choiceId: 'a' });
  session.send('SUBMIT_ANSWER', { questionId: 'q_0', choiceId: 'b' });
  expect(
    room.send.mock.calls.filter(([type]) => type === 'command'),
  ).toHaveLength(1);
  const rejection = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'COMMAND_REJECTED',
    matchId: 'm_test',
    turn: 1,
    sequence: 10,
    idempotencyKey: 'SUBMIT_ANSWER_1',
    error: 'ALREADY_ANSWERED',
  };
  for (const stale of [
    { ...rejection, turn: 0 },
    { ...rejection, sequence: 9 },
    { ...rejection, matchId: 'm_old' },
  ]) {
    room.messages.get('event')!(stale);
    expect(session.getSnapshot()).toMatchObject({
      pendingAnswer: 'a',
      error: '',
    });
  }
  room.messages.get('event')!({
    ...rejection,
    idempotencyKey: 'SELECT_TARGET_1',
  });
  expect(session.getSnapshot().pendingAnswer).toBe('a');
  room.messages.get('event')!(rejection);
  expect(session.getSnapshot().pendingAnswer).toBeNull();
});

it('refreshes after a suspended display, throttles probes and never moves advisory time backward', async () => {
  let now = 100;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const room = fakeRoom();
  sdk.create.mockResolvedValueOnce(room);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  const first = room.send.mock.calls.at(-1)![1].nonce;
  room.messages.get('snapshot')!(duel());
  now = 600;
  session.tick();
  const before = session.getSnapshot().estimatedNow;
  room.messages.get('clock')!({ nonce: first, serverNow: 300 });
  session.tick();
  expect(session.getSnapshot().estimatedNow).toBeGreaterThanOrEqual(before);
  now = 1000;
  for (let index = 0; index < 30; index++) session.refresh();
  expect(room.send.mock.calls.filter(([type]) => type === 'sync')).toHaveLength(
    2,
  );
  const nonce = room.send.mock.calls.at(-1)![1].nonce;
  now = 1005;
  room.messages.get('clock')!({ nonce, serverNow: 14000 });
  session.tick();
  expect(session.getSnapshot().estimatedNow).toBeGreaterThanOrEqual(14000);
  session.suspend();
  now = 7000;
  session.refresh();
  session.tick();
  expect(room.send.mock.calls.filter(([type]) => type === 'sync')).toHaveLength(
    2,
  );
});

it('can manually restore a closed transport without clearing its saved seat', async () => {
  const old = fakeRoom();
  const next = fakeRoom();
  sdk.create.mockResolvedValueOnce(old);
  sdk.reconnect.mockResolvedValueOnce(next);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  old.messages.get('snapshot')!(duel());
  old.events.get('leave')!();
  expect(session.getSnapshot().status).toBe('closed');
  await session.connect('restore');
  expect(sdk.reconnect).toHaveBeenCalledWith('private_test_token');
  expect(session.getSnapshot()).toMatchObject({
    status: 'connecting',
    snapshot: null,
  });
  next.messages.get('snapshot')!({ ...duel(), ownChoiceId: 'a' });
  old.messages.get('snapshot')!({ ...duel(), sequence: 100 });
  expect(session.getSnapshot().snapshot?.ownChoiceId).toBe('a');
});

it('does not save a late reconnect token after an explicit departure', async () => {
  const room = fakeRoom();
  sdk.create.mockResolvedValueOnce(room);
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  room.events.get('reconnect')!();
  await session.leave();
  expect(sessionStorage.getItem('mamalik.room.v3')).toBeNull();
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

it.each(Object.values(ROOM_ADMISSION_ERRORS))(
  'shows a safe Arabic bank admission error for code %s',
  async (code) => {
    sdk.queue.mockRejectedValueOnce({ code: 503, message: code });
    const session = createOnlineSession('http://127.0.0.1:2567');
    await session.connect('queue', 'معرفة');
    expect(session.getSnapshot()).toMatchObject({
      status: 'error',
      snapshot: null,
    });
    expect(session.getSnapshot().error).toContain('مكتبة الأسئلة');
    expect(session.getSnapshot().error).not.toContain('private');
  },
);

it('keeps arbitrary admission failures out of the Arabic interface', async () => {
  sdk.create.mockRejectedValueOnce({
    code: 503,
    message: 'private SQL / credentials',
  });
  const session = createOnlineSession('http://127.0.0.1:2567');
  await session.connect('create', 'معرفة');
  expect(session.getSnapshot().status).toBe('error');
  expect(session.getSnapshot().error).toContain('تعذّر الاتصال');
  expect(session.getSnapshot().error).not.toMatch(/private|SQL|credentials/);
});
