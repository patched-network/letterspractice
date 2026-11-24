/**
 * Concept phrasing — curriculum tag → parent-legible phrase
 * =========================================================
 *
 * Shared, pure translation layer turning the internal tag vocabulary
 * (`gpc:exercise:sh-SH`, `concept:vowel:short`, GPC short-ids like `i_e-AY`)
 * into phrases a parent reads ("the 'sh' sound", "short vowel sounds").
 *
 * Consumed by:
 *   - the lifecycle nudge email (cusp/learned/upcoming → body copy)
 *   - session-end SessionSummary (richer chip + coming-soon labels)
 *
 * Kept free of ELO/threshold logic and any data fetching — callers decide
 * *which* tags to phrase; this module only decides *how* to say them. That
 * keeps it reusable across the in-session and out-of-session surfaces.
 *
 * Honesty note: phrases are descriptive, never claim a
 * mastery level. "the 'sh' sound" says nothing about how well the child knows
 * it — the *bucketing* the caller does (learned vs cusp) carries that, hedged
 * in the surrounding copy.
 */

// ---------------------------------------------------------------------------
// Concept-tag → phrase (coarse layer)
// ---------------------------------------------------------------------------
// `concept:skill:*` (phonological-awareness exercise design) and
// `concept:unassigned` (holding tag) are deliberately omitted — not legible to
// a parent as "a thing my child learned to read".

export const CONCEPT_PHRASES: Record<string, string> = {
  'concept:match:simple': 'sounding out simple words',
  'concept:vowel:short': 'short vowel sounds',
  'concept:match:digraph': "letter teams like 'sh' and 'ch'",
  'concept:match:split_digraph': "the magic-e pattern (as in 'cake')",
  'concept:match:whole_word': 'tricky sight words',
  'concept:vowel:final_open': "open-vowel endings (as in 'go' and 'hi')",
  'concept:vowel:teams': "vowel teams (as in 'rain' and 'see')",
  'concept:vowel:r_controlled': "r-controlled vowels (as in 'car' and 'her')",
  'concept:vowel:l_controlled': "l-controlled vowels (as in 'ball')",
  'concept:consonant:soft': "the soft 'c' and 'g' sounds",
  'concept:consonant:doubled': "double-letter words (as in 'puff')",
  'concept:match:silent': 'silent letters',
};

export function conceptToPhrase(conceptTag: string): string | null {
  return CONCEPT_PHRASES[conceptTag] ?? null;
}

// ---------------------------------------------------------------------------
// GPC short-id → phrase (granular layer)
// ---------------------------------------------------------------------------
// Short-id form: "<grapheme>-<PHONEME>[-modifier]" (e.g. "sh-SH", "i_e-AY",
// "c-S-soft", "WORD-the"). Most are derived from the grapheme; overrides exist
// only where a bare "the 'x' sound" would mislead or a nicer phrase is available.

const GPC_PHRASE_OVERRIDES: Record<string, string> = {
  'th-TH': "the 'th' sound (as in 'thin')",
  'th-DH': "the 'th' sound (as in 'this')",
  'oo-UW': "the 'oo' sound (as in 'moon')",
  'oo-UH': "the 'oo' sound (as in 'book')",
  'ck-K': "the 'ck' spelling",
  'qu-K_W': "the 'qu' sound",
};

function deriveGpcPhrase(shortId: string): string | null {
  const parts = shortId.split('-');
  const grapheme = parts[0];
  const modifier = parts[2]; // 'soft' | 'final' | 'initial' | undefined
  if (!grapheme) return null;

  // Sight words: "WORD-the" → the word is parts[1].
  if (grapheme === 'WORD') {
    const word = parts[1];
    return word ? `the sight word "${word}"` : null;
  }

  // Soft c/g (context-dependent consonants).
  if (modifier === 'soft') return `the soft '${grapheme}' sound`;

  // Split digraph / magic-e — grapheme carries an underscore (e.g. "i_e").
  if (grapheme.includes('_')) {
    return `the magic-e pattern '${grapheme.replace(/_/g, '-')}'`;
  }

  // Doubled consonant — two identical letters spell one sound.
  if (grapheme.length === 2 && grapheme[0] === grapheme[1]) {
    return `double '${grapheme[0]}' (as in '${grapheme}')`;
  }

  // Single letters and undifferentiated digraphs/teams.
  return `the '${grapheme}' sound`;
}

/** Parent-legible phrase for a GPC short-id, or null if unphrasable. */
export function gpcShortIdToPhrase(shortId: string): string | null {
  return GPC_PHRASE_OVERRIDES[shortId] ?? deriveGpcPhrase(shortId);
}
