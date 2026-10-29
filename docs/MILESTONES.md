# Delivery milestones

## M1 — Foundation and deterministic rules

Implemented: pnpm/Turbo workspace, strict TypeScript, ESLint/Prettier, CI, Next.js RTL foundation, standalone Colyseus health service, 15-node map, deterministic rules, pure replayable headless simulation, private/public separation, Zod commands/events, unit/integration/browser tests and canonical docs. See VERIFICATION.md for the measured gates rather than inferring completion from this checklist.

Rules remain reversible playtest assumptions: equal-distance castles, seeded order/deck, 36 turns, 10-second target selection, 15-second question, exact-time defensive ties, home-castle elimination/land transfer and joint-score winners. No gameplay network coordination, finished map art, accounts or database is implemented. Disconnect grace is proposed in GAME_RULES and reserved in PROTOCOL.

## M2 — Visual offline vertical slice

First task: build a dynamically loaded Phaser host and render the canonical 15 territories with original isometric geometry. Feed it sanitized snapshots and emit target intents. Pair every actionable territory with an accessible Arabic DOM target control. Demonstrate hover/touch/keyboard selection without moving rules into the scene. Then add a DOM quiz, explicit phase transitions/effects and scripted opponents, until an entire offline match completes.

## M3 — Real-time multiplayer

Authoritative three-client Colyseus rooms, private invites/basic matchmaking, verified seat identities, serial commands, monotonic timers, public snapshots/events, recipient-scoped acknowledgments, reconnect/forfeit and safe room drain. Validate full matches under reasonable latency, duplicate/reordered packets, backgrounding and disconnections. Review fairness policy before competition.

## M4 — Identity, content, persistence

Supabase Auth, PostgreSQL/Drizzle migrations, sourced/reviewed question workflow, secure admin authorization, idempotent durable results/history and basic ranking. Create database package only when this work begins.

## M5 — Polish and onboarding

Original premium hybrid 2.5D art, opt-in controllable Howler audio, tutorial, Arabic human QA, reduced motion, mobile performance profiling and reviewed starter question bank. New testers must play without oral instructions.

## M6 — Beta, security, release

Explicitly approved persistent hosting, deployment pipeline, monitoring, load/abuse testing, private beta, balancing and rollback. No production claim before measured capacity and recovery limits exist.

## M7 — Evidence-led expansion

Evaluate ranked seasons, clans, alternate question formats, cosmetics and native apps only after validated MVP priorities. No M1 scaffolding for these systems.
