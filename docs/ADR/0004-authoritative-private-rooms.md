# ADR 0004 — Authoritative guest rooms before matchmaking

Status: implemented as the first M3 slice. Domain rules and wire command version remain 1.

## Decision

Register a private Colyseus `kingdom` room with three transport-assigned guest seats. A cryptographically generated 16-hex-character room ID doubles as its private invitation code. Possession of the code permits joining an available seat; it is not an account identity. The server binds the Colyseus session ID to one canonical player ID and never accepts a player ID, seed, rule override or timestamp in join/command JSON. Names are strict, trimmed Arabic-capable text. Supabase identity remains M4.

Use explicit validated message snapshots rather than synchronizing a private game-core state tree through Schema. Each recipient gets public state, server-computed legal targets/standings, their own selected choice, connected seats, public rules, a monotonically increasing sequence and server time. Complete snapshots tolerate sequence gaps and replace missed messages; clients discard older snapshots. Only resolved snapshots carry answer explanations/correct choices. The existing `event` channel sends recipient-scoped answer acknowledgements and errors; granular broadcast event types remain reserved.

`match-session.ts` owns pure-rule orchestration. Node supplies room-relative `performance.now()` at receipt. Synchronous handlers serialize commands; no await occurs between validation, reduction and state replacement. A 50 ms room clock processes deadlines, early resolution and three-second result review. It also checks due work before processing an incoming command. New turns start at processing time, so a stalled event loop does not consume future turns by backdating their windows. Browser clocks only estimate display time through nonce-correlated round-trip samples. Lower-latency receipts still have an advantage; no compensation policy or rule-version change is introduced.

Use Colyseus 0.18.8 SDK with the installed server 0.18.23. Unexpected drops reserve the same seat for 30 seconds; question/turn timers continue. Automatic reconnect keeps listeners; manual reload recovery uses the per-tab sessionStorage reconnection token. The token is a bearer capability and is never broadcast or included in invite links. Messages are not queued while disconnected. Only explicit leave or grace expiry forfeits; leaving a three-seat lobby aborts its prepared match. Reload is not an explicit surrender. Incomplete lobbies can reuse vacated seats; a prepared match locks further joins. Room state is lost on process failure. Graceful shutdown broadcasts an abort before closing; it cannot recover a crash.

Bound messages to 4096 bytes and 12 application messages/second per client, with a transport ceiling of 30. Invalid commands do not enter the accepted-action ledger. Unprepared lobbies expire after five minutes; every room has a 25-minute lifetime ceiling. These bounds are development safeguards, not a public-internet abuse/load assessment.

The existing 36 authored development fixtures move to `packages/question-fixtures` so server and offline demo share the same version without importing another app's source. The online route must never import this pack, including via Next prefetch. Browser verification inspects loaded scripts as well as wire snapshots. The pack is still deliberately public through `/play` and the repository; it is not a protected competitive question bank. M4 must replace it with reviewed server-only content.

`/online` reads `GAME_SERVER_URL` at request time and passes the public endpoint to its client adapter. This permits isolated browser-test services and local previews without rebuilding or baking a test endpoint into a bundle. It is a dynamic Next route; the offline routes stay static. Domain decisions remain on the game service. The Phaser map and native quiz dialog accept public presentation data only.

## Limits and follow-up

This slice proves invited guests can play a real match. Public/basic matchmaking, production identity, hosted origin/rate/connection budgets, packet-loss and broader browser/device validation remain further work. No Redis, database, payment, deployment or production readiness is implied. See M3_PRIVATE_ROOMS.md for manual use and measured checks.

API references: [Colyseus reconnection](https://docs.colyseus.io/room/reconnection), [SDK connection lifecycle](https://docs.colyseus.io/sdk/connection). The installed TypeScript declarations/source are authoritative for the selected versions.
