/**
 * heroReadAnimation.ts — timeline for the hero's "Teach your child to [_ead]"
 * vignette.
 *
 * The hero poses a real MissingLetters exercise and answers it: the word loads
 * as `_ead` with a blinking cursor in the blank, the `r` fills itself, and the
 * word celebrates — the same beats (and the same durations) the real exercise
 * runs in `src/questions/MissingLettersView.vue`. Rationale and the settled
 * design decisions live in `hero-read.spec.md`.
 *
 * Tapping the settled word runs `advance()`, which re-poses and re-answers. The
 * component decides what "re-pose" means — same word re-blanked, or the next
 * word of its tap ring (read → spell → learn → read) swapped in. Nothing
 * advances on its own: the hero has no auto-cycle and no perpetual motion.
 *
 * This module owns TIMING ONLY. Creating/destroying the letter in the blank,
 * swapping words, and the cursor's visibility are injected as callbacks by
 * HeroReadVignette.vue, which owns the DOM.
 *
 * Follows the controller pattern of the (now removed) heroGreetingAnimation.ts:
 * a factory returning a controller with an explicit `cleanup()` for unmount.
 */

import {
  celebrate as celebrateLetter,
  startIdle,
} from "../../letterpeople/animations";
import { asPerformer } from "../../letterpeople/animations/performer";
import type { LetterInstance } from "../../letterpeople/types";

/** Beat before the answer arrives on first load. Long enough to read the blank. */
const POSE_BEAT_MS = 2500;
/** Shorter beat on tap — the visitor asked for it, don't make them wait. */
const REPLAY_BEAT_MS = 700;
/** Matches MissingLettersView's celebration: eyes+mouth in, then staggered. */
const FACE_SHOW_MS = 150;
const STAGGER_MS = 60;

// Settled state: the word stays characterized — eyes on, watching the pointer,
// blinking — and one letter waves now and then. Everything here is deliberately
// LOW-FREQUENCY: the hero must not compete with the video section below it, so
// the resting word should read as alive-but-still, not as an animation loop.
/** First wave lands shortly after the celebration settles… */
const WAVE_FIRST_MS = 3800;
/** …then one every WAVE_MIN + up to WAVE_SPREAD ms, from a random letter. */
const WAVE_MIN_MS = 9000;
const WAVE_SPREAD_MS = 7000;
const WAVE_ARM_SHOW_MS = 200;
const WAVE_MS = 650;

// Discoverability (hero-read.spec.md §11). The tap ring is invisible on touch
// and nearly so on desktop, so two hints, both one-off and both in character:
//
// - The NUDGE: once per page load, if the visitor hasn't tapped by
//   NUDGE_MS after the opening sequence settles, the letters do a small hop,
//   left to right, as if someone had knocked. Never repeats, never changes the
//   word, and skipped if the word is off screen or the tab hidden then. Timed
//   to land after the first wave has finished (WAVE_FIRST_MS + ~1.1 s), and
//   long before the second can start (WAVE_MIN_MS later).
// - HOVER (pointer devices): the letters perk up (brows up, mouths open)
//   while the pointer is on the word, and settle back when it leaves.
const NUDGE_MS = 6500;
const NUDGE_STAGGER_MS = 90;
/** Hop height, in the letter's own SVG units (celebrateJump uses 50). */
const NUDGE_HOP = 16;
const PERK_MS = 160;
/** A fresh mouth's shape (DEFAULT_MOUTH_PARAMS in letterpeople/attachments/mouth.ts). */
const MOUTH_REST = { openness: 0.2, mood: 0.7 };
const MOUTH_PERK = { openness: 0.45, mood: 1 };

/** What `reposeNext` put on stage, and what to do with it. */
export interface PosedRung {
  /**
   * False for encore rungs, which arrive complete: no cursor, no fill, straight
   * to the faces. An encore is not an exercise and must not cosplay as one.
   */
  hasBlank: boolean;
  /** Optional performance to run after the celebration (juggle, dance). */
  perform?: () => Promise<void>;
}

export interface ReadVignetteConfig {
  /** The current word's letter instances, left→right; the blank is null. */
  getLetters: () => (LetterInstance | null)[];
  /** Create the blank's letter with the exercise's fill animation. */
  fillBlank: (animated: boolean) => Promise<void>;
  /**
   * Return the word to a posed state for the next run — the same word
   * re-blanked, the ring's next word swapped in with its blank empty, or an
   * encore word arriving complete. The component owns that choice and its
   * transition; this module only acts on the descriptor it hands back.
   */
  reposeNext: () => Promise<PosedRung>;
  /**
   * Put `read` back on stage, complete. Called when an encore is abandoned —
   * quietly, with no exercise and no celebration, so a visitor who has already
   * looked away isn't summoned back.
   */
  goHome: () => Promise<void>;
  setCursorVisible: (visible: boolean) => void;
  /** Whether the word is on screen now. The nudge is skipped when it isn't. */
  isInView?: () => boolean;
}

export interface ReadVignetteController {
  /** Full sequence: pose → fill → celebrate → settle. Safe to call once. */
  play: () => Promise<void>;
  /**
   * Tap handler: re-pose (which may swap in the ring's next word) and answer
   * it. Resolves `false` without doing anything if a run is already in flight.
   */
  advance: () => Promise<boolean>;
  /**
   * Quiet return to `read` after an abandoned encore. Yields to a run already
   * in flight — a visitor who kept tapping has not abandoned anything.
   */
  returnHome: () => Promise<void>;
  /** Reduced-motion branch: completed word, faces on, nothing moving. */
  renderStatic: () => Promise<void>;
  /** Pointer entered (true) or left (false) the word. Ignored mid-run. */
  hover: (on: boolean) => void;
  cleanup: () => void;
}

export function createReadVignetteController(
  config: ReadVignetteConfig,
): ReadVignetteController {
  const { getLetters, fillBlank, reposeNext, goHome, setCursorVisible } =
    config;

  let running = false;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Per-letter idle teardowns returned by startIdle(). */
  let idleStops: Array<() => void> = [];
  let waveTimer: ReturnType<typeof setTimeout> | null = null;
  let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by the first tap: someone who has found the ring needs no nudge. */
  let tapped = false;
  let perked = false;

  /** Cancellable sleep — resolves early (and reports it) on cleanup. */
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  const presentLetters = (): LetterInstance[] =>
    getLetters().filter((l): l is LetterInstance => l !== null);

  const celebrate = async (): Promise<void> => {
    const letters = presentLetters();
    if (letters.length === 0) return;

    // Faces on, then a staggered left→right celebration — mirrors
    // runCelebration() in MissingLettersView.vue.
    await Promise.all(
      letters.flatMap((letter) => [
        letter.eyes.show({ duration: FACE_SHOW_MS }),
        letter.mouth.show({ duration: FACE_SHOW_MS }),
      ]),
    );
    if (disposed) return;

    await Promise.all(
      letters.map(
        (letter, i) =>
          new Promise<void>((resolve) => {
            const t = setTimeout(async () => {
              timers.delete(t);
              await celebrateLetter(letter, { type: "random" });
              resolve();
            }, i * STAGGER_MS);
            timers.add(t);
          }),
      ),
    );
  };

  /** One letter shows an arm, waves, and puts it away again. Transient on
   *  purpose: arms left standing out cost the word its "reads as text" quality,
   *  which is the whole reason the vignette works as a headline. */
  const waveOnce = async (): Promise<void> => {
    const letters = presentLetters();
    if (letters.length === 0) return;

    const letter = letters[Math.floor(Math.random() * letters.length)];
    const arm = Math.random() < 0.5 ? "left" : "right";

    await letter.arms.show({ duration: WAVE_ARM_SHOW_MS });
    if (disposed) return;
    await letter.arms.wave({ duration: WAVE_MS, arm });
    if (disposed) return;
    await letter.arms.hide({ duration: WAVE_ARM_SHOW_MS });
  };

  const scheduleWave = (delayMs: number) => {
    waveTimer = setTimeout(async () => {
      waveTimer = null;
      if (disposed) return;
      // Skip (don't queue up) waves while the tab is hidden — same reasoning as
      // the blink guard in letterpeople's startIdle: rAF is frozen there, so an
      // animation started now would never finish.
      if (!(typeof document !== "undefined" && document.hidden)) {
        await waveOnce();
      }
      if (disposed) return;
      scheduleWave(WAVE_MIN_MS + Math.random() * WAVE_SPREAD_MS);
    }, delayMs);
  };

  /**
   * Settle: the word stays characterized. Eye tracking follows the visitor's
   * pointer, each letter blinks on its own schedule, and one waves every so
   * often. `startIdle` (letterpeople/animations) owns tracking + blinking,
   * including the tab-hidden guard that keeps eyes from sticking half-closed.
   */
  const startSettledIdle = () => {
    stopSettledIdle();
    // No blinkInterval: startIdle's default re-rolls 3–6 s on every cycle, so
    // the four letters drift apart. A fixed interval would sync them into one
    // mechanical four-eyed blink.
    idleStops = presentLetters().map((letter) =>
      startIdle(letter, { intensity: 0.6 }),
    );
    scheduleWave(WAVE_FIRST_MS);
  };

  const stopSettledIdle = () => {
    idleStops.forEach((stop) => stop());
    idleStops = [];
    if (waveTimer) {
      clearTimeout(waveTimer);
      waveTimer = null;
    }
  };

  const clearNudge = () => {
    if (nudgeTimer) {
      clearTimeout(nudgeTimer);
      nudgeTimer = null;
    }
  };

  /** One small hop per letter, left to right. Faces stay as they are. */
  const nudgeOnce = async (): Promise<void> => {
    const letters = presentLetters();
    await Promise.all(
      letters.map(async (letter, i) => {
        await wait(i * NUDGE_STAGGER_MS);
        if (disposed || running) return;
        const p = asPerformer(letter);
        await p.pose({ scaleY: 0.9, scaleX: 1.06, duration: 90, ease: "inQuad" }, "bottom");
        await p.pose({ translateY: -NUDGE_HOP, scaleY: 1.06, scaleX: 0.96, duration: 150, ease: "outQuad" }, "bottom");
        await p.pose({ translateY: 0, scaleY: 0.94, scaleX: 1.04, duration: 130, ease: "inQuad" }, "bottom");
        await p.pose({ scaleY: 1, scaleX: 1, duration: 180, ease: "outQuad" }, "bottom");
      }),
    );
  };

  const scheduleNudge = () => {
    clearNudge();
    if (tapped) return;
    nudgeTimer = setTimeout(() => {
      nudgeTimer = null;
      if (disposed || running || tapped) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (config.isInView && !config.isInView()) return;
      void nudgeOnce();
    }, NUDGE_MS);
  };

  const hover = (on: boolean) => {
    if (disposed || running || on === perked) return;
    perked = on;
    for (const letter of presentLetters()) {
      const p = asPerformer(letter);
      if (!p.eyes.isVisible()) continue;
      if (on) {
        p.eyes.brows?.express("surprised", { duration: PERK_MS });
        p.mouth.updateShape(MOUTH_PERK, { duration: PERK_MS });
      } else {
        p.eyes.brows?.relax({ duration: PERK_MS * 2 });
        p.mouth.updateShape(MOUTH_REST, { duration: PERK_MS * 2 });
      }
    }
  };

  /** Show the faces without the staggered celebration — an encore's arrival. */
  const showFaces = async (): Promise<void> => {
    await Promise.all(
      presentLetters().flatMap((letter) => [
        letter.eyes.show({ duration: FACE_SHOW_MS }),
        letter.mouth.show({ duration: FACE_SHOW_MS }),
      ]),
    );
  };

  /** Answer the posed rung, then settle. Shared by play() and advance(). */
  const answer = async (beatMs: number, rung: PosedRung): Promise<void> => {
    if (rung.hasBlank) {
      await wait(beatMs);
      if (disposed) return;

      setCursorVisible(false);
      await fillBlank(true);
      if (disposed) return;

      await celebrate();
    } else {
      // No exercise to solve — the encore just needs a face before it performs.
      await showFaces();
    }
    if (disposed) return;

    if (rung.perform) {
      await rung.perform();
      if (disposed) return;
    }

    startSettledIdle();
  };

  const play = async (): Promise<void> => {
    if (running || disposed) return;
    running = true;
    try {
      setCursorVisible(true);
      await answer(POSE_BEAT_MS, { hasBlank: true });
      if (!disposed) scheduleNudge();
    } finally {
      running = false;
    }
  };

  const advance = async (): Promise<boolean> => {
    if (running || disposed) return false;
    tapped = true;
    clearNudge();
    running = true;
    // A run replaces the faces; whatever perk was on goes with them.
    perked = false;
    try {
      stopSettledIdle();
      // Cursor off across the transition: it belongs to a blank that is about
      // to be torn down, and a caret blinking over a cross-fading word reads as
      // a glitch.
      setCursorVisible(false);
      const rung = await reposeNext();
      if (disposed) return true;
      if (rung.hasBlank) setCursorVisible(true);
      await answer(REPLAY_BEAT_MS, rung);
      return true;
    } finally {
      running = false;
    }
  };

  const returnHome = async (): Promise<void> => {
    if (running || disposed) return;
    running = true;
    try {
      stopSettledIdle();
      setCursorVisible(false);
      await goHome();
      if (disposed) return;
      await showFaces();
      if (disposed) return;
      startSettledIdle();
    } finally {
      running = false;
    }
  };

  const renderStatic = async (): Promise<void> => {
    setCursorVisible(false);
    await fillBlank(false);
    // Faces on but inert — the word reads as complete, nothing animates.
    for (const letter of presentLetters()) {
      letter.eyes.show({ duration: 0 });
      letter.mouth.show({ duration: 0 });
    }
  };

  const cleanup = () => {
    disposed = true;
    stopSettledIdle();
    clearNudge();
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  };

  return { play, advance, returnHome, renderStatic, hover, cleanup };
}
