# ممالك المعرفة · Mamalik Al-Ma'rifa

Original Arabic-first strategy trivia. **M1 foundation:** deterministic headless rules, strict protocol schemas, a restrained RTL web shell, and a standalone Colyseus health service. No playable browser match or networked game room yet.

## Local setup

Use Node **22.22.1** (`.nvmrc`) and pnpm **10.0.0** (`packageManager`). Node 20 is insufficient for the selected Colyseus runtime and Vitest. No cloud account or secret is needed.

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open [the Arabic shell](http://127.0.0.1:3000) and [the game-service health response](http://127.0.0.1:2567/health). If port 3000 is occupied, Next.js dev prints the next available port. Stop with Ctrl+C. `pnpm dev` builds workspace dependencies before starting their consumers, then runs Next.js, the game service, and library TypeScript watchers through Turbo. Before standalone integration scripts or production start, build packages first.

Optional: copy `.env.example` to `.env` in the root. The game service reads it and validates the host, port and environment at startup. Web assets and Arabic fonts are local; no runtime font service is required. Only bind to a public interface intentionally; this is a development foundation, not a released service.

Separate commands:

```sh
pnpm --filter @mamalik/web dev
pnpm --filter @mamalik/game-server dev
pnpm build
pnpm --filter @mamalik/web start
pnpm --filter @mamalik/game-server start
```

## Verification and simulation

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm simulate
pnpm --filter @mamalik/web exec playwright install chromium
pnpm test:e2e
```

The simulation uses explicit seed `2026`, synthetic question fixtures and three scripted players. It completes 36 turns with 177 accepted actions and emits a TURN_LIMIT result with `p_gold` winning. It is deterministic, not live multiplayer or a content demo. Tests replay its action/context log and compare the exact final private state.

Browser checks use a dedicated production server on port 3100 and Chromium at desktop, mobile and short landscape sizes, with overflow, Arabic direction, keyboard, console-error and axe checks. They do not reuse an existing process. Screenshots are saved under `apps/web/test-results/`. Run `pnpm build` before `pnpm test:e2e`; CI installs Chromium with OS dependencies. Review the [verification record](docs/VERIFICATION.md) for actual commands/results and remaining gaps.

## Project layout

```text
apps/web/             Next.js App Router, Arabic shell, design tokens, Playwright
apps/game-server/     Colyseus bootstrap, /health, validated config, intent adapter
packages/game-core/   Pure state machine, topology, battle/scoring rules, simulation
packages/shared/      Zod commands, events, public-state contract, protocol errors
packages/config/      Shared strict TypeScript configuration
docs/                 Design, exact rules, architecture, protocol, milestones, ADR
.github/workflows/    Reproducible quality gates
```

Database/auth packages, Phaser, Howler, and game rooms deliberately begin in later milestones. See [rules and reversible assumptions](docs/GAME_RULES.md), [architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md) and [milestones](docs/MILESTONES.md). Preserve `AGENTS.md` as the engineering charter.

## Five concepts to learn

1. `packages/game-core/src/engine.ts`: state transitions accept explicit inputs and return a new state; rejected actions preserve the original reference.
2. `packages/game-core/src/map.ts`: adjacency is a graph rule, independent of where the future renderer draws a territory.
3. `packages/shared/src/index.ts`: TypeScript helps trusted code; Zod validates data arriving from outside it.
4. `apps/game-server/src/commands.ts`: player identity is supplied by trusted transport, while `snapshot` validates an allowlisted public view. Private answers never belong in synchronized state.
5. `apps/web/src/app/tokens.css`: presentation tokens and real RTL layout live in the web layer, separate from domain outcomes.

Exercise: change the **simulation's** `maxTurns` to 6, run `pnpm simulate`, and inspect the shorter result. Restore the edit, then run `pnpm test`. Do not change production defaults without updating the rules and tests.
