import {
  matchArchiveSchema,
  matchParticipantsSchema,
} from './match-archive.js';

export const BASIC_RANKING_POLICY = Object.freeze({
  version: 'basic-v1' as const,
  rules: Object.freeze({
    version: 1,
    maxTurns: 36,
    selectionMs: 10000,
    answerMs: 15000,
  }),
  soleWinPoints: 3,
  sharedWinPoints: 1,
});

/** Explicit inputs only; the repository's SQL is checked against this policy. */
export function rankingContributions(input: unknown, identities: unknown) {
  const archive = matchArchiveSchema.parse(input);
  const participants = matchParticipantsSchema.parse(identities);
  const rules = BASIC_RANKING_POLICY.rules;
  if (
    archive.mode !== 'matchmaking' ||
    archive.questionSource !== 'published' ||
    archive.result.reason === 'ABORTED' ||
    archive.result.reason === 'LAST_PLAYER' ||
    archive.finalTurn < 1 ||
    archive.usedQuestionIds.length < 1 ||
    Object.entries(rules).some(
      ([key, value]) => archive.rules[key as keyof typeof rules] !== value,
    ) ||
    participants.length !== 3 ||
    new Set(participants.map((row) => row.issuer)).size !== 1
  )
    return [];
  return participants.map((row) => {
    const winner = archive.result.winners.includes(row.playerId);
    const soleWins = Number(winner && archive.result.winners.length === 1);
    const sharedWins = Number(winner && archive.result.winners.length > 1);
    return {
      ...row,
      points:
        soleWins * BASIC_RANKING_POLICY.soleWinPoints +
        sharedWins * BASIC_RANKING_POLICY.sharedWinPoints,
      soleWins,
      sharedWins,
    };
  });
}
