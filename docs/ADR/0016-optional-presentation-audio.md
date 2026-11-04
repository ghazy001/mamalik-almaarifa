# ADR 0016 — Per-page, opt-in presentation audio

Status: accepted as reversible M5 implementation defaults, 2026-11-04.

## Context

The charter selects Howler for controllable, optional audio. The owner requested continued work while deferring question review. The existing game screens already receive sanitized state and provide accessible native question dialogs. Audio must not decide outcomes, leak answers, replay old network updates or prevent play when blocked.

## Decision

Use one memory-only controller per game page, with mute and volume controls shared through React context into the modal. Start muted on every route/load, prepare volume at 35%, create Howler only in an enable gesture and load a single original local PCM sprite. Generate soft, short cues from deterministic mathematical synthesis; no third-party recordings or music. Keep Phaser audio disabled.

Project cues from public match/turn/phase/outcome fields with a monotonic cursor. Initial/new/restored states establish a silent baseline. Muted, loading, hidden and zero-volume states drop cues without a backlog. Failures invalidate the current port and permit manual retry. Generation checks reject late callbacks. Backgrounding and navigation unload sound; returning requires another explicit enable. Do not change global Howler volume or gameplay deadlines.

## Consequences

No new protocol, server secret, storage preference, tracking or gameplay rule is introduced. Multiple page/modal controls stay in sync; visual instructions remain sufficient. A small browser adapter is testable with injected ports, while browser journeys observe real decoding/play scheduling. The single WAV is about 164 KiB and requested only after opt-in.

Per-page consent and background muting are conservative: players must re-enable after a tab switch or navigation. Saved settings, auto-resume, ambient music and a richer sound mix remain future decisions. Automated Chromium tests cannot establish Safari/mobile hardware behavior, perceived quality or accessibility for actual players; those require physical-device and human QA. M4 question review/publication and hosted acceptance remain incomplete.
