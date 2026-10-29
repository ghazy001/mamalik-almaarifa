import { describe, expect, it } from 'vitest';
import { MAP } from '@mamalik/game-core';
import { GEOGRAPHY, WORLD_HEIGHT, WORLD_WIDTH } from './geography';
import { createMapPreview } from './preview';
import { EMPTY_SELECTION, reduceSelection } from './model';

describe('canonical map presentation boundary', () => {
  it('projects the canonical 15 nodes and exact edges, with three uniquely owned castles', () => {
    const model = createMapPreview();
    expect(model.territories.map((node) => node.id)).toEqual(
      MAP.map((node) => node.id),
    );
    expect(model.territories.filter((node) => node.castle)).toHaveLength(3);
    expect(
      new Set(
        model.territories
          .filter((node) => node.castle)
          .map((node) => node.ownerId),
      ).size,
    ).toBe(3);
    for (const node of model.territories)
      expect(node.neighbors).toEqual(
        MAP.find((item) => item.id === node.id)!.neighbors,
      );
    expect(Object.keys(GEOGRAPHY).sort()).toEqual(
      MAP.map((node) => node.id).sort(),
    );
  });
  it('exposes only the two legal neutral neighbors of the active castle', () => {
    const model = createMapPreview();
    const castle = model.territories.find(
      (node) => node.ownerId === model.activePlayerId,
    )!;
    expect([...model.legalTargetIds].sort()).toEqual(
      [...castle.neighbors].sort(),
    );
    expect(model.legalTargetIds).toHaveLength(2);
    expect(
      model.legalTargetIds.every(
        (id) =>
          model.territories.find((node) => node.id === id)?.ownerId === null,
      ),
    ).toBe(true);
    expect(model).toEqual(createMapPreview());
  });
  it('contains no question/deck/answer/timer fields or hidden initial-state references', () => {
    const model = createMapPreview();
    const serialized = JSON.stringify(model);
    for (const forbidden of [
      'correctChoiceId',
      'questionDeck',
      'q_preview_',
      'answers',
      'accepted',
      'selectionDeadline',
      'lastNow',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(Object.keys(model).sort()).toEqual([
      'activePlayerId',
      'legalTargetIds',
      'players',
      'territories',
    ]);
  });
  it('keeps all visual terrain and castle bounds inside the fixed world', () => {
    const nodes = createMapPreview().territories;
    for (const node of nodes) {
      expect(node.x).toBeGreaterThan(75);
      expect(node.x).toBeLessThan(WORLD_WIDTH - 75);
      expect(node.y).toBeGreaterThan(110);
      expect(node.y).toBeLessThan(WORLD_HEIGHT - 65);
      for (const other of nodes)
        if (node.id !== other.id)
          expect(
            Math.hypot(node.x - other.x, node.y - other.y),
          ).toBeGreaterThan(100);
    }
  });
});

describe('map intents are preselection, never conquests', () => {
  it('accepts a permitted target without mutating model/ownership and makes repeats no-ops', () => {
    const model = createMapPreview();
    const before = structuredClone(model);
    const intent = {
      type: 'SELECT_TARGET' as const,
      targetId: model.legalTargetIds[0]!,
    };
    const selected = reduceSelection(EMPTY_SELECTION, intent, model);
    expect(selected.selectedId).toBe(intent.targetId);
    expect(reduceSelection(selected, intent, model)).toBe(selected);
    expect(model).toEqual(before);
  });
  it('rejects owned, nonadjacent and unknown targets while preserving the original selection', () => {
    const model = createMapPreview();
    const selected = reduceSelection(
      EMPTY_SELECTION,
      { type: 'SELECT_TARGET', targetId: model.legalTargetIds[0]! },
      model,
    );
    for (const targetId of [
      ...model.territories
        .filter((node) => !model.legalTargetIds.includes(node.id))
        .map((node) => node.id),
      'missing',
    ])
      expect(
        reduceSelection(selected, { type: 'SELECT_TARGET', targetId }, model),
      ).toBe(selected);
  });
  it('allows known territory inspection without selecting it; rejects unknown hover and clears both states', () => {
    const model = createMapPreview();
    const hovered = reduceSelection(
      EMPTY_SELECTION,
      { type: 'HOVER_TARGET', targetId: model.territories[0]!.id },
      model,
    );
    expect(hovered).toEqual({
      selectedId: null,
      hoveredId: model.territories[0]!.id,
    });
    expect(
      reduceSelection(
        hovered,
        { type: 'HOVER_TARGET', targetId: 'missing' },
        model,
      ),
    ).toBe(hovered);
    expect(
      reduceSelection(hovered, { type: 'HOVER_TARGET', targetId: null }, model),
    ).toEqual(EMPTY_SELECTION);
    expect(
      reduceSelection(hovered, { type: 'CLEAR_SELECTION' }, model),
    ).toEqual(EMPTY_SELECTION);
  });
});
