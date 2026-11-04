import { z } from 'zod';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const standingQuerySchema = z.strictObject({});
export const personalStandingSchema = z
  .strictObject({
    policyVersion: z.literal('basic-v1'),
    points: integer,
    position: integer.positive().nullable(),
    eligibleMatches: integer,
    soleWins: integer,
    sharedWins: integer,
  })
  .superRefine((value, context) => {
    if (
      value.points !== value.soleWins * 3 + value.sharedWins ||
      value.soleWins + value.sharedWins > value.eligibleMatches ||
      (value.eligibleMatches === 0) !== (value.position === null)
    )
      context.addIssue({ code: 'custom', message: 'Inconsistent standing' });
  });
export type PersonalStanding = z.infer<typeof personalStandingSchema>;
