/**
 * Phonetics Service
 *
 * Provides phonetic data for words with recorded audio, including:
 * - ARPAbet phoneme sequences
 * - Grapheme-phoneme correspondences (GPCs)
 * - Audio URL generation for phonemes
 * - Phoneme prefetching
 * - Speaker timing computation for audio-synced animations
 */

export { PHONETIC_INDEX, type PhoneticChunk, type WordPhonetics, type AudioTimingMs } from '../phonetics.generated';
export * from './arpabet';
export * from './phonemeCache';
export { computeSpeakerTimings, computeSpeakerTimingsFromAudioTiming, computeSpeakerTimingsForWord } from './speakerTimings';
export type { SpeakerTiming, SpeakerTimingOptions } from './speakerTimings';
export { analyzeAttempt } from './contextualPhoneme';
export type { AttemptAnalysis, ContextualLetterSound, ContextualSoundKind } from './contextualPhoneme';

import { PHONETIC_INDEX, type WordPhonetics } from '../phonetics.generated';
import { getPhonemeAudioUrl } from './phonemeCache';

/**
 * Get phonetic data for a word
 */
export function getPhonetics(word: string): WordPhonetics | null {
  return PHONETIC_INDEX[word.toLowerCase()] ?? null;
}

/**
 * Get all available words in the phonetic index
 */
export function getAvailableWords(): string[] {
  return Object.keys(PHONETIC_INDEX);
}

/**
 * Find the index of the first differing phoneme between two words
 *
 * @returns Index of first difference, or null if words are identical or unavailable
 */
export function findPhoneticDifference(word1: string, word2: string): number | null {
  const p1 = getPhonetics(word1);
  const p2 = getPhonetics(word2);
  if (!p1 || !p2) return null;

  const maxLen = Math.max(p1.phonemes.length, p2.phonemes.length);
  for (let i = 0; i < maxLen; i++) {
    if (p1.phonemes[i] !== p2.phonemes[i]) {
      return i;
    }
  }
  return null;
}

// Re-export phoneme audio helper for convenience
export { getPhonemeAudioUrl };
