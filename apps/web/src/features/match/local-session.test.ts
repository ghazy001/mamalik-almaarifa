import { describe, expect, it } from 'vitest';
import { createLocalSession, HUMAN_ID } from './local-session';
import type { LocalSession } from './local-session';
import { findFixture, QUESTION_FIXTURES } from './questions';

function select(
  session: LocalSession,
  at = 100,
  targetId = session.getSnapshot().map.legalTargetIds[0]!,
) {
  const { state } = session.getSnapshot();
  return session.send(
    {
      type: 'SELECT_TARGET',
      matchId: state.matchId,
      turn: state.turn,
      targetId,
    },
    at,
  );
}
function answer(session: LocalSession, at = 200, correct = true) {
  const { state } = session.getSnapshot();
  const question = state.question!;
  const right = findFixture(question.id).question.correctChoiceId;
  return session.send(
    {
      type: 'SUBMIT_ANSWER',
      matchId: state.matchId,
      turn: state.turn,
      questionId: question.id,
      choiceId: correct
        ? right
        : question.choices.find((choice) => choice.id !== right)!.id,
    },
    at,
  );
}
function next(session: LocalSession, at: number) {
  const { state } = session.getSnapshot();
  return session.send(
    { type: 'CONTINUE', matchId: state.matchId, turn: state.turn },
    at,
  );
}

describe('development fixture bank', () => {
  it('has 36 unique, nonrepeated original four-choice questions with explanations and varied answer positions', () => {
    expect(QUESTION_FIXTURES).toHaveLength(36);
    expect(
      new Set(QUESTION_FIXTURES.map((fixture) => fixture.question.id)).size,
    ).toBe(36);
    expect(
      new Set(QUESTION_FIXTURES.map((fixture) => fixture.question.text)).size,
    ).toBe(36);
    expect(
      new Set(
        QUESTION_FIXTURES.map((fixture) => fixture.question.correctChoiceId),
      ).size,
    ).toBe(4);
    for (const fixture of QUESTION_FIXTURES) {
      expect(fixture.question.choices).toHaveLength(4);
      expect(
        new Set(fixture.question.choices.map((choice) => choice.text)).size,
      ).toBe(4);
      expect(
        fixture.question.choices.filter(
          (choice) => choice.id === fixture.question.correctChoiceId,
        ),
      ).toHaveLength(1);
      expect(fixture.explanation.length).toBeGreaterThan(0);
      if (!fixture.calculation)
        expect(fixture.source?.url).toMatch(
          /^https:\/\/(science\.nasa\.gov|www\.bipm\.org|developer\.mozilla\.org)\//,
        );
    }
  });
  it('independently checks every arithmetic answer', () => {
    const number = new Intl.NumberFormat('ar', { numberingSystem: 'arab' });
    for (const fixture of QUESTION_FIXTURES)
      if (fixture.calculation) {
        const { operator, left, right } = fixture.calculation;
        const expected = {
          add: left + right,
          subtract: left - right,
          multiply: left * right,
        }[operator];
        expect(
          fixture.question.choices.find(
            (choice) => choice.id === fixture.question.correctChoiceId,
          )?.text,
        ).toBe(number.format(expected));
      }
  });
});

describe('local match controller', () => {
  it('lets the human answer as defender when a scripted opponent attacks their land', () => {
    const session = createLocalSession();
    session.start(0);
    let time = 0;
    let guard = 0;
    while (session.getSnapshot().state.phase !== 'FINISHED' && guard++ < 300) {
      const view = session.getSnapshot();
      if (view.state.question?.defenderId === HUMAN_ID) {
        expect(view.canAnswer).toBe(true);
        expect(answer(session, time + 1)).toBe(true);
        session.tick(time + 6500);
        expect(session.getSnapshot().reveal?.humanInvolved).toBe(true);
        expect(session.getSnapshot().reveal?.humanChoiceId).not.toBeNull();
        return;
      }
      if (view.state.phase === 'RESOLUTION') next(session, time);
      else {
        time += view.map.legalTargetIds.length ? 10000 : 500;
        session.tick(time);
      }
    }
    throw new Error('Expected a scripted attack on the human kingdom');
  });
  it('starts only on explicit intent and preserves the M1 defaults', () => {
    const session = createLocalSession();
    expect(session.getSnapshot().state.phase).toBe('LOBBY');
    session.tick(5000);
    expect(session.getSnapshot().state.turn).toBe(0);
    expect(session.start(5000)).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      maxTurns: 36,
      remainingMs: 10000,
      humanId: HUMAN_ID,
    });
    expect(
      session.getSnapshot().state.players.every((player) => player.ready),
    ).toBe(true);
    expect(session.start(5001)).toBe(false);
  });
  it('rejects illegal targets without changing the match; never grants a conquest at selection', () => {
    const session = createLocalSession();
    session.start(0);
    const before = session.getSnapshot().state;
    expect(select(session, 100, 't_00')).toBe(false);
    expect(session.getSnapshot().state).toEqual(before);
    expect(select(session)).toBe(true);
    expect(session.getSnapshot().state.phase).toBe('DUEL');
    expect(session.getSnapshot().state.territories).toEqual(before.territories);
    expect(session.getSnapshot().remainingMs).toBe(15000);
  });
  it('reveals correctness and explanation only after core resolution and updates ownership/score', () => {
    const session = createLocalSession();
    session.start(0);
    select(session);
    const target = session.getSnapshot().state.question!.targetId;
    const during = JSON.stringify(session.getSnapshot());
    for (const secret of [
      'correctChoiceId',
      'explanation',
      'questionDeck',
      'answers',
      'accepted',
      'receivedAt',
    ])
      expect(during).not.toContain(secret);
    expect(answer(session)).toBe(true);
    const after = session.getSnapshot();
    expect(after.state.phase).toBe('RESOLUTION');
    expect(after.reveal?.outcome.captured).toBe(true);
    expect(
      after.state.territories.find((node) => node.id === target)?.ownerId,
    ).toBe(HUMAN_ID);
    expect(
      after.standings.find((row) => row.playerId === HUMAN_ID)?.score,
    ).toBe(4);
    expect(after.map.legalTargetIds).toEqual([]);
  });
  it('incorrect and missing answers leave neutral ground neutral', () => {
    for (const submit of [true, false]) {
      const session = createLocalSession();
      session.start(0);
      select(session);
      const target = session.getSnapshot().state.question!.targetId;
      if (submit) answer(session, 200, false);
      else session.tick(15100);
      expect(session.getSnapshot().reveal?.outcome.captured).toBe(false);
      expect(
        session
          .getSnapshot()
          .state.territories.find((node) => node.id === target)?.ownerId,
      ).toBeNull();
      expect(session.getSnapshot().state.phase).toBe('RESOLUTION');
    }
  });
  it('rejects exact-deadline answers, stale question/match/turn and non-participant injection', () => {
    const session = createLocalSession();
    session.start(0);
    select(session);
    const { state } = session.getSnapshot();
    const command = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: state.matchId,
      turn: state.turn,
      questionId: state.question!.id,
      choiceId: 'a',
    };
    for (const invalid of [
      { ...command, questionId: 'old' },
      { ...command, matchId: 'old' },
      { ...command, turn: 99 },
    ])
      expect(session.send(invalid, 200)).toBe(false);
    expect(session.getSnapshot().state.phase).toBe('DUEL');
    expect(session.send(command, state.question!.deadline)).toBe(false);
    expect(session.getSnapshot().reveal?.humanChoiceId).toBeNull();
    next(session, 15200);
    session.tick(16000);
    expect(session.getSnapshot().state.phase).toBe('DUEL');
    expect(session.getSnapshot().humanInvolved).toBe(false);
    expect(answer(session, 16100)).toBe(false);
  });
  it('waits for explicit continuation after a human battle and starts the next timer at receipt time', () => {
    const session = createLocalSession();
    session.start(0);
    select(session);
    answer(session);
    session.tick(100000);
    expect(session.getSnapshot().state.phase).toBe('RESOLUTION');
    expect(session.getSnapshot().state.turn).toBe(1);
    expect(next(session, 100000)).toBe(true);
    expect(session.getSnapshot().state.turn).toBe(2);
    expect(session.getSnapshot().remainingMs).toBe(10000);
  });
  it('does not count duplicate answers or allow replacement with a second choice', () => {
    const session = createLocalSession();
    session.start(0);
    select(session);
    const question = session.getSnapshot().state.question!;
    answer(session);
    const before = session.getSnapshot().state;
    const correct = findFixture(question.id).question.correctChoiceId;
    const scope = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: before.matchId,
      turn: before.turn,
      questionId: question.id,
    };
    expect(session.send({ ...scope, choiceId: correct }, 201)).toBe(true);
    expect(
      session.send(
        {
          ...scope,
          choiceId: question.choices.find((choice) => choice.id !== correct)!
            .id,
        },
        202,
      ),
    ).toBe(false);
    expect(session.getSnapshot().state).toEqual(before);
  });
  it('drains backgrounded bot actions in the same timestamp order as fine-grained ticks', () => {
    const fine = createLocalSession();
    const coarse = createLocalSession();
    for (const session of [fine, coarse]) {
      session.start(0);
      select(session);
      answer(session);
      next(session, 300);
    }
    for (let time = 400; time <= 12000; time += 100) fine.tick(time);
    coarse.tick(12000);
    expect(fine.getSnapshot()).toEqual(coarse.getSnapshot());
  });
  it('discards nonmonotonic/invalid time and resets with no stale scheduled actions', () => {
    const session = createLocalSession();
    session.start(1000);
    const before = session.getSnapshot();
    for (const time of [999, NaN, Infinity, -1]) session.tick(time);
    expect(session.getSnapshot()).toBe(before);
    expect(select(session, 1100)).toBe(true);
    const old = session.getSnapshot().state;
    expect(session.restart(1200)).toBe(true);
    session.tick(30000);
    expect(session.getSnapshot().state.phase).toBe('LOBBY');
    expect(session.getSnapshot().reveal).toBeNull();
    expect(session.getSnapshot().state.matchId).not.toBe(old.matchId);
    expect(
      session.send(
        {
          type: 'SELECT_TARGET',
          matchId: old.matchId,
          turn: old.turn,
          targetId: 't_01',
        },
        30000,
      ),
    ).toBe(false);
  });
  it.each([2026, 1, 7, 42, 999])(
    'completes a real headless local match for seed %i with scripted opponents',
    (seed) => {
      const session = createLocalSession({ seed });
      session.start(0);
      let time = 100;
      let guard = 0;
      while (
        session.getSnapshot().state.phase !== 'FINISHED' &&
        guard++ < 400
      ) {
        const view = session.getSnapshot();
        if (view.map.legalTargetIds.length) {
          const target = [...view.map.legalTargetIds].sort(
            (a, b) =>
              Number(
                view.map.territories.find((node) => node.id === b)?.castle,
              ) -
                Number(
                  view.map.territories.find((node) => node.id === a)?.castle,
                ) || a.localeCompare(b, 'en'),
          )[0]!;
          expect(select(session, time, target)).toBe(true);
        } else if (view.canAnswer) expect(answer(session, time)).toBe(true);
        else if (view.state.phase === 'RESOLUTION') next(session, time);
        else {
          time += 6500;
          session.tick(time);
        }
        time += 10;
      }
      const view = session.getSnapshot();
      expect(view.state.phase).toBe('FINISHED');
      expect(view.state.result?.winners.length).toBeGreaterThan(0);
      expect(view.state.turn).toBeLessThanOrEqual(36);
      expect(view.state.territories).toHaveLength(15);
      expect(
        view.standings.reduce((sum, row) => sum + row.territories, 0),
      ).toBeLessThanOrEqual(15);
    },
  );
});
