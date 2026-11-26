/**
 * Strategy Config Generation Script (P2)
 * =======================================
 *
 * Generates the four strategy configuration JSON files that parameterize
 * the content navigation pipeline's filter strategies at runtime.
 *
 * INPUTS:
 *   - outputs-v2/gpc-sequence.json     — teaching order
 *   - outputs-v2/generated-cards.json  — borne-tag ground truth (run
 *     `yarn gen:cards` FIRST; hierarchy emission conditions on which tags
 *     cards actually bear — see loadBorneTags)
 *   - outputs/gpc-stats.json           — frequency-weighted utility stats
 *   - lib/catalogue.ts                 — GPC definitions, categories, match types
 *
 * OUTPUTS (to outputs-v2/strategy-configs/):
 *   - hierarchy-gpc.json     — GPC progression: expose→intro→exercise + GPC-specific prereqs
 *   - hierarchy-concept.json — Concept-level stage gating (vowel, match type, etc.)
 *   - hierarchy-ui.json      — UI type progression (ws → ml → spelling)
 *   - interference.json   — InterferenceConfig: visual + phonetic confusion pairs
 *   - priority.json       — RelativePriorityConfig: tag weights from sequence + frequency
 *   - tag-registry.json   — Complete tag vocabulary for validation/reference
 *
 * USAGE:
 *   npx tsx scripts/generate-strategy-configs.ts
 *   yarn gen:strategies
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  GPC_CATALOGUE,
  getDefaultCatalogueIndex,
  type GPCEntry,
} from '../lib/catalogue';

import { gpcShortId, gpcTag, type GpcRole } from '../lib/content-labelling';
import {
  CONCEPT_POLICIES,
  assignmentFor,
  lessonGatedConceptTags,
} from '../lib/curriculum';

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, '..', 'outputs-v2');
const OUTPUTS_V1 = resolve(__dirname, '..', 'outputs');
const STRATEGY_DIR = resolve(OUTPUTS_V2, 'strategy-configs');

// ---------------------------------------------------------------------------
// Types (mirroring framework interfaces for clarity)
// ---------------------------------------------------------------------------

interface TagPrerequisite {
  tag: string;
  masteryThreshold?: {
    minElo?: number;
    minCount?: number;
  };
  /** Score boost for cards carrying this prereq tag while the gate is closed */
  preReqBoost?: number;
  /** Score boost for cards carrying the gated tag once the gate is open */
  targetBoost?: number;
}

interface HierarchyConfig {
  prerequisites: {
    [tagId: string]: TagPrerequisite[];
  };
}

interface InterferenceGroup {
  tags: string[];
  decay?: number;
}

interface InterferenceConfig {
  interferenceSets: InterferenceGroup[];
  maturityThreshold?: {
    minCount?: number;
    minElo?: number;
    minElapsedDays?: number;
  };
  defaultDecay?: number;
}

interface RelativePriorityConfig {
  tagPriorities: { [tagId: string]: number };
  defaultPriority?: number;
  combineMode?: 'max' | 'average' | 'min';
  priorityInfluence?: number;
}

interface TagRegistryEntry {
  tag: string;
  namespace: string;
  role?: string;
  gpcId?: string;
  conceptCategory?: string;
  description?: string;
}

interface TagRegistry {
  generatedAt: string;
  totalTags: number;
  byNamespace: Record<string, string[]>;
  entries: TagRegistryEntry[];
}

// ---------------------------------------------------------------------------
// Input data types
// ---------------------------------------------------------------------------

interface SequenceStep {
  step: number;
  gpcId: string;
  marginalGain: number;
  marginalFrequency: number;
  cumulativeGpcs: number;
  cumulativeWords: number;
  cumulativeFrequency: number;
  coveragePercent: number;
}

interface SequenceData {
  sequence: SequenceStep[];
  initialKnown: string[];
  totalWords: number;
  totalFrequency: number;
  finalCoverage: number;
}

interface GpcStat {
  id: string;
  grapheme: string;
  phoneme: string;
  wordCount: number;
  totalFrequency: number;
  topWords: string[];
}

interface GpcStatsData {
  gpcs: GpcStat[];
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function loadSequence(): SequenceData {
  const raw = readFileSync(resolve(OUTPUTS_V2, 'gpc-sequence.json'), 'utf-8');
  return JSON.parse(raw);
}

function loadGpcStats(): GpcStatsData {
  const raw = readFileSync(resolve(OUTPUTS_V1, 'gpc-stats.json'), 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Catalogue helpers
// ---------------------------------------------------------------------------

const catalogueIndex = getDefaultCatalogueIndex();

function getEntry(gpcId: string): GPCEntry | undefined {
  return catalogueIndex.byId.get(gpcId);
}

/**
 * Tags actually borne by ≥1 generated card. Read from generated-cards.json,
 * so `yarn gen:cards` MUST run before `yarn gen:strategies` (gen:all and CI
 * are ordered accordingly). This is the ground truth the hierarchy emission
 * conditions on: intro-card existence is not statically knowable (it depends
 * on exemplar-word and audio availability at generation time — see
 * agent/lessons-audit/c.1.intro-prereq-deadlock.md §3), so any allowlist
 * would drift; the generated cards themselves are the only reliable source.
 */
/**
 * Sight-word GPCs (`GPC-WORD-x`) → the word's corpus frequency, for the
 * usage-ranked priority of sight words outside the teaching sequence.
 */
function loadSightWordFrequencies(): Map<string, number> {
  const raw = readFileSync(resolve(OUTPUTS_V2, 'teaching-words.json'), 'utf-8');
  const data = JSON.parse(raw) as { words: Array<{ gpcs: string[]; frequency: number }> };
  const freq = new Map<string, number>();
  for (const w of data.words) {
    if (w.gpcs.length === 1 && isSightWordGpcId(w.gpcs[0])) freq.set(w.gpcs[0], w.frequency);
  }
  return freq;
}

const isSightWordGpcId = (gpcId: string) => gpcId.startsWith('GPC-WORD-');
const SIGHT_INTRO_TAG_PREFIX = 'gpc:intro:WORD-';

function loadBorneTags(): Set<string> {
  const raw = readFileSync(resolve(OUTPUTS_V2, 'generated-cards.json'), 'utf-8');
  const data = JSON.parse(raw) as { cards: Array<{ tags: string[] }> };
  const borne = new Set<string>();
  for (const card of data.cards) {
    for (const tag of card.tags) borne.add(tag);
  }
  return borne;
}

/**
 * The lesson-gated concept tags a GPC's cards carry (usually one; short
 * vowels carry two). Used as the "lesson-is-the-intro" hierarchy leg for
 * GPCs that never get an intro card.
 */
const GATED_CONCEPTS = lessonGatedConceptTags();

function gatedConceptTagsFor(gpcId: string): string[] {
  const entry = getEntry(gpcId);
  if (!entry) return [];
  const assignment = assignmentFor(entry);
  if (!assignment) return [];
  return assignment.conceptTags.filter((t) => GATED_CONCEPTS.has(t));
}

/**
 * Component GPC IDs that must NOT gate their containing digraph.
 *
 * The component-letter gate (below) assumes each letter of a digraph also
 * occurs as a standalone GPC that can be exercised. 'q' breaks that: it only
 * ever appears in 'qu' (/kw/), so standalone 'q-K' can never accumulate the
 * required exercise count — gating 'qu' behind it leaves 'qu' (and the 'q'
 * keycap it unlocks) permanently blocked.
 */
const COMPONENT_GATING_EXCLUDED_GPC_IDS = new Set<string>(['GPC-q-K']);

/**
 * Find simple-consonant GPC IDs for the component letters of a digraph/trigraph grapheme.
 * For "sh" → look up GPCs for "s" and "h" individually (simple consonants).
 */
function getComponentLetterGpcIds(grapheme: string): string[] {
  const result: string[] = [];
  for (const letter of grapheme) {
    const entries = catalogueIndex.byGrapheme.get(letter);
    if (!entries) continue;
    // Find the simple consonant or short vowel entry for this letter
    const simpleEntry = entries.find(
      (e) =>
        e.matchType === 'simple' &&
        (e.category === 'consonants' || e.category === 'vowels_short'),
    );
    if (simpleEntry) {
      result.push(simpleEntry.id);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Merge prereqs into the hierarchy map, appending to existing entries.
 */
function mergePrereqs(
  target: HierarchyConfig['prerequisites'],
  additions: HierarchyConfig['prerequisites'],
): void {
  for (const [tag, prereqs] of Object.entries(additions)) {
    if (!target[tag]) {
      target[tag] = prereqs;
    } else {
      // Append, avoiding duplicate tag references
      const existingTags = new Set(target[tag].map((p) => p.tag));
      for (const prereq of prereqs) {
        if (!existingTags.has(prereq.tag)) {
          target[tag].push(prereq);
          existingTags.add(prereq.tag);
        }
      }
    }
  }
}

// ============================================================================
// HIERARCHY CONFIG
// ============================================================================

/**
 * Secondary-sound prerequisites (c.1 s-Z drill-down).
 *
 * "Naturally acquired" alternate pronunciations of an already-taught grapheme
 * (no intro card, category default is an always-passed hello-world concept)
 * would otherwise fall into the concept-leg branch and resolve to
 * `concept:match:simple` / `concept:vowel:short` minCount 1 — satisfied by the
 * course's very first card, so they'd open from day one. Instead gate them on
 * mastery of the grapheme's PRIMARY sound (`exercise:<primary>`) plus a little
 * of their own exposure (`expose:<self>`), so they enter rotation only once the
 * primary is established. Cross-GPC exercise prereqs and expose-tag counts are
 * both precedented (digraph component-gating; the standard intro←expose chain).
 *
 * Keyed by GPC id → AND-list of prereq legs. Legs whose target tag isn't borne
 * are dropped; if none remain, the code falls back to the concept leg.
 */
const SECONDARY_SOUND_PREREQS: Record<
  string,
  { scope: 'expose' | 'intro' | 'exercise'; gpcId: string; minCount: number }[]
> = {
  // s→/z/ (is, dogs, his): ride from s→/s/ mastery + exposure. N=6 so it's not
  // day-one; M=2 so a couple of s-Z exposures precede responsibility.
  'GPC-s-Z': [
    { scope: 'exercise', gpcId: 'GPC-s-S', minCount: 6 },
    { scope: 'expose', gpcId: 'GPC-s-Z', minCount: 2 },
  ],
};

interface ScopedHierarchyConfigs {
  /** GPC progression: expose→intro→exercise chains, digraph gating, GPC-specific prereqs */
  gpc: HierarchyConfig;
  /** Concept-level stage gating (vowel:short, match:digraph, etc.) */
  concept: HierarchyConfig;
  /** UI type progression (ws → ml → spelling) */
  ui: HierarchyConfig;
  /** Merged view of all scopes (for validation / tag registry) */
  merged: HierarchyConfig;
}

function generateHierarchyConfigs(
  sequence: SequenceData,
  borneTags: Set<string>,
): ScopedHierarchyConfigs {
  const gpcPrerequisites: HierarchyConfig['prerequisites'] = {};

  // ---- 1. Three-stage chain for each teaching GPC ----
  // For each GPC in initialKnown + sequence: expose → intro → exercise —
  // but only where the cards actually generated can satisfy it. Emission is
  // conditioned on borneTags (see loadBorneTags): an entry keyed on a tag no
  // card bears gates nothing, and a prereq targeting a tag no card bears can
  // never be met — it would soft-suppress (×hierarchy penalty) every bearer
  // of the key tag forever (the gu-G / s-Z deadlock,
  // agent/lessons-audit/c.1.intro-prereq-deadlock.md).
  const allTeachingGpcIds = [
    ...sequence.initialKnown,
    ...sequence.sequence
      .filter((s) => s.step > 0) // step 0 is the "(initial)" summary row
      .map((s) => s.gpcId),
  ];

  for (const gpcId of allTeachingGpcIds) {
    const exposeTag = gpcTag('expose', gpcId);
    const introTag = gpcTag('intro', gpcId);
    const exerciseTag = gpcTag('exercise', gpcId);

    // A sight word with an intro card gets its own chain (1c)
    if (isSightWordGpcId(gpcId) && borneTags.has(introTag)) continue;

    // No cards at all for this GPC (unrecorded words, uncarded slate
    // members): no chain. Re-running gen restores it the moment cards exist.
    if (!borneTags.has(introTag) && !borneTags.has(exerciseTag)) continue;

    if (borneTags.has(introTag)) {
      // Full three-stage chain.
      // intro requires expose (3 exposures before introduction)
      gpcPrerequisites[introTag] = [
        { tag: exposeTag, masteryThreshold: { minCount: 3 } },
      ];

      // exercise requires intro (1 intro interaction before free exercise)
      if (borneTags.has(exerciseTag)) {
        gpcPrerequisites[exerciseTag] = [
          { tag: introTag, masteryThreshold: { minCount: 1 } },
        ];
      }

      // ---- Digraph/trigraph component letter gating (Q2 resolution) ----
      // Gate each digraph/trigraph intro against its component letters' exercise tags
      const entry = getEntry(gpcId);
      if (entry) {
        const isMultiLetter =
          entry.matchType === 'digraph' ||
          entry.matchType === 'trigraph';

        if (isMultiLetter && entry.grapheme.length > 1) {
          const componentGpcIds = getComponentLetterGpcIds(entry.grapheme);
          for (const componentId of componentGpcIds) {
            // Skip components that can't be exercised standalone (e.g. 'q-K').
            if (COMPONENT_GATING_EXCLUDED_GPC_IDS.has(componentId)) continue;
            // Only add if the component is itself a teaching GPC
            if (allTeachingGpcIds.includes(componentId)) {
              gpcPrerequisites[introTag].push({
                tag: gpcTag('exercise', componentId),
                masteryThreshold: { minCount: 3 },
              });
            }
          }
        }
      }
    } else {
      // Lesson-is-the-intro (c.1 option (b)): no intro card is ever
      // generated for this GPC, so `exercise requires intro` could never be
      // satisfied. The introduction is either the owning lesson (whose
      // passage opens the concept gate) or plain exposure ("naturally
      // acquired" — see INTRO_BLOCKLIST in generate-cards.ts). Emit a
      // single satisfiable leg on the GPC's gated concept tag(s): unmet
      // while the owning lesson is unpassed (so the prescribed drill
      // generator doesn't treat the skill as unlocked and burn practice
      // slots on gate-floored cards), and cleared by the learner's first
      // completed card of the released concept — which the post-lesson
      // seed cards guarantee (POST_LESSON_SEED_CARDS in lib/curriculum.ts).
      // Secondary-sound override: a "naturally acquired" alternate
      // pronunciation whose concept leg would resolve to an always-passed
      // (hello-world) concept opens from day one — the c.1 s-Z drill-down.
      // Instead gate it on mastery of its grapheme's primary sound plus its
      // own exposure, so it enters rotation only once the primary is
      // established and the learner has met the alternate a few times.
      const secondaryLegs = (SECONDARY_SOUND_PREREQS[gpcId] ?? [])
        .map(({ scope, gpcId: depGpcId, minCount }) => ({
          tag: gpcTag(scope, depGpcId),
          masteryThreshold: { minCount },
        }))
        .filter((p) => borneTags.has(p.tag));

      if (secondaryLegs.length > 0) {
        gpcPrerequisites[exerciseTag] = secondaryLegs;
      } else {
        const conceptLegs = gatedConceptTagsFor(gpcId).filter((t) =>
          borneTags.has(t),
        );
        if (conceptLegs.length > 0) {
          gpcPrerequisites[exerciseTag] = conceptLegs.map((tag) => ({
            tag,
            masteryThreshold: { minCount: 1 },
          }));
        }
        // No gated concept resolvable → no entry at all. Hard gating is the
        // concept layer's job; an unsatisfiable hierarchy prereq is never a
        // legitimate lock.
      }
    }
  }

  // ---- 1c. Sight words ----
  // A sight word is introduced before it's met anywhere else (its intro is
  // prescribed with introExposeMinCount 0, deploy-content.ts), so its chain
  // runs the other way from a GPC's: no expose prereq on the intro (that
  // would deadlock: its exposure cards wait for the intro), and both its
  // exposure and its exercise cards wait for the intro. Covers every carded
  // slate word, in the teaching sequence or not (you, have, said, …).
  for (const introTag of [...borneTags].filter((t) => t.startsWith(SIGHT_INTRO_TAG_PREFIX)).sort()) {
    const shortId = introTag.slice('gpc:intro:'.length);
    for (const role of ['expose', 'exercise'] as const) {
      const tag = `gpc:${role}:${shortId}`;
      if (borneTags.has(tag)) {
        gpcPrerequisites[tag] = [{ tag: introTag, masteryThreshold: { minCount: 1 } }];
      }
    }
  }

  // ---- 1a. Graduated preReqBoost on expose→intro prereqs ----
  // While intro-X is locked, boost cards that carry gpc:expose:X —
  // steering the pipeline toward exercises that incidentally expose
  // the next GPC, accelerating the unlock.
  //
  // Boost tiers:
  //   t-T gets the strongest boost (BOOST_T) — the first GPC to unlock
  //   after seed s-S, so cold-start steering is critical here.
  //   Other initialKnown (n-N, i-IH) get BOOST_CEILING — high but
  //   below t-T so the pipeline preferentially steers toward t-T first.
  //   Teaching sequence GPCs taper linearly from BOOST_CEILING-0.1 → 1.0.
  //
  // s-S is excluded — it's the true seed with no expose prereq.
  const BOOST_T = 4.0;        // t-T: must pop first after s-S
  const BOOST_CEILING = 2.5;  // other initialKnown (n-N, i-IH)
  const BOOST_FLOOR = 1.0;    // no boost
  const BOOST_TAPER_STEPS = 20; // boost reaches floor by this step

  // t-T gets its own elevated boost (both preReq and target)
  const tIntroTag = gpcTag('intro', 'GPC-t-T');
  const tPrereqs = gpcPrerequisites[tIntroTag];
  if (tPrereqs) {
    const tExposePrereq = tPrereqs.find((p) => p.tag === gpcTag('expose', 'GPC-t-T'));
    if (tExposePrereq) {
      tExposePrereq.preReqBoost = BOOST_T;
      tExposePrereq.targetBoost = BOOST_T;
    }
  }

  // Other initialKnown (minus seed s-S and t-T) get ceiling boost
  const excludeFromCeiling = new Set(['GPC-s-S', 'GPC-t-T']);
  for (const gpcId of sequence.initialKnown) {
    if (excludeFromCeiling.has(gpcId)) continue;
    const introTag = gpcTag('intro', gpcId);
    const prereqs = gpcPrerequisites[introTag];
    if (prereqs) {
      const exposePrereq = prereqs.find((p) => p.tag === gpcTag('expose', gpcId));
      if (exposePrereq) {
        exposePrereq.preReqBoost = BOOST_CEILING;
        exposePrereq.targetBoost = BOOST_CEILING;
      }
    }
  }

  // Teaching sequence GPCs: linear taper from BOOST_CEILING-0.1 down to BOOST_FLOOR
  const taperRange = (BOOST_CEILING - 0.1) - BOOST_FLOOR;
  for (const step of sequence.sequence.filter((s) => s.step > 0)) {
    if (step.step > BOOST_TAPER_STEPS) break; // no boost beyond taper range
    const introTag = gpcTag('intro', step.gpcId);
    const prereqs = gpcPrerequisites[introTag];
    if (prereqs) {
      const exposePrereq = prereqs.find((p) => p.tag === gpcTag('expose', step.gpcId));
      if (exposePrereq) {
        const boost = round2(BOOST_CEILING - 0.1 - (step.step / BOOST_TAPER_STEPS) * taperRange);
        if (boost > BOOST_FLOOR) {
          exposePrereq.preReqBoost = boost;
          exposePrereq.targetBoost = boost;
        }
      }
    }
  }

  // ---- 1b. Seed GPC bootstrap ----
  // Only s-S is the true curriculum seed — the single GPC available at cold start.
  // Other GPCs in sequence.initialKnown (n-N, i-IH, t-T) are there for frequency
  // coverage in the sequencing algorithm, but pedagogically they should be unlocked
  // through the normal expose→intro chain (3 exposures via WordSelection exercises
  // on earlier GPCs). This creates the tight s-intro → s-exercises → t-intro → ...
  // progression rather than dumping all seed intros at once.
  const seedGpcIds = new Set(['GPC-s-S']);

  for (const gpcId of seedGpcIds) {
    const introTag = gpcTag('intro', gpcId);
    if (gpcPrerequisites[introTag]) {
      const exposeTag = gpcTag('expose', gpcId);
      gpcPrerequisites[introTag] = gpcPrerequisites[introTag].filter(
        (p) => p.tag !== exposeTag,
      );
      if (gpcPrerequisites[introTag].length === 0) {
        delete gpcPrerequisites[introTag];
      }
    }
  }

  // ---- 2. Individual GPC prerequisites (§7.2) — merged into GPC scope ----
  const specificGpcPrereqs: HierarchyConfig['prerequisites'] =
    generateGpcPrerequisites(allTeachingGpcIds);
  mergePrereqs(gpcPrerequisites, specificGpcPrereqs);

  // ---- 3. Concept-level prerequisites (§7.1) — own scope ----
  const conceptPrerequisites: HierarchyConfig['prerequisites'] =
    generateConceptPrerequisites();

  // ---- 4. UI type prerequisites (D3) — own scope ----
  const uiPrerequisites: HierarchyConfig['prerequisites'] =
    generateUiPrerequisites();

  // ---- 5. Safety prune: nothing keyed on / targeting an unborne tag ----
  // The systematic emission above already respects borneTags; this catches
  // the hand-authored additions (§7.1/§7.2) and future drift. Anything
  // pruned here is a generator bug or a data change worth eyeballing —
  // hence the loud warning. test-cards.ts re-asserts the same invariant on
  // the written output.
  const pruneUnborne = (
    prereqs: HierarchyConfig['prerequisites'],
    scope: string,
  ): void => {
    for (const [key, list] of Object.entries(prereqs)) {
      if (!borneTags.has(key)) {
        console.warn(
          `  ⚠️  [prune:${scope}] dropped entry keyed on unborne tag ${key}`,
        );
        delete prereqs[key];
        continue;
      }
      const kept = list.filter((p) => borneTags.has(p.tag));
      if (kept.length < list.length) {
        for (const p of list) {
          if (!borneTags.has(p.tag)) {
            console.warn(
              `  ⚠️  [prune:${scope}] dropped unborne target ${p.tag} from ${key}`,
            );
          }
        }
        if (kept.length === 0) delete prereqs[key];
        else prereqs[key] = kept;
      }
    }
  };
  pruneUnborne(gpcPrerequisites, 'gpc');
  pruneUnborne(conceptPrerequisites, 'concept');
  pruneUnborne(uiPrerequisites, 'ui');

  // Build merged view for validation / tag registry
  const mergedPrereqs: HierarchyConfig['prerequisites'] = {};
  mergePrereqs(mergedPrereqs, gpcPrerequisites);
  mergePrereqs(mergedPrereqs, conceptPrerequisites);
  mergePrereqs(mergedPrereqs, uiPrerequisites);

  return {
    gpc: { prerequisites: gpcPrerequisites },
    concept: { prerequisites: conceptPrerequisites },
    ui: { prerequisites: uiPrerequisites },
    merged: { prerequisites: mergedPrereqs },
  };
}

/**
 * Concept-level prerequisite chains.
 *
 * Derived from `CONCEPT_POLICIES` in lib/curriculum.ts — the single source
 * of truth for both these pipeline prereqs and the lesson catalog's
 * availability conditions. Where a concept's policy is `mustMatch: true`,
 * test-cards.ts asserts the two stay in agreement; deliberate divergences
 * (digraphs breadth gate) are documented on the policy entry.
 *
 * Ref: 01-tag-generation-spec.md §7.1
 */
function generateConceptPrerequisites(): HierarchyConfig['prerequisites'] {
  const result: HierarchyConfig['prerequisites'] = {};
  for (const [concept, policy] of Object.entries(CONCEPT_POLICIES)) {
    if (!policy.pipelinePrereqs || policy.pipelinePrereqs.length === 0) continue;
    result[concept] = policy.pipelinePrereqs.map((p) => ({
      tag: p.tag,
      masteryThreshold: {
        ...(p.minCount !== undefined ? { minCount: p.minCount } : {}),
        ...(p.minElo !== undefined ? { minElo: p.minElo } : {}),
      },
    }));
  }
  return result;
}

/**
 * Individual GPC-level prerequisites.
 * Specific pedagogical constraints beyond concept-level gating.
 *
 * Ref: 01-tag-generation-spec.md §7.2
 */
function generateGpcPrerequisites(
  allTeachingGpcIds: string[],
): HierarchyConfig['prerequisites'] {
  const result: HierarchyConfig['prerequisites'] = {};

  // Magic-e GPCs each require ALL short vowels to be exercised
  const SHORT_VOWEL_TAGS = [
    'gpc:exercise:a-AE',
    'gpc:exercise:e-EH',
    'gpc:exercise:i-IH',
    'gpc:exercise:o-AA',
    'gpc:exercise:u-AH',
  ];

  const shortVowelPrereqs: TagPrerequisite[] = SHORT_VOWEL_TAGS.map((tag) => ({
    tag,
    masteryThreshold: { minCount: 5, minElo: 1020 },
  }));

  const magicEGpcIds = [
    'GPC-a_e-EY',
    'GPC-e_e-IY',
    'GPC-i_e-AY',
    'GPC-o_e-OW',
    'GPC-u_e-UW',
    'GPC-u_e-Y_UW',
  ];

  for (const magicEId of magicEGpcIds) {
    const exerciseTag = gpcTag('exercise', magicEId);
    if (!result[exerciseTag]) {
      result[exerciseTag] = [];
    }
    result[exerciseTag].push(...shortVowelPrereqs);
  }

  // Sight word 'you' requires y-Y
  if (allTeachingGpcIds.includes('GPC-WORD-you')) {
    const youTag = gpcTag('exercise', 'GPC-WORD-you');
    if (!result[youTag]) {
      result[youTag] = [];
    }
    result[youTag].push({
      tag: 'gpc:exercise:y-Y',
      masteryThreshold: { minCount: 3 },
    });
  }

  return result;
}

/**
 * UI type progression prerequisites.
 * Users must build competence with simpler interaction patterns before
 * graduating to harder ones.
 *
 * Ref: 03-action-plan.md D3
 */
function generateUiPrerequisites(): HierarchyConfig['prerequisites'] {
  // Progression: (wst + ws) → ml → spelling
  // WordSelection and WhoSaidThat are available immediately (no gate) — the primary
  // vehicles for GPC exposure in early sessions.
  // ML is gated behind both multiple-choice types: learners should have a little
  // experience with each before moving to the more proactive guided-spelling format.
  // Spelling (free recall) is then gated behind ML (guided spelling) alone.
  return {
    'ui:missing-letters': [
      {
        tag: 'ui:who-said-that',
        masteryThreshold: { minCount: 2 },
      },
      {
        tag: 'ui:word-selection',
        masteryThreshold: { minCount: 3 },
      },
    ],
    'ui:spelling': [
      {
        tag: 'ui:missing-letters',
        masteryThreshold: { minCount: 3 },
      },
    ],
  };
}

// ============================================================================
// INTERFERENCE CONFIG
// ============================================================================

function generateInterferenceConfig(): InterferenceConfig {
  // ---- Visual interference ----
  // Letters whose written forms are easily confused (mirror images, rotations, similar shapes)
  // Ref: 01-tag-generation-spec.md §6.1
  const VISUAL_INTERFERENCE: InterferenceGroup[] = [
    // Mirror pairs
    {
      tags: ['gpc:exercise:b-B', 'gpc:exercise:d-D'],
      decay: 0.9,
    },
    {
      tags: ['gpc:exercise:p-P', 'gpc:exercise:q-K'],
      decay: 0.85,
    },

    // Rotation pairs (b→p, d→q when rotated)
    {
      tags: ['gpc:exercise:b-B', 'gpc:exercise:p-P'],
      decay: 0.6,
    },
    {
      tags: ['gpc:exercise:d-D', 'gpc:exercise:q-K'],
      decay: 0.6,
    },

    // Shape similarity
    {
      tags: ['gpc:exercise:m-M', 'gpc:exercise:n-N'],
      decay: 0.55,
    },
    {
      tags: ['gpc:exercise:u-AH', 'gpc:exercise:n-N'],
      decay: 0.4,
    },
    {
      tags: ['gpc:exercise:h-HH', 'gpc:exercise:n-N'],
      decay: 0.4,
    },
    {
      tags: ['gpc:exercise:v-V', 'gpc:exercise:w-W'],
      decay: 0.35,
    },
  ];

  // ---- Phonetic interference ----
  // Letter-sounds that are articulatorily similar
  // Ref: 01-tag-generation-spec.md §6.2
  const PHONETIC_INTERFERENCE: InterferenceGroup[] = [
    // Voicing pairs (same mouth position, different voicing)
    {
      tags: ['gpc:exercise:b-B', 'gpc:exercise:p-P'],
      decay: 0.7,
    },
    {
      tags: ['gpc:exercise:d-D', 'gpc:exercise:t-T'],
      decay: 0.7,
    },
    {
      tags: ['gpc:exercise:g-G', 'gpc:exercise:k-K'],
      decay: 0.7,
    },
    {
      tags: ['gpc:exercise:f-F', 'gpc:exercise:v-V'],
      decay: 0.65,
    },
    {
      tags: ['gpc:exercise:s-S', 'gpc:exercise:s-Z'],
      decay: 0.6,
    },

    // Digraph voicing
    {
      tags: ['gpc:exercise:th-TH', 'gpc:exercise:th-DH'],
      decay: 0.5,
    },
    {
      tags: ['gpc:exercise:sh-SH', 'gpc:exercise:ch-CH'],
      decay: 0.55,
    },

    // Short vowels (frequently confused by young learners)
    {
      tags: ['gpc:exercise:a-AE', 'gpc:exercise:e-EH'],
      decay: 0.5,
    },
    {
      tags: ['gpc:exercise:i-IH', 'gpc:exercise:e-EH'],
      decay: 0.5,
    },
    {
      tags: ['gpc:exercise:o-AA', 'gpc:exercise:u-AH'],
      decay: 0.45,
    },

    // Short vs long vowel same letter
    {
      tags: ['gpc:exercise:a-AE', 'gpc:exercise:a_e-EY'],
      decay: 0.4,
    },
    {
      tags: ['gpc:exercise:i-IH', 'gpc:exercise:i_e-AY'],
      decay: 0.4,
    },
    {
      tags: ['gpc:exercise:o-AA', 'gpc:exercise:o_e-OW'],
      decay: 0.4,
    },
  ];

  return {
    interferenceSets: [...VISUAL_INTERFERENCE, ...PHONETIC_INTERFERENCE],
    maturityThreshold: {
      minCount: 10,
      minElo: 1050,
      minElapsedDays: 3,
    },
    defaultDecay: 0.8,
  };
}

// ============================================================================
// PRIORITY CONFIG
// ============================================================================

function generatePriorityConfig(
  sequence: SequenceData,
  gpcStats: GpcStatsData,
  borneTags: Set<string>,
  sightWordFrequencies: Map<string, number>,
): RelativePriorityConfig {
  const tagPriorities: Record<string, number> = {};

  // Build a frequency map from gpc-stats for bonus weighting
  const freqMap = new Map<string, number>();
  let maxFreq = 0;
  for (const stat of gpcStats.gpcs) {
    freqMap.set(stat.id, stat.totalFrequency);
    if (stat.totalFrequency > maxFreq) maxFreq = stat.totalFrequency;
  }

  // Initial known GPCs get maximum priority
  for (const gpcId of sequence.initialKnown) {
    tagPriorities[gpcTag('exercise', gpcId)] = 0.98;
  }

  // Teaching sequence GPCs: linear interpolation from 0.95 → 0.10
  const steps = sequence.sequence.filter((s) => s.step > 0);
  const totalSteps = steps.length;

  for (const step of steps) {
    // Base priority from sequence order
    const basePriority = 0.95 - (step.step / totalSteps) * 0.85;

    // Frequency bonus: up to +0.05 for highest-frequency GPCs
    const freq = freqMap.get(step.gpcId) ?? 0;
    const freqBonus = maxFreq > 0 ? (freq / maxFreq) * 0.05 : 0;

    const priority = Math.min(0.98, round2(basePriority + freqBonus));
    tagPriorities[gpcTag('exercise', step.gpcId)] = priority;
  }

  // Sight words outside the teaching sequence (you, have, said, …) take the
  // weight of the in-sequence sight word nearest them in usage (log scale):
  // the sequence is frequency-driven, so that's where they'd have landed
  const placed = [...sightWordFrequencies].filter(
    ([gpcId, freq]) => freq > 0 && tagPriorities[gpcTag('exercise', gpcId)] !== undefined,
  );
  for (const [gpcId, freq] of [...sightWordFrequencies].sort(([a], [b]) => a.localeCompare(b))) {
    const tag = gpcTag('exercise', gpcId);
    if (tagPriorities[tag] !== undefined || !borneTags.has(tag) || freq <= 0 || placed.length === 0) continue;
    const distance = ([, f]: [string, number]) => Math.abs(Math.log(f) - Math.log(freq));
    const nearest = placed.reduce((best, cur) => (distance(cur) < distance(best) ? cur : best));
    tagPriorities[tag] = tagPriorities[gpcTag('exercise', nearest[0])];
  }

  return {
    tagPriorities,
    defaultPriority: 0.15,
    combineMode: 'max',
    priorityInfluence: 0.5,
  };
}

// ============================================================================
// TAG REGISTRY
// ============================================================================

function generateTagRegistry(
  sequence: SequenceData,
  hierarchy: HierarchyConfig,
  interference: InterferenceConfig,
  priority: RelativePriorityConfig,
): TagRegistry {
  const entries: TagRegistryEntry[] = [];
  const byNamespace: Record<string, string[]> = {};

  function addTag(entry: TagRegistryEntry) {
    entries.push(entry);
    const ns = entry.namespace;
    if (!byNamespace[ns]) byNamespace[ns] = [];
    if (!byNamespace[ns].includes(entry.tag)) {
      byNamespace[ns].push(entry.tag);
    }
  }

  // ---- GPC tags (all three roles for each teaching GPC) ----
  const allTeachingGpcIds = [
    ...sequence.initialKnown,
    ...sequence.sequence.filter((s) => s.step > 0).map((s) => s.gpcId),
  ];

  for (const gpcId of allTeachingGpcIds) {
    const entry = getEntry(gpcId);
    const desc = entry
      ? `${entry.grapheme} → /${entry.phoneme}/ (${entry.category})`
      : gpcId;

    for (const role of ['expose', 'intro', 'exercise'] as GpcRole[]) {
      addTag({
        tag: gpcTag(role, gpcId),
        namespace: 'gpc',
        role,
        gpcId,
        description: `${role} tag for ${desc}`,
      });
    }
  }

  // ---- Concept tags ----
  // Lesson-gated concepts (including concept:unassigned) come from the
  // curriculum registry; skill tags are exercise-design vocabulary owned here.
  const CONCEPT_TAGS = [
    ...lessonGatedConceptTags(),
    'concept:skill:first-phoneme-diff',
    'concept:skill:final-phoneme-diff',
    'concept:skill:medial-vowel-diff',
    'concept:skill:blending',
    'concept:skill:segmenting',
  ];

  for (const tag of CONCEPT_TAGS) {
    const parts = tag.split(':');
    const subcategory = parts.slice(1).join(':');
    addTag({
      tag,
      namespace: 'concept',
      conceptCategory: subcategory,
      description: `Concept tag: ${subcategory}`,
    });
  }

  // ---- UI tags ----
  const UI_TAGS = [
    { tag: 'ui:gpc-intro', description: 'GpcIntro question type — one-time letter-sound introduction' },
    { tag: 'ui:who-said-that', description: 'WhoSaidThat question type' },
    { tag: 'ui:word-selection', description: 'WordSelection question type' },
    { tag: 'ui:missing-letters', description: 'MissingLetters question type' },
    { tag: 'ui:spelling', description: 'SpellingQuestion question type' },
    { tag: 'ui:vignette', description: 'Vignette introductory animation (future)' },
  ];

  for (const ui of UI_TAGS) {
    addTag({
      tag: ui.tag,
      namespace: 'ui',
      description: ui.description,
    });
  }

  // ---- Collect any additional tags referenced in configs but not yet registered ----
  const registeredTags = new Set(entries.map((e) => e.tag));

  // From hierarchy prerequisites
  for (const [tag, prereqs] of Object.entries(hierarchy.prerequisites)) {
    if (!registeredTags.has(tag)) {
      addTag({
        tag,
        namespace: tag.split(':')[0],
        description: `Referenced in hierarchy (auto-discovered)`,
      });
      registeredTags.add(tag);
    }
    for (const prereq of prereqs) {
      if (!registeredTags.has(prereq.tag)) {
        addTag({
          tag: prereq.tag,
          namespace: prereq.tag.split(':')[0],
          description: `Referenced as prerequisite (auto-discovered)`,
        });
        registeredTags.add(prereq.tag);
      }
    }
  }

  // From interference sets
  for (const group of interference.interferenceSets) {
    for (const tag of group.tags) {
      if (!registeredTags.has(tag)) {
        addTag({
          tag,
          namespace: tag.split(':')[0],
          description: `Referenced in interference (auto-discovered)`,
        });
        registeredTags.add(tag);
      }
    }
  }

  // From priority
  for (const tag of Object.keys(priority.tagPriorities)) {
    if (!registeredTags.has(tag)) {
      addTag({
        tag,
        namespace: tag.split(':')[0],
        description: `Referenced in priority (auto-discovered)`,
      });
      registeredTags.add(tag);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalTags: entries.length,
    byNamespace,
    entries,
  };
}

// ============================================================================
// VALIDATION & SUMMARY
// ============================================================================

interface ValidationResult {
  errors: string[];
  warnings: string[];
  stats: {
    hierarchyEntries: number;
    interferenceSets: number;
    priorityEntries: number;
    registryTags: number;
    gpcsCovered: number;
    conceptsCovered: number;
  };
}

function validate(
  hierarchy: HierarchyConfig,
  interference: InterferenceConfig,
  priority: RelativePriorityConfig,
  registry: TagRegistry,
  sequence: SequenceData,
  borneTags: Set<string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const allTeachingGpcIds = [
    ...sequence.initialKnown,
    ...sequence.sequence.filter((s) => s.step > 0).map((s) => s.gpcId),
  ];

  // Check that every teaching GPC has the chain its generated cards can
  // satisfy: full expose→intro→exercise where an intro card exists; the
  // gated-concept leg (lesson-is-the-intro, c.1) where none does; nothing
  // at all where the GPC has no cards.
  // Only s-S is the true curriculum seed (expose prereq removed at bootstrap)
  const seedGpcIds = new Set(['GPC-s-S']);
  let gpcsCovered = 0;
  for (const gpcId of allTeachingGpcIds) {
    const introTag = gpcTag('intro', gpcId);
    const exerciseTag = gpcTag('exercise', gpcId);
    const introExists = borneTags.has(introTag);
    const exerciseExists = borneTags.has(exerciseTag);

    // Sight words with an intro card: checked below
    if (isSightWordGpcId(gpcId) && introExists) continue;

    if (!introExists) {
      // Lesson-is-the-intro GPC: no intro entry may exist, and its exercise
      // entry (if any) must not point at the unborne intro tag.
      if (hierarchy.prerequisites[introTag]) {
        errors.push(
          `Intro prereq entry emitted for ${gpcId} but no card bears ${introTag}`,
        );
      }
      const prereqs = hierarchy.prerequisites[exerciseTag];
      if (prereqs?.some((p) => p.tag === introTag)) {
        errors.push(
          `Exercise tag ${exerciseTag} requires unborne intro tag ${introTag}`,
        );
      }
      if (exerciseExists && !prereqs) {
        warnings.push(
          `No-intro GPC ${gpcId} has exercise cards but no gated-concept leg (no gated concept resolvable)`,
        );
      }
      if (exerciseExists) gpcsCovered++;
      continue;
    }

    if (!hierarchy.prerequisites[introTag]) {
      // Seed GPCs may have no prereqs at all (expose removed, nothing left)
      if (!seedGpcIds.has(gpcId)) {
        errors.push(`Missing intro prereq chain for ${gpcId}`);
      }
    } else if (!seedGpcIds.has(gpcId)) {
      // Non-seed GPCs must have expose prereq
      const hasExpose = hierarchy.prerequisites[introTag].some(
        (p) => p.tag === gpcTag('expose', gpcId),
      );
      if (!hasExpose) {
        errors.push(`Intro tag ${introTag} missing expose prerequisite`);
      }
    }

    if (!hierarchy.prerequisites[exerciseTag]) {
      if (exerciseExists) {
        // Might have been merged with GPC-specific prereqs
        warnings.push(
          `No explicit exercise prereq chain for ${gpcId} — may be merged`,
        );
      }
    } else {
      const hasIntro = hierarchy.prerequisites[exerciseTag].some(
        (p) => p.tag === introTag,
      );
      if (!hasIntro) {
        errors.push(`Exercise tag ${exerciseTag} missing intro prerequisite`);
      }
      gpcsCovered++;
    }
  }

  // Sight words: the intro needs no exposure, and exposure and exercise wait
  // for the intro (see generateHierarchyConfigs 1c)
  for (const introTag of [...borneTags].filter((t) => t.startsWith(SIGHT_INTRO_TAG_PREFIX))) {
    const shortId = introTag.slice('gpc:intro:'.length);
    if (hierarchy.prerequisites[introTag]?.some((p) => p.tag === `gpc:expose:${shortId}`)) {
      errors.push(`Sight-word intro ${introTag} requires its own exposure (deadlock: exposure waits for the intro)`);
    }
    for (const role of ['expose', 'exercise']) {
      const tag = `gpc:${role}:${shortId}`;
      if (borneTags.has(tag) && !hierarchy.prerequisites[tag]?.some((p) => p.tag === introTag)) {
        errors.push(`${tag} doesn't wait for ${introTag}`);
      }
    }
    gpcsCovered++;
  }

  // Check concept tags have prereqs
  const conceptsWithPrereqs = Object.keys(hierarchy.prerequisites).filter(
    (k) => k.startsWith('concept:') && !k.startsWith('concept:skill:'),
  );

  // Check all interference tags exist in the registry
  const registeredTags = new Set(registry.entries.map((e) => e.tag));
  for (const group of interference.interferenceSets) {
    for (const tag of group.tags) {
      if (!registeredTags.has(tag)) {
        warnings.push(`Interference tag ${tag} not in registry`);
      }
    }
  }

  // Spot-check a few GPCs
  const spotChecks = ['GPC-s-S', 'GPC-sh-SH', 'GPC-a_e-EY'];
  for (const gpcId of spotChecks) {
    if (!allTeachingGpcIds.includes(gpcId)) continue;
    const exTag = gpcTag('exercise', gpcId);
    const prereqs = hierarchy.prerequisites[exTag];
    if (prereqs) {
      const prereqTags = prereqs.map((p) => p.tag);
      console.log(`  Spot-check ${gpcId}:`);
      console.log(`    exercise prereqs: ${prereqTags.join(', ')}`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      hierarchyEntries: Object.keys(hierarchy.prerequisites).length,
      interferenceSets: interference.interferenceSets.length,
      priorityEntries: Object.keys(priority.tagPriorities).length,
      registryTags: registry.totalTags,
      gpcsCovered,
      conceptsCovered: conceptsWithPrereqs.length,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('=== Strategy Config Generation (P2) ===\n');

  // ---- Load inputs ----
  console.log('Loading inputs...');
  const sequence = loadSequence();
  const gpcStats = loadGpcStats();
  const borneTags = loadBorneTags();

  const teachingGpcCount =
    sequence.initialKnown.length +
    sequence.sequence.filter((s) => s.step > 0).length;
  console.log(`  GPC sequence: ${teachingGpcCount} teaching GPCs`);
  console.log(`  GPC stats: ${gpcStats.gpcs.length} entries`);
  console.log(`  Catalogue: ${GPC_CATALOGUE.length} total GPCs`);
  console.log(`  Borne tags (generated-cards.json): ${borneTags.size}\n`);

  // ---- Generate configs ----
  console.log('Generating hierarchy configs (3 scoped)...');
  const hierarchies = generateHierarchyConfigs(sequence, borneTags);
  const hierarchy = hierarchies.merged; // for validation / tag registry
  console.log(
    `  GPC: ${Object.keys(hierarchies.gpc.prerequisites).length}, ` +
    `Concept: ${Object.keys(hierarchies.concept.prerequisites).length}, ` +
    `UI: ${Object.keys(hierarchies.ui.prerequisites).length} ` +
    `(${Object.keys(hierarchy.prerequisites).length} total)`,
  );

  console.log('Generating interference config...');
  const interference = generateInterferenceConfig();
  console.log(`  ${interference.interferenceSets.length} interference sets`);

  console.log('Generating priority config...');
  const priority = generatePriorityConfig(sequence, gpcStats, borneTags, loadSightWordFrequencies());
  console.log(
    `  ${Object.keys(priority.tagPriorities).length} tag priorities`,
  );

  console.log('Generating tag registry...');
  const registry = generateTagRegistry(
    sequence,
    hierarchy,
    interference,
    priority,
  );
  console.log(`  ${registry.totalTags} total tags registered`);

  // ---- Validate ----
  console.log('\nValidating...');
  const validation = validate(
    hierarchy,
    interference,
    priority,
    registry,
    sequence,
    borneTags,
  );

  if (validation.errors.length > 0) {
    console.error('\n❌ ERRORS:');
    for (const err of validation.errors) {
      console.error(`  • ${err}`);
    }
  }

  if (validation.warnings.length > 0) {
    console.warn('\n⚠️  WARNINGS:');
    for (const warn of validation.warnings) {
      console.warn(`  • ${warn}`);
    }
  }

  console.log('\n📊 Stats:');
  console.log(`  Hierarchy entries:  ${validation.stats.hierarchyEntries}`);
  console.log(`  Interference sets:  ${validation.stats.interferenceSets}`);
  console.log(`  Priority entries:   ${validation.stats.priorityEntries}`);
  console.log(`  Registry tags:      ${validation.stats.registryTags}`);
  console.log(`  GPCs with chains:   ${validation.stats.gpcsCovered}`);
  console.log(`  Concepts with prereqs: ${validation.stats.conceptsCovered}`);

  // ---- Write outputs ----
  mkdirSync(STRATEGY_DIR, { recursive: true });

  for (const [scope, config] of Object.entries({
    'hierarchy-gpc.json': hierarchies.gpc,
    'hierarchy-concept.json': hierarchies.concept,
    'hierarchy-ui.json': hierarchies.ui,
  })) {
    const p = resolve(STRATEGY_DIR, scope);
    writeFileSync(p, JSON.stringify(config, null, 2) + '\n');
    console.log(`\n✅ Wrote ${p}`);
  }

  const interferencePath = resolve(STRATEGY_DIR, 'interference.json');
  writeFileSync(
    interferencePath,
    JSON.stringify(interference, null, 2) + '\n',
  );
  console.log(`✅ Wrote ${interferencePath}`);

  const priorityPath = resolve(STRATEGY_DIR, 'priority.json');
  writeFileSync(priorityPath, JSON.stringify(priority, null, 2) + '\n');
  console.log(`✅ Wrote ${priorityPath}`);

  const registryPath = resolve(STRATEGY_DIR, 'tag-registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  console.log(`✅ Wrote ${registryPath}`);

  // ---- Final status ----
  if (validation.errors.length > 0) {
    console.error(
      `\n❌ Completed with ${validation.errors.length} error(s). Review above.`,
    );
    process.exit(1);
  } else {
    console.log('\n✅ Strategy config generation complete!');
  }
}

main();
