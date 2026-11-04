import { expect, it } from 'vitest';
import { personalStandingSchema, standingQuerySchema } from '../src/index.js';
const value = {
  policyVersion: 'basic-v1',
  points: 7,
  position: 2,
  eligibleMatches: 4,
  soleWins: 2,
  sharedWins: 1,
};
it('accepts consistent standing and an explicitly unranked account', () => {
  expect(personalStandingSchema.parse(value)).toEqual(value);
  expect(
    personalStandingSchema.safeParse({
      ...value,
      points: 0,
      position: null,
      eligibleMatches: 0,
      soleWins: 0,
      sharedWins: 0,
    }).success,
  ).toBe(true);
});
it('rejects private fields, selectors, unsafe totals and inconsistent points/positions', () => {
  for (const change of [
    { subject: 'private' },
    { points: 8 },
    { position: null },
    { eligibleMatches: 2 },
    { points: Number.MAX_SAFE_INTEGER + 1 },
    { policyVersion: 'other' },
  ])
    expect(
      personalStandingSchema.safeParse({ ...value, ...change }).success,
    ).toBe(false);
  for (const query of [
    { subject: 'victim' },
    { issuer: 'other' },
    { cursor: 'a' },
    { limit: '100' },
    { points: '99' },
  ])
    expect(standingQuerySchema.safeParse(query).success).toBe(false);
});
