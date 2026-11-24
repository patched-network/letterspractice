/**
 * The bed lesson's step script (lesson 1a, "Making our bed": the b/d "bed"
 * mnemonic, standing in front of b's intro card). Played by the three.js
 * staging (three/BedLesson3D.vue); 3D-only. Choreography is injected.
 * Storyboard: Storyboarding.md.
 *
 * Built scene-first. No letter is named in the dialogue (the parent reads it
 * aloud); staging says who's who.
 */

import { getPhonemeAudioUrl } from '../services/phonetics';
import { buildWordStep, type LessonStep } from './useLessonRunner';

/** `i` sleeps on the bed, then hosts; b, e and d are the bed. */
export type BedActorId = 'i' | 'b' | 'e' | 'd';

type Id = BedActorId;

export interface BedChoreography {
  /** The lamp goes on; i wakes, stretches and jumps down beside the foot of the bed. Dawn starts. */
  wakeUp: () => Promise<void>;
  /** i whips the sheet off the bed; the bed's letters wake up. */
  pullSheet: () => Promise<void>;
  /** b and d step forward, a little sheepish; e steps back. */
  mixUp: () => Promise<void>;
  /** All three back in a row: the bed again. */
  together: () => Promise<void>;
  /** i makes the bed: a fresh sheet floats down over it. */
  makeBed: () => Promise<void>;
  /** The camera closes in on i, which makes the bed with its hands: two thumbs up, knuckles together. */
  bedHands: () => Promise<void>;
}

export function bedSteps(ch: BedChoreography): LessonStep<Id>[] {
  return [
    // Opening: a dark bedroom, i asleep on the bed, snoring
    { kind: 'beat' },
    // The next press waits for i to land
    { kind: 'beat', onEnter: ch.wakeUp },
    { kind: 'dialogue', actorId: 'i', text: 'Good morning! I was just sleeping in my...' },
    // The sentence finishes with the whole word, from the bed (its button over the bed)
    buildWordStep<Id>('bed', ['b', 'e', 'd']),
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'The word bed has two letters you already know, and one new letter who is tricky in a new way.',
    },
    // The sheet comes off; then each letter's sound in turn
    { kind: 'phoneme', actorIds: ['b'], audioUrl: getPhonemeAudioUrl('B'), onEnter: ch.pullSheet },
    { kind: 'phoneme', actorIds: ['e'], audioUrl: getPhonemeAudioUrl('EH') },
    { kind: 'phoneme', actorIds: ['d'], audioUrl: getPhonemeAudioUrl('D') },
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'These letters can be easy to mix up, especially for beginners.',
      onEnter: ch.mixUp,
    },
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'So we will do some special practice to tell them apart.',
      onEnter: ch.together,
    },
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'And you can make your bed to help you remember.',
      onEnter: ch.makeBed,
    },
    // The bed hands: seen from the front, the left fist is a b and the right a d
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'Two thumbs up, and put your knuckles together. A bed!',
      onEnter: ch.bedHands,
    },
    { kind: 'complete' },
  ];
}
