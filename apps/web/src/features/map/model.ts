export interface MapTerritory {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly castle: boolean;
  readonly ownerId: string | null;
  readonly neighbors: readonly string[];
}
export interface MapPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}
/** Presentation-only projection: no private state, question, clock or answers. */
export interface MapModel {
  readonly activePlayerId: string | null;
  readonly players: readonly MapPlayer[];
  readonly territories: readonly MapTerritory[];
  readonly legalTargetIds: readonly string[];
}
export interface MapSelection {
  readonly selectedId: string | null;
  readonly hoveredId: string | null;
}
export interface MapEffect {
  readonly key: string;
  readonly targetId: string;
  readonly captured: boolean;
  readonly ownerId: string | null;
}
export type MapIntent =
  | { type: 'SELECT_TARGET'; targetId: string }
  | { type: 'HOVER_TARGET'; targetId: string | null }
  | { type: 'CLEAR_SELECTION' };

export const EMPTY_SELECTION: MapSelection = {
  selectedId: null,
  hoveredId: null,
};

/** UI preselection only. Legality is supplied by the domain projection. */
export function reduceSelection(
  state: MapSelection,
  intent: MapIntent,
  model: MapModel,
): MapSelection {
  switch (intent.type) {
    case 'SELECT_TARGET':
      return model.legalTargetIds.includes(intent.targetId) &&
        state.selectedId !== intent.targetId
        ? { selectedId: intent.targetId, hoveredId: state.hoveredId }
        : state;
    case 'HOVER_TARGET':
      return intent.targetId === null ||
        model.territories.some((node) => node.id === intent.targetId)
        ? { ...state, hoveredId: intent.targetId }
        : state;
    case 'CLEAR_SELECTION':
      return EMPTY_SELECTION;
  }
}
