/**
 * SpellingQuestion - Word spelling with phonetic awareness
 *
 * The learner hears a word and spells it using the keyboard.
 * Phonetic data from the phonetics service enables GPC-level
 * grading and intelligent hinting.
 *
 * Data model: just a WordKey. Audio URLs and phonetic alignment
 * are derived from the word/phonetics services at runtime.
 */

import { Question, ViewData, Answer } from "@vue-skuilder/courseware";
import { DataShape, FieldType, Status, type Evaluation, type TaggedPerformance } from "@vue-skuilder/common";
import { WORD_LIST, type WordKey } from "../audio/word-list";
import { getWordAudio } from "../audio";
import {
  getPhonetics,
  type WordPhonetics,
  type PhoneticChunk,
} from "../services/phonetics";
import { gradeSpelling } from "./spelling/grade";
import {
  type ScaffoldLevel,
  SCORE_CEILING,
  FAST_FLOOR_MS,
  SLOW_CEILING_MS,
  MIN_TIME_FRACTION,
} from "./spelling/types";
// View import + assignment intentionally lives in `src/questions/index.ts`
// (late-binding) to avoid the circular dependency between this file and
// SpellingQuestionView.vue (which imports `SpellingQuestion`).

// Validate that a string is a known WordKey
const WORD_SET = new Set<string>(WORD_LIST);

export function isWordKey(val: string): val is WordKey {
  return WORD_SET.has(val.toLowerCase());
}

/**
 * Data shape for spelling questions
 */
export const SpellingQuestionDataShape: DataShape = {
  name: "SpellingQuestion" as any,
  fields: [
    {
      name: "word",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          if (!isWordKey(val.toLowerCase())) {
            return {
              status: Status.error,
              msg: `"${val}" is not in the word list`,
            };
          }
          return { status: Status.ok, msg: "" };
        },
        instructions: "A word from the recorded word list",
      },
    },
  ],
};

/**
 * SpellingQuestion class
 */
export class SpellingQuestion extends Question {
  public static dataShapes: DataShape[] = [SpellingQuestionDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  public readonly word: WordKey;
  public readonly phonetics: WordPhonetics | null;
  public readonly audioUrl: string;

  /**
   * The scaffold level achieved during this attempt.
   * Set by the view before calling submitAnswer().
   * Defaults to Level 3 (unaided).
   */
  public achievedLevel: ScaffoldLevel = 3;

  /**
   * The score ceiling for this attempt, which may be reduced by
   * hints, rescue fallbacks, or scaffold level.
   * Set by the view before calling submitAnswer().
   */
  public scoreCeiling: number = SCORE_CEILING[3];

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as { word: string };
    this.word = d.word.toLowerCase() as WordKey;
    this.audioUrl = getWordAudio(this.word);
    this.phonetics = getPhonetics(this.word);
  }

  public dataShapes(): DataShape[] {
    return SpellingQuestion.dataShapes;
  }

  public views() {
    return SpellingQuestion.views;
  }

  /** The letters of the word */
  get letters(): string[] {
    return this.word.split("");
  }

  /** Phonetic chunks (GPCs) if available */
  get chunks(): PhoneticChunk[] {
    return this.phonetics?.chunks ?? [];
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Compute a time-scaled fraction in [MIN_TIME_FRACTION, 1.0].
   *
   * Fast answers (≤ FAST_MS) get 1.0; slow answers (≥ SLOW_MS) get
   * MIN_TIME_FRACTION; values in between are linearly interpolated.
   */
  private computeTimeFraction(timeSpent: number): number {
    const wordLen = this.word.length;
    const FAST_MS = Math.max(FAST_FLOOR_MS, wordLen * 1500);
    const SLOW_MS = Math.min(SLOW_CEILING_MS, wordLen * 6000);

    const clamped = Math.max(FAST_MS, Math.min(timeSpent, SLOW_MS));
    const range = SLOW_MS - FAST_MS;
    if (range <= 0) return 1.0;

    return 1 - (1 - MIN_TIME_FRACTION) * ((clamped - FAST_MS) / range);
  }

  /**
   * Per-GPC grading lives in spelling/grade.ts (rules there, regression table
   * in spelling/gradeCases.ts). A GPC got right scores the attempt's ceiling
   * scaled by time, even inside a wrong answer; a GPC missed scores 0. An
   * unjudged answer records `_global` only.
   *
   * A misspelling that reads back as the word ("fone" for "phone"; never a
   * sight word) is correct for the session and SRS, wrong for ELO. It is
   * `isCorrect`, so it stays out of the failedQ and isn't rescheduled soon,
   * but `_global` is 0. Spelling is a means to decoding here, and these
   * cards turned into leeches (curriculum-log C8). The SRS reads `_global`
   * as skill, so the next interval is 0.75× the last rather than grown.
   */
  public evaluate(answer: Answer, timeSpent: number): Evaluation {
    const grade = gradeSpelling(this.word, this.phonetics, String(answer));
    const timeFraction = this.computeTimeFraction(timeSpent);

    // Apply ceiling (from achievedLevel and any hint penalties)
    const ceiling = Math.min(this.scoreCeiling, SCORE_CEILING[this.achievedLevel]);
    const earned = ceiling * timeFraction;

    const performance: TaggedPerformance = { _global: grade.correct ? earned : 0 };
    for (const [tag, verdict] of Object.entries(grade.verdicts)) {
      performance[tag] = verdict === 'hit' ? earned : 0;
    }
    return { isCorrect: grade.correct || grade.phonetic !== null, performance };
  }

  protected isCorrect(answer: Answer): boolean {
    return String(answer).toLowerCase().trim() === this.word;
  }
}

export default SpellingQuestion;