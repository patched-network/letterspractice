/**
 * The sound cue: what a lesson shows for "press to hear this", and its types.
 *
 * Two styles, switchable live while the rail is being tried out:
 *   - 'button': the overhead audio button (a keycap floating above the
 *     letters that are about to speak). The original.
 *   - 'rail': SoundRail.vue, a groove under the letters that the speaker sits
 *     in and slides through, with a milestone per sound. Under the word, so a
 *     pointing finger doesn't cover the letters, and so a drag across the
 *     word has a visible lane and visible targets.
 *
 * RETIRE(overhead-audio-button): once the rail is the choice, delete the
 * 'button' style. Every site carries this tag (grep for it):
 *   - this switch, and SOUND_CUE_STORAGE_KEY
 *   - LessonShell.vue: the <button class="lesson__audio-btn"> and its CSS
 *   - useLessonRunner.ts: audioButtonLeft/Top/Width, audioButtonStyle, the
 *     glide in recomputeAudioButton, AUDIO_BTN_HEIGHT / AUDIO_BTN_GAP. (The
 *     measuring moments stay: the rail is measured at the same ones.)
 *   - MissingLettersView.vue: its own overhead button (.ml-audio-btn)
 *   - the style toggles on /dbg/lesson/three and /dbg/questions/missing-letters
 * Not yet on the rail at all, and still to move before the button's look is
 * truly gone: the static PlaySoundButton in the intro / exercise views.
 */

import { ref, watch } from 'vue';

export type SoundCueStyle = 'button' | 'rail';

const SOUND_CUE_STORAGE_KEY = 'lp.soundCue';

function storedStyle(): SoundCueStyle {
  try {
    return localStorage.getItem(SOUND_CUE_STORAGE_KEY) === 'button' ? 'button' : 'rail';
  } catch {
    return 'rail';
  }
}

/**
 * Which cue lessons show: the rail, unless the button was chosen on this
 * browser (remembered, so a choice made on /dbg/lesson/three carries into the
 * real lessons on that device).
 */
export const soundCueStyle = ref<SoundCueStyle>(storedStyle());

watch(soundCueStyle, (style) => {
  try {
    localStorage.setItem(SOUND_CUE_STORAGE_KEY, style);
  } catch {
    /* private mode: the choice lasts the page */
  }
});

// ---------------------------------------------------------------------------
// SoundRail's inputs (px, in the space of the rail's offset parent)
// ---------------------------------------------------------------------------

/** A milestone's state: waiting, reached at speed (not yet played), reached, sounding now, or not playable. */
export type RailSegmentState = 'idle' | 'held' | 'fired' | 'speaking' | 'quiet';

export interface RailSpan {
  left: number;
  width: number;
}

/**
 * What a milestone shows on itself when it can be played on its own (a tap
 * on it, or a number key): the key that plays it, or a small speaker for a
 * touch screen. MissingLetters' given letters.
 */
export type RailMark = { key: string } | 'speaker';

/** One sound's milestone. Usually one pad; a split team (a-e) has two, bridged. */
export interface RailSegment {
  key: string | number;
  color: string;
  pads: RailSpan[];
  state: RailSegmentState;
  mark?: RailMark;
}

export interface RailPuck extends RailSpan {
  color?: string;
  playing?: boolean;
  /** A finger is pressing it: pushed into the groove, as a keycap. */
  pressed?: boolean;
  /** A finger has it and is moving it: lifted off the groove. */
  held?: boolean;
  /** Stretched along its travel by this fraction (fast motion), squashed across by a little less. */
  stretch?: number;
}

/** Everything SoundRail draws. */
export interface SoundRailView {
  left: number;
  top: number;
  width: number;
  height: number;
  segments: RailSegment[];
  puck: RailPuck | null;
  /** x the rail is "used up" to (a drag's or a word playback's progress), or null. */
  fillTo: number | null;
}
