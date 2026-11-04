import { matchArchiveSchema } from '@mamalik/database';
import type { MatchArchive } from '@mamalik/database';
const seats = ['p_teal', 'p_blue', 'p_gold'] as const;
type Seat = (typeof seats)[number];
/** Stored-result fixtures only; this does not simulate a live published match. */
export function rankingArchive(
  matchId: string,
  questionId: string,
  winners: Seat[] = ['p_teal'],
) {
  const owners = new Map<number, Seat>([
    [0, 'p_teal'],
    [5, 'p_blue'],
    [10, 'p_gold'],
  ]);
  if (winners.length < 3)
    winners.forEach((seat, index) => owners.set(index * 5 + 1, seat));
  const territories = Array.from({ length: 15 }, (_, index) => ({
    id: `t_${String(index).padStart(2, '0')}`,
    ownerId: owners.get(index) ?? null,
  }));
  const ordered = [
    ...winners,
    ...seats.filter((seat) => !winners.includes(seat)),
  ];
  const placements = ordered.map((playerId) => {
    const count = territories.filter((row) => row.ownerId === playerId).length;
    return {
      playerId,
      score: count + 2,
      castles: 1,
      territories: count,
      eliminated: false,
      rank: winners.includes(playerId) ? 1 : winners.length + 1,
    };
  });
  return matchArchiveSchema.parse({
    archiveVersion: 1,
    matchId,
    mode: 'matchmaking',
    questionSource: 'published',
    bankHash: 'a'.repeat(64),
    seed: 2026,
    rules: { version: 1, maxTurns: 36, selectionMs: 10000, answerMs: 15000 },
    finalTurn: 36,
    turnOrder: seats,
    territories,
    usedQuestionIds: [`${questionId}_v1`],
    result: { reason: 'TURN_LIMIT', winners, placements },
  });
}
export function castleArchive(archive: MatchArchive): MatchArchive {
  return matchArchiveSchema.parse({
    ...archive,
    finalTurn: 9,
    territories: archive.territories.map((row) => ({
      ...row,
      ownerId: 'p_teal',
    })),
    result: {
      reason: 'CASTLES',
      winners: ['p_teal'],
      placements: seats.map((playerId, index) => ({
        playerId,
        score: index ? 0 : 21,
        castles: index ? 0 : 3,
        territories: index ? 0 : 15,
        eliminated: index > 0,
        rank: index ? 2 : 1,
      })),
    },
  });
}
export const rankingQuestion = {
  locale: 'ar',
  category: 'اختبار الترتيب',
  text: 'كم عدد أيام الأسبوع؟',
  choices: [
    { id: 'a', text: 'سبعة' },
    { id: 'b', text: 'خمسة' },
    { id: 'c', text: 'ستة' },
    { id: 'd', text: 'ثمانية' },
  ],
  correctChoiceId: 'a',
  explanation: 'سؤال ثابت للاختبار فقط.',
  sources: [{ label: 'مرجع الاختبار', url: 'https://example.org/fixture' }],
};
