/**
 * Letter to ARPAbet Phoneme Mapping
 *
 * Maps single keyboard letters to their primary ARPAbet phoneme codes.
 * Vowels use SHORT vowel sounds by default (standard for early literacy).
 *
 * Use with: getPhonemeAudioUrl() from phonetics service
 * Example: getPhonemeAudioUrl(LETTER_TO_ARPABET['a']) => "/audio/arpa/AE.mp3"
 */

import type { ArpabetPhoneme } from '@/services/phonetics/arpabet';

/**
 * Lookup table: single letter → ARPAbet phoneme code
 *
 * Consonants: Map to their standard phoneme
 * Vowels: Default to SHORT vowel sounds (AE, EH, IH, AA, AH)
 */
export const LETTER_TO_ARPABET: Record<string, ArpabetPhoneme> = {
  // Consonants (mostly 1:1 mapping)
  b: 'B',
  c: 'K', // Approximate
  d: 'D',
  f: 'F',
  g: 'G',
  h: 'HH',
  j: 'JH',
  k: 'K',
  l: 'L',
  m: 'M',
  n: 'N',
  p: 'P',
  r: 'R',
  s: 'S',
  t: 'T',
  v: 'V',
  w: 'W',
  y: 'Y',
  z: 'Z',

  // Short vowels (default for keyboard)
  a: 'AE', // cat, bat
  e: 'EH', // bed, pet
  i: 'IH', // bit, sit
  o: 'AA', // hot, dot (using AA over AO for consistency)
  u: 'AH', // but, cut
};

/**
 * Get the primary ARPAbet phoneme code for a single letter
 *
 * @param letter - A single letter (case-insensitive)
 * @returns ARPAbet phoneme code, or undefined if no mapping exists
 *
 * @example
 * ```ts
 * getArpabetForLetter('b')  // 'B'
 * getArpabetForLetter('a')  // 'AE' (short vowel)
 * getArpabetForLetter('B')  // 'B' (case-insensitive)
 * ```
 */
export function getArpabetForLetter(letter: string): ArpabetPhoneme | undefined {
  return LETTER_TO_ARPABET[letter.toLowerCase()];
}

/**
 * Letters whose single-key sound is a *compound* pseudo-phoneme — two ARPAbet
 * phonemes recorded as one audio file. These are deliberately absent from
 * LETTER_TO_ARPABET because they are not members of ArpabetPhoneme; the
 * canonical list lives in phonemeCache.ts (`COMPOUND_PHONEMES`).
 *
 * - x → K_S (/ks/, as in "box", "fox")
 * - q → K_W (/kw/, the "qu" sound, as in "queen")
 *
 * Without this, getPhonemeUrlForLetter('x'|'q') returned undefined and callers
 * fell back to a non-existent /audio/arpa/X.mp3 (or Q.mp3), which 404s and
 * makes <audio> throw "media resource not suitable".
 */
const LETTER_TO_COMPOUND_PHONEME: Record<string, string> = {
  x: 'K_S',
  q: 'K_W',
};

/**
 * Get the phoneme audio URL for a single letter
 *
 * Convenience wrapper that combines letter lookup + URL construction. Handles
 * both plain ARPAbet letters and the compound-phoneme letters (x, q).
 *
 * @param letter - A single letter (case-insensitive)
 * @returns Audio URL, or undefined if letter has no phoneme mapping
 *
 * @example
 * ```ts
 * getPhonemeUrlForLetter('b')  // '/audio/arpa/B.mp3'
 * getPhonemeUrlForLetter('a')  // '/audio/arpa/AE.mp3'
 * getPhonemeUrlForLetter('x')  // '/audio/arpa/K_S.mp3'
 * getPhonemeUrlForLetter('q')  // '/audio/arpa/K_W.mp3'
 * ```
 */
export function getPhonemeUrlForLetter(letter: string): string | undefined {
  const compound = LETTER_TO_COMPOUND_PHONEME[letter.toLowerCase()];
  if (compound) return `/audio/arpa/${compound}.mp3`;

  const arpabet = getArpabetForLetter(letter);
  return arpabet ? `/audio/arpa/${arpabet}.mp3` : undefined;
}

/**
 * Check if a letter has a phoneme mapping
 */
export function hasPhonemeMapping(letter: string): boolean {
  return letter.toLowerCase() in LETTER_TO_ARPABET;
}

// ---- Vowel-specific lookups ----

type VowelLetter = 'a' | 'e' | 'i' | 'o' | 'u';

const VOWEL_LETTERS = new Set<string>(['a', 'e', 'i', 'o', 'u']);

const SHORT_VOWEL_PHONEME: Record<VowelLetter, ArpabetPhoneme> = {
  a: 'AE', // cat
  e: 'EH', // bed
  i: 'IH', // bit
  o: 'AA', // hot
  u: 'AH', // but
};

const LONG_VOWEL_PHONEME: Record<VowelLetter, ArpabetPhoneme> = {
  a: 'EY', // cake (a_e)
  e: 'IY', // these (e_e)
  i: 'AY', // bike (i_e)
  o: 'OW', // home (o_e)
  u: 'UW', // tube (u_e)
};

/** Set of ARPAbet phonemes that are long vowel sounds */
export const LONG_VOWEL_PHONEMES = new Set<ArpabetPhoneme>(
  Object.values(LONG_VOWEL_PHONEME),
);

export function isVowelLetter(letter: string): letter is VowelLetter {
  return VOWEL_LETTERS.has(letter.toLowerCase());
}

export function getShortVowelPhoneme(letter: string): ArpabetPhoneme {
  const l = letter.toLowerCase();
  if (!isVowelLetter(l)) throw new Error(`Not a vowel letter: "${letter}"`);
  return SHORT_VOWEL_PHONEME[l];
}

export function getLongVowelPhoneme(letter: string): ArpabetPhoneme {
  const l = letter.toLowerCase();
  if (!isVowelLetter(l)) throw new Error(`Not a vowel letter: "${letter}"`);
  return LONG_VOWEL_PHONEME[l];
}
