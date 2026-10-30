# Protocol v2 — guest rooms and basic matchmaking

`packages/shared` is the canonical wire contract. Every object is strict: unknown fields are rejected rather than silently trusted. Domain IDs use 1–64 ASCII letters, digits, underscores or hyphens; they do not authenticate a player. A private invitation is the server-generated 16-hex-character room ID and admits a guest to an available seat. A separate SDK reconnection token is a bearer credential and must never be broadcast. Display names remain Arabic-capable strings rendered as text, never HTML.

Version 2 requires `mode` and `readyDeadline` in snapshots, so v1 is deliberately unsupported. Commands/events also carry the new version; rebuild/restart both services and reload clients together. The per-tab recovery storage key is `mamalik.room.v2`. There is no migration of live v1 rooms or tokens. Domain `rulesVersion` remains **1**.

## Player commands

All commands carry `protocolVersion: 2`, `matchId`, `turn` (0 in the lobby, 1–120 in play), `idempotencyKey`, and `type`.

| Type              | Additional fields    | Rule permission                                                           |
| ----------------- | -------------------- | ------------------------------------------------------------------------- |
| READY             | none                 | Lobby, living seat, once                                                  |
| SELECT_TARGET     | targetId             | Active seat, selection phase, adjacent non-owned target                   |
| SUBMIT_ANSWER     | questionId, choiceId | Current duel participant, current question, before deadline, first answer |
| REQUEST_RECONNECT | none                 | Reserved; returns NOT_IMPLEMENTED; SDK token handles reconnect            |

The actor, guest session and receipt time are derived from the trusted Colyseus transport. The server maps its session ID to a canonical seat; guest identity is not an authenticated account. They are **not accepted JSON fields**. Client timestamps, declared correctness, conquest outcomes, server lifecycle actions and identity injection fail schema validation.

```json
{
  "protocolVersion": 2,
  "type": "SELECT_TARGET",
  "matchId": "m_demo",
  "turn": 1,
  "idempotencyKey": "selection_1",
  "targetId": "t_01"
}
```

The server supplies the next private question fixture and a monotonic time through core context; clients cannot select a question or seed. An idempotency key is scoped by match and actor. Exact accepted retries return success with no new mutation; changed content under the same key returns DUPLICATE_ACTION. A stale new command returns STALE_TURN. Rejections never record a key. The room acknowledges answer retries and returns a fresh public snapshot without repeating a capture. Client retries use the same command/key; reconnect does not resend old buffered actions.

## Public state and server events

The `kingdom` and `kingdom_queue` Colyseus room types use explicit message channels rather than synchronizing a private state tree:

| Channel    | Direction          | Validated payload                                             |
| ---------- | ------------------ | ------------------------------------------------------------- |
| `command`  | client → server    | Existing versioned intention below                            |
| `sync`     | client → server    | `{nonce}` only; asks for a new full snapshot and clock sample |
| `snapshot` | server → recipient | `roomSnapshotSchema`, described below                         |
| `clock`    | server → recipient | `{nonce, serverNow}` for a known outstanding probe            |
| `event`    | server → recipient | `ANSWER_ACKNOWLEDGED` or `COMMAND_REJECTED`                   |

SDK create/join options are exactly `{name}`. Names are trimmed, nonempty, at most 40 characters, and reject angle brackets/control characters. Join options cannot contain seat IDs, seed, rules or timing overrides. Room creation uses `client.create('kingdom', options)`; invitation join uses `joinById(code, options)`. Basic matchmaking uses `joinOrCreate('kingdom_queue', options)` and the fullest available public queue room first. Private `kingdom` rooms are excluded from that lookup. A full/prepared room locks further joins. The room type selects a trusted server mode; join options cannot override it. No MMR, global waiting count, bots or custom queue endpoint is implemented.

A recipient snapshot carries protocol version 2, increasing `sequence`, room ID, `mode` (`private` or `matchmaking`), nullable `readyDeadline`, recipient player ID, room-relative `serverNow`, `closed`, occupied seats/connection status, nullable public match state, server-computed legal target IDs and standings, public rule windows/turn limit, recipient `ownChoiceId`, and nullable resolved question/explanation/source. State is null while fewer than three seats have joined. No placeholder opponents act. After the third seat joins, the core match exists and each player may READY. Other players never receive that recipient's choice. Live questions exclude correctness; only resolved state has an outcome/reveal. The reused development bank remains public through the offline route/source and is not confidential production content.

Complete snapshots replace prior state. Clients reject lower/equal sequence snapshots for the same room; sequence gaps are normal because messages are recipient-specific and complete. Reconnect and five-second sync probes send a full fresh snapshot rather than replaying deltas. Event sequences identify the current view; they are not a gap-free event log.

The table below lists the event shapes, unchanged apart from the v2 envelope. In this slice only answer acknowledgements and errors are sent on `event`; phase/territory/result changes arrive inside `snapshot`. Granular broadcast events remain reserved, not additionally emitted.

| Event               | Payload                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| ROOM_UPDATED        | state: allowlisted public snapshot                                                |
| TURN_STARTED        | activePlayerId, deadline                                                          |
| QUESTION_PRESENTED  | question: ID, text, exactly four choices, deadline, target, attacker/defender IDs |
| ANSWER_ACKNOWLEDGED | idempotencyKey; private recipient, no correctness                                 |
| DUEL_RESOLVED       | outcome including revealed correctChoiceId                                        |
| TERRITORY_UPDATED   | territoryId, ownerId (nullable)                                                   |
| MATCH_FINISHED      | reason, winners, three ranked placements                                          |
| COMMAND_REJECTED    | idempotencyKey, stable error code                                                 |

Snapshots contain players/readiness/elimination, territory owners/castle flags, phase/turn/active player, selection deadline, nullable public question, resolved outcome and result. They exclude deck order, accepted-command ledger, submitted answers and receipt times. `publicView` constructs new allowlisted objects, and the server's `snapshot` validates them against strict Zod schemas. Never spread/serialize a private MatchState into Colyseus synchronized state. No current question carries a correct choice; only RESOLUTION/FINISHED outcomes reveal it.

Deadlines are in server match-relative monotonic milliseconds. Nonce-correlated probes estimate room time as the server sample plus half the measured round trip. The client favors its minimum-RTT offset sample for display, refreshes samples every five seconds and resets estimation on reconnect; browser countdowns are advisory and the reducer remains authoritative. Windows are half-open: a receipt at the deadline is late. The server may resolve early only after all participants answered. The schemas are structural; phase/identity/adjacency/question semantics are checked by game-core.

## Errors and future operational work

Error codes: INVALID_PHASE, INVALID_ACTOR, WRONG_MATCH, STALE_TURN, ILLEGAL_TARGET, DEADLINE_EXPIRED, TOO_EARLY, ALREADY_ANSWERED, INVALID_ANSWER, INVALID_QUESTION, DUPLICATE_ACTION, INVALID_TIME, INVALID_INPUT, MALFORMED_COMMAND, UNSUPPORTED_VERSION, NOT_IMPLEMENTED, RATE_LIMITED, ROOM_CLOSED.

Do not send internal exception stacks or secret question content in errors. Log lifecycle/error codes and safe match identifiers only. Both room modes bound incoming frames to 4096 bytes, allow 12 application messages/second/client and use a Colyseus ceiling of 30 messages/second/client. Unprepared lobbies expire five minutes after room creation; a prepared queue lobby has a 60-second readiness deadline and aborts without a winner if not everyone is ready; each room has a 25-minute maximum lifetime. Server-injected test settings never come from join messages. Guest seats, invites, recipient acknowledgements, full-snapshot recovery, graceful abort and reconnect tests are implemented. Public deployment still needs explicit origin/connection/HTTP-create budgets and broader abuse/load review.

Unexpected disconnect calls SDK `allowReconnection` for 30 seconds. Timers continue and unanswered challenges still expire. Manual reload recovery uses the per-tab token; explicit leave or failed grace forfeits. A prepared lobby aborts on permanent departure. No durable result or crash recovery is provided. Server receipt ordering still favors lower latency; no compensation is claimed. Account-bound room identity and database-backed room question decks remain later work. A queue search can be cancelled before a match is prepared: consented SDK leave releases that seat. A late asynchronous join after cancellation is also explicitly left; it cannot replace a newer search. Navigation/unmount remains a recoverable drop. Prepared lobbies abort on permanent departure rather than replacing a participant in an existing core state. See ADR 0005 and M3_MATCHMAKING.md.

## Recovered client state (v2 unchanged)

Automatic recovery does not immediately enable intents when the socket reopens. Outstanding pre-drop clock probes are discarded. The client acknowledges the SDK handshake, saves its rotated per-tab token, sends a fresh nonce probe and requires a newer full snapshot whose server time is at least the correlated clock sample. The sync channel already sends clock before its requested snapshot, so no new wire field or command is needed. An earlier buffered snapshot cannot resume controls. Reload/manual retry begins a new adapter generation and waits for its first validated snapshot.

Rejections only affect the current match/turn at a sequence not older than the displayed snapshot. Only a rejection of the current answer key clears pending answer presentation; an old selection rejection cannot unlock a newer choice. Answer acknowledgement can request a missing full snapshot, but never declares correctness. Visibility/page-show/resume/online events refresh state with bounded/coalesced probes, and periodic sync remains available. Display clock estimates remain monotonic; the server still uses its own receipt times. SDK retry failure offers manual token recovery if server grace remains. An explicit offline leave cannot notify an unreachable server and relies on grace expiry. See ADR 0006 and M3_RESILIENCE.md.

## M4 content API boundary

The opt-in bearer-authenticated `/admin` HTTP API is separate from gameplay Protocol v2. Supabase verification and private PostgreSQL content roles protect admin reads/writes; editor/reviewer/publisher metadata is never accepted from game commands, profiles or room join options. Authorized revision reads include answers for editorial review, while guest room snapshots retain their existing sanitized projection. No account ID, role, token, content ledger or database credential enters the gameplay wire format. See M4_IDENTITY_AUTH.md for HTTP commands, idempotency headers, errors and configuration. Room account identity and durable match results are still future work.

### Web portal HTTP boundary

The Next.js origin exposes POST `/api/auth/signin` with strict `{email,password}` and POST `/api/auth/signout` with local-session scope. Success responses contain only `signedIn`/`signedOut`; tokens are HttpOnly cookies. GET `/api/content?view=me`, `?view=list&offset=0`, and `?view=detail&id=<uuid>&revision=<positive-int>` map to fixed protected game-service routes. POST `/api/content` accepts the existing strict content commands and requires `Idempotency-Key` (1–64 ASCII letters/digits/underscore/hyphen). No actor or arbitrary upstream URL is accepted. Listing uses 25 revisions per page. Authorized editorial detail responses include correct answers by design; gameplay snapshots do not.

All cookie-authenticated POSTs require JSON and an Origin exactly equal to `WEB_AUTH_ORIGIN`; cross-site Fetch Metadata is denied. Bodies are bounded to 2 KiB for sign-in and 16 KiB for commands. Sign-in allows 30 attempts/minute and four concurrent requests per process; the game service retains its default 60 content requests/IP/minute and eight concurrent requests. These are local bounds, not a distributed abuse-control claim. Missing configuration disables the portal. Errors are generic stable codes; neither provider details nor tokens appear in response bodies. The complete contract, session and retry limits are documented in M4_EDITORIAL_UI.md. Gameplay Protocol v2 / Rules v1 are unchanged.
