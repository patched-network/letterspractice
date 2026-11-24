# Storyboarding Reference

Extracts the storyboards (step sequences) from existing Lesson components for reference when developing new Lesson curricula. Storyboards are defined as the `STEPS` array in each Lesson, dictating dialogue, sound playback, and completion flow. Choreography triggers via `onEnter` callbacks are noted per step.

---

## HelloWorldLesson.vue

**Purpose**: Introduce letters `h` and `i`, their individual phonemes, and combining sounds to form the word "hi".

**Actors**: `h`, `i`

**Storyboard**:

| Step | Kind | Actor(s) | Content | Audio | Choreography Trigger |
|------|------|----------|---------|-------|----------------------|
| 1 | dialogue | h | "Do you know us?" | - | - |
| 2 | dialogue | i | "We're letters!" | - | - |
| 3 | dialogue | h | "Our job is to make sounds." | - | - |
| 4 | dialogue | i | "Try it out — press the buttons over our heads, or keep using the spacebar!" | - | - |
| 5 | phoneme | h | Play `h` phoneme | `getPhonemeAudioUrl('HH')` | - |
| 6 | phoneme | i | Play `i` phoneme | `getPhonemeAudioUrl('AY')` | - |
| 7 | dialogue | h | "We put our sounds together to make a word." | - | - |
| 8 | word | h, i | Play "hi" word audio (timed letter pulses via `computeSpeakerTimingsForWord`) | `/audio/words/hi.mp3` | `walkTogether()` on enter (h + i walk to centered positions before the word surfaces; deferred off step 7 so the balloon isn't anchored to moving letters) |
| 9 | dialogue | i | "Most letters have a favorite sound that they like to make." | - | - |
| 10 | dialogue | h | "Let's start learning some letter sounds!" | - | - |
| 11 | complete | - | Lesson complete | - | - |

---

## DigraphLesson.vue

**Purpose**: Introduce digraphs (letter teams making one sound) using SH as the sole exemplar, with `ship` and `fish` as usage examples. Each word steps through its phonemes (one advance each) before the whole-word recording.

**Actors**: Core: `s`, `h`; Word extras: `i`, `p` (ship), `f`, `i2` (fish — `i2` is a second `i` actor so `fi` can walk in from stage left while `ip` is still walking off to stage right).

**Layout**: `sh` stays anchored at the centered-pair position throughout both words. Each word forms off-center: `ship` extends right of sh, `fish` extends left of sh.

**Storyboard**:

| Step | Kind | Actor(s) | Content | Audio | wordOrder | Choreography Trigger |
|------|------|----------|---------|-------|-----------|----------------------|
| 1 | dialogue | s | "Wow, you've been learning a lot of letter sounds!" | - | - | - |
| 2 | dialogue | s | "Most of the time, each letter makes its own sound..." | - | - | - |
| 3 | dialogue | s | "...but sometimes, a letter teams up with a friend to make a sound together." | - | - | `choreographyHWalksIn()` (h walks onstage, pairs with s; in 3D they then hold hands, and keep holding for the rest of the lesson) |
| 4 | dialogue | h | "Like us! Watch this —" | - | - | - |
| 5 | phoneme | s, h | Play SH phoneme | `getPhonemeAudioUrl('SH')` | - | - |
| 6 | dialogue | s | "Like in this word." | - | - | `choreographyShipWalkIn()` (i, p walk in from stage right; sh stays put) |
| 7 | phoneme | s, h | Play SH phoneme (in-word) | `getPhonemeAudioUrl('SH')` | - | - |
| 8 | phoneme | i | Play IH phoneme | `getPhonemeAudioUrl('IH')` | - | - |
| 9 | phoneme | p | Play P phoneme | `getPhonemeAudioUrl('P')` | - | - |
| 10 | word | s, h, i, p | Play "ship" word audio (timed letter pulses) | `/audio/words/ship.mp3` | ['s', 'h', 'i', 'p'] | - |
| 11 | dialogue | h | "And in this one too —" | - | - | `choreographyShipOutFishIn()` (i, p exit stage right while f, i2 walk in from stage left, concurrent) |
| 12 | phoneme | f | Play F phoneme | `getPhonemeAudioUrl('F')` | - | - |
| 13 | phoneme | i2 | Play IH phoneme | `getPhonemeAudioUrl('IH')` | - | - |
| 14 | phoneme | s, h | Play SH phoneme (in-word) | `getPhonemeAudioUrl('SH')` | - | - |
| 15 | word | f, i2, s, h | Play "fish" word audio (timed letter pulses) | `/audio/words/fish.mp3` | ['f', 'i2', 's', 'h'] | - |
| 16 | dialogue | h | "Letter teams are fun to spot. Let's go meet some more!" | - | - | - |
| 17 | complete | - | Lesson complete | - | - | - |

---

## SplitDigraphLesson.vue

**Purpose**: Introduce the split-digraph (silent-e / "magic e") pattern. Frames silent-e as another kind of letter team — a sneaky one that tucks at the end of a word and changes the vowel's sound while staying silent itself.

**Curriculum constraint**: Reveals avoid letter-name idioms ("a says its name") since names aren't taught in this app. Sound change is described directly.

**Actors**: Host: `e`. Cameo (Beat 1): `s`, `h`, `q`, `u`. Word letters: `c`, `a`, `p`, `k`, `i`, `t`. Reused letters share a single Actor instance.

**Pairs**: cap → cape (a_e), kit → kite (i_e; was pin → pine, swapped 2026-09-25 for the stronger kite picture in the 3D rework). Pair 4 (hop → hope) wired but commented (its swap still names cub → cube's letters).

**Storyboard**:

| Step | Kind | Actor(s) | Content | Audio | Choreography Trigger |
|------|------|----------|---------|-------|----------------------|
| 1 | dialogue | e | "Hi!" | - | - |
| 2 | dialogue | e | "You've learned how some letters team up to make a sound." | - | `choreographyDigraphCameo()` (sh + qu pop in, wave, exit — concurrent with dialogue) |
| 3 | dialogue | e | "I like to team up too — but in a sneaky way." | - | - |
| 4 | dialogue | e | "When I do, my friend makes a different sound — and I stay quiet." | - | - |
| 5 | dialogue | e | "Watch me sneak up on some words!" | - | `choreographySetupWord(['c','a','p'], 'a')` (word walks in centered; e slides to right side) |
| 6 | word | c, a, p | Play "cap" word audio (timed letter pulses via `wordStep('cap', …)`) | `phonetics.audioUrl` | - |
| 7 | dialogue | e | "Now watch what happens..." | - | `choreographyEArrives('a')` (row + e re-center together; `a` color → long-vowel hue; 3D: once e is in its place its cap becomes a cape and `a` gets a matching one, then e covers its mouth with its right hand, uncovering when it next speaks) |
| 8 | word | c, a, p, e | Play "cape" word audio; `e` triggers `silent-e` effect (no speak) | `phonetics.audioUrl` | - |
| 9 | dialogue | e | "Hear that? My friend's sound changed!" | - | - |
| 10 | dialogue | e | "It works with other letters too." | - | `choreographySwapWord(['c','a','p'], ['k','i','t'], 'i')` |
| 11 | word | k, i, t | Play "kit" word audio | `phonetics.audioUrl` | - |
| 12 | dialogue | e | "Here I come..." | - | `choreographyEArrives('i')` (3D: once in the word, e covers its mouth with its right hand, uncovering when it next speaks) |
| 13 | word | k, i, t, e | Play "kite" word audio; `e` triggers `silent-e` effect | `phonetics.audioUrl` | - |
| 14 | dialogue | e | "I'm a sneaky one. Let's go find more words like these!" | - | - |
| 15 | complete | - | Lesson complete | - | - |

---

## 04.FinalOpenVowelsLesson.vue (implemented 2026-07-13; rebuilt 2026-07-14; promoted to the active catalog 2026-07-15)

**Purpose**: Introduce the final-open-vowel pattern: a vowel standing at the
very end of a word makes its *changed* sound all by itself — no sneaky e
needed. Direct sequel to SplitDigraphLesson with the same host (`e`) and the
**inverse mechanic**: there, e *arrives* at the end and changes a friend's
sound while staying quiet; here, e *leaves*, the vowel ends up final, and
makes the changed sound out loud itself.

**Shape: a 3×2 comparison, not a ladder.** All three exemplars are on stage
at once, one per depth row. Trio 2 is trio 1 with the last two letters peeled
off every word — simultaneously.

|   | trio 1 (e does it) | trio 2 (the vowel does it alone) |
|---|---|---|
| i | `hide` — i_e → AY | `hi` — i → AY |
| o | `note` — o_e → OW | `no` — o → OW |
| e | `here` — e_e → IY | `he` — e → IY |

The single choreographed event of the lesson is that peel: three consonants
and the whole column of silent e's walk off together, leaving three vowels
stranded at three word-ends, still saying the same sounds, with no e anywhere
on stage. **That mass exit is the argument.**

**Curriculum constraints**:
- No letter-name idioms (orientation #7 / D7 in `agent/lessons-audit/b.1`).
  **Sharper corollary, standing authoring rule: no letter labels in dialogue
  text at all** — the parent reads lines aloud, so a written "o" gets spoken
  as a letter *name*. Staging carries the addressee. (The live lessons
  already follow this; no letter is ever named in their dialogue.)
- **Slate restricted to e / i / o** (b.1 D9). Exemplar GPCs: `e-IY-final`
  (he, me, we, she, be), `o-OW-final` (no, go, so), `i-AY-final` (hi). Each
  is phonemically identical to the split-digraph fact the child already
  holds (e_e-IY, i_e-AY, o_e-OW). `a` and `u` are excluded because they are
  exactly the two that *don't* line up: a-final is schwa (a_e is EY), and
  u-final doesn't occur. `y` is excluded and is its own future idea (D9).
  Remaining slate members (a-finals, i-IY, y-finals) are uncarded/inert.
- **No short-vowel rung.** The closed-syllable contrast (hid / not) is *not*
  staged. By the time this lesson unlocks, the child has drilled short vowels
  across the whole exercise rotation, so the referent is in their head, not
  on the stage (Colin, 2026-07-14). Consequence: nothing on stage ever says a
  short vowel, so the argument is carried by **what leaves** — not by a sound
  (or a color) changing.
- All six words have recordings **and** `audioTimingMs`. **No audio gap.**
  (`hid` was the old draft's one missing recording; it is no longer used.)

**Actors**: Host: `e` (returning split-digraph trickster), downstage left.
Word letters are **word-scoped, not letter-scoped** — three words share the
stage, so `h` and `e` each appear more than once:

- row 1 (`hide`): `hide-h`, `hide-i`, `hide-d`, `hide-e`
- row 2 (`note`): `note-n`, `note-o`, `note-t`, `note-e`
- row 3 (`here`): `here-h`, `here-e1`, `here-r`, `here-e2`

**Four e-actors.** The phonetic index chunks `here` as a genuine `e_e`
(letters `{1: speak, 3: silent-e}`), so its vowel-e (`here-e1`) and its
silent-e (`here-e2`) are different characters — and it is `here-e1` that is
still speaking in `he`.

**Color = who, not what-role.** Four evenly-spaced hues (base, +90, +180,
+270): one per exemplar word, one for the host. Each word is a solid color.
Tinting by *role* (vowel / consonant / silent-e), the way SplitDigraphLesson
does, is right for one word on stage but reads as a checkerboard across three
(Colin, 2026-07-14). The audio button takes the active row's hue, so its color
says which word is speaking. Consequence to be aware of: the silent e's are no
longer color-matched to the host, so the peel reads as "each word drops its own
ending" rather than "the e's leave together" — the mass exit still carries it,
but the e-column is no longer picked out by color.

**Letter order** matches the index's letter positions in all six words:
index 1 is the vowel, index 3 is the silent e, and trio 2 is always
`ids.slice(0, 2)`.

**Layout**: rows sit at z = 30 / 60 / 90 with the horizon pulled to 0.1 to
make room. Stage scale is `0.6 + 0.004z`, so each row's letter height is set
to `APPARENT_H / scale(z)` — all three rows then render at the same on-screen
size despite different depths. `x` is applied unscaled with transform-origin
bottom-center, so `layoutRow()` converts desired screen edges back through
that scale. The host sits at z=96 (in front of the stack) at 1.5× size.

**Storyboard**:

| Step | Kind | Actor(s) | Content | Audio | Choreography Trigger |
|------|------|----------|---------|-------|----------------------|
| 1 | dialogue | e | "Hey! Remember how I help some letters make a new sound?" | - | `choreographyStageTrio1()` — all 12 word letters walk in from the right, staggered by row, into three depth rows; host steps downstage left |
| 2 | word | hide-* | Play "hide" — `hide-e` triggers `silent-e` effect | `/audio/words/hide.mp3` | - |
| 3 | word | note-* | Play "note" — `note-e` triggers `silent-e` effect | `/audio/words/note.mp3` | - |
| 4 | word | here-* | Play "here" — `here-e1` speaks, `here-e2` triggers `silent-e` | `/audio/words/here.mp3` | - |
| 5 | dialogue | e | "At the end of a word, those letters like to make that same sound all by themselves!" | - | **`choreographyPeelToTrio2()` — THE money shot.** Every row sheds `ids[2]` and `ids[3]` at the same moment: three consonants + three silent e's walk off right together; the surviving pairs re-center in their rows |
| 6 | word | hide-h, hide-i | Play "hi" — i pulses /aɪ/ | `/audio/words/hi.mp3` | - |
| 7 | word | note-n, note-o | Play "no" — o pulses /oʊ/ | `/audio/words/no.mp3` | - |
| 8 | word | here-h, here-e1 | Play "he" — the vowel-e now speaks alone | `/audio/words/he.mp3` | - |
| 9 | dialogue | e | "Let's go find more words like these!" | - | - |
| 10 | complete | - | Lesson complete | - | - |

**Content weight** (via `summarizeLessonSteps`, visible in `/dbg/lesson`):
**35 dialogue words · 6 audio events · 9 beats.** For comparison, the
laddered draft this replaced measured 95 / 7 / 19 — heaviest lesson on every
axis, in a series whose first lesson is 40 / 3 / 10. The rebuild makes 04 the
*lightest* lesson on dialogue while carrying the most phonetic content per
beat: three dialogue lines, six word playbacks.

**Implementation notes**:
- Only two choreography functions: `choreographyStageTrio1()` and
  `choreographyPeelToTrio2()`. There is no per-word swap — the stack is built
  once and peeled once.
- The runner's audio button and `lesson-actor--active` highlight key off each
  word step's actor ids, so they follow the active row automatically.

---

## SightWordsLesson (lesson 5; live 2026-09-29; 3D-only)

**Files:** `sightWordsSteps.ts` (steps), `three/SightWordsLesson3D.vue`
(staging), `three/slidePlay.ts` (the background play). Preview:
`/dbg/lesson/three` → "05 · Sight words". No SVG lesson (`THREE_D_ONLY`
in `index.ts`).

**Purpose**: Introduce the idea that some important words don't sound the way
they're spelled, and that the app will point them out one at a time (each
sight word then gets its own intro card). The lesson doesn't teach any word
for keeps; *was* is the demonstration.

**The metaphor**: a playground. The letters of *was* take turns on a slide
(line up, hop up the steps, slide down, go round again). "Rules" is the
hinge: the dialogue's sound rules and the playground's rules. The letter that
breaks the playground rule, `a`, running up the slide, is the letter that bends
the sound rule in *was*. At the end the three players line up as the word.

**Actors**:
- `A` (capital): narrator, in front of the steps (world x −150, z −50; was a
  lane of its own downstage left, compacted 2026-09-28). The grown-up: capitals have never
  appeared in the app before; exposure only, no new responsibility for the
  learner. Shares `a`'s hue (grown-up and child).
- `w`, `a`, `s`: the players (`slidePlay.ts`). Hues a third of the wheel
  apart; `a` matches `A`.

**Storyboard** (all built in 3D; each act starts with its line and plays on
while it's read, and the press after it waits for the act, its button hidden
until then):

| Step | Kind | Actor(s) | Content | Audio | Choreography Trigger |
|------|------|----------|---------|-------|----------------------|
| 1 | dialogue | A | "You have learned a lot of rules for how we make sounds." | - | The play is already running when the lesson opens (turn order s → a → w, for good), and runs 2.5 s before this line (the narrator pops its face in meanwhile): turn-taking is what's seen first |
| 2 | dialogue | A | "Like this one!" | - | `aToAnEnd` starts: `a` goes to the nearer end of the slide and the play holds there (everyone finishes their move, faces out, stops). Bottom if `a` has just slid (sliding, or on its first hop back: it returns to where it landed, keeping the chute); top otherwise |
| 3 | phoneme | a | a's usual sound, `a` at the top or the bottom of the slide | `getPhonemeAudioUrl('AE')` | waits for `aToAnEnd` (median 1.9 s, worst 6.3 s over 40 trials; top 30, bottom 10) |
| 4 | dialogue | A | "We try our best. But sometimes rules get broken." | - | `misbehave` starts: `s` makes its own way to its place in the word at the slide's foot (round behind the slide if it's left of it, jumping down off the back of the steps if it was climbing; nothing waits for it until the word forms); `a` (sliding down first if it's on top) hops onto the run-out and climbs back up the chute (bobs, slips back once), stopping just short of the top; `w`, next in turn, arrives above it. Face to face: `a` grins, `w` glares, they look at each other; `A` rolls its eyes as the climb starts. The face-off then plays on (random moves every ~1 s) until step 6: `w` irate (stamping hops with fists up and a tremble; jabbing an arm at `a`, mouth going; turning to `A` with arms spread and pleading brows), `a` obnoxious (bouncing on the slope laughing, arms up; a taunting wave; a grin at the audience with a smug wiggle), `s` watching `a`. It holds still while a sound plays |
| 5 | phoneme | a | a's sound in *was* (the sound the learner knows as u's), `a` up the chute | `getPhonemeAudioUrl('AH')` | waits for `misbehave` (~5.3 s from the top, less from the bottom), then `closeUp`: the camera moves in on `a` and `w` (0.9 s), looking down more steeply (elevation 0.4 vs 0.16), and the button appears. Meanwhile, out of shot (setting off 250 ms in, 1.7 s), `A` walks to where it narrates the word from (world 172, −130: in front of the word and to its left). In the play's view the chute hides `a`'s mouth, 14–21 px wide; in the close-up it's clear and 36–49 px |
| 6 | dialogue | A | "There are some important words that do not really sound the way they are spelled." | - | `pullBack`: the camera pulls back to frame `A` and the word (0.9 s), not the whole playground; the sliders arrive into it. `lineUp` starts: `a` gives up (sheepish), slides down from where it got to and hops along to its place; `w` slides down after it and stays where it stops, which is its place: *was* stands along the slide's centre line past its foot, anchored on `w`'s landing (no walk for `w`). Each one's arms shrink away as it settles into its place (three letters' arms together were busy) |
| 7 | word | w, a, s | Play *was* whole (not stepped; its `s` says /z/, and the two `a` presses already did the zooming in) | `/audio/words/was.mp3` | waits for `lineUp` (~6.5 s) |
| 8 | dialogue | A | "Do not worry! We will start pointing these words out, and practice them, so you can spot them out in the world." | - | - |
| 9 | complete | - | Lesson complete | - | - |

**Content weight** (`summarizeLessonSteps`): 61 dialogue words · 3 audio events · 8 beats.

**Decisions (Colin, 2026-09-28):**
- Hold, not freeze (a freeze has charm; revisit later). The play runs on until
  `a` is on top before holding, so every letter's place at step 4 is known.
- Contractions spelled out in this lesson's copy (modestly deliberate).
- *was* isn't stepped; the two `a` presses cover the odd sound.
- Fallback if *was* doesn't read at its size upstage: a short camera move to
  crop to the word for step 7, then back out to include the narrator.

**Staging notes:** the word forms past the slide's foot, arriving in order
from the far end (`s`, then `a`, then `w` last, landing in its place), so no
one crosses a letter already standing. A letter going there from left of the
slide goes round behind it (cutting in front, a hopper, turned part-way to its
travel, would clip the steps). On the platform letters stand 6 right of centre,
clear of a wide `w` on the top step. The climber keeps a wall's width back of
the chute's centre line (clear of the near wall; it dips into the far one,
hidden behind itself).

**Open:**
- A's speech balloon sits to A's **right** through step 4, its tail at A's
  mouth (on the crossbar), and **above** A from step 6's line on (the action
  has moved to the word forming on the right). Capped at 380 × 130 px
  (`Actor3D.balloonPlacement`; balloons otherwise grow to fill the space
  they're given, which over a low, central A was most of the view). Measured
  cover (worst case: the cap filled): never `a` on top or the face-off; the
  climb halfway up 38–55%. Over the word (step 6 on, above A at its new
  spot): none, at 2.2 / 1.4 / 0.9. The slide was also raised
  (platform 96 → 144, `SLIDE.rise` 32 → 48; steepest 48°; friction retuned).
  Fallback if narrow screens still crowd: A at (−300, −50) with the balloon
  above in landscape, captions and no A in portrait.
- A's body covers 38–45% of a letter on the bottom step as it climbs.

**Checks:** `agent/threejs-letterpeople/scripts/sight-words-acts.mts` (the
three acts from random moments: where each ends, bodies never overlapping,
nothing hanging), `slide-play.mts` (hops, the slide run, the play over two
simulated minutes, holds at random moments, narrator clear of the players,
framing at 2.2 / 1.4 / 0.9) and `slide-fit.mts` (the slide's geometry and the
set). `/dbg/lesson/three` has a stage-grid toggle for placements in world
numbers.

---

## BedLesson (lesson 1a, "Making our bed"; id `bed`; 3D-only)

**Files:** `bedSteps.ts` (steps), `three/BedLesson3D.vue` (staging),
`letterpeople/three/bedProp.ts` (the bed's sheet and its invisible plank),
`clothSim.ts` (the sheet's cloth), `bedroomProps.ts` (end table, lamp),
`snore.ts` (the floating z's), `environments.ts` "bedroom" (the room).
Preview: `/dbg/lesson/three` → "1a · Making our bed (b/d)".

**Purpose**: The b/d mnemonic. The word *bed* is a bed seen side-on: b's stem
the headboard, d's stem the footboard, a sheet lying across the bowls. A
sub-lesson of hello-world (1a), not a new decoding idea: b stays a
hello-world letter, and the lesson stands in front of its intro card
(`LESSON_GATED_CARDS` in curriculum.ts; decision log
`agent/lessons-audit/b.1` D3). Offered once d has some use and exposure and
e is introduced (the copy leans on both); b's intro, its sound card and the
b/d mirror pair open the next practice session. b-specific on purpose: n/u
are left alone (young children don't treat orientation as distinguishing,
and u/n are one shape under rotation).

**Set**: a low-poly bedroom at night: the window in the middle of the back
wall, above the bed (moon and stars; dawn comes up in it); framed pictures
either side, b things at the head end (bear, bat) and d things at the foot
(dog), with the bedroom door on that side too; floorboards and a rug. The bed
(b, e, d in one wood brown, faces hidden) under a sheet; an end table at the
head end with a lamp and a stack of books. Stage lights dimmed to 0.22 for
night.

**Actors**: `i` (asleep on the bed: lying on its back, dot toward the
headboard, eyes shut, snoring z's; then the host, standing well clear of the foot
of the bed, so the whole bed is in view and i doesn't read as a fourth letter;
its hue is kept at least 80° from the bed's brown); `b`, `e`, `d` (the bed).

**Storyboard** (draft copy):

| Step | Kind | Actor(s) | Content | Audio | Choreography Trigger |
|------|------|----------|---------|-------|----------------------|
| 1 | beat | - | Opening: the dark bedroom, i asleep on the bed; its mouth opens on each in-breath and a little z floats up on each out-breath | - | - |
| 2 | beat | i | The lamp goes on; i wakes, sits up, stretches and leaps over the footboard | - | `wakeUp` (next press waits): lamp clicks on (a flicker), room to 0.5; snoring stops; eyes flutter open; i swings upright onto its feet, stretches with a yawn, leaps over the footboard to stand well clear of the foot of the bed. Then dawn starts (not waited for): night to day in the window over 9 s, the room brightening to full |
| 3 | dialogue | i | "Good morning! I was just sleeping in my..." | - | - |
| 4 | word | b, e, d | The sentence finishes with the whole word, from the bed (still under its sheet; the button floats over the bed). No touch-replay hint finger after it (`touchReplay: { hint: false }`) | `/audio/words/bed.mp3` | - |
| 5 | dialogue | i | "The word bed has two letters you already know, and one new letter who is tricky in a new way." | - | - |
| 6 | phoneme | b | b's sound | `getPhonemeAudioUrl('B')` | `pullSheet` (before the button shows): i hops in to the foot of the bed, takes the sheet's front corner and whips it off up and away over its head; i hops back out to its spot as the bed's letters wake, head to foot |
| 7 | phoneme | e | e's sound | `getPhonemeAudioUrl('EH')` | - |
| 8 | phoneme | d | d's sound | `getPhonemeAudioUrl('D')` | - |
| 9 | dialogue | i | "These letters can be easy to mix up, especially for beginners." | - | `mixUp` (next press waits): b and d hop forward, sheepish (eyes down, sad brows, a little smaller; a glance at each other); e stays put and looks from one to the other |
| 10 | dialogue | i | "So we will do some special practice to tell them apart." | - | `together`: b and d back in the row, cheered up |
| 11 | dialogue | i | "And you can make your bed to help you remember." | - | `makeBed`: i flicks its arms and a fresh sheet floats down over the bed; the bed's faces settle back under it |
| 12 | dialogue | i | "Two thumbs up, and put your knuckles together. A bed!" | - | `bedHands` (next press waits): the camera closes in on i (`Stage3D.shotTo`; on a wide screen i sits left of centre with its balloon beside it, on a tall one centred with its balloon above); i turns square to the camera, smiles, and makes the bed hands: its ball hands pop into fists, thumbs up, knuckles together in front of its middle (`fist.ts` `bedHands`; seen from the front, the left fist is a b and the right a d) |
| 13 | complete | - | Lesson complete | - | - |
