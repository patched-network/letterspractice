/**
 * Copy for /learning-engine (PedagogyView): what *this* child does next, and
 * why. /curriculum covers what is taught and in what order; the landing's
 * Under the Hood section covers the kinds of spelling and how each is handled.
 * This page is the Team of Rivals: a handful of ordinary, well-supported
 * techniques, each wanting something different from the next exercise, and
 * how they settle it (multiplied scores: the exercise that dovetails wins).
 *
 * Page order: lede → the rivals → how they settle it (Team of Rivals) → how
 * the engine knows → curriculum link + CTA.
 *
 * The landing's Learning Engine card shows a chip per entry of `techniques`
 * (rivals and evidence alike) that deep-links here by id. Keep `id`s stable —
 * they are URL fragments.
 *
 * Register: same as the landing copy — plain, a little wry, no letter names
 * (letters are shown as `code` chips, never called "bee" / "dee"; see the
 * curriculum orientation on letter names). Inline markup via
 * components/landing/inlineMarkup.ts: **bold**, *italic*, `chip`, links.
 *
 * DRAFT COPY (2026-10-08 restructure) is marked `PLACEHOLDER(LEn)`; grep
 * `PLACEHOLDER(LE` for all. Unmarked prose is Colin's, carried over from the
 * landing-section era.
 */

export type PedagogyDetail =
  | string
  | { type: "example"; label: string; text: string }
  | { type: "labeled"; label: string; text: string }
  /**
   * WORKING TEXT — dense point-form notes for Colin to write up in his own
   * voice. Renders as a visibly-flagged draft box until replaced by prose.
   * Grep `type: "working"` to find every remaining one.
   */
  | { type: "working"; points: string[] };

export interface PedagogySection {
  /** Stable anchor id (used as `/learning-engine#<id>`). */
  id: string;
  /** Which part of the page: a rival technique, or how the engine knows. */
  group: "rival" | "evidence";
  /** mdi icon name. */
  icon: string;
  name: string;
  /** One line, shown under the heading. */
  summary: string;
  /** Rivals: what this technique wants from the next exercise ("Aims for"). */
  wants?: string;
  /** Rivals: who it's in tension with (markup; link the rival by anchor). */
  pullsAgainst?: string;
  details: PedagogyDetail[];
}

/**
 * Master switch for working text (point-form notes awaiting prose). Off, the
 * page renders only prose; on, the amber draft boxes show. The PLACEHOLDER
 * drafts are prose and render either way.
 */
export const SHOW_WORKING_TEXT = false;

const techniques: PedagogySection[] = [
  // ---- the rivals ---------------------------------------------------------
  {
    // Was "Weighted Priorities" (#priorities). Merged 2026-10-08 with the
    // prerequisite gate: the curriculum is the one source of new material.
    id: "curriculum",
    group: "rival",
    icon: "mdi-map-outline",
    name: "Curriculum",
    summary: "Opening new things in a useful order, and only when they're ready", // PLACEHOLDER(LE22)
    wants: "The most useful new thing your child is ready for.", // PLACEHOLDER(LE3)
    pullsAgainst:
      "Everyone else on this list, who hold new things back until the old ones are solid. [Spaced Repetition](/learning-engine#srs) most of all: every review is a slot not spent on something new.", // PLACEHOLDER(LE4)
    details: [
      "We lead with letters and phonetic rules that are common and \"well-behaved\" (consistent in their usage). We leave the zebras and their xylophones for a little later.",
      // PLACEHOLDER(LE5): the curriculum's three jobs in the engine.
      "The curriculum is where everything new comes from: a new letter or team, or a new combination of ones already in rotation. Among what it has opened, it weights the most useful highest.",
      "It also holds the door. An exercise that needs something your child hasn't been introduced to yet is all but ruled out, however good it looks to the others.",
      "The full order is laid out on the [curriculum](/curriculum) page.",
      {
        type: "working",
        points: [
          "every GPC carries a usage weight from word-frequency in early-reader vocab",
          "when several new facts are eligible, the one that unlocks the most new words wins the slot (set-cover priority)",
          "gate: a card using a GPC whose lesson isn't passed is scored ×0.01 (LessonGateFilter); not zero, so a session can't deadlock",
        ],
      },
    ],
  },
  {
    id: "srs",
    group: "rival",
    icon: "mdi-sync",
    name: "Spaced Repetition (SRS)",
    summary: "Mechanizing long-term retention and growth",
    wants: "Yesterday's material back, just before it slips.", // PLACEHOLDER(LE6)
    pullsAgainst:
      "[Curriculum](/learning-engine#curriculum): every review is a slot not spent on something new.", // PLACEHOLDER(LE7)
    details: [
      {
        type: "labeled",
        label: "The problem:",
        text: "Learned concepts and information can be forgotten if not revisited at the right intervals.",
      },
      {
        type: "labeled",
        label: "The solution:",
        text: "Our spaced repetition system automatically brings back exercises at optimal intervals, right before forgetting would occur.",
      },
      "This transforms short-term knowledge into permanent mastery, ensuring your child retains what they learn for the long haul.",
      {
        type: "working",
        points: [
          "why sessions are short + daily rather than long + occasional: spacing needs a tomorrow to space into",
          "few minutes most days beats an hour on Saturday; app is built around the former",
          "(pending, from landing workingdoc) free tier ends at ~1,000 reachable words, not a countdown: progress pressure, not time pressure",
        ],
      },
    ],
  },
  {
    id: "interference",
    group: "rival",
    icon: "mdi-shield-outline",
    name: "Interference Mitigation",
    summary: "Separating confusable concepts to prevent mix-ups",
    wants: "Look-alikes and sound-alikes kept apart until each is solid.", // PLACEHOLDER(LE8)
    pullsAgainst:
      "[Progressive Overload](/learning-engine#overload), which eventually wants them together.", // PLACEHOLDER(LE9)
    details: [
      "Similar-looking letters and sounds can blur together without proper spacing. We strategically separate the introduction of confusable concepts.",
      {
        type: "example",
        label: "Example 1:",
        text: "Learning `b` and `d` together is just awful! The symbols are mirror images.",
      },
      {
        type: "example",
        label: "Example 2:",
        text: "Learning `d` and `t` together is challenging for a different reason. The sounds are quite similar (different mainly in how much resistance your tongue gives before letting go), and not well distinguished by younger ears.",
      },
      // Was followed by "See Progressive Overload for how we bring it all back
      // together." — now the pullsAgainst line's job.
      "By minimizing interference, we help each concept establish itself clearly before introducing similar ones.",
      {
        type: "working",
        points: [
          "same idea above single letters: two spellings of one sound, or one spelling with two sounds, kept apart in time until the first is solid",
          "mechanism note: a confusable pair suppresses the partner while immature (framework interferenceMitigator)",
        ],
      },
    ],
  },
  {
    id: "overload",
    group: "rival",
    icon: "mdi-trending-up",
    name: "Progressive Overload",
    summary: "Gradually increasing challenge as skills develop",
    wants: "Exercises a little harder than comfortable.", // PLACEHOLDER(LE10)
    pullsAgainst:
      "[Interference Mitigation](/learning-engine#interference) early on, and [Procedural Exercise Generation](/learning-engine#procedural), which wants one new thing at a time.", // PLACEHOLDER(LE11)
    details: [
      "Like strength training, reading skills grow through carefully calibrated challenge.",
      "We continuously ramp up difficulty as your child's abilities develop, always keeping them in the \"sweet spot\" where learning happens: not too easy, not too hard.",
      "As skills solidify, we relax the guardrails. Letters that were once kept apart (like `b` and `d`) can now practice together through minimal-pair exercises. Procedurally generated exercises can include more unknowns at once. The interference risks that required careful separation early on become opportunities for strengthening discrimination and flexible application.",
      "This maintains engagement and ensures steady progress without frustration or boredom.",
      {
        type: "working",
        points: [
          "under the hood: a rating system (chess-player math). child has a rating, every exercise has a rating",
          "app prefers exercises a little above where the child sits",
        ],
      },
    ],
  },
  {
    id: "procedural",
    group: "rival",
    icon: "mdi-puzzle-outline",
    name: "Procedural Exercise Generation",
    summary: "Building new concepts from solid foundations",
    wants: "Exactly one new thing per exercise, built from parts your child already owns.", // PLACEHOLDER(LE12)
    pullsAgainst:
      "[Progressive Overload](/learning-engine#overload), which would happily stack up more.", // PLACEHOLDER(LE13)
    details: [
      "When introducing new concepts, we use solidly known building blocks to create exercises.",
      {
        type: "example",
        label: "Example:",
        text: "If your child knows `m` better than `k`, we'll prefer the word *same* over *sake* when introducing the long-vowel \"magic e\" pattern (CVCe).",
      },
      "This ensures each new lesson introduces exactly one new thing, rather than overwhelming with multiple unfamiliar elements.",
      {
        type: "working",
        points: [
          "exercise bank is large (thousands of short items), each tagged with exactly which facts it depends on",
          "no hand-picked worksheet: filter the bank to items whose ingredients the child already owns, plus the one new thing",
        ],
      },
    ],
  },

  // ---- how the engine knows ----------------------------------------------
  {
    id: "self-report",
    group: "evidence",
    icon: "mdi-checkbox-marked-circle-outline",
    name: "Rejecting Self-Report",
    summary: "Active demonstration replaces mindless dismissal",
    details: [
      "Throughout the course, understanding is actively demonstrated by learners. No \"I got it!\" buttons or easy outs.",
      "Children can't mindlessly click through content. Exercises require authentic engagement and correct responses.",
      "This ensures our system knows what they actually know, not just what they claim to know, keeping our personalization accurate.",
    ],
  },
  {
    id: "encoding-first",
    group: "evidence",
    icon: "mdi-keyboard-outline",
    name: "We test spelling, and infer reading",
    summary: "The app never asks a child to read aloud to it",
    details: [
      // PLACEHOLDER(LE15): written up from the working notes below.
      "Almost every exercise runs from sound to spelling: your child hears a word and builds it from letters. A tap on a big letter key is unambiguous; a toddler's spoken guess is not.",
      "Spelling is also the harder direction. A child who can reliably build *ship* can read it, too.",
      "Reading aloud, with its gentle corrections, is your part. You're a far better judge of it than any microphone, and it happens naturally in shared books.",
      {
        type: "working",
        points: [
          "almost every exercise is encoding-shaped: hear a sound/word, produce the letters. The app never shows *bread* and asks the child to say it",
          "practical half: a tap on a big letter key is unambiguous; toddler speech is not; don't build a product around guessing what a toddler said",
          "pedagogical half: sound-to-spelling is the harder direction; a child who does it reliably can read the word too",
          "reading aloud + its corrections are the parent's lane: better judge by a wide margin, happens naturally in shared books",
          "app concentrates on its comparative advantage (sequencing, spacing, choosing the next exercise); leaves the human parts to the human",
        ],
      },
    ],
  },
];

export const pedagogyCopy = {
  // Pairs with /curriculum's "Our Curriculum" (2026-10-09; was "LetterPeople
  // Learning Planners").
  title: "Our Learning Engine",
  // PLACEHOLDER(LE1)
  lede: [
    "Our [curriculum](/curriculum) defines the learning objectives, and roughly orders them. Day to day, the learning engine sifts through thousands of available exercises and finds the right mix of review, recombination, and new material.",
    //
    "Our [open-source](https://patched.network/vue-skuilder) learning engine is not rigidly programmed, but instead allows a number of different interests to inform its decisions about the next card. The competing interests here mostly take the form of several tried and true pedagogical principles: interleaving, spaced retrieval practice, progressive scaffolding, and the like.",
    // Absorbed the panel's opening paragraphs (2026-10-09).
    "These interests are often in tension, and occasionally in direct conflict with one another. Sometimes this means that one interest *wins out* over the others, but the more common case is that the engine finds exercises that dovetail to serve many purposes at once: win-win situations that respect all the techniques.",
  ] as string[],
  ledeWorking: [
    "planned curriculum + close observation of this child + adapt the next few minutes",
    "none of the techniques are novel on their own; the work is choosing well-supported ones and wiring them together so they don't fight",
    "all of it has to stay pleasant for a three-year-old",
  ],

  // Plain register (2026-10-09): the techniques aim for things and are in
  // tension with each other; no rivals, votes or politicking on the page.
  // (Code still calls them rivals: rivals.ts, RivalDisc, #team-of-rivals.)
  rivalsTitle: "The Techniques",
  // Cut with the register change (was LE2, "Each of these is a well-supported
  // technique…"): the lede introduces them. Renders nothing while empty.
  rivalsLede: [] as string[],

  /** All sections, in page order; the landing's chips read this list too. */
  techniques,

  // The page's core: how the rivals settle it. Anchor #team-of-rivals.
  teamOfRivals: {
    // eyebrow: "A worked example",
    title: "Balancing Tensions: a worked example",
    // The widget's own text (DovetailWidget reads it): instructions above
    // the cards, a note under them.
    widget: {
      // PLACEHOLDER(LE18)
      instructions:
        "Switch the techniques on one at a time to see their respective influence. With all of them on, the winner is rarely any one technique's first choice: it's the exercise that dovetails.",
      // PLACEHOLDER(LE21): the live-internals demo, for the sceptical.
      note: "The numbers above are made up for illustration. To watch the real engine choose, with every technique's score on screen, try our [technical demo](/tech-demo).",
    },
    // After the panel: under it when narrow, under the rivals when wide.
    closing: [
      "We use our ongoing experience with learners to continually test our assumptions and get the right mix of influences.",
    ],
  },

  knowTitle: "How the engine knows",
  // PLACEHOLDER(LE14)
  knowLede:
    "None of the above works unless the engine has an accurate picture of what your child knows. Two choices keep that picture honest.",

  // Cross-link to /curriculum, after the techniques: the order they produce,
  // on a timeline. PLACEHOLDER COPY. Grep
  // `PLACEHOLDER(P` for all.
  curriculumLink: {
    lead: "[One line: the order these techniques produce, on a timeline: when a typical learner meets each lesson and each fact.]", // PLACEHOLDER(P5)
    label: "Our curriculum", // PLACEHOLDER(P6)
  },

  // Cross-link to /exercises, after the curriculum's
  exercisesLink: {
    lead: "The exercises the engine chooses between, live, with how each one reads a mistake:", // PLACEHOLDER(EX46)
    label: "Our exercises",
  },

  ctaLead: "The quickest way to see all of this working is to try it.",
};

export type PedagogyCopy = typeof pedagogyCopy;
