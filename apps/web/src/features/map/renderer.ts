import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './geography';
import { EMPTY_SELECTION } from './model';
import type {
  MapEffect,
  MapIntent,
  MapModel,
  MapSelection,
  MapTerritory,
} from './model';

type Graphics = Phaser.GameObjects.Graphics;
type Vertex = readonly [number, number];
const gold = 0xddbc78;

function polygon(
  g: Graphics,
  vertices: readonly Vertex[],
  fill: number,
  alpha = 1,
) {
  g.fillStyle(fill, alpha).fillPoints(
    vertices.map(([x, y]) => new Phaser.Math.Vector2(x, y)),
    true,
  );
}

function tree(g: Graphics, x: number, y: number, size = 1) {
  g.fillStyle(0x071a1c, 0.35).fillEllipse(x + 5, y + 3, 29 * size, 12 * size);
  g.fillStyle(0x735c3f).fillRect(x - 2, y - 20 * size, 4, 22 * size);
  polygon(
    g,
    [
      [x - 17 * size, y - 13 * size],
      [x, y - 46 * size],
      [x + 17 * size, y - 13 * size],
    ],
    0x1c5e4c,
  );
  polygon(
    g,
    [
      [x - 17 * size, y - 13 * size],
      [x, y - 46 * size],
      [x, y - 13 * size],
    ],
    0x35846b,
  );
  polygon(
    g,
    [
      [x - 12 * size, y - 29 * size],
      [x, y - 52 * size],
      [x + 12 * size, y - 29 * size],
    ],
    0x3a9474,
  );
}

function castle(g: Graphics, x: number, y: number, color: number) {
  g.fillStyle(0x05131b, 0.4).fillEllipse(x + 5, y, 87, 30);
  polygon(
    g,
    [
      [x - 28, y - 13],
      [x + 14, y - 3],
      [x + 14, y - 43],
      [x - 28, y - 53],
    ],
    0x88a2aa,
  );
  polygon(
    g,
    [
      [x + 14, y - 3],
      [x + 34, y - 16],
      [x + 34, y - 55],
      [x + 14, y - 43],
    ],
    0x405d6e,
  );
  polygon(
    g,
    [
      [x - 28, y - 53],
      [x - 8, y - 66],
      [x + 34, y - 55],
      [x + 14, y - 43],
    ],
    0xb5c5c3,
  );
  for (const offset of [-29, 27]) {
    g.fillStyle(0xa8bebf).fillRect(x + offset - 8, y - 64, 16, 42);
    polygon(
      g,
      [
        [x + offset - 12, y - 64],
        [x + offset, y - 85],
        [x + offset + 12, y - 64],
      ],
      color,
    );
    polygon(
      g,
      [
        [x + offset, y - 85],
        [x + offset + 12, y - 64],
        [x + offset, y - 64],
      ],
      0x234659,
    );
    g.fillStyle(0xe7cc8b).fillRect(x + offset - 2, y - 54, 4, 8);
  }
  g.fillStyle(0x112e3c).fillRoundedRect(x - 7, y - 28, 13, 21, {
    tl: 6,
    tr: 6,
    bl: 0,
    br: 0,
  });
  g.lineStyle(2, 0xead5a3).lineBetween(x + 4, y - 61, x + 4, y - 102);
  polygon(
    g,
    [
      [x + 5, y - 102],
      [x + 28, y - 96],
      [x + 5, y - 84],
    ],
    color,
  );
  for (const offset of [-16, 1, 17])
    g.fillStyle(0xe5c480).fillRect(x + offset, y - 44, 4, 7);
}

function terrain(
  scene: Phaser.Scene,
  node: MapTerritory,
  index: number,
  color: number | null,
) {
  const { x, y } = node;
  const g = scene.add.graphics().setDepth(y);
  g.fillStyle(0x020d16, 0.35).fillEllipse(x + 5, y + 30, 145, 58);
  g.lineStyle(1, 0x6b9aab, 0.16).strokeEllipse(x, y + 27, 159, 66);
  polygon(
    g,
    [
      [x - 63, y],
      [x, y + 34],
      [x, y + 57],
      [x - 63, y + 20],
    ],
    0x183d3b,
  );
  polygon(
    g,
    [
      [x, y + 34],
      [x + 63, y],
      [x + 63, y + 20],
      [x, y + 57],
    ],
    0x102c35,
  );
  polygon(
    g,
    [
      [x - 63, y],
      [x, y - 34],
      [x + 63, y],
      [x, y + 34],
    ],
    index % 3 === 0 ? 0x39705c : 0x2c5c50,
  );
  polygon(
    g,
    [
      [x - 52, y - 2],
      [x - 1, y - 29],
      [x + 42, y - 7],
      [x + 5, y + 13],
    ],
    0x558c6a,
    0.48,
  );
  g.lineStyle(1.5, color ?? 0x789780, 0.7).strokePoints(
    [
      new Phaser.Math.Vector2(x - 63, y),
      new Phaser.Math.Vector2(x, y - 34),
      new Phaser.Math.Vector2(x + 63, y),
      new Phaser.Math.Vector2(x, y + 34),
    ],
    true,
  );
  if (color !== null)
    polygon(
      g,
      [
        [x - 61, y],
        [x, y - 32],
        [x + 61, y],
        [x, y + 32],
      ],
      color,
      0.2,
    );
  if (!node.castle && color !== null) {
    g.lineStyle(2, 0xd5d9c4).lineBetween(x + 40, y + 3, x + 40, y - 24);
    polygon(
      g,
      [
        [x + 41, y - 24],
        [x + 58, y - 20],
        [x + 41, y - 13],
      ],
      color,
    );
  }
  // Small deterministic details are artwork only; they never affect gameplay.
  if (node.castle && color !== null) castle(g, x, y - 2, color);
  else if (index % 5 === 2) {
    polygon(
      g,
      [
        [x - 35, y + 2],
        [x - 7, y - 44],
        [x + 25, y + 3],
      ],
      0x718d81,
    );
    polygon(
      g,
      [
        [x - 7, y - 44],
        [x + 25, y + 3],
        [x - 2, y - 4],
      ],
      0x415f5b,
    );
    polygon(
      g,
      [
        [x - 17, y - 28],
        [x - 7, y - 44],
        [x + 5, y - 28],
        [x - 7, y - 32],
      ],
      0xc4d0b3,
    );
    tree(g, x + 30, y - 3, 0.65);
  } else {
    tree(g, x - 20, y - 3, 0.9);
    tree(g, x + 9, y - 9, 0.7);
    if (index % 2 === 0) tree(g, x + 31, y + 2, 0.55);
    g.fillStyle(0xe1c78a, 0.65)
      .fillCircle(x - 31, y + 9, 1.5)
      .fillCircle(x - 23, y + 14, 1.5);
  }
  scene.add
    .text(
      x,
      y + 17,
      new Intl.NumberFormat('ar', { numberingSystem: 'arab' })
        .format(index + 1)
        .padStart(2, '٠'),
      {
        fontFamily: 'Noto Sans Arabic, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#edf0d9',
      },
    )
    .setOrigin(0.5)
    .setDepth(y + 1);
}

export function createMapRenderer(
  parent: HTMLDivElement,
  initialModel: MapModel,
  onIntent: (intent: MapIntent) => void,
  onReady: () => void,
) {
  let selection: MapSelection = EMPTY_SELECTION;
  let model = initialModel;
  let effect: MapEffect | null = null;
  let lastEffectKey: string | null = null;
  let disposed = false;
  let nodes = new Map(model.territories.map((node) => [node.id, node]));

  class KingdomScene extends Phaser.Scene {
    private overlay: Graphics | null = null;
    private initialized = false;
    constructor() {
      super('kingdom-map');
    }

    create() {
      if (disposed) return;
      this.initialized = true;
      this.paintMap();
      this.playEffect();
      this.input.on('gameout', () =>
        onIntent({ type: 'HOVER_TARGET', targetId: null }),
      );
      this.game.canvas.setAttribute('tabindex', '-1');
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        if (!disposed) onReady();
      });
    }

    paintMap() {
      if (!this.initialized || disposed) return;
      this.tweens.killAll();
      this.children.removeAll(true);
      const sea = this.add.graphics();
      sea.fillStyle(0x0b2130).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      for (let i = 0; i < 6; i++)
        sea
          .fillStyle(0x17506a, 0.028)
          .fillEllipse(495, 350, 970 - i * 92, 640 - i * 55);
      sea.lineStyle(1, 0x6c9ca9, 0.08);
      for (let y = 110; y < 650; y += 45)
        for (let x = 100; x < 950; x += 120)
          sea.lineBetween(x + (y % 2) * 9, y, x + 30, y - 4);
      const paths = this.add.graphics();
      for (const node of model.territories)
        for (const id of node.neighbors) {
          const other = nodes.get(id);
          if (other && node.id < id) {
            paths
              .lineStyle(6, 0x05151e, 0.6)
              .lineBetween(node.x, node.y + 10, other.x, other.y + 10);
            paths
              .lineStyle(1.5, 0x76929a, 0.38)
              .lineBetween(node.x, node.y + 10, other.x, other.y + 10);
          }
        }
      for (const node of model.territories)
        if (model.legalTargetIds.includes(node.id)) {
          const source = model.territories.find(
            (item) =>
              item.ownerId === model.activePlayerId &&
              item.neighbors.includes(node.id),
          );
          if (source)
            paths
              .lineStyle(3, gold, 0.65)
              .lineBetween(source.x, source.y + 10, node.x, node.y + 10);
        }
      for (const node of [...model.territories].sort((a, b) => a.y - b.y)) {
        const color = model.players.find(
          (player) => player.id === node.ownerId,
        )?.color;
        terrain(
          this,
          node,
          model.territories.indexOf(node),
          color ? Number.parseInt(color.slice(1), 16) : null,
        );
        const hit = this.add.zone(node.x, node.y, 126, 68).setDepth(node.y + 2);
        hit.setInteractive(
          new Phaser.Geom.Polygon([63, 0, 126, 34, 63, 68, 0, 34]),
          Phaser.Geom.Polygon.Contains,
        );
        hit.input!.cursor = model.legalTargetIds.includes(node.id)
          ? 'pointer'
          : 'default';
        hit.on('pointerover', () =>
          onIntent({ type: 'HOVER_TARGET', targetId: node.id }),
        );
        hit.on('pointerout', () =>
          onIntent({ type: 'HOVER_TARGET', targetId: null }),
        );
        hit.on('pointerdown', () =>
          onIntent({ type: 'SELECT_TARGET', targetId: node.id }),
        );
      }
      this.overlay = this.add.graphics().setDepth(1000);
      this.drawSelection();
    }

    playEffect() {
      if (
        !this.initialized ||
        disposed ||
        !effect ||
        effect.key === lastEffectKey
      )
        return;
      lastEffectKey = effect.key;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const node = nodes.get(effect.targetId);
      if (!node) return;
      const owner = model.players.find(
        (player) => player.id === effect!.ownerId,
      );
      const color = owner ? Number.parseInt(owner.color.slice(1), 16) : gold;
      const ring = this.add
        .ellipse(node.x, node.y + 10, 130, 62)
        .setFillStyle(color, 0)
        .setStrokeStyle(4, color)
        .setDepth(1100);
      this.tweens.add({
        targets: ring,
        scaleX: 1.6,
        scaleY: 1.6,
        alpha: 0,
        duration: 750,
        onComplete: () => ring.destroy(),
      });
      if (effect.captured)
        for (let index = 0; index < 6; index++) {
          const angle = (index * Math.PI) / 3;
          const dot = this.add.circle(node.x, node.y, 3, color).setDepth(1101);
          this.tweens.add({
            targets: dot,
            x: node.x + Math.cos(angle) * 65,
            y: node.y + Math.sin(angle) * 35 - 20,
            alpha: 0,
            duration: 650,
            onComplete: () => dot.destroy(),
          });
        }
    }

    drawSelection() {
      const g = this.overlay;
      if (!g || disposed) return;
      g.clear();
      for (const node of model.territories) {
        const selected = node.id === selection.selectedId;
        const hovered = node.id === selection.hoveredId;
        const legal = model.legalTargetIds.includes(node.id);
        if (!selected && !hovered && !legal) continue;
        const outline = selected ? 0xffdc85 : legal ? gold : 0xa9bcc5;
        const { x, y } = node;
        g.lineStyle(
          selected ? 4 : hovered ? 3 : 2,
          outline,
          selected || hovered ? 1 : 0.75,
        ).strokePoints(
          [
            new Phaser.Math.Vector2(x - 67, y),
            new Phaser.Math.Vector2(x, y - 37),
            new Phaser.Math.Vector2(x + 67, y),
            new Phaser.Math.Vector2(x, y + 37),
          ],
          true,
        );
        if (selected) {
          const source = model.territories.find(
            (item) =>
              item.ownerId === model.activePlayerId &&
              item.neighbors.includes(node.id),
          );
          if (source) {
            g.lineStyle(14, gold, 0.09).lineBetween(
              source.x,
              source.y + 10,
              x,
              y + 10,
            );
            g.lineStyle(3, 0xffdc85, 1).lineBetween(
              source.x,
              source.y + 10,
              x,
              y + 10,
            );
          }
          g.fillStyle(0xffdc85).fillCircle(x, y + 46, 4);
        }
      }
    }
  }

  const scene = new KingdomScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b2130',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false },
    fps: { target: 30 },
    audio: { noAudio: true },
    banner: false,
    input: { keyboard: false, touch: { capture: false } },
    scene,
  });
  const resize = new ResizeObserver(() => {
    if (game.isBooted && !disposed) game.scale.refresh();
  });
  resize.observe(parent);
  return {
    setModel(value: MapModel) {
      if (model === value) return;
      model = value;
      nodes = new Map(model.territories.map((node) => [node.id, node]));
      scene.paintMap();
    },
    setEffect(value: MapEffect | null) {
      effect = value;
      scene.playEffect();
    },
    setSelection(value: MapSelection) {
      selection = value;
      scene.drawSelection();
    },
    destroy() {
      disposed = true;
      resize.disconnect();
      game.destroy(true);
    },
  };
}
