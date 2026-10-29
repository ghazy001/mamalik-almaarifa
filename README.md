# ممالك المعرفة · Mamalik Al-Ma'rifa

Original Arabic-first strategy trivia. The M1 foundation and M2 offline match are implemented: deterministic rules, strict protocol schemas, an RTL web shell, a standalone Colyseus health service, and original interactive Phaser terrain. Play a complete local match against two scripted opponents at `/play`, or find two real guests through basic matchmaking or private invitations at `/online`. M3 is in progress; broader network resilience validation remains.

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

## Play a three-player online match

Open `/online` and enter a guest name. Choose **ابحث عن لاعبين** on three tabs/browser profiles using the same game service; the queue fills available rooms with three guests. **إلغاء البحث** frees an incomplete-lobby seat. Once full, all three select **أنا جاهز** within 60 seconds or the queued lobby cancels without a winner. Alternatively, **أنشئ غرفة خاصة**, share its code/link, and join with **انضم إلى الغرفة**. Private rooms never mix with queue searches. The persistent game service decides turns, questions, deadlines, ownership and results. Unexpected drops reserve the same seat for 30 seconds while timers continue; reload recovery uses a per-tab sessionStorage token. Explicit leave forfeits. Results are in memory.

`GAME_SERVER_URL` defaults to `http://127.0.0.1:2567`. Export it before starting Next/Turbo or put it in `apps/web/.env.local` when changing the browser-reachable service URL. No rebuild is needed for this request-time public endpoint. Root `.env` is read by the game service, not automatically by Next. Loopback URLs work on this computer only; this increment is not a deployment.

See [M3 matchmaking behavior, verification and limits](docs/M3_MATCHMAKING.md) and the [first private-room slice](docs/M3_PRIVATE_ROOMS.md). Protocol v2 adds room mode/readiness deadlines; restart both services and reload tabs together after upgrading. Rules remain v1. Guest seats are transport identities, not accounts. The shared development question fixtures are public through the offline demo/source; reviewed server-only content and persistent results remain M4.

## Play a local match

Open `/play`, or choose **العب مباراة محلية** from the home page. You control فيروز against two explicitly scripted opponents. Start, select an adjacent target through the canvas or Arabic territory controls, then **ابدأ التحدّي**. Answer within 15 seconds and review the resolution/source before continuing. The map and scores update through the shared rules. Defend your lands when attacked; capture all castles or lead on score at the 36-turn limit. Results include placements and **مباراة جديدة**.

Escape/**تصغير المواجهة** minimizes the native quiz dialog; **إعادة فتح المواجهة** restores it. Timers continue while minimized or backgrounded. Human-involved result screens wait for Continue; bot-only turns progress automatically. Reload/navigation discards the in-memory match. Questions/answers are bundled development fixtures and inspectable; there is no anti-cheat, persistence or multiplayer claim. The local match needs no Colyseus connection or cloud credentials.

See [M2 match architecture, question sources and verification](docs/M2_OFFLINE_MATCH.md) for exact behavior, limits and the five key implementation concepts.

## Map preview

Visit `/map` (or use **استكشف خريطة المملكة** on the home page). It shows all 15 canonical territories and three castles with original procedural isometric artwork. Only the active kingdom's two neutral neighbors are selectable. Click/tap a lit tile, or use Tab and Space/Enter on an available territory button. Selection and hover highlight the same map state; **مسح الاختيار** clears it.

This is paused local preselection: it does not start a duel, consume a turn, run a timer or change ownership. Use `/play` for the complete local match. If canvas support fails, Arabic DOM controls still work on both routes. Phaser is dynamically imported only when a map is needed, and fonts/artwork need no remote asset service. See the [historical first-slice record](docs/M2_MAP_SLICE.md).

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

Browser checks use a production web build on 3100 and the real authoritative room in a trusted six-turn server fixture on 2571 and Chromium at desktop, mobile and short landscape sizes, with overflow, Arabic direction, keyboard, console-error and axe checks. They do not reuse an existing process. Screenshots are saved under `apps/web/test-results/`. Run `pnpm build` before `pnpm test:e2e`; CI installs Chromium with OS dependencies. Review the [current M3 record](docs/M3_MATCHMAKING.md) for current results/limits and the [historical M1 record](docs/VERIFICATION.md).

## Project layout

```text
apps/web/             Arabic shell, offline/online presentation, design tokens, Playwright
apps/game-server/     Private/queued Colyseus rooms, timers, reconnect, /health, intent adapter
packages/game-core/   Pure state machine, topology, battle/scoring rules, simulation
packages/shared/      Zod commands, events, public-state contract, protocol errors
packages/question-fixtures/ Development questions for server and explicit offline demo
packages/config/      Shared strict TypeScript configuration
docs/                 Design, exact rules, architecture, protocol, milestones, ADR
.github/workflows/    Reproducible quality gates
```

Database/auth packages, reviewed content and Howler begin in later milestones. Private guest rooms and basic guest matchmaking are implemented; network resilience and fairness review remain M3 work. Phaser powers public snapshot rendering for the preview and offline match. See [rules and reversible assumptions](docs/GAME_RULES.md), [architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md) and [milestones](docs/MILESTONES.md). Preserve `AGENTS.md` as the engineering charter.

## Five concepts to learn

1. `packages/game-core/src/engine.ts`: state transitions accept explicit inputs and return a new state; rejected actions preserve the original reference.
2. `packages/game-core/src/map.ts`: adjacency is a graph rule, independent of where the future renderer draws a territory.
3. `packages/shared/src/index.ts`: TypeScript helps trusted code; Zod validates data arriving from outside it.
4. `apps/game-server/src/commands.ts`: player identity is supplied by trusted transport, while `snapshot` validates an allowlisted public view. Private answers never belong in synchronized state.
5. `apps/web/src/app/tokens.css`: presentation tokens and real RTL layout live in the web layer, separate from domain outcomes.

Exercise: change the **simulation's** `maxTurns` to 6, run `pnpm simulate`, and inspect the shorter result. Restore the edit, then run `pnpm test`. Do not change production defaults without updating the rules and tests.
