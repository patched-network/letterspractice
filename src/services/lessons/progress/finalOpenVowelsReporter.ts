/**
 * Final-open-vowels lesson progress reporter.
 *
 * Custom reporter for the "Vowels at the End" lesson. Displays a badge grid
 * of the three taught final-position vowel GPCs, coloured by each item's
 * evidence state (skillEvidence.ts).
 *
 * The slate is hardcoded rather than derived from the curriculum registry:
 * `gpcIdsForLesson('final-open-vowels', getComprehensiveCatalogue())` returns
 * only e/o because `GPC-i-AY-final` is tagged `analysis` (not `teaching-v0.x`)
 * in the catalogue and so is filtered out of the comprehensive list, even
 * though the lesson teaches it (see the seed slate + D9 in
 * content/phoneticAnalytics/lib/curriculum.ts). Keep this list in sync with
 * that seed slate.
 *
 * Replaces the generic fallback, which (a) showed a raw `concept:vowel:final_open`
 * tag with N/ELO bars to parents, and (b) could report "mastered" off one
 * vowel alone since the concept tag aggregates all three GPCs.
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
import { evaluateMastery } from './defaultMastery';
import FinalOpenVowelsReport from '../../../components/progress/FinalOpenVowelsReport.vue';

// ---------------------------------------------------------------------------
// Grapheme → GPC exercise tag mapping
// ---------------------------------------------------------------------------

export const FINAL_OPEN_VOWEL_GPC_TAGS: ReadonlyArray<{
  grapheme: string;
  phoneme: string;
  tag: string;
  examples: string[];
}> = [
  { grapheme: 'e', phoneme: 'IY', tag: 'gpc:exercise:e-IY-final', examples: ['he', 'we', 'she'] },
  { grapheme: 'i', phoneme: 'AY', tag: 'gpc:exercise:i-AY-final', examples: ['hi'] },
  { grapheme: 'o', phoneme: 'OW', tag: 'gpc:exercise:o-OW-final', examples: ['go', 'so', 'no'] },
];

// ---------------------------------------------------------------------------
// Mastery thresholds — one per tag; the decision is the shared evidence policy
// ---------------------------------------------------------------------------

const FINAL_OPEN_VOWELS_THRESHOLDS: MasteryThreshold[] = FINAL_OPEN_VOWEL_GPC_TAGS.map(({ tag }) => ({ tag }));

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function createFinalOpenVowelsReporter(): LessonProgressReporter {
  return {
    getStatus(ctx: LessonReportContext): LessonDisplayStatus {
      if (!ctx.passed && !ctx.prereqsMet) return 'locked';
      if (!ctx.passed && (!ctx.availabilityMet || !ctx.spacingMet)) return 'locked';
      if (!ctx.passed) return 'available';
      const evaluation = evaluateMastery(FINAL_OPEN_VOWELS_THRESHOLDS, ctx.tagScores);
      return evaluation.allMet ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(FinalOpenVowelsReport) as Component,

    getMasteryThresholds(_lesson: LessonDefinition): MasteryThreshold[] {
      return FINAL_OPEN_VOWELS_THRESHOLDS;
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      const evaluation = evaluateMastery(FINAL_OPEN_VOWELS_THRESHOLDS, ctx.tagScores);
      const metCount = evaluation.perTag.filter((t) => t.met).length;
      const total = FINAL_OPEN_VOWEL_GPC_TAGS.length;
      if (evaluation.allMet) return `All ${total} vowels mastered`;
      return `${metCount}/${total} vowels`;
    },
  };
}

export const finalOpenVowelsReporter: LessonProgressReporter = createFinalOpenVowelsReporter();
