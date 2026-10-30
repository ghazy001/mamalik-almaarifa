import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  clockReplySchema,
  commandSchema,
  eventSchema,
  joinOptionsSchema,
  parseCommand,
  roomSnapshotSchema,
} from '../src/index.js';
const base = {
  protocolVersion: PROTOCOL_VERSION,
  matchId: 'm_1',
  turn: 1,
  idempotencyKey: 'key_1',
};
describe('guest room boundaries', () => {
  it('accepts trimmed Arabic names and rejects account/rule/identity injection', () => {
    expect(joinOptionsSchema.parse({ name: '  معرفة  ' })).toEqual({
      name: 'معرفة',
    });
    for (const invalid of [
      { name: '' },
      { name: '<b>اسم</b>' },
      { name: 'اسم\nآخر' },
      { name: 'اسم', playerId: 'p_gold' },
      { name: 'اسم', rules: { maxTurns: 1 } },
      { name: 'اسم', seed: 1 },
    ])
      expect(joinOptionsSchema.safeParse(invalid).success).toBe(false);
  });
  it('uses a strict recipient snapshot envelope and rejects private fields or unknown versions', () => {
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 0,
      roomId: 'a'.repeat(16),
      mode: 'private',
      readyDeadline: null,
      playerId: 'p_teal',
      serverNow: 10,
      closed: false,
      resultStorage: 'disabled',
      seats: [{ playerId: 'p_teal', name: 'معرفة', connected: true }],
      state: null,
      legalTargetIds: [],
      standings: [],
      rules: { maxTurns: 36, selectionMs: 10000, answerMs: 15000 },
      ownChoiceId: null,
      reveal: null,
    };
    expect(roomSnapshotSchema.safeParse(envelope).success).toBe(true);
    for (const invalid of [
      { ...envelope, protocolVersion: PROTOCOL_VERSION + 1 },
      { ...envelope, protocolVersion: 1 },
      { ...envelope, protocolVersion: 2 },
      { ...envelope, resultStorage: undefined },
      { ...envelope, resultStorage: 'confirmed_by_client' },
      { ...envelope, answers: {} },
      { ...envelope, seed: 1 },
      { ...envelope, sequence: -1 },
      { ...envelope, mode: 'ranked' },
      { ...envelope, readyDeadline: -1 },
      { ...envelope, mode: undefined },
      {
        ...envelope,
        seats: [
          ...envelope.seats,
          ...envelope.seats,
          ...envelope.seats,
          ...envelope.seats,
        ],
      },
    ])
      expect(roomSnapshotSchema.safeParse(invalid).success).toBe(false);
    expect(
      roomSnapshotSchema.safeParse({
        ...envelope,
        mode: 'matchmaking',
        readyDeadline: 60_000,
      }).success,
    ).toBe(true);
  });
  it('validates correlated advisory clock replies without accepting a client deadline', () => {
    expect(
      clockReplySchema.safeParse({ nonce: 'sample', serverNow: 100 }).success,
    ).toBe(true);
    for (const invalid of [
      { nonce: '', serverNow: 100 },
      { nonce: 'sample', serverNow: -1 },
      { nonce: 'sample', serverNow: Infinity },
      { nonce: 'sample', serverNow: 100, deadline: 10000 },
    ])
      expect(clockReplySchema.safeParse(invalid).success).toBe(false);
  });
});
describe('strict versioned protocol', () => {
  it.each([
    { ...base, type: 'READY' },
    { ...base, type: 'SELECT_TARGET', targetId: 't_01' },
    { ...base, type: 'SUBMIT_ANSWER', questionId: 'q_1', choiceId: 'a' },
    { ...base, type: 'REQUEST_RECONNECT' },
  ])('parses $type', (command) => {
    expect(parseCommand(command)).toEqual({ ok: true, command });
  });
  it.each([
    null,
    [],
    'READY',
    {},
    { ...base, type: 'CAPTURE' },
    { ...base, type: 'READY', actor: 'victim' },
    { ...base, type: 'READY', now: 1 },
    { ...base, type: 'READY', correct: true },
    { ...base, type: 'READY', turn: -1 },
    { ...base, type: 'READY', turn: 1.5 },
    { ...base, type: 'READY', idempotencyKey: '' },
    { ...base, type: 'SELECT_TARGET', targetId: '../secret' },
    {
      ...base,
      type: 'SUBMIT_ANSWER',
      questionId: 'q',
      choiceId: 'a',
      timestamp: 12,
    },
  ])('rejects malformed/injected command %#', (command) => {
    expect(parseCommand(command)).toEqual({
      ok: false,
      error: 'MALFORMED_COMMAND',
    });
  });
  it('rejects unsupported versions separately', () => {
    for (const protocolVersion of [1, 2, PROTOCOL_VERSION + 1])
      expect(
        parseCommand({
          ...base,
          type: 'READY',
          protocolVersion,
        }),
      ).toEqual({ ok: false, error: 'UNSUPPORTED_VERSION' });
  });
  it('cannot accept privileged server lifecycle actions', () => {
    for (const type of ['RESOLVE', 'ADVANCE', 'FORFEIT', 'ABORT', 'BEGIN'])
      expect(commandSchema.safeParse({ ...base, type }).success).toBe(false);
  });
  it('rejects question events containing secret answers or unknown fields', () => {
    const question = {
      id: 'q',
      text: 'سؤال',
      choices: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })),
      deadline: 15000,
      targetId: 't_01',
      attackerId: 'p1',
      defenderId: null,
    };
    const event = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: 'm',
      turn: 1,
      sequence: 1,
      type: 'QUESTION_PRESENTED',
      question,
    };
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(
      eventSchema.safeParse({
        ...event,
        question: { ...question, correctChoiceId: 'a' },
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...event,
        question: { ...question, answers: {} },
      }).success,
    ).toBe(false);
  });
});
