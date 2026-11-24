/**
 * Progressive Keyboard Module
 *
 * A specialized keyboard component for phonics-focused typing practice.
 * Designed for young learners with progressive letter revelation,
 * audio feedback, and extensive customization hooks.
 */

// Main component
export { default as ProgressiveKeyboard } from "./ProgressiveKeyboard.vue";

// Layout data and utilities
export {
  KEYBOARD_LAYOUT,
  ALL_KEYS,
  ALL_LETTER_KEYS,
  KEY_MAP,
  SPACE_KEY,
  SHIFT_KEY,
  getKeyDefinition,
  getKeysByHand,
  getKeysByRow,
  getKeysBoundingBox,
  PHONICS_PROGRESSION,
  getProgressionLetters,
  LETTER_GROUPS,
  type KeyDefinition,
  type KeyboardRow,
} from "./keyboardLayout";

// Type exports
export type {
  KeyEvent,
  KeyAnimationOptions,
  KeyAnimationType,
  ProgressiveKeyboardProps,
  ProgressiveKeyboardExposed,
} from "./types";
