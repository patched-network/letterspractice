/**
 * Phoneme Audio Cache
 *
 * Prefetches all ARPAbet phoneme audio files (39 total) plus compound pseudo-phonemes
 * (K_W, K_S — for "qu" and "x" GPCs) for instant playback.
 * Call prefetchPhonemeAudio() early in app lifecycle (e.g., App.vue mounted hook).
 */

import { VOWELS, CONSONANTS, phonemeSeqToId, toArpabet, type ArpabetPhoneme } from "./arpabet";

const PHONEMES_BASE = "/audio/arpa";

/**
 * Compound pseudo-phonemes: two-phoneme sequences treated as a single
 * instructional unit (recorded as one audio file). These correspond to
 * GPC-ID phoneme parts where `_` separates the underlying ARPAbet phonemes.
 *
 * - `K_W` — "qu" digraph (queen, quick)
 * - `K_S` — "x" letter (box, fox)
 */
export const COMPOUND_PHONEMES = ["K_W", "K_S"] as const;
export type CompoundPhoneme = typeof COMPOUND_PHONEMES[number];

/**
 * Any phoneme audio key — a standard ARPAbet phoneme or a compound pseudo-phoneme.
 */
export type PhonemeAudioKey = ArpabetPhoneme | CompoundPhoneme;

/**
 * Get the audio URL for a phoneme (ARPAbet or compound pseudo-phoneme).
 *
 * Example: getPhonemeAudioUrl("SH")  => "/audio/arpa/SH.mp3"
 * Example: getPhonemeAudioUrl("K_W") => "/audio/arpa/K_W.mp3"
 */
export function getPhonemeAudioUrl(phoneme: PhonemeAudioKey): string {
  return `${PHONEMES_BASE}/${phoneme.toUpperCase()}.mp3`;
}

/**
 * Normalize a phoneme string into a `PhonemeAudioKey` for audio lookup and
 * chunk playback. Accepts both single ARPAbet phonemes and the space-separated
 * compound sequences used in card data, bridging the "sequence" form to the
 * "id" form the audio layer expects:
 *
 *   "SH"  -> "SH"     (single ARPAbet)
 *   "K S" -> "K_S"    (compound, the "x" letter)
 *   "K W" -> "K_W"    (compound, the "qu" digraph)
 *
 * Compound phonemes (`K_S`/`K_W`) are not members of the ARPAbet `PHONEME_SET`,
 * so `toArpabet()` rejects them; this function accepts them. Throws if the
 * result is neither a known compound nor a valid single phoneme.
 */
export function toPhonemeAudioKey(s: string): PhonemeAudioKey {
  const id = phonemeSeqToId(s.toUpperCase().trim());
  if ((COMPOUND_PHONEMES as readonly string[]).includes(id)) {
    return id as CompoundPhoneme;
  }
  // Not a compound — must be a single ARPAbet phoneme (toArpabet validates/throws).
  return toArpabet(id);
}

/**
 * Audio object cache (prevents garbage collection)
 */
const audioCache = new Map<PhonemeAudioKey, HTMLAudioElement>();

/**
 * Prefetch all phoneme audio files into browser cache
 *
 * Creates Audio objects and calls load() to trigger immediate download.
 * Keeps references in memory to prevent garbage collection.
 * Staggers requests to avoid rate-limit spikes.
 *
 * @param staggerDelay Delay between each request in ms (default: 50)
 * @returns Promise that resolves when all phonemes are cached
 */
export async function prefetchPhonemeAudio(staggerDelay: number = 50): Promise<void> {
  const allPhonemes: PhonemeAudioKey[] = [...VOWELS, ...CONSONANTS, ...COMPOUND_PHONEMES];

  // Sequential loading with stagger
  for (let i = 0; i < allPhonemes.length; i++) {
    const phoneme = allPhonemes[i];

    await new Promise<void>((resolve) => {
      const audio = new Audio(getPhonemeAudioUrl(phoneme));

      // Event handlers
      const onCanPlay = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        console.warn(`Failed to prefetch phoneme audio: ${phoneme}`);
        resolve(); // Don't block on failures
      };

      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onCanPlay);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("canplaythrough", onCanPlay);
      audio.addEventListener("error", onError);

      // Cache the audio object (prevents GC)
      audioCache.set(phoneme, audio);

      // Trigger load
      audio.load();
    });

    // Stagger the next request (except after the last one)
    if (i < allPhonemes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, staggerDelay));
    }
  }

  console.log(`✅ Prefetched ${allPhonemes.length} phoneme audio files`);
}

/**
 * Get cached audio element for a phoneme (if available)
 */
export function getCachedPhonemeAudio(
  phoneme: PhonemeAudioKey,
): HTMLAudioElement | undefined {
  return audioCache.get(phoneme);
}
