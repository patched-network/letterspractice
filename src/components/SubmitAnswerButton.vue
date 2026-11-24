<!--
  SubmitAnswerButton.vue — Shared animated submit button for question views

  Shows/hides with anime.js transitions (slide + fade + scale).
  Used by WhoSaidThat, WordSelection, and SpellingQuestion.
-->

<template>
    <div class="submit-area">
        <Transition @enter="onEnter" @leave="onLeave" :css="false">
            <button
                v-if="visible"
                class="submit-keycap"
                @click="$emit('submit')"
            >
                {{ label }}
            </button>
        </Transition>
    </div>
</template>

<script lang="ts">
/** Keyboard enter-key color — matches the Vuetify "primary" theme color. */
export const SUBMIT_KEY_COLOR = '#F57C00';
</script>

<script setup lang="ts">
import { animate } from 'animejs';

defineOptions({ name: 'SubmitAnswerButton' });

withDefaults(defineProps<{
    visible: boolean;
    label?: string;
}>(), {
    label: 'Submit ↵',
});

const emit = defineEmits<{
    (e: 'submit'): void;
    /**
     * The button's box was added to or removed from the layout. Fires when it
     * enters and only after its leave animation ends, since the button stays
     * in the DOM until then. Views that fit themselves to the space available
     * re-fit on this.
     */
    (e: 'layout'): void;
}>();

function onEnter(el: Element, done: () => void): void {
    emit('layout');
    animate(el as HTMLElement, {
        opacity: [0, 1],
        translateY: [-8, 0],
        scale: [0.95, 1],
        duration: 300,
        ease: 'outCubic',
        onComplete: done,
    });
}

function onLeave(el: Element, done: () => void): void {
    animate(el as HTMLElement, {
        opacity: [1, 0],
        translateY: [0, -4],
        scale: [1, 0.95],
        duration: 200,
        ease: 'inCubic',
        onComplete: () => {
            done();
            emit('layout');
        },
    });
}
</script>

<style scoped>
.submit-area {
    margin-bottom: 16px;
    min-height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
}

/* ── Keycap-style submit button ── */
.submit-keycap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 14px 36px;
    font-size: 1.15rem;
    font-weight: 700;
    color: white;
    background-color: #F57C00;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.25);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition:
        transform 0.1s ease-out,
        box-shadow 0.1s ease-out,
        background-color 0.1s ease-out;
}

.submit-keycap:hover {
    background-color: #FF9800;
}

.submit-keycap:active {
    background-color: #E65100;
    transform: translateY(2px);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.25);
}
</style>
