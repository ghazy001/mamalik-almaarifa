# Architecture — foundation and first M2 map slice

```text
Future browser intents → shared schema → trusted room adapter → game-core
                                                         ↓
Future browser renderer ← shared public schema ← allowlisted publicView

Current web: Next.js shell + /map with a server-created public map projection
            → lazy Phaser renderer + equivalent Arabic DOM preselection
Current game service: persistent Node/Colyseus + HTTP /health, no rooms
```

## Package boundaries

- `game-core` has no package runtime dependencies. It uses types, graph topology, explicit seeded shuffle, action/context reducers, scoring and serialization projection. It never reads clocks, networks, environment variables, random globals or databases. `structuredClone` copies only serializable state. Static map/defaults are frozen. Server callers own the current state.
- `shared` depends on Zod and defines strict versioned wire objects. It does not import private rules types. This keeps server-only question answers out of browser dependencies.
- `game-server` depends on both. `processIntent` validates input and maps an authenticated transport player ID into a core action; it is a tested seam, **not an exposed room/endpoint**. `snapshot` validates the allowlisted projection. M3 will supply a monotonic `performance.now()`-based match-relative clock, authenticated seats, serialized room execution, timers and rate limits. Do not use Date/client time as a competitive clock.
- `web` uses Next.js App Router, React, Tailwind and a customized shadcn-style Radix Slot Button. `/map` now has a lazy Phaser 4.2.1 host and equivalent DOM target controls. Its server/build-side `preview.ts` constructs the canonical initial state through core transitions, validates `publicView`, derives legal IDs and sends an explicit presentation-only model. No core values, private state or question content are imported by the client scene. `geography.ts` defines artwork positions/names, never adjacency. A UI reducer handles preselection/hover without applying gameplay actions or ownership changes. See ADR 0002.
- `config` provides strict TS settings, including unchecked-index and exact-optional checks. Packages expose only their built public entrypoint.

## Execution and build

pnpm workspaces and Turbo orchestrate four executable packages plus shared config. Dependent builds precede typecheck/test/build and consumer dev startup; library watchers run alongside both dev services. Libraries compile ESM and declarations with NodeNext; Next uses bundler resolution. Node 22.22.1 is pinned because current Colyseus requires Node 22. Stable Next.js 16.4.3 and Colyseus 0.18.23/transport 0.18.4 were checked via the registry; exact resolved transitive versions are in the lockfile. TypeScript 5.9 remains a compatible stable compiler. No global package upgrade is required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Colyseus server](https://docs.colyseus.io/server) and [WebSocket transport](https://docs.colyseus.io/server/transport/ws). Installed package declarations and registry metadata determine the exact compatible APIs used here.

The game service uses Colyseus's default local in-memory driver/presence, no Redis or databases. No game rooms are registered. Health returns `gameplayRoomsEnabled: false`. Startup config validates local defaults; Ctrl+C/SIGTERM calls Colyseus graceful shutdown. Startup/stop logs contain lifecycle events only. Match persistence, draining active rooms and recovery are not implemented. Next and Colyseus must eventually be hosted separately; long-lived rooms cannot depend on serverless request lifetimes.

## Trust, timing and determinism

Only schema-validated player intents cross the boundary. Identity and time are supplied by the trusted caller. Privileged BEGIN/ADVANCE/RESOLVE/FORFEIT/ABORT actions have no command schema. M1 does not claim authentication exists. Each room in M3 must serialize actions on one authoritative state and run deadlines through the same reducer.

Accepted commands have actor-scoped idempotency keys and content fingerprints; exact retries are no-ops and changed payloads are errors. A first accepted answer cannot be replaced. Rejections retain the original object and do not grow the ledger. Rule version, deterministic seed input and explicit clock/question context support replay. Public snapshots expose no deck, answer submissions or timestamps. Correct-choice disclosure appears only in resolved outcomes.

At M1's bounded maximum of 120 turns the state/ledger remains small, so copying the whole state is intentional. Do not introduce mutable singletons, event buses or microservices to optimize this before profiling.

## Verification and deployment boundary

Vitest covers pure rules, malformed protocol, the real HTTP health service and the map projection/preselection boundary. Playwright inspects desktop/mobile/landscape RTL, keyboard use, mouse/touch hit testing, canvas failure fallback, navigation cleanup and axe violations; automated checks do not replace Arabic human testing or full WCAG review. CI repeats formatting/lint/typecheck/tests/build/simulation/browser checks. No deployment, remote repository, database, billing, or cloud infrastructure is provisioned.
