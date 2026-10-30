# ADR 0009 — Server cookie sessions for the editorial workspace

Date: 2026-10-30. Status: accepted for the M4 local increment.

## Context

The content API already verifies Supabase accounts and private PostgreSQL roles. Editors need Arabic forms without copying bearer tokens or exposing the database. Gameplay guests must remain independent of content-team identity. Existing email/password accounts are sufficient for this slice; signup, recovery and player identities are separate work.

## Decision

Use Next.js as a same-origin server proxy with `@supabase/ssr` 0.12.7 and the existing compatible Supabase JS 2.118.0. Create a separate server client per request. Proxy refreshes the session before server rendering and propagates cookies to request and response. Cookies are HttpOnly, SameSite=Lax, Path=/, Secure and `__Host-` prefixed for HTTPS; loopback HTTP uses `mm-auth`. No browser Supabase client or localStorage session exists.

The sign-in handler accepts existing-account credentials, returns only success/error and writes session cookies. The protected page and fixed content proxy extract access tokens server-side. `getSession` is never an authorization decision: the game service independently verifies `getUser` and transactional database roles on every request, including retries. It never accepts browser-provided actor/role metadata. Editorial answers are intentionally visible to authorized staff, while gameplay snapshots remain sanitized.

Require exact configured Origin plus JSON for all cookie-authenticated POSTs, reject cross-site fetch metadata, bound bodies/concurrency/timeouts, disable caching and reject upstream redirects. Keep the API server's direct-browser Origin denial. Only the proxy constructs its fixed upstream URL and bearer header; incoming credentials/Origin headers are not forwarded.

Uncertain writes retain the original command/idempotency key in component memory, disable other writes and offer the same-request retry. The database ledger remains the authority. Do not persist answer-bearing forms or pending commands in browser storage. Reload loses local edits/pending keys; staff should inspect the latest revision before creating a replacement.

## Consequences and limits

HttpOnly cookies deliberately differ from Supabase's usual browser-client SSR setup: browser JavaScript has no auth client and calls our fixed proxy. Future OAuth/recovery/mobile identity will require a reviewed flow, not a browser client added casually. Cookie contents are credentials, not trusted profile data; tampering must fail server verification. SameSite and HttpOnly do not replace Origin validation or broader XSS review.

Local signed Auth fixtures plus real PostgreSQL test the flow, including refresh rotation, logout, denied roles, revocation and uncertain write retry. They do not certify hosted Supabase behavior, HTTPS cookie deployment, token reuse under distributed concurrency, public abuse resistance or crash recovery. No cloud accounts are provisioned. Process-local limits require deployment-specific review before release. Rules v1 and gameplay Protocol v2 remain unchanged.

References: [Supabase SSR server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [advanced SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy). Installed SDK declarations/source determine the exact cookie API used here.
