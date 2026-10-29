# M3 — Recovery and adverse-network validation

This increment hardens the existing private/queued guest match. It changes client recovery and tests, with no gameplay-rule or wire-format change. Protocol 2 and Rules 1 remain canonical. **M3 is complete for the documented local guest-match scope.** This is not a production-release certification; the remaining limits below remain release gates.

## Implemented behavior

- A dropped connection keeps the public board visible but disables actions. Automatic recovery requires a fresh correlated server clock/full snapshot before controls unlock; an old buffered snapshot cannot resume play.
- Recovery saves the SDK's rotated token after its join acknowledgement. Reload, automatic recovery and explicit retry preserve the same seat and any answer already accepted by the server.
- Original server deadlines continue through drops, reloads and suspended browser execution. Expired questions stay resolved, late commands are rejected and no client can extend a window.
- Delayed errors cannot clear a newer question's pending choice. Duplicate/replacement choices stay locked in the client and are independently rejected/idempotently acknowledged by the server.
- Visibility return, page show/resume and network restoration request current full state. Probes are coalesced with a trailing refresh; periodic recovery remains available. The advisory clock cannot move backward.
- Connection guidance is readable inside the native Arabic question dialog. A closed connection offers **استعادة الاتصال**; a token is not discarded until explicit leave. Recovery may fail if the room/grace already expired.

See ADR 0006 for the exact sync boundary, SDK token ordering and error-scoping decisions. Neither Node's room authority nor pure game-core delegates deadlines, correctness, captures or winners to this client.

## Manual exercise

Run `pnpm dev`, open `/online` in three separate tabs/profiles and join a queue or private room. Ready all guests. During an active question:

1. Refresh the active player's tab. It must return to the same kingdom/question with its original decreasing deadline.
2. Temporarily disconnect that tab's network, then restore it within 30 seconds. Choices disable while disconnected; recovery fetches current state. An answer accepted before the drop remains locked. An expired question does not reopen.
3. Background a tab while another completes a battle. Return to it and verify the current turn/ownership appears without replaying an old action.
4. Disconnect beyond the reservation grace. The server forfeits that guest; an expired token cannot create a replacement seat. Two permanent departures leave the survivor result.

DevTools Offline behavior for existing WebSockets varies; the automated test below closes actual socket endpoints and delays the real handshake. The browser tests use Chromium lifecycle freezing to suspend JavaScript execution, not a synthetic gameplay clock. Online gameplay still uses normal 10/15-second action windows and a three-second review. The browser fixture's six-turn limit only bounds test duration; production retains 36 turns.

## Verification

Environment: macOS arm64, Node 22.22.1, pnpm 10.0.0. Commands explicitly select the installed Node 22 directory on PATH. No dependencies, lockfile, domain rule or wire schema changed. Turbo reused unchanged checks; changed web/server test packages ran their applicable gates.

| Command                                                                                                          | Exit / measured result                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`                                                                       | 0; all seven workspace projects up to date                                                                    |
| `pnpm format:check`                                                                                              | 0                                                                                                             |
| `pnpm lint`                                                                                                      | 0                                                                                                             |
| `pnpm typecheck`                                                                                                 | 0; includes browser helpers and real-socket fixtures                                                          |
| `pnpm test`                                                                                                      | 0; 106 tests: core 31, shared 23, server 18, web 34                                                           |
| `pnpm build`                                                                                                     | 0; final web and standalone server builds succeed                                                             |
| `pnpm simulate`                                                                                                  | 0; 36 turns, 177 accepted actions, TURN_LIMIT, p_gold                                                         |
| `pnpm --filter @mamalik/web exec playwright test tests/online.spec.ts --project=desktop --grep 'three browsers'` | 0; focused fault journey passed in 59.5 seconds after harness correction                                      |
| `pnpm test:e2e`                                                                                                  | 0; all 24 existing journeys passed in 4.9 minutes, including full fault-injected matches on all three layouts |
| `pnpm --filter @mamalik/web exec playwright test tests/recovery.spec.ts`                                         | 0; all three final manual-recovery journeys passed in 50.5 seconds                                            |

The full 24-case run preceded the last optional in-dialog restore action. The final production build then passed its three affected-path cases on desktop/portrait/landscape: closed modal accessibility, Tab/Enter focus, same-seat/question/deadline recovery, a real answer and survivor termination. The 27 cases were verified across these two runs; the default CI discovery now includes all 27. No hosted GitHub Actions execution has been observed. CI already executes the same install/format/lint/types/tests/build/simulation/browser gates.

The existing three-browser journey now proves snapshot suppression and duplicate command forwarding occurred, replays stale snapshots while checking DOM sequence monotonicity, delays a real reconnect handshake until connection guidance/disabled choices are observed, reloads an active question and freezes an observer until the server advances. It requires every recovery flag and identical three-client final placements. No action window is extended and no browser clock fakes the server. Its trusted fixture uses six turns with normal 10/15-second windows, three-second review and 80 ms simulated round trip; production retains 36 turns. The separate real-socket suite reaches an occupied duel through legal claims and verifies accepted-answer recovery/duplicates/rejections at 160 ms round trip, deadline expiry during a disconnect, and a normal shutdown abort with the latency shim disabled for that drain-delivery case.

Inspected reconnect/manual-retry screenshots at 1440×1000, 412×839 CSS-pixel portrait and 740×360 reduced-motion landscape. Arabic guidance, disabled choices and the gold keyboard focus ring remain readable; landscape scrolls within the native dialog. All scanned lobby/question/result/closed-modal states reported zero axe violations, no horizontal page overflow and no browser page errors. Automated QA does not establish full WCAG compliance or physical-device/browser-family performance.

An initial focused run failed after the gameplay/result assertions. Its trace located a long stall in axe’s helper-page creation following freeze/resume, before the final capture. The driver now closes finished guest contexts, foregrounds the surviving page and captures the result section before cleanup. The standard axe scan and all gameplay assertions remain enabled; the corrected focused run and full run passed. This failed run is not counted as passing evidence. Historical first-slice and queue measurements remain in M3_PRIVATE_ROOMS.md and M3_MATCHMAKING.md.

The final development smoke ran `PORT=3113 GAME_SERVER_PORT=2572 GAME_SERVER_URL=http://127.0.0.1:2572 pnpm dev`. Both services became ready, all three library watchers reported zero errors, and `/online` plus `/health` returned HTTP 200. The page had Arabic RTL and the configured game endpoint; health reported protocol 2. The preview remains available at `http://127.0.0.1:3113/online` with normal production-default rules. Nothing was deployed or pushed.

## Five concepts to learn

1. `online-session.ts`: a live socket is only transport; a fresh authoritative snapshot makes it safe to issue the next intent.
2. The sync nonce ties a clock reply to this connection attempt. Sequence and server time reject older data without trusting a browser clock.
3. `pendingAnswer` is presentation, while `ownChoiceId` confirms server acceptance. Neither declares correctness or ownership.
4. `resilience.test.ts`: socket tests use public state/commands to reach an occupied duel and exercise recovery through the real boundary.
5. `socket-faults.ts`: the browser test proxy delays/drops/replays real frames. It never invents players, answers or results.

Exercise: answer once, reload, then compare the locked choice and original deadline across all tabs. Read the identity-free command schema and the server's session-to-seat binding to explain why reloading cannot become a fourth player.

## Remaining release work

There is no latency compensation or production fairness claim: correct speed duels still use server receipt order. No durable crash recovery, account ownership, reviewed confidential question bank, physical-device performance or capacity/public-hosting guarantee is added. Persistence/content/identity belong to M4; public hosting/abuse budgets and release operations remain later milestones. Network coverage is limited to the explicitly measured local fault scenarios, not all packet loss or browser families.
