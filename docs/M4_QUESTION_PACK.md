# M4 — Sourced Arabic draft preparation

This ninth M4 slice prepares a concrete local bank for **human review**. It does not complete M4 or certify release content. Rules v1, Protocol v3, gameplay, sampling, account permissions and the default database-free guest preview remain unchanged.

## Deliverable and assumptions

The local `content/private/starter-ar-v1.json` contains 42 original Arabic multiple-choice candidates, seven each in space, Earth/environment, marine life, science/measurement, North African heritage and digital knowledge. Six extra drafts allow some review rejections while aiming for at least 36 accepted questions. This category mix and the 30 easy / 12 medium labels are provisional editorial judgments, not measured difficulty or matchmaking rules. Correct answer positions have counts 11/11/10/10; runtime sampling is unchanged.

Each question has four distinct choices, one answer, an explanation, an official HTTPS reference and a dated evidence note. Preparation used NASA, NOAA, USGS, Smithsonian, CERN, NIST, BIPM, UNESCO, WHATWG, W3C, IETF and Unicode sources checked on 2026-11-04. Wording was written for this project; no source illustrations or descriptive passages were copied. Factual verification by an assistant is not independent human editorial review. The companion Arabic `starter-ar-v1-review.md` supplies per-item source links and blank decision/reviewer/date fields. Every candidate remains DRAFT/PENDING; none is approved or published.

Both answer-bearing artifacts are ignored by Git and routine formatting. They are available in this checkout, **absent from a fresh clone**, and need separate private backup. Their absence never breaks install, build, CI or the guest preview. Public test fixtures exercise tooling without exposing this candidate answer bank. Neither artifact is imported by the game server at startup, by the browser, by shared contracts or by `/play`.

## Offline checks

From the repository root:

```sh
pnpm content pack-check content/private/starter-ar-v1.json
```

`pack-check` runs without DATABASE_URL or network access. Pack paths are root-relative (absolute paths also work), unlike the older individual draft/revise commands' package-relative paths. Output contains the pack ID, schema version, canonical parsed-JSON SHA-256, aggregate category/difficulty/answer-position counts, the 36-draft target flag, pending review count and zero publications. The digest includes evidence/metadata and changes when the parsed payload changes; it is not a review signature.

The strict version-1 envelope requires `packId`, Arabic locale, DRAFT status, `preparedOn` and 1–200 questions. Each item has a stable `key`, provisional `difficulty`, PENDING status, existing validated question content, and `evidence` with `checkedOn`/`note`. Dates must be real ISO calendar dates; evidence cannot postdate preparation. Pack IDs permit 32 lowercase ASCII letters/digits/hyphens/underscores, question keys 48. A file may contain at most 2 MiB. Sources use credential-free HTTPS. Unsupported/unknown fields and malformed question content fail validation.

Within a pack, keys and prompts must be unique. Comparison normalizes Unicode, Arabic marks/tatweel/alef variants and whitespace; choices must remain distinct after the same normalization. Original Arabic is preserved. This is a heuristic, not semantic plagiarism/duplication detection. The validator does not establish truth, review licenses, open URLs, identify every equivalent answer, compare another bank, enforce category balance or measure reading time. An evidence note is an authoring claim, not an approval.

## Import and human review

1. Back up the private pack/worksheet and run the offline check. Read the Arabic worksheet and references.
2. Explicitly select your intended **local content database** using the existing server-only DATABASE_URL configuration. Preserve existing settings. Run `pnpm db:migrate` if needed.
3. To import drafts, run `pnpm content pack-import content/private/starter-ar-v1.json machine-assisted-draft`. This command writes the selected database only when deliberately invoked. It creates no accounts or roles, performs no approvals/publications and prints only IDs/counts.
4. Repeating the command with identical per-question content creates zero extra drafts/audits. Input ordering is irrelevant. The importer sorts stable keys and compares immutable revision 1; later editorial revisions are never overwritten. Changed content under a previously imported key fails with `PACK_CHANGED` and rolls back the entire batch, including earlier new entries. Use the editorial revision workflow for corrections after import. New keys add new questions; removing an item does not retire existing data. Changes to pack-only evidence/difficulty do not revise database content, so preserve the updated private artifact/digest yourself.
5. A different human reviewer must open each source and verify facts, one unambiguous correct answer, plausible exclusive distractors, original wording, Arabic clarity, accessibility and suitability for the normal 15-second answer window. Check semantic repetition against the existing bank. Some drafts intentionally cover related facts; human review may reject or adjust them. Record evidence and reviewer decisions in the protected editorial workflow; the local worksheet alone cannot approve a database revision.
6. Use `/admin` with verified editor/reviewer/publisher accounts configured as in M4_EDITORIAL_UI.md. Make corrections through immutable revisions, independently review the exact latest revision, then deliberately publish accepted questions. Trusted CLI labels remain operator metadata, not authenticated human identity. Do not bulk approve these machine-assisted drafts or interpret `minimumDraftTargetMet` as bank readiness.
7. After at least 36 accepted questions are independently reviewed and published, `pnpm content bank-check` reports actual published IDs/count. Published-mode admission separately checks maxTurns and the catalog bounds. Enabling it and hosted validation are separate deliberate steps. A large draft count never enables a room.

The importer retains existing content fields, including explanation/sources, in revision rows. Difficulty, evidence notes, preparation dates and pack digest remain private artifact metadata; there is no new database migration or provenance ledger. The existing DRAFT_CREATED audit records the supplied author label. Confidential source storage helps prevent publishing answers in Git; resolved questions/answers can still become known to players over time.

## Verification

Generic unit tests cover strict statuses/versions, malformed content, dates, URLs, Arabic-equivalent duplicates, size bounds, safe file errors and aggregate diagnostics. `pnpm test:packs` runs six real PostgreSQL cases under an isolated non-superuser: draft/audit creation, exact retries after editorial revision, changed-content batch rollback, concurrent retries in differing orders, independent-review guards and pre-write validation. CI runs this uncached alongside all existing gates; no private file is needed.

For a local smoke check of the actual private pack, set `QUESTION_PACK_TEST_FILE` to its absolute path and run `pnpm test:packs` with DATABASE_TEST_ADMIN_URL pointing to a disposable bootstrap database. This enables one additional test: all candidates are imported twice, remain unreviewed drafts, and publish zero questions. The runner creates and removes its own random database and roles. It never imports into DATABASE_URL from your normal `.env`.

Measured locally on 2026-11-04 with Node 22.22.1, pnpm 10.0.0 and native PostgreSQL 16.13. PostgreSQL used a temporary loopback cluster; each test runner created/dropped its own random database and non-superuser roles. The local smoke file was explicitly set to the private pack's absolute path.

| Command                                                                    | Result                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL= pnpm content pack-check content/private/starter-ar-v1.json` | Exit 0; 42 candidates, six categories of seven, 30 easy/12 medium, 11/11/10/10 positions, 42 pending, zero publications |
| `pnpm format:check`                                                        | Exit 0                                                                                                                  |
| `pnpm lint`                                                                | Exit 0                                                                                                                  |
| `pnpm typecheck`                                                           | Exit 0                                                                                                                  |
| `pnpm test`                                                                | Exit 0; 199 tests across core/shared/database/server/web, including 13 new pack boundary tests                          |
| `QUESTION_PACK_TEST_FILE=<absolute-private-pack-path> pnpm test:packs`     | Exit 0; six generic PostgreSQL cases plus one actual 42-question import/retry check; zero publications                  |
| `pnpm test:database`                                                       | Exit 0; all 13 existing PostgreSQL content/access cases                                                                 |
| `pnpm build`                                                               | Exit 0; unchanged tasks reused valid Turbo cache, changed database/server tasks built                                   |
| `pnpm simulate`                                                            | Exit 0; seed 2026, 36 turns, 177 actions, TURN_LIMIT, p_gold wins                                                       |
| `git diff --check`                                                         | Exit 0; private JSON and worksheet confirmed Git-ignored                                                                |

Root tasks reused unchanged Turbo cache entries. The first sandboxed root test attempt failed because local listeners were denied (EPERM); rerunning with loopback permission passed all server tests. No product workaround or test skips were added. No browser layout changed in this increment, so browser journeys were not rerun; earlier UI verification remains historical evidence. Dependencies/lockfile, gameplay and protocol are unchanged. No hosted service, normal content database, account or publication was modified. Cleanup confirmed zero remaining generated test databases/roles, then stopped/removed the owned temporary cluster. The default guest preview was restored on web 3113/game 2572; home returned HTTP 200 and health reported development questions, disabled content administration and disabled result storage.

Private parsed-payload SHA-256 at verification: `f12d544846b2b4c9b7468b1e0edff73ce1fa1d2fdd06ffe3aa73af8f55fdbdc3`. If you edit any candidate or evidence metadata, rerun the offline check and retain the new digest with your private review/backup records. This digest certifies neither source truth nor human approval.

## Five concepts to inspect

1. `src/question-pack.ts`: strict validation can guarantee structure, while factual correctness still needs editorial judgment.
2. Its transaction: a stable import key supports retries; immutable revision 1 detects accidental replacement.
3. `src/cli.ts`: offline validation runs before database access, and failures print safe codes rather than answers/driver errors.
4. `tests/question-pack.postgres.test.ts`: a real database proves rollback and concurrent retry behavior that mocked repositories would miss.
5. `content/README.md` and ADR 0015: private authoring artifacts and public development fixtures have different exposure and backup needs.

Exercise: copy the private pack to another ignored filename, change one choice to match another except for Arabic marks, then run `pack-check` and observe INVALID_INPUT. Restore the copy; no database is needed. Next task: perform an independent human review of these 42 candidates, revise/reject as needed, and then verify a reviewed published bank through three-player matches with existing verified accounts.
