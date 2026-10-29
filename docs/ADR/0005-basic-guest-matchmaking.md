# ADR 0005 — Basic guest matchmaking through shared room authority

Status: implemented for the second M3 slice. Protocol **2**, domain rules **1**.

## Decision

Register public `kingdom_queue` alongside private `kingdom`. Both use the same `kingdomRoom` factory and `createServerMatch` authority. The trusted server definition supplies mode, not client join options. Keep join payloads exactly `{name}`. Clients use Colyseus `joinOrCreate` for the queue, sorted by occupied clients descending to fill a room before creating more. Installed Colyseus 0.18.23 source (`MatchMaker.ts`, `RegisteredHandler.ts`) supplies public/unlocked room filtering, concurrent creation locking, reservation retries and capacity accounting. This increment uses the existing local driver/presence and does not add infrastructure.

There is no skill ranking, promised global FIFO, bot filling, estimated wait or fake global player count. The UI displays the room's actual reserved seats and individual connection status. Private rooms never enter queue lookup. A prepared/full room locks; a new search cannot join it. Canonical seat assignment and seeded turn/question order remain unchanged. A queued room's ID still exists in snapshots for recovery, but the UI offers invitations only for private rooms; direct SDK joins by a known queue ID are not an authorization boundary.

Keep explicit READY instead of starting a match when an unattended tab happens to fill it. When a queue reaches three seats, start a room-relative 60-second readiness deadline. If everyone has not readied before it, abort without a winner and leave return/search to the user. Check this deadline before commands as well as on the room clock; late READY cannot revive a cancelled lobby. Clear the deadline when play starts or the match aborts. Private invitation readiness retains its existing behavior. Existing five-minute incomplete-room and 25-minute hard lifetime bounds still apply.

Before a core match is prepared, consented cancellation releases the seat for another guest. After preparation, the roster is immutable: permanent departure aborts an unstarted match; active-match departure forfeits. Unexpected drops/reloads retain the same 30-second recovery policy in either mode. Readiness may expire during that grace. Do not replace a participant inside a prepared core state or automatically requeue someone into another match.

Client connection attempts have generations. Explicit cancellation records which attempts must consentedly leave, including sockets whose async join completes later. A new attempt cannot be overwritten by an older completion. Component unmount/navigation remains a recoverable drop, not implicit forfeit. Consume Colyseus's expected rejected recovery promise when a socket drops before its join handshake completes; framework onLeave still releases that unfinished seat.

Required `mode` and nullable `readyDeadline` change the strict snapshot shape, so bump the entire wire envelope to v2 and use the constant for commands, events and health. Reject v1 rather than silently interpreting missing fields. Rebuild/restart both services and reload clients together; live v1 rooms/tokens are not migrated. Per-tab recovery storage becomes `mamalik.room.v2`. Rules/scoring remain v1.

## Consequences and limits

This is basic single-process guest matchmaking using the existing authoritative match flow. No account ownership, persistence, public hosting, MMR, load-capacity claim or latency compensation is added. Creation/connection/origin abuse budgets, adverse-network recovery and fairness measurement remain follow-up work. Queue readiness duration is a reversible lobby default to playtest, not a competitive rule change. See M3_MATCHMAKING.md for exact verification and the owner exercise.
