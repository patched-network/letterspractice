/**
 * Per-Question-Type Tag Computation
 *
 * Each function computes the full set of navigation tags for a card of
 * a given question type. Tags are used by the pipeline's filters and
 * generators (hierarchy, interference, priority) to sequence content.
 */

import { gpcTag, graphemeToGpcId, getGpcEntry } from './gpcTags';
import { conceptTagsForGpc } from './conceptTags';
import { getPhonetics, findPhoneticDifference } from '../phonetics';
import { VOWEL_SET } from '../phonetics/arpabet';

// ---------------------------------------------------------------------------
// UI tag constants
// ---------------------------------------------------------------------------

export const UI_TAG_SPELLING = 'ui:spelling';
export const UI_TAG_WHO_SAID_THAT = 'ui:who-said-that';
export const UI_TAG_WORD_SELECTION = 'ui:word-selection';
export const UI_TAG_VIGNETTE = 'ui:vignette';

// ---------------------------------------------------------------------------
// Skill concept tag constants
// ---------------------------------------------------------------------------

const SKILL_BLENDING = 'concept:skill:blending';
const SKILL_SEGMENTING = 'concept:skill:segmenting';
const SKILL_FIRST_PHONEME_DIFF = 'concept:skill:first-phoneme-diff';
const SKILL_FINAL_PHONEME_DIFF = 'concept:skill:final-phoneme-diff';
const SKILL_MEDIAL_VOWEL_DIFF = 'concept:skill:medial-vowel-diff';

// ---------------------------------------------------------------------------
// SpellingQuestion
// ---------------------------------------------------------------------------

/**
 * Compute navigation tags for a SpellingQuestion card.
 *
 * A spelling question exercises ALL GPCs in the word — the learner must
 * segment the word into phonemes and produce the correct graphemes.
 *
 * Tags produced:
 * - `ui:spelling`
 * - `concept:skill:blending`, `concept:skill:segmenting`
 * - `gpc:exercise:{id}` for every GPC in the word
 * - Concept tags derived from each GPC's catalogue entry
 *
 * @param word  The target word (must exist in the phonetic index)
 * @returns     Array of tag strings, or `['ui:spelling']` as graceful fallback
 *
 * @example
 *   tagSpellingQuestion('ship')
 *   // → ['ui:spelling', 'concept:skill:blending', 'concept:skill:segmenting',
 *   //    'gpc:exercise:sh-SH', 'gpc:exercise:i-IH', 'gpc:exercise:p-P',
 *   //    'concept:match:digraph', 'concept:match:simple', 'concept:vowel:short']
 */
export function tagSpellingQuestion(word: string): string[] {
  const phonetics = getPhonetics(word);
  if (!phonetics) return [UI_TAG_SPELLING];

  const tags: string[] = [UI_TAG_SPELLING, SKILL_BLENDING, SKILL_SEGMENTING];
  const conceptSet = new Set<string>();

  for (const chunk of phonetics.chunks) {
    const grapheme = chunk.label ?? Object.values(chunk.letters).flat().join('');
    const phoneme = chunk.phoneme;

    const gpcId = graphemeToGpcId(grapheme, phoneme);
    if (!gpcId) continue;

    // All GPCs in a spelling question are exercised
    tags.push(gpcTag('exercise', gpcId));

    // Derive concept tags from the GPC catalogue entry
    const entry = getGpcEntry(gpcId);
    if (entry) {
      for (const ct of conceptTagsForGpc(entry)) {
        conceptSet.add(ct);
      }
    }
  }

  for (const ct of conceptSet) {
    tags.push(ct);
  }

  return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// WhoSaidThat
// ---------------------------------------------------------------------------

/**
 * Compute navigation tags for a WhoSaidThat card.
 *
 * A WhoSaidThat question exercises the TARGET GPC and provides exposure
 * to the DISTRACTOR GPCs. The learner hears a phoneme and selects the
 * correct grapheme from a set.
 *
 * Tags produced:
 * - `ui:who-said-that`
 * - `gpc:exercise:{targetId}` for the correct answer
 * - `gpc:expose:{distractorId}` for each fixed distractor
 * - Concept tags derived from the target GPC's catalogue entry
 *
 * Note on distractor tagging (per D4 in 03-action-plan.md):
 * - Fixed distractors listed on the card get expose tags (stored on card doc)
 * - Random distractors selected at runtime are NOT tagged on the card —
 *   they appear only in runtime `TaggedPerformance` on the sad path
 *
 * @param targetGpcId      Catalogue ID of the correct GPC (e.g. 'GPC-sh-SH')
 * @param distractorGpcIds Catalogue IDs of fixed distractor GPCs
 * @returns                Array of tag strings
 *
 * @example
 *   tagWhoSaidThat('GPC-sh-SH', ['GPC-s-S', 'GPC-ch-CH'])
 *   // → ['ui:who-said-that', 'gpc:exercise:sh-SH',
 *   //    'concept:match:digraph', 'gpc:expose:s-S', 'gpc:expose:ch-CH']
 */
export function tagWhoSaidThat(
  targetGpcId: string,
  distractorGpcIds: string[],
): string[] {
  const tags: string[] = [UI_TAG_WHO_SAID_THAT];

  // Target GPC is exercised
  tags.push(gpcTag('exercise', targetGpcId));

  const entry = getGpcEntry(targetGpcId);
  if (entry) {
    for (const ct of conceptTagsForGpc(entry)) {
      tags.push(ct);
    }
  }

  // Fixed distractors provide exposure
  for (const distractorId of distractorGpcIds) {
    tags.push(gpcTag('expose', distractorId));
  }

  return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// WordSelection
// ---------------------------------------------------------------------------

/**
 * Compute navigation tags for a WordSelection card.
 *
 * A word selection question presents the learner with a target word
 * (via audio) and a set of visually similar distractor words. The
 * GPCs at positions where target and distractors DIFFER are exercised;
 * GPCs at positions where they're the same get expose tags.
 *
 * Tags produced:
 * - `ui:word-selection`
 * - `gpc:exercise:{id}` for GPCs at distinguishing phoneme positions
 * - `gpc:expose:{id}` for GPCs at non-distinguishing positions
 * - `gpc:expose:{id}` for distractor-only GPCs
 * - Concept tags from the target word's GPCs
 * - Skill concept tags based on WHERE the difference occurs:
 *   - `concept:skill:first-phoneme-diff` if position 0 differs
 *   - `concept:skill:final-phoneme-diff` if last position differs
 *   - `concept:skill:medial-vowel-diff` if a medial vowel differs
 *
 * @param target       The correct word
 * @param distractors  Array of distractor words
 * @returns            Array of tag strings
 *
 * @example
 *   tagWordSelection('wish', ['fish', 'dish'])
 *   // → ['ui:word-selection', 'gpc:exercise:w-W', 'gpc:expose:i-IH',
 *   //    'gpc:expose:sh-SH', 'concept:match:simple', 'concept:match:digraph',
 *   //    'concept:vowel:short', 'concept:skill:first-phoneme-diff',
 *   //    'gpc:expose:f-F', 'gpc:expose:d-D']
 */
export function tagWordSelection(
  target: string,
  distractors: string[],
): string[] {
  const tags: string[] = [UI_TAG_WORD_SELECTION];

  const targetPhonetics = getPhonetics(target);
  if (!targetPhonetics) return tags;

  // Identify which phoneme positions distinguish target from distractors
  const distinguishingPositions = new Set<number>();
  for (const distractor of distractors) {
    const diff = findPhoneticDifference(target, distractor);
    if (diff !== null) {
      distinguishingPositions.add(diff);
    }
  }

  // Track exercise tags to avoid duplicating them as expose on distractors
  const exerciseTags = new Set<string>();
  const conceptSet = new Set<string>();

  // Map phoneme positions to GPC chunks in target word
  let phonemeIdx = 0;
  for (const chunk of targetPhonetics.chunks) {
    const grapheme = chunk.label ?? Object.values(chunk.letters).flat().join('');
    const phoneme = chunk.phoneme;

    const gpcId = graphemeToGpcId(grapheme, phoneme);
    if (!gpcId) {
      phonemeIdx++;
      continue;
    }

    const isDistinguishing = distinguishingPositions.has(phonemeIdx);

    if (isDistinguishing) {
      const tag = gpcTag('exercise', gpcId);
      tags.push(tag);
      exerciseTags.add(tag);
    } else {
      tags.push(gpcTag('expose', gpcId));
    }

    // Concept tags from all target GPCs
    const entry = getGpcEntry(gpcId);
    if (entry) {
      for (const ct of conceptTagsForGpc(entry)) {
        conceptSet.add(ct);
      }
    }

    phonemeIdx++;
  }

  // Add distractor-specific GPCs as expose tags
  for (const distractor of distractors) {
    const dPhonetics = getPhonetics(distractor);
    if (!dPhonetics) continue;

    for (const chunk of dPhonetics.chunks) {
      const grapheme =
        chunk.label ?? Object.values(chunk.letters).flat().join('');
      const phoneme = chunk.phoneme;

      const gpcId = graphemeToGpcId(grapheme, phoneme);
      if (!gpcId) continue;

      const exposeTag = gpcTag('expose', gpcId);
      // Don't add expose if this GPC is already an exercise tag
      if (!exerciseTags.has(gpcTag('exercise', gpcId))) {
        tags.push(exposeTag);
      }
    }
  }

  // Skill concept tags based on where the difference occurs
  if (distinguishingPositions.has(0)) {
    conceptSet.add(SKILL_FIRST_PHONEME_DIFF);
  }

  const maxPos = targetPhonetics.chunks.length - 1;
  if (maxPos >= 0 && distinguishingPositions.has(maxPos)) {
    conceptSet.add(SKILL_FINAL_PHONEME_DIFF);
  }

  for (const pos of distinguishingPositions) {
    if (pos > 0 && pos < maxPos) {
      // Check if the phoneme at this position is a vowel
      const chunk = targetPhonetics.chunks[pos];
      if (chunk && VOWEL_SET.has(chunk.phoneme as any)) {
        conceptSet.add(SKILL_MEDIAL_VOWEL_DIFF);
      }
    }
  }

  for (const ct of conceptSet) {
    tags.push(ct);
  }

  return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// Vignette (future — stub for completeness)
// ---------------------------------------------------------------------------

/**
 * Compute navigation tags for a Vignette (introductory animation/story).
 *
 * Vignettes introduce GPCs — they use `gpc:intro:*` tags rather than
 * exercise or expose. This is a stub for future implementation.
 *
 * @param targetGpcIds  Catalogue IDs of the GPCs being introduced
 * @returns             Array of tag strings
 */
export function tagVignette(targetGpcIds: string[]): string[] {
  const tags: string[] = [UI_TAG_VIGNETTE];

  for (const gpcId of targetGpcIds) {
    tags.push(gpcTag('intro', gpcId));

    const entry = getGpcEntry(gpcId);
    if (entry) {
      for (const ct of conceptTagsForGpc(entry)) {
        if (!tags.includes(ct)) {
          tags.push(ct);
        }
      }
    }
  }

  return tags;
}
