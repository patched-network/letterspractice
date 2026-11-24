<!--
  SessionWalkthroughSection.vue

  A scroll-driven "scrollytell" that walks a visitor through what a 2-5 minute
  session actually looks like. A single phone mockup stays pinned (sticky) on
  one side while narration beats scroll past on the other; the phone's contents
  crossfade to match the active beat.

  Ported from the `landing-identity-reframe` design mockup (Claude Design / x-dc)
  into idiomatic Vue 3 + Vuetify. Replaces the old two-column UserExperienceSection.

  FIDELITY NOTE (intentional, to be upgraded incrementally):
    - The in-phone visuals (chop/chip cards, the keyboard footer, and the
      session-wrap / progress mocks) are STYLIZED stand-ins, not the real app
      surfaces. The keyboard in particular is over-simplified. The plan is to
      swap these for real running questions / more faithful mocks over time.
    - Beat 01 embeds the REAL WhoSaidThatView (preview mode).
    - Beat 02's teaching scene is the Hello World lesson's opening on the real
      three.js stage, with the real speech balloons (three/LessonPreview3D.vue),
      loaded after the page settles. Where 3D isn't available or hasn't loaded
      yet, it's two SVG LetterPeople (WordDisplay) with CSS mock balloons.
    - Beat 03 drops the phone altogether for a drawing of the printed fridge
      sheet (FridgeSheetMini.vue), which colours in as the beat scrolls by;
      beat 04 brings the phone back for the real session-end JJugglingVignette.
    - The keyboard is the real one, on a simulated learner's keys (mlKeys):
      an ML sample shows only the keys a learner has when its word comes
      within reach.
-->
<template>
  <section
    ref="rootEl"
    class="session-walkthrough"
    :class="{ 'sw-dbg': swDbg }"
    data-screen-label="Tour"
  >
    <!-- Section header -->
    <div class="sw-header">
      <!-- The title is already phrased as the visitor's own question, so it
           needs no label pointing that out (eyebrow removed 2026-07-31 as
           part of the site-wide de-LLMify pass — see landing-revisions.md). -->
      <h2 class="sw-title">Can you really learn to read with two minutes a day?</h2>
      <!-- Lede answers the title with an honest "No.", claims the narrow
           mechanical carveout (the part computers are good at), hands the
           social/cultural half of reading to the parent, then states the aim:
           that carveout is what makes two minutes/day defensible. -->
      <p class="sw-lede">
        <strong>No.</strong> Raising a reader is a social and cultural effort as well as a technical one.
      </p>
      <p class="sw-lede">
        Here, we focus on the technical mechanics of reading. These are simple in isolation (&nbsp;s says <em>SSSS</em>&nbsp;), but complex in concert. Computers are great at sifting and managing this kind of complexity.
      </p>
      <p class="sw-lede">
        The social and cultural aspects of reading? Story, character, laughter, and experiencing the wider world through print are a different kind of human complexity. We are skeptical that screens are the right medium here, and we don't want to eat any of the time better spent on a lap with a real book.
      </p>
      <p class="sw-lede">
        With our <strong>minutes-per-day</strong>, our aim is to build reading mechanics in a way that is automatic, relatively painless, and visible to both parent and child.
      </p>

      <!--
        (Dose policy: the minute-per-year-of-age link now lives in the hero
        description; a fuller lede version here was cut 2026-07-07 as redundant.
        Still unstated anywhere: the 6-minute cap, sessions self-terminating
        (no streaks / "one more round"), and the app being cognitively
        *demanding* rather than cutesy-gamified — short frames respect young
        attention spans and mental fatigue.)

        PRIOR LEDE DRAFTS (kept for reference):
        - (live until 2026-09-19, after the "No." line) "Funny voices, cozy
          armchairs, and a shared love of stories and characters — that part
          belongs to you and yours. We don't want that job: a screen doing
          story time is a poor substitute for a lap and a real book." / "What
          we *do* target is the technical **mechanics** of reading, which are
          simple in isolation ( s says SSSS ), but complex in concert.
          Accounting for what is and isn't known, scheduling the introduction
          of new facts or review of old ones - these are things that computers
          are very good at." / "We **put this on rails** so that you can focus
          on the fun stuff."
        - "Computers are great at certain tasks, but we want to be upfront:
          learning to read should not primarily be a screen-time thing."
        - "Up front: we don't want to be an *everything app* of reading
          instruction. We leave the best parts - laughing - to a child's most
          important teacher - their loving adult. Reading is a cultural act as
          much as a technical one - and that acculturation should [...]. What we
          do here is efficient management of the technical and mechanical aspects
          of reading - using computation effectively in the domains where it
          shines."
        - Prior title: "What can we do in two minutes?"
      -->
    </div>

    <!-- scrollytell grid -->
    <div class="sw-grid">
      <!-- sticky visual -->
      <div ref="stickyEl" class="sw-sticky">
        <div class="sw-stage-col">
        <div class="sw-stage-wrap" :class="{ 'sw-stage-wrap--paper': onPaper }">
          <!-- Persistent phone shell: the chrome (frame + header) is rendered ONCE
               here and never fades. Only the body content crossfades between beats,
               so every transition behaves like the rock-stable within-layer 0→1
               swap — frame, header, and dots stay put throughout. -->
          <!-- The off-screen beat swaps the device for the printed fridge sheet:
               the phone fades out, the stage's shell backdrop goes transparent,
               and the paper drops in pinned by a magnet. Sits inside the stage
               wrap so it inherits the mobile scale transform for free. -->
          <div class="sw-paper" :style="paperStyle">
            <span class="sw-magnet" aria-hidden="true"></span>
            <FridgeSheetMini :coloured="sheetColoured" />
            <RouterLink to="/fridge-sheet" class="sw-paper-note" data-track="cta:fridge-sheet">Get the free printable →</RouterLink>
          </div>
          <div class="sw-phone" :style="phoneStyle">
            <!-- phone header (persistent across all beats) -->
            <div class="sw-phone-header">
              <!-- Window/app dots: abstract chrome that gestures at a browser
                   window (and pairs with the cog as "settings") without committing
                   to a literal phone — the frame should read as web *or* app, since
                   the product is a responsive webapp, not a native mobile app. -->
              <div class="sw-winbtns" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <div class="sw-dots">
                <span
                  v-for="n in beats.length"
                  :key="n"
                  class="sw-dot"
                  :class="{ 'sw-dot--on': n <= beat + 1 }"
                ></span>
              </div>
              <v-icon size="22" class="sw-muted">mdi-cog</v-icon>
            </div>

            <!-- body: crossfading content layers (practice + lesson / vignette) -->
            <div class="sw-body">
              <!-- SCREEN body (practice + lesson beats) -->
              <div class="sw-layer" :style="screenStyle">

              <!-- stage: a carousel of exercise types (the "catalog").
                   Mouse movement over the mock pauses auto-advance (desktop);
                   touch pins it (mobile). -->
              <div
                class="sw-stage"
                @mousemove="onStageMouseMove"
                @mouseleave="releaseCarousel"
                @pointerdown="pinCarouselOnTouch"
              >
                <!-- One live exercise at a time (the active carousel item), so
                     the shared keyboard context has a single owner. out-in keeps
                     teardown→setup ordering clean. Each Q renders its own title,
                     so there's no separate badge. -->
                <div ref="slidesEl" class="sw-slides">
                  <transition
                    name="sw-fade"
                    mode="out-in"
                    @enter="updateFit"
                    @after-enter="updateFit"
                  >
                    <component
                      :is="liveView"
                      :key="liveKey"
                      :data="liveData"
                      preview
                      class="sw-live"
                      :style="fitStyle"
                      @emitResponse="onLiveResponse"
                    />
                  </transition>
                </div>

                <!-- LEARN dialog overlay (beat 1): 2D, where the 3D scene
                     isn't up (see lessonScene) -->
                <transition name="sw-fade">
                  <div v-if="showDialog && lessonScene === '2d'" class="sw-dialog">
                    <div class="sw-teach">
                      <div class="sw-teach-actor">
                        <div class="sw-speech-slot">
                          <transition name="sw-balloon">
                            <div v-if="teachReveal >= 1" class="sw-speech">
                              {{ TEACH_CAST[0].line }}
                            </div>
                          </transition>
                        </div>
                        <WordDisplay
                          text="h"
                          :height="120"
                          :options="teacherOptionsH"
                          accessibility-text="the letter h"
                        />
                      </div>
                      <div class="sw-teach-actor">
                        <div class="sw-speech-slot">
                          <transition name="sw-balloon">
                            <div v-if="teachReveal >= 2" class="sw-speech">
                              {{ TEACH_CAST[1].line }}
                            </div>
                          </transition>
                        </div>
                        <WordDisplay
                          text="i"
                          :height="120"
                          :options="teacherOptionsI"
                          accessibility-text="the letter i"
                        />
                      </div>
                    </div>
                  </div>
                </transition>

                <!-- LEARN dialog in 3D: mounted (hidden) once its chunk loads,
                     its stage built at idle, so entering the beat only starts
                     the animation -->
                <div
                  v-if="LessonPreview3D"
                  class="sw-dialog-3d"
                  :class="{ 'sw-dialog-3d--on': showDialog && lessonScene === '3d' }"
                  aria-hidden="true"
                >
                  <component
                    :is="LessonPreview3D"
                    :cast="TEACH_CAST"
                    :active="showDialog && lessonScene === '3d'"
                    :reveal="teachReveal"
                    @ready="ready3D = true"
                    @failed="ready3D = false"
                  />
                </div>
              </div>

              <!-- keyboard footer — the REAL ProgressiveKeyboard, driven by the
                   active exercise through the keyboard context. Preview tweaks:
                   no physical-key capture (don't hijack the page), no phoneme on
                   press, small keys to fit the phone frame. Exercises beat only. -->
              <div v-if="beat === 0" class="sw-keyboard-real">
                <ProgressiveKeyboard
                  ref="keyboardRef"
                  :letters="keyboardLetters"
                  :enabled-letters="keyboardEnabledLetters"
                  :highlighted-letters="keyboardHighlightedLetters"
                  :key-colors="keyboardColors"
                  :space-text="keyboardSpaceText"
                  :show-full-layout="keyboardContext.showFullLayout.value"
                  :play-phoneme-on-press="false"
                  :capture-keyboard="false"
                  :lowercase-keycaps="true"
                  :disabled="keyboardContext.disabled.value"
                  @keypress="handleKeyboardPress"
                  @keyrelease="handleKeyboardRelease"
                  @keytap="handleKeyboardTap"
                  @keyhover="handleKeyboardHover"
                  @keyhoverend="handleKeyboardHoverEnd"
                  @kbd-space="handleKeyboardAdvance"
                  @kbd-enter="handleKeyboardEnter"
                  @arrow-left="handleKeyboardArrowLeft"
                  @arrow-right="handleKeyboardArrowRight"
                  @backspace="keyboardContext.dispatchBackspace()"
                  @invalid-key="handleKeyboardInvalidKey"
                />
              </div>
              </div>

              <!-- WRAP body (vignette beat, the coda after off-screen; toggle via
                   SHOW_VIGNETTE_BEAT) — session end: vignette + summary (stylized
                   stand-in for SessionEndScreen; mirrors its mobile stacked layout) -->
              <div class="sw-layer" :style="wrapStyle">

              <!-- vignette hero — the REAL JJugglingVignette (the in-app
                   post-session treat: J teaches j to juggle). Lazy-mounted only
                   while this beat is active so its physics/rAF loop never runs
                   off-screen; remounting on scroll-back replays the walk-in
                   intro. Reduced-motion → a pair of static letters instead. -->
              <div class="sw-vignette">
                <div class="sw-info-pill">
                  <v-icon size="15" color="white">mdi-information-outline</v-icon>
                </div>
                <div class="sw-vignette-stage">
                  <JJugglingVignette
                    v-if="activeBeat === 'vignette' && !prefersReducedMotion"
                    :stage="0"
                  />
                  <!-- Reduced-motion fallback only. Deliberately NOT a `v-else`:
                       as a v-else it rendered whenever the vignette beat was
                       inactive, so leaving the beat swapped the real vignette for
                       this static mock mid-fade —
                       a placeholder "flash" under the outgoing layer. Scoping it to
                       reduced-motion keeps it out of the normal transition path. -->
                  <div
                    v-else-if="prefersReducedMotion"
                    class="sw-jugglers sw-jugglers--static"
                  >
                    <span class="sw-jug sw-jug--1">J</span>
                    <span class="sw-jug sw-jug--2">j</span>
                  </div>
                </div>
                <p class="sw-vignette-cap">
                  The letters love their work — but they have hobbies too. While
                  you practice, they get some practice of their own.
                </p>
              </div>

              <!-- session summary strip -->
              <div class="sw-summary">
                <div class="sw-summary-stats">
                  <span class="sw-stat"><strong>8</strong> cards</span>
                  <span class="sw-stat"><strong>2</strong> new</span>
                  <span class="sw-stat sw-stat--trouble"><strong>1</strong> working on</span>
                </div>
                <ul class="sw-summary-list">
                  <li>
                    <span class="sw-sum-dot sw-sum-dot--new"></span>
                    New today — <strong>ch</strong>
                  </li>
                  <li>
                    <span class="sw-sum-dot sw-sum-dot--rev"></span>
                    Reviewed — s, a, t
                  </li>
                  <li>
                    <span class="sw-sum-dot sw-sum-dot--soon"></span>
                    Coming soon — sh
                  </li>
                </ul>
              </div>
              </div>
            </div>
          </div>
        </div>

        <!-- carousel nav — OUTSIDE the phone frame -->
        <div class="sw-cnav" :class="{ 'sw-cnav--hidden': beat !== 0 }">
          <button
            type="button"
            class="sw-cnav-arrow"
            aria-label="Previous exercise"
            :tabindex="beat === 0 ? 0 : -1"
            @click="stepCarousel(-1)"
          >
            <v-icon size="20">mdi-chevron-left</v-icon>
          </button>
          <button
            v-for="(ex, i) in EXERCISES"
            :key="ex.id"
            type="button"
            class="sw-cdot"
            :class="{ 'sw-cdot--on': carouselPos === i }"
            :aria-label="`Show ${ex.name}`"
            :tabindex="beat === 0 ? 0 : -1"
            @click="goCarousel(i)"
          ></button>
          <button
            type="button"
            class="sw-cnav-arrow"
            aria-label="Next exercise"
            :tabindex="beat === 0 ? 0 : -1"
            @click="stepCarousel(1)"
          >
            <v-icon size="20">mdi-chevron-right</v-icon>
          </button>
        </div>
        </div>
      </div>

      <!-- scrolling beats -->
      <div class="sw-beats">
        <div
          v-for="(b, i) in beats"
          :key="i"
          class="sw-beat"
          :data-sw-beat="i"
        >
          <div class="sw-beat-num">{{ String(i + 1).padStart(2, "0") }}</div>
          <h3 class="sw-beat-title">{{ b.title }}</h3>
          <p
            v-for="(para, pi) in asParagraphs(b.body)"
            :key="pi"
            class="sw-beat-body"
            v-html="renderInline(para)"
          ></p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef, markRaw, computed, watch, nextTick, onMounted, onUnmounted, type Component, type CSSProperties } from "vue";
import type { ViewData } from "@vue-skuilder/common";
import WhoSaidThatView from "@/questions/WhoSaidThatView.vue";
import WordSelectionView from "@/questions/WordSelectionView.vue";
import MissingLettersView from "@/questions/MissingLettersView.vue";
import WordDisplay from "@/letterpeople/vue/WordDisplay.vue";
import type { WordOptions } from "@/letterpeople/Word";
import { randomVibrancyColor } from "@/letterpeople";
import JJugglingVignette from "@/practicing/JJugglingVignette.vue";
import FridgeSheetMini from "./FridgeSheetMini.vue";
import ProgressiveKeyboard from "@/components/keyboard/ProgressiveKeyboard.vue";
import { renderInline } from "./inlineMarkup";
import { revealLandingCta } from "@/composables/useLandingCta";
import { DEFAULT_AGE, keyArrivals, lessonsForAge } from "@/components/curriculum/curriculumData";
import { keysWhenReady } from "@/components/curriculum/keysWhenReady";
import { PRINT_PROMPT_MIN_LETTERS } from "@/services/fridgeSheet";
import { mark3DFailed, use3DLetters } from "@/services/letters3d";
import {
  createKeyboardContext,
  provideKeyboardContext,
  type KeyEvent,
  type KeyboardContextProvider,
} from "@/composables/useKeyboardContext";

// Beat 1's teaching scene: two real LetterPeople, 'h' and 'i', the Hello World
// lesson's pair — together they also spell "hi", so the "letters make sounds →
// words" idea is self-evident. The lines are the lesson's, revealed in turn by
// scroll; both balloons stay up, so they're cast left to right to read in
// order (in the lesson, i says the first and h the second).
const TEACH_CAST = [
  { char: "h", line: "We're letters!" },
  { char: "i", line: "Our job is to make sounds." },
];

// 2D (SVG) version: CSS mock balloons over WordDisplay letters.
function teacherOpts(): WordOptions {
  return {
    spacing: 0,
    letterOptions: {
      color: randomVibrancyColor(),
      lineWidth: 20,
      borderWidth: 4,
      armColor: "#000",
      showEyes: true,
      showArms: true,
      showMouth: true,
    },
  };
}
const teacherOptionsH = teacherOpts();
const teacherOptionsI = teacherOpts();

// Real WhoSaidThat exercise, run in preview mode (no datalayer, no autoplay).
// Always exactly two single-letter suspects, to keep the phone-frame sizing
// stable. A fresh sample is shown each time the carousel returns to WST.
const wstSamples = [
  { targetPhoneme: "S", correctLetter: "s", distractors: "t" },
  { targetPhoneme: "M", correctLetter: "m", distractors: "n" },
  { targetPhoneme: "P", correctLetter: "p", distractors: "b" },
  { targetPhoneme: "AE", correctLetter: "a", distractors: "o" },
  { targetPhoneme: "F", correctLetter: "f", distractors: "v" },
  { targetPhoneme: "T", correctLetter: "t", distractors: "d" },
];
const wstIdx = ref(0);
const wstData = computed(
  () => [wstSamples[wstIdx.value]] as unknown as ViewData[]
);

// Real WordSelection ("Find the Word"), preview mode. Two similar-sounding
// options (a minimal pair) keeps the phone frame stable and the contrast clear.
// Mouse-clickable without a keyboard context. Rotated like WST.
const wsSamples = [
  { target: "chip", distractors: "chop" },
  { target: "ship", distractors: "chip" },
  { target: "cat", distractors: "cap" },
  { target: "bed", distractors: "bad" },
  { target: "fish", distractors: "dish" },
];
const wsIdx = ref(0);
const wsData = computed(
  () => [{ ...wsSamples[wsIdx.value], instruction: "" }] as unknown as ViewData[]
);

// Real MissingLetters ("Fill in the Blanks"), preview mode. `blanks` is a
// comma-separated list of 0-based indices. Rotated.
//
// Each sample plays on the keyboard a typical learner has when its word comes
// within reach (keysWhenReady: the /curriculum sim at the default age). The app
// only offers keys a learner has met, so the reduced board is the honest one,
// and it shows the keyboard scaffolding as everyday. Samples run early to late:
// cat at 12 keys and hot at 9 show it plainly; chip and ship (after ch, sh)
// are at 23 of 26, nearly the whole board. (fish dropped for cat/hot: the
// same 23 keys as ship.)
const mlSamples = [
  { word: "cat", blanks: "1" }, // c_t
  { word: "hot", blanks: "0" }, // _ot
  { word: "chip", blanks: "2" }, // ch_p
  { word: "ship", blanks: "0,1" }, // __ip
];
const mlIdx = ref(0);
const mlData = computed(
  () => [mlSamples[mlIdx.value]] as unknown as ViewData[]
);
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const mlKeys = computed(
  () => keysWhenReady(DEFAULT_AGE, mlSamples[mlIdx.value].word) ?? ALPHABET
);

// ---- narration beats ------------------------------------------------------
// Beats are keyed by id, not position: the sticky visual picks its layer from
// the active beat's id, so beats can be switched off without renumbering.
type BeatId = "practice" | "lesson" | "vignette" | "offscreen";
interface Beat {
  id: BeatId;
  title: string;
  // A single paragraph, or an array of paragraphs rendered as separate <p>s.
  body: string | string[];
}
// Normalize a beat body to an array of paragraphs for rendering.
const asParagraphs = (body: string | string[]): string[] =>
  Array.isArray(body) ? body : [body];

// The session-end vignette beat ("Practicing what they preach"). Off
// 2026-09-19 → 2026-09-30 while trimming the landing page to the
// quickly-legible pitch; reinstated as a coda after the off-screen beat.
// Flip this to drop it again — beat, layer and styles stay intact.
const SHOW_VIGNETTE_BEAT = true;

const ALL_BEATS: Beat[] = [
  {
    id: "practice",
    title: "The main loop: practice",
    body: [
      // "Our minimalist design keeps effort focused where it counts - the mechanics required for fluent reading.",
      "We use a small set of simple exercises, running on a tight automatic loop against a sequenced curriculum.",
      "We keep a detailed map of what your learner knows, and use it to serve up the right content at the right time.",
      "With a little familiarity — and depending on age — your learner can drive this loop mostly on their own.",
    ]
  },
  {
    id: "lesson",
    title: "Micro lessons with involved adults",
    body: [
      "The main loop is happy to introduce new **facts**. But when your child is ready for a new **idea**, we call you in as the guide.",
      "You read aloud as Letters present the content — ~30 seconds, building a shared vocabulary between learner and adult for talking about words.",
      "New ideas land every week or two, so this is an occasional check-in — not a daily commitment.",
    ]
  },
  {
    // THESIS beat — the device is swapped for the printed fridge sheet
    // (FridgeSheetMini). The pitch lands here: the
    // app's job culminates in handing practice back to the family, off the
    // device. (The vignette follows as a coda; the header CTA still keys off
    // this beat — see CTA_BEAT.)
    //
    // Encoding-direction examples only (sound → letter): the app never tests
    // reading a word aloud, so the kitchen games shouldn't imply it either.
    //
    // PRIOR BODY (until 2026-09-19; visual was the /progress cards — The
    // Pieces + Putting Them Together — which still exist in-app):
    //   "We use our map of learner skills, together with a phonetic dictionary
    //   of English, to determine the sorts of words that your child is ready to
    //   sound out, alone or with a nudge." / "You take this with you to the
    //   armchair or bedside - ready to gently pause at good candidates for your
    //   child to show off, or to prompt and guide through trickier words at the
    //   boundary."
    id: "offscreen",
    title: "Taking it off-screen",
    body: [
      "[Print our one-pager](/fridge-sheet) for the fridge. As the learner masters new items, the app will prompt them to colour in the key.",
      "This is a simple, up-to-date, offline scaffold for you and any other interested adults to use with the learner. Who says *mmmm*? — Can you spell *fit*?",
      "The blank keys are easy to see as off limits, so that the offline work can mostly stay in the showing-off category.",
    ],
  },
  {
    // Maps to the WRAP layer / SessionEndScreen (vignette + summary).
    // Coda after the off-screen thesis: the phone comes back for a soft
    // denouement. Toggle via SHOW_VIGNETTE_BEAT.
    id: "vignette",
    title: "Practicing what they preach",
    body: [
      "Each session ends with a quiet animation of the letters working on their hobbies.",
      "They model effective skill development: getting **serious reps** in, with **gradual increase** of difficulty, all in context of a loving teaching relationship.",
      "And on a practical note: they buy you a few seconds to glance the session statistics!",
    ],
  },
];
const beats = ALL_BEATS.filter((b) => b.id !== "vignette" || SHOW_VIGNETTE_BEAT);
// ---- the exercise catalog (carousel on beat 0) ----------------------------
// Order mirrors how we talk about the "tiny set of exercise types".
const EXERCISES = [
  { id: "wst", name: "Who Said That?" },
  { id: "ws", name: "Find the Word" },
  { id: "ml", name: "Fill in the Blanks" },
] as const;
const WS_POS = EXERCISES.findIndex((e) => e.id === "ws");

// ---- scroll-driven beat state ---------------------------------------------
// Single-column / pinned-at-top layout kicks in below this width. Must match the
// `@media (max-width: 959px)` block below.
const MOBILE_BP = 960;
const rootEl = ref<HTMLElement | null>(null);
const stickyEl = ref<HTMLElement | null>(null);
const beat = ref(0); // index into `beats` (the enabled ones)
const activeBeat = computed<BeatId>(() => beats[beat.value]?.id ?? "practice");
const LESSON_IDX = beats.findIndex((b) => b.id === "lesson");
const OFFSCREEN_IDX = beats.findIndex((b) => b.id === "offscreen");
const teachReveal = ref(1); // lesson beat: balloons shown (1 = h only, 2 = h + i)
const prefersReducedMotion = ref(false); // gates the autoplaying vignette
const carouselPos = ref(WS_POS); // which exercise the catalog is showing

let autoplay = true;
let carouselManual = false; // once the visitor clicks, stop auto-advancing
let carouselHover = false; // pointer is over the mock — pause so we don't "rug" them
let raf = 0;
let carouselTimer: ReturnType<typeof setInterval> | null = null;

// On the exercises beat the catalog drives the stage; elsewhere we lock to the
// word-pick (WS) so the Learn dialog / drive demo / keyboard stay coherent.
const activeExercise = computed(() =>
  beat.value === 0 ? EXERCISES[carouselPos.value] : EXERCISES[WS_POS]
);

// The single live exercise rendered at a time. Keyed by exercise + sample idx so
// a rotation (or exercise switch) remounts a fresh question. <transition out-in>
// guarantees the old view unmounts (clearing its keyboard config) before the new
// one mounts and reconfigures — so the shared keyboard context never desyncs.
const LIVE_VIEWS = {
  wst: WhoSaidThatView,
  ws: WordSelectionView,
  ml: MissingLettersView,
} as const;
const liveView = computed(() => LIVE_VIEWS[activeExercise.value.id]);
const liveData = computed(() => {
  switch (activeExercise.value.id) {
    case "wst":
      return wstData.value;
    case "ws":
      return wsData.value;
    case "ml":
      return mlData.value;
  }
  return wstData.value;
});
const liveKey = computed(() => {
  const id = activeExercise.value.id;
  const idx = id === "wst" ? wstIdx.value : id === "ws" ? wsIdx.value : mlIdx.value;
  return `${id}-${idx}`;
});

// Show a fresh sample (remounts the live view) each time the carousel lands on
// an exercise — except the very first time it's shown, which keeps sample 0.
const seenExercise: Record<string, boolean> = {};
function rotateOnReentry(
  id: string,
  idx: { value: number },
  len: number
): void {
  if (seenExercise[id]) idx.value = (idx.value + 1) % len;
  else seenExercise[id] = true;
}
watch(
  () => activeExercise.value.id,
  (id, prev) => {
    if (id === prev) return;
    if (id === "wst") rotateOnReentry(id, wstIdx, wstSamples.length);
    else if (id === "ws") rotateOnReentry(id, wsIdx, wsSamples.length);
    else if (id === "ml") rotateOnReentry(id, mlIdx, mlSamples.length);
  }
);

// ---- keyboard context (provider) ------------------------------------------
// Mirrors PeekView / StudyPracticeView: this component owns the real
// ProgressiveKeyboard and provides the context the live exercises inject and
// configure. Differences for the marketing embed: base letters are a simulated
// learner's (the ML sample's mlKeys; WST and WS bring their own keys), and
// physical-key capture is off so the keyboard never hijacks page typing/scroll.
// Set before the next sample mounts: the rotation that changes it runs in a
// pre-flush watcher, and the out-in transition mounts the view later still.
const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);
watch(mlKeys, (keys) => keyboardContext.setBaseLetters(keys), { immediate: true });

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);
watch(keyboardRef, (newRef) => {
  if (newRef) keyboardContext.connectKeyboard(newRef);
});

const keyboardLetters = computed(() => {
  const active = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.activeLetters.value]
    : [];
  if (keyboardContext.showArrows.value) {
    if (!active.includes("arrowleft")) active.push("arrowleft");
    if (!active.includes("arrowright")) active.push("arrowright");
  }
  if (!active.includes("enter")) active.push("enter");
  if (keyboardContext.showAdvance.value && !active.includes("space")) {
    active.push("space");
  }
  return active;
});
const keyboardEnabledLetters = computed(() => {
  const enabled = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.enabledLetters.value]
    : [];
  if (keyboardContext.showArrows.value) {
    if (!enabled.includes("arrowleft")) enabled.push("arrowleft");
    if (!enabled.includes("arrowright")) enabled.push("arrowright");
  }
  if (keyboardContext.showAdvance.value && !enabled.includes("space")) {
    enabled.push("space");
  }
  return enabled;
});
const keyboardHighlightedLetters = computed(() =>
  Array.from(keyboardContext.highlights.value.keys())
);
const keyboardColors = computed(() => {
  const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
  for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
    if (typeof highlight === "string") colors[letter] = highlight;
  }
  if (keyboardContext.advanceColor.value) {
    colors["space"] = keyboardContext.advanceColor.value;
  }
  return colors;
});
const keyboardSpaceText = computed(() => keyboardContext.advanceText.value);

const handleKeyboardPress = (e: KeyEvent) => keyboardContext.dispatchKeyPress(e);
const handleKeyboardRelease = (e: KeyEvent) => keyboardContext.dispatchKeyRelease(e);
const handleKeyboardTap = (e: KeyEvent) => keyboardContext.dispatchKeyTap(e);
const handleKeyboardHover = (e: KeyEvent) => keyboardContext.dispatchKeyHover(e);
const handleKeyboardHoverEnd = (e: KeyEvent) => keyboardContext.dispatchKeyHoverEnd(e);
const handleKeyboardAdvance = () => keyboardContext.dispatchAdvance();
const handleKeyboardEnter = () => keyboardContext.dispatchEnter();
const handleKeyboardArrowLeft = () => keyboardContext.dispatchArrowLeft();
const handleKeyboardArrowRight = () => keyboardContext.dispatchArrowRight();
const handleKeyboardInvalidKey = (letter: string) =>
  keyboardContext.dispatchInvalidKey(letter);

function startCarousel() {
  stopCarousel();
  // Only auto-advances on the exercises beat, when not manually pinned, not
  // motion-averse, and not currently being hovered/used.
  if (carouselManual || !autoplay || carouselHover || beat.value !== 0) return;
  carouselTimer = setInterval(() => {
    carouselPos.value = (carouselPos.value + 1) % EXERCISES.length;
  }, 4200);
}
function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }
}
function goCarousel(i: number) {
  carouselManual = true;
  stopCarousel();
  carouselPos.value = i;
}
function stepCarousel(dir: number) {
  goCarousel((carouselPos.value + dir + EXERCISES.length) % EXERCISES.length);
}

// The embedded exercises emit a framework QuestionRecord on every submit. On the
// exercises beat, a *correct* answer auto-advances the catalog to the next
// exercise (which also rotates in a fresh sample on re-entry) — so a visitor who
// engages gets an answer-driven tour rather than a fixed timer. Small delay lets
// the in-exercise celebration land before the slide swaps.
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
function onLiveResponse(record: { isCorrect?: boolean }) {
  if (beat.value !== 0 || !record?.isCorrect) return;
  if (advanceTimer) clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    stepCarousel(1);
  }, 900);
}

// Desktop: pause auto-advance once the pointer actually *moves* over the live
// mock — gating on movement (not mere presence) avoids a false pause when a
// stationary pointer simply has the sticky phone scroll underneath it. One move
// arms the pause; it holds until the pointer leaves, so a slide never swaps out
// mid-interaction. Resume (if still eligible) on leave.
function onStageMouseMove() {
  if (carouselHover) return; // already paused — skip the per-pixel churn
  carouselHover = true;
  stopCarousel();
}
function releaseCarousel() {
  carouselHover = false;
  startCarousel();
}
// Touch: there's no hover to pause on, so a tap inside the mock pins the
// current exercise outright (same commitment as tapping a nav dot). Mouse
// clicks fall through to the hover behavior above — no permanent pin — so
// desktop visitors still get auto-advance once they move away.
function pinCarouselOnTouch(e: PointerEvent) {
  if (e.pointerType !== "touch") return;
  carouselManual = true;
  stopCarousel();
}

function onScroll() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const blocks = rootEl.value?.querySelectorAll<HTMLElement>("[data-sw-beat]");
    if (!blocks || !blocks.length) return;
    const mid = window.innerHeight / 2;
    // Mobile pins the phone at the TOP and top-aligns the beat copy (see the
    // .sw-sticky / .sw-beat mobile rules), so a beat's text lives at its block's
    // TOP, not its center. The desktop rule — block-center vs viewport-middle —
    // then fires ~40vh late: a beat only goes active once its center reaches mid,
    // i.e. once its title has scrolled up under the phone. So on mobile anchor on
    // the block top and put the read line just BELOW the pinned frame, so the
    // phone switches as each beat's heading clears it into the reading zone.
    // Measured off the sticky band rather than a fixed fraction of the viewport:
    // the frame's height is now viewport-derived (see updateScale), so any magic
    // constant here goes stale. The old `innerHeight * 0.6` sat *inside* the
    // frame — beats flipped active while their heading was still hidden behind
    // it. Desktop is unchanged (centered phone ↔ centered copy).
    const isMobile = window.innerWidth < MOBILE_BP;
    const band = isMobile ? stickyEl.value?.getBoundingClientRect() : null;
    const readLine = band ? band.bottom + 16 : mid;
    let best = 0;
    let bestDist = Infinity;
    let lessonCenter = Infinity; // center of the lesson beat's block
    let offscreenRead = 0; // how far the read line is through the off-screen beat
    blocks.forEach((el) => {
      const r = el.getBoundingClientRect();
      const c = r.top + r.height / 2;
      const idx = parseInt(el.getAttribute("data-sw-beat") || "0", 10);
      if (idx === LESSON_IDX) lessonCenter = c;
      if (idx === OFFSCREEN_IDX) offscreenRead = (readLine - r.top) / r.height;
      if (isMobile) {
        // "Last block whose heading has crossed the read line" — NOT
        // nearest-to-the-line. Nearest flips at the midpoint between two blocks,
        // which on mobile means the incoming beat goes active while its heading
        // is still at the very bottom of the screen (a full block of scrolling
        // before it's readable), and the outgoing beat's tail is orphaned above
        // it. Crossing gives an exact handoff: the frame swaps at the moment the
        // new heading clears the pinned phone into the reading window.
        if (r.top <= readLine) best = Math.max(best, idx);
      } else {
        const d = Math.abs(c - readLine);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      }
    });
    // Turn-taking reveal: 'i' speaks once the lesson block has scrolled past
    // the viewport middle (so 'h' leads, 'i' follows as you scroll on).
    teachReveal.value = best === LESSON_IDX && lessonCenter < mid ? 2 : 1;
    sheetColoured.value = sheetFillAt(offscreenRead);
    setBeat(best);
  });
}

// The fridge sheet colours in as the off-screen beat scrolls by, key by key in
// the order a typical learner gets them (the /curriculum sim): from the day the
// app first suggests printing to the day the second lesson opens. It isn't
// meant to fill up — only to show the sheet growing. The beat is active for
// roughly read-line 0→1 through its block; the middle of that does the colouring.
const SHEET_FILL_FROM = PRINT_PROMPT_MIN_LETTERS;
const SHEET_FILL_TO = (() => {
  const secondLesson = lessonsForAge(DEFAULT_AGE)[1]?.session ?? Infinity;
  const keys = keyArrivals(DEFAULT_AGE).filter((a) => a.session < secondLesson).length;
  return Math.max(SHEET_FILL_FROM, keys);
})();
const sheetColoured = ref(SHEET_FILL_FROM);
function sheetFillAt(read: number): number {
  const t = Math.min(1, Math.max(0, (read - 0.15) / 0.7));
  return Math.round(SHEET_FILL_FROM + t * (SHEET_FILL_TO - SHEET_FILL_FROM));
}

// The off-screen beat ("Taking it off-screen") is the payoff: the visitor has
// read the whole pitch. Cue the header's sticky "Try a sample lesson" CTA to
// pop in (sticky once set — see useLandingCta). Keyed by id rather than "last
// beat", so the vignette coda after it doesn't delay the reveal.
const CTA_BEAT = beats.findIndex((b) => b.id === "offscreen");

function setBeat(b: number) {
  if (b >= CTA_BEAT) revealLandingCta();
  if (b === beat.value) return;
  beat.value = b;
  if (b === 0) startCarousel();
  else stopCarousel();
}

// Mobile "fill": the phone's internal layout is tuned at a fixed 400px width, so
// rather than reflow it (which would re-break the cramped keyboard fit) we scale
// the whole frame to fill the available column, minus a little breathing room.
// Capped at 1 so it never upscales past the desktop size. Only the mobile rule
// consumes --sw-scale; desktop keeps its untransformed 400px frame.
//
// Width-scaling ALONE is not enough, because the frame's 2:3 aspect means a
// *wider* phone gets a *taller* frame: at 412px viewport the scale lands at 0.88
// and the frame paints 526px tall — 68% of a 780px viewport. With the 64px app
// bar and the carousel nav that left ~130px for the narration copy, which is
// less than the beat's own heading: you could never see a beat and its visual at
// the same time, which is the whole premise of the scrollytell.
//
// So on mobile we also shorten the frame's PRE-SCALE height so its painted
// height lands near half the viewport. The phone's internals are flexible
// (.sw-stage is flex:1/min-height:0 and clips), so the stage absorbs the trim
// while the frame keeps its full column width — the exercise stays legible.
const SW_BASE_W = 400;
const SW_BASE_H = 600;
// Target painted frame height on mobile: a bit over half the viewport, capped so
// it never exceeds the authored desktop frame on a tall device. Deliberately a
// pure ratio with no lower bound — a fixed floor would eat a short viewport
// (landscape phone) whole, and the frame staying proportional is what keeps the
// copy's share constant. A frame too short for its exercise is handled by
// updateFit, not by refusing to shrink.
const SW_MOBILE_H_RATIO = 0.56;
const SW_MOBILE_H_MAX = 460;
let resizeRaf = 0;
function updateScale() {
  const host = stickyEl.value;
  const root = rootEl.value;
  if (!host || !root) return;
  // clientWidth includes padding, and the mobile rule pads .sw-sticky (for its
  // full-bleed backdrop), so subtract it back out to get the usable column.
  const cs = getComputedStyle(host);
  const inner =
    host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const avail = inner - 12; // ~6px of margin each side, inside the column
  const s = Math.min(1, Math.max(0.5, avail / SW_BASE_W));
  root.style.setProperty("--sw-scale", s.toFixed(3));

  // Pre-scale frame height. Desktop keeps the authored 600; mobile solves
  // `baseH * scale = targetPainted` for baseH.
  let baseH = SW_BASE_H;
  if (window.innerWidth < MOBILE_BP) {
    const targetPainted = Math.min(
      SW_MOBILE_H_MAX,
      window.innerHeight * SW_MOBILE_H_RATIO
    );
    baseH = Math.min(SW_BASE_H, Math.round(targetPainted / s));
  }
  root.style.setProperty("--sw-base-h", `${baseH}px`);
}
// Per-exercise vertical fit. The exercises' own compact sizing keys off container
// WIDTH (container queries), which can't see that this frame is unusually SHORT —
// so a tall exercise (WordSelection stacks two full-width word options: ~384px of
// layout against a ~215px slot on a phone) just got clipped top and bottom by the
// stage's overflow:hidden, decapitating the audio button. The embed-scoped CSS
// trims above shave the padding, but the bulk is letter-SVG height driven by
// props, not CSS.
//
// So measure and scale to fit. offsetHeight/clientHeight are LAYOUT values —
// unaffected by this transform and by the frame's own scale — so there's no
// feedback loop, and the ratio is computed in one consistent coordinate space.
// Per-exercise, so only the exercise that actually overflows pays: WST and ML
// come out at ~1.0 and stay full size; WS shrinks.
const slidesEl = ref<HTMLElement | null>(null);
const fitScale = ref(1);
const fitStyle = computed<CSSProperties>(() =>
  fitScale.value < 0.999 ? { transform: `scale(${fitScale.value.toFixed(3)})` } : {}
);
function updateFit() {
  const slot = slidesEl.value;
  const live = slot?.querySelector<HTMLElement>(".sw-live");
  if (!slot || !live || !live.offsetHeight) return;
  fitScale.value = Math.min(1, slot.clientHeight / live.offsetHeight);
}

function onResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    updateScale();
    updateFit();
  });
}

// The keyboard footer is only mounted on the exercises beat, so leaving/entering
// that beat resizes the stage (and therefore the slot) under a live exercise.
watch(beat, () => nextTick(updateFit));

onMounted(() => {
  const reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  autoplay = !reduce;
  prefersReducedMotion.value = !!reduce;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  onScroll();
  updateScale();
  // The frame's height lands with updateScale, and the letter SVGs settle a beat
  // later; re-fit once things have stopped moving.
  nextTick(updateFit);
  setTimeout(updateFit, 350);
  if (beat.value === 0) startCarousel();
  load3DWhenIdle();
  // TEMP DEBUG: log after the keyboard has measured/settled.
  if (swDbg.value) setTimeout(() => logFrame(`mount:${liveKey.value}`), 400);
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onResize);
  if (raf) cancelAnimationFrame(raf);
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  if (advanceTimer) clearTimeout(advanceTimer);
  stopCarousel();
});

// ---- computed inline styles (depend on reactive beat/demo state) ----------
// Layer visibility, by beat id. practice + lesson → the live app screen;
// vignette → session wrap; offscreen → the phone itself fades
// out and the printed sheet takes its place (phoneStyle / paperStyle below).
//
// Symmetric crossfade: BOTH the incoming and outgoing layers transition opacity
// over the same duration, so the old phone stays on screen (fading) while the new
// one fades in. z-index keeps the active layer on top — its opaque phone surface
// covers everything as it arrives, and any third (already-hidden) layer sits at
// opacity 0 underneath — so a non-adjacent jump (e.g. fast beat 1→3) never bleeds
// the in-between screen, and there's no frame where the bare phone-shell backdrop
// (.sw-stage-wrap) shows through. (An earlier version snapped the outgoing layer
// to hidden instantly to avoid that bleed, but that left a ~0.45s gap of empty
// phone shell — the "flash" between every non-sibling beat.)
function layerStyle(active: boolean): CSSProperties {
  return {
    opacity: active ? 1 : 0,
    pointerEvents: active ? "auto" : "none",
    transition: "opacity 0.45s ease",
    zIndex: active ? 2 : 1,
  };
}
const screenStyle = computed<CSSProperties>(() =>
  layerStyle(activeBeat.value === "practice" || activeBeat.value === "lesson")
);
const wrapStyle = computed<CSSProperties>(() => layerStyle(activeBeat.value === "vignette"));

// Device ↔ paper swap. Not a body layer: the whole phone (frame, header and
// all) goes, because the point of the beat is that there is no screen. The
// phone keeps its last body layer underneath while it fades, so there's no
// empty-shell flash on the way out or back.
const onPaper = computed(() => activeBeat.value === "offscreen");
const phoneStyle = computed<CSSProperties>(() => ({
  opacity: onPaper.value ? 0 : 1,
  transform: onPaper.value ? "scale(0.96)" : "none",
  pointerEvents: onPaper.value ? "none" : "auto",
  transition: "opacity 0.45s ease, transform 0.45s ease",
}));
const paperStyle = computed<CSSProperties>(() => ({
  opacity: onPaper.value ? 1 : 0,
  // The note under the sheet is a link; only clickable while the sheet is up.
  pointerEvents: onPaper.value ? "auto" : "none",
  transform: onPaper.value
    ? "translateY(-50%) rotate(-2deg)"
    : "translateY(calc(-50% - 18px)) rotate(-5deg)",
  transition: "opacity 0.45s ease, transform 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.15)",
}));

const showDialog = computed(() => activeBeat.value === "lesson");

// ---- the lesson beat in 3D ------------------------------------------------
// The three.js chunk (~190 KB gzipped, shared with the app's 3D lessons and
// intros) loads once the page has loaded and gone idle, never on the critical
// path; the stage then builds in a later idle slot (LessonPreview3D). Each time
// the beat is entered, the scene is chosen once — 3D if its stage is up, else
// the 2D one — so it never swaps under the reader mid-beat.
const LessonPreview3D = shallowRef<Component | null>(null);
const ready3D = ref(false);
const lessonScene = ref<"2d" | "3d">("2d");
watch(showDialog, (on) => {
  if (on) lessonScene.value = ready3D.value ? "3d" : "2d";
});

function load3DWhenIdle(): void {
  if (!use3DLetters()) return;
  const load = () =>
    import("./three/LessonPreview3D.vue")
      .then((m) => (LessonPreview3D.value = markRaw(m.default)))
      .catch((err) => mark3DFailed(err));
  const idle = () =>
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(load, { timeout: 5000 })
      : window.setTimeout(load, 1500);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

// ---- DEBUG: keyboard-framing diagnosis (retained — this phone-frame layout is
// finicky and prone to regressions). Off by default; enable in two ways:
//   • load the page with `?swdbg` in the URL (no rebuild), or
//   • flip SW_DBG_FORCE → true to force it on during an active session.
// When on: `.sw-dbg` outlines the phone layout boxes and makes the phone
// overflow visible, so a keyboard footer pushed past the bottom shows up hanging
// below instead of clipped; logFrame() logs per-exercise heights + how far the
// keyboard's bottom sits beyond the phone's bottom (positive = sunk out).
const SW_DBG_FORCE = false; // force-on for an active session; ?swdbg also enables
const swDbg = ref(
  SW_DBG_FORCE ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("swdbg"))
);
function logFrame(tag: string) {
  const kbd = rootEl.value?.querySelector<HTMLElement>(".sw-keyboard-real");
  const phone = kbd?.closest<HTMLElement>(".sw-phone");
  const stage = phone?.querySelector<HTMLElement>(".sw-stage");
  if (!kbd || !phone) {
    console.log(`[sw-dbg ${tag}] no keyboard/phone in DOM`);
    return;
  }
  const pr = phone.getBoundingClientRect();
  const kr = kbd.getBoundingClientRect();
  const sr = stage?.getBoundingClientRect();
  console.log(`[sw-dbg ${tag}]`, {
    phoneH: Math.round(pr.height),
    stageH: sr ? Math.round(sr.height) : null,
    kbdH: Math.round(kr.height),
    kbdBottomBeyondPhone: Math.round(kr.bottom - pr.bottom),
  });
}
watch(
  liveKey,
  (k) => nextTick(() => logFrame(k)),
  { flush: "post" }
);
</script>

<style scoped>
/* Map the mockup's --lp-* design tokens onto the app's Vuetify theme. */
.session-walkthrough {
  --sw-fg-1: rgba(var(--v-theme-on-surface), 0.92);
  --sw-fg-2: rgba(var(--v-theme-on-surface), 0.66);
  --sw-fg-3: rgba(var(--v-theme-on-surface), 0.45);
  --sw-divider: rgba(var(--v-theme-on-surface), 0.12);

  background: rgb(var(--v-theme-background));
  color: var(--sw-fg-1);
  padding: 96px 24px 64px;
  -webkit-font-smoothing: antialiased;
}

/* ---- header ---- */
.sw-header {
  max-width: 760px;
  margin: 0 auto 8px;
}
.sw-title {
  margin: 0 0 18px;
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}
.sw-lede {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.55;
  color: var(--sw-fg-2);
}
.sw-lede + .sw-lede {
  margin-top: 1em;
}

/* ---- grid ---- */
.sw-grid {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: start;
}

.sw-sticky {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sw-stage-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
.sw-stage-wrap {
  position: relative;
  width: 400px;
  height: 600px;
  /* Persistent phone-shell backdrop. Layers fade in over this (rather than the
     page background), so the active-only fade-in never blinks an empty gap. */
  border-radius: 20px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
  border: 1px solid var(--sw-divider);
  transition: background-color 0.45s ease, box-shadow 0.45s ease, border-color 0.45s ease;
}
/* Closing beat: the shell backdrop goes with the phone, leaving only paper. */
.sw-stage-wrap--paper {
  background: transparent;
  box-shadow: none;
  border-color: transparent;
}

/* ---- the printed fridge sheet (closing beat) ---- */
.sw-paper {
  position: absolute;
  top: 50%;
  /* A touch wider than the phone: landscape paper at 400px reads small. The
     grid column always has the room (see the 959px breakpoint maths: column
     ≥ 428px plus half the 56px gap). Transform (centring + tilt) is inline. */
  left: -30px;
  right: -30px;
  z-index: 3;
  pointer-events: none;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 16px 36px rgba(0, 0, 0, 0.16);
  transform-origin: 50% 0;
}
.sw-paper-note {
  display: block;
  margin: 10px 0 0;
  text-align: center;
  font-size: 0.78rem;
}
.sw-magnet {
  position: absolute;
  top: -12px;
  left: 50%;
  width: 30px;
  height: 30px;
  margin-left: -15px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff8a7a 0%, #e2483d 55%, #b8322a 100%);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
  z-index: 1;
}
.sw-body {
  /* Body region: fills the phone below the persistent header. The body layers
     crossfade absolutely within it; the header/frame above never move. */
  position: relative;
  flex: 1;
  min-height: 0;
}
.sw-layer {
  position: absolute;
  inset: 0;
  /* Each body layer is itself a flex column (stage + keyboard, or vignette +
     summary, etc.). Opacity + z-index are set inline (see layerStyle): symmetric
     crossfade with the active layer kept on top. */
  display: flex;
  flex-direction: column;
}

/* ---- phone ---- */
.sw-phone {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
  border: 1px solid var(--sw-divider);
}
.sw-phone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--sw-divider);
}
.sw-muted {
  color: var(--sw-fg-3);
}
.sw-dots {
  display: flex;
  gap: 8px;
}
.sw-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.12);
}
.sw-dot--on {
  background: rgb(var(--v-theme-success));
}
/* Abstract window/app chrome dots (left of header). Neutral grey — gestures at a
   browser window without the literal macOS traffic-light colors. */
.sw-winbtns {
  display: flex;
  gap: 6px;
}
.sw-winbtns span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sw-divider);
}

.sw-stage {
  flex: 1;
  /* min-height:0 lets this flex child shrink below its content height, so a
     tall exercise yields space to (instead of shoving out) the keyboard footer.
     Without it the column overflows the phone and the keyboard sinks out of
     frame. overflow:hidden clips the over-tall exercise rather than expanding. */
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #fffef7 0%, #fffcec 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
}
/* ---- carousel: exercise catalog ---- */
.sw-slides {
  position: relative;
  flex: 1;
  min-height: 0; /* same flex-shrink chain as .sw-stage */
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* Embedded real exercise. width:100% pins the Q root to the phone width so its
   container queries (container: *-q / inline-size) evaluate against that narrow
   width and trigger their compact sizing — no blunt scale transform needed. */
.sw-live {
  width: 100%;
}
.sw-slides :deep(.who-said-that),
.sw-slides :deep(.word-selection),
.sw-slides :deep(.missing-letters) {
  width: 100%;
}

/* The phone frame is unusually SHORT (not just narrow), so the exercises' own
   compact sizing isn't enough: WS/WST still stack taller than the slot and clip
   top & bottom. These extra vertical trims are embed-scoped, tuned against this
   frame specifically. ML already fits, so it's left alone.
   (WS also now trims itself and fits its options to the space available — see
   the "Fit to available space" section of WordSelectionView. These win where
   they overlap, being the more specific selectors.) */
.sw-slides :deep(.who-said-that),
.sw-slides :deep(.ws-body) {
  padding-block: 12px;
}
.sw-slides :deep(.wst-header),
.sw-slides :deep(.ws-header) {
  margin-bottom: 10px;
}
.sw-slides :deep(.wst-title),
.sw-slides :deep(.ws-title) {
  font-size: 1.25rem;
}
.sw-slides :deep(.wst-instruction) {
  font-size: 0.9rem;
}
.sw-slides :deep(.wst-audio-controls),
.sw-slides :deep(.ws-audio-controls) {
  margin-bottom: 14px;
}
.sw-slides :deep(.wst-suspects),
.sw-slides :deep(.ws-options-fit) {
  margin-bottom: 12px;
}
.sw-slides :deep(.wst-suspect) {
  padding-block: 12px;
}
/* WST single-letter SVG is 150% of this container, so shrinking it shrinks the
   letter (the dominant vertical cost). (WS shrinks via its :height prop instead,
   since PhoneticWord sizes letters from that prop, not CSS.) */
.sw-slides :deep(.wst-letter-container) {
  height: 52px;
}

/* carousel nav — lives below the phone, outside the frame */
.sw-cnav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 30px;
  transition: opacity 0.3s ease;
}
.sw-cnav--hidden {
  opacity: 0;
  pointer-events: none;
}
.sw-cnav-arrow {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--sw-divider);
  color: var(--sw-fg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sw-cnav-arrow:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.sw-cdot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--sw-divider);
  cursor: pointer;
  transition: width 0.25s ease, background 0.25s ease;
}
.sw-cdot--on {
  width: 22px;
  background: rgb(var(--v-theme-primary));
}


/* ---- learn dialog overlay ---- */
.sw-dialog {
  position: absolute;
  inset: 0;
  /* Opaque (matches the stage gradient) so the locked exercise slide behind
     doesn't bleed through — beat 2 is a dedicated teaching scene. */
  background: linear-gradient(180deg, #fffef7 0%, #fffcec 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  gap: 14px;
}
/* teaching scene: two real LetterPeople + mocked speech balloons */
/* The 3D lesson scene: laid out from the start (its stage needs a size to
   build at idle), seen only on the lesson beat. Same fade as sw-fade. */
.sw-dialog-3d {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.4s ease, visibility 0s linear 0.4s;
}
.sw-dialog-3d > * {
  width: 100%;
  height: 100%;
}
.sw-dialog-3d--on {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.4s ease;
}
.sw-teach {
  display: flex;
  align-items: flex-end; /* letters share a baseline; balloons grow upward */
  justify-content: center;
  gap: 14px;
  margin-top: 8px;
}
.sw-teach-actor {
  width: 140px; /* fixed so toggling a balloon doesn't reflow horizontally */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
/* Fixed-height slot reserves room for the tallest (multi-line) balloon, so a
   balloon appearing never grows the column and re-centers the scene. */
.sw-speech-slot {
  height: 86px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sw-speech {
  position: relative;
  max-width: 140px;
  background: rgb(var(--v-theme-surface));
  border: 2px solid rgb(var(--v-theme-primary));
  color: var(--sw-fg-1);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  padding: 9px 13px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
/* tail: primary-bordered triangle (outer) + surface fill (inner, on top) */
.sw-speech::after,
.sw-speech::before {
  content: "";
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border: 10px solid transparent;
  border-bottom: 0;
}
.sw-speech::after {
  bottom: -10px;
  border-top-color: rgb(var(--v-theme-primary));
}
.sw-speech::before {
  bottom: -7px;
  border-width: 8px;
  border-bottom: 0;
  border-top-color: rgb(var(--v-theme-surface));
  z-index: 1;
}
.sw-balloon-enter-active,
.sw-balloon-leave-active {
  transition: opacity 0.35s ease,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sw-balloon-enter-from,
.sw-balloon-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.85);
}

/* ---- keyboard footer: real ProgressiveKeyboard ---- */
.sw-keyboard-real {
  padding: 8px 10px 12px;
  border-top: 1px solid var(--sw-divider);
  background: rgb(var(--v-theme-surface));
}

/* ---- wrap layer: session-end (vignette + summary) ---- */
.sw-vignette {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
  background: linear-gradient(180deg, #fff7e6 0%, #fdeccf 100%);
}
.sw-info-pill {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
/* Sized box the real JJugglingVignette fills (it lays out to 100% w/h). */
.sw-vignette-stage {
  width: 100%;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sw-jugglers {
  display: flex;
  gap: 18px;
}
/* Reduced-motion fallback: hold the letters still. */
.sw-jugglers--static .sw-jug {
  animation: none;
}
.sw-jug {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 30px;
  color: #fff;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.16);
  animation: sw-juggle 1.8s ease-in-out infinite;
}
.sw-jug--1 {
  background: oklch(0.62 0.16 30);
}
.sw-jug--2 {
  background: oklch(0.62 0.15 150);
  animation-delay: 0.3s;
}
.sw-jug--3 {
  background: oklch(0.62 0.15 250);
  animation-delay: 0.6s;
}
@keyframes sw-juggle {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14px);
  }
}
.sw-vignette-cap {
  margin: 0;
  max-width: 280px;
  text-align: center;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--sw-fg-2);
}
.sw-summary {
  padding: 16px 18px 20px;
  border-top: 1px solid var(--sw-divider);
}
.sw-summary-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 0.9rem;
  color: var(--sw-fg-2);
}
.sw-stat strong {
  font-weight: 700;
  color: var(--sw-fg-1);
  font-variant-numeric: tabular-nums;
}
.sw-stat--trouble strong {
  color: rgb(var(--v-theme-warning));
}
.sw-summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.sw-summary-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.92rem;
  color: var(--sw-fg-2);
}
.sw-summary-list strong {
  color: var(--sw-fg-1);
}
.sw-sum-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.sw-sum-dot--new {
  background: rgb(var(--v-theme-success));
}
.sw-sum-dot--rev {
  background: rgb(var(--v-theme-primary));
}
.sw-sum-dot--soon {
  background: var(--sw-divider);
  border: 1px solid var(--sw-fg-3);
}

/* ---- beats ---- */
.sw-beat {
  min-height: 92vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.sw-beat-num {
  font-size: 4rem;
  font-weight: 300;
  color: rgba(0, 0, 0, 0.1);
  line-height: 1;
  margin-bottom: 12px;
}
.sw-beat-title {
  margin: 0 0 16px;
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.2;
}
.sw-beat-body {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.6;
  color: var(--sw-fg-2);
}
.sw-beat-body + .sw-beat-body {
  margin-top: 1em;
}
/* Copy links (renderInline's .inline-link) in brand orange, not browser blue.
   primary-darken-1 rather than primary: plain primary is too light for text
   on the light surface. Same colour as the note under the fridge sheet. */
.sw-beat-body :deep(.inline-link),
.sw-paper-note {
  color: rgb(var(--v-theme-primary-darken-1));
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ---- transitions ---- */
.sw-fade-enter-active,
.sw-fade-leave-active {
  transition: opacity 0.4s ease;
}
.sw-fade-enter-from,
.sw-fade-leave-to {
  opacity: 0;
}

/* ---- mobile: keep the scrollytell, scale the phone, single column ---- */
@media (max-width: 959px) {
  .session-walkthrough {
    /* 96px of top padding is a desktop luxury; on a phone it's a whole extra
       thumb-swipe before the section starts. */
    padding: 40px 24px 48px;
  }
  .sw-title {
    font-size: 2rem;
  }
  .sw-grid {
    /* minmax(0, 1fr), not 1fr: the default `1fr` is `minmax(auto, 1fr)`, whose
       `auto` floor is the cell's min-content — i.e. the phone's fixed 400px box —
       which blows the track (and the page) wider than the viewport. The 0 floor
       lets the track shrink to the available width. */
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .sw-sticky {
    /* Let the (margin-collapsed) phone box define the band height rather than a
       fixed vh: the phone's painted height varies with --sw-scale, so `auto`
       hugs it on every device without a per-viewport vh tune. align-self:start
       keeps the grid row from stretching; align-items:flex-start top-aligns the
       phone within the band (was center, which split the slack into dead space
       above + below the phone). justify-content:center still centers it across. */
    height: auto;
    align-self: start;
    align-items: flex-start;
    /* The 64px app bar is opaque, so tuck the band's top edge 8px under it and
       pad that back — the phone's top edge lands right below the bar with no
       seam for scrolling copy to show through. (Was top:75px + no backdrop.) */
    top: 56px;
    padding: 8px 24px 0;
    /* Full-bleed opaque backdrop. The beats scroll UNDERNEATH the pinned frame
       (positioned element ⇒ paints above them), but the frame is narrower than
       the text column, so without this the copy poked out ~7px either side and
       showed through the frame's rounded top corners — it read as a rendering
       fault. The negative inline margin cancels the section's 24px side padding
       so the band spans edge to edge; the matching padding keeps the phone in
       the column (and updateScale subtracts it back out). */
    margin-inline: -24px;
    background: rgb(var(--v-theme-background));
  }
  .sw-stage-wrap {
    /* Fill the column: JS sets --sw-scale from the available width (capped at 1),
       so the fixed-400px internal layout scales up toward ~fill instead of sitting
       at a fixed 0.62. Fallback 0.62 until the script runs. */
    transform: scale(var(--sw-scale, 0.62));
    transform-origin: top center;
    /* Height is viewport-derived on mobile (see updateScale / SW_MOBILE_H_*):
       the frame is shortened PRE-scale so its painted height lands near half the
       viewport, leaving the other half for the narration copy. The stage flexes
       down to absorb it; the keyboard footer keeps its size. */
    height: var(--sw-base-h, 600px);
    /* `transform: scale()` shrinks the paint but NOT the layout box — the frame
       still reserves its full 400×--sw-base-h, which inflates .sw-stage-col and
       the grid track wider than the viewport (dragging the beat copy off-screen
       too). So reclaim the empty layout box the scale leaves, proportional to the
       live scale: baseH × (1−scale) vertically, and 200px (half the authored
       width) on each side horizontally — collapsing the footprint to the visual
       size, still centered. */
    margin-bottom: calc(-1 * var(--sw-base-h, 600px) * (1 - var(--sw-scale, 0.62)));
    margin-left: calc(-200px * (1 - var(--sw-scale, 0.62)));
    margin-right: calc(-200px * (1 - var(--sw-scale, 0.62)));
  }
  /* The frame fills the column here, so the paper can't overhang it by much
     without pushing past the band's 24px side padding (horizontal scroll). */
  .sw-paper {
    left: -8px;
    right: -8px;
  }
  /* Inside the (now shorter) frame, buy the stage back some of what the trim
     took: the exercise is the point, the chrome padding isn't. */
  .sw-phone-header {
    padding: 9px 16px;
  }
  .sw-stage {
    padding: 12px;
  }
  /* The stage lost ~40% of its height to the frame trim, and it clips (not
     scrolls) — at 360px the WS audio button was getting chopped off the top. So
     tighten the embed's vertical trims another notch on mobile only. Same
     reasoning as the desktop trims above: embed-scoped, because the frame is far
     shorter than a real phone screen and needs the extra notch. */
  .sw-slides :deep(.who-said-that),
  .sw-slides :deep(.ws-body) {
    padding-block: 4px;
  }
  .sw-slides :deep(.wst-header),
  .sw-slides :deep(.ws-header) {
    margin-bottom: 4px;
  }
  .sw-slides :deep(.wst-audio-controls),
  .sw-slides :deep(.ws-audio-controls) {
    margin-bottom: 6px;
  }
  .sw-slides :deep(.wst-suspects),
  .sw-slides :deep(.ws-options-fit) {
    margin-bottom: 4px;
  }
  .sw-slides :deep(.wst-suspect) {
    padding-block: 6px;
  }
  .sw-slides :deep(.wst-letter-container) {
    height: 44px;
  }
  .sw-keyboard-real {
    padding: 4px 8px 6px;
  }
  /* Trim the chrome that sits between the frame and the copy — every px here is
     a px of narration. */
  .sw-stage-col {
    gap: 8px;
  }
  .sw-cnav {
    height: 26px;
    gap: 8px;
  }
  .sw-cnav-arrow {
    width: 26px;
    height: 26px;
  }
  .sw-beat {
    /* The copy has ~half a viewport to live in, so a beat's block only needs
       enough runway to scroll its own copy through that window before the next
       one arrives. 80vh left ~490px of dead scroll per beat, which (with the
       crossing rule in onScroll) also stranded each beat's tail well above the
       next heading. min-height (not height) still lets a long beat grow. */
    min-height: 42vh;
    padding-bottom: 32px;
    /* Phone is now top-pinned (see .sw-sticky above), so top-align the beat text
       to pair with it instead of centering in the block — the centered top half
       was the gap between the phone and beat-1's copy. */
    justify-content: flex-start;
  }
  /* A 4rem numeral cost ~76px of the ~280px reading window for no information.
     Keep it as a positional cue, at a size that earns its space. */
  .sw-beat-num {
    font-size: 1.75rem;
    margin-bottom: 2px;
  }
  .sw-beat-title {
    font-size: 1.5rem;
    margin-bottom: 10px;
  }
  .sw-beat-body {
    font-size: 1.05rem;
    line-height: 1.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sw-layer,
  .sw-phone,
  .sw-paper,
  .sw-stage-wrap {
    transition: none !important;
  }
}

/* ===== DEBUG (retained; active only under .sw-dbg — see swDbg) ============
   Outlines the phone layout boxes and lets the phone overflow so a keyboard
   footer pushed past the bottom is visible (hanging below) instead of clipped.
   Inert unless the .sw-dbg class is present, so it's free to keep around. */
.sw-dbg .sw-phone {
  overflow: visible !important;
  outline: 2px solid #2962ff; /* phone bounds (blue) */
}
.sw-dbg .sw-stage {
  outline: 2px solid #ff6d00; /* stage / flex:1 region (orange) */
}
.sw-dbg .sw-slides {
  outline: 2px dashed #00c853; /* live exercise slot (green) */
}
.sw-dbg .sw-keyboard-real {
  outline: 3px solid #d50000; /* keyboard footer (red) — watch where it lands */
  background: rgba(213, 0, 0, 0.06);
}
</style>
