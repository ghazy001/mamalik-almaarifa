# ADR 0012 — Verified account admission through single-use room tickets

Status: accepted for the local M4 increment, 2026-10-30.

Guest transport seats and immutable results already exist, but account identities must be verified before personal history can authorize reads. Passing provider JWTs into browser storage or Colyseus join options would widen credential exposure.

Reuse the existing HttpOnly Supabase session. A same-origin Next POST extracts the credential server-side; the game service independently calls Supabase getUser and issues a random, single-use, 30-second ticket. Only that opaque capability enters room options. An invalid ticket never silently becomes a guest admission. Editorial membership checks remain separate, so an ordinary verified account can play without reading questions.

Admission records an immutable issuer/subject binding to the allocated seat in a private room map. One account may occupy one seat per room, including during reconnect grace; guest/account mixed rooms remain allowed. Pre-match departure releases the binding; prepared-match departure retains it for the final result. Client-supplied identity fields are rejected. Reconnection keeps its existing bounded bearer-capability semantics, without new provider verification. Signing out does not unbind or forfeit a running match.

Private result_participants rows commit with the outcome and consumed question references. The idempotency hash covers the sorted bindings as well as the archive, preventing later reassignment. Empty bindings retain the previous archive hash algorithm, so existing guest writes remain retry-compatible. Archive version 1 and public Protocol v3 snapshots are unchanged; join options gain an optional bounded ticket. This is an additive admission capability; old guest clients still work against the updated server.

Tickets and rate buckets are bounded process memory, not distributed infrastructure. Ticket theft is credential theft; tickets must stay out of logs, URLs and persistent browser storage. A ticket already issued can remain usable until its 30-second expiry after provider sign-out/revocation, and an existing room remains bound until it ends. There is no immediate global revocation, user signup, password recovery, profile, account deletion, personal history or ranking in this slice. No claims of competitive account exclusivity across rooms or people are made. Hosted Auth/HTTPS and production abuse/capacity still require verification.
