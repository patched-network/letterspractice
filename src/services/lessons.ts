/**
 * Lesson catalog and lookup utilities.
 *
 * Lessons are short, Stage-driven narrative introductions to phonetic
 * concepts, designed to be consumed with an adult reader present.
 *
 * This file owns the *narrative* (title, description, dismissal text,
 * components). Lesson *topology and thresholds* are derived from the
 * curriculum single source of truth: `gatesFor`/`availabilityFor` read the
 * lesson registry + `CONCEPT_POLICIES` from
 * `content/phoneticAnalytics/lib/curriculum.ts` (via the `./curriculum`
 * façade). To add/retune a lesson's gating, edit curriculum.ts; to change
 * what the child/adult sees, edit here. The pipeline's test-cards.ts
 * "registry twins" invariant asserts this file and the registry agree.
 *
 * See: content/phoneticAnalytics/lib/curriculum.ts (curriculum SoT)
 * See: content/phoneticAnalytics/CLAUDE.md (pipeline + curriculum map)
 * See: agent/devlog/2026-06-16-curriculum-sot-closeout.md (originating
 *   working docs — curriculum-sot, concept-gates, lessons-mvp-gtm — were
 *   removed from the tree; git history has them)
 */

import type {
  LessonDefinition,
  LessonProgressState,
  LessonAvailabilityConditions,
} from './lessons.types';
import type { ConceptTag } from './tags';
import type { ReplanHints } from '@vue-skuilder/db';
import { digraphGpcIntroCardId, gpcExerciseTag, whoSaidThatCardId } from './tags';
import {
  getLessonEntry,
  CONCEPT_POLICIES,
  GPC_CATALOGUE,
  POST_LESSON_SEED_CARDS,
  exerciseTagsForLesson,
  introGraphemesForLesson,
  type LessonId,
  type BreadthRule,
} from './curriculum';
import { courseSecurity, type CourseSecurity, type EloRank, type TagSecurityConfig, type TagSelector } from '@vue-skuilder/common';

// ---------------------------------------------------------------------------
// Curriculum derivation
// ---------------------------------------------------------------------------

/**
 * Concept tags a lesson releases — read from the curriculum registry
 * (single source of truth shared with the content pipeline). The cast is
 * policed by the pipeline's test-cards.ts invariants (registry twins,
 * concept-tags-known).
 */
function gatesFor(id: LessonId): ConceptTag[] {
  const entry = getLessonEntry(id);
  if (!entry) throw new Error(`Lesson "${id}" missing from curriculum registry`);
  return [...entry.gatesConcepts] as ConceptTag[];
}

/**
 * Availability conditions for a lesson — read from the threshold policy of
 * the concept(s) it gates. Where the policy is `mustMatch: true`, the
 * pipeline asserts these equal the hierarchy-concept.json prereqs; deliberate
 * divergences (the digraphs breadth gate) are documented on the policy entry
 * in curriculum.ts.
 */
function availabilityFor(id: LessonId): LessonAvailabilityConditions | undefined {
  for (const tag of gatesFor(id)) {
    const policy = CONCEPT_POLICIES[tag]?.lessonAvailability;
    if (policy) {
      return {
        ...(policy.masteryPrereqs ? { masteryPrereqs: policy.masteryPrereqs.map((p) => ({ ...p })) } : {}),
        ...(policy.minUnlockedLetters !== undefined ? { minUnlockedLetters: policy.minUnlockedLetters } : {}),
        ...(policy.minUnlockedFromLesson
          ? { minUnlockedFromLesson: { ...policy.minUnlockedFromLesson } }
          : {}),
        ...(policy.minSessionsSinceLastLesson !== undefined
          ? { minSessionsSinceLastLesson: policy.minSessionsSinceLastLesson }
          : {}),
        ...(policy.failClosed ? { failClosed: policy.failClosed } : {}),
        ...(policy.mastery
          ? {
              mastery: {
                ...policy.mastery,
                breadth: policy.mastery.breadth.map((r) => ({ ...r })),
              },
            }
          : {}),
      };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Lesson Catalog
// ---------------------------------------------------------------------------

/**
 * Active MVP lesson catalog, ordered by intended curriculum sequence.
 *
 * This catalog is a NARRATIVE DECORATOR over the curriculum registry
 * (content/phoneticAnalytics/lib/curriculum.ts) — titles, descriptions,
 * dismissal text, mastery definitions, and ordering/prerequisites live
 * here; `gatesConceptTags` and `availabilityConditions` are derived from
 * the registry's lesson entries and threshold policies via `gatesFor()` /
 * `availabilityFor()`. The pipeline's test-cards.ts asserts this catalog
 * and the registry stay twinned (ids + active/deferred status) and that
 * mustMatch threshold policies agree with hierarchy-concept.json.
 *
 * Prerequisites are enforced by `getNextLesson()` — a lesson won't be
 * offered until all its prerequisites are completed (or dismissed).
 *
 * BREADTH GATES: Some lessons use `minUnlockedLetters` (a count of distinct
 * GPC-intro completions) rather than mirroring the pipeline's volume-based
 * concept counts. `digraphs` does this — see the documented divergence on
 * its CONCEPT_POLICIES entry in curriculum.ts.
 *
 * MVP reset note:
 * - lessons in this array are the currently blessed launch-facing slate
 * - deferred lesson families remain documented below in `DEFERRED_LESSON_CATALOG`
 * - both active and deferred lessons should stay aligned with the existing
 *   typed concept-tag scheme rather than inventing a parallel taxonomy
 */
export const LESSON_CATALOG: LessonDefinition[] = [
  {
    id: 'hello-world',
    title: 'Meet the Letters',
    description: 'Letters make sounds! Starting with the most common letter-sound relationships.',
    progressDescription: 'Letters make sounds! Learning the most straightforward letter-sound associations.',
    prerequisites: [],
    // concept:match:simple + concept:vowel:short — the initial 26-letter
    // slate; short vowels never had a separate lesson.
    gatesConceptTags: gatesFor('hello-world'),
    // No availabilityConditions — this is the entry lesson.
    // Note: hello-world is always treated as passed in LessonGateFilter
    // (bootstrap exception), so this lesson is purely onboarding.
    // Per-letter mastery: each of the 25 (no q-K) primary grapheme→phoneme mappings
    // must be encountered a few times with reasonable accuracy before this
    // lesson's content is considered "mature" in the progress view.
    // Tags sourced from CONSONANTS_SIMPLE + VOWELS_SHORT in the GPC catalogue.
    masteryDefinition: {
      thresholds: [
        { tag: 'gpc:exercise:a-AE', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:b-B', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:c-K', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:d-D', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:e-EH', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:f-F', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:g-G', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:h-HH', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:i-IH', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:j-JH', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:k-K', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:l-L', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:m-M', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:n-N', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:o-AA', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:p-P', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:r-R', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:s-S', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:t-T', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:u-AH', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:v-V', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:w-W', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:x-K_S', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:y-Y', minCount: 5, minElo: 1050 },
        { tag: 'gpc:exercise:z-Z', minCount: 5, minElo: 1050 },
      ],
    },
  },
  // Lesson 1a: a sub-lesson of hello-world, standing in front of b's intro
  // card (the b/d "bed" mnemonic). b stays a hello-world letter; see
  // LESSON_GATED_CARDS in curriculum.ts. 3D-only (THREE_D_ONLY).
  {
    id: 'bed',
    title: 'Making our bed',
    description: 'A *handy* way to remember and check the difference between **b** and **d**.',
    subOf: 'hello-world',
    prerequisites: ['hello-world'],
    gatesConceptTags: gatesFor('bed'),
    availabilityConditions: availabilityFor('bed'),
    // Its gated tag is borne by one card (b's intro), so the default
    // definition (10 on each gated tag) could never be met: mature is b's
    // own practice, as for hello-world's letters.
    masteryDefinition: {
      thresholds: [{ tag: 'gpc:exercise:b-B', minCount: 5, minElo: 1050 }],
    },
  },
  {
    id: 'digraphs',
    title: 'Letter Teammates',
    description: 'Sometimes two letters team up to make a sound.',
    prerequisites: ['hello-world'],
    gatesConceptTags: gatesFor('digraphs'),
    // Breadth gate (minUnlockedLetters: 13) — deliberate divergence from the
    // pipeline's volume thresholds; rationale documented on the
    // concept:match:digraph policy entry in curriculum.ts.
    availabilityConditions: availabilityFor('digraphs'),
  },
  {
    id: 'split-digraphs',
    title: 'The Sneaky e',
    description: '*e* teams up with a, i, o, u and sometimes itself in a different way.',
    prerequisites: ['digraphs'],
    gatesConceptTags: gatesFor('split-digraphs'),
    availabilityConditions: availabilityFor('split-digraphs'),
  },
  {
    id: 'final-open-vowels',
    title: 'Vowels at the End',
    // Copy is de-name-ified (no letter-name idioms) and frames the pattern as
    // a callback to split-digraphs: same changed vowel sound, no sneaky e. See
    // agent/lessons-audit/b.1 (W5, D7/orientation #7).
    description: 'A vowel at the end of a word can make its changed sound all by itself — no sneaky e required.',
    prerequisites: ['split-digraphs'],
    gatesConceptTags: gatesFor('final-open-vowels'),
    availabilityConditions: availabilityFor('final-open-vowels'),
  },
  // Promoted 2026-09-29 (lesson 5; b.3 sight-words todo). 3D-only: see
  // THREE_D_ONLY in src/lessons/index.ts
  {
    id: 'sight-words',
    title: 'Weird Words',
    description: 'Sometimes letters break the rules. We learn some common words by heart.',
    prerequisites: ['final-open-vowels'],
    gatesConceptTags: gatesFor('sight-words'),
    availabilityConditions: availabilityFor('sight-words'),
  },
];

/**
 * Deferred lesson catalog.
 *
 * These lesson definitions stay in code so roadmap, audit, and other
 * typed/runtime-adjacent work can still refer to them without keeping
 * them mixed into the active launch-facing runtime lesson slate.
 *
 * They are intentionally excluded from `LESSON_CATALOG`, so they do not
 * participate in normal next-lesson selection until deliberately promoted.
 */
export const DEFERRED_LESSON_CATALOG: LessonDefinition[] = [
  {
    id: 'vowel-teams',
    title: 'Vowel Partnerships',
    description: 'Two vowels together make a new sound — teamwork!',
    prerequisites: ['split-digraphs'],
    gatesConceptTags: gatesFor('vowel-teams'),
    availabilityConditions: availabilityFor('vowel-teams'),
  },
  {
    id: 'r-controlled',
    title: 'Bossy R',
    description: 'When R comes after a vowel, it changes the vowel\'s sound!',
    prerequisites: ['vowel-teams'],
    gatesConceptTags: gatesFor('r-controlled'),
    availabilityConditions: availabilityFor('r-controlled'),
  },
  {
    id: 'l-controlled',
    title: 'L Joins the Party',
    description: 'L can change vowel sounds too — just like R!',
    prerequisites: ['r-controlled'],
    gatesConceptTags: gatesFor('l-controlled'),
    availabilityConditions: availabilityFor('l-controlled'),
  },
  {
    id: 'soft-consonants',
    title: 'C and G\'s Secrets',
    description: 'C and G have a secret — sometimes they make completely different sounds!',
    prerequisites: ['digraphs'],
    gatesConceptTags: gatesFor('soft-consonants'),
    availabilityConditions: availabilityFor('soft-consonants'),
  },
  {
    id: 'doubled-consonants',
    title: 'Double Trouble',
    description: 'Sometimes you see a letter twice — but it still makes just one sound!',
    prerequisites: ['digraphs'],
    gatesConceptTags: gatesFor('doubled-consonants'),
    availabilityConditions: availabilityFor('doubled-consonants'),
  },
  {
    id: 'silent-letters',
    title: 'The Quiet Ones',
    description: 'Some letters hide in words — you can see them but can\'t hear them!',
    prerequisites: ['doubled-consonants'],
    gatesConceptTags: gatesFor('silent-letters'),
    availabilityConditions: availabilityFor('silent-letters'),
  },
];

// ---------------------------------------------------------------------------
// Derived Lookup Maps
// ---------------------------------------------------------------------------

/**
 * Reverse mapping: concept tag → lesson that gates it.
 * Built once at module load from the catalog.
 */
const CONCEPT_TO_LESSON: ReadonlyMap<string, LessonDefinition> = (() => {
  const map = new Map<string, LessonDefinition>();
  for (const lesson of LESSON_CATALOG) {
    for (const tag of lesson.gatesConceptTags) {
      map.set(tag, lesson);
    }
  }
  return map;
})();

const DEFERRED_CONCEPT_TO_LESSON: ReadonlyMap<string, LessonDefinition> = (() => {
  const map = new Map<string, LessonDefinition>();
  for (const lesson of DEFERRED_LESSON_CATALOG) {
    for (const tag of lesson.gatesConceptTags) {
      map.set(tag, lesson);
    }
  }
  return map;
})();

/**
 * Get the active MVP lesson that gates a given concept tag, if any.
 */
export function getLessonForConceptTag(conceptTag: string): LessonDefinition | null {
  return CONCEPT_TO_LESSON.get(conceptTag) ?? null;
}

/**
 * Get the deferred lesson that would gate a given concept tag, if any.
 *
 * Useful for roadmap/audit/reporting work that wants to stay grounded in
 * the existing typed concept-tag scheme without mixing deferred lessons
 * back into the active runtime lesson path.
 */
export function getDeferredLessonForConceptTag(conceptTag: string): LessonDefinition | null {
  return DEFERRED_CONCEPT_TO_LESSON.get(conceptTag) ?? null;
}

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Display numbers for the active lessons: a top-level lesson's place among
 * the top-level lessons, a sub-lesson (`subOf`) its parent's number and a
 * letter (1, 1a, 2, …). Adding a sub-lesson doesn't renumber the rest.
 */
const LESSON_NUMBERS: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  const subsSeen = new Map<string, number>();
  let top = 0;
  for (const lesson of LESSON_CATALOG) {
    if (!lesson.subOf) {
      out.set(lesson.id, String(++top));
      continue;
    }
    const n = subsSeen.get(lesson.subOf) ?? 0;
    subsSeen.set(lesson.subOf, n + 1);
    out.set(lesson.id, `${out.get(lesson.subOf) ?? '?'}${String.fromCharCode(97 + n)}`);
  }
  return out;
})();

/** A lesson's display number ("1", "1a", "2"), or null if it isn't in the active catalog. */
export function lessonNumber(id: string): string | null {
  return LESSON_NUMBERS.get(id) ?? null;
}

/**
 * A lesson's slot in a per-lesson palette (/curriculum's lesson colours): a
 * top-level lesson's place among the top-level lessons; a sub-lesson shares
 * its parent's. -1 if the lesson isn't in the active catalog.
 */
export function lessonPaletteIndex(id: string): number {
  const lesson = LESSON_CATALOG.find((l) => l.id === id);
  if (!lesson) return -1;
  const own = lesson.subOf ?? lesson.id;
  return LESSON_CATALOG.filter((l) => !l.subOf).findIndex((l) => l.id === own);
}

/**
 * Find an active MVP lesson by its ID.
 *
 * @returns The lesson definition, or null if not found in the active catalog.
 */
export function getLessonById(id: string): LessonDefinition | null {
  return LESSON_CATALOG.find((lesson) => lesson.id === id) ?? null;
}

/**
 * Find a deferred lesson by its ID.
 *
 * @returns The lesson definition, or null if not found in the deferred catalog.
 */
export function getDeferredLessonById(id: string): LessonDefinition | null {
  return DEFERRED_LESSON_CATALOG.find((lesson) => lesson.id === id) ?? null;
}

/**
 * Find a lesson by its ID across both active and deferred catalogs.
 *
 * Prefer `getLessonById()` when you specifically want the active runtime
 * lesson slate, and `getDeferredLessonById()` when you specifically want
 * deferred roadmap lessons.
 */
export function getAnyLessonById(id: string): LessonDefinition | null {
  return getLessonById(id) ?? getDeferredLessonById(id);
}

// ---------------------------------------------------------------------------
// Lesson Progress Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a lesson has been "passed" — meaning its gate is open.
 *
 * A lesson is passed if its ID is in either `completedLessons` or
 * `dismissedLessons`. Both paths unlock the same content.
 *
 * When `includeBootstrap` is true (the default), `hello-world` is always
 * treated as passed. This is the correct behavior for **gating** purposes
 * (LessonGateFilter) — basic letter content must flow immediately. Set
 * `includeBootstrap: false` for **offering** logic (getNextLesson) and
 * **display** logic (ProgressView) where you need to know the actual
 * user completion state.
 */
export function isLessonPassed(
  lessonId: string,
  progress: LessonProgressState | null,
  { includeBootstrap = true }: { includeBootstrap?: boolean } = {},
): boolean {
  // Bootstrap: hello-world is always considered passed for gating purposes
  if (includeBootstrap && lessonId === 'hello-world') return true;

  if (!progress) return false;
  return (
    progress.completedLessons.includes(lessonId) ||
    progress.dismissedLessons.includes(lessonId)
  );
}

/**
 * Get the set of all passed lesson IDs (completed + dismissed).
 *
 * When `includeBootstrap` is true (the default), includes `hello-world`
 * unconditionally. This is correct for **gating** (LessonGateFilter) but
 * not for **offering** (getNextLesson) or **display** (ProgressView).
 */
export function getPassedLessonIds(
  progress: LessonProgressState | null,
  { includeBootstrap = true }: { includeBootstrap?: boolean } = {},
): Set<string> {
  const passed = new Set<string>();
  if (includeBootstrap) passed.add('hello-world'); // bootstrap for gating
  if (progress) {
    for (const id of progress.completedLessons) passed.add(id);
    for (const id of progress.dismissedLessons) passed.add(id);
  }
  return passed;
}

// ---------------------------------------------------------------------------
// Lesson Eligibility
// ---------------------------------------------------------------------------

/**
 * Context needed to evaluate lesson availability.
 *
 * Richer than the original `LessonProgressState`-only signature:
 * includes ELO data and spacing information for mastery-based gating.
 */
// ---------------------------------------------------------------------------
// Mastery gating (agent/mastery-gating/a.1.plan.md)
// ---------------------------------------------------------------------------

/**
 * Whether lessons with a `mastery` block open on secure GPCs instead of their
 * older conditions. Off by default. On via `VITE_MASTERY_GATING=true` at
 * build time, or `localStorage['lp:masteryGating'] = 'true'` in one browser
 * (testing). Scripts (the curriculum sim) set `masteryGating.enabled`.
 */
export const masteryGating = { enabled: readMasteryGatingFlag() };

function readMasteryGatingFlag(): boolean {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (env?.VITE_MASTERY_GATING === 'true') return true;
  } catch {
    // no import.meta.env outside vite
  }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('lp:masteryGating') === 'true';
  } catch {
    return false;
  }
}

/** Thresholds for "secure": the framework defaults (agent/mastery-gating/a.2.replay.md §2). */
export const SECURITY_CONFIG: TagSecurityConfig = {};

/** A learner's per-tag ratings as the lesson gates read them: score, count, and the first-attempt buffer. */
export type LessonTagElo = Record<string, Pick<EloRank, 'score' | 'count' | 'recent'>>;

/** The GPCs settledness is read over: letter-sounds, not sight words (learned whole). */
export const LETTER_SOUND_SELECTOR: TagSelector = {
  include: ['gpc:exercise:'],
  exclude: ['gpc:exercise:WORD-'],
};

/** How much of a breadth rule's slate is met (graded at least once), and how much it needs. */
export function breadthProgress(
  rule: BreadthRule,
  tagElo: LessonTagElo | undefined,
): { met: number; needed: number; slate: string[] } {
  const slate = exerciseTagsForLesson(rule.lesson, GPC_CATALOGUE);
  const met = slate.filter((t) => (tagElo?.[t]?.count ?? 0) > 0).length;
  return { met, needed: Math.ceil(rule.fraction * slate.length), slate };
}

/**
 * Exercise tags the catalogue still defines. A learner's ratings can hold
 * tags no catalogue GPC defines (until 2026-11-18 WhoSaidThat graded its
 * split-digraph cards as a bare `a-EY`, `i-AY`…, not `a_e-EY`). Those can never
 * become secure, so the debt count must skip them or they hold the gate shut.
 */
export const CATALOGUE_EXERCISE_TAGS: ReadonlySet<string> = new Set(
  GPC_CATALOGUE.map((e) => gpcExerciseTag(e.id)),
);

/** Security of the learner's met letter-sounds: the debt the mastery gate caps. */
export function letterSoundSecurity(tagElo: LessonTagElo | undefined): CourseSecurity {
  const tags: Record<string, EloRank> = {};
  for (const [tag, rank] of Object.entries(tagElo ?? {})) {
    if (CATALOGUE_EXERCISE_TAGS.has(tag)) tags[tag] = rank as EloRank;
  }
  return courseSecurity(
    { global: { score: 0, count: 0 }, tags, misc: {} },
    { selector: LETTER_SOUND_SELECTOR, config: SECURITY_CONFIG },
  );
}

/** Whether the mastery gate governs this lesson right now. */
function masteryGoverns(conditions: LessonAvailabilityConditions | undefined): boolean {
  return masteryGating.enabled && !!conditions?.mastery;
}

export interface LessonEligibilityContext {
  progress: LessonProgressState | null;
  /** User's per-tag ELO state (from course registration doc), with each tag's `recent` buffer */
  tagElo?: LessonTagElo;
  /**
   * Number of distinct letters introduced (GPC-intro completed), i.e.
   * `LetterProgressionState.unlockedLetters.length`. Used by the
   * `minUnlockedLetters` breadth gate. When omitted, breadth gates are
   * not evaluated (treated as satisfied), mirroring the tagElo skip behavior.
   */
  unlockedLetterCount?: number;
  /**
   * The unlocked graphemes themselves (`LetterProgressionState.unlockedLetters`,
   * including multi-char intro graphemes like "sh", "a_e"). Used by the
   * `minUnlockedFromLesson` in-rotation gate. When omitted, that gate is not
   * evaluated (treated as satisfied), mirroring the other skip behaviors.
   */
  unlockedGraphemes?: string[];
  /** Practice sessions since last lesson passed (overrides progress state if provided) */
  sessionsSinceLastLesson?: number;
}

/**
 * Evaluate a lesson's mastery + breadth availability conditions.
 *
 * Shared by the offering path (`getNextLesson`) and the display path
 * (`LessonsView`) so the two can't drift. Spacing (`minSessionsSinceLastLesson`)
 * is intentionally NOT handled here — only `getNextLesson` enforces spacing.
 *
 * Skip-if-absent semantics (to avoid false negatives during load races):
 *   - `masteryPrereqs` are only enforced when non-empty `tagElo` is provided
 *     (a `failClosed` lesson is withheld instead).
 *   - `minUnlockedLetters` is only enforced when `unlockedLetterCount` is provided.
 *   - `minUnlockedFromLesson` is only enforced when `unlockedGraphemes` is provided.
 */
export function lessonMasteryConditionsMet(
  conditions: LessonAvailabilityConditions | undefined,
  ctx: {
    tagElo?: LessonTagElo;
    unlockedLetterCount?: number;
    unlockedGraphemes?: string[];
  },
): boolean {
  if (!conditions) return true;

  // Mastery gate: replaces everything below. Breadth (enough of what the
  // lesson builds on is met) and settledness (few enough met letter-sounds
  // still insecure). Fails closed: no ratings means nothing met.
  if (masteryGoverns(conditions)) {
    const gate = conditions.mastery!;
    if (!ctx.tagElo || Object.keys(ctx.tagElo).length === 0) return false;
    const broadEnough = gate.breadth.every((rule) => {
      const p = breadthProgress(rule, ctx.tagElo);
      return p.met >= p.needed;
    });
    return broadEnough && letterSoundSecurity(ctx.tagElo).debt <= gate.maxInsecure;
  }

  // ELO mastery prereqs — only evaluated when ELO data is present (unless
  // the lesson is fail-closed: then no data means not yet).
  if (conditions.masteryPrereqs && conditions.masteryPrereqs.length > 0) {
    const tagElo = ctx.tagElo;
    const haveElo = !!tagElo && Object.keys(tagElo).length > 0;
    if (!haveElo && conditions.failClosed) return false;
    if (tagElo && haveElo) {
      const met = conditions.masteryPrereqs.every((mp) => {
        const elo = tagElo[mp.tag];
        if (!elo) return false;
        if (mp.minCount !== undefined && elo.count < mp.minCount) return false;
        if (mp.minElo !== undefined && elo.score < mp.minElo) return false;
        return true;
      });
      if (!met) return false;
    }
  }

  // Breadth gate — distinct introduced letters (GPC-intro completions).
  if (
    conditions.minUnlockedLetters !== undefined &&
    ctx.unlockedLetterCount !== undefined
  ) {
    if (ctx.unlockedLetterCount < conditions.minUnlockedLetters) return false;
  }

  // In-rotation gate — distinct intro completions from a specific lesson's
  // slate (e.g. split-digraphs requires ≥3 digraphs genuinely in rotation).
  if (conditions.minUnlockedFromLesson && ctx.unlockedGraphemes !== undefined) {
    const { lesson, count } = conditions.minUnlockedFromLesson;
    if (countUnlockedFromLesson(lesson, ctx.unlockedGraphemes) < count) return false;
  }

  return true;
}

/**
 * Intro-able member graphemes for a lesson (lowercased), cached per lesson.
 * Domain of the `minUnlockedFromLesson` gate — see `introGraphemesForLesson`
 * in the curriculum SoT.
 */
const lessonIntroGraphemeCache = new Map<LessonId, ReadonlySet<string>>();
function lessonIntroGraphemes(lessonId: LessonId): ReadonlySet<string> {
  let slate = lessonIntroGraphemeCache.get(lessonId);
  if (!slate) {
    slate = introGraphemesForLesson(lessonId, GPC_CATALOGUE);
    lessonIntroGraphemeCache.set(lessonId, slate);
  }
  return slate;
}

/**
 * Count how many of a lesson's intro-able member graphemes are currently in
 * rotation (unlocked). This is the quantity the `minUnlockedFromLesson` gate
 * thresholds against; exported so display surfaces (e.g. the /progress
 * curriculum card's "At least N …" blocker) can explain the gap without
 * re-deriving the slate. Case-insensitive; de-duplicates the input.
 */
export function countUnlockedFromLesson(
  lessonId: LessonId,
  unlockedGraphemes: string[] | undefined,
): number {
  if (!unlockedGraphemes) return 0;
  const slate = lessonIntroGraphemes(lessonId);
  let n = 0;
  for (const g of new Set(unlockedGraphemes.map((x) => x.toLowerCase()))) {
    if (slate.has(g)) n++;
  }
  return n;
}

/**
 * Determine the next lesson to offer the user.
 *
 * Walks the catalog in order, returning the first lesson whose:
 *   1. ID is not already passed (completed or dismissed)
 *   2. All `prerequisites` (lesson IDs) are passed
 *   3. All `availabilityConditions.masteryPrereqs` are met (if tagElo provided)
 *   4. Spacing constraint (`minSessionsSinceLastLesson`) is satisfied
 *
 * @param ctx - Eligibility context with progress, ELO data, and spacing info
 * @returns The next available lesson, or null if all lessons are complete
 *          (or no lesson has its prerequisites met).
 */
export function getNextLesson(
  ctx: LessonEligibilityContext,
): LessonDefinition | null {
  // Use includeBootstrap: false so hello-world is offered to new users
  // (bootstrap is only for gating — LessonGateFilter uses its own call)
  const passed = getPassedLessonIds(ctx.progress, { includeBootstrap: false });

  for (const lesson of LESSON_CATALOG) {
    if (passed.has(lesson.id)) continue;

    // Lesson-ID prerequisites
    const prereqsMet = (lesson.prerequisites ?? []).every((p) => passed.has(p));
    if (!prereqsMet) continue;

    // ELO mastery + breadth prerequisites
    const masteryMet = lessonMasteryConditionsMet(lesson.availabilityConditions, {
      tagElo: ctx.tagElo,
      unlockedLetterCount: ctx.unlockedLetterCount,
      unlockedGraphemes: ctx.unlockedGraphemes,
    });
    if (!masteryMet) continue;

    // Spacing constraint (the mastery gate carries its own)
    const spacing = masteryGoverns(lesson.availabilityConditions)
      ? (lesson.availabilityConditions!.mastery!.minSessionsSinceLastLesson ?? 0)
      : (lesson.availabilityConditions?.minSessionsSinceLastLesson ?? 0);
    const sessions =
      ctx.sessionsSinceLastLesson ??
      ctx.progress?.sessionsSinceLastLesson ??
      0;
    if (sessions < spacing) continue;

    return lesson;
  }

  return null;
}

/**
 * Legacy overload: accepts a bare LessonProgressState for backward compat.
 *
 * Callers that don't have ELO data can still use this — mastery conditions
 * are simply not checked, and the lesson is offered based on prerequisites
 * and completion status alone.
 */
export function getNextLessonSimple(
  progress: LessonProgressState | null,
): LessonDefinition | null {
  return getNextLesson({ progress });
}

/**
 * Check whether a specific lesson is available to the user.
 *
 * A lesson is available if:
 *   - It exists in the catalog
 *   - It hasn't been passed
 *   - All its prerequisites are passed
 *
 * Note: This does NOT check mastery prerequisites or spacing — those are
 * only evaluated by `getNextLesson()` for sequencing purposes.
 */
export function isLessonAvailable(
  lessonId: string,
  progress: LessonProgressState | null,
): boolean {
  const lesson = getLessonById(lessonId);
  if (!lesson) return false;

  const passed = getPassedLessonIds(progress, { includeBootstrap: false });
  if (passed.has(lessonId)) return false;

  return (lesson.prerequisites ?? []).every((prereq) => passed.has(prereq));
}

// ---------------------------------------------------------------------------
// Post-Lesson Practice Hint Helpers
// ---------------------------------------------------------------------------

/**
 * Build a boost-tags map for a just-completed (or dismissed) lesson.
 *
 * Boosts cards carrying the newly unlocked concept tags. This steers
 * the first post-lesson practice session toward introducing specific
 * GPCs within the concept (e.g., after the digraphs lesson, boost
 * concept:match:digraph cards).
 *
 * The boost is moderate (×3.0) — enough to prioritize but not monopolize.
 * The pipeline's existing priority and hierarchy filters still apply.
 * Since concept tags are on all cards in the category (intros AND exercises),
 * and hierarchy-gpc.json still gates exercises behind intros, the net effect
 * is that intro cards for the concept get boosted.
 */
export function getBoostTagsForLesson(lessonId: string): Record<string, number> {
  const lesson = getLessonById(lessonId);
  if (!lesson) return {};

  const boosts: Record<string, number> = {};
  for (const conceptTag of lesson.gatesConceptTags) {
    boosts[conceptTag] = 3.0;
  }
  return boosts;
}

/**
 * Full ReplanHints for the practice session immediately following a lesson.
 *
 * These are threaded through `StudySessionConfig.initHints` and applied by
 * `StudySession.vue` via `SessionController.setSessionHints` — i.e. as
 * SESSION-DURABLE hints, not a one-shot seed. That matters for the two hint
 * kinds we lean on:
 *
 *   - `requireCards` (hard guarantee, +Infinity): being durable, the card
 *     survives the replace-mode auto-replans that fire through the session and
 *     self-clears the instant it's drawn (SessionController.removeItemFromQueue).
 *     This mirrors the in-session idiom GpcIntroView uses via `mergeSessionHints`.
 *   - `boostTags` (soft priority): re-merged into every pipeline run for the
 *     rest of the session.
 *
 * NB: these hints apply to exactly ONE session — the post-lesson one. The
 * lifecycle is enforced LP-side in `useStudySession` (initHints are cleared when
 * the consuming session finishes); previously a stale copy leaked into every
 * subsequent session, re-surfacing the WST requireCard out of context.
 */
export function getPostLessonHints(lessonId: string): ReplanHints {
  const boostTags = getBoostTagsForLesson(lessonId);
  const hints: ReplanHints = {};

  if (Object.keys(boostTags).length > 0) {
    hints.boostTags = boostTags;
  }

  // Prescribed seed cards from the curriculum SoT (POST_LESSON_SEED_CARDS —
  // see its doc block for the lesson-is-the-intro mechanism). For lessons
  // whose slate has no intro cards (e.g. final-open-vowels), completing the
  // first seed also clears the slate's shared hierarchy leg
  // (gated-concept-tag minCount 1) emitted by generate-strategy-configs.ts.
  const seedCards =
    POST_LESSON_SEED_CARDS[lessonId as LessonId];
  if (seedCards?.length) {
    hints.requireCards = [...seedCards];
  }

  if (lessonId === 'digraphs') {
    // The DigraphLesson itself fully covers the sh-SH intro (SH demo + ship/fish
    // exemplars). Mirror GpcIntroView's post-intro steering: boost the specific
    // sh-SH *exercise* tag strongly (the broad concept boost above is kept for
    // breadth, but this sharpens the target), surface WhoSaidThat-SH as a durable
    // requireCard, and suppress the now-redundant gpc-intro card.
    //
    // See TODO-lesson-card-completion.md: the excludeCards suppression only holds
    // for this one session; sh-intro can still resurface in a later session
    // because a lesson can't yet record a synthetic completion against the intro
    // card's tag history. (That's the heavier, deferred fix — not this change.)
    hints.boostTags = { ...(hints.boostTags ?? {}), [gpcExerciseTag('GPC-sh-SH')]: 10.0 };
    hints.requireCards = [whoSaidThatCardId('GPC-sh-SH')];
    hints.excludeCards = [digraphGpcIntroCardId('GPC-sh-SH')];
  }

  return hints;
}
