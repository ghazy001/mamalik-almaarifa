# ADR 0007 — Versioned local question storage before authenticated administration

Status: accepted for the first M4 slice, 2026-10-30.

## Context

M3 guest rooms work but use public development fixtures and retain no match history. M4 needs reviewed private content and durable results. No Supabase project or credentials are required for local development. Introducing an unauthenticated admin endpoint would create the wrong trust boundary.

## Decision

Use PostgreSQL 16 with Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 and node-postgres 8.23.1, pinned in the lockfile. Keep schema ownership in `packages/database`, independent of pure rules and UI. Follow the [official node-postgres integration](https://orm.drizzle.team/docs/get-started-postgresql) and [generated, committed SQL migration workflow](https://orm.drizzle.team/docs/migrations); use stable registry releases rather than the documentation's release-candidate install examples. Run migrations explicitly, never on a game turn or automatically on every server boot.

Store logical UUID questions, numbered content revisions and append-only audit events in a private `content` schema. Content is immutable once inserted, including drafts; editing creates the next revision under a locked parent row with an expected-revision check. The workflow is DRAFT → APPROVED → PUBLISHED → RETIRED. Approval needs a different actor label, a note, and a database-recorded timestamp. A publication must be the latest approved revision; it retires any earlier publication atomically. Failed operations roll back their state and audit writes. Concurrent duplicate publication is rejected once the first succeeds; reads/history reveal the committed state. Import keys make fixture imports retry-safe without modifying existing records. Future admin command idempotency beyond imports is not implemented here.

For this slice, accept sourced Arabic four-choice questions with nonempty HTTPS references, category and explanation. Do not pretend a URL proves truth or licensing. Existing source-backed fixtures import only as drafts; source-less arithmetic waits for an explicit calculation-evidence model. No batch auto-approval. These are reversible workflow defaults; game Rules v1 and Protocol v2 remain unchanged.

Expose a local CLI to operators who already possess a database owner's credentials. Actor strings are audit labels, not authenticated identities or enforced human separation. No HTTP administration route, anonymous grants, browser database client or Supabase service key. SQL guards prevent accidental rewrites; a database owner is still trusted and can change them. The Node-only package export denies browser resolution. New private content must never be placed in the public fixture package.

Provide a `loadPublished()` server integration point returning revision-qualified IDs and detached validated content. Do not switch existing rooms until authenticated administration, a sufficiently reviewed bank and per-match revision snapshots are implemented. No silent fallback claim: current online/offline games explicitly retain the public fixture pack.

## Consequences

Content storage can be exercised without cloud accounts, while live gameplay remains runnable without PostgreSQL. A local Compose service has loopback binding and a non-superuser content owner. Test bootstrap credentials are separate: the test tool creates its own random database and non-superuser role, runs real migrations/workflow tests, then drops only those resources. Database tasks bypass Turbo caching; CI runs the same explicit integration command against its PostgreSQL service.

M4 remains incomplete. Next is Supabase identity verification and server-enforced content roles, followed by the admin review UI, private bank room integration and idempotent durable match results/history. RLS/exposed-schema configuration must be reviewed when Supabase begins; local schema privacy is not a claim of deployed Supabase authorization. Backup/restore, migration deployment and crash recovery are later operational gates.
