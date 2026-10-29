# Protocol v1 — private Colyseus room transport

`packages/shared` is the canonical wire contract. Every object is strict: unknown fields are rejected rather than silently trusted. Domain IDs use 1–64 ASCII letters, digits, underscores or hyphens; they do not authenticate a player. A private invitation is the server-generated 16-hex-character room ID and admits a guest to an available seat. A separate SDK reconnection token is a bearer credential and must never be broadcast. Display names remain Arabic-capable strings rendered as text, never HTML.

## Player commands

All commands carry `protocolVersion: 1`, `matchId`, `turn` (0 in the lobby, 1–120 in play), `idempotencyKey`, and `type`.

| Type              | Additional fields    | Rule permission                                                           |
| ----------------- | -------------------- | ------------------------------------------------------------------------- |
| READY             | none                 | Lobby, living seat, once                                                  |
| SELECT_TARGET     | targetId             | Active seat, selection phase, adjacent non-owned target                   |
| SUBMIT_ANSWER     | questionId, choiceId | Current duel participant, current question, before deadline, first answer |
| REQUEST_RECONNECT | none                 | Reserved; returns NOT_IMPLEMENTED; SDK token handles reconnect            |

The actor, guest session and receipt time are derived from the trusted Colyseus transport. The server maps its session ID to a canonical seat; guest identity is not an authenticated account. They are **not accepted JSON fields**. Client timestamps, declared correctness, conquest outcomes, server lifecycle actions and identity injection fail schema validation.

```json
{
  "protocolVersion": 1,
  "type": "SELECT_TARGET",
  "matchId": "m_demo",
  "turn": 1,
  "idempotencyKey": "selection_1",
  "targetId": "t_01"
}
```

The server supplies the next private question fixture and a monotonic time through core context; clients cannot select a question or seed. An idempotency key is scoped by match and actor. Exact accepted retries return success with no new mutation; changed content under the same key returns DUPLICATE_ACTION. A stale new command returns STALE_TURN. Rejections never record a key. The room acknowledges answer retries and returns a fresh public snapshot without repeating a capture. Client retries use the same command/key; reconnect does not resend old buffered actions.

## Public state and server events

The `kingdom` Colyseus room uses explicit message channels rather than synchronizing a private state tree:

| Channel    | Direction          | Validated payload                                             |
| ---------- | ------------------ | ------------------------------------------------------------- |
| `command`  | client → server    | Existing versioned intention below                            |
| `sync`     | client → server    | `{nonce}` only; asks for a new full snapshot and clock sample |
| `snapshot` | server → recipient | `roomSnapshotSchema`, described below                         |
| `clock`    | server → recipient | `{nonce, serverNow}` for a known outstanding probe            |
| `event`    | server → recipient | `ANSWER_ACKNOWLEDGED` or `COMMAND_REJECTED`                   |

SDK create/join options are exactly `{name}`. Names are trimmed, nonempty, at most 40 characters, and reject angle brackets/control characters. Join options cannot contain seat IDs, seed, rules or timing overrides. Room creation uses `client.create('kingdom', options)`; invitation join uses `joinById(code, options)`. Discovery/public matchmaking is not exposed by this application.

A recipient snapshot carries protocol version 1, increasing `sequence`, room ID, recipient player ID, room-relative `serverNow`, `closed`, occupied seats/connection status, nullable public match state, server-computed legal target IDs and standings, public rule windows/turn limit, recipient `ownChoiceId`, and nullable resolved question/explanation/source. State is null while fewer than three seats have joined. No placeholder opponents act. After the third seat joins, the core match exists and each player may READY. Other players never receive that recipient's choice. Live questions exclude correctness; only resolved state has an outcome/reveal. The reused development bank remains public through the offline route/source and is not confidential production content.

Complete snapshots replace prior state. Clients reject lower/equal sequence snapshots for the same room; sequence gaps are normal because messages are recipient-specific and complete. Reconnect and five-second sync probes send a full fresh snapshot rather than replaying deltas. Event sequences identify the current view; they are not a gap-free event log.

The table below lists the original v1 event schemas. In this slice only answer acknowledgements and errors are sent on `event`; phase/territory/result changes arrive inside `snapshot`. Granular broadcast events remain reserved, not additionally emitted.

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

Do not send internal exception stacks or secret question content in errors. Log lifecycle/error codes and safe match identifiers only. The private slice bounds incoming frames to 4096 bytes, allows 12 application messages/second/client and uses a Colyseus ceiling of 30 messages/second/client. Unprepared lobbies expire after five minutes; each room has a 25-minute maximum lifetime. Server-injected test settings never come from join messages. Guest seats, invites, recipient acknowledgements, full-snapshot recovery, graceful abort and reconnect tests are implemented. Public deployment still needs explicit origin/connection/HTTP-create budgets and broader abuse/load review.

Unexpected disconnect calls SDK `allowReconnection` for 30 seconds. Timers continue and unanswered challenges still expire. Manual reload recovery uses the per-tab token; explicit leave or failed grace forfeits. A prepared lobby aborts on permanent departure. No durable result or crash recovery is provided. Server receipt ordering still favors lower latency; no compensation is claimed. Basic matchmaking, accounts and content persistence remain later work. See ADR 0004 and M3_PRIVATE_ROOMS.md.
