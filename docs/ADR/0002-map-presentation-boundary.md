# ADR 0002 — Isolated Phaser map and accessible preselection

Status: accepted for the first M2 slice. No gameplay rule changes.

## Context

M1's deterministic graph/rules are verified. M2 needs original isometric presentation without tying adjacency or outcomes to canvas coordinates. Browser globals in Phaser must not run during Next.js server rendering. Critical choices must remain available without precise pointer input or a working renderer.

## Decision

Add `/map` as a paused local preview. Its server component constructs an initial match through the existing READY/BEGIN transitions, validates `publicView`, derives legal IDs using `legalTargets`, and sends only an explicit `MapModel` to the browser. Initial setup uses fixed seed/time and no question content. Domain code runs on the server/build side; the client scene imports no game-core values.

Client preselection intents use `SELECT_TARGET`, `HOVER_TARGET` and `CLEAR_SELECTION` within a UI-only union. These are not protocol envelopes or accepted game commands. The UI reducer allows selection only from the projected legal IDs and never updates ownership. There is no question context, duel, timer, simulated conquest or backend coordination in this slice.

Use stable Phaser 4.2.1, verified against its [release notes](https://github.com/phaserjs/phaser/releases/tag/v4.2.1) and installed TypeScript declarations. The route lazily loads a client-only host, which dynamically imports the renderer inside a caught promise. This catches both module initialization and synchronous renderer creation failures. The landing link disables prefetch. Failed graphics leave the Arabic DOM controls available.

Render procedural terrain, trees, raised stone, castle silhouettes and routes using Graphics objects; all artwork and names are original. A fixed 1000×700 world fits its observed parent. Visual coordinates never decide adjacency or timing. Layers sort by world Y. There is no ambient animation, music, external image service or physics system in this slice; reduced-motion users see the same static scene and immediate highlights.

React owns the sole selection state. Both DOM buttons and Phaser hit areas emit intents; a renderer handle receives selection updates. Each React effect owns a separate DOM mount, and cleanup disconnects its ResizeObserver, destroys its Phaser game and removes the mount. Readiness is reported after the first rendered frame rather than merely constructing the game.

## Consequences

The graph has a complete keyboard/touch alternative and can later receive multiplayer snapshots through the same presentation contract. A failed renderer does not block selecting a territory. Responsive fit prioritizes a whole-map view; on small screens the DOM controls provide larger targets. Pan/zoom and performance targets remain future measured work.

The page is intentionally a preselection preview, not the M2 completion contract. A later local controller must feed actual sanitized match snapshots and apply question-backed actions before ownership can change. Browser-contained offline answers will be inspectable; authoritative protected questions remain M3 server work. Room schemas, core rules and protocol version are unchanged.
