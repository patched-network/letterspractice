<!--
  GpcIntroView.vue — GPC Introduction question view

  A one-time introductory exercise for a letter-sound correspondence (GPC).
  The learner meets a letter, hears its sound, and sees/hears it in word context.

  Sequence:
    1. Letter character slides in from right, smiles and waves
    2. User presses spacebar to hear phoneme (repeatable)
    3. Character slides out; exemplar words auto-play (phoneme chunk → whole word)
    4. Character slides back in and celebrates
    5. Keyboard keycap reveal → framework submission

  Framework wiring via useViewable + useQuestionView. Keyboard context integration.
  No ELO scoring — binary completion (done / not done).
-->

<template>
    <div class="gpc-intro">
        <!-- Main character — slides in on mount, out during word phases, back in to celebrate -->
        <Transition name="letter-slide">
            <div v-if="letterSectionVisible" class="gpc-letter-section">
                <div
                    class="gpc-letter-container"
                    :class="{
                        'gpc-letter-container--keycap': isCelebrating,
                        'gpc-letter-container--keycap-pressed': isKeycapPressed,
                    }"
                    :style="isCelebrating ? { '--keycap-bg': keycapBgColor } : {}"
                >
                    <!-- 3D letter (letters3d): sways and greets on the intro
                         frame; stands still on the final keycap. The section
                         unmounts between the two, so each frame gets its own. -->
                    <GpcLetter3D
                        v-if="use3d"
                        ref="letter3dRef"
                        :text="question?.letter ?? ''"
                        :color="question?.letterColor ?? '#aaccee'"
                        :sway="!isCelebrating"
                        :greet="!isCelebrating"
                        @unavailable="use3d = false"
                    />
                    <WordDisplay
                        v-else
                        ref="letterDisplayRef"
                        :text="question?.letter ?? ''"
                        :height="letterHeight"
                        :options="letterDisplayOptions"
                        :preserve-on-unmount="true"
                        @word-created="onLetterWordCreated"
                    />
                </div>

                <PlaySoundButton
                    v-if="phase === 'letter-meet' && !isCelebrating"
                    :is-playing="isPlayingPhoneme"
                    :listen-to-advance="false"
                    @play="handlePlayButtonPress"
                />
            </div>
        </Transition>

        <!-- Word area — whole card slides in/out per word -->
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
        <audio ref="phonemeAudioEl" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'GpcIntroView' });

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
import { GpcIntro, PHASE1_PRESS_COUNT } from './GpcIntro';
import { recordGpcIntroComplete } from '../services/userState';
import { introModeState } from '../services/introModeState';
import { loadGpcLetter3D, mark3DFailed, use3DLetters } from '../services/letters3d';
import { gpcExerciseTag, whoSaidThatCardId } from '@/services/tags';
import { buildIntroReplanRequest } from '../services/sessionManagement';
import WordDisplay from '../letterpeople/vue/WordDisplay.vue';
import PhoneticWord from '../letterpeople/vue/PhoneticWord.vue';
import PlaySoundButton from '../components/PlaySoundButton.vue';
import type { PhoneticChunk } from '../letterpeople/vue/PhoneticWord.vue';
import type { Word } from '../letterpeople/Word';
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
     * Show the letter as a 3D LetterPerson — swaying on the intro frame,
     * still on the final keycap, celebrating the keypress in 3D. Defaults to
     * the device's renderer (services/letters3d.ts). The component (and
     * three.js) load only when this is on.
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

const viewableUtils = useViewable(props, emit as any, 'GpcIntroView');
const questionUtils = useQuestionView<GpcIntro>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();
const keyboardUnsubscribers: Unsubscribe[] = [];

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);

type IntroPhase = 'letter-meet' | 'onset' | 'core' | 'coda' | 'complete';
const phase = ref<IntroPhase>('letter-meet');

// Letter section slide
const letterSectionVisible = ref(false);
const LETTER_SLIDE_OUT_MS = 400;
const LETTER_SLIDE_IN_MS = 500;

// Phase 1
const wordPhasesStarted = ref(false);
const isCelebrating = ref(false);
const isKeycapPressed = ref(false);
const phase1PressCount = ref(0);
const isPlayingPhoneme = ref(false);
const letterDisplayRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const letterWordInstance = ref<Word | null>(null);
const phonemeAudioEl = ref<HTMLAudioElement | null>(null);

// Word phase indices
const onsetIndex = ref(0);
const coreIndex = ref(0);
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

/**
 * Total number of exemplar words to show across all three phases.
 * Fully-populated cards (e.g. s-S: 3+2+2 available) still show only 3 words
 * (1 onset + 1 core + 1 coda) — same as the previous EXEMPLAR_COUNT=1
 * behavior. Sparse cards (e.g. z-Z: 3+0+0) now extend within the available
 * phase up to this cap, instead of being capped at 1 per phase and
 * displaying a single word.
 */
const MAX_EXEMPLARS = 3;

/**
 * Distribute MAX_EXEMPLARS across the three phases. Allocates one to each
 * non-empty phase first (preserving the prior "one from each" behavior for
 * fully-populated cards), then fills any remaining quota by extending
 * phases in priority order onset > core > coda.
 */
const exemplarQuota = computed<{ onset: number; core: number; coda: number }>(() => {
    const q = question.value;
    if (!q) return { onset: 0, core: 0, coda: 0 };
    const lens = {
        onset: q.onsetWords.length,
        core: q.coreWords.length,
        coda: q.codaWords.length,
    };
    const allocated = { onset: 0, core: 0, coda: 0 };
    let remaining = MAX_EXEMPLARS;
    const phases: Array<'onset' | 'core' | 'coda'> = ['onset', 'core', 'coda'];
    // First pass: one from each non-empty phase
    for (const phase of phases) {
        if (lens[phase] > 0 && remaining > 0) {
            allocated[phase] = 1;
            remaining--;
        }
    }
    // Second pass: extend phases in priority order until quota is exhausted
    for (const phase of phases) {
        while (allocated[phase] < lens[phase] && remaining > 0) {
            allocated[phase]++;
            remaining--;
        }
    }
    return allocated;
});

const introOnsetWords = computed(() => question.value?.onsetWords.slice(0, exemplarQuota.value.onset) ?? []);
const introCoreWords = computed(() => question.value?.coreWords.slice(0, exemplarQuota.value.core) ?? []);
const introCodaWords = computed(() => question.value?.codaWords.slice(0, exemplarQuota.value.coda) ?? []);

const currentOnsetWord = computed(() => introOnsetWords.value[onsetIndex.value] ?? '');
const currentCoreWord = computed(() => introCoreWords.value[coreIndex.value] ?? '');
const currentCodaWord = computed(() => introCodaWords.value[codaIndex.value] ?? '');

const currentWordColor = computed(() => {
    const q = question.value;
    if (!q) return '#1976d2';
    if (phase.value === 'onset') return q.onsetColors[onsetIndex.value] ?? '#1976d2';
    if (phase.value === 'core') return q.coreColors[coreIndex.value] ?? '#1976d2';
    if (phase.value === 'coda') return q.codaColors[codaIndex.value] ?? '#1976d2';
    return '#1976d2';
});

// ============================================================================
// Computed: Unified word-phase accessors
// ============================================================================

const inWordPhase = computed(() =>
    phase.value === 'onset' || phase.value === 'core' || phase.value === 'coda'
);

const currentWord = computed(() => {
    if (phase.value === 'onset') return currentOnsetWord.value;
    if (phase.value === 'core') return currentCoreWord.value;
    if (phase.value === 'coda') return currentCodaWord.value;
    return '';
});

const currentChunks = computed((): PhoneticChunk[] => {
    if (phase.value === 'onset') return currentOnsetChunks.value;
    if (phase.value === 'core') return currentCoreChunks.value;
    if (phase.value === 'coda') return currentCodaChunks.value;
    return [];
});

const currentWordKey = computed(() => {
    if (phase.value === 'onset') return `onset-${onsetIndex.value}`;
    if (phase.value === 'core') return `core-${coreIndex.value}`;
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
 * Build a single phonetic chunk for the target GPC letter in a word.
 * This is the only stepped chunk; the whole-word step handles full playback.
 */
function buildTargetChunks(word: string, targetIndex: number, targetPhoneme: PhonemeAudioKey): PhoneticChunk[] {
    return [{
        letters: { [targetIndex]: 'speak' },
        phoneme: targetPhoneme,
        label: word[targetIndex],
    }];
}

const currentOnsetChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentOnsetWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(word, q.getOnsetLetterIndex(word), q.phoneme);
});

const currentCoreChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentCoreWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(word, q.getCoreLetterIndex(word), q.phoneme);
});

const currentCodaChunks = computed((): PhoneticChunk[] => {
    const q = question.value;
    const word = currentCodaWord.value;
    if (!q || !word) return [];
    return buildTargetChunks(word, q.getCodaLetterIndex(word), q.phoneme);
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
                // Update in place if key is same (unlikely in this view, but good for robustness)
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

    const letter = word.getLetter(0);
    if (letter) {
        characterize(letter, {
            duration: 400,
            showEyes: true,
            showMouth: true,
            showBrows: true,
            startTracking: true,
        });

        // After the face appears: smile and wave
        delay(400).then(async () => {
            await Promise.all([
                letter.eyes.brows?.express('happy', { duration: 350 }),
                letter.mouth.updateShape({ openness: 0.2, mood: 0.88 }, { duration: 350 }),
            ]);
            letter.arms.wave({ duration: 900 });
        });
    }
}

async function playPhonemeOnce(): Promise<void> {
    if (isPlayingPhoneme.value) return;
    const q = question.value;
    if (!q) return;

    isPlayingPhoneme.value = true;

    const audioUrl = getPhonemeAudioUrl(q.phoneme);
    const letter = letterWordInstance.value?.getLetter(0);

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

    if (use3d.value) {
        letter3dRef.value?.speak(400);
    } else if (letter?.mouth) {
        letter.mouth.animateSpeak({ duration: 400, openness: 0.8, mood: 0.3 });
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
    if (isPlayingPhoneme.value) return;

    await playPhonemeOnce();
    phase1PressCount.value++;

    if (phase1PressCount.value >= PHASE1_PRESS_COUNT) {
        await autoRunWordPhases();
    }
}

// ============================================================================
// Phase 2–4: Word phases (fully automatic)
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
 * Plays [whole word, then phoneme chunk] — avoids back-to-back phoneme
 * since the character already speaks the phoneme during letter-meet.
 */
async function playCurrentWord(): Promise<void> {
    const ready = new Promise<void>(resolve => { resolveWordReady = resolve; });
    await nextTick(); // kick off the key-change re-render
    await ready;      // wait for @after-enter / @after-appear

    const pw = currentWordRef.value;
    if (!pw) return;

    // 1. Whole word first
    await pw.playWord();
    await delay(250);
    // 2. Then the target phoneme chunk
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
        await recordGpcIntroComplete(q.letter);
        introModeState.set(q.phoneme);
        questionUtils.submitAnswer('complete', undefined, { deferAdvance: true });
        // Completion replan — see buildIntroReplanRequest for the hint-shape rationale.
        emit('request-replan', buildIntroReplanRequest({
            label: `gpc-intro-${q.letter}-complete`,
            practiceTag: gpcExerciseTag(q.gpcId),
            followUpCards: [whoSaidThatCardId(q.gpcId)],
        }));
    }

    await slideLetterOut();

    // Build a flat list of all exemplar words across phases
    const words: Array<{ phase: IntroPhase; index: number }> = [];
    introOnsetWords.value.forEach((_, i) => words.push({ phase: 'onset', index: i }));
    introCoreWords.value.forEach((_, i) => words.push({ phase: 'core', index: i }));
    introCodaWords.value.forEach((_, i) => words.push({ phase: 'coda', index: i }));

    for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        phase.value = w.phase;
        if (w.phase === 'onset') onsetIndex.value = w.index;
        else if (w.phase === 'core') coreIndex.value = w.index;
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

    // Reveal the keyboard keycap with a pop animation, then CTA with highlight
    if (keyboard && q) {
        keyboard.addBaseLetter(q.letter);
        keyboard.requestConfig({
            letters: [...keyboard.baseLetters.value],
            overrideBase: true,
            enabledLetters: [q.letter],
            showAdvance: false,
            showFullLayout: true,
            disabled: false,
            showArrows: false,
            keyColors: { [q.letter]: q.letterColor },
        });
        await nextTick();
        await delay(150); // let key mount before animating
        await keyboard.hintKey(q.letter, 'pop', { duration: 700, scale: 2.2 });
        keyboard.setHighlight(q.letter, q.letterColor);

        // Subscribe to press/release for visual keycap depression
        const unsubPress = keyboard.onKeyPress((ev) => {
            if (ev.letter === q.letter.toLowerCase()) isKeycapPressed.value = true;
        });
        const unsubRelease = keyboard.onKeyRelease((ev) => {
            if (ev.letter === q.letter.toLowerCase()) isKeycapPressed.value = false;
        });
        keyboardUnsubscribers.push(unsubPress, unsubRelease);
    }

    // Wait for learner to press the new keycap
    await waitForKeycapPress(q?.letter ?? '');

    isKeycapPressed.value = false;
    keyboard?.clearAllHighlights();

    if (use3d.value && letter3dRef.value) {
        await letter3dRef.value.celebrate();
    } else {
        const letter = letterWordInstance.value?.getLetter(0);
        if (letter) {
            await celebrate(letter, { type: 'random' });
        }
    }

    await completeIntro();
}

/**
 * Returns a promise that resolves when the learner taps the target key.
 */
function waitForKeycapPress(targetLetter: string): Promise<void> {
    if (!keyboard || !targetLetter) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsub = keyboard!.onKeyTap((event) => {
            if (event.letter === targetLetter.toLowerCase()) {
                unsub();
                resolve();
            }
        });
        keyboardUnsubscribers.push(unsub);
    });
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
    // Start fetching the 3D letter chunk right away (3D only); if it can't
    // load, the SVG letter stands in
    const letter3dReady = use3d.value
        ? loadGpcLetter3D().catch((err) => {
              mark3DFailed(err);
              use3d.value = false;
          })
        : null;
    questionUtils.question.value = new GpcIntro(props.data);
    configureKeyboard();
    subscribeKeyboardEvents();

    await nextTick();
    // The intro frame shows the 3D letter straight away: don't slide in an
    // empty section while its chunk is still loading
    if (letter3dReady) await letter3dReady;
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
    gap: 12px;
    overflow-x: hidden;
}

/* ------------------------------------------------------------------ */
/* Main character slide                                                */
/* ------------------------------------------------------------------ */

.letter-slide-enter-active {
    animation: slideInRight 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.letter-slide-leave-active {
    animation: slideOutLeft 400ms cubic-bezier(0.4, 0, 0.7, 0.2) both;
}

/* ------------------------------------------------------------------ */
/* Letter section                                                      */
/* ------------------------------------------------------------------ */

.gpc-letter-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex: 1;
    width: 100%;
}

.gpc-letter-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 340px;
    border-radius: 0px;
    box-shadow: none;
    border-bottom: 0px solid rgba(0, 0, 0, 0.22);
    background-color: transparent;
    transition:
        background-color 0.5s ease-out,
        border-radius 0.5s ease-out,
        box-shadow 0.5s ease-out,
        border-bottom-width 0.5s ease-out,
        transform 0.5s ease-out;
}

.gpc-letter-container--keycap {
    background-color: var(--keycap-bg, #cce4ff);
    border-radius: 28px;
    border-bottom-width: 8px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
    /* Scale down to fit with shadow room, margin keeps shadow inside parent */
    flex: 0 0 auto;
    align-self: center;
    width: 400px;
    height: 420px;
    min-height: unset;
    margin: 24px 0;
    transform: scale(0.82);
    transform-origin: center center;
}

.gpc-letter-container--keycap-pressed {
    transform: scale(0.79) translateY(4px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    border-bottom-width: 2px;
    transition:
        transform 0.08s ease-out,
        box-shadow 0.08s ease-out,
        border-bottom-width 0.08s ease-out;
}

/* ------------------------------------------------------------------ */
/* Word section + card                                                 */
/* ------------------------------------------------------------------ */

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
    background: var(--card-bg, transparent);
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Word section enter/exit (wraps the whole word area) */
.word-section-enter-active {
    animation: slideInRight 350ms ease-out both;
}

.word-section-leave-active {
    animation: slideOutLeft 300ms ease-in both;
    pointer-events: none;
}

/* Word card slide in/out between words (whole card moves as a unit) */
.word-swap-enter-active {
    animation: slideInRight 350ms ease-out both;
}

.word-swap-leave-active {
    animation: slideOutLeft 300ms ease-in both;
    position: absolute;
    left: 0;
    right: 0;
    /* Vertically center to match the flex centering of the in-flow card */
    top: 50%;
    translate: 0 -50%;
    pointer-events: none;
}

/* ------------------------------------------------------------------ */
/* Shared keyframes                                                    */
/* ------------------------------------------------------------------ */

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

@keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}

/* ------------------------------------------------------------------ */
/* Responsive                                                          */
/* ------------------------------------------------------------------ */

@media (max-width: 600px) {
    .gpc-intro {
        padding: 16px;
    }

    .gpc-letter-container {
        min-height: 240px;
    }
}
</style>
