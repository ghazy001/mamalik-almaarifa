# ADR 0001 — Pure rules with an explicit authority boundary

Status: accepted for M1 as reversible implementation defaults.

## Context

Three players compete over an original Arabic fantasy map. A renderer, network clock or database must not silently change the result of identical actions. M1 must demonstrate a complete bounded game before investing in visual scenes or remote services.

## Decision

Use a dependency-free TypeScript reducer in `game-core`, strict Zod wire contracts in `shared`, a Next.js presentation shell, and a separate persistent Colyseus runtime. The engine accepts explicit clock/question/seed inputs; rejected actions return the input state. An explicit projection constructs every public snapshot. Store rule version 1 and retain accepted action fingerprints for match-scoped idempotency. Use simple immutable state copies because matches are bounded and small.

Choose a rotationally symmetric 15-node ring plus neutral-center triangle. Seed turn/deck order; keep castle seats stable. Use neutral challenges and occupied duels in one DUEL phase; there is no separate EXPANSION phase. Exact ties defend; receipt time is authoritative without latency compensation. 36 turns, castle-based elimination/transfer, territory/castle scoring and joint exact-score ties are documented playtest defaults, not finalized balance.

Use Node 22.22.1 (already available locally) for current stable Colyseus and Vitest. Keep pnpm 10.0.0 pinned for reproducibility. Bundle Arabic fonts locally. The shell uses Tailwind and a customized shadcn-style Button; Phaser, Howler, persistence and identity wait for their milestones. No Redis.

## Alternatives and consequences

Putting rules in React/Phaser would simplify an early demo but couple outcomes to client presentation and allow divergent logic. Full synchronized private state would be easy to wire but disclose answers. A prebuilt external map/art pipeline would delay rule validation and risk unoriginal presentation. These options are rejected.

The current engine is easy to replay/test, but still needs a serialized room adapter, measured network fairness, rate limits, reconnect scheduling and durable recovery. Exact receipt-time ties favor defense and lower latency; shared score wins avoid arbitrary ordering but require product review before ranked formats. Home-castle transfer can snowball; playtesting must decide whether to change it in a new rule version. Thirty-six unique question IDs bound deck needs; the synthetic repeated-text fixtures are never a production question bank.
