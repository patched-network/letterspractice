import type {
  LetterInstance,
  LetterOptions,
  AnimationParams,
  TransformFunction,
} from "../types";
import type { Word, WordOptions } from "../Word";
import type { PhonemeAudioKey } from "../../services/phonetics/phonemeCache";

// ============================================================================
// PhoneticWord Types
// ============================================================================

/**
 * Effect types that can be applied to letters during phonetic chunk playback.
 * - 'speak': Triggers the mouth animateSpeak animation
 * - 'highlight': Applies a highlight color to the letter
 * - 'bounce': Triggers a subtle bounce animation
 * - 'glow': Applies a glow effect (via filter)
 * - 'silent-e': Special handling for silent-e (subtle indication without speaking)
 * - 'r-control': R-controlled vowel effect (e.g., 'ar', 'er', 'ir', 'or', 'ur')
 * - 'l-control': L-controlled vowel effect (e.g., 'al', 'el', 'il', 'ol', 'ul')
 */
export type LetterEffect =
  | "speak"
  | "highlight"
  | "bounce"
  | "glow"
  | "silent-e"
  | "r-control"
  | "l-control";

/**
 * Defines a phonetic chunk - a group of letters that produce a single phoneme/sound.
 */
export interface PhoneticChunk {
  /**
   * Map of letter indices to the effects to apply when this chunk plays.
   * Multiple letters can be affected (e.g., 'sh' = { 0: 'speak', 1: 'speak' })
   * Multiple effects can be on different letters (e.g., silent-e pattern)
   */
  letters: { [index: number]: LetterEffect | LetterEffect[] };

  /**
   * Phoneme audio key for this chunk — a single ARPAbet phoneme (e.g. 'K',
   * 'SH', 'IH') or a compound key (e.g. 'K_S', 'K_W').
   * Audio URL is derived from phoneme via getPhonemeAudioUrl()
   * None: a silent step (a sight word's silent letter); its letters only act.
   */
  phoneme?: PhonemeAudioKey;

  /**
   * Optional label for this chunk (e.g., 'sh', 'tion', 'silent-e')
   */
  label?: string;
}

/**
 * Timing marker for synchronizing letter animations with word audio.
 */
export interface SpeakerTiming {
  /** Letter index to animate */
  index: number;
  /** Milliseconds from audio start to trigger animation */
  time: number;
  /** Optional effect override (defaults to 'speak') */
  effect?: LetterEffect;
}

/**
 * Props interface for PhoneticWord component
 */
export interface PhoneticWordProps {
  /** The literal spelling of the word */
  word: string;

  /** URL(s) for whole-word audio. Can be single string or array for variations */
  wordAudio?: string | string[];

  /**
   * Timing offsets for triggering speak animations on each letter
   * during whole-word audio playback.
   * Simple form: number[] where index = letter index, value = ms offset
   * Complex form: SpeakerTiming[] for fine-grained control
   */
  speakerTimings?: number[] | SpeakerTiming[];

  /**
   * Ordered list of phonetic chunks for the stepper.
   * Defines how the word breaks down phonetically and what audio/effects to use.
   */
  phoneticChunks?: PhoneticChunk[];

  /** Word-level options (spacing, container styling, etc.) */
  options?: WordOptions;

  /** Per-letter styling options keyed by letter index */
  letterOptions?: { [index: number]: Partial<LetterOptions> };

  /** Height of the word display container in pixels */
  height?: number;

  /** Maximum width in pixels - word will scale down to fit if needed */
  maxWidth?: number;

  /** Accessibility text for screen readers (defaults to word prop) */
  accessibilityText?: string;

  /** If true, only show screen reader content */
  screenReaderMode?: boolean;

  /** Transform function for geometric letter positioning */
  transformFn?: TransformFunction;

  /** Enable clicking on individual letters to play their phoneme */
  clickableLetters?: boolean;

  /** Auto-loop through chunks when playing */
  autoLoop?: boolean;

  /** Delay between chunks when auto-playing (ms) */
  chunkDelay?: number;
}

/**
 * Emits interface for PhoneticWord component
 */
export interface PhoneticWordEmits {
  (e: "wordCreated", instance: Word): void;
  (e: "wordDestroyed"): void;
  (e: "chunkPlayed", payload: { index: number; chunk: PhoneticChunk }): void;
  (e: "chunkComplete", payload: { index: number; chunk: PhoneticChunk }): void;
  (e: "wordAudioStarted"): void;
  (e: "wordAudioEnded"): void;
  (
    e: "letterClicked",
    payload: { index: number; letter: LetterInstance },
  ): void;
  (e: "stepperAdvanced", payload: { from: number; to: number }): void;
  (e: "stepperComplete"): void;
  (e: "transformApplied", transformFn: TransformFunction): void;
  (e: "transformRemoved"): void;
}

/**
 * Vue PhoneticWord ref type for template refs
 */
export interface PhoneticWordRef {
  /** Get the underlying Word instance */
  getWordInstance: () => Word | null;

  /** Get a specific letter instance by index */
  getLetterInstance: (index: number) => LetterInstance | null;

  /** Play the whole word audio with synchronized letter animations */
  playWord: () => Promise<void>;

  /** Stop word audio playback */
  stopWord: () => void;

  /** Check if currently playing word audio */
  isWordPlaying: () => boolean;

  /** Play a specific phonetic chunk by index */
  playChunk: (index: number) => Promise<void>;

  /** Advance to the next chunk in the stepper */
  stepNext: () => Promise<void>;

  /** Go back to the previous chunk */
  stepPrevious: () => Promise<void>;

  /** Reset the stepper to the beginning */
  resetStepper: () => void;

  /** Play through all chunks automatically */
  playAllChunks: () => Promise<void>;

  /** Get current stepper position */
  getCurrentStep: () => number;

  /** Get total number of chunks */
  getTotalChunks: () => number;

  /** Check if currently playing a chunk */
  isChunkPlaying: () => boolean;

  /** Apply an effect to a letter instance */
  applyEffect: (
    letter: LetterInstance,
    effect: LetterEffect | LetterEffect[],
    animationParams?: AnimationParams,
  ) => Promise<void>;

  /** Apply effects to multiple letters from a chunk */
  applyChunkEffects: (
    chunk: PhoneticChunk,
    animationParams?: AnimationParams,
  ) => Promise<void>;
}

// ============================================================================
// WordDisplay Types
// ============================================================================

// WordDisplay component types

// Props interface for WordDisplay component
export interface WordDisplayProps {
  /** Text to render as letter people */
  text: string;

  /** Word-level options (spacing, container styling, etc.) */
  options?: WordOptions;

  /** Per-letter styling options keyed by letter index */
  letterOptions?: { [index: number]: Partial<LetterOptions> };

  /** Height of the word display container in pixels */
  height?: number;

  /** Accessibility text for screen readers (defaults to text prop) */
  accessibilityText?: string;

  /** If true, only show screen reader content */
  screenReaderMode?: boolean;

  /** Transform function for geometric letter positioning */
  transformFn?: TransformFunction;
}

// Emits interface for WordDisplay component
export interface WordDisplayEmits {
  (e: "wordCreated", instance: Word): void;
  (e: "wordDestroyed"): void;
  (
    e: "letterUpdated",
    payload: {
      index: number;
      options: Partial<LetterOptions>;
      completed: boolean;
    },
  ): void;
  (e: "textChanged", payload: { oldText: string; newText: string }): void;
  (e: "transformApplied", transformFn: TransformFunction): void;
  (e: "transformRemoved"): void;
}

// Vue WordDisplay ref type for template refs
export interface WordDisplayRef {
  /**
   * Update appearance of a specific letter with optional animation
   * @param index Zero-based letter index
   * @param options Letter appearance options to update
   * @param animationParams Optional animation parameters
   * @returns Promise that resolves when update completes
   */
  updateLetterAppearance: (
    index: number,
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams,
  ) => Promise<void>;

  /**
   * Update appearance of all letters with optional animation
   * @param options Letter appearance options to update
   * @param animationParams Optional animation parameters
   * @returns Promise that resolves when all updates complete
   */
  updateAllLettersAppearance: (
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams,
  ) => Promise<void>;

  /**
   * Get the underlying Word instance
   * @returns The Word instance or null if not initialized
   */
  getWordInstance: () => Word | null;

  /**
   * Get a specific LetterInstance by index
   * @param index Zero-based letter index
   * @returns The LetterInstance or null if not found
   */
  getLetterInstance: (index: number) => LetterInstance | null;

  /**
   * Get the length of the current text
   * @returns Number of letters in the word
   */
  getTextLength: () => number;

  /**
   * Animate multiple letters in sequence with different options
   * @param optionsArray Array of letter animation configurations
   * @returns Promise that resolves when all animations complete
   */
  animateSequence: (
    optionsArray: Array<{
      index: number;
      options: Partial<LetterOptions>;
      animationParams?: AnimationParams;
    }>,
  ) => Promise<void>;

  /**
   * Animate all letters with staggered timing
   * @param options Letter appearance options to apply to all letters
   * @param baseAnimationParams Base animation parameters
   * @param staggerDelay Delay between each letter animation in ms
   * @returns Promise that resolves when all animations complete
   */
  animateStagger: (
    options: Partial<LetterOptions>,
    baseAnimationParams?: AnimationParams,
    staggerDelay?: number,
  ) => Promise<void>;
}
