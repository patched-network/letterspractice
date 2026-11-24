/**
 * DigraphLesson's step script, shared by the SVG lesson (02.DigraphLesson.vue)
 * and the three.js rework (three/DigraphLesson3D.vue) so the two can't drift.
 * Choreography is injected: each renderer stages its own walks.
 * Storyboard: Storyboarding.md.
 */

import { getPhonemeAudioUrl } from '../services/phonetics/phonemeCache';
import { buildWordStep, type LessonStep } from './useLessonRunner';

// 'i2' is a second i actor used for `fish` so it can walk in from the left
// while the original 'i' (from `ship`) is still walking off to the right.
export type DigraphActorId = 's' | 'h' | 'i' | 'p' | 'f' | 'i2';

export interface DigraphChoreography {
  hWalksIn: () => Promise<void>;
  shipWalkIn: () => Promise<void>;
  shipOutFishIn: () => Promise<void>;
}

export function digraphSteps(ch: DigraphChoreography): LessonStep<DigraphActorId>[] {
  return [
    {
      kind: 'dialogue',
      actorId: 's',
      text: "Wow, you've been learning a lot of letter sounds!",
    },
    {
      kind: 'dialogue',
      actorId: 's',
      text: 'Most of the time, each letter makes its own sound...',
    },
    {
      kind: 'dialogue',
      actorId: 's',
      text: '...but sometimes, a letter teams up with a friend to make a sound together.',
      onEnter: () => ch.hWalksIn(),
    },
    { kind: 'dialogue', actorId: 'h', text: 'Like us! Watch this —' },
    { kind: 'phoneme', actorIds: ['s', 'h'], audioUrl: getPhonemeAudioUrl('SH') },
    {
      kind: 'dialogue',
      actorId: 's',
      text: 'Like in this word.',
      onEnter: () => ch.shipWalkIn(),
    },
    { kind: 'phoneme', actorIds: ['s', 'h'], audioUrl: getPhonemeAudioUrl('SH') },
    { kind: 'phoneme', actorIds: ['i'], audioUrl: getPhonemeAudioUrl('IH') },
    { kind: 'phoneme', actorIds: ['p'], audioUrl: getPhonemeAudioUrl('P') },
    buildWordStep<DigraphActorId>('ship', ['s', 'h', 'i', 'p']),
    {
      kind: 'dialogue',
      actorId: 'h',
      text: 'And in this one too —',
      onEnter: () => ch.shipOutFishIn(),
    },
    { kind: 'phoneme', actorIds: ['f'], audioUrl: getPhonemeAudioUrl('F') },
    { kind: 'phoneme', actorIds: ['i2'], audioUrl: getPhonemeAudioUrl('IH') },
    { kind: 'phoneme', actorIds: ['s', 'h'], audioUrl: getPhonemeAudioUrl('SH') },
    buildWordStep<DigraphActorId>('fish', ['f', 'i2', 's', 'h']),
    {
      kind: 'dialogue',
      actorId: 'h',
      text: "Letter teams are fun to spot. Let's go meet some more!",
    },
    { kind: 'complete' },
  ];
}
