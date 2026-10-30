# M4 sixth slice — Verified player account admission

Existing Supabase accounts can now join real private or queued rooms using a verified identity, alongside guests. Finished results retain private seat-to-account references for later authorized history. Guest play remains the default and needs no credentials. Rules v1 and public gameplay Protocol v3 snapshots stay unchanged. M4 remains incomplete.

## Setup and manual exercise

1. Configure an existing local PostgreSQL database and run `pnpm db:migrate` for migrations 0007/0008. Preserve existing settings. This does not provision accounts or a Supabase project.
2. On the game server set MATCH_RESULTS_ENABLED=true, PLAYER_AUTH_ENABLED=true, DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. CONTENT_ADMIN_ENABLED may remain false. Startup requires migrated result participant storage; production requires HTTPS Auth. No service-role key is needed.
3. On Next set WEB_AUTH_ENABLED=true, WEB_PLAYER_AUTH_ENABLED=true, WEB_AUTH_ORIGIN to the exact browser origin, the same Supabase URL/key, CONTENT_ADMIN_URL to the internal game-service origin, and GAME_SERVER_URL to its browser-reachable origin. CONTENT_ADMIN_URL now also serves as the fixed server-side player ticket upstream; it must point to the same game service as GAME_SERVER_URL. Neither browser input nor a request parameter can choose it. Export these before `pnpm dev`, or use `apps/web/.env.local`; root `.env` is read only by the game server. Restart both services.
4. Open `/account`, sign in with an existing email/password account, and return to `/online?account=1`. Choose a display name and create/search/join a room. The selector supports explicit guest play; failed account verification never downgrades automatically. A second tab using the same account cannot take another seat in that room. Other rooms remain allowed.
5. Join two other players, ready everyone and finish or forfeit. After saved acknowledgement, a trusted database owner can inspect `SELECT match_id, player_id, issuer, subject FROM game.result_participants;`. Guest seats have no participant row. No browser history read endpoint exists yet.
6. `/account` offers local browser sign-out. It clears Auth cookies but does not forfeit or reassign a running room. Use the in-room leave action to forfeit. Account signup, password recovery, email sending and account provisioning are outside this slice.

For local verification without cloud credentials, configure DATABASE_TEST_ADMIN_URL for a temporary bootstrap database and run `pnpm test:players`. `pnpm build` then `pnpm test:content-web` exercises player and editorial browser journeys with signed local Auth and real PostgreSQL. These fixtures do not simulate a hosted Supabase deployment and are unavailable in production startup.

## Admission and privacy contract

POST `/api/play-ticket` accepts exactly `{}` with JSON, matching WEB_AUTH_ORIGIN and non-cross-site Fetch Metadata. It uses the existing HttpOnly cookie session, never accepts a token/subject from its body, and forwards only its server-extracted bearer token to the fixed POST `/player/ticket` upstream. Private/no-store responses contain only `{ticket}` or an allowlisted error. Provider tokens never enter React props, Colyseus messages or browser storage. `/account` has no arbitrary redirect parameter.

The game endpoint rejects browser Origin headers, malformed/nonempty bodies and unverified/anonymous/revoked accounts. Supabase getUser verifies each issuance; profile/app metadata grants no gameplay identity or editorial access. It returns a cryptographically random 64-hex ticket, not the provider JWT. A room accepts optional `{name,ticket}`; a guest sends `{name}`. Client actor, subject, issuer, account ID, rules and timestamps remain forbidden join fields.

Tickets expire after 30 seconds measured by the server's monotonic clock and are consumed once. Invalid, expired, reused or disabled account admission rejects rather than becoming guest play. A failed/full/duplicate admission may burn a ticket; retry requests a new one. Limits per process: 256 unused tickets, eight concurrent provider verifications, 60 ticket requests/minute per direct peer address and 2,048 rate buckets. The Next server is commonly one peer, so this is a conservative shared limit, not measured capacity or distributed abuse protection. Restarting loses tickets and live rooms.

Each room checks account uniqueness synchronously when allocating a seat, including dropped seats reserved for recovery. Pre-match explicit leave frees the binding. Once the three-seat core match exists, identity remains attached even after forfeit/disconnect. Reconnect uses the existing private bearer token and grace period; it preserves the binding without re-running provider Auth. Signing out/revocation does not immediately invalidate an issued ticket or an active room. This is verified admission identity, not continuous session enforcement or protection against one person creating multiple accounts/guests.

Identities live in a separate private map, never in the public Seat object. Recipient snapshots contain no account IDs, emails, issuer, ticket or provider credentials. The ordinary public display name remains player supplied and sanitized. Local/offline matches stay inspectable simulations.

## Durable binding

`game.result_participants` stores matchId, canonical seat, verified issuer and UUID subject. It has match/seat and match/account uniqueness, a header foreign key, deny-by-default RLS, revoked public/browser grants and UPDATE/DELETE guards. The trusted database owner remains privileged. Identity rows, result and question references commit or roll back together; they are not retroactively attached to old guest results.

Repository and write queue validate/detach bindings. The canonical idempotency hash includes sorted participants when nonempty. Retries with the same identities succeed even if their input order changes; reassignment under the same match ID conflicts. Empty bindings use the original hash representation for existing guest archive compatibility. The archive JSON itself remains version 1 and answer/name/account-free. New bindings retain personal identifiers privately; no retention/deletion workflow or authorized history reader has shipped yet. The existing bounded-memory writer and crash-loss limits still apply.

## Verification and next work

Final measured commands are recorded below after checks. Unit tests cover expiry/replay, ticket/provider bounds, configuration, input injection, detached retry identities and client cancellation/no fallback. Real signed Auth/HTTP/Colyseus/PostgreSQL tests cover revoked credentials, origins, duplicates, guest replacement, bearer reconnect, public privacy, atomic durable mappings, conflicts, rollback, RLS and mutation guards. A standalone entrypoint case verifies enabled configuration and shutdown persistence. Browser journeys exercise an ordinary account with two real guest contexts on desktop, portrait and landscape, saved acknowledgement, denied editorial access, cookie/token boundaries, sign-out, RTL/overflow and axe checks.

No hosted Supabase/PostgreSQL, hosted CI, production HTTPS cookies, physical-device performance, global revocation or public capacity is certified. The source's fixture users and shortened one-turn browser settings are tests only. Personal history, basic ranking, a reviewed release bank and hosted verification remain M4 work.

Five concepts/files: `player-access.ts` turns verified provider identity into a bounded capability; `/api/play-ticket/route.ts` keeps provider credentials server-side; `kingdom-room.ts` separates private identity from public presentation; `match-archive.ts` makes immutable outcome/identity writes atomic and retry-safe; `online-session.ts` sends intent and never falls back from account verification failure. Exercise: run test:players, find the replay rejection, then trace how the mixed-room test reconnects and still saves exactly two account bindings. Next task: authorize paginated personal history by the same verified issuer/subject, without exposing other participants' private identifiers.

## Measured local gates (2026-10-30)

Node 22.22.1 / pnpm 10.0.0; temporary native PostgreSQL 16.13 on loopback. Database commands used DATABASE_TEST_ADMIN_URL for an owned bootstrap database. Each runner created/dropped its own random database and non-superuser roles; no application database or hosted service was modified.

| Command                                                                                           | Final result                                                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline --store-dir /Users/ghazi.saoudi/Library/pnpm/store/v10` | Exit 0; existing workspace/store, not a new clean-checkout measurement                            |
| `pnpm format:check`                                                                               | Exit 0                                                                                            |
| `pnpm lint`                                                                                       | Exit 0                                                                                            |
| `pnpm typecheck`                                                                                  | Exit 0, including test sources                                                                    |
| `pnpm test`                                                                                       | Exit 0; 170 tests: core 31, shared 23, web 44, database validation 28, server 44                  |
| `pnpm test:database`                                                                              | Exit 0; 13 real PostgreSQL cases                                                                  |
| `pnpm test:admin`                                                                                 | Exit 0; 7 signed local Auth/HTTP/PostgreSQL cases                                                 |
| `pnpm test:room-bank`                                                                             | Exit 0; 3 real bank/socket/standalone cases                                                       |
| `pnpm test:results`                                                                               | Exit 0; 9 real archive/socket/standalone cases                                                    |
| `pnpm test:players`                                                                               | Exit 0; 5 signed Auth/room/PostgreSQL/standalone cases                                            |
| `pnpm build`                                                                                      | Exit 0; production web, server and libraries                                                      |
| `pnpm simulate`                                                                                   | Exit 0; seed 2026, 36 turns, 177 actions, p_gold wins                                             |
| `pnpm test:e2e`                                                                                   | Exit 0; 30 guest gameplay journeys across desktop, portrait and landscape                         |
| `pnpm test:content-web`                                                                           | Exit 0; 9 editorial/account journeys on all three layouts, repeated on the final production build |
| `pnpm --filter @mamalik/database exec drizzle-kit check`                                          | Exit 0; migration metadata consistent                                                             |
| `git diff --check`                                                                                | Exit 0                                                                                            |

An unused Express error-handler parameter was corrected without changing its required four-argument signature. Typecheck also caught a parameterized validation-test fixture that needed to wrap array cases rather than spread their arguments; the corrected 28 database validation tests and final full test gate passed. Expected malformed-cookie warnings come from the existing forged-cookie denial test. Account sign-in and saved-result screenshots were visually inspected at desktop/mobile/landscape; automated checks found no tested overflow or axe violations. The full guest suite preceded the last small entry-copy/input-validation refinements; web unit tests and the complete nine-case account/editorial suite were rerun afterward. CI is configured for the same gates, including uncached test:players, but hosted CI was not run here.

Cleanup confirmed zero generated databases/roles before stopping and removing the owned temporary PostgreSQL cluster. The local guest preview was restored at `http://127.0.0.1:3113/online` with health on port 2572; HTTP checks passed, and `/account` rendered its default unavailable state with account flags explicitly off.
