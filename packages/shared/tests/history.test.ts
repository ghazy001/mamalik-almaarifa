import { expect, it } from 'vitest';
import { historyQuerySchema, matchHistoryPageSchema } from '../src/index.js';
const item = {
  matchId: 'm_1',
  recordedAt: '2026-11-01T10:00:00.123456Z',
  rulesVersion: 1,
  mode: 'private',
  finalTurn: 1,
  reason: 'TURN_LIMIT',
  outcome: 'shared',
  rank: 1,
  score: 3,
  castles: 1,
  territories: 1,
  eliminated: false,
};
it('accepts a bounded public history without private identity or provenance', () => {
  expect(
    matchHistoryPageSchema.safeParse({ items: [item], nextCursor: null })
      .success,
  ).toBe(true);
  for (const privateField of [
    'subject',
    'issuer',
    'bankHash',
    'seed',
    'usedQuestionIds',
    'correctChoiceId',
  ])
    expect(
      matchHistoryPageSchema.safeParse({
        items: [{ ...item, [privateField]: 'private' }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  expect(
    matchHistoryPageSchema.safeParse({
      items: Array(21).fill(item),
      nextCursor: null,
    }).success,
  ).toBe(false);
});
it('rejects untrusted identity selectors, offsets, duplicate-style values and malformed cursors', () => {
  expect(historyQuerySchema.safeParse({}).success).toBe(true);
  expect(
    historyQuerySchema.safeParse({ cursor: 'opaque_cursor' }).success,
  ).toBe(true);
  for (const query of [
    { subject: 'victim' },
    { issuer: 'https://attacker' },
    { offset: '20' },
    { limit: '100' },
    { cursor: ['one', 'two'] },
    { cursor: '../private' },
    { cursor: 'x'.repeat(257) },
  ])
    expect(historyQuerySchema.safeParse(query).success).toBe(false);
});
