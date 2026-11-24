/**
 * Type definitions for the Progressive Keyboard module
 */

import type { KeyDefinition } from "./keyboardLayout";

/**
 * Event emitted when a key is pressed or released
 */
export interface KeyEvent {
    /** The lowercase letter that was pressed */
    letter: string;

    /** Full key definition from the layout */
    keyDef: KeyDefinition;

    /** Timestamp of the event */
    timestamp: number;

    /** Source of the input */
    source: "physical" | "touch" | "mouse";
}

/**
 * Options for programmatic key animations
 */
export interface KeyAnimationOptions {
    /** Animation duration in milliseconds */
    duration?: number;

    /** CSS easing function name */
    easing?: string;

    /** Color to animate to (for glow effects) */
    color?: string;

    /** Scale factor (for pulse effects) */
    scale?: number;
}

/**
 * Animation types available for keys
 */
export type KeyAnimationType = "pulse" | "shake" | "glow" | "bounce" | "pop";

/**
 * Props for the ProgressiveKeyboard component
 */
export interface ProgressiveKeyboardProps {
    /**
     * Letters to display on the keyboard.
     * Only these letters will be rendered.
     */
    letters: string[];

    /**
     * Letters that are currently enabled for interaction.
     * Defaults to all displayed letters if not specified.
     */
    enabledLetters?: string[];

    /**
     * Letters to visually highlight (e.g., as hints).
     */
    highlightedLetters?: string[];

    /**
     * Base URL path for phoneme audio files.
     * Files should be named {letter}.mp3
     */
    phonemeAudioPath?: string;

    /**
     * Whether to play phoneme audio on key press.
     */
    playPhonemeOnPress?: boolean;

    /**
     * Minimum key size in pixels (keys won't shrink below this).
     */
    minKeySize?: number;

    /**
     * Maximum key size in pixels.
     */
    maxKeySize?: number;

    /**
     * Whether to capture physical keyboard input.
     */
    captureKeyboard?: boolean;

    /**
     * Accessibility label for the keyboard.
     */
    ariaLabel?: string;

    /**
     * Custom key colors as a map of letter -> color.
     */
    keyColors?: Record<string, string>;

    /**
     * Whether the keyboard is disabled.
     */
    disabled?: boolean;
}

/**
 * Exposed methods from the ProgressiveKeyboard component
 */
export interface ProgressiveKeyboardExposed {
    /** Get the DOM element for a specific key */
    getKeyElement(letter: string): HTMLElement | undefined;

    /** Programmatically trigger a key press animation */
    animateKey(
        letter: string,
        animation: KeyAnimationType,
        options?: KeyAnimationOptions
    ): Promise<void>;

    /** Highlight a key temporarily */
    flashKey(letter: string, color?: string, duration?: number): Promise<void>;

    /** Focus the keyboard for keyboard input */
    focus(): void;

    /** Play the phoneme for a letter without triggering a keypress event */
    playLetterPhoneme(letter: string): Promise<void>;

    /** Currently pressed keys (reactive) */
    pressedKeys: Set<string>;
}
