import {
  activePlayer,
  applyAction,
  createMatch,
  legalTargets,
} from '../src/index.js';
import type { Action, MatchState, Question } from '../src/index.js';
import { fixtureQuestion } from '../src/simulation.js';
export const initial = (maxTurns = 36) =>
  createMatch({
    id: 'm_test',
    seed: 42,
    players: [
      { id: 'p1', name: 'أول' },
      { id: 'p2', name: 'ثان' },
      { id: 'p3', name: 'ثالث' },
    ],
    questionIds: Array.from({ length: 120 }, (_, i) => `q_${i}`),
    rules: { maxTurns },
  });
export function accept(
  state: MatchState,
  action: Action,
  now = state.lastNow + 1,
  question?: Question,
): MatchState {
  const result = applyAction(
    state,
    action,
    question ? { now, question } : { now },
  );
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return result.state;
}
export function started(maxTurns = 36): MatchState {
  let state = initial(maxTurns);
  for (const p of state.players)
    state = accept(state, {
      type: 'READY',
      actor: p.id,
      matchId: state.id,
      turn: 0,
      key: 'ready',
    });
  return accept(state, { type: 'BEGIN' });
}
export function battle(state = started(), occupied = false): MatchState {
  const actor = activePlayer(state);
  const target = legalTargets(state, actor)[0]!;
  if (occupied)
    state = {
      ...state,
      owners: {
        ...state.owners,
        [target]: state.players.find((p) => p.id !== actor)!.id,
      },
    };
  return accept(
    state,
    {
      type: 'SELECT_TARGET',
      actor,
      matchId: state.id,
      turn: state.turn,
      key: `select_${state.turn}`,
      target,
    },
    state.lastNow + 1,
    fixtureQuestion(state.questionDeck[state.usedQuestionIds.length]!),
  );
}
export function answer(
  state: MatchState,
  actor = state.duel!.attacker,
  choiceId = 'a',
  now = state.lastNow + 1,
  key = `answer_${state.turn}`,
): MatchState {
  return accept(
    state,
    {
      type: 'SUBMIT_ANSWER',
      actor,
      matchId: state.id,
      turn: state.turn,
      key,
      questionId: state.duel!.question.id,
      choiceId,
    },
    now,
  );
}
