/*
TODO: address decoder deficiencies

The following were 'uncovered' given existing catalogue, but seem like they should work.

To investigate

┌───────────┬────────────────────────────────────┬─────────────────────────────────────────┐
│   Word    │               Issue                │              Potential Fix              │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ going     │ g+o+i+ng fails                     │ Open syllable "o" → /OW/ not matching   │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ over      │ o+v+er fails                       │ Same - open syllable issue              │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ okay      │ o+kay                              │ Same pattern                            │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ really    │ r+ea+ll+y                          │ Should decode - may be an ea→/IY/ issue │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ something │ s+o+m+e+th+i+ng                    │ "o" → /AH/ needs context or sight word  │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ yeah      │ ya+eah?                            │ Could add GPC-eah-EH or GPC-yeah-Y_EH   │
├───────────┼────────────────────────────────────┼─────────────────────────────────────────┤
│ our       │ our → /AW R/                       │ Already in catalogue but marked unused? │
└───────────┴────────────────────────────────────┴─────────────────────────────────────────┘
Key gaps to investigate:
1. nk digraph - high value, covers think, thank, bank, drink, etc.
2. Open syllable vowels - systematic issue with V.CV patterns where first vowel is long
3. our GPC - why is GPC-our-AW_R showing as unused when our is uncovered?

*/

/**
 * Decode Engin
 *
 * Predicts pronunciation from spelling WITHOUT knowing the correct phonemes.
 * This simulates what a learner would produce when reading a word.
 *
 * Key differences from alignment:
 * - No phoneme oracle - must predict based on GPCs alone
 * - Ambiguity tracking - multiple GPCs may apply at each position
 * - Confidence scoring - uncertainty when multiple interpretations exist
 *
 * @see alignment.md for the full specification
 * @see catalogue.ts for GPC definitions
 * @see match-types.ts for match implementations
 */

import type {
    GPCCatalogueIndex,
    GPCEntry
} from './catalogue';
import {
    buildCatalogueIndex,
    filterByTag,
    getDefaultCatalogueIndex,
    GPC_CATALOGUE,
    parsePhonemeSpec,
} from './catalogue';
import {
    detectSplitDigraph,
    tryMatch
} from './match-types';
import type { ArpabetPhoneme, DecodeConfig, DecodeResult, DecodeSegment } from './types';

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default decode configuration
 */
export const DEFAULT_DECODE_CONFIG: Required<DecodeConfig> = {
  generateAlternatives: false,
  maxAlternatives: 5,
  handleSplitDigraphs: true,
  catalogueTag: undefined as unknown as string,
};

// =============================================================================
// Core Decode Function
// =============================================================================

/**
 * Decode a word to predict its pronunciation using GPCs
 *
 * @param word The word to decode
 * @param index Optional catalogue index (uses default if not provided)
 * @param config Optional configuration
 * @returns DecodeResult with predicted phonemes and confidence
 *
 * @example
 * const result = decodeWord('cat');
 * // result.predictedPhonemes === ['K', 'AE', 'T']
 * // result.unambiguous === true
 *
 * const ambiguous = decodeWord('read');
 * // ambiguous.unambiguous === false
 * // ambiguous.ambiguousSegments.length > 0
 */
export function decodeWord(
  word: string,
  index?: GPCCatalogueIndex,
  config?: Partial<DecodeConfig>
): DecodeResult {
  const cfg = { ...DEFAULT_DECODE_CONFIG, ...config };
  const catalogueIndex = index ?? getDefaultCatalogueIndex();

  // Normalize word
  const normalizedWord = word.toLowerCase();

  // Pre-detect split digraph pattern
  const splitInfo = cfg.handleSplitDigraphs
    ? detectSplitDigraph(normalizedWord)
    : null;

  // Initialize result
  const segments: DecodeSegment[] = [];
  const predictedPhonemes: string[] = [];
  const ambiguousSegments: DecodeSegment[] = [];
  const allAlternatives: string[][] = [];

  let textPos = 0;

  // Track if final-e is reserved by split digraph
  let finalEReserved = splitInfo !== null;
  let pendingSplitGpcId: string | null = null;

  // Main decode loop
  while (textPos < normalizedWord.length) {
    // Check if we're at the reserved final-e
    if (
      finalEReserved &&
      textPos === normalizedWord.length - 1 &&
      normalizedWord[textPos] === 'e'
    ) {
      // Silent final-e from split digraph
      segments.push({
        grapheme: 'e',
        phoneme: '',
        gpcId: pendingSplitGpcId || 'GPC-e-silent-split',
        startPos: textPos,
        endPos: textPos + 1,
        ambiguous: false,
        confidence: 1.0,
      });
      textPos++;
      continue;
    }

    // Find all GPCs that could match at this position
    const candidates = findDecodeCandidates(
      catalogueIndex,
      normalizedWord,
      textPos,
      splitInfo,
      cfg
    );

    if (candidates.length === 0) {
      // Unknown grapheme
      const unknownChar = normalizedWord[textPos];
      segments.push({
        grapheme: unknownChar,
        phoneme: '?',
        gpcId: null,
        startPos: textPos,
        endPos: textPos + 1,
        ambiguous: false,
        confidence: 0,
      });
      predictedPhonemes.push('?');
      textPos++;
      continue;
    }

    // Sort candidates by priority
    // 1. First, use explicit priority if set (higher = better)
    // 2. Then prefer longer graphemes
    // 3. Then prefer more specific match types
    candidates.sort((a, b) => {
      // Use explicit priority first (if both have it)
      const prioA = a.gpc.priority ?? 0;
      const prioB = b.gpc.priority ?? 0;
      if (prioA !== prioB) {
        return prioB - prioA; // Higher priority wins
      }

      // If neither has explicit priority, prefer longer graphemes
      // But if one has high priority (e.g., teaching vowels at 50),
      // that already won above
      const lenDiff = b.gpc.grapheme.length - a.gpc.grapheme.length;
      if (lenDiff !== 0) return lenDiff;

      // Prefer more specific match types
      const typePriority = (mt: string) => {
        switch (mt) {
          case 'whole_word':
            return 20; // Sight words take precedence over everything
          case 'split_digraph':
            return 10;
          case 'context_before':
          case 'context_after':
            return 8;
          case 'position_initial':
          case 'position_final':
            return 6;
          case 'silent':
            return 5;
          case 'trigraph':
            return 4;
          case 'digraph':
            return 3;
          case 'simple':
            return 1;
          default:
            return 0;
        }
      };
      return typePriority(b.gpc.matchType) - typePriority(a.gpc.matchType);
    });

    // Use the best candidate
    const best = candidates[0];
    const { gpc, result } = best;

    // Determine grapheme text
    // For split digraphs, we previously overrode this to show the pattern (e.g. "a_e")
    // but for UI/reconstruction purposes, we want the actual text (e.g. "a").
    const grapheme = normalizedWord.slice(textPos, textPos + result.consumedText);

    // Check for ambiguity (multiple different phonemes possible)
    const uniquePhonemes = new Set(candidates.map((c) => c.gpc.phoneme));
    const isAmbiguous = uniquePhonemes.size > 1;

    // Calculate confidence based on number of alternatives
    const confidence = isAmbiguous ? 1.0 / uniquePhonemes.size : 1.0;

    // Create segment
    const segment: DecodeSegment = {
      grapheme,
      phoneme: gpc.phoneme,
      gpcId: gpc.id,
      startPos: textPos,
      endPos: textPos + result.consumedText,
      ambiguous: isAmbiguous,
      confidence,
    };

    // Track alternatives if ambiguous
    if (isAmbiguous) {
      segment.competitors = candidates.slice(1).map((c) => c.gpc.id);
      segment.alternativePhonemes = candidates
        .slice(1)
        .map((c) => c.gpc.phoneme)
        .filter((p, i, arr) => arr.indexOf(p) === i); // Unique phonemes only

      ambiguousSegments.push(segment);
    }

    segments.push(segment);

    // Add predicted phonemes
    const phonemeParts = parsePhonemeSpec(gpc.phoneme);
    for (const p of phonemeParts) {
      predictedPhonemes.push(p);
    }

    // Track alternatives for alternative pronunciation generation
    if (cfg.generateAlternatives && isAmbiguous) {
      allAlternatives.push(
        candidates.map((c) => c.gpc.phoneme).filter((p, i, arr) => arr.indexOf(p) === i)
      );
    }

    textPos += result.consumedText;

    // Mark final-e as reserved if split digraph matched
    if (result.marksEndSilent) {
      finalEReserved = true;
      // Store the GPC ID to assign to the silent 'e' later
      // We attach it to the loop scope via a closure variable or similar mechanism? 
      // Actually, we can just store it in a variable defined outside the loop if we were guaranteed strictly one split digraph at a time.
      // Since English words generally don't nest split digraphs in overlapping ways that we detect (we scan left-to-right), 
      // and 'detectSplitDigraph' returns the *last* valid one relative to the end...
      // Wait, 'detectSplitDigraph' is global for the word. It returns ONE split info object.
      // So we can store the GPC ID in a variable scoped to the function, 'pendingSplitGpcId'.
      pendingSplitGpcId = gpc.id;
    }
  }

  // Calculate overall confidence
  const confidences = segments.map((s) => s.confidence);
  const overallConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a * b, 1)
      : 0;

  // Check for unknown graphemes
  const unknownCount = segments.filter((s) => s.gpcId === null).length;
  const fullyCovered = unknownCount === 0;
  const unambiguous = ambiguousSegments.length === 0 && fullyCovered;

  // Generate alternative pronunciations if requested
  let alternativePronunciations: string[][] | undefined;
  if (cfg.generateAlternatives && allAlternatives.length > 0) {
    alternativePronunciations = generateAlternatives(
      segments,
      allAlternatives,
      cfg.maxAlternatives
    );
  }

  return {
    word,
    predictedPhonemes,
    segments,
    unambiguous,
    confidence: overallConfidence,
    fullyCovered,
    unknownCount,
    alternativePronunciations,
    ambiguousSegments,
  };
}

// =============================================================================
// Candidate Finding
// =============================================================================

interface DecodeCandidate {
  gpc: GPCEntry;
  result: { consumedText: number; consumedPhonemes: number; marksEndSilent?: boolean };
}

/**
 * Find all GPCs that could match at the current position (decode mode)
 */
function findDecodeCandidates(
  index: GPCCatalogueIndex,
  word: string,
  pos: number,
  splitInfo: ReturnType<typeof detectSplitDigraph>,
  config: Required<DecodeConfig>
): DecodeCandidate[] {
  const candidates: DecodeCandidate[] = [];
  const seenGraphemePhoneme = new Set<string>();

  for (const gpc of index.byPriority) {
    // Skip if filtered by tag
    if (config.catalogueTag && !gpc.tags?.includes(config.catalogueTag)) {
      continue;
    }

    // Special handling for split digraphs
    if (gpc.matchType === 'split_digraph' && splitInfo) {
      if (pos === splitInfo.vowelPos) {
        const result = tryMatch(gpc, word, pos);
        if (result) {
          const key = `${gpc.grapheme}:${gpc.phoneme}`;
          if (!seenGraphemePhoneme.has(key)) {
            seenGraphemePhoneme.add(key);
            candidates.push({ gpc, result });
          }
        }
      }
      continue;
    }

    // Try the match (no oracle)
    const result = tryMatch(gpc, word, pos);
    if (result) {
      // Deduplicate by grapheme+phoneme combination
      const key = `${gpc.grapheme}:${gpc.phoneme}`;
      if (!seenGraphemePhoneme.has(key)) {
        seenGraphemePhoneme.add(key);
        candidates.push({ gpc, result });
      }
    }
  }

  return candidates;
}

// =============================================================================
// Alternative Generation
// =============================================================================

/**
 * Generate alternative pronunciations from ambiguous segments
 */
function generateAlternatives(
  segments: DecodeSegment[],
  ambiguities: string[][],
  maxAlternatives: number
): string[][] {
  if (ambiguities.length === 0) {
    return [];
  }

  // Get base pronunciation
  const base = segments.map((s) => s.phoneme);

  // Find positions of ambiguous segments
  const ambiguousPositions: number[] = [];
  let altIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].ambiguous) {
      ambiguousPositions.push(i);
      altIdx++;
    }
  }

  // Generate combinations (limited to maxAlternatives)
  const alternatives: string[][] = [];

  // Simple approach: for each ambiguous position, generate an alternative
  // with that position using a different phoneme
  for (let i = 0; i < ambiguousPositions.length && alternatives.length < maxAlternatives; i++) {
    const pos = ambiguousPositions[i];
    const alts = ambiguities[i];

    for (let j = 1; j < alts.length && alternatives.length < maxAlternatives; j++) {
      const alt = [...base];
      alt[pos] = alts[j];
      alternatives.push(alt);
    }
  }

  return alternatives;
}

// =============================================================================
// Batch Decode
// =============================================================================

/**
 * Result of batch decode
 */
export interface BatchDecodeResult {
  /** Total words processed */
  total: number;

  /** Words with unambiguous decode */
  unambiguous: number;

  /** Words with ambiguous decode */
  ambiguous: number;

  /** Words with unknown graphemes */
  withUnknown: number;

  /** Unambiguous rate */
  unambiguousRate: number;

  /** Average confidence */
  averageConfidence: number;

  /** Individual results (if requested) */
  results?: DecodeResult[];
}

/**
 * Decode multiple words in batch
 */
export function decodeBatch(
  words: string[],
  index?: GPCCatalogueIndex,
  config?: Partial<DecodeConfig>,
  includeResults = false
): BatchDecodeResult {
  const catalogueIndex = index ?? getDefaultCatalogueIndex();
  const results: DecodeResult[] = [];

  let unambiguous = 0;
  let ambiguous = 0;
  let withUnknown = 0;
  let totalConfidence = 0;

  for (const word of words) {
    const result = decodeWord(word, catalogueIndex, config);

    if (includeResults) {
      results.push(result);
    }

    if (result.unambiguous) {
      unambiguous++;
    } else {
      ambiguous++;
    }

    if (result.unknownCount > 0) {
      withUnknown++;
    }

    totalConfidence += result.confidence;
  }

  return {
    total: words.length,
    unambiguous,
    ambiguous,
    withUnknown,
    unambiguousRate: words.length > 0 ? unambiguous / words.length : 0,
    averageConfidence: words.length > 0 ? totalConfidence / words.length : 0,
    results: includeResults ? results : undefined,
  };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a decode result against known pronunciation
 *
 * @param decodeResult The decode result to validate
 * @param actualPhonemes The known correct pronunciation
 * @returns Whether the decode matches the actual pronunciation
 */
export function validateDecode(
  decodeResult: DecodeResult,
  actualPhonemes: ArpabetPhoneme[]
): boolean {
  if (decodeResult.predictedPhonemes.length !== actualPhonemes.length) {
    return false;
  }

  for (let i = 0; i < actualPhonemes.length; i++) {
    if (decodeResult.predictedPhonemes[i] !== actualPhonemes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validate decode with alternative pronunciations considered
 */
export function validateDecodeWithAlternatives(
  decodeResult: DecodeResult,
  actualPhonemes: ArpabetPhoneme[]
): { correct: boolean; matchedAlternative: number | null } {
  // Check primary prediction
  if (validateDecode(decodeResult, actualPhonemes)) {
    return { correct: true, matchedAlternative: null };
  }

  // Check alternatives
  if (decodeResult.alternativePronunciations) {
    for (let i = 0; i < decodeResult.alternativePronunciations.length; i++) {
      const alt = decodeResult.alternativePronunciations[i];
      if (alt.length === actualPhonemes.length) {
        let matches = true;
        for (let j = 0; j < actualPhonemes.length; j++) {
          if (alt[j] !== actualPhonemes[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return { correct: true, matchedAlternative: i };
        }
      }
    }
  }

  return { correct: false, matchedAlternative: null };
}

/**
 * Check if a word CAN be decoded to produce the expected phonemes.
 *
 * Unlike greedy decode, this explores ALL possible segmentation paths
 * and returns true if ANY path produces the expected phonemes.
 *
 * This is used for coverage calculation where we know the target phonemes
 * and want to check "is this word decodable with these GPCs?" rather than
 * "what does the greedy decoder produce?"
 *
 * @param word The word to decode
 * @param expectedPhonemes The expected pronunciation
 * @param index The GPC catalogue index (known GPCs)
 * @returns true if any valid decode path produces the expected phonemes
 */
export function canDecodeToPhonemes(
  word: string,
  expectedPhonemes: ArpabetPhoneme[],
  index: GPCCatalogueIndex
): boolean {
  const normalizedWord = word.toLowerCase();

  // Pre-detect split digraph pattern
  const splitInfo = detectSplitDigraph(normalizedWord);

  // Recursive search with pruning
  function search(textPos: number, phonemeIdx: number): boolean {
    // Success: consumed entire word AND all expected phonemes
    if (textPos === normalizedWord.length) {
      return phonemeIdx === expectedPhonemes.length;
    }

    // Fail early: word remains but phonemes exhausted
    if (phonemeIdx > expectedPhonemes.length) {
      return false;
    }

    // Handle silent final-e from split digraph
    if (
      splitInfo &&
      textPos === normalizedWord.length - 1 &&
      normalizedWord[textPos] === 'e'
    ) {
      // Silent e consumes no phonemes
      return search(textPos + 1, phonemeIdx);
    }

    // Find ALL GPCs that could match at this position
    const candidates = findAllCandidatesAt(normalizedWord, textPos, splitInfo, index);

    for (const candidate of candidates) {
      const gpcPhonemes = candidate.gpc.phoneme.split(' ').filter(p => p);

      // Handle silent patterns (empty phoneme)
      if (gpcPhonemes.length === 0) {
        if (search(textPos + candidate.consumedText, phonemeIdx)) {
          return true;
        }
        continue;
      }

      // Check if we have enough expected phonemes remaining
      if (phonemeIdx + gpcPhonemes.length > expectedPhonemes.length) {
        continue; // Can't match, skip this candidate
      }

      // Early prune: do these phonemes match expected at this position?
      let matches = true;
      for (let i = 0; i < gpcPhonemes.length; i++) {
        if (gpcPhonemes[i] !== expectedPhonemes[phonemeIdx + i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // Recurse: try this path
        if (search(textPos + candidate.consumedText, phonemeIdx + gpcPhonemes.length)) {
          return true; // Found a valid path!
        }
      }
    }

    return false; // No path worked from this state
  }

  return search(0, 0);
}

/** One GPC in a {@link decodePathsToPhonemes} path. */
export interface DecodePathStep {
  /** Catalogue id, e.g. "GPC-c-K". */
  gpcId: string;
  grapheme: string;
  /** Letter indices it spells; a split digraph's are [vowel, final e]. */
  letters: number[];
  /** Empty for a silent pattern. */
  phonemes: string[];
}

/** Paths beyond this are dropped; short words never get near it. */
const MAX_DECODE_PATHS = 64;

const ARPABET_VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

/**
 * Every way of reading `word` as exactly `expectedPhonemes`, step by step.
 * The spelling grader uses it to ask whether a misspelling reads back as the
 * target word, and which letters spell which sounds.
 *
 * Stricter than {@link canDecodeToPhonemes} in two ways a reader would be:
 *   - a final e is silent only where English makes it silent: closing a
 *     split digraph, after c, g or v (dance, charge, leave), or after a vowel
 *     team (peace, house). Not after a short vowel and a plain consonant:
 *     "shipe" can't read as /ʃ ɪ p/, because there the e would make the i
 *     long. A silent e is a step with no phonemes;
 *   - c before e, i or y is soft: hard c isn't offered there ("cid" can't
 *     read as /k ɪ d/). Not applied to g, whose hard reading before e and i
 *     is common (get, give, girl).
 */
export function decodePathsToPhonemes(
  word: string,
  expectedPhonemes: readonly string[],
  index: GPCCatalogueIndex
): DecodePathStep[][] {
  const normalizedWord = word.toLowerCase();
  const splitInfo = detectSplitDigraph(normalizedWord);
  const paths: DecodePathStep[][] = [];
  const steps: DecodePathStep[] = [];

  function search(textPos: number, phonemeIdx: number, endReserved: boolean): void {
    if (paths.length >= MAX_DECODE_PATHS) return;
    if (textPos === normalizedWord.length) {
      if (phonemeIdx === expectedPhonemes.length) paths.push([...steps]);
      return;
    }
    // The split digraph's step already owns the final e.
    if (endReserved && textPos === normalizedWord.length - 1) {
      search(textPos + 1, phonemeIdx, endReserved);
      return;
    }
    if (textPos === normalizedWord.length - 1 && normalizedWord[textPos] === 'e') {
      const lastVowel = [...steps].reverse().find((s) => s.phonemes.some((p) => ARPABET_VOWELS.has(p)));
      const afterTeam = !!lastVowel && !lastVowel.grapheme.includes('_') && lastVowel.grapheme.length > 1;
      if ('cgv'.includes(normalizedWord[textPos - 1] ?? '') || afterTeam) {
        steps.push({ gpcId: 'silent-e', grapheme: 'e', letters: [textPos], phonemes: [] });
        search(textPos + 1, phonemeIdx, endReserved);
        steps.pop();
      }
    }

    const softC = normalizedWord[textPos] === 'c' && 'eiy'.includes(normalizedWord[textPos + 1] ?? '');
    for (const candidate of findAllCandidatesAt(normalizedWord, textPos, splitInfo, index)) {
      const gpcPhonemes = candidate.gpc.phoneme.split(' ').filter((p) => p);
      if (softC && candidate.gpc.grapheme === 'c' && gpcPhonemes[0] === 'K') continue;
      if (gpcPhonemes.some((p, i) => p !== expectedPhonemes[phonemeIdx + i])) continue;

      const isSplit = candidate.gpc.matchType === 'split_digraph';
      const letters = isSplit
        ? [textPos, normalizedWord.length - 1]
        : Array.from({ length: candidate.consumedText }, (_, i) => textPos + i);
      steps.push({
        gpcId: candidate.gpc.id,
        grapheme: candidate.gpc.grapheme,
        letters,
        phonemes: gpcPhonemes,
      });
      search(textPos + candidate.consumedText, phonemeIdx + gpcPhonemes.length, endReserved || isSplit);
      steps.pop();
    }
  }

  search(0, 0, false);
  return paths;
}

/**
 * Find all GPC candidates at a position (for path search, not prioritized)
 */
function findAllCandidatesAt(
  word: string,
  pos: number,
  splitInfo: ReturnType<typeof detectSplitDigraph>,
  index: GPCCatalogueIndex
): { gpc: GPCEntry; consumedText: number }[] {
  const candidates: { gpc: GPCEntry; consumedText: number }[] = [];
  const seen = new Set<string>();

  for (const gpc of index.byPriority) {
    // Special handling for split digraphs
    if (gpc.matchType === 'split_digraph' && splitInfo) {
      if (pos === splitInfo.vowelPos) {
        const result = tryMatch(gpc, word, pos);
        if (result) {
          const key = `${gpc.grapheme}:${gpc.phoneme}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({ gpc, consumedText: result.consumedText });
          }
        }
      }
      continue;
    }

    // Try the match
    const result = tryMatch(gpc, word, pos);
    if (result) {
      const key = `${gpc.grapheme}:${gpc.phoneme}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ gpc, consumedText: result.consumedText });
      }
    }
  }

  return candidates;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick decode to get predicted phonemes
 */
export function quickDecode(
  word: string,
  index?: GPCCatalogueIndex
): string[] {
  const result = decodeWord(word, index);
  return result.predictedPhonemes;
}

/**
 * Check if a word can be decoded unambiguously
 */
export function isUnambiguous(
  word: string,
  index?: GPCCatalogueIndex
): boolean {
  const result = decodeWord(word, index);
  return result.unambiguous;
}

/**
 * Get decode confidence for a word
 */
export function getDecodeConfidence(
  word: string,
  index?: GPCCatalogueIndex
): number {
  const result = decodeWord(word, index);
  return result.confidence;
}

/**
 * Format decode result as a readable string
 */
export function formatDecode(result: DecodeResult): string {
  const lines: string[] = [];

  lines.push(`Word: ${result.word}`);
  lines.push(`Predicted: ${result.predictedPhonemes.join(' ')}`);
  lines.push(
    `Status: ${result.unambiguous ? 'Unambiguous' : 'Ambiguous'} (confidence: ${(result.confidence * 100).toFixed(1)}%)`
  );

  if (result.unknownCount > 0) {
    lines.push(`Unknown graphemes: ${result.unknownCount}`);
  }

  lines.push('');
  lines.push('Segments:');
  for (const seg of result.segments) {
    const ambig = seg.ambiguous ? '⚠️' : '✓';
    const gpc = seg.gpcId ?? 'unknown';
    lines.push(
      `  ${ambig} "${seg.grapheme}" → ${seg.phoneme || '(silent)'} [${gpc}]`
    );
    if (seg.alternativePhonemes && seg.alternativePhonemes.length > 0) {
      lines.push(`      Alternatives: ${seg.alternativePhonemes.join(', ')}`);
    }
  }

  if (result.alternativePronunciations && result.alternativePronunciations.length > 0) {
    lines.push('');
    lines.push('Alternative pronunciations:');
    for (const alt of result.alternativePronunciations) {
      lines.push(`  - ${alt.join(' ')}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Catalogue Filtering (matching alignment)
// =============================================================================

/**
 * Create a catalogue index with only teaching-level GPCs
 */
export function getTeachingDecodeIndex(): GPCCatalogueIndex {
  const teaching = filterByTag(GPC_CATALOGUE, 'teaching-v0.2');
  return buildCatalogueIndex(teaching);
}

/**
 * Create a catalogue index with extended teaching GPCs
 */
export function getExtendedDecodeIndex(): GPCCatalogueIndex {
  const extended = GPC_CATALOGUE.filter(
    (gpc) =>
      gpc.tags?.includes('teaching-v0.2') || gpc.tags?.includes('teaching-v0.3')
  );
  return buildCatalogueIndex(extended);
}
