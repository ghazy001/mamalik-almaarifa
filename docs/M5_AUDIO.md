# M5 — Optional interaction audio

This independent M5 slice adds sound to `/learn`, `/play` and `/online`. M4 remains incomplete. The owner deferred private question verification on 2026-11-04; no candidate was reviewed, approved, imported or published here.

## Player behavior and reversible defaults

- Every game page starts muted, at a prepared volume of 35%. Nothing is stored between pages or reloads. Click **تشغيل الصوت** to load the local sound sprite and hear a short confirmation. The script is bundled with the game page, but creates no Howl/audio context or asset request before that gesture.
- Arabic keyboard/touch controls offer mute and a 0–100% volume slider. The same settings also appear inside the native question dialog, where outside controls are inert. Zero volume stays silent; changing volume never replays earlier events. All game information remains visible in text.
- Brief cues mark your turn, a question involving you, a public capture/retained territory, and match completion. No music, looping ambience, countdown ticking, opponent-answer cues or pre-resolution correctness cues. Only one cue plays at a time. Finishing directly from resolution can prioritize the completion cue.
- Hiding the page immediately unloads active/pending sounds and returns to mute. Returning requires another enable gesture. Navigation unloads this page's sound. This conservative foreground policy avoids delayed/background playback; automatic resume and saved preferences are deferred.
- Load/play failures display a short Arabic message and permit an explicit retry. A 12-second asset-load watchdog prevents an endless loading state. Mute can cancel an in-progress load. Audio failure cannot decide or delay a game action.

## Architecture and asset provenance

`features/audio/cues.ts` projects only sanitized `PublicState` fields. It never sees submitted answers, fixture answers, server secrets or client timestamps. A per-view monotonic match/turn/phase cursor suppresses repeated/out-of-order updates. Initial, new-match and restored snapshots establish a silent baseline. Countdown-only renders produce no repeated cue. Disconnection resets the baseline; the next connected snapshot is silent.

`controller.ts` holds per-page mute/volume/load state behind an injectable audio port. Generation checks invalidate late load/error callbacks after mute, backgrounding, retry or disposal. It drops cues while muted/loading/hidden/at zero volume and never queues gameplay sounds. `GameAudio.tsx` supplies the React context, lifecycle, shared Arabic controls and the public-state observation hook. The three game screens only pass public snapshots and the local player ID. No core rules, server, protocol or persistence changes are made.

`howler-port.ts` uses pinned Howler 2.2.4 and TypeScript definitions 2.2.13. Construction and AudioContext resume occur synchronously inside the enable gesture; Howler handles sprite playback and browser output. It owns/unloads one Howl and never changes global volume. Phaser audio remains disabled. See the [official Howler documentation](https://github.com/goldfire/howler.js#documentation) for sprite offsets, events, volume, mobile unlocking and unload behavior.

The six soft tonal cues are original mathematical synthesis, with no external samples or recordings. `apps/web/scripts/generate-audio.mjs` deterministically creates `apps/web/public/audio/kingdom-cues.wav`: mono, 22,050 Hz, signed 16-bit PCM, 3.8 seconds including spacing, 167,624 bytes. It checks for clipping and applies short attack/decay envelopes. Regenerate with `node apps/web/scripts/generate-audio.mjs`; the sprite offsets in the adapter must stay synchronized. The generator and output are project assets under the repository's ownership/license terms; no third-party sound attribution is required. Howler's own MIT license remains in its dependency distribution.

## Verification

Ten unit tests cover default silence/no factory call, enable/loading, volume limits/zero, mute and stale callbacks, background cancellation, failure/retry, disposal/output exceptions and actual core-resolved capture/retention projection. They cover repeated, stale, new-match and reconnect snapshots without exposing private content. Browser tests observe real decoded Web Audio source starts without replacing Howler playback, verify that the WAV is not requested before opt-in, exercise keyboard/shared modal volume/mute and confirm unchanged question resolution. A separate journey aborts the audio request, retries successfully and simulates visibility notifications. Physical device interruption/listening quality is not established by these tests.

Measured on 2026-11-04 with Node 22.22.1 and pnpm 10.0.0. These gates exited 0; unchanged Turbo tasks reused valid local cache:

| Command                                    | Result                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`           | Passed in the existing workspace; lockfile unchanged by this check                   |
| `pnpm format:check`                        | Passed                                                                               |
| `pnpm lint`                                | Passed                                                                               |
| `pnpm typecheck`                           | Passed, including audio and browser sources                                          |
| `pnpm test`                                | 217 passed: core 31, shared 27, database 41, server 51, web 67 (ten new audio cases) |
| `pnpm build`                               | All six build tasks passed; final build includes output-exception guards             |
| `pnpm test:e2e`                            | All 45 guest browser journeys passed across desktop/mobile/landscape in 8.5 minutes  |
| `node apps/web/scripts/generate-audio.mjs` | Passed clipping check; regeneration retained identical SHA-256                       |
| `git diff --check`                         | Passed                                                                               |

The full guest suite includes the six new sound journeys, complete offline matches and three-browser network matches with 80 ms simulated round-trip latency, lost frames, in-question reconnect/reload, frozen-tab recovery, queue cancellation and manual recovery. That run preceded a final defensive output-cleanup guard; the final build and dedicated six-case audio rerun verify the resulting audio implementation. Desktop/mobile/landscape controls and dialog screenshots were inspected. Dialog recaptures use viewport screenshots to avoid a full-page Chromium capture artifact with fixed off-screen skip links. No style hides keyboard focus.

The final `pnpm --filter @mamalik/web exec playwright test tests/audio.spec.ts` rerun passed all six journeys in 1.1 minutes, including the output guards and corrected dialog captures. PostgreSQL/hosted Auth/M4 combined acceptance were not rerun for this presentation-only change. Hardware listening, Safari and physical phone interruptions remain unverified. CI already discovers both `src/features/audio/audio.test.ts` in `pnpm test` and `tests/audio.spec.ts` in `pnpm test:e2e`; no paid service, secret or database is needed for this slice.

The database-free guest preview was restored on web 3113/game 2572. `/play`, `/learn` and `/online` returned HTTP 200; `/health` reported development questions with content administration and result writes disabled. No push or deployment was performed.

## Five concepts and a manual exercise

1. `cues.ts`: presentation observes public outcomes; it never determines them.
2. `controller.ts`: injected effects make cancellation, failures and user consent testable.
3. `howler-port.ts`: a small adapter isolates browser playback from React and rules.
4. `GameAudio.tsx`: one provider shares controls across a page and its modal dialog.
5. `audio.spec.ts`: browser tests check decoded playback scheduling while preserving actual gameplay.

Exercise: open `/learn`, enable sound, lower volume, choose a territory and begin the question. Set volume to zero inside the dialog and answer; the result still appears. Mute, finish, reload and confirm that sound remains off. Test a tab switch and re-enable on return. Listen on a physical phone with headphones/speakers before approving the sound mix. Recommended next independent M5 work: observed newcomer testing and measured mobile performance/RTL QA. Resume question review only when requested.
