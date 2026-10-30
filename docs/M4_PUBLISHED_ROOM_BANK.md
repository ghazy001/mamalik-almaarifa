# M4 fourth slice — Published server-only room question banks

Online rooms can now use published PostgreSQL question revisions through an explicit server setting. Rooms retain an immutable private bank for their lifetime, and invalid/insufficient/unavailable content prevents new room admission without a fixture fallback. Rules v1, gameplay Protocol v2, guest identity and normal timing/scoring are unchanged. Durable match results/history, player accounts and hosted verification remain M4 work.

## Behavior and reversible defaults

`GAME_QUESTION_SOURCE=development` is the safe local default: no database is required and guest rooms keep the public development pack. `published` opens the content database even if CONTENT_ADMIN_ENABLED=false; Supabase credentials are required only when the editorial API itself is enabled. Startup verifies migrated question storage. Health reports the configured `questionSource`; health is liveness, not a guarantee that a bank is currently large enough to admit a room.

Every new private/queued room performs one ordered published-revision read before admitting its first player. The repository query sees a consistent PostgreSQL statement snapshot across atomic publication/retirement transactions. Drafts, approved-but-unpublished and retired revisions are excluded. A published older revision remains eligible while a new draft awaits approval/publication. Snapshot IDs contain the logical UUID and exact revision; seeded core shuffling selects each at most once.

The bank requires at least maxTurns unique questions, normally 36. No shorter match or repeat fallback is introduced. Reads are bounded to 1,001 records; more than 1,000 eligible questions is an explicit invalid-bank failure until a larger-catalog sampling policy is designed. Four pending bank reads per service bound request queuing; the existing database pool has four connections, 5-second connection and 10-second statement timeouts. These limits are provisional operational defaults, not capacity measurements or distributed abuse controls.

The room holds detached question content privately. Public lookups return copies; its deck ID list is frozen. Joining an existing waiting room, readiness, target selection, answer validation, resolution and reconnect perform no database read. Publication/retirement/outage cannot replace a current room's answer or source. A revision retired after room creation may therefore still appear in that room, including if the room was waiting for players. Immediate content withdrawal requires aborting affected rooms; no new withdrawal feature is included.

Unresolved snapshots contain public question text/choices only, without answer keys, explanations, references or deck order. On resolution the existing outcome reveals the correct choice, while the resolved-question panel receives explanation and the first editorial reference. Other references remain available to authorized editors. Private bank data never enters shared exports or the web bundle. `/play` remains an explicitly inspectable offline simulation. Already public imported fixtures remain public even if later published; this code path does not certify a release question set.

## Local setup and manual exercise

1. Configure PostgreSQL/DATABASE_URL and `pnpm db:migrate` using README. Use the editorial workspace or trusted CLI to create independently reviewed published questions. Fixture import publishes nothing and supplies only 18 sourced drafts, fewer than the required 36; do not mass-approve fixtures as a release-content substitute.
2. Export `GAME_QUESTION_SOURCE=published` before `pnpm dev`, or put it in the root `.env` read by the game server. Keep DATABASE_URL server-only. CONTENT_ADMIN_ENABLED may remain false, without Supabase keys, when using an already populated bank.
3. Check `/health` for `questionSource: "published"`, then open `/online` in three browser contexts. Private invitations and basic matchmaking use the same configured source. With fewer than 36 published questions, room creation shows a clear Arabic unavailable/insufficient message and creates no guest match.
4. With a sufficient bank, create a room, then revise/publish or retire one of its questions. That room retains its exact initial revisions; a subsequently created room reads the new published view. A database outage blocks new rooms while already admitted rooms continue. Restarting the process still loses all rooms/results.

For a credential-free automated exercise, use a local PostgreSQL bootstrap URL and run:

```sh
pnpm test:room-bank
```

The runner builds game-server and all dependencies (including shared contracts), creates a random isolated database and non-superuser roles, migrates it and runs real HTTP/WebSocket tests. It creates test-only content with developer labels and three-turn rules; production remains 36 turns. Two three-client matches finish using different pinned revision sets. The tests inject read failure at the server loader and assert no subsequent reads during play. They also launch the actual compiled standalone entrypoint in published mode without Auth and verify health, disabled admin access and insufficient-bank rejection. No hosted user, question bank or database is modified.

## Admission contract

Before a room exists, Colyseus matchmaking returns HTTP 503 with `{code:503,error:<allowlisted-string>}`. The SDK exposes status 503 and the string as its error message:

| String                    | Meaning                                                |
| ------------------------- | ------------------------------------------------------ |
| CONTENT_BANK_INSUFFICIENT | Fewer than maxTurns unique published entries           |
| CONTENT_BANK_INVALID      | Invalid content/IDs, duplicates or catalog above 1,000 |
| CONTENT_BANK_UNAVAILABLE  | Read/pool failure or four bank loads already pending   |

There is no raw SQL/provider exception in these errors and no private content in health. Unknown error text is never rendered verbatim. These are admission errors, not new in-room COMMAND_REJECTED codes. No WebSocket schema/version migration is needed; rebuild/restart the changed server and web together to receive the specific Arabic messages.

## Verification record

Results are recorded below after the final checks. New unit tests cover bank immutability, malformed/duplicate/insufficient/oversized input, bounded reads, safe errors, explicit configuration and deterministic complete private-bank replay. Real PostgreSQL/socket tests cover lifecycle filtering, publication/retirement changes, no fallback, two complete three-client matches, answer privacy, fresh-bank loading and standalone startup. Browser admission tests inject HTTP failures only to test Arabic presentation/CORS/keyboard/accessibility; they are not presented as database-backed gameplay.

No hosted PostgreSQL/Supabase, physical-device performance, public capacity, result durability or deployment has been certified. The new uncached `pnpm test:room-bank` CI step runs against PostgreSQL 16.13; hosted CI execution is not claimed. Earlier editorial verification remains historical in M4_EDITORIAL_UI.md.

## Five files/concepts

1. `question-bank.ts`: validates and detaches private data; copies prevent later mutation from changing a room.
2. `kingdom-room.ts`: asynchronous I/O finishes before admission; the later game loop stays synchronous.
3. `match-session.ts`: a supplied bank replaces fixture lookup while every outcome still goes through game-core.
4. `repository.ts`: a bounded single SQL statement observes a consistent committed published revision set.
5. `admission-errors.ts`: known status/string pairs become safe Arabic guidance; arbitrary backend messages stay hidden.

Exercise: run test:room-bank, then find the assertion that the read counter does not change while both matches finish. Trace how a v1 question remains in the first room after v2 is published. Next recommended M4 slice: transactional, idempotent durable match-result storage with rule/question revision references, before adding history UI.

### Measured local gates (2026-10-30)

Node 22.22.1 / pnpm 10.0.0; native PostgreSQL 16.13 in a temporary loopback cluster. Database commands used DATABASE_TEST_ADMIN_URL for that isolated bootstrap database; each runner created/dropped its own random database and non-superuser roles.

| Command                                                                                            | Result                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`                                                         | Exit 0, already up to date; dependencies/lockfile unchanged                                                                           |
| `pnpm format:check`                                                                                | Exit 0                                                                                                                                |
| `pnpm lint`                                                                                        | Exit 0                                                                                                                                |
| `pnpm typecheck`                                                                                   | Exit 0                                                                                                                                |
| `pnpm test --force`, then `pnpm test` after the final unknown-error regression                     | Exit 0; final 145 tests: core 31, shared 23, web 42, database validation 14, server 35                                                |
| `pnpm test:database`                                                                               | Exit 0; 13 real-PostgreSQL tests                                                                                                      |
| `pnpm test:admin`                                                                                  | Exit 0; 7 signed Auth/HTTP/PostgreSQL regressions                                                                                     |
| `pnpm test:room-bank`                                                                              | Exit 0; 3 real PostgreSQL/socket/standalone checks, including two complete three-client matches                                       |
| `pnpm build`                                                                                       | Exit 0; all packages/Next.js production routes                                                                                        |
| `pnpm simulate`                                                                                    | Exit 0; seed 2026, 36 turns, 177 actions, p_gold wins                                                                                 |
| `pnpm test:e2e`                                                                                    | 27 existing cases passed; exit 1 on three new admission cases because the injected fixture used credential-incompatible wildcard CORS |
| `pnpm --filter @mamalik/web exec playwright test tests/admission.spec.ts` after fixture correction | Exit 0; 3 layouts passed with retry, known/unknown error isolation, RTL/overflow and axe checks                                       |

All 30 browser cases passed across the full run and affected-path rerun; a single all-green full run is not claimed. Actual published-bank admission was independently verified through real HTTP/WebSocket requests in test:room-bank; browser error injection is presentation coverage only. The original four-digit admission-code attempt was corrected after inspection of the installed Colyseus HTTP router, and the new test command now builds shared contracts before executing fixtures. Desktop/mobile/landscape screenshots were inspected. Prior editorial-specific browser evidence remains in its historical record and was not rerun for this server-bank slice.

The temporary cluster was checked for leftover generated databases/roles (zero), stopped and removed. The standard guest preview was restored on 3113/2572 with questionSource=development, content administration disabled and no database dependency. Health and `/online` returned HTTP 200. No push, cloud provisioning, publishing or deployment was performed.
