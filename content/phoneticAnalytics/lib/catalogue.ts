/**
 * GPC Catalogue v2: Operational Grapheme-Phoneme Correspondences
 *
 * This module defines GPCs as first-class TypeScript structures with
 * operational semantics (match types, parameters, etc.) rather than
 * plain JSON data.
 *
 * Key differences from v1:
 * - MatchType is a discriminated union, not a string
 * - MatchParams are type-safe per match type
 * - GPCs carry enough information for the alignment/decode engines
 * - Categories and phonemes use existing typed constants
 *
 * @see alignment-v2.md for the full specification
 */

import type { ArpabetPhoneme } from './types';

// =============================================================================
// Match Type Definitions
// =============================================================================

/**
 * How a GPC matches against text.
 *
 * Each match type has specific matching semantics:
 * - `simple`: Direct grapheme match (most common)
 * - `digraph`: Two-letter grapheme, simple match
 * - `trigraph`: Three-letter grapheme, simple match
 * - `split_digraph`: Vowel...e with consonant(s) between (a_e, i_e, etc.)
 * - `context_before`: Match depends on following character(s)
 * - `context_after`: Match depends on preceding character(s)
 * - `position_initial`: Only matches at word start
 * - `position_final`: Only matches at word end
 * - `silent`: Grapheme produces no phoneme (empty)
 * - `whole_word`: Entire word match (for irregular sight words)
 */
export const MATCH_TYPES = [
  'simple',
  'digraph',
  'trigraph',
  'split_digraph',
  'context_before',
  'context_after',
  'position_initial',
  'position_final',
  'silent',
  'whole_word',
] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

// =============================================================================
// Phoneme Specification Types
// =============================================================================

/**
 * A phoneme specification for a GPC.
 *
 * Can be:
 * - A single ARPAbet phoneme: "SH", "K", "AE"
 * - A space-separated sequence of phonemes: "K S", "AO L", "F R AH M"
 * - An empty string for silent graphemes: ""
 *
 * This is a plain string type to enable ergonomic authoring in the catalogue
 * (avoiding complex template literal unions that cause TS2590 errors).
 * Use `phonemeSpec()` to construct safely and `parsePhonemeSpec()` to parse.
 *
 * Runtime validation ensures only valid ARPAbet phonemes are used.
 */
export type PhonemeSpec = string;

/**
 * Helper to create a PhonemeSpec from individual phonemes
 */
export function phonemeSpec(...phonemes: ArpabetPhoneme[]): PhonemeSpec {
  return phonemes.join(' ') as PhonemeSpec;
}

/**
 * Parse a PhonemeSpec into individual phonemes
 */
export function parsePhonemeSpec(spec: PhonemeSpec): ArpabetPhoneme[] {
  if (spec === '') return [];
  return spec.split(' ') as ArpabetPhoneme[];
}

/**
 * Check if a PhonemeSpec is silent (empty)
 */
export function isSilentPhoneme(spec: PhonemeSpec): spec is '' {
  return spec === '';
}

/**
 * Count phonemes in a PhonemeSpec
 */
export function countPhonemes(spec: PhonemeSpec): number {
  if (spec === '') return 0;
  return spec.split(' ').length;
}

/**
 * How many consonants can appear between vowel and final-e in a split digraph
 */
export type SplitAllows = 'C' | 'CC' | 'CCC';

/**
 * Parameters for context_before match type
 */
export interface ContextBeforeParams {
  /** Characters that must follow the grapheme for this GPC to match */
  requireAfter: string[];
}

/**
 * Parameters for context_after match type
 */
export interface ContextAfterParams {
  /** Characters that must precede the grapheme for this GPC to match */
  requireBefore: string[];
}

/**
 * Parameters for split_digraph match type
 */
export interface SplitDigraphParams {
  /** How many consonants are allowed between vowel and final-e */
  splitAllows: SplitAllows;
}

/**
 * Parameters for position-based match types
 */
export interface PositionParams {
  /** If true, must be ONLY at that position (not just include it) */
  positionStrict?: boolean;
}

/**
 * Union of all possible match parameters
 */
export type MatchParams =
  | ContextBeforeParams
  | ContextAfterParams
  | SplitDigraphParams
  | PositionParams
  | undefined;

// =============================================================================
// GPC Category Definitions
// =============================================================================

/**
 * Categories of graphemes in the v2 catalogue
 *
 * Extended from v1 to include operational categories
 */
export const GPC_CATEGORIES = [
  'consonants',
  'consonants_soft',
  'digraphs',
  'trigraphs',
  'doubled_consonants',
  'silent_patterns',
  'latinate_digraphs',
  'vowels_short',
  'vowels_long_split',
  'vowels_teams',
  'vowels_r_controlled',
  'vowels_l_controlled',
  'vowels_final_open',
  'vowels_diphthong_extended',
  'syllabic_consonants',
  'sight_words',
] as const;

export type GPCCategory = (typeof GPC_CATEGORIES)[number];

// =============================================================================
// GPC Entry Definition
// =============================================================================

/**
 * A GPC entry with operational semantics
 *
 * This is the "operational" GPC that carries enough information
 * for the alignment and decode engines to process it without
 * special-case logic.
 */
export interface GPCEntry {
  /** Unique identifier: "GPC-c-S-soft", "GPC-a_e-EY" */
  readonly id: string;

  /** The written representation: "c", "sh", "a_e", "igh" */
  readonly grapheme: string;

  /**
   * ARPAbet phoneme(s) produced.
   * Single phoneme: "SH"
   * Multi-phoneme sequence: "K S" (space-separated)
   * Silent: "" (empty string)
   */
  readonly phoneme: PhonemeSpec;

  /** Category for organization/filtering */
  readonly category: GPCCategory;

  /** How this GPC matches text */
  readonly matchType: MatchType;

  /** Type-specific parameters (if needed) */
  readonly matchParams?: MatchParams;

  /**
   * Priority for matching (higher = try first).
   * Used to resolve ambiguity when multiple GPCs could match.
   * Default: based on grapheme length + match type specificity.
   */
  readonly priority?: number;

  /**
   * Tags for filtering/grouping.
   * Examples: ['teaching-v0.2'], ['analysis-only'], ['french-origin']
   */
  readonly tags?: readonly string[];

  /**
   * Sight words only: which letters make which sound, where the chunk
   * builder's guess at the odd part is wrong. One `|`-separated part per
   * phoneme, in order. Letters no part takes are silent; a part repeated is
   * the same letters making another sound ("o|o|n": one's o is /w/ then /ʌ/).
   */
  readonly parts?: string;
}

// =============================================================================
// Match Result Type
// =============================================================================

/**
 * Result of a GPC attempting to match at a position in text
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
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build a GPC ID from components
 *
 * @example
 * buildGpcId('sh', 'SH')           // => 'GPC-sh-SH'
 * buildGpcId('c', 'S', 'soft')     // => 'GPC-c-S-soft'
 * buildGpcId('a_e', 'EY')          // => 'GPC-a_e-EY'
 * buildGpcId('x', 'K S')           // => 'GPC-x-K_S'
 */
export function buildGpcId(
  grapheme: string,
  phoneme: PhonemeSpec,
  suffix?: string
): string {
  const phonemePart = phoneme.replace(/ /g, '_');
  const base = `GPC-${grapheme}-${phonemePart}`;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Calculate default priority for a GPC based on its properties
 *
 * Higher priority = tried first during matching.
 * Rules:
 * 1. Longer graphemes have higher priority (trigraph > digraph > single)
 * 2. Context-sensitive matches have higher priority than simple
 * 3. Split digraphs have special priority (checked during pattern detection)
 */
export function calculateDefaultPriority(gpc: GPCEntry): number {
  let priority = 0;

  // Grapheme length (10 points per character)
  priority += gpc.grapheme.replace(/_/g, '').length * 10;

  // Match type specificity
  switch (gpc.matchType) {
    case 'context_before':
    case 'context_after':
      priority += 5; // Context-sensitive beats simple
      break;
    case 'position_initial':
    case 'position_final':
      priority += 3; // Positional is somewhat specific
      break;
    case 'split_digraph':
      priority += 20; // Split digraphs need early detection
      break;
    case 'silent':
      priority += 15; // Silent patterns should match before simple
      break;
    case 'trigraph':
      priority += 2; // Slight boost for trigraphs
      break;
    case 'digraph':
      priority += 1; // Slight boost for digraphs
      break;
    case 'whole_word':
      priority += 100; // Sight words match entire word, highest priority
      break;
    default:
      break;
  }

  return priority;
}

/**
 * Type guard: check if params are for context_before
 */
export function isContextBeforeParams(
  params: MatchParams
): params is ContextBeforeParams {
  return (
    params !== undefined &&
    'requireAfter' in params &&
    Array.isArray((params as ContextBeforeParams).requireAfter)
  );
}

/**
 * Type guard: check if params are for context_after
 */
export function isContextAfterParams(
  params: MatchParams
): params is ContextAfterParams {
  return (
    params !== undefined &&
    'requireBefore' in params &&
    Array.isArray((params as ContextAfterParams).requireBefore)
  );
}

/**
 * Type guard: check if params are for split_digraph
 */
export function isSplitDigraphParams(
  params: MatchParams
): params is SplitDigraphParams {
  return (
    params !== undefined &&
    'splitAllows' in params &&
    ['C', 'CC', 'CCC'].includes((params as SplitDigraphParams).splitAllows)
  );
}

// =============================================================================
// GPC Factory Functions
// =============================================================================

/**
 * Create a simple GPC (direct grapheme → phoneme mapping)
 */
export function simpleGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory,
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme),
    grapheme,
    phoneme,
    category,
    matchType: 'simple',
    ...options,
  };
}

/**
 * Create a digraph GPC
 */
export function digraphGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory = 'digraphs',
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme),
    grapheme,
    phoneme,
    category,
    matchType: 'digraph',
    ...options,
  };
}

/**
 * Create a trigraph GPC
 */
export function trigraphGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory = 'trigraphs',
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme),
    grapheme,
    phoneme,
    category,
    matchType: 'trigraph',
    ...options,
  };
}

/**
 * Create a context-before GPC (e.g., soft c before e/i/y)
 */
export function contextBeforeGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  requireAfter: string[],
  category: GPCCategory,
  idSuffix?: string,
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme, idSuffix),
    grapheme,
    phoneme,
    category,
    matchType: 'context_before',
    matchParams: { requireAfter },
    ...options,
  };
}

/**
 * Create a split digraph GPC (e.g., a_e → EY)
 */
export function splitDigraphGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  splitAllows: SplitAllows = 'CC',
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme),
    grapheme,
    phoneme,
    category: 'vowels_long_split',
    matchType: 'split_digraph',
    matchParams: { splitAllows },
    ...options,
  };
}

/**
 * Create a position-final GPC (e.g., e_final → IY)
 */
export function positionFinalGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory = 'vowels_final_open',
  options?: { tags?: string[]; priority?: number; positionStrict?: boolean }
): GPCEntry {
  const { positionStrict, ...rest } = options ?? {};
  return {
    id: buildGpcId(grapheme, phoneme, 'final'),
    grapheme,
    phoneme,
    category,
    matchType: 'position_final',
    matchParams: positionStrict !== undefined ? { positionStrict } : undefined,
    ...rest,
  };
}

/**
 * Create a position-initial GPC (e.g., kn → N at word start)
 */
export function positionInitialGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory = 'silent_patterns',
  options?: { tags?: string[]; priority?: number; positionStrict?: boolean }
): GPCEntry {
  const { positionStrict, ...rest } = options ?? {};
  return {
    id: buildGpcId(grapheme, phoneme, 'initial'),
    grapheme,
    phoneme,
    category,
    matchType: 'position_initial',
    matchParams: positionStrict !== undefined ? { positionStrict } : undefined,
    ...rest,
  };
}

/**
 * Create a silent GPC (grapheme produces empty phoneme)
 */
export function silentGpc(
  grapheme: string,
  phoneme: PhonemeSpec,
  category: GPCCategory = 'silent_patterns',
  options?: { tags?: string[]; priority?: number }
): GPCEntry {
  return {
    id: buildGpcId(grapheme, phoneme),
    grapheme,
    phoneme,
    category,
    matchType: 'silent',
    ...options,
  };
}

/**
 * Create a whole-word sight word GPC
 *
 * These are high-frequency irregular words that are best taught as
 * whole units rather than decoded via GPC rules. The grapheme is
 * the entire word, and it only matches when the input IS that word.
 *
 * @example
 * wholeWordGpc('the', 'DH AH')  // "the" → /ðə/
 * wholeWordGpc('one', 'W AH N') // "one" → /wʌn/
 */
export function wholeWordGpc(
  word: string,
  phoneme: PhonemeSpec,
  options?: { tags?: string[]; priority?: number; parts?: string }
): GPCEntry {
  return {
    id: `GPC-WORD-${word}`,
    grapheme: word,
    phoneme,
    category: 'sight_words',
    matchType: 'whole_word',
    priority: 200, // Very high - match whole word before trying GPCs
    ...options,
  };
}

// =============================================================================
// The Catalogue: Consonants
// =============================================================================

export const CONSONANTS_SIMPLE: readonly GPCEntry[] = [
  simpleGpc('b', 'B', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('d', 'D', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('f', 'F', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('h', 'HH', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('j', 'JH', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('k', 'K', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('l', 'L', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('m', 'M', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('n', 'N', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('p', 'P', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('r', 'R', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('t', 'T', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('v', 'V', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('w', 'W', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('z', 'Z', 'consonants', { tags: ['teaching-v0.2'] }),

  // Ambiguous consonants (multiple phonemes)
  simpleGpc('c', 'K', 'consonants', { tags: ['teaching-v0.2'], priority: 5 }), // hard c (default)
  simpleGpc('g', 'G', 'consonants', { tags: ['teaching-v0.2'], priority: 5 }), // hard g (default)
  simpleGpc('s', 'S', 'consonants', { tags: ['teaching-v0.2'], priority: 5 }),
  simpleGpc('s', 'Z', 'consonants', { tags: ['analysis'] }), // voiced s
  simpleGpc('q', 'K', 'consonants', { tags: ['teaching-v0.2'] }),
  simpleGpc('y', 'Y', 'consonants', { tags: ['teaching-v0.2'] }), // consonant y

  // X produces multiple phonemes
  { id: 'GPC-x-K_S', grapheme: 'x', phoneme: 'K S', category: 'consonants', matchType: 'simple', tags: ['teaching-v0.2'] },
  { id: 'GPC-x-G_Z', grapheme: 'x', phoneme: 'G Z', category: 'consonants', matchType: 'simple', tags: ['analysis'] },
  { id: 'GPC-x-Z', grapheme: 'x', phoneme: 'Z', category: 'consonants', matchType: 'simple', tags: ['analysis'] },
];

export const CONSONANTS_SOFT: readonly GPCEntry[] = [
  // Priority 60: when the e/i/y context matches, soft c/g must beat the hard
  // defaults (priority 5) — without it, decode reads "race"/"city"/"gem" hard.
  // Stays below multi-letter graphemes (100+) so ck/ch/dge etc. win first.

  // Soft C (before e, i, y)
  contextBeforeGpc('c', 'S', ['e', 'i', 'y'], 'consonants_soft', 'soft', { tags: ['teaching-v0.3'], priority: 60 }),

  // Soft G (before e, i, y) - less reliable than soft c
  contextBeforeGpc('g', 'JH', ['e', 'i', 'y'], 'consonants_soft', 'soft', { tags: ['teaching-v0.3'], priority: 60 }),
];

// =============================================================================
// The Catalogue: Digraphs
// =============================================================================

export const DIGRAPHS: readonly GPCEntry[] = [
  // Core teaching digraphs get high priority (100) to beat single-letter consonants (default ~10)
  digraphGpc('th', 'TH', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }), // voiceless: thin
  digraphGpc('th', 'DH', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }), // voiced: this
  digraphGpc('sh', 'SH', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  digraphGpc('ch', 'CH', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  digraphGpc('ch', 'K', 'digraphs', { tags: ['analysis'], priority: 20 }), // Greek origin: chord
  digraphGpc('ch', 'SH', 'digraphs', { tags: ['analysis'], priority: 20 }), // French origin: chef
  digraphGpc('ck', 'K', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  digraphGpc('ng', 'NG', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  { id: 'GPC-ng-N_G', grapheme: 'ng', phoneme: 'N G', category: 'digraphs', matchType: 'digraph', tags: ['analysis'], priority: 20 },
  { id: 'GPC-ng-N_JH', grapheme: 'ng', phoneme: 'N JH', category: 'digraphs', matchType: 'digraph', tags: ['analysis'], priority: 20 },
  { id: 'GPC-nk-NG_K', grapheme: 'nk', phoneme: 'NG K', category: 'digraphs', matchType: 'digraph', tags: ['teaching-v0.2'], priority: 100 }, // think, thank, drink, bank
  digraphGpc('ph', 'F', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  digraphGpc('wh', 'W', 'digraphs', { tags: ['teaching-v0.2'], priority: 100 }),
  { id: 'GPC-wh-HH_W', grapheme: 'wh', phoneme: 'HH W', category: 'digraphs', matchType: 'digraph', tags: ['analysis'], priority: 20 },
  { id: 'GPC-qu-K_W', grapheme: 'qu', phoneme: 'K W', category: 'digraphs', matchType: 'digraph', tags: ['teaching-v0.2'], priority: 100 },
  digraphGpc('gu', 'G', 'digraphs', { tags: ['analysis'], priority: 20 }),
  { id: 'GPC-gu-G_W', grapheme: 'gu', phoneme: 'G W', category: 'digraphs', matchType: 'digraph', tags: ['analysis'], priority: 20 },
  digraphGpc('sc', 'S', 'digraphs', { tags: ['analysis'], priority: 20 }),
  { id: 'GPC-sc-S_K', grapheme: 'sc', phoneme: 'S K', category: 'digraphs', matchType: 'digraph', tags: ['analysis'], priority: 20 },
];

// =============================================================================
// The Catalogue: Trigraphs
// =============================================================================

// Priority 125: teaching trigraphs must beat teaching digraphs (110/120) and
// simple vowels (50) — without an explicit priority they default to 0 and lose
// to everything ("night" decodes n-i-g-h-t). Below split digraphs (150).
export const TRIGRAPHS: readonly GPCEntry[] = [
  trigraphGpc('igh', 'AY', 'trigraphs', { tags: ['teaching-v0.2'], priority: 125 }),
  trigraphGpc('tch', 'CH', 'trigraphs', { tags: ['teaching-v0.2'], priority: 125 }),
  trigraphGpc('dge', 'JH', 'trigraphs', { tags: ['teaching-v0.2'], priority: 125 }),
  { id: 'GPC-sch-S_K', grapheme: 'sch', phoneme: 'S K', category: 'trigraphs', matchType: 'trigraph', tags: ['analysis'] },
  trigraphGpc('sch', 'SH', 'trigraphs', { tags: ['analysis'] }), // German origin
];

// =============================================================================
// The Catalogue: Silent Patterns
// =============================================================================

export const SILENT_PATTERNS: readonly GPCEntry[] = [
  // Initial silent letters (position-specific)
  positionInitialGpc('kn', 'N', 'silent_patterns', { tags: ['teaching-v0.4'], positionStrict: true }),
  positionInitialGpc('wr', 'R', 'silent_patterns', { tags: ['teaching-v0.4'], positionStrict: true }),
  positionInitialGpc('gn', 'N', 'silent_patterns', { tags: ['teaching-v0.4'], positionStrict: true }),
  positionInitialGpc('ps', 'S', 'silent_patterns', { tags: ['analysis'], positionStrict: true }),
  positionInitialGpc('pn', 'N', 'silent_patterns', { tags: ['analysis'], positionStrict: true }),
  positionInitialGpc('rh', 'R', 'silent_patterns', { tags: ['analysis'], positionStrict: true }),

  // Final silent patterns
  silentGpc('mb', 'M', 'silent_patterns', { tags: ['teaching-v0.4'] }),
  silentGpc('bt', 'T', 'silent_patterns', { tags: ['analysis'] }),
  silentGpc('mn', 'M', 'silent_patterns', { tags: ['analysis'] }),

  // gh patterns
  silentGpc('gh', '', 'silent_patterns', { tags: ['teaching-v0.4'] }), // silent gh
  silentGpc('gh', 'F', 'silent_patterns', { tags: ['analysis'] }), // gh as /f/: enough, cough
];

// =============================================================================
// The Catalogue: Latinate Digraphs
// =============================================================================

export const LATINATE_DIGRAPHS: readonly GPCEntry[] = [
  // Latinate digraphs have LOW priority (1) because they only apply in specific morphological
  // contexts (e.g., -tion, -sion). They should match in alignment mode (with oracle) but
  // not override simple consonant+vowel sequences in decode mode.
  digraphGpc('ti', 'SH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // nation, partial
  digraphGpc('si', 'SH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // mansion
  digraphGpc('si', 'ZH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // vision
  digraphGpc('ci', 'SH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // special
  digraphGpc('su', 'SH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // sugar, sure
  digraphGpc('su', 'ZH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // measure
  digraphGpc('tu', 'CH', 'latinate_digraphs', { tags: ['analysis'], priority: 1 }), // nature, picture
];

// =============================================================================
// The Catalogue: Doubled Consonants
// =============================================================================

export const DOUBLED_CONSONANTS: readonly GPCEntry[] = [
  digraphGpc('bb', 'B', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('cc', 'K', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  { id: 'GPC-cc-K_S', grapheme: 'cc', phoneme: 'K S', category: 'doubled_consonants', matchType: 'digraph', tags: ['analysis'] },
  digraphGpc('dd', 'D', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('ff', 'F', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('gg', 'G', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('ll', 'L', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('mm', 'M', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('nn', 'N', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('pp', 'P', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('rr', 'R', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('ss', 'S', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('tt', 'T', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  digraphGpc('zz', 'Z', 'doubled_consonants', { tags: ['teaching-v0.2'] }),
  { id: 'GPC-zz-T_S', grapheme: 'zz', phoneme: 'T S', category: 'doubled_consonants', matchType: 'digraph', tags: ['analysis'] },
];

// =============================================================================
// The Catalogue: Short Vowels
// =============================================================================

export const VOWELS_SHORT: readonly GPCEntry[] = [
  simpleGpc('a', 'AE', 'vowels_short', { tags: ['teaching-v0.2'], priority: 50 }), // cat (default)
  simpleGpc('a', 'AH', 'vowels_short', { tags: ['analysis'], priority: 5 }), // about (schwa)
  simpleGpc('a', 'AA', 'vowels_short', { tags: ['analysis'], priority: 5 }), // father
  simpleGpc('e', 'EH', 'vowels_short', { tags: ['teaching-v0.2'], priority: 50 }), // bed (default)
  simpleGpc('e', 'IH', 'vowels_short', { tags: ['analysis'], priority: 5 }), // pretty
  simpleGpc('i', 'IH', 'vowels_short', { tags: ['teaching-v0.2'], priority: 50 }), // sit
  simpleGpc('o', 'AA', 'vowels_short', { tags: ['teaching-v0.2'], priority: 50 }), // hot (default)
  simpleGpc('o', 'AO', 'vowels_short', { tags: ['analysis'], priority: 5 }), // dog (some dialects)
  simpleGpc('o', 'AH', 'vowels_short', { tags: ['analysis'], priority: 5 }), // son (schwa-like)
  simpleGpc('u', 'AH', 'vowels_short', { tags: ['teaching-v0.2'], priority: 50 }), // cup
  simpleGpc('u', 'UH', 'vowels_short', { tags: ['analysis'], priority: 5 }), // put
];

// =============================================================================
// The Catalogue: Split Digraphs (Magic E)
// =============================================================================

export const VOWELS_LONG_SPLIT: readonly GPCEntry[] = [
  // Split digraphs get priority 150 to beat short vowels (50) and simple consonants
  splitDigraphGpc('a_e', 'EY', 'CC', { tags: ['teaching-v0.2'], priority: 150 }), // cake, made, taste
  splitDigraphGpc('e_e', 'IY', 'CC', { tags: ['teaching-v0.2'], priority: 150 }), // these, eve
  splitDigraphGpc('i_e', 'AY', 'CC', { tags: ['teaching-v0.2'], priority: 150 }), // bike, five, smile
  splitDigraphGpc('o_e', 'OW', 'CC', { tags: ['teaching-v0.2'], priority: 150 }), // home, bone, spoke
  splitDigraphGpc('u_e', 'UW', 'CC', { tags: ['teaching-v0.2'], priority: 150 }), // tube, rule
  { id: 'GPC-u_e-Y_UW', grapheme: 'u_e', phoneme: 'Y UW', category: 'vowels_long_split', matchType: 'split_digraph', matchParams: { splitAllows: 'CC' }, tags: ['teaching-v0.2'], priority: 150 }, // cute, use
];

// =============================================================================
// The Catalogue: Vowel Teams
// =============================================================================

export const VOWELS_TEAMS: readonly GPCEntry[] = [
  // Common teams - teaching level (priority 120 beats short vowels at 50)
  digraphGpc('ay', 'EY', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),
  digraphGpc('ee', 'IY', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),
  digraphGpc('oo', 'UW', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }), // moon
  digraphGpc('oo', 'UH', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }), // book
  digraphGpc('ai', 'EY', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),
  digraphGpc('ai', 'EH', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // said
  digraphGpc('oa', 'OW', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),
  digraphGpc('ow', 'OW', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }), // snow
  digraphGpc('ow', 'AW', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }), // cow
  digraphGpc('ou', 'AW', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }), // out
  digraphGpc('ou', 'UW', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // you
  digraphGpc('ou', 'AH', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // tough
  digraphGpc('ou', 'OW', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // soul
  digraphGpc('oi', 'OY', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),
  digraphGpc('oy', 'OY', 'vowels_teams', { tags: ['teaching-v0.2'], priority: 120 }),

  // Extended teams - v0.3
  digraphGpc('ea', 'IY', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // meat
  digraphGpc('ea', 'EH', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // bread
  digraphGpc('ea', 'EY', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // great
  digraphGpc('ie', 'IY', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // field
  digraphGpc('ie', 'AY', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // pie
  digraphGpc('ie', 'IH', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // friend
  digraphGpc('au', 'AO', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }),
  digraphGpc('au', 'AE', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // laugh
  digraphGpc('aw', 'AO', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }),
  digraphGpc('ew', 'UW', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // new
  { id: 'GPC-ew-Y_UW', grapheme: 'ew', phoneme: 'Y UW', category: 'vowels_teams', matchType: 'digraph', tags: ['teaching-v0.3'], priority: 110 }, // few
  digraphGpc('ew', 'OW', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // sew
  digraphGpc('ue', 'UW', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // blue
  { id: 'GPC-ue-Y_UW', grapheme: 'ue', phoneme: 'Y UW', category: 'vowels_teams', matchType: 'digraph', tags: ['teaching-v0.3'], priority: 110 }, // cue
  digraphGpc('ei', 'EY', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // vein
  digraphGpc('ei', 'IY', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // receive
  digraphGpc('ei', 'AY', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // height
  digraphGpc('ey', 'EY', 'vowels_teams', { tags: ['teaching-v0.3'], priority: 110 }), // they
  digraphGpc('ey', 'IY', 'vowels_teams', { tags: ['analysis'], priority: 30 }), // key
  digraphGpc('eu', 'UW', 'vowels_teams', { tags: ['analysis'], priority: 30 }),
  { id: 'GPC-eu-Y_UW', grapheme: 'eu', phoneme: 'Y UW', category: 'vowels_teams', matchType: 'digraph', tags: ['analysis'], priority: 30 },
];

// =============================================================================
// The Catalogue: R-Controlled Vowels
// =============================================================================

export const VOWELS_R_CONTROLLED: readonly GPCEntry[] = [
  // Teaching digraphs at 110 (v0.3 convention, beats short vowels at 50 —
  // otherwise "bird" decodes b-i-r-d); teaching trigraphs at 125 (beats vowel
  // teams at 110/120 so "hear" chunks h-ear, not h-ea-r).

  // Basic r-controlled
  { id: 'GPC-ar-AA_R', grapheme: 'ar', phoneme: 'AA R', category: 'vowels_r_controlled', matchType: 'digraph', tags: ['teaching-v0.3'], priority: 110 },
  digraphGpc('ar', 'ER', 'vowels_r_controlled', { tags: ['analysis'] }), // dollar
  digraphGpc('er', 'ER', 'vowels_r_controlled', { tags: ['teaching-v0.3'], priority: 110 }),
  digraphGpc('ir', 'ER', 'vowels_r_controlled', { tags: ['teaching-v0.3'], priority: 110 }),
  { id: 'GPC-or-AO_R', grapheme: 'or', phoneme: 'AO R', category: 'vowels_r_controlled', matchType: 'digraph', tags: ['teaching-v0.3'], priority: 110 },
  digraphGpc('or', 'ER', 'vowels_r_controlled', { tags: ['analysis'] }), // doctor
  digraphGpc('ur', 'ER', 'vowels_r_controlled', { tags: ['teaching-v0.3'], priority: 110 }),

  // Extended r-controlled
  { id: 'GPC-ear-IH_R', grapheme: 'ear', phoneme: 'IH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 }, // ear, hear
  { id: 'GPC-ear-EH_R', grapheme: 'ear', phoneme: 'EH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 }, // bear, pear
  trigraphGpc('ear', 'ER', 'vowels_r_controlled', { tags: ['analysis'] }), // earth
  { id: 'GPC-air-EH_R', grapheme: 'air', phoneme: 'EH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 },
  { id: 'GPC-are-EH_R', grapheme: 'are', phoneme: 'EH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 },
  { id: 'GPC-our-AW_R', grapheme: 'our', phoneme: 'AW R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 }, // our, hour
  { id: 'GPC-our-AO_R', grapheme: 'our', phoneme: 'AO R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] }, // four
  trigraphGpc('our', 'ER', 'vowels_r_controlled', { tags: ['analysis'] }), // colour (British)
  { id: 'GPC-oor-AO_R', grapheme: 'oor', phoneme: 'AO R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] }, // floor
  { id: 'GPC-oor-UH_R', grapheme: 'oor', phoneme: 'UH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] }, // poor
  { id: 'GPC-oar-AO_R', grapheme: 'oar', phoneme: 'AO R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 },
  { id: 'GPC-ire-AY_R', grapheme: 'ire', phoneme: 'AY R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] }, // fire
  { id: 'GPC-ire-AY_ER', grapheme: 'ire', phoneme: 'AY ER', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] },
  { id: 'GPC-ore-AO_R', grapheme: 'ore', phoneme: 'AO R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['teaching-v0.3'], priority: 125 },
  { id: 'GPC-ure-Y_UH_R', grapheme: 'ure', phoneme: 'Y UH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] }, // cure
  { id: 'GPC-ure-UH_R', grapheme: 'ure', phoneme: 'UH R', category: 'vowels_r_controlled', matchType: 'trigraph', tags: ['analysis'] },
  trigraphGpc('ure', 'ER', 'vowels_r_controlled', { tags: ['analysis'] }), // measure
];

// =============================================================================
// The Catalogue: L-Controlled Vowels
// =============================================================================

export const VOWELS_L_CONTROLLED: readonly GPCEntry[] = [
  { id: 'GPC-all-AO_L', grapheme: 'all', phoneme: 'AO L', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['teaching-v0.2'], priority: 125 },
  { id: 'GPC-alk-AO_K', grapheme: 'alk', phoneme: 'AO K', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['teaching-v0.2'] },
  { id: 'GPC-alt-AO_L_T', grapheme: 'alt', phoneme: 'AO L T', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['analysis'] },
  { id: 'GPC-old-OW_L_D', grapheme: 'old', phoneme: 'OW L D', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['teaching-v0.2'] },
  { id: 'GPC-oll-OW_L', grapheme: 'oll', phoneme: 'OW L', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['analysis'] },
  { id: 'GPC-ild-AY_L_D', grapheme: 'ild', phoneme: 'AY L D', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['teaching-v0.2'] },
  { id: 'GPC-ind-AY_N_D', grapheme: 'ind', phoneme: 'AY N D', category: 'vowels_l_controlled', matchType: 'trigraph', tags: ['teaching-v0.2'] },
];

// =============================================================================
// The Catalogue: Final Open Vowels
// =============================================================================

export const VOWELS_FINAL_OPEN: readonly GPCEntry[] = [
  // Final open vowels get priority 80 to beat short vowels (50) but lose to digraphs (100+)
  positionFinalGpc('e', 'IY', 'vowels_final_open', { tags: ['teaching-v0.2'], priority: 80 }), // me, we, he
  positionFinalGpc('y', 'AY', 'vowels_final_open', { tags: ['teaching-v0.2'], priority: 80 }), // my, by, fly
  positionFinalGpc('y', 'IY', 'vowels_final_open', { tags: ['teaching-v0.2'], priority: 80 }), // happy, very
  positionFinalGpc('o', 'OW', 'vowels_final_open', { tags: ['teaching-v0.2'], priority: 80 }), // go, no
  positionFinalGpc('i', 'IY', 'vowels_final_open', { tags: ['analysis'], priority: 30 }), // ski
  positionFinalGpc('i', 'AY', 'vowels_final_open', { tags: ['analysis'], priority: 30 }), // hi
  positionFinalGpc('a', 'AH', 'vowels_final_open', { tags: ['analysis'], priority: 30 }), // comma
  positionFinalGpc('a', 'AE', 'vowels_final_open', { tags: ['analysis'], priority: 30 }), // extra (some dialects)
];

// =============================================================================
// The Catalogue: Extended Diphthongs
// =============================================================================

export const VOWELS_DIPHTHONG_EXTENDED: readonly GPCEntry[] = [
  // ough patterns - highly irregular
  { id: 'GPC-ough-AO', grapheme: 'ough', phoneme: 'AO', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // thought
  { id: 'GPC-ough-OW', grapheme: 'ough', phoneme: 'OW', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // though
  { id: 'GPC-ough-UW', grapheme: 'ough', phoneme: 'UW', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // through
  { id: 'GPC-ough-AH_F', grapheme: 'ough', phoneme: 'AH F', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // enough
  { id: 'GPC-ough-AO_F', grapheme: 'ough', phoneme: 'AO F', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // cough

  // augh
  { id: 'GPC-augh-AO', grapheme: 'augh', phoneme: 'AO', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // caught
  { id: 'GPC-augh-AE_F', grapheme: 'augh', phoneme: 'AE F', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // laugh

  // eigh
  { id: 'GPC-eigh-EY', grapheme: 'eigh', phoneme: 'EY', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['teaching-v0.3'] }, // eight, weight
  { id: 'GPC-eigh-AY', grapheme: 'eigh', phoneme: 'AY', category: 'vowels_diphthong_extended', matchType: 'simple', tags: ['analysis'] }, // height
];

// =============================================================================
// The Catalogue: Syllabic Consonants
// =============================================================================

export const SYLLABIC_CONSONANTS: readonly GPCEntry[] = [
  { id: 'GPC-le-AH_L', grapheme: 'le', phoneme: 'AH L', category: 'syllabic_consonants', matchType: 'position_final', tags: ['teaching-v0.4'] }, // bottle, little
  { id: 'GPC-al-AH_L', grapheme: 'al', phoneme: 'AH L', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] }, // animal
  { id: 'GPC-el-AH_L', grapheme: 'el', phoneme: 'AH L', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] }, // travel
  { id: 'GPC-en-AH_N', grapheme: 'en', phoneme: 'AH N', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] }, // happen
  { id: 'GPC-on-AH_N', grapheme: 'on', phoneme: 'AH N', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] }, // button
  { id: 'GPC-an-AH_N', grapheme: 'an', phoneme: 'AH N', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] }, // woman
  { id: 'GPC-in-AH_N', grapheme: 'in', phoneme: 'AH N', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] },
  // NOTE: GPC-in-IH_N removed - redundant (i→IH + n→N are defaults)
  { id: 'GPC-om-AH_M', grapheme: 'om', phoneme: 'AH M', category: 'syllabic_consonants', matchType: 'simple', tags: ['analysis'] },
  // NOTE: GPC-um-AH_M removed - redundant (u→AH + m→M are defaults)
];

// =============================================================================
// The Catalogue: Sight Words
// =============================================================================
// High-frequency irregular words that resist systematic GPC decomposition.
// These are taught as whole units ("sight words") in most phonics programs.
//
// Criteria for inclusion:
// 1. High frequency (typically top 100 words)
// 2. No reasonable GPC decomposition exists
// 3. Universally taught as sight words in standard curricula
//
// NOT included: words that just need a rare-but-systematic GPC pattern
// (those should get proper GPC entries instead).

export const SIGHT_WORDS: readonly GPCEntry[] = [
  // -------------------------------------------------------------------------
  // Tier 1: Articles, pronouns, prepositions - the highest frequency
  // -------------------------------------------------------------------------
  wholeWordGpc('the', 'DH AH', { tags: ['sight-word', 'teaching-v0.3'] }),      // "e" → schwa in closed syllable
  wholeWordGpc('a', 'AH', { tags: ['sight-word', 'teaching-v0.3'] }),           // schwa, not /æ/
  wholeWordGpc('to', 'T UW', { tags: ['sight-word', 'teaching-v0.3'] }),        // "o" → /uː/ without magic-e
  wholeWordGpc('of', 'AH V', { tags: ['sight-word', 'teaching-v0.3'], parts: 'o|f' }),        // "o" → schwa, "f" → /v/
  // NOT "i": out on the same grounds as "a" (excluded from the corpus), and
  // the app's pedagogy is all lowercase while I is always capitalised.
  wholeWordGpc('you', 'Y UW', { tags: ['sight-word', 'teaching-v0.3'] }),       // "ou" → /uː/ is irregular
  wholeWordGpc('my', 'M AY', { tags: ['sight-word', 'teaching-v0.3'] }),        // could be GPC but very early word

  // -------------------------------------------------------------------------
  // Tier 2: Common verbs with irregular spellings
  // -------------------------------------------------------------------------
  wholeWordGpc('was', 'W AH Z', { tags: ['sight-word', 'teaching-v0.3'] }),     // "a" → schwa, "s" → /z/
  wholeWordGpc('were', 'W ER', { tags: ['sight-word', 'teaching-v0.3'] }),      // highly irregular
  wholeWordGpc('are', 'AA R', { tags: ['sight-word', 'teaching-v0.3'], parts: 'a|r' }),       // needs whole-word, not "are" → /ɛr/; ar as in car, e silent
  wholeWordGpc('do', 'D UW', { tags: ['sight-word', 'teaching-v0.3'] }),        // "o" → /uː/ without magic-e
  wholeWordGpc('does', 'D AH Z', { tags: ['sight-word', 'teaching-v0.3'] }),    // completely irregular
  wholeWordGpc('done', 'D AH N', { tags: ['sight-word', 'teaching-v0.3'] }),    // "o" → /ʌ/, silent e doesn't make it long
  wholeWordGpc('have', 'HH AE V', { tags: ['sight-word', 'teaching-v0.3'] }),   // silent e doesn't make "a" long
  wholeWordGpc('give', 'G IH V', { tags: ['sight-word', 'teaching-v0.3'] }),    // silent e doesn't make "i" long
  wholeWordGpc('live', 'L IH V', { tags: ['sight-word', 'teaching-v0.3'] }),    // silent e doesn't make "i" long (verb)
  wholeWordGpc('said', 'S EH D', { tags: ['sight-word', 'teaching-v0.3'] }),    // "ai" → /ɛ/ is very irregular
  wholeWordGpc('says', 'S EH Z', { tags: ['sight-word', 'teaching-v0.3'] }),    // "ay" → /ɛ/ is very irregular

  // -------------------------------------------------------------------------
  // Tier 3: Question words and pronouns
  // -------------------------------------------------------------------------
  wholeWordGpc('who', 'HH UW', { tags: ['sight-word', 'teaching-v0.3'], parts: 'wh|o' }),      // "wh" → /h/, "o" → /uː/
  wholeWordGpc('what', 'W AH T', { tags: ['sight-word', 'teaching-v0.3'] }),    // "a" → /ɑ/ or schwa
  wholeWordGpc('where', 'W EH R', { tags: ['sight-word', 'teaching-v0.3'] }),   // "wh" + "ere" pattern
  wholeWordGpc('your', 'Y AO R', { tags: ['sight-word', 'teaching-v0.3'] }),    // "our" → /ɔːr/ but common
  wholeWordGpc('they', 'DH EY', { tags: ['sight-word', 'teaching-v0.3'] }),     // "ey" → /eɪ/ at end is learnable but high-freq

  // -------------------------------------------------------------------------
  // Tier 4: Numbers (completely opaque spellings)
  // -------------------------------------------------------------------------
  wholeWordGpc('one', 'W AH N', { tags: ['sight-word', 'teaching-v0.3'], parts: 'o|o|n' }),     // initial /w/ from nowhere, "o" → /ʌ/
  wholeWordGpc('two', 'T UW', { tags: ['sight-word', 'teaching-v0.3'] }),       // silent "w", "o" → /uː/
  wholeWordGpc('once', 'W AH N S', { tags: ['sight-word', 'teaching-v0.3'], parts: 'o|o|n|c' }),  // same as "one" + /s/
  wholeWordGpc('four', 'F AO R', { tags: ['sight-word', 'teaching-v0.4'] }),    // "ou" → /ɔː/ is learnable
  wholeWordGpc('eight', 'EY T', { tags: ['sight-word', 'teaching-v0.4'] }),     // "eigh" pattern exists but rare

  // -------------------------------------------------------------------------
  // Tier 5: Common words with "o" → /ʌ/ pattern
  // -------------------------------------------------------------------------
  wholeWordGpc('some', 'S AH M', { tags: ['sight-word', 'teaching-v0.3'] }),    // "o" → /ʌ/, silent e
  wholeWordGpc('come', 'K AH M', { tags: ['sight-word', 'teaching-v0.3'] }),    // "o" → /ʌ/, silent e
  wholeWordGpc('love', 'L AH V', { tags: ['sight-word', 'teaching-v0.3'] }),    // "o" → /ʌ/, silent e
  wholeWordGpc('none', 'N AH N', { tags: ['sight-word', 'teaching-v0.4'] }),    // "o" → /ʌ/, silent e
  wholeWordGpc('from', 'F R AH M', { tags: ['sight-word', 'teaching-v0.3'] }),  // "o" → /ʌ/
  wholeWordGpc('son', 'S AH N', { tags: ['sight-word', 'teaching-v0.4'] }),     // "o" → /ʌ/
  wholeWordGpc('won', 'W AH N', { tags: ['sight-word', 'teaching-v0.4'] }),     // "o" → /ʌ/

  // -------------------------------------------------------------------------
  // Tier 6: Modal/auxiliary verbs with "ould" pattern
  // -------------------------------------------------------------------------
  wholeWordGpc('would', 'W UH D', { tags: ['sight-word', 'teaching-v0.4'] }),   // silent "l", "ou" → /ʊ/
  wholeWordGpc('could', 'K UH D', { tags: ['sight-word', 'teaching-v0.4'] }),   // silent "l", "ou" → /ʊ/
  wholeWordGpc('should', 'SH UH D', { tags: ['sight-word', 'teaching-v0.4'] }), // silent "l", "ou" → /ʊ/

  // -------------------------------------------------------------------------
  // Tier 7: Other high-frequency irregulars
  // -------------------------------------------------------------------------
  wholeWordGpc('been', 'B IH N', { tags: ['sight-word', 'teaching-v0.4'] }),    // "ee" → /ɪ/ is very irregular
  wholeWordGpc('many', 'M EH N IY', { tags: ['sight-word', 'teaching-v0.4'] }), // "a" → /ɛ/
  wholeWordGpc('any', 'EH N IY', { tags: ['sight-word', 'teaching-v0.4'] }),    // "a" → /ɛ/
  wholeWordGpc('only', 'OW N L IY', { tags: ['sight-word', 'teaching-v0.4'] }), // learnable but common
  wholeWordGpc('their', 'DH EH R', { tags: ['sight-word', 'teaching-v0.4'] }),  // "eir" → /ɛr/
  wholeWordGpc('there', 'DH EH R', { tags: ['sight-word', 'teaching-v0.4'] }),  // "ere" → /ɛr/
  // NOT "here": /iː/ vs /ɪ/ doesn't contrast before r, so h + e_e + r decodes
  // to the right word — a regular split-digraph word (CMUdict HH IY1 R), not a
  // sight word. (Was listed as 'HH IH R', which never matched CMUdict, so the
  // cards always parsed it as decodable anyway.)
  wholeWordGpc('other', 'AH DH ER', { tags: ['sight-word', 'teaching-v0.4'] }), // "o" → /ʌ/

  // NOT the put/push/pull/full/bull family: u → /ʊ/ is a semi-regularity,
  // not a sight word. u-UH stays parked for its own treatment.

  // -------------------------------------------------------------------------
  // Tier 9: Interjections
  // -------------------------------------------------------------------------
  wholeWordGpc('oh', 'OW', { tags: ['sight-word', 'teaching-v0.3'] }),          // NOT a GPC - "john" has o→/AA/, ohio has o+h separately

  // NOT the title abbreviations (Mr, Mrs, Ms, Dr, Jr, Sr): in the source data,
  // but not part of the app's curriculum.

  // -------------------------------------------------------------------------
  // Tier 10: High-frequency irregulars the parser can't align (2026-09-27,
  // from irregular-words.json). Cards follow once each word is recorded.
  // -------------------------------------------------------------------------
  wholeWordGpc('eye', 'AY', { tags: ['sight-word', 'teaching-v0.4'] }),         // "eye" → /aɪ/, no letter plays fair
  wholeWordGpc('eyes', 'AY Z', { tags: ['sight-word', 'teaching-v0.4'] }),      // whole-word match is exact: plural listed separately
  wholeWordGpc('sure', 'SH UH R', { tags: ['sight-word', 'teaching-v0.4'], parts: 's|u|r' }),   // "s" → /ʃ/
  wholeWordGpc('move', 'M UW V', { tags: ['sight-word', 'teaching-v0.4'] }),    // "o_e" → /uː/, not /oʊ/
  wholeWordGpc('whole', 'HH OW L', { tags: ['sight-word', 'teaching-v0.4'], parts: 'wh|o|l' }),  // "wh" → /h/
  wholeWordGpc('buy', 'B AY', { tags: ['sight-word', 'teaching-v0.4'] }),       // "uy" → /aɪ/
  wholeWordGpc('heart', 'HH AA R T', { tags: ['sight-word', 'teaching-v0.4'] }), // "ear" → /ɑr/
  wholeWordGpc('half', 'HH AE F', { tags: ['sight-word', 'teaching-v0.4'] }),   // silent "l"
  wholeWordGpc('friend', 'F R EH N D', { tags: ['sight-word', 'teaching-v0.4'] }), // "ie" → /ɛ/
];

// =============================================================================
// Complete Catalogue
// =============================================================================

/**
 * The complete GPC catalogue with all entries
 */
export const GPC_CATALOGUE: readonly GPCEntry[] = [
  ...CONSONANTS_SIMPLE,
  ...CONSONANTS_SOFT,
  ...DIGRAPHS,
  ...TRIGRAPHS,
  ...SILENT_PATTERNS,
  ...LATINATE_DIGRAPHS,
  ...DOUBLED_CONSONANTS,
  ...VOWELS_SHORT,
  ...VOWELS_LONG_SPLIT,
  ...VOWELS_TEAMS,
  ...VOWELS_R_CONTROLLED,
  ...VOWELS_L_CONTROLLED,
  ...VOWELS_FINAL_OPEN,
  ...VOWELS_DIPHTHONG_EXTENDED,
  ...SYLLABIC_CONSONANTS,
  ...SIGHT_WORDS,
];

// =============================================================================
// Catalogue Index
// =============================================================================

/**
 * Indexed catalogue for efficient lookup
 */
export interface GPCCatalogueIndex {
  /** All GPCs indexed by their ID */
  byId: Map<string, GPCEntry>;

  /** GPCs indexed by grapheme (one grapheme may have multiple GPCs) */
  byGrapheme: Map<string, GPCEntry[]>;

  /** GPCs sorted by priority (descending) for matching */
  byPriority: GPCEntry[];

  /** Graphemes sorted by length descending (for greedy matching) */
  graphemesByLength: string[];

  /** All unique graphemes */
  allGraphemes: Set<string>;

  /** Total count of GPCs */
  count: number;
}

/**
 * Build an indexed catalogue from the GPC entries
 */
export function buildCatalogueIndex(
  gpcs: readonly GPCEntry[] = GPC_CATALOGUE
): GPCCatalogueIndex {
  const byId = new Map<string, GPCEntry>();
  const byGrapheme = new Map<string, GPCEntry[]>();
  const allGraphemes = new Set<string>();

  for (const gpc of gpcs) {
    byId.set(gpc.id, gpc);
    allGraphemes.add(gpc.grapheme);

    const existing = byGrapheme.get(gpc.grapheme) ?? [];
    existing.push(gpc);
    byGrapheme.set(gpc.grapheme, existing);
  }

  // Sort by priority (calculate default if not specified)
  const byPriority = [...gpcs].sort((a, b) => {
    const prioA = a.priority ?? calculateDefaultPriority(a);
    const prioB = b.priority ?? calculateDefaultPriority(b);
    return prioB - prioA; // Descending
  });

  // Sort graphemes by length descending
  const graphemesByLength = Array.from(allGraphemes).sort(
    (a, b) => b.length - a.length
  );

  return {
    byId,
    byGrapheme,
    byPriority,
    graphemesByLength,
    allGraphemes,
    count: gpcs.length,
  };
}

/**
 * Get the default catalogue index (lazily initialized)
 */
let _defaultIndex: GPCCatalogueIndex | null = null;

export function getDefaultCatalogueIndex(): GPCCatalogueIndex {
  if (!_defaultIndex) {
    _defaultIndex = buildCatalogueIndex();
  }
  return _defaultIndex;
}

/**
 * Does this chunk of a sight word bend the rules? It carries the word's own
 * GPC (`GPC-WORD-x`), unless it's a single consonant making one of its
 * catalogue sounds: the sight-word chunker also hands the word's GPC to
 * regular consonants beside the odd part (would's d, some's m), and those
 * behave. Shared by the intro card's plan (who misbehaves) and the card
 * generator (which chunks a MissingLetters card blanks as the odd part).
 */
export function isOddSightWordChunk(
  word: string,
  chunk: { letters: object; phoneme: string; gpcId?: string },
): boolean {
  if (!chunk.gpcId?.startsWith('GPC-WORD-')) return false;
  const idx = Object.keys(chunk.letters).map(Number);
  if (idx.length !== 1) return true;
  const letter = word[idx[0]];
  if ('aeiou'.includes(letter)) return true;
  const entries = getDefaultCatalogueIndex().byGrapheme.get(letter) ?? [];
  return !entries.some((e) => e.matchType !== 'whole_word' && e.phoneme === chunk.phoneme);
}

// =============================================================================
// Filtering Utilities
// =============================================================================

/**
 * Filter GPCs by tag
 */
export function filterByTag(
  gpcs: readonly GPCEntry[],
  tag: string
): GPCEntry[] {
  return gpcs.filter((gpc) => gpc.tags?.includes(tag));
}

/**
 * Filter GPCs by category
 */
export function filterByCategory(
  gpcs: readonly GPCEntry[],
  category: GPCCategory
): GPCEntry[] {
  return gpcs.filter((gpc) => gpc.category === category);
}

/**
 * Filter GPCs by match type
 */
export function filterByMatchType(
  gpcs: readonly GPCEntry[],
  matchType: MatchType
): GPCEntry[] {
  return gpcs.filter((gpc) => gpc.matchType === matchType);
}

/**
 * Get teaching-level GPCs (v0.2 and below)
 */
export function getTeachingCatalogue(): GPCEntry[] {
  return filterByTag(GPC_CATALOGUE, 'teaching-v0.2');
}

/**
 * Get extended teaching GPCs (v0.3 and below)
 */
export function getExtendedTeachingCatalogue(): GPCEntry[] {
  return GPC_CATALOGUE.filter(
    (gpc) =>
      gpc.tags?.includes('teaching-v0.2') || gpc.tags?.includes('teaching-v0.3')
  );
}

/**
 * Get comprehensive catalogue (v0.4 and below, for analysis)
 */
export function getComprehensiveCatalogue(): GPCEntry[] {
  return GPC_CATALOGUE.filter(
    (gpc) =>
      gpc.tags?.includes('teaching-v0.2') ||
      gpc.tags?.includes('teaching-v0.3') ||
      gpc.tags?.includes('teaching-v0.4')
  );
}

/**
 * Get full catalogue (all GPCs, for maximum alignment)
 */
export function getFullCatalogue(): GPCEntry[] {
  return [...GPC_CATALOGUE];
}

// =============================================================================
// Restricted Catalogue Subsets (by match type)
// =============================================================================

/**
 * GPCs with simple match type only (single letters, basic mappings)
 */
export const SIMPLE_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'simple'
);

/**
 * GPCs with digraph match type only
 */
export const DIGRAPH_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'digraph'
);

/**
 * GPCs with trigraph match type only
 */
export const TRIGRAPH_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'trigraph'
);

/**
 * Simple + digraph GPCs (no trigraphs, split digraphs, or positional rules)
 */
export const SIMPLE_AND_DIGRAPH_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'simple' || gpc.matchType === 'digraph'
);

/**
 * Simple + digraph + trigraph GPCs (basic grapheme patterns, no positional/context rules)
 */
export const BASIC_GRAPHEME_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) =>
    gpc.matchType === 'simple' ||
    gpc.matchType === 'digraph' ||
    gpc.matchType === 'trigraph'
);

/**
 * GPCs with split digraph match type (magic-e patterns)
 */
export const SPLIT_DIGRAPH_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'split_digraph'
);

/**
 * GPCs with context-sensitive match types (context_before, context_after)
 */
export const CONTEXT_SENSITIVE_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'context_before' || gpc.matchType === 'context_after'
);

/**
 * GPCs with position-sensitive match types (position_initial, position_final)
 */
export const POSITION_SENSITIVE_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'position_initial' || gpc.matchType === 'position_final'
);

/**
 * GPCs with whole_word match type (sight words)
 */
export const WHOLE_WORD_GPCS: readonly GPCEntry[] = GPC_CATALOGUE.filter(
  (gpc) => gpc.matchType === 'whole_word'
);

// =============================================================================
// Catalogue Metadata
// =============================================================================

/**
 * Metadata about the v2 catalogue
 */
export const CATALOGUE_META = {
  version: '2.0',
  name: 'operational-v2',
  description:
    'Operational GPC catalogue with match types and TypeScript-first definitions',
  matchTypes: MATCH_TYPES,
  categories: GPC_CATEGORIES,
  stats: {
    total: GPC_CATALOGUE.length,
    byMatchType: MATCH_TYPES.reduce(
      (acc, mt) => {
        acc[mt] = filterByMatchType(GPC_CATALOGUE, mt).length;
        return acc;
      },
      {} as Record<MatchType, number>
    ),
    byCategory: GPC_CATEGORIES.reduce(
      (acc, cat) => {
        acc[cat] = filterByCategory(GPC_CATALOGUE, cat).length;
        return acc;
      },
      {} as Record<GPCCategory, number>
    ),
  },
} as const;
