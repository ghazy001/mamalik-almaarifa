import { expect, it } from 'vitest';
import {
  matchArchiveSchema,
  publishedReference,
} from '../src/match-archive.js';
import { sampleArchive } from './match-sample.js';

it('accepts an answer-free completed shared victory and aborted results', () => {
  expect(matchArchiveSchema.parse(sampleArchive)).toEqual(sampleArchive);
  expect(
    matchArchiveSchema.safeParse({
      ...sampleArchive,
      finalTurn: 0,
      result: { ...sampleArchive.result, reason: 'ABORTED', winners: [] },
    }).success,
  ).toBe(true);
});
it.each([
  { ...sampleArchive, token: 'secret' },
  { ...sampleArchive, answers: {} },
  { ...sampleArchive, turnOrder: ['p_teal', 'p_teal', 'p_blue'] },
  { ...sampleArchive, usedQuestionIds: ['same', 'same'] },
  {
    ...sampleArchive,
    territories: Array(15).fill(sampleArchive.territories[0]),
  },
  {
    ...sampleArchive,
    questionSource: 'published',
    usedQuestionIds: ['fixture'],
  },
  {
    ...sampleArchive,
    result: { ...sampleArchive.result, winners: ['p_teal'] },
  },
  { ...sampleArchive, finalTurn: 2 },
])('rejects malformed, private or inconsistent archive input %#', (input) => {
  expect(matchArchiveSchema.safeParse(input).success).toBe(false);
});
it('validates immutable published revision references', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  expect(publishedReference(`${id}_v2`)).toEqual({
    questionId: id,
    revision: 2,
  });
  for (const invalid of [`${id}_v0`, `${id}_v2147483648`, 'invalid_v1'])
    expect(publishedReference(invalid)).toBeNull();
});
