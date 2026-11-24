<!--
  HeroReadVignette.vue — the LetterPeople word inside the hero's H1.

  Renders `read` as a posed MissingLetters exercise: `_ead` with the blank's
  persistent underline and a blinking cursor, which then answers itself. The
  visual idiom is deliberately borrowed from the real exercise
  (`src/questions/MissingLettersView.vue`) so a visitor who meets it later in
  /peek gets an "I've seen this" echo — underline + cursor + plain letters (no
  eyes/mouth/arms until the celebration), and the same left→right wipe when a
  blank fills.

  Deliberately NOT borrowed: the exercise's slot boxes (dashed borders, tinted
  backgrounds). In a headline the word must read as text, not as a form.

  TAP ADVANCES THE WORD, through a two-tier ring. This is a tap payload, NOT an
  auto-rotating headline: nothing cycles on its own and the hero's motion budget
  is unchanged (see the settled-state comment in heroReadAnimation.ts). Without
  a `cycle` the tap degrades to the old behaviour — re-pose and re-answer the
  same word.

    Tier 1 (`cycle`)  — read → spell → learn. Claims. Each is posed as a real
                        exercise with its blank in a different position, and
                        each is a legitimate resting state.
    Tier 2 (`encore`) — juggle? → dance!. Personality. No blank, no cursor, no
                        fill: the word arrives COMPLETE (the tell that the rules
                        changed) and then the Letters perform. Never a resting
                        state — an abandoned encore snaps quietly home to `read`
                        after RETURN_HOME_MS.

  Sizing consequence, and the thing most likely to be broken by an edit here:
  --hr-h is pinned by the widest TIER-1 word, so all three claims render at one
  size. A longer encore word squishes itself (`bindingWidthPerH`) rather than
  shrinking the `read` that every visitor sees.

  Everything here is aria-hidden — the H1's keyword text is real DOM text in
  HeroGreeting.vue, and it stays "read" regardless of which word is on screen.
  See hero-read.spec.md §5 and its amendment; timing lives in
  heroReadAnimation.ts.

  Root element is a <span> (display:block): the vignette lives inside an <h1>,
  which only accepts phrasing content.
-->

<template>
    <!-- data-prerender-blank: in the static copy shown before mount (the hero,
         scripts/prerender-public.ts) this keeps its slots but not its letters
         or measured sizes, which were taken at the prerender's own width; the
         rule under [data-prerendered] below holds the same height. -->
    <span
        ref="rootEl"
        class="hero-read"
        aria-hidden="true"
        data-prerender-blank
        @click="onTap"
        @pointerenter="onPointer($event, true)"
        @pointerleave="onPointer($event, false)"
    >
        <span ref="rowEl" class="hero-read__row" :class="{ 'hero-read__row--replayable': canReplay }">
            <span
                v-for="(char, i) in chars"
                :key="`${wordIndex}-${char}-${i}`"
                class="hr-slot"
                :style="i === blankIndex ? blankSlotStyle : undefined"
            >
                <span :ref="(el) => setLetterEl(el as Element | null, i)" class="hr-letter"></span>

                <!-- Blinking cursor: empty blank only -->
                <span v-if="i === blankIndex && cursorVisible" class="hr-cursor"></span>

                <!-- Persistent underline: stays after the blank is filled -->
                <span v-if="i === blankIndex" class="hr-underline"></span>
            </span>
        </span>

        <!-- Offscreen measurement rows, one per word in the ring, mounted only
             for the measurement pass in onMounted and then dropped. Rendered in
             the template rather than built in script so they inherit the scoped
             style attributes (and therefore the real slot/gap/glyph metrics);
             a document.createElement copy would miss `[data-v-*]` and measure
             an unstyled row. -->
        <span v-if="measuring" class="hero-read__measure">
            <span
                v-for="(w, wi) in words"
                :key="w.word"
                class="hero-read__row"
                :ref="(el) => setMeasureRowEl(el as Element | null, wi)"
            >
                <span v-for="(char, i) in w.chars" :key="`${char}-${i}`" class="hr-slot">
                    <span
                        :ref="(el) => setMeasureLetterEl(el as Element | null, wi, i)"
                        class="hr-letter"
                    ></span>
                </span>
            </span>
        </span>
    </span>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useDisplay } from "vuetify";
import { animate } from "animejs";
import { createLetter, randomVibrancyColor } from "../../letterpeople";
import type { LetterInstance } from "../../letterpeople/types";
import {
    createReadVignetteController,
    type PosedRung,
} from "./heroReadAnimation";

/** Tier 1: a rest-able claim, posed as a real exercise. Blank fixed by copy. */
interface HeroWordSpec {
    word: string;
    blankIndex: number;
}

/** Tier 2: an encore. Arrives complete, performs, and is never a resting state. */
interface HeroEncoreSpec {
    word: string;
    act: HeroAct;
    /** Which letter performs. Defaults to the first. */
    actLetter?: number;
}

type HeroAct = "juggle" | "floss";

const props = withDefaults(
    defineProps<{
        /** The canonical word: first paint, resting state, sr-only text. */
        word: string;
        /** Index of the letter posed as a blank. Fixed by copy — see landingPageCopy. */
        blankIndex: number;
        /** Additional tier-1 words tapping advances through, in order.
         *  `readonly` because landingPageCopy is `as const`. */
        cycle?: readonly HeroWordSpec[];
        /** Tier-2 encore rungs, reached after the whole of `cycle`. */
        encore?: readonly HeroEncoreSpec[];
    }>(),
    { blankIndex: 0, cycle: () => [], encore: () => [] },
);

interface HeroWord {
    word: string;
    chars: string[];
    /** null on encore rungs: nothing to solve, so no cursor and no fill. */
    blankIndex: number | null;
    act?: HeroAct;
    actLetter: number;
    /** Encore rungs may squish to fit and must never be left resting. */
    encore: boolean;
    /** One color for the whole word — the hero's own idiom, not the
     *  exercise's per-letter rainbow. Re-rolled per word so a tap reads as a
     *  new object, not the same word repainted. */
    color: string;
}

const toClaim = (spec: HeroWordSpec): HeroWord => ({
    word: spec.word,
    chars: spec.word.split(""),
    blankIndex: spec.blankIndex,
    actLetter: 0,
    encore: false,
    color: randomVibrancyColor(),
});

const toEncore = (spec: HeroEncoreSpec): HeroWord => ({
    word: spec.word,
    chars: spec.word.split(""),
    blankIndex: null,
    act: spec.act,
    actLetter: spec.actLetter ?? 0,
    encore: true,
    color: randomVibrancyColor(),
});

/**
 * The ring. Index 0 is canonical `read`; tapping walks forward and wraps.
 * Tier 1 first, then the encore — so the encore is only reachable by someone
 * who has already tapped through every claim.
 */
const words: HeroWord[] = [
    toClaim({ word: props.word, blankIndex: props.blankIndex }),
    ...props.cycle.map(toClaim),
    ...props.encore.map(toEncore),
];

const wordIndex = ref(0);
const current = computed(() => words[wordIndex.value]);
const chars = computed(() => current.value.chars);
const blankIndex = computed(() => current.value.blankIndex);

const display = useDisplay();

const rootEl = ref<HTMLElement | null>(null);
const rowEl = ref<HTMLElement | null>(null);
let letterEls: (HTMLElement | null)[] = [];
let letters: (LetterInstance | null)[] = [];
/** Teardown for an encore act in flight (juggling cascade / floss loop). */
let actStop: (() => void) | null = null;

const cursorVisible = ref(false);
const canReplay = ref(false);
const measuring = ref(true);
const blankSlotStyle = ref<Record<string, string>>({});

// Ref callbacks record only non-null elements. Vue fires them with `null` while
// unmounting the outgoing word's slots, and that teardown can interleave with
// the incoming word's mounts at the same index — recording the null would
// clobber a freshly-mounted container. The arrays are cleared explicitly before
// each word swap instead.
const setLetterEl = (el: Element | null, i: number) => {
    if (el) letterEls[i] = el as HTMLElement;
};

const measureRowEls: (HTMLElement | null)[] = words.map(() => null);
const measureLetterEls: (HTMLElement | null)[][] = words.map((w) =>
    w.chars.map(() => null),
);
const setMeasureRowEl = (el: Element | null, wi: number) => {
    if (el) measureRowEls[wi] = el as HTMLElement;
};
const setMeasureLetterEl = (el: Element | null, wi: number, i: number) => {
    if (el) measureLetterEls[wi][i] = el as HTMLElement;
};

const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Cross-fade covering a word swap — long enough to hide the row's width
 *  change (4-char `read` vs 5-char `spell`), short enough not to feel like a
 *  slideshow transition. */
const SWAP_FADE_MS = 180;

/** Throws in the encore cascade. Long enough to register as juggling, short
 *  enough that the joke doesn't outstay itself. */
const JUGGLE_BEATS = 10;
/** Beats of floss — two full six-beat cycles, plus the chorus-line offset. */
const FLOSS_BEATS = 12;
/**
 * Grace period after an encore settles before the hero quietly becomes `read`
 * again. Long enough that a visitor mid-chuckle can tap onward; short enough
 * that "Teach your child to juggle?" is never what someone scrolls past.
 */
const RETURN_HOME_MS = 6000;

const letterOptions = (color: string) => ({
    color,
    lineWidth: 20,
    borderWidth: 2,
    showEyes: false,
    showMouth: false,
    showArms: false,
});

// --- Sizing ---------------------------------------------------------------
//
// One CSS variable, --hr-h, drives every dimension in this component (letter
// height, gaps, underline, cursor), so fitting the word to its column is a
// single number. `baseHeight` is the type-scale target per breakpoint; the fit
// pass below shrinks it when the column is too narrow, which is what keeps the
// word from wrapping or overflowing at 320px.
//
// The var is written straight to the element rather than bound reactively:
// reactive state applies on the next tick, which is a frame late — long enough
// for an over-wide word to paint once on a narrow viewport.

const MIN_HEIGHT = 52;

const baseHeight = (): number => {
    if (display.xs.value) return 92;
    if (display.sm.value) return 118;
    if (display.md.value) return 128;
    return 165;
};

/** Per word: row width per 1px of --hr-h. */
const rowWidthPerH: number[] = words.map(() => 0);
/**
 * The widest REST-ABLE word (tier 1), which is what pins --hr-h. All three
 * claims share one size — a tap onto the longer `spell`/`learn` must not
 * resize the letters, and a fit taken from 4-char `read` would let 5-char
 * `spell` overflow at 320px.
 */
let restableMaxWidthPerH = 0;
/** Per word: the filled blank's letter width per 1px of --hr-h. */
const blankWidthPerH: number[] = words.map(() => 0);
let currentH = 0;

/**
 * The width constraint that binds for word `wi`: never looser than what the
 * rest-able tier needs, and tightened when this particular word is wider.
 * Net effect — tier 1 renders at exactly the size it always did, and a longer
 * encore word squishes ITSELF to fit rather than shrinking the resting hero.
 */
const bindingWidthPerH = (wi: number): number =>
    Math.max(restableMaxWidthPerH, rowWidthPerH[wi]);

const setHeight = (h: number) => {
    currentH = h;
    rootEl.value?.style.setProperty("--hr-h", `${h}px`);
    // Reserve the FILLED width of the blank from t=0 so the fill animation
    // never reflows the headline or shifts the CTA row below it.
    const perH = blankWidthPerH[wordIndex.value];
    if (perH > 0) {
        blankSlotStyle.value = { width: `${perH * h}px` };
    }
};

/** The --hr-h that fits word `wi` in the column as it currently is. */
const fitHeight = (wi: number): number => {
    const perH = bindingWidthPerH(wi);
    const available = rootEl.value?.clientWidth ?? 0;
    if (perH <= 0 || available <= 0) return currentH || baseHeight();
    return Math.max(
        MIN_HEIGHT,
        Math.min(baseHeight(), Math.floor(available / perH)),
    );
};

const fitToWidth = () => setHeight(fitHeight(wordIndex.value));

/**
 * Build every word once, offscreen, to take the ratios the sizing needs, then
 * tear the instances down. Synchronous, so nothing paints.
 */
const measureAll = () => {
    if (currentH <= 0) return;
    words.forEach((w, wi) => {
        const row = measureRowEls[wi];
        if (!row) return;
        const instances = w.chars.map((char, i) => {
            const container = measureLetterEls[wi][i];
            return container
                ? createLetter(char.toLowerCase(), container, letterOptions(w.color))
                : null;
        });
        rowWidthPerH[wi] = row.offsetWidth / currentH;
        if (!w.encore) {
            restableMaxWidthPerH = Math.max(restableMaxWidthPerH, rowWidthPerH[wi]);
        }
        if (w.blankIndex !== null) {
            blankWidthPerH[wi] =
                (measureLetterEls[wi][w.blankIndex]?.offsetWidth ?? 0) / currentH;
        }
        instances.forEach((inst) => inst?.destroy());
    });
};

// --- Letter creation ------------------------------------------------------

const destroyLetterAt = (i: number) => {
    letters[i]?.destroy();
    letters[i] = null;
};

const destroyAllLetters = () => {
    letters.forEach((_, i) => destroyLetterAt(i));
    letters = [];
};

const createLetterAt = (i: number): LetterInstance | null => {
    const container = letterEls[i];
    if (!container) return null;
    destroyLetterAt(i);
    letters[i] = createLetter(
        chars.value[i].toLowerCase(),
        container,
        letterOptions(current.value.color),
    );
    return letters[i];
};

/** Every letter except the blank — the posed state. An encore word (no blank)
 *  is therefore built complete, which is exactly what it wants. */
const createPosedWord = () => {
    chars.value.forEach((_, i) => {
        if (i !== blankIndex.value) createLetterAt(i);
    });
};

/**
 * Fill the blank. Animated fills mimic `createLetterAt(i, letter, true)` in
 * MissingLettersView: a 150ms outQuad width expansion that wipes the letter in
 * left→right. There the SLOT expands; here the slot is pre-reserved at its
 * filled width (no reflow), so the wipe runs on the letter box inside it.
 */
const fillBlank = async (animated: boolean): Promise<void> => {
    const i = blankIndex.value;
    if (i === null) return; // encore rung — nothing was ever blanked
    const container = letterEls[i];
    if (!container) return;

    createLetterAt(i);
    if (!animated) return;

    const targetWidth = container.offsetWidth;
    if (targetWidth <= 0) return;

    container.style.overflow = "hidden";
    await new Promise<void>((resolve) => {
        animate(container, {
            width: [0, targetWidth],
            duration: 150,
            ease: "outQuad",
            onComplete: () => {
                container.style.width = "";
                container.style.overflow = "";
                resolve();
            },
        });
    });
};

const fadeRow = (to: number): Promise<void> =>
    new Promise<void>((resolve) => {
        const el = rowEl.value;
        if (!el) return resolve();
        animate(el, {
            opacity: to,
            duration: SWAP_FADE_MS,
            ease: "outQuad",
            onComplete: () => resolve(),
        });
    });

/** Drop the celebration's faces (and any mid-wave arm) — back to plain text. */
const returnToPlainText = () => {
    for (const letter of letters) {
        if (!letter) continue;
        letter.arms.stopAnimations();
        letter.arms.hide({ duration: 120 });
        letter.eyes.hide({ duration: 120 });
        letter.mouth.hide({ duration: 120 });
    }
};

/**
 * Cross-fade the row out, build word `i`, fade it back in. `complete` builds
 * the blank too — for the snap home, where the word must simply BE `read` and
 * not perform being solved to an empty room.
 */
const swapTo = async (i: number, complete = false): Promise<void> => {
    await fadeRow(0);
    destroyAllLetters();
    letterEls = [];
    wordIndex.value = i;
    await nextTick();

    // Re-fit: an encore word wider than the claims squishes here, and a claim
    // coming back after one restores the locked size.
    setHeight(fitHeight(i));
    if (complete) {
        chars.value.forEach((_, idx) => createLetterAt(idx));
    } else {
        createPosedWord();
    }
    await fadeRow(1);
};

/**
 * Return the vignette to a posed state for the next run. One word in the ring:
 * re-blank in place (the original replay). More than one: cross-fade to the
 * next word — posed with its blank empty, or, for an encore, already complete.
 * The fade covers the row's width change so the swap doesn't jump the centered
 * mobile row.
 */
const reposeNext = async (): Promise<PosedRung> => {
    if (words.length <= 1) {
        returnToPlainText();
        if (blankIndex.value !== null) destroyLetterAt(blankIndex.value);
        return { hasBlank: blankIndex.value !== null };
    }

    await swapTo((wordIndex.value + 1) % words.length);

    const rung = current.value;
    return {
        hasBlank: rung.blankIndex !== null,
        perform: rung.act ? () => performAct(rung) : undefined,
    };
};

/** Quiet snap home after an abandoned encore: `read`, complete, no fanfare. */
const goHome = async (): Promise<void> => {
    if (wordIndex.value === 0) return;
    await swapTo(0, true);
};

// --- Encore acts ----------------------------------------------------------

/**
 * The payoff. Both acts are real letterpeople systems rather than bespoke hero
 * animation — the point of the encore is the Letters doing something they can
 * actually do. Balls and swinging arms deliberately overflow the row into the
 * headline line above; every box in the chain is `overflow: visible`.
 */
const performAct = async (rung: HeroWord): Promise<void> => {
    const cast = letters.filter((l): l is LetterInstance => l !== null);
    if (cast.length === 0) return;

    if (rung.act === "juggle") {
        const performer = letters[rung.actLetter] ?? cast[0];
        // Dynamic import: the juggling physics core is a large module and the
        // landing page's first paint must not carry it. Nothing reaches this
        // line without five deliberate taps.
        const { cascadePhrase } = await import(
            "../../letterpeople/transforms/juggling/phrases/cascadePhrase"
        );
        const controller = await cascadePhrase(performer, {
            maxBeats: JUGGLE_BEATS,
            height: 55,
            ballRadius: 5,
            startDelay: 250,
        });
        actStop = () => controller.destroy();
        await controller.completed;
        actStop = null;
    } else if (rung.act === "floss") {
        const { floss } = await import("../../letterpeople/animations");
        let aborted = false;
        actStop = () => {
            aborted = true;
        };
        // A chorus line, not a unison: each letter starts one beat behind its
        // neighbour so the swing travels across the word. Punctuation dances
        // from the hips only — arms on a `!` read as flailing, not dancing.
        await Promise.all(
            cast.map((letter, i) =>
                floss(letter, {
                    beats: FLOSS_BEATS,
                    startBeat: i,
                    bodyOnly: !/[a-z]/i.test(letter.character),
                    isAborted: () => aborted,
                }),
            ),
        );
        actStop = null;
    }

    // Arms away. Both acts leave them relaxed but visible, and a word standing
    // there with its arms out has lost the "reads as text" quality the whole
    // vignette depends on — same reason the settled wave puts them back.
    await Promise.all(cast.map((letter) => letter.arms.hide({ duration: 200 })));
};

// --- Controller wiring ----------------------------------------------------

const controller = createReadVignetteController({
    getLetters: () => letters,
    fillBlank,
    reposeNext,
    goHome,
    setCursorVisible: (v) => {
        cursorVisible.value = v;
    },
    isInView: () => inView,
});

// For the one-off nudge (heroReadAnimation.ts): skipped if the word has
// scrolled away by the time it would fire.
let inView = true;
let viewObserver: IntersectionObserver | null = null;

/** Hover hint, mouse/pen only: a touch "hover" is just the start of a tap. */
const onPointer = (e: PointerEvent, on: boolean) => {
    if (e.pointerType === "touch" || !canReplay.value) return;
    controller.hover(on);
};

let returnHomeTimer: ReturnType<typeof setTimeout> | null = null;

const clearReturnHomeTimer = () => {
    if (returnHomeTimer) {
        clearTimeout(returnHomeTimer);
        returnHomeTimer = null;
    }
};

/** Tier 1 rungs are all valid resting states; an encore never is. */
const armReturnHome = () => {
    clearReturnHomeTimer();
    if (!current.value.encore) return;
    returnHomeTimer = setTimeout(() => {
        returnHomeTimer = null;
        controller.returnHome();
    }, RETURN_HOME_MS);
};

const onTap = async () => {
    if (!canReplay.value) return;
    clearReturnHomeTimer();
    // advance() resolves false when a run is already in flight (including an
    // encore mid-performance) — arming off that would schedule a snap-home for
    // a rung that never arrived.
    if (await controller.advance()) armReturnHome();
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    setHeight(baseHeight());
    measureAll();
    measuring.value = false;
    setHeight(currentH); // applies the now-known reserved blank width
    fitToWidth();

    createPosedWord();

    if (prefersReducedMotion) {
        // Fill without animation, then put the faces on, inert.
        controller.renderStatic();
    } else {
        canReplay.value = true;
        controller.play();
    }

    if (typeof IntersectionObserver !== "undefined" && rootEl.value) {
        viewObserver = new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
        });
        viewObserver.observe(rootEl.value);
    }

    if (typeof ResizeObserver !== "undefined" && rootEl.value) {
        resizeObserver = new ResizeObserver(() => fitToWidth());
        resizeObserver.observe(rootEl.value);
    }
});

onBeforeUnmount(() => {
    controller.cleanup();
    clearReturnHomeTimer();
    actStop?.();
    actStop = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    viewObserver?.disconnect();
    viewObserver = null;
    destroyAllLetters();
});
</script>

<style scoped>
/* All dimensions derive from --hr-h (set in script). Ratios are lifted from
   MissingLettersView's slot metrics so the two read as the same object. */
.hero-read {
    display: block;
    --hr-h: 120px;
}
/* The static copy of the hero, before mount: no script has set --hr-h, so
   set it as baseHeight() would per breakpoint (Vuetify's: xs < 600, sm < 960,
   md < 1280). The empty slots then hold the height the letters will take, and
   nothing below the headline moves when they arrive. Keep in step with
   baseHeight(). */
[data-prerendered] .hero-read {
    --hr-h: 92px;
}
@media (min-width: 600px) {
    [data-prerendered] .hero-read {
        --hr-h: 118px;
    }
}
@media (min-width: 960px) {
    [data-prerendered] .hero-read {
        --hr-h: 128px;
    }
}
@media (min-width: 1280px) {
    [data-prerendered] .hero-read {
        --hr-h: 165px;
    }
}

.hero-read__row {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    flex-wrap: nowrap;
    gap: calc(var(--hr-h) * 0.07);
    /* Room below the baseline for the underline (and for celebration bounces). */
    padding-bottom: calc(var(--hr-h) * 0.2);
    width: fit-content;
    margin: 0 auto;
}

.hero-read__row--replayable {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.18s ease-out;
}
/* Hover hint (with the letters perking up, heroReadAnimation.ts): the word
   lifts a touch, like the page's other pressables. Pointer devices only. */
@media (hover: hover) {
    .hero-read__row--replayable:hover {
        transform: translateY(-3px);
    }
}

/* Measurement rows: laid out for real (so offsetWidth is meaningful) but out of
   flow and off-viewport, so they can never contribute to page width or paint.
   `visibility: hidden` rather than `display: none` — the latter zeroes the very
   metrics being measured. Inherits --hr-h from .hero-read through the DOM. */
.hero-read__measure {
    position: fixed;
    top: 0;
    left: -99999px;
    visibility: hidden;
    pointer-events: none;
}

.hr-slot {
    position: relative;
    display: flex;
    justify-content: flex-start;
    /* Box ends at the letters' baseline: the created SVG reserves descender
       room below y=100 that `read` never uses, so cropping to the baseline
       keeps the word compact in a headline. Overflow stays visible. */
    height: calc(var(--hr-h) * 0.72);
}

.hr-letter {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    overflow: visible;
}

.hr-letter :deep(svg) {
    display: block;
    height: var(--hr-h);
    width: auto;
    overflow: visible;
}

/* Vertical blinking cursor in the empty blank — MissingLettersView's .ml-cursor.
   Sized as a TEXT CARET rather than a box decoration, because there is no box
   here to be centered in: it occupies exactly the band the LETTERS occupy, so
   it reads as one of them rather than as a UI chrome element sitting on the
   line. That leaves the same breathing room above the underline that the
   letters' feet leave.

   The two numbers are the glyph's own metrics, not taste. createLetter() pads
   the viewBox by borderWidth + lineWidth/2 = 2 + 10 = 12 units on a 135-unit
   letterbox, so the rendered SVG is 159 units tall at height `--hr-h`:
     ascender top (letter y=0)    → 12/159  = 0.076h  from the slot's top
     baseline    (letter y=100)   → 112/159 = 0.704h  from the slot's top
   The slot crops at 0.72h, so the baseline is 0.016h above its bottom edge.
   Net: the caret is the same height as the `d` and stands on the same
   baseline, with ~0.076h of air before the underline. */
.hr-cursor {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: calc(var(--hr-h) * 0.076);
    bottom: calc(var(--hr-h) * 0.016);
    width: calc(var(--hr-h) * 0.03);
    border-radius: 2px;
    background: #2196f3;
    animation: hr-cursor-blink 1s step-end infinite;
}

@keyframes hr-cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}

/* Persistent underline — stays after the blank is filled, as in the exercise */
.hr-underline {
    position: absolute;
    left: 4%;
    right: 4%;
    bottom: calc(var(--hr-h) * -0.1);
    height: calc(var(--hr-h) * 0.04);
    border-radius: 999px;
    background: #bbb;
}

@media (prefers-reduced-motion: reduce) {
    .hr-cursor {
        display: none;
    }
    .hero-read__row--replayable {
        cursor: default;
    }
}
</style>
