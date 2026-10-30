import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ContentConnection } from './client.js';
import { matchResults, resultQuestions } from './schema.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const seat = z.enum(['p_teal', 'p_blue', 'p_gold']);
const territory = z.string().regex(/^t_(?:0[0-9]|1[0-4])$/);
const placement = z.strictObject({
  playerId: seat,
  score: z.number().int().min(0).max(21),
  castles: z.number().int().min(0).max(3),
  territories: z.number().int().min(0).max(15),
  eliminated: z.boolean(),
  rank: z.number().int().min(1).max(3),
});
export const matchArchiveSchema = z
  .strictObject({
    archiveVersion: z.literal(1),
    matchId: id,
    mode: z.enum(['private', 'matchmaking']),
    questionSource: z.enum(['development', 'published']),
    bankHash: z.string().regex(/^[a-f0-9]{64}$/),
    seed: z.number().int().min(0).max(0xffffffff),
    rules: z.strictObject({
      version: z.literal(1),
      maxTurns: z.number().int().min(1).max(120),
      selectionMs: z.number().int().min(100).max(60000),
      answerMs: z.number().int().min(100).max(60000),
    }),
    finalTurn: z.number().int().min(0).max(120),
    turnOrder: z.tuple([seat, seat, seat]),
    territories: z
      .array(z.strictObject({ id: territory, ownerId: seat.nullable() }))
      .length(15),
    usedQuestionIds: z.array(id).max(120),
    result: z.strictObject({
      reason: z.enum(['CASTLES', 'LAST_PLAYER', 'TURN_LIMIT', 'ABORTED']),
      winners: z.array(seat).max(3),
      placements: z.tuple([placement, placement, placement]),
    }),
  })
  .superRefine((value, context) => {
    const invalid = () =>
      context.addIssue({
        code: 'custom',
        message: 'Inconsistent match archive',
      });
    if (
      new Set(value.turnOrder).size !== 3 ||
      new Set(value.territories.map((row) => row.id)).size !== 15 ||
      new Set(value.result.placements.map((row) => row.playerId)).size !== 3 ||
      new Set(value.usedQuestionIds).size !== value.usedQuestionIds.length ||
      value.usedQuestionIds.length > value.rules.maxTurns ||
      value.finalTurn > value.rules.maxTurns
    )
      invalid();
    const winners =
      value.result.reason === 'ABORTED'
        ? []
        : value.result.placements
            .filter((row) => !row.eliminated && row.rank === 1)
            .map((row) => row.playerId);
    if (
      new Set(value.result.winners).size !== value.result.winners.length ||
      winners.length !== value.result.winners.length ||
      winners.some((winner) => !value.result.winners.includes(winner)) ||
      (value.result.reason !== 'ABORTED' && !winners.length)
    )
      invalid();
    if (
      value.questionSource === 'published' &&
      value.usedQuestionIds.some((question) => !publishedReference(question))
    )
      invalid();
  });
export type MatchArchive = z.infer<typeof matchArchiveSchema>;
export function publishedReference(id: string) {
  const match = /^([a-f0-9-]{36})_v([1-9][0-9]{0,9})$/.exec(id);
  if (!match || !z.uuid().safeParse(match[1]).success) return null;
  const revision = Number(match[2]);
  return revision <= 2147483647 ? { questionId: match[1]!, revision } : null;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value)!;
}
export class MatchArchiveConflict extends Error {
  constructor() {
    super('MATCH_ARCHIVE_CONFLICT');
  }
}
export function createMatchResultRepository(db: ContentConnection) {
  return {
    async write(input: unknown) {
      const archive = matchArchiveSchema.parse(input);
      const hash = createHash('sha256')
        .update(canonical(archive))
        .digest('hex');
      return db.transaction(async (tx) => {
        const inserted = await tx
          .insert(matchResults)
          .values({ matchId: archive.matchId, payloadHash: hash, archive })
          .onConflictDoNothing()
          .returning({ id: matchResults.matchId });
        if (!inserted.length) {
          const [existing] = await tx
            .select({ hash: matchResults.payloadHash })
            .from(matchResults)
            .where(eq(matchResults.matchId, archive.matchId));
          if (existing?.hash !== hash) throw new MatchArchiveConflict();
          return { created: false };
        }
        if (archive.usedQuestionIds.length)
          await tx.insert(resultQuestions).values(
            archive.usedQuestionIds.map((questionId, index) => {
              const reference =
                archive.questionSource === 'published'
                  ? publishedReference(questionId)!
                  : null;
              return {
                matchId: archive.matchId,
                position: index,
                questionId,
                contentQuestionId: reference?.questionId ?? null,
                contentRevision: reference?.revision ?? null,
              };
            }),
          );
        return { created: true };
      });
    },
    async get(matchId: string) {
      const [row] = await db
        .select()
        .from(matchResults)
        .where(eq(matchResults.matchId, id.parse(matchId)));
      return row
        ? {
            archive: matchArchiveSchema.parse(row.archive),
            recordedAt: row.recordedAt,
          }
        : null;
    },
  };
}
