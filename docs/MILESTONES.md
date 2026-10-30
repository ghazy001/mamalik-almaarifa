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

M4 is not complete. Supabase Auth, authenticated admin roles/UI, live-room reviewed-bank integration, durable idempotent results/history and basic ranking remain. Existing fixtures import only as drafts, and live matches still use the public development pack. CLI labels are not identity or authorization.

## M5 — Polish and onboarding

Original premium hybrid 2.5D art, opt-in controllable Howler audio, tutorial, Arabic human QA, reduced motion, mobile performance profiling and reviewed starter question bank. New testers must play without oral instructions.

## M6 — Beta, security, release

Explicitly approved persistent hosting, deployment pipeline, monitoring, load/abuse testing, private beta, balancing and rollback. No production claim before measured capacity and recovery limits exist.

## M7 — Evidence-led expansion

Evaluate ranked seasons, clans, alternate question formats, cosmetics and native apps only after validated MVP priorities. No M1 scaffolding for these systems.
