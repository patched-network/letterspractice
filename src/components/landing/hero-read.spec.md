# Hero pivot: "Teach your child to [_ead]" — implementation spec

Status: **ready to implement**. Authored 2026-07-31 from a strategy session
(Colin + Fable). This spec is the durable handoff to an implementing session;
decisions here are settled — dev-time *tuning* is expected (esp. §4 layout),
re-litigating the design is not. When shipped, this file supersedes the
"Section 1 (Hero): update animation" bullet in `workingdoc.md`.

## 1. What & why (brief)

Replace the hero's decorative "Hello!" LetterPeople word with a live,
self-solving MissingLetters vignette inside the headline:

> **Teach your child to `_ead`** → (r pops in) → **read** + celebration

Rationale ("Engelmann SEO wedge"):

- "Teach your child to read" as the literal H1 mimics *Teach Your Child to
  Read in 100 Easy Lessons* — the highest-intent query family we target, and
  it makes the hero cohere with the MissionSection's Engelmann anchor.
- Converts the hero from decoration to **demonstration**: a real exercise
  type, posed and answered on first paint. Visitors who later hit the real
  MissingLetters exercise in /peek get an "I've seen this" echo — so the
  vignette must reuse the real exercise's visual idiom, not invent one.
- Reinforces learning-family-unit positioning (parent as teacher) vs
  low-guilt-screentime competitors.

## 2. What changes / what dies

| Piece | Fate |
|---|---|
| "Hello!" word + `heroGreetingAnimation.ts` (scroll-triggered greeting) | **Removed**, replaced by the vignette + a new controller (suggest `heroReadAnimation.ts`) |
| `hero.title` / `titleHighlight` / `titleSuffix` ("Discover the joy of reading…") | **Removed**. New copy fields (§6) |
| Right column: `subtitle` ("Meet the Letters—friendly guides for focused learning"), `description` (ages/minutes), `pricing` | **Unchanged, verbatim.** The subtitle is hand-optimized over many iterations — do not "improve" it |
| CTA row (hub-idiom pills, auth-aware) | **Untouched** |
| Hero background, section min-height, reduced-motion background fallback | **Untouched** |

## 3. The vignette

### Load state
- Headline text "Teach your child to" (H1 type, current responsive scale).
- Below it, the LetterPeople word rendered as `[blank] e a d` using the
  **real MissingLetters idiom** from `src/questions/MissingLettersView.vue`:
  - blank slot with the persistent underline (`.ml-blank-underline`)
  - blinking vertical cursor in the empty blank
  - letters plain — no eyes/mouth/arms (reads as text; per the real exercise)
- Whole word one color via `randomVibrancyColor()` + `BRAND_COLOR_TRANSFORM`,
  as the current hero does. The arriving `r` matches the word color.

### Timeline (auto-plays once; total ≈ 4–5 s)
1. **t=0**: load state above. Cursor blinks.
2. **t≈2.5 s**: the `r` **pops into the slot** exactly as the real exercise
   fills a blank — mimic `createLetterAt(index, letter, animated=true)`
   (slot-width expansion, 150 ms, outQuad; see `MissingLettersView.vue`
   ~line 641). No walk-in, no drop-in, no flight path — the "reads as text"
   quality is the point. Underline **persists** after filling (faithful).
3. **Celebration** (mimic the real one, `MissingLettersView.vue` ~line 970):
   eyes + mouth `show({ duration: 150 })` on all four letters, then
   `celebrateLetter(letter, { type: 'random' })` staggered left→right at
   60 ms (`STAGGER_MS`). Import from `src/letterpeople/animations`.
4. **Settle**: calm idle — eyes stay on, occasional blink if cheap; no
   looping motion. The hero must not compete with the video section below.
5. **Replay on tap/click of the word**: re-run from step 2 (blank the `r`,
   short beat, refill, celebrate). Guard against overlapping runs.

### Explicitly out of scope
- No keyboard context, no grading, no visitor typing.
- **No audio** (the real exercise plays word audio on mount; the landing page
  must not). If replay-on-tap ever wants a spoken "read", that's a follow-up.
- Blank position is fixed at index 0 (the `r`). Do not randomize — settled:
  the easy-`r` avoids a phonics-literate parent noticing that other blanks in
  `read` (the `ea` team) aren't "easy" material, which invites the wrong
  train of thought.

## 4. Layout (the known-hard part)

Structure: left column = H1 text line + LetterPeople word as its own display
row beneath (do **not** attempt inline flow of SVG glyphs inside the text
line). Right column = the three unchanged blurbs. Mobile (below md): stack —
headline + word first, blurbs after; vignette still runs.

Colin's stated concern: making `[_ead]` flow naturally with the H1 text
across sizes/reflows may be finicky. Expect iteration here. Constraints:

- Word sizing: derive from column width like the current `maxWordWidth`
  computed — and keep reading the **reactive** `display.width.value` (a plain
  `window.innerWidth` read has no reactive dep; this bug was already fixed
  once — see comment in `HeroGreeting.vue` ~line 144).
- Keep the existing overflow guards: `min-width: 0` on `.v-col` (flex
  min-content trap, `HeroGreeting.vue` ~line 228) and `overflow-x: clip` on
  `.landing-page` (`LandingPage.vue` — `clip` not `hidden`; `hidden` breaks
  the walkthrough's sticky positioning).
- The word must never wrap; the text line may wrap.
- **No cumulative layout shift**: reserve the filled-word width up front
  (size the blank slot at the `r`'s width from t=0 — the underline slot is
  naturally letter-sized in the real exercise) so the fill animation doesn't
  reflow the headline or shift the CTA row.
- Acceptance: no horizontal overflow at 320 px; sane at xs/sm/md/lg.

## 5. SEO / accessibility — non-negotiable

- The rendered `<h1>` must contain the complete phrase **"Teach your child to
  read"** as real DOM text: the visible text line, plus a visually-hidden
  "read" (sr-only span); the SVG word gets `aria-hidden="true"`. If the
  keyword lives only in SVG paths, the entire SEO rationale evaporates.
- `prefers-reduced-motion: reduce`: render the **completed** word statically
  (eyes off or static-on, no cursor blink, no vignette, no celebration).
  Replay-on-tap disabled.
- Follow-up (not this build, decision needed): align the document
  `<title>`/meta description with the phrase. Flag to Colin; don't do it
  unilaterally.

## 6. Copy changes (`src/content/landingPageCopy.ts`)

Replace `hero.title`/`titleHighlight`/`titleSuffix` with something like:

```ts
headline: "Teach your child to",   // visible H1 text line
headlineWord: "read",              // rendered as LetterPeople; also sr-only text
headlineBlankIndex: 0,             // the 'r' — fixed, see §3 "out of scope"
```

Keep `subtitle`, `description`, `pricing`, `cta.*` byte-identical. The
comment blocks in that file are load-bearing documentation — write a
matching comment for the new fields (the Engelmann-mimicry rationale + the
"do not randomize the blank" note) and delete the stale title comment.

## 7. Verification split

- **Agent (mechanical)**: `vue-tsc` clean; build passes; assert rendered H1
  textContent === "Teach your child to read"; no horizontal scroll at 320 px
  (measurable: `document.documentElement.scrollWidth <= innerWidth`);
  reduced-motion branch renders complete word.
- **Colin (perceptual — he does ALL eyeballing; do not screenshot or
  headless-render)**: timing feel of the 2.5 s beat, pop-in "reads as text",
  celebration legibility, H1/word visual flow at each breakpoint, replay
  feel. Land the change, tell him what to look at and what would be wrong.

## 8. Handoff notes

- Suggested driver: **Opus 5** (Colin's call — the layout/reflow risk in §4
  is the reason; the rest is Sonnet-grade).
- Pattern to follow for the controller: `heroGreetingAnimation.ts` (module
  with created controller, cleanup on unmount). Fire on mount + delay;
  intersection-gating only if scroll-restoration makes the vignette fire
  off-screen in practice.
- Reference implementations, all in-repo: blank/underline/cursor markup and
  CSS in `MissingLettersView.vue` template (~lines 57–97); fill animation
  `createLetterAt` (~line 641); celebration (~lines 970–991);
  `src/dbg/questions/MissingLettersDbg.vue` to see the real exercise live.
- No git writes without Colin's say-so.

## 9. Amendment (2026-08-01): tap advances a word ring

Supersedes §3 step 5 ("Replay on tap … re-run from step 2") only. Everything
else above stands.

**Change**: tapping the settled word advances a ring — `read` → `spell` →
`learn` → `read` — instead of re-answering `read`. Each rung poses its own
blank (`_ead` / `s_ell` / `lear_`, blank indices 0 / 1 / 4), fills it, and
celebrates, exactly as §3 describes. Copy lives in
`landingPageCopy.hero.headlineWordCycle`.

**Why a tap and not a carousel** (the version this replaced): an
auto-rotating headline word is a recognizable marketing trope, and a
perpetual cycle contradicts §3 step 4 — the hero must not compete with the
video section below it. A tap keeps the motion budget exactly where it was
(nothing moves unless asked), and turns the existing replay affordance, whose
payoff was previously "the same thing again", into a reason to poke it. The
broaden-the-claim job the rotation would have done is a copy job the right
column already does in text.

**Why these words**: varying the blank position is the one thing a fixed
`_ead` cannot demonstrate — that this is an *exercise type*, not a logo.
`spell` is the most literally honest claim (the app teaches encoding).
`learn` is load-bearing, not vapor: the Letters model the learning process
itself (trying again, sequencing, revisiting) — cf. the post-session
vignettes in the scrollytell narrative.

**Invariants this must not break** (all still §5):
- The sr-only span stays the literal string `read`. It is the H1's keyword,
  not a readout of animation state. Do not bind it to the ring.
- `read` is canonical: first paint, and the state the word rests in. A
  visitor who never taps sees exactly the pre-amendment hero.
- Blank choice follows the §3 rule — an uncontroversial single-letter
  grapheme, never a vowel team. `s_ell` takes the `p`; `lear_` takes the
  final `n`, leaving the r-controlled `ear` intact and unremarked.
- `--hr-h` is fit to the **widest** word in the ring, not the current one.
  Fitting per-word would resize the letters mid-ring, and a fit taken from
  4-char `read` lets 5-char `spell` overflow at 320px.
- Reduced motion: unchanged. Static completed `read`, tap disabled.

## 10. Amendment (2026-08-01): the encore tier

Extends §9. The ring is now two tiers:

| Tier | Words | Shape | Rest-able? |
|---|---|---|---|
| 1 — claims | `read`, `spell`, `learn` | posed exercise: blank → cursor → fill → celebrate | yes |
| 2 — encore | `juggle?`, `dance!` | arrives complete, then performs | **no** |

**Encores are not exercises and must not cosplay as one.** No blank, no
cursor, no fill. The word simply arrives whole — which is itself the signal
that the rules changed — and then the Letters do the thing. Posing `j_ggle`
as a blank would be claiming we teach juggling.

**The acts are real systems, not bespoke hero animation.** `juggle?` runs
`cascadePhrase` (`transforms/juggling/phrases/`) on the `j`; `dance!` runs
`floss` (`animations/floss.ts`) across the whole word as a chorus line, one
beat of offset per letter. The floss was extracted out of
`src/dbg/FlossDebug.vue` for this — that view now imports the shared beat, so
re-tuning it there re-tunes what the hero performs. The juggling module is
dynamically imported; it must never land in the landing page's first paint.

**Abandonment.** An encore that is not tapped onward within `RETURN_HOME_MS`
(6 s) snaps quietly back to `read` — complete, no exercise, no celebration,
because the visitor has already looked away. "Teach your child to juggle?" is
a fine joke and a terrible hero, and it is the state that would otherwise get
scrolled past or screenshotted.

**Sizing.** §9's "fit to the widest word" now means the widest **tier-1**
word. Encore words may be longer (`juggle?` is 7) and squish themselves via
`bindingWidthPerH`. The resting `read` renders at exactly the size it did
before this amendment — a joke rung must never tax the hero everyone sees.

Punctuation (`?`, `!`) renders through the existing punctuation glyphs. In the
floss they dance from the hips only (`bodyOnly`) — arms on a `!` read as
flailing, not dancing.

## 11. Amendment (2026-11-13): discoverability hints

Extends §9. The tap ring had no hint on touch and only a pointer cursor on
desktop, so almost nobody would find it. Two hints, both in character and
neither of which changes the word:

- **One idle nudge.** If the visitor hasn't tapped `NUDGE_MS` (6.5 s) after the
  opening sequence settles, the letters each do one small hop, left to right,
  as if someone had knocked. Once per page load; never after a tap; skipped if
  the word is off screen (IntersectionObserver) or the tab hidden at that
  moment. Timed to fall between the first settled wave and the second.
- **Hover (mouse/pen only).** While the pointer is on the word, the row lifts
  3px and the letters perk up (brows up, mouths open); they settle when it
  leaves. Touch pointers are ignored: a touch "hover" is the start of a tap.

**Rejected: auto-advancing**, even once (e.g. `read` → `spell` → back on
idle). It is §9's carousel in a smaller dose, and it changes the headline's
claim without being asked. Also rejected: a text hint ("tap the word").

Invariants unchanged: `read` is the only resting state anyone sees without
tapping, and reduced motion gets neither hint (no `play()`, so no nudge; the
row isn't `--replayable`, so no hover).
