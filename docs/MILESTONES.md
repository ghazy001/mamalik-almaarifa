# Delivery milestones

## M1 — Foundation and deterministic rules

Implemented: pnpm/Turbo workspace, strict TypeScript, ESLint/Prettier, CI, Next.js RTL foundation, standalone Colyseus health service, 15-node map, deterministic rules, pure replayable headless simulation, private/public separation, Zod commands/events, unit/integration/browser tests and canonical docs. See VERIFICATION.md for the measured gates rather than inferring completion from this checklist.

Rules remain reversible playtest assumptions: equal-distance castles, seeded order/deck, 36 turns, 10-second target selection, 15-second question, exact-time defensive ties, home-castle elimination/land transfer and joint-score winners. No gameplay network coordination, finished map art, accounts or database is implemented. Disconnect grace is proposed in GAME_RULES and reserved in PROTOCOL.

## M2 — Visual offline vertical slice

Completed at `/play`: an entire local match against two explicitly scripted opponents, original Phaser isometric terrain, adjacent-target selection through canvas or Arabic DOM controls, timed four-choice questions, human attack/defense, resolved answer explanations, ownership updates, capture/defense effects, scores, castle elimination, placements and replay. The existing `/map` route remains a paused exploration preview.

The explicit-time local controller delegates all domain outcomes to game-core. The native Arabic dialog and DOM territory controls work without canvas precision; timers continue while minimized/backgrounded and reduced motion omits effects. All 79 unit/integration tests and 18 Chromium journeys passed, including full matches/replay on desktop, portrait and landscape. See M2_OFFLINE_MATCH.md for exact commands, sources and limits. Offline fixture answers remain inspectable, results are in memory; networked gameplay belongs to the separate M3 slice below. No M1 rules/protocol changed.

## M3 — Real-time multiplayer

Completed for the local guest-match scope: authoritative three-seat private rooms and basic guest matchmaking, invitations, session-bound identity, server timers/questions/results, validated recipient snapshots and intent-only UI, readiness bounds, reconnect/forfeit and graceful shutdown abort. The first two records remain historical in M3_PRIVATE_ROOMS.md and M3_MATCHMAKING.md. See M3_RESILIENCE.md and ADR 0006 for the completion evidence.

Three isolated browser sessions finish the same match under an 80 ms round-trip simulator while snapshots are suppressed/duplicated/replayed, a question participant reconnects/reloads, and an observer freezes across turn progression. Real socket tests at 160 ms additionally restore an accepted occupied-duel answer without changing the deadline, reject replacements/spectators, expire an offline question and deliver an aborted result on normal graceful shutdown. Keyboard/manual recovery is verified in the native question dialog on all three layouts. There are 106 passing unit/integration tests and 27 passing Chromium cases across the full run plus the final affected-path run.

This is not a production-release or network-fairness certification. Rules v1 still favor lower-latency receipts, guests are not accounts, development fixtures are public and matches are in memory. The browser fixture bounds the match to six turns while keeping normal action windows; production remains 36 turns. Physical packet loss, browser-family/device coverage, crash recovery, hosted abuse/capacity budgets and competitive fairness review remain release gates. M4 begins next; no identity/database implementation is included in this completion increment.

## M4 — Identity, content, persistence

In progress. The first slice adds the server-only database package, versioned SQL migrations, validated sourced Arabic questions, immutable content revisions, transactional draft/approval/publication/retirement, append-only audit entries and a trusted local CLI. Real PostgreSQL integration tests exercise workflow failures, races, rollback and database guards under a non-superuser role. See M4_CONTENT_STORAGE.md and ADR 0007.

The second slice adds opt-in Supabase `getUser` verification and project-scoped editor/reviewer/publisher memberships for protected content HTTP operations. Author/reviewer identity is server-derived; transactional membership locks, role audit, write idempotency and deny-by-default private-table RLS are covered by real PostgreSQL and signed local Auth fixture tests. See M4_IDENTITY_AUTH.md and ADR 0008 for current configuration/evidence; the first storage record is historical.

The third slice adds Arabic `/signin` and `/admin`, server-only HttpOnly cookie sessions, a fixed same-origin content proxy, explicit role/status controls and safe uncertain-write retries. The game service remains the authorization authority. See M4_EDITORIAL_UI.md and ADR 0009 for current configuration, browser evidence and limitations; earlier records are historical.

The fourth slice connects optional published revisions to private/queued rooms. Each room pins a validated private snapshot before admitting players; insufficient/invalid/unavailable banks reject new rooms without fallback. Running rooms finish without database reads and retain their initial revisions across content changes. Development remains the default. See M4_PUBLISHED_ROOM_BANK.md and ADR 0010 for configuration, operational bounds and current evidence.

The fifth slice adds optional immutable result archives, transactional revision references, idempotent retries and honest Protocol v3 storage status. See M4_RESULT_ARCHIVES.md and ADR 0011 for delivery limits and verification.

The sixth slice adds existing-account admission through server-verified one-use tickets, mixed guest/account rooms, private seat identity and transactional result bindings. See M4_PLAYER_ADMISSION.md and ADR 0012.

The seventh slice adds owner-authorized personal history: verified issuer/subject SQL scoping, sanitized own-result summaries, precision-safe 20-item keyset pages and a protected Arabic screen. See M4_PERSONAL_HISTORY.md and ADR 0013.

M4 is not complete. Hosted verification and a reviewed release bank remain. Existing fixtures import only as drafts; publishing public fixtures does not make them confidential. Trusted operator CLI labels remain outside the account-authorization boundary.

The eighth slice adds owner-approved private personal standing under basic-v1: published matchmaking, three same-project accounts, standard rules, eligible completed results, 3/1/0 win points and dense ties. See M4_BASIC_RANKING.md and ADR 0014. No public leaderboard or MMR is included.

The ninth slice prepares 42 private sourced Arabic DRAFT/PENDING candidates, a human review worksheet, offline validation and an atomic retry-safe draft importer. Generic tests and CI use public synthetic fixtures; answer-bearing artifacts stay Git-ignored and require private backup. No question is automatically approved or published. See M4_QUESTION_PACK.md and ADR 0015. Independent human review of at least 36 accepted questions and hosted verification remain outstanding.

The tenth slice adds `pnpm test:m4`: a combined local acceptance gate for standard 36-turn published-account matchmaking, private revision pinning, reconnect, pending/committed results, accurate own history/standing and a separate compiled-server restart. It uses real sockets/PostgreSQL and signed local Auth/synthetic content, without approving the private candidates or certifying hosted services. See M4_ACCEPTANCE.md. Human review and hosted verification still gate M4 completion.

## M5 — Polish and onboarding

Started independently at the owner's request on 2026-11-04 while M4 question review is explicitly deferred. `/learn` adds optional Arabic guided practice on the real map/rule core: untimed target selection, one timed public-fixture question, outcome/retry, victory guidance and full-match links. It adds no persistence, accounts or approval of private candidates. A second slice adds original opt-in Howler cues to practice/local/online pages with Arabic mute/volume controls inside and outside question dialogs, cancellation and silent background/reconnect handling. A third slice avoids equivalent-map rebuilds, enforces the intended render cap, fixes narrow enlarged-text quiz reflow and records repeatable browser work/timing samples. See M5_ONBOARDING.md, M5_AUDIO.md and M5_MOBILE_QUALITY.md for verification and limits. M4 remains incomplete; hosted verification and reviewed-bank gates remain.

A fourth slice caches static WebGL artwork, preserves independent interaction/effects, recovers from real graphics context loss and keeps Canvas direct rendering. Production-browser observations compare draw submissions before/after; fixed-size supersampling trades bounded memory for lower steady drawing work. See M5_TERRAIN_CACHE.md and ADR 0018 for evidence and limits.

Remaining: original premium hybrid 2.5D art, physical-device audio/listening QA, observed newcomer validation, Arabic human QA, reduced-motion/device performance and memory profiling and the deferred reviewed starter question bank. New testers must play without oral instructions.

## M6 — Beta, security, release

Explicitly approved persistent hosting, deployment pipeline, monitoring, load/abuse testing, private beta, balancing and rollback. No production claim before measured capacity and recovery limits exist.

## M7 — Evidence-led expansion

Evaluate ranked seasons, clans, alternate question formats, cosmetics and native apps only after validated MVP priorities. No M1 scaffolding for these systems.
