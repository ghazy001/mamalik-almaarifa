import { describe, expect, it } from 'vitest';
import { sameMapModel } from './model';
import type { MapModel } from './model';
import { createMapPreview } from './preview';

describe('visual snapshot reuse', () => {
  it('accepts separately allocated identical public models without mutating them', () => {
    const before = createMapPreview();
    const next = structuredClone(before);
    expect(next).not.toBe(before);
    expect(sameMapModel(before, next)).toBe(true);
    expect(next).toEqual(before);
  });
  const changes: Record<string, (model: MapModel) => MapModel> = {
    'active player': (model) => ({ ...model, activePlayerId: 'p_blue' }),
    'legal targets': (model) => ({ ...model, legalTargetIds: [] }),
    'territory order': (model) => ({
      ...model,
      territories: [...model.territories].reverse(),
    }),
    ownership: (model) => ({
      ...model,
      territories: model.territories.map((node, i) =>
        i === 1 ? { ...node, ownerId: 'p_blue' } : node,
      ),
    }),
    castles: (model) => ({
      ...model,
      territories: model.territories.map((node, i) =>
        i === 0 ? { ...node, castle: !node.castle } : node,
      ),
    }),
    coordinates: (model) => ({
      ...model,
      territories: model.territories.map((node, i) =>
        i === 0 ? { ...node, x: node.x + 1, y: node.y + 1 } : node,
      ),
    }),
    labels: (model) => ({
      ...model,
      territories: model.territories.map((node, i) =>
        i === 0 ? { ...node, name: 'اسم جديد' } : node,
      ),
    }),
    topology: (model) => ({
      ...model,
      territories: model.territories.map((node, i) =>
        i === 0 ? { ...node, neighbors: [] } : node,
      ),
    }),
    'player appearance': (model) => ({
      ...model,
      players: model.players.map((player, i) =>
        i === 0 ? { ...player, name: 'اسم جديد', color: '#ffffff' } : player,
      ),
    }),
    'player identity': (model) => ({
      ...model,
      players: model.players.map((player, i) =>
        i === 0 ? { ...player, id: 'replacement' } : player,
      ),
    }),
    'territory count': (model) => ({
      ...model,
      territories: model.territories.slice(1),
    }),
    'player count': (model) => ({ ...model, players: model.players.slice(1) }),
  };
  it.each(Object.entries(changes))(
    'invalidates the scene when %s changes',
    (_name, change) => {
      const before = createMapPreview();
      expect(sameMapModel(before, change(before))).toBe(false);
    },
  );
});
