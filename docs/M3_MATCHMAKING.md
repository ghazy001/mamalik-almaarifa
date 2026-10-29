# M3 — Basic guest matchmaking

This is the historical second-slice verification record. The subsequent recovery increment and current M3 status are documented in M3_RESILIENCE.md. `/online` now supports real guest matchmaking as well as private invitations. Queue admission reuses the same server-authoritative gameplay, deadlines, public snapshots and reconnect/forfeit behavior. There are no queue bots or account/ranking systems.

## Manual test

1. Use Node 22.22.1/pnpm 10.0.0, install with the committed lockfile and run `pnpm dev`. Open `/online` on the port printed by Next. The game service defaults to `http://127.0.0.1:2567`; set browser-reachable `GAME_SERVER_URL` for another address as described in README.
2. Open three separate tabs/profiles. Enter a name and select **ابحث عن لاعبين** in each. Before the third arrives, the room shows its actual one/two seats and **إلغاء البحث**. No invite code is needed or displayed.
3. Cancel the second tab while only two have joined. The first returns to one seat. Search again: that vacated seat is reusable, with no stale name/readiness. No automatic requeue occurs.
4. After the third arrives, all three select **أنا جاهز** within 60 seconds. The server starts the unchanged match. Play through legal targets, questions and results. Refresh a guest tab to restore its same seat; timers continue.
5. To test abandonment, fill another queue and leave one guest unready. The 60-second server deadline cancels without a winner. A permanent departure from a prepared lobby also cancels; explicitly leaving during play forfeits. Return/search again is explicit.
6. Create a private room in another tab and start a queue elsewhere: these stay separate. Private invitation controls and joining by code still work.

Restart both services and reload old tabs after this update: protocol v2 requires mode/readiness fields and rejects v1. Old per-tab v1 tokens are not migrated. Domain rules stay at v1.

## Policies and boundaries

`kingdom_queue` uses public/unlocked Colyseus lookup and fills the fullest available room first. Concurrent reservations are handled by the installed Colyseus matcher; there is no promise of global FIFO or even skill. Join order assigns canonical castles, and server randomness still orders turns/questions. Join options remain exactly `{name}`; mode, rules, seed and timing overrides are rejected. A room prepares a match at three occupied seats, then locks. A disconnected but reserved seat counts as occupied and is labeled disconnected.

Readiness expires 60 seconds after queue preparation. All READY receipts must arrive before that boundary. An expiry aborts with no winners and cannot be undone by a late command. Private rooms do not acquire this queue-specific readiness deadline. Incomplete rooms expire five minutes after creation, and all rooms retain the 25-minute lifetime ceiling. Unexpected drops reserve a seat for 30 seconds; queue readiness may expire sooner. Leaving an incomplete lobby frees its seat, leaving a prepared lobby aborts, and leaving active play forfeits. Empty rooms are disposed by Colyseus. No replacement occurs inside an already prepared match.

The network adapter sends intents only. Explicit cancellation releases even a late asynchronous join; stale completion/events cannot attach to a newer search. Navigation/unmount still drops with recovery grace. Server mode/deadline are allowlisted public v2 fields; answer secrets remain absent from live snapshots. The public offline fixture bank is still development content and inspectable via the repository/offline route.

## Verification

Environment: macOS arm64, Node 22.22.1 and pnpm 10.0.0. Commands explicitly prepend `/Users/ghazi.saoudi/.nvm/versions/node/v22.22.1/bin` to PATH. Dependencies and the lockfile are unchanged. Turbo reused unchanged package checks where applicable; modified packages ran their checks.

| Command                                                                | Exit / result                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile --offline`                             | 0; all seven workspace projects already up to date, no lockfile change                     |
| `pnpm format:check`                                                    | 0                                                                                          |
| `pnpm lint`                                                            | 0                                                                                          |
| `pnpm typecheck`                                                       | 0, including server fixtures and Playwright sources                                        |
| `pnpm test`                                                            | 0; 98 tests: core 31, shared 23, server 15, web 29                                         |
| `pnpm build`                                                           | 0; libraries/server compile and all five Next routes build                                 |
| `pnpm simulate`                                                        | 0; deterministic 36-turn/177-action match, TURN_LIMIT, p_gold                              |
| `pnpm --filter @mamalik/web exec playwright test tests/online.spec.ts` | 0; six final online journeys passed across all three projects, 3.6 minutes                 |
| `pnpm test:e2e`                                                        | 0; 24 Chromium journeys across desktop, portrait and reduced-motion landscape, 5.0 minutes |

The full browser run finished a queued desktop match and invited portrait/landscape matches, each through three isolated contexts and identical server results. It restored a refreshed guest lobby seat, used legal UI targets/real answer intents, scanned lobby/question/results for axe violations, checked RTL/overflow and asserted the online scripts exclude the offline question bank. Separate queue journeys on all three sizes verified real occupancy, cancellation, replacement names, readiness controls, no invite controls and consistent abort on permanent lobby departure. These tests use the same trusted six-turn fixture, production-default 10/15-second windows, three-second review and 80 ms round-trip latency simulator described in the first-slice record. Production still uses 36 turns. After the final connection guard and capture-driver cleanup, `pnpm --filter @mamalik/web exec playwright test tests/online.spec.ts` also exited 0: all six affected online journeys passed against the rebuilt client in 3.6 minutes. Unchanged offline/shell/map routes retain their passing full-suite results.

Real WebSocket tests additionally send six concurrent searches and assert exactly two three-seat rooms, excluding an existing private room. A queued match answers real fixtures and finishes with the same result across its guests. Other tests verify incomplete-seat reuse, dropped-seat reservation/restoration, locked-room exclusion, queue readiness expiry, late READY rejection, injected mode rejection and immediate-handshake drop cleanup. Unit regressions cover cancellation before async join completion, cancellation followed by another search, stale-room messages and duplicate connect attempts while waiting for the first snapshot. Initial queue checks exposed stale readiness metadata at start and recovery rejection during an incomplete handshake; both are corrected and the final suite passes without unhandled rejections.

Screenshots were inspected at 1440×1000 desktop, 412×839 CSS-pixel portrait and 740×360 reduced-motion landscape. The actual seats and Arabic cancellation/readiness controls wrap without horizontal overflow. Axe scans report zero violations in the scanned states; this is local automated QA, not full WCAG, physical-device or browser-family certification. The full-page queue captures scroll to the top first to avoid Chromium placing the off-screen fixed skip link inside an expanded screenshot. SDK warnings in socket tests come from intentionally unobserved helper clients and deliberate auth rejection; no browser page errors were recorded. GitHub Actions already runs the same default gates, including all 24 browser journeys; hosted execution has not been observed.

The final development smoke used `PORT=3113 GAME_SERVER_PORT=2572 GAME_SERVER_URL=http://127.0.0.1:2572 pnpm dev`. Both services became ready, all three library watchers reported zero errors, `/online` returned HTTP 200 with Arabic RTL, the search control and configured endpoint, and `/health` returned HTTP 200 with protocol 2/game rooms enabled. The preview is left running at `http://127.0.0.1:3113/online` with normal production-default rules for local review.

The previous private-room measurements remain historical in M3_PRIVATE_ROOMS.md.

## Owner exercise and next slice

Trace `joinOrCreate` in `online-session.ts` to the `kingdom_queue` registration in `server.ts`: matching chooses a room, while `kingdom-room.ts` binds a transport seat and `match-session.ts` delegates outcomes to pure core. Compare `PROTOCOL_VERSION` with the unchanged `rulesVersion`: wire compatibility and gameplay compatibility are separate. Cancel a waiting second tab and watch the server snapshot reduce the actual seat count before searching again.

Next: exercise in-duel disconnect/reload, backgrounding and delayed/reordered recovery under broader adverse-network conditions, then assess M3 completion. Before public competitive use, measure/review latency fairness; current server receipt ordering still favors lower latency. Production origin/HTTP-create/connection budgets, hosted capacity, accounts, durable results and reviewed private content remain outside this increment. No deployment or push is part of this work.
