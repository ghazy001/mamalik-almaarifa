# Private editorial content

`private/` is intentionally ignored by Git and Prettier. It holds local answer-bearing candidate packs and human review worksheets. Do not move these files into public fixtures, web assets, shared contracts or commits. Git does **not** back them up; keep a separate access-controlled backup before moving computers or cleaning this checkout.

The initial local deliverable is `private/starter-ar-v1.json` and `private/starter-ar-v1-review.md`: 42 original Arabic, machine-assisted drafts in six categories, with official source links and evidence notes checked on 2026-11-04. Every item is DRAFT/PENDING. These files are local deliverables and will not appear in a fresh clone.

Run from the repository root, with no database required:

```sh
pnpm content pack-check content/private/starter-ar-v1.json
```

This prints aggregate diagnostics and a digest, never individual answers. It validates structure, not factual truth, source reachability, licensing, Arabic quality or difficulty. See [the review/import workflow](../docs/M4_QUESTION_PACK.md) before importing into an explicitly selected local database. Nothing auto-imports at install/startup, and nothing in pack tooling approves or publishes content.
