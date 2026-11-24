/**
 * SplitDigraphLesson's step script, shared by the SVG lesson
 * (03.SplitDigraphLesson.vue) and the three.js rework
 * (three/SplitDigraphLesson3D.vue) so the two can't drift. Choreography is
 * injected: each renderer stages its own walks. Storyboard: Storyboarding.md.
 */

import { buildWordStep, type LessonStep } from './useLessonRunner';

export type SplitDigraphActorId =
  | 'e'
  | 's' | 'h' | 'q' | 'u'
  | 'c' | 'a' | 'p' | 'k' | 'i' | 't' | 'b' | 'o';

type Id = SplitDigraphActorId;

export interface SplitDigraphChoreography {
  /** sh + qu pop in beside e, wave, and leave (concurrent with dialogue). */
  digraphCameo: () => Promise<void>;
  /** Walk a CVC word into a centred row; e parks to the side. */
  setupWord: (wordIds: [Id, Id, Id], vowelId: Id) => Promise<void>;
  /** e joins the end of the word; the vowel takes its long colour. */
  eArrives: (vowelId: Id) => Promise<void>;
  /** Old word leaves (reused letters recycle), then setupWord the new one. */
  swapWord: (oldIds: Id[], newIds: [Id, Id, Id], newVowelId: Id) => Promise<void>;
}

export function splitDigraphSteps(ch: SplitDigraphChoreography): LessonStep<Id>[] {
  const wordStep = (word: string, wordOrder: Id[]) => buildWordStep<Id>(word, wordOrder);

  return [
    { kind: 'dialogue', actorId: 'e', text: 'Hi!' },
    {
      kind: 'dialogue',
      actorId: 'e',
      text: "You've learned how some letters team up to make a sound.",
      onEnter: () => ch.digraphCameo(),
    },
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'I like to team up too — but in a sneaky way.',
    },
    {
      kind: 'dialogue',
      actorId: 'e',
      text: "When I do, my friend makes a different sound — and I stay quiet.",
    },
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'Watch me sneak up on some words!',
      onEnter: () => ch.setupWord(['c', 'a', 'p'], 'a'),
    },

    // --- Pair 1: cap → cape -------------------------------------------------
    wordStep('cap', ['c', 'a', 'p']),
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'Now watch what happens...',
      onEnter: () => ch.eArrives('a'),
    },
    wordStep('cape', ['c', 'a', 'p', 'e']),
    {
      kind: 'dialogue',
      actorId: 'e',
      text: "Hear that? My friend made a different sound!",
    },

    // --- Pair 2: kit → kite -------------------------------------------------
    // (Was pin → pine: kite is the stronger picture, and it flies with the
    // cape; kit itself is shown without one.)
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'It works with other letters too.',
      onEnter: () =>
        ch.swapWord(['c', 'a', 'p'], ['k', 'i', 't'], 'i'),
    },
    wordStep('kit', ['k', 'i', 't']),
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'Here I come...',
      onEnter: () => ch.eArrives('i'),
    },
    wordStep('kite', ['k', 'i', 't', 'e']),

    // --- Optional pair 4: hop → hope ----------------------------------------
    // Audio already exists. Uncomment to enable a fourth round.
    // {
    //   kind: 'dialogue',
    //   actorId: 'e',
    //   text: 'And even with this one!',
    //   onEnter: () =>
    //     ch.swapWord(['c', 'u', 'b'], ['h', 'o', 'p'], 'o'),
    // },
    // { kind: 'phoneme', actorIds: ['o'], audioUrl: '/audio/words/hop.mp3' },
    // {
    //   kind: 'dialogue',
    //   actorId: 'e',
    //   text: 'Watch...',
    //   onEnter: () => ch.eArrives('o'),
    // },
    // { kind: 'phoneme', actorIds: ['o', 'e'], audioUrl: '/audio/words/hope.mp3' },

    {
      kind: 'dialogue',
      actorId: 'e',
      text: "I'm a sneaky one. Let's go find more words like these!",
    },
    { kind: 'complete' },
  ];
}
