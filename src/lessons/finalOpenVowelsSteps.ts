/**
 * FinalOpenVowelsLesson's step script and word rows, shared by the SVG lesson
 * (04.FinalOpenVowelsLesson.vue) and the three.js rework
 * (three/FinalOpenVowelsLesson3D.vue) so the two can't drift. Choreography
 * and row depths are per-renderer staging. Storyboard: Storyboarding.md.
 */

import { buildWordStep, type LessonStep } from './useLessonRunner';

/**
 * Ids are word-scoped, not letter-scoped: three words are on stage together,
 * so `h` and `e` each appear more than once. 'e' alone is the host.
 */
export type FinalOpenVowelsActorId =
  | 'e'
  | 'hide-h' | 'hide-i' | 'hide-d' | 'hide-e'
  | 'note-n' | 'note-o' | 'note-t' | 'note-e'
  | 'here-h' | 'here-e1' | 'here-r' | 'here-e2';

type Id = FinalOpenVowelsActorId;

export const FINAL_OPEN_VOWELS_LETTER_FOR: Record<Id, string> = {
  e: 'e',
  'hide-h': 'h', 'hide-i': 'i', 'hide-d': 'd', 'hide-e': 'e',
  'note-n': 'n', 'note-o': 'o', 'note-t': 't', 'note-e': 'e',
  'here-h': 'h', 'here-e1': 'e', 'here-r': 'r', 'here-e2': 'e',
};

/**
 * One word per depth row, back → front. Letter order matches the phonetic
 * index's letter positions in all six words: index 1 is the vowel, index 3
 * is the silent e. Trio 2 is always `ids.slice(0, 2)` — every word peels its
 * last two.
 */
export const FINAL_OPEN_VOWELS_ROW_WORDS: [Id, Id, Id, Id][] = [
  ['hide-h', 'hide-i', 'hide-d', 'hide-e'],
  ['note-n', 'note-o', 'note-t', 'note-e'],
  ['here-h', 'here-e1', 'here-r', 'here-e2'],
];

/** Trio 2 keeps the first two letters of each word. */
export const FINAL_OPEN_VOWELS_KEEP_COUNT = 2;

export interface FinalOpenVowelsChoreography {
  /** The whole stack walks on; the host steps downstage left. */
  stageTrio1: () => Promise<void>;
  /** Every word sheds its last two letters at once. */
  peelToTrio2: () => Promise<void>;
  /** A row's word step is starting (e.g. hand the audio button its hue). */
  onRowWord: (rowIndex: number) => void;
}

export function finalOpenVowelsSteps(ch: FinalOpenVowelsChoreography): LessonStep<Id>[] {
  /** Word step that also tells the renderer which row is speaking. */
  const rowWordStep = (word: string, rowIndex: number, ids: readonly Id[]): LessonStep<Id> =>
    buildWordStep<Id>(word, [...ids], { onEnter: () => ch.onRowWord(rowIndex) });

  const trio1 = FINAL_OPEN_VOWELS_ROW_WORDS;
  const trio2 = FINAL_OPEN_VOWELS_ROW_WORDS.map(
    (ids) => ids.slice(0, FINAL_OPEN_VOWELS_KEEP_COUNT) as Id[],
  );

  return [
    // --- Trio 1: e is at the end, and her friend says the changed sound ------
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'Hey! Remember how I help some letters make a new sound?',
      onEnter: () => ch.stageTrio1(),
    },
    rowWordStep('hide', 0, trio1[0]),
    rowWordStep('note', 1, trio1[1]),
    rowWordStep('here', 2, trio1[2]),

    // --- The peel: every word loses its consonant and its e, all at once -----
    {
      kind: 'dialogue',
      actorId: 'e',
      text: 'At the end of a word, those letters like to make that same sound all by themselves!',
      onEnter: () => ch.peelToTrio2(),
    },
    rowWordStep('hi', 0, trio2[0]),
    rowWordStep('no', 1, trio2[1]),
    rowWordStep('he', 2, trio2[2]),

    {
      kind: 'dialogue',
      actorId: 'e',
      text: "Let's go find more words like these!",
    },
    { kind: 'complete' },
  ];
}
