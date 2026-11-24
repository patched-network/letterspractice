/**
 * Reporter registry — maps lesson IDs to their progress reporters.
 *
 * Each lesson can have a custom reporter that knows how to compute
 * display status and render an inline progress report. Lessons without
 * a custom reporter get the generic fallback, which derives mastery
 * thresholds from `gatesConceptTags`.
 *
 * To add a custom reporter for a new lesson:
 *   1. Create a reporter module (e.g., `myLessonReporter.ts`)
 *   2. Import it here and add an entry to `CUSTOM_REPORTERS`
 *
 * See: agent/concept-gates/a.5.todo-progress-reporters.md (removed; git history)
 */

import type { LessonProgressReporter } from './types';
import { genericReporter } from './genericReporter';
import { helloWorldReporter } from './helloWorldReporter';
import { digraphsReporter } from './digraphsReporter';
import { splitDigraphsReporter } from './splitDigraphsReporter';
import { finalOpenVowelsReporter } from './finalOpenVowelsReporter';
import { sightWordsReporter } from './sightWordsReporter';

// ---------------------------------------------------------------------------
// Custom Reporter Registry
// ---------------------------------------------------------------------------

/**
 * Lesson IDs with custom reporters. All other lessons use the generic
 * fallback. Keyed by lesson ID (must match `LessonDefinition.id`).
 */
const CUSTOM_REPORTERS: Readonly<Record<string, LessonProgressReporter>> = {
  'hello-world': helloWorldReporter,
  'digraphs': digraphsReporter,
  'split-digraphs': splitDigraphsReporter,
  'final-open-vowels': finalOpenVowelsReporter,
  'sight-words': sightWordsReporter,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Get the progress reporter for a lesson.
 *
 * @param lessonId - The lesson's unique ID from the catalog
 * @returns The custom reporter if one is registered, otherwise the generic fallback
 */
export function getReporter(lessonId: string): LessonProgressReporter {
  return CUSTOM_REPORTERS[lessonId] ?? genericReporter;
}

/**
 * Check whether a lesson has a custom (non-generic) reporter.
 *
 * Useful for debug views that want to highlight which lessons have
 * specialized reporting vs. fallback behavior.
 */
export function hasCustomReporter(lessonId: string): boolean {
  return lessonId in CUSTOM_REPORTERS;
}