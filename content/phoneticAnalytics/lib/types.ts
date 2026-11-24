/**
 * Core Types for Phonetic Analytics Library
 *
 * All phoneme representations use ARPAbet notation.
 * See /ref/arpabet-phonemes.md for the complete reference.
 */

import type { MatchType, GPCEntry } from './catalogue';

// =============================================================================
// ARPAbet Phoneme Types
// =============================================================================

/**
 * ARPAbet vowel phonemes (without stress markers)
 */
export type ArpabetVowel =
  // Monophthongs
  | 'AA'  // father, bot
  | 'AE'  // cat, bat
  | 'AH'  // but, about (schwa when unstressed)
  | 'AO'  // caught, law
  | 'EH'  // bet, red
  | 'ER'  // bird, her (r-colored)
  | 'IH'  // bit, sit
  | 'IY'  // beat, see
  | 'UH'  // book, put
  | 'UW'  // boot, blue
  // Diphthongs
  | 'AW'  // house, now
  | 'AY'  // bite, my
  | 'EY'  // bait, day
  | 'OW'  // boat, go
  | 'OY'; // boy, toy

/**
 * ARPAbet consonant phonemes
 */
export type ArpabetConsonant =
  // Stops
  | 'P'   // pat
  | 'B'   // bat
  | 'T'   // tap
  | 'D'   // dab
  | 'K'   // cat, kit
  | 'G'   // got
  // Fricatives
  | 'F'   // fat
  | 'V'   // vat
  | 'TH'  // thin (voiceless)
  | 'DH'  // this (voiced)
  | 'S'   // sit
  | 'Z'   // zip
  | 'SH'  // ship
  | 'ZH'  // measure
  | 'HH'  // hat
  // Affricates
  | 'CH'  // chip
  | 'JH'  // jump, bridge
  // Nasals
  | 'M'   // mat
  | 'N'   // nap
  | 'NG'  // sing
  // Liquids
  | 'L'   // left
  | 'R'   // red
  // Glides
  | 'W'   // wet
  | 'Y';  // yes

/**
 * Any ARPAbet phoneme (vowel or consonant)
 */
export type ArpabetPhoneme = ArpabetVowel | ArpabetConsonant;

/**
 * ARPAbet phoneme with optional stress marker (0, 1, 2) on vowels
 */
export type ArpabetWithStress = ArpabetPhoneme | `${ArpabetVowel}${'0' | '1' | '2'}`;

// =============================================================================
// Alignment Segment Types
// =============================================================================

/**
 * A segment of an aligned word: one grapheme mapped to phoneme(s)
 *
 * Enhanced from v1 to include:
 * - Per-segment alignment status
 * - Match type information
 * - Confidence scoring
 * - Diagnostic information
 */
export interface AlignmentSegment {
  /** The text consumed (e.g., "sh", "a_e", "igh") */
  grapheme: string;

  /** The phoneme(s) produced (e.g., "SH", "EY", "K S") */
  phoneme: string;

  /** The governing GPC ID, or null if no GPC matched */
  gpcId: string | null;

  /** How the GPC matched, or null if no match */
  matchType: MatchType | null;

  /** Start index in the original word (0-based) */
  startPos: number;

  /** End index in the original word (exclusive) */
  endPos: number;

  /** Whether a GPC successfully governed this segment */
  aligned: boolean;

  /**
   * Confidence score from 0.0 to 1.0
   * - 1.0 = unambiguous match
   * - <1.0 = ambiguity exists (multiple GPCs could apply)
   */
  confidence: number;

  /** Diagnostic message if alignment failed */
  issue?: string;

  /** Alternative GPC IDs that could have matched (for ambiguity tracking) */
  alternatives?: string[];
}

/**
 * Status of alignment for tracking partial results
 */
export type AlignmentStatus =
  | 'full'     // All segments aligned successfully
  | 'partial'  // Some segments aligned, some failed
  | 'failed';  // No segments aligned

// =============================================================================
// Alignment Result Types
// =============================================================================

/**
 * Result of aligning a word's spelling to its phonemes
 *
 * Enhanced from v1 to always return best-effort results with per-segment status.
 */
export interface AlignmentResult {
  // ---- Input Echo ----

  /** The word that was aligned */
  word: string;

  /** The phonemes (stress-stripped) that were aligned against */
  phonemes: ArpabetPhoneme[];

  // ---- Segments (always populated) ----

  /** Aligned segments (best-effort, even on partial failure) */
  segments: AlignmentSegment[];

  // ---- Summary Statistics ----

  /** Overall alignment status */
  status: AlignmentStatus;

  /** Whether all segments have aligned=true */
  fullyAligned: boolean;

  /** Count of aligned segments */
  alignedCount: number;

  /** Total segment count */
  totalCount: number;

  /** Alignment rate: alignedCount / totalCount */
  alignmentRate: number;

  // ---- Pattern Detection ----

  /** Detected word pattern (e.g., "CVC", "CVCe", "CCVC") */
  pattern: string;

  /** Whether this word uses a split digraph pattern */
  hasSplitDigraph: boolean;

  // ---- GPC Summary ----

  /** List of GPC IDs used in aligned segments */
  gpcs: string[];

  // ---- Diagnostics ----

  /** All issues encountered during alignment */
  issues: string[];
}

// =============================================================================
// Decode Segment Types
// =============================================================================

/**
 * A segment from decode (text-only, no phoneme oracle)
 *
 * Decode differs from alignment in that it must predict phonemes
 * without knowing the correct pronunciation.
 */
export interface DecodeSegment {
  /** The text consumed */
  grapheme: string;

  /** The predicted phoneme(s) based on GPCs */
  phoneme: string;

  /** The GPC ID used for prediction, or null if unknown grapheme */
  gpcId: string | null;

  /** Start index in the original word */
  startPos: number;

  /** End index in the original word (exclusive) */
  endPos: number;

  /** Whether multiple GPCs could have produced different phonemes */
  ambiguous: boolean;

  /**
   * Confidence score for the prediction
   * - 1.0 = single GPC applies, unambiguous
   * - <1.0 = multiple GPCs could apply
   */
  confidence: number;

  /** Alternative GPC IDs that could have applied (if ambiguous) */
  competitors?: string[];

  /** Alternative phonemes that could have been produced */
  alternativePhonemes?: string[];
}

// =============================================================================
// Decode Result Types
// =============================================================================

/**
 * Result of decoding a word (predicting pronunciation from spelling)
 */
export interface DecodeResult {
  // ---- Input ----

  /** The word that was decoded */
  word: string;

  // ---- Output ----

  /** Predicted phonemes based on GPCs */
  predictedPhonemes: string[];

  /** Decode segments with prediction details */
  segments: DecodeSegment[];

  // ---- Confidence ----

  /** Whether the prediction is unambiguous */
  unambiguous: boolean;

  /** Overall confidence (product or min of segment confidences) */
  confidence: number;

  /** Whether all graphemes were covered by GPCs */
  fullyCovered: boolean;

  /** Count of segments with unknown graphemes */
  unknownCount: number;

  // ---- Alternatives ----

  /** Alternative pronunciations if ambiguous */
  alternativePronunciations?: string[][];

  /** Segments where ambiguity exists */
  ambiguousSegments: DecodeSegment[];
}

// =============================================================================
// Match Result Types
// =============================================================================

/**
 * Result of a GPC attempting to match at a position
 *
 * This is the internal type used by match functions, not exposed to consumers.
 */
export interface MatchResult {
  /** Number of characters consumed from the text */
  consumedText: number;

  /** Number of phonemes consumed (for alignment mode) */
  consumedPhonemes: number;

  /**
   * For split digraphs: signals that the final-e is "reserved"
   * and should not be processed as a separate grapheme.
   */
  marksEndSilent?: boolean;

  /** Confidence of this match (1.0 if unambiguous) */
  confidence?: number;
}

/**
 * Context passed to match functions
 */
export interface MatchContext {
  /** The complete word being processed */
  word: string;

  /** Current position in the word (0-based) */
  pos: number;

  /** Phonemes for the word (alignment mode only) */
  phonemes?: ArpabetPhoneme[];

  /** Current phoneme index (alignment mode only) */
  phonemeIdx?: number;

  /** Whether we're in alignment mode (true) or decode mode (false) */
  isAlignment: boolean;

  /** Whether a split digraph has been detected for this word */
  hasSplitDigraph?: boolean;

  /** Position of the final-e if split digraph detected */
  splitDigraphEndPos?: number;
}

// =============================================================================
// Alignment Engine Configuration
// =============================================================================

/**
 * Configuration options for the alignment engine
 */
export interface AlignmentConfig {
  /**
   * Whether to attempt partial alignment on failure.
   * If false, returns empty segments on first failure.
   * Default: true
   */
  allowPartial?: boolean;

  /**
   * Whether to track alternative GPCs for ambiguity analysis.
   * Default: true
   */
  trackAlternatives?: boolean;

  /**
   * Maximum number of alternative GPCs to track per segment.
   * Default: 3
   */
  maxAlternatives?: number;

  /**
   * Whether to detect and handle split digraph patterns.
   * Default: true
   */
  handleSplitDigraphs?: boolean;

  /**
   * Catalogue subset to use (by tag).
   * If not specified, uses all GPCs.
   */
  catalogueTag?: string;
}

/**
 * Configuration options for the decode engine
 */
export interface DecodeConfig {
  /**
   * Whether to generate alternative pronunciations.
   * Default: false (performance optimization)
   */
  generateAlternatives?: boolean;

  /**
   * Maximum number of alternative pronunciations to generate.
   * Default: 5
   */
  maxAlternatives?: number;

  /**
   * Whether to detect and handle split digraph patterns.
   * Default: true
   */
  handleSplitDigraphs?: boolean;

  /**
   * Catalogue subset to use (by tag).
   * If not specified, uses all GPCs.
   */
  catalogueTag?: string;
}

// =============================================================================
// Scoring Integration Types
// =============================================================================

/**
 * Score for a single segment based on learner competency (v2 version)
 */
export interface SegmentScore {
  /** The grapheme */
  grapheme: string;

  /** The phoneme */
  phoneme: string;

  /** The GPC ID (null if unaligned) */
  gpcId: string | null;

  /** Score from 0.0 (unknown) to 1.0 (fully known) */
  score: number;

  /** Whether this segment was aligned */
  aligned: boolean;
}

/**
 * Score for an entire word (v2 version with partial alignment support)
 */
export interface WordScore {
  /** The word */
  word: string;

  /** Aggregate score */
  score: number;

  /** Individual segment scores */
  segments: SegmentScore[];

  /** Alignment status */
  status: AlignmentStatus;

  /** Alignment rate (0.0-1.0) */
  alignmentRate: number;

  /** Error message if applicable */
  issue?: string;
}

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Result of validating a word against predicted decode
 */
export interface ValidationResult {
  /** The word being validated */
  word: string;

  /** Known correct phonemes */
  actualPhonemes: ArpabetPhoneme[];

  /** Decoded/predicted phonemes */
  predictedPhonemes: string[];

  /** Whether prediction matches actual */
  correct: boolean;

  /** Whether decode was unambiguous */
  unambiguous: boolean;

  /** Number of phonemes that matched */
  matchedCount: number;

  /** Total phoneme count */
  totalCount: number;

  /** Match rate (0.0-1.0) */
  matchRate: number;

  /** Positions where prediction diverged from actual */
  divergencePositions: number[];
}

// =============================================================================
// Corpus Analysis Types
// =============================================================================

/**
 * Statistics from running alignment on a corpus
 */
export interface CorpusAlignmentStats {
  /** Total words processed */
  totalWords: number;

  /** Words that fully aligned */
  fullyAlignedWords: number;

  /** Words with partial alignment */
  partiallyAlignedWords: number;

  /** Words that failed completely */
  failedWords: number;

  /** Full alignment rate */
  fullAlignmentRate: number;

  /** Average alignment rate across all words */
  averageAlignmentRate: number;

  /** Sum of frequencies for fully aligned words */
  coveredFrequency: number;

  /** Total frequency in corpus */
  totalFrequency: number;

  /** Frequency-weighted coverage */
  frequencyCoverage: number;

  /** Most common issues encountered */
  topIssues: Array<{ issue: string; count: number }>;

  /** GPC usage statistics */
  gpcUsage: Map<string, number>;
}

/**
 * Statistics from running decode validation on a corpus
 */
export interface CorpusDecodeStats {
  /** Total words processed */
  totalWords: number;

  /** Words with correct unambiguous decode */
  correctUnambiguous: number;

  /** Words with correct ambiguous decode (correct was one of the options) */
  correctAmbiguous: number;

  /** Words with incorrect decode */
  incorrect: number;

  /** Words with unknown graphemes */
  withUnknownGraphemes: number;

  /** Unambiguous decode accuracy */
  unambiguousAccuracy: number;

  /** Overall accuracy (including ambiguous) */
  overallAccuracy: number;

  /** Most common decode errors */
  topErrors: Array<{
    word: string;
    actual: string[];
    predicted: string[];
    count: number;
  }>;
}

// =============================================================================
// Coverage and Progression Types
// =============================================================================

/**
 * Statistics for a single GPC across a corpus
 */
export interface GPCStats {
  /** GPC ID */
  id: string;
  /** Grapheme */
  grapheme: string;
  /** Phoneme */
  phoneme: string;
  /** Number of words using this GPC */
  wordCount: number;
  /** Sum of frequencies of words using this GPC */
  totalFrequency: number;
  /** Top words by frequency that use this GPC */
  topWords: string[];
}

/**
 * Result of coverage analysis
 */
export interface CoverageResult {
  /** Sum of all word frequencies in corpus */
  totalFrequency: number;
  /** Sum of frequencies for fully decodable words */
  coveredFrequency: number;
  /** Percentage of corpus that is decodable */
  coveragePercent: number;
  /** Weighted score accounting for partial knowledge */
  weightedScore: number;
  /** Count of fully decodable words */
  coveredWords: number;
  /** Count of partially decodable words */
  partialWords: number;
  /** Count of words that failed alignment */
  failedWords: number;
}

/**
 * A step in the GPC teaching progression
 */
export interface ProgressionStep {
  /** Step number (1-indexed) */
  step: number;
  /** GPC taught at this step */
  gpcId: string;
  /** Grapheme */
  grapheme: string;
  /** Phoneme */
  phoneme: string;
  /** New words unlocked at this step (sample, may be capped) */
  newWords: string[];
  /** Total count of new words unlocked at this step */
  newWordCount: number;
  /** Frequency of newly unlocked words */
  addedFrequency: number;
  /** Cumulative frequency coverage after this step */
  cumulativeFrequency: number;
  /** Cumulative coverage percentage */
  coveragePercent: number;
}

// =============================================================================
// Confusion Analysis Types
// =============================================================================

/**
 * A word that becomes a "trap" when a GPC is partially learned
 *
 * Example: Learning GPC-i-IH creates a trap for "high" where i→AY not IH
 */
export interface ConfusionTrap {
  /** The word that would be misdecoded */
  word: string;
  /** Frequency of this word */
  frequency: number;
  /** The correct GPC for this grapheme in this word */
  correctGpc: string;
  /** The GPC the learner might wrongly apply */
  confusingGpc: string;
  /** The shared grapheme */
  grapheme: string;
}

/**
 * Confusion profile for a single GPC
 */
export interface GPCConfusionProfile {
  /** GPC ID */
  gpcId: string;
  /** Grapheme */
  grapheme: string;
  /** Phoneme */
  phoneme: string;
  /** Words correctly decoded by this GPC */
  correctWords: Array<{ word: string; frequency: number }>;
  /** Words where this GPC's grapheme appears but phoneme differs */
  confusionTraps: ConfusionTrap[];
  /** Total frequency of correctly decoded words */
  correctFrequency: number;
  /** Total frequency of confusion trap words */
  confusionFrequency: number;
  /** Ratio of correct to (correct + confusion): higher = "cleaner" GPC */
  clarityRatio: number;
}

// =============================================================================
// Visual Utility Types
// =============================================================================

/**
 * Visual complexity factors for a letter
 */
export interface LetterVisualProfile {
  /** The letter (a-z) */
  letter: string;
  /** Case similarity: 0-100, how similar are uppercase/lowercase */
  caseSimilarity: number;
  /** Font regularity: 0-100, how consistent across fonts */
  fontRegularity: number;
  /** Notes about visual properties */
  notes: string;
}

/**
 * Combined utility score for a GPC
 */
export interface GPCUtilityScore {
  /** GPC ID */
  gpcId: string;
  /** Frequency-based utility (from corpus) */
  frequencyScore: number;
  /** Phoneme reliability (how consistent is this grapheme→phoneme) */
  reliabilityScore: number;
  /** Visual utility (case similarity × font regularity) */
  visualScore: number;
  /** Combined score: frequency × reliability × visual */
  compositeScore: number;
}