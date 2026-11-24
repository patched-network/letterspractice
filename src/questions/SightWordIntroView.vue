<!--
  SightWordIntroView.vue — Sight-word introduction question view

  A one-time introduction to a word that doesn't sound the way it's spelled.

  Sequence:
    1. The word slides in with the card, then faces pop in (3D)
    2. The learner types it out in spelling order; each sound plays once its
       letters are in, and a silent letter hushes as it's typed (input is
       ignored until either finishes). On the step that bends the rule the
       culprit looks contrite, and the letters that behave (or an onlooker,
       when none do) frown at it: faces only
    3. One spacebar press: everyone makes up, and the whole word plays
    4. Framework submission (the word's exposure cards go into rotation)

  SVG fallback (no WebGL): a PhoneticWord stepper, without the reactions.
  No ELO scoring — binary completion (done / not done).
-->

<template>
    <div class="sight-word-intro">
        <Transition name="word-section" :css="!use3d">
            <div v-if="stageVisible" class="sight-word-stage">
                <SightWord3D
                    v-if="use3d && question"
                    ref="word3dRef"
                    :word="question.word"
                    :colors="question.letterColors"
                    :onlooker="question.plan.minders.length === 0"
                    :staging="staging"
                    @arrived="onArrived"
                    @unavailable="fallBackToSvg"
                />
                <div v-else-if="question" class="sight-word-card">
                    <PhoneticWord
                        ref="svgWordRef"
                        :word="question.word"
                        :phonetic-chunks="question.plan.steps"
                        :height="wordHeight"
                        :options="svgWordOptions"
                        :underline-next-chunk="true"
                        :underline-color="nextColor"
                        :include-whole-word-step="true"
                        :preserve-on-unmount="true"
                    />
                </div>
            </div>
        </Transition>

        <audio ref="audioEl" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SightWordIntroView' });

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
import { useTimedWordPlayback } from '../composables/useTimedWordPlayback';
import { SightWordIntro } from './SightWordIntro';
import type { SightWordStaging, SightWordStep } from './sightWordIntroPlan';
import { recordGpcIntroComplete } from '../services/userState';
import { loadSightWord3D, mark3DFailed, use3DLetters } from '../services/letters3d';
import { buildIntroReplanRequest, SIGHT_WORD_INTRO_TAG_PATTERN } from '../services/sessionManagement';
import { getPhonemeAudioUrl, computeSpeakerTimingsForWord } from '../services/phonetics';
import PhoneticWord from '../letterpeople/vue/PhoneticWord.vue';

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
     * Step the word as 3D LetterPeople, with the reactions. Defaults to the
     * device's renderer (services/letters3d.ts). The component (and three.js)
     * load only when this is on.
     */
    letters3d: {
        type: Boolean,
        default: () => use3DLetters(),
    },
    /** What the 3D word stands on (dbg comparison; see SightWordStaging). */
    staging: {
        type: String as PropType<SightWordStaging>,
        default: 'floor',
    },
});

const SightWord3D = defineAsyncComponent(loadSightWord3D);
/** 3D this intro; drops to SVG if the 3D chunk or stage fails. */
const use3d = ref(props.letters3d);
const word3dRef = ref<{
    progress: (typed: number, ready: number | null) => void;
    playStep: (step: SightWordStep, durationMs?: number) => Promise<void>;
    applyEffect: (index: number, effect: any, durationMs?: number) => void;
    react: (culprits: number[], minders: number[]) => Promise<void>;
    makeUp: () => Promise<void>;
    cheer: () => Promise<void>;
    mark: (step: SightWordStep | 'word', color: string) => Promise<void>;
    clearMark: () => Promise<void>;
} | null>(null);
const svgWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);

const emit = defineEmits<{
    (e: 'emitResponse', ...args: any[]): void;
    (e: 'request-replan', options?: ReplanOptions): void;
    (e: 'ready-to-advance'): void;
}>();

// ============================================================================
// Framework Wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'SightWordIntroView');
const questionUtils = useQuestionView<SightWordIntro>(viewableUtils);

const keyboard = useKeyboardContextOptional();
const keyboardUnsubscribers: Unsubscribe[] = [];

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);

/** arriving → stepping (a press per step, then one for the whole word) → complete */
type Phase = 'arriving' | 'stepping' | 'complete';
const phase = ref<Phase>('arriving');
const stageVisible = ref(false);
/** The next step to play; `steps.length` means the whole word is next. */
const stepIndex = ref(0);
const busy = ref(false);
/** Letters of the word typed so far, in spelling order (plan.soundedAfter says what they sound). */
const typedCount = ref(0);
let submitted = false;

const audioEl = ref<HTMLAudioElement | null>(null);
const wordPlayback = useTimedWordPlayback();
const wordHeight = 200;

/** The last press, for the whole word, is the spacebar rather than a letter. */
const wholeWordNext = computed(() => !!question.value && stepIndex.value >= question.value.plan.steps.length);

/**
 * The one letter the learner can type now: the word's next, or while its sounds
 * play, the one just typed (held, dimmed). None on the whole-word step.
 */
const targetIndex = computed<number | undefined>(() => {
    if (wholeWordNext.value) return undefined;
    return busy.value ? typedCount.value - 1 : typedCount.value;
});
const targetLetter = computed(() => {
    const i = targetIndex.value;
    return i === undefined ? '' : (question.value?.word[i]?.toLowerCase() ?? '');
});

/** The next step's first letter's colour (the underline). */
const nextColor = computed(() => {
    const q = question.value;
    if (!q) return '#1976d2';
    return q.letterColors[firstLetter(q, stepIndex.value) % q.letterColors.length] ?? '#1976d2';
});

const svgWordOptions = computed(() => ({
    spacing: 10,
    letterOptions: {
        color: question.value?.letterColors[0] ?? '#1976d2',
        lineWidth: 22,
        borderWidth: 4,
        showEyes: false,
        showMouth: false,
        showArms: false,
    },
}));

// ============================================================================
// Stepping
// ============================================================================

function playAudio(url: string): Promise<void> {
    return new Promise<void>((resolve) => {
        const el = audioEl.value;
        if (!el) return resolve();
        const done = () => {
            el.removeEventListener('ended', done);
            el.removeEventListener('error', done);
            resolve();
        };
        el.addEventListener('ended', done);
        el.addEventListener('error', done);
        el.src = url;
        el.play().catch(done);
    });
}

/** Plays the steps the letters typed so far complete (none, one, or several). */
async function soundTyped(): Promise<void> {
    const q = question.value;
    if (!q || busy.value) return;
    const due = q.plan.soundedAfter[typedCount.value - 1] ?? 0;
    if (stepIndex.value >= due) return;
    busy.value = true;
    try {
        while (stepIndex.value < due) {
            await playStep(q, stepIndex.value);
            stepIndex.value++;
        }
    } finally {
        busy.value = false;
    }
}

async function sayWholeWord(): Promise<void> {
    const q = question.value;
    if (!q || busy.value || phase.value !== 'stepping' || !wholeWordNext.value) return;
    busy.value = true;
    try {
        await playWholeWord(q);
        completeIntro();
    } finally {
        busy.value = false;
    }
}

async function playStep(q: SightWordIntro, i: number): Promise<void> {
    if (!use3d.value) {
        await svgWordRef.value?.stepNext();
        return;
    }
    const step = q.plan.steps[i];
    const acting = word3dRef.value?.playStep(step);
    // A silent letter's step has no sound: it lasts as long as the hush
    await (step.phoneme ? playAudio(getPhonemeAudioUrl(step.phoneme)) : acting);
    const culprits = q.plan.culprits[i];
    if (culprits.length) await word3dRef.value?.react(culprits, q.plan.minders);
    // The marker moves on once this step is done
    void markNext(q, i + 1);
}

/** Underline what the next press plays (3D; PhoneticWord does its own). */
function markNext(q: SightWordIntro, i: number): Promise<void> {
    const color = q.letterColors[firstLetter(q, i) % q.letterColors.length];
    return word3dRef.value?.mark(q.plan.steps[i] ?? 'word', color) ?? Promise.resolve();
}

function firstLetter(q: SightWordIntro, i: number): number {
    const step = q.plan.steps[i];
    return step ? Math.min(...Object.keys(step.letters).map(Number)) : 0;
}

async function playWholeWord(q: SightWordIntro): Promise<void> {
    // Submit + replan first, so the planner works while the word plays
    await submitAndReplan(q);
    if (!use3d.value) {
        await svgWordRef.value?.stepNext();
        return;
    }
    const word3d = word3dRef.value;
    await word3d?.makeUp();
    const phonetics = q.phonetics;
    const timings = phonetics ? computeSpeakerTimingsForWord(phonetics) : null;
    if (phonetics && timings && audioEl.value) {
        await wordPlayback.play({
            audio: audioEl.value,
            audioUrl: phonetics.audioUrl,
            timings,
            onTrigger: (t) => word3d?.applyEffect(t.index, t.effect ?? 'speak'),
        });
    } else if (phonetics) {
        await playAudio(phonetics.audioUrl);
    }
    await Promise.all([word3d?.cheer(), word3d?.clearMark()]);
}

function onKeyTap(letter: string): void {
    if (phase.value !== 'stepping' || busy.value || letter !== targetLetter.value) return;
    typedCount.value++;
    void soundTyped();
}

// ============================================================================
// Completion
// ============================================================================

async function submitAndReplan(q: SightWordIntro): Promise<void> {
    if (submitted) return;
    submitted = true;
    // The word and its family (released with it, not staged)
    for (const w of [q.word, ...q.family]) await recordGpcIntroComplete(w);
    questionUtils.submitAnswer('complete', undefined, { deferAdvance: true });
    // Completion replan — see buildIntroReplanRequest for the hint-shape rationale.
    // No practice boost: the required follow-ups are the word's prescribed
    // exposure, and its other cards float in unboosted. One sight-word intro per session.
    emit('request-replan', buildIntroReplanRequest({
        label: `sight-word-intro-${q.word}-complete`,
        followUpCards: q.followUp,
        sessionExcludeTags: [SIGHT_WORD_INTRO_TAG_PATTERN],
    }));
}

function completeIntro(): void {
    phase.value = 'complete';
    keyboard?.clearQuestionConfig();
    // submitAnswer was called with deferAdvance: true; this is the signal
    emit('ready-to-advance');
}

// ============================================================================
// Keyboard
// ============================================================================

function configureKeyboard(): void {
    if (!keyboard) return;
    const q = question.value;
    const target = targetLetter.value;
    // The whole-word advance key takes the first letter's colour
    const colorIndex = targetIndex.value ?? 0;
    const color = q ? (q.letterColors[colorIndex % q.letterColors.length] ?? '#1976d2') : '#1976d2';
    keyboard.requestConfig({
        // Only the target letter is live; the rest of the layout stays as ghosts
        letters: target ? [target] : [],
        overrideBase: true,
        // Dimmed while a unit sounds: input is ignored until it finishes
        enabledLetters: phase.value === 'stepping' && target && !busy.value ? [target] : [],
        highlights: target ? { [target]: color } : {},
        keyColors: target ? { [target]: color } : {},
        showAdvance: phase.value === 'stepping' && wholeWordNext.value && !busy.value,
        advanceColor: color,
        advanceText: 'mdi-volume-high',
        showArrows: false,
        showFullLayout: true,
        disabled: phase.value !== 'stepping',
    });
}

// ============================================================================
// Lifecycle
// ============================================================================

function onArrived(): void {
    phase.value = 'stepping';
    const q = question.value;
    if (q) void markNext(q, 0);
}

function fallBackToSvg(): void {
    use3d.value = false;
    phase.value = 'stepping';
}

onMounted(async () => {
    // Start fetching the 3D chunk right away; if it can't load, SVG stands in
    const word3dReady = use3d.value
        ? loadSightWord3D().catch((err) => {
              mark3DFailed(err);
              use3d.value = false;
          })
        : null;
    const q = new SightWordIntro(props.data);
    questionUtils.question.value = q;
    configureKeyboard();
    if (keyboard) {
        keyboardUnsubscribers.push(
            keyboard.onKeyTap((ev) => onKeyTap(ev.letter)),
            keyboard.onAdvance(() => void sayWholeWord()),
        );
    }

    if (!q.phonetics) {
        // No recording: nothing to step (the generator only makes cards for recorded words)
        console.warn(`[SightWordIntroView] no phonetics for "${q.word}"; completing`);
        await submitAndReplan(q);
        completeIntro();
        return;
    }

    await nextTick();
    if (word3dReady) await word3dReady;
    stageVisible.value = true;
    // The 3D word says when it has arrived; the SVG card just slides in
    if (!use3d.value) setTimeout(() => (phase.value = 'stepping'), 350);
});

onUnmounted(() => {
    keyboardUnsubscribers.forEach((unsub) => unsub());
    keyboardUnsubscribers.length = 0;
    wordPlayback.stop();
    keyboard?.clearQuestionConfig();
});

watch([phase, busy, targetLetter], () => {
    if (phase.value !== 'complete') configureKeyboard();
});

// The 3D word colours in as it's typed; the next letter stands up when its key is live
watch([phase, typedCount, busy, wholeWordNext], () => {
    if (phase.value !== 'stepping') return;
    word3dRef.value?.progress(typedCount.value, busy.value || wholeWordNext.value ? null : typedCount.value);
});

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
.sight-word-intro {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 24px;
    width: 100%;
    gap: 12px;
    overflow-x: hidden;
}

.sight-word-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 800px;
    height: 340px;
}

/* SVG fallback: the word on a card, as the GPC intros' exemplar words */
.sight-word-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    width: 100%;
    padding: 16px 24px;
    background: #fbf7ee;
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.word-section-enter-active {
    animation: slideInRight 350ms ease-out both;
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

@media (max-width: 600px) {
    .sight-word-intro {
        padding: 16px;
    }
    .sight-word-stage {
        height: 260px;
    }
}
</style>
