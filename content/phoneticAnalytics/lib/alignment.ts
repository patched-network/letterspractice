/**
 * Alignment Engine v2
 *
 * Enhanced alignment with partial results, per-segment status,
 * and operational GPC semantics.
 *
 * Key improvements over v1:
 * - Partial alignment: per-phoneme success/failure tracking
 * - Operational GPCs: match types reduce algorithm complexity
 * - Best-effort results: always returns segments, even on failure
 *
 * @see alignment-v2.md for the full specification
 * @see catalogue-v2.ts for GPC definitions
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
    GPC_CATALOGUE
} from './catalogue';
import {
    compressPattern,
    detectSplitDigraph,
    getWordPattern,
    tryMatchWithOracle
} from './match-types';
import type { AlignmentConfig, AlignmentResult, AlignmentSegment, AlignmentStatus, ArpabetPhoneme } from './types';

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default alignment configuration
 */
export const DEFAULT_ALIGNMENT_CONFIG: Required<AlignmentConfig> = {
  allowPartial: true,
  trackAlternatives: true,
  maxAlternatives: 3,
  handleSplitDigraphs: true,
  catalogueTag: undefined as unknown as string, // No tag filter by default
};

// =============================================================================
// Core Alignment Function
// =============================================================================

/**
 * Align a word's spelling to its phonemes using v2 operational GPCs
 *
 * @param word The word to align
 * @param phonemes The expected phonemes (from CMUDict, stress-stripped)
 * @param index Optional catalogue index (uses default if not provided)
 * @param config Optional configuration
 * @returns AlignmentResult with per-segment status
 *
 * @example
 * const result = alignWord('cake', ['K', 'EY', 'K']);
 * // result.fullyAligned === true
 * // result.segments[1].grapheme === 'a' (part of a_e split digraph)
 */
export function alignWord(
  word: string,
  phonemes: ArpabetPhoneme[],
  index?: GPCCatalogueIndex,
  config?: Partial<AlignmentConfig>
): AlignmentResult {
  const cfg = { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
  const catalogueIndex = index ?? getDefaultCatalogueIndex();

  // Normalize word
  const normalizedWord = word.toLowerCase();

  // Pre-detect split digraph pattern
  const splitInfo = cfg.handleSplitDigraphs
    ? detectSplitDigraph(normalizedWord, phonemes)
    : null;

  // Initialize result
  const segments: AlignmentSegment[] = [];
  const issues: string[] = [];
  const usedGpcs: Set<string> = new Set();

  let textPos = 0;
  let phonemeIdx = 0;

  // Track if final-e is reserved by split digraph
  let finalEReserved = false;
  if (splitInfo) {
    finalEReserved = true;
  }

  // Main alignment loop
  while (textPos < normalizedWord.length) {
    const remaining = normalizedWord.slice(textPos);

    // Check if we've consumed all phonemes but have text left
    if (phonemeIdx >= phonemes.length) {
      // Check if remaining is just the reserved final-e
      if (finalEReserved && textPos === normalizedWord.length - 1 && normalizedWord[textPos] === 'e') {
        // Create a segment for the silent final-e
        segments.push({
          grapheme: 'e',
          phoneme: '',
          gpcId: 'GPC-e-silent-split',
          matchType: 'silent',
          startPos: textPos,
          endPos: textPos + 1,
          aligned: true,
          confidence: 1.0,
        });
        textPos++;
        continue;
      }

      // Otherwise, unaligned text
      const issue = `No phoneme for remaining text: "${remaining}"`;
      issues.push(issue);

      if (!cfg.allowPartial) {
        break;
      }

      // Create unaligned segment for remaining text
      segments.push({
        grapheme: remaining,
        phoneme: '',
        gpcId: null,
        matchType: null,
        startPos: textPos,
        endPos: normalizedWord.length,
        aligned: false,
        confidence: 0,
        issue,
      });
      break;
    }

    // Try to find a matching GPC
    const matchResult = findBestMatch(
      catalogueIndex,
      normalizedWord,
      textPos,
      phonemes,
      phonemeIdx,
      splitInfo,
      cfg
    );

    if (matchResult) {
      const { gpc, result, alternatives } = matchResult;

      // Determine what text was consumed
      let consumedText = result.consumedText;
      let grapheme = normalizedWord.slice(textPos, textPos + consumedText);

      // For split digraphs, the grapheme should show the full pattern
      if (gpc.matchType === 'split_digraph') {
        grapheme = gpc.grapheme; // e.g., "a_e"
      }

      // Create aligned segment
      const segment: AlignmentSegment = {
        grapheme,
        phoneme: gpc.phoneme,
        gpcId: gpc.id,
        matchType: gpc.matchType,
        startPos: textPos,
        endPos: textPos + consumedText,
        aligned: true,
        confidence: alternatives.length === 0 ? 1.0 : 1.0 / (alternatives.length + 1),
      };

      if (cfg.trackAlternatives && alternatives.length > 0) {
        segment.alternatives = alternatives.slice(0, cfg.maxAlternatives);
      }

      segments.push(segment);
      usedGpcs.add(gpc.id);

      textPos += consumedText;
      phonemeIdx += result.consumedPhonemes;

      // If this was a split digraph, mark final-e as handled
      if (result.marksEndSilent) {
        finalEReserved = true;
      }
    } else {
      // No GPC matched - create unaligned segment
      const currentPhoneme = phonemes[phonemeIdx];
      const currentChar = normalizedWord[textPos];
      const issue = `No GPC for grapheme "${currentChar}" → phoneme "${currentPhoneme}"`;
      issues.push(issue);

      if (!cfg.allowPartial) {
        // Early exit on first failure
        segments.push({
          grapheme: currentChar,
          phoneme: currentPhoneme,
          gpcId: null,
          matchType: null,
          startPos: textPos,
          endPos: textPos + 1,
          aligned: false,
          confidence: 0,
          issue,
        });
        break;
      }

      // Best-effort: advance by one character and one phoneme
      segments.push({
        grapheme: currentChar,
        phoneme: currentPhoneme,
        gpcId: null,
        matchType: null,
        startPos: textPos,
        endPos: textPos + 1,
        aligned: false,
        confidence: 0,
        issue,
      });

      textPos++;
      phonemeIdx++;
    }
  }

  // Check for leftover phonemes
  if (phonemeIdx < phonemes.length) {
    const remainingPhonemes = phonemes.slice(phonemeIdx);
    const issue = `Leftover phonemes not matched: ${remainingPhonemes.join(' ')}`;
    issues.push(issue);

    // Create unaligned segments for leftover phonemes
    for (const phoneme of remainingPhonemes) {
      segments.push({
        grapheme: '',
        phoneme,
        gpcId: null,
        matchType: null,
        startPos: normalizedWord.length,
        endPos: normalizedWord.length,
        aligned: false,
        confidence: 0,
        issue: `No grapheme for phoneme "${phoneme}"`,
      });
    }
  }

  // Calculate statistics
  const alignedCount = segments.filter((s) => s.aligned).length;
  const totalCount = segments.length;
  const alignmentRate = totalCount > 0 ? alignedCount / totalCount : 0;
  const fullyAligned = alignedCount === totalCount && issues.length === 0;

  // Determine status
  let status: AlignmentStatus;
  if (fullyAligned) {
    status = 'full';
  } else if (alignedCount > 0) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  // Get word pattern
  const rawPattern = getWordPattern(normalizedWord);
  const pattern = compressPattern(rawPattern);

  return {
    word,
    phonemes,
    segments,
    status,
    fullyAligned,
    alignedCount,
    totalCount,
    alignmentRate,
    pattern,
    hasSplitDigraph: splitInfo !== null,
    gpcs: Array.from(usedGpcs),
    issues,
  };
}

// =============================================================================
// Match Finding
// =============================================================================

interface MatchCandidate {
  gpc: GPCEntry;
  result: { consumedText: number; consumedPhonemes: number; marksEndSilent?: boolean };
  alternatives: string[];
}

/**
 * Find the best matching GPC at the current position
 */
function findBestMatch(
  index: GPCCatalogueIndex,
  word: string,
  pos: number,
  phonemes: ArpabetPhoneme[],
  phonemeIdx: number,
  splitInfo: ReturnType<typeof detectSplitDigraph>,
  config: Required<AlignmentConfig>
): MatchCandidate | null {
  const candidates: MatchCandidate[] = [];

  // Try GPCs in priority order
  for (const gpc of index.byPriority) {
    // Skip if filtered by tag
    if (config.catalogueTag && !gpc.tags?.includes(config.catalogueTag)) {
      continue;
    }

    // Special handling for split digraphs
    if (gpc.matchType === 'split_digraph' && splitInfo) {
      // Only try split digraph if we're at the vowel position
      if (pos === splitInfo.vowelPos) {
        const result = tryMatchWithOracle(gpc, word, pos, phonemes, phonemeIdx);
        if (result) {
          candidates.push({
            gpc,
            result,
            alternatives: [],
          });
        }
      }
      continue;
    }

    // Try the match with oracle (phoneme validation)
    const result = tryMatchWithOracle(gpc, word, pos, phonemes, phonemeIdx);
    if (result) {
      candidates.push({
        gpc,
        result,
        alternatives: [],
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort candidates by specificity (longer grapheme, more specific match type)
  candidates.sort((a, b) => {
    // Prefer longer graphemes
    const lenDiff = b.gpc.grapheme.length - a.gpc.grapheme.length;
    if (lenDiff !== 0) return lenDiff;

    // Prefer more specific match types
    const typePriority = (mt: string) => {
      switch (mt) {
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

  // Get the best match
  const best = candidates[0];

  // Track alternatives
  if (config.trackAlternatives && candidates.length > 1) {
    best.alternatives = candidates.slice(1).map((c) => c.gpc.id);
  }

  return best;
}

// =============================================================================
// Batch Alignment
// =============================================================================

/**
 * Result of batch alignment
 */
export interface BatchAlignmentResult {
  /** Total words processed */
  total: number;

  /** Fully aligned words */
  fullyAligned: number;

  /** Partially aligned words */
  partiallyAligned: number;

  /** Failed words */
  failed: number;

  /** Full alignment rate */
  fullAlignmentRate: number;

  /** Average alignment rate across all words */
  averageAlignmentRate: number;

  /** Individual results (if requested) */
  results?: AlignmentResult[];

  /** Most common issues */
  topIssues: Array<{ issue: string; count: number }>;
}

/**
 * Align multiple words in batch
 *
 * @param words Array of [word, phonemes] pairs
 * @param index Optional catalogue index
 * @param config Optional configuration
 * @param includeResults Whether to include individual results
 */
export function alignBatchV2(
  words: Array<[string, ArpabetPhoneme[]]>,
  index?: GPCCatalogueIndex,
  config?: Partial<AlignmentConfig>,
  includeResults = false
): BatchAlignmentResult {
  const catalogueIndex = index ?? getDefaultCatalogueIndex();
  const results: AlignmentResult[] = [];
  const issueCounter = new Map<string, number>();

  let fullyAligned = 0;
  let partiallyAligned = 0;
  let failed = 0;
  let totalAlignmentRate = 0;

  for (const [word, phonemes] of words) {
    const result = alignWord(word, phonemes, catalogueIndex, config);

    if (includeResults) {
      results.push(result);
    }

    // Count by status
    switch (result.status) {
      case 'full':
        fullyAligned++;
        break;
      case 'partial':
        partiallyAligned++;
        break;
      case 'failed':
        failed++;
        break;
    }

    totalAlignmentRate += result.alignmentRate;

    // Count issues
    for (const issue of result.issues) {
      const count = issueCounter.get(issue) ?? 0;
      issueCounter.set(issue, count + 1);
    }
  }

  // Get top issues
  const topIssues = Array.from(issueCounter.entries())
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: words.length,
    fullyAligned,
    partiallyAligned,
    failed,
    fullAlignmentRate: words.length > 0 ? fullyAligned / words.length : 0,
    averageAlignmentRate: words.length > 0 ? totalAlignmentRate / words.length : 0,
    results: includeResults ? results : undefined,
    topIssues,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick check if a word fully aligns
 */
export function isFullyAlignedV2(
  word: string,
  phonemes: ArpabetPhoneme[],
  index?: GPCCatalogueIndex
): boolean {
  const result = alignWord(word, phonemes, index, { allowPartial: false });
  return result.fullyAligned;
}

/**
 * Get alignment rate for a word (0.0 to 1.0)
 */
export function getAlignmentRateV2(
  word: string,
  phonemes: ArpabetPhoneme[],
  index?: GPCCatalogueIndex
): number {
  const result = alignWord(word, phonemes, index);
  return result.alignmentRate;
}

/**
 * Extract GPCs used in a word
 */
export function extractGpcsV2(
  word: string,
  phonemes: ArpabetPhoneme[],
  index?: GPCCatalogueIndex
): string[] {
  const result = alignWord(word, phonemes, index);
  return result.gpcs;
}

/**
 * Format alignment result as a readable string
 */
export function formatAlignmentV2(result: AlignmentResult): string {
  const lines: string[] = [];

  lines.push(`Word: ${result.word}`);
  lines.push(`Phonemes: ${result.phonemes.join(' ')}`);
  lines.push(`Pattern: ${result.pattern}`);
  lines.push(`Status: ${result.status} (${(result.alignmentRate * 100).toFixed(1)}%)`);

  if (result.hasSplitDigraph) {
    lines.push(`Split digraph: detected`);
  }

  lines.push('');
  lines.push('Segments:');
  for (const seg of result.segments) {
    const status = seg.aligned ? '✓' : '✗';
    const gpc = seg.gpcId ?? 'none';
    const matchType = seg.matchType ?? 'none';
    lines.push(`  ${status} "${seg.grapheme}" → ${seg.phoneme || '(silent)'} [${gpc}] (${matchType})`);
    if (seg.issue) {
      lines.push(`      Issue: ${seg.issue}`);
    }
    if (seg.alternatives && seg.alternatives.length > 0) {
      lines.push(`      Alternatives: ${seg.alternatives.join(', ')}`);
    }
  }

  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Catalogue Filtering
// =============================================================================

/**
 * Create a catalogue index with only teaching-level GPCs
 */
export function getTeachingIndex(): GPCCatalogueIndex {
  const teaching = filterByTag(GPC_CATALOGUE, 'teaching-v0.2');
  return buildCatalogueIndex(teaching);
}

/**
 * Create a catalogue index with extended teaching GPCs (v0.2 + v0.3)
 */
export function getExtendedTeachingIndex(): GPCCatalogueIndex {
  const extended = GPC_CATALOGUE.filter(
    (gpc) =>
      gpc.tags?.includes('teaching-v0.2') || gpc.tags?.includes('teaching-v0.3')
  );
  return buildCatalogueIndex(extended);
}

/**
 * Create a catalogue index for comprehensive analysis
 */
export function getComprehensiveIndex(): GPCCatalogueIndex {
  const comprehensive = GPC_CATALOGUE.filter(
    (gpc) =>
      gpc.tags?.includes('teaching-v0.2') ||
      gpc.tags?.includes('teaching-v0.3') ||
      gpc.tags?.includes('teaching-v0.4') ||
      gpc.tags?.includes('analysis')
  );
  return buildCatalogueIndex(comprehensive);
}
