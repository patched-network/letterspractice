/**
 * How a sight-word intro card (SightWordIntro) steps its word: the steps,
 * which of them misbehave, and who in the word minds.
 *
 * A chunk misbehaves when it carries the sight word's own GPC (GPC-WORD-x)
 * and isn't a consonant making one of its usual sounds. The chunk builder
 * also gives the word's GPC to regular consonants next to the odd part when
 * the regular parse can't place them (would's d, some's m, friend's n and d);
 * nobody should glare at a /d/.
 *
 * Letters in no chunk are silent, and each is a step of its own: typed, it
 * hushes (`silent-e`), with no sound. A final e after a consonant is being
 * its usual silent self, so it minds. The vowel it should have made long
 * misbehaves instead, on its own step: are's a and one's o do anyway, and
 * have's a, a fair short vowel, does for ignoring it. Any other silent
 * letter misbehaves.
 *
 * Letters in no misbehaving step mind (they react). A word with none (of,
 * who, oh, eye) gets an onlooker outside its card.
 *
 * The learner types the word in spelling order, and a step sounds once its
 * letters are all in (after the steps before it). Steps can share letters
 * (one: o makes /w/ then /ʌ/) or span several (said's ai), so a letter can
 * sound several steps, or none yet.
 */

import { isOddSightWordChunk } from '../../content/phoneticAnalytics/lib/catalogue';
import type { LetterEffect } from '../composables/useTimedWordPlayback';
import type { PhonemeAudioKey } from '../services/phonetics/phonemeCache';

/** A stepper step: PhoneticWord's `PhoneticChunk` shape. */
export interface SightWordStep {
  letters: { [index: number]: LetterEffect | LetterEffect[] };
  /** None: a silent letter's step (it only hushes). */
  phoneme?: PhonemeAudioKey;
  label?: string;
}

/** A chunk as the phonetic index has it. */
export interface IndexChunk {
  letters: { [index: number]: string | string[] };
  phoneme: string;
  label?: string;
  gpcId?: string;
}

/**
 * What the 3D word stands on (DBG: compare at /dbg/questions/sight-word-intro).
 * - platform: a raised slab; the onlooker stands on the floor beside it
 * - mat: the same, a rug's thickness
 * - floor: nothing; contact shadows ground them
 * - float: hovering, bobbing, shadows faint below
 * - card: an upright card behind them (the first try)
 */
export type SightWordStaging = 'platform' | 'mat' | 'floor' | 'float' | 'card';

export interface SightWordIntroPlan {
  /** The stepper's steps: one per sound, and one per silent letter, in spelling order. */
  steps: SightWordStep[];
  /** Per step, the letters misbehaving on it (empty: a well-behaved step). */
  culprits: number[][];
  /** Letters that never misbehave; they react. Empty: an onlooker reacts. */
  minders: number[];
  /** Per letter, how many steps have sounded once it's typed (one: [2, 3, 4]). */
  soundedAfter: number[];
}

function letterIndices(chunk: { letters: object }): number[] {
  return Object.keys(chunk.letters).map(Number);
}

const isVowel = (ch: string | undefined) => !!ch && 'aeiou'.includes(ch);

/** A silent final e after a vowel and a consonant (have, are, one): it should make that vowel long. */
function isSilentFinalE(word: string, i: number, voiced: Set<number>): boolean {
  return !voiced.has(i) && word[i] === 'e' && i === word.length - 1 && !isVowel(word[i - 1]) && isVowel(word[i - 2]);
}

export function planSightWordIntro(word: string, chunks: IndexChunk[]): SightWordIntroPlan {
  const steps: SightWordStep[] = chunks.map((c) => ({
    letters: { ...(c.letters as SightWordStep['letters']) },
    phoneme: c.phoneme as PhonemeAudioKey,
    label: c.label,
  }));
  const culprits = chunks.map((c) => (isOddSightWordChunk(word, c) ? letterIndices(c) : []));
  const voiced = new Set(chunks.flatMap(letterIndices));

  // The vowel a silent final e should have made long misbehaves on its own step
  const last = word.length - 1;
  if (isSilentFinalE(word, last, voiced)) {
    const vowel = last - 2;
    const k = steps.findIndex((step) => vowel in step.letters);
    if (k >= 0 && !culprits[k].includes(vowel)) culprits[k] = [...culprits[k], vowel];
  }

  // Each silent letter hushes on a step of its own, before the first step that ends after it
  for (let i = 0; i < word.length; i++) {
    if (voiced.has(i) || steps.length === 0) continue;
    const blamed = isSilentFinalE(word, i, voiced) ? [] : [i];
    const at = steps.findIndex((step) => Math.max(...letterIndices(step)) > i);
    const k = at < 0 ? steps.length : at;
    steps.splice(k, 0, { letters: { [i]: 'silent-e' }, label: word[i] });
    culprits.splice(k, 0, blamed);
  }

  const bad = new Set(culprits.flat());
  const minders = [...word].map((_, i) => i).filter((i) => !bad.has(i));

  // Typed in order, a step's letters are all in once its last one is
  const lastLetters = steps.map((step) => Math.max(...letterIndices(step)));
  let sounded = 0;
  const soundedAfter = [...word].map((_, i) => {
    while (sounded < steps.length && lastLetters[sounded] <= i) sounded++;
    return sounded;
  });
  return { steps, culprits, minders, soundedAfter };
}
