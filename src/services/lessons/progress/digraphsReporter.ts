/**
 * Digraphs lesson progress reporter.
 *
 * Custom reporter for the digraphs lesson. Displays a badge grid of the
 * GPCs the lesson releases (per the curriculum registry's blessed slate:
 * th(TH), th(DH), sh, ch, ng, ph, qu + the post-lesson fact nk), colored
 * grey→yellow→green by per-item ELO maturity.
 *
 * Former members now live elsewhere in the curriculum: ck (doubled
 * consonants), wh (silent letters), igh/tch/dge (unassigned holding pool) —
 * see decision log in agent/devlog/2026-06-16-curriculum-sot-closeout.md (curriculum-sot docs removed; full log in git history).
 * Analysis-tier items (ch→K, ch→SH, ng→N_G, etc.) have no curriculum
 * assignment and are excluded by construction.
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
import DigraphsReport from '../../../components/progress/DigraphsReport.vue';
import { gpcIdsForLesson } from '../../curriculum';
import { gpcExerciseTag } from '../../tags';
import { getComprehensiveCatalogue } from '../../../../content/phoneticAnalytics/lib/catalogue';

// ---------------------------------------------------------------------------
// Grapheme → GPC exercise tag mapping — derived from the curriculum registry
// ---------------------------------------------------------------------------

export const DIGRAPH_GPC_TAGS: ReadonlyArray<{
  grapheme: string;
  tag: string;
  examples: string[];
}> = (() => {
  const entries = getComprehensiveCatalogue();
  const byId = new Map(entries.map((e) => [e.id, e]));
  return gpcIdsForLesson('digraphs', entries).map((a) => ({
    grapheme: byId.get(a.gpcId)!.grapheme,
    tag: gpcExerciseTag(a.gpcId),
    examples: a.examples ?? [],
  }));
})();

// ---------------------------------------------------------------------------
// Mastery thresholds — one per tag; the decision is the shared evidence policy
// ---------------------------------------------------------------------------

const DIGRAPHS_THRESHOLDS: MasteryThreshold[] = DIGRAPH_GPC_TAGS.map(({ tag }) => ({ tag }));

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function createDigraphsReporter(): LessonProgressReporter {
  return {
    getStatus(ctx: LessonReportContext): LessonDisplayStatus {
      if (!ctx.passed && !ctx.prereqsMet) return 'locked';
      if (!ctx.passed && (!ctx.availabilityMet || !ctx.spacingMet)) return 'locked';
      if (!ctx.passed) return 'available';
      const evaluation = evaluateMastery(DIGRAPHS_THRESHOLDS, ctx.tagScores);
      return evaluation.allMet ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(DigraphsReport) as Component,

    getMasteryThresholds(_lesson: LessonDefinition): MasteryThreshold[] {
      return DIGRAPHS_THRESHOLDS;
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      const evaluation = evaluateMastery(DIGRAPHS_THRESHOLDS, ctx.tagScores);
      const metCount = evaluation.perTag.filter((t) => t.met).length;
      const total = DIGRAPH_GPC_TAGS.length;
      if (evaluation.allMet) return `All ${total} digraphs mastered`;
      return `${metCount}/${total} digraphs`;
    },
  };
}

export const digraphsReporter: LessonProgressReporter = createDigraphsReporter();
