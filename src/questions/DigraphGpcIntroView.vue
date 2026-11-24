<!--
  DigraphGpcIntroView.vue — Introductory view for digraph GPCs (sh, ch, th, etc.)

  Adapted from GpcIntroView.vue. Key differences:
  - Works with multi-character graphemes (2-3 chars)
  - No medial/core word phase (digraphs rarely have useful medial exemplars at intro stage)
  - Chunk highlighting spans multiple character indices
  - Keyboard reveal adds each component letter of the digraph
-->

<template>
    <div class="gpc-intro">
        <!-- Letter Section: show the digraph character(s) -->
        <Transition name="letter-slide">
            <div v-if="letterSectionVisible" class="gpc-letter-section">
                <div
                    class="gpc-letter-container"
                    :class="{ 'gpc-letter-container--celebrating': isCelebrating }"
                    :style="{ '--card-bg': keycapBgColor }"
                >
                    <!-- 3D letters (letters3d): sway and greet on the intro
                         frame; stand still on the final card. The section
                         unmounts between the two, so each frame gets its own. -->
                    <GpcLetter3D
                        v-if="use3d"
                        ref="letter3dRef"
                        :text="question?.grapheme ?? ''"
                        :color="question?.letterColor ?? '#aaccee'"
                        :sway="!isCelebrating"
                        :greet="!isCelebrating"
                        :height-px="340"
                        @unavailable="use3d = false"
                    />
                    <WordDisplay
                        v-else
                        ref="letterDisplayRef"
                        :text="question?.grapheme ?? ''"
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

        <!-- Word Section: show exemplar words with highlighted digraph -->
        <Transition name="word-section" @after-enter="onWordEntered">
            <div v-if="inWordPhase" class="gpc-word-section">
                <TransitionGroup name="word-swap" @after-enter="onWordEntered">
                    <div
                        v-for="card in visibleWordCards"
                        :key="card.key"
                        class="gpc-word-card"
                        :style="{
                            '--card-bg': card.bgColor,
                        }"
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
defineOptions({ name: 'DigraphGpcIntroView' });

import {
    ref,
    computed,
    onMounted,
    onUnmounted,
    watch,
    nextTick,
    defineAsyncComponent,
    type PropType,
} from 'vue';
import { ViewData } from '@vue-skuilder/common';
import type { ReplanOptions } from '@vue-skuilder/db';
import { useViewable, useQuestionView } from '@vue-skuilder/courseware';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';
import type { Unsubscribe } from '../composables/keyboardContext.types';
import { DigraphGpcIntro, PHASE1_PRESS_COUNT } from './DigraphGpcIntro';
import { recordGpcIntroComplete } from '../services/userState';
import { introModeState } from '../services/introModeState';
import { loadGpcLetter3D, mark3DFailed, use3DLetters } from '../services/letters3d';
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
import { getPhonemeAudioUrl, type PhonemeAudioKey } from '../services/phonetics';
import { getPhonetics } from '../services/phonetics';
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
    /**
     * Show the grapheme as 3D LetterPeople — swaying on the intro frame,
     * still on the final card, each letter celebrating its own keypress in
     * 3D. Defaults to the device's renderer (services/letters3d.ts). The
     * component (and three.js) load only when this is on.
     */
    letters3d: {
        type: Boolean,
        default: () => use3DLetters(),
    },
});

const GpcLetter3D = defineAsyncComponent(loadGpcLetter3D);
/** 3D this intro; drops to SVG if the 3D letter's chunk or stage fails. */
const use3d = ref(props.letters3d);
const letter3dRef = ref<{
    speak: (ms?: number) => void;
    celebrate: (index?: number) => Promise<void>;
} | null>(null);

const emit = defineEmits<{
    (e: 'emitResponse', ...args: any[]): void;
    (e: 'request-replan', options?: ReplanOptions): void;
    (e: 'ready-to-advance'): void;
}>();

// ============================================================================
// Framework Wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'DigraphGpcIntroView');
const questionUtils = useQuestionView<DigraphGpcIntro>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();
const keyboardUnsubscribers: Unsubscribe[] = [];

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);

type IntroPhase = 'letter-meet' | 'onset' | 'coda' | 'complete';
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

// Word phase indices
const onsetIndex = ref(0);
const codaIndex = ref(0);

// Active PhoneticWord ref
const currentWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);

// Word-swap transition readiness (resolved by @after-enter)
let resolveWordReady: (() => void) | null = null;

// Layout
const letterHeight = 380;
const wordHeight = 200;

// ============================================================================
// Computed: Question data
// ============================================================================

const introOnsetWords = computed(() => question.value?.onsetWords ?? []);
const introCodaWords = computed(() => question.value?.codaWords ?? []);

const currentOnsetWord = computed(() => introOnsetWords.value[onsetIndex.value] ?? '');
const currentCodaWord = computed(() => introCodaWords.value[codaIndex.value] ?? '');

/**
 * Build up to 3 exemplar words. Prefers onset-onset-coda when both are
 * available (2:1), falls back to onset-coda-coda (1:2), then pure onset
 * or pure coda (e.g. ck, ng which have no onset words).
 */
function buildExemplarList(): Array<{ phase: IntroPhase; index: number }> {
    const onset = introOnsetWords.value;
    const coda = introCodaWords.value;
    const MAX = 3;
    const result: Array<{ phase: IntroPhase; index: number }> = [];

    let onsetCount: number;
    let codaCount: number;

    if (onset.length === 0) {
        onsetCount = 0;
        codaCount = Math.min(coda.length, MAX);
    } else if (coda.length === 0) {
        onsetCount = Math.min(onset.length, MAX);
        codaCount = 0;
    } else {
        const total = Math.min(onset.length + coda.length, MAX);
        if (onset.length >= 2) {
            // onset-onset-coda
            onsetCount = Math.min(onset.length, 2);
            codaCount = Math.min(coda.length, total - onsetCount);
        } else {
            // onset-coda or onset-coda-coda
            onsetCount = 1;
            codaCount = Math.min(coda.length, total - 1);
        }
    }

    for (let i = 0; i < onsetCount; i++) result.push({ phase: 'onset', index: i });
    for (let i = 0; i < codaCount; i++) result.push({ phase: 'coda', index: i });
    return result;
}

const currentWordColor = computed(() => {
    const q = question.value;
    if (!q) return '#1976d2';
    if (phase.value === 'onset') return q.onsetColors[onsetIndex.value] ?? '#1976d2';
    if (phase.value === 'coda') return q.codaColors[codaIndex.value] ?? '#1976d2';
    return '#1976d2';
});

// ============================================================================
// Computed: Unified word-phase accessors
// ============================================================================

const inWordPhase = computed(() =>
    phase.value === 'onset' || phase.value === 'coda'
);

const currentWord = computed(() => {
    if (phase.value === 'onset') return currentOnsetWord.value;
    if (phase.value === 'coda') return currentCodaWord.value;
    return '';
});

const currentChunks = computed((): PhoneticChunk[] => {
    if (phase.value === 'onset') return currentOnsetChunks.value;
    if (phase.value === 'coda') return currentCodaChunks.value;
    return [];
});

const currentWordKey = computed(() => {
    if (phase.value === 'onset') return `onset-${onsetIndex.value}`;
    if (phase.value === 'coda') return `coda-${codaIndex.value}`;
    return 'none';
});

// ============================================================================
// Computed: Card background (pastel tint from word color)
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
 * Build a single phonetic chunk for the target digraph grapheme in a word.
 * Marks all character positions covered by the grapheme as 'speak'.
 */
function buildTargetChunks(word: string, startIndex: number, graphemeLength: number, targetPhoneme: PhonemeAudioKey): PhoneticChunk[] {
    const letters: Record<number, 'speak'> = {};
    for (let i = startIndex; i < startIndex + graphemeLength && i < word.length; i++) {
        letters[i] = 'speak';
    }
    return [{
        letters,
        phoneme: targetPhoneme,
        label: word.slice(startIndex, startIndex + graphemeLength),
    }];
}

const currentOnsetChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentOnsetWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(word, q.getOnsetGraphemeIndex(word), q.graphemeLength, q.phoneme);
});

const currentCodaChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentCodaWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(word, q.getCodaGraphemeIndex(word), q.graphemeLength, q.phoneme);
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

            // Replace the array to trigger keyed transition while keeping the item data stable
            if (visibleWordCards.value.length === 0 || visibleWordCards.value[0].key !== newData.key) {
                visibleWordCards.value = [newData];
            } else {
                // Update in place if key is same
                visibleWordCards.value[0] = newData;
            }
        } else if (!inWordPhase.value) {
            visibleWordCards.value = [];
        }
    },
    { immediate: true },
);

// ============================================================================
// Phase 1: Digraph Meet
// ============================================================================

function onLetterWordCreated(word: Word): void {
    letterWordInstance.value = word;

    // Characterize each letter in the digraph (e.g., both 's' and 'h')
    const graphemeLength = question.value?.graphemeLength ?? 2;
    for (let i = 0; i < graphemeLength; i++) {
        const letter = word.getLetter(i);
        if (letter) {
            characterize(letter, {
                duration: 400,
                showEyes: true,
                showMouth: true,
                showBrows: true,
                startTracking: true,
            });

            // After the face appears: smile and wave
            const letterRef = letter;
            delay(400 + i * 150).then(async () => {
                await Promise.all([
                    letterRef.eyes.brows?.express('happy', { duration: 350 }),
                    letterRef.mouth.updateShape({ openness: 0.2, mood: 0.88 }, { duration: 350 }),
                ]);
                letterRef.arms.wave({ duration: 900 });
            });
        }
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

    // Animate all letters in the digraph simultaneously
    if (use3d.value) letter3dRef.value?.speak(400);
    const graphemeLength = use3d.value ? 0 : (question.value?.graphemeLength ?? 2);
    for (let i = 0; i < graphemeLength; i++) {
        const letter = letterWordInstance.value?.getLetter(i);
        if (letter?.mouth) {
            letter.mouth.animateSpeak({ duration: 400, openness: 0.8, mood: 0.3 });
        }
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
// Phase 2–3: Word phases (fully automatic)
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
 * Plays [whole word, then phoneme chunk].
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
 * Run all exemplar words automatically: slide character out, play words
 * with cross-fade transitions, slide character back in, celebrate.
 */
async function autoRunWordPhases(): Promise<void> {
    wordPhasesStarted.value = true;

    // Submit + replan early so the planner works while the words play
    const q = question.value;
    if (q) {
        await recordGpcIntroComplete(q.grapheme);
        // qu is the unlock mechanism for the q keycap (q has no single-letter GPC intro)
        if (q.grapheme.toLowerCase() === 'qu') {
            await recordGpcIntroComplete('q');
        }
        introModeState.set(q.phoneme);
        questionUtils.submitAnswer('complete', undefined, { deferAdvance: true });
        // th-DH has no dedicated WST card (voiced /DH/ is near-indistinguishable
        // from /V/ in isolation; th-TH WST covers the grapheme). Instead, require
        // WordSelection cards that exercise th-DH in word context.
        const followUpCards = q.gpcId === 'GPC-th-DH'
            ? ['c-ws-that-onset', 'c-ws-than-onset']
            : [whoSaidThatCardId(q.gpcId)];

        // Completion replan — see buildIntroReplanRequest for the hint-shape rationale.
        emit('request-replan', buildIntroReplanRequest({
            label: `digraph-gpc-intro-${q.grapheme}-complete`,
            practiceTag: gpcExerciseTag(q.gpcId),
            followUpCards,
        }));
    }

    await slideLetterOut();

    const words = buildExemplarList();

    for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        phase.value = w.phase;
        if (w.phase === 'onset') onsetIndex.value = w.index;
        else codaIndex.value = w.index;

        await playCurrentWord();

        if (wi < words.length - 1) {
            await delay(400);
        }
    }

    // Clear word area, bring the character back
    phase.value = 'letter-meet';
    await delay(350); // let word section exit
    isCelebrating.value = true;
    await slideLetterIn();

    // Reveal the keyboard keycaps one at a time in sequence
    const graphemeChars = q?.grapheme.split('') ?? [];
    if (keyboard && q && graphemeChars.length > 0) {
        // Add and pop only the first letter
        keyboard.addBaseLetter(graphemeChars[0]);
        keyboard.requestConfig({
            letters: [...keyboard.baseLetters.value],
            overrideBase: true,
            enabledLetters: [graphemeChars[0]],
            showAdvance: false,
            showFullLayout: true,
            disabled: false,
            showArrows: false,
            keyColors: { [graphemeChars[0]]: q.letterColor },
        });
        await nextTick();
        await delay(150);
        await keyboard.hintKey(graphemeChars[0], 'pop', { duration: 700, scale: 2.2 });
        keyboard.setHighlight(graphemeChars[0], q.letterColor);
    }

    // Wait for learner to press each digraph letter in order;
    // subsequent letters are revealed on each correct press.
    // Each letter celebrates on its own keycap press (see inside).
    await waitForKeycapSequence(graphemeChars, q?.letterColor ?? '#1976d2');

    keyboard?.clearAllHighlights();

    await completeIntro();
}

/**
 * Wait for the learner to tap each key in sequence (e.g. 's' then 'h').
 * Each correct press:
 *   - celebrates the corresponding letter character (fire-and-forget so the
 *     keyboard reveal of the next key isn't blocked by the celebration anim)
 *   - disables and unhighlights the just-pressed key
 *   - reveals and highlights the next key (if any)
 */
async function waitForKeycapSequence(targetLetters: string[], highlightColor: string): Promise<void> {
    if (!keyboard || targetLetters.length === 0) return;
    const targets = targetLetters.map(l => l.toLowerCase());
    const wordInst = letterWordInstance.value;
    let lastCelebration: Promise<void> | undefined;

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

        // Fire individual celebration for the letter that corresponds to this
        // keycap press. For all but the last letter, don't await it — the
        // next reveal should happen in parallel with the celebration
        // animation, not be gated behind it. The last celebration is awaited
        // below, before the card is allowed to dismiss.
        const letter = wordInst?.getLetter(i);
        const celebration = use3d.value
            ? letter3dRef.value?.celebrate(i)
            : letter
              ? celebrate(letter, { type: 'random' })
              : undefined;
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
            await keyboard!.hintKey(next, 'pop', { duration: 700, scale: 2.2 });
            keyboard!.setHighlight(next, highlightColor);
        }
    }

    // Let the final letter's celebration finish before the caller proceeds
    // to teardown/dismissal.
    await lastCelebration;
}

// ============================================================================
// Completion
// ============================================================================

async function completeIntro(): Promise<void> {
    phase.value = 'complete';

    if (keyboard) {
        keyboard.clearQuestionConfig();
    }

    // Trigger the stashed navigation — submitAnswer was called earlier
    // with deferAdvance: true, so the framework is waiting for this signal.
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
    // Start fetching the 3D letters chunk right away (3D only); if it can't
    // load, the SVG letters stand in
    const letters3dReady = use3d.value
        ? loadGpcLetter3D().catch((err) => {
              mark3DFailed(err);
              use3d.value = false;
          })
        : null;
    questionUtils.question.value = new DigraphGpcIntro(props.data);
    configureKeyboard();
    subscribeKeyboardEvents();

    await nextTick();
    // The intro frame shows the 3D letters straight away: don't slide in an
    // empty section while their chunk is still loading
    if (letters3dReady) await letters3dReady;
    letterSectionVisible.value = true;
});

onUnmounted(() => {
    unsubscribeKeyboardEvents();
    if (keyboard) {
        keyboard.clearQuestionConfig();
    }
});

watch(phase, (newPhase) => {
    if (newPhase !== 'complete') {
        configureKeyboard();
    }
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