<!--
  SpellingBlanks.vue — LetterPeople-based input blanks for spelling questions

  Renders a row of letter slots with:
  - Filled slots for each typed letter (LetterPeople via createLetter())
  - A trailing cursor slot that is always present in append mode
  - Per-letter rainbow colors via generateVibrancyRainbow()
  - Per-letter correct/incorrect/missing feedback post-submit
  - Smooth width-collapse animation on backspace
  - Floating letters: lift typed letters out of the row into an overlay, so
    their slots can close while they hover (the phonetic fix)
-->

<template>
    <div ref="rootEl" class="sb-blanks">
        <!-- ========== Fixed-blank mode (Levels 0–2) ========== -->
        <template v-if="isFixedMode">
            <div
                v-for="slot in fixedSlots"
                :key="'fixed-' + slot.index"
                class="sb-slot"
                :class="{
                    'sb-slot--filled': !!slot.letter,
                    'sb-slot--current': slot.isCursor,
                    'sb-slot--empty': !slot.letter && !slot.isCursor,
                    'sb-slot--correct': showResult && perLetterResults[slot.index] === true,
                    'sb-slot--incorrect': showResult && perLetterResults[slot.index] === false,
                    'sb-slot--missing': showResult && !slot.letter,
                }"
            >
                <div
                    :ref="(el: Element | ComponentPublicInstance | null) => setSlotRef(el as Element | null, slot.index)"
                    class="sb-letter-container"
                ></div>

                <div
                    v-if="slot.isCursor"
                    class="sb-cursor"
                ></div>
            </div>
        </template>

        <!-- ========== Append mode (Level 3) ========== -->
        <template v-else>
            <!-- Letter slots — CSS order positions them around the gap cursor -->
            <div
                v-for="(letter, index) in typedLetters"
                :key="'letter-' + slotKeys[index]"
                class="sb-slot"
                :style="{ order: index * 2 + 1 }"
                :class="{
                    'sb-slot--filled': !!letter,
                    'sb-slot--blank': !letter,
                    'sb-slot--editing': editIndex === index,
                    'sb-slot--correct': showResult && perLetterResults[index] === true,
                    'sb-slot--incorrect': showResult && perLetterResults[index] === false,
                }"
            >
                <div
                    :ref="(el: Element | ComponentPublicInstance | null) => setSlotRef(el as Element | null, index)"
                    class="sb-letter-container"
                    :class="{ 'sb-letter-container--blink': editIndex === index }"
                ></div>

                <!-- Blinking cursor in an empty slot being edited (phonetic fix) -->
                <div v-if="editIndex === index && !letter && !locked" class="sb-cursor"></div>
            </div>

            <!-- Gap cursor (in-between mode, including append position) -->
            <div
                v-if="gapIndex !== null && !showResult && !locked"
                class="sb-gap-cursor"
                :style="{ order: gapIndex * 2 }"
            ></div>

            <!-- Missing letter slots (post-submit, if answer was too short) -->
            <template v-if="showResult">
                <div
                    v-for="i in missingCount"
                    :key="'missing-' + i"
                    class="sb-slot sb-slot--missing"
                    :style="{ order: 9000 + i }"
                ></div>
            </template>
        </template>

        <!-- Letters lifted out of the row (floatLetters) -->
        <div ref="floatLayer" class="sb-float-layer"></div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SpellingBlanks' });

import {
    ref,
    computed,
    watch,
    onMounted,
    onUnmounted,
    nextTick,
    type ComponentPublicInstance,
} from 'vue';
import { createLetter } from '../../letterpeople';
import type { LetterInstance } from '../../letterpeople';
import { generateVibrancyRainbow } from '../../letterpeople/util/color';
import { animate } from 'animejs';

// ============================================================================
// Props
// ============================================================================

const props = defineProps<{
    word: string;
    typedLetters: string[];
    /** Index of the slot being edited in letter mode, or null */
    editIndex: number | null;
    /** Gap index for in-between cursor mode, or null */
    gapIndex: number | null;
    /** Fixed slot count for Levels 0–2 (word length). Null = append mode (Level 3). */
    slotCount: number | null;
    /** Cursor position for fixed-blank mode. Highlights the active empty slot. */
    cursorPosition: number | null;
    showResult: boolean;
    perLetterResults: (boolean | undefined)[];
    locked: boolean;
}>();

// ============================================================================
// State
// ============================================================================

const slotContainers = ref<(HTMLElement | null)[]>([]);
const letterInstances = ref<(LetterInstance | null)[]>([]);
const colors = ref<string[]>([]);

/** Unique key per slot so Vue doesn't reuse collapsed DOM elements after splice */
let nextSlotId = 0;
const slotKeys = ref<number[]>([]);

// ============================================================================
// Computed
// ============================================================================

/** Whether we're in fixed-blank mode (Levels 0–2) vs append mode (Level 3) */
const isFixedMode = computed(() => props.slotCount !== null && props.slotCount > 0);

/**
 * Unified slot descriptors for the template.
 * Fixed mode: exactly slotCount slots, each either filled or empty.
 * Append mode: one slot per typedLetter (handled by separate template branch).
 */
const fixedSlots = computed(() => {
    if (!isFixedMode.value) return [];
    const count = props.slotCount!;
    return Array.from({ length: count }, (_, i) => ({
        index: i,
        letter: props.typedLetters[i] || '',
        isCursor: !props.showResult && !props.locked && props.cursorPosition === i && !props.typedLetters[i],
    }));
});

/** How many missing-letter slots to show post-submit (answer shorter than word) */
const missingCount = computed(() => {
    if (!props.showResult) return 0;
    if (isFixedMode.value) return 0; // fixed mode already shows all slots
    return Math.max(0, props.word.length - props.typedLetters.length);
});

// ============================================================================
// Ref Callback
// ============================================================================

function setSlotRef(el: Element | null, index: number): void {
    if (el instanceof HTMLElement) {
        slotContainers.value[index] = el;
    } else {
        slotContainers.value[index] = null;
    }
}

// ============================================================================
// Color Generation
// ============================================================================

function generateColors(): void {
    const randomStartHue = Math.random() * 360;
    // Generate enough colors for the max possible slots (20)
    colors.value = generateVibrancyRainbow(20, 0.7, 0.15, randomStartHue);
}

// ============================================================================
// Letter Instance Management
// ============================================================================

function createLetterAt(index: number, letter: string, withGrow: boolean = false): void {
    const container = slotContainers.value[index];
    if (!container) return;

    // Destroy existing if any
    destroyLetterAt(index);

    const slotEl = container.parentElement as HTMLElement | null;

    // If growing, start collapsed
    if (withGrow && slotEl) {
        slotEl.style.width = '0px';
        slotEl.style.minWidth = '0';
        slotEl.style.overflow = 'hidden';
        slotEl.style.paddingLeft = '0px';
        slotEl.style.paddingRight = '0px';
        slotEl.style.borderWidth = '0px';
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

        // Animate slot open
        if (withGrow && slotEl) growSlot(slotEl);
    } catch (e) {
        console.warn(`[SpellingBlanks] Failed to create letter "${letter}" at index ${index}:`, e);
        letterInstances.value[index] = null;
    }
}

/** Open a slot from zero width to its natural width. */
function growSlot(slotEl: HTMLElement, duration = 150): void {
    // Measure natural width by briefly unsetting constraints
    slotEl.style.width = 'auto';
    slotEl.style.minWidth = '';
    slotEl.style.overflow = '';
    slotEl.style.paddingLeft = '';
    slotEl.style.paddingRight = '';
    slotEl.style.borderWidth = '';
    const targetWidth = slotEl.offsetWidth;

    // Reset to collapsed
    slotEl.style.width = '0px';
    slotEl.style.minWidth = '0';
    slotEl.style.overflow = 'hidden';
    slotEl.style.paddingLeft = '0px';
    slotEl.style.paddingRight = '0px';
    slotEl.style.borderWidth = '0px';

    animate(slotEl, {
        width: [0, targetWidth],
        paddingLeft: [0, 15],
        paddingRight: [0, 15],
        borderWidth: [0, 3],
        duration,
        ease: 'outQuad',
        onComplete: () => {
            // Clear inline styles so CSS takes over
            slotEl.style.width = '';
            slotEl.style.minWidth = '';
            slotEl.style.overflow = '';
            slotEl.style.paddingLeft = '';
            slotEl.style.paddingRight = '';
            slotEl.style.borderWidth = '';
        },
    });
}

function destroyLetterAt(index: number): void {
    const instance = letterInstances.value[index];
    if (!instance) return;
    instance.destroy();
    letterInstances.value[index] = null;
}

/**
 * Animate removal of the last typed letter (backspace).
 * Called by parent BEFORE updating typedLetters — captures the slot element,
 * animates its width to 0, then resolves so parent can update data.
 */
async function animateBackspace(): Promise<void> {
    const lastIndex = props.typedLetters.length - 1;
    if (lastIndex < 0) return;

    const slotEl = slotContainers.value[lastIndex]?.parentElement as HTMLElement | null;
    const instance = letterInstances.value[lastIndex];

    if (!slotEl) {
        if (instance) destroyLetterAt(lastIndex);
        return;
    }

    // Lock current width and collapse
    const currentWidth = slotEl.offsetWidth;
    slotEl.style.width = `${currentWidth}px`;
    slotEl.style.minWidth = '0';
    slotEl.style.overflow = 'hidden';

    await new Promise<void>((resolve) => {
        animate(slotEl, {
            width: [currentWidth, 0],
            paddingLeft: [15, 0],
            paddingRight: [15, 0],
            borderWidth: [3, 0],
            opacity: [1, 0],
            duration: 150,
            ease: 'outQuad',
            onComplete: () => {
                if (instance) destroyLetterAt(lastIndex);
                resolve();
            },
        });
    });
}

// ============================================================================
// Watch typedLetters for additions and replacements
// (Removals are handled by animateBackspace, called by parent before data update)
// ============================================================================

watch(
    () => [...props.typedLetters],
    (newLetters, oldLetters) => {
        const oldLen = oldLetters?.length ?? 0;

        if (newLetters.length < oldLen) {
            // --- Removal: find splice point, shift tracking arrays ---
            let spliceIndex = newLetters.length; // default: trim from end
            for (let i = 0; i < newLetters.length; i++) {
                if (newLetters[i] !== oldLetters![i]) {
                    spliceIndex = i;
                    break;
                }
            }
            const removeCount = oldLen - newLetters.length;
            slotKeys.value.splice(spliceIndex, removeCount);
            letterInstances.value.splice(spliceIndex, removeCount);
            slotContainers.value.splice(spliceIndex, removeCount);
            return;
        }

        if (newLetters.length > oldLen) {
            // --- Insertion: find insert point, splice tracking arrays ---
            let insertIndex = oldLen; // default: append at end
            for (let i = 0; i < oldLen; i++) {
                if (newLetters[i] !== oldLetters![i]) {
                    insertIndex = i;
                    break;
                }
            }
            const insertCount = newLetters.length - oldLen;
            const newKeys = Array.from({ length: insertCount }, () => nextSlotId++);
            const nulls: null[] = new Array(insertCount).fill(null);
            slotKeys.value.splice(insertIndex, 0, ...newKeys);
            letterInstances.value.splice(insertIndex, 0, ...nulls);
            slotContainers.value.splice(insertIndex, 0, ...nulls);

            // Create new letter instances after DOM updates
            nextTick(() => {
                for (let i = insertIndex; i < insertIndex + insertCount; i++) {
                    if (newLetters[i]) {
                        createLetterAt(i, newLetters[i], true); // with grow animation
                    } else {
                        const slotEl = slotContainers.value[i]?.parentElement;
                        if (slotEl) growSlot(slotEl, 500); // a blank opening (phonetic fix)
                    }
                }
            });
            return;
        }

        // --- Same length: in-place changes only ---
        nextTick(() => {
            for (let i = 0; i < newLetters.length; i++) {
                const newLetter = newLetters[i] || '';
                const oldLetter = oldLetters?.[i] || '';

                if (newLetter && !oldLetter) {
                    createLetterAt(i, newLetter, false);
                } else if (!newLetter && oldLetter) {
                    destroyLetterAt(i);
                } else if (newLetter && oldLetter && newLetter !== oldLetter) {
                    destroyLetterAt(i);
                    createLetterAt(i, newLetter);
                }
            }
        });
    },
    { deep: true },
);

/**
 * Animate collapse of a slot at an arbitrary index (for insert-mode blank resolution).
 * Called by parent BEFORE splicing the entry from typedLetters.
 */
async function animateCollapseAt(index: number, duration = 150): Promise<void> {
    if (index < 0 || index >= props.typedLetters.length) return;

    const slotEl = slotContainers.value[index]?.parentElement as HTMLElement | null;
    const instance = letterInstances.value[index];

    if (!slotEl) {
        if (instance) destroyLetterAt(index);
        return;
    }

    const currentWidth = slotEl.offsetWidth;
    slotEl.style.width = `${currentWidth}px`;
    slotEl.style.minWidth = '0';
    slotEl.style.overflow = 'hidden';

    await new Promise<void>((resolve) => {
        animate(slotEl, {
            width: [currentWidth, 0],
            paddingLeft: [15, 0],
            paddingRight: [15, 0],
            borderWidth: [3, 0],
            opacity: [1, 0],
            duration,
            ease: 'outQuad',
            onComplete: () => {
                if (instance) destroyLetterAt(index);
                resolve();
            },
        });
    });
}

// ============================================================================
// Floating letters
// ============================================================================

const rootEl = ref<HTMLElement | null>(null);
const floatLayer = ref<HTMLElement | null>(null);

interface Floater {
    wrapper: HTMLElement;
    instance: LetterInstance;
}
const floaters = new Map<number, Floater>();
const FLOAT_SCALE = 0.7;
let nextFloatId = 0;

/**
 * Lift the letters at `indices` out of the row into the overlay, recolour
 * them, shrink them and float them up clear of the row (~600 ms; not awaited,
 * so a stalled animation can't hold the caller). Their slots are left empty (the
 * instances no longer belong to them), ready for the parent to collapse.
 * Returns ids for moveFloatsOver / dismissFloats.
 */
function floatLetters(indices: number[], color: string): number[] {
    const root = rootEl.value;
    const layer = floatLayer.value;
    if (!root || !layer) return [];
    const origin = root.getBoundingClientRect();

    const ids: number[] = [];
    for (const index of indices) {
        const instance = letterInstances.value[index];
        if (!instance) continue;
        const rect = instance.svgElement.getBoundingClientRect();

        const wrapper = document.createElement('div');
        wrapper.className = 'sb-floater';
        Object.assign(wrapper.style, {
            left: `${rect.left - origin.left}px`,
            top: `${rect.top - origin.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
        });
        instance.svgElement.style.width = '100%';
        instance.svgElement.style.height = '100%';
        wrapper.appendChild(instance.svgElement);
        layer.appendChild(wrapper);

        letterInstances.value[index] = null;
        const id = nextFloatId++;
        floaters.set(id, { wrapper, instance });
        ids.push(id);
    }

    for (const id of ids) {
        const f = floaters.get(id)!;
        // Up 0.75 of its height at 0.7 scale: its bottom ends just above the row's tops
        const lift = f.wrapper.offsetHeight * 0.75;
        void f.instance.updateAppearance({ color }, { duration: 400 });
        animate(f.wrapper, { translateY: [0, -lift], scale: [1, FLOAT_SCALE], duration: 600, ease: 'outBack' });
    }
    return ids;
}

/** Slide floaters sideways so, together, they're centred over the slots at `indices`. */
async function moveFloatsOver(ids: number[], indices: number[]): Promise<void> {
    const root = rootEl.value;
    const fs = ids.map((id) => floaters.get(id)).filter((f): f is Floater => !!f);
    const slots = indices
        .map((i) => slotContainers.value[i]?.parentElement)
        .filter((el): el is HTMLElement => !!el);
    if (!root || !fs.length || !slots.length) return;

    const centre = (rects: DOMRect[]) =>
        (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
    const dx =
        centre(slots.map((el) => el.getBoundingClientRect())) - centre(fs.map((f) => f.wrapper.getBoundingClientRect()));

    await Promise.all(
        fs.map(
            (f) =>
                new Promise<void>((resolve) => {
                    const left = parseFloat(f.wrapper.style.left);
                    animate(f.wrapper, { left: [left, left + dx], duration: 500, ease: 'inOutQuad', onComplete: () => resolve() });
                }),
        ),
    );
}

/** Fade floaters out and destroy them. */
async function dismissFloats(ids: number[]): Promise<void> {
    await Promise.all(
        ids.map((id) => {
            const f = floaters.get(id);
            if (!f) return Promise.resolve();
            floaters.delete(id);
            return new Promise<void>((resolve) =>
                animate(f.wrapper, {
                    opacity: [1, 0],
                    scale: [FLOAT_SCALE, 0.3],
                    duration: 400,
                    ease: 'inQuad',
                    onComplete: () => {
                        f.instance.destroy();
                        f.wrapper.remove();
                        resolve();
                    },
                }),
            );
        }),
    );
}

// ============================================================================
// Public API
// ============================================================================

/** Get all current letter instances (for celebration animations, etc.) */
function getLetterInstances(): (LetterInstance | null)[] {
    return [...letterInstances.value];
}

defineExpose({
    animateBackspace,
    animateCollapseAt,
    getLetterInstances,
    floatLetters,
    moveFloatsOver,
    dismissFloats,
});

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    generateColors();

    // Initialize slot keys
    slotKeys.value = props.typedLetters.map(() => nextSlotId++);

    // If there are already typed letters (unlikely but safe), render them
    nextTick(() => {
        props.typedLetters.forEach((letter, index) => {
            if (letter) {
                createLetterAt(index, letter);
            }
        });
    });
});

onUnmounted(() => {
    // Delay letter cleanup so SVGs persist through the card-slide leave transition.
    // The DOM nodes are kept alive by <Transition> after the Vue instance unmounts,
    // but destroy() removes SVG elements immediately — causing a visual blink.
    setTimeout(() => {
        letterInstances.value.forEach((instance) => {
            instance?.destroy();
        });
        letterInstances.value = [];
        floaters.forEach((f) => f.instance.destroy());
        floaters.clear();
    }, 500);
});
</script>

<style scoped>
.sb-blanks {
    position: relative;
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: nowrap;
    min-height: 100px;
    align-items: flex-end;
}

.sb-slot {
    width: auto;
    min-width: 65px;
    height: 125px;
    padding: 12px 15px;
    border: 3px solid #ccc;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fafafa;
    transition: border-color 0.15s ease, background-color 0.2s ease, transform 0.1s ease;
    position: relative;
    overflow: visible;
}

.sb-slot--current {
    border-color: #2196f3;
    background: #e3f2fd;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
}

.sb-slot--filled {
    background: white;
    border-color: #888;
}

/* Insert-mode: cursor is on this filled slot */
.sb-slot--editing {
    border-color: #2196f3;
    background: #e3f2fd;
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
}

/* Insert-mode blank: slot cleared by backspace, awaiting replacement or collapse */
.sb-slot--blank {
    border-color: #ccc;
    border-style: dashed;
    background: #fafafa;
}

.sb-slot--correct {
    background: #e8f5e9;
    border-color: #4caf50;
}

.sb-slot--incorrect {
    background: #ffebee;
    border-color: #f44336;
}

/* Append-mode blank awaiting input (phonetic fix): the cursor slot's look */
.sb-slot--blank.sb-slot--editing {
    border-color: #2196f3;
    border-style: solid;
    background: #e3f2fd;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
}

/* Fixed-mode: unfilled, non-cursor slot */
.sb-slot--empty {
    border-style: dashed;
    border-color: #ccc;
    background: #fafafa;
}

.sb-slot--missing {
    background: #fff3e0;
    border-color: #ff9800;
    border-style: dashed;
}

/* Overlay for letters lifted out of the row */
.sb-float-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
}

.sb-float-layer :deep(.sb-floater) {
    position: absolute;
    overflow: visible;
}

/* LetterPeople container inside each slot — matches WST sizing */
.sb-letter-container {
    height: 100px;
    width: auto;
    min-width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
}

.sb-letter-container :deep(svg) {
    width: auto;
    height: 125%;
    /* An inline svg clips to its box by default: raised hands (the celebrations)
       and confetti went past its edge and were cut off */
    overflow: visible;
}

/* Blue-blink the LetterPerson when this slot is the insert-mode edit target */
.sb-letter-container--blink :deep(svg) {
    animation: sb-lp-blink 1.2s ease-in-out infinite;
}

@keyframes sb-lp-blink {
    0%, 100% { filter: none; opacity: 1; }
    50% { filter: drop-shadow(0 0 6px rgba(33, 150, 243, 0.6)); opacity: 0.7; }
}

/* Vertical blinking cursor in an empty slot (as MissingLetters' ml-cursor) */
.sb-cursor {
    position: absolute;
    top: 15%;
    bottom: 15%;
    width: 3px;
    background: #2196f3;
    border-radius: 2px;
    animation: sb-blink 1s step-end infinite;
}

/* Gap cursor — zero-width line between letters, cancels flex gap */
.sb-gap-cursor {
    width: 0;
    height: 125px;
    position: relative;
    flex-shrink: 0;
    margin-left: -10px;
}

.sb-gap-cursor::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 15%;
    bottom: 15%;
    width: 3px;
    background: #2196f3;
    border-radius: 2px;
    animation: sb-blink 1s step-end infinite;
}

@keyframes sb-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}

/* ---------- Responsive ---------- */

@media (max-width: 600px) {
    .sb-slot {
        min-width: 42px;
        height: 80px;
        padding: 8px 10px;
    }

    .sb-letter-container {
        height: 60px;
    }

    .sb-blanks {
        gap: 6px;
    }
}
</style>
