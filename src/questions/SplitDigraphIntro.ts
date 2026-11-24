/**
 * SplitDigraphIntro - A question type for introducing split-digraph GPCs
 *
 * A one-time introductory exercise for a magic-e (split-digraph) GPC, e.g.:
 *   a_e → /EY/ (cake, name, gate)
 *   i_e → /AY/ (mice, hide, pine)
 *   o_e → /OW/ (vote, hope, note)
 *   e_e → /IY/ (here, these)
 *   u_e → /UW/ (dude, cube, fuse)
 *
 * The learner meets a two-character display: the active vowel (speaking) and
 * the silent 'e' (closed-mouthed, gazing at the vowel). Together they
 * demonstrate the magic-e partnership.
 *
 * Completion unlocks exercise-level cards (WS, ML, SQ) for that GPC.
 *
 * This is NOT a drill — it's a gate. The exercise loop handles reinforcement.
 *
 * Interaction flow:
 *   Phase 1: Digraph Meet — spacebar press to hear the long-vowel phoneme
 *   Phase 2: Exemplar Words — 2-3 words auto-play (whole word → phoneme chunk)
 *   Phase 3: Celebration — keyboard reveal, press to complete
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
import { toArpabet, type ArpabetPhoneme } from "../services/phonetics/arpabet";
import { gpcShortId, gpcIntroTag, gpcExposeTag } from "@/services/tags";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and SplitDigraphIntroView.vue.

// ============================================================================
// Data Shape
// ============================================================================

export const SplitDigraphIntroDataShape: DataShape = {
  name: "SplitDigraphIntro" as any,
  fields: [
    {
      name: "gpcId",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Expect format like "GPC-a_e-EY", "GPC-i_e-AY", "GPC-o_e-OW"
          const isValid = /^GPC-[a-z]+_[a-z]-[A-Z_]{1,5}$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: 'Must be a valid split-digraph GPC catalogue ID (e.g., "GPC-a_e-EY")',
              };
        },
        instructions: 'Split-digraph GPC catalogue ID (e.g., "GPC-a_e-EY", "GPC-i_e-AY")',
      },
    },
    {
      name: "vowel",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          const isValid = /^[aeiou]$/.test(val.toLowerCase());
          return isValid
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be a single vowel letter (a, e, i, o, u)" };
        },
        instructions: "Active vowel letter (lowercase), e.g., 'a', 'i', 'o'",
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
        instructions: 'ARPAbet long-vowel phoneme (e.g., "EY", "AY", "OW", "IY", "UW")',
      },
    },
    {
      name: "words",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          if (!val || val.trim() === "") {
            return {
              status: Status.error,
              msg: "At least one exemplar word is required",
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
          'Comma-separated exemplar words (e.g., "cake,name,gate"). 2-3 words recommended.',
      },
    },
  ],
};

// ============================================================================
// Data Interface
// ============================================================================

/**
 * Data structure for SplitDigraphIntro cards.
 * Fields may arrive as comma-separated strings (from CouchDB) or arrays.
 */
export interface SplitDigraphIntroData {
  /** Target GPC catalogue ID, e.g., "GPC-a_e-EY" */
  gpcId: string;
  /** Active vowel letter (lowercase), e.g., "a" */
  vowel: string;
  /** ARPAbet long-vowel phoneme to play, e.g., "EY" */
  phoneme: string;
  /** Exemplar words demonstrating the split-digraph pattern */
  words: string | string[];
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
 * SplitDigraphIntro question class
 *
 * Always evaluates as correct (binary gate, not a drill).
 * Tags both `gpc:intro` and `gpc:expose` on completion.
 */
export class SplitDigraphIntro extends Question {
  public static dataShapes: DataShape[] = [SplitDigraphIntroDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  /** Target GPC catalogue ID (e.g., "GPC-a_e-EY") */
  public readonly gpcId: string;
  /** Active vowel letter (lowercase, single char), e.g., "a" */
  public readonly vowel: string;
  /** ARPAbet long-vowel phoneme */
  public readonly phoneme: ArpabetPhoneme;
  /** Exemplar words demonstrating the split-digraph pattern */
  public readonly words: string[];
  /** Color for the intro grapheme display */
  public readonly letterColor: string;
  /** Colors for each exemplar word */
  public readonly wordColors: string[];

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as SplitDigraphIntroData;
    this.gpcId = d.gpcId;
    this.vowel = d.vowel.toLowerCase();
    this.phoneme = toArpabet(d.phoneme);
    this.words = parseWordList(d.words);

    const randomStartHue = Math.random() * 360;
    const allColors = generateVibrancyRainbow(
      Math.max(this.words.length + 1, 2), // +1 for the grapheme display
      0.7,  // lightness
      0.15, // chroma (pastel, Tier 2)
      randomStartHue
    );

    this.letterColor = allColors[0];
    this.wordColors = allColors.slice(1);
  }

  public dataShapes(): DataShape[] {
    return SplitDigraphIntro.dataShapes;
  }

  public views() {
    return SplitDigraphIntro.views;
  }

  // -------------------------------------------------------------------------
  // Word helpers
  // -------------------------------------------------------------------------

  /**
   * Find the index of the active vowel within a split-digraph word.
   * Searches from left, skipping the final position (which is the silent 'e').
   */
  public getVowelIndex(word: string): number {
    const lower = word.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) {
      if (lower[i] === this.vowel) return i;
    }
    // Fallback: first occurrence anywhere
    const idx = lower.indexOf(this.vowel);
    return idx >= 0 ? idx : 0;
  }

  /**
   * The silent 'e' is always the final character of a split-digraph word.
   */
  public getSilentEIndex(word: string): number {
    return word.length - 1;
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

export default SplitDigraphIntro;
