/**
 * The live demos on /exercises: for each exercise, the real question view, the
 * cards it cycles through (samples), and the help levels its toggle offers.
 *
 * Samples are real card shapes (the same `data` the pipeline writes), on words
 * that have recorded audio. Levels map onto what the app itself varies:
 *   - WST: fixed look-alike suspect (a focus card) vs. suspects drawn at
 *     runtime (WhoSaidThat.buildAutoSuspects at a rating gap of 0: five);
 *   - WS: the rating gap (`modifyDifficulty`), which sets how many near-misses
 *     WordSelection.buildOptions shows;
 *   - Spelling: none. Prod serves free spelling only (level 3).
 * ML has no toggle: its samples run from one gap to a letter team.
 */
import type { Component } from "vue";
import type { ViewData } from "@vue-skuilder/common";
import WhoSaidThatView from "@/questions/WhoSaidThatView.vue";
import WordSelectionView from "@/questions/WordSelectionView.vue";
import MissingLettersView from "@/questions/MissingLettersView.vue";
import SpellingQuestionView from "@/questions/SpellingQuestionView.vue";
import type { ExerciseId } from "@/content/exercisesCopy";

export interface DemoLevel {
    label: string;
}

export interface ExerciseDemo<S = Record<string, string>> {
    view: Component;
    samples: S[];
    levels?: DemoLevel[];
    /** Index into levels shown first */
    defaultLevel?: number;
    /** The card's data, for this sample at this level */
    data(sample: S, level: number): ViewData[];
    /** Extra props for the view (beyond data + preview) */
    props?(sample: S, level: number): Record<string, unknown>;
    /** The word whose keys a learner has when it comes within reach; null: the view brings its own keys */
    keysWord?(sample: S): string | null;
}

const asData = (d: object) => [d] as unknown as ViewData[];

type WstSample = { targetPhoneme: string; correctLetter: string; lookAlike: string };
const wst: ExerciseDemo<WstSample> = {
    view: WhoSaidThatView,
    samples: [
        { targetPhoneme: "M", correctLetter: "m", lookAlike: "n" },
        // Second on purpose: "Another" shows a letter team early
        { targetPhoneme: "SH", correctLetter: "sh", lookAlike: "ch" },
        { targetPhoneme: "F", correctLetter: "f", lookAlike: "v" },
        { targetPhoneme: "P", correctLetter: "p", lookAlike: "b" },
        { targetPhoneme: "AE", correctLetter: "a", lookAlike: "o" },
    ],
    levels: [{ label: "Fewer suspects" }, { label: "More suspects" }],
    defaultLevel: 0,
    // Level 1: no distractors on the card, so the view draws them (as most cards do)
    data: (s, level) =>
        asData({
            targetPhoneme: s.targetPhoneme,
            correctLetter: s.correctLetter,
            distractors: level === 0 ? s.lookAlike : "",
        }),
    props: () => ({ modifyDifficulty: 0 }),
};

type WsSample = { target: string; distractors: string };
// Rating gaps that land on 1 and 4 near-misses (WordSelection.buildOptions)
const WS_GAPS = [-100, 60];
const ws: ExerciseDemo<WsSample> = {
    view: WordSelectionView,
    samples: [
        { target: "ship", distractors: "chip,shop,tip" },
        { target: "bed", distractors: "bad,red,bet,bud" },
        { target: "pin", distractors: "pen,pan,bin,pit,tin" },
        { target: "hot", distractors: "hat,pot,dot,hit" },
        { target: "cat", distractors: "cap,hat,cut,bat" },
    ],
    levels: [{ label: "One near-miss" }, { label: "A crowd" }],
    defaultLevel: 0,
    data: (s) => asData({ ...s, instruction: "" }),
    props: (_s, level) => ({ modifyDifficulty: WS_GAPS[level] }),
};

type MlSample = { word: string; blanks: string };
const ml: ExerciseDemo<MlSample> = {
    view: MissingLettersView,
    samples: [
        { word: "cat", blanks: "1" }, // c_t
        { word: "hot", blanks: "0" }, // _ot
        { word: "fish", blanks: "2,3" }, // fi__ (sh)
        { word: "bed", blanks: "0,2" }, // _e_
    ],
    data: (s) => asData(s),
    keysWord: (s) => s.word,
};

type SpellingSample = { word: string };
const spelling: ExerciseDemo<SpellingSample> = {
    view: SpellingQuestionView,
    samples: [{ word: "cat" }, { word: "ship" }, { word: "fish" }, { word: "hot" }, { word: "bed" }],
    data: (s) => asData(s),
    // Free spelling only: the one level the app serves (levels 0–2 exist in
    // the view but aren't surfaced; Fill in the Blanks is the in-between)
    props: () => ({ initialLevel: 3 }),
    keysWord: (s) => s.word,
};

export const EXERCISE_DEMOS: Record<ExerciseId, ExerciseDemo<any>> = { wst, ws, ml, spelling };
