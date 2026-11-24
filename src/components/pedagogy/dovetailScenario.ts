/**
 * The dovetail widget's scenario: seven candidate exercises and how much each
 * rival likes each one. SYNTHETIC, tuned by hand to tell the story:
 *
 *   - Curriculum is the pull forward; the rest hold it back. Alone, it
 *     crowns dad (d is next in line) and all but rejects ship (sh not yet
 *     introduced);
 *   - each other rival alone crowns its own card (Spaced Repetition → sat,
 *     Difficulty → map);
 *   - stepping through, the favourite changes hands dad → sat → fin;
 *   - all together, the winner is fin, nobody's favourite and nobody's
 *     problem: the card that dovetails;
 *   - stamp (all known letters, but two blends) sinks when Difficulty
 *     switches on: far above where the child is.
 *
 * The learner: knows s, a, t, m, i, p, n, f well; met b yesterday; d is next
 * in line; sat and fin are due for review.
 *
 * Factors are multipliers centred on 1, as in the real pipeline: boosts above
 * (Curriculum weights what it has opened ×0.75–1.25, like relativePriority;
 * Spaced Repetition lifts due reviews, more when overdue, like the backlog
 * regulator, and leaves new cards at ×1), objections below (Interference,
 * Difficulty), ×0.01 a rejection (Curriculum's gate, like LessonGateFilter). Every card starts at 1.0; its
 * score is the product of the switched-on rivals' factors. Numbers are
 * illustrative, not from a run.
 *
 * Shape note: `rivals` keys are rival ids (rivals.ts; the technique ids in
 * pedagogyCopy), and `focus` names the grapheme the exercise is about, so a
 * recorded pipeline run (cardId, per-strategy multipliers; see /showHN's
 * sessionMonitor) could later be adapted into this shape.
 */

import type { RivalId } from "./rivals";

export type { RivalId };

export interface Rival {
    id: RivalId;
    /** Short chip label (the technique's full name lives in pedagogyCopy). */
    label: string;
}

/** In the order the step-through adds them (also rivals.ts' validated colour order). */
export const RIVALS: Rival[] = [
    // The source of new material, all of it: opens new things (new GPCs, new
    // combinations of ones in rotation), weights them by use (×0.75–1.25, as
    // relativePriority), and gates the rest: a card that uses a GPC not yet
    // introduced is all but rejected (×0.01, as LessonGateFilter; not zero,
    // which can deadlock a session with nothing left). First, as the pull
    // forward the others hold back.
    { id: "curriculum", label: "Curriculum" },
    { id: "srs", label: "Spaced Repetition" },
    { id: "interference", label: "Interference" },
    // Progressive Overload's rating match, both ways: too easy and too hard.
    { id: "overload", label: "Difficulty" },
    { id: "procedural", label: "Procedural" },
];

export type ExerciseKind = "spell" | "missing" | "who-said" | "pick";

export const KIND_LABEL: Record<ExerciseKind, string> = {
    spell: "Spell it",
    missing: "Fill the gap",
    "who-said": "Who said that?",
    pick: "Pick the word",
};

export const KIND_ICON: Record<ExerciseKind, string> = {
    spell: "mdi-keyboard-outline",
    missing: "mdi-form-textbox",
    "who-said": "mdi-ear-hearing",
    pick: "mdi-gesture-tap",
};

export interface Candidate {
    id: string;
    kind: ExerciseKind;
    word: string;
    /** The grapheme the exercise is about; highlighted in the word. */
    focus: string;
    /** Each rival's multiplier for this card: 1 neutral, above a boost, below an objection, near 0 (×0.01) a rejection. */
    rivals: Record<RivalId, number>;
    /** Why a rival boosted or objected (shown when it's the card's strongest voice). */
    notes: Partial<Record<RivalId, string>>;
}

export const CANDIDATES: Candidate[] = [
    {
        id: "dad",
        kind: "spell",
        word: "dad",
        focus: "d",
        rivals: { curriculum: 1.25, srs: 1, interference: 0.15, overload: 0.9, procedural: 1 },
        notes: {
            curriculum: "`d` is next in line, and much used",
            interference: "`d` looks like `b`, and `b` is still new",
        },
    },
    {
        id: "sat",
        kind: "spell",
        word: "sat",
        focus: "s",
        rivals: { curriculum: 0.8, srs: 1.6, interference: 1, overload: 0.35, procedural: 1 },
        notes: {
            srs: "overdue for review",
            overload: "too easy: well below where your child is",
        },
    },
    {
        id: "bib",
        kind: "missing",
        word: "bib",
        focus: "b",
        rivals: { curriculum: 1.1, srs: 1, interference: 0.9, overload: 0.9, procedural: 0.85 },
        notes: {},
    },
    {
        id: "fin",
        kind: "who-said",
        word: "fin",
        focus: "f",
        rivals: { curriculum: 0.95, srs: 1.3, interference: 1, overload: 0.85, procedural: 1 },
        notes: {
            srs: "due for review",
        },
    },
    {
        id: "ship",
        kind: "spell",
        word: "ship",
        focus: "sh",
        rivals: { curriculum: 0.01, srs: 1, interference: 1, overload: 0.9, procedural: 1 },
        notes: {
            curriculum: "needs `sh`, which the curriculum hasn't introduced yet",
        },
    },
    {
        id: "stamp",
        kind: "spell",
        word: "stamp",
        focus: "st",
        rivals: { curriculum: 1.1, srs: 1, interference: 1, overload: 0.2, procedural: 1 },
        notes: {
            overload: "two blends in five letters: far above where your child is",
        },
    },
    {
        id: "map",
        kind: "pick",
        word: "map",
        focus: "a",
        rivals: { curriculum: 0.85, srs: 1.15, interference: 0.9, overload: 1, procedural: 1 },
        notes: {
            srs: "coming due",
        },
    },
];
