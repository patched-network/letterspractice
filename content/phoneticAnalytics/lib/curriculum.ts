/**
 * Curriculum — single source of truth for lesson topology and release policy.
 *
 * This module declares:
 *  - the lesson registry (ids + status + the concept tags each lesson releases)
 *  - per-GPC lesson assignment (category defaults + explicit overrides)
 *  - effective concept-tag resolution (curriculum policy over the mechanical
 *    derivation in ./concept-tags.ts)
 *  - per-concept threshold policies (pipeline prereqs vs lesson availability),
 *    including whether the two are contractually required to agree
 *
 * Consumers:
 *  - pipeline: scripts/generate-cards.ts (concept tags on cards),
 *    scripts/generate-strategy-configs.ts (hierarchy-concept prereqs)
 *  - app: src/services/lessons.ts (gatesConceptTags, availability),
 *    src/services/LessonGateFilter.ts (gated tag set),
 *    lesson progress reporters (per-lesson GPC inventories)
 *
 * ## Gating semantics
 *
 * The concept tag is the unit of lesson gating. A GPC's cards are released
 * by the lesson that `unlockedBy` names, via that lesson's gated concept tag.
 * GPCs assigned `unassigned` carry the `concept:unassigned` holding tag,
 * which REPLACES the category-derived concept tag (a supplemental tag would
 * leak through the category's lesson gate). The holding tag has no hierarchy
 * prerequisites; default-deny lesson gating alone suppresses it. Recovery is
 * a one-line `unlockedBy` edit + content redeploy.
 *
 * `concept:skill:*`, `concept:interference:*`, and `concept:blend:*` tags are
 * exercise-design / word-structure descriptors, not GPC-derived; they are
 * exempt from lesson gating (see LESSON_GATING_EXEMPT_PREFIXES) and never
 * appear in this module's assignments.
 *
 * See: agent/devlog/2026-06-16-curriculum-sot-closeout.md (curriculum-sot
 * effort closeout; the full TODO/decision log was removed from the tree —
 * git history pre-eef52f9)
 */

import type { GPCEntry, GPCCategory } from './catalogue';
import { conceptTagsForEntry } from './concept-tags';
import {
  gpcExerciseTag,
  gpcIntroCardId,
  missingLettersCardId,
  sightWordIntroCardId,
  spellingCardId,
  splitDigraphIntroCardId,
  whoSaidThatCardId,
  whoSaidThatFocusGroupCardId,
} from './content-labelling';

// ---------------------------------------------------------------------------
// Lesson registry
// ---------------------------------------------------------------------------

export type LessonId =
  | 'hello-world'
  | 'bed'
  | 'digraphs'
  | 'split-digraphs'
  | 'sight-words'
  | 'final-open-vowels'
  | 'vowel-teams'
  | 'r-controlled'
  | 'l-controlled'
  | 'soft-consonants'
  | 'doubled-consonants'
  | 'silent-letters';

/**
 * - `active`: in the launch-facing slate; offered by next-lesson selection
 * - `deferred`: defined and gating content, but not yet offered
 * - `planned`: reserved id; no definition yet
 */
export type LessonStatus = 'active' | 'deferred' | 'planned';

export interface LessonEntry {
  id: LessonId;
  status: LessonStatus;
  /** Concept tags this lesson releases (the unit of lesson gating). */
  gatesConcepts: string[];
}

export const LESSON_REGISTRY: ReadonlyArray<LessonEntry> = [
  // hello-world also releases concept:vowel:short: short vowels are part of
  // the initial 26-letter slate and have never had a separate lesson.
  // (concept:match:simple additionally has a bootstrap exception app-side:
  // first-session content must flow before any lesson is passed.)
  { id: 'hello-world', status: 'active', gatesConcepts: ['concept:match:simple', 'concept:vowel:short'] },
  // A sub-lesson of hello-world (lesson 1a, not a new decoding idea): the
  // b/d "bed" mnemonic stands in front of b's intro card, which wants more
  // than the default intro. b stays a hello-world GPC; the lesson gates only
  // that one card (LESSON_GATED_CARDS), and b's exercises already wait on
  // the intro. Its tag is a gate stamp, not a concept (see concept-tags.ts).
  { id: 'bed', status: 'active', gatesConcepts: ['concept:lesson:bed'] },
  { id: 'digraphs', status: 'active', gatesConcepts: ['concept:match:digraph'] },
  { id: 'split-digraphs', status: 'active', gatesConcepts: ['concept:match:split_digraph'] },
  // Promoted 2026-09-29 as lesson 5 (after final-open-vowels):
  // agent/lessons-audit/b.3.sight-words-todo.md
  { id: 'sight-words', status: 'active', gatesConcepts: ['concept:match:whole_word'] },
  { id: 'final-open-vowels', status: 'active', gatesConcepts: ['concept:vowel:final_open'] },
  { id: 'vowel-teams', status: 'deferred', gatesConcepts: ['concept:vowel:teams'] },
  { id: 'r-controlled', status: 'deferred', gatesConcepts: ['concept:vowel:r_controlled'] },
  { id: 'l-controlled', status: 'deferred', gatesConcepts: ['concept:vowel:l_controlled'] },
  { id: 'soft-consonants', status: 'deferred', gatesConcepts: ['concept:consonant:soft'] },
  { id: 'doubled-consonants', status: 'deferred', gatesConcepts: ['concept:consonant:doubled'] },
  { id: 'silent-letters', status: 'deferred', gatesConcepts: ['concept:match:silent'] },
];

const LESSON_BY_ID: ReadonlyMap<LessonId, LessonEntry> = new Map(
  LESSON_REGISTRY.map((l) => [l.id, l]),
);

export function getLessonEntry(id: LessonId): LessonEntry | undefined {
  return LESSON_BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// Card gates: a lesson standing in front of particular cards
// ---------------------------------------------------------------------------

/**
 * Cards a lesson holds back by name, rather than through a GPC's concept
 * tag. generate-cards.ts stamps each listed card with the lesson's gated
 * tag (its first `gatesConcepts` entry), so everything that reads lesson
 * gating (LessonGateFilter, the curriculum sim, the audits) sees an
 * ordinary gated tag. The traceability checks accept these stamps.
 *
 * Use it to put a lesson in front of one GPC's intro card when the GPC
 * itself belongs to an earlier lesson: its exercises already wait on the
 * intro (`gpc:exercise:X` requires `gpc:intro:X`), so gating the intro is
 * enough. Pair it with POST_LESSON_SEED_CARDS so the intro follows the
 * lesson straight away.
 */
export const LESSON_GATED_CARDS: Partial<Record<LessonId, readonly string[]>> = {
  // b's intro waits for the bed lesson (the b/d mnemonic)
  bed: [gpcIntroCardId('GPC-b-B')],
};

/** The gate tags stamped on `cardId` by LESSON_GATED_CARDS (usually none). */
export function cardGateTags(cardId: string): string[] {
  const tags: string[] = [];
  for (const [lessonId, cardIds] of Object.entries(LESSON_GATED_CARDS)) {
    if (!cardIds?.includes(cardId)) continue;
    const tag = getLessonEntry(lessonId as LessonId)?.gatesConcepts[0];
    if (tag) tags.push(tag);
  }
  return tags;
}

/**
 * The lesson standing in front of a GPC's intro card, if a card gate puts
 * one there (bed for b). Display surfaces show the GPC under that lesson.
 */
export function introGatedBy(gpcId: string): LessonId | undefined {
  const introId = gpcIntroCardId(gpcId);
  for (const [lessonId, cardIds] of Object.entries(LESSON_GATED_CARDS)) {
    if (cardIds?.includes(introId)) return lessonId as LessonId;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Holding tag for unassigned (parked) GPCs
// ---------------------------------------------------------------------------

export const UNASSIGNED = 'unassigned' as const;
export const CONCEPT_UNASSIGNED = 'concept:unassigned' as const;

// ---------------------------------------------------------------------------
// Per-GPC lesson assignment
// ---------------------------------------------------------------------------

export interface GpcAssignment {
  unlockedBy: LessonId | typeof UNASSIGNED;
  /**
   * Effective concept tag override. When absent:
   *  - assigned GPCs use the mechanical category/matchType derivation
   *  - unassigned GPCs use CONCEPT_UNASSIGNED
   */
  conceptTag?: string;
  /**
   * Post-lesson fact (decision log D5): released by its lesson's concept tag
   * like any other member, but not a lesson exemplar — the GPC is
   * self-teaching once the lesson's idea is in place. Generators skip
   * intro / isolated-identification cards (DigraphGpcIntro, WST) for these.
   */
  postLessonFact?: true;
  /** Hand-curated example words, for progress reporters / admin surfaces. */
  examples?: string[];
}

/**
 * Category-default lesson assignment. Most assignments are category-uniform;
 * per-GPC exceptions live in GPC_OVERRIDES. A teaching-tier GPC whose
 * category has no default and which has no override is an audit error.
 */
export const CATEGORY_DEFAULT_LESSON: Partial<
  Record<GPCCategory, LessonId | typeof UNASSIGNED>
> = {
  consonants: 'hello-world',
  vowels_short: 'hello-world',
  digraphs: 'digraphs',
  // Trigraphs (igh, tch, dge) are parked: tch/dge are alternate spellings of
  // known sounds (future alt-spellings lesson); igh is a vowel pattern with a
  // candidate gh-family lesson. See decision log D3/D4.
  trigraphs: UNASSIGNED,
  // Syllabic consonants (le → /əl/: candle, little) formerly rode
  // concept:match:digraph via "structural similarity", but the final-stable-
  // syllable idea is not the digraph idea. Parked unassigned pending its own
  // home — e.g. a future "-le ending" lesson (decision log D7, confirmed).
  syllabic_consonants: UNASSIGNED,
  vowels_long_split: 'split-digraphs',
  sight_words: 'sight-words',
  vowels_final_open: 'final-open-vowels',
  vowels_teams: 'vowel-teams',
  vowels_diphthong_extended: 'vowel-teams',
  vowels_r_controlled: 'r-controlled',
  vowels_l_controlled: 'l-controlled',
  consonants_soft: 'soft-consonants',
  doubled_consonants: 'doubled-consonants',
  silent_patterns: 'silent-letters',
};

/**
 * Per-GPC overrides of the category default.
 *
 * The digraphs entries implement the blessed-slate restriction (decision log
 * D1–D5): the digraphs lesson teaches "two letters team up to make a NEW
 * sound", so its slate is the GPCs for which that idea is true. `ck` is
 * shared-sound teamwork (doubled-consonant idea); `wh` is a silent-h.
 * `nk` deliberately has NO override: it stays under the digraphs unlock as a
 * post-lesson fact (n→[ŋ] assimilation makes it self-teaching, and exiling
 * it would deadlock its expose→intro→exercise hierarchy chain).
 */
export const GPC_OVERRIDES: Record<string, GpcAssignment> = {
  'GPC-ck-K': {
    unlockedBy: 'doubled-consonants',
    conceptTag: 'concept:consonant:doubled',
    examples: ['duck', 'back', 'kick'],
  },
  'GPC-wh-W': {
    unlockedBy: 'silent-letters',
    conceptTag: 'concept:match:silent',
    examples: ['when', 'where', 'which'],
  },
  // The gu/sc analysis-digraphs (W1; c.1 s-Z/gu drill-down). Structurally
  // digraphs, but exiled from the digraphs lesson's "team makes a NEW sound"
  // idea. Two distinct fates, by whether a letter is actually quiet:
  //   • true silent (one does the talking, the other is quiet) → silent-letters
  //   • two-sound blend (both letters sound) → NOT silent; parked unassigned
  //     so they don't ride the digraphs category default (concept:match:digraph)
  //     and leak into rotation if content is ever filled.

  // gu→/g/ (guess, guy, guide): the u is quiet. Only variant with cards (10);
  // re-homing moves its borne tag off concept:match:digraph, closing the
  // digraphs-passed leak.
  'GPC-gu-G': {
    unlockedBy: 'silent-letters',
    conceptTag: 'concept:match:silent',
    examples: ['guess', 'guy', 'guide'],
  },
  // sc→/s/ (scent, science, scene): the c is quiet — a true silent pattern.
  // Zero cards today; classified here so future content lands in silent-letters.
  'GPC-sc-S': {
    unlockedBy: 'silent-letters',
    conceptTag: 'concept:match:silent',
    examples: ['scent', 'science', 'scene'],
  },
  // gu→/gw/ (language, penguin) and sc→/sk/ (scan, scar): both letters sound
  // (u→/w/; c→hard /k/, fully decodable) — NOT silent patterns. Parked so they
  // don't default to the digraphs lesson; real home TBD if ever carded.
  'GPC-gu-G_W': { unlockedBy: UNASSIGNED, examples: ['language', 'penguin'] },
  'GPC-sc-S_K': { unlockedBy: UNASSIGNED, examples: ['scan', 'scar', 'scope'] },

  // Blessed digraph slate — examples absorbed from the digraphs progress
  // reporter (formerly DIGRAPH_GPC_TAGS in digraphsReporter.ts).
  'GPC-th-TH': { unlockedBy: 'digraphs', examples: ['thin', 'think', 'bath'] },
  'GPC-th-DH': { unlockedBy: 'digraphs', examples: ['the', 'this', 'that'] },
  'GPC-sh-SH': { unlockedBy: 'digraphs', examples: ['ship', 'shop', 'fish'] },
  'GPC-ch-CH': { unlockedBy: 'digraphs', examples: ['chin', 'chip', 'much'] },
  'GPC-ng-NG': { unlockedBy: 'digraphs', examples: ['ring', 'song', 'king'] },
  'GPC-nk-NG_K': {
    unlockedBy: 'digraphs',
    postLessonFact: true, // n→[ŋ] assimilation before /k/ — self-teaching (D5)
    examples: ['think', 'bank', 'drink'],
  },
  'GPC-ph-F': { unlockedBy: 'digraphs', examples: ['phone', 'photo', 'graph'] },
  'GPC-qu-K_W': { unlockedBy: 'digraphs', examples: ['quit', 'queen', 'quick'] },

  // Parked trigraphs (category default is already UNASSIGNED; entries kept
  // explicit so the decision log is visible at the assignment site).
  'GPC-igh-AY': { unlockedBy: UNASSIGNED, examples: ['night', 'light', 'high'] },
  'GPC-tch-CH': { unlockedBy: UNASSIGNED, examples: ['catch', 'match', 'witch'] },
  'GPC-dge-JH': { unlockedBy: UNASSIGNED, examples: ['edge', 'bridge', 'fudge'] },

  // ---- final-open-vowels slate trim (decision log D9) --------------------
  // The category default (vowels_final_open → final-open-vowels) sweeps in all
  // eight final-position vowel GPCs, but the lesson's argument is narrower:
  // "the changed sound you know from sneaky-e words, made at the end of a word
  // with no e." That only runs for the three vowels whose final-position
  // phoneme is IDENTICAL to their split-digraph phoneme:
  //
  //   e-IY-final  ← e_e-IY   (he, we, be, she, me)
  //   i-AY-final  ← i_e-AY   (hi)
  //   o-OW-final  ← o_e-OW   (go, so, no, yo)
  //
  // The five below don't line up, so they're parked. Parking is a no-op today
  // (final-open-vowels is deferred, so its concept is unreleased either way) —
  // it matters at promotion, when lesson passage would otherwise release cards
  // the lesson never taught. y-AY-final is the live one: 12 exercise cards.
  'GPC-a-AH-final': { unlockedBy: UNASSIGNED, examples: ['comma'] }, // reduced/schwa, not a_e's EY
  'GPC-a-AE-final': { unlockedBy: UNASSIGNED, examples: ['extra'] }, // ditto, dialect-dependent
  'GPC-i-IY-final': { unlockedBy: UNASSIGNED, examples: ['ski'] }, // i→IY, not i_e's AY
  // y has no split-digraph referent at all (no y_e is ever taught, and y has
  // no short-vowel identity — it has only ever been consonant-y). A y beat
  // would smuggle a second idea ("y moonlights as a vowel") into a one-idea
  // lesson. Both belong to the prospective `standins` lesson (y stands in for
  // i, w for u, at word ends) — see D9. Parked until that id is reserved (W2).
  'GPC-y-AY-final': { unlockedBy: UNASSIGNED, examples: ['my', 'by', 'fly'] },
  'GPC-y-IY-final': { unlockedBy: UNASSIGNED, examples: ['happy', 'very'] },

  // ---- parked alternate-sound GPCs (c.1 s-Z drill-down) ------------------
  // "Naturally acquired" alternate pronunciations of an already-taught
  // grapheme. Their category default (vowels_short → hello-world) is
  // always-passed, so without an override their cards flow from day one —
  // exactly the premature-exposure bug the c.1 s-Z drill-down surfaced.
  // Parked (concept:unassigned, suppressed + drill-ineligible) until each
  // gets deliberate treatment:
  //   u-UH  — only 'puts' has a card; wants the s-Z-style primary-mastery
  //           ramp later (gate on exercise:u-AH + own exposure).
  //   a-AA  — /ɑ/ (father) is a genuinely distinct vowel value, not a voicing
  //           of short-a's /æ/, so it wants its own intro / vowel-alternation
  //           lesson rather than a primary-mastery ramp.
  'GPC-u-UH': { unlockedBy: UNASSIGNED, examples: ['puts', 'put'] },
  'GPC-a-AA': { unlockedBy: UNASSIGNED, examples: ['father', 'spa'] },
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedAssignment {
  gpcId: string;
  unlockedBy: LessonId | typeof UNASSIGNED;
  /** Effective concept tags for card generation. */
  conceptTags: string[];
  /** Post-lesson fact (D5): lesson-gated but not an exemplar; no intro/WST cards. */
  postLessonFact?: true;
  examples?: string[];
}

/**
 * Resolve a GPC's curriculum assignment: override, else category default.
 * Returns null when neither exists (caller decides whether that's an error —
 * for teaching-tier entries it is; analysis-tier entries are expected to
 * have no assignment).
 */
export function assignmentFor(entry: GPCEntry): ResolvedAssignment | null {
  const override = GPC_OVERRIDES[entry.id];
  const unlockedBy = override?.unlockedBy ?? CATEGORY_DEFAULT_LESSON[entry.category];
  if (unlockedBy === undefined) return null;

  let conceptTags: string[];
  if (override?.conceptTag) {
    conceptTags = [override.conceptTag];
  } else if (unlockedBy === UNASSIGNED) {
    conceptTags = [CONCEPT_UNASSIGNED];
  } else {
    conceptTags = conceptTagsForEntry(entry);
  }

  return {
    gpcId: entry.id,
    unlockedBy,
    conceptTags,
    postLessonFact: override?.postLessonFact,
    examples: override?.examples,
  };
}

/**
 * Concept-tag families that describe exercise design or word structure
 * (phonological-awareness skills, visual-interference pairings, consonant
 * blends) rather than GPC-derived curriculum concepts. Exempt from lesson
 * gating: they carry no "new idea" requiring a parent-guided lesson, and no
 * GPC is assigned to them.
 */
export const LESSON_GATING_EXEMPT_PREFIXES = [
  'concept:skill:',
  'concept:interference:',
  'concept:blend:',
] as const;

export function isLessonGatingExempt(tag: string): boolean {
  return LESSON_GATING_EXEMPT_PREFIXES.some((p) => tag.startsWith(p));
}

/**
 * All concept tags subject to lesson gating: every registry lesson's gated
 * concepts (active AND deferred — deferred content is suppressed, not open)
 * plus the unassigned holding tag. `concept:skill:*` tags are deliberately
 * not included.
 */
export function lessonGatedConceptTags(): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const lesson of LESSON_REGISTRY) {
    for (const tag of lesson.gatesConcepts) tags.add(tag);
  }
  tags.add(CONCEPT_UNASSIGNED);
  return tags;
}

/**
 * Effective concept tags for card generation: curriculum policy when the GPC
 * has an assignment, mechanical category/matchType derivation otherwise
 * (analysis-tier entries have no assignment by design).
 */
export function effectiveConceptTags(entry: GPCEntry): string[] {
  return assignmentFor(entry)?.conceptTags ?? conceptTagsForEntry(entry);
}

/**
 * GPC ids unlocked by a given lesson (override- and default-resolved),
 * filtered to a provided entry list (typically the teaching-tier catalogue).
 * Drives per-lesson progress reporter inventories.
 */
export function gpcIdsForLesson(
  lessonId: LessonId,
  entries: readonly GPCEntry[],
): ResolvedAssignment[] {
  const out: ResolvedAssignment[] = [];
  for (const entry of entries) {
    const a = assignmentFor(entry);
    if (a && a.unlockedBy === lessonId) out.push(a);
  }
  return out;
}

/**
 * Exercise tags of a lesson's members (`gpc:exercise:<short id>`), postLessonFacts
 * included: they are graded like any member. The domain of a mastery gate's
 * breadth rule.
 */
export function exerciseTagsForLesson(
  lessonId: LessonId,
  entries: readonly GPCEntry[],
): string[] {
  return gpcIdsForLesson(lessonId, entries).map((a) => gpcExerciseTag(a.gpcId));
}

/**
 * Graphemes of a lesson's intro-able members (postLessonFacts excluded —
 * they have no intro card and can never be recorded), lowercased.
 *
 * These are the values `recordGpcIntroComplete()` writes into
 * `LetterProgressionState.unlockedLetters` when a member's intro completes,
 * i.e. the evaluation domain for `LessonAvailabilityPolicy.minUnlockedFromLesson`.
 */
export function introGraphemesForLesson(
  lessonId: LessonId,
  entries: readonly GPCEntry[],
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    const a = assignmentFor(entry);
    if (a && a.unlockedBy === lessonId && !a.postLessonFact) {
      out.add(entry.grapheme.toLowerCase());
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Free tier — the entitlement boundary
// ---------------------------------------------------------------------------
//
// The entitlement model is a *reachable-word threshold*, not a lesson
// boundary: a family keeps everything already introduced forever, and the
// drip of NEW intros and lessons stops once the child can decode
// FREE_TIER_WORD_THRESHOLD words. Simulated over the curriculum's intro
// order (src/services/reachableWords/reachable-words.generated.json), the
// wall falls around GPC 26 of 46, with the digraphs still ahead.

/**
 * Lessons whose GPCs can be reached before the wall.
 *
 * Not a definition of what is free — the threshold is. These are simply the
 * only lessons a learner can get to before it fires, which is what bounds the
 * word table the runtime counter has to consider (1,953 of 5,627 rows).
 */
export const FREE_TIER_LESSONS: readonly LessonId[] = ['hello-world', 'bed', 'digraphs'];

/**
 * Reachable-word count at which the drip freezes for unpaid accounts.
 *
 * A decided product number, not a tuned one. It lands the wall around the
 * 22nd of the 34 free-slate graphemes, leaving p/k/j/y/z/q/x and the ch/qu/
 * ph/nk digraphs visibly unmet — legibly incomplete without being punitive.
 *
 * Landing-page copy and the live gate MUST both read this constant; a typed
 * number in copy is how the two silently diverge on the next retag.
 */
export const FREE_TIER_WORD_THRESHOLD = 1000;

/**
 * Free-slate graphemes → the released GPC ids each one carries.
 *
 * The runtime's "introduced" predicate is **grapheme-keyed**, because
 * `LetterProgressionState.unlockedLetters` is: `recordGpcIntroComplete()`
 * takes a grapheme, not a GPC id. Eight free-slate graphemes carry more than
 * one released id (`th` → th-TH + th-DH; `ch` → ch-CH + ch-K + ch-SH; also
 * s, x, a, e, o, ng), and unlocking the grapheme credits all of them.
 *
 * That over-credit is a deliberate, accepted approximation: `unlockedLetters`
 * holds no finer signal, and the alternative — per-GPC `gpc:intro:*` ELO tags
 * — lives in a different document. Revisit if it reads wrong in production.
 */
export function freeTierGraphemes(
  entries: readonly GPCEntry[],
): Map<string, string[]> {
  const free = new Set<string>(FREE_TIER_LESSONS);
  const byGrapheme = new Map<string, string[]>();
  for (const entry of entries) {
    const a = assignmentFor(entry);
    if (!a || !free.has(a.unlockedBy)) continue;
    const g = entry.grapheme.toLowerCase();
    const ids = byGrapheme.get(g);
    if (ids) ids.push(a.gpcId);
    else byGrapheme.set(g, [a.gpcId]);
  }
  return byGrapheme;
}

// ---------------------------------------------------------------------------
// Post-lesson seed cards ("lesson-is-the-intro" follow-through)
// ---------------------------------------------------------------------------

/**
 * Cards prescribed for the practice session immediately after a lesson is
 * passed. The app threads these through `getPostLessonHints()`
 * (src/services/lessons.ts) as `requireCards`: a session-durable hard
 * guarantee — pre-fetched, bypasses the filter chain, self-clears when drawn.
 *
 * ## Why this exists — the lesson-is-the-intro mechanism
 *
 * Most GPCs are introduced by a generated intro card, and their exercise
 * cards carry a `gpc:exercise:X requires gpc:intro:X` hierarchy prereq. But
 * only 4 of 16 categories have an intro-card generator; a GPC that never
 * gets an intro card is introduced by *the owning lesson itself* (or by
 * plain exposure — see INTRO_BLOCKLIST in generate-cards.ts). For those,
 * generate-strategy-configs.ts emits the exercise prereq against the GPC's
 * gated concept tag instead (minCount 1): unmet while the lesson is
 * unpassed, cleared by the learner's first completed card of the released
 * concept. (History: the unconditional intro prereq soft-suppressed 1341
 * cards across 79 GPCs — agent/lessons-audit/c.1.intro-prereq-deadlock.md.)
 *
 * The seed cards below are that first completed card, by construction:
 * lesson passage opens the concept gate, the requireCards surface at the
 * top of the next session, and completing the first one clears the
 * hierarchy leg for the lesson's whole slate. They also put one exercise
 * per taught GPC straight into the SRS loop — which matters because these
 * low-ELO cards may never be fetched by global-ELO retrieval for an
 * established learner (the retrieval gap the prescribed drill generator
 * exists to close; that generator only drills skills whose prereqs are
 * already met, so it cannot perform the first rep here).
 *
 * ## Authoring guidance for future promotions
 *
 * Prescribe ~1 short exercise card per GPC the lesson teaches, exercising
 * the new GPC directly (for MissingLetters cards, blank the new grapheme's
 * position). test-cards.ts asserts every id listed here exists in
 * generated-cards.json and carries a concept tag its lesson gates.
 */
export const POST_LESSON_SEED_CARDS: Partial<
  Record<LessonId, readonly string[]>
> = {
  // a_e intro card: letter-name knowledge of 'a' bridges directly to the
  // target phoneme /EY/, and 5 strong CVC/CVCe minimal pairs are available.
  // (split-digraph GPCs have real intro cards; the seed just front-loads one.)
  'split-digraphs': [splitDigraphIntroCardId('GPC-a_e-EY')],
  // One exercise per taught GPC (no intro cards exist for this slate — the
  // lesson demonstrates all three on stage).
  'final-open-vowels': [
    missingLettersCardId('go', 1), // g_  → gpc:exercise:o-OW-final
    missingLettersCardId('she', 2), // sh_ → gpc:exercise:e-IY-final
    spellingCardId('hi'), //          hi  → gpc:exercise:i-AY-final (+ h-HH)
  ],
  // The lesson's one exemplar, *was*: its intro card first, the rest of the
  // slate drips in after (the intro-sight-words prescribed group).
  'sight-words': [sightWordIntroCardId('GPC-WORD-was')],
  // b's intro (the card the lesson gated), then b's sound card and the b/d
  // mirror pair, straight into practice. The WSTs carry no gated tag: they
  // wait on b's intro through the GPC hierarchy, which the seed bypasses.
  bed: [
    gpcIntroCardId('GPC-b-B'),
    whoSaidThatCardId('GPC-b-B'),
    whoSaidThatFocusGroupCardId('mirror-bd', 'b'),
    whoSaidThatFocusGroupCardId('mirror-bd', 'd'),
  ],
};

// ---------------------------------------------------------------------------
// Threshold policies
// ---------------------------------------------------------------------------

export interface MasteryThreshold {
  tag: string;
  minCount?: number;
  minElo?: number;
}

export interface LessonAvailabilityPolicy {
  /** ELO/count mastery prerequisites (evaluated app-side against tag ELO). */
  masteryPrereqs?: MasteryThreshold[];
  /**
   * Breadth gate: distinct GPC-intro completions required
   * (LetterProgressionState.unlockedLetters.length). App-side only.
   */
  minUnlockedLetters?: number;
  /**
   * In-rotation breadth gate: at least `count` distinct GPCs from the named
   * lesson's slate must have their intro completed (i.e. be in rotation).
   * Evaluated app-side by intersecting the graphemes recorded in
   * `LetterProgressionState.unlockedLetters` with the lesson's intro-able
   * (non-postLessonFact) member graphemes. Guards against a prerequisite
   * lesson being *passed* (completed or dismissed) with zero actual
   * exposure to its content. App-side only; like the other breadth gates,
   * outside the mustMatch contract (which compares masteryPrereqs only).
   */
  minUnlockedFromLesson?: { lesson: LessonId; count: number };
  /** Practice sessions since last lesson passed. App-side only. */
  minSessionsSinceLastLesson?: number;
  /**
   * Withhold the lesson when the learner's tag ELO can't be read, instead of
   * skipping `masteryPrereqs` (the default, so a load race never hides a
   * lesson). For lessons whose copy depends on what the learner already
   * knows. App-side only.
   */
  failClosed?: true;
  /**
   * Mastery gate (agent/mastery-gating/a.1.plan.md). While the app's mastery
   * gating flag is on, a lesson with this block replaces `masteryPrereqs`,
   * `minUnlockedLetters`, `minUnlockedFromLesson` and
   * `minSessionsSinceLastLesson` with two questions:
   *   - breadth: has the learner met enough of what the lesson builds on?
   *   - settledness: are few enough of the GPCs they've met still insecure?
   * Insecure = unproven or shaky (framework tagSecurity over per-tag first
   * attempts). Fails closed: no ratings means not yet. Off, the block is
   * ignored. App-side only.
   */
  mastery?: MasteryGate;
}

/**
 * Breadth: at least `fraction` of a lesson's slate (its GPCs' exercise tags)
 * met, i.e. graded at least once. A fraction, not a count, so it keeps its
 * meaning when the slate gains or loses members.
 */
export interface BreadthRule {
  lesson: LessonId;
  fraction: number;
}

export interface MasteryGate {
  breadth: BreadthRule[];
  /** Most met letter-sound GPCs that may be insecure (unproven + shaky) when the lesson is offered. */
  maxInsecure: number;
  /** Spacer under the mastery gate (sessions since the last lesson passed). */
  minSessionsSinceLastLesson?: number;
}

/**
 * Settledness cap shared by the mastery gates: at most this many met
 * letter-sounds unproven or shaky (Colin, 2026-11-17). The gate stays off
 * until skill pressure exists to work debt down.
 */
export const MASTERY_MAX_INSECURE = 5;

export interface ConceptPolicy {
  /**
   * Pipeline soft-gating prerequisites → emitted into hierarchy-concept.json.
   * Cards tagged with this concept are penalized until these are met.
   */
  pipelinePrereqs?: MasteryThreshold[];
  /**
   * Lesson availability conditions → consumed by the app's lesson catalog
   * for the lesson that gates this concept. The pipeline ignores this.
   */
  lessonAvailability?: LessonAvailabilityPolicy;
  /**
   * Contract: when true, the audit asserts `lessonAvailability.masteryPrereqs`
   * equals `pipelinePrereqs`. When false, divergence is deliberate and must
   * be explained in a comment here.
   */
  mustMatch: boolean;
}

export const CONCEPT_POLICIES: Record<string, ConceptPolicy> = {
  'concept:vowel:short': {
    pipelinePrereqs: [
      { tag: 'concept:match:simple', minCount: 8, minElo: 1020 },
    ],
    // Released by hello-world, which has no availability conditions.
    mustMatch: false,
  },

  // The bed lesson's gate stamp (only b's intro card bears it). The lesson
  // leans on d and e being known ("two letters you already know"), and the
  // gate is d at a critical mass of use and exposure, plus e introduced:
  // e arrives well after d (13th single-letter intro to d's 9th), so a
  // d-only gate could open first. Fail-closed: not offered when tag ELO
  // can't be read. Counts tuned against the curriculum sim.
  'concept:lesson:bed': {
    pipelinePrereqs: [
      { tag: 'gpc:exercise:d-D', minCount: 3 },
      { tag: 'gpc:expose:d-D', minCount: 6 },
      { tag: 'gpc:intro:e-EH', minCount: 1 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'gpc:exercise:d-D', minCount: 3 },
        { tag: 'gpc:expose:d-D', minCount: 6 },
        { tag: 'gpc:intro:e-EH', minCount: 1 },
      ],
      minSessionsSinceLastLesson: 2,
      failClosed: true,
    },
    mustMatch: true,
  },

  'concept:match:digraph': {
    pipelinePrereqs: [
      { tag: 'concept:match:simple', minCount: 20, minElo: 1040 },
      { tag: 'concept:vowel:short', minCount: 10, minElo: 1030 },
    ],
    // DELIBERATE DIVERGENCE: the lesson uses a breadth gate (distinct
    // GPC-intro completions) instead of mirroring the pipeline's volume
    // thresholds, because tag counts increment per response — drilling 4-5
    // letters satisfied the volume gate too early. Breadth supersedes the
    // count dimension by construction; the ELO floors can lag for
    // low-accuracy learners (monitored — see TODO P6.4).
    lessonAvailability: {
      minUnlockedLetters: 13,
      minSessionsSinceLastLesson: 3,
      // Breadth ≈ today's 13 letters introduced.
      mastery: {
        breadth: [{ lesson: 'hello-world', fraction: 0.4 }],
        maxInsecure: MASTERY_MAX_INSECURE,
        minSessionsSinceLastLesson: 2,
      },
    },
    mustMatch: false,
  },

  'concept:match:split_digraph': {
    pipelinePrereqs: [
      { tag: 'concept:vowel:short', minCount: 15, minElo: 1070 },
      { tag: 'concept:match:simple', minCount: 25, minElo: 1050 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'concept:vowel:short', minCount: 15, minElo: 1070 },
        { tag: 'concept:match:simple', minCount: 25, minElo: 1050 },
      ],
      // In-rotation gate: the masteryPrereqs above reference *grandparent*
      // concepts only, so a letters-strong learner could be offered this
      // lesson with ZERO digraph exposure — the digraphs prerequisite is
      // satisfied by lesson *passage* (completed or dismissed), not by
      // content experience (observed on a prod user, 2026-07). Require a
      // few digraphs actually in rotation first. Breadth (distinct intros)
      // over volume, per the concept:match:digraph divergence note.
      // See: agent/lessons-audit/a.3.split-digraph-gating.md (removed; git history)
      minUnlockedFromLesson: { lesson: 'digraphs', count: 3 },
      minSessionsSinceLastLesson: 5,
      // Breadth ≈ today's 3 digraphs in rotation.
      mastery: {
        breadth: [{ lesson: 'digraphs', fraction: 0.25 }],
        maxInsecure: MASTERY_MAX_INSECURE,
        minSessionsSinceLastLesson: 2,
      },
    },
    // mustMatch compares masteryPrereqs only; the breadth gate is app-side
    // by construction and deliberately NOT mirrored in pipelinePrereqs.
    mustMatch: true,
  },

  'concept:match:whole_word': {
    pipelinePrereqs: [
      { tag: 'concept:match:simple', minCount: 15, minElo: 1030 },
      { tag: 'concept:vowel:short', minCount: 8 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'concept:match:simple', minCount: 15, minElo: 1030 },
        { tag: 'concept:vowel:short', minCount: 8 },
      ],
      minSessionsSinceLastLesson: 3,
      mastery: {
        breadth: [{ lesson: 'hello-world', fraction: 0.5 }],
        maxInsecure: MASTERY_MAX_INSECURE,
        minSessionsSinceLastLesson: 2,
      },
    },
    mustMatch: true,
  },

  'concept:vowel:final_open': {
    pipelinePrereqs: [
      { tag: 'concept:match:split_digraph', minCount: 5 },
    ],
    lessonAvailability: {
      masteryPrereqs: [{ tag: 'concept:match:split_digraph', minCount: 5 }],
      // In-rotation breadth gate (D10). Intent: "seen each of long-e / long-i
      // / long-o." Not directly expressible — the only set-membership
      // primitive is a count, not a set — and the masteryPrereqs above are
      // satisfiable by five a_e cards alone (no e_e/i_e/o_e exposure). Fudge:
      // require all five split-digraph intro graphemes in rotation. The
      // intro-grapheme set dedupes u_e's two GPCs to one grapheme, so count 5
      // IS all five members (a_e, e_e, i_e, o_e, u_e). Over-gates on a_e/u_e
      // (the lesson only leans on e/i/o); judged not hugely lossy. Same
      // app-side/breadth construction as the concept:match:split_digraph gate,
      // so deliberately NOT mirrored in pipelinePrereqs (outside mustMatch).
      minUnlockedFromLesson: { lesson: 'split-digraphs', count: 5 },
      minSessionsSinceLastLesson: 3,
      // Breadth ≈ today's all five split-digraph intros.
      mastery: {
        breadth: [{ lesson: 'split-digraphs', fraction: 0.8 }],
        maxInsecure: MASTERY_MAX_INSECURE,
        minSessionsSinceLastLesson: 2,
      },
    },
    // mustMatch compares masteryPrereqs only; the breadth gate is app-side by
    // construction and deliberately NOT mirrored in pipelinePrereqs.
    mustMatch: true,
  },

  'concept:vowel:teams': {
    pipelinePrereqs: [
      { tag: 'concept:match:split_digraph', minCount: 10, minElo: 1040 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'concept:match:split_digraph', minCount: 10, minElo: 1040 },
      ],
      minSessionsSinceLastLesson: 5,
    },
    mustMatch: true,
  },

  'concept:vowel:r_controlled': {
    pipelinePrereqs: [{ tag: 'concept:vowel:teams', minCount: 8 }],
    lessonAvailability: {
      masteryPrereqs: [{ tag: 'concept:vowel:teams', minCount: 8 }],
      minSessionsSinceLastLesson: 3,
    },
    mustMatch: true,
  },

  'concept:vowel:l_controlled': {
    pipelinePrereqs: [{ tag: 'concept:vowel:r_controlled', minCount: 5 }],
    lessonAvailability: {
      masteryPrereqs: [{ tag: 'concept:vowel:r_controlled', minCount: 5 }],
      minSessionsSinceLastLesson: 3,
    },
    mustMatch: true,
  },

  'concept:consonant:soft': {
    pipelinePrereqs: [
      { tag: 'concept:match:simple', minCount: 40, minElo: 1080 },
      { tag: 'concept:match:digraph', minCount: 15 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'concept:match:simple', minCount: 40, minElo: 1080 },
        { tag: 'concept:match:digraph', minCount: 15 },
      ],
      minSessionsSinceLastLesson: 3,
    },
    mustMatch: true,
  },

  'concept:consonant:doubled': {
    pipelinePrereqs: [
      { tag: 'concept:match:simple', minCount: 30, minElo: 1060 },
    ],
    lessonAvailability: {
      masteryPrereqs: [
        { tag: 'concept:match:simple', minCount: 30, minElo: 1060 },
      ],
      minSessionsSinceLastLesson: 3,
    },
    mustMatch: true,
  },

  'concept:match:silent': {
    pipelinePrereqs: [{ tag: 'concept:consonant:doubled', minCount: 5 }],
    lessonAvailability: {
      masteryPrereqs: [{ tag: 'concept:consonant:doubled', minCount: 5 }],
      minSessionsSinceLastLesson: 3,
    },
    mustMatch: true,
  },

  // Skill progression: pipeline-only (exercise-design concepts; exempt from
  // lesson gating, no lessonAvailability by construction).
  'concept:skill:final-phoneme-diff': {
    pipelinePrereqs: [
      { tag: 'concept:skill:first-phoneme-diff', minCount: 10, minElo: 1020 },
    ],
    mustMatch: false,
  },
  'concept:skill:medial-vowel-diff': {
    pipelinePrereqs: [
      { tag: 'concept:skill:first-phoneme-diff', minCount: 10, minElo: 1020 },
    ],
    mustMatch: false,
  },
};
