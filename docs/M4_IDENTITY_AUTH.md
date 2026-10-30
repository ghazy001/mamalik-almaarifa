# M4 second slice — Content identity and authorization

Historical record of the second M4 increment. The subsequent Arabic sign-in/session proxy and editorial workspace are documented in [M4_EDITORIAL_UI.md](M4_EDITORIAL_UI.md); statements below about absent UI describe this slice at completion.

The optional content API authenticates Supabase accounts and enforces PostgreSQL editor/reviewer/publisher roles. It connects the existing revision/review repository to protected HTTP reads and writes. Rules v1 and gameplay Protocol v2 are unchanged; guest rooms and the offline route retain public development fixtures. M4 is still in progress: sign-in/admin UI, hosted Supabase verification, reviewed room decks and durable results/history remain.

## Implementation

```text
apps/game-server/src/content-auth.ts    Explicit Supabase JWT → verified account
apps/game-server/src/content-admin.ts   Opt-in bearer-only HTTP boundary and validation
apps/game-server/src/config.ts          Fail-closed enablement/project/key validation
apps/game-server/src/index.ts           Storage readiness and graceful pool shutdown
packages/database/src/permissions.ts    Project/account identity, roles and actor IDs
packages/database/src/access.ts         Transactional permissions, role audit and retries
packages/database/migrations/0002–0004  Memberships, access audit, request ledger, RLS/grants
apps/game-server/tests/support/         Test-only signed-token Auth fixture
```

`getUser(jwt)` makes a fresh request to the configured Auth endpoint. Session persistence, auto-refresh and URL session detection are disabled. Only authenticated non-anonymous UUID accounts are accepted. The service never reads a client's role from user/app metadata. It accepts the bearer header only, bounds it to 8192 characters, and uses a three-second Auth request timeout. No Auth/user cache or production development identity bypass is installed. Token signature/expiry/user validation is delegated to Supabase Auth, not implemented by decoding an unsigned token. The local fixture cryptographically checks signatures, issuer, audience and expiry to exercise that integration contract. Provider session policies and token lifetimes still apply; instant sign-out revocation is not claimed.

Memberships are keyed by canonical project issuer and subject UUID. Roles are independent:

| Role      | Allowed content operations                          |
| --------- | --------------------------------------------------- |
| editor    | Read, create draft, revise                          |
| reviewer  | Read, approve another account's revision            |
| publisher | Read, publish approved revision, retire publication |

Multiple roles may be granted to one account; self-review remains blocked. No role is granted automatically at sign-up. `/admin/me` reports the verified caller's own identity/roles even when no role is assigned. Other content routes require a membership. HTTP requests cannot grant roles, choose an author/reviewer or impersonate another account. Actor IDs use `auth:` plus SHA-256 of the canonical issuer, a null separator and lowercased UUID; they are stable across token refresh and distinguish projects. Old CLI actor labels remain operator assertions, not retroactively authenticated records.

Membership checks acquire shared row locks through the content/audit/response transaction. A revocation can complete after transactions already using that role finish; subsequent requests and idempotent retries are denied. No successful operation can commit using a role concurrently deleted halfway through it. Trusted operators can still change tables or use the privileged CLI; database-owner credentials are outside this application-role boundary.

The private `content` schema has RLS enabled on all six tables and no browser policies. New migrations revoke PUBLIC and existing `anon`/`authenticated` grants. The service's trusted non-superuser database owner bypasses RLS; server transaction authorization is mandatory. Tests explicitly switch to an unprivileged role after granting SELECT and verify every table remains unreadable. Keep `content` out of Supabase exposed schemas. No deployed Supabase RLS configuration has been certified by these local tests.

## Run without a cloud project

Ordinary `pnpm dev` is unchanged: content administration defaults off and gameplay needs no database. `/health` reports milestone M4 and `contentAdminEnabled: false`; `/admin/*` returns 404 with `CONTENT_ADMIN_DISABLED`.

For the complete local identity/content test, configure the local PostgreSQL bootstrap URL from `.env.example` (or the native equivalent), then:

```sh
docker compose up -d --wait
pnpm install --frozen-lockfile
pnpm test:database
pnpm test:admin
```

The explicit test commands create random databases and non-superuser roles, run committed migrations and clean up only their own resources. `test:admin` starts a loopback Auth fixture with ephemeral signing keys and the real game-service HTTP boundary; no Supabase account, networked cloud service or committed signing key is needed. The fixture lives under tests and is absent from the production build. Missing bootstrap configuration fails rather than skipping tests. No fake identities are accepted by default service startup.

## Configure an existing Supabase project

No project is created or deployed by this slice. To connect a project you already control, add to the root `.env`, preserving existing settings:

```dotenv
CONTENT_ADMIN_ENABLED=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_actual_publishable_key
DATABASE_URL=postgresql://your-content-owner:your-password@your-db/your-database
```

Use an actual publishable key, not a service-role/secret key or legacy anon JWT. The content database can be separate from the Auth project. Run `pnpm db:migrate` explicitly before startup; the enabled service fails closed when required tables are missing/unreachable. No migrations execute on room turns/boot. HTTPS Auth is required in production; loopback HTTP is permitted only outside production. Turbo passes these environment values only to the game server's uncached dev task, not the web task; database credentials never enter web public variables or build cache keys. Root `.env` is read by the game service and operator tools.

Grant a verified account one role using trusted operator database credentials:

```sh
pnpm content grant-role https://your-project.supabase.co/auth/v1 <account-uuid> editor local-operator
pnpm content grant-role https://your-project.supabase.co/auth/v1 <reviewer-uuid> reviewer local-operator
pnpm content grant-role https://your-project.supabase.co/auth/v1 <publisher-uuid> publisher local-operator
pnpm content revoke-role https://your-project.supabase.co/auth/v1 <account-uuid> editor local-operator
```

`local-operator` is still a privileged audit label. Grants/revocations are transactional and retry-safe; unchanged retries add no extra access audit entry. There is no HTTP role-management endpoint. Obtain an account access token through that project's legitimate sign-in flow; this repository does not yet ship sign-in UI or create test accounts in a hosted project. Keep tokens out of URLs, screenshots and shell history. Send them as `Authorization: Bearer <access-token>` from a trusted server/operator client. Browser Origin requests are deliberately rejected until the Next.js admin session/proxy slice is implemented.

## HTTP contract

The base is the persistent game service, normally `http://127.0.0.1:2567`. All admin responses use `Cache-Control: no-store`. This API is separate from the versioned gameplay WebSocket protocol and is a local M4 implementation contract.

| Request                                          | Result                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /admin/me`                                  | Verified subject, issuer, actor and role list; never the token/profile |
| `GET /admin/questions?limit=50&offset=0`         | Authorized revision summaries; limit 1–100, offset 0–100000            |
| `GET /admin/questions/<uuid>/revisions/<number>` | Authorized full revision, including its answer/review data             |
| `POST /admin/commands`                           | Strict JSON command with required `Idempotency-Key` header             |

Commands: `CREATE_DRAFT {content}`, `REVISE {questionId, expectedRevision, content}`, `APPROVE {questionId, revision, note}`, `PUBLISH {questionId, revision}`, `RETIRE {questionId, revision, note}`. Each includes `type` equal to the command name. Content uses the storage schema in `packages/database/src/content.ts`. Extra fields, including `author`, `actor`, `role`, `subject` and `reviewer`, are rejected. Successful creation returns 201 and `{questionId, revision, created}`; revision creation returns 200 and `{questionId, revision}`; other writes return 200 and `{accepted:true}`. Correct answers appear only in authorized revision reads, never command responses or game snapshots before resolution.

Idempotency keys use `[A-Za-z0-9_-]`, 1–64 characters; generate a fresh UUID per intended write and reuse it only for retries of that exact command. Identity/key uniqueness and a parsed-command SHA-256 hash serialize concurrent retries. The successful answer-free response is stored in the same transaction as content/audit. A reused key with a different command returns 409 `IDEMPOTENCY_CONFLICT`. Failure leaves no committed ledger/draft/audit mutation; retry can succeed after correction. Permissions are checked again before any replay. Ledger retention/archival is not yet implemented, so operators must not delete it casually and reopen duplicate actions.

The API accepts JSON up to 16 KiB, at most 60 requests per socket IP per minute, at most eight in-flight requests, and at most 2048 active IP buckets per service process. It does not trust forwarded IP headers; reverse-proxy clients may share a bucket until hosting policy is designed. These bounds protect the local surface, not a load/abuse certification. No credentialed CORS/cookie auth is enabled. Errors contain a code only: 400 invalid input/JSON/key, 401 unauthenticated, 403 forbidden/origin, 404 disabled/missing, 409 workflow/idempotency conflict, 413 oversized body, 415 JSON required, 429 rate limited, 503 Auth/content unavailable. Provider/SQL details, tokens and question parameters are not reflected.

## Verification

Verified on 2026-10-30 using Node 22.22.1, pnpm 10.0.0 and native PostgreSQL 16.13. Final gates below exited 0. Unchanged lint/typecheck dependencies can use Turbo cache; full unit tests and production builds explicitly bypassed it.

| Command                                                                              | Result                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` in a fresh source copy                              | Passed with no prebuilt packages or existing node_modules                                                           |
| `pnpm format:check`                                                                  | Passed                                                                                                              |
| `pnpm lint`                                                                          | Passed                                                                                                              |
| `pnpm typecheck`                                                                     | Passed, including all new test sources                                                                              |
| `pnpm test --force`                                                                  | 131 passed: core 31, shared 23, web 34, storage validation 14, server 29 (including 11 new identity tests)          |
| `DATABASE_TEST_ADMIN_URL=<isolated-bootstrap-url> pnpm test:database`                | 13 passed, including membership locking, role audit, rollback and all-table RLS denial                              |
| `DATABASE_TEST_ADMIN_URL=<isolated-bootstrap-url> pnpm test:admin`                   | 7 passed through the actual HTTP boundary, signed local Auth fixture and real PostgreSQL                            |
| `pnpm build --force`                                                                 | All six package/app production builds passed                                                                        |
| `pnpm test:e2e`                                                                      | All 27 Chromium desktop/mobile/landscape journeys passed in 6.5 minutes                                             |
| `pnpm --filter @mamalik/database db:generate`                                        | No schema drift or additional migration                                                                             |
| `pnpm db:migrate` from the fresh source copy                                         | Passed before any workspace build                                                                                   |
| `pnpm content grant-role ...` and `pnpm content revoke-role ...` from the fresh copy | Passed against the isolated content owner/database; access audit retained                                           |
| Compiled enabled service on port 2573                                                | Booted against migrated storage; health 200 with content flag true, unauthenticated `/admin/me` 401; clean shutdown |

There are 151 passing unit/integration tests across the three test commands, plus 27 browser journeys. The Auth fixture rejects expired, malformed, incorrectly signed, wrong-project/audience, anonymous and removed-user tokens. HTTP tests additionally reject forged profile roles/authors, enforce role separation/self-review, deduplicate concurrent writes, reject conflicting key reuse, revoke access with the same token, reject body/origin/token-channel abuse and apply request bounds. Database tests demonstrate a membership lock blocks concurrent revocation until the transaction completes, and that failed work rolls back the request ledger along with draft/audit rows. Disposable database/role cleanup was checked explicitly.

CI now runs both real-database gates against its PostgreSQL service with no cloud credentials or cached integration results. Hosted Supabase, cloud deployment and hosted GitHub Actions execution are not claimed as verified. The enabled startup smoke used an intentionally unreachable loopback Auth placeholder and tested rejection only; successful signed identity/content operations were verified through the local Auth fixture. These are different checks, not a hosted authentication certification. No project, real user or role was provisioned outside the temporary verification database. The ordinary guest preview runs with content administration disabled and no database dependency at runtime.

## Five concepts and exercise

1. `content-auth.ts`: authentication establishes who presented a token through a trusted provider.
2. `permissions.ts`: authorization determines what that verified account may do; profile fields cannot grant it.
3. `access.ts`: membership locks keep permissions valid until a content transaction commits.
4. The request ledger makes network retries safe without caching roles or duplicating a draft.
5. Private-schema grants and deny-by-default RLS protect a different boundary from the server's trusted owner connection.

Exercise: run `pnpm test:admin`, then inspect the role-revocation test. It reuses one token before and after revocation: the first draft succeeds, the subsequent read and retry return 403. Inspect the concurrent-retry test and confirm only one draft audit entry exists. These tests use an explicitly simulated Auth provider and a real database.

Recommended next slice: Arabic sign-in/session handling and an authenticated Next.js admin review UI/server proxy using these permissions, with desktop/mobile/RTL and denied-access browser tests. Guest-to-account room identity, reviewed bank snapshots and durable match results remain separate follow-ups.
