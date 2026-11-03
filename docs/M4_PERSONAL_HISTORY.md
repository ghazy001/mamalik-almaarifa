# M4 seventh slice — Private personal match history

Verified accounts can inspect their saved match summaries at `/history`. Reads are authorized by the game service and scoped by verified project issuer plus account UUID in SQL. Guests remain playable without database/Auth configuration. This slice adds no ranking, public profiles, opponents' identities or replay. M4 remains incomplete.

## Setup and manual exercise

1. Use the existing account-admission setup in M4_PLAYER_ADMISSION.md: PostgreSQL, MATCH_RESULTS_ENABLED=true, PLAYER_AUTH_ENABLED=true and Supabase URL/publishable key on the game server; WEB_AUTH_ENABLED=true and WEB_PLAYER_AUTH_ENABLED=true with exact WEB_AUTH_ORIGIN, Supabase and fixed CONTENT_ADMIN_URL/GAME_SERVER_URL on Next. The two upstream settings must identify the same game service. No new secret or flag is required.
2. Run `pnpm db:migrate` for migration 0009, which creates the participant owner lookup index. It uses ordinary index creation and can block concurrent writes while building; no hosted database is migrated here. Restart services after rebuilding shared/database packages.
3. Sign in at `/account`, explicitly enter an online room using the account, and finish a game. After saved acknowledgement, follow **سجل مبارياتي** from account, entry/results or the online footer. An already finished room is not required to remain alive for history reads.
4. The screen displays 20 records per page, newest saved first. Use **الصفحة التالية**, **الصفحة السابقة** and **تحديث السجل**. A shared lead is labeled separately; aborted matches have no winner and display a dash for placement. No wins/averages/ranking totals are inferred.
5. Sign out, then refresh the history screen: records clear and a sign-in action appears. An account with no bindings sees an empty state. Former guest results do not appear simply because the same display name is used. Deliberately unavailable services show a retry state without retaining the last page.

Dates are labeled as saved times and displayed in Africa/Tunis. The database records receipt time, not actual match completion time or duration. History includes aborted and development-source results when an account binding was saved; these are personal records, not ranked eligibility decisions. Offline `/play`, unsaved/failed writes and legacy guest-only results have no owner history entry. No real user account or hosted service is provisioned by this increment.

For cloud-free verification, configure a local DATABASE_TEST_ADMIN_URL and run `pnpm test:history`. For UI verification run `pnpm build` then `pnpm test:content-web`: signed local Auth, disposable PostgreSQL and real browser contexts cover history alongside accounts/editorial workflows. Seeded history fixtures are test-only, not fabricated product data.

The authenticated browser runner gives desktop, portrait and landscape separate disposable databases and fresh services. Each layout performs the full workflow; sharing a single process across all layouts exhausted the existing 30-sign-ins/minute budget. Isolation preserves that production limit without retries, sleeps or an authentication bypass. Screenshots remain in `apps/web/test-results-content/<layout>/`.

## Authorization and public contract

Game-service GET `/player/history` accepts a Bearer credential and only optional `cursor`. It rejects browser Origin headers, unverified/revoked credentials, subject/issuer/match/offset/limit selectors and malformed/duplicate cursors. Supabase getUser runs for each accepted read; a room ticket or reconnect token cannot authorize history. Auth provider failure and database failure return safe unavailability without private fields or SQL details. Ordinary authenticated accounts need no editorial roles.

Next GET `/api/history` reads only its HttpOnly provider session, rejects cross-site reads and unknown/duplicate query parameters, and forwards only the validated cursor to its fixed internal game-service endpoint. It never accepts upstream URLs, user IDs or credentials in query parameters. Authorized responses are revalidated against the shared strict DTO before reaching the browser. Provider credentials never enter React props or storage. The `/history` page itself contains a shell, not server-embedded private results.

Success is `{items, nextCursor}`. Each item contains matchId, recordedAt (UTC ISO with six fractional digits), rulesVersion, mode, finalTurn, reason, outcome (`won`, `shared`, `lost`, `aborted`), and the viewer's rank/score/castles/territories/eliminated fields. No other participants, account IDs, email, issuer, name, question IDs/content/answers, seed, bank hash, ownership map or command ledger is included. A match ID is a result reference, not a history-read credential. No single-match detail route exists.

Errors: 401 UNAUTHENTICATED; 400 INVALID_HISTORY_QUERY; 503 HISTORY_UNAVAILABLE; disabled routes return 404 PLAYER_AUTH_DISABLED/HISTORY_DISABLED on the game service or HISTORY_DISABLED on Next. Existing player request limiting may return 429 RATE_LIMITED; Next exposes upstream non-400/401 failures as generic 503. Responses use private/no-store and Pragma no-cache. Disabled/incomplete web configuration renders an unavailable history page and preserves guest play.

## Pagination, limits and lifecycle

`match-history.ts` performs the owner-filtered join and reads at most 21 rows. Twenty summaries form the page; the extra row determines nextCursor. Ordering uses saved timestamp descending and match ID descending as a tie-breaker. Cursor boundaries preserve PostgreSQL microseconds using a UTC SQL projection, avoiding JavaScript Date truncation. The base64url JSON position is bounded to 256 characters and strictly validated; its contents are not secret and forging a position never removes the owner predicate.

Pagination is a sequence of separate committed reads, not a frozen full-history snapshot. Existing immutable records paginate without overlap; newly saved records above the boundary appear after refresh, and delayed commits can affect later pages. There is no unbounded offset, total-count query or user-selected page size. The owner lookup index supports issuer/subject filtering; no production query-plan/capacity claim is made.

Eight concurrent history requests bound provider/database work, alongside the existing eight-provider-verification cap and player endpoint budget of 60 requests/minute/direct peer with 2,048 buckets. The Next server commonly shares one peer budget. Existing pool/statement timeouts remain in force. These are local safeguards, not distributed abuse controls.

The client keeps one page and cursor positions in memory, with no local/session storage for history. It clears results before requests, aborts superseded work and rejects late responses by generation even if cancellation is ignored. Errors, sign-out noticed on revalidation and unmount clear results. Returning focus/visibility refreshes from page one to avoid reusing another session's cursor stack. This does not promise instant erasure of already delivered data while an idle browser remains visible, nor global session revocation.

## Verification and learning

Measured locally during this slice, completed 2026-11-03, with Node 22.22.1, pnpm 10.0.0 and PostgreSQL 16.13. Database commands used an explicit local DATABASE_TEST_ADMIN_URL; each created and removed its own random database and roles. The temporary cluster was removed after confirming zero generated databases/roles remained. No hosted database or Supabase project was changed, and GitHub CI has not been executed here.

| Command                                                  | Exit | Result                                                                                          |
| -------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`               | 0    | Existing workspace/store; lockfile unchanged, not a new clean-checkout measurement              |
| `pnpm format:check`                                      | 0    | Formatting passed                                                                               |
| `pnpm lint`                                              | 0    | All six package tasks passed                                                                    |
| `pnpm typecheck`                                         | 0    | All ten tasks passed; database typecheck repeated after runner changes                          |
| `pnpm test`                                              | 0    | 177 tests passed                                                                                |
| `pnpm build`                                             | 0    | Workspace build and production Next routes passed                                               |
| `pnpm simulate`                                          | 0    | Seed 2026, 36 turns, 177 actions, p_gold winner                                                 |
| `pnpm test:database`                                     | 0    | 13 PostgreSQL cases passed                                                                      |
| `pnpm test:admin`                                        | 0    | 7 authorization cases passed                                                                    |
| `pnpm test:room-bank`                                    | 0    | 3 room-bank cases passed                                                                        |
| `pnpm test:results`                                      | 0    | 9 archive cases passed                                                                          |
| `pnpm test:players`                                      | 0    | 5 admission cases passed, including standalone history route wiring                             |
| `pnpm test:history`                                      | 0    | 4 history integration cases passed                                                              |
| `pnpm test:content-web`                                  | 0    | 12 browser journeys passed: four per isolated layout                                            |
| `caffeinate -i pnpm test:e2e`                            | 0    | Full 30-case guest regression passed in 6.0 minutes; idle-sleep prevention only during this run |
| `pnpm --filter @mamalik/database exec drizzle-kit check` | 0    | Migration metadata consistent                                                                   |
| `git diff --check`                                       | 0    | No whitespace errors                                                                            |

New coverage checks strict public DTOs, private-field rejection, owner/project isolation, timestamp ties and adjacent microseconds, page boundaries with concurrent insertion, cursor forgery, abort/shared/win/loss projection, revocation, unavailable storage, concurrency limits and cancellation races. Browser journeys check real authorized pagination, empty/anonymous/error states, sign-out/account changes, RTL, overflow and axe on desktop, portrait and landscape. HTTP error interception is used only for presentation retry checks; real signed Auth and PostgreSQL exercise the authoritative reads. Desktop/mobile/landscape history screenshots were visually inspected.

Initial checks caught a TypeScript identifier mismatch and a unit fixture reusing a consumed Response body; both were corrected before passing. Early browser runs failed as well. One authenticated rerun exposed the real sign-in budget exhaustion described above; the final isolated run passed all twelve cases. An initial guest run passed 23/30; a subsequent run passed 29/30 before the last recovery case timed out with a roughly 13-hour gap between trace events. The final complete run passed 30/30 while temporarily preventing idle sleep; no gameplay timers or test deadlines changed. Malformed-cookie tests intentionally produce Supabase decoding warnings without accepting the cookie.

The normal guest preview was restored with explicit account/content/result flags false, development questions, web port 3113 and game port 2572. HTTP checks returned 200 for `/online` and the RTL disabled-history page; `/api/history` returned 404 HISTORY_DISABLED. `/health` returned 200, Protocol 3 and result storage disabled. This preview does not display seeded history or require the temporary database.

Five concepts: `match-history.ts` authorizes in SQL rather than filtering a fetched global list; `player-history.ts` is an explicit private-to-public projection; `/api/history/route.ts` keeps credentials server-side and revalidates upstream data; `history-session.ts` handles cancellation and session changes; `history-panel.tsx` presents server-calculated results without domain rules. Exercise: run test:history, find the two records one microsecond apart, then trace how their cursor boundary survives pagination. Next M4 task: specify basic ranking eligibility, including aborted/guest/development matches, before implementing ranking. A reviewed release bank and hosted verification also remain.
