/**
 * GpcIntro - A question type for introducing grapheme-phoneme correspondences
 *
 * A one-time introductory exercise for a letter-sound correspondence (GPC).
 * The learner meets a letter, hears its sound, and sees/hears it in word context.
 * Completion unlocks exercise-level cards (WST, WS, ML, SQ) for that GPC.
 *
 * This is NOT a drill — it's a gate. The exercise loop handles reinforcement.
 *
 * Interaction flow:
 *   Phase 1: Letter Meet — spacebar press to hear the phoneme
 *   Phase 2: Onset Words — 2-step per word (phoneme, then full word)
 *   Phase 3: Core Words — letter in medial position (e.g., vowels in CVC words)
 *   Phase 4: Coda Words — same pattern, optional (skipped if empty)
 *
 * No ELO scoring — binary completion (done / not done).
 */

import { Question, ViewData, Answer } from "@vue-skuilder/courseware";
import {
  DataShape,
  FieldType,
  Status,
  type Evaluation,
  type TaggedPerformance,
} from "@vue-skuilder/common";
import { generateVibrancyRainbow } from "../letterpeople/util/color";
import { toPhonemeAudioKey, type PhonemeAudioKey } from "../services/phonetics/phonemeCache";
import { gpcShortId, gpcIntroTag, gpcExposeTag } from "@/services/tags";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and GpcIntroView.vue.

// ============================================================================
// Data Shape
// ============================================================================

export const GpcIntroDataShape: DataShape = {
  name: "GpcIntro" as any,
  fields: [
    {
      name: "gpcId",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Expect format like "GPC-s-S" or "GPC-a-AE"
          const isValid = /^GPC-[a-zA-Z]+-[A-Z_]{1,5}$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: 'Must be a valid GPC catalogue ID (e.g., "GPC-s-S")',
              };
        },
        instructions: 'GPC catalogue ID (e.g., "GPC-s-S", "GPC-a-AE")',
      },
    },
    {
      name: "letter",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const isValid = /^[a-zA-Z]$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be a single letter (a-z)" };
        },
        instructions: "Display letter (lowercase), e.g., 's'",
      },
    },
    {
      name: "phoneme",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const isValid = /^[A-Z]{1,3}[012]?(_[A-Z]{1,3})?$/.test(
            val.toUpperCase()
          );
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be a valid ARPAbet phoneme code",
              };
        },
        instructions: 'ARPAbet phoneme code (e.g., "S", "AE", "K_S")',
      },
    },
    {
      name: "onsetWords",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          if (!val || val.trim() === "") {
            return {
              status: Status.error,
              msg: "At least one onset word is required",
            };
          }
          const words = val.split(",").map((w) => w.trim());
          const allValid = words.every((w) => /^[a-zA-Z]+$/.test(w));
          return allValid && words.length >= 1
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be comma-separated words (letters only)",
              };
        },
        instructions:
          'Comma-separated onset words (e.g., "sat,sun,sit"). 2-3 words recommended.',
      },
    },
    {
      name: "coreWords",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Empty is valid — not all GPCs have core-position exemplars
          if (!val || val.trim() === "") {
            return { status: Status.ok, msg: "" };
          }
          const words = val.split(",").map((w) => w.trim());
          const allValid = words.every((w) => /^[a-zA-Z]+$/.test(w));
          return allValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be comma-separated words (letters only)",
              };
        },
        instructions:
          'Comma-separated core/medial words, or empty (e.g., "cat,bag"). 0-2 words recommended.',
      },
    },
    {
      name: "codaWords",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Empty is valid — some letters don't appear in coda position
          if (!val || val.trim() === "") {
            return { status: Status.ok, msg: "" };
          }
          const words = val.split(",").map((w) => w.trim());
          const allValid = words.every((w) => /^[a-zA-Z]+$/.test(w));
          return allValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be comma-separated words (letters only)",
              };
        },
        instructions:
          'Comma-separated coda words, or empty (e.g., "bus,gas"). 0-2 words recommended.',
      },
    },
  ],
};

// ============================================================================
// Data Interface
// ============================================================================

/**
 * Data structure for GPC Intro cards.
 * Fields may arrive as comma-separated strings (from CouchDB) or arrays.
 */
export interface GpcIntroData {
  /** Target GPC catalogue ID, e.g., "GPC-s-S" */
  gpcId: string;
  /** Display letter (lowercase), e.g., "s" */
  letter: string;
  /** ARPAbet phoneme to play, e.g., "S" */
  phoneme: string;
  /** Words starting with this letter (have audio, fully decodable) */
  onsetWords: string | string[];
  /** Words with this letter in medial/core position (e.g., vowels in CVC). May be empty. */
  coreWords: string | string[];
  /** Words ending with this letter (have audio, fully decodable). May be empty. */
  codaWords: string | string[];
}

// ============================================================================
// Helper: parse array-or-csv field
// ============================================================================

function parseWordList(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (typeof raw === "string" && raw.trim() === "") return [];
  return raw
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

// ============================================================================
// Question Class
// ============================================================================

/** Number of spacebar presses required in Phase 1 (Letter Meet) */
export const PHASE1_PRESS_COUNT = 1;

/**
 * GpcIntro question class
 *
 * Always evaluates as correct (binary gate, not a drill).
 * Tags both `gpc:intro` and `gpc:expose` on completion.
 */
export class GpcIntro extends Question {
  public static dataShapes: DataShape[] = [GpcIntroDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  /** Target GPC catalogue ID (e.g., "GPC-s-S") */
  public readonly gpcId: string;
  /** Display letter (lowercase) */
  public readonly letter: string;
  /** ARPAbet phoneme */
  public readonly phoneme: PhonemeAudioKey;
  /** Words starting with the target letter */
  public readonly onsetWords: string[];
  /** Words with the target letter in medial/core position */
  public readonly coreWords: string[];
  /** Words ending with the target letter (may be empty) */
  public readonly codaWords: string[];
  /** Whether this intro has a core phase */
  public readonly hasCorePhase: boolean;
  /** Whether this intro has a coda phase */
  public readonly hasCodaPhase: boolean;
  /** Colors for onset words */
  public readonly onsetColors: string[];
  /** Colors for core words */
  public readonly coreColors: string[];
  /** Colors for coda words */
  public readonly codaColors: string[];
  /** Color for the intro letter */
  public readonly letterColor: string;

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as GpcIntroData;
    this.gpcId = d.gpcId;
    this.letter = d.letter.toLowerCase();
    this.phoneme = toPhonemeAudioKey(d.phoneme);
    this.onsetWords = parseWordList(d.onsetWords);
    this.coreWords = parseWordList(d.coreWords);
    this.codaWords = parseWordList(d.codaWords);
    this.hasCorePhase = this.coreWords.length > 0;
    this.hasCodaPhase = this.codaWords.length > 0;

    // Generate stable colors for this instance
    const randomStartHue = Math.random() * 360;
    const totalWords = this.onsetWords.length + this.coreWords.length + this.codaWords.length;
    const allColors = generateVibrancyRainbow(
      Math.max(totalWords + 1, 2), // +1 for the letter itself
      0.7, // lightness
      0.15, // chroma (pastel, Tier 2)
      randomStartHue
    );

    this.letterColor = allColors[0];
    const onsetEnd = 1 + this.onsetWords.length;
    const coreEnd = onsetEnd + this.coreWords.length;
    this.onsetColors = allColors.slice(1, onsetEnd);
    this.coreColors = allColors.slice(onsetEnd, coreEnd);
    this.codaColors = allColors.slice(coreEnd);
  }

  public dataShapes(): DataShape[] {
    return GpcIntro.dataShapes;
  }

  public views() {
    return GpcIntro.views;
  }

  // -------------------------------------------------------------------------
  // Word helpers
  // -------------------------------------------------------------------------

  /**
   * Total number of words across both phases
   */
  get totalWords(): number {
    return this.onsetWords.length + this.coreWords.length + this.codaWords.length;
  }

  /**
   * Get the index of the target letter in an onset word.
   * For onset words, the target letter is always at index 0.
   */
  public getOnsetLetterIndex(_word: string): number {
    return 0;
  }

  /**
   * Get the index of the target letter in a core/medial word.
   * Finds the first occurrence that is NOT index 0 (not onset).
   */
  public getCoreLetterIndex(word: string): number {
    const lower = word.toLowerCase();
    for (let i = 1; i < lower.length; i++) {
      if (lower[i] === this.letter) return i;
    }
    // Fallback: first occurrence
    const idx = lower.indexOf(this.letter);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Get the index of the target letter in a coda word.
   * For coda words, the target letter is at the last position where it appears.
   */
  public getCodaLetterIndex(word: string): number {
    const lastIndex = word.toLowerCase().lastIndexOf(this.letter);
    // Fallback to last character if letter not found (shouldn't happen with valid data)
    return lastIndex >= 0 ? lastIndex : word.length - 1;
  }

  // -------------------------------------------------------------------------
  // GPC tag helpers
  // -------------------------------------------------------------------------

  /** Short ID for tags (strips "GPC-" prefix) */
  get gpcShort(): string {
    return gpcShortId(this.gpcId);
  }

  /** The gpc:intro tag for this GPC */
  get introTag(): string {
    return gpcIntroTag(this.gpcId);
  }

  /** The gpc:expose tag for this GPC */
  get exposeTag(): string {
    return gpcExposeTag(this.gpcId);
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate the learner's interaction.
   *
   * Intros are always "correct" — completion is binary.
   * Tags both intro and expose so the hierarchy sees both satisfied.
   */
  public evaluate(_answer: Answer, _timeSpent: number): Evaluation {
    const performance: TaggedPerformance = {
      _global: 1,
      // Bookkeeping tags: counted, never graded (framework tag roles)
      [this.introTag]: null,
      [this.exposeTag]: null,
    };

    return {
      isCorrect: true,
      performance,
    };
  }

  protected isCorrect(_answer: Answer): boolean {
    return true; // Intros are always correct on completion
  }
}

export default GpcIntro;