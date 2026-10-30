# AGENTS.md — ممالك المعرفة / Mamalik Al-Ma'rifa

> **Codex operating manual.** Read this document before modifying the repository. This project is an original, Arabic-first multiplayer knowledge-and-conquest game inspired by a genre, not a clone of any existing title.

## 1. Mission and product principles

Build an exceptional web-first strategy trivia game in which three players compete to capture a fantasy kingdom by answering questions, making tactical decisions, and defending castles. Optimize for **fun, fairness, clarity, Arabic localization, and reliability**.

**Working title:** ممالك المعرفة (Mamalik Al-Ma'rifa). The title, illustrations, names, sounds, questions, maps, and UI must be original or appropriately licensed. Do not copy Triviador/Saif Al Ma3rifa assets, branding, content, source code, or exact presentation.

**Platforms:** responsive desktop web first; mobile browser support throughout; native apps only after a validated web release.

**Art direction:** premium fantasy **hybrid 2.5D**: isometric terrain/architecture, layered 2D sprites, depth sorting, rich lighting, particles, tasteful camera motion, legible Arabic overlays. Aim for striking but performant visuals, not expensive full-3D asset pipelines.

**Audience:** Arabic-speaking players, including a Tunisian/North African audience. Modern Standard Arabic is the default UI language; dialect-specific content packs may come later. Prepare for French/English localization without shipping it prematurely.

### Non-negotiable experience principles

1. A newcomer understands what to do within 30 seconds.
2. Knowledge determines outcomes; tactics add meaningful decisions without pay-to-win advantages.
3. Multiplayer results are authoritative, deterministic when given the same inputs, and resistant to cheating.
4. Arabic is a first-class design constraint, not a translated afterthought.
5. Animations are delightful, skippable where sensible, and do not obstruct game decisions.
6. Every milestone ships a working, testable increment.

## 2. Product scope and defaults

Treat these as **provisional MVP rules**, documented in `docs/GAME_RULES.md` and adjustable through reviewed game-design decisions:

- Three players per match, free-for-all.
- One map with 15 connected territories: three initial player-owned castles and 12 neutral territories.
- Target match duration 10–15 minutes, subject to playtesting.
- Initial simple turn-based expansion/attacks with a server-controlled timer; no complex power-ups in MVP.
- Neutral claim: timed question challenge. Occupied attack: question duel between attacker and defender.
- Correct answer beats incorrect; both correct means faster valid response wins; neither correct means the defender retains ownership.
- No client-side correct-answer disclosure until resolution; server issues question IDs and enforces deadlines.
- Match ends on castle-conquest victory or turn limit; score/tie-break rules must be fully specified before implementation.

**Open rule decisions must be recorded, not silently improvised.** Examples: initial player order, exact question sampling, map layout, tie fairness with network latency, failure/disconnection behavior, elimination, territory value, and no-legal-move turns. Propose defaults with trade-offs, request approval for meaningful gameplay changes, and keep the canonical rule spec updated.

### MVP in scope

- Arabic RTL menus/lobby, responsive desktop/mobile-web layouts.
- Original interactive territory map and clear 2.5D visual hierarchy.
- Three-person rooms, private invite code, basic matchmaking.
- Multiple-choice questions first; numeric estimates only after the base mode is solid.
- Attack/defense questions, round timers, turn order, captures, castle conditions.
- Robust reconnect/forfeit behavior and complete match results.
- Accounts, question administration, and match history when their milestone begins.
- Automated tests, build checks, error handling, monitoring-ready design.

### Explicitly deferred

Clans, ranked seasons, advanced matchmaking/MMR, real-money purchases, marketplace, elaborate power-up economy, AI-generated live answers, public chat, native mobile clients, complex 3D, global scale-out, and microservices. Do not introduce deferred features as 'helpful extras'.

## 3. Approved architecture

| Concern | Technology | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | Shared types across client/server |
| Web shell | Next.js App Router + React | Pages, auth UI, lobby, profile, menus |
| Styling | Tailwind CSS + shadcn/ui | Customized design system, not default-looking admin UI |
| Map renderer | Phaser | Isometric layers, input, tweens, camera, VFX |
| Multiplayer | Node.js + Colyseus | Persistent WebSocket server and authoritative rooms |
| Core rules | Framework-independent TS package | Pure functions and deterministic state machine |
| Data | PostgreSQL + Drizzle | Questions, users, match history, migrations |
| Identity | Supabase Auth | Validate identity server-side; enforce RLS where relevant |
| Validation | Zod | Untrusted boundaries, forms, protocol schemas |
| Audio | Howler.js | Opt-in audio, controllable volume |
| Tests | Vitest + Playwright | Rules, integration, critical user journeys |
| Repo | pnpm workspaces + Turborepo | Shared packages, reproducible scripts |
| CI | GitHub Actions | Lint, typecheck, tests, build |

**Do not add Redis to the first milestone.** Consider it only when scaling/multi-instance matchmaking needs become real. Host Next.js separately from the persistent Colyseus WebSocket service; avoid relying on serverless functions for long-lived game rooms. Select current stable compatible dependency versions during initial setup and record them in lockfiles.

### Architectural boundaries

- `apps/web`: React/Next.js shell, Phaser integration, presentation, localization, accessibility.
- `apps/game-server`: room lifecycle, identity verification, turn timers, commands, authoritative event handling.
- `packages/game-core`: pure rules, types, scoring, state machine, map topology. No React, Phaser, database, network, clock access, or random globals.
- `packages/shared`: network contracts, schemas, shared DTOs, error codes.
- `packages/database`: schemas, migrations, repositories, seed scripts (when persistence work begins).
- `packages/config`: shared lint/TS/build configs only where necessary.

Use clear public APIs per package; avoid circular dependencies. Do not put domain rules in React components or Phaser scenes. The renderer receives sanitized state and emits **intents**, not outcomes.

## 4. Game simulation and protocol

The server is the **single source of truth** for the current phase, active player, remaining time, question selection, answers, battle resolution, ownership, scores, and winner.

Suggested phases: `LOBBY`, `SETUP`, `EXPANSION`, `ATTACK_SELECTION`, `DUEL`, `RESOLUTION`, `FINISHED`. Define legal transitions in one testable module; illegal commands must not mutate state.

Suggested intentions: `READY`, `SELECT_TARGET`, `SUBMIT_ANSWER`, `REQUEST_RECONNECT`. Server events: `ROOM_UPDATED`, `TURN_STARTED`, `QUESTION_PRESENTED`, `ANSWER_ACKNOWLEDGED`, `DUEL_RESOLVED`, `TERRITORY_UPDATED`, `MATCH_FINISHED`, `COMMAND_REJECTED`.

Each command should carry a protocol version, player/session context derived from authenticated transport, match/turn identifiers where relevant, and an idempotency key for sensitive/retriable actions. Validate schemas and phase permissions before processing. Avoid sending sensitive server-only fields in public synchronized room state.

For fair timed trivia: use server monotonic timing, enforce submission deadlines, handle duplicate submissions, apply bounded reconnection rules, and account for network delay when designing speed-based tie breakers. Write fairness assumptions/tests. Never trust client timestamps to decide winners.

**Determinism rule:** domain functions accept state and explicit action/context (including seeded randomness, clock values, and selected question IDs), then return an updated state/result. Avoid implicit I/O and mutable module singletons. Version persisted rule snapshots as needed so completed match results remain understandable after patches.

## 5. Visual and interaction design

### Creative direction

An original Arabic fantasy kingdom: elegant dark navy/ink backgrounds, jewel-like teal and sapphire factions, restrained gold accents, tactile terrain, detailed castle silhouettes, warm glowing attack routes, lively but tasteful micro-interactions. Strong lighting and material depth, without clutter.

### Main screens

1. Landing / play entry: decisive hero scene and clear CTA.
2. Lobby: players, readiness, invitation code, matchmaking status.
3. Game map: territory ownership, castles, legal targets, active player, timer.
4. Question battle: large readable Arabic question, four answer cards, visible countdown, outcome reveal.
5. Results: winner, placements, territory summary, replay/return CTA.
6. Profile/history/admin screens in later milestones.

### UI standards

- Use real `dir="rtl"` behavior and logical CSS properties; isolate LTR fragments such as codes, usernames, and numbers as needed.
- Favor Arabic-supporting typography (e.g. licensed/open Noto Sans Arabic or Cairo); verify diacritics, punctuation, digits, and line wrapping.
- Design for desktop mouse and mobile touch; touch targets ideally >=44 CSS px, responsive landscape layouts, no hover-only affordances.
- Meet WCAG 2.2 AA where practical: keyboard focus, semantics, contrast, reduced motion, captions/alternatives for audio, and readable states independent of color.
- Phaser canvas must have meaningful accessible DOM overlays for critical game actions; do not make the core quiz impossible without precise canvas interaction.
- Animation should convey game changes (attack, conquest, defense) with smooth camera movement; respect `prefers-reduced-motion`.
- Load assets lazily, compress them, and target steady performance on typical mid-range phones.

No placeholder emoji UI in the final polished experience. Use original/appropriately licensed art, icons, particles, and sound. Do not spend Milestone 1 building art before the logic is proven.

## 6. Engineering quality requirements

- Strict TS; type narrow and validate at runtime; never scatter `any` or suppressions.
- Follow current repo conventions. Small focused modules; no speculative abstractions.
- Standardize formatting, linting, error handling, and consistent naming.
- Do not commit secrets; use `.env.example`; validate configuration at process startup.
- Principle of least privilege, SQL migrations, and explicit authorization on admin/server endpoints.
- Sanitize user-generated names/questions, rate-limit game intents and endpoints, and avoid logging credentials/answers before resolution.
- Ensure idempotency and transaction boundaries where persistence affects results.
- Use reproducible seeds/fixtures in tests; no flaky timing sleeps as proof of correctness.
- Instrument meaningful errors and match lifecycle events without collecting unnecessary personal information.
- Handle network loss, retries, tab backgrounding, duplicate actions, and malformed messages intentionally.
- Design for graceful shutdown of rooms and safe deploys; no in-memory promises of persistence.

### Mandatory validation gates

For each changed package, run applicable formatting/lint/typecheck/unit/integration/build checks; report exact commands, exits, and known gaps. For gameplay changes, include tests for valid/invalid transitions, security, and race/timing edge cases. For UI changes, inspect desktop and mobile layouts and Arabic directionality. Never claim a test passed if it was skipped or failed.

## 7. Repository contract

Target layout (adapt to an existing repository only after inspecting it):

```text
apps/
  web/
  game-server/
packages/
  game-core/
  shared/
  database/
  config/
docs/
  GAME_DESIGN.md
  GAME_RULES.md
  ARCHITECTURE.md
  PROTOCOL.md
  MILESTONES.md
  ADR/
AGENTS.md
README.md
pnpm-workspace.yaml
turbo.json
```

Documentation is a maintained product: update the relevant document with any substantial rule/protocol/architecture decision. Use ADRs for trade-offs. Keep the README focused on setup and running the project. Add a coherent design-tokens file when UI implementation begins.

Use conventional commits (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`). Never force-push, rewrite shared history, publish, deploy, change billing, or delete significant user data without explicit approval.

## 8. Milestones and completion contracts

### M1 — Foundation and deterministic rules **(COMPLETED)**

Deliver:

1. pnpm/Turborepo workspace, strict TypeScript, formatting/linting, scripts, CI.
2. Next.js application with minimal polished RTL placeholder shell; standalone Colyseus service with health check.
3. `game-core` interfaces, 15-territory connected map seed, legal-neighbor checks, battle resolver, turn progression, score/winner functions.
4. `shared` typed command/event contracts and validation.
5. Unit tests for graph topology, initial setup, legal/illegal attacks, response deadline, ties, duplicate actions, winner/edge cases.
6. `README.md`, `docs/GAME_DESIGN.md`, `docs/GAME_RULES.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/MILESTONES.md`, first ADR.

**Done when:** fresh install reproducibly works, web/server boot, checks pass, deterministic headless three-player match completes through rules, and documented unresolved game decisions are clearly identified. No real networked gameplay or finished art is required.

### M2 — Visual offline vertical slice **(COMPLETED)**

Original isometric map scene, territory hover/touch selection, accessible Arabic question overlay, transitions, battle effects, scripted opponents. **Done:** user finishes complete local match without backend room coordination.

### M3 — Real-time multiplayer **(COMPLETED — LOCAL GUEST SCOPE)**

Three-client Colyseus rooms, invites/basic matchmaking, sync, phase timers, answer validation, reconnect/forfeit. **Done:** three real browser sessions reliably finish a match under reasonable latency and reconnect scenarios.

### M4 — Identity, content, persistence **(CURRENT — CONTENT IDENTITY AND AUTHORIZATION)**

Supabase Auth, question CMS/review with sources, PostgreSQL migrations, history/basic ranking, admin authorization. **Done:** audited question workflow and durable accurate results.

Local storage and the opt-in authenticated content API are implemented: Supabase `getUser` verification, project-scoped editor/reviewer/publisher roles, server-derived audit identity, transactional permissions/idempotency and private-schema RLS. Local signed-token fixtures and real PostgreSQL tests verify the boundary without cloud credentials. M4 remains incomplete: sign-in/admin UI, hosted Supabase verification, live-room reviewed-bank integration and durable match history remain. See `docs/M4_IDENTITY_AUTH.md`, the historical storage record and ADRs 0007–0008.

### M5 — Premium polish and onboarding

Art pass, sound, tutorial, responsive quality, RTL QA, performance tuning, starter reviewed question set. **Done:** new testers play without oral instructions and core performance targets are met.

### M6 — Beta, security, release

Persistent game-server hosting, CI/CD, production monitoring, load testing, abuse controls, private beta, balancing. **Done:** monitored release with known limits and rollback procedure.

### M7 — Data-led expansion (post-MVP)

Ranked seasons, clans, alternative question formats, cosmetics, accessibility improvements, native mobile evaluation. Ship only validated priorities.

## 9. Codex work protocol

For each request:

1. Read `AGENTS.md` and inspect existing code/docs/state. Do not assume a blank repo.
2. State the current milestone, scope, assumptions, and concise implementation plan.
3. Identify meaningful ambiguities or risky trade-offs before changing rules.
4. Implement only the requested vertical slice with clear module boundaries.
5. Add tests and update docs at the same time as changes.
6. Run relevant checks and inspect results.
7. Summarize changed files, behaviors, verification commands/results, decisions, blockers, and next recommended task.

**Be honest:** distinguish implemented vs. planned vs. simulated. Never present mocked matchmaking as production multiplayer; never assert verified performance/security without evidence.

**Teach the owner:** at the end of each milestone, explain 3–5 critical files and concepts in plain English with one short hands-on exercise. AI accelerates the project, but the owner must understand the architecture.

**Scope lock:** do not jump to M2+ during M1, create unnecessary systems, or make cosmetic changes that obscure gameplay progress. If blocked by missing keys/services, provide a local, non-secret development fallback and clearly describe limitations.

## 10. M1 decision checklist

Before finalizing rule code, explicitly settle/document:

- Map graph and starting castle placement (balanced distances, symmetric enough to be fair).
- Player order and neutral expansion sequence.
- How neutral claims differ from occupied duels.
- Question timeout and submission timestamp authority.
- Tie-break method and network fairness.
- Max turns, scoring, elimination, and no-legal-action handling.
- Reconnect/forfeit behavior and match abort handling.
- Question reuse and repeat avoidance.

Propose straightforward defaults first and keep the core configurable for playtesting, not overengineered.

---

**North star:** *A beautiful Arabic strategy game that stays fun after the first match, with robust engineering underneath every magical moment.*
