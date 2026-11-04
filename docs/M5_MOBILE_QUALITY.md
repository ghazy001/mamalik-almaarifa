# M5 — Measured rendering and Arabic reflow

This third independent M5 slice addresses measured frontend work and narrow-screen quiz behavior. M4 remains incomplete; the owner's deferral of private question review/publication still applies. No candidate content, auth, results, rules or protocol changed.

## Findings and changes

The production baseline at commit `2ab5ef5` reproduced two regression failures: unchanged room snapshots regenerated 30 territory-number textures during the observation window, and a synthetic unbroken Arabic/number answer overflowed the quiz dialog at 320 CSS px. Increasing the root text size to 200% left the answer at 15px because its font size was fixed in pixels.

`sameMapModel` now compares the complete public visual projection before the scene is rebuilt. Separately allocated identical snapshots retain terrain, input zones and active effects. Changes to ownership, legal targets, active player, player appearance/identity, terrain coordinates, labels, castles, topology, count or ordering invalidate the comparison. The model remains immutable and the renderer still emits intents only. It does not cache question, clock, submitted-answer or scoring data.

The installed Phaser 4.2.1 source (`src/core/TimeStep.js`) distinguishes `fps.target` from the enforcing `fps.limit`. The renderer now supplies both at 30. This bounds its intended render cadence while retaining input, resize and effect processing. It does not alter the explicit-time domain or authoritative server deadlines. It is a cap, not evidence that every device sustains 30 FPS.

Quiz text uses rem units, long labels can shrink/wrap inside their flex cards, and the dialog explicitly controls maximum width instead of inheriting the browser's font-dependent dialog limit. Countdown numbers and their unit stay together at enlarged text sizes. Native scrolling, keyboard focus, minimization and visible focus rings remain available. Standard-size spacing and the ink/teal/gold design are retained.

## Repeatable measurements

Stop development previews before rebuilding. After `pnpm build`, run `pnpm profile:web` (equivalent to `pnpm --filter @mamalik/web exec playwright test tests/rendering.spec.ts`). It starts the same production Next service and local Colyseus fixture as the existing guest suite. No database or account is required.

The rendering journey opens `/map`, waits for an actual rendered frame, alternates six legal selections and samples 120 browser animation-frame intervals. It then creates one browser guest and two real SDK peers in an unstarted room, observes a subsequent authoritative snapshot, and checks that no territory labels were rerasterized. Test-only wrappers call the original canvas methods; no production debug API, fake outcome, fake timer or runtime telemetry is added. A positive initial label count prevents a missing probe from passing as zero work.

The other journey uses the real practice question dialog with explicitly synthetic long Arabic/mixed-number text inserted only for CSS stress. At 320×740 it sets the root font size to 200%, checks that answer text doubles, verifies no horizontal page/dialog overflow, measures answer touch targets, checks the timer's text remains on one line and runs axe. It captures both question and scrolled answer views, then exercises Escape/minimization. This is a presentation fixture, not a reviewed release question or an editorial approval.

Profiles use local macOS arm64, Node 22.22.1, pnpm 10.0.0 and Playwright 1.64.1 Chromium. Desktop uses 1× CPU, Pixel 7 emulation and reduced-motion landscape use 4× CPU through CDP. Browser cache is disabled, assets use loopback without bandwidth throttling, and game messages use the existing 80ms simulated round-trip fixture. CPU slowdown is relative to this host and does not reproduce a phone's processor/GPU; see [Chrome's explanation](https://developer.chrome.com/docs/devtools/performance/reference#throttle-cpu).

The probe records FCP, the last observed LCP candidate, navigation-to-observed-map readiness, long-task durations, transferred/decoded resource sizes, six selection-event-to-two-animation-frame delays and browser frame intervals. Map readiness includes automation polling/setup; LCP is a candidate observed before the page closes. Selection samples confirm DOM selection and approximate scheduling, not standardized INP or proof of canvas presentation. WebGL clear counts are a render-work proxy, not a general FPS counter. Font drawing hooks add some overhead. Timing samples are observational and are not pass/fail thresholds in CI.

Committed summaries live in `performance/m5-rendering-baseline.json` and `performance/m5-rendering-after.json`. They preserve the environment, work counts, sizes and samples. They do not establish a statistically significant timing improvement. The largest lazy Phaser script remains about 1.38 MB decoded; this slice does not shrink it. Hardware, browser family, memory/thermal/network and sustained-FPS budgets remain unverified.

The mobile comparison establishes these work/usability changes (not an FPS or general speedup claim):

| Observation                                                    | Baseline                      | Final build                |
| -------------------------------------------------------------- | ----------------------------- | -------------------------- |
| Territory-number redraws during unchanged snapshot observation | 30                            | 0 in all three profiles    |
| Dialog content / available width at 320px + 200% root text     | 485 / 248 px (237px overflow) | 286 / 286 px (no overflow) |
| Answer font at that enlarged text setting                      | 15px, unchanged               | 30px, doubled from 15px    |
| Enforced renderer limit                                        | target only                   | explicit limit of 30       |

The stable gates are correctness/work constraints: zero redundant territory-label draws after unchanged syncs, one live canvas, valid initial probe activity, doubled answer text, wrapped content, touch sizes, timer legibility and usable keyboard controls. The ordinary `pnpm test:e2e` includes these six cases. CI is configured to retain only profile JSON and synthetic narrow-quiz screenshots for seven days through [upload-artifact](https://github.com/actions/upload-artifact/tree/v4); it does not upload browser state, traces or private content. Remote CI execution has not been claimed.

## Verification record

The two mobile baseline cases failed as expected before the fixes. The first fixed six-case rendering/reflow run passed in 1.7 minutes. Screenshot inspection then identified the native dialog width/timer wrapping details, so an early full-suite run was intentionally interrupted and rebuilt. The interrupted run left test listeners behind, so the next browser launch reported a port conflict (exit 1). The identified test services were stopped and the final clean run passed all 51 cases in 8.5 minutes. No skipped or interrupted run is counted as passing. Final profile summaries use that completed run. Unchanged Turbo tasks reused valid local cache.

| Command                          | Result                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Exit 0; no dependency changes                                                         |
| `pnpm format:check`              | Exit 0                                                                                |
| `pnpm lint`                      | Exit 0                                                                                |
| `pnpm typecheck`                 | Exit 0, including probes/metrics and layout assertions                                |
| `pnpm test`                      | Exit 0; 230 tests: core 31, shared 27, database 41, server 51, web 80                 |
| `pnpm build`                     | Exit 0; all six tasks, including the final width/countdown correction                 |
| `pnpm test:e2e`                  | Exit 0; all 51 cases in 8.5 minutes across the three browser profiles                 |
| `pnpm profile:web --list`        | Exit 0; six profiling/reflow cases discovered; those same cases ran in the full suite |
| `git diff --check`               | Exit 0                                                                                |

Thirteen new unit cases cover immutable separately allocated equivalent models and visual invalidation. Final desktop, Pixel 7 and reduced-motion screenshots were inspected, including the synthetic 320px enlarged question and scrolled answer views. Each reflow case uses 320×740; the rendering profile and the other existing journeys retain their normal desktop/mobile/landscape viewports. New profile JSON and screenshot artifacts are configured in CI; hosted CI execution, PostgreSQL and M4 combined/hosted acceptance were not rerun for this frontend slice. Physical phone/browser/audio/newcomer gates remain open.

The guest preview was restored on web 3113/game 2572. `/play`, `/learn` and `/online` returned HTTP 200; health reported development questions with content administration and result writes disabled. No push, publication or deployment was performed.

## Five files and an exercise

1. `features/map/model.ts`: compare visible data without mixing renderer behavior into rules.
2. `features/map/renderer.ts`: control actual frame scheduling and avoid recreating unchanged scene objects.
3. `app/play/play.css`: rem text and flex shrinking keep Arabic and mixed-direction labels usable.
4. `tests/support/render-probe.ts`: observe real drawing and browser scheduling without replacing the work being measured.
5. `tests/rendering.spec.ts`: pair a real socket-driven regression with deliberately synthetic layout stress.

Exercise: build, run `pnpm profile:web`, and inspect a generated `sync-profile.json`: `redundantTerritoryTextDraws` must be zero. Open `/learn` on a narrow browser, enlarge text and navigate/minimize the dialog with the keyboard. Then compare behavior on a physical phone. Recommended next independent M5 work: measure actual map rendering on a device and evaluate baking static terrain into cached textures before expanding the art pass. Observed newcomer testing and device audio QA remain pending; resume question review only when requested.
