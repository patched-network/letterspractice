/**
 * English Dictionary with Pronunciation and Frequency Data
 *
 * Provides unified access to:
 * - CMU Pronouncing Dictionary: word → ARPAbet phoneme sequences
 * - SUBTLEX Corpus: word → frequency (usage counts from subtitles)
 *
 * Singleton pattern for efficient reuse across the application.
 *
 * @example
 * ```ts
 * import { getDictionary, lookupWord } from './dictionary';
 *
 * // Get the full dictionary
 * const dict = getDictionary();
 *
 * // Look up a single word
 * const entry = lookupWord('cat');
 * // => { phonemes: ['K', 'AE', 'T'], frequency: 12345 }
 *
 * // Backward compatible: CMU-only lookup
 * const phonemes = lookupPronunciation('cat');
 * // => ['K', 'AE', 'T']
 * ```
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { stripStress, toArpabetWithStressArray } from './arpabet';
import { PRONUNCIATION_OVERRIDES } from './chunk-builder';
import type { ArpabetPhoneme } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Default path to the CMU dictionary file
 */
export const DEFAULT_CMUDICT_PATH = resolve(__dirname, '..', 'src-data', 'cmudict.dict');

/**
 * Default path to the SUBTLEX frequency file
 */
export const DEFAULT_SUBTLEX_PATH = resolve(__dirname, '..', 'src-data', 'subtlex.json');

// =============================================================================
// Types
// =============================================================================

/**
 * Dictionary entry with pronunciation and frequency data
 */
export interface DictionaryEntry {
  /** ARPAbet phoneme sequence (stress-stripped) */
  phonemes: ArpabetPhoneme[];
  /** Frequency from SUBTLEX corpus (undefined if not in corpus) */
  frequency?: number;
}

/**
 * SUBTLEX JSON entry format
 */
interface SubtlexEntry {
  word: string;
  count: number;
}

// =============================================================================
// Core Loading Functions
// =============================================================================

/**
 * Load the CMU Pronouncing Dictionary from a file
 *
 * @param path - Path to the dictionary file (defaults to src-data/cmudict.dict)
 * @returns Map from lowercase words to their phoneme sequences (stress-stripped)
 *
 * @example
 * ```ts
 * const dict = loadCmudict('./src-data/cmudict.dict');
 * dict.get('cat');  // => ['K', 'AE', 'T']
 * ```
 */
export function loadCmudict(path: string = DEFAULT_CMUDICT_PATH): Map<string, ArpabetPhoneme[]> {
  const content = readFileSync(path, 'latin1');
  const words = new Map<string, ArpabetPhoneme[]>();

  for (const line of content.split('\n')) {
    // Skip comments
    if (line.startsWith(';;;')) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    let word = parts[0].toLowerCase();

    // Skip variant pronunciations (e.g., "WORD(2)")
    if (word.includes('(')) continue;

    // Skip non-alphabetic words
    if (!/^[a-z]+$/.test(word)) continue;

    // Validate and strip stress markers from phonemes
    const rawPhonemes = parts.slice(1);
    try {
      const validatedPhonemes = toArpabetWithStressArray(rawPhonemes);
      const phonemes = validatedPhonemes.map(stripStress);
      words.set(word, phonemes);
    } catch (err) {
      // Skip words with invalid phonemes (malformed CMU Dictionary entries)
      continue;
    }
  }

  // Apply pronunciation overrides (e.g., "and" → AE N D, "with" → W IH TH)
  for (const [word, overridePhonemes] of Object.entries(PRONUNCIATION_OVERRIDES)) {
    if (words.has(word)) {
      words.set(word, overridePhonemes);
    }
  }

  return words;
}

/**
 * Load SUBTLEX frequency data from a JSON file
 *
 * @param path - Path to the SUBTLEX JSON file (defaults to src-data/subtlex.json)
 * @returns Map from lowercase words to their frequency counts
 *
 * @example
 * ```ts
 * const freq = loadSubtlex('./src-data/subtlex.json');
 * freq.get('the');  // => 1501908
 * ```
 */
export function loadSubtlex(path: string = DEFAULT_SUBTLEX_PATH): Map<string, number> {
  const content = readFileSync(path, 'utf-8');
  const data: SubtlexEntry[] = JSON.parse(content);
  const freq = new Map<string, number>();

  for (const entry of data) {
    // Normalize to lowercase for consistent lookup
    const word = entry.word.toLowerCase();
    freq.set(word, entry.count);
  }

  return freq;
}

/**
 * Load the unified dictionary with pronunciation and frequency data
 *
 * @param cmudictPath - Path to the CMU dictionary file
 * @param subtlexPath - Path to the SUBTLEX frequency file
 * @returns Map from lowercase words to DictionaryEntry objects
 *
 * @example
 * ```ts
 * const dict = loadDictionary();
 * const entry = dict.get('cat');
 * // => { phonemes: ['K', 'AE', 'T'], frequency: 12345 }
 * ```
 */
export function loadDictionary(
  cmudictPath: string = DEFAULT_CMUDICT_PATH,
  subtlexPath: string = DEFAULT_SUBTLEX_PATH
): Map<string, DictionaryEntry> {
  const cmudict = loadCmudict(cmudictPath);
  const subtlex = loadSubtlex(subtlexPath);

  const dictionary = new Map<string, DictionaryEntry>();

  // Start with all CMU dictionary words
  for (const [word, phonemes] of cmudict) {
    dictionary.set(word, {
      phonemes,
      frequency: subtlex.get(word), // May be undefined
    });
  }

  return dictionary;
}

// =============================================================================
// Singleton Pattern for Convenience
// =============================================================================

/**
 * Cached unified dictionary instance
 */
let _dict: Map<string, DictionaryEntry> | null = null;

/**
 * Cached CMU-only dictionary instance (for backward compatibility)
 */
let _cmudictOnly: Map<string, ArpabetPhoneme[]> | null = null;

/**
 * Cached SUBTLEX-only frequency map
 */
let _subtlexOnly: Map<string, number> | null = null;

/**
 * Get the unified dictionary (singleton)
 *
 * Loads the dictionary on first call, then reuses the cached instance.
 * Includes both pronunciation and frequency data.
 *
 * @returns Map from lowercase words to DictionaryEntry objects
 *
 * @example
 * ```ts
 * const dict = getDictionary();
 * const entry = dict.get('ship');
 * // => { phonemes: ['SH', 'IH', 'P'], frequency: 54321 }
 * ```
 */
export function getDictionary(): Map<string, DictionaryEntry> {
  if (!_dict) {
    _dict = loadDictionary(DEFAULT_CMUDICT_PATH, DEFAULT_SUBTLEX_PATH);
  }
  return _dict;
}

/**
 * Get the CMU dictionary (singleton)
 *
 * Loads the dictionary on first call, then reuses the cached instance.
 * For backward compatibility with existing code.
 *
 * @returns Map from lowercase words to their phoneme sequences
 *
 * @example
 * ```ts
 * const dict = getCmudict();
 * dict.get('ship');  // => ['SH', 'IH', 'P']
 * ```
 */
export function getCmudict(): Map<string, ArpabetPhoneme[]> {
  if (!_cmudictOnly) {
    _cmudictOnly = loadCmudict(DEFAULT_CMUDICT_PATH);
  }
  return _cmudictOnly;
}

/**
 * Get the SUBTLEX frequency map (singleton)
 *
 * Loads the frequency data on first call, then reuses the cached instance.
 *
 * @returns Map from lowercase words to frequency counts
 *
 * @example
 * ```ts
 * const freq = getSubtlex();
 * freq.get('the');  // => 1501908
 * ```
 */
export function getSubtlex(): Map<string, number> {
  if (!_subtlexOnly) {
    _subtlexOnly = loadSubtlex(DEFAULT_SUBTLEX_PATH);
  }
  return _subtlexOnly;
}

/**
 * Clear all cached dictionaries (for testing or memory management)
 */
export function clearDictionaryCache(): void {
  _dict = null;
  _cmudictOnly = null;
  _subtlexOnly = null;
}

/**
 * Clear the cached CMU dictionary (for backward compatibility)
 */
export function clearCmudictCache(): void {
  _cmudictOnly = null;
  // Also clear unified dictionary since it depends on CMU
  _dict = null;
}

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Look up a word in the dictionary
 *
 * @param word - The word to look up (case-insensitive)
 * @returns DictionaryEntry with phonemes and frequency, or undefined if not found
 *
 * @example
 * ```ts
 * lookupWord('cat');
 * // => { phonemes: ['K', 'AE', 'T'], frequency: 12345 }
 *
 * lookupWord('xyz');
 * // => undefined
 * ```
 */
export function lookupWord(word: string): DictionaryEntry | undefined {
  const dict = getDictionary();
  return dict.get(word.toLowerCase());
}

/**
 * Look up the pronunciation of a word
 *
 * @param word - The word to look up (case-insensitive)
 * @returns Array of phonemes (stress-stripped), or undefined if not found
 *
 * @example
 * ```ts
 * lookupPronunciation('cat');     // => ['K', 'AE', 'T']
 * lookupPronunciation('xyz');     // => undefined
 * lookupPronunciation('SHIP');    // => ['SH', 'IH', 'P']
 * ```
 */
export function lookupPronunciation(word: string): ArpabetPhoneme[] | undefined {
  const entry = lookupWord(word);
  return entry?.phonemes;
}

/**
 * Look up the frequency of a word
 *
 * @param word - The word to look up (case-insensitive)
 * @returns Frequency count, or undefined if not found in SUBTLEX corpus
 *
 * @example
 * ```ts
 * lookupFrequency('the');    // => 1501908
 * lookupFrequency('obscure'); // => 1234 (or undefined if not in corpus)
 * ```
 */
export function lookupFrequency(word: string): number | undefined {
  const entry = lookupWord(word);
  return entry?.frequency;
}

/**
 * Check if a word exists in the CMU dictionary
 *
 * @param word - The word to check (case-insensitive)
 * @returns True if the word is in the dictionary
 *
 * @example
 * ```ts
 * hasWord('cat');   // => true
 * hasWord('xyz');   // => false
 * ```
 */
export function hasWord(word: string): boolean {
  const dict = getCmudict();
  return dict.has(word.toLowerCase());
}

/**
 * Get all words in the dictionary
 *
 * @returns Array of all words in the dictionary
 */
export function getAllWords(): string[] {
  const dict = getDictionary();
  return [...dict.keys()];
}

/**
 * Get all words with frequency data
 *
 * @returns Array of all words that have SUBTLEX frequency data
 */
export function getWordsWithFrequency(): string[] {
  const dict = getDictionary();
  return [...dict.entries()]
    .filter(([_, entry]) => entry.frequency !== undefined)
    .map(([word]) => word);
}

/**
 * Get dictionary statistics
 *
 * @returns Object with dictionary statistics
 */
export function getDictionaryStats(): {
  wordCount: number;
  wordsWithFrequency: number;
  avgPhonemeLength: number;
  maxPhonemeLength: number;
  totalFrequency: number;
} {
  const dict = getDictionary();

  let totalPhonemes = 0;
  let maxPhonemes = 0;
  let wordsWithFrequency = 0;
  let totalFrequency = 0;

  for (const entry of dict.values()) {
    totalPhonemes += entry.phonemes.length;
    if (entry.phonemes.length > maxPhonemes) {
      maxPhonemes = entry.phonemes.length;
    }
    if (entry.frequency !== undefined) {
      wordsWithFrequency++;
      totalFrequency += entry.frequency;
    }
  }

  return {
    wordCount: dict.size,
    wordsWithFrequency,
    avgPhonemeLength: dict.size > 0 ? totalPhonemes / dict.size : 0,
    maxPhonemeLength: maxPhonemes,
    totalFrequency,
  };
}

/**
 * Get CMU dictionary statistics (for backward compatibility)
 *
 * @returns Object with CMU dictionary statistics
 */
export function getCmudictStats(): {
  wordCount: number;
  avgPhonemeLength: number;
  maxPhonemeLength: number;
} {
  const dict = getCmudict();

  let totalPhonemes = 0;
  let maxPhonemes = 0;

  for (const phonemes of dict.values()) {
    totalPhonemes += phonemes.length;
    if (phonemes.length > maxPhonemes) {
      maxPhonemes = phonemes.length;
    }
  }

  return {
    wordCount: dict.size,
    avgPhonemeLength: dict.size > 0 ? totalPhonemes / dict.size : 0,
    maxPhonemeLength: maxPhonemes,
  };
}
