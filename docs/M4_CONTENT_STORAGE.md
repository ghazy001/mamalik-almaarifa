# M4 first slice — Local sourced-question storage

Historical first-slice record. The subsequent opt-in authenticated content API, server-enforced account roles and private-table RLS are documented in M4_IDENTITY_AUTH.md and ADR 0008. The CLI described here remains a privileged local operator tool; the measured results below belong to that first slice.

Implemented: a Node-only PostgreSQL/Drizzle package, committed SQL migrations, strict Arabic content validation, immutable revisions, local draft/review/publish/retire workflow, transactional audit history, idempotent fixture import, published-bank loading and an uncached real-database CI gate. No gameplay rule, protocol or browser behavior changes in this slice. M4 is in progress; accounts, authenticated administration, a reviewed release bank, live-room bank integration and durable results are not implemented.

## Files and responsibilities

```text
packages/database/
  src/content.ts       Zod content boundary, stable input/error types
  src/schema.ts        Private content schema, keys, constraints, publication index
  src/repository.ts    Transactions, row locks, review/publication and audit
  src/client.ts        Explicit PostgreSQL URL and bounded connection pool
  src/migrate.ts       Explicit committed SQL migration runner
  src/cli.ts           Local operator workflow; no answer/URL error logging
  migrations/          Generated foundation, custom immutability guards, metadata
  scripts/             Local role bootstrap and isolated test database runner
  tests/               Validation and real PostgreSQL workflow/race/rollback tests
compose.yaml           Optional loopback-only PostgreSQL 16.13 development service
.github/workflows/ci.yml  PostgreSQL service and pnpm test:database gate
```

## Reversible workflow defaults and limits

Each question has a random UUID and numbered revisions. A published ID is `<uuid>_v<revision>`, within the existing 64-character ID contract and suitable for a future immutable match deck. Arabic is the only accepted locale in this slice. Exactly four distinct choice IDs (`a`–`d`) and distinct texts, one correct choice, a category, explanation and at least one credential-free HTTPS source are required. Question/choice text respects the current 500/200-character protocol limits. Strings are bounded, trimmed and reject markup/control characters. Source links are stored, not fetched; operators must verify factual accuracy, Arabic wording, attribution and rights themselves. The validation schema does not replace editorial review.

Content, authorship, creation time and revision identity cannot be changed in place. Editing always creates a DRAFT; the current publication remains available until a replacement is approved and published. Approval requires a different actor label, a nonempty review note and timestamp. Only the latest revision may be approved/published. Retirement removes a publication from subsequent bank loads; it is terminal for that revision, and restoration requires a new revision/review. Historical revisions remain available in storage. No draft deletion/rejection queue is implemented yet.

Repository operations lock the logical question row. Concurrent edits with the same expected revision have one winner; the other gets `STALE_REVISION`. Duplicate approval/publication gets `INVALID_STATUS` and makes no additional audit entry. `NOT_FOUND` and `SELF_REVIEW` are the other workflow errors; malformed content fails Zod validation before a transaction. Audit writes and status changes commit together. Imports use a unique fixture key, preserve any existing content/review state and create drafts only. This is import idempotency and optimistic edit protection, not a general network command ledger.

This CLI requires a trusted database owner. Actor strings are local audit metadata and can be impersonated by that operator; different labels are not authenticated two-person authorization. There are no admin HTTP routes or browser credentials. The private schema has no PUBLIC grants, and package exports deny browser resolution. Owners can still change tables/triggers; the audit is not tamper-proof against owners. Supabase identity/roles and reviewed RLS/exposed-schema policies must come before a remotely accessible CMS.

`loadPublished()` validates persisted content and returns detached secret-bearing records in stable question-ID order. It excludes drafts, approved-but-unpublished and retired revisions. Its result is not a client DTO. It has no current room consumer: online rooms and `/play` still use public development fixtures. Future room setup must load a sufficient approved bank, retain the selected revision snapshot for the match, fail explicitly on insufficient/unavailable content, and project only public question fields until resolution. No new database dependency enters `game-core`, `shared`, `web` or the current game service.

## Run locally

Use the repository's Node 22.22.1 and pnpm 10.0.0. `pnpm install --frozen-lockfile` installs the new dependencies. The ordinary `pnpm dev` preview needs no database.

```sh
docker compose up -d --wait
# Add the two database URLs from .env.example to root .env; preserve existing settings.
pnpm db:migrate
pnpm content import-fixtures
pnpm content list
pnpm content bank-check
pnpm test:database
```

Compose uses local-only known credentials on `127.0.0.1:5433`, a persistent volume and a non-superuser `mamalik_content` owner of the content database. Its init SQL runs only when the volume is first initialized. `docker compose stop` preserves data. Do not reuse the credentials for hosting. Docker is optional: provision PostgreSQL 16 with the same role/database arrangement from `scripts/local-init.sql` and export URLs explicitly. CLI/test scripts read root `.env` with existing exported variables taking precedence. Credentials are not passed to the browser or added to Turbo task environment/caches.

`DATABASE_URL` targets the content owner/database. `DATABASE_TEST_ADMIN_URL` is solely for the test runner and needs CREATE ROLE and CREATE DATABASE privileges. The test command generates names/passwords internally, provisions a separate non-superuser role/database, applies migrations twice, runs tests and drops only those randomly named resources. It never truncates or drops the configured content database. Missing bootstrap configuration fails explicitly; tests are not silently skipped. A forced process/OS kill can interrupt cleanup; normal exits, test failures and child interrupts run cleanup. Never use a hosted production bootstrap URL for local tests.

The fixture importer creates 18 sourced drafts, skips 18 source-less arithmetic questions, publishes zero and does not claim human review. Repeating it creates zero new rows. No existing data is overwritten. A future arithmetic evidence format is an explicit remaining decision, not a fake source URL.

## Commands and owner exercise

Run commands from the root; angle-bracket items are arguments to replace:

| Command after `pnpm content`                           | Behavior                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `draft <json-file> <author>`                           | Validate the content shape in `src/content.ts`, create logical UUID/revision 1 |
| `revise <id> <expected-revision> <json-file> <author>` | Create a new draft; reject stale edit                                          |
| `approve <id> <revision> <reviewer> <note>`            | Record local approval/evidence, different label from author                    |
| `publish <id> <revision> <actor>`                      | Publish latest approved revision and retire earlier publication atomically     |
| `retire <id> <revision> <actor> <note>`                | Remove published revision from future bank loads                               |
| `list`                                                 | Summaries without correct answers                                              |
| `history <id>`                                         | Local audit actions/labels/notes without question payloads                     |
| `bank-check`                                           | Validate published records; print count/IDs without answers                    |
| `import-fixtures`                                      | Retry-safe sourced development draft import                                    |

Exercise: after import, copy one DRAFT UUID from `list`. Inspect that question in `question-fixtures/src/index.ts` and follow its source. Before approval, try `pnpm content approve <id> 1 development-import "Self-review exercise"`: it rejects with SELF_REVIEW. For a **local workflow exercise**, approve with `pnpm content approve <id> 1 local-reviewer "Local workflow exercise"`, publish with `pnpm content publish <id> 1 local-publisher`, then inspect `history` and `bank-check`. Retire with a note and check the bank count decreases. These labels do not demonstrate authenticated review or certify a release question bank.

For schema changes, run `pnpm --filter @mamalik/database db:generate`, inspect the generated SQL/snapshot, and commit them. Custom SQL guards have their own journal entry. Never edit an already applied migration in shared environments or use unreviewed schema pushes. Run `pnpm db:migrate` explicitly; no migrations run on game-service boot.

## Validation record

Verified on 2026-10-30 with Node 22.22.1, pnpm 10.0.0 and native PostgreSQL 16.13. All commands below exited 0; unchanged package lint/typecheck tasks can use Turbo cache, while the full test/build runs explicitly bypassed it.

| Command                                                                        | Result                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` in a fresh source copy with no built packages | Passed; the preceding clean `--offline` attempt lacked a cached existing Colyseus tarball, so normal registry access was allowed |
| `pnpm format:check`                                                            | Passed                                                                                                                           |
| `pnpm lint`                                                                    | Passed                                                                                                                           |
| `pnpm typecheck`                                                               | Passed                                                                                                                           |
| `pnpm test --force`                                                            | 120 passed: core 31, shared 23, server 18, web 34, content validation 14; no cached test results                                 |
| `DATABASE_TEST_ADMIN_URL=<isolated-bootstrap-url> pnpm test:database`          | 9 real PostgreSQL tests passed; disposable databases/roles cleaned up; no skipped tests                                          |
| `pnpm build --force`                                                           | All six package/app builds passed, including production Next.js                                                                  |
| `pnpm simulate`                                                                | 36 turns, 177 actions, TURN_LIMIT, `p_gold`                                                                                      |
| `pnpm db:migrate`                                                              | Passed twice through the CLI; also passed from the fresh source copy before any workspace build                                  |
| `pnpm content import-fixtures`                                                 | 18 drafts/18 skipped/0 published; repeat 0 new drafts; existing content preserved                                                |
| `pnpm content bank-check` from the fresh source copy                           | Passed; root wrapper builds its fixture/core dependencies automatically                                                          |
| CLI `approve`, `publish`, `history`, `retire`, `bank-check`                    | Passed local smoke exercise; published count 0 → 1 → 0; history retained; no answers printed                                     |
| `pnpm --filter @mamalik/database db:generate`                                  | No schema changes, no migration drift                                                                                            |
| Node import with `--conditions=browser`                                        | Explicitly rejected with ERR_PACKAGE_PATH_NOT_EXPORTED                                                                           |
| `docker compose config --quiet`                                                | Passed; actual database tests used native PostgreSQL, not a started Compose container                                            |
| `pnpm dev` with web 3113 and game service 2572                                 | Both services booted; ordinary gameplay still requires no database                                                               |

The final content constraints also received the changed package's unit/lint/typecheck/build checks. Full gates were run locally; hosted GitHub Actions execution is not claimed. CI now provisions PostgreSQL 16.13 and executes the same `pnpm test:database` gate without caching it. The temporary verification cluster was stopped after the database checks; existing user databases/services were not modified. The local workflow smoke uses development labels and public fixtures, not an editorial certification.

Earlier M3 browser evidence remains in M3_RESILIENCE.md. `pnpm test:e2e` was not rerun for this storage-only slice: no browser, room behavior or protocol changes were made. This is not a new visual/accessibility QA or hosted database/authorization certification. Supabase integration, real content-role enforcement, a private reviewed release bank and durable result/history transactions remain open.

## Five concepts to learn

1. `content.ts`: runtime validation protects boundaries even when TypeScript types look correct.
2. `schema.ts` and `migrations/`: schema definitions describe the desired shape; committed SQL changes an actual database and enforces constraints independently.
3. `repository.ts`: a transaction commits publication and audit together, while a parent-row lock prevents two editors from racing.
4. Revision-qualified IDs preserve which exact text/answer was reviewed; stable logical UUIDs connect the revisions.
5. Authentication and audit labels are different: a future verified Supabase subject and server role policy must authorize edits before this repository is called.

Recommended next slice: Supabase identity verification and explicit server-side content roles, with local test identities/fixtures and denied-access tests, before building the admin review UI. Durable match result transactions/history follow after identity is stable. See ADR 0007 for the trade-offs.
