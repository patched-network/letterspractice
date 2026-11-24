/**
 * WhoSaidThat - A question type for phoneme-to-grapheme identification
 * supporting both single letters AND digraphs as suspects.
 *
 * Extends the WhoSaidThat concept to include digraph suspects (sh, ch, th, etc.)
 * alongside single-letter suspects. Digraph suspects are gated behind
 * `concept:match:digraph` lesson completion.
 *
 * Features:
 * - Plays target phoneme audio
 * - Shows array of suspects (single letters AND/OR digraphs as LetterPeople)
 * - Incorrect guesses trigger the wrong suspect speaking its dominant phoneme
 * - Supports keyboard navigation (numbers 1-9, arrows, enter)
 * - Digraph suspects rendered as multi-char WordDisplay (two LetterPeople side-by-side)
 */

import { Question, ViewData, Answer } from "@vue-skuilder/courseware";
import { DataShape, FieldType, Status, type Evaluation, type TaggedPerformance } from "@vue-skuilder/common";
import { generateVibrancyRainbow } from "../letterpeople/util/color";
import { ArpabetPhoneme, toArpabet } from "../services/phonetics";
import { isVowelLetter, getLongVowelPhoneme, LONG_VOWEL_PHONEMES } from "../audio/letterToArpabet";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and WhoSaidThatView.vue.
import { gpcTag } from "@/services/tags";

// ============================================================================
// Digraph suspect definitions
// ============================================================================

/**
 * Known digraph suspects with their dominant phoneme.
 * These are the core teaching digraphs eligible for WST2 cards.
 */
export const DIGRAPH_SUSPECTS: ReadonlyArray<{ grapheme: string; phoneme: ArpabetPhoneme }> = [
  { grapheme: 'ch', phoneme: 'CH' },
  { grapheme: 'sh', phoneme: 'SH' },
  { grapheme: 'th', phoneme: 'TH' },  // voiceless (thin)
  { grapheme: 'ng', phoneme: 'NG' },
  { grapheme: 'ph', phoneme: 'F' },
  { grapheme: 'wh', phoneme: 'W' },
  { grapheme: 'ck', phoneme: 'K' },
];

/** Set of known digraph graphemes for quick lookup */
const DIGRAPH_GRAPHEME_SET = new Set(DIGRAPH_SUSPECTS.map(d => d.grapheme));

/** Map from digraph grapheme to its dominant phoneme */
const DIGRAPH_TO_PHONEME = new Map<string, ArpabetPhoneme>(
  DIGRAPH_SUSPECTS.map(d => [d.grapheme, d.phoneme])
);

// ============================================================================
// Data Shape
// ============================================================================

/**
 * Data shape for WhoSaidThat questions.
 * Validators accept both single letters and multi-char digraphs.
 */
export const WhoSaidThatDataShape: DataShape = {
  name: "WhoSaidThat" as any,
  fields: [
    {
      name: "targetPhoneme",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // ARPAbet phoneme code (e.g., 'B', 'AE', 'SH', 'CH')
          const isValid = /^[A-Z]{1,3}[012]?$/.test(val.toUpperCase());
          return isValid
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be a valid ARPAbet phoneme code",
              };
        },
        instructions: "ARPAbet phoneme code (e.g., B, AE, SH, CH)",
      },
    },
    {
      name: "correctLetter",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Accept single letters (a-z, A-Z) and digraphs (sh, ch, th, etc.)
          const isValid = /^[a-zA-Z]{1,3}$/.test(val);
          return isValid
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be 1-3 letters (e.g., 'b', 'sh', 'ch')" };
        },
        instructions: "Single letter or digraph (e.g., 'b', 'sh', 'ch')",
      },
    },
    {
      name: "gpcId",
      type: FieldType.STRING,
      validator: {
        test: (val: string) =>
          !val || /^[a-z_]+-[A-Z_]+$/.test(val)
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be a GPC short id (e.g. 'a_e-EY')" },
        instructions: "Optional. The graded GPC's short id (e.g. 'b-B', 'a_e-EY')",
      },
    },
    {
      name: "distractors",
      type: FieldType.STRING,
      validator: {
        test: (val: string) => {
          // Empty/missing distractors are valid — runtime selects them dynamically
          if (!val || val.trim() === "") {
            return { status: Status.ok, msg: "" };
          }
          // Comma-separated list of letters/digraphs
          const entries = val.split(",").map((l) => l.trim());
          const allValid = entries.every((l) => /^[a-zA-Z]{1,3}$/.test(l));
          return allValid && entries.length >= 1
            ? { status: Status.ok, msg: "" }
            : {
                status: Status.error,
                msg: "Must be comma-separated letters/digraphs (e.g., 'b,d,sh,ch')",
              };
        },
        instructions: 'Comma-separated distractor letters/digraphs (e.g., "b,d,sh"), or empty for auto-selection',
      },
    },
  ],
};

// ============================================================================
// Data Interface
// ============================================================================

/**
 * Question data structure
 */
export interface WhoSaidThatData {
  /** ARPAbet phoneme code for the target sound */
  targetPhoneme: string;
  /** The correct grapheme (letter or digraph) that makes this sound */
  correctLetter: string;
  /**
   * The graded GPC's short id (e.g. `a_e-EY`). Missing on cards deployed before
   * 2026-11-18; then the tag is built from letter + phoneme, which is wrong for
   * split digraphs (`a_e-EY` cards graded a bare `a-EY`).
   */
  gpcId?: string;
  /** Distractor graphemes (comma-separated string or array). Empty/missing = auto-select at runtime. */
  distractors?: string | string[];
}

// ============================================================================
// Suspect Interface
// ============================================================================

/**
 * Suspect data for each option (single letter or digraph).
 * The `letter` field holds the grapheme string — may be 1-3 chars.
 */
export interface Suspect {
  /** The grapheme (lowercase) — may be single letter or digraph */
  letter: string;
  /** Whether this is the correct answer */
  isCorrect: boolean;
  /** The dominant phoneme this grapheme makes */
  dominantPhoneme: ArpabetPhoneme;
  /** Display color for the LetterPerson(s) */
  color?: string;
  /** Whether this suspect is a digraph (multi-char) */
  isDigraph: boolean;
}

// ============================================================================
// Question Class
// ============================================================================

/**
 * WhoSaidThat question class
 *
 * Supports both single letters and digraphs as suspects.
 * Digraph inclusion is gated at the pipeline level via concept:match:digraph.
 */
export class WhoSaidThat extends Question {
  public static dataShapes: DataShape[] = [WhoSaidThatDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  public readonly targetPhoneme: ArpabetPhoneme;
  public readonly correctLetter: string;
  private readonly gpcId: string | undefined;
  public readonly suspects: Suspect[];
  /** True when card has no fixed distractors — view should select them dynamically */
  public readonly needsAutoDistractors: boolean;
  private readonly suspectColors: string[];

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as WhoSaidThatData;
    this.targetPhoneme = toArpabet(d.targetPhoneme);
    this.correctLetter = d.correctLetter; // Keep original case
    this.gpcId = d.gpcId || undefined;

    // Parse distractors — empty/missing means auto-select at runtime
    const rawDistractors = d.distractors;
    const hasDistractors = rawDistractors &&
      (Array.isArray(rawDistractors) ? rawDistractors.length > 0 : rawDistractors.trim() !== "");

    this.needsAutoDistractors = !hasDistractors;

    const distractorList = hasDistractors
      ? (Array.isArray(rawDistractors)
        ? rawDistractors
        : rawDistractors!.split(",").map((l) => l.trim()))
      : []; // Empty — view will populate

    // Build suspects array including correct grapheme
    const allGraphemes = [
      this.correctLetter,
      ...distractorList.filter((l) => l.toLowerCase() !== this.correctLetter.toLowerCase()),
    ];

    // Generate n evenly-spaced colors with random starting hue
    const randomStartHue = Math.random() * 360;
    this.suspectColors = generateVibrancyRainbow(
      allGraphemes.length,
      0.7,   // lightness
      0.15,  // chroma
      randomStartHue
    );

    // When the target is a long vowel sound, vowel distractors should also
    // speak their long sounds
    const targetIsLongVowel = LONG_VOWEL_PHONEMES.has(this.targetPhoneme);

    this.suspects = allGraphemes.map((grapheme, index) => ({
      letter: grapheme,
      isCorrect: grapheme.toLowerCase() === this.correctLetter.toLowerCase(),
      dominantPhoneme:
        targetIsLongVowel && grapheme.length === 1 && isVowelLetter(grapheme)
          ? getLongVowelPhoneme(grapheme)
          : this.getDominantPhoneme(grapheme),
      color: this.suspectColors[index],
      isDigraph: grapheme.length > 1,
    }));
  }

  public dataShapes(): DataShape[] {
    return WhoSaidThat.dataShapes;
  }

  public views() {
    return WhoSaidThat.views;
  }

  /**
   * Get the dominant phoneme for a grapheme (single letter or digraph).
   * Checks digraph map first, then falls back to single-letter map.
   */
  private getDominantPhoneme(grapheme: string): ArpabetPhoneme {
    const lower = grapheme.toLowerCase();

    // Check digraph map first
    const digraphPhoneme = DIGRAPH_TO_PHONEME.get(lower);
    if (digraphPhoneme) return digraphPhoneme;

    // Fall back to single-letter mapping
    const LETTER_TO_PHONEME: Record<string, ArpabetPhoneme> = {
      a: "AE",
      b: "B",
      c: "K",
      d: "D",
      e: "EH",
      f: "F",
      g: "G",
      h: "HH",
      i: "IH",
      j: "JH",
      k: "K",
      l: "L",
      m: "M",
      n: "N",
      o: "AA",
      p: "P",
      q: "K",
      r: "R",
      s: "S",
      t: "T",
      u: "AH",
      v: "V",
      w: "W",
      x: "K",
      y: "Y",
      z: "Z",
    };
    return LETTER_TO_PHONEME[lower] || grapheme.toUpperCase();
  }

  /**
   * Graphemes that share a phoneme and must never be distractors for each other.
   * Includes both single-letter and digraph exclusions.
   */
  private static readonly SAME_PHONEME_EXCLUSIONS: Record<string, string[]> = {
    // /K/ group: c, k, q, ck all map to /K/ as dominant phoneme
    c: ['k', 'q', 'ck'],
    k: ['c', 'q', 'ck'],
    q: ['c', 'k', 'ck'],
    ck: ['c', 'k', 'q'],
    // /Z/ group
    z: ['s', 'x'],
    s: ['z'],
    x: ['z'],
    // /F/ group: f and ph both map to /F/
    f: ['ph'],
    ph: ['f'],
    // /W/ group: w and wh both map to /W/
    w: ['wh'],
    wh: ['w'],
    // /JH/ group: j and g (soft) both map to /JH/.
    // Blunt ban — hard-g vs j would be a valid question but the map can't
    // distinguish target phoneme, so we accept the small loss.
    j: ['g'],
    g: ['j'],
  };

  /**
   * Build suspects with auto-selected distractors for distractor-free cards.
   * Pool includes all 26 lowercase letters plus any unlocked digraphs.
   *
   * @param modifyDifficulty - user ELO - card ELO gap
   * @param unlockedDigraphs - digraph graphemes the user has completed intros for (e.g. ['sh','ch'])
   */
  public buildAutoSuspects(modifyDifficulty: number, unlockedDigraphs: string[] = []): Suspect[] {
    // Scale distractor count by difficulty gap (same thresholds as fillIn.vue)
    let distractorCount: number;
    if (modifyDifficulty < -200) {
      distractorCount = 1;
    } else if (modifyDifficulty < -150) {
      distractorCount = 2;
    } else if (modifyDifficulty < -100) {
      distractorCount = 3;
    } else if (modifyDifficulty < -50) {
      distractorCount = 4;
    } else {
      distractorCount = 5;
    }

    // Build pool: all 26 letters minus correct grapheme and same-phoneme exclusions
    const excluded = new Set([
      this.correctLetter.toLowerCase(),
      ...(WhoSaidThat.SAME_PHONEME_EXCLUSIONS[this.correctLetter.toLowerCase()] ?? []),
    ]);

    const pool: string[] = 'abcdefghijklmnopqrstuvwxyz'
      .split('')
      .filter((l) => !excluded.has(l));

    // Add unlocked digraphs to the pool
    const unlockedSet = new Set(unlockedDigraphs.map((g) => g.toLowerCase()));
    for (const d of DIGRAPH_SUSPECTS) {
      if (unlockedSet.has(d.grapheme) && !excluded.has(d.grapheme)) {
        pool.push(d.grapheme);
      }
    }

    // Fisher-Yates shuffle the pool, then take distractorCount
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, distractorCount);

    // When the target is a long vowel, vowel distractors speak long sounds
    const targetIsLongVowel = LONG_VOWEL_PHONEMES.has(this.targetPhoneme);

    const allGraphemes = [this.correctLetter, ...selected];
    const colors = generateVibrancyRainbow(
      allGraphemes.length, 0.7, 0.15, Math.random() * 360,
    );

    return allGraphemes.map((grapheme, index) => ({
      letter: grapheme,
      isCorrect: grapheme.toLowerCase() === this.correctLetter.toLowerCase(),
      dominantPhoneme:
        targetIsLongVowel && grapheme.length === 1 && isVowelLetter(grapheme)
          ? getLongVowelPhoneme(grapheme)
          : this.getDominantPhoneme(grapheme),
      color: colors[index],
      isDigraph: grapheme.length > 1,
    }));
  }

  /**
   * Shuffle suspects for display (Fisher-Yates)
   */
  public getShuffledSuspects(): Suspect[] {
    const shuffled = [...this.suspects];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Check if a grapheme is the correct answer
   */
  public isCorrectLetter(grapheme: string): boolean {
    return grapheme.toLowerCase() === this.correctLetter.toLowerCase();
  }

  /**
   * Get the suspect data for a grapheme
   */
  public getSuspect(grapheme: string): Suspect | undefined {
    return this.suspects.find((s) => s.letter.toLowerCase() === grapheme.toLowerCase());
  }

  /**
   * Whether a grapheme string represents a known digraph
   */
  public static isDigraph(grapheme: string): boolean {
    return DIGRAPH_GRAPHEME_SET.has(grapheme.toLowerCase());
  }

  /**
   * Build the GPC exercise tag for the target grapheme+phoneme.
   */
  private get targetGpcTag(): string {
    return gpcTag('exercise', this.gpcId ?? `${this.correctLetter.toLowerCase()}-${this.targetPhoneme}`)
  }

  public evaluate(answer: Answer, timeSpent: number): Evaluation {
    const correct = this.isCorrect(answer);

    let globalScore = 0;
    if (correct) {
      const FAST_MS = 5000;
      const SLOW_MS = 15000;
      // Softened 0.6 → 0.8 (2026-09-13). Since fw #1202 a score only sizes the ELO gain (common `eloActual`) —
      // so the floor sets what speed is worth.
      const MIN_SCORE = 0.8;
      const clamped = Math.max(FAST_MS, Math.min(timeSpent, SLOW_MS));
      globalScore = 1 - (1 - MIN_SCORE) * ((clamped - FAST_MS) / (SLOW_MS - FAST_MS));
    }

    const performance: TaggedPerformance = {
      _global: globalScore,
      [this.targetGpcTag]: globalScore,
    };

    // On incorrect, also grade the selected distractor's GPC: a graded
    // confusion signal. Picking `m` for an F sound is a miss on both f-F and
    // m-M.
    if (!correct) {
      const selectedGrapheme = String(answer).toLowerCase().trim();
      const suspect = this.suspects.find(
        (s) => s.letter.toLowerCase() === selectedGrapheme,
      );
      if (suspect) {
        const letter = suspect.letter.toLowerCase();
        // A vowel speaking its long sound is graded as its split digraph (a → a_e-EY),
        // as the long-vowel targets are; a bare `a-EY` is no catalogue GPC.
        const grapheme =
          LONG_VOWEL_PHONEMES.has(suspect.dominantPhoneme) && letter.length === 1 && isVowelLetter(letter)
            ? `${letter}_e`
            : letter;
        const distractorTag = gpcTag('exercise', `${grapheme}-${suspect.dominantPhoneme}`);
        performance[distractorTag] = globalScore;
      }
    }

    return { isCorrect: correct, performance };
  }

  protected isCorrect(answer: Answer): boolean {
    return String(answer).toLowerCase().trim() === this.correctLetter.toLowerCase();
  }
}

export default WhoSaidThat;