/**
 * HelloWorld's step script, shared by the SVG lesson (01.HelloWorldLesson.vue)
 * and the three.js rework (three/HelloWorldLesson3D.vue) so the two can't
 * drift. Storyboard: Storyboarding.md.
 */

import { getPhonemeAudioUrl } from '../services/phonetics/phonemeCache';
import { buildWordStep, type LessonStep } from './useLessonRunner';

export type HelloWorldActorId = 'h' | 'i';

/**
 * First step at which the letters have walked to their centered positions.
 * The walk fires on this step's onEnter (the 'hi' word step), so earlier
 * steps keep the spread layout and this step onward is centered.
 */
export const HELLO_WORLD_WALK_STEP_INDEX = 7;

export function helloWorldSteps(
  walkTogether: () => Promise<void>,
): LessonStep<HelloWorldActorId>[] {
  const wordStep = (
    word: string,
    wordOrder: HelloWorldActorId[],
    options?: { onEnter?: () => void | Promise<void> },
  ) => buildWordStep<HelloWorldActorId>(word, wordOrder, options);

  return [
    { kind: 'dialogue', actorId: 'h', text: 'Do you know us?' },
    { kind: 'dialogue', actorId: 'i', text: "We're letters!" },
    { kind: 'dialogue', actorId: 'h', text: 'Our job is to make sounds.' },
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'Try it!',
    },
    { kind: 'phoneme', actorIds: ['h'], audioUrl: getPhonemeAudioUrl('HH') },
    { kind: 'phoneme', actorIds: ['i'], audioUrl: getPhonemeAudioUrl('AY') },
    {
      kind: 'dialogue',
      actorId: 'h',
      text: 'We put our sounds together to make a word.',
    },
    // Walk the letters together as the 'hi' word step opens — not during the
    // dialogue above. Deferring it here keeps the speech balloon anchored to a
    // stationary letter (no mid-animation reflow); the runner silences the prior
    // balloon before this onEnter runs, so nothing tracks the moving actors.
    wordStep('hi', ['h', 'i'], { onEnter: () => walkTogether() }),
    {
      kind: 'dialogue',
      actorId: 'i',
      text: 'Most letters have a favorite sound that they like to make.',
    },
    {
      kind: 'dialogue',
      actorId: 'h',
      text: "Let's start learning some letter sounds!",
    },
    { kind: 'complete' },
  ];
}
