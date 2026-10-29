import { MAP } from '@mamalik/game-core';
import type { PublicState } from '@mamalik/shared';
import { GEOGRAPHY } from './geography';
import type { MapModel } from './model';

export const PLAYER_COLORS: Readonly<Record<string, string>> = {
  p_teal: '#57c7b1',
  p_blue: '#83a9ee',
  p_gold: '#ddbc78',
};

/** Adapts public data only. The scene never receives a private MatchState. */
export function projectMap(
  snapshot: PublicState,
  legalTargetIds: readonly string[],
): MapModel {
  return {
    activePlayerId: snapshot.activePlayerId,
    players: snapshot.players.map(({ id, name }) => ({
      id,
      name,
      color: PLAYER_COLORS[id] ?? '#a9bcc5',
    })),
    territories: snapshot.territories.map((territory) => {
      const place = GEOGRAPHY[territory.id];
      const node = MAP.find((item) => item.id === territory.id);
      if (!place || !node)
        throw new Error(`Missing map presentation ${territory.id}`);
      return { ...territory, ...place, neighbors: [...node.neighbors] };
    }),
    legalTargetIds: [...legalTargetIds],
  };
}
