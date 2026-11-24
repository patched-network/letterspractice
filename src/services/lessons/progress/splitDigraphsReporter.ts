/**
 * Split-digraphs lesson progress reporter.
 *
 * Custom reporter for the "Magic E / Split Digraphs" lesson. Displays a
 * badge grid of the 5 split-digraph patterns (concept:match:split_digraph),
 * coloured by each pattern's evidence state (skillEvidence.ts).
 *
 * Tags: a_e, e_e, i_e, o_e, u_e(UW), u_e(Y UW).
 * The u_e pattern has two pronunciations (tube vs cute) so both are tracked
 * as tags, and merged into one badge.
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
import { readSkillEvidence, mergeRecent, isMastered, type SkillEvidence } from './skillEvidence';
import SplitDigraphsReport from '../../../components/progress/SplitDigraphsReport.vue';

// ---------------------------------------------------------------------------
// Grapheme → GPC exercise tag mapping
// ---------------------------------------------------------------------------

export const SPLIT_DIGRAPH_GPC_TAGS: ReadonlyArray<{
  grapheme: string;
  phoneme: string;
  tag: string;
  examples: string[];
}> = [
  { grapheme: 'a_e', phoneme: 'EY', tag: 'gpc:exercise:a_e-EY', examples: ['cake', 'made', 'lake'] },
  { grapheme: 'e_e', phoneme: 'IY', tag: 'gpc:exercise:e_e-IY', examples: ['theme', 'these', 'eve'] },
  { grapheme: 'i_e', phoneme: 'AY', tag: 'gpc:exercise:i_e-AY', examples: ['bike', 'five', 'smile'] },
  { grapheme: 'o_e', phoneme: 'OW', tag: 'gpc:exercise:o_e-OW', examples: ['home', 'bone', 'note'] },
  { grapheme: 'u_e', phoneme: 'UW',  tag: 'gpc:exercise:u_e-UW',   examples: ['tube', 'rule'] },
  { grapheme: 'u_e', phoneme: 'Y UW', tag: 'gpc:exercise:u_e-Y_UW', examples: ['cute', 'use'] },
];

// ---------------------------------------------------------------------------
// Mastery thresholds — one per tag; the decision is the shared evidence policy
// ---------------------------------------------------------------------------

const SPLIT_DIGRAPHS_THRESHOLDS: MasteryThreshold[] = SPLIT_DIGRAPH_GPC_TAGS.map(({ tag }) => ({ tag }));

// ---------------------------------------------------------------------------
// Patterns — one per grapheme, the unit the badge grid and label count
// ---------------------------------------------------------------------------

export interface SplitDigraphPattern {
  /** e.g. "u_e" */
  grapheme: string;
  gpcIds: string[];
  examples: string[];
  evidence: SkillEvidence;
  met: boolean;
}

/**
 * Some graphemes (u_e) have multiple phoneme readings. Collapse to one
 * pattern per grapheme by merging the readings' evidence buffers
 * chronologically and reading them with the one shared policy.
 */
export function splitDigraphPatterns(tagScores: TagScores): SplitDigraphPattern[] {
  const grouped = new Map<string, { tags: string[]; examples: string[]; gpcIds: string[] }>();
  for (const { grapheme, tag, examples } of SPLIT_DIGRAPH_GPC_TAGS) {
    const g = grouped.get(grapheme) ?? { tags: [], examples: [], gpcIds: [] };
    g.tags.push(tag);
    g.examples.push(...examples);
    g.gpcIds.push(`GPC-${tag.slice('gpc:exercise:'.length)}`);
    grouped.set(grapheme, g);
  }

  return [...grouped.entries()].map(([grapheme, g]) => {
    const evidence = readSkillEvidence(mergeRecent(g.tags.map((t) => tagScores[t]?.recent)));
    return { grapheme, gpcIds: g.gpcIds, examples: g.examples, evidence, met: isMastered(evidence) };
  });
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function createSplitDigraphsReporter(): LessonProgressReporter {
  return {
    getStatus(ctx: LessonReportContext): LessonDisplayStatus {
      if (!ctx.passed && !ctx.prereqsMet) return 'locked';
      if (!ctx.passed && (!ctx.availabilityMet || !ctx.spacingMet)) return 'locked';
      if (!ctx.passed) return 'available';
      const evaluation = evaluateMastery(SPLIT_DIGRAPHS_THRESHOLDS, ctx.tagScores);
      return evaluation.allMet ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(SplitDigraphsReport) as Component,

    getMasteryThresholds(_lesson: LessonDefinition): MasteryThreshold[] {
      return SPLIT_DIGRAPHS_THRESHOLDS;
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      // Counts graphemes, matching the badges; "all mastered" stays with the
      // per-tag evaluation that decides the 'mature' status
      const patterns = splitDigraphPatterns(ctx.tagScores);
      const metCount = patterns.filter((p) => p.met).length;
      const total = patterns.length;
      const { allMet } = evaluateMastery(SPLIT_DIGRAPHS_THRESHOLDS, ctx.tagScores);
      if (allMet) return `All ${total} patterns mastered`;
      return `${metCount}/${total} patterns`;
    },
  };
}

export const splitDigraphsReporter: LessonProgressReporter = createSplitDigraphsReporter();
