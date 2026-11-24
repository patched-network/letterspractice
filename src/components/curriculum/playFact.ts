/**
 * Tap-to-hear for a curriculum fact: its sound, then its first example word.
 * One chain at a time — a new tap stops the one playing.
 */

import { getPhonemeAudioUrl, toPhonemeAudioKey } from '../../services/phonetics/phonemeCache';
import type { FactInfo } from './curriculumData';

let playing: HTMLAudioElement | null = null;

/** The fact's own sound has a recording (not a whole word, not nk's NG_K) */
export function hasSound(fact: Pick<FactInfo, 'phoneme'>): boolean {
  return soundUrl(fact) !== null;
}

function soundUrl(fact: Pick<FactInfo, 'phoneme'>): string | null {
  if (!fact.phoneme) return null;
  try {
    return getPhonemeAudioUrl(toPhonemeAudioKey(fact.phoneme));
  } catch {
    // No phoneme recording for this sound (e.g. a multi-phoneme ride-along)
    return null;
  }
}

export async function playFact(fact: FactInfo): Promise<void> {
  playing?.pause();
  const word = fact.examples[0];
  const urls = [soundUrl(fact), word ? `/audio/words/${word}.mp3` : null].filter(
    (u): u is string => !!u,
  );
  for (const url of urls) {
    const audio = new Audio(url);
    playing = audio;
    const done = new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
    try {
      await audio.play();
    } catch {
      return;
    }
    await done;
    if (playing !== audio) return; // superseded by another tap
  }
}
