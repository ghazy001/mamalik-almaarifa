# Architecture — deterministic core, local match and online guest rooms

```text
Online browser intents → shared schema → session-bound room adapter → game-core
                                                         ↓
Online browser renderer ← shared recipient snapshot ← allowlisted publicView

Current web: Next.js shell + /map with a server-created public map projection
            → lazy Phaser renderer + equivalent Arabic DOM preselection
Current game service: persistent Node/Colyseus + HTTP /health + private kingdom / public kingdom_queue rooms

Current /play: local explicit-time session → game-core → public view
                  ↑ human intents / scripted opponents     ↓
               React quiz/results + public Phaser map updates
```

## Package boundaries

- `game-core` has no package runtime dependencies. It uses types, graph topology, explicit seeded shuffle, action/context reducers, scoring and serialization projection. It never reads clocks, networks, environment variables, random globals or databases. `structuredClone` copies only serializable state. Static map/defaults are frozen. Server callers own the current state.
- `shared` depends on Zod and defines strict versioned wire objects. It does not import private rules types. This keeps server-only question answers out of browser dependencies.
- `game-server` depends on both and the development fixtures. `processIntent` validates input and maps a transport-bound guest player ID into a core action; the private room calls this tested boundary. `snapshot` validates the allowlisted projection. The room supplies a monotonic `performance.now()`-based clock, session-bound seats, serialized execution, timers and message limits. Accounts are not implemented. Do not use Date/client time as a competitive clock.
- `web` uses Next.js App Router, React, Tailwind and a customized shadcn-style Radix Slot Button. `/map` now has a lazy Phaser 4.2.1 host and equivalent DOM target controls. Its server/build-side `preview.ts` constructs the canonical initial state through core transitions, validates `publicView`, derives legal IDs and sends an explicit presentation-only model. No core values, private state or question content are imported by the client scene. `geography.ts` defines artwork positions/names, never adjacency. A UI reducer handles preselection/hover without applying gameplay actions or ownership changes. See ADR 0002.
- `config` provides strict TS settings, including unchecked-index and exact-optional checks. Packages expose only their built public entrypoint.

## Execution and build

### Offline match boundary

`web/src/features/match/local-session.ts` is a per-match, framework-independent local authority adapter. It receives explicit monotonic time, drains scheduled bot/deadline events before human intents, calls existing core functions and publishes cached public views through a subscription API. React supplies `performance.now()` relative to the component lifetime, subscribes with `useSyncExternalStore`, and runs a 100 ms timer/visibility catch-up adapter. No real clock or new domain rules were added to game-core.

Private simulation state and the development question pack remain inside the session, not React props or Phaser scenes. This separation is architectural only: the entire offline controller/answer bank is bundled and inspectable in the browser. The M3 online route uses separate server room authority instead. Human-involved resolution review waits for Continue; bot-only resolution advances automatically. Restart replaces the match generation and discards pending state. See ADR 0003 and M2_OFFLINE_MATCH for schedules/content sources/limits.

The native Arabic dialog handles question focus/minimize/reopen; countdowns continue while minimized or backgrounded. Only resolution views contain correct choices, explanations and source notes. The human's selected-choice acknowledgement is recipient-local. Phaser accepts model updates and transient resolved effects without a new canvas per tick; reduced-motion skips particles/tweens and DOM controls work if graphics fail. This offline route opens no room connection. Basic matchmaking is implemented in the online flow. Durable results, accounts and database-backed gameplay remain further work.

pnpm workspaces and Turbo orchestrate web/server services, built packages (core, shared, development fixtures and database), and shared config. Dependent builds precede typecheck/test/build and consumer dev startup; core/shared/fixture watchers run alongside both dev services. Database tools run separately and need no persistent watcher. Libraries compile ESM and declarations with NodeNext; Next uses bundler resolution. Node 22.22.1 is pinned because current Colyseus requires Node 22. Stable Next.js 16.4.3 and Colyseus 0.18.23/transport 0.18.4 were checked via the registry; exact resolved transitive versions are in the lockfile. TypeScript 5.9 remains a compatible stable compiler. No global package upgrade is required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Colyseus server](https://docs.colyseus.io/server) and [WebSocket transport](https://docs.colyseus.io/server/transport/ws). Installed package declarations and registry metadata determine the exact compatible APIs used here.

The game service uses Colyseus's default local in-memory driver/presence, no Redis or databases. The private `kingdom` and public `kingdom_queue` room types are registered through the same trusted room factory. Queue matching uses Colyseus’s in-memory `joinOrCreate` reservation/concurrency mechanism, sorted by occupied clients descending; it never queries private rooms. Health returns milestone M3 and `gameplayRoomsEnabled: true`. Startup config validates local defaults; Ctrl+C/SIGTERM calls Colyseus graceful shutdown. Startup/stop and room logs contain lifecycle events only, with independent random log references rather than invite codes, tokens or names. Graceful shutdown broadcasts an abort before closing rooms. Match persistence, rolling-deploy draining and crash recovery are not implemented. Next and Colyseus must eventually be hosted separately; long-lived rooms cannot depend on serverless request lifetimes.

## Trust, timing and determinism

Only schema-validated player intents cross the boundary. Identity and time are supplied by the trusted caller. Privileged BEGIN/ADVANCE/RESOLVE/FORFEIT/ABORT actions have no command schema. Guest session binding is not account authentication. Private rooms serialize actions on one authoritative state and run deadlines through the same reducer.

Accepted commands have actor-scoped idempotency keys and content fingerprints; exact retries are no-ops and changed payloads are errors. A first accepted answer cannot be replaced. Rejections retain the original object and do not grow the ledger. Rule version, deterministic seed input and explicit clock/question context support replay. Public snapshots expose no deck, answer submissions or timestamps. Correct-choice disclosure appears only in resolved outcomes.

At M1's bounded maximum of 120 turns the state/ledger remains small, so copying the whole state is intentional. Do not introduce mutable singletons, event buses or microservices to optimize this before profiling.

## Verification and deployment boundary

Vitest covers pure rules, malformed protocol, the real HTTP health service and the map projection/preselection boundary. Playwright inspects desktop/mobile/landscape RTL, keyboard use, mouse/touch hit testing, canvas failure fallback, navigation cleanup and axe violations; automated checks do not replace Arabic human testing or full WCAG review. CI repeats formatting/lint/typecheck/tests/build/simulation/browser checks and the separate real PostgreSQL gate. The repository has its user-authorized GitHub remote; no deployment, billing or cloud infrastructure is provisioned. M4 adds optional local content storage as described below.

## M3 guest-room authority

`kingdom-room.ts` owns three guest seats, session binding, private invite IDs, monotonic receipt time, rate/message/lifetime bounds and Colyseus reconnection. `match-session.ts` owns server-only orchestration and private MatchState; it supplies explicit time/questions to game-core. Synchronous command handlers complete validation/reduction before another action executes. Each recipient gets a strict complete public snapshot with its legal targets and own answer acknowledgement. There is no private Schema state tree to accidentally synchronize. The online client replaces snapshots in sequence order and treats browser countdowns as advisory.

`/online` is a request-rendered Next page: `GAME_SERVER_URL` is validated as an HTTP(S) URL and passed as public configuration to the network adapter. It has no API route that decides gameplay. Phaser and the quiz dialog are shared presentation; the offline authority adapter remains isolated in `/play`. The development question pack is an independent package consumed by the game service and explicit offline demo only. Tests ensure the online route does not load it, although the pack remains public through the offline demo/source and is not a protected release bank.

The SDK reserves/restores the same transport seat after a drop or page reload. Reconnection tokens stay in per-tab sessionStorage; invitation links contain only the room ID. Explicit leave clears the token and forfeits; a crash has no recovery guarantee. See ADR 0004, PROTOCOL.md and M3_PRIVATE_ROOMS.md for exact wire/lifecycle behavior and incomplete M3 work.

Basic matchmaking adds admission, not another rules engine. The server-injected room mode controls visibility and a 60-second queue readiness deadline. Complete v2 snapshots expose that mode/deadline, never a client-supplied override. Cancellation explicitly leaves a reservation even if its asynchronous join completes after a new search starts; stale sockets cannot attach or overwrite the current view. SDK drops still reserve seats for recovery. See ADR 0005 and M3_MATCHMAKING.md for policies and measured validation.

Recovery is a presentation transport state, not a new game phase. `online-session.ts` gates recovered intents on a correlated full snapshot, handles SDK token rotation after acknowledgement, scopes delayed errors and refreshes state when a tab resumes. `BattleDialog` receives connection guidance/restore callbacks and never makes recovery or adjudication decisions. `tests/resilience.test.ts` reaches occupied duels through the real service; Playwright’s test-only socket proxy and Chromium lifecycle API inject transport interruptions/suspended execution without production hooks. Wire v2 and Rules v1 are unchanged. See ADR 0006 and M3_RESILIENCE.md.

## M4 content storage boundary

`packages/database` is Node-only and has no consumer in the web, game-core or current game service. It owns a private `content` PostgreSQL schema, Drizzle definitions, committed generated SQL plus hand-authored database guards, a transactional repository and a trusted local CLI. Zod validates writes and published reads. One logical question has UUID identity and append-only content revisions; explicit approval records a different actor label and review evidence, while publication atomically retires any previous published revision. Parent-row locks serialize editors/publishers, expected revisions reject stale edits, and audit entries commit with each operation. SQL guards prohibit content/review rewrites and audit updates/deletes; a database owner can still alter guards. This is not a tamper-proof external audit system.

`loadPublished()` returns a detached server-only bank with revision-qualified IDs and correct answers; it is an integration point, not yet connected to room creation. No answers or database credentials are added to the network contract. Browser resolution is explicitly denied by the package export. Current rooms keep their existing development fixture behavior. Authenticated admin authorization must precede HTTP content endpoints. CLI actor strings cannot establish user identity. Database migration/content/test commands run directly, outside Turbo task caching. See ADR 0007 and M4_CONTENT_STORAGE.md for reproducible setup and remaining M4 work.
