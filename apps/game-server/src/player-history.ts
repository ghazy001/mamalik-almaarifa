import { createMatchHistoryRepository } from '@mamalik/database';
import type { ContentDatabase, ContentIdentity } from '@mamalik/database';
import { matchHistoryPageSchema } from '@mamalik/shared';
import type { MatchHistoryPage } from '@mamalik/shared';

export type PlayerHistory = (
  identity: ContentIdentity,
  cursor?: string,
) => Promise<MatchHistoryPage>;
export function createPlayerHistory(db: ContentDatabase): PlayerHistory {
  const repository = createMatchHistoryRepository(db);
  return async (identity, cursor) => {
    const page = await repository.listFor(identity, cursor);
    return matchHistoryPageSchema.parse({
      items: page.records.map(({ archive, playerId, recordedAt }) => {
        const own = archive.result.placements.find(
          (row) => row.playerId === playerId,
        );
        if (!own) throw new Error('Invalid history placement');
        return {
          matchId: archive.matchId,
          recordedAt,
          rulesVersion: archive.rules.version,
          mode: archive.mode,
          finalTurn: archive.finalTurn,
          reason: archive.result.reason,
          outcome:
            archive.result.reason === 'ABORTED'
              ? 'aborted'
              : archive.result.winners.includes(own.playerId)
                ? archive.result.winners.length > 1
                  ? 'shared'
                  : 'won'
                : 'lost',
          rank: own.rank,
          score: own.score,
          castles: own.castles,
          territories: own.territories,
          eliminated: own.eliminated,
        };
      }),
      nextCursor: page.nextCursor,
    });
  };
}
