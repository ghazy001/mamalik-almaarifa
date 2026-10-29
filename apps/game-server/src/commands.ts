import { applyAction, publicView } from '@mamalik/game-core';
import type { Context, MatchState, PlayerAction } from '@mamalik/game-core';
import { parseCommand, publicStateSchema } from '@mamalik/shared';
import type { ErrorCode, PublicState } from '@mamalik/shared';

/** Tested boundary for future room integration; not a network endpoint. */
export function processIntent(
  state: MatchState,
  input: unknown,
  authenticatedPlayerId: string,
  context: Context,
) {
  const parsed = parseCommand(input);
  if (!parsed.ok) return { ok: false as const, state, error: parsed.error };
  const command = parsed.command;
  if (command.type === 'REQUEST_RECONNECT')
    return {
      ok: false as const,
      state,
      error: 'NOT_IMPLEMENTED' satisfies ErrorCode,
    };
  const scope = {
    actor: authenticatedPlayerId,
    matchId: command.matchId,
    turn: command.turn,
    key: command.idempotencyKey,
  };
  const action: PlayerAction =
    command.type === 'READY'
      ? { ...scope, type: 'READY' }
      : command.type === 'SELECT_TARGET'
        ? { ...scope, type: 'SELECT_TARGET', target: command.targetId }
        : {
            ...scope,
            type: 'SUBMIT_ANSWER',
            questionId: command.questionId,
            choiceId: command.choiceId,
          };
  return applyAction(state, action, context);
}
export function snapshot(state: MatchState): PublicState {
  return publicStateSchema.parse(publicView(state));
}
