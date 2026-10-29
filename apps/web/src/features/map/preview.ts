import {
  MAP,
  activePlayer,
  applyAction,
  createMatch,
  legalTargets,
  publicView,
} from '@mamalik/game-core';
import type { Action } from '@mamalik/game-core';
import { publicStateSchema } from '@mamalik/shared';
import { GEOGRAPHY } from './geography';
import type { MapModel } from './model';

/** Called by the server page. Only the explicit map projection crosses into React. */
export function createMapPreview(): MapModel {
  let state = createMatch({
    id: 'm_map_preview',
    seed: 2026,
    players: [
      { id: 'p_teal', name: 'فيروز' },
      { id: 'p_blue', name: 'ياقوت' },
      { id: 'p_gold', name: 'كهرمان' },
    ],
    questionIds: Array.from({ length: 36 }, (_, i) => `q_preview_${i}`),
  });
  const setup: Action[] = [
    ...state.players.map((player) => ({
      type: 'READY' as const,
      actor: player.id,
      matchId: state.id,
      turn: 0,
      key: 'preview_ready',
    })),
    { type: 'BEGIN' },
  ];
  for (const action of setup) {
    const result = applyAction(state, action, { now: state.lastNow + 1 });
    if (!result.ok)
      throw new Error(`Map preview setup failed: ${result.error}`);
    state = result.state;
  }
  const snapshot = publicStateSchema.parse(publicView(state));
  const colors: Readonly<Record<string, string>> = {
    p_teal: '#57c7b1',
    p_blue: '#83a9ee',
    p_gold: '#ddbc78',
  };
  return {
    activePlayerId: activePlayer(state),
    players: snapshot.players.map(({ id, name }) => ({
      id,
      name,
      color: colors[id] ?? '#a9bcc5',
    })),
    territories: snapshot.territories.map((territory) => {
      const place = GEOGRAPHY[territory.id];
      const node = MAP.find((item) => item.id === territory.id);
      if (!place || !node)
        throw new Error(`Missing map presentation: ${territory.id}`);
      return { ...territory, ...place, neighbors: [...node.neighbors] };
    }),
    legalTargetIds: legalTargets(state, activePlayer(state)),
  };
}
