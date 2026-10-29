import {
  activePlayer,
  applyAction,
  createMatch,
  legalTargets,
  publicView,
} from './engine.js';
import { MAP } from './map.js';
import type { Action, MatchState, Question } from './types.js';

export function fixtureQuestion(id: string): Question {
  return {
    id,
    text: 'سؤال تقني تجريبي: ما ناتج اثنين زائد اثنين؟',
    choices: [
      { id: 'a', text: 'أربعة' },
      { id: 'b', text: 'خمسة' },
      { id: 'c', text: 'ستة' },
      { id: 'd', text: 'سبعة' },
    ],
    correctChoiceId: 'a',
  };
}

/** Synthetic fixtures only. This is a headless match, not matchmaking or AI. */
export function simulate(seed = 2026) {
  let state = createMatch({
    id: 'm_demo',
    players: [
      { id: 'p_teal', name: 'فيروز' },
      { id: 'p_blue', name: 'ياقوت' },
      { id: 'p_gold', name: 'كهرمان' },
    ],
    seed,
    rules: { maxTurns: 36 },
    questionIds: Array.from({ length: 36 }, (_, i) => `q_${i}`),
  });
  let now = 0;
  const transcript: ReturnType<typeof publicView>[] = [];
  const actions: { action: Action; now: number; question?: Question }[] = [];
  const step = (action: Action, question?: Question) => {
    now += 100;
    const context = question ? { now, question } : { now };
    const result = applyAction(state, action, context);
    if (!result.ok)
      throw new Error(`Simulation failed: ${action.type}/${result.error}`);
    state = result.state;
    actions.push({ action, ...context });
    transcript.push(publicView(state));
  };
  for (const player of state.players)
    step({
      type: 'READY',
      matchId: state.id,
      turn: 0,
      actor: player.id,
      key: `ready_${player.id}`,
    });
  step({ type: 'BEGIN' });
  let guard = 0;
  while (state.phase !== 'FINISHED' && guard++ < 1000) {
    if (state.phase === 'ATTACK_SELECTION') {
      const actor = activePlayer(state);
      const targets = legalTargets(state, actor).sort(
        (a, b) =>
          Number(MAP.find((t) => t.id === b)?.castle) -
            Number(MAP.find((t) => t.id === a)?.castle) ||
          a.localeCompare(b, 'en'),
      );
      if (!targets[0]) {
        step({ type: 'ADVANCE' });
        continue;
      }
      const question = fixtureQuestion(
        state.questionDeck[state.usedQuestionIds.length]!,
      );
      step(
        {
          type: 'SELECT_TARGET',
          matchId: state.id,
          turn: state.turn,
          actor,
          key: `select_${state.turn}`,
          target: targets[0],
        },
        question,
      );
    } else if (state.phase === 'DUEL') {
      const duel = state.duel!;
      step({
        type: 'SUBMIT_ANSWER',
        matchId: state.id,
        turn: state.turn,
        actor: duel.attacker,
        key: `answer_${state.turn}`,
        questionId: duel.question.id,
        choiceId: 'a',
      });
      if (duel.defender)
        step({
          type: 'SUBMIT_ANSWER',
          matchId: state.id,
          turn: state.turn,
          actor: duel.defender,
          key: `answer_${state.turn}`,
          questionId: duel.question.id,
          choiceId: state.turn % 2 === 0 ? 'b' : 'a',
        });
      step({ type: 'RESOLVE' });
    } else if (state.phase === 'RESOLUTION') step({ type: 'ADVANCE' });
    else throw new Error(`Unexpected phase ${state.phase}`);
  }
  if (!state.result) throw new Error('Simulation did not finish');
  return { state, transcript, actions };
}

export function replay(
  initial: MatchState,
  actions: ReturnType<typeof simulate>['actions'],
): MatchState {
  let state = initial;
  for (const { action, ...context } of actions) {
    const result = applyAction(state, action, context);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}
