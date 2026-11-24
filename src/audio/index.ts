/**
 * Audio asset index
 *
 * Centralized, typed access to all audio files in the application.
 *
 * @example
 * ```ts
 * import { getArpabetForLetter, getPhonemeUrlForLetter, words, getWordAudio } from '@/audio';
 * import { getPhonemeAudioUrl } from '@/services/phonetics';
 *
 * // Letter → ARPAbet phoneme (for keyboard)
 * const arpabet = getArpabetForLetter('a');       // 'AE' (short vowel)
 * const url = getPhonemeUrlForLetter('b');        // '/audio/arpa/B.mp3'
 *
 * // ARPAbet → audio URL (for phonetics service)
 * const shUrl = getPhonemeAudioUrl('SH');         // '/audio/arpa/SH.mp3'
 *
 * // Word audio
 * const fishAudio = words.fish;                   // '/audio/words/fish.mp3'
 * const batAudio = getWordAudio('bat');           // '/audio/words/bat.mp3'
 * ```
 */

// Letter to ARPAbet mapping (for keyboard phoneme lookups)
export {
  LETTER_TO_ARPABET,
  getArpabetForLetter,
  getPhonemeUrlForLetter,
  hasPhonemeMapping
} from './letterToArpabet';

// Word audio index
export { words, getWordAudio } from './words';
export type { WordKey } from './words';
