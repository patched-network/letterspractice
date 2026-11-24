<!--
  WordSelectionView.vue - Word identification/minimal pair question view

  Displays a "Find the Word" question where the learner hears a word
  and must select it from a list of similar-sounding options.

  Features:
  - Plays target word audio on mount
  - Displays word options as PhoneticWord components with procedural colors
  - Keyboard navigation (1-N, arrows, enter, spacebar)
  - Two-way hover binding between cards and keyboard keys
  - Wrong answers play selected word audio for comparison
  - Correct answer triggers celebration animation
  - Selection model mirrors WhoSaidThat for consistency
-->

<template>
    <div ref="rootEl" class="word-selection">
      <div ref="bodyEl" class="ws-body">
        <!-- Instruction area -->
        <div class="ws-header">
            <h2 class="ws-title">Find the Word</h2>
        </div>

        <!-- Audio controls -->
        <div class="ws-audio-controls">
            <PlaySoundButton
                :is-playing="isPlayingAudio"
                @play="playTargetWord"
            />
        </div>

        <!-- Word options.
             `.ws-options-fit` is the box the options must fit inside; see
             `applyFit()` for the scale-down of last resort. -->
        <div ref="optionsViewport" class="ws-options-fit">
            <div ref="optionsEl" class="ws-options">
                <button
                    v-for="(option, index) in displayOptions"
                    :key="option.word"
                    class="ws-option"
                    :class="{
                        'ws-option--selected': selectedIndex === index,
                        'ws-option--disabled': option.disabled,
                        'ws-option--correct':
                            showFeedback &&
                            option.isCorrect &&
                            selectedIndex === index,
                        'ws-option--incorrect':
                            showFeedback &&
                            selectedIndex === index &&
                            !option.isCorrect,
                        'ws-option--speaking': speakingWordIndex === index,
                    }"
                    :style="{ '--option-bg-color': getOptionBgColor(option) }"
                    :disabled="option.disabled || isLocked"
                    @click="handleOptionClick(option, index)"
                    @mouseenter="handleOptionHover(option, index)"
                    @mouseleave="handleOptionHoverEnd()"
                >
                    <PhoneticWord
                        :ref="(el: ComponentPublicInstance | Element | null) => setPhoneticWordRef(el, index)"
                        :word="option.word"
                        :height="wordHeight"
                        :options="getWordOptions(option)"
                        :phonetic-chunks="getPhoneticChunks(option.word)"
                        :clickable-letters="false"
                        :preserve-on-unmount="true"
                        class="ws-word-container"
                    />
                </button>
            </div>
        </div>

        <!-- Submit button (shown only for physical keyboard navigation) -->
        <SubmitAnswerButton
            :visible="showSubmitButton && !isLocked"
            @submit="submitAnswer"
            @layout="scheduleFit"
        />
      </div>

        <!-- Hidden audio elements -->
        <audio ref="targetAudio" @ended="handleTargetAudioEnded" @error="handleTargetAudioEnded" />
        <audio ref="optionAudio" @ended="handleOptionAudioEnded" @error="handleOptionAudioEnded" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WordSelectionView' });

import {
    ref,
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    watch,
    PropType,
    type ComponentPublicInstance,
} from "vue";
import { ViewData } from "@vue-skuilder/common";
import { useViewable, useQuestionView } from "@vue-skuilder/courseware";
import { WordSelection, type WordOption } from "./WordSelection";
import { useKeyboardContextOptional } from "../composables/useKeyboardContext";
import PlaySoundButton from "../components/PlaySoundButton.vue";
import SubmitAnswerButton, { SUBMIT_KEY_COLOR } from "../components/SubmitAnswerButton.vue";
import PhoneticWord from "../letterpeople/vue/PhoneticWord.vue";
import { type WordOptions, type Word } from "../letterpeople/Word";
import { headShakeNo } from "../letterpeople/animations";
import {
    colorToOklch,
    adjustLightness,
    adjustChroma,
    oklchToRgbString,
    generateVibrancyRainbow,
} from "../letterpeople/util/color";
import { findPhoneticDifference, getPhonetics, getPhonemeAudioUrl } from "../services/phonetics";
import { introModeState } from "../services/introModeState";
import { useScaleToFit, measureAvailableHeight } from "../composables/useScaleToFit";

// ============================================================================
// Characterization Config
// ============================================================================

/**
 * Controls how much "life" word options show on selection.
 * Tune this to balance expressiveness vs visual noise
 * (full words are busier than single letters in WhoSaidThat).
 */
enum CharacterizationLevel {
    /** No characterization — static letters */
    NONE = 'none',
    /** Eyes only, no tracking */
    EYES_ONLY = 'eyes-only',
    /** Eyes with cursor tracking */
    EYES_TRACKING = 'eyes-tracking',
    /** Eyes + mouth + tracking (full WST style) */
    FULL = 'full',
}

const CHARACTERIZATION = CharacterizationLevel.EYES_TRACKING;

// ============================================================================
// Types
// ============================================================================

interface DisplayOption extends WordOption {
    color: string;
}

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
     *   - no audio autoplay on mount (audio plays only on explicit tap)
     * Visuals, option interaction, and celebrate/feedback are unchanged.
     * (The framework submit pipeline is a no-op without a parent session,
     * so it is left in place — mirrors WhoSaidThatView.)
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
// Framework wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'WordSelectionView');
const questionUtils = useQuestionView<WordSelection>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);
const displayOptions = ref<DisplayOption[]>([]);
const selectedIndex = ref<number | null>(null); // Start with no selection
const disabledOptions = ref<Set<number>>(new Set());
const isLocked = ref(false);
const showFeedback = ref(false);
const isPlayingAudio = ref(false);
const speakingWordIndex = ref<number | null>(null);
const showSubmitButton = ref(false); // Only true for physical keyboard navigation

// Audio refs
const targetAudio = ref<HTMLAudioElement | null>(null);
const optionAudio = ref<HTMLAudioElement | null>(null);

// PhoneticWord component refs
type PhoneticWordInstance = InstanceType<typeof PhoneticWord>;
const phoneticWordRefs = ref<(PhoneticWordInstance | null)[]>([]);

function setPhoneticWordRef(el: ComponentPublicInstance | Element | null, index: number): void {
    phoneticWordRefs.value[index] = el as PhoneticWordInstance | null;
}

// Keyboard event unsubscribers for proper cleanup
const keyboardUnsubscribers: (() => void)[] = [];

// ============================================================================
// Fit to available space
// ============================================================================
//
// Options are laid out as a wrapping row of full-size words. On a phone that
// blows the vertical budget quickly: a 4-letter word at 100px is ~240px wide,
// so on a 360px screen the options stack one-per-row and the last one or two
// end up below the fold (there is no scroll affordance a toddler will use).
//
// Two mechanisms, in order:
//   1. `wordHeight` is chosen ONCE at mount, before the options first render,
//      from the space actually available. This is the mechanism that matters:
//      smaller letters mean narrower options, which means fewer rows.
//      It has to happen pre-render because Word reads its container's computed
//      height at construction time (see letterpeople/Word.ts) — changing the
//      height prop afterwards resizes the box but not the glyphs.
//   2. `applyFit()` measures the real laid-out block and scales it down if the
//      estimate in (1) was still optimistic (or the viewport later shrank).
//      Purely cosmetic backstop; (1) should normally land it.

const rootEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
const optionsViewport = ref<HTMLElement | null>(null);
const optionsEl = ref<HTMLElement | null>(null);

/** Rendered height of each word, in px. Set once, pre-render, by `chooseWordHeight()`. */
const wordHeight = ref(100);

/** Candidate word heights, largest first. */
const WORD_HEIGHT_LADDER = [100, 88, 76, 64, 56, 48, 42, 36];

/**
 * Rendered width ÷ height per glyph. Letters are drawn into a
 * (viewBoxWidth + 2·pad) × (135 + 2·pad) box (letterpeople/index.ts); with this
 * view's lineWidth 20 / borderWidth 0 the pad is 10, so the common 70-unit-wide
 * lowercase glyph renders at 90/155 ≈ 0.58 of its height. Rounded up — an
 * overestimate only costs a rung on the ladder, an underestimate overflows.
 * Only the outliers are listed; everything else is close enough to the default.
 */
const GLYPH_ASPECT = 0.6;
const GLYPH_ASPECTS: Record<string, number> = {
    m: 0.97, // 130 units wide
    w: 0.65, // 80
    t: 0.55, // 60
    r: 0.55, // 60
    l: 0.4, // stem + tail
    i: 0.35, // stem, dot is 1.6× lineWidth
};

/** Matches WordOptions.spacing below. */
const LETTER_SPACING = 1;

/** Slack left below a full-height layout so the 1.2 selection scale isn't clipped. */
const SELECTION_HEADROOM = 0.92;

function estimateWordWidth(word: string, height: number): number {
    let width = 0;
    for (const ch of word) {
        width += height * (GLYPH_ASPECTS[ch.toLowerCase()] ?? GLYPH_ASPECT);
    }
    return width + Math.max(0, word.length - 1) * LETTER_SPACING;
}

/** Number of rows a wrapping flex row would break these widths into. */
function countRows(widths: number[], containerWidth: number, gap: number): number {
    let rows = 1;
    let used = 0;
    for (const w of widths) {
        const needed = used === 0 ? w : used + gap + w;
        if (needed > containerWidth && used > 0) {
            rows++;
            used = w;
        } else {
            used = needed;
        }
    }
    return rows;
}

/** Live geometry of the options row, read from CSS so the breakpoints stay in one place. */
function readOptionsMetrics(): { gap: number; padX: number; padY: number } {
    const style = optionsEl.value ? getComputedStyle(optionsEl.value) : null;
    const num = (v: string | undefined, fallback: number) => {
        const n = parseFloat(v ?? "");
        return Number.isFinite(n) ? n : fallback;
    };
    return {
        gap: num(style?.rowGap, 16),
        padX: num(style?.getPropertyValue("--ws-option-pad-x"), 20),
        padY: num(style?.getPropertyValue("--ws-option-pad-y"), 16),
    };
}

/**
 * Largest ladder rung whose predicted layout fits the space available.
 * Called before the options exist in the DOM, so everything here is estimated
 * from word lengths rather than measured.
 */
function chooseWordHeight(words: string[]): number {
    const root = rootEl.value;
    const body = bodyEl.value;
    const ladder = props.preview
        ? WORD_HEIGHT_LADDER.filter((h) => h <= 64)
        : WORD_HEIGHT_LADDER;

    if (!root || !body) return ladder[0];

    const bodyStyle = getComputedStyle(body);
    const contentWidth =
        body.clientWidth -
        parseFloat(bodyStyle.paddingLeft) -
        parseFloat(bodyStyle.paddingRight);

    // Options haven't rendered yet, so the view's current height IS its chrome.
    const chrome = root.offsetHeight;
    const available = (measureAvailableHeight(root) - chrome) * SELECTION_HEADROOM;

    if (!(contentWidth > 0) || !(available > 0)) return ladder[0];

    const { gap, padX, padY } = readOptionsMetrics();

    for (const height of ladder) {
        const widths = words.map((w) => estimateWordWidth(w, height) + padX * 2);
        if (widths.some((w) => w > contentWidth)) continue;

        const rows = countRows(widths, contentWidth, gap);
        const total = rows * (height + padY * 2) + (rows - 1) * gap;
        if (total <= available) return height;
    }
    return ladder[ladder.length - 1];
}

// Backstop: scale the laid-out options block down if it still overflows, and
// re-fit when the boundary resizes (rotation, browser chrome collapsing).
const { applyFit, start: startFitObserver, stop: stopFitObserver } = useScaleToFit({
    root: rootEl,
    viewport: optionsViewport,
    content: optionsEl,
});

/**
 * Re-fit after the DOM settles. The submit button is chrome that comes and
 * goes (physical-keyboard navigation), and on phones its gutter is collapsed,
 * so showing it would otherwise push the options past the boundary.
 */
function scheduleFit(): void {
    nextTick(() => requestAnimationFrame(applyFit));
}

// ============================================================================
// Computed / Helpers
// ============================================================================

// Memoize word options per-option to avoid triggering PhoneticWord's
// deep watcher on props.options (which recreates the entire Word instance).
const wordOptionsCache = new Map<string, WordOptions>();

function getWordOptions(option: DisplayOption): WordOptions {
    const cached = wordOptionsCache.get(option.word);
    if (cached) return cached;

    const opts: WordOptions = {
        spacing: 1,
        letterOptions: {
            color: option.color,
            lineWidth: 20,
            borderWidth: 0,
            showEyes: false,
            showMouth: false,
            showArms: false,
            eyebrowsWithEyes: false,
        },
    };
    wordOptionsCache.set(option.word, opts);
    return opts;
}

function getPhoneticChunks(word: string) {
    return getPhonetics(word)?.chunks as any;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Methods
// ============================================================================

async function playTargetWord(): Promise<void> {
    if (!question.value || !targetAudio.value) return;

    const audioUrl = question.value.getTargetAudioUrl();
    if (!audioUrl) {
        console.warn(
            `[WordSelection] No audio for target: ${question.value.target}`,
        );
        return;
    }

    isPlayingAudio.value = true;
    targetAudio.value.src = audioUrl;
    try {
        await targetAudio.value.play();
    } catch (e) {
        console.error("[WordSelection] Failed to play target audio:", e);
        isPlayingAudio.value = false;
    }
}

async function playOptionWord(word: string, index: number): Promise<void> {
    if (!optionAudio.value) return;

    const audioUrl = `/audio/words/${word}.mp3`;
    speakingWordIndex.value = index;
    optionAudio.value.src = audioUrl;
    try {
        await optionAudio.value.play();
    } catch (e) {
        console.error("[WordSelection] Failed to play option audio:", e);
        speakingWordIndex.value = null;
    }
}

function handleTargetAudioEnded(): void {
    isPlayingAudio.value = false;
}

function handleOptionAudioEnded(): void {
    speakingWordIndex.value = null;
}

function playTargetWordAndWait(): Promise<void> {
    return new Promise((resolve) => {
        if (!question.value || !targetAudio.value) { resolve(); return; }
        const audioUrl = question.value.getTargetAudioUrl();
        if (!audioUrl) { resolve(); return; }
        const audio = targetAudio.value;
        audio.src = audioUrl;
        isPlayingAudio.value = true;
        const onEnd = () => {
            audio.removeEventListener('ended', onEnd);
            isPlayingAudio.value = false;
            resolve();
        };
        audio.addEventListener('ended', onEnd);
        audio.play().catch(() => { isPlayingAudio.value = false; resolve(); });
    });
}

function playOptionWordAndWait(word: string, index: number): Promise<void> {
    return new Promise((resolve) => {
        if (!optionAudio.value) { resolve(); return; }
        const audio = optionAudio.value;
        audio.src = `/audio/words/${word}.mp3`;
        speakingWordIndex.value = index;
        const onEnd = () => {
            audio.removeEventListener('ended', onEnd);
            speakingWordIndex.value = null;
            resolve();
        };
        audio.addEventListener('ended', onEnd);
        audio.play().catch(() => { speakingWordIndex.value = null; resolve(); });
    });
}

function handleOptionClick(option: DisplayOption, index: number): void {
    if (isLocked.value || option.disabled) return;

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
 * Handle hovering over an option card
 * Note: Does NOT show submit button - pure mouse-centric flow
 */
function handleOptionHover(option: DisplayOption, index: number): void {
    if (isLocked.value || option.disabled) return;

    // Set selection on hover for visual feedback
    updateSelection(index);
    showSubmitButton.value = false;
}

/**
 * Handle mouse leaving an option card - clear selection
 */
function handleOptionHoverEnd(): void {
    if (isLocked.value) return;

    // Clear selection when mouse leaves (stateless mouse flow)
    updateSelection(null);
}

/**
 * Show eyes/mouth on a word's letters based on CHARACTERIZATION level.
 */
function characterize(index: number): void {
    if (CHARACTERIZATION as CharacterizationLevel === CharacterizationLevel.NONE) return;

    const pw = phoneticWordRefs.value[index];
    const word = pw?.getWordInstance?.();
    if (!word) return;

    for (const letter of word) {
        letter.eyes.show({ duration: 0 });

        if ((CHARACTERIZATION as CharacterizationLevel) === CharacterizationLevel.EYES_TRACKING
            || (CHARACTERIZATION as CharacterizationLevel) === CharacterizationLevel.FULL) {
            letter.eyes.startTracking({ intensity: 0.4 });
        }

        if ((CHARACTERIZATION as CharacterizationLevel) === CharacterizationLevel.FULL) {
            letter.mouth.show({ duration: 0 });
        }
    }
}

/**
 * Hide eyes/mouth on a word's letters.
 */
function decharacterize(index: number): void {
    if (CHARACTERIZATION as CharacterizationLevel === CharacterizationLevel.NONE) return;

    const pw = phoneticWordRefs.value[index];
    const word = pw?.getWordInstance?.();
    if (!word) return;

    const dur = { duration: 150 };
    for (const letter of word) {
        letter.eyes.stopTracking();
        letter.eyes.hide(dur);
        if (letter.mouth.isVisible()) {
            letter.mouth.hide(dur);
        }
    }
}

/**
 * Update the selected index with characterization transitions.
 */
async function updateSelection(newIndex: number | null): Promise<void> {
    const oldIndex = selectedIndex.value;

    // Skip if no change
    if (oldIndex === newIndex) return;

    // Decharacterize old selection
    if (oldIndex !== null) {
        decharacterize(oldIndex);
    }

    selectedIndex.value = newIndex;

    // Characterize new selection
    if (newIndex !== null) {
        characterize(newIndex);
    }
}

/**
 * Submit the currently selected answer
 */
function submitAnswer(): void {
    if (selectedIndex.value === null || isLocked.value) return;

    const option = displayOptions.value[selectedIndex.value];
    if (!option || option.disabled) return;

    checkAnswer(option);
}

async function checkAnswer(option: DisplayOption): Promise<void> {
    const optionIndex = displayOptions.value.findIndex(
        (o) => o.word === option.word,
    );
    const phoneticWord = phoneticWordRefs.value[optionIndex];
    const wordInstance = phoneticWord?.getWordInstance?.();

    if (option.isCorrect) {
        // Correct answer!
        showFeedback.value = true;
        isLocked.value = true;
        showSubmitButton.value = false;

        // Run celebration animation
        if (wordInstance) {
            await wordInstance.celebrate();
        }

        // Submit through framework pipeline (calls evaluate() → ResponseProcessor)
        questionUtils.submitAnswer(option.word);
    } else {
        await handleWrongAnswer(option, optionIndex, phoneticWord, wordInstance);
    }
}

async function handleWrongAnswer(
    option: DisplayOption,
    optionIndex: number,
    phoneticWord: PhoneticWordInstance | null,
    wordInstance: Word | null | undefined,
): Promise<void> {
    isLocked.value = true;

    // Submit wrong answer through framework pipeline (ELO update, attempt tracking)
    questionUtils.submitAnswer(option.word);

    // Mark as disabled
    disabledOptions.value.add(optionIndex);
    displayOptions.value[optionIndex].disabled = true;
    displayOptions.value = [...displayOptions.value];

    // Find the phonetic difference between wrong word and target
    const target = question.value?.target;
    const diffIndex = target ? findPhoneticDifference(option.word, target) : null;
    const wrongPhonetics = getPhonetics(option.word);
    const diffChunk = (diffIndex !== null && wrongPhonetics)
        ? wrongPhonetics.chunks[diffIndex]
        : null;

    if (diffChunk && wordInstance && phoneticWord) {
        const diffLetterIndices = Object.keys(diffChunk.letters).map(Number);

        // 1. Characterize differing letters — draw attention to the problem spot
        for (const li of diffLetterIndices) {
            const letter = wordInstance.getLetter(li);
            if (letter) {
                letter.eyes.show({ duration: 0 });
                letter.mouth.show({ duration: 0 });
            }
        }

        // 2. HeadShake — "this part is wrong"
        await Promise.all(
            diffLetterIndices.map((li) => {
                const letter = wordInstance.getLetter(li);
                if (!letter) return Promise.resolve();
                return headShakeNo(letter, { cycles: 2, angle: 10, speed: 1.2 });
            })
        );

        // 3. Speak the phoneme — "this is what it actually says"
        for (const li of diffLetterIndices) {
            const letter = wordInstance.getLetter(li);
            letter?.mouth.updateShape({ openness: 0.5, mood: 0.4 }, { duration: 150 });
        }

        const phonemeAudioUrl = getPhonemeAudioUrl(diffChunk.phoneme);
        if (phonemeAudioUrl) {
            await new Promise<void>((resolve) => {
                const audio = new Audio(phonemeAudioUrl);
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });
        }

        // Mouth closes after speak, but eyes + mouth stay visible
        // until the option fully shuts down (decharacterize below)
        for (const li of diffLetterIndices) {
            const letter = wordInstance.getLetter(li);
            letter?.mouth.updateShape({ openness: 0, mood: 0.3 }, { duration: 150 });
        }
    } else {
        // Fallback: play the wrong word's audio
        await playOptionWordAndWait(option.word, optionIndex);
    }

    // De-emphasize the wrong selection before replaying target
    decharacterize(optionIndex);
    updateSelection(null);

    await delay(200);

    // Replay target word
    await playTargetWordAndWait();

    // Unlock — no auto-selection, learner chooses next attempt
    isLocked.value = false;
}



function moveToNextEnabled(): void {
    const options = displayOptions.value;
    if (selectedIndex.value === null) {
        // Find first enabled
        for (let i = 0; i < options.length; i++) {
            if (!options[i].disabled) {
                updateSelection(i);
                return;
            }
        }
    } else {
        let index = selectedIndex.value;
        for (let i = 0; i < options.length; i++) {
            index = (index + 1) % options.length;
            if (!options[index].disabled) {
                updateSelection(index);
                return;
            }
        }
    }
}

// Get lightened background color for option card
function getOptionBgColor(option: DisplayOption): string {
    if (!option.color) return "transparent";
    const oklch = colorToOklch(option.color);
    if (!oklch) return "transparent";
    // Increase lightness and decrease chroma for a pastel background tint
    let adjusted = adjustLightness(oklch, 0.25);
    adjusted = adjustChroma(adjusted, -0.12);
    return oklchToRgbString(adjusted);
}

/**
 * Navigate to previous enabled option.
 * If no selection, starts from center.
 */
function navigatePrevious(): void {
    const options = displayOptions.value;

    let startIndex: number;
    if (selectedIndex.value === null) {
        // Target the middle for odd lists, left-of-center for even.
        // Back up one so the loop's first decrement lands on target.
        const target = Math.floor((options.length - 1) / 2);
        startIndex = (target + 1) % options.length;
    } else {
        startIndex = selectedIndex.value;
    }

    let index = startIndex;
    for (let i = 0; i < options.length; i++) {
        index = (index - 1 + options.length) % options.length;
        if (!options[index].disabled) {
            updateSelection(index);
            return;
        }
    }
}

/**
 * Navigate to next enabled option.
 * If no selection, starts from center.
 */
function navigateNext(): void {
    const options = displayOptions.value;

    let startIndex: number;
    if (selectedIndex.value === null) {
        // Target the middle for odd lists, right-of-center for even.
        // Back up one so the loop's first increment lands on target.
        const target = Math.floor(options.length / 2);
        startIndex = (target - 1 + options.length) % options.length;
    } else {
        startIndex = selectedIndex.value;
    }

    let index = startIndex;
    for (let i = 0; i < options.length; i++) {
        index = (index + 1) % options.length;
        if (!options[index].disabled) {
            updateSelection(index);
            return;
        }
    }
}


// ============================================================================
// Differentiating Phoneme Autoplay
// ============================================================================

/**
 * If all distractors differ from the target at the same phoneme index,
 * returns that index. Returns null if ambiguous (multiple diff points)
 * or phonetic data is unavailable for any option.
 */
function findUnambiguousDpIndex(): number | null {
    const q = question.value;
    if (!q) return null;

    const distractors = displayOptions.value.filter((o) => !o.isCorrect);
    if (distractors.length === 0) return null;

    const indices = distractors.map((d) => findPhoneticDifference(q.target, d.word));
    if (indices.some((i) => i === null)) return null;

    const first = indices[0]!;
    if (indices.some((i) => i !== first)) return null;

    return first;
}


function playAudioUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
    });
}

/**
 * Enhanced initial autoplay when modifyDifficulty < 0 and there is a single
 * unambiguous differentiating phoneme across all options.
 *
 * onset/core: dp → word → dp
 * coda:       word → dp → dp
 *
 * Falls back to plain target word playback if conditions aren't met.
 */
async function playInitialAudio(): Promise<void> {
    const dpIndex = findUnambiguousDpIndex();
    if (dpIndex === null) {
        await playTargetWordAndWait();
        return;
    }

    const targetPhonetics = getPhonetics(question.value!.target);
    if (!targetPhonetics) {
        await playTargetWordAndWait();
        return;
    }

    const dpPhoneme = targetPhonetics.phonemes[dpIndex];
    const dpUrl = getPhonemeAudioUrl(dpPhoneme);
    if (!dpUrl) {
        await playTargetWordAndWait();
        return;
    }

    if (props.modifyDifficulty >= 0 && !introModeState.isActive(dpPhoneme)) {
        await playTargetWordAndWait();
        return;
    }

    await playTargetWordAndWait();
    await delay(300);
    await playAudioUrl(dpUrl);
}

// ============================================================================
// Physical Keyboard Handling (for arrows not in keyboard context)
// ============================================================================

function handleKeyDown(e: KeyboardEvent): void {
    if (isLocked.value) return;

    // In preview (e.g. landing-page embeds), don't capture Up/Down — let the
    // page scroll normally instead of hijacking arrow keys for navigation.
    if (props.preview && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

    switch (e.key) {
        case "ArrowUp":
            e.preventDefault();
            navigatePrevious();
            showSubmitButton.value = true;
            break;
        case "ArrowDown":
            e.preventDefault();
            navigateNext();
            showSubmitButton.value = true;
            break;
        case "Enter":
            // Handle Enter key for submission (both physical and via fallback)
            e.preventDefault();
            submitAnswer();
            break;
    }

    // Handle number keys directly (for physical keyboard without context)
    if (!keyboard && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        if (index < displayOptions.value.length) {
            const option = displayOptions.value[index];
            if (!option.disabled) {
                if (selectedIndex.value === index) {
                    submitAnswer();
                } else {
                    updateSelection(index);
                    showSubmitButton.value = true;
                }
            }
        }
        e.preventDefault();
    }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    console.log(`[WordSelectionView] onMounted, modifyDifficulty: ${props.modifyDifficulty}`);
    // Initialize question via framework pipeline
    questionUtils.question.value = new WordSelection(props.data);

    // Get options scaled by difficulty and assign procedural colors
    const options = questionUtils.question.value.buildOptions(props.modifyDifficulty);
    const colors = generateVibrancyRainbow(
        options.length,
        0.7,
        0.15,
        Math.random() * 360,
    );

    displayOptions.value = options.map((opt, i) => ({
        ...opt,
        color: colors[i],
    }));

    // Must run before the options paint for the first time — see the
    // "Fit to available space" section.
    wordHeight.value = chooseWordHeight(displayOptions.value.map((o) => o.word));
    nextTick(() => {
        requestAnimationFrame(() => {
            applyFit();
            startFitObserver();
        });
    });

    // Configure keyboard context if available
    if (keyboard) {
        // Build number keys array (1 to N)
        const numberKeys = displayOptions.value.map((_, i) => String(i + 1));

        // Build color map for keyboard keys
        const keyColors: Record<string, string> = {};
        displayOptions.value.forEach((option, i) => {
            if (option.color) {
                const oklch = colorToOklch(option.color);
                if (oklch) {
                    const darkened = adjustLightness(oklch, -0.1);
                    keyColors[String(i + 1)] = oklchToRgbString(darkened);
                } else {
                    keyColors[String(i + 1)] = option.color;
                }
            }
        });

        keyboard.requestConfig({
            letters: [
                ...numberKeys,
                "arrowleft",
                "arrowright",
                "space",
                "enter",
            ],
            overrideBase: true,
            showFullLayout: false,
            enabledLetters: [
                ...numberKeys.filter((_, i) => !disabledOptions.value.has(i)),
                "arrowleft",
                "arrowright",
                "space",
                // Enter key is only enabled when there's a selection
            ],
            keyColors: {
                ...keyColors,
                enter: SUBMIT_KEY_COLOR, // Primary orange
            },
            showAdvance: true,
            advanceColor: "#4caf50", // Green for "hear again"
            advanceText: "mdi-volume-high",
            disabled: isLocked.value,
        });

        // Listen to keyboard context tap events
        const unsubTap = keyboard.onKeyTap((event) => {
            if (isLocked.value) return;

            const key = event.letter.toLowerCase();

            // Check if it's a number key
            const keyNum = parseInt(key, 10);
            if (
                !isNaN(keyNum) &&
                keyNum >= 1 &&
                keyNum <= displayOptions.value.length
            ) {
                const index = keyNum - 1;
                const option = displayOptions.value[index];

                if (!option.disabled) {
                    if (event.source === "mouse" || event.source === "touch") {
                        // Visual keyboard: submit if already selected, otherwise select
                        if (selectedIndex.value === index) {
                            submitAnswer();
                        } else {
                            updateSelection(index);
                            showSubmitButton.value = false;
                        }
                    } else {
                        // Physical keyboard: select and show submit button
                        updateSelection(index);
                        showSubmitButton.value = true;
                    }
                }
            }
        });
        keyboardUnsubscribers.push(unsubTap);

        // Listen to keyboard hover events
        const unsubHover = keyboard.onKeyHover((event) => {
            if (isLocked.value) return;

            const key = event.letter.toLowerCase();
            const keyNum = parseInt(key, 10);

            if (
                !isNaN(keyNum) &&
                keyNum >= 1 &&
                keyNum <= displayOptions.value.length
            ) {
                const index = keyNum - 1;
                if (!displayOptions.value[index].disabled) {
                    updateSelection(index);
                    showSubmitButton.value = false;
                }
            }
        });
        keyboardUnsubscribers.push(unsubHover);

        // Listen to keyboard hover-end events
        const unsubHoverEnd = keyboard.onKeyHoverEnd(() => {
            if (isLocked.value) return;
            updateSelection(null);
        });
        keyboardUnsubscribers.push(unsubHoverEnd);

        // Listen to arrow key events for navigation
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

        // Spacebar "hear again" is handled by PlaySoundButton's own
        // onAdvance subscription, which emits 'play' → playTargetWord().
        // No duplicate subscription needed here.

        // Listen to enter key for submit
        const unsubEnter = keyboard.onEnter(() => {
            if (isLocked.value) return;
            submitAnswer();
        });
        keyboardUnsubscribers.push(unsubEnter);
    }

    // Add window keyboard listener for arrow up/down and fallback handling
    window.addEventListener("keydown", handleKeyDown);

    // Play initial audio after short delay (enhanced when modifyDifficulty < 0).
    // Skipped in preview/demo mode — audio plays only on explicit tap.
    if (!props.preview) {
        setTimeout(() => {
            playInitialAudio();
        }, 500);
    }
});

onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
    stopFitObserver();

    // Clean up keyboard event subscriptions
    keyboardUnsubscribers.forEach((unsub) => unsub());
});

// Watch for disabled options changes to update keyboard
watch(
    disabledOptions,
    (newDisabled) => {
        if (keyboard) {
            const numberKeys = displayOptions.value.map((_, i) =>
                String(i + 1),
            );
            const enabledLetters = [
                ...numberKeys.filter((_, i) => !newDisabled.has(i)),
                "arrowleft",
                "arrowright",
                "space",
            ];

            // Conditionally enable enter key based on showSubmitButton
            if (showSubmitButton.value && selectedIndex.value !== null) {
                enabledLetters.push("enter");
            }

            // Rebuild color map
            const keyColors: Record<string, string> = {
                enter: SUBMIT_KEY_COLOR,
            };
            displayOptions.value.forEach((option, i) => {
                if (option.color) {
                    const oklch = colorToOklch(option.color);
                    if (oklch) {
                        const darkened = adjustLightness(oklch, -0.1);
                        keyColors[String(i + 1)] = oklchToRgbString(darkened);
                    } else {
                        keyColors[String(i + 1)] = option.color;
                    }
                }
            });

            keyboard.updateConfig({
                enabledLetters,
                keyColors,
            });
        }
    },
    { deep: true },
);

// Watch for showSubmitButton and selectedIndex changes to enable/disable enter key
watch([showSubmitButton, selectedIndex], ([shouldShowSubmit, selIdx]) => {
    if (keyboard) {
        const numberKeys = displayOptions.value.map((_, i) => String(i + 1));
        const enabledLetters = [
            ...numberKeys.filter((_, i) => !disabledOptions.value.has(i)),
            "arrowleft",
            "arrowright",
            "space",
        ];

        // Enable enter key only when submit button is shown AND there's a selection
        if (shouldShowSubmit && selIdx !== null) {
            enabledLetters.push("enter");
        }

        keyboard.updateConfig({
            enabledLetters,
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

// Expose questionUtils properties so the framework's isQuestionView() check passes
// and StudySession can read maxAttemptsPerView / maxSessionViews for retry logic.
defineExpose({
    submitAnswer: questionUtils.submitAnswer,
    priorAttempts: questionUtils.priorAttempts,
    priorAnswers: questionUtils.priorAnswers,
    maxAttemptsPerView: questionUtils.maxAttemptsPerView,
    maxSessionViews: questionUtils.maxSessionViews,
});
</script>

<style scoped>
.word-selection {
    --ws-bg: #fafafa;
    --ws-primary: #2196f3;
    --ws-success: #4caf50;
    --ws-error: #f44336;
    --ws-warning: #ff9800;
    --ws-text: #333;

    /* Query container so the compact sizing below responds to the available
       width here (e.g. the narrow landing-page phone frame), not just the
       viewport. In-app the container is wide, so nothing changes. */
    container: ws-q / inline-size;
    width: 100%;
    text-align: center;
}

/* Padding lives here, not on .word-selection: an element is not matched by its
   own container query, so anything the compact rules below need to shrink has
   to sit inside the container. */
.ws-body {
    padding: 24px 32px;
}

/* Header */
.ws-header {
    margin-bottom: 24px;
}

/* Title: shared across the four question views (1.5rem; 1.1rem when the
   question is ≤600px wide). Keep in step with the others. */
.ws-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--ws-text);
    margin: 0;
}

/* Audio controls */
.ws-audio-controls {
    margin-bottom: 32px;
}

/* Options */
.ws-options-fit {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    /* Selected options scale to 1.2 — never clip that. */
    overflow: visible;
}

.ws-options {
    /* --ws-option-pad-* are read back by readOptionsMetrics(); keep them as the
       single source of truth for .ws-option's padding. */
    --ws-option-pad-x: 20px;
    --ws-option-pad-y: 16px;

    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 16px;
    width: 100%;
    transform-origin: center center;
}

.ws-option {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ws-option-pad-y) var(--ws-option-pad-x);
    background: var(--option-bg-color, white);
    border: none;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    width: auto; /* Fit content */
    scale: 1; /* Use scale property for better composition with transform animations */
}

.ws-option:hover:not(:disabled),
.ws-option--selected {
    scale: 1.2;
    /* Higher elevation on selection - using vuetify-style elevation-8 values */
    box-shadow:
        0 5px 5px -3px rgba(0, 0, 0, 0.2),
        0 8px 10px 1px rgba(0, 0, 0, 0.14),
        0 3px 14px 2px rgba(0, 0, 0, 0.12);
    z-index: 10;
}

.ws-option--disabled {
    cursor: not-allowed;
}

/* Only apply disabled styling (fade/shrink) if NOT selected */
/* This ensures incorrect answers stay highlighted/scaled during feedback */
.ws-option--disabled:not(.ws-option--selected) {
    opacity: 0.4;
    scale: 1 !important;
    box-shadow: none !important;
}

.ws-option--correct {
    animation: celebrate 0.5s ease;
}

.ws-option--incorrect {
    animation: shake 0.4s ease;
}

.ws-option--speaking {
    animation: speak-pulse 0.4s ease infinite;
}

.ws-word-container {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible; /* Allow letters to render fully */
}



/* Animations */
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

@keyframes speak-pulse {
    0%,
    100% {
        scale: 1.2;
    }
    50% {
        scale: 1.237;
    }
}

/* Responsive — keyed to the question's container width (see container above).
   Trimming chrome here is load-bearing, not cosmetic: at the desktop values the
   header + play button + submit gutter eat ~300px, which on a phone leaves
   almost nothing for the options themselves. */
@container ws-q (max-width: 600px) {
    .ws-body {
        padding: 12px 8px 0;
    }

    .ws-header {
        margin-bottom: 8px;
    }

    .ws-title {
        font-size: 1.1rem;
        margin-bottom: 0;
    }

    .ws-audio-controls {
        margin-bottom: 12px;
    }

    .ws-audio-controls :deep(.play-sound-btn) {
        padding: 10px 24px;
    }

    .ws-options-fit {
        margin-bottom: 8px;
    }

    .ws-options {
        --ws-option-pad-x: 10px;
        --ws-option-pad-y: 8px;

        gap: 10px;
    }

    /* The submit button only ever appears for physical-keyboard navigation, so
       on a touch-sized viewport its reserved gutter is pure dead space. */
    :deep(.submit-area) {
        min-height: 0;
        margin-bottom: 0;
    }
}
</style>
