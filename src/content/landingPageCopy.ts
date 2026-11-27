/**
 * Landing Page Copy
 *
 * Centralized content management for the LettersPractice landing page.
 * Edit all copy in one place for easier review and maintenance.
 */

export interface FooterLink {
  text: string;
  /** Internal route (vue-router). */
  to?: string;
  /** External/absolute href (full-page nav, e.g. /blog/, mailto:, OSS). */
  href?: string;
  /** Open in a new tab + show the ↗ affordance. */
  external?: boolean;
}

/** A footer social profile (a deployment's, deployment/pitch.ts). `network`
 *  picks its icon in LandingFooter, which must have one for every network
 *  listed here (enforced by its type). Twitter is deliberately "Twitter" with
 *  the classic bird, not "X". */
export interface SocialLink {
  network: "bluesky" | "twitter";
  label: string;
  handle: string;
  url: string;
}

export const landingPageCopy = {
  hero: {
    // The H1 is the literal phrase "Teach your child to read", split into a
    // plain text line + a word rendered as LetterPeople (HeroReadVignette.vue).
    // Two jobs at once:
    //
    // 1. SEO/positioning: it mimics *Teach Your Child to Read in 100 Easy
    //    Lessons* — the highest-intent query family we target — and makes the
    //    hero cohere with the MissionSection's Engelmann anchor. The complete
    //    phrase MUST exist as real DOM text inside the <h1> (the vignette is
    //    aria-hidden; `headlineWord` is also emitted as an sr-only span). If
    //    the keyword lives only in SVG paths, the whole rationale evaporates.
    // 2. Demonstration, not decoration: the word is posed as a real
    //    MissingLetters exercise (blank + underline + cursor) and answers
    //    itself, so a visitor who later meets the real exercise in /peek gets
    //    an "I've seen this" echo.
    //
    // headlineBlankIndex is FIXED at 0 (the 'r') — do not randomize. The easy
    // `r` avoids a phonics-literate parent noticing that the other blanks in
    // `read` (the `ea` team) aren't "easy" material, which invites the wrong
    // train of thought. See src/components/landing/hero-read.spec.md.
    // The \u00A0 (non-breaking space) is load-bearing: `to` is the preposition
    // that binds to the LetterPeople word on the row below, and at several
    // widths the line broke as "Teach your child / to", stranding it alone
    // above the word. Gluing it to `child` forces "Teach your / child to"
    // instead. Written as an escape, not a literal nbsp, so it stays visible
    // to anyone editing this string.
    headline: "Teach your child\u00A0to",
    headlineWord: "read",
    headlineBlankIndex: 0,
    // Tap payload, NOT an auto-rotating headline. Tapping the word advances the
    // ring: read \u2192 spell \u2192 learn \u2192 read. `read` is canonical \u2014 it is the
    // sr-only text, the first paint, and the state the word rests in \u2014 so the
    // Engelmann/SEO claim above never depends on animation state. The cycle is
    // strictly additive: a visitor who never taps sees exactly the old hero.
    //
    // Why these three, and why a ring rather than a carousel:
    // - A rotating headline word is a marketing trope; a *worked* exercise
    //   isn't. Each tap re-poses a blank and answers it, with the blank in a
    //   different position each time (0 / 1 / 4), which is the thing a single
    //   fixed `_ead` cannot show: that this is an exercise type, not a logo.
    // - `spell` is the most literally honest of the three \u2014 the app teaches
    //   encoding and infers decoding from it.
    // - `learn` is not filler: the Letters model the learning process itself
    //   (trying again, sequencing, revisiting) \u2014 see the in-app post-session
    //   vignettes. It claims what the product actually does.
    //
    // Blank indices follow the same rule as headlineBlankIndex: pick the
    // uncontroversial single-letter grapheme, never a vowel team. `s_ell` \u2192 the
    // `p`; `lear_` \u2192 the final `n` (which leaves the r-controlled `ear` intact
    // and unremarked).
    headlineWordCycle: [
      { word: "spell", blankIndex: 1 },
      { word: "learn", blankIndex: 4 },
    ],
    // Tier 2: the encore. Reached only by a visitor who has already tapped
    // through all of tier 1, and NEVER a resting state — an abandoned encore
    // snaps quietly home to `read` (see RETURN_HOME_MS in HeroReadVignette).
    // "Teach your child to juggle?" is a fine joke and a terrible hero.
    //
    // These are not exercises and deliberately don't pretend to be: no blank,
    // no cursor, no fill. The word simply arrives, complete — which is itself
    // the tell that the rules just changed — and then the Letters do the thing.
    // Posing `j_ggle` as a blank would be claiming we teach juggling.
    //
    // `act` names a performance in letterpeople: `juggle` runs the physics
    // cascade (transforms/juggling/phrases/cascadePhrase), `floss` runs the
    // dance (animations/floss). Both are real systems in the repo — the payoff
    // for five taps is the Letters doing something they can actually do, not
    // another word swap. `actLetter` picks the performer by index.
    //
    // Tier 2 words may be longer than tier 1 and will squish themselves to fit;
    // they never shrink the resting `read`. See `bindingWidthPerH`.
    headlineWordEncore: [
      // actLetter 4 = the `l` in `j u g g l e ?`.
      { word: "juggle?", act: "juggle", actLetter: 4 },
      { word: "dance!", act: "floss" },
    ],
    // The lede: the paragraphs beside the headline, one <p> each, all styled
    // alike. Until 2026-11-27 these were `subtitle` + `description`, but the
    // "subtitle" was never styled as one; it was just the first paragraph.
    // **bold**/*italic*/_underline_ markers are rendered via renderInline (see inlineMarkup.ts).
    // {word|explanation} is an explainer popover (inlineMarkup.ts).
    // PLACEHOLDER COPY (2026-11-27), mid-rewrite toward "what this does for
    // you / who it's for / why".
    lede: [
      "Read to your child every day! When they are {ready|Usually between **2** and **5**. Interested in stories, speaking in short sentences.}, add **a few minutes** each day with us.",
      "We provide efficient, age-appropriate phonics instruction, so they can start finding sounds and words on the page.",
      // Bookends the opener: "Read *to*…" → "Read *with*…".
      "And then? Read *with* your child every day!",
    ],
    // (The fridge-sheet line `descriptionOffscreen`, added 2026-09-20, was
    // removed 2026-11-27. The sheet is still pictured and explained in the
    // tour's closing beat: SessionWalkthroughSection, beat id "offscreen".)
    // No pricing line here: what's for sale, and how it's described, is the
    // deployment's (src/deployment/pitch.ts). HeroGreeting shows it after
    // the lede when there is one.
    // Primary path into the product. `primary`/`secondary` are the logged-out
    // CTAs (→ /peek, → /study); `resume` is shown to a returning logged-in
    // visitor (→ /study) with `sample` demoted to a quiet link.
    //
    // The pair encodes WHO'S PRESENT, not just destination: "View" = parent
    // alone, read-only stakes (nothing recorded); "together" = bring the kid,
    // the real start. "Start learning together" deliberately reuses the exact
    // phrase from the study-hub acknowledgment card, the peek transition card,
    // and the peek end screen — the same words at every begin-for-real
    // threshold. Rendered as hub-idiom pills (HeroGreeting.vue): lip colors
    // reuse the hub's language — orange = Practice (peek shows practice
    // exercises), green = Learn (study is where lessons live). Captions sit
    // under the pills and carry the stakes.
    cta: {
      primary: "View a sample lesson",
      primaryCaption: "Just you — explore freely, nothing recorded",
      secondary: "Start learning together",
      secondaryCaption: "You and your learner — the real start",
      resume: "Continue learning",
      resumeCaption: "Pick up where you left off",
      sample: "View a sample lesson",
    },
    // (Hero newsletter form removed 2026-07-03 — the footer's EmailSignupForm
    // is the page's single newsletter capture.)
  },

  // Straddles the hero → under-the-hood seam. Its job is CREDIBILITY, not
  // explanation: the walkthrough explains the pedagogy, /peek lets you use the
  // thing, and this answers the prior question a parent actually has — "is this
  // real, and would my kid do it?" Hence real footage, a real child, no
  // voiceover.
  //
  // The child is deliberately UNNAMED here (the video's framing is
  // privacy-preserving by design — locked over-shoulder, only the back of her
  // head, cut before she turns to camera).
  sessionVideo: {
    // Over the poster, before play. Cut 2026-11-13 with the section's title,
    // lede and timestamped "notables" (see git history for those and their
    // timecode derivation): the frame now straddles the hero seam on its own.
    playLabel: "See us in action!",
    meta: "A four-year-old, one month in · sound on",
  },

  mission: {
    eyebrow: "Our mission",
    // _underline_ rendered via renderInline (see inlineMarkup.ts).
    sectionTitle: "Effective early literacy for _every child_",
    // Rewritten 2026-07-07: replaced the "shouldn't require great wealth"
    // framing (a reply to premium-competitor pricing — illegible to visitors
    // who don't know that market exists) with the positive Engelmann anchor.
    // "100 Easy Lessons" works cold because the title is self-describing;
    // readers who know the book get the full comparison for free.
    // *italic*/**bold** markers rendered via renderInline (see inlineMarkup.ts).
    intro: [
      "The classic parent-led reading programs — *Teach Your Child to Read in 100 Easy Lessons* and its kin — genuinely work. They also ask a parent to deliver twenty scripted minutes a day, every day, for months.",
      "We keep what makes them work — careful sequencing, short daily practice, a guiding adult at the important moments — and automate the rest. The scripting, scheduling, and review run themselves; you're called in for the half-minute that needs you.",
    ],

    originStory: {
      title: "Built by Our Family for Yours",
      paragraphs: [
        "LettersPractice is the product of a single family with two eager readers. Every feature has been tested by tiny hands. The current product grew out of a hobby project that got out of hand.",
        "Like all the best software, it's been crafted with equal parts love and profanity.",
        "Our commitments:",
      ],

      trustMarkers: [
        {
          icon: "🤝",
          label: "Straightforward Business Model",
          detail: "No ads, no upsells, no forgotten subscriptions.",
          link: undefined,
        },
        {
          icon: "🔒",
          label: "No Data Brokering",
          // Leads with the cookie banner deliberately: it's the one claim in
          // this list the visitor can already verify (they got here without
          // being interrupted), which is what makes the neighbouring promises
          // credible. Wording constraints, in case this gets edited later:
          //   - "no cookie banners", never "no cookies". Logged-in users carry
          //     a CouchDB AuthSession cookie, and checkout sets Stripe's
          //     __stripe_mid/__stripe_sid. Both are consent-exempt (strictly
          //     necessary / fraud prevention) — which is *why* there's no
          //     banner — but "no cookies" would be false.
          //   - not "personal data": we collect email, username, and
          //     per-account performance data, all of which is personal data
          //     under GDPR. "Incidental or irrelevant" is the precise and
          //     true line — data outside the purpose.
          detail: "No cookie banners here. Your child's learning data stays with us, and we'll never harvest incidental or irrelevant data (eg, location).",
          link: undefined,
        },
        {
          icon: "🌱",
          label: "Open Foundations",
          detail: "Built on open source with proactive sunset plans. You retain access to the course even after we're \"out of business\".",
          link: {
            text: "open source",
            url: "https://patched.network/vue-skuilder",
          },
        },
      ],
    },
  },

  footer: {
    emailSignup: {
      heading: "Letters in your inbox",
      description:
        "Occasional notes — when we publish or ship something worth telling you about. Unsubscribe anytime.",
    },
    tagline:
      "Built by our family for yours.",
    // Contact address and social profiles are the deployment's
    // (deployment/pitch.ts): none in the open build.
    // Only destinations that actually exist get a link — no `#` stubs. The
    // deployment's own pages (e.g. its Privacy and Terms) follow these
    // (PublicPage.footer, src/deployment/).
    links: [
      { text: "A Sample Lesson", to: "/peek" },
      { text: "Learning Engine", to: "/learning-engine" },
      { text: "Curriculum", to: "/curriculum" },
      { text: "Exercises", to: "/exercises" },
      { text: "Roadmap", to: "/roadmap" },
      { text: "Blog", href: "/blog/" },
      { text: "Open Source", href: "https://patched.network/vue-skuilder", external: true },
    ] as FooterLink[],
    legalLine:
      "🧡 and $@!#",
  },

  // The landing's one under-the-hood section (UnderTheHoodSection.vue): a
  // shared header, then two cards that link out — /curriculum (a chip per
  // live lesson, titles from LESSON_CATALOG) and /learning-engine (a chip per
  // technique from pedagogyCopy, deep-linked by anchor). The details live on
  // those pages. PLACEHOLDER COPY where marked; grep
  // `PLACEHOLDER(P` for all.
  behindTheScenes: {
    eyebrow: "Under the Hood",
    sectionTitle: "What we do here: Curriculum and Instruction",
    // One paragraph or several.
    intro:
      [
        "English spelling is a mix of dependable **high-use patterns** ([*s* as in *sit*]), semi-regular **related patterns** ([*s* as in *has*]), and **messy exceptions** ([*of*]).",
        //  We have a slightly opinionated approach here that we think makes the best use of both the active, attentive portions of a learning brain, as well as its background environmental processing parts.
        "We teach the high-leverage dependable patterns explicitly, and we do the same for the important exceptions (of, have, said, was...). For both, we check for understanding with targeted exercises.",
        "The middle bit is large and fuzzy. There is too much of it to teach as a list of rules, and the reading brain doesn't learn it that way anyway. Instead, we deliberately sprinkle these patterns among the exercises that target other skills, and let the brain's pattern-learning systems pick them up. After enough exposure, the child takes responsibility for the spelling as well."
      ] as string | string[],
    exercises: {
      title: "Exercises",
      line: "Four small exercises, all from sound to print. Each one is built to read a wrong answer as well as a right one.", // PLACEHOLDER(EX47)
      readMore: "Try the exercises",
    },
    curriculum: {
      title: "Curriculum",
      line: "The patterns we teach, and how we group them. Ordered by real-world use, so big wins come early.",
      readMore: "See the curriculum",
    },
    engine: {
      title: "Learning Engine",
      line: "Day to day, the letters adjust for each learner and balance a variety of goals — introducing the new, refreshing the old, sprinkling in the fuzzy middle bits.",
      readMore: "See the engine",
    },
  },
} as const;

// Type exports for TypeScript autocomplete
export type LandingPageCopy = typeof landingPageCopy;
export type HeroCopy = typeof landingPageCopy.hero;
export type MissionCopy = typeof landingPageCopy.mission;
