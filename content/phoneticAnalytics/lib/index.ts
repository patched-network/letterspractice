/**
 * Phonetic Analytics Library
 *
 * A TypeScript library for phonetic analysis of English grapheme-phoneme
 * correspondences (GPCs), optimized for early literacy curriculum design.
 *
 * All phoneme representations use ARPAbet notation (CMU Dictionary standard).
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // ARPAbet types
  ArpabetVowel,
  ArpabetConsonant,
  ArpabetPhoneme,
  ArpabetWithStress,

  // Alignment types
  AlignmentSegment,
  AlignmentResult,

  // Match types
  MatchResult,

  // Scoring types
  SegmentScore,
  WordScore,

  // Coverage types
  GPCStats,
  CoverageResult,
  ProgressionStep,

  // Confusion types
  ConfusionTrap,
  GPCConfusionProfile,

  // Visual utility types
  LetterVisualProfile,
  GPCUtilityScore,
} from "./types";

// =============================================================================
// ARPAbet Constants
// =============================================================================

export {
  // Phoneme sets
  VOWELS,
  CONSONANTS,
  VOWEL_SET,
  CONSONANT_SET,
  PHONEME_SET,

  // Phoneme subcategories
  MONOPHTHONGS,
  DIPHTHONGS,
  STOPS,
  FRICATIVES,
  AFFRICATES,
  NASALS,
  LIQUIDS,
  GLIDES,
  VOICED_CONSONANTS,
  VOICELESS_CONSONANTS,
  VOICING_PAIRS,

  // Pedagogical mappings
  SHORT_VOWELS,
  LONG_VOWELS,

  // IPA conversion
  ARPABET_TO_IPA,
} from "./arpabet";

// =============================================================================
// ARPAbet Utilities
// =============================================================================

export {
  // Stress handling
  stripStress,
  getStress,

  // Phoneme classification
  isVowel,
  isConsonant,
  isValidPhoneme,
  isDiphthong,
  isMonophthong,

  // Validation & type guards
  isArpabetWithStress,
  toArpabetWithStressArray,

  // Syllable analysis
  countVowels,
  isMonosyllabic,

  // Voicing
  getVoicingCounterpart,

  // GPC ID helpers
  phonemeSeqToId,
  idToPhonemeSeq,
  parseGpcId,

  // IPA conversion
  toIPA,
} from "./arpabet";

// =============================================================================
// Dictionary (CMU Pronouncing Dictionary + SUBTLEX Frequency)
// =============================================================================

export {
  // Types
  type DictionaryEntry,

  // Paths
  DEFAULT_CMUDICT_PATH,
  DEFAULT_SUBTLEX_PATH,

  // Loading functions
  loadCmudict,
  loadSubtlex,
  loadDictionary,

  // Singleton getters
  getCmudict,
  getSubtlex,
  getDictionary,

  // Cache management
  clearCmudictCache,
  clearDictionaryCache,

  // Lookup functions
  lookupWord,
  lookupPronunciation,
  lookupFrequency,
  hasWord,

  // Word lists
  getAllWords,
  getWordsWithFrequency,

  // Statistics
  getCmudictStats,
  getDictionaryStats,
} from "./dictionary";

// =============================================================================
// Coverage Optimization
// =============================================================================

export {
  // Main optimization function
  computeOptimalSequence,

  // Types
  type CoverageOptions,
  type CoverageSequence,

  // Analysis functions
  findGatewayGpcs,
  findFoundationGpcs,
  findCoveragePlateau,

  // Reporting
  formatCoverageReport,
} from "./coverage";

// =============================================================================
// Catalogue v2 (Operational GPCs)
// =============================================================================

export {
  // Match type definitions
  MATCH_TYPES,
  type MatchType,
  type SplitAllows,
  type ContextBeforeParams,
  type ContextAfterParams,
  type SplitDigraphParams,
  type PositionParams,
  type MatchParams,

  // Phoneme specification types
  type PhonemeSpec,
  phonemeSpec,
  parsePhonemeSpec,
  isSilentPhoneme,
  countPhonemes,

  // GPC category definitions
  GPC_CATEGORIES,
  type GPCCategory,

  // GPC entry type
  type GPCEntry,

  // Factory functions
  buildGpcId,
  calculateDefaultPriority,
  simpleGpc,
  digraphGpc,
  trigraphGpc,
  contextBeforeGpc,
  splitDigraphGpc,
  positionFinalGpc,
  positionInitialGpc,
  silentGpc,

  // Type guards
  isContextBeforeParams,
  isContextAfterParams,
  isSplitDigraphParams,

  // Catalogue data
  GPC_CATALOGUE,
  CATALOGUE_META,

  // Index types and functions
  type GPCCatalogueIndex,
  buildCatalogueIndex,
  getDefaultCatalogueIndex,

  // Filtering
  filterByTag,
  filterByCategory,
  filterByMatchType,
  getTeachingCatalogue,
  getExtendedTeachingCatalogue,
  getComprehensiveCatalogue,
  getFullCatalogue,
} from "./catalogue";

// =============================================================================
// Match Types (v2 Matching Engine)
// =============================================================================

export {
  // Individual match functions
  matchSimple,
  matchDigraph,
  matchTrigraph,
  matchSplitDigraph,
  matchContextBefore,
  matchContextAfter,
  matchPositionInitial,
  matchPositionFinal,
  matchSilent,

  // Unified matching
  tryMatch,
  tryMatchWithOracle,

  // Split digraph detection
  detectSplitDigraph,

  // Utilities
  isConsonantLetter,
  isVowelLetter,
  getWordPattern,
  compressPattern,
} from "./match-types";

// =============================================================================
// Additional Types (from types.ts)
// =============================================================================

export type {
  // Additional type exports that weren't included in the main types section
  AlignmentStatus,
  DecodeSegment,
  DecodeResult,
  MatchContext,
  AlignmentConfig,
  DecodeConfig,
  CorpusAlignmentStats,
  CorpusDecodeStats,
  ValidationResult,
} from "./types";

// =============================================================================
// Alignment v2 (Enhanced Alignment Engine)
// =============================================================================

export {
  // Core alignment
  alignWord,
  DEFAULT_ALIGNMENT_CONFIG,

  // Batch alignment
  alignBatchV2,
  type BatchAlignmentResult,

  // Convenience functions
  isFullyAlignedV2,
  getAlignmentRateV2,
  extractGpcsV2,
  formatAlignmentV2,

  // Catalogue filtering
  getTeachingIndex,
  getExtendedTeachingIndex,
  getComprehensiveIndex,
} from "./alignment";

// =============================================================================
// Decode v2 (Pronunciation Prediction)
// =============================================================================

export {
  // Core decode
  decodeWord,
  DEFAULT_DECODE_CONFIG,

  // Batch decode
  decodeBatch,
  type BatchDecodeResult,

  // Validation
  validateDecode,
  validateDecodeWithAlternatives,

  // Convenience functions
  quickDecode,
  isUnambiguous,
  getDecodeConfidence,
  formatDecode,

  // Catalogue filtering
  getTeachingDecodeIndex,
  getExtendedDecodeIndex,
} from "./decode";

// =============================================================================
// Chunk Builder (Alignment → PhoneticChunks for stepper UI)
// =============================================================================

export {
  // Core function
  alignmentToChunks,

  // Types
  type PhoneticChunk,
} from "./chunk-builder";

// =============================================================================
// Minimal Pairs (Word Contrast Detection)
// =============================================================================

export {
  // Types
  type ContrastPosition,
  type MinimalPairInfo,
  type WordWithPhonemes,
  type MinimalPairIndex,
  type MinimalPairStats,

  // GPC-level types (recommended)
  type WordWithGpcs,
  type GpcMinimalPairInfo,
  type GpcMinimalPairIndex,

  // GPC-level functions (recommended for curriculum)
  buildGpcMinimalPairIndex,
  findGpcMinimalPairs,
  findGpcMinimalPairsByPosition,
  findGpcMinimalPairsByGpc,
  findGpcMinimalPairClusters,
  getGpcMinimalPairStats,
  isGpcMinimalPair,
  findBestGpcMinimalPairs,
  gpcFrequencyScorer,
  filterGpcMinimalPairIndex,
  exportGpcMinimalPairIndex,
  importGpcMinimalPairIndex,

  // Phoneme-level functions (legacy)
  buildMinimalPairIndex,
  findMinimalPairs,
  findMinimalPairsByPosition,
  findMinimalPairsByPhoneme,
  findMinimalPairClusters,
  getMinimalPairStats,
  isMinimalPair,
  findBestMinimalPairs,
  frequencyScorer,
  filterMinimalPairIndex,
  exportMinimalPairIndex,
  importMinimalPairIndex,
} from "./minimal-pairs";

// =============================================================================
// Word Filtering (Child-Friendliness)
// =============================================================================

export {
  // Types
  type WordFilterConfig,
  type WordFilter,
  type WordFilterStats,

  // Factory function
  createWordFilter,

  // Pre-built filters
  createStrictChildFilter,
  createModerateChildFilter,
  createMinimalFilter,

  // Default data
  DEFAULT_BLACKLIST,
  DEFAULT_PROPER_NOUNS,

  // Utility functions
  mergeBlacklists,
  createBlacklist,
  extendBlacklist,
  reduceBlacklist,
  containsBlacklistedSubstring,
  looksLikeProfanity,
} from "./word-filter";
