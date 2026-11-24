<template>
    <div
        ref="keyboardContainer"
        class="progressive-keyboard"
        :class="{
            'pk-compact': activeKeys.length <= 4,
            'pk-medium': activeKeys.length > 4 && activeKeys.length <= 10,
            'pk-full': activeKeys.length > 10,
        }"
        :style="containerStyle"
        role="application"
        :aria-label="ariaLabel"
        tabindex="0"
        @keydown="handleKeyDown"
        @keyup="handleKeyUp"
    >
        <!-- Keyboard visualization with absolute positioning -->
        <TransitionGroup
            tag="div"
            name="pk-key-anim"
            class="pk-keys-container"
            :style="keysContainerStyle"
        >
            <template v-for="key in renderedKeys" :key="key.letter">
                <!-- Regular button for all keys including Enter -->
                <button
                    :ref="(el) => setKeyRef(key.letter, el as HTMLElement)"
                    class="pk-key"
                    :class="getKeyClasses(key)"
                    :style="getKeyStyle(key)"
                    :aria-label="
                        key.letter === 'space'
                            ? 'Space bar'
                            : key.letter === 'enter'
                              ? 'Enter key'
                              : key.letter === 'arrowleft'
                                ? 'Left arrow'
                                : key.letter === 'arrowright'
                                  ? 'Right arrow'
                                  : key.letter === 'backspace'
                                    ? 'Backspace'
                                    : key.letter === 'shift'
                                      ? `Shift key${shiftActive ? ' (active)' : ''}`
                                      : `Letter ${displayUppercase ? key.letter.toUpperCase() : key.letter}`
                    "
                    :aria-pressed="
                        key.letter === 'shift'
                            ? shiftActive
                            : pressedKeys.has(key.letter)
                    "
                    :disabled="key.isGhost || !enabledKeys.has(key.letter)"
                    @pointerdown.prevent="handleKeyPress(key.letter)"
                    @pointerup.prevent="handleKeyRelease(key.letter)"
                    @pointerleave="handleKeyLeave(key.letter)"
                    @pointerenter="handleKeyHover(key.letter)"
                >
                    <span
                        class="pk-key-letter"
                        :class="{
                            'pk-key-letter--space': key.letter === 'space',
                            'pk-key-letter--enter': key.letter === 'enter',
                            'pk-key-letter--arrow':
                                key.letter === 'arrowleft' ||
                                key.letter === 'arrowright',
                            'pk-key-letter--backspace':
                                key.letter === 'backspace',
                        }"
                    >
                        <v-icon v-if="key.letter === 'space' && props.spaceText?.startsWith('mdi-')" :size="spaceIconSize">{{ props.spaceText }}</v-icon>
                        <template v-else-if="key.letter === longPressArmed">
                            <template v-for="(part, i) in longPressArmedParts" :key="i"
                                ><span v-if="i > 0" class="pk-key-split-slot"></span>{{ part }}</template
                            >
                        </template>
                        <template v-else>{{ getKeyDisplayText(key) }}</template>
                    </span>

                    <!-- Visual 'nub' for Enter key to give it a slight L-shape hint -->
                    <div v-if="key.letter === 'enter'" class="pk-key-nub"></div>

                    <!-- Decoration slot for custom overlays -->
                    <slot
                        name="key-decoration"
                        :letter="key.letter"
                        :key-def="key"
                        :is-pressed="pressedKeys.has(key.letter)"
                        :is-highlighted="highlightedKeys.has(key.letter)"
                        :is-ghost="key.isGhost"
                    >
                    </slot>
                </button>
            </template>
        </TransitionGroup>

        <!-- Hidden audio elements for phoneme playback -->
        <audio
            v-for="key in activeKeys"
            :key="`audio-${key.letter}`"
            :ref="(el) => setAudioRef(key.letter, el as HTMLAudioElement)"
            :src="getPhonemeAudio(key.letter)"
            preload="auto"
        />

        <!-- Hidden audio elements for chord (multi-letter GPC) playback -->
        <audio
            v-for="(url, grapheme) in chordDefinitions"
            :key="`chord-audio-${grapheme}`"
            :ref="(el) => setChordAudioRef(grapheme as string, el as HTMLAudioElement)"
            :src="url"
            preload="auto"
        />

        <!-- Screen reader announcements -->
        <div class="sr-only" aria-live="polite" aria-atomic="true">
            {{ announcement }}
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ref,
    computed,
    onMounted,
    onBeforeUnmount,
    watch,
    nextTick,
} from "vue";
import {
    getKeyDefinition,
    getKeysBoundingBox,
    KEYBOARD_LAYOUT,
    ALL_LETTER_KEYS,
    ALL_NUMBER_KEYS,
    SPACE_KEY,
    LEFT_ARROW_KEY,
    RIGHT_ARROW_KEY,
    BACKSPACE_KEY,
    ENTER_KEY,
    SHIFT_KEY,
    MAX_LAYOUT_BOUNDS,
    ROW_OFFSETS,
    type KeyDefinition,
} from "./keyboardLayout";
import type { KeyEvent, KeyAnimationOptions } from "./types";
import { generateColorVariants } from "../../letterpeople/util/color";
import { getPhonemeUrlForLetter } from "@/audio/letterToArpabet";
import { getDefaultShowShift } from "@/utils/deviceDetection";

// ============================================================================
// Props
// ============================================================================

interface Props {
    /**
     * Letters to display on the keyboard.
     * Only these letters will be rendered (unless showFullLayout is true).
     * Include 'space' to show the spacebar.
     */
    letters: string[];

    /**
     * Letters that are currently enabled for interaction.
     * Defaults to all displayed letters if not specified.
     */
    enabledLetters?: string[];

    /**
     * Letters to visually highlight (e.g., as hints).
     */
    highlightedLetters?: string[];

    /**
     * Custom text to display on the spacebar.
     * If not set, spacebar shows no text (just the wide key).
     */
    spaceText?: string;

    /**
     * Whether to play phoneme audio on key press.
     */
    playPhonemeOnPress?: boolean;

    /**
     * Minimum key size in pixels (keys won't shrink below this).
     */
    minKeySize?: number;

    /**
     * Maximum key size in pixels.
     */
    maxKeySize?: number;

    /**
     * Whether to capture physical keyboard input.
     */
    captureKeyboard?: boolean;

    /**
     * Accessibility label for the keyboard.
     */
    ariaLabel?: string;

    /**
     * Custom key colors as a map of letter -> color.
     * Each color will have hover/pressed variants auto-generated via OKLCH.
     */
    keyColors?: Record<string, string>;

    /**
     * Whether the keyboard is disabled.
     */
    disabled?: boolean;

    /**
     * When true, shows all keyboard keys with inactive ones as dashed outlines.
     * When false (default), only shows the letters in the `letters` prop.
     */
    showFullLayout?: boolean;

    /**
     * Base color for all keys (hex or rgb string).
     * Hover and pressed states are auto-derived using OKLCH lightness adjustments.
     * Default is green (#4caf50).
     */
    baseKeyColor?: string;

    /**
     * Whether to display lowercase letters on keycaps.
     * Default is false (uppercase).
     */
    lowercaseKeycaps?: boolean;

    /**
     * Font family for keycap letters.
     * Defaults to Poppins — a geometric sans (true-circle bowls, straight
     * tangent stems, single-story a/g) chosen to match LetterPeople's
     * hand-drawn SVG letterforms more closely than Roboto's double-story a.
     */
    fontFamily?: string;

    /**
     * Whether to show arrow keys (left/right) next to the spacebar.
     * When true, spacebar is narrower and arrows appear to its right.
     * Default is false.
     */
    showArrows?: boolean;

    /**
     * Whether to show a Shift key, left-aligned with Q, above the spacebar.
     * Momentary behavior: letter keycaps flip to the opposite of the
     * configured casing (lowercaseKeycaps) while active, reverting
     * immediately when it's not. On-screen, "active" tracks hover (mouse
     * enters/leaves the key) for one-handed ease of access; on a physical
     * keyboard it tracks press/release of the Shift key. Purely a display
     * effect — emitted KeyEvent.letter values remain normalized lowercase.
     *
     * When left unset, defaults to a device-sniffed guess
     * (see `src/utils/deviceDetection.ts::getDefaultShowShift`): on for
     * likely laptop/desktop use, off for Chrome OS and touch-only devices.
     * Pass explicitly to override the guess.
     */
    showShift?: boolean;

    /**
     * Whether to play phoneme audio on key release instead of press.
     * When true, audio fires on pointerup/keyup. Required for chord
     * support — the release is when we know whether the press was a solo
     * letter or part of a multi-key chord.
     */
    playPhonemeOnRelease?: boolean;

    /**
     * Multi-letter grapheme chords the keyboard recognises.
     * Map of grapheme string → audio URL, e.g.:
     *   { 'sh': '/audio/arpa/SH.mp3', 'a_e': '/audio/arpa/EY.mp3' }
     *
     * The keyboard decomposes each grapheme into its constituent letters
     * and detects chords when both are pressed simultaneously. While a
     * chord-starter key is held, non-partner keys are visually dimmed.
     *
     * A grapheme whose two letters are the same key (e_e) can't be chorded,
     * so it becomes a long-press instead: hold the key and it widens into
     * the grapheme; release to hear it (see longPressChords).
     */
    chordDefinitions?: Record<string, string>;

    /**
     * Duration (ms) of the DIM fade — the background-color/opacity tween a key
     * runs when it becomes disabled. Defaults to 400ms (the historical value).
     * Consumers that narrow the keyboard gradually (e.g. MissingLetters'
     * time-based option-shaving) can raise this for a gentler dim. Exposed via
     * the keyboard context so it resets between cards. Interactive hover/press
     * feedback is unaffected (own fast transition).
     */
    disableTransitionMs?: number;

    /**
     * Duration (ms) of the RESTORE fade — the tween when a key becomes enabled
     * again. Separate from {@link disableTransitionMs} so a slow dim can pair
     * with a snappy restore (e.g. MissingLetters dims over 2s but re-enables the
     * board briskly on moving to the next blank). Defaults to 400ms.
     */
    enableTransitionMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
    enabledLetters: undefined,
    highlightedLetters: () => [],
    spaceText: undefined,
    playPhonemeOnPress: false,
    minKeySize: 48,
    maxKeySize: 96,
    captureKeyboard: true,
    ariaLabel: "Progressive Keyboard",
    keyColors: () => ({}),
    disabled: false,
    showFullLayout: false,
    baseKeyColor: "#4caf50",
    lowercaseKeycaps: false,
    fontFamily: "'Poppins', sans-serif",
    showArrows: false,
    showShift: undefined,
    playPhonemeOnRelease: false,
    chordDefinitions: () => ({}),
    disableTransitionMs: 400,
    enableTransitionMs: 400,
});

// ============================================================================
// Emits
// ============================================================================

interface Emits {
    /** Fired when a key is pressed (down) */
    (e: "keypress", event: KeyEvent): void;

    /** Fired when a key is released (up) */
    (e: "keyrelease", event: KeyEvent): void;

    /** Fired when a complete key tap occurs (press + release) */
    (e: "keytap", event: KeyEvent): void;

    /** Fired when a key is hovered over */
    (e: "keyhover", event: KeyEvent): void;

    /** Fired when hover ends (pointer leaves key) */
    (e: "keyhoverend", event: KeyEvent): void;

    /** Fired when phoneme audio starts playing */
    (e: "phoneme-start", letter: string): void;

    /** Fired when phoneme audio ends */
    (e: "phoneme-end", letter: string): void;

    /** Fired when an invalid key is pressed (not in active set) */
    (e: "invalid-key", letter: string): void;

    /**
     * Fired when spacebar is pressed.
     * Convenience event for the common pattern of using space to advance.
     */
    (e: "kbd-space"): void;

    /**
     * Fired when enter key is pressed.
     * Convenience event for submit/confirm actions.
     */
    (e: "kbd-enter"): void;

    /**
     * Fired when left arrow is pressed.
     * Convenience event for navigation actions.
     */
    (e: "arrow-left"): void;

    /**
     * Fired when right arrow is pressed.
     * Convenience event for navigation actions.
     */
    (e: "arrow-right"): void;

    /**
     * Fired when backspace is tapped, on-screen or physical (physical only
     * while the key is on the board and captureKeyboard is on).
     */
    (e: "backspace"): void;

    /**
     * Fired when the Shift key is pressed (active: true) or released
     * (active: false). Momentary — inverts the display casing of letter
     * keycaps while held (visual only).
     */
    (e: "kbd-shift", active: boolean): void;
}

const emit = defineEmits<Emits>();

// ============================================================================
// Refs & State
// ============================================================================

const keyboardContainer = ref<HTMLElement | null>(null);
const keyRefs = ref<Map<string, HTMLElement>>(new Map());
const audioRefs = ref<Map<string, HTMLAudioElement>>(new Map());
const pressedKeys = ref<Set<string>>(new Set());
const focusedKeys = ref<Set<string>>(new Set());
const announcement = ref("");
let globalKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
let globalKeyupHandler: ((e: KeyboardEvent) => void) | null = null;
const previousLetters = ref<Set<string>>(new Set());
const newlyAddedKeys = ref<Set<string>>(new Set());

// Keys that were consumed as part of a chord — their individual release
// should not trigger a second phoneme playback.
const chordConsumedKeys = ref<Set<string>>(new Set());
const chordAudioRefs = ref<Map<string, HTMLAudioElement>>(new Map());

// Anti-keysmash debounce: tracks recent distinct keys that triggered audio.
// After 2 distinct keys within the window, the 3rd is suppressed. Same-key
// repetition (s-s-s-s) is always allowed — only cross-key mashing is gated.
const SMASH_WINDOW_MS = 400;
const SMASH_DISTINCT_LIMIT = 2;
let recentAudioKeys: { key: string; time: number }[] = [];

function audioSmashGate(key: string): boolean {
    const now = Date.now();
    // Prune stale entries
    recentAudioKeys = recentAudioKeys.filter(
        (e) => now - e.time < SMASH_WINDOW_MS,
    );
    // Same key as the most recent play? Always allowed.
    if (
        recentAudioKeys.length > 0 &&
        recentAudioKeys[recentAudioKeys.length - 1].key === key
    ) {
        recentAudioKeys.push({ key, time: now });
        return true;
    }
    // Count distinct keys in the window
    const distinct = new Set(recentAudioKeys.map((e) => e.key));
    if (distinct.size >= SMASH_DISTINCT_LIMIT) {
        return false;
    }
    recentAudioKeys.push({ key, time: now });
    return true;
}

// Whether the Shift key is currently active. Purely a display concern —
// inverts letter keycap casing while true; emitted KeyEvent letters stay
// normalized lowercase (see getKeyDisplayText). On-screen, this is driven by
// hover (see handleKeyHover/handleKeyHoverEnd) rather than press, since a
// single mouse/touch pointer can't hold Shift down and tap a letter at the
// same time. Physical Shift keeps the press/release toggle (see
// handleKeyPress/handleKeyRelease, source === "physical").
const shiftActive = ref<boolean>(false);

// Content-box width available to the keys (excludes the container's padding).
// Drives responsive key sizing so the full layout fits narrow viewports.
// Infinity until measured → first render uses the full author size.
const availableWidth = ref<number>(Number.POSITIVE_INFINITY);
let resizeObserver: ResizeObserver | null = null;

// ============================================================================
// Layout Constants
// ============================================================================

// QWERTY keyboard layout constants
// Numbers now share row 1 with QWERTY (they don't coexist)
// Row 1 = QWERTY/numbers, Row 2 = home, Row 3 = bottom, Row 4 = space
// ROW_OFFSETS imported from keyboardLayout.ts
const KEYS_PER_ROW: Record<number, number> = {
    1: 10, // QWERTY or numbers
    2: 9, // Home row (+ enter top)
    3: 7, // Bottom row (+ enter bottom)
    4: 1, // Space (+ arrows)
};
const ROW_COUNT = 4; // Rows 1-4 (QWERTY/numbers, home, bottom, space)

// ============================================================================
// Computed
// ============================================================================

/**
 * Resolved showShift: the explicit prop if passed, otherwise a
 * device-sniffed guess (see src/utils/deviceDetection.ts). Computed once
 * per mount — pointer/hover capability isn't expected to change mid-session.
 */
const effectiveShowShift = computed((): boolean => {
    return props.showShift ?? getDefaultShowShift();
});

/**
 * Set of all currently active key letters: props.letters plus any
 * auto-injected specials (arrows via showArrows, shift via showShift).
 * Deliberately NOT just props.letters — the global physical-keyboard
 * handlers (used when the keyboard container isn't focused) gate on this
 * set, and previously missed auto-injected specials entirely since they're
 * never listed literally in props.letters.
 */
const activeLetterSet = computed((): Set<string> => {
    return new Set(activeKeys.value.map((k) => k.letter));
});

/**
 * Whether spacebar is included
 */
const hasSpacebar = computed((): boolean => {
    return activeLetterSet.value.has("space");
});

/**
 * Key definitions for all active letters, sorted by keyboard position
 */
const activeKeys = computed((): KeyDefinition[] => {
    const keys = props.letters
        .map((l) => getKeyDefinition(l.toLowerCase()))
        .filter((k): k is KeyDefinition => k !== undefined);

    // Add arrow keys if showArrows is true AND they're not already in the list
    let allKeys = [...keys];
    if (
        props.showArrows &&
        !props.letters.includes("arrowleft") &&
        !props.letters.includes("arrowright")
    ) {
        const leftArrow = getKeyDefinition("arrowleft");
        const rightArrow = getKeyDefinition("arrowright");
        if (leftArrow) allKeys.push(leftArrow);
        if (rightArrow) allKeys.push(rightArrow);
    }

    // Add shift key if showShift resolves true AND it's not already in the
    // list AND there's at least one letter keycap for it to act on — never
    // auto-inject shift for spacebar-only (e.g. GpcIntro) or numeric-only
    // (e.g. WordSelection) keyboards, since there's no casing to flip.
    const hasLetterKeycaps = keys.some(
        (k) => k.letter.length === 1 && k.letter >= "a" && k.letter <= "z",
    );
    if (
        effectiveShowShift.value &&
        hasLetterKeycaps &&
        !props.letters.includes("shift")
    ) {
        const shiftKey = getKeyDefinition("shift");
        if (shiftKey) allKeys.push(shiftKey);
    }

    // Sort by row first, then by column
    return allKeys.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
    });
});

/**
 * Whether arrow keys are active (either via showArrows prop or in letters list)
 */
const hasArrows = computed((): boolean => {
    return activeKeys.value.some(
        (k) => k.letter === "arrowleft" || k.letter === "arrowright",
    );
});

/**
 * Whether the backspace key is on the board (consumers list "backspace" in letters)
 */
const hasBackspace = computed((): boolean => {
    return activeLetterSet.value.has("backspace");
});

/**
 * Whether the Shift key is active (either via showShift prop or in letters list)
 */
const hasShift = computed((): boolean => {
    return activeKeys.value.some((k) => k.letter === "shift");
});

/**
 * Effective casing for letter keycaps. While Shift is held, the configured
 * casing (lowercaseKeycaps) is inverted; releasing reverts it. Purely a
 * display effect — emitted KeyEvent.letter values are unaffected.
 */
const displayUppercase = computed((): boolean => {
    const baseUppercase = !props.lowercaseKeycaps;
    return shiftActive.value ? !baseUppercase : baseUppercase;
});

/**
 * Whether Enter key is included
 */
const hasEnter = computed((): boolean => {
    return activeLetterSet.value.has("enter");
});

// ============================================================================
// Chord Support
// ============================================================================

interface ChordEntry {
    partner: string;
    grapheme: string;
    audioUrl: string;
}

/**
 * Decompose a grapheme string into its constituent key letters.
 * "sh" → ["s","h"], "a_e" → ["a","e"], "th" → ["t","h"]
 */
function graphemeToLetters(grapheme: string): [string, string] | null {
    const letters = grapheme
        .replace(/_/g, "")
        .split("")
        .filter((ch) => /[a-z]/i.test(ch))
        .map((ch) => ch.toLowerCase());
    if (letters.length === 2) return [letters[0], letters[1]];
    return null;
}

/**
 * Order-sensitive chord lookup: only the FIRST letter of a grapheme can
 * start a chord. "sh" means hold-s-then-tap-h, never hold-h-then-tap-s.
 * This keeps `h` from lighting up `t`, `s`, `c`, `p`, `w` as partners.
 */
const chordByFirst = computed(
    (): Map<string, ChordEntry[]> => {
        const map = new Map<string, ChordEntry[]>();
        const defs = props.chordDefinitions;
        if (!defs) return map;

        for (const [grapheme, audioUrl] of Object.entries(defs)) {
            const pair = graphemeToLetters(grapheme);
            if (!pair) continue;
            const [first, second] = pair;
            // A key can't chord with itself (e_e). Detection runs while the
            // released key is still held, so a self-chord would fire on every
            // solo tap: e_e swallowed plain e and beat i_e/o_e/u_e to the
            // release. These go to longPressChords instead.
            if (first === second) continue;

            const list = map.get(first) ?? [];
            list.push({ partner: second, grapheme, audioUrl });
            map.set(first, list);
        }
        return map;
    },
);

/**
 * Reverse index: second letter → entries where it is the completing key.
 * Used by detectChord so releasing the second key finds the match.
 */
const chordBySecond = computed(
    (): Map<string, ChordEntry[]> => {
        const map = new Map<string, ChordEntry[]>();
        for (const [first, entries] of chordByFirst.value) {
            for (const entry of entries) {
                const list = map.get(entry.partner) ?? [];
                list.push({ partner: first, grapheme: entry.grapheme, audioUrl: entry.audioUrl });
                map.set(entry.partner, list);
            }
        }
        return map;
    },
);

const hasChords = computed((): boolean => chordByFirst.value.size > 0);

/**
 * The first chord-starter key currently held, or null. Only this key's
 * partners drive the candidate set — a second pressed key (the chord
 * completion) must not re-suppress the board with its own partner list.
 */
const chordStarter = computed((): string | null => {
    if (!hasChords.value) return null;
    for (const key of pressedKeys.value) {
        if (chordByFirst.value.has(key)) return key;
    }
    return null;
});

/**
 * Which keys are valid chord completions for the current starter?
 * Empty when no chord-starter is held.
 */
const chordCandidates = computed((): Set<string> => {
    const starter = chordStarter.value;
    if (!starter) return new Set();
    const entries = chordByFirst.value.get(starter);
    if (!entries) return new Set();
    return new Set(entries.map((e) => e.partner));
});

/**
 * Delayed flag for the chord-dimming CSS class. Flips on after a short
 * hold so that a normal quick tap-and-release doesn't flash the dim.
 */
const chordDimVisible = ref(false);
let chordDimTimer: ReturnType<typeof setTimeout> | null = null;
const CHORD_DIM_DELAY_MS = 120;

watch(chordCandidates, (candidates) => {
    if (chordDimTimer !== null) {
        clearTimeout(chordDimTimer);
        chordDimTimer = null;
    }
    if (candidates.size > 0) {
        chordDimTimer = setTimeout(() => {
            chordDimVisible.value = true;
            chordDimTimer = null;
        }, CHORD_DIM_DELAY_MS);
    } else {
        chordDimVisible.value = false;
    }
});

/**
 * True when the dim overlay should render — delayed so quick taps are clean.
 */
const chordModeActive = computed(
    (): boolean => chordDimVisible.value && chordCandidates.value.size > 0,
);

/**
 * Detect a chord on key release. The released key must be the SECOND
 * letter (the completer), and its partner (the first letter / starter)
 * must still be held.
 */
function detectChord(releasedKey: string): ChordEntry | null {
    const entries = chordBySecond.value.get(releasedKey);
    if (!entries) return null;
    for (const entry of entries) {
        if (pressedKeys.value.has(entry.partner)) return entry;
    }
    return null;
}

// ============================================================================
// Long-Press Chords
// ============================================================================

/**
 * Self-chords (e_e), keyed by their one letter. With no second key to
 * surface, the companion is the key itself: hold it past LONG_PRESS_MS and
 * the board dims while the key widens into the grapheme. Release then plays
 * the grapheme; a quicker release is a plain solo tap.
 */
const longPressChords = computed(
    (): Map<string, ChordEntry> => {
        const map = new Map<string, ChordEntry>();
        for (const [grapheme, audioUrl] of Object.entries(props.chordDefinitions ?? {})) {
            const pair = graphemeToLetters(grapheme);
            if (!pair || pair[0] !== pair[1]) continue;
            map.set(pair[0], { partner: pair[0], grapheme, audioUrl });
        }
        return map;
    },
);

// Well past a tap: kids' taps run slow.
const LONG_PRESS_MS = 550;
// Armed key width, in key widths. Keeps the plain key's side margins around
// "e▁e": at 0.45em glyphs that run is ~0.78 of a key wide, and a lone "e"
// leaves ~0.38 either side (Poppins bold metrics, estimated).
const LONG_PRESS_WIDTH = 1.5;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
// The key whose hold is being timed, armed or not.
let longPressKey: string | null = null;
/** The key currently armed (widened into its grapheme), or null. */
const longPressArmed = ref<string | null>(null);

/**
 * The armed grapheme split at its consonant slot, cased for display:
 * "e_e" → ["e", "e"]. Rendered with a baseline bar between the parts, as
 * the split-digraph lesson draws it.
 */
const longPressArmedParts = computed((): string[] => {
    const entry = longPressArmed.value
        ? longPressChords.value.get(longPressArmed.value)
        : undefined;
    if (!entry) return [];
    return entry.grapheme
        .split("_")
        .map((p) => (displayUppercase.value ? p.toUpperCase() : p));
});

function startLongPress(key: string) {
    cancelLongPress();
    longPressKey = key;
    longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressArmed.value = key;
    }, LONG_PRESS_MS);
}

function cancelLongPress() {
    if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    longPressKey = null;
    longPressArmed.value = null;
}

/**
 * All keys to render (includes ghost keys in full layout mode)
 */
const allKeysToRender = computed(
    (): (KeyDefinition & { isGhost: boolean })[] => {
        if (props.showFullLayout) {
            // In full layout mode, plain letters get the "ghost until
            // discovered" treatment. Space/Enter/Arrows/Shift are keyboard
            // chrome, not pedagogical targets — each is only included here
            // once its has*/is-active check already says it's in play, so
            // it always renders live, never as an undiscovered-looking ghost.
            // Note: Don't show numbers in full layout since they share row 1 with QWERTY
            const ghostEligibleKeys = ALL_LETTER_KEYS.map((key) => ({
                ...key,
                isGhost: !activeLetterSet.value.has(key.letter),
            }));

            const liveSpecialKeys: (KeyDefinition & { isGhost: boolean })[] =
                [];
            if (hasSpacebar.value) {
                liveSpecialKeys.push({ ...SPACE_KEY, isGhost: false });
            }
            if (hasEnter.value) {
                liveSpecialKeys.push({ ...ENTER_KEY, isGhost: false });
            }
            if (hasArrows.value) {
                liveSpecialKeys.push(
                    { ...LEFT_ARROW_KEY, isGhost: false },
                    { ...RIGHT_ARROW_KEY, isGhost: false },
                );
            }
            if (hasShift.value) {
                liveSpecialKeys.push({ ...SHIFT_KEY, isGhost: false });
            }
            if (hasBackspace.value) {
                liveSpecialKeys.push({ ...BACKSPACE_KEY, isGhost: false });
            }

            return [...ghostEligibleKeys, ...liveSpecialKeys];
        } else {
            // In compact mode, only show active keys
            return activeKeys.value.map((key) => ({
                ...key,
                isGhost: false,
            }));
        }
    },
);

/**
 * Set of enabled letters for O(1) lookup
 */
const enabledKeys = computed((): Set<string> => {
    const keys =
        props.enabledLetters === undefined
            ? new Set(activeKeys.value.map((k) => k.letter))
            : new Set(props.enabledLetters.map((l) => l.toLowerCase()));

    // Shift is keyboard chrome, not a pedagogical target that gets
    // progressively unlocked — always enabled whenever present, regardless
    // of what the consumer passed as enabledLetters.
    if (hasShift.value) {
        keys.add("shift");
    }

    return keys;
});

/**
 * Set of highlighted letters
 */
const highlightedKeys = computed((): Set<string> => {
    return new Set(
        (props.highlightedLetters || []).map((l) => l.toLowerCase()),
    );
});

/**
 * Detect if we're showing numbers (any digit key present)
 */
const hasNumbers = computed((): boolean => {
    return activeKeys.value.some((k) =>
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].includes(k.letter),
    );
});

/**
 * Detect if we're showing letters (any letter key present)
 */
const hasLetters = computed((): boolean => {
    return activeKeys.value.some(
        (k) => k.letter.length === 1 && k.letter >= "a" && k.letter <= "z",
    );
});

/**
 * Calculate the bounding box of keys to render in grid units
 * Uses STABLE bounds based on layout mode to prevent container size changes
 */
const keysBounds = computed(() => {
    // Always reserve the full QWERTY layout (rows 1-4, cols 0-9).
    // Container size never changes — only key visibility does.
    const rows = new Set<number>();
    for (const key of allKeysToRender.value) {
        rows.add(key.row);
    }

    return {
        minRow: 1,
        maxRow: 4,
        minCol: 0,
        maxCol: MAX_LAYOUT_BOUNDS.maxCol,
        rows,
    };
});

/**
 * Inter-key gap as a fraction of key size. Tuned so the default ~48px key keeps
 * its historical ~8px gap (≈ unchanged in-app), while small keys get a
 * proportionally tighter gap for a better key:space ratio.
 */
const GAP_RATIO = 1 / 6;

/**
 * Calculate key size based on layout mode
 * Uses STABLE sizing to prevent container changes when keys are added/removed
 */
const keySize = computed((): number => {
    // Author/desktop size — the cap we never exceed (preserves the original
    // look on roomy screens). Stable across question types: only the available
    // width changes it, not which keys are active.
    const maxSize = Math.min(props.maxKeySize * 0.5, 60);

    const avail = availableWidth.value;
    if (!Number.isFinite(avail) || avail <= 0) return maxSize;

    // Shrink keys so the full QWERTY span fits the available width. Because the
    // gap is proportional to the key (gap = size * GAP_RATIO, see keyGap), the
    // layout width is purely linear in size:
    //   width = colSpan*size + (colSpan - 1)*gap
    // so we can solve directly for the size that exactly fills `avail`. This
    // must stay in lockstep with containerDimensions — solving against a wider
    // formula than the keys actually occupy just shrinks the keycaps to buy
    // dead space. A proportional gap also keeps small keys legible: the old
    // fixed 8px floor ate ~30% of a ~28px key; now the gap shrinks with the key.
    const colSpan = MAX_LAYOUT_BOUNDS.maxCol - MAX_LAYOUT_BOUNDS.minCol + 1;
    const fitSize = avail / (colSpan + (colSpan - 1) * GAP_RATIO);

    // Absolute floor so keys stay roughly tappable on very narrow screens.
    // Below ~290px content width the layout may still slightly overflow —
    // acceptable edge case, and far better than the current fixed-width bleed.
    const MIN_SIZE = 20;
    return Math.max(MIN_SIZE, Math.min(maxSize, Math.floor(fitSize)));
});

/**
 * Gap between keys — proportional to key size (small floor for separation).
 */
const keyGap = computed((): number => {
    return Math.max(2, keySize.value * GAP_RATIO);
});

/**
 * Spacebar MDI icon size — scales with key size so it never overflows the key.
 * (At the default ~48px key this is ~29px, matching the prior hardcoded 28.)
 */
const spaceIconSize = computed((): number => Math.round(keySize.value * 0.6));

/**
 * Calculate container dimensions based on keys to render
 */
const containerDimensions = computed(() => {
    const bounds = keysBounds.value;
    const size = keySize.value;
    const gap = keyGap.value;

    // The layout's true extent: `colSpan` keys with `colSpan - 1` gaps between
    // them. Both row 1 (P) and row 3 (Enter) end exactly on this right edge, so
    // there is nothing to reserve beyond it — trailing slack here reads as an
    // asymmetric right margin, since the keys are centered as a block but drawn
    // from the left edge of it.
    const colSpan = bounds.maxCol - bounds.minCol + 1;
    const width = colSpan * size + (colSpan - 1) * gap;

    // Calculate height based on row span
    const rowSpan = bounds.maxRow - bounds.minRow + 1;
    const height = rowSpan * (size + gap) - gap;

    return { width, height };
});

/**
 * Backspace width in pixels (widthMultiplier key units, gaps included).
 */
const backspaceWidth = computed((): number => {
    const mult = BACKSPACE_KEY.widthMultiplier || 1;
    return keySize.value * mult + keyGap.value * (mult - 1);
});

/**
 * Where backspace goes. "top": its home slot right of P, hanging in the
 * keyboard's right margin — used only when that margin can hold it, so the
 * letter block stays centered and the container never resizes for it.
 * "space-row": right end of the space row, for width-constrained layouts
 * (phones) where the keys already fill the width.
 *
 * keySize doesn't depend on this, so switching modes can't feed back into
 * sizing; it flips cleanly as the width crosses the threshold.
 */
const backspacePlacement = computed((): "top" | "space-row" => {
    const avail = availableWidth.value;
    if (!Number.isFinite(avail)) return "top";
    const rightMargin = (avail - containerDimensions.value.width) / 2;
    return rightMargin >= keyGap.value + backspaceWidth.value
        ? "top"
        : "space-row";
});

/**
 * Type for rendered key with pixel positions
 */
type RenderedKeyWithPosition = KeyDefinition & {
    isGhost: boolean;
    pixelX: number;
    pixelY: number;
    pixelWidth: number;
    /** For L-shaped keys, additional shape data for CSS rendering */
    enterShape?: {
        topY: number;
        topHeight: number;
        topWidth: number;
        bottomY: number;
        bottomHeight: number;
        bottomWidth: number;
        rightEdgeX: number;
    };
};

/**
 * Rendered keys with calculated pixel positions
 */
const renderedKeys = computed((): RenderedKeyWithPosition[] => {
    const bounds = keysBounds.value;
    const size = keySize.value;
    const gap = keyGap.value;
    const containerWidth = containerDimensions.value.width;

    return allKeysToRender.value.map((key) => {
        let x: number;
        let y: number;
        let width: number = size;
        let enterShape: RenderedKeyWithPosition["enterShape"] = undefined;

        if (key.letter === "space") {
            // Space bar: wide and centered (narrower when arrows are shown)
            const spaceWidthMultiplier = hasArrows.value
                ? 4
                : key.widthMultiplier || 6;
            width =
                size * spaceWidthMultiplier + gap * (spaceWidthMultiplier - 1);
            // Center the spacebar (or shift left slightly when arrows are shown)
            if (hasArrows.value) {
                // Position spacebar left of center to make room for arrows
                x = (containerWidth - width) / 2 - (size + gap * 2);
            } else {
                // Center the spacebar
                x = (containerWidth - width) / 2;
            }
            const relativeRow = key.row - bounds.minRow;
            y = relativeRow * (size + gap);
        } else if (key.letter === "arrowleft" || key.letter === "arrowright") {
            // Arrow keys: positioned to the right of spacebar with extra gap
            const relativeRow = key.row - bounds.minRow;
            y = relativeRow * (size + gap);

            // Find spacebar to calculate position relative to it
            const spaceKey = allKeysToRender.value.find(
                (k) => k.letter === "space",
            );
            if (spaceKey) {
                const spaceWidthMultiplier = hasArrows.value ? 4 : 6;
                const spaceWidth =
                    size * spaceWidthMultiplier +
                    gap * (spaceWidthMultiplier - 1);
                const spaceX = hasArrows.value
                    ? (containerWidth - spaceWidth) / 2 - (size + gap * 2)
                    : (containerWidth - spaceWidth) / 2;

                // Position arrows to the right of spacebar with gap of 1.5 key widths
                const arrowStartX = spaceX + spaceWidth + gap * 2.5;

                if (key.letter === "arrowleft") {
                    x = arrowStartX;
                } else {
                    x = arrowStartX + size + gap;
                }
            } else {
                // Fallback if no spacebar found
                x = containerWidth - 2 * (size + gap);
            }
        } else if (key.letter === "backspace") {
            width = backspaceWidth.value;
            if (backspacePlacement.value === "top") {
                // Right of P, one gap past the layout's right edge.
                x = containerWidth + gap;
                y = (1 - bounds.minRow) * (size + gap);
            } else {
                // Space row, right edge aligned with P's. With arrows shown
                // this leaves ~half a key of clearance after the right arrow;
                // without them, about a key after the centered spacebar.
                x = containerWidth - width;
                y = (4 - bounds.minRow) * (size + gap);
            }
        } else if (key.letter === "shift") {
            // Shift key: own row (space row), left-aligned so its left edge
            // matches Q's left edge — deliberately detached from the
            // spacebar rather than hugging it.
            const relativeRow = key.row - bounds.minRow;
            y = relativeRow * (size + gap);

            const shiftWidthMultiplier = key.widthMultiplier || 1.5;
            width =
                size * shiftWidthMultiplier + gap * (shiftWidthMultiplier - 1);

            x = 0;
        } else {
            // Regular letter/number key
            const effectiveCol = key.col + (ROW_OFFSETS[key.row] || 0);
            const relativeCol = effectiveCol - bounds.minCol;
            const relativeRow = key.row - bounds.minRow;
            x = relativeCol * (size + gap);
            y = relativeRow * (size + gap);

            // Handle width multiplier if present
            if (key.widthMultiplier && key.widthMultiplier > 1) {
                width =
                    size * key.widthMultiplier + gap * (key.widthMultiplier - 1);
            }
        }

        return {
            ...key,
            pixelX: x,
            pixelY: y,
            pixelWidth: width,
            enterShape,
        };
    });
});

/**
 * Base color variants computed from baseKeyColor prop using OKLCH
 */
const baseColorVariants = computed(() => {
    const variants = generateColorVariants(props.baseKeyColor);
    if (!variants) {
        // Fallback to hardcoded green if parsing fails
        return {
            base: "#4caf50",
            hover: "#66bb6a",
            pressed: "#388e3c",
        };
    }
    return variants;
});

/**
 * Default colors for chrome keys that should stand out from the letters.
 * Backspace is the theme's `error` red (skuilder.config.json, light theme).
 */
const DEFAULT_KEY_COLORS: Record<string, string> = {
    backspace: "#F44336",
};

/**
 * Cache of per-key color variants for custom colors
 */
const keyColorVariantsCache = computed(() => {
    const cache: Record<
        string,
        { base: string; hover: string; pressed: string }
    > = {};

    // Per-key defaults sit under the consumer's keyColors, which win.
    const colors = { ...DEFAULT_KEY_COLORS, ...props.keyColors };
    for (const [letter, color] of Object.entries(colors)) {
        const variants = generateColorVariants(color);
        if (variants) {
            cache[letter] = variants;
        }
    }

    return cache;
});

/**
 * Container styles
 */
const containerStyle = computed(() => ({
    "--pk-key-size": `${keySize.value}px`,
    "--pk-key-gap": `${keyGap.value}px`,
    "--pk-font-family": props.fontFamily,
    "--pk-key-disable-transition": `${props.disableTransitionMs}ms`,
    "--pk-key-enable-transition": `${props.enableTransitionMs}ms`,
}));

/**
 * Keys container styles - sets up the positioning context
 */
const keysContainerStyle = computed(() => {
    const dims = containerDimensions.value;
    return {
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        position: "relative" as const,
        zIndex: 0, // Create stacking context so negative z-index children don't disappear behind page background
    };
});

// ============================================================================
// Methods
// ============================================================================

/**
 * Set a key element ref
 */
function setKeyRef(letter: string, el: HTMLElement | null) {
    if (el) {
        keyRefs.value.set(letter.toLowerCase(), el);
    } else {
        keyRefs.value.delete(letter.toLowerCase());
    }
}

/**
 * Set an audio element ref
 */
function setAudioRef(letter: string, el: HTMLAudioElement | null) {
    if (el) {
        audioRefs.value.set(letter.toLowerCase(), el);
    } else {
        audioRefs.value.delete(letter.toLowerCase());
    }
}

/**
 * Extended key type with rendering properties
 * (Alias for RenderedKeyWithPosition for compatibility)
 */
type RenderedKey = RenderedKeyWithPosition;

/**
 * Get CSS classes for a key
 */
function getKeyClasses(key: RenderedKey) {
    const isPressed = pressedKeys.value.has(key.letter);
    return {
        "pk-key--pressed": isPressed,
        "pk-key--highlighted": highlightedKeys.value.has(key.letter),
        "pk-key--focused": focusedKeys.value.has(key.letter),
        "pk-key--disabled": !enabledKeys.value.has(key.letter),
        "pk-key--ghost": key.isGhost,
        "pk-key--space": key.letter === "space",
        "pk-key--enter": key.letter === "enter",
        "pk-key--shift": key.letter === "shift",
        "pk-key--left": key.hand === "left",
        "pk-key--right": key.hand === "right",
        "pk-key--both": key.hand === "both",
        "pk-key--new": newlyAddedKeys.value.has(key.letter),
        "pk-key--chord-dimmed":
            (chordModeActive.value &&
                !isPressed &&
                !chordCandidates.value.has(key.letter)) ||
            (longPressArmed.value !== null &&
                key.letter !== longPressArmed.value),
        "pk-key--long-press-armed": key.letter === longPressArmed.value,
        [`pk-key--row-${key.row}`]: true,
    };
}



/**
 * Get inline styles for a key - handles absolute positioning and color variants
 */
function getKeyStyle(key: RenderedKey) {
    const size = keySize.value;
    const gap = keyGap.value;

    const styles: Record<string, string> = {
        position: "absolute",
        left: `${key.pixelX}px`,
        top: `${key.pixelY}px`,
        // An armed long-press widens over its (dimmed) right neighbour to fit
        // the grapheme. Left edge stays put so the key grows under the held
        // finger, never away from it: a pointerleave counts as a release.
        width:
            key.letter === longPressArmed.value
                ? `${key.pixelWidth * LONG_PRESS_WIDTH}px`
                : `${key.pixelWidth}px`,
        height: `${size}px`,
    };

    // Skip color application for ghost keys
    if (key.isGhost) {
        return styles;
    }

    // Check for per-key custom color first
    const customVariants = keyColorVariantsCache.value[key.letter];
    if (customVariants) {
        styles["--pk-key-bg"] = customVariants.base;
        styles["--pk-key-bg-hover"] = customVariants.hover;
        styles["--pk-key-bg-pressed"] = customVariants.pressed;
    } else {
        // Use base color variants
        styles["--pk-key-bg"] = baseColorVariants.value.base;
        styles["--pk-key-bg-hover"] = baseColorVariants.value.hover;
        styles["--pk-key-bg-pressed"] = baseColorVariants.value.pressed;
    }

    return styles;
}



/**
 * Get phoneme audio URL for a letter
 */
/**
 * Get display text for a key
 */
function getKeyDisplayText(key: { letter: string; isGhost?: boolean }): string {
    if (key.isGhost) {
        return "";
    }
    if (key.letter === "space") {
        return props.spaceText || "";
    }
    if (key.letter === "arrowleft") {
        return "←";
    }
    if (key.letter === "arrowright") {
        return "→";
    }
    if (key.letter === "backspace") {
        return "⌫";
    }
    if (key.letter === "enter") {
        return "↵";
    }
    if (key.letter === "shift") {
        return "⇧";
    }
    return displayUppercase.value ? key.letter.toUpperCase() : key.letter;
}

function getPhonemeAudio(letter: string): string {
    // Try key definition first (has proper phoneme mappings)
    const key = getKeyDefinition(letter);
    if (key?.phonemeAudio) {
        return key.phonemeAudio;
    }

    // Fallback: letter → ARPAbet → URL (handles vowel short sounds)
    return getPhonemeUrlForLetter(letter) || `/audio/arpa/${letter.toUpperCase()}.mp3`;
}

/**
 * Handle key press (from any input source)
 */
function handleKeyPress(
    letter: string,
    source: "physical" | "touch" | "mouse" = "mouse",
) {
    if (props.disabled) return;

    const normalizedLetter = letter.toLowerCase();
    const keyDef = getKeyDefinition(normalizedLetter);

    // Check if this key is active
    if (!activeKeys.value.find((k) => k.letter === normalizedLetter)) {
        emit("invalid-key", normalizedLetter);
        return;
    }

    // Check if key is enabled
    if (!enabledKeys.value.has(normalizedLetter)) {
        return;
    }

    // Mark as pressed
    pressedKeys.value.add(normalizedLetter);

    // Long-press chords. Any other key going down abandons a hold in
    // progress. A key being held as a chord's completion (i held, then e)
    // is that chord's, so it doesn't start timing its own long-press.
    if (longPressKey !== null && longPressKey !== normalizedLetter) {
        cancelLongPress();
    }
    if (
        props.playPhonemeOnRelease &&
        longPressChords.value.has(normalizedLetter) &&
        !chordCandidates.value.has(normalizedLetter)
    ) {
        startLongPress(normalizedLetter);
    }

    // Shift is momentary: casing flips only while the key is held down.
    // On-screen, activation is driven by hover instead (see handleKeyHover),
    // so only the physical Shift key toggles it here.
    if (normalizedLetter === "shift" && source === "physical") {
        shiftActive.value = true;
        emit("kbd-shift", true);
    }

    // Create event
    const event: KeyEvent = {
        letter: normalizedLetter,
        keyDef: keyDef!,
        timestamp: Date.now(),
        source,
    };

    emit("keypress", event);

    // Play phoneme audio if enabled (skip when playOnRelease — audio
    // fires on release so we can detect chords first)
    if (props.playPhonemeOnPress && !props.playPhonemeOnRelease) {
        playPhoneme(normalizedLetter);
    }

    // Announce for screen readers
    announcement.value = `${displayUppercase.value ? normalizedLetter.toUpperCase() : normalizedLetter} pressed`;
}

/**
 * Handle key release
 */
function handleKeyRelease(
    letter: string,
    source: "physical" | "touch" | "mouse" = "mouse",
) {
    const normalizedLetter = letter.toLowerCase();

    if (!pressedKeys.value.has(normalizedLetter)) {
        return;
    }

    // Chord detection: check BEFORE removing from pressedKeys so the
    // partner is still in the set.
    const chord = hasChords.value ? detectChord(normalizedLetter) : null;

    // Releasing the timed key ends its hold: armed plays the grapheme, not
    // yet armed falls through to a solo tap.
    let longPress: ChordEntry | null = null;
    if (normalizedLetter === longPressKey) {
        if (longPressArmed.value === normalizedLetter) {
            longPress = longPressChords.value.get(normalizedLetter) ?? null;
        }
        cancelLongPress();
    }

    pressedKeys.value.delete(normalizedLetter);

    const keyDef = getKeyDefinition(normalizedLetter);
    if (!keyDef) return;

    const event: KeyEvent = {
        letter: normalizedLetter,
        keyDef,
        timestamp: Date.now(),
        source,
    };

    emit("keyrelease", event);
    emit("keytap", event);

    // Emit convenience events for special keys
    if (normalizedLetter === "space") {
        emit("kbd-space");
    }
    if (normalizedLetter === "enter") {
        emit("kbd-enter");
    }

    // Emit special arrow navigation events
    if (normalizedLetter === "arrowleft") {
        emit("arrow-left");
    }
    if (normalizedLetter === "arrowright") {
        emit("arrow-right");
    }
    if (normalizedLetter === "backspace") {
        emit("backspace");
    }

    // Shift is momentary: release reverts casing immediately. On-screen,
    // deactivation is driven by hover-end instead (see handleKeyHoverEnd),
    // so only the physical Shift key toggles it here.
    if (normalizedLetter === "shift" && source === "physical") {
        shiftActive.value = false;
        emit("kbd-shift", false);
    }

    // --- Play-on-release audio (chord-aware) ---
    if (props.playPhonemeOnRelease) {
        if (chord) {
            // Mark the partner as consumed so its future release is silent.
            chordConsumedKeys.value.add(chord.partner);
            chordConsumedKeys.value = new Set(chordConsumedKeys.value);
            playChordPhoneme(chord.grapheme);
        } else if (longPress) {
            playChordPhoneme(longPress.grapheme);
        } else if (chordConsumedKeys.value.has(normalizedLetter)) {
            // This key already contributed to a chord — skip solo playback.
            chordConsumedKeys.value.delete(normalizedLetter);
            chordConsumedKeys.value = new Set(chordConsumedKeys.value);
        } else {
            playPhoneme(normalizedLetter);
        }
    }
}

/**
 * Handle key hover
 */
function handleKeyHover(letter: string) {
    if (props.disabled) return;

    const normalizedLetter = letter.toLowerCase();
    const keyDef = getKeyDefinition(normalizedLetter);

    // Check if this key is active
    if (!activeKeys.value.find((k) => k.letter === normalizedLetter)) {
        return;
    }

    // Only emit hover for enabled keys
    if (!enabledKeys.value.has(normalizedLetter)) {
        return;
    }

    // Shift activates on hover on-screen — a single pointer can't hold
    // Shift down and tap a letter, so hover stands in for "held".
    if (normalizedLetter === "shift") {
        shiftActive.value = true;
        emit("kbd-shift", true);
    }

    const event: KeyEvent = {
        letter: normalizedLetter,
        keyDef: keyDef!,
        timestamp: Date.now(),
        source: "mouse",
    };

    emit("keyhover", event);
}

/**
 * Handle key hover end
 */
function handleKeyHoverEnd(letter: string) {
    if (props.disabled) return;

    const normalizedLetter = letter.toLowerCase();
    const keyDef = getKeyDefinition(normalizedLetter);

    // Check if this key is active
    if (!activeKeys.value.find((k) => k.letter === normalizedLetter)) {
        return;
    }

    // Only emit hover end for enabled keys
    if (!enabledKeys.value.has(normalizedLetter)) {
        return;
    }

    // Shift deactivates when hover ends on-screen (see handleKeyHover).
    if (normalizedLetter === "shift") {
        shiftActive.value = false;
        emit("kbd-shift", false);
    }

    const event: KeyEvent = {
        letter: normalizedLetter,
        keyDef: keyDef!,
        timestamp: Date.now(),
        source: "mouse",
    };

    emit("keyhoverend", event);
}

/**
 * Handle pointer leave (calls both release and hover-end)
 */
function handleKeyLeave(letter: string) {
    handleKeyRelease(letter);
    handleKeyHoverEnd(letter);
}

/**
 * Map a physical KeyboardEvent onto this keyboard's key id, or null when the
 * event isn't ours to handle. Shared by the local and global handlers, all of
 * which preventDefault() on a non-null result — so anything that should stay
 * with the browser has to be rejected here.
 *
 * Chords carrying Ctrl/Cmd/Alt are always rejected: those belong to the
 * browser and the OS (Ctrl+L for the address bar, Ctrl+K to search, Cmd+R to
 * reload), and swallowing them broke basic navigation for anyone with a study
 * keyboard mounted. Shift is exempt — it's a key this component actually
 * renders, and it's the modifier the keycaps care about.
 */
function resolveEventKey(e: KeyboardEvent): string | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;

    if (e.key === " ") return "space";
    if (e.key === "Enter") return "enter";
    if (e.key === "Shift") return hasShift.value ? "shift" : null;

    // Arrows only claimed when they're on the board — otherwise they stay
    // available for whatever else is listening.
    if (hasArrows.value) {
        if (e.key === "ArrowLeft") return "arrowleft";
        if (e.key === "ArrowRight") return "arrowright";
    }

    // Same for Backspace: claimed only when the key is on the board, so it
    // isn't swallowed (e.g. browser back-navigation habits, text fields
    // elsewhere) on keyboards that don't show it.
    if (e.key === "Backspace") return hasBackspace.value ? "backspace" : null;

    const letter = e.key.toLowerCase();
    if (letter.length === 1 && /[a-z0-9]/.test(letter)) return letter;

    return null;
}

/**
 * Handle physical keyboard keydown (local - when keyboard container has focus)
 */
function handleKeyDown(e: KeyboardEvent) {
    if (!props.captureKeyboard || props.disabled) return;

    const letter = resolveEventKey(e);
    if (letter === null) return;

    // Prevent key repeat
    if (e.repeat) return;

    e.preventDefault();
    handleKeyPress(letter, "physical");
}

/**
 * Handle physical keyboard keyup (local - when keyboard container has focus)
 */
function handleKeyUp(e: KeyboardEvent) {
    if (!props.captureKeyboard) return;

    const letter = resolveEventKey(e);
    if (letter === null) return;

    e.preventDefault();
    handleKeyRelease(letter, "physical");
}

/**
 * A focused editable element (text field, textarea, contenteditable) owns its
 * keystrokes. Without this check the global capture preventDefault()s any
 * active letter typed ANYWHERE on the page — so typing into e.g. the /showHN
 * progress panel's word checker would silently answer the study card instead.
 */
function isEditableTarget(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Handle global physical keyboard keydown (when keyboard container doesn't have focus)
 */
function handleGlobalKeyDown(e: KeyboardEvent) {
    if (!props.captureKeyboard || props.disabled) return;

    // Skip if keyboard container already has focus (local handlers will handle it)
    if (document.activeElement === keyboardContainer.value) {
        return;
    }

    if (isEditableTarget()) return;

    const letter = resolveEventKey(e);
    if (letter === null) return;

    // Prevent key repeat - critical for avoiding rapid-fire on long press
    if (e.repeat) return;

    // Only handle if this is an active key
    if (!activeLetterSet.value.has(letter)) {
        return;
    }

    e.preventDefault();
    handleKeyPress(letter, "physical");
}

/**
 * Handle global physical keyboard keyup (when keyboard container doesn't have focus)
 */
function handleGlobalKeyUp(e: KeyboardEvent) {
    if (!props.captureKeyboard) return;

    // Skip if keyboard container already has focus (local handlers will handle it)
    if (document.activeElement === keyboardContainer.value) {
        return;
    }

    if (isEditableTarget()) return;

    const letter = resolveEventKey(e);
    if (letter === null) return;

    // Only handle if this is an active key
    if (!activeLetterSet.value.has(letter)) {
        return;
    }

    e.preventDefault();
    handleKeyRelease(letter, "physical");
}

/**
 * Physical key state is only trustworthy while the window has focus. A chord
 * that hands off to the browser (Ctrl+L to the address bar, Ctrl+Shift+T to
 * reopen a tab) takes focus away mid-press and its keyup never reaches us —
 * which would otherwise leave a key stuck down, or Shift stuck on with every
 * keycap inverted.
 */
function handleWindowBlur() {
    pressedKeys.value.clear();
    chordConsumedKeys.value = new Set();
    if (chordDimTimer !== null) {
        clearTimeout(chordDimTimer);
        chordDimTimer = null;
    }
    chordDimVisible.value = false;
    cancelLongPress();
    if (shiftActive.value) {
        shiftActive.value = false;
        emit("kbd-shift", false);
    }
}

/**
 * Play phoneme audio for a letter
 */
async function playPhoneme(letter: string): Promise<void> {
    if (!audioSmashGate(letter)) return;

    const audio = audioRefs.value.get(letter.toLowerCase());
    if (!audio) return;

    emit("phoneme-start", letter);

    try {
        audio.currentTime = 0;
        await audio.play();
    } catch (err) {
        console.warn(`Failed to play phoneme for ${letter}:`, err);
    }
}

/**
 * Play chord phoneme audio by grapheme key (e.g. "sh", "a_e").
 */
async function playChordPhoneme(grapheme: string): Promise<void> {
    if (!audioSmashGate(grapheme)) return;

    const audio = chordAudioRefs.value.get(grapheme);
    if (!audio) return;

    emit("phoneme-start", grapheme);

    try {
        audio.currentTime = 0;
        await audio.play();
    } catch (err) {
        console.warn(`Failed to play chord phoneme for ${grapheme}:`, err);
    }
}

/**
 * Set a chord audio element ref
 */
function setChordAudioRef(grapheme: string, el: HTMLAudioElement | null) {
    if (el) {
        chordAudioRefs.value.set(grapheme, el);
    } else {
        chordAudioRefs.value.delete(grapheme);
    }
}

/**
 * Set up audio end listeners
 */
function setupAudioListeners() {
    audioRefs.value.forEach((audio, letter) => {
        audio.addEventListener("ended", () => {
            emit("phoneme-end", letter);
        });
    });
    chordAudioRefs.value.forEach((audio, grapheme) => {
        audio.addEventListener("ended", () => {
            emit("phoneme-end", grapheme);
        });
    });
}

// ============================================================================
// Exposed API (for parent components)
// ============================================================================

/**
 * Get the DOM element for a specific key
 */
function getKeyElement(letter: string): HTMLElement | undefined {
    return keyRefs.value.get(letter.toLowerCase());
}

/**
 * Programmatically trigger a key press animation
 */
async function animateKey(
    letter: string,
    animation: "pulse" | "shake" | "glow" | "bounce" | "pop",
    options?: KeyAnimationOptions,
): Promise<void> {
    const el = getKeyElement(letter);
    if (!el) return;

    const duration = options?.duration || 300;
    const easing = options?.easing || "ease-out";

    el.style.transition = `transform ${duration}ms ${easing}, filter ${duration}ms ${easing}`;

    switch (animation) {
        case "pulse":
            el.style.transform = `scale(${options?.scale || 1.15})`;
            await new Promise((r) => setTimeout(r, duration));
            el.style.transform = "scale(1)";
            break;

        case "shake":
            el.style.transform = "translateX(-5px)";
            await new Promise((r) => setTimeout(r, duration / 4));
            el.style.transform = "translateX(5px)";
            await new Promise((r) => setTimeout(r, duration / 4));
            el.style.transform = "translateX(-3px)";
            await new Promise((r) => setTimeout(r, duration / 4));
            el.style.transform = "translateX(0)";
            break;

        case "glow":
            el.style.filter = `drop-shadow(0 0 ${options?.scale || 10}px ${options?.color || "gold"})`;
            await new Promise((r) => setTimeout(r, duration));
            el.style.filter = "";
            break;

        case "bounce":
            el.style.transform = "translateY(-15px)";
            await new Promise((r) => setTimeout(r, duration / 2));
            el.style.transform = "translateY(0)";
            break;

        case "pop": {
            // Exaggerated grow → overshoot shrink → spring settle
            const popTotal = options?.duration || 700;
            const growMs = Math.round(popTotal * 0.35);
            const shrinkMs = Math.round(popTotal * 0.28);
            const settleMs = Math.round(popTotal * 0.37);
            const peakScale = options?.scale || 2.2;

            el.style.transition = `transform ${growMs}ms cubic-bezier(0.2, 0, 0.4, 1)`;
            el.style.transform = `scale(${peakScale})`;
            await new Promise((r) => setTimeout(r, growMs));

            el.style.transition = `transform ${shrinkMs}ms cubic-bezier(0.55, 0, 0.45, 1)`;
            el.style.transform = "scale(0.85)";
            await new Promise((r) => setTimeout(r, shrinkMs));

            el.style.transition = `transform ${settleMs}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
            el.style.transform = "scale(1)";
            await new Promise((r) => setTimeout(r, settleMs));

            el.style.transition = "";
            return; // skip the outer trailing await — pop handles its own timing
        }
    }

    await new Promise((r) => setTimeout(r, duration));
    el.style.transition = "";
}

/**
 * Highlight a key temporarily
 */
async function flashKey(
    letter: string,
    color?: string,
    duration = 500,
): Promise<void> {
    const el = getKeyElement(letter);
    if (!el) return;

    const originalBg = el.style.getPropertyValue("--pk-key-bg");
    el.style.setProperty("--pk-key-bg", color || "var(--pk-highlight-color)");

    await new Promise((r) => setTimeout(r, duration));

    if (originalBg) {
        el.style.setProperty("--pk-key-bg", originalBg);
    } else {
        el.style.removeProperty("--pk-key-bg");
    }
}

/**
 * Focus the keyboard for keyboard input
 */
function focus() {
    keyboardContainer.value?.focus();
}

/**
 * Play the phoneme for a letter without triggering a keypress event
 */
function playLetterPhoneme(letter: string): Promise<void> {
    return playPhoneme(letter.toLowerCase());
}

/**
 * Set the focus status of a key (for two-way hover binding).
 * When focused, the key will have a subtle shake animation.
 */
function setKeyFocused(letter: string, focused: boolean): void {
    const normalizedLetter = letter.toLowerCase();
    if (focused) {
        focusedKeys.value.add(normalizedLetter);
    } else {
        focusedKeys.value.delete(normalizedLetter);
    }
    // Trigger reactivity
    focusedKeys.value = new Set(focusedKeys.value);
}

/**
 * Clear all focused keys
 */
function clearFocusedKeys(): void {
    focusedKeys.value = new Set();
}

/**
 * Programmatically set the Shift held/active state (e.g. to reset between
 * questions, or drive it from outside the component). Does not emit
 * 'kbd-shift'.
 */
function setShiftActive(active: boolean): void {
    shiftActive.value = active;
}

// Expose methods for parent component access
defineExpose({
    getKeyElement,
    animateKey,
    flashKey,
    focus,
    playLetterPhoneme,
    pressedKeys,
    setKeyFocused,
    clearFocusedKeys,
    shiftActive,
    setShiftActive,
});

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    // Initialize previous letters set
    previousLetters.value = new Set(props.letters.map((l) => l.toLowerCase()));

    nextTick(() => {
        setupAudioListeners();
    });

    // Observe available width for responsive key sizing. contentRect is the
    // content box (padding already excluded), exactly the keys' budget.
    if (keyboardContainer.value) {
        const el = keyboardContainer.value;
        const cs = getComputedStyle(el);
        availableWidth.value =
            el.clientWidth -
            parseFloat(cs.paddingLeft || "0") -
            parseFloat(cs.paddingRight || "0");
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    availableWidth.value = entry.contentRect.width;
                }
            });
            resizeObserver.observe(el);
        }
    }

    // Set up global keyboard capture if enabled
    if (props.captureKeyboard) {
        // Create handler functions
        globalKeydownHandler = handleGlobalKeyDown;
        globalKeyupHandler = handleGlobalKeyUp;

        // Register document-level event listeners for true keyup tracking
        // This replaces the MouseTrap auto-release pattern with proper keyup handling
        document.addEventListener("keydown", globalKeydownHandler);
        document.addEventListener("keyup", globalKeyupHandler);
    }

    window.addEventListener("blur", handleWindowBlur);
});

onBeforeUnmount(() => {
    // Clean up chord dim and long-press timers
    if (chordDimTimer !== null) {
        clearTimeout(chordDimTimer);
        chordDimTimer = null;
    }
    cancelLongPress();

    // Stop observing container size
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    // Clean up global event listeners
    if (globalKeydownHandler) {
        document.removeEventListener("keydown", globalKeydownHandler);
        globalKeydownHandler = null;
    }
    if (globalKeyupHandler) {
        document.removeEventListener("keyup", globalKeyupHandler);
        globalKeyupHandler = null;
    }

    window.removeEventListener("blur", handleWindowBlur);
});

// Watch for letter changes and update audio listeners
watch(
    () => props.letters,
    (newLetters) => {
        // Determine which keys are newly added
        const currentSet = new Set(newLetters.map((l) => l.toLowerCase()));
        const added = new Set<string>();

        for (const letter of currentSet) {
            if (!previousLetters.value.has(letter)) {
                added.add(letter);
            }
        }

        newlyAddedKeys.value = added;
        previousLetters.value = currentSet;

        // Clear newly added status after animation completes (600ms for bounce animation)
        if (added.size > 0) {
            setTimeout(() => {
                newlyAddedKeys.value = new Set();
            }, 600);
        }

        nextTick(() => {
            setupAudioListeners();
        });
    },
    { flush: "post" },
);
</script>

<style scoped>
.progressive-keyboard {
    /* CSS Custom Properties for theming
     * Note: --pk-key-bg, --pk-key-bg-hover, --pk-key-bg-pressed are set
     * per-key via inline styles using OKLCH-derived variants.
     * These are fallback values only. */
    --pk-key-bg: #4caf50;
    --pk-key-bg-hover: #66bb6a;
    --pk-key-bg-pressed: #388e3c;
    --pk-key-bg-disabled: #9e9e9e;
    --pk-key-text: white;
    --pk-key-border: rgba(0, 0, 0, 0.2);
    --pk-highlight-color: #ffc107;
    --pk-highlight-glow: 0 0 15px var(--pk-highlight-color);
    --pk-key-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    --pk-key-shadow-pressed: 0 2px 3px rgba(0, 0, 0, 0.3);
    --pk-key-radius: 12px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* Fill the (viewport-constrained) keyboard area so the measured content
       box is the real width budget, not the keys' own shrink-wrapped width.
       The keys container inside stays centered via its own margin: auto. */
    width: 100%;
    box-sizing: border-box;
    padding: 16px;
    outline: none;
    user-select: none;
    touch-action: manipulation;
}

.progressive-keyboard:focus-visible {
    outline: 3px solid var(--pk-highlight-color);
    outline-offset: 4px;
    border-radius: 8px;
}

.pk-keys-container {
    /* Position is set via inline styles */
    margin: 0 auto;
}

.pk-key {
    /* Position is set via inline styles (absolute) */
    border: none;
    /* Radius tracks key size so it doesn't dominate small keys; capped at the
       author radius so large/default keys (size 48 → 12px) look unchanged. */
    border-radius: min(var(--pk-key-radius), calc(var(--pk-key-size) * 0.25));
    background-color: var(--pk-key-bg);
    color: var(--pk-key-text);
    font-family: var(--pk-font-family);
    font-size: calc(var(--pk-key-size) * 0.45);
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--pk-key-shadow);
    /* Base (enabled) transition governs the RESTORE direction — a key coming
       back from disabled tweens at the enable duration. */
    transition:
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color var(--pk-key-enable-transition, 0.4s) ease-in-out,
        opacity var(--pk-key-enable-transition, 0.4s) ease-in-out,
        border-color 0.4s ease-in-out,
        left 0.3s ease-out,
        top 0.3s ease-out,
        width 0.3s ease-out,
        height 0.3s ease-out;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;

    /* 3D button effect */
    border-bottom: 4px solid rgba(0, 0, 0, 0.25);
}

.pk-key:hover:not(.pk-key--disabled) {
    background-color: var(--pk-key-bg-hover);
    /* Fast transition for interactive state changes only */
    transition:
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color 0.1s ease-out,
        left 0.3s ease-out,
        top 0.3s ease-out,
        width 0.3s ease-out,
        height 0.3s ease-out;
    /*transform: translateY(-2px);*/
    /*box-shadow:
        var(--pk-key-shadow),
        0 4px 6px rgba(0, 0, 0, 0.2);*/
}

.pk-key:active:not(.pk-key--disabled),
.pk-key--pressed:not(.pk-key--disabled) {
    background-color: var(--pk-key-bg-pressed);
    transform: translateY(2px);
    box-shadow: var(--pk-key-shadow-pressed);
    border-bottom-width: 2px;
    /* Fast transition for press state changes only */
    transition:
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color 0.1s ease-out,
        left 0.3s ease-out,
        top 0.3s ease-out,
        width 0.3s ease-out,
        height 0.3s ease-out;
}

.pk-key--highlighted {
    animation: pk-highlight-pulse 1s ease-in-out infinite;
    box-shadow: var(--pk-key-shadow), var(--pk-highlight-glow);
}

.pk-key--new {
    animation: pk-key-enter 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    transform-origin: center center;
}

.pk-key--focused {
    animation: pk-focus-shake 0.4s ease-in-out;
    box-shadow:
        var(--pk-key-shadow),
        0 0 8px rgba(255, 255, 255, 0.5);
}

@keyframes pk-focus-shake {
    0%,
    100% {
        transform: translateX(0);
    }
    20% {
        transform: translateX(-3px);
    }
    40% {
        transform: translateX(3px);
    }
    60% {
        transform: translateX(-2px);
    }
    80% {
        transform: translateX(2px);
    }
}

@keyframes pk-highlight-pulse {
    0%,
    100% {
        box-shadow:
            var(--pk-key-shadow),
            0 0 10px var(--pk-highlight-color);
    }
    50% {
        box-shadow:
            var(--pk-key-shadow),
            0 0 25px var(--pk-highlight-color),
            0 0 35px var(--pk-highlight-color);
    }
}

@keyframes pk-key-enter {
    0% {
        transform: scale(0);
        opacity: 0;
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.pk-key--chord-dimmed {
    opacity: 0.3;
    filter: saturate(0.3);
    transition:
        opacity 0.15s ease-out,
        filter 0.15s ease-out,
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color 0.4s ease-in-out,
        left 0.3s ease-out,
        top 0.3s ease-out,
        width 0.3s ease-out,
        height 0.3s ease-out;
}

/* An armed long-press key is widened over its dimmed right neighbour (see
   getKeyStyle), so it has to sit above it. */
.pk-key--long-press-armed {
    z-index: 3;
}

/* The consonant slot in a split digraph (e_e): a baseline bar, as the
   split-digraph lesson draws it. An empty inline-block's baseline is its
   bottom edge, so the bar sits on the text baseline. */
.pk-key-split-slot {
    display: inline-block;
    width: 0.45em;
    height: 0.09em;
    margin: 0 0.08em;
    background-color: currentColor;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.pk-key--disabled {
    background-color: var(--pk-key-bg-disabled);
    cursor: not-allowed;
    opacity: 0.6;
    /* Disabled (destination) transition governs the DIM direction — separate
       from the base rule so the dim can be slow while the restore stays snappy.
       Later + equal specificity, so it wins over .pk-key when the class is on. */
    transition:
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color var(--pk-key-disable-transition, 0.4s) ease-in-out,
        opacity var(--pk-key-disable-transition, 0.4s) ease-in-out,
        border-color 0.4s ease-in-out,
        left 0.3s ease-out,
        top 0.3s ease-out,
        width 0.3s ease-out,
        height 0.3s ease-out;
}

.pk-key--ghost {
    background-color: transparent;
    border: 2px dashed rgba(0, 0, 0, 0.25);
    box-shadow: none;
    opacity: 0.4;
    cursor: default;
    border-bottom: 2px dashed rgba(0, 0, 0, 0.25);
    transition: all 0.4s ease-in-out;
}

.pk-key--ghost:hover {
    background-color: transparent;
    transform: none;
    box-shadow: none;
}

.pk-key--ghost .pk-key-letter {
    color: rgba(0, 0, 0, 0.3);
    text-shadow: none;
}

.pk-key--space {
    border-radius: 8px;
}

.pk-key--shift {
    border-radius: 8px;
}

.pk-key--space:active:not(.pk-key--disabled),
.pk-key--space.pk-key--pressed:not(.pk-key--disabled) {
    transform: translateY(2px);
}



.pk-key-letter--space {
    /* Spacebar displays no letter text */
    display: block;
}

.pk-key-letter--arrow {
    /* Arrow keys display arrow symbols */
    font-size: 1.5em;
}

.pk-key-letter--backspace {
    font-size: 1.2em;
}

.pk-key--enter {
    border-top-right-radius: 0;
    z-index: 2; /* S'assure que le corps du bouton est au-dessus du nub */
}

/* Nub for Enter key */
.pk-key-nub {
    position: absolute;
    bottom: 40%; /* Deep overlap into the main button */
    right: 0;
    width: calc((100% - var(--pk-key-gap)) * 0.35); /* Largeur ajustée à 0.35 */
    height: 100%; /* Extends well above and deep inside */
    background-color: var(--pk-key-bg);
    border-radius: 6px 6px 0 0;
    z-index: -1; /* Reste derrière le bouton principal */
    box-shadow: none; /* Supprime l'ombre pour éviter qu'elle ne bave sur le bouton principal */
    transition: background-color 0.4s ease-in-out;
}

.pk-key:hover:not(.pk-key--disabled) .pk-key-nub {
    background-color: var(--pk-key-bg-hover);
    transition: background-color 0.1s ease-out;
}

.pk-key:active:not(.pk-key--disabled) .pk-key-nub,
.pk-key--pressed:not(.pk-key--disabled) .pk-key-nub {
    background-color: var(--pk-key-bg-pressed);
    box-shadow: none; /* Explicitly no shadow on press to maintain 'behind' illusion */
    transition: background-color 0.1s ease-out;
}

.pk-key--disabled .pk-key-nub {
    background-color: var(--pk-key-bg-disabled);
}

.pk-key--ghost .pk-key-nub {
    background-color: transparent;
    border: 2px dashed rgba(0, 0, 0, 0.25);
    border-bottom: none;
    box-shadow: none;
}

.pk-key-letter {
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Screen reader only */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Note: key sizing is responsive (computed in JS from available width), so we
   intentionally do NOT impose a CSS min-width/height here. A min size larger
   than the per-key pitch (size + gap) would override the inline width and erase
   the inter-key gap on touch devices. */

/* Responsive adjustments.
   On phones the keycaps ARE the interface, so horizontal padding is cut to
   just enough for the keys' drop shadow — every pixel given back here goes
   straight into keycap size (the width budget is divided by ~11.5, so ~12px
   of reclaimed padding is ~1px on every key). Vertical padding is kept for
   separation from the card above. */
@media (max-width: 600px) {
    .progressive-keyboard {
        padding: 8px 4px;
    }
}

/* Transitions for ghost/new keys */
.pk-key-anim-enter-active,
.pk-key-anim-leave-active {
    transition:
        opacity 0.3s ease-out,
        transform 0.3s ease-out;
}

.pk-key-anim-enter-from,
.pk-key-anim-leave-to {
    opacity: 0;
    transform: scale(0.9);
}
</style>
