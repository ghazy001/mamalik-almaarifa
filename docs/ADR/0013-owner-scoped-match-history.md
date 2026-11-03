# ADR 0013 — Owner-scoped personal match history

Status: accepted for the local M4 increment, 2026-11-01.

Private result participant bindings identify the verified accounts that occupied seats. Personal history must use those identities without allowing client-selected users or exposing the private archive.

Add a protected GET endpoint alongside player admission. The game service verifies Supabase getUser on every read; SQL joins participants/results with both verified issuer and UUID subject in the WHERE clause. Next extracts its HttpOnly credential and proxies only a validated cursor to a fixed upstream. Neither client role metadata nor editorial membership grants access to another player's history.

Return an explicit strict summary DTO with only the viewer's outcome, placement/stats, room mode, rule version, final turn, saved timestamp and match ID. Omit opponent identities, names, credentials, questions, bank hash, seed, territory owners and action logs. Aborts remain visible but are never presented as victories. Guest results without a verified binding cannot be relinked by name.

Use fixed 20-record keyset pages ordered by recorded_at DESC, match_id DESC, reading one extra row for nextCursor. Keep all six PostgreSQL timestamp fractional digits in cursors; JavaScript Date would lose microseconds and can skip records. The bounded base64url cursor is an untrusted position, not an authorization credential: it needs validation, not a secret/signature, because every query still applies owner scoping. Pages are independent committed reads, not a transaction spanning a browsing session. New results are discovered by refreshing.

Add only an owner lookup index; do not rewrite archives or add ranking/statistics tables. Reuse opt-in player account configuration, request budgets and database limits. Bound concurrent history reads to eight. Private no-store responses and in-memory client state prevent intentional persistent caching; refresh/page changes clear old results, and generation checks reject late responses. Focus/visibility refresh starts from page one. Already delivered browser data cannot be remotely erased immediately on revocation.

This is personal history, not public profiles, ranking, replay, duration measurement or active-room recovery. Saved timestamps are database receipt times, not match finish times. Hosted identity/HTTPS, capacity, retention/account-deletion policies and ranking eligibility remain later work.
