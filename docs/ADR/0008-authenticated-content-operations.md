# ADR 0008 — Supabase identity and transactional content permissions

Status: accepted for the second M4 slice, 2026-10-30.

## Context

The storage CLI trusts whoever holds database-owner credentials. Its actor labels are not identities. A future admin UI needs a server boundary that authenticates accounts, prevents self-assigned content privileges and safely handles retries. Guest gameplay must still run without a cloud project or database.

## Decision

Add an opt-in `/admin` HTTP boundary to the persistent Node game service. Use pinned `@supabase/supabase-js` 2.118.0 and call `auth.getUser(explicitJwt)` on every request. Supabase documents that [getUser contacts the Auth server and returns an authenticated user record](https://supabase.com/docs/reference/javascript/auth-getuser); no client session object or decoded profile is accepted as authority. The SDK never persists, refreshes or installs a user's session. Use only a project URL and publishable API key. No service-role key or JWT signing secret enters this service. Provider failure denies access with a bounded request timeout; no local identity bypass or cached-user fallback.

Verify identity through the configured project endpoint; accept only an authenticated, explicitly non-anonymous UUID user. Profile metadata and app metadata grant no content role. The project's canonical `/auth/v1` issuer and lowercased UUID form the identity. Hash that pair into a stable `auth:<sha256>` content actor, avoiding project collisions and client-supplied authors/reviewers. Do not claim immediate session revocation: [Supabase access-token/session lifetime](https://supabase.com/docs/guides/auth/sessions) still applies. When the provider rejects a user/token, the API denies it. Real hosted verification remains a deployment/configuration test, not something the local fixture certifies.

Store editor, reviewer and publisher memberships in private PostgreSQL tables, keyed by issuer, subject and role. No implicit super-role: all three may read; editor creates/revises; reviewer approves; publisher publishes/retires. A user may hold multiple roles but cannot approve their own revision. Bootstrap/revoke roles only through trusted local operator credentials, with append-only role audit entries. Role labels in cookies, request bodies or user metadata are ignored/rejected. Existing operator CLI access remains privileged and can bypass account-level policies deliberately.

Check memberships under `FOR SHARE` in the same database transaction as the content operation and audit. Revocation waits for already-authorized transactions, then subsequent requests with the same valid token are denied; do not cache roles. Require an idempotency key on HTTP writes. A per-identity/key ledger atomically stores a hash of the parsed command and a validated, answer-free response. Concurrent retries return the same response once; a changed command with the same key conflicts. Failed commands roll back ledger/content/audit together. Permission is rechecked even for a replay. Retention/archival policy is deferred rather than silently expiring keys and risking duplicates.

Enable deny-by-default RLS on all six private content tables with no browser policies. Revoke PUBLIC and existing Supabase anon/authenticated grants; keep `content` out of exposed schemas. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) explains that grants and RLS are distinct controls. The trusted database owner used by this local service bypasses RLS; application authorization is enforced by the transaction wrapper. An unprivileged test role remains unable to read rows even after accidental SELECT grants. This is not certification of a deployed Supabase schema or protection against an owner changing guards.

Use bearer headers only, no cookie/query tokens, no credentialed browser CORS surface. This slice rejects Origin-bearing requests; the next Next.js admin UI needs a deliberate same-origin server proxy/session boundary. Bound JSON bodies, pagination, request rate and concurrent requests; sanitize errors and never log tokens, SQL parameters or correct answers. Authorized reviewers can inspect complete question content through the admin API; gameplay recipients still receive the existing sanitized protocol.

## Consequences

Without explicit enablement the admin API returns a disabled response; the guest preview remains database-free. Enabled startup requires migrated reachable storage, a valid project URL and publishable key. Production config requires HTTPS Auth; non-production permits loopback HTTP for local Supabase/fixtures. Migrations remain explicit. Database watchers now build the server's new dependency during `pnpm dev`.

Tests use a test-only Auth `/user` fixture with ephemeral ES256 keys, actual JWT verification and real HTTP calls, plus disposable PostgreSQL databases/roles. It is not a hosted Supabase instance or a deployable authentication fallback. The new uncached `pnpm test:admin` CI gate exercises full role separation, content writes, retries and revocation. No sign-in/admin UI, player-account mapping, room bank switch, match history, deployment or cloud account provisioning is included.
