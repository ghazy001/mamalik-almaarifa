import {
  activePlayer,
  applyAction,
  createMatch,
  DEFAULT_RULES,
  legalTargets,
  publicView,
} from '@mamalik/game-core';
import type { Action, MatchState } from '@mamalik/game-core';
import { publicStateSchema } from '@mamalik/shared';
import type { PublicState } from '@mamalik/shared';
import { projectMap } from '../map/project';
import type { MapEffect, MapModel } from '../map/model';
import type { BattleReveal } from '../match/local-session';
import { findFixture } from '../match/questions';

export const PRACTICE_PLAYER = 'p_teal';
export const PRACTICE_QUESTION = 'q_space_1';

/** One offline rules exercise. Selection time is frozen; quiz time is explicit. */
export function createPracticeSession() {
  let generation = 1;
  function fresh() {
    let next = createMatch({
      id: `m_practice_${generation}`,
      seed: 2026,
      players: [
        { id: PRACTICE_PLAYER, name: 'فيروز' },
        { id: 'p_blue', name: 'ياقوت' },
        { id: 'p_gold', name: 'كهرمان' },
      ],
      questionIds: [PRACTICE_QUESTION],
      rules: { maxTurns: 1 },
    });
    for (const action of [
      ...next.players.map((player) => ({
        type: 'READY' as const,
        actor: player.id,
        matchId: next.id,
        turn: 0,
        key: 'practice_ready',
      })),
      { type: 'BEGIN' as const },
    ]) {
      const result = applyAction(next, action, { now: 0 });
      if (!result.ok) throw new Error('Practice setup failed');
      next = result.state;
    }
    if (activePlayer(next) !== PRACTICE_PLAYER)
      throw new Error('Practice order changed');
    return next;
  }
  let state = fresh();
  let observedAt = 0;
  let openedAt: number | null = null;
  let reveal: BattleReveal | null = null;
  let effect: MapEffect | null = null;
  const listeners = new Set<() => void>();
  const validTime = (now: number) =>
    Number.isFinite(now) &&
    now >= observedAt &&
    now <= Number.MAX_SAFE_INTEGER - 60000;
  const domainTime = (now: number) => (openedAt === null ? 0 : now - openedAt);
  let projected: {
    input: MatchState;
    snapshot: PublicState;
    map: MapModel;
  } | null = null;
  function buildView() {
    if (projected?.input !== state) {
      const snapshot = publicStateSchema.parse(publicView(state));
      projected = {
        input: state,
        snapshot,
        map: projectMap(
          snapshot,
          state.phase === 'ATTACK_SELECTION'
            ? legalTargets(state, PRACTICE_PLAYER)
            : [],
        ),
      };
    }
    return {
      state: projected.snapshot,
      map: projected.map,
      humanId: PRACTICE_PLAYER,
      humanInvolved: true,
      canAnswer: state.phase === 'DUEL',
      humanChoiceId:
        state.duel?.answers[PRACTICE_PLAYER]?.choiceId ??
        reveal?.humanChoiceId ??
        null,
      remainingMs: state.duel
        ? Math.max(0, state.duel.deadline - domainTime(observedAt))
        : 0,
      windowMs: DEFAULT_RULES.answerMs,
      reveal,
      effect,
    };
  }
  let view = buildView();
  function publish() {
    view = buildView();
    for (const listener of listeners) listener();
  }
  function apply(action: Action, now: number) {
    const before = state;
    const result = applyAction(state, action, {
      now,
      ...(action.type === 'SELECT_TARGET'
        ? { question: findFixture(PRACTICE_QUESTION).question }
        : {}),
    });
    if (!result.ok) return false;
    state = result.state;
    if (action.type === 'RESOLVE' && before.duel && state.outcome) {
      const fixture = findFixture(PRACTICE_QUESTION);
      reveal = {
        turn: before.turn,
        question: publicStateSchema.parse(publicView(before)).question!,
        outcome: { ...state.outcome },
        explanation: fixture.explanation,
        source: fixture.source,
        humanChoiceId: before.duel.answers[PRACTICE_PLAYER]?.choiceId ?? null,
        humanInvolved: true,
      };
      effect = {
        key: `${state.id}:${state.turn}`,
        targetId: state.outcome.target,
        captured: state.outcome.captured,
        ownerId: state.owners[state.outcome.target] ?? null,
      };
    }
    return true;
  }
  function expire(now: number) {
    if (state.duel && domainTime(now) >= state.duel.deadline)
      apply({ type: 'RESOLVE' }, domainTime(now));
  }
  return {
    getSnapshot: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tick(now: number) {
      if (!validTime(now)) return;
      observedAt = now;
      if (state.phase !== 'DUEL') return;
      expire(now);
      publish();
    },
    select(input: { matchId: string; targetId: string }, now: number) {
      if (
        !validTime(now) ||
        input.matchId !== state.id ||
        state.phase !== 'ATTACK_SELECTION'
      )
        return false;
      if (
        !apply(
          {
            type: 'SELECT_TARGET',
            actor: PRACTICE_PLAYER,
            matchId: state.id,
            turn: state.turn,
            key: 'practice_target',
            target: input.targetId,
          },
          0,
        )
      )
        return false;
      openedAt = now;
      observedAt = now;
      publish();
      return true;
    },
    answer(
      input: { matchId: string; questionId: string; choiceId: string },
      now: number,
    ) {
      if (
        !validTime(now) ||
        input.matchId !== state.id ||
        state.phase !== 'DUEL'
      )
        return false;
      observedAt = now;
      expire(now);
      const accepted = apply(
        {
          type: 'SUBMIT_ANSWER',
          actor: PRACTICE_PLAYER,
          matchId: state.id,
          turn: state.turn,
          key: 'practice_answer',
          questionId: input.questionId,
          choiceId: input.choiceId,
        },
        domainTime(now),
      );
      if (accepted) apply({ type: 'RESOLVE' }, domainTime(now));
      publish();
      return accepted;
    },
    finish(now: number) {
      if (!validTime(now) || state.phase !== 'RESOLUTION') return false;
      if (!apply({ type: 'ADVANCE' }, domainTime(now))) return false;
      observedAt = now;
      publish();
      return true;
    },
    restart(now: number) {
      if (!validTime(now)) return false;
      generation++;
      state = fresh();
      observedAt = now;
      openedAt = null;
      reveal = null;
      effect = null;
      publish();
      return true;
    },
  };
}
export type PracticeSession = ReturnType<typeof createPracticeSession>;
