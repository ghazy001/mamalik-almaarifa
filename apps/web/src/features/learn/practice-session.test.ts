import { describe, expect, it } from 'vitest';
import {
  createPracticeSession,
  PRACTICE_PLAYER,
  PRACTICE_QUESTION,
} from './practice-session';
import { findFixture } from '../match/questions';

function select(session = createPracticeSession(), now = 1000) {
  const view = session.getSnapshot();
  const targetId = view.map.legalTargetIds[0]!;
  expect(session.select({ matchId: view.state.matchId, targetId }, now)).toBe(
    true,
  );
  return { session, targetId, matchId: view.state.matchId };
}
describe('one-capture offline onboarding', () => {
  it('uses the canonical map and permits reading/selection without a live deadline', () => {
    const session = createPracticeSession();
    const before = session.getSnapshot();
    expect(before.map.territories).toHaveLength(15);
    expect(before.map.territories.filter((row) => row.castle)).toHaveLength(3);
    expect(before.map.legalTargetIds).toHaveLength(2);
    session.tick(900000);
    expect(session.getSnapshot()).toBe(before);
    expect(select(session, 900001).session.getSnapshot().remainingMs).toBe(
      15000,
    );
  });
  it('rejects illegal targets, wrong match and premature completion without mutation', () => {
    const session = createPracticeSession(),
      before = session.getSnapshot();
    expect(
      session.select({ matchId: before.state.matchId, targetId: 't_00' }, 0),
    ).toBe(false);
    expect(
      session.select(
        { matchId: 'wrong', targetId: before.map.legalTargetIds[0]! },
        0,
      ),
    ).toBe(false);
    expect(session.finish(0)).toBe(false);
    expect(session.getSnapshot()).toBe(before);
  });
  it('lets core capture a territory, reveals only at resolution, and finishes a practice only', () => {
    const { session, targetId, matchId } = select();
    expect(JSON.stringify(session.getSnapshot())).not.toContain(
      'correctChoiceId',
    );
    const map = session.getSnapshot().map;
    session.tick(1500);
    expect(session.getSnapshot().remainingMs).toBe(14500);
    expect(session.getSnapshot().map).toBe(map);
    expect(
      session.answer(
        {
          matchId,
          questionId: PRACTICE_QUESTION,
          choiceId: findFixture(PRACTICE_QUESTION).question.correctChoiceId,
        },
        2000,
      ),
    ).toBe(true);
    const resolved = session.getSnapshot();
    expect(resolved.state.phase).toBe('RESOLUTION');
    expect(
      resolved.map.territories.find((row) => row.id === targetId)?.ownerId,
    ).toBe(PRACTICE_PLAYER);
    expect(resolved.reveal?.outcome.captured).toBe(true);
    expect(session.finish(2000)).toBe(true);
    expect(session.getSnapshot().state.phase).toBe('FINISHED');
  });
  it.each([14999, 15000, 15001])(
    'enforces the exact answer boundary at %i ms',
    (elapsed) => {
      const { session, matchId, targetId } = select(undefined, 1000);
      const accepted = session.answer(
        {
          matchId,
          questionId: PRACTICE_QUESTION,
          choiceId: findFixture(PRACTICE_QUESTION).question.correctChoiceId,
        },
        1000 + elapsed,
      );
      expect(accepted).toBe(elapsed < 15000);
      expect(
        session.getSnapshot().map.territories.find((row) => row.id === targetId)
          ?.ownerId,
      ).toBe(elapsed < 15000 ? PRACTICE_PLAYER : null);
      expect(session.getSnapshot().state.phase).toBe('RESOLUTION');
    },
  );
  it('keeps a wrong answer/timeout visible, rejects replacements and resets for a fresh attempt', () => {
    const { session, matchId, targetId } = select();
    const wrong = findFixture(PRACTICE_QUESTION).question.choices.find(
      (choice) =>
        choice.id !== findFixture(PRACTICE_QUESTION).question.correctChoiceId,
    )!.id;
    expect(
      session.answer(
        { matchId, questionId: PRACTICE_QUESTION, choiceId: wrong },
        1100,
      ),
    ).toBe(true);
    const before = session.getSnapshot();
    expect(before.reveal?.outcome.captured).toBe(false);
    expect(
      session.answer(
        { matchId, questionId: PRACTICE_QUESTION, choiceId: wrong },
        1200,
      ),
    ).toBe(false);
    expect(session.getSnapshot()).toBe(before);
    session.restart(2000);
    expect(session.getSnapshot().state.matchId).not.toBe(matchId);
    expect(session.select({ matchId, targetId }, 2000)).toBe(false);
    select(session, 3000);
    session.tick(18000);
    expect(session.getSnapshot().reveal?.humanChoiceId).toBeNull();
    expect(session.getSnapshot().reveal?.outcome.captured).toBe(false);
  });
  it('rejects backwards/nonfinite clock input and malformed answer IDs', () => {
    const { session, matchId } = select();
    const before = session.getSnapshot();
    session.tick(NaN);
    session.tick(999);
    expect(session.getSnapshot()).toBe(before);
    expect(
      session.answer(
        { matchId, questionId: PRACTICE_QUESTION, choiceId: 'not_a_choice' },
        1000,
      ),
    ).toBe(false);
    expect(session.getSnapshot().state.phase).toBe('DUEL');
    expect(
      session.answer({ matchId, questionId: 'wrong', choiceId: 'a' }, 1000),
    ).toBe(false);
    expect(session.restart(Infinity)).toBe(false);
  });
});
