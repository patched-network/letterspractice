<template>
    <div
        ref="phoneticWordContainer"
        class="phonetic-word"
        :class="{ 'screen-reader-only': screenReaderMode }"
    >
        <!-- Screen reader content -->
        <span v-if="accessibilityText" class="sr-only">{{
            accessibilityText
        }}</span>

        <!-- Visual word container with clickable letters -->
        <div
            ref="visualContainer"
            class="phonetic-word-visual"
            aria-hidden="true"
            :style="{ height: `${props.height}px` }"
        ></div>

        <!-- Hidden audio element for playback -->
        <audio ref="audioElement" @ended="onAudioEnded" @timeupdate="onAudioTimeUpdate" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick, markRaw, shallowRef } from "vue";
import { Word } from "../Word";
import type { WordOptions } from "../Word";
import type {
    LetterInstance,
    LetterOptions,
    AnimationParams,
    TransformFunction,
} from "../types";
import type { KeyboardContext, Unsubscribe } from "../../composables/useKeyboardContext";
import { useTimedWordPlayback } from "../../composables/useTimedWordPlayback";
import type { LetterEffect, SpeakerTiming } from "../../composables/useTimedWordPlayback";
export type { LetterEffect, SpeakerTiming };
import { getPhonemeAudioUrl } from "../../services/phonetics/phonemeCache";
import type { PhonemeAudioKey } from "../../services/phonetics/phonemeCache";
import { getPhonetics, computeSpeakerTimingsForWord } from "../../services/phonetics";
import { applyLetterEffect } from "../animations";

// ============================================================================
// Types
// ============================================================================

// LetterEffect and SpeakerTiming are imported from useTimedWordPlayback and re-exported above.

/**
 * Defines a phonetic chunk - a group of letters that produce a single phoneme/sound.
 */
export interface PhoneticChunk {
    /**
     * Map of letter indices to the effects to apply when this chunk plays.
     * Multiple letters can be affected (e.g., 'sh' = { 0: 'speak', 1: 'speak' })
     * Multiple effects can be on different letters (e.g., silent-e pattern)
     */
    letters: { [index: number]: LetterEffect | LetterEffect[] };

    /**
     * ARPAbet phoneme for this chunk (e.g., 'K', 'SH', 'IH')
     * Audio URL is derived from phoneme via getPhonemeAudioUrl()
     * None: a silent step (a sight word's silent letter); its letters only act.
     */
    phoneme?: PhonemeAudioKey;

    /**
     * Optional label for this chunk (e.g., 'sh', 'tion', 'silent-e')
     */
    label?: string;

    /**
     * Letter index of the controlling consonant that mediates this vowel's sound.
     * Present on vowel steps of r-controlled / l-controlled patterns.
     * Purely informational — does not drive playback logic.
     */
    mediatedBy?: number;

    /**
     * Chunk index of the vowel step that this controller mediates.
     * Present on controller steps of r-controlled / l-controlled patterns.
     * Purely informational — does not drive playback logic.
     */
    mediates?: number;
}

// ============================================================================
// Props
// ============================================================================

interface PhoneticWordProps {
    /** The literal spelling of the word */
    word: string;

    /**
     * URL(s) for whole-word audio. Can be single string or array for variations.
     * If omitted, will auto-lookup from the phonetic index for words with recorded audio.
     */
    wordAudio?: string | string[];

    /**
     * Timing offsets for triggering speak animations on each letter
     * during whole-word audio playback.
     * Simple form: number[] where index = letter index, value = ms offset
     * Complex form: SpeakerTiming[] for fine-grained control
     * If omitted, will auto-compute from phonetic index using speech-region-aware timing.
     */
    speakerTimings?: number[] | SpeakerTiming[];

    /**
     * Ordered list of phonetic chunks for the stepper.
     * Defines how the word breaks down phonetically and what audio/effects to use.
     */
    phoneticChunks?: PhoneticChunk[];

    /** Word-level options (spacing, container styling, etc.) */
    options?: WordOptions;

    /** Per-letter styling options keyed by letter index */
    letterOptions?: { [index: number]: Partial<LetterOptions> };

    /** Height of the word display container in pixels */
    height?: number;

    /** Maximum width in pixels - word will scale down to fit if needed */
    maxWidth?: number;

    /** Accessibility text for screen readers (defaults to word prop) */
    accessibilityText?: string;

    /** If true, only show screen reader content */
    screenReaderMode?: boolean;

    /** Transform function for geometric letter positioning */
    transformFn?: TransformFunction;

    /** Enable clicking on individual letters to play their phoneme */
    clickableLetters?: boolean;

    /** Auto-loop through chunks when playing */
    autoLoop?: boolean;

    /** Delay between chunks when auto-playing (ms) */
    chunkDelay?: number;

    /** Underline the next chunk in the stepper sequence */
    underlineNextChunk?: boolean;

    /** Color for the next chunk underline (CSS color string) */
    underlineColor?: string;

    /** Include a "whole word" step at the end of the phonetic chunks sequence */
    includeWholeWordStep?: boolean;

    /**
     * Optional keyboard context for spacebar-based stepping.
     * When provided, spacebar advances the stepper and the advance button
     * color is set to match underlineColor.
     * Pass null or undefined to disable keyboard integration.
     */
    keyboardContext?: KeyboardContext | null;

    /**
     * Skip Word instance cleanup on unmount.
     * Use when the parent has an out-transition and SVGs should remain
     * visible until Vue removes the DOM.
     */
    preserveOnUnmount?: boolean;
}

// ============================================================================
// Emits
// ============================================================================

interface PhoneticWordEmits {
    (e: "wordCreated", instance: Word): void;
    (e: "wordDestroyed"): void;
    (e: "chunkPlayed", payload: { index: number; chunk: PhoneticChunk }): void;
    (e: "chunkComplete", payload: { index: number; chunk: PhoneticChunk }): void;
    (e: "wordAudioStarted"): void;
    (e: "wordAudioEnded"): void;
    (e: "letterClicked", payload: { index: number; letter: LetterInstance }): void;
    (e: "stepperAdvanced", payload: { from: number; to: number }): void;
    (e: "stepperComplete"): void;
    (e: "transformApplied", transformFn: TransformFunction): void;
    (e: "transformRemoved"): void;
}

// ============================================================================
// Component Setup
// ============================================================================

const props = withDefaults(defineProps<PhoneticWordProps>(), {
    height: 100,
    maxWidth: undefined,
    screenReaderMode: false,
    clickableLetters: true,
    autoLoop: false,
    chunkDelay: 300,
    underlineNextChunk: false,
    underlineColor: '#1976d2',
    includeWholeWordStep: false,
    keyboardContext: undefined,
    preserveOnUnmount: false,
});

const emit = defineEmits<PhoneticWordEmits>();

// Template refs
const phoneticWordContainer = ref<HTMLElement | null>(null);
const visualContainer = ref<HTMLElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const wordInstance = shallowRef<Word | null>(null);

// Timed word playback composable
const wordPlayback = useTimedWordPlayback();

// State
const activeTransformUndo = ref<(() => void) | null>(null);
const currentStepIndex = ref(-1);
const isPlayingChunk = ref(false);
const letterClickHandlers = ref<Map<number, () => void>>(new Map());
const underlineAnimationPending = ref(false);
const lastChunkAudioEndTime = ref(0);

// Keyboard context subscription cleanup
const keyboardUnsubscribe = ref<Unsubscribe | null>(null);

// Computed
const accessibilityText = computed(() => {
    return props.accessibilityText || props.word || "";
});

/**
 * Auto-lookup phonetic data from the generated index.
 * Used when audio URL or speaker timings are not explicitly provided.
 */
const phoneticData = computed(() => {
    return getPhonetics(props.word);
});

/**
 * Resolved word audio URL.
 * Uses explicit prop if provided, otherwise auto-looks up from phonetic index.
 */
const resolvedWordAudio = computed((): string | string[] | undefined => {
    if (props.wordAudio) return props.wordAudio;
    return phoneticData.value?.audioUrl;
});

/**
 * Normalized speaker timings with auto-lookup fallback.
 * Priority:
 *   1. Explicit prop (if provided)
 *   2. Auto-computed from phonetic index (if word has recorded audio)
 *   3. Empty array (no timings available)
 */
const normalizedSpeakerTimings = computed((): SpeakerTiming[] => {
    // Explicit prop takes priority
    if (props.speakerTimings) {
        // Check if it's simple number array or complex SpeakerTiming array
        if (props.speakerTimings.length > 0 && typeof props.speakerTimings[0] === 'number') {
            // Simple form: convert to SpeakerTiming[]
            return (props.speakerTimings as number[]).map((time, index) => ({
                index,
                time,
                effect: 'speak' as LetterEffect,
            }));
        }
        return props.speakerTimings as SpeakerTiming[];
    }

    // Auto-compute from phonetic index
    if (phoneticData.value) {
        const computed = computeSpeakerTimingsForWord(phoneticData.value);
        if (computed) return computed;
    }

    return [];
});

/**
 * Check if the next step is the "whole word" step
 */
const isNextStepWholeWord = computed((): boolean => {
    if (!props.underlineNextChunk || !props.includeWholeWordStep || !props.phoneticChunks) {
        return false;
    }
    const nextIndex = currentStepIndex.value + 1;
    return nextIndex === props.phoneticChunks.length;
});

/**
 * Compute which letter indices should be underlined (next chunk in stepper)
 */
const nextChunkLetterIndices = computed((): Set<number> => {
    if (!props.underlineNextChunk) {
        return new Set();
    }

    const nextIndex = currentStepIndex.value + 1;

    // For whole word step, we underline the word element instead of individual letters
    if (isNextStepWholeWord.value) {
        return new Set(); // Return empty - whole word uses word element underline
    }

    // Regular phonetic chunk
    if (!props.phoneticChunks || nextIndex < 0 || nextIndex >= props.phoneticChunks.length) {
        return new Set();
    }

    const nextChunk = props.phoneticChunks[nextIndex];
    return new Set(Object.keys(nextChunk.letters).map(k => parseInt(k, 10)));
});

// ============================================================================
// Letter Effect Handlers
// ============================================================================

/**
 * Apply an effect to a letter instance.
 * Delegates to the shared dispatcher in letterpeople/animations so the
 * lesson runner and PhoneticWord stay in lockstep.
 */
const applyEffect = applyLetterEffect;

/**
 * Apply effects to multiple letters from a chunk
 */
const applyChunkEffects = async (chunk: PhoneticChunk, animationParams?: AnimationParams): Promise<void> => {
    if (!wordInstance.value) return;

    const promises: Promise<void>[] = [];

    for (const [indexStr, effect] of Object.entries(chunk.letters)) {
        const index = parseInt(indexStr, 10);
        const letter = wordInstance.value.getLetter(index);
        if (letter) {
            promises.push(applyEffect(letter, effect, animationParams));
        }
    }

    await Promise.all(promises);
};

// ============================================================================
// Audio Playback
// ============================================================================

/**
 * Play audio from a URL
 */
const playAudio = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!audioElement.value) {
            reject(new Error('Audio element not available'));
            return;
        }

        const audio = audioElement.value;
        audio.src = url;

        const onEnded = () => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            resolve();
        };

        const onError = (e: Event) => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            reject(e);
        };

        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        audio.play().catch(reject);
    });
};

/**
 * Play the whole word audio with synchronized letter animations
 */
const playWord = async (): Promise<void> => {
    const audio = resolvedWordAudio.value;
    if (wordPlayback.isPlaying.value || !audio || !audioElement.value) return;

    emit("wordAudioStarted");

    try {
        await wordPlayback.play({
            audio: audioElement.value,
            audioUrl: audio,
            timings: normalizedSpeakerTimings.value,
            onTrigger: (timing) => {
                const letter = wordInstance.value?.getLetter(timing.index);
                if (letter) {
                    applyEffect(letter, timing.effect || 'speak');
                }
            },
        });
    } finally {
        emit("wordAudioEnded");
    }
};

/**
 * Stop word audio playback
 */
const stopWord = (): void => {
    wordPlayback.stop();
};

// ============================================================================
// Stepper Control
// ============================================================================

/**
 * Play a specific phonetic chunk by index (or whole word if index === phoneticChunks.length)
 */
const playChunk = async (index: number): Promise<void> => {
    if (!props.phoneticChunks || index < 0) {
        return;
    }

    // Check if this is the "whole word" step
    const isWholeWordStep = props.includeWholeWordStep && index === props.phoneticChunks.length;

    if (!isWholeWordStep && index >= props.phoneticChunks.length) {
        return;
    }

    if (isPlayingChunk.value) return;
    isPlayingChunk.value = true;

    const previousIndex = currentStepIndex.value;
    // Don't update currentStepIndex yet - wait until playback completes

    // Handle whole word step
    if (isWholeWordStep) {
        // Play whole word audio (playWord handles its own events)
        if (resolvedWordAudio.value) {
            await playWord();
        }
    } else {
        // Regular chunk playback
        const chunk = props.phoneticChunks[index];
        emit("chunkPlayed", { index, chunk });

        // Play effects and audio simultaneously
        try {
            const audioUrl = chunk.phoneme ? getPhonemeAudioUrl(chunk.phoneme) : null;
            await Promise.all([
                applyChunkEffects(chunk),
                audioUrl ? playAudio(audioUrl) : Promise.resolve(),
            ]);
        } catch (error) {
            console.error('Failed to play chunk:', error);
        }

        emit("chunkComplete", { index, chunk });
    }

    // NOW update currentStepIndex after playback completes
    currentStepIndex.value = index;

    if (previousIndex !== index) {
        emit("stepperAdvanced", { from: previousIndex, to: index });
    }

    // Track when audio finished for underline timing
    lastChunkAudioEndTime.value = Date.now();

    isPlayingChunk.value = false;
};

/**
 * Advance to the next chunk in the stepper
 */
const stepNext = async (): Promise<void> => {
    if (!props.phoneticChunks || props.phoneticChunks.length === 0) return;

    const nextIndex = currentStepIndex.value + 1;
    const totalSteps = props.phoneticChunks.length + (props.includeWholeWordStep ? 1 : 0);

    if (nextIndex >= totalSteps) {
        emit("stepperComplete");
        // Don't reset currentStepIndex to -1, keep it at the last step
        // to avoid "janking" the underline back to the beginning during transitions
        return;
    }

    await playChunk(nextIndex);
};

/**
 * Go back to the previous chunk
 */
const stepPrevious = async (): Promise<void> => {
    if (!props.phoneticChunks || currentStepIndex.value <= 0) return;
    await playChunk(currentStepIndex.value - 1);
};

/**
 * Reset the stepper to the beginning
 */
const resetStepper = (): void => {
    currentStepIndex.value = -1;
    // Update keyboard advance color when resetting (first chunk will be underlined)
    updateKeyboardAdvanceColor();
};

/**
 * Play through all chunks automatically
 */
const playAllChunks = async (): Promise<void> => {
    if (!props.phoneticChunks) return;

    resetStepper();

    const totalSteps = props.phoneticChunks.length + (props.includeWholeWordStep ? 1 : 0);

    for (let i = 0; i < totalSteps; i++) {
        await playChunk(i);

        if (i < totalSteps - 1) {
            await new Promise(resolve => setTimeout(resolve, props.chunkDelay));
        }
    }

    emit("stepperComplete");
};

// ============================================================================
// Keyboard Context Integration
// ============================================================================

/**
 * Update the keyboard advance button color to match underline color.
 * Called when stepper state changes.
 */
const updateKeyboardAdvanceColor = (): void => {
    if (!props.keyboardContext) return;

    const totalSteps = (props.phoneticChunks?.length || 0) + (props.includeWholeWordStep ? 1 : 0);
    const nextIndex = currentStepIndex.value + 1;

    if (nextIndex < totalSteps && props.underlineNextChunk) {
        // There's a next step - show advance with underline color
        props.keyboardContext.updateConfig({
            showAdvance: true,
            advanceColor: props.underlineColor,
        });
    } else {
        // Stepper complete or not active - reset advance appearance
        props.keyboardContext.updateConfig({
            showAdvance: false,
            advanceColor: undefined,
        });
    }
};

/**
 * Handle keyboard advance (spacebar) event
 */
const handleKeyboardAdvance = async (): Promise<void> => {
    if (isPlayingChunk.value || wordPlayback.isPlaying.value) return;

    await stepNext();
    updateKeyboardAdvanceColor();
};

/**
 * Set up keyboard context subscription
 */
const setupKeyboardContext = (): void => {
    if (!props.keyboardContext) return;

    // Clean up any existing subscription
    cleanupKeyboardContext();

    // Subscribe to advance events
    keyboardUnsubscribe.value = props.keyboardContext.onAdvance(handleKeyboardAdvance);

    // Set initial advance button state
    updateKeyboardAdvanceColor();
};

/**
 * Clean up keyboard context subscription
 */
const cleanupKeyboardContext = (): void => {
    if (keyboardUnsubscribe.value) {
        keyboardUnsubscribe.value();
        keyboardUnsubscribe.value = null;
    }

    // Reset keyboard advance state if context still available
    if (props.keyboardContext) {
        props.keyboardContext.updateConfig({
            showAdvance: false,
            advanceColor: undefined,
        });
    }
};

// ============================================================================
// Letter Click Handling
// ============================================================================

/**
 * Find which chunk a letter index belongs to
 */
const findChunkForLetter = (letterIndex: number): number => {
    if (!props.phoneticChunks) return -1;

    for (let i = 0; i < props.phoneticChunks.length; i++) {
        const chunk = props.phoneticChunks[i];
        if (letterIndex in chunk.letters) {
            return i;
        }
    }
    return -1;
};

/**
 * Find a chunk where the given letter is a primary speaker (has 'speak' effect).
 * Used to locate a controller letter's own phoneme chunk.
 */
const findSpeakerChunkForLetter = (letterIndex: number): number => {
    if (!props.phoneticChunks) return -1;

    for (let i = 0; i < props.phoneticChunks.length; i++) {
        const chunk = props.phoneticChunks[i];
        if (letterIndex in chunk.letters) {
            const effects = chunk.letters[letterIndex];
            const effectList = Array.isArray(effects) ? effects : [effects];
            if (effectList.includes('speak')) {
                return i;
            }
        }
    }
    return -1;
};

/**
 * Check if a letter's effects in a chunk are purely modifier effects
 * (r-control, l-control, silent-e) with no 'speak' effect.
 */
const getModifierEffects = (letterIndex: number, chunk: PhoneticChunk): LetterEffect[] | null => {
    const effects = chunk.letters[letterIndex];
    if (effects === undefined) return null;

    const effectList = Array.isArray(effects) ? effects : [effects];
    const modifierEffects = effectList.filter(e =>
        e === 'r-control' || e === 'l-control' || e === 'silent-e'
    );

    // Only treat as modifier if there are modifier effects and no 'speak' effect
    if (modifierEffects.length > 0 && !effectList.includes('speak')) {
        return modifierEffects;
    }
    return null;
};

/**
 * Play a silent-modifier click animation: fade the modifier letter
 * and draw attention to the modified (speaking) letters in the chunk.
 */
const playModifierClickAnimation = async (
    modifierIndex: number,
    chunk: PhoneticChunk,
): Promise<void> => {
    if (!wordInstance.value) return;

    const modifierLetter = wordInstance.value.getLetter(modifierIndex);
    if (!modifierLetter) return;

    // Find the modified (speaking) letters in this chunk
    const modifiedIndices: number[] = [];
    for (const [indexStr, effect] of Object.entries(chunk.letters)) {
        const idx = parseInt(indexStr, 10);
        if (idx === modifierIndex) continue;
        const effects = Array.isArray(effect) ? effect : [effect];
        if (effects.includes('speak')) {
            modifiedIndices.push(idx);
        }
    }

    // Silence-fade on the modifier
    const silenceFade = async () => {
        const svg = modifierLetter.svgElement;
        svg.style.transition = 'opacity 300ms ease-out';
        svg.style.opacity = '0.3';
        await new Promise(resolve => setTimeout(resolve, 400));
        svg.style.transition = 'opacity 400ms ease-in';
        svg.style.opacity = '1';
        await new Promise(resolve => setTimeout(resolve, 400));
        svg.style.transition = '';
    };

    // Attention-call on the modified vowel(s)
    const attentionCall = async () => {
        const promises = modifiedIndices.map(async (idx) => {
            const letter = wordInstance.value?.getLetter(idx);
            if (!letter) return;

            const svg = letter.svgElement;
            svg.style.transition = 'transform 200ms ease-out, filter 200ms ease-out';
            svg.style.transform = 'scale(1.15)';
            svg.style.filter = 'drop-shadow(0 0 6px gold)';
            await new Promise(resolve => setTimeout(resolve, 300));
            svg.style.transition = 'transform 300ms ease-in, filter 300ms ease-in';
            svg.style.transform = 'scale(1)';
            svg.style.filter = '';
            await new Promise(resolve => setTimeout(resolve, 300));
            svg.style.transition = '';
        });
        await Promise.all(promises);
    };

    await Promise.all([silenceFade(), attentionCall()]);
};

/**
 * Handle click on a letter.
 *
 * For modifier letters (r-control, l-control, silent-e):
 * - If the modifier has its own speaker chunk (e.g., 'r' has an 'R' phoneme),
 *   play that chunk so the modifier itself speaks.
 * - If the modifier is silent (e.g., silent-e), play a fade animation on the
 *   modifier and an attention-call on the modified vowel.
 */
const handleLetterClick = async (index: number): Promise<void> => {
    if (!wordInstance.value) return;

    const letter = wordInstance.value.getLetter(index);
    if (!letter) return;

    emit("letterClicked", { index, letter });

    // Find the chunk containing this letter
    const chunkIndex = findChunkForLetter(index);
    if (chunkIndex < 0 || !props.phoneticChunks) return;

    const chunk = props.phoneticChunks[chunkIndex];
    const modifierEffects = getModifierEffects(index, chunk);

    if (modifierEffects) {
        const isSilent = modifierEffects.includes('silent-e');
        const hasOwnSound = modifierEffects.some(e => e === 'r-control' || e === 'l-control');

        if (hasOwnSound) {
            // Modifier has its own phoneme — find its speaker chunk
            const speakerChunkIndex = findSpeakerChunkForLetter(index);
            if (speakerChunkIndex >= 0) {
                await playChunk(speakerChunkIndex);
            } else {
                // Fallback: play the chunk it belongs to
                await playChunk(chunkIndex);
            }
        } else if (isSilent) {
            // Silent modifier — fade it and call attention to the modified letter
            await playModifierClickAnimation(index, chunk);
        } else {
            await playChunk(chunkIndex);
        }
    } else {
        await playChunk(chunkIndex);
    }
};

/**
 * Set up click handlers for all letters
 */
const setupLetterClickHandlers = (): void => {
    if (!wordInstance.value || !props.clickableLetters) return;

    // Clean up existing handlers
    cleanupLetterClickHandlers();

    for (let i = 0; i < wordInstance.value.length; i++) {
        const letter = wordInstance.value.getLetter(i);
        if (!letter) continue;

        const wrapper = letter.parentElement as HTMLElement;
        if (!wrapper) continue;

        const handler = () => handleLetterClick(i);
        wrapper.style.cursor = 'pointer';
        wrapper.addEventListener('click', handler);
        letterClickHandlers.value.set(i, handler);
    }
};

// Watch for keyboard context changes
watch(
    () => props.keyboardContext,
    (newContext, oldContext) => {
        if (oldContext && !newContext) {
            cleanupKeyboardContext();
        } else if (newContext) {
            setupKeyboardContext();
        }
    },
    { immediate: false }
);

// Watch for underlineColor changes to update keyboard
watch(
    () => props.underlineColor,
    () => {
        updateKeyboardAdvanceColor();
    }
);

const cleanupLetterClickHandlers = (): void => {
    if (!wordInstance.value) return;

    for (const [index, handler] of letterClickHandlers.value.entries()) {
        const letter = wordInstance.value.getLetter(index);
        if (letter?.parentElement) {
            const wrapper = letter.parentElement as HTMLElement;
            wrapper.removeEventListener('click', handler);
            wrapper.style.cursor = '';
        }
    }
    letterClickHandlers.value.clear();
};

// ============================================================================
// Underline Management
// ============================================================================

/**
 * Remove all underlines from letters and the word element (immediate, no animation)
 */
const clearAllUnderlines = (): void => {
    if (!wordInstance.value) return;

    // Clear individual letter underlines
    for (let i = 0; i < wordInstance.value.length; i++) {
        const letter = wordInstance.value.getLetter(i);
        if (letter?.parentElement) {
            const wrapper = letter.parentElement as HTMLElement;
            wrapper.style.borderBottom = '';
            wrapper.style.transition = '';
            wrapper.style.opacity = '';
        }
    }

    // Clear word element underline (used for whole word step)
    const wordElement = wordInstance.value.element;
    if (wordElement) {
        wordElement.style.boxShadow = '';
        wordElement.style.transition = '';
    }
};

/**
 * Animate out any existing underlines before applying new ones
 */
const animateUnderlineOut = async (): Promise<void> => {
    if (!wordInstance.value) return;

    const promises: Promise<void>[] = [];

    // Animate out individual letter underlines
    for (let i = 0; i < wordInstance.value.length; i++) {
        const letter = wordInstance.value.getLetter(i);
        if (letter?.parentElement) {
            const wrapper = letter.parentElement as HTMLElement;
            const currentBorder = wrapper.style.borderBottom;

            // Only animate if there's an underline present
            if (currentBorder && currentBorder !== '') {
                // Check if this is a dotted border (helper letter)
                const isDotted = currentBorder.includes('dotted');

                const promise = new Promise<void>((resolve) => {
                    if (isDotted) {
                        // Helpers: only animate color and opacity (keep width at 8px to avoid flicker)
                        // Use ease-in-out for smoother, more gradual fade out
                        wrapper.style.transition = 'border-bottom-color 200ms ease-in-out, opacity 200ms ease-in-out';
                        wrapper.style.borderBottomColor = 'transparent';
                        wrapper.style.opacity = '1'; // Reset helper opacity
                    } else {
                        // Primary speakers: animate color, width, and opacity
                        wrapper.style.transition = 'border-bottom-color 200ms ease-in, border-bottom-width 200ms ease-in, opacity 200ms ease-in';
                        wrapper.style.borderBottomWidth = '0px';
                        wrapper.style.borderBottomColor = 'transparent';
                        wrapper.style.opacity = '1';
                    }

                    setTimeout(() => {
                        wrapper.style.borderBottom = '';
                        wrapper.style.transition = '';
                        wrapper.style.opacity = '';
                        resolve();
                    }, 200);
                });
                promises.push(promise);
            }
        }
    }

    // Animate out whole word underline
    const wordElement = wordInstance.value.element;
    if (wordElement && wordElement.style.boxShadow && wordElement.style.boxShadow !== '') {
        const promise = new Promise<void>((resolve) => {
            wordElement.style.transition = 'box-shadow 200ms ease-in';
            wordElement.style.boxShadow = 'inset 0 0 0 transparent';

            setTimeout(() => {
                wordElement.style.boxShadow = '';
                wordElement.style.transition = '';
                resolve();
            }, 200);
        });
        promises.push(promise);
    }

    // Wait for all animations to complete
    await Promise.all(promises);
};

/**
 * Apply underline to letters with animation
 */
const applyUnderlineWithAnimation = async (letterIndices: Set<number>): Promise<void> => {
    if (!wordInstance.value || letterIndices.size === 0) return;

    // Determine which letters are "helpers" (r-control / l-control / silent-e) vs primary speakers
    const helperIndices = new Set<number>();
    if (props.phoneticChunks) {
        const nextIndex = currentStepIndex.value + 1;
        if (nextIndex >= 0 && nextIndex < props.phoneticChunks.length) {
            const nextChunk = props.phoneticChunks[nextIndex];
            for (const [indexStr, effect] of Object.entries(nextChunk.letters)) {
                const idx = parseInt(indexStr, 10);
                const effects = Array.isArray(effect) ? effect : [effect];
                if (effects.includes('r-control') || effects.includes('l-control') || effects.includes('silent-e')) {
                    helperIndices.add(idx);
                }
            }
        }
    }

    // Set up underlines in initial state
    for (const index of letterIndices) {
        const letter = wordInstance.value.getLetter(index);
        if (letter?.parentElement) {
            const wrapper = letter.parentElement as HTMLElement;
            const isHelper = helperIndices.has(index);

            if (isHelper) {
                // Helpers: set to full size dotted immediately (no width animation)
                wrapper.style.borderBottom = `8px dotted transparent`;
                wrapper.style.opacity = '0.55';
                wrapper.style.transition = 'none';
            } else {
                // Primary speakers: start at 0px for width animation
                wrapper.style.borderBottom = `0px solid transparent`;
                wrapper.style.transition = 'none';
            }
        }
    }

    // Wait for next frame to ensure initial state is applied
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Animate to visible state
    // Helpers: only animate color (width stays at 8px, no jump)
    // Speakers: animate both color and width
    for (const index of letterIndices) {
        const letter = wordInstance.value.getLetter(index);
        if (letter?.parentElement) {
            const wrapper = letter.parentElement as HTMLElement;
            const isHelper = helperIndices.has(index);

            if (isHelper) {
                // Helpers: only animate color and opacity (width is constant 8px)
                // Use ease-in-out for smoother, more gradual appearance
                wrapper.style.transition = 'border-bottom-color 400ms ease-in-out, opacity 300ms ease-in-out';
                wrapper.style.borderBottom = `8px dotted ${props.underlineColor}`;
                wrapper.style.opacity = '0.55';
            } else {
                // Primary speakers: animate color, width, and opacity
                wrapper.style.transition = 'border-bottom-color 300ms ease-out, border-bottom-width 300ms ease-out, opacity 300ms ease-out';
                wrapper.style.borderBottom = `8px solid ${props.underlineColor}`;
                wrapper.style.opacity = '';
            }
        }
    }
};

/**
 * Apply underline to the whole word element with animation
 * Uses box-shadow instead of border to avoid layout shift
 */
const applyWholeWordUnderline = async (): Promise<void> => {
    if (!wordInstance.value) return;

    const wordElement = wordInstance.value.element;
    if (!wordElement) return;

    // Set up underline in initial state (no shadow)
    wordElement.style.boxShadow = `inset 0 0 0 transparent`;
    wordElement.style.transition = 'none';

    // Wait for next frame to ensure initial state is applied
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Animate to visible state using inset box-shadow at the bottom
    wordElement.style.transition = 'box-shadow 300ms ease-out';
    wordElement.style.boxShadow = `inset 0 -8px 0 ${props.underlineColor}`;
};

/**
 * Update underline with timing logic: wait for audio completion + min 100ms
 */
const updateUnderline = async (): Promise<void> => {
    if (!wordInstance.value) return;

    // Check if we have something new to underline
    const hasLettersToUnderline = nextChunkLetterIndices.value.size > 0;
    const hasWholeWordToUnderline = isNextStepWholeWord.value;

    if (!hasLettersToUnderline && !hasWholeWordToUnderline) {
        // If nothing new to underline, we should keep the current underline (if any)
        // instead of clearing it, especially when the word is about to transition out.
        // This prevents the "jank" back to an un-underlined state.
        return;
    }

    // Animate out existing underlines
    await animateUnderlineOut();

    // Don't apply if disabled
    if (!props.underlineNextChunk) {
        return;
    }

    // Calculate delay: time since last audio ended + minimum 100ms
    const now = Date.now();
    const timeSinceLastAudio = now - lastChunkAudioEndTime.value;
    const minimumDelay = 100;
    const delay = Math.max(0, minimumDelay - timeSinceLastAudio);

    // Wait for the calculated delay
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Apply underline with animation
    if (hasWholeWordToUnderline) {
        await applyWholeWordUnderline();
    } else {
        await applyUnderlineWithAnimation(nextChunkLetterIndices.value);
    }
};

// ============================================================================
// Word Instance Management
// ============================================================================

const createWordInstance = (): void => {
    if (!visualContainer.value || !props.word) return;

    // Clean up existing instance
    if (wordInstance.value) {
        cleanupLetterClickHandlers();
        wordInstance.value.destroy();
        wordInstance.value = null;
    }

    try {
        wordInstance.value = new Word(
            props.word,
            visualContainer.value,
            props.options,
        );

        // Apply per-letter options if provided
        if (props.letterOptions) {
            Object.entries(props.letterOptions).forEach(([indexStr, options]) => {
                const index = parseInt(indexStr, 10);
                const letter = wordInstance.value?.getLetter(index);
                if (letter && options) {
                    letter.updateAppearance(options);
                }
            });
        }

        emit("wordCreated", markRaw(wordInstance.value));

        // Apply maxWidth scaling if provided
        if (props.maxWidth) {
            applyMaxWidthScaling();
        }

        // Apply transform function if provided
        if (props.transformFn) {
            try {
                const undo = props.transformFn(wordInstance.value);
                activeTransformUndo.value = undo || null;
                emit("transformApplied", props.transformFn);
            } catch (error) {
                console.error("Failed to apply initial transform function:", error);
            }
        }

        // Set up click handlers and underline
        nextTick(() => {
            setupLetterClickHandlers();
            updateUnderline();
        });
    } catch (error) {
        console.error("Failed to create PhoneticWord:", error);
    }
};

const applyMaxWidthScaling = (): void => {
    if (!wordInstance.value || !visualContainer.value || !props.maxWidth) return;

    requestAnimationFrame(() => {
        if (!wordInstance.value || !visualContainer.value || !props.maxWidth) return;

        const wordElement = wordInstance.value.element;
        const actualWidth = wordElement.getBoundingClientRect().width;

        if (actualWidth > props.maxWidth) {
            const scale = props.maxWidth / actualWidth;
            wordElement.style.transform = `scale(${scale})`;
            wordElement.style.transformOrigin = 'center center';

            if (visualContainer.value) {
                const scaledHeight = wordElement.getBoundingClientRect().height * scale;
                visualContainer.value.style.height = `${scaledHeight}px`;
            }
        }
    });
};

// ============================================================================
// Audio Event Handlers
// ============================================================================

const onAudioEnded = (): void => {
    // Additional cleanup if needed
};

const onAudioTimeUpdate = (): void => {
    // Could be used for more precise timing sync in the future
};

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    createWordInstance();
    setupKeyboardContext();
});

onBeforeUnmount(() => {
    stopWord();
    cleanupLetterClickHandlers();
    cleanupKeyboardContext();

    if (activeTransformUndo.value) {
        activeTransformUndo.value();
        activeTransformUndo.value = null;
    }

    if (wordInstance.value && !props.preserveOnUnmount) {
        wordInstance.value.destroy();
        emit("wordDestroyed");
        wordInstance.value = null;
    }
});

// ============================================================================
// Watchers
// ============================================================================

watch(() => props.word, (newWord, oldWord) => {
    if (newWord !== oldWord) {
        resetStepper();
        createWordInstance();
    }
});

watch(() => props.options, () => {
    createWordInstance();
}, { deep: true });

watch(() => props.maxWidth, () => {
    if (wordInstance.value) {
        applyMaxWidthScaling();
    }
});

watch(() => props.letterOptions, (newOptions) => {
    if (!wordInstance.value || !newOptions) return;

    Object.entries(newOptions).forEach(([indexStr, options]) => {
        const index = parseInt(indexStr, 10);
        const letter = wordInstance.value?.getLetter(index);
        if (letter && options) {
            letter.updateAppearance(options);
        }
    });
}, { deep: true });

watch(() => props.transformFn, (newTransformFn) => {
    try {
        if (activeTransformUndo.value) {
            activeTransformUndo.value();
            activeTransformUndo.value = null;
            emit("transformRemoved");
        }

        if (newTransformFn && wordInstance.value) {
            const undo = newTransformFn(wordInstance.value);
            activeTransformUndo.value = undo || null;
            emit("transformApplied", newTransformFn);
        }
    } catch (error) {
        console.error("Failed to apply transform function:", error);
    }
});

watch(() => props.clickableLetters, () => {
    if (props.clickableLetters) {
        setupLetterClickHandlers();
    } else {
        cleanupLetterClickHandlers();
    }
});

watch(() => props.phoneticChunks, () => {
    // Re-setup click handlers when chunks change
    if (props.clickableLetters) {
        nextTick(() => {
            setupLetterClickHandlers();
        });
    }
    // Update underline when chunks change
    nextTick(() => {
        updateUnderline();
    });
}, { deep: true });

watch(nextChunkLetterIndices, () => {
    // Update underline when next chunk changes (currentStepIndex changes)
    nextTick(() => {
        updateUnderline();
    });
});

watch(isNextStepWholeWord, () => {
    // Update underline when transitioning to/from whole word step
    nextTick(() => {
        updateUnderline();
    });
});

watch(() => props.underlineNextChunk, () => {
    // Update underline when prop is toggled
    nextTick(() => {
        updateUnderline();
    });
});

// ============================================================================
// Exposed API
// ============================================================================

/**
 * Get the underlying Word instance
 */
const getWordInstance = (): Word | null => wordInstance.value;

/**
 * Get a specific letter instance by index
 */
const getLetterInstance = (index: number): LetterInstance | null => {
    return wordInstance.value?.getLetter(index) || null;
};

/**
 * Get current stepper position
 */
const getCurrentStep = (): number => currentStepIndex.value;

/**
 * Get total number of chunks (including whole word step if enabled)
 */
const getTotalChunks = (): number => {
    const baseChunks = props.phoneticChunks?.length || 0;
    return baseChunks + (props.includeWholeWordStep ? 1 : 0);
};

/**
 * Check if currently playing word audio
 */
const isWordPlaying = (): boolean => wordPlayback.isPlaying.value;

/**
 * Check if currently playing a chunk
 */
const isChunkPlaying = (): boolean => isPlayingChunk.value;

defineExpose({
    // Word instance access
    getWordInstance,
    getLetterInstance,

    // Word audio controls
    playWord,
    stopWord,
    isWordPlaying,

    // Stepper controls
    playChunk,
    stepNext,
    stepPrevious,
    resetStepper,
    playAllChunks,
    getCurrentStep,
    getTotalChunks,
    isChunkPlaying,

    // Direct effect application
    applyEffect,
    applyChunkEffects,
});
</script>

<style scoped>
.phonetic-word {
    display: inline-block;
    position: relative;
}

.phonetic-word-visual {
    display: flex;
    align-items: flex-start;
    gap: 0;
    overflow: visible;
    padding: 20px;
}

.screen-reader-only .phonetic-word-visual {
    display: none;
}

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

/* Clickable letter hover state */
.phonetic-word-visual :deep(.letterpeople-letter-wrapper) {
    transition: transform 0.15s ease-out;
}

.phonetic-word-visual :deep(.letterpeople-letter-wrapper:hover) {
    transform: translateY(-2px);
}

/* CSS custom properties for theming */
.phonetic-word {
    --letter-color: currentColor;
    --letter-border-color: currentColor;
    --letter-border-width: 2px;
    --animation-duration: 250ms;
    --animation-ease: ease-out;
}
</style>
