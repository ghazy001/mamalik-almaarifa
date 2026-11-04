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
- `game-server` depends on both and the development fixtures. `processIntent` validates input and maps a transport-bound guest player ID into a core action; the private room calls this tested boundary. `snapshot` validates the allowlisted projection. The room supplies a monotonic `performance.now()`-based clock, session-bound seats, serialized execution, timers and message limits. Optional account admission binds verified identities privately; guest seats still have no account. Do not use Date/client time as a competitive clock.
- `web` uses Next.js App Router, React, Tailwind and a customized shadcn-style Radix Slot Button. `/map` now has a lazy Phaser 4.2.1 host and equivalent DOM target controls. Its server/build-side `preview.ts` constructs the canonical initial state through core transitions, validates `publicView`, derives legal IDs and sends an explicit presentation-only model. No core values, private state or question content are imported by the client scene. `geography.ts` defines artwork positions/names, never adjacency. A UI reducer handles preselection/hover without applying gameplay actions or ownership changes. See ADR 0002.
- `config` provides strict TS settings, including unchecked-index and exact-optional checks. Packages expose only their built public entrypoint.

## Execution and build

### Offline match boundary

`web/src/features/match/local-session.ts` is a per-match, framework-independent local authority adapter. It receives explicit monotonic time, drains scheduled bot/deadline events before human intents, calls existing core functions and publishes cached public views through a subscription API. React supplies `performance.now()` relative to the component lifetime, subscribes with `useSyncExternalStore`, and runs a 100 ms timer/visibility catch-up adapter. No real clock or new domain rules were added to game-core.

Private simulation state and the development question pack remain inside the session, not React props or Phaser scenes. This separation is architectural only: the entire offline controller/answer bank is bundled and inspectable in the browser. The M3 online route uses separate server room authority instead. Human-involved resolution review waits for Continue; bot-only resolution advances automatically. Restart replaces the match generation and discards pending state. See ADR 0003 and M2_OFFLINE_MATCH for schedules/content sources/limits.

The native Arabic dialog handles question focus/minimize/reopen; countdowns continue while minimized or backgrounded. Only resolution views contain correct choices, explanations and source notes. The human's selected-choice acknowledgement is recipient-local. Phaser accepts model updates and transient resolved effects without a new canvas per tick; reduced-motion skips particles/tweens and DOM controls work if graphics fail. This offline route opens no room connection. Basic matchmaking is implemented in the online flow. Durable results, accounts and database-backed gameplay remain further work.

pnpm workspaces and Turbo orchestrate web/server services, built packages (core, shared, development fixtures and database), and shared config. Dependent builds precede typecheck/test/build and consumer dev startup; core/shared/fixture/database watchers run alongside both dev services. Database migrations/operator tools run explicitly outside cached tasks. Libraries compile ESM and declarations with NodeNext; Next uses bundler resolution. Node 22.22.1 is pinned because current Colyseus requires Node 22. Stable Next.js 16.4.3 and Colyseus 0.18.23/transport 0.18.4 were checked via the registry; exact resolved transitive versions are in the lockfile. TypeScript 5.9 remains a compatible stable compiler. No global package upgrade is required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Colyseus server](https://docs.colyseus.io/server) and [WebSocket transport](https://docs.colyseus.io/server/transport/ws). Installed package declarations and registry metadata determine the exact compatible APIs used here.

Game rooms use Colyseus's default local in-memory driver/presence, no Redis; optional finished-result storage uses PostgreSQL. The private `kingdom` and public `kingdom_queue` room types are registered through the same trusted room factory. Queue matching uses Colyseus’s in-memory `joinOrCreate` reservation/concurrency mechanism, sorted by occupied clients descending; it never queries private rooms. Health returns milestone M4, `gameplayRoomsEnabled: true` and the optional `contentAdminEnabled` flag. The separately enabled content API uses PostgreSQL as described below. Startup config validates local defaults; Ctrl+C/SIGTERM calls Colyseus graceful shutdown and closes the optional pool. Startup/stop and room logs contain lifecycle events only, with independent random log references rather than invite codes, tokens or names. Graceful shutdown broadcasts an abort before closing rooms. Optional match-result persistence is described below; rolling-deploy coordination and active-room crash recovery are not implemented. Next and Colyseus must eventually be hosted separately; long-lived rooms cannot depend on serverless request lifetimes.

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

`packages/database` is Node-only and is consumed by the game service's optional content API, published banks and result writer, never the web or game-core. It owns private `content` and `game` PostgreSQL schemas, Drizzle definitions, committed generated SQL plus hand-authored database guards, a transactional repository and a trusted local CLI. Zod validates writes and published reads. One logical question has UUID identity and append-only content revisions; approval records a different actor and review evidence, while publication atomically retires any previous published revision. Parent-row locks serialize editors/publishers, expected revisions reject stale edits, and audit entries commit with each operation. SQL guards prohibit content/review rewrites and audit updates/deletes; a database owner can still alter guards. This is not a tamper-proof external audit system.

`loadPublished()` returns detached server-only records with revision-qualified IDs and correct answers; the published room loader uses a bounded query and pins a validated bank at room creation. No answers or database credentials are added to the gameplay network contract. Browser resolution is explicitly denied by the package export. Development rooms retain fixture behavior; published mode rejects content failures without fallback. CLI actor strings cannot establish user identity. Database migration/content/test commands run directly, outside Turbo task caching. See ADR 0007 and the historical M4_CONTENT_STORAGE.md for the first slice.

The opt-in `/admin` boundary verifies explicit bearer tokens using Supabase `getUser`, then checks private project-scoped roles under shared membership locks through content/audit transactions. Actor IDs derive from issuer/subject, not client metadata. An identity/key request ledger makes writes retry-safe; failures roll back response/content/audit together and revoked roles cannot replay cached responses. All six content tables enable deny-by-default RLS with no browser policies/grants; the trusted owner connection still bypasses RLS. Operator role grants/revocations are private CLI operations with append-only audit. Enabled startup checks migrated storage and closes the pool on shutdown; default guest startup opens no database. The signed-token Auth fixture is test-only, not an enabled development identity bypass. See ADR 0008 and M4_IDENTITY_AUTH.md for the HTTP contract and earlier evidence.

### Editorial web session

`/signin` and `/admin` use a per-request `@supabase/ssr` server client. Next's Proxy refreshes cookies before server rendering and propagates changes to both the incoming request and outgoing response. Access/refresh tokens stay in HttpOnly cookies (Secure and `__Host-` prefixed under HTTPS), never React props or browser storage. No browser Supabase client exists. `getSession` only extracts the bearer credential: the game service calls `getUser` and checks PostgreSQL roles for every content operation. Proxy verification alone never grants access. This server flow uses existing email/password accounts, without signup/OAuth/recovery.

The same-origin `/api/content` proxy accepts only fixed me/list/detail paths and strict commands, strips inbound credentials/Origin headers, and validates allowlisted response DTOs. Cookie-authenticated writes require an exact configured Origin, JSON and non-cross-site fetch metadata. Private responses are dynamic/no-store, upstream requests have bounded deadlines and redirects are rejected. The web has no database dependency or service-role key. An in-memory pending command/key supports uncertain-response retry while the transactional backend ledger decides uniqueness. Form/pending data is deliberately not persisted in browser storage. See ADR 0009 and M4_EDITORIAL_UI.md; hosted Supabase behavior and broader release security remain unverified.

### Published room bank boundary

`GAME_QUESTION_SOURCE=published` enables a server-injected loader shared by both room modes, independently of editorial Auth. Room onCreate validates client options, awaits a bounded published read and only then admits seats. The read selects exact revision IDs/content from a consistent statement snapshot; question-bank validates a detached private catalog, freezes IDs and returns copied records. The normal deterministic match session receives that bank explicitly instead of looking up fixtures. No content I/O occurs in the game loop, existing-room joins or reconnect.

The loader reads at most 1,001 rows, rejects a catalog above 1,000 or below maxTurns, and bounds pending reads to four. No fallback occurs after a published-mode failure. Existing rooms retain retired/replaced revisions and survive database unavailability, but have no active-room crash recovery; optional result storage is described below. Health exposes only source mode; admission errors use safe 503/string pairs. No database import enters game-core/shared/browser code. See ADR 0010 and M4_PUBLISHED_ROOM_BANK.md.

## M4 match-result storage

MATCH_RESULTS_ENABLED independently opts into private PostgreSQL outcome archives. A server-only allowlist projects completed core results, rule/seed/bank provenance, final owners and consumed IDs. The database package validates and transactionally writes the header/revision references, with canonical payload hashing for conflict-safe retries. No domain rules move into SQL/UI and no database/archive import enters shared or browser code. Two game tables add deny-by-default RLS and UPDATE/DELETE guards.

The room submits once and publishes pending immediately; a bounded shared writer acknowledges saved after commit or failed when unconfirmed. Four concurrent jobs, 64 pending records, three attempts and a 20-second shutdown drain bound local work. Shutdown aborts rooms, drains writes and closes the pool. This is not a durable outbox; crashes before commit can lose records and uncertain responses can leave committed results marked failed. Protocol v3 adds only status, never archive/private content. Optional account mapping follows below; personal history and private standing follow below. See M4_RESULT_ARCHIVES.md and ADR 0011.

## Verified player admission

An opt-in same-origin Next endpoint converts the HttpOnly provider session into a game-service-issued opaque ticket after independent Supabase verification. Only this one-use 30-second capability enters room options. The room allocates account identities into a private seat map, synchronously enforces one seat/account/room, and preserves identity through existing bearer reconnect semantics. Guest admission remains available. Account play never grants editorial roles.

Private result_participants rows commit with the archive and question references. Their canonical sorted values join the idempotency hash, while empty mappings retain the previous guest hash. Public archive/snapshot shapes exclude identifiers, emails, JWTs and tickets. Player login reuses the existing session infrastructure; no database/Auth dependency enters game-core or the renderer. See M4_PLAYER_ADMISSION.md and ADR 0012 for configuration and known token/revocation/delivery limits.

## Owner-scoped history

The private history repository joins result_participants to match_results and filters by verified issuer and subject in SQL. A participant owner index supports this lookup. Keyset pages preserve all PostgreSQL timestamp microseconds, order equal times by match ID, and read only 21 rows for 20 public summaries. The game service verifies Auth on every read and projects only the viewer's result/stats through a strict shared schema. No global list or raw archive is sent to Next/browser code.

The fixed Next history proxy reuses the HttpOnly session and validates query and upstream DTO. A protected dynamic shell hosts the Arabic client panel. Client state is memory-only, clears on revalidation/error, cancels requests and rejects stale generations. Account admission/storage flags enable history without extra secrets or roles. Rules/gameplay protocol and result-write delivery limits are unchanged; no ranking/detail/replay endpoint is added. See M4_PERSONAL_HISTORY.md and ADR 0013 for measured verification and read-consistency/session limits.

## Private basic standing

The basic-v1 policy is owner-approved and versioned separately from Rules v1. A server-only repository uses one PostgreSQL statement to filter eligible saved matches, aggregate same-project accounts and apply dense rank, returning only the viewer's summary. It derives from immutable result/participant rows with no new table, migration, increment balance or result-writer hook. A pure policy evaluator and SQL parity fixtures check eligibility and point awards.

Fresh player authorization, the shared history/standing concurrency budget and strict response validation protect GET `/player/standing`. Next extracts its HttpOnly credential and proxies only to the fixed endpoint; no identity selectors are accepted. `/standing` presents an opt-in Arabic screen with in-memory, cancellable session state. Public peers/profiles, MMR and seasons remain out of scope. See M4_BASIC_RANKING.md and ADR 0014 for exact criteria, consistency and outstanding release limits.

## Private draft pack boundary

Local answer-bearing candidates and their review worksheet live under Git-ignored `content/private/`, separately backed up. The server-only database package validates a strict DRAFT/PENDING JSON envelope offline and imports existing question-content fields in a single transaction. Stable per-question keys and immutable revision-1 comparison reject accidental replacement while preserving later editorial revisions. Key sorting permits concurrent retries without reversed lock ordering. Generic CI fixtures contain no private candidate content.

Evidence notes, provisional difficulty and pack digest remain authoring artifacts, not database approval records. Existing authenticated editorial review/publication guards remain authoritative. No client asset, protocol, runtime sampler or schema changes. See M4_QUESTION_PACK.md and ADR 0015 for limits and the pending human review gate.

## Combined local M4 verification

An uncached `pnpm test:m4` journey connects the standard room, published loader, verified tickets, result writer, PostgreSQL archive/participant references and protected history/standing HTTP reads. It checks pre-commit visibility and exact persisted results, then starts the actual compiled entrypoint against the same disposable database to verify reads after the original service stops. Default rule/timing/request budgets remain in force. The signed local Auth provider, synthetic fixture publications, loader failure and write gate are test-only; this adds no production bypass, public API or private-bank approval. See M4_ACCEPTANCE.md for scope and remaining human/hosted gates.

## M5 guided local practice

A dedicated per-instance explicit-time web adapter drives a one-turn game-core state and projects sanitized map/question views. Target-selection time is intentionally frozen for reading, while the question starts a normal elapsed deadline. The React route supplies monotonic time, reuses the Phaser/DOM map and native battle dialog, and emits intents only. Map projection identity stays stable during countdown-only updates. Practice uses an existing public fixture and never calls multiplayer, identity or persistence services. No competitive rules/protocol change. See M5_ONBOARDING.md for the owner's question-review deferral and remaining gates.

## M5 presentation audio

A per-game-page React provider exposes one memory-only audio controller to normal and modal controls. A monotonic public-state cursor projects turn/question/resolved-outcome/finish cues without reading answers or changing rules. An injected port isolates Howler and a local original WAV sprite; it is constructed only by the enable gesture. Generation guards cancel stale callbacks, backgrounding/navigation unload sounds, and failure leaves gameplay usable. Phaser audio stays disabled. No server, database or protocol change. See M5_AUDIO.md and ADR 0016 for defaults, ownership and device limits.

## M5 rendering observation and reuse

The renderer compares the entire public visual model before repainting. Equivalent snapshots retain scene objects/effects; actual ownership, legal-action, player or map changes rebuild normally. Phaser has an explicit 30-frame limit, independent of domain/server time. Quiz typography scales and permits mixed-text wrapping. Test-only canvas/PerformanceObserver/CDP probes record production-build samples and exercise unchanged real room snapshots; no production metrics API or secret-bearing report is introduced. See M5_MOBILE_QUALITY.md and ADR 0017 for measurement limits and remaining device work.
