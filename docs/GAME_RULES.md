# Rules v1 — M1 reversible defaults

Status: implemented headless rules, M2 local simulation and M3 private/queued three-guest rooms. These defaults are for playtesting, not a claim of balance. Rule snapshot version: `1`.

M2 uses the same domain rules. Its local controller supplies simulated authoritative time and question context in the browser; answers are therefore inspectable. UI-only Continue holds human result review and starts the next turn at the actual continuation time. This is a local presentation/scheduling policy, not a new network command. Bot selection/answer policies are documented in ADR 0003; online authority now lives in the M3 game rooms; latency fairness remains a documented limit.

## Setup and map

Exactly three distinct players occupy castles `t_00`, `t_05`, `t_10` in input seat order. The 15-node graph is a ring plus a triangle between `t_02`, `t_07`, `t_12`. Rotating IDs by five preserves every edge. Each castle has equal degree and equal shortest distances to the others. All other territories start neutral. No configurable external topology is accepted by the engine; the exported validator checks map fixtures.

An explicit unsigned 32-bit seed drives a specified xorshift32 Fisher–Yates shuffle of turn order and question ID order. Zero maps to seed 1. Seat/castle allocation stays fixed. A future server must assign seats without letting users choose a favorable seed. No random globals or clock reads occur in the core.

## Phases and turns

`LOBBY → SETUP → ATTACK_SELECTION → DUEL → RESOLUTION → ATTACK_SELECTION … → FINISHED`.

Every player must READY before SETUP; server BEGIN starts turn 1. Expansion is a neutral-target battle kind, rather than a separate phase. Each player gets one action in cyclic seeded order; eliminated players are skipped. Attack selection lasts 10 seconds by default. Only the active player can select a non-owned territory adjacent to any territory they own. It may be neutral or occupied; there is no compulsory expansion sub-round. The source territory stays owned and connected empires are not required.

Selection at or after its deadline is rejected. Server ADVANCE at/after selection deadline consumes a turn; an active player with no legal targets may be advanced immediately. There is no client pass command. The default limit is 36 total consumed turns (not rounds), configurable to 1–120. Every resolved battle or skipped selection consumes one turn. RESOLUTION is explicit; the server advances it separately. Timers begin at the supplied server time for the new phase, never from an old expired deadline.

## Questions and answer authority

A selected target receives the next unused ID from the seeded deck. A match requires at least `maxTurns` unique question IDs; exhausted/reused/wrong IDs are rejected. The trusted caller provides the corresponding question and four distinct choices and one valid correct choice. Fixtures are synthetic, not a reviewed content bank. Both players see the same question. A neutral claim has only the attacker; an occupied duel has attacker and current owner as defender.

The default answer window is 15 seconds. A choice is valid only from a participant, for the current question/turn, received in `[openedAt, deadline)`. Only the first answer per participant counts; a second idempotency key cannot replace it. `now` is finite, nonnegative and monotonic, supplied by a trusted caller. Client time is never accepted. Server RESOLVE requires all participants answered or `now >= deadline`; missing answers are incorrect. Correct answers are never projected before resolution, and submissions are never projected, even after resolution.

Correct beats incorrect. If both are correct, the earlier server receipt wins. Exact equal receipt times favor the defender. Neither correct means the defender keeps the territory; on neutral ground it stays neutral. There is **no latency compensation** in Rules v1 (including the current online rooms): server receipt timing favors lower latency. This is a documented fairness limitation; Before public competitive use, measure latency and review a bounded fairness policy. Tests cover equality and deadline ordering; this is not proof of network fairness.

## Captures, elimination and results

A winning attacker takes the target. Capturing the defender's **original home castle** eliminates that defender and transfers all their territories to the attacker. Capturing an already conquered castle only transfers that territory. Elimination is permanent. Owning all three castles wins immediately; a sole surviving player also wins. On the turn limit, survivors rank by score (normal territory 1, castle 3), then castle count, then territory count; an exact tie produces joint winners. Eliminated players follow survivors in placements, tied by the same score tuple. There is no arbitrary player-ID tie breaker.

Server FORFEIT neutralizes all of that player's lands and eliminates them. During an active duel it cancels the duel into RESOLUTION (including when the forfeiter is an uninvolved third player); it does not award an unearned capture. If the active player forfeits during selection, that turn is consumed by entering RESOLUTION. Two forfeits leave a sole survivor. A lobby/setup forfeit aborts the unstarted match. Server ABORT produces an aborted result with no winners. Commands cannot alter a finished match.

## Idempotency, disconnect and operational policy

Every player action has a stable match ID, turn number, actor derived from transport and an idempotency key. An exact retry is a successful no-op, including after turn progression or finish. Reusing that actor/key with different content is rejected. Invalid actions return the original state; successful actions copy it. The accepted action ledger is retained for the bounded match lifetime (at most three READY actions plus three actions per turn); rejected spam is not retained. Server lifecycle actions are not exposed as network commands.

M3 guest-room policy: reserve a disconnected seat for 30 seconds; timers continue, so missed answers/timeouts still apply; server forfeits on grace expiry. Reconnect only restores a transport-derived identity and sanitized snapshot, never a new seat or a client clock. This is implemented in both room modes via Colyseus session-bound guest identity and bearer reconnection tokens. Explicit departure received by the server forfeits immediately; leaving while offline stops retries locally and the unreachable seat remains reserved until grace expiry; grace expiry forfeits only after the reservation expires. Timers continue. A prepared three-seat lobby aborts on permanent departure; an incomplete lobby can reuse a vacated seat. Network result review lasts three seconds and advances automatically. Server shutdown reports an abort; process loss cannot recover an in-memory match. No durable result promise is made. See M3_PRIVATE_ROOMS.md for message bounds, room expiry and content/security limits.

Basic matchmaking fills the fullest available public `kingdom_queue` room before creating another, with no skill ranking or promise of global FIFO. Private invite rooms are excluded. Join order assigns seats/castles; server randomness assigns turn order. Before three seats join, cancellation frees the seat for replacement and readiness is unavailable. After the third joins, the match roster locks. The queue has a server-controlled 60-second readiness deadline from preparation: all three must READY before it, otherwise ABORT produces no winners. The displayed countdown is advisory. Private rooms retain manual readiness without this queue deadline; both modes retain the room lifetime ceiling. Dropped seats retain the existing 30-second grace; a prepared lobby may therefore abort before grace ends if readiness expires. Return/search again is explicit; no automatic requeue. These are reversible lobby policies, not changes to Rules v1 scoring or duels. See ADR 0005 and M3_MATCHMAKING.md.

Client recovery cannot reset a question deadline or replace an accepted answer. Controls resume only after a fresh server view, including the same seat’s own accepted choice. Missed questions remain resolved and late commands are rejected. Browser suspension changes presentation scheduling only; the persistent room keeps time. Wire/error recovery mechanics are documented in ADR 0006 and M3_RESILIENCE.md.

## Decisions still requiring evidence

- Validate 36 turns and 10/15-second timers against the target 10–15 minutes.
- Playtest castle transfer snowballing, first-player advantage and map routing.
- Review shared victory vs a sudden-death format before ranked competition exists.
- Before release, review measured latency fairness, playtest reconnect grace and assess deployment draining under broader conditions than the local M3 validation.
- Review and source the real question bank in M4; no repeated IDs per match in v1.

Changing any of these product rules requires a reviewed rule version update and tests.
