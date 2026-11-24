/**
 * Type definitions for the Keyboard Context system
 *
 * This provides the interface between StudyPracticeView (which owns the keyboard)
 * and question components (which configure and respond to keyboard input).
 */

import type { InjectionKey, Ref, ComputedRef } from "vue";
import type {
  KeyEvent,
  KeyAnimationType,
  KeyAnimationOptions,
} from "../components/keyboard/types";

// Re-export for convenience
export type { KeyEvent, KeyAnimationType, KeyAnimationOptions };

/**
 * Highlight configuration for a key
 * - `true` uses the default highlight color
 * - A string specifies a custom color (hex, rgb, etc.)
 */
export type KeyHighlight = true | string;

/**
 * Map of letter to highlight configuration
 */
export type HighlightMap = Map<string, KeyHighlight>;

/**
 * Configuration state for the keyboard
 */
export interface KeyboardConfig {
  /** Letters available based on user mastery (set by StudyPracticeView) */
  baseLetters: string[];

  /** Letters currently requested by the active question (subset of base) */
  questionLetters: string[] | null;

  /** Letters enabled for input (defaults to active letters if not set) */
  enabledLetters: string[] | null;

  /** Highlighted letters with optional colors */
  highlights: HighlightMap;

  /** Per-key custom colors (for color-coding exercises) */
  keyColors: Record<string, string>;

  /** Whether to show the spacebar/advance key */
  showAdvance: boolean;

  /** Color for the advance key (for visual coordination with question UI) */
  advanceColor: string | undefined;

  /** Custom text to display on the spacebar/advance key */
  advanceText: string | undefined;

  /** Whether keyboard input is currently disabled */
  disabled: boolean;
}

/**
 * Request from a question to configure the keyboard
 */
export interface KeyboardConfigRequest {
  /** Specific letters this question needs (will intersect with base unless overrideBase is set) */
  letters?: string[];

  /** If true, question letters bypass the base-letter intersection.
   *  Use for question types (e.g., WhoSaidThat) that define their own complete key set. */
  overrideBase?: boolean;

  /** Override enabled letters */
  enabledLetters?: string[];

  /** Set highlights */
  highlights?: Record<string, KeyHighlight>;

  /** Set per-key colors */
  keyColors?: Record<string, string>;

  /** Show/hide advance key */
  showAdvance?: boolean;

  /** Set advance key color */
  advanceColor?: string;

  /** Set custom text for the spacebar/advance key */
  advanceText?: string;

  /** Disable/enable keyboard */
  disabled?: boolean;

  /** Show full QWERTY layout with ghost keys for inactive letters.
   *  Defaults to true. Set false to hide ghost outlines (e.g., number-key-only layouts). */
  showFullLayout?: boolean;

  /** Show/hide arrow keys. Defaults to true. Set false to hide arrow keys (e.g., intro views). */
  showArrows?: boolean;

  /** Dim (to-disabled) fade duration (ms). Defaults to 400. Raise for a gentler
   *  dim (e.g. MissingLetters' gradual option-shaving); reset between cards. */
  disableTransitionMs?: number;

  /** Restore (to-enabled) fade duration (ms). Defaults to 400. Kept separate so
   *  a slow dim can pair with a snappy restore. */
  enableTransitionMs?: number;
}

/**
 * Subscriber callback for keyboard events
 */
export type KeyEventHandler = (event: KeyEvent) => void;
export type AdvanceHandler = () => void;

/**
 * Unsubscribe function returned by event subscriptions
 */
export type Unsubscribe = () => void;

/**
 * The keyboard context interface provided to question components
 */
export interface KeyboardContext {
  // === Reactive State (read-only for questions) ===

  /** Base letters available from user mastery */
  readonly baseLetters: Ref<string[]>;

  /** Currently active letters (computed: question ∩ base, or base if no question config) */
  readonly activeLetters: ComputedRef<string[]>;

  /** Currently enabled letters (computed: explicit or defaults to active) */
  readonly enabledLetters: ComputedRef<string[]>;

  /** Current highlight map */
  readonly highlights: Ref<HighlightMap>;

  /** Current per-key colors */
  readonly keyColors: Ref<Record<string, string>>;

  /** Whether advance key is shown */
  readonly showAdvance: Ref<boolean>;

  /** Advance key color */
  readonly advanceColor: Ref<string | undefined>;

  /** Custom text for advance key */
  readonly advanceText: Ref<string | undefined>;

  /** Whether keyboard is disabled */
  readonly disabled: Ref<boolean>;

  /** Whether a question has active configuration */
  readonly hasQuestionConfig: ComputedRef<boolean>;

  /** Whether the current question overrides base letters (owns its full key set) */
  readonly overrideBase: Ref<boolean>;

  /** Whether to show full QWERTY layout with ghost keys (default true) */
  readonly showFullLayout: Ref<boolean>;

  /** Whether to show arrow keys (default true) */
  readonly showArrows: Ref<boolean>;

  /** Dim (to-disabled) fade duration in ms (default 400) */
  readonly disableTransitionMs: Ref<number>;

  /** Restore (to-enabled) fade duration in ms (default 400) */
  readonly enableTransitionMs: Ref<number>;

  // === Configuration API (for questions) ===

  /**
   * Request keyboard configuration for this question.
   * Call this in onMounted or when question state changes.
   * Letters will be intersected with baseLetters.
   */
  requestConfig(config: KeyboardConfigRequest): void;

  /**
   * Update specific configuration values without replacing entire config.
   * Useful for dynamic updates (e.g., highlighting next expected letter).
   */
  updateConfig(partial: Partial<KeyboardConfigRequest>): void;

  /**
   * Clear question-specific configuration, reverting to base state.
   * Call this in onUnmounted.
   */
  clearQuestionConfig(): void;

  /**
   * Set a single highlight (convenience method).
   */
  setHighlight(letter: string, highlight: KeyHighlight): void;

  /**
   * Clear a single highlight.
   */
  clearHighlight(letter: string): void;

  /**
   * Clear all highlights.
   */
  clearAllHighlights(): void;

  // === Base Letter Mutation ===

  /**
   * Add a single letter to the base letter set at runtime.
   * Used by GpcIntroView to reveal a newly-unlocked keycap with animation.
   * No-op if the letter is already in the base set.
   */
  addBaseLetter(letter: string): void;

  // === Hint/Animation API ===

  /**
   * Trigger a hint animation on a specific key.
   * Use this to draw attention to the correct answer after a delay.
   */
  hintKey(
    letter: string,
    animation: KeyAnimationType,
    options?: KeyAnimationOptions,
  ): Promise<void>;

  /**
   * Flash a key with a color temporarily.
   */
  flashKey(letter: string, color?: string, duration?: number): Promise<void>;

  // === Event Subscription API ===

  /**
   * Subscribe to key tap events (press + release).
   * Returns unsubscribe function.
   */
  onKeyTap(handler: KeyEventHandler): Unsubscribe;

  /**
   * Subscribe to key press events (key down).
   */
  onKeyPress(handler: KeyEventHandler): Unsubscribe;

  /**
   * Subscribe to key release events (key up).
   */
  onKeyRelease(handler: KeyEventHandler): Unsubscribe;

  /**
   * Subscribe to key hover events (pointer enter).
   */
  onKeyHover(handler: KeyEventHandler): Unsubscribe;

  /**
   * Subscribe to key hover end events (pointer leave).
   */
  onKeyHoverEnd(handler: KeyEventHandler): Unsubscribe;

  /**
   * Subscribe to advance (spacebar) events.
   */
  onAdvance(handler: AdvanceHandler): Unsubscribe;

  /**
   * Subscribe to enter key events.
   */
  onEnter(handler: AdvanceHandler): Unsubscribe;

  /**
   * Subscribe to left arrow events.
   */
  onArrowLeft(handler: AdvanceHandler): Unsubscribe;

  /**
   * Subscribe to right arrow events.
   */
  onArrowRight(handler: AdvanceHandler): Unsubscribe;

  /**
   * Subscribe to on-screen backspace taps. Physical Backspace isn't routed
   * through the keyboard; consumers keep their own native listener for it.
   */
  onBackspace(handler: AdvanceHandler): Unsubscribe;

  /**
   * Subscribe to invalid key events (pressed a key not in active set).
   */
  onInvalidKey(handler: (letter: string) => void): Unsubscribe;

  // === Utility ===

  /**
   * Programmatically simulate a key tap (for tutorials/testing).
   */
  simulateKeyTap(letter: string): void;

  /**
   * Focus the keyboard for physical input capture.
   */
  focus(): void;

  /**
   * Play the phoneme for a letter without triggering events.
   */
  playPhoneme(letter: string): Promise<void>;
}

/**
 * Provider-side interface with additional methods for StudyPracticeView
 */
export interface KeyboardContextProvider extends KeyboardContext {
  /**
   * Set the base letters (from user mastery data).
   * Called by StudyPracticeView when session initializes or mastery updates.
   */
  setBaseLetters(letters: string[]): void;

  /**
   * Connect the keyboard component ref for animations.
   * Called by StudyPracticeView after keyboard mounts.
   */
  connectKeyboard(keyboardRef: KeyboardComponentRef | null): void;

  /**
   * Dispatch a key event from the keyboard component.
   * Called by StudyPracticeView's keyboard event handlers.
   */
  dispatchKeyTap(event: KeyEvent): void;
  dispatchKeyPress(event: KeyEvent): void;
  dispatchKeyRelease(event: KeyEvent): void;
  dispatchKeyHover(event: KeyEvent): void;
  dispatchKeyHoverEnd(event: KeyEvent): void;
  dispatchAdvance(): void;
  dispatchEnter(): void;
  dispatchArrowLeft(): void;
  dispatchArrowRight(): void;
  dispatchBackspace(): void;
  dispatchInvalidKey(letter: string): void;
}

/**
 * Reference to the ProgressiveKeyboard component for animations
 */
export interface KeyboardComponentRef {
  animateKey(
    letter: string,
    animation: KeyAnimationType,
    options?: KeyAnimationOptions,
  ): Promise<void>;
  flashKey(letter: string, color?: string, duration?: number): Promise<void>;
  focus(): void;
  playLetterPhoneme(letter: string): Promise<void>;
}

/**
 * Injection key for the keyboard context
 */
export const KEYBOARD_CONTEXT_KEY: InjectionKey<KeyboardContext> =
  Symbol("keyboard-context");
