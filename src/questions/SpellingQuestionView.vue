<!--
  SpellingQuestionView.vue — Spelling question with scaffold-level support

  Phase 1: Level 3 (unaided) — free-type, Enter to submit, per-letter feedback.
  Framework wiring via useViewable + useQuestionView. Keyboard context integration.
  Word audio plays on mount and via PlaySoundButton (spacebar).

  Phonetic fix: an answer that reads back as the word ("necst" for "next";
  grade.ts rule 0) is recorded as correct with deferAdvance. The respelled
  letters speak their sounds, float above the word in red, and blanks grow in
  where the word's letters go as the guide appears. The learner types them
  (only the next one is enabled) before the card advances.
  See agent/curriculum-log/concerns.md C8.

  All input handling, keyboard wiring, and level logic is inline in this
  component (matching the WhoSaidThat single-component pattern). No external
  composables — the view owns the keyboard context contract.

  Ref: agent/spelling-question/a.3.plan.md §6.7–6.8
-->

<template>
    <div class="spelling-question">
        <!-- Header -->
        <!-- Header and speaker fade during a phonetic fix: the floating letters rise into their space -->
        <div class="sq-header" :class="{ 'sq-faded': inPhoneticFix }">
            <h2 class="sq-title">Spell the Word</h2>
        </div>

        <!-- Audio controls (hidden during demo — spacebar drives stepper instead) -->
        <div v-if="phase !== 'demo'" class="sq-audio-controls" :class="{ 'sq-faded': inPhoneticFix }">
            <PlaySoundButton
                :is-playing="isPlayingAudio"
                @play="playWordAudio"
            />
        </div>

        <!-- Level 0 Demo: PhoneticWord with progressive reveal -->
        <div v-if="phase === 'demo'" class="sq-demo-area">
            <p class="sq-demo-instruction">Press spacebar to sound out each part</p>
            <PhoneticWord
                ref="demoWordRef"
                :word="question?.word ?? ''"
                :phonetic-chunks="question?.chunks as any"
                :word-audio="question?.audioUrl"
                :keyboard-context="keyboard ?? undefined"
                :underline-next-chunk="true"
                :include-whole-word-step="true"
                :height="120"
                :clickable-letters="false"
                @word-created="handleDemoWordCreated"
                @chunk-played="handleDemoChunkPlayed"
                @stepper-complete="handleDemoComplete"
            />
        </div>

        <!-- Input blanks (LetterPeople) — shown in input phase -->
        <SpellingBlanks
            v-if="phase === 'input'"
            ref="blanksRef"
            :word="question?.word ?? ''"
            :typed-letters="typedLetters"
            :edit-index="editIndex"
            :gap-index="gapIndex"
            :slot-count="config.showBlanks ? wordLength : null"
            :cursor-position="config.showBlanks ? cursorPosition : null"
            :show-result="showResult"
            :per-letter-results="perLetterResults"
            :locked="isLocked"
        />

        <!-- Retry hint: pre-rendered for layout stability, fades in on wrong answer -->
        <div
            v-if="phase === 'input' && question"
            class="sq-retry-area"
            :class="{ 'sq-retry-area--visible': retryMode !== 'none' }"
            :style="{ '--sq-n': question.letters.length || 1 }"
        >
            <div class="sq-retry-word">
                <div
                    v-for="(letter, index) in (retryMode !== 'none' ? retryDisplay : question.letters)"
                    :key="'retry-' + index"
                    class="sq-retry-letter"
                    :class="{
                        'sq-retry-letter--blank': retryMode === 'none' || !letter,
                        'sq-retry-letter--fix': retryMode !== 'none' && fixLetters.has(index),
                    }"
                >
                    {{ retryMode !== 'none' ? (letter || '') : '' }}
                </div>
            </div>
        </div>

        <!-- Submit button (Level 3, input phase only) -->
        <SubmitAnswerButton
            :visible="phase === 'input' && showSubmitHint && !isLocked && !showResult"
            @submit="doSubmit"
        />

        <!-- Hidden audio elements -->
        <audio ref="audioElement" @ended="isPlayingAudio = false" @error="isPlayingAudio = false" />
        <audio ref="phonemeAudio" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SpellingQuestionView' });

import {
    ref,
    computed,
    watch,
    onMounted,
    onUnmounted,
    nextTick,
    type PropType,
} from 'vue';
import { ViewData } from '@vue-skuilder/common';
import { useViewable, useQuestionView } from '@vue-skuilder/courseware';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';
import type { Unsubscribe } from '../composables/keyboardContext.types';
import { SpellingQuestion } from './SpellingQuestion';
import { gradeSpelling } from './spelling/grade';
import type { PhoneticMatch } from './spelling/phoneticMatch';
import { type ScaffoldLevel, SCORE_CEILING, configForLevel } from './spelling/types';
import PlaySoundButton from '../components/PlaySoundButton.vue';
import SpellingBlanks from './spelling/SpellingBlanks.vue';
import SubmitAnswerButton, { SUBMIT_KEY_COLOR } from '../components/SubmitAnswerButton.vue';
import PhoneticWord from '../letterpeople/vue/PhoneticWord.vue';
import { getPhonemeAudioUrl, toPhonemeAudioKey } from '../services/phonetics/phonemeCache';
import { celebrate as celebrateLetter, headShakeNo, speakPhoneme } from '../letterpeople/animations';
import { animate } from 'animejs';

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
    /** Override scaffold level (debug use). Production will derive from user state. */
    initialLevel: {
        type: Number as PropType<ScaffoldLevel>,
        default: undefined,
    },
    /**
     * Preview/demo mode (e.g. /exercises): no audio until tapped, and no
     * page-wide Backspace listener (the page has other things to type into).
     */
    preview: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits<{
    (e: 'emitResponse', ...args: any[]): void;
    /** After a phonetic fix: the answer went in with deferAdvance. */
    (e: 'ready-to-advance'): void;
}>();

// ============================================================================
// Framework Wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'SpellingQuestionView');
const questionUtils = useQuestionView<SpellingQuestion>(viewableUtils);

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContextOptional();
const keyboardUnsubscribers: Unsubscribe[] = [];

// ============================================================================
// State
// ============================================================================

const question = computed(() => questionUtils.question.value ?? null);
const isPlayingAudio = ref(false);
const showResult = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);

// --- Scaffold Level ---
const level = ref<ScaffoldLevel>(props.initialLevel ?? 3);
const scoreCeiling = ref(SCORE_CEILING[level.value]);
const config = computed(() => configForLevel(level.value));

// --- Phase State (Level 0 has demo → input; others start at input) ---
const phase = ref<'demo' | 'input'>(level.value === 0 ? 'demo' : 'input');
const demoWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);

// --- GPC chunk phoneme playback (Level 0 input phase) ---
/** Tracks which chunk indices have already had their phoneme played */
const playedChunks = ref<Set<number>>(new Set());
/** Audio element for phoneme playback (separate from word audio) */
const phonemeAudio = ref<HTMLAudioElement | null>(null);

// --- Retry State ---
/** Tracks retry phase: 'none' = first attempt, 'partial' = after 1st wrong, 'full' = after 2nd wrong */
const retryMode = ref<'none' | 'partial' | 'full'>('none');

// --- Phonetic Fix State ---
/** Word indices still to type during a phonetic fix, in order; null otherwise. */
const fixPending = ref<number[] | null>(null);
/** From a phonetic submit until the card advances: the fix owns the keyboard. */
const inPhoneticFix = ref(false);
/** Word indices the answer respelled: highlighted in the model word. */
const fixLetters = ref<Set<number>>(new Set());

// --- Input State ---
const typedLetters = ref<string[]>([]);
const cursorPosition = ref(0);
const isLocked = ref(false);

/** Serializes backspace calls so rapid taps queue instead of racing */
let backspaceChain = Promise.resolve();

/**
 * Cursor alternates between gap and letter positions:
 *   |gap| c |gap| a |gap| t |gap|
 *     0  L0   1  L1   2  L2   3
 *
 * 'gap': cursor is between letters (or at start/end). Typing inserts.
 * 'letter': cursor is on a letter. Typing replaces.
 */
const cursorInGap = ref(true); // start in gap mode (append position)

/** Passed to SpellingBlanks: which letter is being edited (letter mode) */
const editIndex = computed<number | null>(() =>
    !cursorInGap.value ? cursorPosition.value : null,
);

/** Passed to SpellingBlanks: which gap to show cursor at (gap mode) */
const gapIndex = computed<number | null>(() =>
    cursorInGap.value ? cursorPosition.value : null,
);

// --- Component Refs ---
const blanksRef = ref<InstanceType<typeof SpellingBlanks> | null>(null);

// ============================================================================
// Computed — Input
// ============================================================================

const wordLength = computed(() => question.value?.word.length ?? 0);

const isComplete = computed(() => {
    if (typedLetters.value.length === 0) return false;
    if (config.value.requireEnterToSubmit) {
        // Level 3: at least one letter typed
        return typedLetters.value.some((l) => l !== undefined && l !== '');
    }
    // Levels 0–2: all blanks filled
    const len = wordLength.value;
    if (len === 0) return false;
    for (let i = 0; i < len; i++) {
        if (!typedLetters.value[i]) return false;
    }
    return true;
});

const currentAnswer = computed(() => {
    return typedLetters.value
        .map((l) => l ?? '')
        .join('');
});


// ============================================================================
// Computed — Display
// ============================================================================

const showSubmitHint = computed(() => {
    if (!config.value.requireEnterToSubmit) return false;
    return isComplete.value;
});

const isCorrect = computed(() => {
    if (!question.value || !showResult.value) return false;
    return currentAnswer.value.toLowerCase() === question.value.word;
});

/**
 * Per-letter comparison results.
 * Index → true (correct) | false (wrong) | undefined (missing).
 */
const perLetterResults = computed<(boolean | undefined)[]>(() => {
    if (!showResult.value || !question.value) return [];

    const expected = question.value.word;
    const typed = currentAnswer.value.toLowerCase();
    const results: (boolean | undefined)[] = [];

    const maxLen = Math.max(expected.length, typed.length);
    for (let i = 0; i < maxLen; i++) {
        const exp = expected[i];
        const got = typed[i];
        if (exp === undefined) {
            results.push(false);
        } else if (got === undefined) {
            results.push(undefined);
        } else {
            results.push(got === exp);
        }
    }
    return results;
});

/**
 * The hint display shown below input during retries.
 * 'partial': optimistically masked correct word (correct letters shown, wrong blanked).
 * 'full': entire correct word revealed.
 */
const retryDisplay = ref<string[]>([]);

// ============================================================================
// Audio
// ============================================================================

async function playWordAudio(): Promise<void> {
    if (!question.value || !audioElement.value) return;

    isPlayingAudio.value = true;
    audioElement.value.src = question.value.audioUrl;
    try {
        await audioElement.value.play();
    } catch (e) {
        console.error('[SpellingQuestionView] Failed to play word audio:', e);
        isPlayingAudio.value = false;
    }
}

// ============================================================================
// Level 0 Demo Phase
// ============================================================================

/**
 * When PhoneticWord creates the word, dim all letters to opacity 0
 * for progressive reveal during stepping.
 */
function handleDemoWordCreated(): void {
    if (!demoWordRef.value) return;
    const q = question.value;
    if (!q) return;

    // Hide all letters initially
    for (let i = 0; i < q.word.length; i++) {
        const letter = demoWordRef.value.getLetterInstance(i);
        if (letter) {
            letter.svgElement.style.opacity = '0';
        }
    }
}

/**
 * On each chunk step, reveal the letters belonging to that chunk.
 */
function handleDemoChunkPlayed(event: { index: number; chunk: any }): void {
    if (!demoWordRef.value || !question.value) return;

    const chunks = question.value.chunks;
    if (event.index < 0 || event.index >= chunks.length) return;

    const chunk = chunks[event.index];
    for (const letterIdx of Object.keys(chunk.letters)) {
        const letter = demoWordRef.value.getLetterInstance(Number(letterIdx));
        if (letter) {
            animate(letter.svgElement, {
                opacity: [0, 1],
                duration: 300,
                ease: 'outQuad',
            });
        }
    }
}

/**
 * Demo stepper completed — transition to input phase.
 */
function handleDemoComplete(): void {
    setTimeout(() => {
        phase.value = 'input';
        // Reconfigure keyboard for letter input
        configureInputKeyboard();
        // Play word audio once as prompt to begin copying
        setTimeout(() => playWordAudio(), 300);
    }, 500);
}

// ============================================================================
// GPC Chunk Phoneme Playback
// ============================================================================

/**
 * Check if placing a letter at `pos` completes any GPC chunk.
 * If so, play that chunk's phoneme audio.
 */
function checkChunkCompletion(pos: number): void {
    if (!question.value?.chunks || !phonemeAudio.value) return;
    if (level.value !== 0) return; // Only for Level 0 currently

    const chunks = question.value.chunks;
    for (let ci = 0; ci < chunks.length; ci++) {
        if (playedChunks.value.has(ci)) continue;

        const chunk = chunks[ci];
        const positions = Object.keys(chunk.letters).map(Number);

        // Check if this chunk includes the position we just filled
        if (!positions.includes(pos)) continue;

        // Check if ALL positions for this chunk are now filled
        const allFilled = positions.every(
            (p) => typedLetters.value[p] && typedLetters.value[p] !== '',
        );

        if (allFilled) {
            playedChunks.value.add(ci);
            const url = getPhonemeAudioUrl(chunk.phoneme);
            if (url) {
                phonemeAudio.value.src = url;
                phonemeAudio.value.play().catch(() => {});
            }
            break; // Play at most one chunk per keystroke
        }
    }
}

// ============================================================================
// Input Handlers
// ============================================================================

function handleLetterInput(letter: string): void {
    if (isLocked.value || !question.value) return;

    const lc = letter.toLowerCase();
    if (!/^[a-z]$/.test(lc)) return;

    if (fixPending.value) {
        handleFixInput(lc);
        return;
    }

    const q = question.value;
    const pos = cursorPosition.value;

    if (!cursorInGap.value) {
        // Letter mode: replace in-place, stay on letter
        const newLetters = [...typedLetters.value];
        newLetters[pos] = lc;
        typedLetters.value = newLetters;
        checkChunkCompletion(pos);
        return;
    }

    // --- Gap mode: splice-insert at cursor position ---

    // Length cap
    if (config.value.showBlanks && typedLetters.value.length >= q.word.length) return;
    if (!config.value.showBlanks && typedLetters.value.length >= 20) return;

    if (config.value.rejectWrongKeys) {
        const expected = q.word[pos];
        if (expected && lc !== expected.toLowerCase()) {
            return;
        }
    }

    // Splice the letter in at the gap position
    const newLetters = [...typedLetters.value];
    newLetters.splice(pos, 0, lc);
    typedLetters.value = newLetters;

    // Advance to the next gap (after the newly inserted letter)
    cursorPosition.value = pos + 1;
    cursorInGap.value = true;

    checkChunkCompletion(pos);

    // Levels 0–2: auto-submit when all blanks are filled
    if (!config.value.requireEnterToSubmit && config.value.showBlanks) {
        if (typedLetters.value.length >= q.word.length) {
            let allFilled = true;
            for (let i = 0; i < q.word.length; i++) {
                if (!typedLetters.value[i]) { allFilled = false; break; }
            }
            if (allFilled) doSubmit();
        }
    }
}

function handleBackspace(): void {
    if (isLocked.value || fixPending.value) return;
    backspaceChain = backspaceChain.then(doBackspace);
}

async function doBackspace(): Promise<void> {
    if (isLocked.value) return;

    if (!cursorInGap.value) {
        // Letter mode: remove the letter under cursor, go to gap at same position
        const pos = cursorPosition.value;
        await blanksRef.value?.animateCollapseAt(pos);
        const newLetters = [...typedLetters.value];
        newLetters.splice(pos, 1);
        typedLetters.value = newLetters;
        cursorInGap.value = true;
        // cursorPosition stays — now points to the gap where the letter was
        return;
    }

    // Gap mode: remove letter to the LEFT of the gap
    const pos = cursorPosition.value;
    if (pos <= 0) return; // nothing to the left
    await blanksRef.value?.animateCollapseAt(pos - 1);
    const newLetters = [...typedLetters.value];
    newLetters.splice(pos - 1, 1);
    typedLetters.value = newLetters;
    cursorPosition.value = pos - 1;
    cursorInGap.value = true;
}

function handleEnter(): void {
    if (isLocked.value || fixPending.value) return;
    if (!config.value.requireEnterToSubmit) return;
    if (!isComplete.value) return;
    doSubmit();
}

function handleArrowLeft(): void {
    if (isLocked.value || fixPending.value) return;

    if (!cursorInGap.value) {
        // Letter → gap to the left (same index)
        cursorInGap.value = true;
        return;
    }

    // Gap → letter to the left
    if (cursorPosition.value <= 0) return;
    cursorPosition.value--;
    cursorInGap.value = false;
}

function handleArrowRight(): void {
    if (isLocked.value || fixPending.value) return;

    if (!cursorInGap.value) {
        // Letter → gap to the right
        cursorPosition.value++;
        cursorInGap.value = true;
        return;
    }

    // Gap → letter to the right
    if (cursorPosition.value >= typedLetters.value.length) return;
    cursorInGap.value = false;
}

// ============================================================================
// Retry — Optimistic Masking
// ============================================================================

/**
 * Compare user's attempt against the correct word.
 * Returns an array of correct-word length: matched positions get the correct
 * letter, unmatched positions get ''.
 *
 * Two-pass approach (same as framework fillIn):
 * 1. Exact positional matches
 * 2. Displaced character scavenge (right-to-left)
 */
function computeMaskedWord(attempt: string, correct: string): string[] {
    const result: string[] = new Array(correct.length).fill('');
    const attemptChars = attempt.toLowerCase().split('');

    // Pass 1: exact position matches
    for (let i = 0; i < correct.length; i++) {
        if (i < attemptChars.length && attemptChars[i] === correct[i]) {
            result[i] = correct[i];
            attemptChars[i] = ''; // consumed
        }
    }

    // Pass 2: displaced matches (right-to-left)
    for (let i = correct.length - 1; i >= 0; i--) {
        if (result[i] !== '') continue; // already matched
        const idx = attemptChars.indexOf(correct[i]);
        if (idx !== -1) {
            result[i] = correct[i];
            attemptChars[idx] = ''; // consumed
        }
    }

    return result;
}

// ============================================================================
// Submission
// ============================================================================

async function doSubmit(): Promise<void> {
    if (isLocked.value || !question.value) return;

    const q = question.value;

    // Set scaffold metadata on the question before framework grading
    q.achievedLevel = level.value;
    q.scoreCeiling = scoreCeiling.value;

    const answer = currentAnswer.value;
    const correct = answer.toLowerCase() === q.word;

    if (correct) {
        // Lock immediately so user can't type during celebration
        isLocked.value = true;
        if (keyboard) keyboard.updateConfig({ disabled: true });

        // Celebrate the typed letters before submitting
        await runCelebration();

        // Submit through framework (emits response, advances card)
        questionUtils.submitAnswer(answer);
        return;
    }

    // Reads back as the word: correct for the session, then fix the spelling
    const phonetic = gradeSpelling(q.word, q.phonetics, answer).phonetic;
    if (phonetic) {
        await runPhoneticFix(answer, phonetic);
        return;
    }

    // Wrong answer — submit through framework pipeline
    questionUtils.submitAnswer(answer);
    const attempts = questionUtils.priorAttempts.value;

    if (attempts >= 3) {
        // Max attempts — lock and show final feedback
        isLocked.value = true;
        if (keyboard) keyboard.updateConfig({ disabled: true });
        showResult.value = true;
        return;
    }

    // --- Retry flow — show hint below input, user edits their own answer ---

    // HeadShake wrong letters (fire-and-forget)
    shakeWrongLetters(answer, q.word);

    if (attempts === 1) {
        retryMode.value = 'partial';
        retryDisplay.value = computeMaskedWord(answer, q.word);
    } else if (attempts === 2) {
        retryMode.value = 'full';
        retryDisplay.value = q.word.split('');
    }

    // Replay word audio as reminder
    playWordAudio();
}

/**
 * Run staggered celebration on all typed LetterPeople.
 * Shows eyes, then each letter celebrates with a staggered delay.
 */
async function runCelebration(): Promise<void> {
    const instances = blanksRef.value?.getLetterInstances() ?? [];
    const letters = instances.filter((l): l is NonNullable<typeof l> => l !== null);
    if (letters.length === 0) return;

    // Show eyes + mouth on all letters so celebrate animations have full expression
    await Promise.all(
        letters.flatMap((letter) => [
            letter.eyes.show({ duration: 150 }),
            letter.mouth.show({ duration: 150 }),
        ]),
    );

    // Staggered celebration — 60ms between each letter
    const STAGGER_MS = 60;
    await Promise.all(
        letters.map((letter, i) =>
            new Promise<void>((resolve) =>
                setTimeout(async () => {
                    await celebrateLetter(letter, { type: 'random' });
                    resolve();
                }, i * STAGGER_MS),
            ),
        ),
    );
}

// ============================================================================
// Phonetic Fix
// ============================================================================

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Await an animation, but never longer than `ms`. LetterPeople controllers
 * stop animations with anime's revert(), and a reverted animation's promise
 * never settles; the fix sequence must not hang on one.
 */
async function settle(p: Promise<unknown> | undefined, ms: number, step: string): Promise<void> {
    let timedOut = false;
    await Promise.race([
        Promise.resolve(p).catch((e) => console.warn(`[SpellingQuestionView] phonetic fix: ${step} failed`, e)),
        wait(ms).then(() => (timedOut = true)),
    ]);
    if (timedOut) console.warn(`[SpellingQuestionView] phonetic fix: ${step} timed out after ${ms}ms`);
}

/** Colour of respelled letters while they float above the word. */
const RESPELLED_COLOR = '#f44336';

/** Floater ids per respelled group, dismissed once the group is retyped. */
let fixFloats: { wordIdx: number[]; ids: number[] }[] = [];

/**
 * The answer spells every sound right with some wrong letters. Record it as
 * correct (the card advances only on `ready-to-advance`), then:
 *   1. focus the respelled letters and have them speak their sounds;
 *   2. colour them and float them above the word while their slots close;
 *   3. grow blanks for the word's letters as the guide word appears below.
 * The learner then types the blanks (handleFixInput).
 */
async function runPhoneticFix(answer: string, match: PhoneticMatch): Promise<void> {
    const q = question.value;
    const blanks = blanksRef.value;
    if (!q || !blanks) return;

    isLocked.value = true;
    inPhoneticFix.value = true;
    if (keyboard) keyboard.updateConfig({ disabled: true });
    questionUtils.submitAnswer(answer, undefined, { deferAdvance: true });

    const respelled = match.groups.filter((g) => !g.same);
    const answerIdx = respelled.flatMap((g) => g.answer.letters);
    const wordIdx = [...new Set(respelled.flatMap((g) => g.word.letters))].sort((a, b) => a - b);
    fixLetters.value = new Set(wordIdx);

    try {
        // 1. Focus and speak
        await settle(focusLetters(new Set(answerIdx)), 1500, 'focus');
        await wait(400);
        for (const group of respelled) {
            for (const part of group.answer.parts) {
                await settle(speakPart(part.letters, part.phonemes), 2500, `speak ${part.phonemes.join(' ')}`);
                await wait(300);
            }
        }
        await wait(400);

        // 2. Colour and float; their boxes stay, now blank
        fixFloats = [];
        for (const group of respelled) {
            fixFloats.push({ wordIdx: group.word.letters, ids: blanks.floatLetters(group.answer.letters, RESPELLED_COLOR) });
        }
        typedLetters.value = typedLetters.value.map((ch, i) => (answerIdx.includes(i) ? '' : ch));
        await wait(700);
        unfocusLetters();
        await wait(300);

        // 3. One change: the boxes fit the word, the guide appears, and the
        // keyboard narrows to the first needed key (input stays off for now)
        retryMode.value = 'full';
        retryDisplay.value = q.word.split('');
        if (keyboard) keyboard.updateConfig({ enabledLetters: [q.word[wordIdx[0]]] });
        await settle(fitSlots(q.word.split('').map((ch, t) => (wordIdx.includes(t) ? '' : ch))), 2000, 'fit slots');
        await wait(300);
        await settle(Promise.all(fixFloats.map((f) => blanks.moveFloatsOver(f.ids, f.wordIdx))), 1500, 'align floats');
    } catch (e) {
        // Whatever went wrong, the learner still gets the fix
        console.error('[SpellingQuestionView] phonetic fix sequence failed', e);
        typedLetters.value = q.word.split('').map((ch, t) => (wordIdx.includes(t) ? '' : ch));
        retryMode.value = 'full';
        retryDisplay.value = q.word.split('');
    }

    fixPending.value = wordIdx;
    cursorPosition.value = wordIdx[0];
    cursorInGap.value = false;
    isLocked.value = false;
    configureFixKeyboard();
}

/** Dim every letter but the respelled ones, which get faces. */
async function focusLetters(respelledAnswerIdx: Set<number>): Promise<void> {
    const instances = blanksRef.value?.getLetterInstances() ?? [];
    const focused = instances.filter((letter, i) => letter && respelledAnswerIdx.has(i));
    instances.forEach((letter, i) => {
        if (letter && !respelledAnswerIdx.has(i)) {
            animate(letter.svgElement, { opacity: 0.3, duration: 400, ease: 'outQuad' });
        }
    });
    // Faces first, then the expression (shakeWrongLetters' order)
    await Promise.all(focused.flatMap((l) => [l!.eyes.show({ duration: 300 }), l!.mouth.show({ duration: 300 })]));
    for (const l of focused) l!.eyes.brows?.express('happy', { duration: 250 });
}

/** Undim the word. The inline opacity is cleared after the fade either way, so no letter stays dim. */
function unfocusLetters(): void {
    for (const letter of blanksRef.value?.getLetterInstances() ?? []) {
        if (!letter) continue;
        const el = letter.svgElement;
        animate(el, { opacity: 1, duration: 400, ease: 'outQuad' });
        setTimeout(() => (el.style.opacity = ''), 450);
    }
}

/** One GPC of the answer says its sound: the first letter with audio, the rest mouthing along. */
async function speakPart(letters: number[], phonemes: string[]): Promise<void> {
    const instances = blanksRef.value?.getLetterInstances() ?? [];
    const speakers = letters.map((i) => instances[i]).filter((l): l is NonNullable<typeof l> => !!l);
    if (!speakers.length || !phonemes.length) return;

    let audioUrl: string[];
    try {
        audioUrl = [getPhonemeAudioUrl(toPhonemeAudioKey(phonemes.join(' ')))];
    } catch {
        audioUrl = phonemes.map((p) => getPhonemeAudioUrl(toPhonemeAudioKey(p)));
    }
    await Promise.all(
        speakers.map((letter, k) => speakPhoneme(letter, k === 0 ? { audioUrl, pulseDuration: 300 } : { pulseDuration: 300 })),
    );
}

/**
 * Fit the boxes to `target` (the word, '' at the blanks), reusing the blank
 * boxes the floated letters left. Between each pair of kept letters, a run
 * of blanks grows or shrinks to the word's count: "fone" [_] o n e gains a
 * box for ph; "necst" n e [_][_] t loses one for x. Growing and shrinking run
 * together. SpellingBlanks tracks one insertion or removal per tick, so the
 * splices are serial: inserts at the end of a run, removals from the end.
 */
async function fitSlots(target: string[]): Promise<void> {
    const blanks = blanksRef.value;
    if (config.value.showBlanks || !blanks) {
        // Fixed slots: answer and word are the same length
        typedLetters.value = target;
        return;
    }

    /** Runs of '' before each kept letter, and after the last. */
    const runs = (letters: string[]) => {
        const out: { start: number; len: number }[] = [];
        let start = 0;
        letters.forEach((ch, i) => {
            if (ch !== '') {
                out.push({ start, len: i - start });
                start = i + 1;
            }
        });
        out.push({ start, len: letters.length - start });
        return out;
    };
    const have = runs(typedLetters.value);
    const want = runs(target);

    if (have.length === want.length) {
        const grows: { at: number; count: number }[] = [];
        const shrinks: number[] = [];
        have.forEach((run, k) => {
            const d = want[k].len - run.len;
            if (d > 0) grows.push({ at: run.start + run.len, count: d });
            for (let n = 0; n < -d; n++) shrinks.push(run.start + run.len - 1 - n);
        });

        const collapsing = Promise.all(shrinks.map((i) => blanks.animateCollapseAt(i, 500)));
        for (const g of [...grows].sort((a, b) => b.at - a.at)) {
            for (let n = 0; n < g.count; n++) {
                const next = [...typedLetters.value];
                next.splice(g.at, 0, '');
                typedLetters.value = next;
                await nextTick();
            }
        }
        await settle(collapsing, 1000, 'shrink slots');
        // The shrunk boxes moved right by whatever grew before them
        const shifted = shrinks.map((i) => i + grows.filter((g) => g.at <= i).reduce((n, g) => n + g.count, 0));
        for (const i of shifted.sort((a, b) => b - a)) {
            const next = [...typedLetters.value];
            next.splice(i, 1);
            typedLetters.value = next;
            await nextTick();
        }
    }

    if (typedLetters.value.join(',') !== target.join(',')) {
        console.warn('[SpellingQuestionView] phonetic reshape drifted; resetting', typedLetters.value, target);
        typedLetters.value = target;
    }
}

/**
 * During the fix, only the next missing letter can be typed. The layout is
 * left as it is (no requestConfig): keys only dim, nothing re-flows.
 */
function configureFixKeyboard(): void {
    const q = question.value;
    const pending = fixPending.value;
    if (!keyboard || !q || !pending?.length) return;
    keyboard.updateConfig({ enabledLetters: [q.word[pending[0]]], disabled: false });
}

function handleFixInput(lc: string): void {
    const q = question.value;
    const pending = fixPending.value;
    if (!q || !pending?.length) return;

    const pos = pending[0];
    if (lc !== q.word[pos]) return;

    const next = [...typedLetters.value];
    next[pos] = lc;
    typedLetters.value = next;

    // A group fully retyped: its floating letters go
    const rest = pending.slice(1);
    const done = fixFloats.filter((f) => f.wordIdx.every((t) => !rest.includes(t)));
    fixFloats = fixFloats.filter((f) => !done.includes(f));
    if (done.length) void blanksRef.value?.dismissFloats(done.flatMap((f) => f.ids));

    fixPending.value = rest;
    if (rest.length) {
        cursorPosition.value = rest[0];
        configureFixKeyboard();
    } else {
        void finishPhoneticFix();
    }
}

async function finishPhoneticFix(): Promise<void> {
    fixPending.value = null;
    isLocked.value = true;
    cursorInGap.value = true;
    cursorPosition.value = typedLetters.value.length;
    if (keyboard) keyboard.updateConfig({ disabled: true });

    // SpellingBlanks creates the last letter a tick after its watcher runs
    await nextTick();
    await nextTick();
    await wait(250);
    await runCelebration();
    emit('ready-to-advance');
}

/**
 * HeadShake the LetterPeople at wrong positions (fire-and-forget).
 * Compares answer against correct word positionally.
 */
async function shakeWrongLetters(answer: string, correct: string): Promise<void> {
    const instances = blanksRef.value?.getLetterInstances() ?? [];
    const answerLc = answer.toLowerCase();

    const wrongLetters: NonNullable<typeof instances[0]>[] = [];
    for (let i = 0; i < answerLc.length; i++) {
        if (i >= correct.length || answerLc[i] !== correct[i]) {
            const letter = instances[i];
            if (letter) wrongLetters.push(letter);
        }
    }

    if (wrongLetters.length === 0) return;

    // Show eyes + mouth first, then set sad expression and shake
    await Promise.all(
        wrongLetters.flatMap((letter) => [
            letter.eyes.show({ duration: 100 }),
            letter.mouth.show({ duration: 100 }),
        ]),
    );

    for (const letter of wrongLetters) {
        letter.mouth.updateShape({ openness: 0.05, mood: 0.2 }, { duration: 150 });
        letter.eyes.brows?.express('sad', { duration: 150 });
        headShakeNo(letter, { cycles: 2, angle: 10, speed: 1.2, showExpression: false });
    }
}

// ============================================================================
// Native Keyboard Listener (Backspace)
// ============================================================================

function handleNativeKeydown(e: KeyboardEvent): void {
    if (props.preview) return;
    if (e.key === 'Backspace') {
        // When backspace is on the keyboard, the keyboard owns physical
        // Backspace (press animation + onBackspace); handling it here too
        // would delete twice.
        if (keyboard?.activeLetters.value.includes('backspace')) return;
        e.preventDefault();
        handleBackspace();
    }
}

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Configure keyboard for letter input (called at mount for non-demo levels,
 * or after demo completes for Level 0).
 */
/**
 * The keys input mode enables: the board's letters, arrows and backspace,
 * plus Enter once there's something to submit (Level 3's board). The one
 * source for both configureInputKeyboard and the isComplete watcher, so a
 * key added to the board can't silently stay disabled after the first toggle.
 */
function inputEnabledLetters(q: SpellingQuestion, complete: boolean): string[] {
    const editKeys = ['arrowleft', 'arrowright', 'backspace'];
    if (config.value.restrictKeyboard) {
        return [...new Set(q.word.split('')), ...editKeys];
    }
    const enabled = [...keyboard!.baseLetters.value, ...editKeys];
    if (complete) enabled.push('enter');
    return enabled;
}

function configureInputKeyboard(): void {
    if (!keyboard) return;
    const q = question.value;
    if (!q) return;

    if (config.value.restrictKeyboard) {
        // Levels 0–1: only correct letters + special keys
        const uniqueLetters = [...new Set(q.word.split(''))];
        keyboard.requestConfig({
            letters: [...uniqueLetters, 'arrowleft', 'arrowright', 'backspace'],
            enabledLetters: inputEnabledLetters(q, isComplete.value),
            overrideBase: true,
            showAdvance: true,
            advanceColor: '#2196f3',
            advanceText: 'mdi-volume-high',
            showFullLayout: false,
            disabled: false,
        });
    } else {
        // Levels 2–3: full user layout + special keys
        const base = keyboard.baseLetters.value;
        keyboard.requestConfig({
            letters: [...base, 'enter', 'arrowleft', 'arrowright', 'backspace'],
            enabledLetters: inputEnabledLetters(q, isComplete.value),
            overrideBase: false,
            showAdvance: true,
            advanceColor: '#2196f3',
            advanceText: 'mdi-volume-high',
            showFullLayout: true,
            disabled: false,
            keyColors: {
                enter: SUBMIT_KEY_COLOR,
            },
        });
    }
}

/**
 * Subscribe to keyboard events for letter input.
 * Called once at mount — handlers check phase/locked state internally.
 */
function subscribeKeyboardEvents(): void {
    if (!keyboard) return;

    const unsubTap = keyboard.onKeyTap((event) => {
        if (isLocked.value || phase.value === 'demo') return;
        handleLetterInput(event.letter);
    });
    keyboardUnsubscribers.push(unsubTap);

    const unsubEnter = keyboard.onEnter(() => {
        if (isLocked.value || phase.value === 'demo') return;
        handleEnter();
    });
    keyboardUnsubscribers.push(unsubEnter);

    const unsubArrowLeft = keyboard.onArrowLeft(() => {
        if (isLocked.value || phase.value === 'demo') return;
        handleArrowLeft();
    });
    keyboardUnsubscribers.push(unsubArrowLeft);

    const unsubArrowRight = keyboard.onArrowRight(() => {
        if (isLocked.value || phase.value === 'demo') return;
        handleArrowRight();
    });
    keyboardUnsubscribers.push(unsubArrowRight);

    // Backspace key, on-screen or physical (the keyboard claims physical
    // Backspace while the key is on the board; see handleNativeKeydown).
    const unsubBackspace = keyboard.onBackspace(() => {
        if (isLocked.value || phase.value === 'demo') return;
        handleBackspace();
    });
    keyboardUnsubscribers.push(unsubBackspace);
}

onMounted(() => {
    // Initialize question via framework pipeline
    questionUtils.question.value = new SpellingQuestion(props.data);

    // Subscribe to keyboard events (always — handlers gate on phase)
    subscribeKeyboardEvents();

    if (phase.value === 'demo') {
        // Level 0: PhoneticWord owns keyboard during demo.
        // No requestConfig needed — PhoneticWord configures spacebar via its
        // keyboardContext prop. Input keyboard configured in handleDemoComplete.
    } else {
        // Levels 1–3: go straight to input
        configureInputKeyboard();
    }

    // Native keyboard listener for Backspace
    document.addEventListener('keydown', handleNativeKeydown);

    // Play word audio on mount (after a short delay for UI to settle)
    // For Level 0, this plays before the demo stepping begins.
    // Skipped in preview — audio plays only on explicit tap.
    if (!props.preview) {
        setTimeout(() => {
            playWordAudio();
        }, 300);
    }
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleNativeKeydown);

    // Unsubscribe keyboard events
    for (const unsub of keyboardUnsubscribers) {
        unsub();
    }
    keyboardUnsubscribers.length = 0;

    // NOTE: Do NOT call keyboard.clearQuestionConfig() here.
    // With transition-mode="default", the new question's onMounted fires
    // before the old question's onUnmounted — clearing here would wipe
    // the new question's config. The next question's requestConfig overwrites.
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

// Enable/disable enter key based on whether there's input to submit
watch(isComplete, (complete) => {
    const q = question.value;
    if (!keyboard || !q || inPhoneticFix.value || phase.value === 'demo') return;
    keyboard.updateConfig({ enabledLetters: inputEnabledLetters(q, complete) });
});
</script>

<style scoped>
.spelling-question {
    /* Query container, as in the other question views: the compact title
       below follows the question's width (the narrow /exercises demo frame),
       not the viewport's. width: 100% gives the containment a definite size. */
    container: sq-q / inline-size;
    width: 100%;
    text-align: center;
    padding: 16px;
}

.sq-header {
    margin-bottom: 8px;
    transition: opacity 400ms ease-out;
}

.sq-faded {
    opacity: 0;
    pointer-events: none;
}

/* Title: shared across the four question views (1.5rem; 1.1rem when the
   question is ≤600px wide). Keep in step with the others. */
.sq-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #333;
    margin: 0;
}

.sq-audio-controls {
    margin-bottom: 24px;
    transition: opacity 400ms ease-out;
}

/* ---------- Demo phase (Level 0) ---------- */

.sq-demo-area {
    margin-bottom: 24px;
}

.sq-demo-instruction {
    font-size: 1rem;
    color: #666;
    margin: 0 0 16px 0;
}

/* ---------- Retry masked word ---------- */

/* Sized off the slot height SpellingBlanks would give the word (its --sb-h,
   same formula at the word's length), as MissingLetters' correction row. */
.sq-retry-area {
    --sq-h: clamp(
        80px,
        min(
            100cqi / (var(--sq-n) * 0.85 + (var(--sq-n) - 1) * 0.08),
            100dvh - 580px /* SQ_CHROME, as SpellingBlanks */
        ),
        240px
    );
    margin: 12px 0;
    opacity: 0;
    transition: opacity 200ms ease-out;
}

.sq-retry-area--visible {
    opacity: 1;
}

.sq-retry-word {
    display: flex;
    justify-content: center;
    gap: calc(var(--sq-h) * 0.06);
}

/* Smaller than the slots relative to the old 45×55: it has to fit above the
   keyboard too (SQ_CHROME). */
.sq-retry-letter {
    width: max(38px, calc(var(--sq-h) * 0.27));
    height: max(46px, calc(var(--sq-h) * 0.32));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: max(1.2rem, calc(var(--sq-h) * 0.18));
    font-weight: 700;
    color: #2e7d32;
    background: #e8f5e9;
    border-radius: 8px;
    border: 2px solid #c8e6c9;
}

.sq-retry-letter--fix {
    color: #1565c0;
    background: #e3f2fd;
    border-color: #90caf9;
}

.sq-retry-letter--blank {
    color: transparent;
    background: #fff3e0;
    border-color: #ffe0b2;
    border-style: dashed;
}

/* ---------- Feedback ---------- */

.sq-feedback {
    font-size: 1.5rem;
    font-weight: 600;
    padding: 14px 28px;
    border-radius: 12px;
    margin-bottom: 16px;
    display: inline-block;
}

.sq-feedback--incorrect {
    background: #ffebee;
    color: #c62828;
}

.sq-feedback-text {
    line-height: 1.4;
}

/* ---------- Correction display ---------- */

/* ---------- Responsive ---------- */

@container sq-q (max-width: 600px) {
    .sq-title {
        font-size: 1.1rem;
    }
}

</style>