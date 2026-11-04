import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ContentDatabase } from './client.js';
import { contentIdentitySchema } from './permissions.js';
import { BASIC_RANKING_POLICY } from './ranking-policy.js';

const integer = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const aggregate = z.strictObject({
  points: integer,
  position: integer.positive(),
  eligibleMatches: integer.positive(),
  soleWins: integer,
  sharedWins: integer,
});

export function createBasicRankingRepository(db: ContentDatabase) {
  return {
    async standingFor(input: unknown) {
      const identity = contentIdentitySchema.parse(input);
      const policy = BASIC_RANKING_POLICY;
      // One statement sees one committed snapshot. Only the viewer's aggregate
      // leaves SQL; peers are restricted to the same verified Auth issuer.
      const result = await db.execute(sql`
        WITH eligible AS (
          SELECT r.match_id, r.archive
          FROM game.match_results r
          WHERE r.archive->'archiveVersion' = '1'::jsonb
            AND r.archive->>'mode' = 'matchmaking'
            AND r.archive->>'questionSource' = 'published'
            AND r.archive->'rules' = ${JSON.stringify(policy.rules)}::jsonb
            AND r.archive->'result'->>'reason' IN ('CASTLES', 'TURN_LIMIT')
            AND jsonb_typeof(r.archive->'finalTurn') = 'number'
            AND r.archive->'finalTurn' >= '1'::jsonb
            AND r.archive->'finalTurn' <= ${JSON.stringify(policy.rules.maxTurns)}::jsonb
            AND CASE WHEN jsonb_typeof(r.archive->'usedQuestionIds') = 'array'
              THEN jsonb_array_length(r.archive->'usedQuestionIds') ELSE 0 END > 0
            AND (SELECT count(*) FROM game.result_participants roster WHERE roster.match_id = r.match_id) = 3
            AND (SELECT count(*) FROM game.result_participants roster WHERE roster.match_id = r.match_id AND roster.issuer = ${identity.issuer}) = 3
        ), totals AS (
          SELECT p.subject, count(*) AS matches,
            sum(CASE WHEN e.archive->'result'->'winners' ? p.player_id
              THEN CASE WHEN jsonb_array_length(e.archive->'result'->'winners') = 1
                THEN ${policy.soleWinPoints}::integer ELSE ${policy.sharedWinPoints}::integer END ELSE 0 END) AS points,
            count(*) FILTER (WHERE e.archive->'result'->'winners' ? p.player_id AND jsonb_array_length(e.archive->'result'->'winners') = 1) AS sole,
            count(*) FILTER (WHERE e.archive->'result'->'winners' ? p.player_id AND jsonb_array_length(e.archive->'result'->'winners') > 1) AS shared
          FROM eligible e JOIN game.result_participants p ON p.match_id = e.match_id
          WHERE p.issuer = ${identity.issuer}
          GROUP BY p.subject
        ), ranked AS (
          SELECT *, dense_rank() OVER (ORDER BY points DESC) AS position FROM totals
        )
        SELECT points::text, position::text, matches::text AS "eligibleMatches", sole::text AS "soleWins", shared::text AS "sharedWins"
        FROM ranked WHERE subject = ${identity.subject}::uuid
      `);
      const row = result.rows[0];
      return {
        policyVersion: policy.version,
        ...(row
          ? aggregate.parse(row)
          : {
              points: 0,
              position: null,
              eligibleMatches: 0,
              soleWins: 0,
              sharedWins: 0,
            }),
      };
    },
  };
}
