# Content Pipeline — per-script reference

> Deep reference for every pipeline script: role, inputs/outputs, key logic,
> gotchas. The **entry point / orientation** is
> [`../CLAUDE.md`](../CLAUDE.md) — read that first; this is the depth behind it.
>
> Curriculum policy (lesson slates, GPC homes, thresholds) lives in
> [`../lib/curriculum.ts`](../lib/curriculum.ts), not in these scripts.
>
> References use **function/symbol names, not line numbers** (the latter
> re-stale on every edit). Supersedes the former `pipeline-wayfinding.md`.

## Overview

Three responsibilities + deploy:

| Category | What | Scripts |
|---|---|---|
| **A. Linguistic analysis** | Align words→GPCs, sequence GPCs by utility, find minimal pairs | `parse-corpus-with-GPCs`, `calculate-gpc-sequence`, `analyze-minimal-pairs`, `phoneme-frequency-v2` |
| **B. Content generation** | Card JSON + strategy configs for the runtime course | `generate-cards`, `generate-strategy-configs` |
| **C. Recording prioritisation** | Which words to record next | `generate-recording-priorities` |
| **Deploy** | Push artefacts to CouchDB | `deploy-content`, `seed-local-db` |

Build order (`yarn gen:all`): `gen:words → gen:sequence → analyze:pairs →
gen:priorities → gen:cards → gen:strategies`. Deploy is separate. (Cards
before strategies: `generate-strategy-configs` reads `generated-cards.json`
as borne-tag ground truth for hierarchy prereq emission.)

```
cmudict.dict ┐
subtlex.json ┼─► parse-corpus ─► teaching/irregular/corpus-words, gpc-usage
catalogue.ts ┘                        │
   corpus-words ─► calculate-gpc-sequence ─► gpc-sequence
   teaching-words ─► analyze-minimal-pairs ─► gpc-minimal-pairs
   sequence + gpc-stats + curriculum.ts ─► generate-strategy-configs ─► strategy-configs/*.json
   sequence + teaching-words + minimal-pairs + audio + curriculum.ts ─► generate-cards ─► generated-cards.json (+ curriculum-coverage.md)
   generated-cards + strategy-configs ─► deploy-content ─► CouchDB
```

---

## Stage 1 — Corpus analysis: [`parse-corpus-with-GPCs.ts`](../scripts/parse-corpus-with-GPCs.ts) (`gen:words`)

Align every word in CMUdict × SUBTLEX against the GPC catalogue; classify
monosyllables as teaching (fully decodable) vs irregular.

- **Inputs:** `src-data/cmudict.dict`, `src-data/subtlex.json`, [`lib/catalogue.ts`](../lib/catalogue.ts).
- **Outputs (`outputs-v2/`):** `teaching-words.json` (word, phonemes, frequency, gpcs, pattern, issues), `irregular-words.json`, `corpus-words.json`, `gpc-usage.json`.
- **Logic:** iterate CMUdict entries with SUBTLEX freq > 0 → `alignWord()` (`lib/alignment.ts`) → `isMonosyllabic()` split → aggregate via `GpcStatAggregator`.
- **Constraints:** `"a"` hardcoded-excluded; zero-frequency words skipped; the catalogue version determines "fully aligned".

## Stage 2 — Sequencing: [`calculate-gpc-sequence.ts`](../scripts/calculate-gpc-sequence.ts) (`gen:sequence`)

Staged greedy set-cover: order GPCs to maximise frequency-weighted decodable
coverage.

- **Inputs:** `corpus-words.json`, catalogue. **Output:** `gpc-sequence.json` (step, gpcId, marginal gain, cumulative coverage).
- **Logic:** curriculum *stages* (`Map<step, CurriculumStage>`) gate which GPC categories the greedy selector may use (e.g. step 1 simple consonants, ~10 digraphs, ~20 magic-e); `computeDecodeOptimalSequence()` (`lib/coverage.ts`) does decode-based coverage.
- **Cold-start seed:** `INITIAL_KNOWN_GPCS` — **only `s-S`** is the true seed (the single GPC available at cold start; see the in-file comment). *(The old wayfinding's "s, n, i, t pre-seeded" is stale.)*
- **Prereqs:** magic-e GPCs require all 5 short vowels; sight word "you" requires "y".
- **Output shape:** consumers rebuild the teaching set as `new Set([...initialKnown, ...sequence.filter(s=>s.step>0).map(s=>s.gpcId)])` (+ the synthetic `GPC-e-silent-split` marker in `generate-cards`).

## Stage 3 — Minimal pairs: [`analyze-minimal-pairs.ts`](../scripts/analyze-minimal-pairs.ts) (`analyze:pairs`)

GPC-level minimal pair index (words differing by exactly one GPC position).

- **Input:** `teaching-words.json`. **Outputs:** `gpc-minimal-pairs.json`, `gpc-minimal-pair-stats.json`.
- **Logic:** `buildGpcMinimalPairIndex()` (`lib/minimal-pairs.ts`) with `excludeWholeWordGpcs: true`; clusters (4+ mutually paired); reports by position (onset/nucleus/coda) and phoneme contrast.
- **Downstream:** consumed by `generate-cards` (WordSelection) and `generate-recording-priorities` (synergy scoring).

## Stage 4 — Strategy configs: [`generate-strategy-configs.ts`](../scripts/generate-strategy-configs.ts) (`gen:strategies`)

Generate the JSON that parameterises the vue-skuilder navigation filters —
*which cards the learner sees and when*.

- **Inputs:** `gpc-sequence.json`, `outputs/gpc-stats.json` ⚠ (see gotcha), [`lib/catalogue.ts`](../lib/catalogue.ts), **[`lib/curriculum.ts`](../lib/curriculum.ts)**.
- **Outputs (`outputs-v2/strategy-configs/`):** `hierarchy-gpc.json`, `hierarchy-concept.json`, `hierarchy-ui.json`, `interference.json`, `priority.json`, `tag-registry.json`.

What each controls at runtime:
- **Hierarchy (GPC / concept / UI scopes):** prerequisite DAG. GPC scope = `gpc:expose:X → gpc:intro:X → gpc:exercise:X` per teaching GPC (multi-letter GPCs require component letters; early GPCs get tapering `preReqBoost`/`targetBoost`). UI scope gates question-type progression (word-selection → missing-letters → spelling).
- **Concept scope — now derived, not hand-mirrored.** `generateConceptPrerequisites()` iterates **`CONCEPT_POLICIES`** in [`lib/curriculum.ts`](../lib/curriculum.ts) and emits `hierarchy-concept.json`. The same `CONCEPT_POLICIES` entries also drive lesson availability in [`src/services/lessons.ts`](../../../src/services/lessons.ts). **One source; no manual mirroring.** Agreement between pipeline soft-gating and lesson availability is a *per-concept opt-in contract* (`mustMatch: true`), audited by `test:cards` (`curriculum-mustmatch`, `curriculum-hierarchy-concept-sync`) and P4.1 check (3) — not a blanket "both must agree" rule. The digraphs breadth gate is a documented deliberate divergence (`mustMatch: false`). *(This supersedes the old wayfinding §6/§13 "lesson catalog is the source of truth, both must agree, manual alignment required" note.)*
- **Interference:** visual (b/d/p/q…) + phonetic (d/t, f/v, s/z…) confusion groups with per-group `decay` and a `maturityThreshold` for progressive overload.
- **Priority:** per-`gpc:exercise:*` weight from sequence position + frequency bonus.
- **Tag registry:** full tag vocabulary (validation/debug; lesson-gated concepts derived from curriculum).

## Stage 5 — Cards: [`generate-cards.ts`](../scripts/generate-cards.ts) (`gen:cards`)

Generate exercise card docs (deterministic `_id`, `questionType`, `data`, nav
`tags`, `meta`). Also emits [`curriculum-coverage.md`](../outputs-v2/curriculum-coverage.md) (P4.2).

- **Inputs:** `gpc-sequence`, `teaching-words`, `gpc-minimal-pairs`, **`src/audio/word-list.ts`** (runtime source, regex-parsed for the ~585 audio-backed words), [`lib/catalogue.ts`](../lib/catalogue.ts), **[`lib/curriculum.ts`](../lib/curriculum.ts)** (`effectiveConceptTags`, `assignmentFor`).
- **Output:** `generated-cards.json` (cards + `meta.stats`).

**Concept tags are curriculum-effective and exercise-only.** Each generator
confers `concept:*` tags from the *exercised/introduced* GPC via
`effectiveConceptTags(entry)` (SpellingQuestion tags every GPC in the word — a
spelling card legitimately exercises all of them). Enforced by the
`concept-tags-traceable` invariant.

8 card types (each a `generate*Cards` function):

| Type | What | ID format | Notes |
|---|---|---|---|
| SpellingQuestion | hear word, spell it | `c-spelling-{word}` | all GPCs in sequence + audio required |
| WhoSaidThat (letter) | hear phoneme, pick letter | `c-wst-…` / per-GPC | `WST_CONSONANT_BLOCKLIST` (s-Z, x-Z), `WST_VOWEL_ALLOWLIST`; `x-K_S` eligible |
| WordSelection | hear word, pick from minimal-pair options | `c-ws-{word}-…` | skill tag by contrast position (onset→`first-`, coda→`final-`, nucleus→`medial-phoneme-diff`); target+distractors need audio |
| MissingLetters | fill blanked letters | `c-ml-{word}-{blanks}` | per-consonant-GPC blanks + magic-e silent-e blank; blanked GPC gets exercise+concept tags, others expose-only |
| GpcIntro | letter + sound + onset/core/coda exemplars | `c-intro-{grapheme}-{phoneme}` | `INTRO_ELIGIBLE_CATEGORIES` = consonants, vowels_short; `INTRO_NO_ONSET_ALLOWED` for coda-dominant (x-K_S) |
| DigraphGpcIntro | digraph + sound + onset/coda | `c-digraph-intro-…` | digraphs w/ `teaching-v0.2`, minus `postLessonFact` (nk) |
| SplitDigraphIntro | vowel+silent-e, long-vowel sound | `c-split-intro-{short}` | `vowels_long_split`, 5 cards (a_e…u_e) |
| WhoSaidThat (digraph) | phoneme-id for digraphs | `c-wst-{short}` | suspects from sequence ∩ digraphs ∩ teaching-v0.2, minus postLessonFact + th-DH |

WST suspects and DigraphGpcIntro eligibility are derived from `curriculum.ts`
(`postLessonFact`), not a standalone blocklist.

Tag taxonomy (`namespace:role:identifier`): `gpc:expose:` (word contains GPC),
`gpc:exercise:` (card tests GPC), `gpc:intro:` (intro card), `ui:` (question
type), `concept:` (phonetic concept / skill).

`validate()` checks: unique ids, required tags (intro cards carry `gpc:intro:*`,
others `gpc:exercise:*` + one `ui:*`), audio + decodability for word cards,
valid ML blanks. The deeper invariant suite is `test-cards.ts` (§QA).

## Stage 6 — Deploy: [`deploy-content.ts`](../scripts/deploy-content.ts) (`deploy:content`)

Transform generated JSON → CouchDB docs and upload.

- **Inputs:** `generated-cards.json`, `strategy-configs/*.json`, CouchDB creds (CLI/env).
- **Docs:** `dd-*` (DisplayableData), `c-*` (Card — carries ELO + tags), `TAG-*` (tag → card sets), `NAVIGATION_STRATEGY-*` (8 strategies), `UPLOAD_META` (`content-deploy-{ISO}`, never overwritten).
- **Key transforms:** `buildDataDoc` (flat data → `Field[]`, `QUESTION_VIEW_MAP`), `computeInitialElo` (per-type difficulty-informed ELO; users start at 1000 so they "reach up"), `buildCardDoc`, `buildTagDocs` (invert card→tags), `buildStrategyDocs` (wrap configs + mint the consumer-defined `letter-gating` / `lesson-gate` strategy docs registered in `src/main.ts`), `updateCourseConfig`.
- **Safety:** idempotent **merge-upsert** (preserves card ELO); rev-aware; `--dry-run`; **TAG docs REPLACE-mode** (stale refs pruned — re-tags fully propagate without a nuke); metadoc trail. The **8 strategies**: hierarchy ×3, interference, priority, prescribed-bootstrap, letter-gating, lesson-gate.

[`seed-local-db.ts`](../scripts/seed-local-db.ts) (`db:seed`): wipe+recreate local course DB, insert design docs + lookup + minimal CourseConfig, then delegate to `deploy-content`.

---

## Auxiliary scripts

- [`phoneme-frequency-v2.ts`](../scripts/phoneme-frequency-v2.ts) (manual `npx tsx`) — phoneme distribution + per-grapheme spelling breakdown → `phoneme-frequency.json`.
- [`generate-spanning-text.ts`](../scripts/generate-spanning-text.ts) (manual) — smallest word set covering all GPCs (console only).
- [`generate-recording-priorities.ts`](../scripts/generate-recording-priorities.ts) (`gen:priorities`) — prioritised words to record: force-include ~170 foundational, then greedy by frequency + GPC coverage + minimal-pair synergy + already-recorded bonus → `recording-priorities.json`, `words-to-record.txt`. See [word-recording-prioritization.md](./word-recording-prioritization.md). `words-to-record.txt` is the list you record from; how to record, split and normalize it is in the audio repo ([patched-network/letterspractice-audio](https://github.com/patched-network/letterspractice-audio), `RECORDING.md`).

## QA & audit scripts

- [`test-cards.ts`](../scripts/test-cards.ts) (`test:cards`) — **20** invariants on `generated-cards.json` (content correctness + curriculum integrity: override integrity, teaching totality, lesson refs, registry twins, mustMatch, hierarchy-concept sync, concept-tags-{traceable,known}). Run after `gen:cards`, before deploy. *(Old wayfinding said 12.)*
- [`audit-prod-content.ts`](../scripts/audit-prod-content.ts) (`audit:prod`) — read-only orphan/drift diff + P4.1 curriculum checks ([`lib/curriculum-checks.ts`](../lib/curriculum-checks.ts)) vs the live DB. Credential-less (public course DB).
- [`enumerate-blast-radius.ts`](../scripts/enumerate-blast-radius.ts) (`audit:blast-radius`) — gating before/after vs prod, per user-maturity bucket.

---

## File-by-file

| Script | Phase | Reads | Writes | `yarn` |
|---|---|---|---|---|
| `parse-corpus-with-GPCs` | Corpus | cmudict, subtlex, catalogue | teaching/irregular/corpus-words, gpc-usage | `gen:words` |
| `calculate-gpc-sequence` | Sequence | corpus-words, catalogue | gpc-sequence | `gen:sequence` |
| `analyze-minimal-pairs` | Pairs | teaching-words | gpc-minimal-pairs(+stats) | `analyze:pairs` |
| `generate-recording-priorities` | Recording | teaching-words, sequence, extracted-audio | recording-priorities, words-to-record | `gen:priorities` |
| `generate-strategy-configs` | Strategy | sequence, gpc-stats*, catalogue, curriculum.ts, generated-cards | strategy-configs/*.json | `gen:strategies` |
| `generate-cards` | Cards | sequence, teaching-words, minimal-pairs, audio word-list, catalogue, curriculum.ts | generated-cards.json, curriculum-coverage.md | `gen:cards` |
| `test-cards` | QA | generated-cards, teaching-words, audio word-list, sequence, curriculum.ts | (exit code) | `test:cards` |
| `audit-prod-content` | QA | live DB, generated-cards, teaching-words, curriculum.ts | (report) | `audit:prod` |
| `deploy-content` | Deploy | generated-cards, strategy-configs/*.json | CouchDB | `deploy:content` |
| `seed-local-db` | Dev | (delegates to deploy-content) | CouchDB (local) | `db:seed` |
| `phoneme-frequency-v2`, `generate-spanning-text` | Aux | cmudict/subtlex/usage, catalogue | phoneme-frequency / console | (manual) |

\* `generate-strategy-configs` still reads `outputs/gpc-stats.json` from the
**v1** dir (`OUTPUTS_V1`), not `outputs-v2/`.

---

## Known rough edges (tech debt)

| Item | Note |
|---|---|
| Pipeline typecheck broken | `yarn build:check` unusable; byte-diff + `test:cards` are the gate. (Detailed aside retired with the curriculum-sot docs — git history pre-`eef52f9`.) |
| `gpc-stats.json` from v1 dir | `generate-strategy-configs` reads `outputs/` not `outputs-v2/`. Consolidate stats formats. |
| Audio word list via regex | `generate-cards` + `test-cards` regex-parse `src/audio/word-list.ts`. Fragile — consider a static JSON both app & pipeline import. |
| `gpc:exercise:nk-NG_K` intro prereq | references `gpc:intro:nk-NG_K`, which no card carries (nk is a `postLessonFact`, no intro card) — nk exercises ride the soft-gate trickle. Candidate check: every intro tag in a prereq has ≥1 card. |
| Scattered inline constants | `BLOCKED_WORDS`, WST/intro blocklists, `forceInclude` (~170 words) — could move to config. |
| Some duplicated loaders/types | `SequenceData`/`TeachingWord`/`GeneratedCard` still re-declared per script (tag/id helpers were consolidated to `lib/content-labelling.ts` in P1). |

> Earlier "refactor options A/B/C" and the duplication catalogue from the former
> wayfinding doc are dropped: the tag/id-helper consolidation (their Option A
> core) happened in the curriculum-SoT P1 work; the rest is captured above as
> incremental tech-debt items rather than a staged refactor plan.
