/**
 * Generic lesson progress reporter.
 *
 * Used as the fallback for any lesson that doesn't have a custom reporter
 * registered. Computes status from standard prereq/availability checks
 * and mastery evaluation against the lesson's thresholds (explicit or
 * derived from gatesConceptTags).
 *
 * Renders a GenericLessonReport component showing concept-tag progress
 * bars for ongoing lessons.
 *
 * See: agent/concept-gates/a.5.todo-progress-reporters.md (removed; git history)
 */

import { markRaw, type Component } from 'vue';
import type { LessonDefinition, MasteryThreshold } from '../../lessons.types';
import type {
  LessonDisplayStatus,
  LessonProgressReporter,
  LessonReportContext,
  MasteryEvaluation,
  TagScores,
} from './types';
import { getMasteryThresholds, evaluateMastery } from './defaultMastery';
import GenericLessonReport from '../../../components/progress/GenericLessonReport.vue';

// ---------------------------------------------------------------------------
// Generic Reporter
// ---------------------------------------------------------------------------

/**
 * Create the generic reporter instance.
 *
 * This is a singleton — all lessons without a custom reporter share
 * the same reporter object. The per-lesson differentiation comes from
 * the `LessonReportContext` passed into `getStatus()` and the inline
 * component.
 */
function createGenericReporter(): LessonProgressReporter {
  return {
    getStatus(ctx: LessonReportContext): LessonDisplayStatus {
      // 1. Not passed and prereqs not met → locked
      if (!ctx.passed && !ctx.prereqsMet) {
        return 'locked';
      }

      // 2. Not passed, prereqs met but availability not met → locked
      if (!ctx.passed && (!ctx.availabilityMet || !ctx.spacingMet)) {
        return 'locked';
      }

      // 3. Not passed, all conditions met → available
      if (!ctx.passed) {
        return 'available';
      }

      // 4. Passed — evaluate mastery to decide ongoing vs mature
      const thresholds = getMasteryThresholds(ctx.lesson);
      const evaluation = evaluateMastery(thresholds, ctx.tagScores);

      return evaluation.allMet ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(GenericLessonReport) as Component,

    getMasteryThresholds(lesson: LessonDefinition): MasteryThreshold[] {
      return getMasteryThresholds(lesson);
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      const thresholds = getMasteryThresholds(ctx.lesson);
      const evaluation = evaluateMastery(thresholds, ctx.tagScores);

      if (thresholds.length === 0) return null;

      const metCount = evaluation.perTag.filter((t) => t.met).length;
      const total = evaluation.perTag.length;

      if (evaluation.allMet) {
        return `${total} concept${total === 1 ? '' : ' tags'} mastered`;
      }

      return `${metCount}/${total} concept${total === 1 ? '' : ' tags'}`;
    },
  };
}

export const genericReporter: LessonProgressReporter = createGenericReporter();