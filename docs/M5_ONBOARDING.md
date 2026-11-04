# M5 — Optional Arabic guided practice

The owner deferred question verification on 2026-11-04 and requested continued work. M4 remains incomplete: all 42 private candidates stay DRAFT/PENDING, independent review/publication is postponed, and hosted verification remains outstanding. This first independent M5 slice adds onboarding while preserving those gates.

## Player experience

Open `/learn` from the home page or the local-match lobby. Three visible steps introduce selecting a legal neighbor, answering one question, and understanding victory. The player controls teal on the canonical 15-territory map, with both canvas input and accessible DOM target buttons. Selection is untimed while reading. Starting the question begins the normal 15-second answer window, including while minimized or backgrounded. Correct, incorrect and unanswered attempts resolve through game-core; the answer/explanation appears after resolution.

Continue to learn about the three castles, normal 36-turn match, scoring, home-castle elimination and ties. Start a full local match, open real multiplayer, retry with fresh ownership/choice state or skip directly to `/play`. A failed attempt still lets the player read the lesson and retry; completion is not a competitive win. The guide is optional, revisitable and never inserted into a running match.

The Arabic RTL layout uses existing ink/teal/gold tokens, focus management, touch controls, reduced motion and the canvas fallback. It adds no assets or dependencies. One existing public development fixture (`q_space_1`) supplies the question; answers remain inspectable in the offline bundle. The private release bank is not imported. There are no accounts, gameplay sockets, database writes, saved points, completion tracking or browser storage in practice.

## Architecture and teaching exception

`features/learn/practice-session.ts` is a per-instance explicit-time adapter with no React, Phaser, clock reads, randomness or I/O. It prepares a real three-player core state with seed 2026 and a one-turn practice configuration. The core supplies adjacency, answer legality, captures and outcomes. Domain time is frozen during target selection as an explicitly explained teaching exception; selection starts an elapsed quiz clock. Normal match rules/timers are unchanged. Illegal/stale/premature actions, invalid times and answer replacements fail safely. Restart changes the match ID and clears earlier choices/reveals/ownership.

React supplies monotonic elapsed time and subscribes to sanitized snapshots. Countdown ticks retain the map projection identity, avoiding terrain rebuilds. The renderer receives public map data and emits intents. The shared native battle dialog keeps focus, minimization, countdown and resolved cards; its optional continuation label preserves existing local/online defaults. No tutorial logic enters game-core, the shared protocol or the server.

On small screens instructions/target controls come before the map. The guide can be completed without canvas precision. Human observation is still needed to establish whether unassisted newcomers understand play within 30 seconds; automated journeys do not prove that. Sound, art polish, physical-device profiling and reviewed release content remain future work.

## Verification

Eight adapter tests cover topology, untimed reading, illegal/stale/premature actions, actual capture, answer privacy/reveal, exact 14,999/15,000/15,001 ms boundaries, wrong answers, timeout, replacement rejection, fresh retry, malformed IDs, clock validation and stable map identity between ticks.

Three Playwright journeys run on desktop (1440×1000), mobile (Pixel 7) and reduced-motion landscape (740×360): complete guided capture/finish/retry/skip, canvas failure with an incorrect answer, and expiry while minimized. They check keyboard focus/activation, no gameplay socket, RTL/overflow and axe accessibility. Existing offline-match/dialog/landing journeys also run on all three layouts. CI discovers `tests/learn.spec.ts` through the existing `pnpm test:e2e`, with no private files or new configuration.

Measured on 2026-11-04 with Node 22.22.1 and pnpm 10.0.0. Final gates exited 0; unchanged Turbo tasks reused valid cache. Local browser invocations used temporary idle-sleep inhibition only while the test command ran.

| Command                                                                                                      | Result                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                          | Passed                                                                                                    |
| `pnpm lint`                                                                                                  | Passed                                                                                                    |
| `pnpm typecheck`                                                                                             | Passed, including practice and browser-test sources                                                       |
| `pnpm test`                                                                                                  | 207 tests passed: core 31, shared 27, database 41, server 51, web 57 (including eight new practice cases) |
| `pnpm build`                                                                                                 | Six package/app tasks passed; the new `/learn` route was built successfully                               |
| `pnpm --filter @mamalik/web exec playwright test tests/learn.spec.ts tests/play.spec.ts tests/shell.spec.ts` | All 21 desktop/mobile/landscape journeys passed                                                           |
| `pnpm --filter @mamalik/web exec playwright test tests/learn.spec.ts` after map-projection stabilization     | All nine practice journeys passed in 30.4 seconds                                                         |
| `git diff --check`                                                                                           | Passed                                                                                                    |

Desktop/mobile/landscape screenshots were inspected for Arabic readability, directionality, target controls, overflow and completion links. A final landscape capture was corrected to scroll to the page top before full-page screenshots, avoiding Chromium's off-screen fixed skip-link capture artifact. The final landscape guided-practice recapture also passed (one journey, 9.1 seconds for its test invocation). No UI workaround hides keyboard focus. PostgreSQL, hosted M4 gates and the full network/authenticated browser suites were not rerun for this frontend change; earlier evidence remains historical. New onboarding cases will run with the full existing guest suite in CI; remote CI execution is not claimed. The guest preview was restored on web 3113/game 2572; `/learn` and `/` returned HTTP 200, with development questions and content administration/result writes disabled.

## Five files and manual exercise

1. `app/learn/page.tsx`: optional entry preserves direct access to existing matches.
2. `features/learn/practice-session.ts`: a teaching clock feeds the same rule reducer used for actual outcomes.
3. `features/learn/Practice.tsx`: presentation observes public state and sends intent, rather than deciding conquest.
4. `features/match/battle-dialog.tsx`: a shared accessible dialog preserves keyboard and timeout behavior.
5. `tests/learn.spec.ts`: real user journeys check that selection, answers, navigation and retries work together.

Exercise: wait over ten seconds before selecting a target at `/learn`, start the question and minimize it. After fifteen seconds it resolves without a conquest. Read the explanation, continue and retry; ownership returns to the initial castles. Complete a correct attempt and choose a full local match. Next recommended independent M5 task: opt-in sound controls and concise interaction cues, followed by observed newcomer testing. Resume question review only when the owner requests it.
