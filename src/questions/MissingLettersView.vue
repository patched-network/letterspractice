<!--
  MissingLettersView.vue — Fill-in-the-blanks word completion exercise

  Displays a word with some letters visible (as LetterPeople) and some blanked
  out. The learner fills in the missing letters using the keyboard.

  Key behaviours (closely mirrors SpellingQuestion Level 3, with differences):
  - All letter positions rendered as fixed-width boxes
  - Pre-filled letters shown as LetterPeople (non-interactive)
  - Blank slots show an underline decoration that persists even after filling
  - Cursor moves ONLY between writable (blank) slots — no in-between gap mode
  - Typing fills the current blank, cursor advances to next blank
  - Arrow keys move between blank slots only
  - Backspace clears current blank and moves to previous blank
  - Auto-submit when all blanks are filled (recoup time from toddlers)
  - Correct answer triggers LetterPeople celebration
  - Wrong answer shows per-letter feedback with correction display

  Audio mode:
  - Toggles between 'playphoneme' and 'playword' on each play
  - Resets to 'playphoneme' on cursor move
  - Constrained to 'playword' when cursor is on a filled blank
  - Audio button visually tracks current mode:
    - playphoneme: sized like a letter box, positioned above active blank
    - playword: extends to full width of all letter boxes
  - On card load: full-width (word playback), then shrinks to focused mode

  Framework wiring via useViewable + useQuestionView. Keyboard context integration.
  Word audio plays on mount and via animated audio button (spacebar).
-->

<template>
    <div class="missing-letters" :style="{ '--ml-n': slots.length || 1 }">
        <!-- Header -->
        <div class="ml-header">
            <h2 class="ml-title">Fill in the Missing Letters</h2>
        </div>

        <!-- Blanks + sound cue wrapper (for relative positioning) -->
        <div
            ref="blanksWrapperRef"
            class="ml-blanks-wrapper"
            :class="{ 'ml-blanks-wrapper--rail': soundCueStyle === 'rail' }"
            @click="handleRailTap"
        >
            <!-- The sound cue: the rail under the word (soundRail.ts), or the overhead button.
                 No drag here (the blank's sound is a priced assist). The given letters'
                 milestones play on a tap or their number key (handleRailTap / playTeam). -->
            <SoundRail
                v-if="soundCueStyle === 'rail' && rail.view.value"
                v-bind="rail.view.value"
                interactive
                @puck-click="handleAudioButtonClick"
            />
            <!-- RETIRE(overhead-audio-button): this button, and .ml-audio-btn* -->
            <button
                v-else-if="soundCueStyle === 'button'"
                ref="audioButtonRef"
                class="ml-audio-btn"
                :class="{
                    'ml-audio-btn--playing': isPlayingAudio || isPlayingPhoneme,
                    'ml-audio-btn--phoneme': audioMode === 'playphoneme' && !isInitialPlay,
                    'ml-audio-btn--word': audioMode === 'playword' || isInitialPlay,
                }"
                :style="audioButtonStyle"
                :disabled="isPlayingAudio || isPlayingPhoneme"
                @click="handleAudioButtonClick"
            >
                <v-icon size="22">mdi-volume-high</v-icon>
            </button>

            <!-- Letter slots -->
            <div ref="blanksRowRef" class="ml-blanks">
                <div
                    v-for="(slot, index) in slots"
                    :key="'slot-' + index"
                    :ref="(el) => setSlotElRef(el as Element | null, index)"
                    class="ml-slot"
                    :class="{
                        'ml-slot--filled': !!slot.letter,
                        'ml-slot--prefilled': !slot.isBlank,
                        'ml-slot--blank': slot.isBlank,
                        'ml-slot--active': slot.isBlank && blankCursorPosition === blankIndexOf(index) && !showResult && !isLocked,
                        'ml-slot--phoneme-playing': slot.isBlank && blankCursorPosition === blankIndexOf(index) && isPlayingPhoneme,
                        'ml-slot--correct': showResult && slot.isBlank && perBlankResults[blankIndexOf(index)] === true,
                        'ml-slot--incorrect': showResult && slot.isBlank && perBlankResults[blankIndexOf(index)] === false,
                    }"
                >
                    <!-- LetterPerson container -->
                    <div
                        :ref="(el) => setSlotRef(el as Element | null, index)"
                        class="ml-letter-container"
                        :class="{
                            'ml-letter-container--blink': slot.isBlank && blankCursorPosition === blankIndexOf(index) && !showResult && !isLocked,
                        }"
                    ></div>

                    <!-- Vertical blinking cursor — active empty blanks only -->
                    <div
                        v-if="slot.isBlank && !slot.letter && blankCursorPosition === blankIndexOf(index) && !showResult && !isLocked"
                        class="ml-cursor"
                    ></div>

                    <!-- Persistent underline for blank slots -->
                    <div
                        v-if="slot.isBlank"
                        class="ml-blank-underline"
                        :class="{
                            'ml-blank-underline--active': blankCursorPosition === blankIndexOf(index) && !showResult && !isLocked,
                            'ml-blank-underline--correct': showResult && perBlankResults[blankIndexOf(index)] === true,
                            'ml-blank-underline--incorrect': showResult && perBlankResults[blankIndexOf(index)] === false,
                        }"
                    ></div>
                </div>
            </div>
        </div>

        <!-- Correction display: show expected word with per-letter comparison -->
        <div v-if="showResult && !isCorrect && question" class="ml-correction">
            <div
                v-for="(letter, index) in question.letters"
                :key="'corr-' + index"
                class="ml-correction-letter"
                :class="{
                    'ml-correction-letter--wrong': question.isBlank(index) && perBlankResults[blankIndexOf(index)] === false,
                    'ml-correction-letter--given': !question.isBlank(index),
                }"
            >
                {{ letter.toUpperCase() }}
            </div>
        </div>

        <!-- Hidden audio elements -->
        <audio ref="audioElement" @ended="onWordAudioEnded" @error="isPlayingAudio = false" />
        <audio ref="phonemeAudio" @ended="onPhonemeAudioEnded" @error="isPlayingPhoneme = false" />
        <audio ref="teamAudio" @ended="onTeamAudioEnded" @error="onTeamAudioEnded" />
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'MissingLettersView' });

import {
    ref,
    computed,
    watch,
    onMounted,
    onUnmounted,
    nextTick,
    type PropType,
    type CSSProperties,
} from 'vue';
import { ViewData } from '@vue-skuilder/common';
import { useViewable, useQuestionView } from '@vue-skuilder/courseware';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';
import type { Unsubscribe } from '../composables/keyboardContext.types';
import { MissingLetters } from './MissingLetters';
import { createLetter } from '../letterpeople';
import type { LetterInstance } from '../letterpeople';
import { generateVibrancyRainbow, oklchToRgb } from '../letterpeople/util/color';
import { getKeyDefinition } from '../components/keyboard/keyboardLayout';
import { celebrate as celebrateLetter, sayNo, speakPhoneme } from '../letterpeople/animations';
import { animate } from 'animejs';
import { getPhonemeAudioUrl } from '../services/phonetics/phonemeCache';
import { analyzeAttempt } from '../services/phonetics/contextualPhoneme';
import SoundRail from '../lessons/SoundRail.vue';
import { soundCueStyle } from '../lessons/soundRail';
import { useSoundRail, type RailTeam } from '../lessons/useSoundRail';
import { isTouchOnlyDevice } from '../utils/deviceDetection';
import type { ActorBounds } from '../lessons/lessonActor';

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
     *   - no word-audio autoplay on mount (audio plays only on explicit tap)
     * Visuals and interaction are unchanged. (The framework submit pipeline is
     * a no-op without a parent session, so it is left in place — mirrors
     * WhoSaidThatView.)
     *
     * NOTE: letter entry flows ONLY through the keyboard context; with no
     * keyboard provider (as on the landing page) the word renders with its
     * blank(s) and the audio button works, but blanks can't be filled. Becomes
     * fully interactive once a ProgressiveKeyboard is wired into the walkthrough.
     */
    preview: {
        type: Boolean,
        default: false,
    },

    // --- Time-based option-shaving (anti-hang) ---
    // Premise: sessions are timeboxed (~2-5 min); staring at a single blank is a
    // large loss. Rather than dead-end a stumped learner, we thin the enabled
    // keyboard in a FEW gentle, well-spaced waves on a per-blank timer, and price
    // the assist into the ELO score (see MissingLetters.markBlankTimeAssisted) so
    // the skill re-surfaces later instead of blocking here.
    //
    // Deliberately restrained: each wave is an attention-grabbing change that
    // pulls focus from phonetic decoding to "what just changed?". So we start
    // late, space widely, take only a small bite each time, and cap the number
    // of waves — favouring stillness. This is a nudge, not a march to the answer;
    // the guaranteed-win endgame remains the attempt-count final scaffold.
    /** Master switch for the shaving behaviour. */
    shaveEnabled: {
        type: Boolean,
        default: true,
    },
    /** Idle time on a blank before the first narrowing wave (ms). */
    shaveFirstDelayMs: {
        type: Number,
        default: 15000,
    },
    /** Gap between subsequent narrowing waves (ms). */
    shaveIntervalMs: {
        type: Number,
        default: 15000,
    },
    /** Maximum narrowing waves per blank (stillness cap — not a march to the answer). */
    shaveMaxWaves: {
        type: Number,
        default: 2,
    },
    /**
     * Which decoys each wave removes:
     *   'random'    — dim a random subset (target stays un-spotlighted longest)
     *   'geometric' — keep a contiguous keycap cluster around the answer
     * Scoring is binary and identical either way; this is purely UX feel.
     */
    shaveStrategy: {
        type: String as PropType<'random' | 'geometric'>,
        default: 'random',
    },
    /**
     * DIM fade duration (ms) while this card is active — how slowly a keycap
     * grays as a shave wave removes it. Longer than the keyboard's 400ms default
     * so waves fade gradually rather than snapping. Reset on unmount via
     * clearQuestionConfig.
     */
    shaveDisableTransitionMs: {
        type: Number,
        default: 2000,
    },
    /**
     * RESTORE fade duration (ms) — how quickly keycaps re-brighten when the
     * board is restored (moving to the next blank, backspace). Kept snappy so
     * the fresh blank doesn't feel laggy after the slow dim.
     */
    shaveEnableTransitionMs: {
        type: Number,
        default: 400,
    },
});

const emit = defineEmits<{
    (e: 'emitResponse', ...args: any[]): void;
}>();

// ============================================================================
// Framework Wiring
// ============================================================================

const viewableUtils = useViewable(props, emit as any, 'MissingLettersView');
const questionUtils = useQuestionView<MissingLetters>(viewableUtils);

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
const phonemeAudio = ref<HTMLAudioElement | null>(null);
const isLocked = ref(false);

// --- Audio mode ---
/**
 * Audio mode state machine:
 *   onCursorMove → set mode 'playphoneme'
 *   if cursorLocation.isFilled → constrain mode 'playword'
 *   onPlayPhoneme → set mode 'playword'
 *   onPlayWord → set mode 'playphoneme'
 */
type AudioMode = 'playphoneme' | 'playword';
const audioMode = ref<AudioMode>('playphoneme');
const isPlayingPhoneme = ref(false);
const isInitialPlay = ref(true);

// --- Blank input state ---
const typedBlanks = ref<string[]>([]);
const blankCursorPosition = ref(0);

// Letters proven wrong this card — removed from the keyboard so they can't be
// reused. A letter that belongs in some blank (typed into the wrong slot, or a
// repeated letter) is never disabled; see correctBlankLetters.
const disabledLetters = ref<Set<string>>(new Set());

// On the final permitted attempt we scaffold the learner to a guaranteed win:
// only the correct letter for the current blank is pressable (pulsed to draw
// the eye). This turns the old flash-and-vanish "you failed" moment into a
// successful interaction. The framework still records it as a retry — the card
// requeues (marked-failed) for a fresh full-keyboard look later this session.
const isFinalAttempt = ref(false);

// --- Time-based option-shaving state ---
// Accumulator-based timer: ticks every SHAVE_TICK_MS, accruing elapsed time
// ONLY while not paused (audio playing, locked mid-animation, result shown, or
// already in the attempt-triggered final scaffold). Wave N fires once elapsed
// crosses shaveFirstDelayMs + N*shaveIntervalMs. This makes "pause during audio"
// and "freeze during the wrong-answer sequence" fall out for free.
const SHAVE_TICK_MS = 200;
let shaveTimer: ReturnType<typeof setInterval> | null = null;
let shaveElapsed = 0;
// Waves applied to the CURRENT blank. Exposed for the debug view's readout.
const shaveWavesApplied = ref(0);
// The transient survivor set for the current blank (letters still enabled),
// or null when the blank hasn't been shaved yet. Reset per blank so one blank's
// narrowing never bleeds into the next.
let shaveSurvivors: string[] | null = null;

// --- Letter rendering ---
const slotContainers = ref<(HTMLElement | null)[]>([]);
const letterInstances = ref<(LetterInstance | null)[]>([]);
const colors = ref<string[]>([]);
// Random hue that seeds this card's whole palette. The word letters, the
// keyboard keycaps, and the audio button's complement all derive from it so the
// scene reads as one coordinated color scheme per card.
const paletteStartHue = ref(0);
// Complement of the palette (opposite side of the wheel), used to tint the audio
// playback / spacebar button so it stands apart from the letter/keycap rainbow.
const audioAccentColor = ref('#2196f3');

// --- DOM refs for audio button positioning ---
const blanksWrapperRef = ref<HTMLElement | null>(null);
const blanksRowRef = ref<HTMLElement | null>(null);
const audioButtonRef = ref<HTMLElement | null>(null);
const slotElements = ref<(HTMLElement | null)[]>([]);

// --- Audio button position state (animated via anime.js) ---
const audioButtonLeft = ref(0);
const audioButtonWidth = ref(0);
const audioButtonTop = ref(0);
const audioButtonReady = ref(false);

// Handle to the in-flight button animation so it can be cancelled by the ResizeObserver
let activeButtonAnim: { pause: () => void } | null = null;
// ResizeObserver that re-tracks button position whenever the blanks row reflows
let blanksRowObserver: ResizeObserver | null = null;
// Suppress watch-triggered button animations until this timestamp (cursor-advance settle window)
let suppressButtonUntil = 0;
// Block ResizeObserver instant-snaps while waiting for origin slot to finish expanding
let awaitingCursorAdvanceSettle = false;

// ============================================================================
// Computed
// ============================================================================

/** Sorted blank positions from the question */
const blankPositions = computed(() => question.value?.blanks ?? []);

/** Total number of blanks */
const blankCount = computed(() => blankPositions.value.length);

/** Map from word position to blank index (-1 if not a blank) */
function blankIndexOf(wordPos: number): number {
    return blankPositions.value.indexOf(wordPos);
}

/** Lowercased set of letters that correctly fill some blank in this word */
const correctBlankLetters = computed<Set<string>>(() => {
    const q = question.value;
    if (!q) return new Set();
    return new Set(
        q.blanks
            .map((pos) => q.word[pos]?.toLowerCase())
            .filter((l): l is string => !!l),
    );
});

/** Slot descriptors for the template */
const slots = computed(() => {
    const q = question.value;
    if (!q) return [];

    return q.letters.map((letter, index) => {
        const isBlank = q.isBlank(index);
        const blankIdx = isBlank ? blankIndexOf(index) : -1;
        const typedLetter = isBlank && blankIdx >= 0 ? typedBlanks.value[blankIdx] : undefined;

        return {
            index,
            originalLetter: letter,
            isBlank,
            blankIdx,
            letter: isBlank ? (typedLetter || '') : letter,
        };
    });
});

/** Whether all blanks have been filled */
const allFilled = computed(() => {
    if (blankCount.value === 0) return false;
    return typedBlanks.value.length >= blankCount.value &&
        typedBlanks.value.every((l) => l && l !== '');
});

/** Build the answer string (blank letters in order) */
const currentAnswer = computed(() => {
    return typedBlanks.value.join('');
});

/** Whether the current answer is correct */
const isCorrect = computed(() => {
    if (!question.value || !showResult.value) return false;
    return question.value.checkAnswer(currentAnswer.value);
});

/**
 * Per-blank results: true (correct), false (wrong).
 * Indexed by blank order (not word position).
 */
const perBlankResults = computed<(boolean | undefined)[]>(() => {
    if (!showResult.value || !question.value) return [];

    return blankPositions.value.map((pos, i) => {
        const expected = question.value!.word[pos]?.toLowerCase();
        const typed = typedBlanks.value[i]?.toLowerCase();
        if (!typed) return false;
        return typed === expected;
    });
});

/** Computed style for the audio button position/size */
const audioButtonStyle = computed<CSSProperties>(() => {
    if (!audioButtonReady.value) {
        return { opacity: 0, backgroundColor: audioAccentColor.value };
    }
    return {
        left: `${audioButtonLeft.value}px`,
        width: `${audioButtonWidth.value}px`,
        top: `${audioButtonTop.value}px`,
        backgroundColor: audioAccentColor.value,
    };
});

// ============================================================================
// Sound rail (the 'rail' cue style): the same two-way toggle as the button
// ============================================================================
//
// One milestone per sound, under the slots. Sound mode: the speaker rests on
// the active blank's sound. Word mode: it stretches over every milestone. It's
// only a button: a press plays what it's on (handleAdvance), no drag.

/** Bumped whenever the button would be re-placed: the slots may have moved. */
const railTick = ref(0);

/**
 * Whether the learner has met split teams (the split-digraphs lesson, passed
 * or dismissed). Until then a split team's silent e gets a milestone of its
 * own, pale, and its vowel stands alone: the rail doesn't bracket a-e as one
 * sound before that's been taught (todo-minor #12). ML cards on such words
 * reach learners before the lesson whenever the blank is another letter
 * (c-ml-cake-0 is gated only by concept:match:simple).
 *
 * Loaded lazily (not in preview: no learner, and it keeps the DB and the
 * curriculum out of the landing page's bundle). Unknown counts as not met.
 */
const splitTeamsMet = ref(false);

async function loadSplitTeamsMet(): Promise<void> {
    const [{ getLessonProgress }, { isLessonPassed }] = await Promise.all([
        import('../services/userState'),
        import('../services/lessons'),
    ]);
    splitTeamsMet.value = isLessonPassed('split-digraphs', await getLessonProgress());
}

function isSilentE(effect: unknown): boolean {
    return Array.isArray(effect) ? effect.includes('silent-e') : effect === 'silent-e';
}

/** The rail's sounds: one per chunk, except a split team the learner hasn't met (above). */
function railTeams(q: MissingLetters): { teams: RailTeam<number>[]; quiet: Set<number> } {
    const teams: RailTeam<number>[] = [];
    const quiet = new Set<number>();
    q.chunks.forEach((c, k) => {
        const ids = Object.keys(c.letters).map(Number);
        const silent = ids.filter((i) => isSilentE(c.letters[i]));
        if (splitTeamsMet.value || !silent.length || silent.length === ids.length) {
            teams.push({ ids, key: k });
            return;
        }
        teams.push({ ids: ids.filter((i) => !silent.includes(i)), key: k });
        for (const i of silent) {
            teams.push({ ids: [i], key: `${k}-silent-${i}` });
            quiet.add(i);
        }
    });
    // Spelling order: the e comes after the letters between it and its vowel
    teams.sort((a, b) => Math.min(...a.ids) - Math.min(...b.ids));
    return { teams, quiet };
}

const railTeamsNow = computed(() => (question.value ? railTeams(question.value) : null));

// ---- The given letters' milestones play on their own (todo-minor #10) ----
//
// A tap on one, or its number key, plays its sound: free, as its letters are
// already shown. The blank's sound stays where it was: the speaker resting on
// it (spacebar), priced. Numbers go by the sound's place in the word, so the
// blank's number (under the speaker) plays the blank's sound, priced, as the
// spacebar would; a silent e has no number. Replaying a given sound leaves the
// speaker and the spacebar's toggle alone.

/**
 * Number keys on the milestones when a hardware keyboard is likely, a small
 * speaker on a touch screen. A key pressed on a real keyboard switches to
 * numbers for the rest of the card.
 */
const showKeyBadges = ref(!isTouchOnlyDevice());

const teamAudio = ref<HTMLAudioElement | null>(null);
/** The given sound replaying now (its team key), or null. */
const playingTeam = ref<unknown>(null);

/** A team's number: its place among the word's sounding teams (1-based), or null (silent). */
function teamNumber(team: RailTeam<number>): number | null {
    const list = railTeamsNow.value;
    if (!list || team.ids.every((i) => list.quiet.has(i))) return null;
    const sounding = list.teams.filter((t) => !t.ids.every((i) => list.quiet.has(i)));
    const k = sounding.findIndex((t) => t.key === team.key);
    return k >= 0 ? k + 1 : null;
}

/** Every letter of the team is given (none is a blank). */
function teamIsGiven(team: RailTeam<number>): boolean {
    return team.ids.every((i) => !blankPositions.value.includes(i));
}

function phonemeOfTeam(team: RailTeam<number>): string | null {
    const q = question.value;
    if (!q) return null;
    const chunk = q.chunks.find((c) => Object.keys(c.letters).map(Number).includes(team.ids[0]));
    return chunk ? getPhonemeAudioUrl(chunk.phoneme) : null;
}

/** Play a sound by its team: a given one freely; the cursor's blank as the spacebar would. */
function playTeam(team: RailTeam<number>): void {
    if (isLocked.value || showResult.value) return;
    if (isPlayingAudio.value || isPlayingPhoneme.value) {
        rail.nudge();
        return;
    }
    if (!teamIsGiven(team)) {
        const cursorPos = blankPositions.value[blankCursorPosition.value];
        if (team.ids.includes(cursorPos) && !typedBlanks.value[blankCursorPosition.value]) {
            playCurrentBlankPhoneme();
        } else {
            rail.nudge();
        }
        return;
    }
    const url = phonemeOfTeam(team);
    const el = teamAudio.value;
    if (!url || !el) return;
    el.pause();
    playingTeam.value = team.key;
    rail.speaking.value = team.key;
    el.src = url;
    el.play().catch(() => onTeamAudioEnded());
    void mouthTeam(team);
}

/** Given letters that have put on a face to say their sound, and when it comes off. */
const mouthing = new Map<number, ReturnType<typeof setTimeout> | null>();
const FACE_HOLD_MS = 700;

/**
 * The team's letters say the sound: each puts on a face and mouths it, while
 * teamAudio plays it. Just eyes and mouth (no brows), and the eyes open from
 * shut rather than fading in open. A silent e in the team stays still.
 * The face comes off a moment after the sound, unless the card has ended
 * (the celebration wants it).
 */
async function mouthTeam(team: RailTeam<number>): Promise<void> {
    const chunk = question.value?.chunks.find((c) => Object.keys(c.letters).map(Number).includes(team.ids[0]));
    const speakers = team.ids.filter((i) => !isSilentE(chunk?.letters[i]));
    await Promise.all(
        speakers.map(async (i) => {
            const letter = letterInstances.value[i];
            if (!letter) return;
            const pending = mouthing.get(i);
            if (pending) clearTimeout(pending);
            mouthing.set(i, null);
            if (!letter.mouth.isVisible()) {
                await Promise.all([
                    letter.eyes.left.open({ duration: 160 }),
                    letter.eyes.right.open({ duration: 160 }),
                    letter.mouth.show({ duration: 120 }),
                ]);
            }
            await speakPhoneme(letter, { pulseDuration: 300 });
        }),
    );
}

/** The face comes off the letters that said a given sound (see mouthTeam). */
function unmouthSoon(): void {
    for (const [i, pending] of mouthing) {
        if (pending) continue;
        mouthing.set(
            i,
            setTimeout(() => {
                mouthing.delete(i);
                const letter = letterInstances.value[i];
                if (!letter || showResult.value) return;
                void letter.eyes.left.close({ duration: 150 });
                void letter.eyes.right.close({ duration: 150 });
                void letter.mouth.hide({ duration: 200 });
            }, FACE_HOLD_MS),
        );
    }
}

function onTeamAudioEnded(): void {
    playingTeam.value = null;
    rail.speaking.value = null;
    unmouthSoon();
}

/** A tap on the rail, off the speaker: the milestone under it plays (playTeam). */
function handleRailTap(e: MouseEvent): void {
    const wrapper = blanksWrapperRef.value;
    const list = railTeamsNow.value;
    if (!wrapper || !list || soundCueStyle.value !== 'rail') return;
    const r = wrapper.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (rail.onPuck(x, y)) return; // the speaker's own click
    const id = rail.pickInBand(x, y, 0);
    if (id === undefined || id === null) return;
    const team = list.teams.find((t) => t.ids.includes(id));
    if (team && teamNumber(team) !== null) playTeam(team);
}

/** A number key: the sound in that place in the word (playTeam). */
function handleNumberKey(n: number): void {
    const list = railTeamsNow.value;
    if (!list) return;
    const team = list.teams.find((t) => teamNumber(t) === n);
    if (team) playTeam(team);
}

function measureSlotBox(wordPos: number): ActorBounds | null {
    const wrapper = blanksWrapperRef.value;
    const el = slotElements.value[wordPos];
    if (!wrapper || !el) return null;
    const w = wrapper.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width < 1) return null;
    return { left: r.left - w.left, right: r.right - w.left, top: r.top - w.top, bottom: r.bottom - w.top };
}

const rail = useSoundRail<number>({
    input: () => {
        void railTick.value;
        const q = question.value;
        if (!q || !audioButtonReady.value) return null;
        const boxes = new Map<number, ActorBounds>();
        q.letters.forEach((_, i) => {
            const b = measureSlotBox(i);
            if (b) boxes.set(i, b);
        });
        const { teams: chunks, quiet } = railTeamsNow.value ?? { teams: [], quiet: new Set<number>() };
        // No phonetics: one milestone (a press plays the word anyway)
        const teams: RailTeam<number>[] = chunks.length
            ? chunks.map((t) => {
                  const n = teamNumber(t);
                  if (n === null || !teamIsGiven(t)) return t;
                  return { ...t, mark: showKeyBadges.value && n <= 9 ? { key: String(n) } : 'speaker' };
              })
            : [{ ids: [...boxes.keys()], key: 0 }];
        // As the button: the word on the first play, in word mode, and on a filled blank.
        // Not once every blank is filled (the answer is in, or the card is over):
        // the speaker stays on the last blank's sound rather than stretching over
        // the word as it's checked and celebrated (todo-minor #10).
        const wordPos = blankPositions.value[blankCursorPosition.value];
        const settled = allFilled.value || showResult.value;
        const word =
            !settled &&
            (isInitialPlay.value ||
                audioMode.value === 'playword' ||
                wordPos === undefined ||
                !!typedBlanks.value[blankCursorPosition.value]);
        const cue = word || wordPos === undefined ? -1 : teams.findIndex((t) => t.ids.includes(wordPos));
        return { boxes, teams, quiet, dock: false, cue: cue >= 0 ? cue : 'all' };
    },
    accent: () => audioAccentColor.value,
    playing: () => isPlayingAudio.value || isPlayingPhoneme.value,
    cueSpeaking: () => isPlayingAudio.value || isPlayingPhoneme.value,
});

// ============================================================================
// Audio Button Positioning
// ============================================================================

/**
 * Measure the full-width bounds of the blanks row relative to the wrapper.
 */
function measureFullWidth(): { left: number; width: number } {
    const wrapper = blanksWrapperRef.value;
    const row = blanksRowRef.value;
    if (!wrapper || !row) return { left: 0, width: 200 };

    const wrapperRect = wrapper.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    return {
        left: rowRect.left - wrapperRect.left,
        width: rowRect.width,
    };
}

/**
 * Measure the bounds of a specific slot (by word position) relative to the wrapper.
 */
function measureSlotBounds(wordPos: number): { left: number; width: number } {
    const wrapper = blanksWrapperRef.value;
    const slotEl = slotElements.value[wordPos];
    if (!wrapper || !slotEl) {
        return measureFullWidth();
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();

    return {
        left: slotRect.left - wrapperRect.left,
        width: slotRect.width,
    };
}

/**
 * Compute the target position/width/top for the audio button based on current mode.
 *
 * top=0  → sits at the top of the padded area (playword: more breathing room above letters)
 * top=12 → descends closer to the letterbox (playphoneme: snug above the active blank)
 */
function computeAudioButtonTarget(): { left: number; width: number; top: number } {
    if (isInitialPlay.value || audioMode.value === 'playword') {
        return { ...measureFullWidth(), top: 0 };
    }

    // playphoneme mode: position above the active blank, descended
    const cursorPos = blankCursorPosition.value;
    if (cursorPos >= 0 && cursorPos < blankPositions.value.length) {
        const wordPos = blankPositions.value[cursorPos];
        return { ...measureSlotBounds(wordPos), top: 12 };
    }

    return { ...measureFullWidth(), top: 0 };
}

/**
 * Animate the audio button to its target position.
 */
function animateAudioButton(instant = false, duration = 250): void {
    if (showResult.value) return;
    if (Date.now() < suppressButtonUntil) return;

    const target = computeAudioButtonTarget();
    railTick.value++;

    if (instant || !audioButtonReady.value) {
        activeButtonAnim?.pause();
        activeButtonAnim = null;
        audioButtonLeft.value = target.left;
        audioButtonWidth.value = target.width;
        audioButtonTop.value = target.top;
        audioButtonReady.value = true;
        return;
    }

    activeButtonAnim?.pause();
    activeButtonAnim = null;

    // Use anime.js to animate the reactive refs via a proxy object
    const proxy = {
        left: audioButtonLeft.value,
        width: audioButtonWidth.value,
        top: audioButtonTop.value,
    };

    activeButtonAnim = animate(proxy, {
        left: target.left,
        width: target.width,
        top: target.top,
        duration,
        ease: 'outQuad',
        onUpdate: () => {
            audioButtonLeft.value = proxy.left;
            audioButtonWidth.value = proxy.width;
            audioButtonTop.value = proxy.top;
        },
        onComplete: () => { activeButtonAnim = null; },
    }) as { pause: () => void };
}

// Watch mode/cursor changes to reposition the audio button
watch([audioMode, blankCursorPosition, isInitialPlay], () => {
    if (audioButtonReady.value) {
        nextTick(() => animateAudioButton());
    }
});

// During the final attempt, keep the guided keycap in step with the cursor as
// the learner fills each blank (or arrows between them).
watch(blankCursorPosition, () => {
    if (isFinalAttempt.value) {
        applyFinalAttemptKeyboard();
        return;
    }
    // New blank under the cursor → fresh shave clock and restored keyboard.
    restartShaveForCurrentBlank();
});

// Keep the live keyboard fade durations in sync when the props change (used by
// the debug view's fade controls; a no-op in production where they're fixed).
watch(
    () => [props.shaveDisableTransitionMs, props.shaveEnableTransitionMs],
    ([dim, restore]) =>
        keyboard?.updateConfig({
            disableTransitionMs: dim,
            enableTransitionMs: restore,
        }),
);

// ============================================================================
// Audio
// ============================================================================

function onPhonemeAudioEnded(): void {
    isPlayingPhoneme.value = false;
    // Now that the phoneme has finished, transition to word mode so next press plays the full word
    audioMode.value = 'playword';
}

function onWordAudioEnded(): void {
    isPlayingAudio.value = false;

    // After initial word playback, clear the initial flag
    if (isInitialPlay.value) {
        isInitialPlay.value = false;
    }

    // After any word playback, next press → phoneme
    audioMode.value = 'playphoneme';
}

async function playWordAudio(): Promise<void> {
    if (!question.value || !audioElement.value) return;

    isPlayingAudio.value = true;
    audioElement.value.src = question.value.audioUrl;
    try {
        await audioElement.value.play();
    } catch (e) {
        console.error('[MissingLettersView] Failed to play word audio:', e);
        isPlayingAudio.value = false;
    }
}

/**
 * Play the phoneme for the letter at the current blank cursor position.
 * Falls back to word audio if no phonetics available.
 */
function playCurrentBlankPhoneme(): void {
    if (!question.value) return;

    const wordPos = blankPositions.value[blankCursorPosition.value];
    if (wordPos === undefined) return;

    const chunk = question.value.chunks.find((c) =>
        Object.keys(c.letters).map(Number).includes(wordPos),
    );

    if (chunk && phonemeAudio.value) {
        const url = getPhonemeAudioUrl(chunk.phoneme);
        if (url) {
            isPlayingPhoneme.value = true;
            phonemeAudio.value.src = url;
            phonemeAudio.value.play().catch(() => {
                isPlayingPhoneme.value = false;
            });
            // Record the assist: hearing the isolated target sound makes this
            // blank easier, so evaluate() caps the ELO-facing score for it.
            question.value.markBlankPhonemeRevealed(wordPos);
            return;
        }
    }

    // Fallback: play the full word
    playWordAudio();
}

/**
 * Single spacebar/button dispatch.
 *
 * Mode state machine:
 *   if cursorLocation.isFilled → always playword (don't imply typed letter = target phoneme)
 *   else if mode === 'playword' → playWordAudio() (sets mode → playphoneme)
 *   else → playCurrentBlankPhoneme() (sets mode → playword)
 */
function handleAdvance(): void {
    const isFilled = !!typedBlanks.value[blankCursorPosition.value];
    if (isFilled || audioMode.value === 'playword') {
        playWordAudio();
    } else {
        playCurrentBlankPhoneme();
    }
}

/** Click handler for the audio button */
function handleAudioButtonClick(): void {
    if (!isPlayingAudio.value && !isPlayingPhoneme.value) {
        handleAdvance();
    } else {
        rail.nudge(); // the rail's speaker shakes its head: not while it's playing
    }
}

// ============================================================================
// Letter Rendering
// ============================================================================

function setSlotRef(el: Element | null, index: number): void {
    if (el instanceof HTMLElement) {
        slotContainers.value[index] = el;
    } else {
        slotContainers.value[index] = null;
    }
}

function setSlotElRef(el: Element | null, index: number): void {
    if (el instanceof HTMLElement) {
        slotElements.value[index] = el;
    } else {
        slotElements.value[index] = null;
    }
}

function generateColors(): void {
    const randomStartHue = Math.random() * 360;
    paletteStartHue.value = randomStartHue;
    colors.value = generateVibrancyRainbow(26, 0.7, 0.15, randomStartHue);
    // Audio/spacebar button = the palette's complement (+180°), rendered a touch
    // darker + more saturated than the keycap rainbow (l 0.55 vs 0.7) so the
    // white volume icon keeps its contrast across every possible start hue.
    audioAccentColor.value = oklchToRgb(0.55, 0.16, (randomStartHue + 180) % 360);
}

/**
 * Per-letter keycap colors: the palette sweeps left→right across the *physical*
 * keyboard (each key's normalized x already folds in the QWERTY stagger), and it
 * spans the *same narrow hue band the target word occupies* rather than a full
 * rainbow. The word colors its letters from a 26-step rainbow starting at
 * `paletteStartHue`, so an N-letter word covers only (N-1)·(360/26)°. Reusing
 * that width tints the whole board into the current word's color family, so the
 * keyboard visually correlates with the word on screen. Same lightness/chroma as
 * the word keeps it coherent; ProgressiveKeyboard derives hover/pressed variants.
 */
function buildKeyColorMap(): Record<string, string> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const xs = letters.map((l) => getKeyDefinition(l)?.x ?? 0.5);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const span = maxX - minX || 1;

    // Track the word's gradient width — the same per-letter hue step the word
    // uses (360/26), across (wordLength − 1) steps — then widen it a bit so the
    // keyboard's drift is actually perceptible while still living in the word's
    // color neighborhood. Leftmost key starts at the word's first-letter hue.
    const hueStep = 360 / 26;
    const KEYCAP_WIDEN = 1.1; // multiple of the word's own gradient width
    const wordLen = question.value?.letters.length ?? 1;
    const hueSweep = Math.max(0, wordLen - 1) * hueStep * KEYCAP_WIDEN;

    const map: Record<string, string> = {};
    letters.forEach((l, i) => {
        const t = (xs[i] - minX) / span; // 0 = leftmost key, 1 = rightmost key
        const hue = (paletteStartHue.value + t * hueSweep) % 360;
        map[l] = oklchToRgb(0.7, 0.15, hue);
    });
    return map;
}

function createLetterAt(index: number, letter: string, animated = false): void {
    const container = slotContainers.value[index];
    if (!container) return;

    // Destroy existing if any
    destroyLetterAt(index);

    const slotEl = container.parentElement as HTMLElement | null;

    // Capture the slot's current layout width before injecting the SVG
    let startWidth = 0;
    if (animated && slotEl) {
        startWidth = slotEl.offsetWidth;
        slotEl.style.width = `${startWidth}px`;
        slotEl.style.minWidth = '0';
        slotEl.style.overflow = 'hidden';
    }

    try {
        const instance = createLetter(
            letter.toLowerCase(),
            container,
            {
                color: colors.value[index] || '#faf',
                lineWidth: 20,
                borderWidth: 2,
                showEyes: false,
                showMouth: false,
            },
        );
        letterInstances.value[index] = instance;

        if (animated && slotEl) {
            // Let the slot relax to its natural width to measure it
            slotEl.style.width = 'auto';
            slotEl.style.minWidth = '';
            slotEl.style.overflow = '';
            const targetWidth = slotEl.offsetWidth;

            if (targetWidth > startWidth) {
                // Re-clamp and animate the expansion
                slotEl.style.width = `${startWidth}px`;
                slotEl.style.minWidth = '0';
                slotEl.style.overflow = 'hidden';

                animate(slotEl, {
                    width: [startWidth, targetWidth],
                    duration: 150,
                    ease: 'outQuad',
                    onComplete: () => {
                        slotEl.style.width = '';
                        slotEl.style.minWidth = '';
                        slotEl.style.overflow = '';
                    },
                });
            }
        }
    } catch (e) {
        console.warn(`[MissingLettersView] Failed to create letter "${letter}" at index ${index}:`, e);
        letterInstances.value[index] = null;
        if (animated && slotEl) {
            slotEl.style.width = '';
            slotEl.style.minWidth = '';
            slotEl.style.overflow = '';
        }
    }
}

function destroyLetterAt(index: number): void {
    const instance = letterInstances.value[index];
    if (instance) {
        instance.destroy();
        letterInstances.value[index] = null;
    }
}

/**
 * Render all pre-filled letters and any already-typed blank letters.
 */
function renderAllLetters(): void {
    const q = question.value;
    if (!q) return;

    for (let i = 0; i < q.word.length; i++) {
        if (!q.isBlank(i)) {
            // Pre-filled: always render
            nextTick(() => createLetterAt(i, q.word[i]));
        } else {
            // Blank: render if typed
            const blankIdx = blankIndexOf(i);
            const typed = typedBlanks.value[blankIdx];
            if (typed) {
                nextTick(() => createLetterAt(i, typed));
            }
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

    // Ignore letters already disabled for being wrong on a previous attempt.
    if (disabledLetters.value.has(lc)) return;

    const cursorPos = blankCursorPosition.value;
    if (cursorPos < 0 || cursorPos >= blankCount.value) return;

    // On the final attempt, only the current blank's correct letter is accepted
    // — from any input source (guards against a physical keypress bypassing the
    // on-screen keyboard's enabled-letter clamp).
    if (isFinalAttempt.value) {
        const wordPos = blankPositions.value[cursorPos];
        if (lc !== question.value.word[wordPos]?.toLowerCase()) return;
    }

    // Fill the current blank
    const newBlanks = [...typedBlanks.value];
    newBlanks[cursorPos] = lc;
    typedBlanks.value = newBlanks;

    // Render the letter at the word position
    const wordPos = blankPositions.value[cursorPos];
    nextTick(() => createLetterAt(wordPos, lc, true));

    // Advance to next blank (if any)
    if (cursorPos < blankCount.value - 1) {
        blankCursorPosition.value = cursorPos + 1;
        // Cursor moved → playphoneme, unless the new position is already filled
        const nextIsFilled = !!typedBlanks.value[blankCursorPosition.value];
        audioMode.value = nextIsFilled ? 'playword' : 'playphoneme';

        // Wait for the origin slot to finish expanding before measuring the destination.
        // suppressButtonUntil blocks the watch's nextTick; awaitingCursorAdvanceSettle
        // blocks the ResizeObserver's instant-snap — both held until the setTimeout fires.
        suppressButtonUntil = Date.now() + 150;
        awaitingCursorAdvanceSettle = true;
        setTimeout(() => {
            awaitingCursorAdvanceSettle = false;
            animateAudioButton();
        }, 160);
    }

    // Auto-submit when all blanks are filled.
    // Delayed past the slot-expansion animation (150ms) so the audio button has time
    // to track the grown slot before showResult freezes it.
    if (allFilled.value) {
        setTimeout(() => doSubmit(), 170);
    }
}

function handleBackspace(): void {
    if (isLocked.value || !question.value) return;

    const cursorPos = blankCursorPosition.value;
    if (cursorPos < 0 || cursorPos >= blankCount.value) return;

    // If current blank is filled, clear it
    if (typedBlanks.value[cursorPos]) {
        const newBlanks = [...typedBlanks.value];
        newBlanks[cursorPos] = '';
        typedBlanks.value = newBlanks;

        // Destroy the letter at this word position
        const wordPos = blankPositions.value[cursorPos];
        destroyLetterAt(wordPos);

        // Now empty → reset to playphoneme, and give the shave clock a fresh
        // start (the learner is re-attempting this same blank).
        audioMode.value = 'playphoneme';
        restartShaveForCurrentBlank();
        return;
    }

    // If current blank is empty, move to previous blank and clear it
    if (cursorPos > 0) {
        blankCursorPosition.value = cursorPos - 1;
        const prevBlankIdx = cursorPos - 1;
        if (typedBlanks.value[prevBlankIdx]) {
            const newBlanks = [...typedBlanks.value];
            newBlanks[prevBlankIdx] = '';
            typedBlanks.value = newBlanks;

            const wordPos = blankPositions.value[prevBlankIdx];
            destroyLetterAt(wordPos);
        }
        audioMode.value = 'playphoneme';
    }
}

function handleArrowLeft(): void {
    if (isLocked.value) return;
    if (blankCursorPosition.value > 0) {
        blankCursorPosition.value--;
        // Cursor moved → reset to playphoneme, unless on a filled blank
        const isFilled = !!typedBlanks.value[blankCursorPosition.value];
        audioMode.value = isFilled ? 'playword' : 'playphoneme';
    }
}

function handleArrowRight(): void {
    if (isLocked.value) return;
    if (blankCursorPosition.value < blankCount.value - 1) {
        blankCursorPosition.value++;
        // Cursor moved → reset to playphoneme, unless on a filled blank
        const isFilled = !!typedBlanks.value[blankCursorPosition.value];
        audioMode.value = isFilled ? 'playword' : 'playphoneme';
    }
}

// ============================================================================
// Submission
// ============================================================================

async function doSubmit(): Promise<void> {
    if (isLocked.value || !question.value) return;

    // Any submission ends the current blank's shave clock; the wrong-answer path
    // restarts it after the animation sequence unlocks.
    stopShaveTimer();

    const answer = currentAnswer.value;
    const correct = question.value.checkAnswer(answer);

    if (correct) {
        isLocked.value = true;
        if (keyboard) {
            keyboard.clearAllHighlights();
            keyboard.updateConfig({ disabled: true });
        }

        showResult.value = true;
        await runCelebration();

        questionUtils.submitAnswer(answer);
        return;
    }

    // Wrong answer
    questionUtils.submitAnswer(answer);
    const attempts = questionUtils.priorAttempts.value;
    const maxAttempts = questionUtils.maxAttemptsPerView.value;

    // Out of attempts — the framework dismisses the card. (With the final-attempt
    // scaffold below this is effectively unreachable in normal play, since the
    // last attempt is guided to a correct answer; kept as a safety net.)
    if (attempts >= maxAttempts) {
        isLocked.value = true;
        if (keyboard) {
            keyboard.clearAllHighlights();
            keyboard.updateConfig({ disabled: true });
        }
        showResult.value = true;
        return;
    }

    // Entering the final permitted attempt: scaffold to a guaranteed win rather
    // than let the learner dead-end into the (already-recorded) failure. Enter
    // the mode immediately so every non-target keycap fades in the same beat as
    // the just-pressed wrong key — not after the sayNo/collapse animations. The
    // cursor-move watcher re-targets the guided key once the cleared blank is
    // focused below.
    if (attempts >= maxAttempts - 1) {
        isFinalAttempt.value = true;
        applyFinalAttemptKeyboard();
    }

    // Identify wrong blank indices
    const wrongBlankIndices: number[] = [];
    for (let i = 0; i < blankPositions.value.length; i++) {
        const pos = blankPositions.value[i];
        const expected = question.value!.word[pos]?.toLowerCase();
        const typed = typedBlanks.value[i]?.toLowerCase();
        if (typed !== expected) wrongBlankIndices.push(i);
    }

    // Disable letters proven wrong so they can't be reused. Skip any letter that
    // correctly fills some blank in this word — it may just be in the wrong slot
    // (a swap, or a repeated letter), and disabling it could make the card
    // unsolvable.
    let disabledChanged = false;
    for (const bi of wrongBlankIndices) {
        const typed = typedBlanks.value[bi]?.toLowerCase();
        if (typed && !correctBlankLetters.value.has(typed) && !disabledLetters.value.has(typed)) {
            disabledLetters.value.add(typed);
            disabledChanged = true;
        }
    }
    if (disabledChanged) {
        disabledLetters.value = new Set(disabledLetters.value); // trigger reactivity
        if (keyboard) keyboard.updateConfig({ enabledLetters: enabledKeyList() });
    }

    // Lock during animation sequence
    isLocked.value = true;

    // sayNo for each wrong letter in sequence (awaited)
    await sayNoWrongLetters(wrongBlankIndices);

    // Play word audio as contrast cue (fire-and-forget)
    playWordAudio();

    // Collapse wrong slots back to empty size, then clear data
    for (const bi of wrongBlankIndices) {
        await collapseLetterAt(blankPositions.value[bi]);
    }
    const newBlanks = [...typedBlanks.value];
    for (const bi of wrongBlankIndices) newBlanks[bi] = '';
    typedBlanks.value = newBlanks;

    // Move cursor to first cleared blank and unlock. When in final-attempt mode
    // this cursor change fires the watcher, re-targeting the guided keycap to the
    // blank the learner will actually fill.
    if (wrongBlankIndices.length > 0) {
        blankCursorPosition.value = wrongBlankIndices[0];
        audioMode.value = 'playphoneme';
    }
    isLocked.value = false;

    // Restart the shave clock for the blank the learner will re-attempt. (The
    // cursor-move watcher bailed above because isLocked was still true, and it
    // won't fire at all when the first wrong blank is the current position.) In
    // final-attempt mode the board is already scaffolded — leave it alone.
    if (!isFinalAttempt.value) {
        restartShaveForCurrentBlank();
    }
}

// ============================================================================
// Celebration
// ============================================================================

async function runCelebration(): Promise<void> {
    const allInstances = letterInstances.value.filter(
        (l): l is NonNullable<typeof l> => l !== null,
    );
    if (allInstances.length === 0) return;

    // Show eyes + mouth on all
    await Promise.all(
        allInstances.flatMap((letter) => [
            letter.eyes.show({ duration: 150 }),
            letter.mouth.show({ duration: 150 }),
        ]),
    );

    // Staggered celebration
    const STAGGER_MS = 60;
    await Promise.all(
        allInstances.map((letter, i) =>
            new Promise<void>((resolve) =>
                setTimeout(async () => {
                    await celebrateLetter(letter, { type: 'random' });
                    resolve();
                }, i * STAGGER_MS),
            ),
        ),
    );
}

/**
 * sayNo in sequence for each wrong blank letter, voiced with the sound the
 * typed letter makes IN THIS CONTEXT — decoded from the letter string the
 * learner actually produced (soft c before e/i/y, split-digraph long vowels,
 * digraph merges, r-controlled teams), falling back to the letter's canonical
 * sound when the position can't be decoded. See services/phonetics/contextualPhoneme.
 */
async function sayNoWrongLetters(wrongBlankIndices: number[]): Promise<void> {
    const q = question.value;
    if (!q || wrongBlankIndices.length === 0) return;

    // The string the learner assembled (all blanks are filled at submit time)
    const attempted = q.letters
        .map((letter, pos) => {
            const bi = blankIndexOf(pos);
            return bi >= 0 ? typedBlanks.value[bi] || letter : letter;
        })
        .join('');
    const analysis = analyzeAttempt(attempted, q.phonetics);

    // One decode segment can span two wrong blanks (typed letters merging into
    // a digraph, e.g. c+h) — voice that sound once, on its first blank.
    const voicedSpans = new Set<number>();

    const wrongEntries = wrongBlankIndices
        .map((bi) => {
            const wordPos = blankPositions.value[bi];
            const instance = letterInstances.value[wordPos];
            if (!instance) return null;

            const sound = analysis.positions[wordPos];
            // NOTE: sound.matchesTarget flags "wrong letter, exact target
            // sound" (k for c) — accepted incoherence for now; reserved for a
            // distinct affirm-then-redirect treatment.
            let audioUrl: string | string[] | undefined;
            if (sound && sound.audioUrls.length > 0 && !voicedSpans.has(sound.span.start)) {
                voicedSpans.add(sound.span.start);
                audioUrl =
                    sound.audioUrls.length === 1 ? sound.audioUrls[0] : sound.audioUrls;
            }

            return { instance, audioUrl };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

    if (wrongEntries.length === 0) return;

    // Show eyes + mouth on all simultaneously
    await Promise.all(
        wrongEntries.flatMap(({ instance }) => [
            instance.eyes.show({ duration: 100 }),
            instance.mouth.show({ duration: 100 }),
        ]),
    );

    // sayNo in sequence, each with its phoneme audio
    for (const { instance, audioUrl } of wrongEntries) {
        await sayNo(instance, { speakCount: 1, speed: 1.2, audioUrl });
    }
}

/**
 * Animate a filled slot collapsing back to its empty width, then destroy
 * the letter instance. Mirror of the grow-in animation in createLetterAt.
 */
async function collapseLetterAt(wordPos: number): Promise<void> {
    const container = slotContainers.value[wordPos];
    const slotEl = container?.parentElement as HTMLElement | null;

    if (!slotEl) {
        destroyLetterAt(wordPos);
        return;
    }

    // Lock at current (filled) width
    const filledWidth = slotEl.offsetWidth;
    slotEl.style.width = `${filledWidth}px`;
    slotEl.style.minWidth = '0';
    slotEl.style.overflow = 'hidden';

    // Remove SVG — slot stays locked at filledWidth
    destroyLetterAt(wordPos);

    // Measure natural empty width (no SVG, no min-width constraint)
    slotEl.style.width = 'auto';
    const emptyWidth = slotEl.offsetWidth;
    slotEl.style.width = `${filledWidth}px`; // re-lock for animation start

    await new Promise<void>((resolve) => {
        animate(slotEl, {
            width: [filledWidth, emptyWidth],
            duration: 150,
            ease: 'outQuad',
            onComplete: () => {
                slotEl.style.width = '';
                slotEl.style.minWidth = '';
                slotEl.style.overflow = '';
                resolve();
            },
        });
    });
}

// ============================================================================
// Native Keyboard Listener (Backspace + Spacebar fallback)
// ============================================================================

function handleNativeKeydown(e: KeyboardEvent): void {
    // A real keyboard is here: show the milestones' number keys
    if (!e.isComposing && e.key.length === 1) showKeyBadges.value = true;
    if (/^[1-9]$/.test(e.key) && !e.repeat && soundCueStyle.value === 'rail') {
        e.preventDefault();
        handleNumberKey(Number(e.key));
        return;
    }
    if (e.key === 'Backspace') {
        // When backspace is on the keyboard, the keyboard owns physical
        // Backspace (press animation + onBackspace); handling it here too
        // would delete twice.
        if (keyboard?.activeLetters.value.includes('backspace')) return;
        e.preventDefault();
        handleBackspace();
    } else if (e.key === ' ') {
        e.preventDefault();
        // Only dispatch handleAdvance from native keydown when there is no
        // keyboard context. When keyboard context exists, the onAdvance
        // subscription handles it — firing both would cause double-play
        // (phoneme then immediately word, because the first call flips the mode).
        if (!keyboard) {
            handleAdvance();
        }
    }
}

// ============================================================================
// Keyboard Configuration
// ============================================================================

/** The expected letter for the blank currently under the cursor, if any. */
function expectedLetterAtCursor(): string | null {
    const q = question.value;
    if (!q) return null;
    const pos = blankPositions.value[blankCursorPosition.value];
    return q.word[pos]?.toLowerCase() ?? null;
}

/**
 * Full keyboard letters minus any disabled (proven-wrong) letters, plus arrows.
 * On the final attempt this collapses to just the current blank's correct letter.
 * Arrows are dropped entirely for single-blank words — there's nowhere to move.
 */
function enabledKeyList(): string[] {
    const arrows = blankCount.value > 1 ? ['arrowleft', 'arrowright'] : [];
    // Backspace stays live on the final attempt too: only the letter choice
    // is narrowed, not the ability to clear a blank.
    const nav = [...arrows, 'backspace'];
    if (isFinalAttempt.value) {
        const only = expectedLetterAtCursor();
        return [...(only ? [only] : []), ...nav];
    }
    const base = keyboard?.baseLetters.value ?? [];
    return [
        ...base.filter((l) => !disabledLetters.value.has(l.toLowerCase())),
        ...nav,
    ];
}

/**
 * Apply the final-attempt keyboard state: enable only the current blank's
 * correct letter, highlight it, and give it one gentle pulse to draw the eye.
 */
function applyFinalAttemptKeyboard(): void {
    if (!keyboard) return;
    keyboard.clearAllHighlights();
    keyboard.updateConfig({ enabledLetters: enabledKeyList() });
    const only = expectedLetterAtCursor();
    if (only) {
        keyboard.setHighlight(only, '#2196f3');
        void keyboard.hintKey(only, 'pulse', { duration: 600, scale: 1.35 });
    }
}

// ============================================================================
// Time-Based Option-Shaving
// ============================================================================

/** Letters currently enabled for input, nav keys excluded (the un-shaved baseline). */
function baselineDecoyPool(): string[] {
    return enabledKeyList().filter(
        (l) => l !== 'arrowleft' && l !== 'arrowright' && l !== 'backspace',
    );
}

/**
 * Choose which decoys to remove this wave. Strategy affects UX feel only —
 * scoring is binary regardless (see MissingLetters.markBlankTimeAssisted), so
 * this seam is safe to swap without touching ELO fairness.
 */
function selectDecoysToRemove(
    decoys: string[],
    removeCount: number,
    answer: string,
): string[] {
    const n = Math.min(removeCount, decoys.length);
    if (n <= 0) return [];

    if (props.shaveStrategy === 'geometric') {
        // Keep a contiguous cluster around the answer key: remove the decoys
        // physically farthest from it, so survivors shrink inward like a
        // spotlight closing on the target.
        const a = getKeyDefinition(answer);
        const ax = a?.x ?? 0.5;
        const ay = a?.y ?? 0.5;
        const dist2 = (l: string): number => {
            const k = getKeyDefinition(l);
            const dx = (k?.x ?? 0.5) - ax;
            const dy = (k?.y ?? 0.5) - ay;
            return dx * dx + dy * dy;
        };
        return [...decoys].sort((p, q) => dist2(q) - dist2(p)).slice(0, n);
    }

    // 'random' (default): dim a random subset (Fisher–Yates).
    const shuffled = [...decoys];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
}

/** Apply one narrowing wave to the current blank. */
function applyShaveWave(): void {
    if (!keyboard || !question.value) return;
    const answer = expectedLetterAtCursor();
    if (!answer) return;

    const base = shaveSurvivors ?? baselineDecoyPool();
    const decoys = base.filter((l) => l !== answer);
    if (decoys.length === 0) {
        stopShaveTimer(); // already down to the answer
        return;
    }

    // First wave on this blank prices the assist into ELO (see MissingLetters).
    if (shaveWavesApplied.value === 0) {
        const wordPos = blankPositions.value[blankCursorPosition.value];
        question.value.markBlankTimeAssisted(wordPos);
    }

    // Small bite: dim a third of the remaining decoys (gentler than halving).
    const removeCount = Math.max(1, Math.ceil(decoys.length / 3));
    const toRemove = new Set(selectDecoysToRemove(decoys, removeCount, answer));
    const survivors = base.filter((l) => !toRemove.has(l));
    shaveSurvivors = survivors;
    shaveWavesApplied.value++;

    const nav = [
        ...(blankCount.value > 1 ? ['arrowleft', 'arrowright'] : []),
        'backspace',
    ];

    if (survivors.length <= 1) {
        // Terminal: only the answer remains — hand off to the same guaranteed-win
        // presentation the attempt-triggered final scaffold uses.
        keyboard.updateConfig({ enabledLetters: [answer, ...nav] });
        keyboard.setHighlight(answer, '#2196f3');
        void keyboard.hintKey(answer, 'pulse', { duration: 600, scale: 1.35 });
        stopShaveTimer();
    } else {
        keyboard.updateConfig({ enabledLetters: [...survivors, ...nav] });
    }
}

/**
 * Whether the shave clock should be paused right now: while audio plays (don't
 * count listening time), during the wrong-answer animation lock, once the result
 * is shown, when the attempt-triggered final scaffold owns the board, or while
 * the cursor sits on an already-filled blank.
 */
function shaveIsPaused(): boolean {
    return (
        isPlayingAudio.value ||
        isPlayingPhoneme.value ||
        isLocked.value ||
        showResult.value ||
        isFinalAttempt.value ||
        !!typedBlanks.value[blankCursorPosition.value]
    );
}

function shaveTick(): void {
    if (!question.value) return;
    if (shaveWavesApplied.value >= props.shaveMaxWaves) {
        stopShaveTimer(); // stillness cap reached — leave the board as-is
        return;
    }
    if (shaveIsPaused()) return; // don't accrue idle-time while paused
    shaveElapsed += SHAVE_TICK_MS;
    const nextThreshold =
        props.shaveFirstDelayMs + shaveWavesApplied.value * props.shaveIntervalMs;
    if (shaveElapsed >= nextThreshold) {
        applyShaveWave();
    }
}

function stopShaveTimer(): void {
    if (shaveTimer !== null) {
        clearInterval(shaveTimer);
        shaveTimer = null;
    }
}

/**
 * (Re)start shaving for whichever blank the cursor is now on. Restores the
 * un-shaved keyboard (clearing a prior blank's narrowing + terminal highlight)
 * and resets the accumulator, so one blank's shave never bleeds into the next.
 * No-op in preview mode, when disabled, or while the attempt-triggered final
 * scaffold owns the board.
 */
function restartShaveForCurrentBlank(): void {
    stopShaveTimer();
    shaveElapsed = 0;
    shaveWavesApplied.value = 0;
    shaveSurvivors = null;

    if (!props.shaveEnabled || props.preview || !keyboard) return;
    if (isFinalAttempt.value || showResult.value || isLocked.value) return;

    // Restore the baseline enabled set for the new blank (drop any prior
    // narrowing + terminal highlight left over from the last blank).
    keyboard.clearAllHighlights();
    keyboard.updateConfig({ enabledLetters: enabledKeyList() });

    shaveTimer = setInterval(shaveTick, SHAVE_TICK_MS);
}

function configureKeyboard(): void {
    if (!keyboard || !question.value) return;

    // Full keyboard layout, like SpellingQuestion lvl3. Arrow keys only make
    // sense with 2+ blanks to move between, so omit them (and hide the row slot)
    // for single-blank words.
    const base = keyboard.baseLetters.value;
    const multiBlank = blankCount.value > 1;
    keyboard.requestConfig({
        letters: multiBlank
            ? [...base, 'arrowleft', 'arrowright', 'backspace']
            : [...base, 'backspace'],
        enabledLetters: enabledKeyList(),
        keyColors: buildKeyColorMap(),
        overrideBase: false,
        showAdvance: true,
        advanceColor: audioAccentColor.value,
        advanceText: 'mdi-volume-high',
        showFullLayout: true,
        showArrows: multiBlank,
        disabled: false,
        // Slow dim so shave waves fade rather than snap; snappy restore so the
        // next blank doesn't feel laggy. Both reset on unmount.
        disableTransitionMs: props.shaveDisableTransitionMs,
        enableTransitionMs: props.shaveEnableTransitionMs,
    });
}

function subscribeKeyboardEvents(): void {
    if (!keyboard) return;

    const unsubTap = keyboard.onKeyTap((event) => {
        if (isLocked.value) return;
        handleLetterInput(event.letter);
    });
    keyboardUnsubscribers.push(unsubTap);

    // No enter subscription needed — auto-submit on fill

    const unsubArrowLeft = keyboard.onArrowLeft(() => {
        if (isLocked.value) return;
        handleArrowLeft();
    });
    keyboardUnsubscribers.push(unsubArrowLeft);

    const unsubArrowRight = keyboard.onArrowRight(() => {
        if (isLocked.value) return;
        handleArrowRight();
    });
    keyboardUnsubscribers.push(unsubArrowRight);

    // Backspace key, on-screen or physical (the keyboard claims physical
    // Backspace while the key is on the board; see handleNativeKeydown).
    const unsubBackspace = keyboard.onBackspace(() => {
        handleBackspace();
    });
    keyboardUnsubscribers.push(unsubBackspace);

    const unsubAdvance = keyboard.onAdvance(() => {
        handleAdvance();
    });
    keyboardUnsubscribers.push(unsubAdvance);
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    // Initialize question
    questionUtils.question.value = new MissingLetters(props.data);
    if (!props.preview) {
        loadSplitTeamsMet().catch((e) => console.warn('[MissingLettersView] lesson progress:', e));
    }

    // Initialize blank input state
    typedBlanks.value = new Array(blankCount.value).fill('');
    blankCursorPosition.value = 0;

    // Generate colors and render pre-filled letters
    generateColors();
    nextTick(() => {
        renderAllLetters();

        // Initialize audio button position (starts full-width for initial word playback)
        nextTick(() => {
            isInitialPlay.value = true;
            audioMode.value = 'playword';
            animateAudioButton(true); // instant position on first render

            // Track layout reflows (slot width changes) so the button follows
            if (blanksRowRef.value) {
                blanksRowObserver = new ResizeObserver(() => {
    if (!awaitingCursorAdvanceSettle) animateAudioButton(true);
});
                blanksRowObserver.observe(blanksRowRef.value);
            }
        });
    });

    // Subscribe keyboard events
    subscribeKeyboardEvents();
    configureKeyboard();

    // Native keyboard
    document.addEventListener('keydown', handleNativeKeydown);

    // Play word audio after a short delay.
    // Skipped in preview/demo mode — audio plays only on explicit tap.
    if (!props.preview) {
        setTimeout(() => playWordAudio(), 300);
    }

    // Start the shave clock for the first blank. The pause gate holds it off
    // until the intro word-autoplay finishes, so intro audio isn't counted.
    restartShaveForCurrentBlank();
});

onUnmounted(() => {
    for (const pending of mouthing.values()) if (pending) clearTimeout(pending);
    mouthing.clear();
    teamAudio.value?.pause();
    stopShaveTimer();

    blanksRowObserver?.disconnect();
    blanksRowObserver = null;

    // Reset the shared keyboard context to defaults so nothing bleeds onto the
    // next card's keyboard: not just final-attempt/terminal-shave highlights, but
    // the enabledLetters SUBSET a shave wave (or proven-wrong disabledLetters)
    // left behind — explicitEnabledLetters persists on the context until cleared,
    // and this view never remounts the context (mirrors GpcIntroView).
    keyboard?.clearQuestionConfig();

    document.removeEventListener('keydown', handleNativeKeydown);

    for (const unsub of keyboardUnsubscribers) {
        unsub();
    }
    keyboardUnsubscribers.length = 0;
});

// Expose questionUtils for framework compatibility
defineExpose({
    submitAnswer: questionUtils.submitAnswer,
    priorAttempts: questionUtils.priorAttempts,
    priorAnswers: questionUtils.priorAnswers,
    maxAttemptsPerView: questionUtils.maxAttemptsPerView,
    maxSessionViews: questionUtils.maxSessionViews,
    // Debug/observation surface (see MissingLettersDbg).
    shaveWavesApplied,
});
</script>

<style scoped>
.missing-letters {
    /* Query container so the compact sizing below responds to the available
       width here (e.g. the narrow landing-page phone frame), not just the
       viewport. In-app the container is wide, so nothing changes. */
    container: ml-q / inline-size;
    /* Explicit width so inline-size containment always has a definite size to
       resolve against (can't collapse); a no-op in normal block flow. */
    width: 100%;
    text-align: center;
    padding: 16px;
}

.ml-header {
    margin-bottom: 8px;
}

/* Title: shared across the four question views (1.5rem; 1.1rem when the
   question is ≤600px wide). Keep in step with the others. */
.ml-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #333;
    margin: 0;
}

/* ---------- Letter size ---------- */
/* --ml-h: a letter box's height; every slot measure below is a fraction of it.
   As big as fits (todo-minor #11: the old fixed 125px left a laptop mostly
   empty), the smallest of:
   - width: the word's --ml-n boxes (≈0.85 h wide each, 0.08 h gaps) across
     the question (cqi: .missing-letters is the query container);
   - height: the viewport less what else is stacked in it on the study page
     (app bar, title, the rail, a wrong answer's correction row, the on-screen
     keyboard): ML_CHROME. Raise it if a laptop scrolls; lower it to grow;
   - a cap and a floor (the floor is the old phone size).
   Declared on the container's children: cq units on the container itself
   would resolve against an outer one. */
.ml-blanks-wrapper,
.ml-correction {
    --ml-h: clamp(
        80px,
        min(
            100cqi / (var(--ml-n) * 0.85 + (var(--ml-n) - 1) * 0.08),
            100dvh - 580px /* ML_CHROME */
        ),
        240px
    );
}

/* ---------- Blanks Wrapper (positioning context for audio button) ---------- */

.ml-blanks-wrapper {
    position: relative;
    display: inline-block;
    /* Without a cap, inline-block grows to fit the row, so the slots never
       shrink (their min-width allows it) and long words run off the right edge
       of a phone. Capped, the row is bounded and the slots give way, as
       SpellingBlanks' do: the letter overhangs into the slot's padding. */
    max-width: 100%;
    margin-bottom: 20px;
    /* Provide padding above the blanks row for the audio button */
    padding-top: 68px;
}

/* The rail sits under the slots (no room needed above them): rail gap 12 +
   height 50 + a split team's bracket 16 */
.ml-blanks-wrapper.ml-blanks-wrapper--rail {
    padding-top: 12px;
    padding-bottom: 78px;
}

/* ---------- Animated Audio Button ---------- */
/* RETIRE(overhead-audio-button): every .ml-audio-btn rule */

.ml-audio-btn {
    position: absolute;
    top: 0;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #2196f3;
    color: white;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 700;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.25);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: opacity 0.3s ease, filter 0.1s ease-out, transform 0.1s ease-out, box-shadow 0.1s ease-out;
    z-index: 5;
    overflow: hidden;
    white-space: nowrap;
}

.ml-audio-btn:hover:not(:disabled) {
    filter: brightness(1.1);
}

.ml-audio-btn:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.25);
    filter: brightness(0.9);
}

.ml-audio-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.ml-audio-btn--playing {
    animation: ml-btn-pulse 1s infinite;
}

@keyframes ml-btn-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

/* ---------- Letter Slots ---------- */

.ml-blanks {
    display: flex;
    justify-content: center;
    gap: calc(var(--ml-h) * 0.08);
    flex-wrap: nowrap;
    align-items: flex-end;
}

.ml-slot {
    width: auto;
    min-width: calc(var(--ml-h) * 0.52);
    height: var(--ml-h);
    padding: calc(var(--ml-h) * 0.096) calc(var(--ml-h) * 0.12);
    border: 3px solid #ccc;
    border-radius: calc(var(--ml-h) * 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
    transition: border-color 0.15s ease, background-color 0.2s ease, transform 0.25s ease, box-shadow 0.25s ease;
    position: relative;
    overflow: visible;
    flex-direction: column;
}

/* Pre-filled letter slots */
.ml-slot--prefilled {
    background: white;
    border-color: #aaa;
}

/* Blank slots — dashed border */
.ml-slot--blank {
    border-style: dashed;
    border-color: #bbb;
    background: #fafafa;
}

/* Active blank (cursor is here) */
.ml-slot--active {
    border-color: #2196f3;
    background: #e3f2fd;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
    border-style: solid;
}

/* Filled blank slots */
.ml-slot--blank.ml-slot--filled {
    border-style: solid;
    border-color: #888;
    background: white;
}

/* Phoneme playing — pulse the active blank */
.ml-slot--phoneme-playing {
    animation: ml-slot-phoneme-pulse 0.35s ease-in-out infinite;
}

@keyframes ml-slot-phoneme-pulse {
    0%, 100% { transform: translateY(-2px) scale(1); box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2); }
    50% { transform: translateY(-5px) scale(1.04); box-shadow: 0 6px 18px rgba(33, 150, 243, 0.45); }
}

/* Correct blank */
.ml-slot--correct {
    background: #e8f5e9;
    border-color: #4caf50;
    border-style: solid;
}

/* Incorrect blank */
.ml-slot--incorrect {
    background: #ffebee;
    border-color: #f44336;
    border-style: solid;
}

/* LetterPeople container */
.ml-letter-container {
    height: calc(var(--ml-h) * 0.72);
    width: auto;
    min-width: calc(var(--ml-h) * 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
}

.ml-letter-container :deep(svg) {
    width: auto;
    height: 125%;
    /* An inline svg clips to its box by default: raised hands (the celebrations)
       and confetti went past its edge and were cut off */
    overflow: visible;
}

/* Vertical blinking cursor inside an empty active blank */
.ml-cursor {
    position: absolute;
    top: 15%;
    bottom: 28%; /* leave room above the underline */
    width: 3px;
    background: #2196f3;
    border-radius: 2px;
    animation: ml-cursor-blink 1s step-end infinite;
}

@keyframes ml-cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}

/* Blue-blink for the active blank's LetterPerson */
.ml-letter-container--blink :deep(svg) {
    animation: ml-lp-blink 1.2s ease-in-out infinite;
}

@keyframes ml-lp-blink {
    0%, 100% { filter: none; opacity: 1; }
    50% { filter: drop-shadow(0 0 6px rgba(33, 150, 243, 0.6)); opacity: 0.7; }
}

/* ---------- Blank Underline Decoration ---------- */

.ml-blank-underline {
    position: absolute;
    bottom: calc(var(--ml-h) * 0.064);
    left: 15%;
    right: 15%;
    height: max(3px, calc(var(--ml-h) * 0.032));
    border-radius: 2px;
    background: #bbb;
    transition: background-color 0.2s ease, height 0.2s ease;
}

.ml-blank-underline--active {
    background: #2196f3;
    height: max(4px, calc(var(--ml-h) * 0.04));
}

.ml-blank-underline--correct {
    background: #4caf50;
}

.ml-blank-underline--incorrect {
    background: #f44336;
}

/* ---------- Correction Display ---------- */

.ml-correction {
    display: flex;
    justify-content: center;
    gap: calc(var(--ml-h) * 0.06);
    margin-top: 8px;
}

/* Smaller than the old 45×55 relative to the slots: it arrives under the word
   on a wrong answer, and has to fit above the keyboard too (ML_CHROME). */
.ml-correction-letter {
    width: max(38px, calc(var(--ml-h) * 0.27));
    height: max(46px, calc(var(--ml-h) * 0.32));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: max(1.2rem, calc(var(--ml-h) * 0.18));
    font-weight: 700;
    color: #2e7d32;
    background: #e8f5e9;
    border-radius: 8px;
    border: 2px solid #c8e6c9;
}

.ml-correction-letter--wrong {
    color: #c62828;
    background: #ffebee;
    border-color: #ffcdd2;
}

.ml-correction-letter--given {
    color: #666;
    background: #f5f5f5;
    border-color: #e0e0e0;
}

/* ---------- Responsive ---------- */

@container ml-q (max-width: 600px) {
    .ml-title {
        font-size: 1.1rem;
    }

    /* Slot sizes: --ml-h covers narrow containers (its floor is the old 80px). */

    .ml-blanks-wrapper {
        padding-top: 58px;
    }

    .ml-audio-btn {
        height: 38px;
        font-size: 1rem;
        border-radius: 10px;
    }

}
</style>
