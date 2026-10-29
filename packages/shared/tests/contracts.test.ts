import { describe, expect, it } from 'vitest';
import { commandSchema, eventSchema, parseCommand } from '../src/index.js';
const base = {
  protocolVersion: 1,
  matchId: 'm_1',
  turn: 1,
  idempotencyKey: 'key_1',
};
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
    expect(
      parseCommand({ ...base, type: 'READY', protocolVersion: 2 }),
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
      protocolVersion: 1,
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
