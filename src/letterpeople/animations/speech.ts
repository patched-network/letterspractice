/**
 * Speech & Reaction Sequences for LetterPeople
 *
 * Phoneme speaking (mouth pulse + optional audio) and negative-feedback
 * reactions (head shake "no"). `sayNo` composes both.
 */

import type { LetterInstance } from "../types";
import { delay } from "../util/animation";
import { asPerformer, type Performer } from "./performer";

// ============================================================================
// Types
// ============================================================================

export interface SequenceOptions {
  /** Animation speed multiplier (1 = normal, 0.5 = half speed, 2 = double) */
  speed?: number;
  /** Callback when sequence completes */
  onComplete?: () => void;
}

export interface HeadShakeOptions extends SequenceOptions {
  /** Number of shake cycles (default: 3) */
  cycles?: number;
  /** Maximum rotation angle in degrees (default: 12) */
  angle?: number;
  /** Whether to show disappointed expression (default: true) */
  showExpression?: boolean;
}

export interface SpeakPhonemeOptions extends SequenceOptions {
  /** Number of times to "speak" (default: 1) */
  speakCount?: number;
  /**
   * Audio URL(s) to play alongside the mouth pulse. A single URL plays
   * fire-and-forget; an array plays sequentially (awaiting each clip) with one
   * mouth pulse per clip — for multi-phoneme sounds like "or" → AO + R.
   */
  audioUrl?: string | string[];
  /** Per-pulse mouth animation duration in ms (default: 200) */
  pulseDuration?: number;
  /** Callback when audio playback starts */
  onAudioStart?: () => void;
  /** Callback when audio playback ends */
  onAudioEnd?: () => void;
}

export interface SayNoOptions extends SpeakPhonemeOptions {}

// ============================================================================
// Head Shake "No" Animation
// ============================================================================

/**
 * Creates a head-shake "no" animation.
 *
 * Uses body rotateZ for the shake motion combined with a disappointed
 * or concerned facial expression.
 */
export async function headShakeNo(
  target: LetterInstance | Performer,
  options: HeadShakeOptions = {}
): Promise<void> {
  const letter = asPerformer(target);
  const {
    speed = 1,
    cycles = 3,
    angle = 12,
    showExpression = true,
    onComplete,
  } = options;

  const baseDuration = 600 / speed;
  const cycleDuration = baseDuration / cycles;

  if (showExpression && letter.eyes.isVisible()) {
    letter.eyes.brows?.express("sad", { duration: 150 });
    letter.mouth.updateShape({ openness: 0.05, mood: 0.25 }, { duration: 150 });
  }

  // Build shake keyframes: neutral -> left -> right -> left -> right ... -> neutral
  const keyframes: number[] = [0];
  for (let i = 0; i < cycles; i++) {
    keyframes.push(i % 2 === 0 ? -angle : angle);
    keyframes.push(i % 2 === 0 ? angle : -angle);
  }
  keyframes.push(0);

  const keyframeDuration = cycleDuration / 2;

  for (let k = 0; k < keyframes.length - 1; k++) {
    const isFirst = k === 0;
    const isLast = k === keyframes.length - 2;
    await letter.pose(
      {
        rotate: keyframes[k + 1],
        duration: keyframeDuration * (isFirst || isLast ? 1.5 : 1),
        ease: isFirst ? "outQuad" : isLast ? "outElastic(1, 0.8)" : "inOutSine",
      },
      "center",
    );
  }

  if (showExpression && letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 200 });
    letter.mouth.updateShape({ openness: 0.1, mood: 0.7 }, { duration: 200 });
  }
  onComplete?.();
}

// ============================================================================
// Speak Phoneme
// ============================================================================

/**
 * Animates a symmetric open→close mouth pulse, optionally firing an audio
 * clip in parallel. Delegates mouth motion to `mouth.animateSpeak`, which
 * preserves the letter's resting mood and uses eased open/close curves —
 * matching PhoneticWord's chunk-driven 'speak' effect.
 *
 * Phoneme recordings have a consistent ramp-in, so a fixed pulse aligns
 * naturally with the audio without locking the mouth to the clip's tail.
 */
export async function speakPhoneme(
  target: LetterInstance | Performer,
  options: SpeakPhonemeOptions = {}
): Promise<void> {
  const letter = asPerformer(target);
  const { speed = 1, speakCount = 1, audioUrl, pulseDuration = 200, onAudioStart, onAudioEnd, onComplete } = options;
  const duration = pulseDuration / speed;

  const urls = audioUrl === undefined ? [] : Array.isArray(audioUrl) ? audioUrl : [audioUrl];

  for (let i = 0; i < speakCount; i++) {
    if (i > 0) await delay(150 / speed);

    if (urls.length > 1) {
      // Multi-clip sequence: await each clip so sounds don't overlap, with a
      // mouth pulse per clip.
      for (let u = 0; u < urls.length; u++) {
        if (u > 0) await delay(80 / speed);
        if (u === 0) onAudioStart?.();
        const clipDone = playClipToEnd(urls[u]);
        await Promise.all([clipDone, letter.mouth.animateSpeak({ duration })]);
      }
      onAudioEnd?.();
      continue;
    }

    if (urls[0]) {
      const audioEl = new Audio(urls[0]);
      onAudioStart?.();
      if (onAudioEnd) audioEl.addEventListener('ended', onAudioEnd, { once: true });
      audioEl.play().catch(e => console.error('[speakPhoneme] Audio playback failed:', e));
    }

    await letter.mouth.animateSpeak({ duration });
  }

  onComplete?.();
}

/**
 * Play one audio clip and resolve when it ends (or errors, or after a safety
 * timeout — phoneme clips are short, so a hung 'ended' event never stalls an
 * animation sequence).
 */
function playClipToEnd(url: string, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    const audioEl = new Audio(url);
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    audioEl.addEventListener('ended', done, { once: true });
    audioEl.addEventListener('error', done, { once: true });
    setTimeout(done, timeoutMs);
    audioEl.play().catch(() => done());
  });
}

// ============================================================================
// Say "No" Sequence
// ============================================================================

/**
 * Speaks the letter's sound (mouth open → hold → close) then shakes head no.
 * Used when an incorrect answer is given.
 */
export async function sayNo(
  target: LetterInstance | Performer,
  options: SayNoOptions = {}
): Promise<void> {
  const letter = asPerformer(target);
  const { speed = 1, onComplete } = options;

  await speakPhoneme(letter, options);

  await delay(100 / speed);
  await headShakeNo(letter, { speed, cycles: 2, angle: 10 });

  if (letter.eyes.isVisible()) {
    await letter.eyes.brows?.relax({ duration: 200 / speed });
  }

  onComplete?.();
}
