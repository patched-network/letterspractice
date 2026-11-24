# Phonetic Analytics — content pipeline (CLAUDE.md)

Procedurally generates the LettersPractice course: exercise **cards** and
navigation **strategy configs**, from linguistic source data (CMUdict, SUBTLEX)
+ a hand-authored **GPC catalogue**, then deploys them to CouchDB.

> **Mental model:** `corpus → sequence → minimal-pairs → {cards, strategy configs} → CouchDB`.
> **Curriculum policy** (what each lesson releases, where each GPC lives, lesson
> thresholds) is *not* spread across the pipeline — it lives in one module,
> [`lib/curriculum.ts`](./lib/curriculum.ts). Read that first.

This package is imported by the app (the app depends on `lib/`, never the
reverse) — so shared truth lives in `lib/`, and `scripts/` may not import from
`src/`. (The effort that established this, the "curriculum single source of
truth", has a closeout note in the maintainer's working docs, `agent/devlog/`,
which aren't in this repo.)

---

## 1. Sources of truth & key modules

Edit these, not the generated `outputs-v2/`.

| Module | Role |
|---|---|
| ★ [`lib/curriculum.ts`](./lib/curriculum.ts) | **Curriculum SoT.** Lesson registry (`LESSON_REGISTRY`), per-GPC lesson assignment (`CATEGORY_DEFAULT_LESSON` + `GPC_OVERRIDES` → `assignmentFor`), effective concept tags (`effectiveConceptTags`), lesson-gated set (`lessonGatedConceptTags`), gating-exempt prefixes, and threshold policies (`CONCEPT_POLICIES`: pipeline prereqs **and** lesson availability, with per-concept `mustMatch`). |
| [`lib/catalogue.ts`](./lib/catalogue.ts) | The GPC catalogue (`GPC_CATALOGUE`, `GPCEntry`). Timeless linguistic fact: grapheme→phoneme, category, match type. Teaching tier via `getComprehensiveCatalogue()` (`teaching-v0.2`–`v0.4`). |
| [`lib/concept-tags.ts`](./lib/concept-tags.ts) | Mechanical category/match-type → `concept:*` derivation (`conceptTagsForEntry`). Curriculum policy in `curriculum.ts` overrides this. |
| [`lib/content-labelling.ts`](./lib/content-labelling.ts) | Branded tag/card-id helpers: `gpcShortId`, `gpcTag('exercise'|'intro'|'expose', id)`, card-id builders. (Consolidated here in P1 — formerly duplicated across scripts.) |
| [`lib/curriculum-checks.ts`](./lib/curriculum-checks.ts) | Pure consistency checks (P4.1): `buildExpectedTopology` + `runCurriculumChecks(expected, observed)`. Consumed by [`audit-prod-content.ts`](./scripts/audit-prod-content.ts) and the admin panel ([`AdminContentView.vue`](../../src/views/admin/AdminContentView.vue)). |
| [`lib/curriculum-coverage.ts`](./lib/curriculum-coverage.ts) | Pure builder for the generated state-of-the-world report (P4.2). |

App-side façade re-exporting the above: [`src/services/curriculum.ts`](../../src/services/curriculum.ts).

---

## 2. Pipeline at a glance

Canonical build order is `yarn gen:all` (in [`package.json`](./package.json)):

| Stage | Script | `yarn` | Reads → Writes (`outputs-v2/`) |
|---|---|---|---|
| 1 Corpus | [`parse-corpus-with-GPCs.ts`](./scripts/parse-corpus-with-GPCs.ts) | `gen:words` | cmudict, subtlex, catalogue → `teaching-words`, `irregular-words`, `corpus-words`, `gpc-usage` |
| 2 Sequence | [`calculate-gpc-sequence.ts`](./scripts/calculate-gpc-sequence.ts) | `gen:sequence` | corpus-words, catalogue → `gpc-sequence` |
| 3 Minimal pairs | [`analyze-minimal-pairs.ts`](./scripts/analyze-minimal-pairs.ts) | `analyze:pairs` | teaching-words → `gpc-minimal-pairs`, `…-stats` |
| 3b Recording | [`generate-recording-priorities.ts`](./scripts/generate-recording-priorities.ts) | `gen:priorities` | teaching-words, sequence, `extracted-audio/` → `recording-priorities`, `words-to-record.txt` |
| 4 Cards | [`generate-cards.ts`](./scripts/generate-cards.ts) | `gen:cards` | sequence, teaching-words, minimal-pairs, audio word-list, **`curriculum.ts`** → `generated-cards.json` + `curriculum-coverage.md` |
| 5 Strategies | [`generate-strategy-configs.ts`](./scripts/generate-strategy-configs.ts) | `gen:strategies` | sequence, gpc-stats, **`curriculum.ts`**, `generated-cards.json` (borne-tag ground truth — cards must be fresh) → `strategy-configs/*.json` |
| 6 Deploy | [`deploy-content.ts`](./scripts/deploy-content.ts) | `deploy:content` | generated-cards, strategy-configs → CouchDB docs |

Full per-script detail (inputs, card types, transformations, gotchas):
[`docs/pipeline-reference.md`](./docs/pipeline-reference.md).

**Five configs are NOT files** — `letter-gating`, `lesson-gate`, `intro-gate`,
`skill-staleness` and `recent-weakness` strategy docs are minted in
`deploy-content.ts` `buildStrategyDocs()` for the app's consumer-defined filters
(e.g. [`LessonGateFilter.ts`](../../src/services/LessonGateFilter.ts)), which read
per-user state, not config. A new one needs the app deployed first (it registers
the class), then a content deploy (the doc).

---

## 3. Generated state-of-the-world

[`outputs-v2/curriculum-coverage.md`](./outputs-v2/curriculum-coverage.md) is
emitted by `gen:cards`, **versioned and deterministic (no timestamp)** so a
re-tag PR shows its blast radius in the diff. Every GPC × state
(`active-lesson` / `deferred-lesson` / `unassigned` / `planned` /
`analysis-only`) × effective concept tag × lesson × card counts × audio, plus a
"Parked / unreleased" callout. This is the answer to "what is
accounted-for-but-unreleased?"

`outputs-v2/` layout: `generated-cards.json` (cards + `meta.stats`),
`strategy-configs/*.json` (hierarchy ×3, interference, priority, tag-registry),
plus the analysis intermediates (`teaching-words`, `gpc-sequence`, …).

---

## 4. Changing the curriculum (the common task)

To re-home a GPC, change a slate, or retune a threshold — **edit
[`lib/curriculum.ts`](./lib/curriculum.ts) only**, then:

1. `yarn gen:cards && yarn gen:strategies` — regenerate (cards first: strategies reads `generated-cards.json`).
2. `git diff outputs-v2/` — the diff IS the blast radius. `generated-cards.json`
   re-tags + `curriculum-coverage.md` changes should match what you intended;
   `generatedAt` is the only expected timestamp churn.
3. `yarn test:cards` — the invariants (incl. curriculum integrity); keep green.
4. Deploy (§6).

Gating semantics (default-deny): a GPC's cards are released by the lesson its
`unlockedBy` names, via that lesson's gated `concept:*` tag. `unassigned` GPCs
carry the `concept:unassigned` holding tag (replaces the category tag; no
hierarchy prereqs; suppressed until re-homed). `concept:skill|interference|blend:*`
are exempt from gating. Deferred-lesson concepts are gated (suppressed) too.

---

## 5. Verification & known traps

- **Pipeline typecheck is broken** (`yarn build:check` — `rootDir`/import layout
  + stale types). Do **not** trust it as a gate. The pipeline gate is:
  regenerate → **byte-diff `outputs-v2/`** (deterministic modulo `generatedAt`)
  → `yarn test:cards`.
  (App-side `yarn typecheck` / vue-tsc *is* clean and usable.)
- [`test-cards.ts`](./scripts/test-cards.ts) — `yarn test:cards`; invariants
  incl. `curriculum-*` (override integrity, teaching totality, lesson refs,
  registry twins, mustMatch, hierarchy-concept sync) and `concept-tags-traceable`.
- [`audit-prod-content.ts`](./scripts/audit-prod-content.ts) — `yarn audit:prod --url <couch>`
  (read-only; **runs credential-less** against a deployment's public course DB).
  Orphan/drift diff + the P4.1 curriculum checks. **Check `concept-traceable`
  compares deployed tags against *current* curriculum** — so a non-zero count
  pre-deploy means "content deploy is behind curriculum; redeploy", not a bug.
- [`enumerate-blast-radius.ts`](./scripts/enumerate-blast-radius.ts) —
  `yarn audit:blast-radius --url <couch>`, gating before/after vs a deployment (no creds).

---

## 6. Deploy & local dev

- **Prod (manual, human-in-loop):** ship the **app before content**
  (default-deny must be live before exile tags land, or the old filter leaks
  them). Then `yarn deploy:content --url <couch> -u <admin> -p <pass>` (the URL
  is required; `--dry-run` supported). Idempotent **merge-upsert** (preserves per-card ELO);
  TAG docs are **REPLACE-mode** (re-tags propagate, stale refs pruned) — so a
  plain deploy is sufficient for a re-tag; no nuke needed (prod is orphan-free,
  per P4.4).
- **Local:** [`seed-local-db.ts`](./scripts/seed-local-db.ts) (`yarn db:seed`)
  **wipes & recreates** the course DB then deploys current `outputs-v2/`; or
  `yarn dev:local` from the app root (regen → seed → vite). It's a frozen
  snapshot — stale until you reseed. Requires docker couch
  (`yarn couchdb:start` in a vue-skuilder checkout).
- **CI:** [`.github/workflows/ci-phonetic-analytics.yml`](../../../.github/workflows/ci-phonetic-analytics.yml)
  runs gen + `test:cards` on PRs. Never deploys content, and never talks to
  a deployment (production drift checks run from the deployment's own repo).

---

## 7. Related docs

- [`docs/pipeline-reference.md`](./docs/pipeline-reference.md) — deep per-script reference.
- [`docs/word-recording-prioritization.md`](./docs/word-recording-prioritization.md) — recording strategy.
- App entry points the curriculum reaches: [`src/services/LessonGateFilter.ts`](../../src/services/LessonGateFilter.ts), [`src/services/lessons.ts`](../../src/services/lessons.ts), [`src/views/admin/AdminContentView.vue`](../../src/views/admin/AdminContentView.vue).
