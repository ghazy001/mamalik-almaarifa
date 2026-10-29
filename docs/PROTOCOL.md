# Protocol v1 — schemas implemented, room transport deferred

`packages/shared` is the canonical wire contract. Every object is strict: unknown fields are rejected rather than silently trusted. IDs use 1–64 ASCII letters, digits, underscores or hyphens; they are opaque identifiers, not authorization credentials. Display names remain Arabic-capable strings rendered as text, never HTML.

## Player commands

All commands carry `protocolVersion: 1`, `matchId`, `turn` (0 in the lobby, 1–120 in play), `idempotencyKey`, and `type`.

| Type              | Additional fields    | Rule permission                                                           |
| ----------------- | -------------------- | ------------------------------------------------------------------------- |
| READY             | none                 | Lobby, living seat, once                                                  |
| SELECT_TARGET     | targetId             | Active seat, selection phase, adjacent non-owned target                   |
| SUBMIT_ANSWER     | questionId, choiceId | Current duel participant, current question, before deadline, first answer |
| REQUEST_RECONNECT | none                 | Schema reserved; adapter returns NOT_IMPLEMENTED in M1                    |

The actor, authenticated session and receipt time are derived from future transport. They are **not accepted JSON fields**. Client timestamps, declared correctness, conquest outcomes, server lifecycle actions and identity injection fail schema validation.

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

The server will supply the next private question fixture and a monotonic time through core context; clients cannot select a question or seed. An idempotency key is scoped by match and actor. Exact accepted retries return success with no new mutation; changed content under the same key returns DUPLICATE_ACTION. A stale new command returns STALE_TURN. Rejections never record a key. The room must acknowledge retries without broadcasting duplicate effects.

## Public state and server events

All events carry protocol version, match ID, turn and a monotonic event `sequence`. M3 must generate sequences and reconnect snapshots; M1 only defines and validates these schemas.

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

Deadlines are in server match-relative monotonic milliseconds. M3 must deliver a clock-offset/display strategy to clients; browser countdowns are advisory and the reducer remains authoritative. Windows are half-open: a receipt at the deadline is late. The server may resolve early only after all participants answered. The schemas are structural; phase/identity/adjacency/question semantics are checked by game-core.

## Errors and future operational work

Error codes: INVALID_PHASE, INVALID_ACTOR, WRONG_MATCH, STALE_TURN, ILLEGAL_TARGET, DEADLINE_EXPIRED, TOO_EARLY, ALREADY_ANSWERED, INVALID_ANSWER, INVALID_QUESTION, DUPLICATE_ACTION, INVALID_TIME, INVALID_INPUT, MALFORMED_COMMAND, UNSUPPORTED_VERSION, NOT_IMPLEMENTED.

Do not send internal exception stacks or secret question content in errors. Log lifecycle/error codes and safe match identifiers only. Before opening rooms in M3: add authenticated seats/invites, bounded input rate, reconnect grace, recipient-scoped acknowledgments, offset sampling, sequence recovery, graceful room draining and latency/disconnection tests. M1 does not expose command routes, durable sessions or matchmaking.
