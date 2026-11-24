<template>
    <div
        ref="wordContainer"
        class="word-display"
        :class="{ 'screen-reader-only': screenReaderMode }"
    >
        <!-- Screen reader content -->
        <span v-if="accessibilityText" class="sr-only">{{
            accessibilityText
        }}</span>

        <!-- Visual word container -->
        <div
            ref="visualContainer"
            class="word-visual"
            aria-hidden="true"
            :style="{ minHeight: `${props.height}px` }"
        ></div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, markRaw, shallowRef } from "vue";
import { Word } from "../Word";
import type { WordOptions } from "../Word";
import type {
    LetterInstance,
    LetterOptions,
    AnimationParams,
    TransformFunction,
} from "../types";

// Props interface
interface WordDisplayProps {
    /** Text to render as letter people */
    text: string;

    /** Word-level options (spacing, container styling, etc.) */
    options?: WordOptions;

    /** Per-letter styling options keyed by letter index */
    letterOptions?: { [index: number]: Partial<LetterOptions> };

    /** Height of the word display container in pixels */
    height?: number;

    /** Maximum width in pixels - word will scale down to fit if needed */
    maxWidth?: number;

    /** Accessibility text for screen readers (defaults to text prop) */
    accessibilityText?: string;

    /** If true, only show screen reader content */
    screenReaderMode?: boolean;

    /** Transform function for geometric letter positioning */
    transformFn?: TransformFunction;

    /** If true, skip destroy() on unmount so the SVG persists through leave transitions */
    preserveOnUnmount?: boolean;
}

// Emits interface
interface WordDisplayEmits {
    (e: "wordCreated", instance: Word): void;
    (e: "wordDestroyed"): void;
    (
        e: "letterUpdated",
        payload: {
            index: number;
            options: Partial<LetterOptions>;
            completed: boolean;
        },
    ): void;
    (e: "textChanged", payload: { oldText: string; newText: string }): void;
    (e: "transformApplied", transformFn: TransformFunction): void;
    (e: "transformRemoved"): void;
}

const props = withDefaults(defineProps<WordDisplayProps>(), {
    height: 100,
    maxWidth: undefined,
    screenReaderMode: false,
    preserveOnUnmount: false,
});

const emit = defineEmits<WordDisplayEmits>();

// Template refs
const wordContainer = ref<HTMLElement | null>(null);
const visualContainer = ref<HTMLElement | null>(null);
const wordInstance = shallowRef<Word | null>(null);

// Transform function state
const activeTransformUndo = ref<(() => void) | null>(null);

// Computed accessibility text
const accessibilityText = computed(() => {
    return props.accessibilityText || props.text || "";
});

// Create word instance
const createWordInstance = () => {
    if (!visualContainer.value || !props.text) return;

    // Clean up existing instance
    if (wordInstance.value) {
        wordInstance.value.destroy();
        wordInstance.value = null;
    }

    // Create new Word instance
    try {
        wordInstance.value = new Word(
            props.text,
            visualContainer.value,
            props.options,
        );

        // Apply per-letter options if provided
        if (props.letterOptions) {
            Object.entries(props.letterOptions).forEach(
                ([indexStr, options]) => {
                    const index = parseInt(indexStr, 10);
                    const letter = wordInstance.value?.getLetter(index);
                    if (letter && options) {
                        // Apply options immediately without animation
                        letter.updateAppearance(options);
                    }
                },
            );
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
                console.error(
                    "Failed to apply initial transform function:",
                    error,
                );
            }
        }
    } catch (error) {
        console.error("Failed to create WordDisplay:", error);
    }
};

// Scale the word down to fit maxWidth — and collapse its LAYOUT box to match.
//
// The subtlety: `transform: scale()` shrinks the word *visually* but leaves its
// layout footprint at the full intrinsic size. Scaling alone (the previous
// behavior) made the word *look* fitted while it still reserved its unscaled
// width — so it overflowed its container and dragged siblings / the whole page
// wider than the viewport. Here we scale the visual, then set an explicit
// width/height on the inline-block outer container equal to the scaled size, with
// a top-left origin so the two stay aligned. Overflow stays visible, so in-flight
// letter animations can still extend beyond the box.
const applyMaxWidthScaling = () => {
    if (!wordInstance.value || !visualContainer.value || !wordContainer.value || !props.maxWidth) return;

    // Wait for next frame to ensure DOM is updated
    requestAnimationFrame(() => {
        if (!wordInstance.value || !visualContainer.value || !wordContainer.value || !props.maxWidth) return;

        // Reset any prior scaling so we measure the natural (unscaled) layout size.
        // offsetWidth/Height are layout px (ignore our transform and any ancestor
        // transform), so the scale math is robust inside scaled contexts.
        visualContainer.value.style.transform = '';
        wordContainer.value.style.width = '';
        wordContainer.value.style.height = '';

        const naturalWidth = wordContainer.value.offsetWidth;
        const naturalHeight = wordContainer.value.offsetHeight;

        if (naturalWidth > props.maxWidth) {
            const scale = props.maxWidth / naturalWidth;
            visualContainer.value.style.transformOrigin = 'top left';
            visualContainer.value.style.transform = `scale(${scale})`;
            // Collapse the layout box to the scaled size so the footprint matches
            // the visual — this is what stops the overflow.
            wordContainer.value.style.width = `${naturalWidth * scale}px`;
            wordContainer.value.style.height = `${naturalHeight * scale}px`;
        }
    });
};

// Lifecycle
onMounted(() => {
    createWordInstance();
});

onBeforeUnmount(() => {
    // Clean up transform undo function
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

// Watch for text changes
watch(
    () => props.text,
    (newText, oldText) => {
        if (newText !== oldText) {
            emit("textChanged", {
                oldText: oldText || "",
                newText: newText || "",
            });
            createWordInstance();
        }
    },
);

// Watch for options changes
watch(
    () => props.options,
    () => {
        createWordInstance();
    },
    { deep: true },
);

// Watch for maxWidth changes
watch(
    () => props.maxWidth,
    () => {
        if (wordInstance.value) {
            applyMaxWidthScaling();
        }
    },
);

// Watch for letterOptions changes
watch(
    () => props.letterOptions,
    (newOptions) => {
        if (!wordInstance.value || !newOptions) return;

        // Apply new letter options
        Object.entries(newOptions).forEach(([indexStr, options]) => {
            const index = parseInt(indexStr, 10);
            const letter = wordInstance.value?.getLetter(index);
            if (letter && options) {
                letter.updateAppearance(options);
            }
        });
    },
    { deep: true },
);

// Watch for transform function changes
watch(
    () => props.transformFn,
    (newTransformFn, oldTransformFn) => {
        try {
            // Call previous undo if exists
            if (activeTransformUndo.value) {
                activeTransformUndo.value();
                activeTransformUndo.value = null;
                emit("transformRemoved");
            }

            // Apply new transform and store undo
            if (newTransformFn && wordInstance.value) {
                const undo = newTransformFn(wordInstance.value);
                activeTransformUndo.value = undo || null;
                emit("transformApplied", newTransformFn);
            }
        } catch (error) {
            console.error("Failed to apply transform function:", error);
        }
    },
);

// Exposed methods
const updateLetterAppearance = async (
    index: number,
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams,
): Promise<void> => {
    if (!wordInstance.value) return;

    const letter = wordInstance.value.getLetter(index);
    if (!letter) {
        console.warn(`WordDisplay: Letter at index ${index} not found`);
        return;
    }

    try {
        await letter.updateAppearance(options, animationParams);
        emit("letterUpdated", { index, options, completed: true });
    } catch (error) {
        console.error(`Failed to update letter ${index}:`, error);
        emit("letterUpdated", { index, options, completed: false });
    }
};

const updateAllLettersAppearance = async (
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams,
): Promise<void> => {
    if (!wordInstance.value) return;

    const promises: Promise<void>[] = [];

    for (let i = 0; i < wordInstance.value.length; i++) {
        const letter = wordInstance.value.getLetter(i);
        if (letter) {
            promises.push(
                letter
                    .updateAppearance(options, animationParams)
                    .then(() =>
                        emit("letterUpdated", {
                            index: i,
                            options,
                            completed: true,
                        }),
                    )
                    .catch((error) => {
                        console.error(`Failed to update letter ${i}:`, error);
                        emit("letterUpdated", {
                            index: i,
                            options,
                            completed: false,
                        });
                    }),
            );
        }
    }

    await Promise.all(promises);
};

const getWordInstance = (): Word | null => {
    return wordInstance.value;
};

const getLetterInstance = (index: number): LetterInstance | null => {
    return wordInstance.value?.getLetter(index) || null;
};

const getTextLength = (): number => {
    return wordInstance.value?.length || 0;
};

// Animation helper methods
const animateSequence = async (
    optionsArray: Array<{
        index: number;
        options: Partial<LetterOptions>;
        animationParams?: AnimationParams;
    }>,
): Promise<void> => {
    const promises = optionsArray.map(({ index, options, animationParams }) =>
        updateLetterAppearance(index, options, animationParams),
    );

    await Promise.all(promises);
};

const animateStagger = async (
    options: Partial<LetterOptions>,
    baseAnimationParams: AnimationParams = {},
    staggerDelay: number = 100,
): Promise<void> => {
    if (!wordInstance.value) return;

    const promises: Promise<void>[] = [];

    for (let i = 0; i < wordInstance.value.length; i++) {
        const animationParams = {
            ...baseAnimationParams,
            delay: (baseAnimationParams.delay || 0) + i * staggerDelay,
        };

        promises.push(updateLetterAppearance(i, options, animationParams));
    }

    await Promise.all(promises);
};

// Expose methods for parent components
defineExpose({
    updateLetterAppearance,
    updateAllLettersAppearance,
    getWordInstance,
    getLetterInstance,
    getTextLength,
    animateSequence,
    animateStagger,
});
</script>

<style scoped>
.word-display {
    display: inline-block;
    position: relative;
}

.word-visual {
    display: flex;
    align-items: flex-start; /* Baseline alignment for letters */
    gap: 0; /* Word class will handle spacing */
    overflow: visible; /* Allow transforms/animations to extend beyond bounds */
    padding: 20px; /* Breathing room for rotated/transformed letters */
}

.screen-reader-only .word-visual {
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

/* CSS custom properties for easy theming */
.word-display {
    --letter-color: currentColor;
    --letter-border-color: currentColor;
    --letter-border-width: 2px;
    --animation-duration: 250ms;
    --animation-ease: ease-out;
}
</style>
