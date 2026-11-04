import type { PublicState } from '@mamalik/shared';

export type Cue =
  'preview' | 'turn' | 'question' | 'capture' | 'hold' | 'finish';

const phases: Record<PublicState['phase'], number> = {
  LOBBY: 0,
  SETUP: 1,
  ATTACK_SELECTION: 3,
  DUEL: 4,
  RESOLUTION: 5,
  FINISHED: 6,
};

/** Presentation only. Initial/restored snapshots are silent; old updates cannot replay. */
export function createCueTracker() {
  let previous: { match: string; turn: number; phase: number } | null = null;
  return (
    state: PublicState | undefined,
    playerId: string,
    connected = true,
  ): Cue | null => {
    if (!state || !connected) {
      previous = null;
      return null;
    }
    const next = {
      match: state.matchId,
      turn: state.turn,
      phase: phases[state.phase],
    };
    const before = previous;
    if (
      before?.match === next.match &&
      (next.turn < before.turn ||
        (next.turn === before.turn && next.phase <= before.phase))
    )
      return null;
    previous = next;
    if (!before || before.match !== next.match) return null;
    if (state.phase === 'FINISHED') return 'finish';
    if (state.phase === 'RESOLUTION' && state.outcome)
      return state.outcome.captured ? 'capture' : 'hold';
    if (
      state.phase === 'DUEL' &&
      state.question &&
      [state.question.attackerId, state.question.defenderId].includes(playerId)
    )
      return 'question';
    if (state.phase === 'ATTACK_SELECTION' && state.activePlayerId === playerId)
      return 'turn';
    return null;
  };
}
