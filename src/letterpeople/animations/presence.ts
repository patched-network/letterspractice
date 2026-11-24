/**
 * Presence Sequences for LetterPeople
 *
 * Controls the "alive" state of a letter: showing/hiding facial features
 * (characterize / decharacterize) and sustaining idle behaviour (blink loop,
 * eye tracking). These are the entry/exit points for a letter becoming
 * an expressive character vs. plain text.
 */

import type { LetterInstance } from "../types";
import { delay } from "../util/animation";

// ============================================================================
// Types
// ============================================================================

export interface CharacterizeOptions {
  /** Duration for the transition (default: 250ms) */
  duration?: number;
  /** Show eyes (default: true) */
  showEyes?: boolean;
  /** Show mouth (default: true) */
  showMouth?: boolean;
  /** Show eyebrows with eyes (default: true) */
  showBrows?: boolean;
  /** Start eye tracking after showing (default: false) */
  startTracking?: boolean;
}

export interface IdleOptions {
  /** Intensity of idle movements 0-1 (default: 0.5) */
  intensity?: number;
  /** Enable eye tracking (default: true) */
  enableTracking?: boolean;
  /** Blink interval in ms (default: 3000-6000 random) */
  blinkInterval?: number;
}

// ============================================================================
// Characterize / Decharacterize
// ============================================================================

/**
 * "Characterizes" a letter by showing facial features with a smooth transition.
 * Makes the letter "come alive" - useful for selecting/focusing a letter.
 */
export async function characterize(
  letter: LetterInstance,
  options: CharacterizeOptions = {}
): Promise<void> {
  const {
    duration = 250,
    showEyes = true,
    showMouth = true,
    showBrows = true,
    startTracking = false,
  } = options;

  const promises: Promise<void>[] = [];

  if (showEyes && !letter.eyes.isVisible()) {
    promises.push(letter.eyes.show({ duration }));

    if (showBrows && letter.eyes.brows && !letter.eyes.brows.isVisible()) {
      promises.push(
        delay(duration * 0.3).then(() =>
          letter.eyes.brows!.show({ duration: duration * 0.7 })
        )
      );
    }
  }

  if (showMouth && !letter.mouth.isVisible()) {
    promises.push(
      delay(duration * 0.2).then(() =>
        letter.mouth.show({ duration: duration * 0.8 })
      )
    );
  }

  await Promise.all(promises);

  if (startTracking && showEyes) {
    letter.eyes.startTracking({ intensity: 0.5 });
  }
}

/**
 * "De-characterizes" a letter by hiding facial features smoothly.
 * Returns the letter to a plain, inanimate state.
 */
export async function decharacterize(
  letter: LetterInstance,
  options: { duration?: number } = {}
): Promise<void> {
  const { duration = 200 } = options;

  if (letter.eyes.isTracking()) {
    letter.eyes.stopTracking();
  }

  const promises: Promise<void>[] = [];

  if (letter.eyes.brows?.isVisible()) {
    promises.push(letter.eyes.brows.hide({ duration: duration * 0.6 }));
  }

  if (letter.eyes.isVisible()) {
    promises.push(
      delay(duration * 0.2).then(() =>
        letter.eyes.hide({ duration: duration * 0.8 })
      )
    );
  }

  if (letter.mouth.isVisible()) {
    promises.push(letter.mouth.hide({ duration }));
  }

  await Promise.all(promises);
}

// ============================================================================
// Idle
// ============================================================================

/**
 * Starts idle animation behaviour for a letter: periodic blinks and
 * optional eye tracking. Returns a cleanup function to stop the loop.
 */
export function startIdle(
  letter: LetterInstance,
  options: IdleOptions = {}
): () => void {
  const {
    intensity = 0.5,
    enableTracking = true,
    blinkInterval,
  } = options;

  let isRunning = true;
  let blinkTimeout: ReturnType<typeof setTimeout> | null = null;

  if (enableTracking && letter.eyes.isVisible()) {
    letter.eyes.startTracking({ intensity: intensity * 0.7 });
  }

  const scheduleBlink = () => {
    if (!isRunning) return;

    const interval = blinkInterval ?? (3000 + Math.random() * 3000);

    blinkTimeout = setTimeout(async () => {
      if (!isRunning) return;

      // Skip blinking while the tab is hidden. There, rAF is frozen but this
      // setTimeout still fires (throttled), so a blink started now would snap
      // the eyes to the mid-blink scale and never reopen — leaving them stuck
      // as slits on return. Just reschedule and blink once we're visible again.
      const hidden = typeof document !== "undefined" && document.hidden;
      if (hidden || !letter.eyes.isVisible()) {
        scheduleBlink();
        return;
      }

      await letter.eyes.blink({ duration: 150 });
      scheduleBlink();
    }, interval);
  };

  if (letter.eyes.isVisible()) {
    scheduleBlink();
  }

  return () => {
    isRunning = false;

    if (blinkTimeout) {
      clearTimeout(blinkTimeout);
      blinkTimeout = null;
    }

    if (letter.eyes.isTracking()) {
      letter.eyes.stopTracking();
    }
  };
}
