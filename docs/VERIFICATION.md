# M1 verification record

Environment: macOS arm64; Node **22.22.1**, pnpm **10.0.0**. The interactive shell originally selected Node 20.20.0; validation explicitly prepended the installed Node 22.22.1 binary directory to PATH. `.nvmrc` and `.npmrc` now enforce the intended runtime. No external service keys were used.

## Executed gates

| Command                                                       | Exit / observation                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                | 0; registry install generated `pnpm-lock.yaml`                                                                                     |
| `pnpm install --frozen-lockfile --offline`                    | 0 in a separate source copy with no node_modules, dist, .next or Turbo cache; 275 packages installed from the populated pnpm store |
| `pnpm install --frozen-lockfile --offline`                    | 0 in the final workspace; lockfile unchanged                                                                                       |
| `pnpm dev`                                                    | Both services ready from the clean copy after dependency-order correction; stopped deliberately with Ctrl+C, exit 0                |
| HTTP `GET http://127.0.0.1:3001`                              | 200; Arabic shell content present                                                                                                  |
| HTTP `GET http://127.0.0.1:2567/health`                       | 200; status ok, protocol 1, gameplayRoomsEnabled false                                                                             |
| `pnpm format:check`                                           | 0                                                                                                                                  |
| `pnpm lint`                                                   | 0 across web, server, core and shared                                                                                              |
| `pnpm typecheck`                                              | 0, including test sources and generated Next route types                                                                           |
| `pnpm test`                                                   | 0; 55 Vitest tests: core 31, shared 20, server 4                                                                                   |
| `pnpm build`                                                  | 0; both libraries/server compiled and Next production page statically generated                                                    |
| `pnpm simulate`                                               | 0; seed 2026, 36 turns, 177 accepted actions, 36 unique question IDs, TURN_LIMIT winner p_gold                                     |
| `pnpm --filter @mamalik/web exec playwright install chromium` | 0; matching Chromium/headless shell and FFmpeg installed                                                                           |
| `pnpm test:e2e`                                               | 0; three Chromium projects: desktop 1440×1000, Pixel 7 portrait 393×727, landscape 740×360 with reduced motion                     |

Core coverage includes topology/symmetric castle distances, unique setup, legal/illegal transitions and adjacency, wrong identities/match/turn, input immutability, repeated/changed command keys, duplicate answers, question validation, neutral/occupied outcomes, exact ties, deadline boundary/race ordering, monotonic contexts, turn skips, scoring/joint winners, home-castle elimination/transfer, forfeits/abort, secret-free snapshots, prototype-like IDs, exact deterministic replay, and a complete castle-conquest match reached only through accepted actions.

The real server integration test boots Colyseus on an ephemeral port and fetches health; it does not mock HTTP. Browser tests check real RTL/lang attributes, local Arabic font selection, visible M1 limitations, overflow, keyboard skip-link focus, anchor navigation, zero page exceptions and zero axe WCAG A/AA violations. Full-page screenshots are generated for visual inspection. Desktop, portrait and short landscape Arabic layouts were inspected for spacing, legibility, wrapping and directionality.

## Corrections and practical limits

- The initial lint run rejected a control-character regex. The name check now explicitly rejects those character codes without a lint suppression.
- The initial typecheck found missing Express handler declarations. Explicit Request/Response types and `@types/express` resolved this.
- A clean first-run boot exposed a missing shared dist entrypoint before its watcher completed. Turbo dev now depends on upstream builds; repeating from deleted generated outputs booted both services.
- The first Playwright attempt failed before launching browsers because the matching executable was still downloading. Installation completed and all three projects subsequently passed. Browser tests now start their own production process on port 3100 with reuse disabled, avoiding unrelated services.
- Port 3000 belonged to an existing process and was left untouched. Clean development verification used Next's automatically selected 3001. Health used 2567.
- The offline clean-copy install proves reproducibility against the populated package store, not a fresh internet/CDN outage. The initial online registry install also succeeded. Optional `msgpackr-extract` native build scripts remain disallowed; its JavaScript fallback is used. esbuild/sharp are explicitly allowlisted as needed.
- Shell networking/worker/browser restrictions required execution outside the sandbox for installation, health integration, service boot, production build and Chromium. These are local development checks, not production security certification.
- CI is configured to repeat these gates on GitHub but has **not run on hosted Actions**. No push/deploy occurred. Local Chromium checks do not establish Safari/Firefox compatibility, full WCAG compliance, Arabic human usability, mobile performance or network fairness.
- No rooms, authentication, real question bank, reconnect scheduling, persistence, multiplayer load or release recovery are implemented or verified. These remain assigned to later milestones.
