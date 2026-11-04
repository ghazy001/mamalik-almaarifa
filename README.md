# ممالك المعرفة · Mamalik Al-Ma'rifa

Original Arabic-first strategy trivia. The M1 foundation and M2 offline match are implemented: deterministic rules, strict protocol schemas, an RTL web shell, a standalone Colyseus health service, and original interactive Phaser terrain. Play a complete local match against two scripted opponents at `/play`, or find two real guests through basic matchmaking or private invitations at `/online`. M3 is complete for the documented local guest-match scope. M4 includes PostgreSQL question storage, a Supabase-authenticated content API, and an Arabic sign-in/editorial workspace. Opt-in published banks, durable result archives and existing-account player admission are implemented. Private personal history and basic personal standing are implemented; a reviewed release question set and hosted verification remain.

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

Open `/online` and enter a guest name. Choose **ابحث عن لاعبين** on three tabs/browser profiles using the same game service; the queue fills available rooms with three guests. **إلغاء البحث** frees an incomplete-lobby seat. Once full, all three select **أنا جاهز** within 60 seconds or the queued lobby cancels without a winner. Alternatively, **أنشئ غرفة خاصة**, share its code/link, and join with **انضم إلى الغرفة**. Private rooms never mix with queue searches. The persistent game service decides turns, questions, deadlines, ownership and results. Unexpected drops reserve the same seat for 30 seconds while timers continue; reload recovery uses a per-tab sessionStorage token. Explicit leave forfeits when it reaches the server; leaving while offline stops local retries and the unreachable seat expires through server grace. Results stay in memory unless optional match-result storage is enabled below. Actions stay disabled until fresh server state arrives after recovery. If automatic recovery stops, **استعادة الاتصال** retries the saved seat from inside the question dialog. Returning to a suspended tab refreshes its view; no deadline pauses or resets.

`GAME_SERVER_URL` defaults to `http://127.0.0.1:2567`. Export it before starting Next/Turbo or put it in `apps/web/.env.local` when changing the browser-reachable service URL. No rebuild is needed for this request-time public endpoint. Root `.env` is read by the game service, not automatically by Next. Loopback URLs work on this computer only; this increment is not a deployment.

See [M3 recovery behavior and verification](docs/M3_RESILIENCE.md), [matchmaking behavior and limits](docs/M3_MATCHMAKING.md) and the [first private-room slice](docs/M3_PRIVATE_ROOMS.md). Protocol v3 adds explicit result-storage status; restart both services and reload tabs together after upgrading. Rules remain v1. Guest seats are transport identities, not accounts. The shared development question fixtures are public through the offline demo/source; published server-only content and optional result archives are implemented in M4 below.

## Local question storage (M4 first slice)

The default preview uses public development fixtures. This optional storage workflow needs no cloud credentials and changes no live room until published source mode is explicitly enabled below. With Docker/Compose available:

```sh
docker compose up -d --wait
# Add DATABASE_URL and DATABASE_TEST_ADMIN_URL from .env.example to your root .env.
# Preserve any existing configuration; these credentials are local-only.
pnpm db:migrate
pnpm content import-fixtures
pnpm content list
pnpm content bank-check
pnpm test:database
```

Import creates 18 sourced **drafts**, skips 18 arithmetic fixtures lacking reference URLs, and publishes nothing. Repeating it preserves existing content. For a local workflow exercise, take an ID from `list`, inspect its original fixture/source, then run `pnpm content approve <id> 1 local-reviewer "Local workflow exercise"` and `pnpm content publish <id> 1 local-publisher`. `bank-check` shows published IDs/count without printing answers. This is a trusted local CLI: actor labels are audit metadata, not authenticated users or proof of human review. See [the full workflow, commands and limits](docs/M4_CONTENT_STORAGE.md).

`pnpm test:database` requires an explicitly configured bootstrap URL with CREATE DATABASE/ROLE privileges. It creates and removes its own random database and non-superuser role; it never truncates your content database. Database tasks run directly, outside Turbo caching. `docker compose stop` preserves local data. Compose setup is optional; an existing PostgreSQL 16 instance can use the same non-superuser owner/database arrangement in `packages/database/scripts/local-init.sql`. Keep bootstrap credentials out of app/client configuration.

## Private Arabic draft pack (M4 ninth slice)

This checkout includes 42 sourced Arabic candidates and a review worksheet under Git-ignored `content/private/`. They remain DRAFT/PENDING and are absent from a fresh clone; keep a private backup. Run `pnpm content pack-check content/private/starter-ar-v1.json` without a database. The optional `pack-import <root-relative-file> <author>` creates drafts transactionally, safely retries identical content and rejects changed existing keys. It never approves or publishes. Run `pnpm test:packs` with the local test bootstrap URL for isolated database checks. See [review/import steps, limits and verification](docs/M4_QUESTION_PACK.md) and [private content handling](content/README.md). At least 36 accepted independently reviewed published questions are still required.

## Combined M4 acceptance

Run `pnpm test:m4` with the local PostgreSQL test bootstrap URL to verify a standard 36-turn three-account queued match through published revisions, reconnect, durable results, private history/standing and a compiled-server restart. It takes about two minutes, uses signed local Auth fixtures and synthetic questions in an isolated disposable database, and leaves the private review pack untouched. See [exact coverage and limits](docs/M4_ACCEPTANCE.md). Human review and hosted verification remain required.

## Content identity and permissions (M4 second slice)

The persistent game service now has an opt-in Supabase-authenticated content API. Editor, reviewer and publisher roles come from private PostgreSQL memberships; client metadata cannot grant them. New question authors/reviewers come from verified account identity, and HTTP write retries use a transactional idempotency ledger. Guest play remains available without configuring this feature.

With the local PostgreSQL bootstrap URL configured, run `pnpm test:admin` to exercise real signed local test identities, HTTP requests and database operations without cloud credentials. This starts a test fixture, not a hosted Supabase instance or a production identity bypass. Run `pnpm test:database` for storage, role locking and RLS checks. CI runs both commands uncached.

For an existing Supabase project, set `CONTENT_ADMIN_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `DATABASE_URL` as documented in `.env.example`, run `pnpm db:migrate`, then restart the game service. Grant each account explicit roles with `pnpm content grant-role <project-url>/auth/v1 <account-uuid> editor <operator-label>`; use `reviewer` or `publisher` for the other permissions. No service-role key is needed. `/admin/me` and protected question reads/commands require an access-token bearer header. Direct browser Origin requests remain rejected; the Next.js server proxy supplies verified-session credentials. See the [HTTP contract and historical API verification](docs/M4_IDENTITY_AUTH.md).

## Arabic editorial workspace (M4 third slice)

`/signin` and `/admin` support existing email/password content-team accounts. There is no signup, account provisioning, recovery email or player-account integration. With the API configured above, export `WEB_AUTH_ENABLED=true`, `WEB_AUTH_ORIGIN=http://127.0.0.1:3000`, `CONTENT_ADMIN_URL=http://127.0.0.1:2567` and the same Supabase URL/publishable key before `pnpm dev`. Alternatively put web-only settings in `apps/web/.env.local`; the root `.env` is not loaded by Next.js. The configured origin must exactly match the browser origin and actual port. Use HTTPS outside loopback development.

Open `/signin`, sign in, and use the role-appropriate draft, revision, review, publication and retirement controls. A different account must review a question. The server verifies permissions on every request, including retries; profile metadata cannot grant access. Session tokens remain in HttpOnly cookies and server requests. Uncertain writes keep the same idempotency key in memory until retried; reloading loses unsaved/pending form state, so inspect the revision list before starting a replacement operation.

To verify without cloud credentials, first `pnpm build`, then `pnpm test:content-web` with the local PostgreSQL bootstrap URL. Each layout gets an isolated random database and fresh signed local Auth/HTTP fixtures; fifteen desktop/mobile/landscape journeys cover editorial work, player admission and history. Isolation keeps independent runs within the unchanged sign-in budget. This does not validate hosted Supabase. Without configuration the portal clearly shows an unavailable state and guest play still works. See [setup, manual workflow, verification and limits](docs/M4_EDITORIAL_UI.md) and [ADR 0009](docs/ADR/0009-server-cookie-editorial-session.md).

## Published online question banks (M4 fourth slice)

Set `GAME_QUESTION_SOURCE=published` and DATABASE_URL on the game server after `pnpm db:migrate`. It needs at least 36 published unique questions under normal rules and rejects invalid/unavailable/insufficient banks without a fixture fallback. A room pins exact revisions before its first seat joins; publication/retirement affects later rooms, and active matches keep running without database reads. The first reference is revealed after resolution. This option does not require Supabase credentials when CONTENT_ADMIN_ENABLED=false.

Development remains the default and `/play` still uses inspectable public fixtures. No release questions are automatically approved or published. Run `pnpm test:room-bank` with the local PostgreSQL bootstrap URL for isolated real database/socket and standalone-startup checks. See [configuration, room lifetime behavior, admission errors and exact evidence](docs/M4_PUBLISHED_ROOM_BANK.md) and [ADR 0010](docs/ADR/0010-published-room-question-snapshots.md).

## Durable online results (M4 fifth slice)

After configuring DATABASE_URL and running `pnpm db:migrate`, enable `MATCH_RESULTS_ENABLED=true` on the game server and restart both services for Protocol v3. Finished private/queued matches save answer-free outcomes and exact consumed question revision references. The result screen distinguishes pending, acknowledged saved, failed and disabled storage. Default guest startup still needs no database.

Run `pnpm test:results` with the local PostgreSQL bootstrap URL for nine isolated database/socket/standalone cases. No public history UI or account mapping is included. Queued writes are in memory: crashes before commit can lose results, and failed acknowledgement can remain uncertain after commit. See [setup, limits, verification and learning exercise](docs/M4_RESULT_ARCHIVES.md) and [ADR 0011](docs/ADR/0011-private-match-result-archives.md).

## Player accounts (M4 sixth slice)

Existing Supabase accounts can opt into verified room admission through `/account`. On the game server enable PLAYER_AUTH_ENABLED and MATCH_RESULTS_ENABLED with DATABASE_URL/Supabase URL/key, after `pnpm db:migrate`. On Next enable WEB_AUTH_ENABLED and WEB_PLAYER_AUTH_ENABLED with the existing origin/Supabase/upstream settings above. CONTENT_ADMIN_URL must point to the same service as GAME_SERVER_URL; it also supplies the server-side player ticket endpoint. Editorial API access may remain disabled. Restart both services.

Sign in, select **اللعب بحسابي**, then create/join/search. Guests can share the room, but one account can hold only one seat per room, including during reconnect grace. Provider tokens remain HttpOnly/server-side; room tickets are single-use and short-lived. Private participant rows commit with results. Sign-out does not forfeit an active seat. Signup and recovery remain future work; personal history and standing are described below. Run `pnpm test:players` or the expanded `pnpm test:content-web`; see [setup, rules, limits and verification](docs/M4_PLAYER_ADMISSION.md) and [ADR 0012](docs/ADR/0012-verified-player-seat-binding.md).

## Personal match history (M4 seventh slice)

With the existing player-account settings enabled, run `pnpm db:migrate` for the history lookup index and restart after rebuilding. Sign in at `/account`, enter and finish a game with account admission, then open `/history`. Only committed results bound to the verified account/project appear. Twenty-record pages show the player's result/stats and saved time; guest matches are not retroactively linked. No ranking or public profile is included.

Run `pnpm test:history` with the local bootstrap database URL; `pnpm test:content-web` also covers real authorized history on desktop/mobile/landscape. See [setup, API, pagination, limits and evidence](docs/M4_PERSONAL_HISTORY.md) and [ADR 0013](docs/ADR/0013-owner-scoped-match-history.md).

## Private personal standing (M4 eighth slice)

With the existing account/history settings enabled, sign in at `/account` and open `/standing`. No new migration or secret is needed. Basic-v1 awards 3 points for a sole win, 1 to each shared winner and 0 otherwise; equal totals share dense positions. Only saved published-question matchmaking matches with three verified accounts from the same project, standard Rules v1 and CASTLES/TURN_LIMIT finishes after at least one question count. Previously saved eligible games count. Guests, private/development/shortened games, aborts and LAST_PLAYER finishes remain practice history.

The page exposes only your totals/position and shows unranked honestly. This is cumulative standing, not a public leaderboard, MMR or competitive certification. Run `pnpm test:standing` with the local test bootstrap URL, or `pnpm build` then `pnpm test:content-web` for the Arabic browser journeys. See [policy, setup, API, limits and evidence](docs/M4_BASIC_RANKING.md) and [ADR 0014](docs/ADR/0014-basic-ranking.md).

## Learn the game

Open `/learn`, or select **جديد على المملكة؟ تعلّم اللعب بخطوة قصيرة** on the home page. Choose a neighboring territory at your own pace, answer a 15-second practice question, then learn scoring/victory and continue to a full match. Canvas and keyboard/touch controls share the same rule core. Practice uses a public development question and saves no results. It can be skipped or repeated. See [behavior, timing and verification](docs/M5_ONBOARDING.md). Release-question review remains deferred at the owner's request; M4 is still incomplete.

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
pnpm test:database # requires the local PostgreSQL bootstrap URL above
pnpm test:admin    # signed local Auth fixture + real HTTP/PostgreSQL permissions
pnpm test:room-bank # published revisions + two real three-client matches
pnpm test:results   # transactional result archives + real three-client save status
pnpm test:players   # verified account admission + private durable bindings
pnpm test:history   # owner-scoped history + microsecond-safe pagination
pnpm test:standing  # eligibility, ties, project isolation, retries and private totals
pnpm test:packs     # private draft import guards, batch rollback and concurrent retries
pnpm test:m4        # standard account match → saved result → private history/standing → restart
pnpm build
pnpm simulate
pnpm --filter @mamalik/web exec playwright install chromium
pnpm test:e2e
pnpm test:content-web # local signed Auth + real PostgreSQL + protected browser UI
```

The simulation uses explicit seed `2026`, synthetic question fixtures and three scripted players. It completes 36 turns with 177 accepted actions and emits a TURN_LIMIT result with `p_gold` winning. It is deterministic, not live multiplayer or a content demo. Tests replay its action/context log and compare the exact final private state.

Browser checks use a production web build on 3100 and the real authoritative room in a trusted six-turn server fixture on 2571 and Chromium at desktop, mobile and short landscape sizes, with overflow, Arabic direction, keyboard, console-error and axe checks. They do not reuse an existing process. Screenshots are saved under `apps/web/test-results/`. Run `pnpm build` before `pnpm test:e2e`; CI installs Chromium with OS dependencies. Review the [current M3 record](docs/M3_RESILIENCE.md) for current results/limits and the [historical M1 record](docs/VERIFICATION.md).

## Project layout

```text
apps/web/             Arabic shell, offline/online presentation, design tokens, Playwright
apps/game-server/     Private/queued Colyseus rooms, timers, reconnect, /health, intent adapter
packages/game-core/   Pure state machine, topology, battle/scoring rules, simulation
packages/shared/      Zod commands, events, public-state contract, protocol errors
packages/question-fixtures/ Development questions for server and explicit offline demo
packages/database/    Server-only Drizzle schema, SQL migrations, content/history/standing repositories and CLI
packages/config/      Shared strict TypeScript configuration
docs/                 Design, exact rules, architecture, protocol, milestones, ADR
.github/workflows/    Reproducible quality gates
```

Database-backed content tooling, identity/permissions and the protected editorial workspace are implemented. Published banks and optional durable result archives are also implemented. Verified account admission is implemented. Authorized personal history and private basic standing are implemented. A private 42-question sourced draft pack is prepared; independent human review/publication and Howler remain future slices. Private guest rooms and basic guest matchmaking are implemented; bounded network recovery is verified. Competitive latency fairness and public-release operations remain explicit release gates. Phaser powers public snapshot rendering for the preview and offline match. See [rules and reversible assumptions](docs/GAME_RULES.md), [architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md) and [milestones](docs/MILESTONES.md). Preserve `AGENTS.md` as the engineering charter.

## Five concepts to learn

1. `packages/game-core/src/engine.ts`: state transitions accept explicit inputs and return a new state; rejected actions preserve the original reference.
2. `packages/game-core/src/map.ts`: adjacency is a graph rule, independent of where the future renderer draws a territory.
3. `packages/shared/src/index.ts`: TypeScript helps trusted code; Zod validates data arriving from outside it.
4. `apps/game-server/src/commands.ts`: player identity is supplied by trusted transport, while `snapshot` validates an allowlisted public view. Private answers never belong in synchronized state.
5. `apps/web/src/app/tokens.css`: presentation tokens and real RTL layout live in the web layer, separate from domain outcomes.

Exercise: change the **simulation's** `maxTurns` to 6, run `pnpm simulate`, and inspect the shorter result. Restore the edit, then run `pnpm test`. Do not change production defaults without updating the rules and tests.

## Optional game audio

On `/learn`, `/play` or `/online`, click **تشغيل الصوت** to enable short original cues. Arabic mute/volume controls are also available inside the question dialog. Each page starts muted; backgrounding mutes again and requires another enable click. Audio is optional, never determines an outcome and loads its local asset only after opt-in. See [behavior, asset generation and verification](docs/M5_AUDIO.md).

## Mobile rendering and text checks

Stop `pnpm dev` before rebuilding, then run `pnpm build` and `pnpm profile:web` for production browser profiles and a 320px/200% Arabic quiz reflow check. Reports are written under `apps/web/test-results/`; the same six cases also run in `pnpm test:e2e`. CPU throttling is a local observation, not phone certification. See [method, measured regressions and limits](docs/M5_MOBILE_QUALITY.md).
