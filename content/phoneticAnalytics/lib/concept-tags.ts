/**
 * Concept Tag Derivation
 *
 * Maps GPC catalogue entries to concept tags based on their `category`
 * and `matchType` fields. These concept tags participate in the hierarchy
 * prerequisite system — e.g., a user must demonstrate competence with
 * `concept:match:simple` before `concept:match:digraph` cards unlock.
 *
 * This is the canonical home, importable by both the content pipeline
 * (scripts/) and the app (src/services/tags/conceptTags.ts re-exports this
 * module as a façade).
 *
 * Note: these mappings are the *default* derivation. Curriculum policy may
 * override a specific GPC's concept tag (see ./curriculum.ts) — callers that
 * care about the effective tag should consult the curriculum layer, not this
 * module directly.
 */

import type { GPCEntry, GPCCategory, MatchType } from './catalogue';

// ---------------------------------------------------------------------------
// Category → Concept mapping
// ---------------------------------------------------------------------------

/**
 * Maps GPC catalogue categories to their primary concept tag.
 *
 * Some categories share a concept (e.g. trigraphs subsume under digraph,
 * diphthong_extended subsumes under vowel teams) because the gating
 * prerequisites are the same — you need digraph competence to handle
 * trigraphs, and vowel-team competence to handle extended diphthongs.
 */
export const CATEGORY_TO_CONCEPT: Partial<Record<GPCCategory, string>> = {
  consonants: 'concept:match:simple',
  consonants_soft: 'concept:consonant:soft',
  digraphs: 'concept:match:digraph',
  trigraphs: 'concept:match:digraph', // subsumes trigraphs
  doubled_consonants: 'concept:consonant:doubled',
  silent_patterns: 'concept:match:silent',
  latinate_digraphs: 'concept:match:digraph', // sub-concept, same gating
  vowels_short: 'concept:vowel:short',
  vowels_long_split: 'concept:match:split_digraph',
  vowels_teams: 'concept:vowel:teams',
  vowels_r_controlled: 'concept:vowel:r_controlled',
  vowels_l_controlled: 'concept:vowel:l_controlled',
  vowels_final_open: 'concept:vowel:final_open',
  vowels_diphthong_extended: 'concept:vowel:teams', // subsumes under vowel teams
  syllabic_consonants: 'concept:match:digraph', // structural similarity
  sight_words: 'concept:match:whole_word',
};

// ---------------------------------------------------------------------------
// MatchType → Concept mapping (additional tags beyond category)
// ---------------------------------------------------------------------------

/**
 * Some match types carry additional concept semantics that should be
 * tagged independently of the category. For example, a split_digraph
 * vowel also needs the `concept:match:split_digraph` tag even though
 * its category is `vowels_long_split` (which already maps to it —
 * but having the matchType mapping ensures it's always present).
 */
export const MATCH_TYPE_CONCEPTS: Partial<Record<MatchType, string>> = {
  split_digraph: 'concept:match:split_digraph',
  context_before: 'concept:consonant:soft', // soft c/g use context_before
  position_final: 'concept:vowel:final_open', // final position vowels
  whole_word: 'concept:match:whole_word',
};

// ---------------------------------------------------------------------------
// Complete concept tag registry
// ---------------------------------------------------------------------------

/**
 * All valid concept tags in the system. This serves as:
 * - A validation reference for strategy config generation
 * - A type source for compile-time checking
 * - A documentation artifact
 */
export const CONCEPT_TAGS = [
  // Match-type concepts (how letters encode sounds)
  'concept:match:simple',
  'concept:match:digraph',
  'concept:match:split_digraph',
  'concept:match:silent',
  'concept:match:whole_word',

  // Vowel sub-concepts
  'concept:vowel:short',
  'concept:vowel:final_open',
  'concept:vowel:teams',
  'concept:vowel:r_controlled',
  'concept:vowel:l_controlled',

  // Consonant sub-concepts
  'concept:consonant:soft',
  'concept:consonant:doubled',

  // Lesson gate stamps: not concepts. A lesson's gated tag stamped onto
  // particular cards by name (curriculum.ts LESSON_GATED_CARDS), for a
  // lesson that stands in front of one card rather than a GPC family.
  'concept:lesson:bed',

  // Skill concepts (exercise-design-dependent, not derived from GPCEntry)
  'concept:skill:first-phoneme-diff',
  'concept:skill:final-phoneme-diff',
  'concept:skill:medial-vowel-diff',
  'concept:skill:blending',
  'concept:skill:segmenting',
] as const;

export type ConceptTag = (typeof CONCEPT_TAGS)[number];

/**
 * Set of all valid concept tags, for fast membership checks.
 */
export const CONCEPT_TAG_SET: ReadonlySet<ConceptTag> = new Set(CONCEPT_TAGS);

// ---------------------------------------------------------------------------
// Derivation function
// ---------------------------------------------------------------------------

/**
 * Derive concept tags for a GPC entry based on its `category` and `matchType`.
 *
 * This does NOT include skill concept tags (`concept:skill:*`) — those are
 * determined by exercise design, not by the GPC itself. See the app's
 * `questionTags.ts` for skill tag assignment.
 *
 * @param gpc  A GPC catalogue entry
 * @returns    Array of concept tag strings (may be empty for uncategorised entries)
 *
 * @example
 *   // Simple consonant
 *   conceptTagsForGpc({ category: 'consonants', matchType: 'simple', ... })
 *   // → ['concept:match:simple']
 *
 *   // Split digraph vowel
 *   conceptTagsForGpc({ category: 'vowels_long_split', matchType: 'split_digraph', ... })
 *   // → ['concept:match:split_digraph']
 *
 *   // Soft consonant (context_before match)
 *   conceptTagsForGpc({ category: 'consonants_soft', matchType: 'context_before', ... })
 *   // → ['concept:consonant:soft']
 */
export function conceptTagsForGpc(gpc: GPCEntry): string[] {
  return conceptTagsForFields(gpc.category, gpc.matchType);
}

/**
 * Alias used by pipeline generation scripts.
 */
export const conceptTagsForEntry = conceptTagsForGpc;

/**
 * Convenience overload: derive concept tags from category and matchType strings
 * without requiring a full GPCEntry object. Useful in contexts where only
 * these two fields are available.
 */
export function conceptTagsForFields(
  category: GPCCategory,
  matchType: MatchType,
): string[] {
  const tags: string[] = [];

  const categoryConcept = CATEGORY_TO_CONCEPT[category];
  if (categoryConcept) {
    tags.push(categoryConcept);
  }

  const matchConcept = MATCH_TYPE_CONCEPTS[matchType];
  if (matchConcept && !tags.includes(matchConcept)) {
    tags.push(matchConcept);
  }

  return tags;
}
