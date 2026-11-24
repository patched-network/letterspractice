/**
 * SightWordIntro - A question type for introducing a sight word
 *
 * A one-time introduction to a word that doesn't sound the way it's spelled
 * (said, was, have), after the sight-words lesson. The word arrives and the
 * learner steps through it a sound at a time; the letter that bends the rule
 * surprises them, and the letters around it show it's misbehaving (an
 * onlooker does, when every letter misbehaves). Then the whole word.
 *
 * Completion puts the word's exposure cards (follow-ups) into rotation.
 *
 * This is NOT a drill — it's a gate. The exercise loop handles reinforcement.
 * No ELO scoring — binary completion (done / not done).
 *
 * Design: agent/lessons-audit/b.3.sight-words-todo.md §4.
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
import { getPhonetics, type WordPhonetics } from "../services/phonetics";
import { gpcIntroTag, gpcExposeTag, sightWordGpcId } from "@/services/tags";
import { planSightWordIntro, type SightWordIntroPlan } from "./sightWordIntroPlan";
// View import + assignment lives in `src/questions/index.ts` (late-binding)
// to avoid circular dep between this file and SightWordIntroView.vue.

// ============================================================================
// Data Shape
// ============================================================================

export const SightWordIntroDataShape: DataShape = {
  name: "SightWordIntro" as any,
  fields: [
    {
      name: "gpcId",
      type: FieldType.STRING,
      validator: {
        test: (val: string) =>
          /^GPC-WORD-[a-z]+$/.test(val)
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: 'Must be a sight-word GPC id (e.g., "GPC-WORD-said")' },
        instructions: 'Sight-word GPC catalogue ID (e.g., "GPC-WORD-said")',
      },
    },
    {
      name: "word",
      type: FieldType.STRING,
      validator: {
        test: (val: string) =>
          /^[a-z]+$/.test(val)
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be a lowercase word" },
        instructions: 'The sight word (e.g., "said")',
      },
    },
    {
      name: "family",
      type: FieldType.STRING,
      validator: {
        test: (val: string) =>
          !val || /^[a-z]+(\s+[a-z]+)*$/.test(val)
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be space-separated lowercase words" },
        instructions: 'Words introduced along with this one, sharing its odd part (e.g., "could should" for "would")',
      },
    },
    {
      name: "followUp",
      type: FieldType.STRING,
      validator: {
        test: (val: string) =>
          !val || /^[a-z0-9_,-]+(\s+[a-z0-9_,-]+)*$/i.test(val)
            ? { status: Status.ok, msg: "" }
            : { status: Status.error, msg: "Must be space-separated card ids" },
        instructions: 'Exposure card id(s) to put into rotation on completion, space-separated (e.g., "c-ws-said-core")',
      },
    },
  ],
};

// ============================================================================
// Data Interface
// ============================================================================

export interface SightWordIntroData {
  /** The sight word's GPC, e.g. "GPC-WORD-said" */
  gpcId: string;
  /** The word, e.g. "said" */
  word: string;
  /** Its family, introduced with it (space-separated, or an array): "could should" for "would" */
  family?: string | string[];
  /**
   * Follow-up exposure card ids, space-separated (ML ids carry commas:
   * `c-ml-said-1,2`), or an array
   */
  followUp?: string | string[];
}

function parseList(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : raw.split(/\s+/);
  return items.map((s) => s.trim()).filter(Boolean);
}

// ============================================================================
// Question Class
// ============================================================================

/**
 * Always evaluates as correct (binary gate, not a drill). Credits the word's
 * `gpc:intro` and `gpc:expose` (the card bears only intro tags: an expose tag
 * would lock it behind itself), and its family's `gpc:intro` (they're
 * released, not staged; their exposure comes from their cards).
 */
export class SightWordIntro extends Question {
  public static dataShapes: DataShape[] = [SightWordIntroDataShape];
  // Assigned at runtime in `src/questions/index.ts` to avoid circular import.
  public static views: any[] = [];

  public readonly gpcId: string;
  public readonly word: string;
  /** Words introduced with this one, sharing its odd part (would's could, should): credited, not staged */
  public readonly family: string[];
  public readonly followUp: string[];
  /** The word's phonetic index entry (null: no recording, nothing to step). */
  public readonly phonetics: WordPhonetics | null;
  /** Steps, who misbehaves on each, who minds. */
  public readonly plan: SightWordIntroPlan;
  /** One colour per letter, hues spread round the wheel. */
  public readonly letterColors: string[];

  constructor(data: ViewData[]) {
    super(data);

    const d = data[0] as unknown as SightWordIntroData;
    this.gpcId = d.gpcId;
    this.word = d.word.toLowerCase();
    this.family = parseList(d.family).map((w) => w.toLowerCase());
    this.followUp = parseList(d.followUp);
    this.phonetics = getPhonetics(this.word);
    this.plan = planSightWordIntro(this.word, this.phonetics?.chunks ?? []);
    this.letterColors = generateVibrancyRainbow(
      Math.max(this.word.length, 2),
      0.7, // lightness
      0.15, // chroma (pastel, Tier 2)
      Math.random() * 360,
    );
  }

  public dataShapes(): DataShape[] {
    return SightWordIntro.dataShapes;
  }

  public views() {
    return SightWordIntro.views;
  }

  /** The gpc:intro tag for this word */
  get introTag(): string {
    return gpcIntroTag(this.gpcId);
  }

  /** The gpc:expose tag for this word */
  get exposeTag(): string {
    return gpcExposeTag(this.gpcId);
  }

  /** The family's GPCs (GPC-WORD-could, …) */
  get familyGpcIds(): string[] {
    return this.family.map((w) => sightWordGpcId(w)).filter((g): g is string => !!g);
  }

  public evaluate(_answer: Answer, _timeSpent: number): Evaluation {
    const performance: TaggedPerformance = {
      _global: 1,
      // Bookkeeping tags: counted, never graded (framework tag roles)
      [this.introTag]: null,
      [this.exposeTag]: null,
    };
    for (const gpcId of this.familyGpcIds) performance[gpcIntroTag(gpcId)] = null;
    return { isCorrect: true, performance };
  }

  protected isCorrect(_answer: Answer): boolean {
    return true; // Intros are always correct on completion
  }
}

export default SightWordIntro;
