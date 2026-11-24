/**
 * GPC catalogue lookup helpers
 *
 * Catalogue-backed utilities shared by tag/content-labelling helpers.
 */

import {
  getDefaultCatalogueIndex,
  type GPCEntry,
} from '../../../content/phoneticAnalytics/lib/catalogue';

/**
 * Resolve a (grapheme, phoneme) pair to its GPC catalogue ID.
 *
 * The lookup tries, in order:
 *   1. Exact match on grapheme + phoneme
 *   2. If the grapheme appears with only one entry, return that sole entry
 *
 * @param grapheme  Written letters, e.g. "sh", "a_e", "the"
 * @param phoneme   ARPAbet phoneme string, e.g. "SH", "K S"
 * @returns         Catalogue ID like "GPC-sh-SH", or `null` if no match
 */
export function graphemeToGpcId(
  grapheme: string,
  phoneme: string,
): string | null {
  const index = getDefaultCatalogueIndex();
  const entries = index.byGrapheme.get(grapheme);
  if (!entries || entries.length === 0) return null;

  const normalisedPhoneme = phoneme.trim();

  for (const entry of entries) {
    if (entry.phoneme === normalisedPhoneme) {
      return entry.id;
    }
  }

  if (entries.length === 1) {
    return entries[0].id;
  }

  return null;
}

/**
 * Resolve a (grapheme, phoneme) pair only on an exact match — no sole-entry
 * fallback, so "n" sounding /ŋ/ in "think" is not passed off as GPC-n-N.
 */
export function exactGraphemeToGpcId(grapheme: string, phoneme: string): string | null {
  const entries = getDefaultCatalogueIndex().byGrapheme.get(grapheme) ?? [];
  const normalisedPhoneme = phoneme.trim();
  return entries.find((entry) => entry.phoneme === normalisedPhoneme)?.id ?? null;
}

/**
 * Look up a catalogue entry by its GPC id.
 */
export function getGpcEntry(catalogueId: string): GPCEntry | undefined {
  const index = getDefaultCatalogueIndex();
  return index.byId.get(catalogueId);
}

/**
 * The whole-word (sight-word) GPC for a word, if the catalogue has one —
 * e.g. "said" → "GPC-WORD-said". Graders use it to credit the sight word
 * itself even when no chunk carries its GPC ("have"'s silent e has none).
 */
export function sightWordGpcId(word: string): string | null {
  const index = getDefaultCatalogueIndex();
  const entries = index.byGrapheme.get(word.toLowerCase()) ?? [];
  return entries.find((entry) => entry.matchType === 'whole_word')?.id ?? null;
}
