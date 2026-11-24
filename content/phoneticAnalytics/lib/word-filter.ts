/**
 * Word Filter Module
 * ==================
 *
 * Filters words for child-friendliness and other criteria.
 * Used in the recording prioritization pipeline to ensure
 * appropriate vocabulary for young learners.
 *
 * Filtering criteria:
 * 1. Blacklist - explicit list of inappropriate words
 * 2. Frequency floor - minimum SUBTLEX frequency
 * 3. Proper noun filter - exclude capitalized words (names, places)
 * 4. Length constraints - min/max word length
 *
 * @example
 * ```ts
 * import { createWordFilter, DEFAULT_BLACKLIST } from './word-filter';
 *
 * const filter = createWordFilter({
 *   blacklist: DEFAULT_BLACKLIST,
 *   minFrequency: 100,
 *   excludeProperNouns: true,
 * });
 *
 * const safeWords = words.filter(w => filter.isAllowed(w.word, w.frequency));
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for word filtering
 */
export interface WordFilterConfig {
  /** Set of words to exclude (case-insensitive) */
  blacklist?: Set<string>;

  /** Minimum SUBTLEX frequency (default: 0) */
  minFrequency?: number;

  /** Maximum SUBTLEX frequency (default: Infinity) */
  maxFrequency?: number;

  /** Minimum word length in characters (default: 1) */
  minLength?: number;

  /** Maximum word length in characters (default: Infinity) */
  maxLength?: number;

  /** Exclude proper nouns (words that are typically capitalized) */
  excludeProperNouns?: boolean;

  /** Set of proper nouns to exclude (if excludeProperNouns is true) */
  properNouns?: Set<string>;

  /** Set of words to always include regardless of other filters */
  whitelist?: Set<string>;

  /** Custom filter function for additional criteria */
  customFilter?: (word: string, frequency?: number) => boolean;
}

/**
 * A word filter instance with filtering methods
 */
export interface WordFilter {
  /** Check if a word passes all filters */
  isAllowed: (word: string, frequency?: number) => boolean;

  /** Get the reason a word was filtered (or null if allowed) */
  getFilterReason: (word: string, frequency?: number) => string | null;

  /** Filter an array of words */
  filterWords: <T extends { word: string; frequency?: number }>(
    words: T[],
  ) => T[];

  /** Get statistics about filtering */
  getStats: () => WordFilterStats;

  /** Reset statistics */
  resetStats: () => void;
}

/**
 * Statistics about word filtering
 */
export interface WordFilterStats {
  totalChecked: number;
  totalAllowed: number;
  totalFiltered: number;
  byReason: Record<string, number>;
}

// =============================================================================
// Default Blacklist
// =============================================================================

/**
 * Default blacklist of inappropriate words for children
 *
 * This is a starting point - add words as needed during manual review.
 * Categories:
 * - Profanity and vulgar language
 * - Violence-related terms
 * - Adult themes
 * - Slurs and derogatory terms
 *
 * Note: Some borderline words are intentionally excluded to avoid
 * over-filtering. The goal is to catch obvious inappropriate content,
 * not to be overly restrictive.
 */
export const DEFAULT_BLACKLIST = new Set([
  // Profanity (common)
  "ass",
  "asses",
  "bastard",
  "bitch",
  "bitches",
  "bullshit",
  "crap",
  "damn",
  "damned",
  "dammit",
  "dick",
  "dicks",
  "douchebag",
  "fag",
  "fags",
  "fuck",
  "fucked",
  "fucker",
  "fuckers",
  "fucking",
  "fucks",
  "goddamn",
  "hell",
  "jackass",
  "piss",
  "pissed",
  "shit",
  "shits",
  "shitty",
  "slut",
  "sluts",
  "whore",
  "whores",

  // Profanity (severe)
  "cock",
  "cocks",
  "cunt",
  "cunts",
  "nigger",
  "niggers",
  "nigga",
  "niggas",

  // Violence
  "kill",
  "killed",
  "killer",
  "killing",
  "kills",
  "murder",
  "murdered",
  "murderer",
  "rape",
  "raped",
  "rapist",
  "stab",
  "stabbed",

  // Adult themes
  "anal",
  "blowjob",
  "boner",
  "boob",
  "boobs",
  "booze",
  "breasts",
  "condom",
  "dildo",
  "erection",
  "horny",
  "nude",
  "orgasm",
  "penis",
  "porn",
  "pussy",
  "sex",
  "sexual",
  "sexy",
  "testicle",
  "vagina",
  "viagra",

  // Drugs/alcohol (explicit)
  "cocaine",
  "crack",
  "heroin",
  "meth",
  "weed",

  // Slurs and derogatory
  "retard",
  "retarded",
  "spastic",
  "midget",
  "cripple",
  "dyke",
  "homo",
  "tranny",

  // Anatomy / sexual slang — short decodable words that the CVC-heavy reachable
  // corpus surfaces to early readers (e.g. "tits" showed up in the /progress
  // showcase). Exact-match only, so innocent-meaning words (nut, balls, bang,
  // mug) are deliberately left in as good practice words.
  "tit",
  "tits",
  "titty",
  "titties",
  "prick",
  "pricks",
  "twat",
  "twats",
  "wank",
  "wanker",
  "wankers",
  "wanking",
  "cum",
  "jizz",
  "snatch",
  "crotch",
  "puss",
  "dong",
  "dongs",
  "schlong",
  "shag",
  "shagged",
  "shagging",
  "bonk",
  "knob",
  "knobs",
  "hump",
  "humped",
  "lust",
  "pimp",
  "pimps",
  "arse",
  "arses",

  // Scatological
  "pee",
  "poo",
  "poop",
  "poops",
  "pooped",
  "fart",
  "farts",
  "farted",

  // Drugs (slang)
  "pot",
  "dope",
  "blunt",
  "bong",
  "bongs",

  // Adult themes / violence (soft)
  "drunk",
  "drunks",
  "drunken",
  "shot",
  "shoot",
  "suck",
  "sucks",
]);

/**
 * Common proper nouns that appear in word lists
 * These are typically names or places with variable pronunciation
 */
export const DEFAULT_PROPER_NOUNS = new Set([
  // Common first names
  "adam",
  "anna",
  "ben",
  "bob",
  "bill",
  "dan",
  "dave",
  "ed",
  "frank",
  "george",
  "jack",
  "jake",
  "james",
  "jim",
  "jo",
  "joe",
  "john",
  "kate",
  "kim",
  "lee",
  "max",
  "mike",
  "nick",
  "pat",
  "paul",
  "pete",
  "rob",
  "rick",
  "sam",
  "steve",
  "tim",
  "tom",
  "will",

  // Places
  "france",
  "spain",
  "rome",
  "york",
  "kent",
  "wales",

  // Brands/products (that might appear as words)
  "coke",
  "ford",
  "jeep",
]);

// =============================================================================
// Filter Implementation
// =============================================================================

/**
 * Create a word filter with the given configuration
 *
 * @param config - Filter configuration options
 * @returns A WordFilter instance
 */
export function createWordFilter(config: WordFilterConfig = {}): WordFilter {
  const {
    blacklist = DEFAULT_BLACKLIST,
    minFrequency = 0,
    maxFrequency = Infinity,
    minLength = 1,
    maxLength = Infinity,
    excludeProperNouns = false,
    properNouns = DEFAULT_PROPER_NOUNS,
    whitelist = new Set(),
    customFilter,
  } = config;

  // Normalize blacklist to lowercase
  const normalizedBlacklist = new Set(
    [...blacklist].map((w) => w.toLowerCase()),
  );

  // Normalize whitelist to lowercase
  const normalizedWhitelist = new Set(
    [...whitelist].map((w) => w.toLowerCase()),
  );

  // Normalize proper nouns to lowercase
  const normalizedProperNouns = new Set(
    [...properNouns].map((w) => w.toLowerCase()),
  );

  // Statistics tracking
  let stats: WordFilterStats = {
    totalChecked: 0,
    totalAllowed: 0,
    totalFiltered: 0,
    byReason: {},
  };

  function incrementReason(reason: string): void {
    stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
  }

  function getFilterReason(word: string, frequency?: number): string | null {
    const normalizedWord = word.toLowerCase();

    // Whitelist check (always passes)
    if (normalizedWhitelist.has(normalizedWord)) {
      return null;
    }

    // Blacklist check
    if (normalizedBlacklist.has(normalizedWord)) {
      return "blacklist";
    }

    // Length checks
    if (word.length < minLength) {
      return "too_short";
    }
    if (word.length > maxLength) {
      return "too_long";
    }

    // Frequency checks
    if (frequency !== undefined) {
      if (frequency < minFrequency) {
        return "low_frequency";
      }
      if (frequency > maxFrequency) {
        return "high_frequency";
      }
    }

    // Proper noun check
    if (excludeProperNouns && normalizedProperNouns.has(normalizedWord)) {
      return "proper_noun";
    }

    // Custom filter check
    if (customFilter && !customFilter(word, frequency)) {
      return "custom_filter";
    }

    return null;
  }

  function isAllowed(word: string, frequency?: number): boolean {
    stats.totalChecked++;

    const reason = getFilterReason(word, frequency);

    if (reason === null) {
      stats.totalAllowed++;
      return true;
    } else {
      stats.totalFiltered++;
      incrementReason(reason);
      return false;
    }
  }

  function filterWords<T extends { word: string; frequency?: number }>(
    words: T[],
  ): T[] {
    return words.filter((w) => isAllowed(w.word, w.frequency));
  }

  function getStats(): WordFilterStats {
    return { ...stats };
  }

  function resetStats(): void {
    stats = {
      totalChecked: 0,
      totalAllowed: 0,
      totalFiltered: 0,
      byReason: {},
    };
  }

  return {
    isAllowed,
    getFilterReason,
    filterWords,
    getStats,
    resetStats,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Merge multiple blacklists into one
 */
export function mergeBlacklists(...lists: Set<string>[]): Set<string> {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const word of list) {
      merged.add(word.toLowerCase());
    }
  }
  return merged;
}

/**
 * Create a blacklist from an array of words
 */
export function createBlacklist(words: string[]): Set<string> {
  return new Set(words.map((w) => w.toLowerCase()));
}

/**
 * Add words to an existing blacklist (returns new Set)
 */
export function extendBlacklist(
  base: Set<string>,
  additions: string[],
): Set<string> {
  const extended = new Set(base);
  for (const word of additions) {
    extended.add(word.toLowerCase());
  }
  return extended;
}

/**
 * Remove words from a blacklist (returns new Set)
 */
export function reduceBlacklist(
  base: Set<string>,
  removals: string[],
): Set<string> {
  const reduced = new Set(base);
  for (const word of removals) {
    reduced.delete(word.toLowerCase());
  }
  return reduced;
}

/**
 * Check if a word contains any blacklisted substring
 *
 * Useful for catching variations like "fucking" when "fuck" is blacklisted
 * Use with caution - can cause false positives (e.g., "scunthorpe")
 */
export function containsBlacklistedSubstring(
  word: string,
  blacklist: Set<string>,
  minSubstringLength: number = 4,
): boolean {
  const normalizedWord = word.toLowerCase();

  for (const blacklisted of blacklist) {
    if (
      blacklisted.length >= minSubstringLength &&
      normalizedWord.includes(blacklisted)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Simple profanity check using common patterns
 *
 * This is a heuristic that catches common letter substitutions
 * like "f*ck", "sh!t", "a$$", etc.
 */
export function looksLikeProfanity(word: string): boolean {
  // Normalize common substitutions
  const normalized = word
    .toLowerCase()
    .replace(/[*@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/[!1]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[3]/g, "e");

  // Check against common profanity patterns
  const patterns = [
    /f+u+c+k/,
    /s+h+i+t/,
    /a+s+s+/,
    /b+i+t+c+h/,
    /d+a+m+n/,
    /c+r+a+p/,
    /p+i+s+s/,
    /c+u+n+t/,
    /d+i+c+k/,
  ];

  return patterns.some((p) => p.test(normalized));
}

// =============================================================================
// Pre-built Filter Configurations
// =============================================================================

/**
 * Create a strict filter suitable for young children (ages 4-6)
 *
 * Very conservative - filters anything remotely questionable
 */
export function createStrictChildFilter(): WordFilter {
  return createWordFilter({
    blacklist: DEFAULT_BLACKLIST,
    minFrequency: 50, // Only fairly common words
    minLength: 2, // No single letters
    maxLength: 8, // Avoid complex words
    excludeProperNouns: true,
    properNouns: DEFAULT_PROPER_NOUNS,
  });
}

/**
 * Create a moderate filter suitable for elementary school (ages 6-10)
 *
 * Filters obvious inappropriate content but allows broader vocabulary
 */
export function createModerateChildFilter(): WordFilter {
  return createWordFilter({
    blacklist: DEFAULT_BLACKLIST,
    minFrequency: 10,
    minLength: 1,
    maxLength: 12,
    excludeProperNouns: true,
    properNouns: DEFAULT_PROPER_NOUNS,
  });
}

/**
 * Create a minimal filter that only blocks explicit content
 *
 * For older children or when broader vocabulary is needed
 */
export function createMinimalFilter(): WordFilter {
  return createWordFilter({
    blacklist: DEFAULT_BLACKLIST,
    minFrequency: 0,
    excludeProperNouns: false,
  });
}
