/**
 * Spelling Question — Shared Types & Constants
 *
 * Barrel export for the spelling question module.
 * Composable logic lives inline in SpellingQuestionView.vue.
 */

export {
  type ScaffoldLevel,
  type SpellingConfig,
  SCORE_CEILING,
  MS_PER_LETTER,
  FAST_FLOOR_MS,
  SLOW_CEILING_MS,
  MIN_TIME_FRACTION,
  configForLevel,
} from './types';