# M2 progress — interactive map preselection

Status: first slice implemented; **M2 is not complete**. Rules/protocol version 1 are unchanged. No networked gameplay, questions, opponents or battle results were added in this increment.

## Delivered behavior

- `/map` shows all 15 canonical territories, the three correctly owned starting castles, and all 18 undirected neighbor connections.
- Original procedural isometric terrain, trees, hills, stone layers, castle silhouettes, water marks and faction colors form **أرخبيل المنار**. No copied game assets, remote art or placeholder emoji are used. Phaser 4.2.1 is pinned in the lockfile and is MIT licensed.
- The active kingdom and its two legal neutral targets come from game-core setup/legal-target functions. No legality or conquest rules live in the scene.
- Canvas hover/click/tap and Arabic DOM target buttons use the same UI intent reducer. Tab plus Enter/Space can select; `aria-pressed`, a live selection summary, text states, a gold outline and a highlighted route reflect the choice. Reset clears both selection and hover.
- Owned and nonadjacent territories remain visibly identified but cannot be selected. No turn, ownership or score changes. The preview has no running timer and is clearly labeled local preselection.
- The whole fixed world fits the observed parent across desktop, portrait and landscape. DOM target controls remain at least 44 CSS px high; mobile users do not need precise canvas input.
- Phaser loads dynamically only on `/map`; its module initialization is caught along with construction failures. A failed canvas leaves the DOM selection interface usable. Audio and ambient animation are disabled. Resize observers and Phaser instances are disposed on client navigation.

## Files and boundaries

| File under `apps/web/src`      | Responsibility                                                      |
| ------------------------------ | ------------------------------------------------------------------- |
| `app/map/page.tsx`             | Server page builds and hands off the public model                   |
| `features/map/preview.ts`      | Initial core transitions, validated public projection and legal IDs |
| `features/map/geography.ts`    | Original territory names/world coordinates; no adjacency authority  |
| `features/map/model.ts`        | Presentation-only types and immutable UI preselection reducer       |
| `features/map/map-preview.tsx` | Accessible DOM controls/status and one React selection state        |
| `features/map/phaser-map.tsx`  | Client mount, lazy import, errors and cleanup                       |
| `features/map/renderer.ts`     | Procedural Phaser drawing, hit areas and emitted intents            |
| `app/map/map.css`              | Responsive RTL map layout and states                                |

Only `MapModel` crosses the server/client boundary: public players/colors, coordinates/names, territories/owners/neighbors, active player ID and legal target IDs. No private state, accepted-command ledger, question IDs/content/answers or deadlines are serialized. UI SELECT_TARGET is preselection, not a protocol envelope or a server-accepted turn action. The initial page is statically generated; it does not connect to Colyseus or require its health service.

## Verification

Environment: macOS arm64, Node 22.22.1, pnpm 10.0.0, matching Playwright Chromium installed during M1. Validation commands explicitly selected the pinned Node runtime through PATH.

`pnpm install --frozen-lockfile --offline` and `pnpm format:check` also exited 0; the updated lockfile remained unchanged.

| Command          | Result                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `pnpm install`   | Exit 0; Phaser + eventemitter3 added, lockfile updated                                   |
| `pnpm lint`      | Exit 0                                                                                   |
| `pnpm typecheck` | Exit 0; includes new unit/browser test sources                                           |
| `pnpm test`      | Exit 0; 62 tests: core 31, shared 20, service 4, map 7                                   |
| `pnpm build`     | Exit 0; `/` and `/map` statically generated, Phaser browser bundle compiled              |
| `pnpm test:e2e`  | Exit 0; 9 Chromium checks across desktop, Pixel 7 emulation and reduced-motion landscape |

Seven new unit tests cover graph/presentation parity, castle ownership, domain-derived target IDs, secret-free model serialization, drawable bounds, permitted/idempotent UI selection, illegal/unknown targets, hover isolation, reset and unchanged ownership. Existing core/shared/server tests remain passing.

Browser journeys enter from the landing page, wait for the first rendered frame, inspect all 15 controls/two legal targets, activate a DOM target with the keyboard, reset, choose through real canvas hit testing (touch on mobile), inspect shared state, check RTL/overflow and zero axe violations/page errors, then navigate away/back and verify exactly one fresh canvas and cleared selection. Separate tests deliberately remove canvas contexts and verify the DOM fallback still selects. Screenshots are in `apps/web/test-results/` and were visually inspected at all three sizes.

The initial typecheck caught Phaser 4's Graphics point API requiring Vector2 objects; those paths now use typed vectors. No type suppressions were introduced. First-frame readiness is based on POST_RENDER, not just scene construction. Browser checks use the dedicated production port 3100, leaving unrelated services untouched.

Limitations: automated Chromium emulation is not a physical-phone benchmark, Safari/Firefox QA, full accessibility certification or proof of network fairness. No FPS/load budget has been measured. Mobile whole-map fit makes canvas tiles small; full-size DOM targets provide the required alternative. Renderer startup failure is covered, but browser/device context-restoration behavior still needs wider QA. CI configuration covers these tests, but hosted GitHub Actions has not run.

## Next M2 increment

Build a local match controller owning private simulation state, a reviewed/sourced fixture pack and an accessible four-choice Arabic question overlay. Apply genuine question-backed core actions, show timed resolution, then introduce deterministic scripted opponents. Keep scene inputs sanitized and label offline browser answers inspectable. Finish a full offline match before declaring M2 complete.

Owner exercise: use the DOM buttons to select a target and observe its canvas highlight. Then move one coordinate in `geography.ts`, reload and verify that the same two legal targets remain available. Restore the coordinate and run `pnpm test`; drawing position must never change graph rules.
