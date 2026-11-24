<!--
  ExerciseStage: one live exercise on /exercises. The real question view in
  preview mode (records nothing, no audio until tapped), on its own real
  ProgressiveKeyboard, with sample and help-level controls.

  Each stage provides its own keyboard context, so the four on the page don't
  share one (provide/inject is per subtree). Physical-key capture is on only
  for the stage the visitor last tapped, so typing elsewhere on the page (the
  grader's input, find-in-page) isn't hijacked. Tapping anywhere outside the
  stage releases it.

  Mounts its question only as it nears the viewport: four live exercises with
  LetterPeople are not free, and most visitors won't scroll to all of them.
  The prerender's static copy gets the frame and controls without the question
  (the copy around it is the text that matters there).

  A right answer advances to the next sample. The views' on-screen Submit
  button is hidden (Enter on the keyboard submits).

  The keyboard glue mirrors SessionWalkthroughSection's (which mirrors
  PeekView's). If a third copy appears, extract it.
-->
<template>
    <div
        ref="rootEl"
        class="ex-stage"
        :class="{ 'ex-stage--active': active }"
        @pointerdown="active = true"
        @focusin="active = true"
    >
        <div class="ex-stage__bar">
            <div v-if="demo.levels" class="ex-stage__levels" role="group" :aria-label="levelsLabel">
                <button
                    v-for="(lvl, i) in demo.levels"
                    :key="lvl.label"
                    type="button"
                    class="ex-stage__level"
                    :class="{ 'ex-stage__level--on': i === level }"
                    :aria-pressed="i === level"
                    @click="setLevel(i)"
                >
                    {{ lvl.label }}
                </button>
            </div>
            <span v-else class="ex-stage__spacer"></span>
            <div class="ex-stage__actions">
                <button type="button" class="ex-stage__action" @click="restart">
                    <v-icon size="18">mdi-restart</v-icon>
                    {{ copy.again }}
                </button>
                <button type="button" class="ex-stage__action" @click="next">
                    {{ copy.another }}
                    <v-icon size="18">mdi-arrow-right</v-icon>
                </button>
            </div>
        </div>

        <div class="ex-stage__screen">
            <div ref="questionEl" class="ex-stage__question">
                <!-- out-in: the old question unmounts (clearing its keyboard
                     config) before the next mounts and configures its own -->
                <transition
                    name="ex-swap"
                    mode="out-in"
                    @before-leave="holdHeight"
                    @after-enter="releaseHeight"
                >
                    <component
                        :is="demo.view"
                        v-if="mounted"
                        :key="viewKey"
                        :data="data"
                        v-bind="extraProps"
                        preview
                        class="ex-stage__live"
                        @emitResponse="onResponse"
                        @ready-to-advance="advanceSoon"
                    />
                    <p v-else class="ex-stage__loading">{{ copy.loading }}</p>
                </transition>
            </div>

            <div v-if="mounted" class="ex-stage__keyboard">
                <ProgressiveKeyboard
                    ref="keyboardRef"
                    :letters="keyboardLetters"
                    :enabled-letters="keyboardEnabledLetters"
                    :highlighted-letters="keyboardHighlightedLetters"
                    :key-colors="keyboardColors"
                    :space-text="keyboardContext.advanceText.value"
                    :show-full-layout="keyboardContext.showFullLayout.value"
                    :play-phoneme-on-press="false"
                    :capture-keyboard="active"
                    :lowercase-keycaps="true"
                    :max-key-size="64"
                    :disabled="keyboardContext.disabled.value"
                    @keypress="(e: KeyEvent) => keyboardContext.dispatchKeyPress(e)"
                    @keyrelease="(e: KeyEvent) => keyboardContext.dispatchKeyRelease(e)"
                    @keytap="(e: KeyEvent) => keyboardContext.dispatchKeyTap(e)"
                    @keyhover="(e: KeyEvent) => keyboardContext.dispatchKeyHover(e)"
                    @keyhoverend="(e: KeyEvent) => keyboardContext.dispatchKeyHoverEnd(e)"
                    @kbd-space="keyboardContext.dispatchAdvance()"
                    @kbd-enter="keyboardContext.dispatchEnter()"
                    @arrow-left="keyboardContext.dispatchArrowLeft()"
                    @arrow-right="keyboardContext.dispatchArrowRight()"
                    @backspace="keyboardContext.dispatchBackspace()"
                    @invalid-key="(letter: string) => keyboardContext.dispatchInvalidKey(letter)"
                />
            </div>
        </div>

        <p v-if="caption" class="ex-stage__caption">{{ caption }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ProgressiveKeyboard from "@/components/keyboard/ProgressiveKeyboard.vue";
import {
    createKeyboardContext,
    provideKeyboardContext,
    type KeyEvent,
    type KeyboardContextProvider,
} from "@/composables/useKeyboardContext";
import { DEFAULT_AGE } from "@/components/curriculum/curriculumData";
import { keysWhenReady } from "@/components/curriculum/keysWhenReady";
import { exercisesCopy } from "@/content/exercisesCopy";
import type { ExerciseDemo } from "./exerciseDemos";

const props = defineProps<{
    demo: ExerciseDemo<any>;
    /** Under the stage: what the level toggle varies */
    caption?: string;
    /** Accessible name for the level toggle */
    levelsLabel?: string;
}>();

const copy = exercisesCopy.demo;

// ---- sample / level / remount ----------------------------------------------
const sampleIdx = ref(0);
const level = ref(props.demo.defaultLevel ?? 0);
const nonce = ref(0);
const sample = computed(() => props.demo.samples[sampleIdx.value]);
const data = computed(() => props.demo.data(sample.value, level.value));
const extraProps = computed(() => props.demo.props?.(sample.value, level.value) ?? {});
// Any change remounts a fresh question (its own setup reads data once)
const viewKey = computed(() => `${sampleIdx.value}-${level.value}-${nonce.value}`);

function next(): void {
    cancelAdvance();
    sampleIdx.value = (sampleIdx.value + 1) % props.demo.samples.length;
}
function restart(): void {
    cancelAdvance();
    nonce.value++;
}
function setLevel(i: number): void {
    cancelAdvance();
    if (i === level.value) nonce.value++;
    level.value = i;
}

// A right answer moves on to the next sample, as a session would, once the
// celebration has landed. A phonetic fix (Spelling: "fone" for "phone") is
// submitted with deferAdvance; the view says ready-to-advance once the child
// has typed the fix.
const ADVANCE_DELAY_MS = 1400;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
function cancelAdvance(): void {
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = null;
}
function advanceSoon(): void {
    cancelAdvance();
    advanceTimer = setTimeout(next, ADVANCE_DELAY_MS);
}
function onResponse(record: { isCorrect?: boolean; deferAdvance?: boolean }): void {
    if (record?.isCorrect && !record.deferAdvance) advanceSoon();
}

// Hold the frame's height across the swap: between the old question leaving
// and the new one arriving the slot is empty, and the frame would collapse.
const questionEl = ref<HTMLElement | null>(null);
function holdHeight(): void {
    const el = questionEl.value;
    if (el) el.style.minHeight = `${el.offsetHeight}px`;
}
function releaseHeight(): void {
    if (questionEl.value) questionEl.value.style.minHeight = "";
}

// ---- keyboard context (provider) -------------------------------------------
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);

// The keys a typical learner has when this word comes within reach (the
// /curriculum sim): the app only offers keys a learner has met.
const baseKeys = computed(() => {
    const word = props.demo.keysWord?.(sample.value);
    return (word && keysWhenReady(DEFAULT_AGE, word)) || ALPHABET;
});
watch(baseKeys, (keys) => keyboardContext.setBaseLetters(keys), { immediate: true });

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);
watch(keyboardRef, (kb) => {
    if (kb) keyboardContext.connectKeyboard(kb);
});

function withSpecials(base: string[]): string[] {
    const keys = [...base];
    if (keyboardContext.showArrows.value) {
        for (const k of ["arrowleft", "arrowright"]) if (!keys.includes(k)) keys.push(k);
    }
    if (keyboardContext.showAdvance.value && !keys.includes("space")) keys.push("space");
    return keys;
}
const keyboardLetters = computed(() => {
    const keys = withSpecials(
        keyboardContext.hasQuestionConfig.value ? [...keyboardContext.activeLetters.value] : []
    );
    if (!keys.includes("enter")) keys.push("enter");
    return keys;
});
const keyboardEnabledLetters = computed(() =>
    withSpecials(keyboardContext.hasQuestionConfig.value ? [...keyboardContext.enabledLetters.value] : [])
);
const keyboardHighlightedLetters = computed(() => Array.from(keyboardContext.highlights.value.keys()));
const keyboardColors = computed(() => {
    const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
    for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
        if (typeof highlight === "string") colors[letter] = highlight;
    }
    if (keyboardContext.advanceColor.value) colors["space"] = keyboardContext.advanceColor.value;
    return colors;
});

// ---- lazy mount + active (physical keys) -------------------------------------
const rootEl = ref<HTMLElement | null>(null);
const mounted = ref(false);
const active = ref(false);
let io: IntersectionObserver | null = null;

function onDocPointerDown(e: PointerEvent): void {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) active.value = false;
}

onMounted(() => {
    document.addEventListener("pointerdown", onDocPointerDown, true);
    if (!("IntersectionObserver" in window)) {
        mounted.value = true;
        return;
    }
    io = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) mounted.value = true;
                // Scrolled away: stop taking the page's keys
                else active.value = false;
            }
        },
        { rootMargin: "300px 0px" }
    );
    if (rootEl.value) io.observe(rootEl.value);
});
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    io?.disconnect();
    cancelAdvance();
});
</script>

<style scoped>
.ex-stage {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.ex-stage__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.ex-stage__spacer {
    flex: 1;
}
.ex-stage__levels {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 3px;
    border-radius: 999px;
    background: rgba(var(--v-theme-on-surface), 0.06);
}
.ex-stage__level {
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.7);
}
.ex-stage__level--on {
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-primary));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.ex-stage__actions {
    display: inline-flex;
    gap: 4px;
}
.ex-stage__action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgb(var(--v-theme-primary));
}
.ex-stage__action:hover,
.ex-stage__level:hover {
    background: rgba(var(--v-theme-primary), 0.08);
}

/* The "screen": white, rounded, like the app's study surface */
.ex-stage__screen {
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: rgb(var(--v-theme-surface));
    overflow: hidden;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ex-stage--active .ex-stage__screen {
    border-color: rgba(var(--v-theme-primary), 0.45);
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
}
.ex-stage__question {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
}
.ex-stage__live {
    width: 100%;
}
/* The swap between samples: a short fade with a nudge right-to-left */
.ex-swap-enter-active,
.ex-swap-leave-active {
    transition: opacity 0.22s ease, transform 0.22s ease;
}
.ex-swap-enter-from {
    opacity: 0;
    transform: translateX(16px);
}
.ex-swap-leave-to {
    opacity: 0;
    transform: translateX(-16px);
}
@media (prefers-reduced-motion: reduce) {
    .ex-swap-enter-active,
    .ex-swap-leave-active {
        transition: opacity 0.15s ease;
    }
    .ex-swap-enter-from,
    .ex-swap-leave-to {
        transform: none;
    }
}

/* No on-screen Submit here: it appears mid-answer and reflows the frame, and
   the keyboard's Enter key does the same job. */
.ex-stage__question :deep(.submit-area) {
    display: none;
}
.ex-stage__loading {
    margin: 0;
    color: rgba(var(--v-theme-on-surface), 0.5);
}
.ex-stage__keyboard {
    padding: 8px 10px 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.ex-stage__caption {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
