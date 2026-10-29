# Delivery milestones

## M1 — Foundation and deterministic rules

Implemented: pnpm/Turbo workspace, strict TypeScript, ESLint/Prettier, CI, Next.js RTL foundation, standalone Colyseus health service, 15-node map, deterministic rules, pure replayable headless simulation, private/public separation, Zod commands/events, unit/integration/browser tests and canonical docs. See VERIFICATION.md for the measured gates rather than inferring completion from this checklist.

Rules remain reversible playtest assumptions: equal-distance castles, seeded order/deck, 36 turns, 10-second target selection, 15-second question, exact-time defensive ties, home-castle elimination/land transfer and joint-score winners. No gameplay network coordination, finished map art, accounts or database is implemented. Disconnect grace is proposed in GAME_RULES and reserved in PROTOCOL.

## M2 — Visual offline vertical slice

Completed at `/play`: an entire local match against two explicitly scripted opponents, original Phaser isometric terrain, adjacent-target selection through canvas or Arabic DOM controls, timed four-choice questions, human attack/defense, resolved answer explanations, ownership updates, capture/defense effects, scores, castle elimination, placements and replay. The existing `/map` route remains a paused exploration preview.

The explicit-time local controller delegates all domain outcomes to game-core. The native Arabic dialog and DOM territory controls work without canvas precision; timers continue while minimized/backgrounded and reduced motion omits effects. All 79 unit/integration tests and 18 Chromium journeys passed, including full matches/replay on desktop, portrait and landscape. See M2_OFFLINE_MATCH.md for exact commands, sources and limits. Offline fixture answers remain inspectable, results are in memory and networked gameplay is not implemented. No M1 rules/protocol changed.

## M3 — Real-time multiplayer

Next milestone; not started. Recommended first slice: an authoritative three-seat private Colyseus room using existing validated intents/public snapshots, with a three-browser integration test before adding matchmaking/reconnect UX.

Authoritative three-client Colyseus rooms, private invites/basic matchmaking, verified seat identities, serial commands, monotonic timers, public snapshots/events, recipient-scoped acknowledgments, reconnect/forfeit and safe room drain. Validate full matches under reasonable latency, duplicate/reordered packets, backgrounding and disconnections. Review fairness policy before competition.

## M4 — Identity, content, persistence

Supabase Auth, PostgreSQL/Drizzle migrations, sourced/reviewed question workflow, secure admin authorization, idempotent durable results/history and basic ranking. Create database package only when this work begins.

## M5 — Polish and onboarding

Original premium hybrid 2.5D art, opt-in controllable Howler audio, tutorial, Arabic human QA, reduced motion, mobile performance profiling and reviewed starter question bank. New testers must play without oral instructions.

## M6 — Beta, security, release

Explicitly approved persistent hosting, deployment pipeline, monitoring, load/abuse testing, private beta, balancing and rollback. No production claim before measured capacity and recovery limits exist.

## M7 — Evidence-led expansion

Evaluate ranked seasons, clans, alternate question formats, cosmetics and native apps only after validated MVP priorities. No M1 scaffolding for these systems.
