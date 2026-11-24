/**
 * Typed index of word audio assets
 *
 * Provides type-safe access to word pronunciation files in /audio/words/
 */

import { WORD_LIST, type WordKey } from './word-list';

const WORDS_BASE = '/audio/words';

// Re-export WordKey for backward compatibility
export type { WordKey };

/**
 * Get the URL for a word's audio file
 * @param word - The word to get audio for
 * @returns URL path to the audio file
 */
export function getWordAudio(word: WordKey): string {
  return `${WORDS_BASE}/${word}.mp3`;
}

/**
 * All word audio URLs as a mapped object (for iteration/inspection)
 */
export const words: Record<WordKey, string> = Object.fromEntries(
  WORD_LIST.map(word => [word, getWordAudio(word)])
) as Record<WordKey, string>;
