/**
 * ARPAbet Constants and Utilities
 *
 * ARPAbet is the phonetic alphabet used by CMU Dictionary.
 * All phoneme representations in this library use ARPAbet notation.
 *
 * See /ref/arpabet-phonemes.md for the complete reference.
 */

import type { ArpabetConsonant, ArpabetPhoneme, ArpabetVowel, ArpabetWithStress } from './types';

// =============================================================================
// Phoneme Sets
// =============================================================================

/**
 * All ARPAbet vowel phonemes (15 total)
 */
export const VOWELS: readonly ArpabetVowel[] = [
  // Monophthongs (10)
  'AA', // father, bot
  'AE', // cat, bat
  'AH', // but, about (schwa when unstressed)
  'AO', // caught, law
  'EH', // bet, red
  'ER', // bird, her (r-colored)
  'IH', // bit, sit
  'IY', // beat, see
  'UH', // book, put
  'UW', // boot, blue
  // Diphthongs (5)
  'AW', // house, now
  'AY', // bite, my
  'EY', // bait, day
  'OW', // boat, go
  'OY', // boy, toy
] as const;

/**
 * All ARPAbet consonant phonemes (24 total)
 */
export const CONSONANTS: readonly ArpabetConsonant[] = [
  // Stops (6)
  'P',  // pat
  'B',  // bat
  'T',  // tap
  'D',  // dab
  'K',  // cat, kit
  'G',  // got
  // Fricatives (9)
  'F',  // fat
  'V',  // vat
  'TH', // thin (voiceless)
  'DH', // this (voiced)
  'S',  // sit
  'Z',  // zip
  'SH', // ship
  'ZH', // measure
  'HH', // hat
  // Affricates (2)
  'CH', // chip
  'JH', // jump, bridge
  // Nasals (3)
  'M',  // mat
  'N',  // nap
  'NG', // sing
  // Liquids (2)
  'L',  // left
  'R',  // red
  // Glides (2)
  'W',  // wet
  'Y',  // yes
] as const;

/**
 * Set of all vowel phonemes for O(1) lookup
 */
export const VOWEL_SET: ReadonlySet<string> = new Set(VOWELS);

/**
 * Set of all consonant phonemes for O(1) lookup
 */
export const CONSONANT_SET: ReadonlySet<string> = new Set(CONSONANTS);

/**
 * Set of all phonemes for O(1) lookup
 */
export const PHONEME_SET: ReadonlySet<string> = new Set([...VOWELS, ...CONSONANTS]);

// =============================================================================
// Phoneme Subcategories
// =============================================================================

/**
 * Monophthong vowels (pure vowels, no glide)
 */
export const MONOPHTHONGS: readonly ArpabetVowel[] = [
  'AA', 'AE', 'AH', 'AO', 'EH', 'ER', 'IH', 'IY', 'UH', 'UW'
] as const;

/**
 * Diphthong vowels (gliding vowels)
 */
export const DIPHTHONGS: readonly ArpabetVowel[] = [
  'AW', 'AY', 'EY', 'OW', 'OY'
] as const;

/**
 * Stop consonants (plosives)
 */
export const STOPS: readonly ArpabetConsonant[] = [
  'P', 'B', 'T', 'D', 'K', 'G'
] as const;

/**
 * Fricative consonants
 */
export const FRICATIVES: readonly ArpabetConsonant[] = [
  'F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'ZH', 'HH'
] as const;

/**
 * Affricate consonants
 */
export const AFFRICATES: readonly ArpabetConsonant[] = [
  'CH', 'JH'
] as const;

/**
 * Nasal consonants
 */
export const NASALS: readonly ArpabetConsonant[] = [
  'M', 'N', 'NG'
] as const;

/**
 * Liquid consonants
 */
export const LIQUIDS: readonly ArpabetConsonant[] = [
  'L', 'R'
] as const;

/**
 * Glide consonants (semivowels)
 */
export const GLIDES: readonly ArpabetConsonant[] = [
  'W', 'Y'
] as const;

/**
 * Voiced consonants
 */
export const VOICED_CONSONANTS: readonly ArpabetConsonant[] = [
  'B', 'D', 'G', 'V', 'DH', 'Z', 'ZH', 'JH', 'M', 'N', 'NG', 'L', 'R', 'W', 'Y'
] as const;

/**
 * Voiceless consonants
 */
export const VOICELESS_CONSONANTS: readonly ArpabetConsonant[] = [
  'P', 'T', 'K', 'F', 'TH', 'S', 'SH', 'HH', 'CH'
] as const;

// =============================================================================
// Voiced/Voiceless Pairs
// =============================================================================

/**
 * Pairs of voiced/voiceless consonants that differ only in voicing
 * Useful for interference analysis
 */
export const VOICING_PAIRS: readonly [ArpabetConsonant, ArpabetConsonant][] = [
  ['P', 'B'],   // bilabial stops
  ['T', 'D'],   // alveolar stops
  ['K', 'G'],   // velar stops
  ['F', 'V'],   // labiodental fricatives
  ['TH', 'DH'], // dental fricatives
  ['S', 'Z'],   // alveolar fricatives
  ['SH', 'ZH'], // postalveolar fricatives
  ['CH', 'JH'], // affricates
] as const;

// =============================================================================
// Short/Long Vowel Mapping (Pedagogical)
// =============================================================================

/**
 * "Short" vowels as commonly taught in phonics
 * Maps the pedagogical term to ARPAbet
 */
export const SHORT_VOWELS: Record<string, ArpabetVowel> = {
  'a': 'AE', // cat
  'e': 'EH', // bed
  'i': 'IH', // sit
  'o': 'AA', // hot (or AO in some dialects)
  'u': 'AH', // cup
} as const;

/**
 * "Long" vowels as commonly taught in phonics
 * Maps the pedagogical term to ARPAbet
 */
export const LONG_VOWELS: Record<string, ArpabetVowel> = {
  'a': 'EY', // cake, day
  'e': 'IY', // see, beat
  'i': 'AY', // bike, my
  'o': 'OW', // go, boat
  'u': 'UW', // blue, food
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Strip stress markers (0, 1, 2) from a phoneme
 *
 * @example
 * stripStress('AE1')  // => 'AE'
 * stripStress('AH0')  // => 'AH'
 * stripStress('K')    // => 'K' (no change)
 */
export function stripStress(phoneme: ArpabetWithStress): ArpabetPhoneme {
  return phoneme.replace(/[012]$/, '') as ArpabetPhoneme;
}

/**
 * Check if a phoneme is a vowel (after stripping stress)
 *
 * @example
 * isVowel('AE1')  // => true
 * isVowel('AE')   // => true
 * isVowel('K')    // => false
 */
export function isVowel(phoneme: ArpabetWithStress): boolean {
  return VOWEL_SET.has(stripStress(phoneme));
}

/**
 * Check if a phoneme is a consonant
 *
 * @example
 * isConsonant('K')   // => true
 * isConsonant('SH')  // => true
 * isConsonant('AE')  // => false
 */
export function isConsonant(phoneme: ArpabetWithStress): boolean {
  return CONSONANT_SET.has(stripStress(phoneme));
}

/**
 * Check if a phoneme is a valid ARPAbet symbol
 *
 * @example
 * isValidPhoneme('K')    // => true
 * isValidPhoneme('AE1')  // => true
 * isValidPhoneme('XY')   // => false
 */
export function isValidPhoneme(phoneme: ArpabetWithStress): boolean {
  return PHONEME_SET.has(stripStress(phoneme));
}

/**
 * Type guard: check if a string is a valid ARPAbet phoneme (with or without stress)
 *
 * This is useful at data ingestion boundaries where you have raw strings
 * from external sources (like CMU Dictionary) that need validation.
 *
 * @example
 * const rawPhoneme = "AE1"; // from external data
 * if (isArpabetWithStress(rawPhoneme)) {
 *   // TypeScript now knows rawPhoneme is ArpabetWithStress
 *   const stripped = stripStress(rawPhoneme);
 * }
 */
export function isArpabetWithStress(value: string): value is ArpabetWithStress {
  // Check if it's a valid phoneme after stripping stress
  const stripped = value.replace(/[012]$/, '');
  return PHONEME_SET.has(stripped);
}

/**
 * Safely convert a string array to ArpabetWithStress array
 *
 * Validates each element and throws if any are invalid.
 * Use this at data ingestion boundaries.
 *
 * @example
 * const rawPhonemes = ['K', 'AE1', 'T']; // from CMU Dictionary
 * const validPhonemes = toArpabetWithStressArray(rawPhonemes);
 */
export function toArpabetWithStressArray(values: string[]): ArpabetWithStress[] {
  for (const value of values) {
    if (!isArpabetWithStress(value)) {
      throw new Error(`Invalid ARPAbet phoneme: "${value}"`);
    }
  }
  return values as ArpabetWithStress[];
}

/**
 * Check if a phoneme is a diphthong
 */
export function isDiphthong(phoneme: ArpabetWithStress): boolean {
  const stripped = stripStress(phoneme);
  return (DIPHTHONGS as readonly string[]).includes(stripped);
}

/**
 * Check if a phoneme is a monophthong
 */
export function isMonophthong(phoneme: ArpabetWithStress): boolean {
  const stripped = stripStress(phoneme);
  return (MONOPHTHONGS as readonly string[]).includes(stripped);
}

/**
 * Get the stress level of a phoneme (0, 1, 2, or null if no stress marker)
 *
 * @example
 * getStress('AE1')  // => 1
 * getStress('AH0')  // => 0
 * getStress('K')    // => null
 */
export function getStress(phoneme: ArpabetWithStress): 0 | 1 | 2 | null {
  const match = phoneme.match(/[012]$/);
  if (!match) return null;
  return parseInt(match[0], 10) as 0 | 1 | 2;
}

/**
 * Count vowels in a phoneme sequence (for syllable estimation)
 *
 * @example
 * countVowels(['K', 'AE1', 'T'])  // => 1 (cat)
 * countVowels(['S', 'IH1', 'S', 'T', 'ER0'])  // => 2 (sister)
 */
export function countVowels(phonemes: ArpabetWithStress[]): number {
  return phonemes.filter(p => isVowel(p)).length;
}

/**
 * Check if phoneme sequence is monosyllabic (exactly one vowel)
 *
 * @example
 * isMonosyllabic(['K', 'AE1', 'T'])  // => true (cat)
 * isMonosyllabic(['K', 'EY1', 'K'])  // => true (cake)
 * isMonosyllabic(['T', 'EY1', 'B', 'AH0', 'L'])  // => false (table)
 */
export function isMonosyllabic(phonemes: ArpabetWithStress[]): boolean {
  return countVowels(phonemes) === 1;
}

/**
 * Convert a string to an ARPAbet phoneme with runtime validation
 *
 * Normalizes to uppercase and validates membership in PHONEME_SET.
 * Throws an error if the string is not a valid ARPAbet phoneme.
 *
 * @param s - String to convert (case-insensitive)
 * @returns Validated ARPAbet phoneme
 * @throws Error if string is not a valid ARPAbet phoneme
 *
 * @example
 * toArpabet('b')    // => 'B'
 * toArpabet('SH')   // => 'SH'
 * toArpabet('ae')   // => 'AE'
 * toArpabet('XYZ')  // => throws Error
 */
export function toArpabet(s: string): ArpabetPhoneme {
  const normalized = s.toUpperCase();
  if (PHONEME_SET.has(normalized)) {
    return normalized as ArpabetPhoneme;
  }
  throw new Error(`Invalid ARPAbet phoneme: "${s}"`);
}

/**
 * Get the voiced counterpart of a voiceless consonant (or vice versa)
 *
 * @example
 * getVoicingCounterpart('P')   // => 'B'
 * getVoicingCounterpart('B')   // => 'P'
 * getVoicingCounterpart('M')   // => null (no counterpart)
 */
export function getVoicingCounterpart(phoneme: string): ArpabetConsonant | null {
  for (const [voiceless, voiced] of VOICING_PAIRS) {
    if (phoneme === voiceless) return voiced;
    if (phoneme === voiced) return voiceless;
  }
  return null;
}

/**
 * Convert a phoneme sequence (with spaces) to GPC ID format (with underscores)
 *
 * @example
 * phonemeSeqToId('AO L')  // => 'AO_L'
 * phonemeSeqToId('K S')   // => 'K_S'
 * phonemeSeqToId('SH')    // => 'SH'
 */
export function phonemeSeqToId(phonemeSeq: string): string {
  return phonemeSeq.replace(/ /g, '_');
}

/**
 * Convert a GPC ID phoneme part to spaced format
 *
 * @example
 * idToPhonemeSeq('AO_L')  // => 'AO L'
 * idToPhonemeSeq('K_S')   // => 'K S'
 * idToPhonemeSeq('SH')    // => 'SH'
 */
export function idToPhonemeSeq(idPart: string): string {
  return idPart.replace(/_/g, ' ');
}

/**
 * Build a GPC ID from grapheme and phoneme
 *
 * @example
 * buildGpcId('sh', 'SH')      // => 'GPC-sh-SH'
 * buildGpcId('a_e', 'EY')     // => 'GPC-a_e-EY'
 * buildGpcId('x', 'K S')      // => 'GPC-x-K_S'
 */
export function buildGpcId(grapheme: string, phoneme: string): string {
  return `GPC-${grapheme}-${phonemeSeqToId(phoneme)}`;
}

/**
 * Parse a GPC ID into its components
 *
 * @example
 * parseGpcId('GPC-sh-SH')     // => { grapheme: 'sh', phoneme: 'SH' }
 * parseGpcId('GPC-a_e-EY')    // => { grapheme: 'a_e', phoneme: 'EY' }
 * parseGpcId('GPC-x-K_S')     // => { grapheme: 'x', phoneme: 'K S' }
 */
export function parseGpcId(gpcId: string): { grapheme: string; phoneme: string } | null {
  const match = gpcId.match(/^GPC-([^-]+)-(.+)$/);
  if (!match) return null;
  return {
    grapheme: match[1],
    phoneme: idToPhonemeSeq(match[2]),
  };
}

// =============================================================================
// IPA ↔ ARPAbet Conversion (for documentation/reference)
// =============================================================================

/**
 * Mapping from ARPAbet to IPA symbols
 * Useful for generating human-readable documentation
 */
export const ARPABET_TO_IPA: Record<ArpabetPhoneme, string> = {
  // Vowels
  'AA': 'ɑ',
  'AE': 'æ',
  'AH': 'ʌ',  // or ə when unstressed
  'AO': 'ɔ',
  'EH': 'ɛ',
  'ER': 'ɝ',
  'IH': 'ɪ',
  'IY': 'i',
  'UH': 'ʊ',
  'UW': 'u',
  'AW': 'aʊ',
  'AY': 'aɪ',
  'EY': 'eɪ',
  'OW': 'oʊ',
  'OY': 'ɔɪ',
  // Consonants
  'P': 'p',
  'B': 'b',
  'T': 't',
  'D': 'd',
  'K': 'k',
  'G': 'g',
  'F': 'f',
  'V': 'v',
  'TH': 'θ',
  'DH': 'ð',
  'S': 's',
  'Z': 'z',
  'SH': 'ʃ',
  'ZH': 'ʒ',
  'HH': 'h',
  'CH': 'tʃ',
  'JH': 'dʒ',
  'M': 'm',
  'N': 'n',
  'NG': 'ŋ',
  'L': 'l',
  'R': 'r',
  'W': 'w',
  'Y': 'j',
};

/**
 * Convert ARPAbet phoneme to IPA (for documentation)
 *
 * @example
 * toIPA('AE')   // => 'æ'
 * toIPA('SH')   // => 'ʃ'
 * toIPA('AE1')  // => 'æ' (stress stripped)
 */
export function toIPA(arpabet: ArpabetWithStress): string | undefined {
  const stripped = stripStress(arpabet);
  return ARPABET_TO_IPA[stripped];
}
