/**
 * SightWordsLesson's step script (lesson 5, WIP), shared by the three.js
 * staging (three/SightWordsLesson3D.vue) and the SVG lesson to come, so the
 * two can't drift. Choreography is injected. Storyboard: Storyboarding.md.
 */

import { getPhonemeAudioUrl } from '../services/phonetics';
import { buildWordStep, type LessonStep } from './useLessonRunner';

/** `A` narrates (the grown-up); w, a and s play on the slide and end up as "was". */
export type SightWordsActorId = 'A' | 'w' | 'a' | 's';

type Id = SightWordsActorId;

export interface SightWordsChoreography {
  /** `a` goes to the nearer end of the slide (top or bottom) and the play holds there. */
  aToAnEnd: () => Promise<void>;
  /** `a` runs back up the chute (sliding down first if it's on top); `w` arrives above it, `s` waits below. */
  misbehave: () => Promise<void>;
  /** `a` gives up and slides down, then `w`; they step forward beside `s` as "was". */
  lineUp: () => Promise<void>;
  /** The camera closes in on the face-off (for a's odd sound). */
  closeUp: () => Promise<void>;
  /** The camera pulls back to the narrator and the word. */
  pullBack: () => void;
}

/**
 * An act that starts with a line of dialogue and plays on while it's read.
 * The press after it waits for the act (its button stays hidden until then).
 */
function act(run: () => Promise<void>) {
  let done: Promise<void> | null = null;
  return {
    start: () => {
      done ??= run();
    },
    finished: () => (done ??= run()),
  };
}

export function sightWordsSteps(ch: SightWordsChoreography): LessonStep<Id>[] {
  const toAnEnd = act(ch.aToAnEnd);
  const bend = act(ch.misbehave);
  const word = act(ch.lineUp);

  return [
    {
      kind: 'dialogue',
      actorId: 'A',
      text: 'You have learned a lot of rules for how we make sounds.',
    },
    {
      kind: 'dialogue',
      actorId: 'A',
      text: 'Like this one!',
      onEnter: () => {
        toAnEnd.start();
      },
    },
    // a's usual sound, at the top or the bottom of the slide
    { kind: 'phoneme', actorIds: ['a'], audioUrl: getPhonemeAudioUrl('AE'), onEnter: toAnEnd.finished },
    {
      kind: 'dialogue',
      actorId: 'A',
      text: 'We try our best. But sometimes rules get broken.',
      onEnter: () => {
        bend.start();
      },
    },
    // a's sound in "was" (the one the learner knows as u's), up the chute, in close-up
    {
      kind: 'phoneme',
      actorIds: ['a'],
      audioUrl: getPhonemeAudioUrl('AH'),
      onEnter: () => bend.finished().then(ch.closeUp),
    },
    {
      kind: 'dialogue',
      actorId: 'A',
      text: 'There are some important words that do not really sound the way they are spelled.',
      onEnter: () => {
        ch.pullBack();
        word.start();
      },
    },
    buildWordStep<Id>('was', ['w', 'a', 's'], { onEnter: word.finished }),
    {
      kind: 'dialogue',
      actorId: 'A',
      text: 'Do not worry! We will start pointing these words out, and practice them, so you can spot them out in the world.',
    },
    { kind: 'complete' },
  ];
}
