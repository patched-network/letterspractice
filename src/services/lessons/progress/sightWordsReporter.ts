/**
 * Sight-words lesson progress reporter.
 *
 * Binary per word: a word is "in play" once the learner has met it (its
 * intro card, or any card bearing its WORD tag). A word learned by heart has
 * no partial mastery worth showing a parent, and the slate runs to ~50
 * words, so the report is a count and the words in play, not a badge each.
 *
 * The slate here is what the app can teach: recorded words with a
 * sight-word catalogue entry (the intro cards' slate). It grows as
 * recordings land, so "mature" (every one in play) can lapse back to
 * "ongoing" when a new word arrives.
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
import { getAvailableWords } from '../../phonetics';
import { sightWordGpcId } from '../../tags/gpcCatalogue';
import { gpcExerciseTag, gpcExposeTag, gpcIntroTag } from '../../tags';
import SightWordsReport from '../../../components/progress/SightWordsReport.vue';

let slate: string[] | null = null;

/** The sight words the app can teach (recorded, with a catalogue entry), alphabetical. */
export function teachableSightWords(): string[] {
  slate ??= getAvailableWords()
    .filter((w) => w.length > 1 && sightWordGpcId(w))
    .sort();
  return slate;
}

/** Has the learner met this sight word (any of its intro / expose / exercise tags presented)? */
export function sightWordInPlay(word: string, tagScores: TagScores): boolean {
  const gpcId = sightWordGpcId(word.trim().toLowerCase());
  if (!gpcId) return false;
  return [gpcIntroTag(gpcId), gpcExposeTag(gpcId), gpcExerciseTag(gpcId)].some(
    (tag) => (tagScores[tag]?.count ?? 0) > 0,
  );
}

/** The teachable sight words in play, and how many there are to teach. */
export function sightWordsInPlay(tagScores: TagScores): { inPlay: string[]; total: number } {
  const all = teachableSightWords();
  return { inPlay: all.filter((w) => sightWordInPlay(w, tagScores)), total: all.length };
}

function createSightWordsReporter(): LessonProgressReporter {
  return {
    getStatus(ctx: LessonReportContext): LessonDisplayStatus {
      if (!ctx.passed && !ctx.prereqsMet) return 'locked';
      if (!ctx.passed && (!ctx.availabilityMet || !ctx.spacingMet)) return 'locked';
      if (!ctx.passed) return 'available';
      const { inPlay, total } = sightWordsInPlay(ctx.tagScores);
      return total > 0 && inPlay.length === total ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(SightWordsReport) as Component,

    // In play is a count, not an evidence threshold: nothing for the
    // evidence policy to evaluate
    getMasteryThresholds(_lesson: LessonDefinition): MasteryThreshold[] {
      return [];
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      const { inPlay, total } = sightWordsInPlay(ctx.tagScores);
      if (total > 0 && inPlay.length === total) return `All ${total} tricky words in play`;
      return `${inPlay.length} of ${total} tricky words in play`;
    },
  };
}

export const sightWordsReporter: LessonProgressReporter = createSightWordsReporter();
