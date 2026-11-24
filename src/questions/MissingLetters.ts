/**
 * MissingLetters - Fill-in-the-blanks word completion exercise
 *
 * The learner sees a word with some letters blanked out and must fill
 * in the missing letters using the keyboard. Audio and phonetic data
 * are derived from the word/phonetics services at runtime.
 *
 * Data model:
 *   - word: a WordKey from the recorded word list
 *   - blanks: comma-separated indices (0-based) of letters to hide
 */

import { Question, ViewData, Answer } from "@vue-skuilder/courseware";
import {
  DataShape,
  FieldType,
  Status,
  type Evaluation,
  type TaggedPerformance,
} from "@vue-skuilder/common";
import { WORD_LIST, type WordKey } from "../audio/word-list";
import { getWordAudio } from "../audio";
import {
  getPhonetics,
  type WordPhonetics,
  type PhoneticChunk,
} from "../services/phonetics";
import { gpcTag, graphemeToGpcId, sightWordGpcId, type GpcRole } from "@/services/tags";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and MissingLettersView.vue.

// Validate that a string is a known WordKey
const WORD_SET = new Set<string>(WORD_LIST);

function isWordKey(val: string): val is WordKey {
  return WORD_SET.has(val.toLowerCase());
}

/**
 * Parse and validate a blanks string (comma-separated 0-based indices).
 * Returns sorted, deduplicated array of valid indices for the given word length,
 * or null if the string is malformed.
 */
function parseBlanks(raw: string, wordLength: number): number[] | null {
  if (!raw || raw.trim() === "") return null;

  const parts = raw.split(",").map((s) => s.trim());
  const indices: number[] = [];

  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n >= wordLength) return null;
    if (!indices.includes(n)) indices.push(n);
  }

  if (indices.length === 0) return null;
  return indices.sort((a, b) => a - b);
}

/**
 * Data shape for MissingLetters questions
 */
export const MissingLettersDataShape: DataShape = {
  name: "MissingLetters" as any,
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
    {
      name: "blanks",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          if (!val || val.trim() === "") {
            return {
              status: Status.error,
              msg: "At least one blank index is required",
            };
          }
          const parts = val.split(",").map((s) => s.trim());
          const allValid = parts.every(
            (p) => /^\d+$/.test(p) && Number(p) >= 0
          );
          if (!allValid || parts.length === 0) {
            return {
              status: Status.error,
              msg: "Must be comma-separated non-negative integers",
            };
          }
          return { status: Status.ok, msg: "" };
        },
        instructions:
          'Comma-separated 0-based indices of letters to blank (e.g., "1,3")',
      },
    },
  ],
};

/**
 * Question data as stored / passed via ViewData
 */
export interface MissingLettersData {
  word: string;
  blanks: string;
}

// ---------------------------------------------------------------------------
// Time Scaling Constants (simpler than SpellingQuestion — fewer blanks)
// ---------------------------------------------------------------------------

const FAST_FLOOR_MS = 2000;
const SLOW_CEILING_MS = 20000;
// Softened 0.6 → 0.8 (2026-09-13). Since fw #1202 a score only sizes the ELO gain
// (common `eloActual`), so this floor sets what speed is worth, not whether a
// slow correct answer drains ELO.
const MIN_TIME_FRACTION = 0.8;

/**
 * Ceiling on observed performance when the learner triggered the isolated
 * target phoneme for a blank. Hearing the exact sound they need to produce
 * makes the item materially easier, so the ELO-facing score for the assisted
 * chunk (and the card overall) is capped below the normal correct floor of
 * MIN_TIME_FRACTION to keep ELO gains honest. Tune to taste.
 */
const HINT_ASSISTED_SCORE_CAP = 0.5;

/**
 * MissingLetters question class
 */
export class MissingLetters extends Question {
  public static dataShapes: DataShape[] = [MissingLettersDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  public readonly word: WordKey;
  public readonly blanks: number[];
  public readonly phonetics: WordPhonetics | null;
  public readonly audioUrl: string;

  /**
   * Word positions of blanks whose isolated target phoneme the learner
   * triggered while answering. Populated by the view via
   * {@link markBlankPhonemeRevealed}; consulted in {@link evaluate} to cap
   * hint-assisted performance. Instance is per-view, so this is naturally
   * scoped to a single presentation (accumulates across that view's retries).
   */
  public readonly revealedBlankPositions = new Set<number>();

  /**
   * Word positions of blanks where the view's time-based option-shaving fired
   * (the enabled keyboard was narrowed for the learner because they hung on
   * this blank). Populated by the view via {@link markBlankTimeAssisted};
   * consulted in {@link evaluate} to cap the score exactly like a revealed
   * phoneme — a rescued-correct answer scores low so the skill re-surfaces.
   * Per-view instance, so naturally scoped to a single presentation.
   */
  public readonly timeAssistedBlankPositions = new Set<number>();

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as MissingLettersData;
    this.word = d.word.toLowerCase() as WordKey;
    this.audioUrl = getWordAudio(this.word);
    this.phonetics = getPhonetics(this.word);

    // Parse blanks — fall back to blanking the first letter if invalid
    const parsed = parseBlanks(d.blanks, this.word.length);
    this.blanks = parsed ?? [0];
  }

  public dataShapes(): DataShape[] {
    return MissingLetters.dataShapes;
  }

  public views() {
    return MissingLetters.views;
  }

  /** The letters of the word */
  get letters(): string[] {
    return this.word.split("");
  }

  /** Phonetic chunks (GPCs) if available */
  get chunks(): PhoneticChunk[] {
    return this.phonetics?.chunks ?? [];
  }

  /** Whether a given index is blanked */
  isBlank(index: number): boolean {
    return this.blanks.includes(index);
  }

  /** The expected letter at a blank position */
  expectedAt(blankIndex: number): string {
    return this.word[blankIndex]?.toLowerCase() ?? "";
  }

  /**
   * Record that the learner played the isolated target phoneme for the blank at
   * `wordPos`. Used by evaluate() to cap hint-assisted performance.
   */
  public markBlankPhonemeRevealed(wordPos: number): void {
    this.revealedBlankPositions.add(wordPos);
  }

  /**
   * Record that time-based option-shaving fired for the blank at `wordPos`
   * (the keyboard was narrowed because the learner hung here). Used by
   * evaluate() to cap the assisted score. See {@link timeAssistedBlankPositions}.
   */
  public markBlankTimeAssisted(wordPos: number): void {
    this.timeAssistedBlankPositions.add(wordPos);
  }

  /** Whether a blank position received any assist (phoneme reveal or time-shave). */
  private wasAssisted(wordPos: number): boolean {
    return (
      this.revealedBlankPositions.has(wordPos) ||
      this.timeAssistedBlankPositions.has(wordPos)
    );
  }

  /**
   * Public accessor for answer checking (isCorrect is protected on Question base).
   * Answer is a string of blank-fill letters in blank-position order.
   */
  public checkAnswer(answer: string): boolean {
    return this.isCorrect(answer);
  }

  // ---------------------------------------------------------------------------
  // GPC Tagging
  // ---------------------------------------------------------------------------

  /**
   * Build a GPC tag from a PhoneticChunk.
   */
  private getChunkGpcTag(chunk: PhoneticChunk, role: GpcRole = "exercise"): string | null {
    const label = chunk.label ?? "";
    if (!label) return null;
    const phoneme = chunk.phoneme;
    const catalogueId = chunk.gpcId ?? graphemeToGpcId(label, phoneme);
    if (!catalogueId) return null;
    return gpcTag(role, catalogueId);
  }

  // ---------------------------------------------------------------------------
  // Time Scaling
  // ---------------------------------------------------------------------------

  private computeTimeFraction(timeSpent: number): number {
    const blankCount = this.blanks.length;
    const FAST_MS = Math.max(FAST_FLOOR_MS, blankCount * 1500);
    const SLOW_MS = Math.min(SLOW_CEILING_MS, blankCount * 6000);

    const clamped = Math.max(FAST_MS, Math.min(timeSpent, SLOW_MS));
    const range = SLOW_MS - FAST_MS;
    if (range <= 0) return 1.0;

    return 1 - (1 - MIN_TIME_FRACTION) * ((clamped - FAST_MS) / range);
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * The answer is a string of letters corresponding to blank positions,
   * in order of the blanks array.
   */
  public evaluate(answer: Answer, timeSpent: number): Evaluation {
    const correct = this.isCorrect(answer);
    const timeFraction = this.computeTimeFraction(timeSpent);
    // Uncapped base — per-chunk scores derive from this so an un-assisted chunk
    // in the same word isn't dragged down by a hint used on a different chunk.
    const baseScore = correct ? timeFraction : 0;

    // Cap the card-level score if the learner was assisted on ANY blank —
    // either by revealing its phoneme or by time-based option-shaving.
    const anyBlankAssisted = this.blanks.some((pos) => this.wasAssisted(pos));
    const globalScore =
      baseScore > 0 && anyBlankAssisted
        ? Math.min(baseScore, HINT_ASSISTED_SCORE_CAP)
        : baseScore;

    const performance: TaggedPerformance = { _global: globalScore };

    if (!this.phonetics) {
      return { isCorrect: correct, performance };
    }

    // Build a set of blank positions for quick lookup
    const blankSet = new Set(this.blanks);

    // Parse the answer into per-blank letters
    const answerStr = String(answer).toLowerCase();
    const answerLetters = answerStr.split("");

    // Per-GPC chunk grading: a chunk is "tested" if any of its positions
    // are blanked. It's correct if all its blanked positions were filled correctly.
    for (const chunk of this.phonetics.chunks) {
      const chunkPositions = Object.keys(chunk.letters).map(Number);
      const testedPositions = chunkPositions.filter((p) => blankSet.has(p));

      if (testedPositions.length === 0) {
        // Untested chunk — record as expose-namespace count-only exposure,
        // not under exercise: which is reserved for chunks the user produced.
        const exposeTag = this.getChunkGpcTag(chunk, "expose");
        if (exposeTag) performance[exposeTag] = null;
        continue;
      }

      const tag = this.getChunkGpcTag(chunk, "exercise");
      if (!tag) continue;

      // Check if all tested positions in this chunk were answered correctly
      const chunkCorrect = testedPositions.every((pos) => {
        const blankIdx = this.blanks.indexOf(pos);
        const typed = answerLetters[blankIdx] ?? "";
        return typed === this.word[pos]?.toLowerCase();
      });

      // Cap this chunk's score only if one of its own positions was assisted
      // (phoneme revealed or time-shaved).
      const chunkAssisted = testedPositions.some((pos) => this.wasAssisted(pos));
      const capChunk = (v: number): number =>
        chunkAssisted && v > 0 ? Math.min(v, HINT_ASSISTED_SCORE_CAP) : v;

      if (correct) {
        performance[tag] = capChunk(baseScore);
      } else if (chunkCorrect) {
        performance[tag] = capChunk(timeFraction);
      } else {
        performance[tag] = 0;
      }
    }

    // A sight word is always at least exposed, even when no chunk carries its
    // GPC ("have"'s silent e makes no sound of its own).
    const sightWordId = sightWordGpcId(this.word);
    if (
      sightWordId &&
      !(gpcTag("exercise", sightWordId) in performance) &&
      !(gpcTag("expose", sightWordId) in performance)
    ) {
      performance[gpcTag("expose", sightWordId)] = null;
    }

    return { isCorrect: correct, performance };
  }

  protected isCorrect(answer: Answer): boolean {
    const answerStr = String(answer).toLowerCase();
    const answerLetters = answerStr.split("");

    if (answerLetters.length !== this.blanks.length) return false;

    return this.blanks.every((pos, i) => {
      return answerLetters[i] === this.word[pos]?.toLowerCase();
    });
  }
}

export default MissingLetters;