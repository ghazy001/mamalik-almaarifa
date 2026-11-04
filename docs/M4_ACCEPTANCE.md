# M4 — Combined local acceptance gate

This tenth slice connects the existing M4 features in one real service/database journey. It adds an uncached test command and CI gate, not a new player feature or a declaration that M4 is complete. The 42 private Arabic candidates still require independent human review; hosted Supabase, hosted database configuration and release operations remain unverified.

## Run

Use Node/pnpm from the repository configuration and a local PostgreSQL 16 bootstrap URL with CREATE DATABASE/ROLE privileges, as described in README. Then run from the repository root:

```sh
pnpm test:m4
```

The command builds the game server and dependencies, then uses the existing isolated database runner. Missing DATABASE_TEST_ADMIN_URL fails explicitly. The runner creates a random database and non-superuser owner/reader roles, passes that database to the test, and drops only its generated resources afterwards. It does not use the normal content DATABASE_URL from `.env`. No cloud project, private draft pack, real account or release question is created/approved/published.

The test intentionally lasts about two minutes because it retains all normal timing: Rules v1, 36 turns, 10-second selection, 15-second answers, 3-second resolution, default reconnect grace and unchanged request/intent limits. Clients respond on phase messages, so unused answer/selection windows do not delay each turn. The journey has a 180-second guard and event observations have bounded failure timeouts; there are no arbitrary sleeps or fake clocks as proof of correctness. CI runs it uncached against its PostgreSQL service and allows the full quality job up to 20 minutes.

## What the journey proves

1. Four ephemeral signed local Auth identities begin with empty private history and unranked standing. The fourth stays outside the match. The Auth fixture verifies its signatures, issuer, audience, expiry and account revocation; it is not hosted Supabase or a production bypass.
2. The test creates 36 deliberately synthetic server-side questions in its isolated database with clearly marked test author/reviewer/publisher labels. With only 35 published questions, normal matchmaking rejects admission. Publishing the 36th test fixture enables three distinct verified-account SDK clients to enter the same queued room through one-use tickets.
3. The room pins exact v1 revisions. A test question subsequently receives a v2 revision with a different answer; the running room still uses v1. An injected published-loader failure rejects a new room without fixture fallback while the admitted match completes without another bank read. This is a controlled loader failure, not a physical database outage.
4. All 36 turns run over actual Colyseus sockets with normal rules/timers. The driver captures one neutral territory for teal, then intentionally answers incorrectly to preserve a predictable sole winner at TURN_LIMIT. Malformed actor injection, an illegal target, an observer answer and an invalid choice are rejected; duplicate target/answer intents do not consume extra questions or captures. This journey uses neutral challenges; occupied duels, deadline expiry and network-delay fairness retain their separate existing test coverage.
5. The attacker disconnects/reconnects during turn 12 using the real bearer reconnect flow, retains its account/seat and sees the unchanged question deadline. Every delivered snapshot/event is schema-validated and checked for credential/account-identifier leaks. Unresolved questions contain no correct answer, private explanation/source, deck or bank hash. Resolution reveals the expected pinned answer/explanation.
6. A controlled write gate holds the result before database commit. All clients see pending; history remains empty and standing unranked. Releasing the gate commits one answer-free archive, 36 exact revision references and three private account bindings. Saved is acknowledged only after commit; concurrent identical repository retries leave those counts unchanged.
7. Each participant receives one own history summary and the expected basic-v1 points: teal 3 / position 1, blue and gold 0 / shared position 2. A nonparticipant remains empty/unranked. Responses use strict DTOs and no-store and contain no account/credential/private-question metadata. This validates actual contributions from a completed room, not a hand-built eligible archive.
8. The first service stops. A separate compiled `dist/index.js` process starts against the same isolated database and local Auth fixture on the released game port. History/standing responses are identical, including recorded timestamps. Revoking the winning test account then makes both protected reads return 401. Finally the child stops normally and the database runner cleans up.

The production rule core, protocol, HTTP handlers, storage schema and UI do not change. Test-only signing keys/accounts and synthetic answers remain under `tests/` and are excluded from the production server build. The first service uses dependency injection for the bank failure and write gate; the restart uses the actual standalone entrypoint and production repository wiring. Do not present the first service's injected failure/commit delay as a production control or public fault-tolerance certification.

## Verification record

Measured locally on 2026-11-04 with Node 22.22.1, pnpm 10.0.0 and native PostgreSQL 16.13. All final commands below exited 0. Database commands used an explicit loopback-only temporary bootstrap URL; each runner created/dropped its own random database and roles. The local acceptance invocation used `caffeinate -i` to prevent idle sleep only while that command ran; the portable project command is unchanged.

| Command              | Result                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:m4`       | One complete combined journey passed in 111.99 seconds; all 36 turns, reconnect, exact pinned revisions, pending/saved, SQL counts, private history/points, separate compiled-process restart and revoked-account denial |
| `pnpm test:database` | All 13 existing PostgreSQL content/access regressions passed                                                                                                                                                             |
| `pnpm format:check`  | Passed                                                                                                                                                                                                                   |
| `pnpm lint`          | Passed                                                                                                                                                                                                                   |
| `pnpm typecheck`     | Passed, including the new acceptance source and updated runner                                                                                                                                                           |
| `pnpm test`          | All 199 existing tests passed; the real-database acceptance file is deliberately excluded and runs through test:m4                                                                                                       |
| `pnpm build`         | All six package/app build tasks passed; unchanged builds reused valid Turbo cache                                                                                                                                        |
| `git diff --check`   | Passed                                                                                                                                                                                                                   |

`pnpm simulate` also exited 0 (seed 2026, 36 turns, 177 actions, p_gold wins). Offline `pack-check` exited 0 with the unchanged private payload digest `f12d544846b2b4c9b7468b1e0edff73ce1fa1d2fdd06ffe3aa73af8f55fdbdc3`: 42 DRAFT/PENDING candidates, zero publications. Cleanup confirmed zero remaining generated databases/roles, then stopped/removed the owned temporary cluster.

Root quality tasks reused unchanged Turbo cache entries. The changed game-server tests ran against actual loopback listeners; no test skip or product bypass was added. This gate complements the existing content/admin/bank/results/admission/history/standing tests; it does not replace their edge cases or the browser journeys. No web layout changes, so browser tests were not rerun and earlier visual/RTL coverage remains historical evidence. Dependencies/lockfile, production code, migrations, rules and protocol are unchanged. GitHub Actions was configured but not run remotely in this increment.

An initial preview smoke after the cached build returned HTTP 404. Stopping the development processes, clearing only generated `apps/web/.next/dev` output and restarting restored HTTP 200 at both `/` and `/online`. Game health remained development-source with content administration/result writes disabled. Stop the local preview before production builds/cache restoration when working in the same Next.js output directory. No application source fix was needed.

## Five files and concepts

1. `apps/game-server/tests/m4-acceptance.postgres.test.ts`: a combined acceptance test checks that independently tested components agree across real boundaries.
2. `packages/database/scripts/test-database.ts`: generated databases/roles keep verification separate from your content and provide cleanup on test failure.
3. `apps/game-server/src/kingdom-room.ts`: private account seats and pinned questions produce authoritative results; clients send intents only.
4. `apps/game-server/src/result-writer.ts`: pending/saved are distinct because only a committed write establishes durability; retries must stay idempotent.
5. `apps/game-server/src/index.ts`: restarting this actual compiled process verifies that history/standing come from PostgreSQL rather than the old room's memory.

Exercise: run `pnpm test:m4`, then find the assertion that history is empty while the commit gate is held. Trace the release to the saved snapshots, SQL counts and unchanged history after restart. Next work remains independent human review of the private candidates, followed by a deliberately configured hosted M4 verification with existing accounts and an accepted published bank. Do not skip either gate or silently advance to release.
