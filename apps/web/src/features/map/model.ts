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

/** New public snapshots may carry identical visuals. Preserve the scene in that case. */
export function sameMapModel(left: MapModel, right: MapModel): boolean {
  const stringsEqual = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  return (
    left === right ||
    (left.activePlayerId === right.activePlayerId &&
      stringsEqual(left.legalTargetIds, right.legalTargetIds) &&
      left.players.length === right.players.length &&
      left.players.every((player, index) => {
        const other = right.players[index]!;
        return (
          player.id === other.id &&
          player.name === other.name &&
          player.color === other.color
        );
      }) &&
      left.territories.length === right.territories.length &&
      left.territories.every((node, index) => {
        const other = right.territories[index]!;
        return (
          node.id === other.id &&
          node.name === other.name &&
          node.x === other.x &&
          node.y === other.y &&
          node.castle === other.castle &&
          node.ownerId === other.ownerId &&
          stringsEqual(node.neighbors, other.neighbors)
        );
      }))
  );
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
