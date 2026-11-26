/**
 * Match Type Implementations for Alignment Engine v2
 *
 * Each match type defines HOW a GPC attempts to match against text.
 * These are pure functions that determine if a GPC can match at a given position.
 *
 * @see alignment-v2.md for the full specification
 * @see catalogue-v2.ts for match type definitions
 */

import type {
    ContextAfterParams,
    ContextBeforeParams,
    GPCEntry,
    PositionParams,
    SplitDigraphParams
} from './catalogue';
import {
    isContextAfterParams,
    isContextBeforeParams,
    isSplitDigraphParams,
} from './catalogue';
import type { ArpabetPhoneme, MatchContext, MatchResult } from './types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Set of consonant letters for split digraph validation
 */
const CONSONANT_LETTERS = new Set([
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm',
  'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z',
]);

/**
 * Set of vowel letters
 */
const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u']);

// =============================================================================
// Simple Match
// =============================================================================

/**
 * Simple match: direct grapheme → phoneme mapping
 *
 * The most common type - just checks if the grapheme appears at the current position.
 *
 * @example
 * matchSimple("cat", 0, "c") => { consumedText: 1, consumedPhonemes: 1 }
 * matchSimple("cat", 0, "t") => null
 */
export function matchSimple(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string
): MatchResult | null {
  // Handle split digraph notation (e.g., "a_e" should not match via simple)
  if (grapheme.includes('_')) {
    return null;
  }

  if (word.startsWith(grapheme, pos)) {
    // Count phonemes: space-separated means multiple
    const phonemeCount = phoneme.trim() === '' ? 0 : phoneme.split(' ').length;

    return {
      consumedText: grapheme.length,
      consumedPhonemes: phonemeCount,
    };
  }

  return null;
}

// =============================================================================
// Digraph Match
// =============================================================================

/**
 * Digraph match: two-letter grapheme, same logic as simple
 *
 * Semantically identical to simple, but categorized separately for clarity.
 *
 * @example
 * matchDigraph("ship", 0, "sh") => { consumedText: 2, consumedPhonemes: 1 }
 * matchDigraph("ship", 1, "sh") => null
 */
export function matchDigraph(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string
): MatchResult | null {
  // Same logic as simple
  return matchSimple(word, pos, grapheme, phoneme);
}

// =============================================================================
// Trigraph Match
// =============================================================================

/**
 * Trigraph match: three-letter grapheme, same logic as simple
 *
 * @example
 * matchTrigraph("night", 1, "igh") => { consumedText: 3, consumedPhonemes: 1 }
 */
export function matchTrigraph(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string
): MatchResult | null {
  // Same logic as simple
  return matchSimple(word, pos, grapheme, phoneme);
}

// =============================================================================
// Split Digraph Match
// =============================================================================

/**
 * Split digraph match: vowel...e with consonant(s) between
 *
 * Handles "magic e" patterns like a_e (cake), i_e (bike), o_e (home).
 * The vowel at the current position produces the long vowel sound,
 * and the final 'e' is silent but governs the vowel's pronunciation.
 *
 * @example
 * matchSplitDigraph("cake", 1, "a_e", { splitAllows: "C" })
 *   => { consumedText: 1, consumedPhonemes: 1, marksEndSilent: true }
 *
 * matchSplitDigraph("taste", 1, "a_e", { splitAllows: "CC" })
 *   => { consumedText: 1, consumedPhonemes: 1, marksEndSilent: true }
 *
 * matchSplitDigraph("castle", 1, "a_e", { splitAllows: "CC" })
 *   => null (3 consonants, exceeds CC)
 */
export function matchSplitDigraph(
  word: string,
  pos: number,
  grapheme: string,
  params: SplitDigraphParams
): MatchResult | null {
  // Parse the split digraph notation
  const parts = grapheme.split('_');
  if (parts.length !== 2) {
    return null;
  }

  const [vowel, suffix] = parts;

  // Must start with the vowel at current position
  if (word[pos] !== vowel) {
    return null;
  }

  // Must end with the suffix (usually 'e')
  if (!word.endsWith(suffix)) {
    return null;
  }

  // Calculate middle section (between vowel and final-e)
  const middleStart = pos + 1;
  const middleEnd = word.length - suffix.length;

  if (middleEnd <= middleStart) {
    // No consonants between vowel and e (not a split digraph pattern)
    return null;
  }

  const middle = word.slice(middleStart, middleEnd);
  const consonantCount = middle.length;

  // Validate consonant count against params
  const maxAllowed =
    params.splitAllows === 'CCC' ? 3 :
    params.splitAllows === 'CC' ? 2 :
    1;

  if (consonantCount < 1 || consonantCount > maxAllowed) {
    return null;
  }

  // Verify middle is all consonants
  for (const char of middle) {
    if (!CONSONANT_LETTERS.has(char)) {
      return null;
    }
  }

  return {
    consumedText: 1, // Just the vowel position
    consumedPhonemes: 1,
    marksEndSilent: true, // Signal that final-e is consumed by this pattern
  };
}

// =============================================================================
// Context-Before Match
// =============================================================================

/**
 * Context-before match: depends on following character(s)
 *
 * Used for patterns like soft c (c → S before e, i, y) and soft g.
 *
 * @example
 * matchContextBefore("cent", 0, "c", { requireAfter: ["e", "i", "y"] })
 *   => { consumedText: 1, consumedPhonemes: 1 }
 *
 * matchContextBefore("cat", 0, "c", { requireAfter: ["e", "i", "y"] })
 *   => null (not followed by e, i, or y)
 */
export function matchContextBefore(
  word: string,
  pos: number,
  grapheme: string,
  params: ContextBeforeParams
): MatchResult | null {
  // Must start with the grapheme
  if (!word.startsWith(grapheme, pos)) {
    return null;
  }

  // Check what follows
  const nextCharPos = pos + grapheme.length;
  if (nextCharPos >= word.length) {
    // Nothing follows - can't satisfy context_before
    return null;
  }

  const nextChar = word[nextCharPos];
  if (!params.requireAfter.includes(nextChar)) {
    return null;
  }

  return {
    consumedText: grapheme.length,
    consumedPhonemes: 1,
  };
}

// =============================================================================
// Context-After Match
// =============================================================================

/**
 * Context-after match: depends on preceding character(s)
 *
 * Used for patterns that only apply after certain letters.
 *
 * @example
 * matchContextAfter("age", 1, "g", { requireBefore: ["a"] })
 *   => { consumedText: 1, consumedPhonemes: 1 }
 */
export function matchContextAfter(
  word: string,
  pos: number,
  grapheme: string,
  params: ContextAfterParams
): MatchResult | null {
  // Must start with the grapheme
  if (!word.startsWith(grapheme, pos)) {
    return null;
  }

  // Check what precedes
  if (pos === 0) {
    // Nothing precedes - can't satisfy context_after
    return null;
  }

  const prevChar = word[pos - 1];
  if (!params.requireBefore.includes(prevChar)) {
    return null;
  }

  return {
    consumedText: grapheme.length,
    consumedPhonemes: 1,
  };
}

// =============================================================================
// Position-Initial Match
// =============================================================================

/**
 * Position-initial match: only at word start
 *
 * Used for patterns like kn → N (knee, know).
 *
 * @example
 * matchPositionInitial("know", 0, "kn") => { consumedText: 2, consumedPhonemes: 1 }
 * matchPositionInitial("acknowledge", 2, "kn") => null (not at start)
 */
export function matchPositionInitial(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string,
  _params?: PositionParams
): MatchResult | null {
  // Must be at position 0
  if (pos !== 0) {
    return null;
  }

  if (!word.startsWith(grapheme)) {
    return null;
  }

  const phonemeCount = phoneme.trim() === '' ? 0 : phoneme.split(' ').length;

  return {
    consumedText: grapheme.length,
    consumedPhonemes: phonemeCount,
  };
}

// =============================================================================
// Position-Final Match
// =============================================================================

/**
 * Position-final match: only at word end
 *
 * Used for patterns like final-e → IY (me, we) or -le → AH L (bottle).
 *
 * @example
 * matchPositionFinal("me", 1, "e") => { consumedText: 1, consumedPhonemes: 1 }
 * matchPositionFinal("met", 1, "e") => null (not at end)
 */
export function matchPositionFinal(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string,
  _params?: PositionParams
): MatchResult | null {
  // Must be at the final position
  if (pos !== word.length - grapheme.length) {
    return null;
  }

  if (!word.endsWith(grapheme)) {
    return null;
  }

  const phonemeCount = phoneme.trim() === '' ? 0 : phoneme.split(' ').length;

  return {
    consumedText: grapheme.length,
    consumedPhonemes: phonemeCount,
  };
}

// =============================================================================
// Silent Match
// =============================================================================

/**
 * Silent match: grapheme produces fewer phonemes than expected
 *
 * Used for patterns like kn (k silent), gh (silent in "night").
 * The grapheme consumes text but produces the specified phoneme(s),
 * which may be empty or fewer than the number of letters.
 *
 * @example
 * matchSilent("knight", 0, "kn", "N") => { consumedText: 2, consumedPhonemes: 1 }
 * matchSilent("night", 2, "gh", "") => { consumedText: 2, consumedPhonemes: 0 }
 */
export function matchSilent(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string
): MatchResult | null {
  if (!word.startsWith(grapheme, pos)) {
    return null;
  }

  const phonemeCount = phoneme.trim() === '' ? 0 : phoneme.split(' ').length;

  return {
    consumedText: grapheme.length,
    consumedPhonemes: phonemeCount,
  };
}

// =============================================================================
// Whole Word Match (Sight Words)
// =============================================================================

/**
 * Whole word match: entire word must match exactly
 *
 * Used for high-frequency irregular sight words like "the", "one", "two".
 * Only matches if we're at position 0 AND the entire word equals the grapheme.
 *
 * @example
 * matchWholeWord("the", 0, "the", "DH AH") => { consumedText: 3, consumedPhonemes: 2 }
 * matchWholeWord("there", 0, "the", "DH AH") => null (word is "there", not "the")
 * matchWholeWord("the", 1, "the", "DH AH") => null (not at position 0)
 */
export function matchWholeWord(
  word: string,
  pos: number,
  grapheme: string,
  phoneme: string
): MatchResult | null {
  // Must be at position 0 (start of word)
  if (pos !== 0) {
    return null;
  }

  // The entire word must equal the grapheme
  if (word !== grapheme) {
    return null;
  }

  const phonemeCount = phoneme.trim() === '' ? 0 : phoneme.split(' ').length;

  return {
    consumedText: grapheme.length,
    consumedPhonemes: phonemeCount,
  };
}

// =============================================================================
// Unified Match Function
// =============================================================================

/**
 * Try to match a GPC at a position in a word
 *
 * This is the main entry point for matching. It dispatches to the appropriate
 * match function based on the GPC's matchType.
 *
 * @param gpc The GPC entry to try matching
 * @param word The complete word
 * @param pos Current position in the word
 * @param ctx Additional context (for alignment mode with phoneme oracle)
 * @returns MatchResult if successful, null otherwise
 */
export function tryMatch(
  gpc: GPCEntry,
  word: string,
  pos: number,
  _ctx?: MatchContext
): MatchResult | null {
  switch (gpc.matchType) {
    case 'simple':
      return matchSimple(word, pos, gpc.grapheme, gpc.phoneme);

    case 'digraph':
      return matchDigraph(word, pos, gpc.grapheme, gpc.phoneme);

    case 'trigraph':
      return matchTrigraph(word, pos, gpc.grapheme, gpc.phoneme);

    case 'split_digraph':
      if (!isSplitDigraphParams(gpc.matchParams)) {
        // Fallback to default split_digraph params
        return matchSplitDigraph(word, pos, gpc.grapheme, {
          splitAllows: 'CC',
        });
      }
      return matchSplitDigraph(word, pos, gpc.grapheme, gpc.matchParams);

    case 'context_before':
      if (!isContextBeforeParams(gpc.matchParams)) {
        return null;
      }
      return matchContextBefore(word, pos, gpc.grapheme, gpc.matchParams);

    case 'context_after':
      if (!isContextAfterParams(gpc.matchParams)) {
        return null;
      }
      return matchContextAfter(word, pos, gpc.grapheme, gpc.matchParams);

    case 'position_initial':
      return matchPositionInitial(
        word,
        pos,
        gpc.grapheme,
        gpc.phoneme,
        gpc.matchParams as PositionParams | undefined
      );

    case 'position_final':
      return matchPositionFinal(
        word,
        pos,
        gpc.grapheme,
        gpc.phoneme,
        gpc.matchParams as PositionParams | undefined
      );

    case 'silent':
      return matchSilent(word, pos, gpc.grapheme, gpc.phoneme);

    case 'whole_word':
      return matchWholeWord(word, pos, gpc.grapheme, gpc.phoneme);

    default:
      // Unknown match type
      return null;
  }
}

// =============================================================================
// Alignment-Mode Match (with phoneme oracle)
// =============================================================================

/**
 * Try to match a GPC at a position with phoneme validation
 *
 * In alignment mode, we have the correct phonemes and can verify
 * that the GPC produces the expected phoneme(s).
 *
 * @param gpc The GPC entry to try matching
 * @param word The complete word
 * @param pos Current position in the word
 * @param phonemes The expected phonemes (from CMUDict)
 * @param phonemeIdx Current index in the phoneme array
 * @returns MatchResult if successful, null otherwise
 */
export function tryMatchWithOracle(
  gpc: GPCEntry,
  word: string,
  pos: number,
  phonemes: ArpabetPhoneme[],
  phonemeIdx: number
): MatchResult | null {
  // First, try the basic match
  const result = tryMatch(gpc, word, pos);
  if (!result) {
    return null;
  }

  // Now verify phonemes match
  const gpcPhonemes = gpc.phoneme.trim() === '' ? [] : gpc.phoneme.split(' ');
  const expectedCount = gpcPhonemes.length;

  // Check if we have enough phonemes remaining
  if (phonemeIdx + expectedCount > phonemes.length) {
    return null;
  }

  // Verify each expected phoneme matches
  for (let i = 0; i < expectedCount; i++) {
    if (phonemes[phonemeIdx + i] !== gpcPhonemes[i]) {
      return null;
    }
  }

  return result;
}

// =============================================================================
// Split Digraph Detection
// =============================================================================

/**
 * Detect if a word contains a split digraph pattern
 *
 * This is a pre-processing step that identifies CVCe-style patterns.
 *
 * @param word The word to analyze
 * @param phonemes The phonemes (for validation)
 * @returns Split digraph info if detected, null otherwise
 */
export function detectSplitDigraph(
  word: string,
  _phonemes?: ArpabetPhoneme[]
): { vowel: string; vowelPos: number; endPos: number } | null {
  // Must end with 'e'
  if (!word.endsWith('e')) {
    return null;
  }

  // Must be at least 4 letters (C + V + C + e)
  if (word.length < 4) {
    return null;
  }

  const endPos = word.length - 1;

  // Find the last vowel before the final consonant(s) and 'e'
  let vowelPos = -1;
  let consonantsBetween = 0;

  // Scan backwards from just before the final 'e'
  for (let i = word.length - 2; i >= 0; i--) {
    const char = word[i];

    if (VOWEL_LETTERS.has(char)) {
      vowelPos = i;
      break;
    }

    if (CONSONANT_LETTERS.has(char)) {
      consonantsBetween++;
    } else {
      // Some other character, not a valid pattern
      return null;
    }
  }

  // Must have found a vowel and have 1-3 consonants between
  if (vowelPos === -1 || consonantsBetween < 1 || consonantsBetween > 3) {
    return null;
  }

  // The vowel must be one that participates in split digraphs
  const vowel = word[vowelPos];
  if (!['a', 'e', 'i', 'o', 'u'].includes(vowel)) {
    return null;
  }

  return {
    vowel,
    vowelPos,
    endPos,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a character is a consonant letter
 */
export function isConsonantLetter(char: string): boolean {
  return CONSONANT_LETTERS.has(char.toLowerCase());
}

/**
 * Check if a character is a vowel letter
 */
export function isVowelLetter(char: string): boolean {
  return VOWEL_LETTERS.has(char.toLowerCase());
}

/**
 * Get the word pattern (CVC, CVCC, etc.)
 */
export function getWordPattern(word: string): string {
  let pattern = '';
  for (const char of word.toLowerCase()) {
    if (VOWEL_LETTERS.has(char)) {
      pattern += 'V';
    } else if (CONSONANT_LETTERS.has(char)) {
      pattern += 'C';
    } else {
      pattern += '?';
    }
  }
  return pattern;
}

/**
 * Compress a word pattern by collapsing runs
 *
 * @example
 * compressPattern("CCVCC") => "CVC"
 * compressPattern("CVVC") => "CVC"
 */
export function compressPattern(pattern: string): string {
  let result = '';
  let lastChar = '';
  for (const char of pattern) {
    if (char !== lastChar) {
      result += char;
      lastChar = char;
    }
  }
  return result;
}
