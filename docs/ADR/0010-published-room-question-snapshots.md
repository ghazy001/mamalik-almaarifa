# ADR 0010 — Published question snapshots per room

Date: 2026-10-30. Status: accepted for the M4 local increment.

## Context

Content revisions are immutable and publication is transactional, but rooms previously read only the public development pack. Online games need a private bank without introducing database I/O into the deterministic core, changing answers mid-duel, or silently starting with insufficient content.

## Decision

Add explicit `GAME_QUESTION_SOURCE=development|published`, defaulting to development. Published mode requires DATABASE_URL independently of editorial Auth settings. Startup verifies migrated storage; each new room loads current published revisions before any seat is admitted. Private and queued rooms use the same boundary. Existing waiting rooms retain their original bank when additional players join.

A single ordered PostgreSQL statement provides a consistent published view; publication transactions expose either the prior or replacement revision. The server validates and detaches the resulting question records, freezes the ID list and returns copies from private lookups. IDs include logical UUID and revision (`<uuid>_v<revision>`). Core receives only the IDs plus explicit selected-question context and keeps its existing seeded shuffle/no-repeat rules. The full bank never enters shared/client state.

Require at least maxTurns unique entries (36 under normal rules). Limit reads to 1,001 rows and reject banks over 1,000 rather than fetching an unbounded catalog or silently biasing sampling. Bound concurrent bank reads to four per service; the pool also bounds connections and query time. There is no database query during join-to-an-existing-room, readiness, answer processing, resolution or reconnect. The existing single-reference reveal projects the first editorial reference after resolution; all references remain in editorial storage.

Admission failures return HTTP 503 and an allowlisted string code: CONTENT_BANK_INSUFFICIENT, CONTENT_BANK_INVALID or CONTENT_BANK_UNAVAILABLE. Colyseus 0.18.23 uses ServerError.code as the HTTP status, so custom four-digit codes are incompatible with its installed router. The browser translates known status/code pairs into Arabic and never reflects arbitrary upstream text. Gameplay Protocol v2 and Rules v1 remain unchanged.

## Consequences and limits

Publication, retirement and database outages affect new rooms only. A waiting/active room may finish using a revision retired after its snapshot was taken. Immediate withdrawal requires aborting those rooms operationally; no withdrawal system is added here. Process loss still loses rooms and results. A future catalog above 1,000 needs a reviewed bounded sampling policy, not silent truncation.

Development mode and `/play` keep public fixtures. Importing and publishing an already public fixture cannot make its content secret. A release bank requires reviewed content kept out of browser/source fixtures. The implemented boundary prevents pre-resolution answer disclosure through online snapshots; it is not a claim that all current content is confidential or editorially certified.

No new database tables, account-to-seat mapping, durable results, rank system, cloud service or deployment is introduced. See M4_PUBLISHED_ROOM_BANK.md for setup, measured verification and remaining release work. Installed Colyseus router/SDK source was inspected for the exact HTTP behavior used here.
