import { z } from 'zod';

export const historyCursorSchema = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
export const historyQuerySchema = z.strictObject({
  cursor: historyCursorSchema.optional(),
});
export const matchHistoryItemSchema = z.strictObject({
  matchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  recordedAt: z.iso.datetime({ precision: 6 }),
  rulesVersion: z.literal(1),
  mode: z.enum(['private', 'matchmaking']),
  finalTurn: z.number().int().min(0).max(120),
  reason: z.enum(['CASTLES', 'LAST_PLAYER', 'TURN_LIMIT', 'ABORTED']),
  outcome: z.enum(['won', 'shared', 'lost', 'aborted']),
  rank: z.number().int().min(1).max(3),
  score: z.number().int().min(0).max(21),
  castles: z.number().int().min(0).max(3),
  territories: z.number().int().min(0).max(15),
  eliminated: z.boolean(),
});
export const matchHistoryPageSchema = z.strictObject({
  items: z.array(matchHistoryItemSchema).max(20),
  nextCursor: historyCursorSchema.nullable(),
});
export type MatchHistoryPage = z.infer<typeof matchHistoryPageSchema>;
