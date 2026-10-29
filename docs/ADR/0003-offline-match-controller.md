# ADR 0003 — Explicit-time offline match controller

Status: implemented for M2. Rules/protocol remain version 1.

## Context

The first map slice only preselected targets. M2 must finish a genuine local match through the existing rules, including human defense, bot turns, timeouts, captures and results. Domain decisions must remain outside React/Phaser, and the UI must not imply protected multiplayer authority.

## Decision

Add `/play` with a per-instance `createLocalSession` controller. It owns private MatchState, the fixed development question bank and the two scripted opponent policies. All mutations pass through game-core `applyAction`; legal targets and scores come from core functions. Each controller method receives an explicit monotonic millisecond value. React supplies match-relative `performance.now()` through one browser adapter and drives a 100 ms display/scheduler tick. Visibility changes trigger catch-up. No real clock is read in the controller or core.

Before accepting a human intent, drain due bot/deadline events chronologically up to its receipt time. This rejects late answers after a tab resumes and prevents assigning a bot's answer the eventual wake-up time. A bounded loop covers at most a bounded 36-turn match. The human remains fixed to فيروز; bot actors are constructed internally. Commands include match generation, turn and question scopes; sensitive core actions use stable per-turn idempotency keys. Restart creates a fresh generation and clears outcomes/schedules.

Preserve M1's 36 turns, 10-second selection and 15-second answer windows. Bots prefer legal castles, then neutral targets, then stable IDs. Their answers are scripted from the fixture bank with one wrong answer in four turn/seat combinations. Answer delays are 4.5 seconds plus 0.6 seconds per seat when the human participates, and 0.9 seconds plus 0.2 seconds per seat for bot-only battles (bounded below each question deadline). These are local demonstration policies, not intelligence, matchmaking or validated difficulty.

Human-involved resolution waits for an explicit Continue so the owner can read feedback/source notes. Bot-only resolutions advance after 900 ms, with the same Continue available to skip the wait. Starting the next core turn uses the current receipt time, giving its full selection window. Minimizing a question never pauses the deadline. Exact answer-time ties continue to favor the defender.

React subscribes to stable controller views with `useSyncExternalStore`. The controller emits a validated public snapshot, a presentation-only map, the human's own acknowledgement, standings and resolved explanations. It never passes private state or bot submissions to the scene. Phaser can update its public model without recreating its game instance, recolors ownership and plays short capture/defense effects; reduced-motion users receive immediate static changes instead.

Use a native modal dialog for the Arabic quiz: browser focus trapping, focused heading, Escape/minimize and a reopen button. A sticky countdown remains visible during question scrolling. Four accessible answer buttons lock after submission; correctness/source/explanation appear only after core resolution. Results have rankings and a fresh replay action. All gameplay retains a DOM alternative if canvas initialization fails.

## Consequences and limits

The app can finish a local match without Colyseus coordination. It can deterministically test large timing jumps, defense, stale commands, replays and termination without timing sleeps. Core/protocol rules are unchanged.

Offline question answers and controller code are bundled in the browser and inspectable. A sanitized view is an architectural boundary, not a security boundary against the browser's owner. No online room, authentication, durable history, reconnect or anti-cheat claim is made. M3 must replace the local authority adapter with serialized server room execution and server-owned questions/timestamps; do not expose these local lifecycle methods over a network.

The 36-question fixture bank has original Arabic prompts, source-checked NASA/BIPM/MDN facts and independently tested arithmetic. It has not undergone human editorial review, difficulty balancing or M4's audited content workflow. Reload/navigation loses the current local match. Mobile emulation and axe checks do not establish physical-device performance or complete accessibility compliance.
