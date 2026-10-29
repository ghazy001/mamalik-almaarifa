import { simulate } from './simulation.js';
const { state, actions } = simulate();
console.log(
  JSON.stringify(
    {
      matchId: state.id,
      seed: 2026,
      turns: state.turn,
      actions: actions.length,
      usedQuestions: state.usedQuestionIds.length,
      result: state.result,
    },
    null,
    2,
  ),
);
