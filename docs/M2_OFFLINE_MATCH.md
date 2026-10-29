# M2 — Full offline match

The implemented `/play` flow adds one human kingdom (فيروز), two explicitly scripted opponents, timed neutral claims/occupied duels, answer acknowledgements, resolution feedback, captures, scores, castle elimination, final placements and replay. `/map` remains a paused exploration preview. This is local single-browser simulation; it does not communicate with Colyseus game rooms.

## Manual journey

1. Run `nvm use`, `pnpm install --frozen-lockfile`, and `pnpm dev`.
2. Open `/play` at the web port printed by Next, or choose **العب مباراة محلية** from the home page.
3. Read the local-play introduction, then **ابدأ المباراة المحلية**.
4. Select an outlined territory with the canvas or DOM buttons, then **ابدأ التحدّي**.
5. Answer one of four choices within 15 seconds. Opponents may attack you, so read whether you are attacking or defending. Correctness beats incorrectness; speed resolves two correct answers, and exact ties retain the defender.
6. Inspect the revealed answer/explanation and optional source, then **متابعة الدور التالي**. Escape or **تصغير المواجهة** minimizes the dialog; **إعادة فتح المواجهة** restores it. The deadline continues while minimized or backgrounded.
7. Complete the match, inspect the three placements and choose **مباراة جديدة**. The new generation starts in the introduction with initial ownership and no stale actions.

No cloud credentials or game-server connection are needed for this local route. The app still needs its web assets to load; this milestone does not add service-worker installation or offline asset caching. Reloading/leaving the route discards in-memory progress.

## Boundaries and behavior

`features/match/local-session.ts` orchestrates existing game-core transitions and explicit-time scheduling. Its clock/seed are explicit inputs; React and Phaser contain no scoring or resolution rules. Due events run at their scheduled times before a human action is evaluated. Invalid/stale/late actions cannot create territory changes. Human-involved resolutions wait for Continue; bot-only resolutions advance after a short interval. M1's 36 turns and 10/15-second windows remain unchanged.

React receives sanitized PublicState plus the human's own selected choice/acknowledgement. Explanations and correct choices appear only on resolved views. The Phaser renderer receives MapModel and resolved visual effects, never question contents, answers or private state. Its canvas persists through ownership changes and countdown ticks. Captures tint lands, add faction flags and emit a brief ring/particles; defense uses a ring. Effects can be skipped by continuing and are omitted under reduced motion. DOM status/text remains authoritative presentation when effects are omitted or the renderer fails.

The native Arabic quiz dialog traps focus, focuses its heading, supports minimize/Escape and uses large choice targets. The timer is sticky during scroll and is not announced on every display tick. Results focus their heading and show joint ranks when applicable. The UI names bots as **خصم مبرمج**; no real players, network fairness or hidden-answer protection are implied.

## Question fixtures and sources

All prompts/options/explanations are original concise Arabic text. The 36 IDs are unique and sampled without replacement through the M1 seeded deck. Correct options vary across all four positions.

- Six solar-system questions were checked against [NASA's planet overview](https://science.nasa.gov/solar-system/planets/).
- Six SI-unit questions were checked against [BIPM's base-unit table](https://www.bipm.org/en/measurement-units/si-base-units).
- Six web-technology questions use MDN's [HTML introduction](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Creating_the_content), [CSS introduction](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Styling_the_content), [JavaScript introduction](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Adding_interactivity), [HTTP](https://developer.mozilla.org/en-US/docs/Glossary/HTTP), [URL](https://developer.mozilla.org/en-US/docs/Glossary/URL) and [UTF-8](https://developer.mozilla.org/en-US/docs/Glossary/UTF-8) references.
- Eighteen authored arithmetic fixtures carry their operation/operands and have independent answer checks. They have no external source dependency.

These are **development fixtures**, source-checked during implementation, not a human-approved public question bank. M4 still owns editorial review, durable sourcing/versioning, difficulty balancing, administration and publication. All offline answers are inspectable in the browser bundle.

## Verification scope

Controller tests cover explicit startup, unchanged defaults, illegal/stale actions, no capture at selection, correct/incorrect/missing answers, exact-deadline rejection, duplicate submission, human defense, participant enforcement, monotonic time, deterministic coarse/fine catch-up, fresh restart, and complete matches across five seeds. Existing graph/security/core/protocol/health tests remain applicable.

Browser journeys cover a full real UI match through placements and replay; native dialog focus/RTL/axe checks; visible capture ownership; one retained canvas; zero room WebSockets; timeout while minimized; and the DOM fallback with canvas disabled. They use Playwright's clock to advance deadlines, not sleeping as evidence. Accessibility scans run with a live clock because axe itself uses asynchronous timers. Desktop, portrait and reduced-motion landscape are inspected independently.

Validation environment: macOS arm64, Node 22.22.1 and pnpm 10.0.0. Commands used the installed Node 22 binary directory on PATH. No dependencies or lockfile entries changed in this increment.

| Command                                    | Exit / observation                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` | 0; existing workspace up to date, lockfile unchanged                                     |
| `pnpm format:check`                        | 0                                                                                        |
| `pnpm lint`                                | 0                                                                                        |
| `pnpm typecheck`                           | 0; includes controller and browser test sources                                          |
| `pnpm test`                                | 0; 79 tests: core 31, shared 20, server 4, web 24                                        |
| `pnpm build`                               | 0; libraries/server compile and static `/`, `/map`, `/play` routes build                 |
| `pnpm test:e2e`                            | 0; all 18 Chromium journeys passed across desktop, portrait and reduced-motion landscape |

The existing GitHub Actions workflow runs the same formatting, lint, type, unit, build and browser gates. Hosted execution of this increment has not been observed. A production preview was started locally with `pnpm --filter @mamalik/web start --port 3112`; this does not deploy the game or start multiplayer rooms.

Desktop (1440×1000), Pixel 7 portrait (412×839 CSS pixels, read from the installed Playwright device descriptor) and reduced-motion landscape (740×360) screenshots were inspected. The Arabic question dialog wraps correctly, answer badges remain distinct from numeric values, short landscape uses internal scrolling with a sticky timer, and results/territory controls stack on portrait. The browser assertions check page overflow and axe WCAG A/AA violations in the scanned states.

The first full browser run passed all match journeys but exposed the rules link being hidden on mobile after the hero CTA changed to Play. The responsive header now keeps that rules link visible. Earlier test-harness failures came from pausing axe's own asynchronous timers and choosing a fake-clock pause time too close to the current timestamp; scans now run with a live clock and gameplay tests pause safely in the lobby before starting.

Physical-device FPS, human usability/balance, Safari/Firefox compatibility, public question review and hosted CI execution remain unverified. Multiplayer, durable recovery and deployment are outside M2.

## Five files/concepts to learn

1. `local-session.ts`: explicit-time orchestration decides when to call rules; the pure core still decides what happens.
2. `questions.ts`: development content lives outside React and includes source/derivation notes.
3. `local-match.tsx`: React subscribes to public views and emits intents rather than changing scores/owners.
4. `battle-dialog.tsx`: native dialog semantics and DOM answer controls make timed play usable without canvas precision.
5. `renderer.ts`: ownership/effects are presentation derived from snapshots; one canvas can redraw many states.

Exercise: capture an adjacent neutral land, minimize the resolved dialog and compare the map flag with the score increase. Then replay and let the same question expire; the neutral land must remain neutral. Do not change the core rules to alter UI effects or bot presentation.
