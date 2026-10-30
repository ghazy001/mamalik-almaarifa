# M4 fifth slice — Durable match-result archives

Finished three-player online matches can save an immutable, answer-free outcome to PostgreSQL. This includes private and queued games, normal victories, forfeits and prepared-match aborts. Incomplete rooms without a core match produce no record. Storage is optional; guest identity, rules v1 and gameplay decisions stay unchanged. M4 remains incomplete.

## Enable locally

1. Configure an existing local PostgreSQL database using the README. Preserve existing environment settings and run `pnpm db:migrate`; this adds migrations 0005 and 0006, without rewriting older migrations.
2. Set `MATCH_RESULTS_ENABLED=true` on the game server and provide server-only DATABASE_URL. It works with either development or published question sources and does not require editorial Auth. Enabled startup requires migrated storage; no silent storage fallback is provided.
3. Restart both services and reload tabs for Protocol v3. Old v1/v2 recovery tokens are not migrated. Health reports `matchResultsEnabled`; this is configuration/liveness, not continuous database health.
4. Open `/online` in three browser contexts. Complete a game, or ready all players and have two explicitly leave. Remaining clients show pending, then saved after acknowledgement, or failed if persistence cannot be confirmed. Disabled mode states that saving is unavailable. Offline `/play` remains unsaved.
5. Inspect committed records through a trusted owner connection, for example `SELECT match_id, recorded_at, archive->'result' FROM game.match_results ORDER BY recorded_at DESC;`. Do not expose these tables through a browser connection. No public history endpoint or user-facing history page exists yet.

For an isolated credential-free verification exercise, configure DATABASE_TEST_ADMIN_URL for a local bootstrap database and run `pnpm test:results`. The runner creates and drops its own random database/non-superuser roles. It never migrates or clears your application database.

## Stored contract and guarantees

`packages/database/src/match-archive.ts` defines archiveVersion 1. The server supplies match ID, room mode, question source, rules version/windows/turn limit, seed, private bank SHA-256 fingerprint, final turn, seat order, 15 final owners, consumed question IDs and core-calculated placements/winners/reason. Fixed guest seat IDs identify positions, not people. No guest names, account IDs, reconnect tokens, answers, question text/explanations/sources, deck or accepted-command ledger is copied. The archive is private and never synchronized to clients. Bank fingerprint includes private content and must remain server-only.

The repository validates structure and consistency; game-core remains responsible for scoring and outcomes. It does not accept results from a client endpoint or recompute domain rules in SQL. `game.match_results` stores the archive, its canonical payload hash and database receipt timestamp. `game.result_questions` stores ordered consumed IDs; published references also bind exact UUID/revision foreign keys, including revisions retired after room admission. Development fixtures have no content foreign key. Header and references commit or roll back together.

Identical retries/concurrent writes for one match ID return the existing record without changing receipt time. A changed payload returns internal MATCH_ARCHIVE_CONFLICT, never an overwrite. RLS has no public policies; public/browser roles have no grants. UPDATE/DELETE triggers guard both tables, but the trusted database owner remains privileged. Database receipt time is not a match finish timestamp or duration. Seed/fingerprint/references are provenance, not a complete replay: actions and receipt times are deliberately absent.

## Delivery and failure limits

The shared writer runs at most four jobs concurrently, caps pending work at 64 and attempts each accepted write three times with 250/500 ms backoff. Conflicts and malformed archives fail immediately. Jobs use detached copies of the same archive. Rooms keep playing and publish final outcomes independently of storage latency; one finish schedules one job. A disposed room does not receive later broadcasts, while its accepted job continues.

Normal shutdown aborts prepared rooms, then drains writes for up to 20 seconds before closing the pool. Pending jobs at the drain deadline settle as failed; an already running SQL transaction can still complete afterward. Connection/statement timeouts remain bounded. Failed means unconfirmed: an acknowledgement can be lost after a commit. There is no durable outbox, restart recovery or exactly-once delivery promise. A process crash before commit or an exhausted/full queue can lose a result. Process logs expose lifecycle status and random log references, without SQL/provider details or private archive fields.

## Verification

The separate real PostgreSQL/socket suite covers nine cases: concurrent duplicate/conflicting writes, separate-pool durability, transactional rollback, retired revision references, SQL mutation/null-reference guards, non-owner RLS denial, real three-client pending-to-commit acknowledgement, uncertain-commit retry, failed storage with unchanged winner, shutdown abort draining, and actual compiled standalone startup/shutdown with storage enabled independently of Auth. Several assertions share a case. Unit coverage adds archive validation, writer bounds/retries/shutdown and explicit configuration. Browser regression verifies the disabled result message and existing Arabic layouts on desktop, portrait and landscape; pending/saved/failed are verified at the actual socket/database boundary, not yet as separate browser journeys.

Final measured commands/results are recorded below after verification. Hosted PostgreSQL/Supabase, hosted CI, physical-device performance, production capacity, crash recovery and release readiness remain unverified. CI includes uncached `pnpm test:results` against PostgreSQL 16.13.

## Five concepts to learn

1. `match-session.ts`: an explicit allowlist copies completed domain data without copying secrets.
2. `match-archive.ts`: a transaction makes the outcome and revision references one atomic write.
3. `result-writer.ts`: idempotency makes uncertain retries safe; bounded memory is not durable delivery.
4. `kingdom-room.ts`: finish once, publish pending immediately, acknowledge saved only after commit.
5. `packages/shared/src/index.ts`: a versioned status contract lets the UI tell the truth about persistence.

Exercise: run `pnpm test:results`, find the blocked-write test, and trace why no database record exists while the client sees pending. Then inspect the uncertain-commit retry test: two attempts still leave one immutable result. Next M4 task: verified player account-to-seat binding and authorized personal history reads, before ranking or public leaderboards.

## Measured local gates (2026-10-30)

Node 22.22.1 / pnpm 10.0.0. Commands used that runtime on PATH. Database commands used DATABASE_TEST_ADMIN_URL pointing to an owned temporary PostgreSQL 16.13 loopback cluster; each runner created/dropped a separate random database and non-superuser roles. No application database or cloud service was changed.

| Command                                                                                           | Final result                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile --offline --store-dir /Users/ghazi.saoudi/Library/pnpm/store/v10` | Exit 0; existing workspace/store, lockfile consistent; not a fresh clean-checkout measurement                                  |
| `pnpm format:check`                                                                               | Exit 0                                                                                                                         |
| `pnpm lint`                                                                                       | Exit 0                                                                                                                         |
| `pnpm typecheck`                                                                                  | Exit 0, including test sources                                                                                                 |
| `pnpm test --force`                                                                               | Exit 0; 160 tests: core 31, shared 23, web 42, database validation 24, server 40                                               |
| `pnpm test:database`                                                                              | Exit 0; 13 real PostgreSQL cases                                                                                               |
| `pnpm test:admin`                                                                                 | Exit 0; 7 signed local Auth/HTTP/PostgreSQL cases                                                                              |
| `pnpm test:room-bank`                                                                             | Exit 0; 3 real bank/socket/standalone cases                                                                                    |
| `pnpm test:results`                                                                               | Exit 0; 9 real archive/socket/standalone cases                                                                                 |
| `pnpm build`                                                                                      | Exit 0; production web and all server/library packages                                                                         |
| `pnpm simulate`                                                                                   | Exit 0; seed 2026, 36 turns, 177 actions, p_gold wins                                                                          |
| `pnpm test:e2e`                                                                                   | Exit 0; all 30 Chromium desktop/mobile/landscape journeys, including real three-browser completion and disabled archive status |
| `pnpm test:content-web`                                                                           | Exit 0; all 6 protected editorial journeys after correcting the fixture race below                                             |
| `pnpm --filter @mamalik/database exec drizzle-kit check`                                          | Exit 0; migration metadata consistent                                                                                          |
| `git diff --check`                                                                                | Exit 0                                                                                                                         |

Initial test setup failures (SQL test dependency and the wrapped PostgreSQL error assertion) were corrected. Editorial regression runs reproduced a test race: after login the URL changed before initial authenticated reads completed, and replacing cookies could race an old request into a sign-in redirect. The test now waits for the list response and enabled refresh control before deliberately expiring its cookie. The final complete six-case run passed without production Auth changes. Expected malformed-cookie warnings are generated by the forged-cookie denial case.

Result screenshots were visually inspected at desktop, portrait and short landscape sizes; automated checks found no horizontal overflow or axe violations in the tested journeys. Pending/saved/failed status remains tested at the real socket/database boundary rather than separate browser presentation journeys. Hosted CI has the same gates configured but was not executed here.

The temporary PostgreSQL cluster was stopped and removed after confirming zero remaining generated databases/roles. The database-free development preview was restored at `http://127.0.0.1:3113/online`, with game-service health on port 2572 returning Protocol v3 and matchResultsEnabled=false; both endpoints returned HTTP 200.
