/**
 * WordSelection - A question type for word identification/minimal pair disambiguation
 *
 * Presents a target word (via audio) and asks the learner to select it from
 * a list of similar-sounding options (minimal pairs or near-miss distractors).
 *
 * Features:
 * - Plays target word audio
 * - Shows multiple choice word options
 * - On incorrect: plays both target and distractor audio for comparison
 * - Supports keyboard navigation (numbers 1-9, arrows, enter)
 *
 * Example: "Find 'wish'" with options: wish, dish, fish
 */

import { Question, ViewData, Answer } from "@vue-skuilder/courseware";
import { DataShape, FieldType, Status, type Evaluation, type TaggedPerformance } from "@vue-skuilder/common";
import { getPhonetics, findPhoneticDifference, type PhoneticChunk } from "@/services/phonetics";
import { gpcTag, graphemeToGpcId, sightWordGpcId, type GpcRole } from "@/services/tags";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and WordSelectionView.vue.

/**
 * Data shape for WordSelection questions
 */
export const WordSelectionDataShape: DataShape = {
  name: "WordSelection" as any,
  fields: [
    {
      name: "target",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const isValid = /^[a-zA-Z]+$/.test(val) && val.length >= 1;
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be a valid word (letters only)",
              };
        },
        instructions: "The target word to find",
      },
    },
    {
      name: "distractors",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const words = val.split(",").map((w) => w.trim());
          const allValid = words.every((w) => /^[a-zA-Z]+$/.test(w));
          return allValid && words.length >= 1
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be comma-separated words" };
        },
        instructions:
          'Comma-separated distractor words (e.g., "dish,fish,wish")',
      },
    },
    {
      name: "instruction",
      type: FieldType.STRING,
      validator: {
        test: () => ({ status: Status.ok, msg: "" }),
        instructions: "Optional custom instruction text",
      },
    },
    {
      name: "audioUrls",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Allow empty value (optional field for prefetching optimization)
          if (!val || val.trim() === "") {
            return { status: Status.ok, msg: "" };
          }

          // Validate that it's a comma-separated list of URLs
          const urls = val.split(",").map((u) => u.trim());
          const allValid = urls.every((u) => {
            // Allow both absolute URLs and relative paths
            return u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/");
          });
          return allValid && urls.length >= 1
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be comma-separated URLs (absolute or relative paths)",
              };
        },
        instructions:
          'Optional: Comma-separated audio URLs for target + distractors (enables prefetching, e.g., "/audio/words/cat.mp3,/audio/words/hat.mp3")',
      },
    },
  ],
};

/**
 * Question data structure
 */
export interface WordSelectionData {
  /** The target word to find */
  target: string;
  /** Distractor words (comma-separated string or array) */
  distractors: string | string[];
  /** Optional custom instruction */
  instruction?: string;
  /** Audio URLs for target + distractors (comma-separated, for prefetching only) */
  audioUrls?: string;
}

/**
 * Word option data for display
 */
export interface WordOption {
  /** The word */
  word: string;
  /** Whether this is the correct answer */
  isCorrect: boolean;
  /** Whether this option has been disabled (wrong guess) */
  disabled: boolean;
  /** Audio URL for this word (if available) */
  audioUrl?: string;
}

/**
 * WordSelection question class
 */
export class WordSelection extends Question {
  public static dataShapes: DataShape[] = [WordSelectionDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  public readonly target: string;
  public readonly distractors: string[];
  public readonly instruction: string;

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as WordSelectionData;
    this.target = d.target.toLowerCase().trim();

    // Parse distractors
    this.distractors = Array.isArray(d.distractors)
      ? d.distractors.map((w) => w.toLowerCase().trim())
      : d.distractors.split(",").map((w) => w.toLowerCase().trim());

    // Filter out target if accidentally included in distractors
    this.distractors = this.distractors.filter((w) => w !== this.target);

    this.instruction = d.instruction || "";
  }

  public dataShapes(): DataShape[] {
    return WordSelection.dataShapes;
  }

  public views() {
    return WordSelection.views;
  }

  /**
   * Get audio URL for a word
   * Returns undefined if no audio available
   */
  private getWordAudioUrl(word: string): string | undefined {
    return `/audio/words/${word}.mp3`;
  }

  /**
   * Build word options based on modifyDifficulty (user ELO - card ELO).
   *
   * Thresholds:
   *   Gap < -75:  1 distractor (2 total)
   *   Gap < 0:    2 distractors (3 total)
   *   Gap < 50:   3 distractors (4 total)
   *   Gap < 100:  4 distractors (5 total)
   *   Gap >= 100: 5 distractors (6 total)
   *
   * Reproducibility: Always takes the first N distractors from the list,
   * which are pre-sorted by "cleanliness" (minimal pair quality) in the
   * card generator.
   */
  public buildOptions(modifyDifficulty: number): WordOption[] {
    let distractorCount: number;
    if (modifyDifficulty < -75) {
      distractorCount = 1;
    } else if (modifyDifficulty < 0) {
      distractorCount = 2;
    } else if (modifyDifficulty < 50) {
      distractorCount = 3;
    } else if (modifyDifficulty < 100) {
      distractorCount = 4;
    } else {
      distractorCount = 5;
    }

    // Shuffle the distractor pool for variety, then slice (up to available)
    const pool = [...this.distractors];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selectedDistractors = pool.slice(0, distractorCount);

    const allWords = [this.target, ...selectedDistractors];

    // Build WordOption objects
    const options = allWords.map((word) => ({
      word,
      isCorrect: word === this.target,
      disabled: false,
      audioUrl: this.getWordAudioUrl(word),
    }));

    // Shuffle for display (to prevent position-learning)
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return options;
  }

  /**
   * Shuffle options for display (Fisher-Yates)
   * @deprecated Use buildOptions instead
   */
  public getShuffledOptions(): WordOption[] {
    return this.buildOptions(0); // Fallback to 3 distractors
  }

  /**
   * Check if a word is the correct answer
   */
  public isCorrectWord(word: string): boolean {
    return word.toLowerCase().trim() === this.target;
  }

  /**
   * Get the target word's audio URL
   */
  public getTargetAudioUrl(): string | undefined {
    return this.getWordAudioUrl(this.target);
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Build a GPC tag from a PhoneticChunk and a role.
   * Uses the catalogue to resolve grapheme+phoneme → canonical ID,
   * falling back to `{label}-{phoneme}` when no catalogue match exists.
   */
  private getChunkGpcTag(chunk: PhoneticChunk, role: GpcRole): string {
    const label = chunk.label ?? '';
    const phoneme = chunk.phoneme;
    const catalogueId = chunk.gpcId ?? graphemeToGpcId(label, phoneme);
    const id = catalogueId ?? `${label}-${phoneme}`;
    return gpcTag(role, id);
  }

  /**
   * A sight-word target is always at least exposed, even when no chunk carries
   * its GPC ("have"'s silent e makes no sound of its own).
   */
  private withSightWordExposure(performance: TaggedPerformance): TaggedPerformance {
    const sightWordId = sightWordGpcId(this.target);
    if (
      sightWordId &&
      !(gpcTag('exercise', sightWordId) in performance) &&
      !(gpcTag('expose', sightWordId) in performance)
    ) {
      performance[gpcTag('expose', sightWordId)] = null;
    }
    return performance;
  }

  public evaluate(answer: Answer, timeSpent: number): Evaluation {
    const correct = this.isCorrect(answer);

    // Time-backoff global score (same curve as WhoSaidThat)
    const FAST_MS = 5000;
    const SLOW_MS = 15000;
    // Softened 0.6 → 0.8 (2026-09-13). Since fw #1202 a score only sizes the ELO gain (common `eloActual`) —
    // so the floor sets what speed is worth.
    const MIN_SCORE = 0.8;
    const clamped = Math.max(FAST_MS, Math.min(timeSpent, SLOW_MS));
    const globalScore = correct
      ? 1 - (1 - MIN_SCORE) * ((clamped - FAST_MS) / (SLOW_MS - FAST_MS))
      : 0;

    const targetPhonetics = getPhonetics(this.target);

    if (correct) {
      // --- Correct answer ---
      if (!targetPhonetics) {
        return { isCorrect: true, performance: { _global: globalScore } };
      }

      // Identify the distinguishing position by comparing target vs first distractor.
      // The distinguishing chunk is exercised (scored); all other chunks are
      // count-only exposures — the user wasn't tested on them, just exposed.
      const firstDistractor = this.distractors[0];
      const diffIdx = firstDistractor
        ? findPhoneticDifference(this.target, firstDistractor)
        : null;

      const performance: TaggedPerformance = { _global: globalScore };
      for (let i = 0; i < targetPhonetics.chunks.length; i++) {
        const chunk = targetPhonetics.chunks[i];
        if (i === diffIdx) {
          // Distinguishing chunk: exercised with score
          performance[this.getChunkGpcTag(chunk, 'exercise')] = globalScore;
        } else {
          // Non-distinguishing chunk: count-only exposure
          performance[this.getChunkGpcTag(chunk, 'expose')] = null;
        }
      }
      return { isCorrect: true, performance: this.withSightWordExposure(performance) };
    }

    // --- Incorrect answer ---
    const selected = String(answer).toLowerCase().trim();
    const selectedPhonetics = getPhonetics(selected);

    if (!targetPhonetics || !selectedPhonetics) {
      return { isCorrect: false, performance: { _global: 0 } };
    }

    const performance: TaggedPerformance = { _global: 0 };
    const diffIdx = findPhoneticDifference(this.target, selected);

    // All target chunks default to exposure-only (null = count-only)
    for (const chunk of targetPhonetics.chunks) {
      performance[this.getChunkGpcTag(chunk, 'expose')] = null;
    }

    if (diffIdx !== null) {
      // The distinguishing position in the target → failed to discriminate
      const targetChunk = targetPhonetics.chunks[diffIdx];
      if (targetChunk) {
        performance[this.getChunkGpcTag(targetChunk, 'exercise')] = 0;
      }

      // The distractor's chunk at that position → count-only exposure
      const distractorChunk = selectedPhonetics.chunks[diffIdx];
      if (distractorChunk) {
        performance[this.getChunkGpcTag(distractorChunk, 'expose')] = null;
      }
    }

    return { isCorrect: false, performance: this.withSightWordExposure(performance) };
  }

  protected isCorrect(answer: Answer): boolean {
    return String(answer).toLowerCase().trim() === this.target;
  }
}

export default WordSelection;
