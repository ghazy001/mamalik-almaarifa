# ADR 0015 — Private sourced drafts with transactional import

Status: accepted for the local M4 content-preparation increment, 2026-11-04. Editorial acceptance of the candidate questions remains pending.

A normal published-source room needs at least 36 questions. The 18 sourced public development fixtures cannot supply a confidential release bank. Prepare 42 original Arabic candidates with primary-source references, six categories and provisional difficulty labels, allowing six candidates to fail human review. This is a reversible authoring mix, not a question-sampling or gameplay rule change.

Keep the answer-bearing pack and review worksheet under Git-ignored `content/private/`. Commit generic tooling, synthetic tests and documentation only. Private local files need separate access-controlled backup; a fresh clone intentionally has no candidate bank. No public web asset, shared DTO or development fixture imports this pack.

Use a strict version-1 JSON envelope whose only statuses are DRAFT/PENDING. Bound files to 2 MiB and batches to 200, require evidence dates/notes and HTTPS source URLs, detect normalized within-pack duplicates, and report aggregate diagnostics offline. Dates and links record preparation evidence, not proof of independent human review. The validator does not fetch URLs or establish factual truth.

Import through the existing trusted database CLI in one transaction. Stable per-question keys (`pack:<packId>:<key>`) prevent duplicate drafts/audits. Lock keys in consistent order for concurrent retries; compare incoming content to immutable revision 1 and reject changed content atomically. Later editorial revisions remain intact. Metadata is retained in the private artifact; only the existing question content, source links and author label enter database revisions. There is no new schema, public API, approval shortcut or automated publication.

The authenticated editorial workflow remains the preferred path for independent human review, revision and publication. CLI actor labels are trusted operator metadata, not verified identities. At least 36 acceptable independently reviewed published questions, Arabic gameplay QA, hosted identity verification and operational review remain M4/release gates. Published content may be revealed after resolution; private storage does not guarantee long-term secrecy or competitive fairness.
