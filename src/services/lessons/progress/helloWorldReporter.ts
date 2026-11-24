/**
 * Hello-world lesson progress reporter.
 *
 * Custom reporter for the "Meet the Letters" lesson. Instead of generic
 * concept-tag progress bars, this reporter evaluates mastery per-letter
 * using the `gpc:exercise:{grapheme}-{phoneme}` tags for all 26 simple
 * consonant and short vowel mappings.
 *
 * The inline component renders a 26-letter badge grid where each letter
 * is coloured by its evidence state (skillEvidence.ts).
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
import { evaluateMastery } from './defaultMastery';
import HelloWorldReport from '../../../components/progress/HelloWorldReport.vue';

// ---------------------------------------------------------------------------
// Letter → GPC exercise tag mapping
// ---------------------------------------------------------------------------

/**
 * The primary (most common / default) grapheme→phoneme mapping for each
 * of the 26 letters. These are the `gpc:exercise:` tags that the
 * hello-world lesson's mastery definition tracks.
 *
 * Sourced from CONSONANTS_SIMPLE and VOWELS_SHORT in the GPC catalogue,
 * using the highest-priority / teaching-tagged entry for each letter.
 *
 * Letters with multiple phonemes (c, g, s, x) use the primary/default
 * phoneme — the one introduced in the hello-world lesson.
 *
 * `q` is intentionally excluded: it's never taught as an isolated letter,
 * only as part of the `qu` digraph (see the digraphs lesson).
 */
export const LETTER_GPC_TAGS: ReadonlyArray<{
  letter: string;
  tag: string;
  examples: string[];
}> = [
  { letter: 'a', tag: 'gpc:exercise:a-AE',  examples: ['ant', 'apple', 'ask']  },
  { letter: 'b', tag: 'gpc:exercise:b-B',   examples: ['ball', 'bat', 'bug']   },
  { letter: 'c', tag: 'gpc:exercise:c-K',   examples: ['cat', 'cap', 'cup']    },
  { letter: 'd', tag: 'gpc:exercise:d-D',   examples: ['dog', 'dig', 'den']    },
  { letter: 'e', tag: 'gpc:exercise:e-EH',  examples: ['egg', 'end', 'elf']    },
  { letter: 'f', tag: 'gpc:exercise:f-F',   examples: ['fish', 'fun', 'fog']   },
  { letter: 'g', tag: 'gpc:exercise:g-G',   examples: ['got', 'gap', 'gum']    },
  { letter: 'h', tag: 'gpc:exercise:h-HH',  examples: ['hat', 'hop', 'hug']    },
  { letter: 'i', tag: 'gpc:exercise:i-IH',  examples: ['itch', 'inn', 'if']    },
  { letter: 'j', tag: 'gpc:exercise:j-JH',  examples: ['jet', 'jam', 'jug']    },
  { letter: 'k', tag: 'gpc:exercise:k-K',   examples: ['kid', 'kit', 'king']   },
  { letter: 'l', tag: 'gpc:exercise:l-L',   examples: ['lip', 'log', 'let']    },
  { letter: 'm', tag: 'gpc:exercise:m-M',   examples: ['map', 'mud', 'men']    },
  { letter: 'n', tag: 'gpc:exercise:n-N',   examples: ['nap', 'net', 'nod']    },
  { letter: 'o', tag: 'gpc:exercise:o-AA',  examples: ['odd', 'on', 'ox']      },
  { letter: 'p', tag: 'gpc:exercise:p-P',   examples: ['pig', 'pat', 'pop']    },
  { letter: 'r', tag: 'gpc:exercise:r-R',   examples: ['run', 'red', 'rug']    },
  { letter: 's', tag: 'gpc:exercise:s-S',   examples: ['sat', 'sip', 'sun']    },
  { letter: 't', tag: 'gpc:exercise:t-T',   examples: ['top', 'tap', 'tub']    },
  { letter: 'u', tag: 'gpc:exercise:u-AH',  examples: ['up', 'us', 'ugh']      },
  { letter: 'v', tag: 'gpc:exercise:v-V',   examples: ['van', 'vet', 'vat']    },
  { letter: 'w', tag: 'gpc:exercise:w-W',   examples: ['win', 'web', 'wag']    },
  { letter: 'x', tag: 'gpc:exercise:x-K_S', examples: ['fox', 'box', 'wax']   },
  { letter: 'y', tag: 'gpc:exercise:y-Y',   examples: ['yes', 'yam', 'yak']    },
  { letter: 'z', tag: 'gpc:exercise:z-Z',   examples: ['zip', 'zap', 'zoo']    },
];

// ---------------------------------------------------------------------------
// Mastery thresholds for hello-world
// ---------------------------------------------------------------------------

/**
 * Per-letter mastery thresholds — one per tag. "Mature" is decided by the
 * shared evidence policy (windowed first-attempt accuracy), same bar as
 * every other lesson; hello-world no longer has a lower ELO bar of its own.
 */
const HELLO_WORLD_THRESHOLDS: MasteryThreshold[] = LETTER_GPC_TAGS.map(({ tag }) => ({ tag }));

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function createHelloWorldReporter(): LessonProgressReporter {
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

      // 3. Not passed, all conditions met. Normally "available" — but
      //    hello-world content flows BEFORE the lesson completes (the
      //    LessonGateFilter bootstrap exception), so a learner can hold real
      //    per-letter progress while the lesson itself is pending. Any data
      //    on a tracked tag means they've started: report 'ongoing' so the
      //    letter grid renders and moves. (Matters for new users on
      //    /progress, and for /showHN's fresh persona, where practice mode
      //    has no Learn flow and the lesson would stay "Ready" forever.)
      if (!ctx.passed) {
        const started = LETTER_GPC_TAGS.some(
          ({ tag }) => (ctx.tagScores[tag]?.count ?? 0) > 0,
        );
        return started ? 'ongoing' : 'available';
      }

      // 4. Passed — evaluate per-letter mastery
      const evaluation = evaluateMastery(HELLO_WORLD_THRESHOLDS, ctx.tagScores);
      return evaluation.allMet ? 'mature' : 'ongoing';
    },

    inlineComponent: markRaw(HelloWorldReport) as Component,

    getMasteryThresholds(_lesson: LessonDefinition): MasteryThreshold[] {
      return HELLO_WORLD_THRESHOLDS;
    },

    evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation {
      return evaluateMastery(thresholds, tagScores);
    },

    maturityLabel(ctx: LessonReportContext): string | null {
      const evaluation = evaluateMastery(HELLO_WORLD_THRESHOLDS, ctx.tagScores);
      const metCount = evaluation.perTag.filter((t) => t.met).length;
      const total = LETTER_GPC_TAGS.length;

      if (evaluation.allMet) {
        return `All ${total} letters mastered`;
      }

      return `${metCount}/${total} letters`;
    },
  };
}

export const helloWorldReporter: LessonProgressReporter =
  createHelloWorldReporter();