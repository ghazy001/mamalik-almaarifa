# ADR 0006 — Fresh server state before recovered intents

Status: implemented for M3 network resilience. Wire protocol remains **2**, gameplay rules **1**.

## Decision

Keep the existing server-controlled timers and 30-second guest reservation. Recovery never pauses a question, extends its deadline, replaces an accepted answer, changes a receipt timestamp or replays buffered player commands. Do not introduce latency compensation as an implementation detail; it remains a separate gameplay/fairness decision before competitive release.

The client disables intents after a transport drop. Clear outstanding clock probes and pending local answer presentation, but retain the latest public view for orientation. Ignore incoming snapshots until automatic reconnection has completed a fresh nonce-correlated sync. The room sends the correlated clock before the requested full snapshot; require a snapshot timestamp at or after that clock and a newer sequence before enabling controls. This rejects a pre-drop buffered view without changing the wire format. Manual reload/retry creates a new adapter generation and waits for its first validated full snapshot.

Colyseus SDK 0.18.8 invokes onReconnect before its finally block rotates the reconnection token and sends JOIN_ROOM acknowledgement. Defer token storage and sync to a guarded microtask after that block. Never save an old token over the new one, send a sync before acknowledgement, or let a late callback revive an explicitly left room. The installed SDK source is the authority for this pinned lifecycle; regression tests exercise that ordering.

Only apply rejection events matching the current match/turn and at least the displayed snapshot sequence. Only an answer rejection with the current answer key may clear its pending answer. A late selection rejection must not unlock a newer answer. Prevent a second pending/acknowledged answer locally; the server's first-answer/idempotency checks remain authoritative. If an answer acknowledgement arrives without its snapshot, request full state rather than inferring an outcome.

Refresh full state on visibility return, page show, Chromium resume and the browser online event. Coalesce refresh probes to at most one per 250 ms, with a trailing probe so a wake request is not lost, and retain the five-second periodic sync fallback. Cancel scheduled refreshes on drop, unmount or explicit leave. Resample advisory clock offset after waking; display time never moves backward within a room. No browser timestamp participates in duel adjudication.

Show connection guidance inside the Arabic native question dialog while choices are disabled. A closed transport offers an explicit restore action without first discarding its per-tab token. The server may already have expired the reservation, so the UI does not promise successful recovery. Explicitly leaving while offline stops local retries and discards the token; the server can only release/forfeit the unreachable seat after its grace expires.

## Verification boundaries

Real socket tests cover an occupied duel with an accepted answer, same-seat recovery with an unchanged deadline, rejected replacement/spectator answers, expiry during disconnection and graceful shutdown abort. Browser tests proxy actual WebSocket frames to suppress snapshots, duplicate an intent, replay stale snapshots and delay a reconnect handshake. They also reload an active question and freeze/resume an observer across a server turn. No test controller can select a server seed/rule through client options, mutate ownership or fabricate a game result.

Frame suppression/reordering is deliberate application-level fault injection. WebSockets run over ordered reliable transport; these tests are not physical packet-loss, bandwidth, device-performance or public-internet certification. Guest identity, in-memory state, public development fixtures and server-receipt latency advantage remain documented limits. See M3_RESILIENCE.md for measured results and reproduction.

Test API references: [Playwright WebSocket interception](https://playwright.dev/docs/api/class-websocketroute), [Chromium lifecycle freezing](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-setWebLifecycleState). These are test tools only; production gameplay has no fault-injection endpoint.
