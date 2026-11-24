<!--
  SplitDigraphIntroView.vue — Introductory view for split-digraph (magic-e) GPCs

  The learner meets a two-character display:
    - Active vowel (e.g., 'a'): full character — speaks the long vowel, waves
    - Silent 'e': eyes open, mouth closed, gazing at the active vowel

  Adapted from DigraphGpcIntroView.vue. Key differences:
  - Displays vowel + 'e' as a two-character unit (e.g., "ae", "ie")
  - Silent 'e' is closed-mouthed but looking at the active vowel via eyes.lookAt()
  - No onset/coda distinction — all words share the same structural pattern
  - PhoneticChunks mark both the medial vowel AND the final silent 'e'
-->

<template>
    <div class="gpc-intro">
        <!-- Letter Section: show the vowel + silent 'e' pair -->
        <Transition name="letter-slide">
            <div v-if="letterSectionVisible" class="gpc-letter-section">
                <div
                    class="gpc-letter-container"
                    :class="{ 'gpc-letter-container--celebrating': isCelebrating }"
                    :style="{ '--card-bg': keycapBgColor }"
                >
                    <WordDisplay
                        ref="letterDisplayRef"
                        :text="displayText"
                        :height="letterHeight"
                        :options="letterDisplayOptions"
                        :preserve-on-unmount="true"
                        @word-created="onLetterWordCreated"
                    />
                </div>
                <PlaySoundButton
                    v-if="phase === 'letter-meet' && !wordPhasesStarted"
                    :is-playing="isPlayingPhoneme"
                    :listen-to-advance="false"
                    @play="handlePlayButtonPress"
                />
            </div>
        </Transition>

        <!-- Word Section: show exemplar words with highlighted split digraph -->
        <Transition name="word-section" @after-enter="onWordEntered">
            <div v-if="inWordPhase" class="gpc-word-section">
                <TransitionGroup name="word-swap" @after-enter="onWordEntered">
                    <div
                        v-for="card in visibleWordCards"
                        :key="card.key"
                        class="gpc-word-card"
                        :style="{ '--card-bg': card.bgColor }"
                    >
                        <PhoneticWord
                            :ref="(el) => { if (el) currentWordRef = el as any }"
                            :word="card.word"
                            :phonetic-chunks="card.chunks"
                            :height="wordHeight"
                            :options="card.options"
                            :underline-next-chunk="true"
                            :underline-color="card.color"
                            :include-whole-word-step="false"
                            :preserve-on-unmount="true"
                        />
                    </div>
                </TransitionGroup>
            </div>
        </Transition>

        <!-- Hidden audio element for phoneme playback -->
        <audio ref="phonemeAudioEl" preload="auto" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SplitDigraphIntroView' });

import {
    ref,
    computed,
    onMounted,
    onUnmounted,
    watch,
    nextTick,
    type PropType,
} from 'vue';
import { ViewData } from '@vue-skuilder/common';
import type { ReplanOptions } from '@vue-skuilder/db';
import { useViewable, useQuestionView } from '@vue-skuilder/courseware';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';
import type { Unsubscribe } from '../composables/keyboardContext.types';
import { SplitDigraphIntro, PHASE1_PRESS_COUNT } from './SplitDigraphIntro';
import { recordGpcIntroComplete } from '../services/userState';
import { introModeState } from '../services/introModeState';
import { buildIntroReplanRequest } from '../services/sessionManagement';
import WordDisplay from '../letterpeople/vue/WordDisplay.vue';
import PhoneticWord from '../letterpeople/vue/PhoneticWord.vue';
import PlaySoundButton from '../components/PlaySoundButton.vue';
import type { PhoneticChunk } from '../letterpeople/vue/PhoneticWord.vue';
import type { Word } from '../letterpeople/Word';
import {
    gpcExerciseTag,
    whoSaidThatCardId,
} from '@/services/tags';
import { getPhonemeAudioUrl, type ArpabetPhoneme } from '../services/phonetics';
import {
    characterize,
    celebrate,
} from '../letterpeople/animations';
import {
    colorToOklch,
    adjustLightness,
    adjustChroma,
    oklchToRgbString,
} from '../letterpeople/util/color';

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
});

const emit = defineEmits<{
    (e: 'emitResponse', ...args: any[]): void;
    (e: 'request-replan', options?: ReplanOptions): void;
    (e: 'ready-to-advance'): void;
}>();

// ============================================================================
// Framework Wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'SplitDigraphIntroView');
const questionUtils = useQuestionView<SplitDigraphIntro>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();
const keyboardUnsubscribers: Unsubscribe[] = [];

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);

type IntroPhase = 'letter-meet' | 'words' | 'complete';
const phase = ref<IntroPhase>('letter-meet');

// Letter section slide
const letterSectionVisible = ref(false);
const LETTER_SLIDE_OUT_MS = 400;
const LETTER_SLIDE_IN_MS = 500;

// Phase 1
const wordPhasesStarted = ref(false);
const isCelebrating = ref(false);
const phase1PressCount = ref(0);
const isPlayingPhoneme = ref(false);
const letterDisplayRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const letterWordInstance = ref<Word | null>(null);
const phonemeAudioEl = ref<HTMLAudioElement | null>(null);

// Word phase index
const wordIndex = ref(0);

// Active PhoneticWord ref
const currentWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);

// Word-swap transition readiness (resolved by @after-enter)
let resolveWordReady: (() => void) | null = null;

// Layout
const letterHeight = 380;
const wordHeight = 200;

// ============================================================================
// Computed: Display text — vowel + 'e' (e.g., "ae", "ie", "oe", "ee", "ue")
// ============================================================================

const displayText = computed(() => {
    const q = question.value;
    if (!q) return 'a_e';
    return q.vowel + '_e';
});

// ============================================================================
// Computed: Question data
// ============================================================================

const MAX_EXEMPLAR_WORDS = 3;

const exemplarWords = computed(() =>
    question.value?.words.slice(0, MAX_EXEMPLAR_WORDS) ?? []);

const currentWord = computed(() => exemplarWords.value[wordIndex.value] ?? '');

const currentWordColor = computed(() => {
    const q = question.value;
    if (!q) return '#1976d2';
    return q.wordColors[wordIndex.value] ?? '#1976d2';
});

// ============================================================================
// Computed: Word phase
// ============================================================================

const inWordPhase = computed(() => phase.value === 'words');

const currentWordKey = computed(() => `word-${wordIndex.value}`);

// ============================================================================
// Computed: Card background
// ============================================================================

const wordCardBgColor = computed(() => {
    const oklch = colorToOklch(currentWordColor.value);
    if (!oklch) return 'transparent';
    return oklchToRgbString(adjustChroma(adjustLightness(oklch, 0.25), -0.12));
});

const keycapBgColor = computed(() => {
    const color = question.value?.letterColor ?? '#1976d2';
    const oklch = colorToOklch(color);
    if (!oklch) return 'transparent';
    return oklchToRgbString(adjustChroma(adjustLightness(oklch, 0.28), -0.10));
});

// ============================================================================
// Computed: Display options
// ============================================================================

const letterDisplayOptions = computed(() => ({
    spacing: 10,
    letterOptions: {
        color: question.value?.letterColor ?? '#aaccee',
        lineWidth: 20,
        borderWidth: 4,
        showEyes: true,
        showMouth: true,
        showArms: true,
        eyebrowsWithEyes: true,
    },
}));

const currentWordOptions = computed(() => ({
    spacing: 10,
    letterOptions: {
        color: currentWordColor.value,
        lineWidth: 22,
        borderWidth: 4,
        showEyes: false,
        showMouth: false,
        showArms: false,
    },
}));

// ============================================================================
// Computed: Phonetic chunks
// ============================================================================

/**
 * Build a phonetic chunk for a split-digraph word.
 * Marks both the active vowel position and the silent 'e' position as 'speak',
 * so both are underlined/highlighted together during playback.
 */
function buildTargetChunks(
    word: string,
    vowelIndex: number,
    silentEIndex: number,
    targetPhoneme: ArpabetPhoneme
): PhoneticChunk[] {
    return [{
        letters: {
            [vowelIndex]: 'speak',
            [silentEIndex]: 'speak',
        },
        phoneme: targetPhoneme,
        label: word[vowelIndex] + '_e',
    }];
}

const currentChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(
        word,
        q.getVowelIndex(word),
        q.getSilentEIndex(word),
        q.phoneme
    );
});

// ============================================================================
// State for stabilizing word cards during transitions
// ============================================================================

const visibleWordCards = ref<Array<{
    key: string;
    word: string;
    chunks: PhoneticChunk[];
    color: string;
    bgColor: string;
    options: any;
}>>([]);

watch(
    [currentWordKey, currentWord, currentChunks, currentWordColor, wordCardBgColor, currentWordOptions, inWordPhase],
    () => {
        if (inWordPhase.value && currentWord.value) {
            const newData = {
                key: currentWordKey.value,
                word: currentWord.value,
                chunks: [...currentChunks.value],
                color: currentWordColor.value,
                bgColor: wordCardBgColor.value,
                options: { ...currentWordOptions.value },
            };

            if (visibleWordCards.value.length === 0 || visibleWordCards.value[0].key !== newData.key) {
                visibleWordCards.value = [newData];
            } else {
                visibleWordCards.value[0] = newData;
            }
        } else if (!inWordPhase.value) {
            visibleWordCards.value = [];
        }
    },
    { immediate: true },
);

// ============================================================================
// Phase 1: Letter Meet
// ============================================================================

function onLetterWordCreated(word: Word): void {
    letterWordInstance.value = word;

    const vowelLetter = word.getLetter(0); // active vowel — speaks the long sound
    const underscore = word.getLetter(1);  // blank underline
    const eLetter = word.getLetter(2);     // silent 'e' — watches the vowel

    // Hide underscore's features immediately
    if (underscore) {
        underscore.eyes.hide({ duration: 0 });
        underscore.mouth.hide({ duration: 0 });
        underscore.arms.hide({ duration: 0 });
    }

    // Characterize the active vowel fully: smile, wave, track cursor
    if (vowelLetter) {
        characterize(vowelLetter, {
            duration: 400,
            showEyes: true,
            showMouth: true,
            showBrows: true,
            startTracking: true,
        });

        delay(400).then(async () => {
            await Promise.all([
                vowelLetter.eyes.brows?.express('happy', { duration: 350 }),
                vowelLetter.mouth.updateShape({ openness: 0.2, mood: 0.88 }, { duration: 350 }),
            ]);
            vowelLetter.arms.wave({ duration: 900 });
        });
    }

    // Characterize the silent 'e': face appears slightly later, mouth stays closed,
    // eyes gaze toward the active vowel
    if (eLetter) {
        characterize(eLetter, {
            duration: 400,
            showEyes: true,
            showMouth: true,
            showBrows: true,
            startTracking: false, // 'e' watches the vowel, not the cursor
        });

        delay(500).then(async () => {
            // Mouth closed — 'e' is silent
            eLetter.mouth.updateShape({ openness: 0, mood: 0.65 }, { duration: 300 });
            // Gentle curious brows
            eLetter.eyes.brows?.express('happy', { duration: 350 });
            // Look toward the active vowel
            if (vowelLetter) {
                const vowelCenter = vowelLetter.getCenter();
                eLetter.eyes.lookAt({ x: vowelCenter.x, y: vowelCenter.y });
            }
        });
    }
}

async function playPhonemeOnce(): Promise<void> {
    if (isPlayingPhoneme.value) return;
    const q = question.value;
    if (!q) return;

    isPlayingPhoneme.value = true;

    const audioUrl = getPhonemeAudioUrl(q.phoneme);

    const audioPromise = new Promise<void>((resolve) => {
        const el = phonemeAudioEl.value;
        if (!el) { resolve(); return; }

        el.src = audioUrl;

        const cleanup = () => {
            el.removeEventListener('ended', cleanup);
            el.removeEventListener('error', cleanup);
            resolve();
        };

        el.addEventListener('ended', cleanup);
        el.addEventListener('error', cleanup);
        el.play().catch(() => resolve());
    });

    // Only the active vowel speaks; the silent 'e' stays closed-mouthed
    const vowelLetter = letterWordInstance.value?.getLetter(0);
    if (vowelLetter?.mouth) {
        vowelLetter.mouth.animateSpeak({ duration: 400, openness: 0.8, mood: 0.3 });
    }

    await audioPromise;
    isPlayingPhoneme.value = false;
}

function handlePlayButtonPress(): void {
    if (phase.value === 'letter-meet') {
        handlePhase1Spacebar();
    } else {
        playPhonemeOnce();
    }
}

async function handlePhase1Spacebar(): Promise<void> {
    if (phase.value !== 'letter-meet') return;
    if (wordPhasesStarted.value) return;
    if (isPlayingPhoneme.value) return;

    await playPhonemeOnce();
    phase1PressCount.value++;

    if (phase1PressCount.value >= PHASE1_PRESS_COUNT) {
        await autoRunWordPhases();
    }
}

// ============================================================================
// Phase 2: Word phases (fully automatic)
// ============================================================================

async function slideLetterOut(): Promise<void> {
    letterSectionVisible.value = false;
    await delay(LETTER_SLIDE_OUT_MS);
}

async function slideLetterIn(): Promise<void> {
    letterSectionVisible.value = true;
    await nextTick();
    await delay(LETTER_SLIDE_IN_MS);
}

/**
 * Called by the word-swap <Transition> @after-enter hook.
 * Resolves the promise that playCurrentWord is awaiting.
 */
function onWordEntered(): void {
    resolveWordReady?.();
    resolveWordReady = null;
}

/**
 * Wait for the current word's enter transition to complete, then auto-play.
 * Plays whole word first, then the split-digraph chunk.
 */
async function playCurrentWord(): Promise<void> {
    const ready = new Promise<void>(resolve => { resolveWordReady = resolve; });
    await nextTick();
    await ready;

    const pw = currentWordRef.value;
    if (!pw) return;

    await pw.playWord();
    await delay(250);
    await pw.playChunk(0);
}

/**
 * Run all exemplar words automatically: slide character pair out, play words
 * with cross-fade transitions, slide pair back in, celebrate.
 */
async function autoRunWordPhases(): Promise<void> {
    wordPhasesStarted.value = true;

    const q = question.value;
    if (q) {
        await recordGpcIntroComplete(q.vowel + '_e');
        introModeState.set(q.phoneme);
        questionUtils.submitAnswer('complete', undefined, { deferAdvance: true });
        // Completion replan — see buildIntroReplanRequest for the hint-shape rationale.
        emit('request-replan', buildIntroReplanRequest({
            label: `split-digraph-intro-${q.vowel}_e-complete`,
            practiceTag: gpcExerciseTag(q.gpcId),
            followUpCards: [whoSaidThatCardId(q.gpcId)],
        }));
    }

    await slideLetterOut();

    const words = exemplarWords.value;
    for (let wi = 0; wi < words.length; wi++) {
        wordIndex.value = wi;
        phase.value = 'words';

        await playCurrentWord();

        if (wi < words.length - 1) {
            await delay(400);
        }
    }

    // Clear word area, bring the character pair back
    phase.value = 'letter-meet';
    await delay(350);
    isCelebrating.value = true;
    await slideLetterIn();

    // Reveal keyboard sequentially — show the vowel key first, wait for press
    // (which celebrates the vowel character), then reveal the 'e' key, wait
    // for press (which celebrates the silent 'e'). Each press triggers its
    // own letter's celebration so the learner gets per-key feedback.
    //
    // For e_e (vowel === 'e'), there's only one key to press; only the vowel
    // character (at index 0) celebrates on press — the silent 'e' at index 2
    // stays quiet (only one keycap was pressed).
    //
    // keychars: which key letters to walk through, in order.
    // letterIndices: corresponding indices into letterWordInstance for each
    //                press — vowel is at index 0, silent 'e' is at index 2,
    //                with the underscore at index 1.
    const keychars = q && q.vowel !== 'e' ? [q.vowel, 'e'] : (q ? [q.vowel] : []);
    const letterIndices = q && q.vowel !== 'e' ? [0, 2] : [0];

    await waitForKeycapSequence(keychars, letterIndices, q?.letterColor ?? '#1976d2');

    keyboard?.clearAllHighlights();

    await completeIntro();
}

/**
 * Walk the learner through each target key one at a time. For each step:
 *   - Reveal and highlight the target key (the first key is revealed before
 *     the loop awaits its press; subsequent keys are revealed after the
 *     previous press resolves)
 *   - Wait for the correct key press
 *   - Fire the corresponding letter's celebration (fire-and-forget so the
 *     next reveal isn't blocked by the celebration animation)
 *   - Disable and unhighlight the just-pressed key
 *
 * `letterIndices[i]` is the index into `letterWordInstance` for the letter
 * that should celebrate when `targetLetters[i]` is pressed. Caller passes
 * [0, 2] for typical vowel + silent-e (with underscore at index 1), or [0]
 * for the e_e case where only one keycap is shown.
 */
async function waitForKeycapSequence(
    targetLetters: string[],
    letterIndices: number[],
    highlightColor: string,
): Promise<void> {
    if (!keyboard || targetLetters.length === 0) return;
    const targets = targetLetters.map(l => l.toLowerCase());
    const wordInst = letterWordInstance.value;
    let lastCelebration: Promise<void> | undefined;

    // Reveal the first key
    const first = targets[0];
    keyboard.addBaseLetter(first);
    keyboard.requestConfig({
        letters: [...keyboard.baseLetters.value],
        overrideBase: true,
        enabledLetters: [first],
        showAdvance: false,
        showFullLayout: true,
        disabled: false,
        showArrows: false,
        keyColors: { [first]: highlightColor },
    });
    await nextTick();
    await delay(150);
    await keyboard.hintKey(first, 'pop', { duration: 500, scale: 2.0 });
    keyboard.setHighlight(first, highlightColor);

    for (let i = 0; i < targets.length; i++) {
        // Wait for the correct key press
        await new Promise<void>((resolve) => {
            const unsub = keyboard!.onKeyTap((event) => {
                if (event.letter.toLowerCase() !== targets[i]) return;
                unsub();
                resolve();
            });
            keyboardUnsubscribers.push(unsub);
        });

        // Celebrate the corresponding letter character. All but the last
        // press are fire-and-forget so the next reveal isn't blocked; the
        // last celebration is awaited below, before the caller proceeds to
        // teardown/dismissal.
        const letter = wordInst?.getLetter(letterIndices[i]);
        const celebration = letter ? celebrate(letter, { type: 'random' }) : undefined;
        if (i === targets.length - 1) {
            lastCelebration = celebration;
        }

        // Disable and unhighlight the just-pressed key
        keyboard!.clearHighlight(targets[i]);
        keyboard!.updateConfig({ enabledLetters: [] });

        // Reveal the next key if there is one
        if (i + 1 < targets.length) {
            const next = targets[i + 1];
            keyboard!.addBaseLetter(next);
            keyboard!.updateConfig({
                letters: [...keyboard!.baseLetters.value],
                enabledLetters: [next],
                keyColors: { [next]: highlightColor },
            });
            await nextTick();
            await delay(150);
            await keyboard!.hintKey(next, 'pop', { duration: 500, scale: 2.0 });
            keyboard!.setHighlight(next, highlightColor);
        }
    }

    await lastCelebration;
}

// ============================================================================
// Completion
// ============================================================================

async function completeIntro(): Promise<void> {
    phase.value = 'complete';
    if (keyboard) keyboard.clearQuestionConfig();
    emit('ready-to-advance');
}

// ============================================================================
// Keyboard Management
// ============================================================================

function configureKeyboard(): void {
    if (!keyboard) return;

    if (phase.value === 'complete') {
        keyboard.requestConfig({
            letters: [],
            overrideBase: true,
            enabledLetters: [],
            showAdvance: false,
            showArrows: false,
            showFullLayout: true,
            disabled: true,
        });
    } else {
        keyboard.requestConfig({
            letters: [],
            overrideBase: true,
            enabledLetters: [],
            showAdvance: !inWordPhase.value && !wordPhasesStarted.value,
            advanceColor: question.value?.letterColor ?? '#1976d2',
            advanceText: 'mdi-volume-high',
            showArrows: false,
            showFullLayout: true,
            disabled: inWordPhase.value,
        });
    }
}

function subscribeKeyboardEvents(): void {
    if (!keyboard) return;

    const unsubAdvance = keyboard.onAdvance(() => {
        if (phase.value === 'letter-meet') {
            handlePhase1Spacebar();
        }
    });
    keyboardUnsubscribers.push(unsubAdvance);
}

function unsubscribeKeyboardEvents(): void {
    keyboardUnsubscribers.forEach((unsub) => unsub());
    keyboardUnsubscribers.length = 0;
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
    questionUtils.question.value = new SplitDigraphIntro(props.data);
    configureKeyboard();
    subscribeKeyboardEvents();

    await nextTick();
    letterSectionVisible.value = true;
});

onUnmounted(() => {
    unsubscribeKeyboardEvents();
    if (keyboard) keyboard.clearQuestionConfig();
});

watch(phase, (newPhase) => {
    if (newPhase !== 'complete') configureKeyboard();
});

// ============================================================================
// Utility
// ============================================================================

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Expose for framework
// ============================================================================

defineExpose({
    submitAnswer: questionUtils.submitAnswer,
    priorAttempts: questionUtils.priorAttempts,
    priorAnswers: questionUtils.priorAnswers,
    maxAttemptsPerView: questionUtils.maxAttemptsPerView,
    maxSessionViews: questionUtils.maxSessionViews,
});
</script>

<style scoped>
.gpc-intro {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 24px;
    width: 100%;
    min-height: 100%;
    gap: 12px;
    overflow-x: hidden;
}

/* Letter slide transition */
.letter-slide-enter-active {
    animation: slideInRight 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.letter-slide-leave-active {
    animation: slideOutLeft 400ms cubic-bezier(0.4, 0, 0.7, 0.2) both;
}

/* Letter section */
.gpc-letter-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex: 1;
    width: 100%;
    z-index: 1;
}

.gpc-letter-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 340px;
    position: relative;
    border-radius: 16px;
    overflow: visible;
    transition: background-color 0.5s ease, box-shadow 0.5s ease, padding 0.5s ease, width 0.5s ease;
}

.gpc-letter-container--celebrating {
    background-color: var(--card-bg, #f0f0f0);
    padding: 16px 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.10);
    width: fit-content;
    max-width: 90vw;
    flex: 0 0 auto;
    margin: 24px 0;
}

/* Word section */
.gpc-word-section {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    max-width: 800px;
}

.gpc-word-card {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    width: 100%;
    padding: 16px 24px;
    border-radius: 16px;
    background-color: var(--card-bg, #f5f5f5);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Word section enter/exit */
.word-section-enter-active {
    animation: slideInRight 350ms ease-out both;
}
.word-section-leave-active {
    animation: slideOutLeft 300ms ease-in both;
    pointer-events: none;
}

/* Word card slide in/out between words */
.word-swap-enter-active {
    animation: slideInRight 350ms ease-out both;
}
.word-swap-leave-active {
    animation: slideOutLeft 300ms ease-in both;
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    translate: 0 -50%;
    pointer-events: none;
}

@keyframes slideInRight {
    from {
        transform: translateX(110%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutLeft {
    0% {
        transform: translateX(0);
        opacity: 1;
    }
    70% {
        transform: translateX(-80%);
        opacity: 1;
    }
    100% {
        transform: translateX(-110%);
        opacity: 0;
    }
}

@media (max-width: 600px) {
    .gpc-intro {
        padding: 16px;
    }
    .gpc-letter-container {
        min-height: 240px;
    }
}
</style>
