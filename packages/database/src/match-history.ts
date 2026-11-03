import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ContentConnection } from './client.js';
import { contentIdentitySchema } from './permissions.js';
import { matchArchiveSchema } from './match-archive.js';
import { matchResults, resultParticipants } from './schema.js';

const cursorValue = z.strictObject({
  at: z.iso.datetime({ precision: 6 }),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});
export class InvalidHistoryCursor extends Error {
  constructor() {
    super('INVALID_HISTORY_CURSOR');
  }
}
function decode(input: string | undefined) {
  if (input === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(input)) throw new Error('Invalid');
    return cursorValue.parse(
      JSON.parse(Buffer.from(input, 'base64url').toString('utf8')),
    );
  } catch {
    throw new InvalidHistoryCursor();
  }
}
/** Identity scoping is part of the SQL query, never a post-query filter. */
export function createMatchHistoryRepository(db: ContentConnection) {
  return {
    async listFor(input: unknown, token?: string) {
      const identity = contentIdentitySchema.parse(input);
      const cursor = decode(token);
      const rows = await db
        .select({
          matchId: matchResults.matchId,
          playerId: resultParticipants.playerId,
          archive: matchResults.archive,
          // Preserve all PostgreSQL microseconds for a lossless keyset boundary.
          recordedAt: sql<string>`to_char(${matchResults.recordedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(resultParticipants)
        .innerJoin(
          matchResults,
          eq(resultParticipants.matchId, matchResults.matchId),
        )
        .where(
          and(
            eq(resultParticipants.issuer, identity.issuer),
            eq(resultParticipants.subject, identity.subject),
            cursor
              ? or(
                  lt(matchResults.recordedAt, sql`${cursor.at}::timestamptz`),
                  and(
                    eq(matchResults.recordedAt, sql`${cursor.at}::timestamptz`),
                    lt(matchResults.matchId, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(matchResults.recordedAt), desc(matchResults.matchId))
        .limit(21);
      const page = rows.slice(0, 20);
      const last = page.at(-1);
      return {
        records: page.map((row) => ({
          ...row,
          archive: matchArchiveSchema.parse(row.archive),
        })),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ at: last.recordedAt, id: last.matchId }),
              ).toString('base64url')
            : null,
      };
    },
  };
}
