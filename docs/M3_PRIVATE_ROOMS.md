# M3 — Private room vertical slice

M3 is in progress. This increment implements a real three-player invited guest match at `/online`, not bots or simulated matchmaking. Public/basic matchmaking remains the next slice. M2's `/play` and `/map` remain available separately.

## Run and play

1. Use Node 22.22.1 and pnpm 10.0.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
2. Open `/online` at the Next port printed in the terminal. The web route defaults to the persistent game service at `http://127.0.0.1:2567`.
3. Enter an Arabic-capable guest name and **أنشئ غرفة خاصة**. Copy the 16-character room code or invite link to two other browser tabs/profiles. Each tab has its own recovery token; do not duplicate/share that token.
4. On each guest tab, enter a name and the invite code, then **انضم إلى الغرفة**. After all three seats are occupied, each player selects **أنا جاهز**. The server shuffles player order/question IDs.
5. The active player chooses an outlined adjacent territory via map or DOM controls and **ابدأ التحدّي** within ten seconds. Attackers/defenders answer within fifteen seconds. Observers cannot submit. Three-second result review advances automatically; clients cannot choose outcomes or advance phases.
6. Complete the match and compare the same results across all three tabs. Explicit **مغادرة الغرفة والاستسلام** forfeits. Refresh or a temporary network drop attempts to restore the same seat for up to thirty seconds; timers continue. A missing player forfeits on grace expiry.

No cloud credentials are required. For a different service address, export `GAME_SERVER_URL` before starting Next/Turbo, or set it in `apps/web/.env.local`. It must be a browser-reachable HTTP(S) endpoint without embedded credentials. Root `.env` is loaded by the game service; Next does not automatically read the repository root's file. Keep the service's default loopback binding for local work. LAN/public hosting and TLS need an explicitly configured deployment; a `127.0.0.1` link only works on this computer.

Closing/leaving the route drops its socket, preserves per-tab recovery state and starts server grace. Explicit leave clears that token. A new room is a new match; this slice has no durable rematch/history. A prepared lobby aborts if a player permanently leaves; create a fresh room to retry. Empty/unprepared lobbies expire, and active rooms have a hard lifetime ceiling. No account ownership, crash recovery, production anti-cheat, load or public-network security guarantee is made.

## Boundaries and assumptions

- `kingdom-room.ts` owns guest seats, bounded messages, monotonic timing, invitations, lifecycle and reconnection.
- `match-session.ts` calls the unchanged pure game-core for legality, battle resolution, ownership, scores and winners.
- `packages/shared` validates strict join options, commands, recipient snapshots, clock replies and error/ack events. Server seed/order/deck, other players' answers and receipt times are absent from public state.
- `online-session.ts` handles the SDK, per-tab token, snapshot sequence recovery and advisory clock estimation. It cannot award territory or declare a winner. Pending answers are shown as sending until the server acknowledges them.
- `online-match.tsx`, `battle-dialog.tsx` and Phaser render public state and emit intent. The online route does not load offline fixtures. The development question bank remains publicly inspectable through the offline demo/source; these are source-checked development questions, not reviewed competitive content.

The first three guests receive canonical castles in join order; a server random seed shuffles turns and the deck. Match length/scoring remain Rules v1. Server receipt wins speed duels and exact equal receipts favor defense; low latency is still an advantage. Clock sampling estimates half the measured round trip and favors the lowest-RTT sample for display. It never extends deadlines or trusts client timestamps. Resolution review is fixed at three seconds online; offline Continue is not a network command.

## Verification

Real socket integration tests cover three private seats, a fourth-seat rejection, identity/rule/seed injection rejection, strict names, rate limits, same-seat reconnection, grace expiry, explicit forfeit, and server-timed match termination. Explicit-time session tests cover participant-only answers/targets, secret-free live views, recipient-only choice acknowledgement, idempotent retries, deadlines/backward times, delayed tick behavior, complete matches, forfeit and abort. Shared schemas cover envelope/version/private-field rejection.

The browser journey opens three isolated contexts, creates/joins an invitation, restores a refreshed lobby tab before readiness, submits real UI intents through legal controls, finishes the same match across all clients, scans accessibility and checks that the online route's loaded JavaScript excludes offline question fixture IDs. The production web build connects to a trusted six-turn test-server fixture using the real room/reducer, unchanged 10/15-second action windows, three-second review and Colyseus's 80 ms round-trip latency simulator. Test clients cannot select rules, seeds or clocks. Six turns keep multi-device CI bounded; production index.ts retains the normal 36-turn limit. A separate desktop run against the normal production server completed a castle-conquest match in 19 turns (3.3 minutes including browser setup), with three real contexts and identical results.

Environment: macOS arm64, Node 22.22.1 and pnpm 10.0.0. Validation explicitly selected the installed Node 22 binary directory on PATH. The SDK is pinned to 0.18.8 and the lockfile is committed with the workspace changes.

| Command                                    | Exit / result                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `pnpm install`                             | 0; registry installation linked the new package and installed the compatible SDK                       |
| `pnpm install --frozen-lockfile --offline` | 0; final workspace up to date, lockfile unchanged                                                      |
| `pnpm format:check`                        | 0                                                                                                      |
| `pnpm lint`                                | 0                                                                                                      |
| `pnpm typecheck`                           | 0, including server fixtures and browser tests                                                         |
| `pnpm test`                                | 0; 92 tests: core 31, shared 23, game server 11, web 27                                                |
| `pnpm build`                               | 0; libraries/server compile; static `/`, `/map`, `/play` and request-rendered `/online` build          |
| `pnpm test:e2e`                            | 0; all 21 browser journeys passed in 7.3 minutes across desktop, portrait and reduced-motion landscape |

The final workspace development smoke used `PORT=3113 GAME_SERVER_PORT=2572 GAME_SERVER_URL=http://127.0.0.1:2572 pnpm dev`. All three library watchers reported zero errors; Next became ready on 3113 and the normal game service on 2572. Both `GET /online` and `GET /health` returned HTTP 200. The HTML had Arabic RTL direction and the configured 2572 endpoint; health reported M3/protocol 1 with game rooms enabled. This preview uses production-default 36-turn rules and is left running for local review; no deployment occurred. Turbo explicitly passes runtime host/port overrides through to the services.

Screenshots were inspected at desktop 1440×1000, Pixel 7 portrait 412×839 CSS pixels and reduced-motion landscape 740×360. Invitations/inputs stack on portrait; the deliberately long 40-character guest name wraps in cards, questions, territory controls and results without page overflow. The short-landscape quiz scrolls internally and keeps its timer visible. All scanned lobby/question/result states reported zero axe violations; result headings receive focus. This is automated/local visual QA, not complete WCAG or physical-device certification.

Corrections: the first browser driver exhausted its selection window during reload/inspection and waited for an expired target. It now restores before readiness, reads legal controls together, waits for server-confirmed selection, and handles legitimate turn expiry (including FINISHED on the final turn without a turn-number increment). Browser tests run one worker; live multi-canvas tests retain action/network traces while disabling per-action DOM/screen snapshots that added GPU readback overhead. Explicit screenshots and UI/accessibility assertions remain enabled. One intermediate run was deliberately interrupted after its known driver failure; only the final complete passing run is counted above. A separate client-generation regression test covers late messages from a room that has been left. The suite does not establish Safari/Firefox support, packet-loss tolerance, physical-device performance, public hosting safety or playtest balance. Hosted Actions execution has not been observed.

## Owner exercise

Open three tabs, refresh the defender during a question and observe that its same kingdom returns while the deadline continues. Then explicitly leave from two tabs and inspect the survivor result. Compare the identity-free command schema with `kingdom-room.ts`'s session-to-seat map: the transport decides who acts; the pure reducer decides whether the action is legal.
