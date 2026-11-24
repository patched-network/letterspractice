/**
 * floss.ts — the floss dance, as a reusable phrase.
 *
 * Lifted verbatim (angles, timings, z-layer schedule) from the tuning done in
 * `src/dbg/FlossDebug.vue`, which now imports from here rather than keeping its
 * own copy. The debug view is the place to re-tune it; this module is the place
 * the tuned version lives.
 *
 * The dance is six beats long. Arms swing left/right in unison while the body
 * skews at the hips against them, and on two of the six beats the trailing arm
 * passes BEHIND the body — that behind-the-body pass is the whole readable
 * signature of a floss, and it is why the z-layer schedule below is not
 * symmetric.
 */

import type { LetterInstance } from "../types";

// Arm swing target angles (0=right, 90=down, 180=left)
const ARM_LEFT_ANGLE_L = 200; // left arm when both swing left
const ARM_LEFT_ANGLE_R = 120; // right arm when both swing left
const ARM_RIGHT_ANGLE_L = 60; // left arm when both swing right
const ARM_RIGHT_ANGLE_R = -20; // right arm when both swing right

/** Human-readable description of each beat, for debug UI. */
export const FLOSS_BEAT_LABELS = [
  "R→L, R behind",
  "L→R, R returns",
  "R→L, both front",
  "L→R, L behind",
  "R→L, L returns",
  "L→R, both front",
];

/** Beats in one full floss cycle. */
export const FLOSS_CYCLE_BEATS = FLOSS_BEAT_LABELS.length;

export const FLOSS_DEFAULT_BEAT_MS = 400;
export const FLOSS_DEFAULT_AMPLITUDE = 7;

export interface FlossBeatOptions {
  /** Duration of this beat in ms. */
  beatMs?: number;
  /** Hip skew amplitude in degrees. */
  amplitude?: number;
  /** Polled to cancel the deferred z-layer flip if the dance is torn down. */
  isAborted?: () => boolean;
}

/** Apply z-layer for the given beat phase (0-5). */
function applyZLayer(letter: LetterInstance, phase: number) {
  switch (phase) {
    case 0: // R-hand behind
      letter.arms.right.sendToBack();
      letter.arms.left.bringToFront();
      break;
    case 3: // L-hand behind
      letter.arms.left.sendToBack();
      letter.arms.right.bringToFront();
      break;
    default: // 1,2,4,5: both in front
      letter.arms.left.bringToFront();
      letter.arms.right.bringToFront();
      break;
  }
}

/** Execute one beat of the floss at the given beat index. */
export async function flossOneBeat(
  letter: LetterInstance,
  beatIndex: number,
  options: FlossBeatOptions = {},
): Promise<void> {
  const dur = options.beatMs ?? FLOSS_DEFAULT_BEAT_MS;
  const hipDeg = options.amplitude ?? FLOSS_DEFAULT_AMPLITUDE;

  const phase = beatIndex % FLOSS_CYCLE_BEATS;
  const swingLeft = beatIndex % 2 === 0;

  const lTarget = swingLeft ? ARM_LEFT_ANGLE_L : ARM_RIGHT_ANGLE_L;
  const rTarget = swingLeft ? ARM_LEFT_ANGLE_R : ARM_RIGHT_ANGLE_R;
  const hipTarget = swingLeft ? hipDeg : -hipDeg;

  // Z-layer timing:
  // - "Goes behind" beats (0, 3): apply at start — arm is at far extreme, clear of body.
  // - "Returns to front" beats (1, 4): delay until arm has swung past the body
  //   on the return trip (~60% through with inOutSine), so it doesn't pop through.
  // - "Both front" beats (2, 5): apply at start — already both front, no change.
  let zTimer: ReturnType<typeof setTimeout> | undefined;
  if (phase === 1 || phase === 4) {
    zTimer = setTimeout(() => applyZLayer(letter, phase), dur * 0.6);
  } else {
    applyZLayer(letter, phase);
  }

  await Promise.all([
    letter.arms.left.rotateTo(lTarget, { duration: dur, ease: "inOutSine" }),
    letter.arms.right.rotateTo(rTarget, { duration: dur, ease: "inOutSine" }),
    letter.body.skewTo(hipTarget, { duration: dur, ease: "inOutSine" }),
  ]);

  if (options.isAborted?.() && zTimer) clearTimeout(zTimer);
}

export interface FlossOptions extends FlossBeatOptions {
  /** Total beats to dance. Default: one full cycle (6). */
  beats?: number;
  /**
   * Beat index to start on. Offsetting this per letter turns a word into a
   * chorus line — each letter a beat behind its neighbour — instead of a
   * mechanical unison.
   */
  startBeat?: number;
  /**
   * Skew the body but leave the arms out of it. For narrow glyphs
   * (punctuation) where arms read as flailing rather than dancing.
   */
  bodyOnly?: boolean;
  /** Restore neutral pose when the dance ends. Default true. */
  reset?: boolean;
}

/**
 * Dance. Resolves when the last beat lands (and, unless `reset: false`, once
 * the letter is back to neutral). Poll `isAborted` to cut it short — the loop
 * checks between beats.
 */
export async function floss(
  letter: LetterInstance,
  options: FlossOptions = {},
): Promise<void> {
  const beats = options.beats ?? FLOSS_CYCLE_BEATS;
  const startBeat = options.startBeat ?? 0;
  const isAborted = options.isAborted;

  if (!options.bodyOnly) {
    await letter.arms.show({ duration: 150 });
  }
  if (isAborted?.()) return;

  for (let i = 0; i < beats; i++) {
    if (isAborted?.()) break;
    if (options.bodyOnly) {
      const swingLeft = (startBeat + i) % 2 === 0;
      const hip = options.amplitude ?? FLOSS_DEFAULT_AMPLITUDE;
      await letter.body.skewTo(swingLeft ? hip : -hip, {
        duration: options.beatMs ?? FLOSS_DEFAULT_BEAT_MS,
        ease: "inOutSine",
      });
    } else {
      await flossOneBeat(letter, startBeat + i, options);
    }
  }

  if (options.reset === false) return;

  letter.arms.left.bringToFront();
  letter.arms.right.bringToFront();
  await Promise.all([
    letter.body.skewTo(0, { duration: 200 }),
    options.bodyOnly
      ? Promise.resolve()
      : letter.arms.relax({ duration: 300 }),
  ]);
}
