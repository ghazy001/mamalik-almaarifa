# M4 third slice — Arabic editorial workspace

The web application now provides `/signin` and `/admin` for existing content-team accounts. It connects the protected content API to Arabic draft/revision/review/publication/retirement controls. Rules v1 and gameplay Protocol v2 are unchanged. M4 remains in progress: hosted Supabase verification, player identity, reviewed live-room decks, durable results/history and basic ranking remain.

## Implemented behavior

- Existing email/password sign-in, generic errors, fixed `/admin` navigation and local-session logout. No signup, recovery email, OAuth or hosted account provisioning.
- Server-only Supabase sessions in HttpOnly cookies. HTTPS uses Secure `__Host-mm-auth`; loopback HTTP uses `mm-auth`. SDK chunking is supported. Tokens are never returned in JSON, React props or browser storage.
- Next Proxy refreshes cookies before rendering, while the game service independently verifies Supabase identity and PostgreSQL memberships on every operation. UI controls guide users but grant no permissions.
- Editors create sourced Arabic drafts and append new immutable revisions; a different reviewer approves with evidence; publishers publish or retire with a reason. Revising a published question preserves its existing published revision until a replacement is explicitly approved/published.
- Paginated lists (25 revisions), authorized answer/source/review detail, role refresh, unavailable/denied states and server error messages in Arabic. Authorized staff can see correct answers; guests cannot read editorial revisions.
- An uncertain write locks other edits and retries the identical command/key. The backend ledger prevents duplicate drafts/audit entries after response loss. Pending data is memory-only and disappears on reload; check the latest list before replacing an uncertain operation.
- Original navy/teal/gold presentation, locally hosted Arabic fonts, logical RTL styling, keyboard focus, semantic forms, 46 px controls and reduced-motion styles.

## Setup for existing accounts

Ordinary guest `pnpm dev` still requires no cloud account or database. Without full configuration, `/signin` and `/admin` show an honest unavailable state.

1. Configure PostgreSQL and migrate as described in README and M4_IDENTITY_AUTH. Enable the game-service content API using `CONTENT_ADMIN_ENABLED=true`, `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
2. Use existing email/password accounts in your Supabase project. Grant exact issuer/subject roles with the trusted operator CLI, for example `pnpm content grant-role https://your-project.supabase.co/auth/v1 <account-uuid> editor local-operator`. Use a separate reviewer identity and publisher role. No service-role key is needed.
3. Export the following web settings before `pnpm dev`, or put web settings in `apps/web/.env.local`. Root `.env` is not loaded automatically by Next/Turbo:

```dotenv
WEB_AUTH_ENABLED=true
WEB_AUTH_ORIGIN=http://127.0.0.1:3000
CONTENT_ADMIN_URL=http://127.0.0.1:2567
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_actual_publishable_key
```

The origin must exactly match the address/port in the browser. If Next selects another port, update it and restart. Root-only HTTPS base URLs are required outside loopback; credentials, query strings and paths are rejected. The web never needs DATABASE_URL. Never put bootstrap/database credentials in NEXT_PUBLIC variables. Turbo passes only the appropriate runtime settings to each dev service. Production `next start` receives web settings directly; hosting is not configured here.

## Manual workflow

Open `/signin` and enter an existing editor account. Create a question with four choices, the correct choice, an explanation and at least one HTTPS reference. Save and inspect the draft. Self-review is unavailable even when the author also has reviewer permissions. Sign out and use a separate reviewer to inspect the source and approve with a note. Sign in as publisher and publish. As editor, create an amended revision; the published version remains intact. As publisher, retire the published version with a reason. Reopening shows its retained history/status.

An ordinary authenticated account sees a denied workspace and cannot fetch questions. Revoke a role with the CLI, then refresh permissions; subsequent API operations deny the revoked capability. A session expiry triggers server refresh; upstream failures show generic unavailability. Logout clears this browser's cookies even if remote revocation is unavailable; already-issued access tokens may remain valid until provider expiry. This is not global sign-out.

## HTTP and security boundary

POST `/api/auth/signin` accepts only `{email,password}`, with a 2 KiB body limit, 30 attempts/minute and four concurrent requests per process. POST `/api/auth/signout` uses local-session scope. Cookie-authenticated POSTs require exact `WEB_AUTH_ORIGIN`, JSON and non-cross-site Fetch Metadata. GET `/api/content` accepts only `view=me|list|detail` and validated pagination/UUID/revision fields. POST accepts strict existing content commands plus `Idempotency-Key`; body limit is 16 KiB. The backend still enforces roles, author separation, revision state, transactional idempotency and its default 60 requests/IP/minute, eight concurrent requests.

Responses are private/no-store, dynamic and noindex. Upstream Auth requests time out at 5 seconds and content requests at 8 seconds, without redirect following. The proxy constructs a fixed upstream route, bearer header and optional command key; it forwards no incoming Origin, arbitrary URL or cookies. Generic allowlisted response DTOs prevent token/provider error disclosure. This is a local implementation boundary, not a public-release security certification.

## Verification

See the final measured command table below after completion of this increment. `pnpm test:content-web` requires a production build, Chromium and DATABASE_TEST_ADMIN_URL. Its runner creates/removes an isolated randomly named database and non-superuser roles. The test-only service uses signed ES256 Auth on 49001, control hooks on 49002, the real content API on 2574 and Next on 3101. No production code accepts fake identities or test control commands.

The fixture allows 1000 content requests/minute because all browser identities share one loopback IP; the production default remains 60. Test trace recording is disabled to avoid retaining password/session requests. Screenshots in `apps/web/test-results-content/` contain only unfilled login forms or fixture editorial content. The separate output directory prevents collisions with guest-game trace artifacts. These are development fixtures and cannot prove hosted Supabase behavior or production capacity.

Browser coverage includes the full three-role workflow, self-review affordance, immutable revision behavior, uncertain-response retry without duplicate creation, cookie isolation, anonymous/ordinary denial, cross-origin POST rejection, role grant/revocation, refresh-token rotation without timing sleeps, malformed commands, forged cookies and logout. Desktop, portrait and short landscape are checked for RTL, overflow and axe violations. Human Arabic review, other browser families, real devices and HTTPS hosting remain release checks.

## Five files/concepts

1. `server-session.ts`: a per-request credential client writes HttpOnly cookies; cookie metadata never establishes authority.
2. `src/proxy.ts`: session refresh must update the incoming render and outgoing browser cookie together.
3. `app/api/content/route.ts`: strict boundary validation and fixed upstream routes keep browser intent separate from authorization.
4. `ContentDesk.tsx`: role/status presentation and same-key uncertain retries delegate outcomes to the backend.
5. `tests-content/content.spec.ts`: real browser, signed Auth and PostgreSQL fixtures test the entire boundary without cloud credentials.

Exercise: run the browser fixture, follow the reviewer/publisher transitions in the test, then compare them with the backend command handler. Locate the database transaction that rejects self-review even if a client bypasses the hidden button.

Next recommended M4 slice: load a validated published bank as a server-only immutable room snapshot, define insufficient-bank behavior explicitly, and keep guest/offline development fixtures clearly separate. Durable results and account-linked history follow independently.

### Measured local gates (2026-10-30)

Node 22.22.1 / pnpm 10.0.0, native PostgreSQL 16.13 on a temporary loopback cluster. Database commands below used an exported DATABASE_TEST_ADMIN_URL pointing only to that temporary bootstrap database. No existing content database or hosted account was modified.

| Command                                                                      | Result                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` in a separate clean source copy   | Exit 0, 318 packages, no downloaded packages; optional native msgpackr-extract build remains unapproved as before |
| `pnpm format:check`                                                          | Exit 0                                                                                                            |
| `pnpm lint`                                                                  | Exit 0                                                                                                            |
| `pnpm typecheck`                                                             | Exit 0                                                                                                            |
| `pnpm test --force`, then `pnpm test` after the fixture regression was added | Exit 0; final total 136 (31 core, 23 shared, 38 web, 14 database validation, 30 server)                           |
| `pnpm test:database`                                                         | Exit 0; 13 real-PostgreSQL tests                                                                                  |
| `pnpm test:admin`                                                            | Exit 0; 7 signed-Auth + HTTP + PostgreSQL tests                                                                   |
| `pnpm build`                                                                 | Exit 0; all packages and Next.js production routes                                                                |
| `pnpm simulate`                                                              | Exit 0; seed 2026, 36 turns, 177 actions, p_gold wins                                                             |

The additional Auth fixture regression verifies that concurrent refresh requests share one rotation rather than rejecting a request while the first response is still being signed. Hosted Supabase, hosted GitHub Actions, real-device performance and production HTTPS cookies have not been verified. CI includes the same explicit database and editorial browser commands. Earlier selector/accessibility/fixture failures were corrected before the final run. The guest and editorial Playwright configurations now use separate artifact directories after a concurrent-run trace cleanup collision was identified.

`pnpm test:content-web` completed with exit 0: six Chromium journeys passed using the separate artifacts directory. The malformed-cookie negative case deliberately produces SDK decoding warnings; it is denied and no cookie/token values are logged. Desktop, mobile and short-landscape screenshots were inspected for Arabic readability and layout.

The full `pnpm test:e2e` regression run completed 24 cases successfully and exited 1 because three desktop cases hit ENOENT while closing trace artifacts during the shared-directory collision; their gameplay assertions had completed. After separating outputs, the exact affected-case rerun below exited 0 with all three passing. Thus all 27 guest browser cases plus six editorial cases passed across the full and affected-path runs; a single all-green full guest rerun is not claimed.

```sh
pnpm --filter @mamalik/web exec playwright test tests/map.spec.ts tests/play.spec.ts --project=desktop --grep 'map pointer/touch|a complete offline match|the live question dialog'
```

The temporary test cluster was checked for remaining generated databases/roles (zero), stopped and removed. The separate clean install copy was removed. The ordinary guest preview was restored with content administration and web auth disabled; enabling the portal requires the explicit existing-account configuration above. No push, deployment or cloud provisioning was performed.
