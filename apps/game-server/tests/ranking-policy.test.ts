import { expect, it } from 'vitest';
import { rankingContributions } from '@mamalik/database';
import { rankingArchive, castleArchive } from './support/ranking-fixture.js';
const question = '00000000-0000-4000-8000-000000000001';
const roster = ['p_teal', 'p_blue', 'p_gold'].map((playerId, index) => ({
  playerId,
  issuer: 'https://fixture.example/auth/v1',
  subject: `00000000-0000-4000-8000-00000000000${index + 1}`,
}));
it('awards sole/shared victories and no points to other placements', () => {
  for (const [winners, points] of [
    [['p_teal'], [3, 0, 0]],
    [
      ['p_teal', 'p_blue'],
      [1, 1, 0],
    ],
    [
      ['p_teal', 'p_blue', 'p_gold'],
      [1, 1, 1],
    ],
  ] as const)
    expect(
      rankingContributions(
        rankingArchive('m_policy', question, [...winners]),
        roster,
      ).map((row) => row.points),
    ).toEqual(points);
  expect(
    rankingContributions(
      castleArchive(rankingArchive('m_castle', question)),
      roster,
    )[0]?.points,
  ).toBe(3);
});
it('excludes practice, nonstandard rules, aborts, last-player and unplayed results', () => {
  const base = rankingArchive('m_policy', question);
  for (const archive of [
    { ...base, mode: 'private' },
    { ...base, questionSource: 'development' },
    { ...base, usedQuestionIds: [] },
    { ...base, finalTurn: 0 },
    { ...base, rules: { ...base.rules, maxTurns: 1 }, finalTurn: 1 },
    { ...base, rules: { ...base.rules, selectionMs: 5000 } },
    { ...base, rules: { ...base.rules, answerMs: 1000 } },
    { ...base, result: { ...base.result, reason: 'ABORTED', winners: [] } },
    { ...base, result: { ...base.result, reason: 'LAST_PLAYER' } },
  ])
    expect(rankingContributions(archive, roster)).toEqual([]);
  expect(rankingContributions(base, roster.slice(0, 2))).toEqual([]);
  expect(
    rankingContributions(
      base,
      roster.map((row, index) =>
        index ? row : { ...row, issuer: 'https://other.example/auth/v1' },
      ),
    ),
  ).toEqual([]);
});
it('rejects malformed results and duplicate account/seat identities before evaluation', () => {
  const base = rankingArchive('m_policy', question);
  expect(() =>
    rankingContributions(
      { ...base, result: { ...base.result, winners: ['p_unknown'] } },
      roster,
    ),
  ).toThrow();
  expect(() =>
    rankingContributions(base, [roster[0], roster[0], roster[2]]),
  ).toThrow();
});
