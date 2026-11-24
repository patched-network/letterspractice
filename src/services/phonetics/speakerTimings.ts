/**
 * Speaker Timings Utility
 *
 * Computes per-letter animation trigger times for synchronizing
 * LetterPeople "speak" animations with whole-word audio playback.
 *
 * The core assumption is that all words are single-syllable and that
 * phonemes are produced roughly left-to-right, linearly, over the
 * speech region of the audio. Each phonetic chunk occupies an equal
 * slice of the speech window; the animation trigger is timed so that
 * peak mouth-openness coincides with the midpoint of that slice.
 *
 * Audio files typically contain leading/trailing silence and fade
 * buffers. The `audioTimingMs` data (extracted at build time via
 * ffmpeg silencedetect) identifies the actual speech region within
 * the file. Timings are distributed across that region, not the
 * full file duration.
 */

import type { PhoneticChunk, AudioTimingMs } from '../phonetics.generated';
import type { LetterEffect } from '../../letterpeople/vue/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Timing marker for synchronizing a single letter's animation with audio.
 * Mirrors the SpeakerTiming interface in PhoneticWord.vue.
 */
export interface SpeakerTiming {
  /** Letter index within the word */
  index: number;
  /** Milliseconds from audio file start to trigger the animation */
  time: number;
  /** Effect to apply (defaults to 'speak' if omitted by the consumer) */
  effect?: LetterEffect;
}

export interface SpeakerTimingOptions {
  /**
   * Milliseconds from animation trigger to peak mouth-openness.
   * Derived from `MouthControllerImpl.animateSpeak` default duration (200 ms open phase).
   * @default 200
   */
  speakPeakOffsetMs?: number;

  /**
   * Minimum gap (ms) between successive chunk trigger times.
   * Prevents two chunks from firing so close together that their
   * animations visually collide.
   * @default 60
   */
  minimumChunkGapMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default time (ms) from speak-animation trigger to peak mouth openness. */
const DEFAULT_SPEAK_PEAK_OFFSET_MS = 200;

/** Default minimum gap (ms) between successive trigger times. */
const DEFAULT_MINIMUM_CHUNK_GAP_MS = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Effects that count as "speaking" — i.e., the letter is actively vocalised. */
const SPEAKING_EFFECTS = new Set(['speak']);

/**
 * Returns true when at least one letter in `chunk` carries a speaking effect.
 */
function isSpeakingChunk(chunk: PhoneticChunk): boolean {
  return Object.values(chunk.letters).some((effect) => {
    if (Array.isArray(effect)) {
      return effect.some((e) => SPEAKING_EFFECTS.has(e as string));
    }
    return SPEAKING_EFFECTS.has(effect as string);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Compute speaker timings for whole-word audio playback.
 *
 * Timings are distributed across the speech region `[speechStartMs, speechEndMs]`
 * within the audio file, so that animations are not displaced by
 * leading/trailing silence in the recording.
 *
 * Algorithm:
 *  1. Filter to "speaking" chunks (those with ≥ 1 letter whose effect is `speak`).
 *  2. Each speaking chunk is assigned an equal time-slice of the speech window.
 *  3. The animation trigger is placed so that peak mouth-openness falls on
 *     the midpoint of the chunk's time-slice.
 *  4. Non-speak effects within a chunk (e.g. `silent-e`) are emitted at the
 *     same trigger time with their own effect label.
 *  5. Trigger times are clamped to [0, fileDurationMs].
 *
 * @param chunks - Ordered phonetic chunks for the word (left-to-right).
 * @param speechStartMs - Milliseconds from audio file start to speech onset.
 * @param speechEndMs - Milliseconds from audio file start to speech end.
 * @param options - Optional tuning knobs.
 * @returns Array of `SpeakerTiming` entries, one per animated letter.
 */
export function computeSpeakerTimings(
  chunks: PhoneticChunk[],
  speechStartMs: number,
  speechEndMs: number,
  options?: SpeakerTimingOptions,
): SpeakerTiming[] {
  const speechDuration = speechEndMs - speechStartMs;
  if (!chunks.length || speechDuration <= 0) return [];

  const peakOffset = options?.speakPeakOffsetMs ?? DEFAULT_SPEAK_PEAK_OFFSET_MS;
  const minGap = options?.minimumChunkGapMs ?? DEFAULT_MINIMUM_CHUNK_GAP_MS;

  // ---- 1. Identify speaking chunks and their original indices ----
  const speakingEntries: { chunkIndex: number; chunk: PhoneticChunk }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (isSpeakingChunk(chunks[i])) {
      speakingEntries.push({ chunkIndex: i, chunk: chunks[i] });
    }
  }

  const N = speakingEntries.length;
  if (N === 0) return [];

  // ---- 2. Compute raw trigger times ----
  // Each speaking chunk occupies an equal slice of the speech window.
  // The midpoint of slice i (in absolute file time) is:
  //   speechStartMs + ((i + 0.5) / N) * speechDuration
  // We trigger the animation early so peak mouth-open aligns with the midpoint.
  const slotWidth = speechDuration / N;
  const rawTriggers: number[] = speakingEntries.map((_, i) => {
    const midpoint = speechStartMs + (i + 0.5) * slotWidth;
    return Math.max(0, midpoint - peakOffset);
  });

  // ---- 3. Enforce minimum gap between successive triggers ----
  for (let i = 1; i < rawTriggers.length; i++) {
    if (rawTriggers[i] - rawTriggers[i - 1] < minGap) {
      rawTriggers[i] = rawTriggers[i - 1] + minGap;
    }
  }

  // Clamp to speech end (shouldn't normally happen, but safety)
  for (let i = 0; i < rawTriggers.length; i++) {
    rawTriggers[i] = Math.min(rawTriggers[i], speechEndMs);
  }

  // ---- 4. Build SpeakerTiming entries ----
  const timings: SpeakerTiming[] = [];

  for (let si = 0; si < speakingEntries.length; si++) {
    const { chunk } = speakingEntries[si];
    const triggerTime = Math.round(rawTriggers[si]);

    for (const [indexStr, effect] of Object.entries(chunk.letters)) {
      const letterIndex = parseInt(indexStr, 10);
      const effects: LetterEffect[] = Array.isArray(effect)
        ? effect as LetterEffect[]
        : [effect as LetterEffect];

      for (const eff of effects) {
        timings.push({
          index: letterIndex,
          time: triggerTime,
          effect: eff,
        });
      }
    }
  }

  // Also emit timings for non-speaking chunks (e.g. chunks that only have
  // silent-e or r-control effects). These are triggered at the time of the
  // nearest speaking chunk that shares a letter, or — failing that — at a
  // linearly interpolated position.
  for (let ci = 0; ci < chunks.length; ci++) {
    if (isSpeakingChunk(chunks[ci])) continue; // already handled

    const chunk = chunks[ci];

    // Find the nearest speaking entry by chunk-index proximity
    let nearestTime: number;
    if (speakingEntries.length === 1) {
      nearestTime = rawTriggers[0];
    } else {
      // Interpolate position among speaking chunks
      const fraction = ci / (chunks.length - 1 || 1);
      const floatIdx = fraction * (N - 1);
      const lo = Math.floor(floatIdx);
      const hi = Math.min(lo + 1, N - 1);
      const t = floatIdx - lo;
      nearestTime = rawTriggers[lo] * (1 - t) + rawTriggers[hi] * t;
    }

    for (const [indexStr, effect] of Object.entries(chunk.letters)) {
      const letterIndex = parseInt(indexStr, 10);
      const effects: LetterEffect[] = Array.isArray(effect)
        ? effect as LetterEffect[]
        : [effect as LetterEffect];

      for (const eff of effects) {
        timings.push({
          index: letterIndex,
          time: Math.round(nearestTime),
          effect: eff,
        });
      }
    }
  }

  // ---- 5. Sort by time, then by letter index for deterministic ordering ----
  timings.sort((a, b) => a.time - b.time || a.index - b.index);

  return timings;
}

/**
 * Convenience: compute timings from an AudioTimingMs record.
 *
 * This is the primary entry point for consumers who have the
 * full phonetic index data available.
 */
export function computeSpeakerTimingsFromAudioTiming(
  chunks: PhoneticChunk[],
  audioTiming: AudioTimingMs,
  options?: SpeakerTimingOptions,
): SpeakerTiming[] {
  return computeSpeakerTimings(
    chunks,
    audioTiming.speechStart,
    audioTiming.speechEnd,
    options,
  );
}

/**
 * Convenience: compute timings using phonetic-index data directly.
 *
 * @param phonetics - The WordPhonetics record from the phonetic index.
 * @param options - Optional tuning knobs.
 */
export function computeSpeakerTimingsForWord(
  phonetics: {
    chunks: PhoneticChunk[];
    audioTimingMs?: AudioTimingMs;
  },
  options?: SpeakerTimingOptions,
): SpeakerTiming[] | null {
  if (phonetics.audioTimingMs) {
    return computeSpeakerTimingsFromAudioTiming(
      phonetics.chunks,
      phonetics.audioTimingMs,
      options,
    );
  }

  return null;
}