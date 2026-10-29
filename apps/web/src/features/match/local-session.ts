import {
  MAP,
  activePlayer,
  applyAction,
  createMatch,
  legalTargets,
  placements,
  publicView,
} from '@mamalik/game-core';
import type { Action, Question, Rules } from '@mamalik/game-core';
import { publicStateSchema } from '@mamalik/shared';
import type { PublicState } from '@mamalik/shared';
import { projectMap } from '../map/project';
import type { MapEffect, MapModel } from '../map/model';
import { findFixture, QUESTION_FIXTURES } from './questions';
import type { QuestionFixture } from './questions';

export const HUMAN_ID = 'p_teal';
type PublicQuestion = NonNullable<PublicState['question']>;
export interface BattleReveal {
  turn: number;
  question: PublicQuestion;
  outcome: NonNullable<PublicState['outcome']>;
  explanation: string;
  source: QuestionFixture['source'];
  humanChoiceId: string | null;
  humanInvolved: boolean;
}
export interface LocalView {
  state: PublicState;
  map: MapModel;
  humanId: string;
  remainingMs: number;
  windowMs: number;
  maxTurns: number;
  canAnswer: boolean;
  humanChoiceId: string | null;
  humanInvolved: boolean;
  reveal: BattleReveal | null;
  effect: MapEffect | null;
  standings: ReturnType<typeof placements>;
  notice: string;
  category: string | null;
}
export type LocalIntent = {
  matchId: string;
  turn: number;
} & (
  | { type: 'SELECT_TARGET'; targetId: string }
  | { type: 'SUBMIT_ANSWER'; questionId: string; choiceId: string }
  | { type: 'CONTINUE' }
);

/** Per-instance offline authority adapter. No clocks, React or Phaser inside. */
export function createLocalSession(
  options: { seed?: number; rules?: Partial<Omit<Rules, 'version'>> } = {},
) {
  let generation = 1;
  const fresh = () =>
    createMatch({
      id: `m_local_${generation}`,
      seed: options.seed ?? 2026,
      players: [
        { id: HUMAN_ID, name: 'فيروز' },
        { id: 'p_blue', name: 'ياقوت' },
        { id: 'p_gold', name: 'كهرمان' },
      ],
      questionIds: QUESTION_FIXTURES.map((item) => item.question.id),
      ...(options.rules ? { rules: options.rules } : {}),
    });
  let state = fresh();
  let observedAt = 0;
  let reveal: BattleReveal | null = null;
  let effect: MapEffect | null = null;
  let notice = '';
  let revision = 0;
  let publicRevision = -1;
  let snapshot: PublicState;
  let cachedMap: MapModel;
  let mapKey = '';
  const listeners = new Set<() => void>();

  function buildView(now: number): LocalView {
    if (revision !== publicRevision) {
      snapshot = publicStateSchema.parse(publicView(state));
      publicRevision = revision;
    }
    const humanTurn =
      state.phase === 'ATTACK_SELECTION' && activePlayer(state) === HUMAN_ID;
    const legal = humanTurn ? legalTargets(state, HUMAN_ID) : [];
    const nextKey = JSON.stringify([
      snapshot.activePlayerId,
      snapshot.territories,
      legal,
    ]);
    if (nextKey !== mapKey) {
      cachedMap = projectMap(snapshot, legal);
      mapKey = nextKey;
    }
    const involved =
      !!state.duel &&
      [state.duel.attacker, state.duel.defender].includes(HUMAN_ID);
    const ownAnswer =
      state.duel && Object.hasOwn(state.duel.answers, HUMAN_ID)
        ? state.duel.answers[HUMAN_ID]!
        : null;
    const deadline = state.duel?.deadline ?? state.selectionDeadline;
    return {
      state: snapshot,
      map: cachedMap,
      humanId: HUMAN_ID,
      remainingMs: deadline === null ? 0 : Math.max(0, deadline - now),
      windowMs: state.duel ? state.rules.answerMs : state.rules.selectionMs,
      maxTurns: state.rules.maxTurns,
      canAnswer:
        state.phase === 'DUEL' &&
        involved &&
        !ownAnswer &&
        now < state.duel!.deadline,
      humanChoiceId: ownAnswer?.choiceId ?? null,
      humanInvolved: involved,
      reveal,
      effect,
      standings: placements(state),
      notice,
      category: state.duel
        ? findFixture(state.duel.question.id).category
        : null,
    };
  }
  let view = buildView(0);
  const publish = () => {
    view = buildView(observedAt);
    for (const listener of listeners) listener();
  };
  const validTime = (now: number) =>
    Number.isFinite(now) &&
    now >= observedAt &&
    now <= Number.MAX_SAFE_INTEGER - 60_000;

  function apply(action: Action, now: number, question?: Question): boolean {
    const before = state;
    const result = applyAction(
      state,
      action,
      question ? { now, question } : { now },
    );
    if (!result.ok) return false;
    if (result.duplicate) return true;
    state = result.state;
    revision++;
    if (action.type === 'RESOLVE' && before.duel && state.outcome) {
      const fixture = findFixture(before.duel.question.id);
      reveal = {
        turn: before.turn,
        question: publicStateSchema.parse(publicView(before)).question!,
        outcome: { ...state.outcome },
        explanation: fixture.explanation,
        source: fixture.source,
        humanChoiceId: Object.hasOwn(before.duel.answers, HUMAN_ID)
          ? before.duel.answers[HUMAN_ID]!.choiceId
          : null,
        humanInvolved: [before.duel.attacker, before.duel.defender].includes(
          HUMAN_ID,
        ),
      };
      effect = {
        key: `${state.id}:${state.turn}`,
        targetId: state.outcome.target,
        captured: state.outcome.captured,
        ownerId: state.owners[state.outcome.target] ?? null,
      };
    }
    if (action.type === 'ADVANCE') {
      reveal = null;
      effect = null;
    }
    return true;
  }

  type Scheduled = { at: number; run: () => boolean };
  function nextEvent(): Scheduled | null {
    if (state.phase === 'ATTACK_SELECTION') {
      const actor = activePlayer(state);
      const targets = legalTargets(state, actor);
      if (!targets.length)
        return {
          at: state.lastNow,
          run: () => apply({ type: 'ADVANCE' }, state.lastNow),
        };
      if (actor === HUMAN_ID)
        return {
          at: state.selectionDeadline!,
          run: () => {
            const at = state.selectionDeadline!;
            notice = 'انتهى وقت اختيار الأرض وانتقل الدور.';
            return apply({ type: 'ADVANCE' }, at);
          },
        };
      const at =
        state.selectionDeadline! -
        state.rules.selectionMs +
        Math.min(700, state.rules.selectionMs / 3);
      return {
        at,
        run: () => {
          const target = targets.sort(
            (a, b) =>
              Number(MAP.find((node) => node.id === b)?.castle) -
                Number(MAP.find((node) => node.id === a)?.castle) ||
              Number(state.owners[a] !== null) -
                Number(state.owners[b] !== null) ||
              a.localeCompare(b, 'en'),
          )[0]!;
          const fixture = findFixture(
            state.questionDeck[state.usedQuestionIds.length]!,
          );
          return apply(
            {
              type: 'SELECT_TARGET',
              actor,
              matchId: state.id,
              turn: state.turn,
              key: `target_${state.turn}`,
              target,
            },
            at,
            fixture.question,
          );
        },
      };
    }
    if (state.phase === 'DUEL' && state.duel) {
      const duel = state.duel;
      const participants = [
        duel.attacker,
        ...(duel.defender ? [duel.defender] : []),
      ];
      if (participants.every((id) => Object.hasOwn(duel.answers, id)))
        return {
          at: state.lastNow,
          run: () => apply({ type: 'RESOLVE' }, state.lastNow),
        };
      const involved = participants.includes(HUMAN_ID);
      const bots = participants
        .filter((id) => id !== HUMAN_ID && !Object.hasOwn(duel.answers, id))
        .map((id) => {
          const seat = state.players.findIndex((player) => player.id === id);
          const delay = Math.min(
            involved ? 4500 + seat * 600 : 900 + seat * 200,
            state.rules.answerMs * 0.7,
          );
          return { id, seat, at: duel.openedAt + delay };
        })
        .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id, 'en'));
      const bot = bots[0];
      if (bot && bot.at < duel.deadline)
        return {
          at: bot.at,
          run: () => {
            const correct = (state.turn + bot.seat) % 4 !== 0;
            const choiceId = correct
              ? duel.question.correctChoiceId
              : duel.question.choices.find(
                  (choice) => choice.id !== duel.question.correctChoiceId,
                )!.id;
            return apply(
              {
                type: 'SUBMIT_ANSWER',
                actor: bot.id,
                matchId: state.id,
                turn: state.turn,
                key: `answer_${state.turn}`,
                questionId: duel.question.id,
                choiceId,
              },
              bot.at,
            );
          },
        };
      return {
        at: duel.deadline,
        run: () => apply({ type: 'RESOLVE' }, duel.deadline),
      };
    }
    if (state.phase === 'RESOLUTION' && !reveal?.humanInvolved) {
      const at = state.lastNow + 900;
      return { at, run: () => apply({ type: 'ADVANCE' }, at) };
    }
    return null;
  }

  /** Drain due events in time order, even after tab suspension. Never backdate a human answer. */
  function synchronize(now: number): boolean {
    if (!validTime(now)) return false;
    observedAt = now;
    let count = 0;
    for (;;) {
      const next = nextEvent();
      if (!next || next.at > now) break;
      if (++count > 1024 || !next.run())
        throw new Error('Local scheduler invariant failed');
    }
    return true;
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
      if (synchronize(now)) publish();
    },
    start(now: number) {
      if (!validTime(now) || state.phase !== 'LOBBY') return false;
      observedAt = now;
      for (const player of state.players)
        apply(
          {
            type: 'READY',
            actor: player.id,
            matchId: state.id,
            turn: 0,
            key: 'ready',
          },
          now,
        );
      apply({ type: 'BEGIN' }, now);
      notice = '';
      publish();
      return true;
    },
    send(intent: LocalIntent, now: number): boolean {
      if (!synchronize(now)) return false;
      if (intent.matchId !== state.id || intent.turn !== state.turn) {
        notice = 'تغيّر الدور؛ راجع الحالة الحالية.';
        publish();
        return false;
      }
      let accepted = false;
      if (
        intent.type === 'SELECT_TARGET' &&
        intent.targetId &&
        state.phase === 'ATTACK_SELECTION' &&
        activePlayer(state) === HUMAN_ID
      ) {
        const fixture = findFixture(
          state.questionDeck[state.usedQuestionIds.length]!,
        );
        accepted = apply(
          {
            type: 'SELECT_TARGET',
            actor: HUMAN_ID,
            matchId: state.id,
            turn: state.turn,
            key: `target_${state.turn}`,
            target: intent.targetId,
          },
          now,
          fixture.question,
        );
      } else if (
        intent.type === 'SUBMIT_ANSWER' &&
        intent.questionId &&
        intent.choiceId
      ) {
        accepted = apply(
          {
            type: 'SUBMIT_ANSWER',
            actor: HUMAN_ID,
            matchId: state.id,
            turn: state.turn,
            key: `answer_${state.turn}`,
            questionId: intent.questionId,
            choiceId: intent.choiceId,
          },
          now,
        );
      } else if (intent.type === 'CONTINUE' && state.phase === 'RESOLUTION')
        accepted = apply({ type: 'ADVANCE' }, now);
      notice = accepted
        ? ''
        : 'تعذّر قبول الاختيار؛ قد يكون الوقت أو الدور قد انتهى.';
      synchronize(now);
      publish();
      return accepted;
    },
    restart(now: number) {
      if (!validTime(now)) return false;
      observedAt = now;
      generation++;
      state = fresh();
      revision++;
      reveal = null;
      effect = null;
      notice = '';
      publish();
      return true;
    },
  };
}
export type LocalSession = ReturnType<typeof createLocalSession>;
