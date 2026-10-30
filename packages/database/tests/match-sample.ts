import type { MatchArchive } from '../src/match-archive.js';
export const sampleArchive: MatchArchive = {
  archiveVersion: 1,
  matchId: 'm_result_fixture',
  mode: 'private',
  questionSource: 'development',
  bankHash: 'a'.repeat(64),
  seed: 2026,
  rules: { version: 1, maxTurns: 1, selectionMs: 10000, answerMs: 15000 },
  finalTurn: 1,
  turnOrder: ['p_teal', 'p_blue', 'p_gold'],
  territories: Array.from({ length: 15 }, (_, index) => ({
    id: `t_${String(index).padStart(2, '0')}`,
    ownerId:
      index === 0
        ? 'p_teal'
        : index === 5
          ? 'p_blue'
          : index === 10
            ? 'p_gold'
            : null,
  })),
  usedQuestionIds: [],
  result: {
    reason: 'TURN_LIMIT',
    winners: ['p_teal', 'p_blue', 'p_gold'],
    placements: ['p_teal', 'p_blue', 'p_gold'].map((playerId) => ({
      playerId,
      score: 3,
      castles: 1,
      territories: 1,
      eliminated: false,
      rank: 1,
    })) as MatchArchive['result']['placements'],
  },
};
