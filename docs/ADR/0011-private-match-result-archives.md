# ADR 0011 — Private immutable match-result archives

Status: accepted for the M4 local increment, 2026-10-30.

Finished rooms previously retained results only in memory. We need a durable outcome before adding account-bound history, without putting database work inside game-core or publishing private question content.

The server projects one answer-free archive when a prepared match finishes, including shutdown/leave aborts. A PostgreSQL transaction inserts its header and consumed-question references together. Match ID is the idempotency key: a canonical SHA-256 payload hash permits identical retries and rejects changed payloads. Published references have foreign keys to exact immutable content revisions. Private game tables enable deny-by-default RLS and revoke public/browser-role access; UPDATE/DELETE triggers prevent ordinary mutation. The trusted owner bypasses RLS and remains privileged; these guards are not protection against a malicious database operator.

Storage is opt-in through MATCH_RESULTS_ENABLED=false by default. A process-local writer allows four concurrent jobs and 64 pending records, with three attempts and bounded backoff. Normal shutdown aborts rooms, drains writes, then closes the pool. Protocol v3 adds mandatory resultStorage status; saved requires a database acknowledgement. A database failure changes storage status without changing gameplay winners.

The archive stores rules version/configuration, seed, private bank fingerprint, consumed IDs, final owners, order and placements. It omits names, tokens, account identity, answers, question text and action/timing logs. The database recordedAt is receipt time, not match completion time. This supports durable outcome inspection and future migration, not full deterministic replay or an independently verified anti-cheat record.

A process crash before commit can lose queued results. A response lost after commit can leave the client uncertain even though the record exists. Queue/drain limits are reversible operational defaults, not measured capacity. Durable outbox, room recovery, retention policy, user history, account mapping and ranking require later decisions. No hosted verification or deployment is included.
