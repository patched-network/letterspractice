/**
 * Shared utilities for question types
 *
 * Common functionality for multiple choice, selection, and keyboard navigation.
 */

export {
  useMultipleChoice,
  createOptions,
  shuffleOptions,
  type MultipleChoiceOption,
  type UseMultipleChoiceOptions,
  type UseMultipleChoiceReturn,
} from './useMultipleChoice';

export { default as MultipleChoiceBase } from './MultipleChoiceBase.vue';
