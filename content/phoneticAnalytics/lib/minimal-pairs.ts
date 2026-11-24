/**
 * Minimal Pairs Detection Library
 * ================================
 *
 * Identifies minimal pairs in a corpus of monosyllabic words.
 *
 * IMPORTANT: This library supports TWO levels of minimal pair detection:
 *
 * 1. **Phoneme-level** (legacy): Words differ by exactly one phoneme.
 *    Example: "you" [Y UW] ↔ "to" [T UW] — onset phoneme differs
 *
 * 2. **GPC-level** (recommended): Words differ by exactly one GPC.
 *    Example: "cat" [c-K, a-AE, t-T] ↔ "bat" [b-B, a-AE, t-T] — one GPC differs
 *    NOT a GPC minimal pair: "you" [GPC-WORD-you] ↔ "to" [GPC-WORD-to] — different structure
 *
 * For curriculum purposes, **GPC-level minimal pairs** are what we need.
 * Phoneme-level pairs may have different graphemic representations, which
 * confuses learners (e.g., "you" vs "to" differ in onset phoneme, but also
 * in how the /UW/ sound is spelled: "ou" vs "o").
 *
 * Used for:
 * - WordSelection exercise generation (GPC-level pairs)
 * - Recording prioritization (words with many GPC pairs = high value)
 * - Curriculum sequencing (introduce contrasts systematically)
 *
 * @example
 * ```ts
 * import { buildGpcMinimalPairIndex, findGpcMinimalPairs } from './minimal-pairs';
 *
 * const words = loadTeachingWords();
 * const index = buildGpcMinimalPairIndex(words);
 *
 * // Find all GPC minimal pairs for "cat"
 * const pairs = findGpcMinimalPairs('cat', index);
 * // => [
 * //   { partner: 'bat', position: 'onset', gpcA: 'GPC-c-K', gpcB: 'GPC-b-B' },
 * //   { partner: 'cut', position: 'nucleus', gpcA: 'GPC-a-AE', gpcB: 'GPC-u-AH' },
 * //   { partner: 'cap', position: 'coda', gpcA: 'GPC-t-T', gpcB: 'GPC-p-P' },
 * // ]
 * ```
 */

import type { ArpabetPhoneme } from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Position of the contrasting phoneme in a minimal pair
 */
export type ContrastPosition =
  | "onset"
  | "nucleus"
  | "coda"
  | "onset-cluster"
  | "coda-cluster";

/**
 * Information about a single minimal pair relationship
 */
export interface MinimalPairInfo {
  /** The partner word in the pair */
  partner: string;

  /** Position of the contrasting phoneme (for CVC: onset/nucleus/coda) */
  position: ContrastPosition;

  /** Index of the differing phoneme (0-based) */
  phonemeIndex: number;

  /** Phoneme in the source word */
  phonemeA: ArpabetPhoneme;

  /** Phoneme in the partner word */
  phonemeB: ArpabetPhoneme;

  /** GPC ID for the source word's phoneme (if known) */
  gpcA?: string;

  /** GPC ID for the partner word's phoneme (if known) */
  gpcB?: string;
}

/**
 * A word with its phoneme sequence and optional metadata
 */
export interface WordWithPhonemes {
  word: string;
  phonemes: ArpabetPhoneme[];
  frequency?: number;
  gpcs?: string[];
}

/**
 * A word with required GPC alignment for GPC-level minimal pair detection
 */
export interface WordWithGpcs {
  word: string;
  phonemes: ArpabetPhoneme[];
  gpcs: string[];
  frequency?: number;
}

/**
 * Information about a GPC-level minimal pair relationship
 *
 * More precise than phoneme-level: requires that the graphemic
 * representation also differs in exactly one position.
 */
export interface GpcMinimalPairInfo {
  /** The partner word in the pair */
  partner: string;

  /** Position of the contrasting GPC (0-based index in GPC array) */
  gpcIndex: number;

  /** Position type for curriculum purposes */
  position: ContrastPosition;

  /** GPC ID in the source word */
  gpcA: string;

  /** GPC ID in the partner word */
  gpcB: string;

  /** The grapheme in the source word */
  graphemeA: string;

  /** The grapheme in the partner word */
  graphemeB: string;

  /** Phoneme(s) in the source word */
  phonemeA: string;

  /** Phoneme(s) in the partner word */
  phonemeB: string;
}

/**
 * Index mapping words to their GPC-level minimal pairs
 */
export type GpcMinimalPairIndex = Map<string, GpcMinimalPairInfo[]>;

/**
 * Index mapping words to their phoneme-level minimal pairs
 *
 * @deprecated Prefer GpcMinimalPairIndex for curriculum purposes
 */
export type MinimalPairIndex = Map<string, MinimalPairInfo[]>;

/**
 * Statistics about the minimal pair index
 */
export interface MinimalPairStats {
  /** Total number of words in the index */
  totalWords: number;

  /** Total number of minimal pair relationships (each pair counted once) */
  totalPairs: number;

  /** Number of words with at least one minimal pair */
  wordsWithPairs: number;

  /** Average pairs per word */
  avgPairsPerWord: number;

  /** Distribution by contrast position */
  byPosition: Record<ContrastPosition, number>;

  /** Top 10 most connected words (most pairs) */
  mostConnected: { word: string; pairCount: number }[];
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Determine the contrast position based on phoneme index and word structure
 *
 * For CVC words:
 * - Index 0 = onset
 * - Index 1 = nucleus (vowel)
 * - Index 2 = coda
 *
 * For longer words, we use heuristics based on vowel position.
 */
function getContrastPosition(
  phonemeIndex: number,
  phonemes: ArpabetPhoneme[],
  isVowel: (p: ArpabetPhoneme) => boolean,
): ContrastPosition {
  const vowelIndices = phonemes
    .map((p, i) => (isVowel(p) ? i : -1))
    .filter((i) => i >= 0);

  if (vowelIndices.length === 0) {
    // No vowel found (shouldn't happen for valid words)
    return "onset";
  }

  const firstVowelIndex = vowelIndices[0];

  // Check if the phoneme at this index is a vowel
  if (isVowel(phonemes[phonemeIndex])) {
    return "nucleus";
  }

  // Before the vowel = onset
  if (phonemeIndex < firstVowelIndex) {
    if (firstVowelIndex > 1 && phonemeIndex < firstVowelIndex - 1) {
      return "onset-cluster";
    }
    return "onset";
  }

  // After the vowel = coda
  const lastVowelIndex = vowelIndices[vowelIndices.length - 1];
  if (phonemeIndex > lastVowelIndex + 1) {
    return "coda-cluster";
  }
  return "coda";
}

/**
 * Check if a phoneme is a vowel (ARPAbet vowels)
 */
function isArpabetVowel(phoneme: ArpabetPhoneme): boolean {
  const vowels = new Set([
    "AA",
    "AE",
    "AH",
    "AO",
    "AW",
    "AY",
    "EH",
    "ER",
    "EY",
    "IH",
    "IY",
    "OW",
    "OY",
    "UH",
    "UW",
  ]);
  return vowels.has(phoneme);
}

/**
 * Compare two phoneme sequences and find the differing position (if exactly one)
 *
 * @returns The index of the differing phoneme, or -1 if not a minimal pair
 */
function findSingleDifference(
  phonemesA: ArpabetPhoneme[],
  phonemesB: ArpabetPhoneme[],
): number {
  // Must be same length for minimal pair
  if (phonemesA.length !== phonemesB.length) {
    return -1;
  }

  let diffIndex = -1;
  let diffCount = 0;

  for (let i = 0; i < phonemesA.length; i++) {
    if (phonemesA[i] !== phonemesB[i]) {
      diffCount++;
      diffIndex = i;

      // More than one difference = not a minimal pair
      if (diffCount > 1) {
        return -1;
      }
    }
  }

  // Exactly one difference = minimal pair
  return diffCount === 1 ? diffIndex : -1;
}

/**
 * Build a phoneme-level minimal pair index from a list of words
 *
 * Time complexity: O(n² * m) where n = number of words, m = avg phoneme count
 * For 5000 monosyllables this is ~25M comparisons, runs in <1s.
 *
 * @deprecated Prefer buildGpcMinimalPairIndex for curriculum purposes
 * @param words - Array of words with phoneme sequences
 * @returns Map from word to its phoneme-level minimal pairs
 */
export function buildMinimalPairIndex(
  words: WordWithPhonemes[],
): MinimalPairIndex {
  const index: MinimalPairIndex = new Map();

  // Initialize empty arrays for all words
  for (const word of words) {
    index.set(word.word, []);
  }

  // Group words by phoneme count for efficiency
  // (minimal pairs must have same phoneme count)
  const byLength = new Map<number, WordWithPhonemes[]>();
  for (const word of words) {
    const len = word.phonemes.length;
    if (!byLength.has(len)) {
      byLength.set(len, []);
    }
    byLength.get(len)!.push(word);
  }

  // Compare within each length group
  for (const [_len, group] of byLength) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const wordA = group[i];
        const wordB = group[j];

        const diffIndex = findSingleDifference(wordA.phonemes, wordB.phonemes);

        if (diffIndex >= 0) {
          const position = getContrastPosition(
            diffIndex,
            wordA.phonemes,
            isArpabetVowel,
          );

          // Add pair A -> B
          index.get(wordA.word)!.push({
            partner: wordB.word,
            position,
            phonemeIndex: diffIndex,
            phonemeA: wordA.phonemes[diffIndex],
            phonemeB: wordB.phonemes[diffIndex],
            gpcA: wordA.gpcs?.[diffIndex],
            gpcB: wordB.gpcs?.[diffIndex],
          });

          // Add pair B -> A
          index.get(wordB.word)!.push({
            partner: wordA.word,
            position,
            phonemeIndex: diffIndex,
            phonemeA: wordB.phonemes[diffIndex],
            phonemeB: wordA.phonemes[diffIndex],
            gpcA: wordB.gpcs?.[diffIndex],
            gpcB: wordA.gpcs?.[diffIndex],
          });
        }
      }
    }
  }

  return index;
}

// =============================================================================
// GPC-Level Minimal Pairs (Recommended)
// =============================================================================

/**
 * Check if a GPC is a "whole word" GPC (sight word)
 *
 * Whole-word GPCs like GPC-WORD-the, GPC-WORD-you represent
 * irregular words that don't decompose into regular GPCs.
 * These should generally be excluded from minimal pair analysis.
 */
function isWholeWordGpc(gpcId: string): boolean {
  return gpcId.startsWith("GPC-WORD-");
}

/**
 * Extract grapheme from GPC ID
 *
 * @example
 * extractGrapheme('GPC-c-K') => 'c'
 * extractGrapheme('GPC-th-DH') => 'th'
 * extractGrapheme('GPC-a_e-EY') => 'a_e'
 */
function extractGrapheme(gpcId: string): string {
  // GPC format: GPC-<grapheme>-<phoneme>[-suffix]
  // Examples: GPC-c-K, GPC-th-DH, GPC-a_e-EY, GPC-c-S-soft
  const parts = gpcId.split("-");
  if (parts.length >= 3 && parts[0] === "GPC") {
    return parts[1];
  }
  return gpcId; // Fallback
}

/**
 * Extract phoneme(s) from GPC ID
 *
 * @example
 * extractPhoneme('GPC-c-K') => 'K'
 * extractPhoneme('GPC-th-DH') => 'DH'
 * extractPhoneme('GPC-an-AH_N') => 'AH_N'
 */
function extractPhoneme(gpcId: string): string {
  const parts = gpcId.split("-");
  if (parts.length >= 3 && parts[0] === "GPC") {
    return parts[2];
  }
  return gpcId; // Fallback
}

/**
 * Compare two GPC sequences and find the differing position (if exactly one)
 *
 * Unlike phoneme comparison, this compares GPC IDs directly.
 * Words must have the same number of GPCs to be minimal pairs.
 *
 * @returns The index of the differing GPC, or -1 if not a minimal pair
 */
function findSingleGpcDifference(gpcsA: string[], gpcsB: string[]): number {
  // Must be same length for minimal pair
  if (gpcsA.length !== gpcsB.length) {
    return -1;
  }

  let diffIndex = -1;
  let diffCount = 0;

  for (let i = 0; i < gpcsA.length; i++) {
    if (gpcsA[i] !== gpcsB[i]) {
      diffCount++;
      diffIndex = i;

      // More than one difference = not a minimal pair
      if (diffCount > 1) {
        return -1;
      }
    }
  }

  // Exactly one difference = minimal pair
  return diffCount === 1 ? diffIndex : -1;
}

/**
 * Determine contrast position from GPC index
 *
 * Uses heuristics based on GPC category and position in sequence.
 */
function getGpcContrastPosition(
  gpcIndex: number,
  gpcs: string[],
  totalGpcs: number,
): ContrastPosition {
  // Simple heuristic: first = onset, last = coda, middle = nucleus
  // This works well for CVC patterns which are most common in monosyllables

  if (gpcIndex === 0) {
    // Check if it's a cluster (multiple consonants at start)
    if (totalGpcs > 3 && !isVowelGpc(gpcs[0]) && !isVowelGpc(gpcs[1])) {
      return "onset-cluster";
    }
    return "onset";
  }

  if (gpcIndex === totalGpcs - 1) {
    // Check if it's a cluster (multiple consonants at end)
    if (
      totalGpcs > 3 &&
      !isVowelGpc(gpcs[totalGpcs - 1]) &&
      !isVowelGpc(gpcs[totalGpcs - 2])
    ) {
      return "coda-cluster";
    }
    return "coda";
  }

  // Middle position - usually the vowel
  return "nucleus";
}

/**
 * Check if a GPC represents a vowel sound
 */
function isVowelGpc(gpcId: string): boolean {
  const vowelPhonemes = new Set([
    "AA",
    "AE",
    "AH",
    "AO",
    "AW",
    "AY",
    "EH",
    "ER",
    "EY",
    "IH",
    "IY",
    "OW",
    "OY",
    "UH",
    "UW",
  ]);

  const phoneme = extractPhoneme(gpcId);
  // Handle multi-phoneme GPCs like AH_N
  const firstPhoneme = phoneme.split("_")[0];
  return vowelPhonemes.has(firstPhoneme);
}

/**
 * Build a GPC-level minimal pair index from a list of words
 *
 * This is the **recommended** approach for curriculum purposes.
 * Unlike phoneme-level pairs, GPC-level pairs ensure that the
 * graphemic representation also differs in exactly one position.
 *
 * Words with whole-word GPCs (sight words like "the", "you") are
 * excluded from the index since they don't have decomposable structure.
 *
 * Time complexity: O(n² * m) where n = number of words, m = avg GPC count
 *
 * @param words - Array of words with GPC sequences
 * @param options - Optional configuration
 * @returns Map from word to its GPC-level minimal pairs
 */
export function buildGpcMinimalPairIndex(
  words: WordWithGpcs[],
  options: {
    /** Exclude words with whole-word GPCs (default: true) */
    excludeWholeWordGpcs?: boolean;
    /** Minimum frequency threshold (default: 0) */
    minFrequency?: number;
  } = {},
): GpcMinimalPairIndex {
  const { excludeWholeWordGpcs = true, minFrequency = 0 } = options;

  const index: GpcMinimalPairIndex = new Map();

  // Filter words
  const filteredWords = words.filter((w) => {
    // Frequency filter
    if (w.frequency !== undefined && w.frequency < minFrequency) {
      return false;
    }

    // Whole-word GPC filter
    if (excludeWholeWordGpcs && w.gpcs.some(isWholeWordGpc)) {
      return false;
    }

    // Must have at least one GPC
    if (w.gpcs.length === 0) {
      return false;
    }

    return true;
  });

  // Initialize empty arrays for all filtered words
  for (const word of filteredWords) {
    index.set(word.word, []);
  }

  // Group words by GPC count for efficiency
  const byLength = new Map<number, WordWithGpcs[]>();
  for (const word of filteredWords) {
    const len = word.gpcs.length;
    if (!byLength.has(len)) {
      byLength.set(len, []);
    }
    byLength.get(len)!.push(word);
  }

  // Compare within each length group
  for (const [_len, group] of byLength) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const wordA = group[i];
        const wordB = group[j];

        const diffIndex = findSingleGpcDifference(wordA.gpcs, wordB.gpcs);

        if (diffIndex >= 0) {
          const position = getGpcContrastPosition(
            diffIndex,
            wordA.gpcs,
            wordA.gpcs.length,
          );

          const gpcA = wordA.gpcs[diffIndex];
          const gpcB = wordB.gpcs[diffIndex];

          // Add pair A -> B
          index.get(wordA.word)!.push({
            partner: wordB.word,
            gpcIndex: diffIndex,
            position,
            gpcA,
            gpcB,
            graphemeA: extractGrapheme(gpcA),
            graphemeB: extractGrapheme(gpcB),
            phonemeA: extractPhoneme(gpcA),
            phonemeB: extractPhoneme(gpcB),
          });

          // Add pair B -> A
          index.get(wordB.word)!.push({
            partner: wordA.word,
            gpcIndex: diffIndex,
            position,
            gpcA: gpcB,
            gpcB: gpcA,
            graphemeA: extractGrapheme(gpcB),
            graphemeB: extractGrapheme(gpcA),
            phonemeA: extractPhoneme(gpcB),
            phonemeB: extractPhoneme(gpcA),
          });
        }
      }
    }
  }

  return index;
}

/**
 * Find GPC-level minimal pairs for a specific word
 *
 * @param word - The word to find pairs for
 * @param index - Pre-built GPC minimal pair index
 * @returns Array of GPC minimal pair info, or empty array if word not in index
 */
export function findGpcMinimalPairs(
  word: string,
  index: GpcMinimalPairIndex,
): GpcMinimalPairInfo[] {
  return index.get(word.toLowerCase()) ?? [];
}

/**
 * Find GPC minimal pairs filtered by contrast position
 */
export function findGpcMinimalPairsByPosition(
  word: string,
  index: GpcMinimalPairIndex,
  position: ContrastPosition,
): GpcMinimalPairInfo[] {
  return findGpcMinimalPairs(word, index).filter(
    (p) => p.position === position,
  );
}

/**
 * Find GPC minimal pairs that contrast a specific GPC
 */
export function findGpcMinimalPairsByGpc(
  word: string,
  index: GpcMinimalPairIndex,
  gpcId: string,
): GpcMinimalPairInfo[] {
  return findGpcMinimalPairs(word, index).filter(
    (p) => p.gpcA === gpcId || p.gpcB === gpcId,
  );
}

/**
 * Get statistics about a GPC minimal pair index
 */
export function getGpcMinimalPairStats(
  index: GpcMinimalPairIndex,
): MinimalPairStats {
  const totalWords = index.size;
  let totalPairs = 0;
  let wordsWithPairs = 0;
  const byPosition: Record<ContrastPosition, number> = {
    onset: 0,
    nucleus: 0,
    coda: 0,
    "onset-cluster": 0,
    "coda-cluster": 0,
  };

  const pairCounts: { word: string; pairCount: number }[] = [];

  for (const [word, pairs] of index) {
    if (pairs.length > 0) {
      wordsWithPairs++;
    }
    totalPairs += pairs.length;
    pairCounts.push({ word, pairCount: pairs.length });

    for (const pair of pairs) {
      byPosition[pair.position]++;
    }
  }

  // Each pair is counted twice (A->B and B->A), so divide by 2
  totalPairs = totalPairs / 2;

  // Divide position counts by 2 as well
  for (const pos of Object.keys(byPosition) as ContrastPosition[]) {
    byPosition[pos] = byPosition[pos] / 2;
  }

  // Sort and take top 10 most connected
  pairCounts.sort((a, b) => b.pairCount - a.pairCount);
  const mostConnected = pairCounts.slice(0, 10);

  return {
    totalWords,
    totalPairs,
    wordsWithPairs,
    avgPairsPerWord: wordsWithPairs > 0 ? (totalPairs * 2) / wordsWithPairs : 0,
    byPosition,
    mostConnected,
  };
}

/**
 * Find GPC minimal pair clusters (groups of words that differ only in one GPC position)
 *
 * Example: [cat, bat, hat, mat, sat] forms a cluster where each differs only in onset GPC
 *
 * @param index - Pre-built GPC minimal pair index
 * @param minSize - Minimum cluster size to include (default: 3)
 */
export function findGpcMinimalPairClusters(
  index: GpcMinimalPairIndex,
  minSize: number = 3,
): string[][] {
  const clusters: string[][] = [];
  const visited = new Set<string>();

  for (const [word, pairs] of index) {
    if (visited.has(word)) continue;

    // Group pairs by GPC position
    const byPosition = new Map<number, Set<string>>();

    for (const pair of pairs) {
      const key = pair.gpcIndex;
      if (!byPosition.has(key)) {
        byPosition.set(key, new Set([word]));
      }
      byPosition.get(key)!.add(pair.partner);
    }

    // Check each position group for cluster
    for (const [_key, members] of byPosition) {
      if (members.size >= minSize) {
        // Verify all members are mutually minimal pairs
        const memberArray = [...members];
        let isCluster = true;

        for (let i = 0; i < memberArray.length && isCluster; i++) {
          const memberPairs = index.get(memberArray[i]) ?? [];
          const memberPartners = new Set(memberPairs.map((p) => p.partner));

          for (let j = 0; j < memberArray.length && isCluster; j++) {
            if (i !== j && !memberPartners.has(memberArray[j])) {
              isCluster = false;
            }
          }
        }

        if (isCluster) {
          clusters.push(memberArray.sort());
          for (const m of memberArray) {
            visited.add(m);
          }
        }
      }
    }
  }

  return clusters;
}

// =============================================================================
// Phoneme-Level Minimal Pairs (Legacy)
// =============================================================================

/**
 * Find phoneme-level minimal pairs for a specific word
 *
 * @deprecated Prefer findGpcMinimalPairs for curriculum purposes
 * @param word - The word to find pairs for
 * @param index - Pre-built minimal pair index
 * @returns Array of minimal pair info, or empty array if word not in index
 */
export function findMinimalPairs(
  word: string,
  index: MinimalPairIndex,
): MinimalPairInfo[] {
  return index.get(word.toLowerCase()) ?? [];
}

/**
 * Find phoneme-level minimal pairs filtered by contrast position
 *
 * @deprecated Prefer findGpcMinimalPairsByPosition for curriculum purposes
 */
export function findMinimalPairsByPosition(
  word: string,
  index: MinimalPairIndex,
  position: ContrastPosition,
): MinimalPairInfo[] {
  return findMinimalPairs(word, index).filter((p) => p.position === position);
}

/**
 * Find phoneme-level minimal pairs that contrast a specific phoneme
 *
 * @deprecated Prefer findGpcMinimalPairsByGpc for curriculum purposes
 */
export function findMinimalPairsByPhoneme(
  word: string,
  index: MinimalPairIndex,
  phoneme: ArpabetPhoneme,
): MinimalPairInfo[] {
  return findMinimalPairs(word, index).filter(
    (p) => p.phonemeA === phoneme || p.phonemeB === phoneme,
  );
}

/**
 * Get all phoneme-level minimal pair clusters
 *
 * @deprecated Prefer findGpcMinimalPairClusters for curriculum purposes
 * @param index - Pre-built minimal pair index
 * @param minSize - Minimum cluster size to include (default: 3)
 */
export function findMinimalPairClusters(
  index: MinimalPairIndex,
  minSize: number = 3,
): string[][] {
  const clusters: string[][] = [];
  const visited = new Set<string>();

  // For each word, try to expand a cluster
  for (const [word, pairs] of index) {
    if (visited.has(word)) continue;

    // Group pairs by position
    const byPosition = new Map<string, Set<string>>();

    for (const pair of pairs) {
      const key = `${pair.position}-${pair.phonemeIndex}`;
      if (!byPosition.has(key)) {
        byPosition.set(key, new Set([word]));
      }
      byPosition.get(key)!.add(pair.partner);
    }

    // Check each position group for cluster
    for (const [_key, members] of byPosition) {
      if (members.size >= minSize) {
        // Verify all members are mutually minimal pairs
        const memberArray = [...members];
        let isCluster = true;

        for (let i = 0; i < memberArray.length && isCluster; i++) {
          const memberPairs = index.get(memberArray[i]) ?? [];
          const memberPartners = new Set(memberPairs.map((p) => p.partner));

          for (let j = 0; j < memberArray.length && isCluster; j++) {
            if (i !== j && !memberPartners.has(memberArray[j])) {
              isCluster = false;
            }
          }
        }

        if (isCluster) {
          clusters.push(memberArray.sort());
          for (const m of memberArray) {
            visited.add(m);
          }
        }
      }
    }
  }

  return clusters;
}

/**
 * Calculate statistics about a phoneme-level minimal pair index
 *
 * @deprecated Prefer getGpcMinimalPairStats for curriculum purposes
 */
export function getMinimalPairStats(index: MinimalPairIndex): MinimalPairStats {
  const totalWords = index.size;
  let totalPairs = 0;
  let wordsWithPairs = 0;
  const byPosition: Record<ContrastPosition, number> = {
    onset: 0,
    nucleus: 0,
    coda: 0,
    "onset-cluster": 0,
    "coda-cluster": 0,
  };

  const pairCounts: { word: string; pairCount: number }[] = [];

  for (const [word, pairs] of index) {
    if (pairs.length > 0) {
      wordsWithPairs++;
    }
    totalPairs += pairs.length;
    pairCounts.push({ word, pairCount: pairs.length });

    for (const pair of pairs) {
      byPosition[pair.position]++;
    }
  }

  // Each pair is counted twice (A->B and B->A), so divide by 2
  totalPairs = totalPairs / 2;

  // Divide position counts by 2 as well
  for (const pos of Object.keys(byPosition) as ContrastPosition[]) {
    byPosition[pos] = byPosition[pos] / 2;
  }

  // Sort and take top 10 most connected
  pairCounts.sort((a, b) => b.pairCount - a.pairCount);
  const mostConnected = pairCounts.slice(0, 10);

  return {
    totalWords,
    totalPairs,
    wordsWithPairs,
    avgPairsPerWord: wordsWithPairs > 0 ? (totalPairs * 2) / wordsWithPairs : 0,
    byPosition,
    mostConnected,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if two words form a phoneme-level minimal pair
 *
 * @deprecated Prefer isGpcMinimalPair for curriculum purposes
 * @param wordA - First word with phonemes
 * @param wordB - Second word with phonemes
 * @returns MinimalPairInfo if they are a minimal pair, null otherwise
 */
export function isMinimalPair(
  wordA: WordWithPhonemes,
  wordB: WordWithPhonemes,
): MinimalPairInfo | null {
  const diffIndex = findSingleDifference(wordA.phonemes, wordB.phonemes);

  if (diffIndex < 0) {
    return null;
  }

  const position = getContrastPosition(
    diffIndex,
    wordA.phonemes,
    isArpabetVowel,
  );

  return {
    partner: wordB.word,
    position,
    phonemeIndex: diffIndex,
    phonemeA: wordA.phonemes[diffIndex],
    phonemeB: wordB.phonemes[diffIndex],
    gpcA: wordA.gpcs?.[diffIndex],
    gpcB: wordB.gpcs?.[diffIndex],
  };
}

/**
 * Check if two words form a GPC-level minimal pair
 *
 * @param wordA - First word with GPCs
 * @param wordB - Second word with GPCs
 * @returns GpcMinimalPairInfo if they are a GPC minimal pair, null otherwise
 */
export function isGpcMinimalPair(
  wordA: WordWithGpcs,
  wordB: WordWithGpcs,
): GpcMinimalPairInfo | null {
  // Exclude whole-word GPCs
  if (wordA.gpcs.some(isWholeWordGpc) || wordB.gpcs.some(isWholeWordGpc)) {
    return null;
  }

  const diffIndex = findSingleGpcDifference(wordA.gpcs, wordB.gpcs);

  if (diffIndex < 0) {
    return null;
  }

  const position = getGpcContrastPosition(
    diffIndex,
    wordA.gpcs,
    wordA.gpcs.length,
  );

  const gpcA = wordA.gpcs[diffIndex];
  const gpcB = wordB.gpcs[diffIndex];

  return {
    partner: wordB.word,
    gpcIndex: diffIndex,
    position,
    gpcA,
    gpcB,
    graphemeA: extractGrapheme(gpcA),
    graphemeB: extractGrapheme(gpcB),
    phonemeA: extractPhoneme(gpcA),
    phonemeB: extractPhoneme(gpcB),
  };
}

/**
 * Find the best phoneme-level minimal pairs for a word based on a scoring function
 *
 * @deprecated Prefer findBestGpcMinimalPairs for curriculum purposes
 * @param word - The word to find pairs for
 * @param index - Pre-built minimal pair index
 * @param scoreFn - Function to score each pair (higher = better)
 * @param limit - Maximum number of pairs to return
 */
export function findBestMinimalPairs(
  word: string,
  index: MinimalPairIndex,
  scoreFn: (pair: MinimalPairInfo) => number,
  limit: number = 5,
): MinimalPairInfo[] {
  const pairs = findMinimalPairs(word, index);

  return pairs
    .map((pair) => ({ pair, score: scoreFn(pair) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.pair);
}

/**
 * Find the best GPC-level minimal pairs for a word based on a scoring function
 *
 * @param word - The word to find pairs for
 * @param index - Pre-built GPC minimal pair index
 * @param scoreFn - Function to score each pair (higher = better)
 * @param limit - Maximum number of pairs to return
 */
export function findBestGpcMinimalPairs(
  word: string,
  index: GpcMinimalPairIndex,
  scoreFn: (pair: GpcMinimalPairInfo) => number,
  limit: number = 5,
): GpcMinimalPairInfo[] {
  const pairs = findGpcMinimalPairs(word, index);

  return pairs
    .map((pair) => ({ pair, score: scoreFn(pair) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.pair);
}

/**
 * Create a scoring function based on word frequencies (phoneme-level)
 *
 * @param frequencies - Map from word to frequency
 * @returns Scoring function for findBestMinimalPairs
 */
export function frequencyScorer(
  frequencies: Map<string, number>,
): (pair: MinimalPairInfo) => number {
  return (pair: MinimalPairInfo) => {
    return Math.log10((frequencies.get(pair.partner) ?? 1) + 1);
  };
}

/**
 * Create a scoring function based on word frequencies (GPC-level)
 *
 * @param frequencies - Map from word to frequency
 * @returns Scoring function for findBestGpcMinimalPairs
 */
export function gpcFrequencyScorer(
  frequencies: Map<string, number>,
): (pair: GpcMinimalPairInfo) => number {
  return (pair: GpcMinimalPairInfo) => {
    return Math.log10((frequencies.get(pair.partner) ?? 1) + 1);
  };
}

/**
 * Filter phoneme-level minimal pairs to only include words from a specific set
 *
 * Useful for restricting to already-recorded words or decodable vocabulary
 */
export function filterMinimalPairIndex(
  index: MinimalPairIndex,
  allowedWords: Set<string>,
): MinimalPairIndex {
  const filtered: MinimalPairIndex = new Map();

  for (const [word, pairs] of index) {
    if (allowedWords.has(word)) {
      const filteredPairs = pairs.filter((p) => allowedWords.has(p.partner));
      filtered.set(word, filteredPairs);
    }
  }

  return filtered;
}

/**
 * Filter GPC-level minimal pairs to only include words from a specific set
 *
 * Useful for restricting to already-recorded words or decodable vocabulary
 */
export function filterGpcMinimalPairIndex(
  index: GpcMinimalPairIndex,
  allowedWords: Set<string>,
): GpcMinimalPairIndex {
  const filtered: GpcMinimalPairIndex = new Map();

  for (const [word, pairs] of index) {
    if (allowedWords.has(word)) {
      const filteredPairs = pairs.filter((p) => allowedWords.has(p.partner));
      filtered.set(word, filteredPairs);
    }
  }

  return filtered;
}

/**
 * Export a phoneme-level minimal pair index as JSON-serializable data
 */
export function exportMinimalPairIndex(
  index: MinimalPairIndex,
): Record<string, MinimalPairInfo[]> {
  const result: Record<string, MinimalPairInfo[]> = {};

  for (const [word, pairs] of index) {
    result[word] = pairs;
  }

  return result;
}

/**
 * Import a phoneme-level minimal pair index from JSON data
 */
export function importMinimalPairIndex(
  data: Record<string, MinimalPairInfo[]>,
): MinimalPairIndex {
  const index: MinimalPairIndex = new Map();

  for (const [word, pairs] of Object.entries(data)) {
    index.set(word, pairs);
  }

  return index;
}

/**
 * Export a GPC-level minimal pair index as JSON-serializable data
 */
export function exportGpcMinimalPairIndex(
  index: GpcMinimalPairIndex,
): Record<string, GpcMinimalPairInfo[]> {
  const result: Record<string, GpcMinimalPairInfo[]> = {};

  for (const [word, pairs] of index) {
    result[word] = pairs;
  }

  return result;
}

/**
 * Import a GPC-level minimal pair index from JSON data
 */
export function importGpcMinimalPairIndex(
  data: Record<string, GpcMinimalPairInfo[]>,
): GpcMinimalPairIndex {
  const index: GpcMinimalPairIndex = new Map();

  for (const [word, pairs] of Object.entries(data)) {
    index.set(word, pairs);
  }

  return index;
}
