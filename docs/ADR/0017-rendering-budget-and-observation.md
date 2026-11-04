# ADR 0017 — Preserve identical visual snapshots and measure browser work

Status: accepted as reversible M5 presentation defaults, 2026-11-04.

## Context

Fresh network snapshots can contain unchanged visual map data. Rebuilding all 15 territories for those snapshots causes avoidable texture/object creation and cancels active effects. The existing Phaser configuration specified a target of 30, which does not enforce a frame limit. Mobile quality also needs reproducible observations without presenting desktop emulation as physical-device certification.

## Decision

Compare every current MapModel visual field at the renderer boundary. Retain an identical scene; repaint when ownership, legal targets, active player, players, territory structure/order or geography changes. Maintain immutable public projections and update the comparison/tests when the visual contract grows. Add the actual Phaser `fps.limit: 30` alongside its target. Prefer bounded continuous rendering over custom sleep/wake logic that could interrupt input, effects or resizing.

Use existing Playwright/Colyseus fixtures for a real snapshot regression and test-only browser observations. Record timing/size/work samples, but assert stable work and usability constraints rather than host-sensitive timing budgets. Keep the synthetic Arabic long-text reflow fixture visibly distinguished from editorial content. Preserve small report summaries in docs and configure scoped CI artifact retention.

## Consequences

Comparison costs one bounded traversal of a 15-node visual model. It retains existing effects and avoids rebuilding equivalent data without caching secrets or domain outcomes. A 30-frame cap trades higher rendering frequency for bounded work; measured hardware quality is still a release gate. No server, deadline, protocol or core changes are required. Texture baking and further device-specific optimization remain later measured decisions.
