# M4 eighth slice — Private personal standing

Status: owner-approved eligibility, points and private visibility; local implementation verified, 2026-11-04. Rules v1 remain unchanged.

## Approved product policy

The first view: a signed-in player sees their own points, position, eligible-match count, sole wins and shared wins. No other account's identity, display name, email or result is exposed. This is private standing within the same verified Auth project, not a public leaderboard or skill rating. A public board would need a separate public-alias and participation policy; match archives deliberately contain no display names.

Approved ranking policy `basic-v1`:

| Decision            | Approved default                                                                          | Trade-off                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Room type           | Matchmaking only                                                                          | Private rooms stay practice; friends cannot simply create an invite room for points                         |
| Accounts            | All three seats have distinct verified issuer/subject bindings from the same Auth project | Mixed guest/account matches stay in history but do not affect standings                                     |
| Questions           | Published-source bank only                                                                | Development fixtures cannot earn points; publication alone does not prove secrecy or release quality        |
| Rules               | Exactly Rules v1, 36 turns, 10-second selection, 15-second answer window                  | Shortened fixtures and custom playtests are excluded; an early castle victory need not consume all 36 turns |
| Finish              | CASTLES or TURN_LIMIT, with at least one consumed question                                | ABORTED, LAST_PLAYER, unplayed matches and unsaved results are excluded for everyone                        |
| Sole victory        | 3 points to the sole saved winner                                                         | Rewards an outright victory without using territory totals across matches                                   |
| Shared victory      | 1 point to each saved joint winner                                                        | Preserves shared victory without an arbitrary winner; total awarded points may differ from a sole victory   |
| Other placements    | 0 points; eligible-match count increases                                                  | Second and third place do not award ranking points in this first policy                                     |
| Equal totals        | Share position; dense ranking, such as 1, 1, 2                                            | No hidden time, UUID or match-count tie-breaker                                                             |
| No eligible matches | Unranked, position null and zero totals                                                   | Never fabricate a position for a guest or an account with only practice results                             |
| Time window         | All saved eligible results under this policy; no season or decay                          | Simple and auditable, but rewards participation volume rather than estimating skill                         |
| History             | Remains unchanged and continues to include practice and aborted results                   | History and ranking answer different questions                                                              |

Example: account A has two sole wins and a shared win: 7 points. Account B has two sole wins: 6 points. Account C also has 6 points. Their positions are 1, 2, 2. An account D with 3 points follows at position 3. A two-way shared victory awards 1 point to each winner and 0 to the remaining player; a three-way shared victory awards 1 to each.

Ranking derives from the server-saved winner list, never from client-reported points, answer speed, territory totals or local results. Same-account duplicate seats are already rejected; the unique participant binding and match ID prevent an identical result-write retry from adding another contribution. This does not establish that three accounts represent three different people.

## What the current data can and cannot establish

`matchArchiveSchema` stores mode, question source, pinned bank hash, exact rules, final turn, consumed question IDs, reason, winners and placements. `game.result_participants` stores verified per-seat project/account bindings in the result transaction. These support the approved eligibility checks without rewriting immutable archives or adding personal data to them.

The archive does not store a complete action log, every forfeit, exact completion time, latency distribution or a competition-approved bank marker. Excluding LAST_PLAYER does not prove an otherwise eligible CASTLES/TURN_LIMIT match had no earlier forfeit. The policy allows such matches and must not be described as excluding all forfeits. Requiring every match to be forfeit-free would need new authoritative provenance for future results and an explicit legacy policy.

Published content can include publicly inspectable fixtures if a trusted operator publishes them. Publication is not a confidentiality guarantee. A reviewed release bank and measured latency-fairness review remain required before presenting standings as a public competitive release. Queue room IDs are not a collusion boundary; multiple accounts, deliberate shared draws and question memorization remain possible. Cumulative points are provisional participation results, not an MMR or anti-cheat certification.

The policy includes already committed results that satisfy its explicit conditions. It cannot relink guest history by name. No activation cutoff or fresh-start reset is applied. Database receipt time is not the game's finish time.

## Implementation

1. A versioned, testable ranking policy and server-only repository calculate same-project aggregates in SQL without fetching a global archive list into JavaScript.
2. A strict shared standing DTO returns policy version, own points, nullable position, eligible matches, sole wins and shared wins. No peer identities, question provenance or client-selected issuer/subject filters.
3. A freshly authenticated game-service read and fixed Next proxy use the existing HttpOnly session, input validation, request budgets, concurrency bounds and private/no-store responses.
4. An opt-in Arabic RTL screen links from account/history and distinguishes unranked, unavailable, signed-out and ready states. It clears private results on revalidation and account changes.
5. Integration/browser tests cover the policy, privacy and session behavior. Rules, architecture, protocol, README, milestones and ADR 0014 document the approved slice. M4 still needs the reviewed release bank and hosted verification.

Relevant files:

```text
packages/database/src/ranking-policy.ts
packages/database/src/basic-ranking.ts
packages/shared/src/standing.ts
apps/game-server/src/player-standing.ts
apps/game-server/tests/standing.postgres.test.ts
apps/web/src/app/api/standing/route.ts
apps/web/src/app/standing/page.tsx
apps/web/src/features/standing/
apps/web/tests-content/standing.spec.ts
docs/ADR/0014-basic-ranking.md
```

The ranking policy has its own version. It must not change in-match ownership, deadlines, winners or Rules v1. The response reports the policy being applied, so a later policy change cannot silently claim that old totals used the same definition. Aggregation derives from immutable results; no mutable points balance is stored.

## Required verification matrix

- Eligible sole win, two-way shared win, three-way shared win and a non-winning placement.
- Every excluded mode/source/reason/configuration; early CASTLES victory with normal configured rules remains eligible.
- Zero consumed questions, missing bindings, mixed guests, cross-project participants and another project's results.
- Exact retries count once, changed archive/bindings remain rejected, and concurrent result commits become visible without lost updates.
- Equal totals share position, sparse score totals use dense positions, zero-point eligible participants rank correctly, and no eligible results produce null position.
- Unknown identity selectors, malformed queries, unverified/revoked credentials, database/provider failures and concurrency limits return safe responses.
- No public account IDs, names, emails, bank hashes, answers or other participants' records in the DTO or HTML.
- Account switches, sign-out, superseded requests, desktop/portrait/landscape RTL, keyboard access, overflow and axe.

Measured verification is recorded below.

## Setup, API and manual exercise

No migration or new secret is required. Reuse the player-account setup from M4_PLAYER_ADMISSION.md: game-server PLAYER_AUTH_ENABLED=true and MATCH_RESULTS_ENABLED=true with DATABASE_URL and Supabase settings; Next WEB_AUTH_ENABLED=true and WEB_PLAYER_AUTH_ENABLED=true with the same Auth project, exact WEB_AUTH_ORIGIN and fixed CONTENT_ADMIN_URL pointing to the game service. Run existing migrations and rebuild/restart. To earn points, also configure GAME_QUESTION_SOURCE=published, a sufficiently populated reviewed bank and three account-admitted players. Development, private and mixed-guest results still appear in history but do not count toward standing.

Open `/account`, sign in and follow **ترتيبي الشخصي**; `/history` links to it too. An account without eligible results shows a dash for position and zero totals. Finish a qualifying game and wait for saved acknowledgement; refresh standing. Compare ties under the documented dense rule. Sign out in another tab and refresh/return focus: private totals clear. Turning off account features leaves a friendly disabled screen and guest play.

GET `/player/standing` requires the verified Bearer transport credential and accepts no query parameters. GET `/api/standing` extracts the HttpOnly session and proxies to that fixed server endpoint, rejecting foreign origins/cross-site reads and all query parameters. Both revalidate the strict DTO. Response: `{policyVersion: "basic-v1", points, position: number | null, eligibleMatches, soleWins, sharedWins}`. The DTO checks the points equation, win counts and null-position consistency. No peer IDs, aliases, names, emails, archives, question metadata or credentials are returned or embedded in the page.

Server errors: 400 INVALID_STANDING_QUERY, 401 UNAUTHENTICATED, 503 STANDING_UNAVAILABLE; disabled player access returns 404 PLAYER_AUTH_DISABLED, and an absent standing reader returns 404 STANDING_DISABLED. The player router also retains Origin denial and 429 RATE_LIMITED. Next returns 404 STANDING_DISABLED when its player flag is off, 503 for incomplete configuration/unavailable upstream, and safe 400/401 errors. Responses are private/no-store, with Pragma no-cache. Gameplay protocol remains v3: this is a separate authenticated HTTP read.

History and standing share eight concurrent reads and the existing 60 requests/minute/direct-peer budget; provider verification is also capped at eight. The pool remains four connections with a 10-second statement timeout; Next uses a 15-second upstream timeout. A single aggregate statement ranks only the verified project and returns one viewer row. No global archive list enters JavaScript, and no mutable points table or write-path hook is added. PostgreSQL still performs aggregation over the project's eligible data; this has not been capacity-certified. The web service commonly shares one direct-peer budget across users.

Each read sees one committed SQL snapshot. An identical write retry cannot create a second primary-key match/participant contribution; concurrent commits require no increment transaction and appear on later reads. Previously committed eligible results count, including a committed write whose acknowledgement was lost; client storage status is not an eligibility credential. Content retirement does not rewrite saved provenance or retroactively remove points. There is no moderation override, season or score-reset API in this slice. Totals are validated as safe JavaScript integers; out-of-range/malformed aggregates fail closed.

The client retains only the current summary in memory and clears it before refresh, on errors, on sign-out noticed by revalidation and on unmount. It aborts superseded requests and also checks generations if cancellation is ignored. Returning focus/visibility refreshes. This does not instantly erase an already delivered idle view on remote revocation. Hosted Auth/HTTPS, release content, latency fairness, abuse prevention and capacity remain outstanding; these local checks do not certify a public competitive launch.

## Five concepts and exercise

`ranking-policy.ts` defines the reviewed scoring policy with explicit inputs. `basic-ranking.ts` calculates standings in one SQL snapshot instead of maintaining an increment balance. `standing.ts` validates the public summary and its arithmetic. The Next proxy keeps credentials server-side. `standing-session.ts` rejects stale responses when a session changes. Exercise: inspect the test accounts with totals 7, 6, 6, 1 and 0; explain why their positions are 1, 2, 2, 3 and 4, then find the retry test that preserves a single contribution.

## Verification — 2026-11-04

Local Node 22.22.1/pnpm 10.0.0 and a disposable PostgreSQL 16 cluster were used. Auth checks use signed local HTTP fixtures, not a hosted Supabase project. The runner cleaned its generated databases/roles; both counts were zero before stopping/removing the owned temporary cluster. No real database was migrated or rewritten, no cloud service was provisioned, and GitHub CI was configured but not executed here.

| Command                                    | Exit | Result                                                                                                |
| ------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` | 0    | Existing workspace/store up to date; no dependency/lockfile changes, not a fresh-checkout measurement |
| `pnpm format:check`                        | 0    | Formatting passed                                                                                     |
| `pnpm lint`                                | 0    | Six package tasks passed                                                                              |
| `pnpm typecheck`                           | 0    | Ten tasks passed                                                                                      |
| `pnpm test`                                | 0    | 186 tests passed, including policy, DTO, cancellation and shared read-budget coverage                 |
| `pnpm build`                               | 0    | Six workspace build tasks passed; `/standing` and `/api/standing` included                            |
| `pnpm test:standing`                       | 0    | Five PostgreSQL/HTTP cases passed; policy matrix covers all three seats and exclusions                |
| `pnpm test:players`                        | 0    | Five account admission cases passed, including actual standalone standing route wiring                |
| `pnpm test:history`                        | 0    | Four history regression cases passed                                                                  |
| `caffeinate -i pnpm test:content-web`      | 0    | Fifteen browser journeys passed: five per isolated desktop/portrait/landscape layout                  |
| `caffeinate -i pnpm test:e2e`              | 0    | Full 30-case guest regression passed in 6.5 minutes                                                   |
| `git diff --check`                         | 0    | No whitespace errors                                                                                  |

The first native initdb attempt was blocked by sandbox shared-memory restrictions; approved native execution created only the temporary test cluster. The first SQL run failed because PostgreSQL inferred text for parameter-only CASE branches. Explicit integer casts fixed the aggregation; all five cases passed on rerun. No gameplay deadlines or scoring changed to make tests pass. Malformed-cookie editorial tests retain expected SDK warnings without accepting those cookies.

The normal guest preview was restored on web 3113/game 2572 with account/content/result flags explicitly false and development questions. HTTP checks returned 200/RTL for `/online` and the disabled `/standing` screen; `/api/standing` returned 404 STANDING_DISABLED. Health returned 200, Protocol 3 and result storage disabled. No synthetic standing data is shown in that preview.

Browser evidence uses synthetic stored-result fixtures, clearly confined to the guarded disposable test database; it is not proof of a live full-length published match or a reviewed release bank. New standing journeys cover real authenticated SQL reads, zero-data accounts, forbidden selectors/origins, private DTOs, sign-out/account changes, safe retry, keyboard activation, RTL, overflow and axe. HTTP error interception is used only for the presentation retry branch. Desktop and mobile screenshots were visually inspected. Existing database/admin/room-bank/result suites were not rerun for this additive read-only slice; CI retains them. No production capacity, multiple-account resistance or hosted identity claim is made.
