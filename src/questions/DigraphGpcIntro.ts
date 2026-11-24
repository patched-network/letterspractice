/**
 * DigraphGpcIntro - A question type for introducing digraph grapheme-phoneme correspondences
 *
 * A one-time introductory exercise for a digraph GPC (e.g., sh→/SH/, ch→/CH/, th→/TH/).
 * The learner meets the digraph pair, hears its sound, and sees/hears it in word context.
 * Completion unlocks exercise-level cards (WS, ML, SQ) for that digraph GPC.
 *
 * This is NOT a drill — it's a gate. The exercise loop handles reinforcement.
 *
 * Interaction flow:
 *   Phase 1: Digraph Meet — spacebar press to hear the phoneme
 *   Phase 2: Onset Words — 2-step per word (phoneme, then full word)
 *   Phase 3: Coda Words — same pattern, optional (skipped if empty)
 *
 * No medial/core phase — digraphs rarely have a pedagogically useful medial position
 * at the intro stage.
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
import {
  gpcIntroTag,
  gpcExposeTag,
  gpcShortId,
  whoSaidThatCardId,
  type DigraphGpcIntroCardId,
  type ExposeTag,
  type GpcShortId,
  type IntroTag,
} from "@/services/tags";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and DigraphGpcIntroView.vue.

// ============================================================================
// Data Shape
// ============================================================================

export const DigraphGpcIntroDataShape: DataShape = {
  name: "DigraphGpcIntro" as any,
  fields: [
    {
      name: "gpcId",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Expect format like "GPC-sh-SH", "GPC-ch-CH", "GPC-th-TH", "GPC-qu-K_W"
          const isValid = /^GPC-[a-zA-Z]{2,3}-[A-Z_]{1,5}$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: 'Must be a valid digraph GPC catalogue ID (e.g., "GPC-sh-SH")',
              };
        },
        instructions: 'Digraph GPC catalogue ID (e.g., "GPC-sh-SH", "GPC-ch-CH")',
      },
    },
    {
      name: "grapheme",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const isValid = /^[a-z]{2,3}$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be a 2-3 character lowercase digraph (e.g., 'sh', 'ch', 'th')" };
        },
        instructions: "Display grapheme (lowercase), e.g., 'sh', 'ch'",
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
        instructions: 'ARPAbet phoneme code (e.g., "SH", "CH", "TH")',
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
          'Comma-separated onset words (e.g., "ship,shop,shell"). 2-3 words recommended.',
      },
    },
    {
      name: "codaWords",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Empty is valid — some digraphs don't appear in coda position
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
          'Comma-separated coda words, or empty (e.g., "fish,wish"). 0-2 words recommended.',
      },
    },
  ],
};

// ============================================================================
// Data Interface
// ============================================================================

/**
 * Data structure for DigraphGpcIntro cards.
 * Fields may arrive as comma-separated strings (from CouchDB) or arrays.
 */
export interface DigraphGpcIntroData {
  /** Target GPC catalogue ID, e.g., "GPC-sh-SH" */
  gpcId: string;
  /** Display grapheme (lowercase), e.g., "sh" */
  grapheme: string;
  /** ARPAbet phoneme to play, e.g., "SH" */
  phoneme: string;
  /** Words starting with this digraph (have audio, fully decodable) */
  onsetWords: string | string[];
  /** Words ending with this digraph (have audio, fully decodable). May be empty. */
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

/** Number of spacebar presses required in Phase 1 (Digraph Meet) */
export const PHASE1_PRESS_COUNT = 1;

/**
 * DigraphGpcIntro question class
 *
 * Always evaluates as correct (binary gate, not a drill).
 * Tags both `gpc:intro` and `gpc:expose` on completion.
 */
export class DigraphGpcIntro extends Question {
  public static dataShapes: DataShape[] = [DigraphGpcIntroDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  /** Target GPC catalogue ID (e.g., "GPC-sh-SH") */
  public readonly gpcId: string;
  /** Display grapheme (lowercase, multi-char) e.g., "sh" */
  public readonly grapheme: string;
  /** Number of characters in the grapheme */
  public readonly graphemeLength: number;
  /** ARPAbet phoneme (or compound audio key, e.g. K_W for "qu") */
  public readonly phoneme: PhonemeAudioKey;
  /** Words starting with the target digraph */
  public readonly onsetWords: string[];
  /** Words ending with the target digraph (may be empty) */
  public readonly codaWords: string[];
  /** Whether this intro has a coda phase */
  public readonly hasCodaPhase: boolean;
  /** Colors for onset words */
  public readonly onsetColors: string[];
  /** Colors for coda words */
  public readonly codaColors: string[];
  /** Color for the intro digraph display */
  public readonly letterColor: string;

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as DigraphGpcIntroData;
    this.gpcId = d.gpcId;
    this.grapheme = d.grapheme.toLowerCase();
    this.graphemeLength = this.grapheme.length;
    this.phoneme = toPhonemeAudioKey(d.phoneme);
    this.onsetWords = parseWordList(d.onsetWords);
    this.codaWords = parseWordList(d.codaWords);
    this.hasCodaPhase = this.codaWords.length > 0;

    // Generate stable colors for this instance
    const randomStartHue = Math.random() * 360;
    const totalWords = this.onsetWords.length + this.codaWords.length;
    const allColors = generateVibrancyRainbow(
      Math.max(totalWords + 1, 2), // +1 for the digraph itself
      0.7, // lightness
      0.15, // chroma (pastel, Tier 2)
      randomStartHue
    );

    this.letterColor = allColors[0];
    const onsetEnd = 1 + this.onsetWords.length;
    this.onsetColors = allColors.slice(1, onsetEnd);
    this.codaColors = allColors.slice(onsetEnd);
  }

  public dataShapes(): DataShape[] {
    return DigraphGpcIntro.dataShapes;
  }

  public views() {
    return DigraphGpcIntro.views;
  }

  // -------------------------------------------------------------------------
  // Word helpers
  // -------------------------------------------------------------------------

  /**
   * Total number of words across both phases
   */
  get totalWords(): number {
    return this.onsetWords.length + this.codaWords.length;
  }

  /**
   * Get the starting index of the target digraph in an onset word.
   * For onset words, the digraph is always at index 0.
   */
  public getOnsetGraphemeIndex(_word: string): number {
    return 0;
  }

  /**
   * Get the starting index of the target digraph in a coda word.
   * Finds the last occurrence of the grapheme in the word.
   */
  public getCodaGraphemeIndex(word: string): number {
    const lower = word.toLowerCase();
    const lastIndex = lower.lastIndexOf(this.grapheme);
    // Fallback to end of word minus grapheme length if not found (shouldn't happen with valid data)
    return lastIndex >= 0 ? lastIndex : Math.max(0, word.length - this.graphemeLength);
  }

  // -------------------------------------------------------------------------
  // GPC tag helpers
  // -------------------------------------------------------------------------

  /** Short ID for tags/card IDs (strips "GPC-" prefix) */
  get gpcShort(): GpcShortId {
    return gpcShortId(this.gpcId);
  }

  /** The gpc:intro tag for this GPC */
  get introTag(): IntroTag {
    return gpcIntroTag(this.gpcId);
  }

  /** The gpc:expose tag for this GPC */
  get exposeTag(): ExposeTag {
    return gpcExposeTag(this.gpcId);
  }

  /** The corresponding per-GPC WhoSaidThat follow-up card ID */
  get followUpWhoSaidThatCardId(): DigraphGpcIntroCardId {
    return whoSaidThatCardId(this.gpcId) as unknown as DigraphGpcIntroCardId;
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

export default DigraphGpcIntro;