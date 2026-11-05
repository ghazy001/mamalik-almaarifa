# ADR 0018 — Cache static map artwork in a bounded texture

Status: accepted as a reversible M5 presentation default, 2026-11-05.

## Context

ADR 0017 avoids rebuilding equivalent snapshots, but procedural terrain and its separate number textures are still drawn every rendered frame. A fresh production baseline at `b391083` measured 24–28 WebGL draw calls per clear in the map/idle room journeys. Rendering the same artwork repeatedly is unnecessary work before the premium art pass.

## Decision

Bake sea, paths and depth-sorted terrain/numbers into one unsaved Phaser RenderTexture per visual model. Use the existing complete visual-model comparison to retain equivalent snapshots. Destroy the old scene objects/texture on a real visual change or scene teardown. Explicitly flush Phaser 4's buffered drawing before destroying the source artwork. Do not preserve commands referencing destroyed inputs.

Use a fixed 2000×1400 texture for the 1000×700 world, with a 2× camera zoom and half-scale display. A world-resolution prototype introduced visible jagged edges; supersampling improved the inspected desktop/mobile edges. CSS resize and DPR do not increase this allocation. The color surface alone is 11,200,000 bytes (about 10.68 MiB); attachments, temporary source textures, driver allocation and peak memory add overhead that has not been measured on a phone. This exchanges bounded texture memory and one-time baking for lower steady rendering work. Revisit it if device evidence does not support the trade-off.

Keep interactive zones, selection outlines/routes and transient effects outside the cached artwork. Canvas 2D continues to draw the procedural source directly. A thrown cache-creation/drawing failure retains direct artwork for the scene's remaining lifetime. Do not introduce a new renderer mode, dependency or gameplay command.

Skip scene repaints while the WebGL context is lost, retaining the latest public model. Repaint from that projection on Phaser's actual restore event; unsubscribe on scene shutdown. Do not restart domain state, pause deadlines or replay old conquest effects on restoration.

## Consequences and evidence

Same-host browser profiles show one to two steady draw calls per clear with the cache. Test-only GL wrappers call the original drawing functions. Stable CI gates require positive drawing activity and at most four draw calls per clear in these specific idle journeys; they do not impose host-sensitive frame-time thresholds. Browser tests cover real context loss/restoration, a capture while context is lost, identical restored pixels/selection, resize without rebaking, capture/retry art, Canvas fallback and navigation teardown.

The 30-frame cap and core/server authority are unchanged. There is no general FPS, battery, GPU-memory or physical-device certification. See [measurement record](../M5_TERRAIN_CACHE.md) for exact commands, samples and remaining gates. Question review/publication remains deferred and M4 incomplete.
