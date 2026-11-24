/**
 * Copy for /exercises (ExercisesView): the exercise types the main loop runs,
 * each shown live, with its pitch (why this exercise), how its cards are made,
 * and what a wrong answer tells the engine.
 *
 * The third of three "what we do here" pages: /curriculum is *what* gets
 * taught and when, /learning-engine is *which* exercise comes next, this is
 * *what the exercises are*. The landing's UnderTheHoodSection shows a chip per
 * exercise that deep-links here by id (`/exercises#wst`). Keep ids stable:
 * they are URL fragments.
 *
 * Facts in here are the code's, as of 2026-11-12. If you change behaviour,
 * check the matching lines:
 *   - WST: questions/WhoSaidThat.ts (buildAutoSuspects, SAME_PHONEME_EXCLUSIONS,
 *     evaluate's distractor tag); focus-group cards in generate-cards.ts.
 *   - WS: questions/WordSelection.ts (buildOptions thresholds, evaluate's
 *     findPhoneticDifference); minimal pairs from analyze-minimal-pairs.ts.
 *   - ML: questions/MissingLetters.ts (HINT_ASSISTED_SCORE_CAP, per-chunk
 *     grading); time-based key shaving in MissingLettersView.vue.
 *   - Spelling: free spelling only (scaffold level 3; levels 0–2 exist in
 *     SpellingQuestionView but aren't served), questions/spelling/grade.ts
 *     (the grader's rules).
 *   - Timing: every type scores a fast correct answer 1, a slow one no less
 *     than 0.8 (MIN_SCORE / MIN_TIME_FRACTION).
 *
 * Register: same as the landing and /learning-engine copy. Plain, a little
 * wry, no letter names (letters are `code` chips). Inline markup via
 * components/landing/inlineMarkup.ts: **bold**, *italic*, `chip`, links.
 *
 * DRAFT COPY (2026-11-12, first pass) is marked `PLACEHOLDER(EXn)`; grep
 * `PLACEHOLDER(EX` for all. All of it is a draft for Colin's voice.
 */

export type ExerciseId = "wst" | "ws" | "ml" | "spelling";

/** Recognise vs produce, part vs whole: the grid the four exercises fill. */
export interface ExerciseCell {
    /** "Pick" (recognise) or "Make" (produce) */
    mode: "recognise" | "produce";
    /** One sound/letter, or the whole word */
    grain: "part" | "whole";
}

export interface ExerciseCopy {
    id: ExerciseId;
    /** The title the exercise shows in the app */
    name: string;
    /** mdi icon, for the landing chip */
    icon: string;
    cell: ExerciseCell;
    /** One line: the task, from the child's side */
    task: string;
    /** Why this exercise: the pitch */
    why: string[];
    /** How its cards are made (seeding) */
    made: string[];
    /** What a mistake tells us, and what happens next */
    mistakes: string[];
    /** Caption under the demo's help toggle, when it has one */
    levelsCaption?: string;
}

export const exercisesCopy = {
    title: "Our Exercises",
    lede: [
      "The main practice loop runs four simple exercises, designed with care. Their simplicity lets us direct the learner's cognitive load where it matters, instead of learning many complex interfaces. Each exercise starts with a **sound** (either a phoneme or a word) and asks for **print**: hear it, then pick it or make it.",

      "## Shared Principles",

      "We prefer **exercises** to action oriented **games** as part of our tone-setting. We are low screen-time by default. Friendly and inviting, but not captivating.",

      "We prefer **print** inputs to listening to a child's speech for the sake of reliability. We infer reading skills from demonstrated selection and spelling skills. Book reading is for the family.",

      "We grade by **fact**, not by whole card. Many incorrect answers contain useful hints of partial understanding. Our grading and skills-accounting systems are pretty good at sniffing out the ideas behind each answer.",

      "## Shared Input Device",

      "All exercises can be driven by either the physical keyboard of a computer, or by the touch-friendly onscreen keyboard. For *picking* exercises, the answers themselves can also be touched directly.",

      "The keyboard grows with the learner - the letter [s] arrives first, and others join as they are learned. A great setup for younger learners is for the learner to point at items on a non-touch screen, and for an accompanying adult to manage entries via the physical keyboard.",

      "In all exercises, the `spacebar` can be used to replay target audio, and the `shift` key can be used to help kids map between the lower-cased onscreen keyboard and an upper-cased physical keyboard."

      // "The four exercises fit nicely into a 2x2 grid: *pick vs make* on one axis, *sound vs word* on the other.",
    ],
    gridLabels: {
        recognise: "Pick",
        produce: "Make",
        part: "One sound",
        whole: "Whole word",
    },
    sectionLabels: {
        why: "Why this exercise",
        made: "Where the cards come from",
        mistakes: "How we read mistakes",
    },
    demo: {
        another: "Another",
        again: "Start over",
        loading: "Loading the exercise…",
    },

    exercises: [
        {
            id: "wst",
            name: "Who Said That?",
            icon: "mdi-account-voice",
            cell: { mode: "recognise", grain: "part" },
            task: "Hear a sound, find the letters who made it.",
            why: [
                "Letters make sounds. This exercise teaches and tests the basic associations in a straightforward way.",

                "Wrong answers give feedback by making their own sounds, then fading back.",
            ],
            made: [
                "Each letter-sound fact gets its own card. Distractor suspect lists are scaled for difficulty: a beginner will often choose between two candidates, but as skills develop the set will grow.",
                "Letters that share the target sound are never suspects together: no `c` against `k`, no `f` against `ph`.",
                "A smaller set of **focus** cards does the opposite, pairing classic confusions (`b` and `d`, `m` and `n`) against each other once both are introduced. See [Interference Mitigation](/learning-engine#interference).",
            ],
            mistakes: [
                "Picking `m` for the *ffff* sound is two misses, not one: the child didn't connect *ffff* to `f`, and they connected something else to `m`. We record the evidence on both facts to help future scheduling.",
            ],
            levelsCaption: "",
        },
        {
            id: "ws",
            name: "Find the Word",
            icon: "mdi-text-search",
            cell: { mode: "recognise", grain: "whole" },
            task: "Hear a word, then pick it from a few that sound nearly the same.",
          why: [
            "The next step up. This exercise uses the same multiple-choice interface as the *Who Said That* exercises, but zooms out from a single sound to whole words.",
            "Even though we are selecting whole words, each exercise targets individual sounds by creating *minimal pair* distractor sets. By targeting individual sounds in the context of whole words, we can **implicitly** teach and evaluate the concepts of **segmenting** and **blending**.",
            "For example, when selecting `hit` from `[hot, hat, hit, hut]`, we gain two benefits. The [i] sound is explicitly targeted for recognition, while the [h] and the [t] sounds heard by the learner can be processed against each given example.",
            "Our learning engine exploits this deliberately: sounds and letters that are due for formal introduction get managed exposure during the runup.",
            ],
            made: [
                "Cards are built from our pronunciation dictionary, phonetic engine, and recording list. For each of our recorded words, we generate a list of minimal pair compatible matches, and generate a set of cards from the set. For each phoneme, we run checks to ensure that it has enough cards that minimally exercise it.",
                "Special care is taken to include cards exercising the common patterns: for example, choosing between `[cap, cape]`, `[fill, file]`, or `[not, note]`.",
                "Like the *Who Said That* cards, beginners are more likely to encounter cards with smaller distractor sets.",
            ],
            mistakes: [
              "A wrong answer plays back the mistaken phoneme from the selected word, and then replays the target word. The child hears the difference that was missed.",
              "Like *Who Said That* cards, the misses count as evidence both for the correct target letter-sound and for the incorrectly selected letter-sound.",
            ],
            levelsCaption: "", 
        },
        {
            id: "ml",
            name: "Fill in the Blanks",
            icon: "mdi-form-textbox",
            cell: { mode: "produce", grain: "part" },
            task: "Hear a word, fill in the missing parts.",
            why: [
                "This is the bridge between *Who Said That* cards and full spelling. It combines phonetic segmenting (taking a word apart into individual sounds) with the letter-phoneme knowledge previously learned.",
                "Filling the blank of `c_t` requires a recognition of the [c] and [t] sounds, putting them in order in one's head, and then isolating the missing [a] sound. Cumulative experience here drives a learner's statistical pattern-finding brain to put together the big pieces.",
                "These exercises naturally ramp up toward full spelling, including versions where all letters are blanked. Spelling `hope` into four blanks is a great hint: it removes the potential for the `hop` misspelling."
            ],
            made: [
                "These are very simply generated from our store of recorded words. For sight words especially, we take care to generate *Fill in the Blanks* exercises that target the word's misbehaving letters - like `w_s` for [was]. We also take care to zoom in on places where letters are used in combination, like giving `s_ip` for *ship* as an exercise for the [sh] digraph, and giving `tim_` for *time* as an exercise for the [i_e] *sneaky-e* long-i usage.",
                "Difficulty on these exercises scales naturally as the learner encounters more letters. Beginners will have just a few options to choose from for each blank, making *picking among available options* a useful hint.",
            ],
            mistakes: [
                "Each blank is graded on its own, so in a two-gap word one slip doesn't sink the other. A wrong answer shows the correction in place, letter by letter.",
                "The `spacebar` here can be used as a hint. After the target word is played, the next audio playback isolates the sound that the blank corresponds to. Learners are encouraged to use this when it helps, but the grader does dock them a little for not doing the full segmenting themselves.",
            ],
        },
        {
            id: "spelling",
            name: "Spell the Word",
            icon: "mdi-keyboard-outline",
            cell: { mode: "produce", grain: "whole" },
            task: "Hear a word and spell it.",
            why: [
                "Spelling is harder than reading. Any word that a child can spell can also be read by the child.",

                "Free spelling puts maximal difficulty on the learner and provides a very dense signal for the learning engine to work with.",
            ],
            made: [
                "One card per recorded word, once every sound-spelling in it is part of the curriculum.",
                "In the curriculum writ large, spelling cards are ranked with a higher difficulty rating than the other types, so they tend not to be encountered until learners have had substantial prior experience.",
                "Like *Fill in the Blanks* questions, the difficulty scales naturally based on the keyboard's available letters."
            ],
            mistakes: [
                "Like the other questions, we aim to grade here per-sound rather than treating the whole word as right or wrong. Unlike the other questions, beginners doing free spelling can sometimes produce some pretty creative responses.",
                "The grader uses a fairly sophisticated phonetic decoder that segments both the target word and the learner's attempt. We **respect** phonetically coherent misspellings like `necst` for `next`, or `fone` for `phone`, and treat those distinctly from either an outright success or an outright failure.",
                "We've also learned that no programmed decoder is any match for the creative energies of semi-literate children. Incorrect answers that defy the grader's comprehension get tagged and surfaced for our consideration." 
            ],
        },
    ] satisfies ExerciseCopy[],

    grader: {
        title: "Try a misspelling", // PLACEHOLDER(EX35)
        lede: "This is the grader the app uses. Pick a word, type a spelling, and see which facts it charges.", // PLACEHOLDER(EX36)
        answerLabel: "A spelling",
        correct: "That's the word.",
        unjudged: {
            "no-phonetics": "We have no sound map for this word.",
            empty: "Type something.",
            "too-long": "Too long to line up with the word: recorded as wrong, nothing more.",
            "nothing-to-blame": "Wrong, but no fact to blame: recorded as wrong, nothing more.",
        },
        hit: "right",
        miss: "missed",
        // Starting points: one sounds-right, one dropped letter, one swap
        tries: [
            { word: "phone", answer: "fone" },
            { word: "ship", answer: "sip" },
            { word: "next", answer: "necst" },
            { word: "fish", answer: "fsih" },
            { word: "cat", answer: "cats" },
        ],
    },

    threads: {
        title: "What they all share", // PLACEHOLDER(EX37)
        items: [
            {
                label: "Speed counts, a little.",
                text: "A quick right answer scores full marks; a slow one still scores at least 80%. Fluency matters, but a careful child isn't punished for being careful.", // PLACEHOLDER(EX40)
            },
            {
                label: "No self-report.",
                text: "We never ask whether your child knows something. We watch what they do. See [Rejecting Self-Report](/learning-engine#self-report).", // PLACEHOLDER(EX41)
            },
        ],
    },

    links: {
        curriculum: {
            lead: "What these exercises teach, and in what order:", // PLACEHOLDER(EX42)
            label: "Our curriculum",
        },
        engine: {
            lead: "How the engine picks which one comes next:", // PLACEHOLDER(EX43)
            label: "Our learning engine",
        },
    },

    ctaLead: "The quickest way to see them in a real session is to try one.", // PLACEHOLDER(EX44)
} as const;

export type ExercisesCopy = typeof exercisesCopy;
