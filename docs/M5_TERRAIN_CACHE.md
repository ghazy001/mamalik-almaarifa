# M5 — Cached terrain and graphics recovery

This fourth independent M5 slice evaluates caching the existing artwork before expanding the art pass. It follows [the rendering/reflow slice](M5_MOBILE_QUALITY.md) and [ADR 0018](ADR/0018-cached-map-artwork.md). The owner continues to defer private question review/publication. M4 remains incomplete.

## Behavior and boundary

The WebGL scene bakes sea, paths and depth-sorted terrain/numbers into one fixed 2000×1400 texture, displayed in the existing 1000×700 world. Original colors, coordinates, public ownership and legal-route projections are retained. Selection, pointer/touch hit zones and conquest effects stay independent and interactive. Equivalent snapshots keep the texture; actual visual-model changes destroy the old artwork/texture and bake the new projection. Resize only adjusts display scale. No questions, answers, clocks or rule outcomes enter the cache.

Phaser 4 buffers texture draw commands: the renderer explicitly renders them before disposing their temporary graphics and text. Unsaved RenderTextures own their backing textures and are destroyed with the scene. Canvas 2D retains direct vector rendering; a thrown cache allocation/draw failure also retains the direct scene. The DOM controls remain available if the entire renderer is unavailable.

Real WebGL context loss temporarily prevents repainting. Public state continues updating, including captures and deadlines. After Phaser restores its GL resources, the scene rebuilds from the latest projection and selection. Old effects are not replayed. The restore listener is removed on scene shutdown.

## Measurements and trade-offs

The baseline is the production renderer at `b391083`, with the same test-only draw-call probe used after the change. Three baseline profiles ran before source changes; the final profiles come from the completed guest suite. Both use local macOS arm64, Node 22.22.1, pnpm 10.0.0 and Playwright 1.64.1 Chromium, disabled browser cache and loopback assets. Desktop uses 1× CPU, Pixel 7 emulation and reduced-motion 740×360 landscape use 4×. These are observations on one host, not physical phones. The Colyseus fixture retains its 80ms simulated round trip.

The probe wraps the original WebGL `drawArrays`/`drawElements` and `clear`, counting only the map canvas. During stable artwork sampling, dividing draw calls by clears compares render work without treating browser animation frames as Phaser FPS. Initial texture baking is outside that steady observation window. Raw frame samples, ready times and long tasks remain observational; neither repeatability nor statistical significance of a general speedup is established. The initial bake and temporary source textures still cost work.

| Stable journey                    | Baseline calls per clear | Cached calls per clear |
| --------------------------------- | -----------------------: | ---------------------: |
| Selected map, desktop / landscape |                       25 |                      2 |
| Selected map, emulated mobile     |                       28 |                      2 |
| Idle room, desktop / landscape    |                       24 |                      1 |
| Idle room, emulated mobile        |                       27 |                      1 |

See [committed before/after samples](performance/m5-terrain-cache.json). This demonstrates reduced steady draw submissions in these journeys, not a universal FPS or energy improvement. The existing 30-frame cap is retained; the lazy Phaser dependency is not reduced.

A first world-resolution cache visibly degraded edge smoothing and was replaced before acceptance. The inspected supersampled version preserves a comparable appearance on the measured desktop/mobile layouts; it is not pixel-identical to rendering directly to the main canvas. Its color surface alone is 11.2 MB (10.68 MiB), excluding depth/stencil/driver resources and temporary source textures. Physical-device peak memory, sustained performance, thermal behavior, browser-family coverage and context resets on real phones remain open. Do not add larger art atlases without revisiting this budget.

## Reproduction and verification

Stop `pnpm dev` before building. Run `pnpm build`, then `pnpm profile:web` for the existing six rendering/reflow cases. For the nine new recovery/capture cases, run `pnpm --filter @mamalik/web exec playwright test tests/terrain-cache.spec.ts`. `pnpm test:e2e` includes both sets, plus the existing complete local/three-client matches, network recovery, sound, accessibility and onboarding journeys.

The rendering profiles require real initial drawing and at most four draw calls per clear in the selected-map and idle-room samples. They continue requiring zero redundant number redraws during unchanged authoritative snapshots. The recovery journey uses the browser's real `WEBGL_lose_context` extension, compares canvas screenshots byte-for-byte before/after restoration, preserves keyboard selection and checks resize without rerasterization. Capture tests answer the public practice fixture through the actual controller and compare the flag region before capture and after fresh retry in WebGL and Canvas modes. The WebGL journey also accepts a real capture while context is lost and verifies the latest ownership artwork after restoration. No production test hook or fake outcome is added.

CI automatically includes these cases and retains only scoped profile JSON and map/synthetic quiz screenshots for seven days. Browser state, traces and private content are not uploaded. Hosted CI execution is not claimed.

The final production guest run completed with Playwright status `passed`, no failed tests and all 60 discovered cases included. Its terminal session handle expired before the final exit code/output could be retrieved; the completed `.last-run.json` and final three-layout artifacts were inspected. An exact final terminal exit code or duration is therefore not asserted. Desktop output had already confirmed the capture-during-loss case; final mobile/landscape recovery/capture screenshots and profiles were also inspected.

| Command                                                  | Result                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install --offline --frozen-lockfile`               | Exit 0; existing local store, no dependency/lockfile changes                               |
| `pnpm lint`                                              | Exit 0                                                                                     |
| `pnpm typecheck`                                         | Exit 0                                                                                     |
| `pnpm test`                                              | Exit 0; 230 tests (80 web); unchanged package tasks reused valid Turbo cache               |
| `pnpm build`                                             | Exit 0; six tasks, final source/tests type-checked                                         |
| `pnpm test:e2e`                                          | Completed Playwright status passed; 60 cases, zero failures; final terminal handle expired |
| `pnpm simulate`                                          | Exit 0; deterministic 36-turn/177-action match, gold winner                                |
| `pnpm --filter @mamalik/web exec playwright test --list` | Exit 0; 60 cases discovered                                                                |

`pnpm format:check` and `git diff --check` both exited 0. The database-free guest preview was restored on web 3113/game 2572; `/play`, `/learn` and `/online` returned HTTP 200. Health returned HTTP 200 with development questions and administration/result writes disabled. No dependency, rule, protocol or question-content changes were made. No push, publication or deployment was performed. PostgreSQL/M4 hosted acceptance was not rerun for this presentation-only slice. Initial investigation caught and corrected two test-probe TypeScript signatures and a test expectation that looked for territory controls after practice had intentionally removed them. A 12-case intermediate renderer run passed before the added capture-during-loss assertion. No failed or intermediate run is counted as final acceptance.

## Five files and an exercise

1. `features/map/renderer.ts`: spend one bake to avoid repeating static drawing, while keeping interactive/effect layers live.
2. `features/map/model.ts`: immutable visual equality determines when the cached picture is obsolete.
3. `tests/support/render-probe.ts`: observe real GL work without replacing it or confusing draw counts with frame rate.
4. `tests/terrain-cache.spec.ts`: use real controller outcomes and graphics context loss to verify recovery, not just an event stub.
5. `docs/ADR/0018-cached-map-artwork.md`: record the memory/quality trade-off and the evidence that could reverse it.

Exercise: open `/learn`, choose an adjacent territory, answer the public practice question, and watch its flag change. Restart and confirm it clears. Repeat with keyboard controls and a resized window. Run the recovery test and inspect `terrain-restored.png` and `terrain-capture.png`. Next recommended M5 work: physical-phone performance/audio/RTL checks and observed newcomer testing before expanding the premium art pass. Those human/device gates remain open.
