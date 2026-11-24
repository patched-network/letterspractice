// Vue integration entry point for LetterPeople
// This file exports Vue-specific components and utilities

// Component exports
import WordDisplay from "./WordDisplay.vue";
import PhoneticWord from "./PhoneticWord.vue";

// Export the Vue components
export default WordDisplay;
export { WordDisplay, PhoneticWord };

// Export types
export * from "./types";

// Re-export types from the main library that Vue users might need
export type {
  LetterInstance,
  LetterOptions,
  MouthParameters,
  MouthAppearanceOptions,
  AnimationParams,
} from "../types";

export type { Word, WordOptions } from "../Word";
