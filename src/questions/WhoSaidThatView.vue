<!--
  WhoSaidThatView.vue - Phoneme identification question view (digraph-capable)

  Displays a "Who Said That?" question where the learner hears a phoneme
  and must identify which suspect (single letter OR digraph) made that sound.

  Key differences from WhoSaidThatView:
  - Suspects may be digraphs (sh, ch, th, etc.) rendered via WordDisplay
  - Single-letter suspects still use createLetter for direct SVG rendering
  - Keyboard mapping uses first character of digraph for keyboard interaction
  - Digraph suspects are visually wider to accommodate two LetterPeople
-->

<template>
    <div ref="rootEl" class="who-said-that">
      <div class="wst-body">
        <!-- Instruction area -->
        <div class="wst-header">
            <h2 class="wst-title">Who Said That?</h2>
            <p class="wst-instruction">
                Listen to the sound and find who made it!
            </p>
        </div>

        <!-- Audio controls -->
        <div class="wst-audio-controls">
            <PlaySoundButton
                :is-playing="isPlayingAudio"
                @play="playTargetPhoneme"
            />
        </div>

        <!-- Suspects display.
             `.wst-suspects-fit` is the box the suspects must fit inside; see
             useScaleToFit (scaled + re-wrapped when the screen is short). -->
        <div ref="suspectsViewport" class="wst-suspects-fit">
            <div ref="suspectsEl" class="wst-suspects">
                <button
                    v-for="(suspect, index) in displaySuspects"
                    :key="suspect.letter"
                    class="wst-suspect"
                    :class="{
                        'wst-suspect--selected': selectedIndex === index,
                        'wst-suspect--disabled': disabledLetters.has(
                            suspect.letter,
                        ),
                        'wst-suspect--correct': showFeedback && suspect.isCorrect,
                        'wst-suspect--incorrect':
                            showFeedback &&
                            selectedIndex === index &&
                            !suspect.isCorrect,
                        'wst-suspect--speaking': speakingLetter === suspect.letter,
                        'wst-suspect--digraph': suspect.isDigraph,
                    }"
                    :style="{ '--suspect-bg-color': getSuspectBgColor(suspect) }"
                    :disabled="disabledLetters.has(suspect.letter) || isLocked"
                    @click="handleSuspectClick(suspect, index)"
                    @mouseenter="handleSuspectHover(suspect, index)"
                    @mouseleave="handleSuspectHoverEnd(suspect)"
                >
                    <!-- Number badge (shown when ctrl is held) -->
                    <span v-if="showNumberBadges" class="wst-suspect-number">{{
                        index + 1
                    }}</span>

                    <!-- Digraph suspects use WordDisplay (two LetterPeople side-by-side) -->
                    <div v-if="suspect.isDigraph" class="wst-letter-container wst-letter-container--digraph">
                        <WordDisplay
                            :text="suspect.letter"
                            :height="120"
                            :options="digraphDisplayOptions[index]"
                            @word-created="(word: Word) => onDigraphWordCreated(index, word)"
                        />
                    </div>

                    <!-- Single-letter suspects use direct SVG rendering -->
                    <div
                        v-else
                        :ref="
                            (el: Element | ComponentPublicInstance | null) =>
                                setLetterRef(el as Element | null, index)
                        "
                        class="wst-letter-container"
                    ></div>
                </button>
            </div>
        </div>

        <!-- Submit button (shown only for physical keyboard navigation) -->
        <SubmitAnswerButton
            :visible="showSubmitButton && !isLocked"
            @submit="submitAnswer"
            @layout="scheduleFit"
        />

        <!-- Feedback message -->
        <div v-if="feedbackMessage" class="wst-feedback" :class="feedbackClass">
            {{ feedbackMessage }}
        </div>

        <!-- Hidden audio elements -->
        <audio ref="targetAudio" @ended="isPlayingAudio = false" @error="isPlayingAudio = false" />
      </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WhoSaidThatView' });

import {
    ref,
    computed,
    onMounted,
    onUnmounted,
    watch,
    PropType,
    nextTick,
    type ComponentPublicInstance,
} from "vue";
import { ViewData } from "@vue-skuilder/common";
import { useViewable, useQuestionView } from "@vue-skuilder/courseware";
import { WhoSaidThat, type Suspect } from "./WhoSaidThat";
import { getPhonemeAudioUrl } from "@/services/phonetics/phonemeCache";
import { createLetter } from "../letterpeople";
import type { LetterInstance } from "../letterpeople";
import { useKeyboardContextOptional } from "../composables/useKeyboardContext";
import PlaySoundButton from "../components/PlaySoundButton.vue";
import SubmitAnswerButton, { SUBMIT_KEY_COLOR } from "../components/SubmitAnswerButton.vue";
import { recordWstSuccess, getLetterProgression, getLetterProgressionSync } from "../services/userState";
import {
    colorToOklch,
    adjustLightness,
    adjustChroma,
    oklchToRgbString,
} from "../letterpeople/util/color";
import { sortByKeyboardOrder } from "../components/keyboard/keyboardLayout";
import {
    characterize,
    decharacterize,
    sayNo,
    celebrate,
    startIdle,
} from "../letterpeople/animations";
import WordDisplay from '../letterpeople/vue/WordDisplay.vue';
import { useScaleToFit } from '../composables/useScaleToFit';
import type { Word } from '../letterpeople/Word';

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps({
    data: {
        type: Array as PropType<ViewData[]>,
        required: true,
    },
    modifyDifficulty: {
        type: Number,
        default: 0,
    },
    /**
     * Preview/demo mode (e.g. embedded in the marketing landing page).
     * Suppresses side effects that don't make sense outside a real session:
     *   - no datalayer writes (recordWstSuccess)
     *   - no audio autoplay on mount (audio plays only on explicit tap)
     * Visuals, suspect interaction, and celebrate/sayNo feedback are unchanged.
     */
    preview: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits<{
    (e: "emitResponse", ...args: any[]): void;
}>();

// ============================================================================
// Framework Question Data Flow
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'WhoSaidThatView');
const questionUtils = useQuestionView<WhoSaidThat>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);
const displaySuspects = ref<Suspect[]>([]);
const selectedIndex = ref<number | null>(null); // Start with no selection
const disabledLetters = ref<Set<string>>(new Set());
const isLocked = ref(false);
const showFeedback = ref(false);
const feedbackMessage = ref("");
const isPlayingAudio = ref(false);
const speakingLetter = ref<string | null>(null);
const showNumberBadges = ref(false);
const showSubmitButton = ref(false); // Only true for physical keyboard navigation
const hasDigraphSuspect = ref(false); // Set at mount; drives keyboard mode (number vs letter)

// Audio refs
const targetAudio = ref<HTMLAudioElement | null>(null);

// Letter instance refs — single-letter suspects use LetterInstance, digraphs use Word
const letterContainerRefs = ref<(HTMLElement | null)[]>([]);
const letterInstances = ref<(LetterInstance | null)[]>([]);
// WordDisplay component refs for digraph suspects
const digraphWordRefs = ref<Map<number, InstanceType<typeof WordDisplay>>>(new Map());
const digraphWordInstances = ref<Map<number, Word>>(new Map());

// Keyboard event unsubscribers for proper cleanup
const keyboardUnsubscribers: (() => void)[] = [];

// Track which key is currently hovered on the keyboard (for two-way binding)
const hoveredKeyboardKey = ref<string | null>(null);

// Track idle animation cleanup functions
const idleCleanups = ref<Map<number, () => void>>(new Map());

// Track previously selected index for characterization transitions
const previousSelectedIndex = ref<number | null>(null);

// ============================================================================
// Fit to available space
// ============================================================================
//
// Six suspects on a phone wrap to three rows; with the header and play button
// that is taller than the study area above the keyboard, which clips it top
// and bottom (play button half gone, last row gone). The suspects block is
// scaled and re-wrapped to fit (and grown, where there's room); see
// useScaleToFit. Re-fit whenever the suspects' rendered size or the
// surrounding chrome changes.

const rootEl = ref<HTMLElement | null>(null);
const suspectsViewport = ref<HTMLElement | null>(null);
const suspectsEl = ref<HTMLElement | null>(null);

const { applyFit, start: startFitObserver } = useScaleToFit({
    root: rootEl,
    viewport: suspectsViewport,
    content: suspectsEl,
    reflow: true,
    // Grow into a laptop's or a large display's room too (the 80px letters
    // left it mostly empty); 2 puts a letter at 160px, about MissingLetters' size.
    // Not in preview (landing-page embeds), as WordSelection's ladder.
    maxScale: props.preview ? 1 : 2,
});

/** Re-fit after the DOM settles (letters drawn, chrome shown/hidden). */
function scheduleFit(): void {
    nextTick(() => requestAnimationFrame(applyFit));
}

function setLetterRef(el: Element | null, index: number): void {
    if (el instanceof HTMLElement) {
        letterContainerRefs.value[index] = el;
    }
}

// ============================================================================
// Computed
// ============================================================================

const feedbackClass = computed(() => {
    if (!feedbackMessage.value) return "";
    if (selectedIndex.value === null) return "";
    const selected = displaySuspects.value[selectedIndex.value];
    return selected?.isCorrect
        ? "wst-feedback--correct"
        : "wst-feedback--incorrect";
});

// Stable WordDisplay options per suspect — memoized so the same object reference
// is passed on every render, preventing WordDisplay from recreating its Word instance
// when unrelated state (selectedIndex) changes. See WordSelectionView's wordOptionsCache.
const digraphDisplayOptions = computed(() =>
    displaySuspects.value.map((suspect) => ({
        spacing: 2,
        letterOptions: {
            color: suspect.color,
            lineWidth: 18,
            borderWidth: 2,
            showEyes: false,
            showMouth: false,
            eyebrowsWithEyes: true,
        },
    }))
);

// ============================================================================
// Methods
// ============================================================================

async function playTargetPhoneme(): Promise<void> {
    if (!question.value || !targetAudio.value) return;

    const phonemeUrl = getPhonemeAudioUrl(question.value.targetPhoneme);
    if (!phonemeUrl) {
        console.warn(
            `[WhoSaidThat] No audio for phoneme: ${question.value.targetPhoneme}`,
        );
        return;
    }

    isPlayingAudio.value = true;
    targetAudio.value.src = phonemeUrl;
    try {
        await targetAudio.value.play();
    } catch (e) {
        console.error("[WhoSaidThat] Failed to play phoneme:", e);
        isPlayingAudio.value = false;
    }
}


function handleSuspectClick(suspect: Suspect, index: number): void {
    if (isLocked.value || disabledLetters.value.has(suspect.letter)) return;

    // If already selected, submit the answer
    if (selectedIndex.value === index) {
        submitAnswer();
    } else {
        // Otherwise just select (mouse-centric, no submit button)
        updateSelection(index);
        showSubmitButton.value = false;
    }
}

/**
 * Handle hovering over a suspect card
 * Note: Does NOT set selection or trigger keyboard - pure mouse-centric flow
 */
function handleSuspectHover(suspect: Suspect, index: number): void {
    if (isLocked.value || disabledLetters.value.has(suspect.letter)) return;

    // Set selection on hover for visual feedback
    updateSelection(index);
    showSubmitButton.value = false;
}

/**
 * Handle mouse leaving a suspect card - clear selection
 */
function handleSuspectHoverEnd(suspect: Suspect): void {
    if (isLocked.value) return;

    // Clear selection when mouse leaves (stateless mouse flow)
    updateSelection(null);
}

/**
 * Update the selected index with characterization transitions
 */
/**
 * Get all LetterInstances for a suspect — returns the full set for digraphs,
 * or a single-element array for single-letter suspects.
 */
function getLettersForSuspect(index: number): LetterInstance[] {
    const single = letterInstances.value[index];
    if (single) return [single];

    const word = digraphWordInstances.value.get(index);
    if (word) return [...word];

    return [];
}

/**
 * Get the first LetterInstance for a suspect (used for sayNo / audio-linked animations).
 */
function getLetterInstanceForSuspect(index: number): LetterInstance | null {
    const letters = getLettersForSuspect(index);
    return letters[0] ?? null;
}

async function updateSelection(newIndex: number | null): Promise<void> {
    const oldIndex = selectedIndex.value;

    // Skip if no change
    if (oldIndex === newIndex) return;

    // Update selection immediately for UI responsiveness
    previousSelectedIndex.value = oldIndex;
    selectedIndex.value = newIndex;

    // De-characterize all letters of previously selected suspect
    if (oldIndex !== null) {
        const idleCleanup = idleCleanups.value.get(oldIndex);
        if (idleCleanup) {
            idleCleanup();
            idleCleanups.value.delete(oldIndex);
        }
        for (const letter of getLettersForSuspect(oldIndex)) {
            decharacterize(letter, { duration: 150 });
        }
    }

    // Characterize all letters of newly selected suspect
    if (newIndex !== null) {
        const letters = getLettersForSuspect(newIndex);
        if (letters.length > 0) {
            await Promise.all(letters.map((letter) =>
                characterize(letter, {
                    duration: 200,
                    showEyes: true,
                    showMouth: true,
                    showBrows: true,
                    startTracking: true,
                }),
            ));

            // Start idle on all letters; combine cleanups into one entry
            const cleanups = letters.map((letter) =>
                startIdle(letter, { intensity: 0.5, enableTracking: true }),
            );
            idleCleanups.value.set(newIndex, () => cleanups.forEach((c) => c()));
        }
    }
}

/**
 * Submit the currently selected answer
 */
function submitAnswer(): void {
    if (selectedIndex.value === null || isLocked.value) return;

    const suspect = displaySuspects.value[selectedIndex.value!];
    if (!suspect || disabledLetters.value.has(suspect.letter)) return;

    checkAnswer(suspect);
}

async function checkAnswer(suspect: Suspect): Promise<void> {
    const suspectIndex = displaySuspects.value.findIndex(
        (s) => s.letter === suspect.letter,
    );
    const letter = getLetterInstanceForSuspect(suspectIndex);

    if (suspect.isCorrect) {
        // Correct answer!
        showFeedback.value = true;
        isLocked.value = true;
        showSubmitButton.value = false; // Hide submit button on lock

        // Record WST success for letter progression (fire-and-forget).
        // Skipped in preview/demo mode — no datalayer writes off-session.
        if (!props.preview) {
            recordWstSuccess(suspect.letter);
        }

        // Stop idle first
        const idleCleanup = idleCleanups.value.get(suspectIndex!);
        if (idleCleanup) {
            idleCleanup();
            idleCleanups.value.delete(suspectIndex);
        }

        // Celebrate — use Word-level animation for digraphs, single-letter otherwise
        const digraphWord = digraphWordInstances.value.get(suspectIndex!);
        if (digraphWord) {
            await digraphWord.celebrate();
        } else if (letter) {
            await celebrate(letter, { type: "random" });
        }

        // Submit through framework pipeline (calls evaluate() → ResponseProcessor)
        questionUtils.submitAnswer(suspect.letter);
    } else {
        // Wrong answer - lock interaction during animation
        isLocked.value = true;

        // Submit wrong answer through framework pipeline (ELO update, attempt tracking)
        questionUtils.submitAnswer(suspect.letter);

        disabledLetters.value.add(suspect.letter);
        disabledLetters.value = new Set(disabledLetters.value); // Trigger reactivity

        // Stop idle first (combined cleanup handles single or all digraph letters)
        const idleCleanup = idleCleanups.value.get(suspectIndex!);
        if (idleCleanup) {
            idleCleanup();
            idleCleanups.value.delete(suspectIndex);
        }

        const allLetters = getLettersForSuspect(suspectIndex!);

        if (allLetters.length > 0) {
            const phonemeUrl = getPhonemeAudioUrl(suspect.dominantPhoneme);

            const onAllDone = () => {
                if (selectedIndex.value === suspectIndex) updateSelection(null);
                setTimeout(() => {
                    playTargetPhoneme();
                    isLocked.value = false;
                }, 300);
            };

            // Lead letter carries audio; additional letters (digraph partner) mirror
            // mouth + shake with default timing — all run in parallel.
            Promise.all([
                sayNo(allLetters[0], {
                    speakCount: 1,
                    audioUrl: phonemeUrl || undefined,
                    onAudioStart: () => { speakingLetter.value = suspect.letter; },
                    onAudioEnd: () => { speakingLetter.value = null; },
                }),
                ...allLetters.slice(1).map((l) => sayNo(l, { speakCount: 1 })),
            ]).then(onAllDone);
        } else {
            // No letters to animate, unlock immediately
            isLocked.value = false;
        }
    }
}

function moveToNextEnabled(): void {
    const suspects = displaySuspects.value;
    if (selectedIndex.value === null) {
        // Find first enabled
        for (let i = 0; i < suspects.length; i++) {
            if (!disabledLetters.value.has(suspects[i].letter)) {
                updateSelection(i);
                return;
            }
        }
    } else {
        let index = selectedIndex.value;
        for (let i = 0; i < suspects.length; i++) {
            index = (index + 1) % suspects.length;
            if (!disabledLetters.value.has(suspects[index].letter)) {
                updateSelection(index);
                return;
            }
        }
    }
}

// Get lightened background color for suspect card
function getSuspectBgColor(suspect: Suspect): string {
    if (!suspect.color) return "transparent";
    const oklch = colorToOklch(suspect.color);
    if (!oklch) return "transparent";
    // Increase lightness and decrease chroma for a pastel background tint
    let adjusted = adjustLightness(oklch, 0.25); // Lighten significantly
    adjusted = adjustChroma(adjusted, -0.12); // Desaturate to create pastel effect
    return oklchToRgbString(adjusted);
}

// Keyboard handling for ctrl key and navigation
// Note: Letter key handling is now done via keyboard context (onKeyTap)
function handleKeyDown(e: KeyboardEvent): void {
    // In preview (e.g. landing-page embeds), don't capture Up/Down — let the
    // page scroll normally instead of hijacking arrow keys for navigation.
    if (props.preview && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

    // Show number badges when ctrl is held
    if (e.key === "Control") {
        showNumberBadges.value = true;
        return;
    }

    if (isLocked.value) return;

    // Number keys (work regardless of ctrl key)
    if (e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        if (index < displaySuspects.value.length) {
            const suspect = displaySuspects.value[index];
            if (!disabledLetters.value.has(suspect.letter)) {
                updateSelection(index);
                showSubmitButton.value = true; // Physical keyboard navigation
                // Don't auto-submit - wait for Enter
            }
        }
        e.preventDefault();
        return;
    }

    // Arrow keys for navigation (Up/Down only - Left/Right handled by ProgressiveKeyboard)
    switch (e.key) {
        case "ArrowUp":
            e.preventDefault();
            navigatePrevious();
            showSubmitButton.value = true; // Physical keyboard navigation
            break;
        case "ArrowDown":
            e.preventDefault();
            navigateNext();
            showSubmitButton.value = true; // Physical keyboard navigation
            break;
        case "Enter":
            e.preventDefault();
            submitAnswer();
            break;
    }
}

function handleKeyUp(e: KeyboardEvent): void {
    // Hide number badges when ctrl is released
    if (e.key === "Control") {
        showNumberBadges.value = false;
    }
}

/**
 * Navigate to previous enabled suspect.
 * If no selection, starts from center (or right-of-center for even lists).
 */
function navigatePrevious(): void {
    const suspects = displaySuspects.value;

    // Calculate starting point based on center
    let startIndex: number;
    if (selectedIndex.value === null) {
        // Target the middle for odd lists, left-of-center for even.
        // Back up one so the loop's first decrement lands on target.
        const target = Math.floor((suspects.length - 1) / 2);
        startIndex = (target + 1) % suspects.length;
    } else {
        startIndex = selectedIndex.value;
    }

    let index = startIndex;
    for (let i = 0; i < suspects.length; i++) {
        index = (index - 1 + suspects.length) % suspects.length;
        if (!disabledLetters.value.has(suspects[index].letter)) {
            updateSelection(index);
            return;
        }
    }
}

/**
 * Navigate to next enabled suspect.
 * If no selection, starts from center (or left-of-center for even lists).
 */
function navigateNext(): void {
    const suspects = displaySuspects.value;

    // Calculate starting point based on center
    let startIndex: number;
    if (selectedIndex.value === null) {
        // Target the middle for odd lists, right-of-center for even.
        // Back up one so the loop's first increment lands on target.
        const target = Math.floor(suspects.length / 2);
        startIndex = (target - 1 + suspects.length) % suspects.length;
    } else {
        startIndex = selectedIndex.value;
    }

    let index = startIndex;
    for (let i = 0; i < suspects.length; i++) {
        index = (index + 1) % suspects.length;
        if (!disabledLetters.value.has(suspects[index].letter)) {
            updateSelection(index);
            return;
        }
    }
}

function createLetterInstances(): void {
    // Wait for next tick to ensure containers are in DOM
    nextTick(() => {
        displaySuspects.value.forEach((suspect, index) => {
            const container = letterContainerRefs.value[index];
            if (!container) return;

            // Clean up existing instance if any
            if (letterInstances.value[index]) {
                letterInstances.value[index]?.destroy();
            }

            if (suspect.isDigraph) {
                // Digraph suspects are handled by WordDisplay components in the template.
                // The WordDisplay @word-created callback stores the Word instance.
                // We set letterInstances[index] = null to indicate it's a digraph.
                letterInstances.value[index] = null;
            } else {
                // Single-letter suspects use direct SVG rendering via createLetter
                try {
                    const letter = createLetter(
                        suspect.letter, // Use original case
                        container,
                        {
                            color: suspect.color,
                            lineWidth: 20,
                            borderWidth: 2,
                            showEyes: false,
                            showMouth: false,
                            eyebrowsWithEyes: true,
                        },
                    );
                    letterInstances.value[index] = letter;
                } catch (e) {
                    console.warn(
                        `[WhoSaidThat] Failed to create letter for ${suspect.letter}:`,
                        e,
                    );
                    letterInstances.value[index] = null;
                }
            }
        });
        scheduleFit();
    });
}

/**
 * Callback when a WordDisplay for a digraph suspect creates its Word instance.
 */
function onDigraphWordCreated(index: number, word: Word): void {
    digraphWordInstances.value.set(index, word);
    scheduleFit();
}

function cleanupLetters(): void {
    // Clean up idle animations
    idleCleanups.value.forEach((cleanup) => cleanup());
    idleCleanups.value.clear();

    letterInstances.value.forEach((instance: LetterInstance | null) => {
        if (instance) {
            instance.destroy();
        }
    });
    letterInstances.value = [];
    letterContainerRefs.value = [];

    // Clean up digraph Word instances
    digraphWordInstances.value.clear();
    digraphWordRefs.value.clear();
}

// ============================================================================
// Utility: Keyboard mapping for suspects
// ============================================================================

/**
 * Map a suspect to its keyboard key representation.
 * Single-letter suspects map directly; digraphs use their first character.
 */
function suspectToKeyboardKey(suspect: Suspect): string {
    return suspect.letter[0].toLowerCase();
}

/**
 * Sort suspects for display. Single letters are sorted by keyboard order;
 * digraphs are placed after single letters, sorted alphabetically.
 */
function sortSuspectsForDisplay(suspects: Suspect[]): Suspect[] {
    const singles = suspects.filter(s => !s.isDigraph);
    const digraphs = suspects.filter(s => s.isDigraph);

    const sortedSingles = sortByKeyboardOrder(singles);
    const sortedDigraphs = digraphs.sort((a, b) => a.letter.localeCompare(b.letter));

    return [...sortedSingles, ...sortedDigraphs];
}

// ============================================================================
// Keyboard Helpers
// ============================================================================

/**
 * Returns the enabled key list for keyboard.updateConfig(), respecting the
 * current keyboard mode (number keys for mixed/digraph, letter keys for all-single).
 */
function getEnabledKeysForCurrentState(): string[] {
    if (hasDigraphSuspect.value) {
        const keys = displaySuspects.value
            .map((suspect, i) => ({ key: String(i + 1), suspect }))
            .filter(({ suspect }) => !disabledLetters.value.has(suspect.letter))
            .map(({ key }) => key);
        keys.push("arrowleft", "arrowright");
        if (showSubmitButton.value) keys.push("enter");
        return keys;
    } else {
        const suspectLetters = displaySuspects.value.map((s) => suspectToKeyboardKey(s));
        const keys = [
            ...suspectLetters.filter(
                (l) => !disabledLetters.value.has(l) && !disabledLetters.value.has(l.toUpperCase()),
            ),
            "arrowleft",
            "arrowright",
        ];
        if (showSubmitButton.value) keys.push("enter");
        return keys;
    }
}

// ============================================================================
// Animation Callbacks
// ============================================================================

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
    // Initialize question via framework pipeline
    questionUtils.question.value = new WhoSaidThat(props.data);

    // Load unlocked digraphs — use synchronous cache when available to avoid
    // the microtask gap that causes height jank during card-slide transitions.
    // Preview/demo mode never touches the datalayer.
    const cached = getLetterProgressionSync();
    const progression = props.preview
        ? null
        : cached !== undefined
          ? cached
          : await getLetterProgression();
    const unlockedDigraphs = (progression?.unlockedLetters ?? []).filter((l) => l.length > 1);

    // For distractor-free cards, build suspects dynamically using modifyDifficulty
    // to scale distractor count (following fillIn.vue precedent from framework)
    const suspects = questionUtils.question.value.needsAutoDistractors
        ? questionUtils.question.value.buildAutoSuspects(props.modifyDifficulty, unlockedDigraphs)
        : questionUtils.question.value.getShuffledSuspects();

    // Determine keyboard mode: number keys if any suspect is a digraph.
    // In number mode, keyboard order is irrelevant — shuffle for variety.
    // In letter mode, sort by keyboard layout so card positions match keycap positions.
    const hasAnyDigraph = suspects.some((s) => s.isDigraph);
    if (hasAnyDigraph) {
        const arr = [...suspects];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        displaySuspects.value = arr;
    } else {
        displaySuspects.value = sortSuspectsForDisplay(suspects);
    }

    // Create letter instances for each suspect (fits once they're drawn)
    createLetterInstances();
    startFitObserver();

    // Set keyboard mode ref (used by keyboard setup and watches below)
    hasDigraphSuspect.value = hasAnyDigraph;

    // Configure keyboard context if available
    if (keyboard) {
        if (hasDigraphSuspect.value) {
            // NUMBER MODE — one numbered key per suspect
            const numberKeys = displaySuspects.value.map((_, i) => String(i + 1));
            const keyColors: Record<string, string> = { enter: SUBMIT_KEY_COLOR };
            displaySuspects.value.forEach((suspect, i) => {
                if (suspect.color) {
                    const oklch = colorToOklch(suspect.color);
                    keyColors[String(i + 1)] = oklch
                        ? oklchToRgbString(adjustLightness(oklch, -0.1))
                        : suspect.color;
                }
            });

            keyboard.requestConfig({
                letters: [...numberKeys, "arrowleft", "arrowright", "enter"],
                overrideBase: true,
                showFullLayout: false,
                enabledLetters: getEnabledKeysForCurrentState(),
                keyColors,
                showAdvance: true,
                advanceColor: "#4caf50",
                advanceText: "mdi-volume-high",
                disabled: isLocked.value,
            });

            const unsubTap = keyboard.onKeyTap((event) => {
                if (isLocked.value) return;
                const keyNum = parseInt(event.letter, 10);
                if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= displaySuspects.value.length) {
                    const index = keyNum - 1;
                    const suspect = displaySuspects.value[index];
                    if (!disabledLetters.value.has(suspect.letter)) {
                        if (event.source === "mouse" || event.source === "touch") {
                            if (selectedIndex.value === index) {
                                submitAnswer();
                            } else {
                                updateSelection(index);
                                showSubmitButton.value = false;
                            }
                        } else {
                            updateSelection(index);
                            showSubmitButton.value = true;
                        }
                    }
                }
            });
            keyboardUnsubscribers.push(unsubTap);

            const unsubHover = keyboard.onKeyHover((event) => {
                if (isLocked.value) return;
                const keyNum = parseInt(event.letter, 10);
                if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= displaySuspects.value.length) {
                    const index = keyNum - 1;
                    const suspect = displaySuspects.value[index];
                    if (!disabledLetters.value.has(suspect.letter)) {
                        updateSelection(index);
                        showSubmitButton.value = false;
                    }
                }
            });
            keyboardUnsubscribers.push(unsubHover);

        } else {
            // LETTER MODE — one letter keycap per suspect (original WST behavior)
            const suspectLetters = displaySuspects.value.map((s) => suspectToKeyboardKey(s));
            const keyColors: Record<string, string> = {};
            displaySuspects.value.forEach((suspect) => {
                if (suspect.color) {
                    const key = suspectToKeyboardKey(suspect);
                    const oklch = colorToOklch(suspect.color);
                    keyColors[key] = oklch
                        ? oklchToRgbString(adjustLightness(oklch, -0.1))
                        : suspect.color;
                }
            });

            keyboard.requestConfig({
                letters: [...suspectLetters, "arrowleft", "arrowright", "enter"],
                overrideBase: true,
                showFullLayout: true,
                enabledLetters: getEnabledKeysForCurrentState(),
                keyColors: { ...keyColors, enter: SUBMIT_KEY_COLOR },
                showAdvance: true,
                advanceColor: "#4caf50",
                advanceText: "mdi-volume-high",
                disabled: isLocked.value,
            });

            const unsubTap = keyboard.onKeyTap((event) => {
                if (isLocked.value) return;
                const letter = event.letter.toLowerCase();
                const suspectIndex = displaySuspects.value.findIndex(
                    (s) =>
                        suspectToKeyboardKey(s) === letter &&
                        !disabledLetters.value.has(s.letter),
                );
                if (suspectIndex !== -1) {
                    if (event.source === "mouse" || event.source === "touch") {
                        if (selectedIndex.value === suspectIndex) {
                            submitAnswer();
                        } else {
                            updateSelection(suspectIndex);
                            showSubmitButton.value = false;
                        }
                    } else {
                        updateSelection(suspectIndex);
                        showSubmitButton.value = true;
                    }
                }
            });
            keyboardUnsubscribers.push(unsubTap);

            const unsubHover = keyboard.onKeyHover((event) => {
                if (isLocked.value) return;
                const letter = event.letter.toLowerCase();
                const suspectIndex = displaySuspects.value.findIndex(
                    (s) =>
                        suspectToKeyboardKey(s) === letter &&
                        !disabledLetters.value.has(s.letter),
                );
                if (suspectIndex !== -1) {
                    updateSelection(suspectIndex);
                    hoveredKeyboardKey.value = letter;
                    showSubmitButton.value = false;
                }
            });
            keyboardUnsubscribers.push(unsubHover);
        }

        // Common to both modes: hover-end, arrows, enter
        const unsubHoverEnd = keyboard.onKeyHoverEnd(() => {
            if (isLocked.value) return;
            updateSelection(null);
            hoveredKeyboardKey.value = null;
        });
        keyboardUnsubscribers.push(unsubHoverEnd);

        const unsubArrowLeft = keyboard.onArrowLeft(() => {
            if (isLocked.value) return;
            navigatePrevious();
            showSubmitButton.value = true;
        });
        keyboardUnsubscribers.push(unsubArrowLeft);

        const unsubArrowRight = keyboard.onArrowRight(() => {
            if (isLocked.value) return;
            navigateNext();
            showSubmitButton.value = true;
        });
        keyboardUnsubscribers.push(unsubArrowRight);

        const unsubEnter = keyboard.onEnter(() => {
            if (isLocked.value) return;
            submitAnswer();
        });
        keyboardUnsubscribers.push(unsubEnter);
    }

    // Add keyboard listeners for ctrl and number keys
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Play target phoneme after short delay.
    // Skipped in preview/demo mode — audio plays only on explicit tap.
    if (!props.preview) {
        setTimeout(() => {
            playTargetPhoneme();
        }, 500);
    }
});

// Expose questionUtils properties so the framework's isQuestionView() check passes
// and StudySession can read maxAttemptsPerView / maxSessionViews for retry logic.
defineExpose({
    submitAnswer: questionUtils.submitAnswer,
    priorAttempts: questionUtils.priorAttempts,
    priorAnswers: questionUtils.priorAnswers,
    maxAttemptsPerView: questionUtils.maxAttemptsPerView,
    maxSessionViews: questionUtils.maxSessionViews,
});

onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);

    // Delay letter cleanup so SVGs persist through the card-slide leave transition.
    // The DOM nodes are kept alive by <Transition> after the Vue instance unmounts,
    // but destroy() removes SVG elements immediately — causing a visual blink.
    setTimeout(() => cleanupLetters(), 500);

    // Clean up keyboard event subscriptions
    keyboardUnsubscribers.forEach((unsub) => unsub());
});

// Feedback text changes the chrome height as it comes and goes. The submit
// button (its gutter is collapsed on phones) reports via its `layout` event.
watch(feedbackMessage, scheduleFit);

// Watch for disabled letters changes to update keyboard
watch(
    disabledLetters,
    () => {
        if (keyboard) {
            // Rebuild color map (disabled suspects may need visual update)
            const keyColors: Record<string, string> = { enter: SUBMIT_KEY_COLOR };
            if (hasDigraphSuspect.value) {
                displaySuspects.value.forEach((suspect, i) => {
                    if (suspect.color) {
                        const oklch = colorToOklch(suspect.color);
                        keyColors[String(i + 1)] = oklch
                            ? oklchToRgbString(adjustLightness(oklch, -0.1))
                            : suspect.color;
                    }
                });
            } else {
                displaySuspects.value.forEach((suspect) => {
                    const key = suspectToKeyboardKey(suspect);
                    if (suspect.color) {
                        const oklch = colorToOklch(suspect.color);
                        keyColors[key] = oklch
                            ? oklchToRgbString(adjustLightness(oklch, -0.1))
                            : suspect.color;
                    }
                });
            }
            keyboard.updateConfig({
                enabledLetters: getEnabledKeysForCurrentState(),
                keyColors,
            });
        }
    },
    { deep: true },
);

// Watch for showSubmitButton changes to enable/disable enter key
watch(showSubmitButton, () => {
    if (keyboard) {
        keyboard.updateConfig({
            enabledLetters: getEnabledKeysForCurrentState(),
        });
    }
});

// Watch for locked state to update keyboard
watch(isLocked, (locked) => {
    if (keyboard) {
        keyboard.updateConfig({
            disabled: locked,
        });
    }
});
</script>

<style scoped>
.who-said-that {
    --wst-bg: #fafafa;
    --wst-primary: #2196f3;
    --wst-success: #4caf50;
    --wst-error: #f44336;
    --wst-text: #333;
    --wst-text-muted: #666;

    /* Query container so the compact sizing below responds to the available
       width here (e.g. the narrow landing-page phone frame), not just the
       viewport. In-app the container is wide, so nothing changes. */
    container: wst-q / inline-size;
    width: 100%;
    text-align: center;
}

/* Padding lives here, not on .who-said-that: an element is not matched by its
   own container query, so anything the compact rules below shrink has to sit
   inside the container. */
.wst-body {
    padding: 24px;
}

/* Header */
.wst-header {
    margin-bottom: 24px;
}

/* Title: shared across the four question views (1.5rem; 1.1rem when the
   question is ≤600px wide). Keep in step with the others. */
.wst-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--wst-text);
    margin: 0 0 8px 0;
}

.wst-instruction {
    font-size: 1.125rem;
    color: var(--wst-text-muted);
    margin: 0;
}

/* Audio controls */
.wst-audio-controls {
    margin-bottom: 32px;
}

/* Fit box for the suspects (see useScaleToFit). Centers the scaled block;
   while re-wrapped it is laid out wider than this box and drawn scaled down
   into it, so overflow must stay visible. */
.wst-suspects-fit {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    overflow: visible;
}

/* Suspects grid */
.wst-suspects {
    flex-shrink: 0; /* useScaleToFit sets an explicit (wider) width when re-wrapping */
    width: 100%;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 16px;
    overflow: visible; /* Allow letter strokes to render fully */
}

.wst-suspect {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 24px;
    background: var(--suspect-bg-color, white);
    /* min-width: 100px; Remove fixed min-width to allow flexibility based on letter width */
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: visible; /* Allow letter strokes to render fully */
    /* Aside A1: Base elevation */
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    scale: 1; /* Use scale property for better composition with transform animations */
}

/* Aside A1: Enlarge-in-place selection (scale instead of translateY) with elevation */
.wst-suspect:hover:not(:disabled),
.wst-suspect--selected {
    border-color: var(--wst-primary);
    scale: 1.2;
    /* Higher elevation on selection - using vuetify-style elevation-8 values */
    box-shadow:
        0 5px 5px -3px rgba(0, 0, 0, 0.2),
        0 8px 10px 1px rgba(0, 0, 0, 0.14),
        0 3px 14px 2px rgba(0, 0, 0, 0.12);
    z-index: 10;
}

.wst-suspect--disabled {
    cursor: not-allowed;
}

/* Only apply disabled styling (fade/shrink) if NOT selected */
/* This ensures incorrect answers stay highlighted/scaled during feedback */
.wst-suspect--disabled:not(.wst-suspect--selected) {
    opacity: 0.4;
    scale: 1 !important;
    box-shadow: none !important;
}

.wst-suspect--correct {
    border-color: var(--wst-success);
    background: #e8f5e9;
    animation: celebrate 0.5s ease;
}

.wst-suspect--incorrect {
    border-color: var(--wst-error);
    background: #ffebee;
    animation: shake 0.4s ease;
}

.wst-suspect--speaking {
    animation: speak 0.3s ease infinite;
}

.wst-suspect-number {
    position: absolute;
    top: -10px;
    left: -10px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #666;
    color: white;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: 600;
}

.wst-suspect--selected .wst-suspect-number {
    background: var(--wst-primary);
}

.wst-letter-container {
    height: 80px; /* Fixed height to align letters vertically */
    width: auto; /* Allow width to grow for wide letters like m */
    min-width: 60px; /* Minimum width for very narrow letters */
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible; /* Allow strokes to render outside bounds */
    /* LetterPerson canvas will be rendered here */
}

.wst-letter-container :deep(svg) {
    width: auto; /* Let browser calculate width based on aspect ratio */
    height: 150%; /* Fill the container height */
}

.wst-suspect--digraph {
    min-width: 180px;
}

.wst-suspect-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--wst-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
}


/* Feedback */
.wst-feedback {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 16px;
}

.wst-feedback--correct {
    background: #e8f5e9;
    color: var(--wst-success);
}

.wst-feedback--incorrect {
    background: #fff3e0;
    color: #f57c00;
}

/* Animations */
@keyframes pulse {
    0%,
    100% {
        scale: 1.2;
    }
    50% {
        scale: 1.25;
    }
}

@keyframes shake {
    0%,
    100% {
        transform: translateX(0);
    }
    20% {
        transform: translateX(-8px);
    }
    40% {
        transform: translateX(8px);
    }
    60% {
        transform: translateX(-6px);
    }
    80% {
        transform: translateX(6px);
    }
}

@keyframes celebrate {
    0% {
        scale: 1.2;
    }
    50% {
        scale: 1.35;
    }
    100% {
        scale: 1.2;
    }
}

@keyframes speak {
    0%,
    100% {
        scale: 1.2;
    }
    50% {
        scale: 1.25;
    }
}

/* Responsive — keyed to the question's container width (see container above) */
@container wst-q (max-width: 600px) {
    /* Trimming chrome is load-bearing on phones: every px here is a px the
       suspects don't have to be scaled away (cf. WordSelectionView). */
    .wst-body {
        padding: 12px 8px 0;
    }

    .wst-header {
        margin-bottom: 8px;
    }

    .wst-title {
        font-size: 1.1rem;
        margin-bottom: 0;
    }

    .wst-instruction {
        font-size: 0.95rem;
    }

    .wst-audio-controls {
        margin-bottom: 12px;
    }

    .wst-suspects-fit {
        margin-bottom: 8px;
    }

    :deep(.submit-area) {
        min-height: 0;
        margin-bottom: 0;
    }

    .wst-suspects {
        gap: 12px;
    }

    .wst-suspect {
        padding: 16px 20px;
        min-width: 80px;
    }

    .wst-letter-container {
        width: 80px;
        height: 80px;
    }

    .wst-letter-container--digraph {
        width: 110px;
    }

    .wst-suspect--digraph {
        min-width: 130px;
    }
}
</style>
