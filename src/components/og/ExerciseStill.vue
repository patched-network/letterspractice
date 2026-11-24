<!--
  ExerciseStill: one /exercises demo's question, held still for a picture
  (ExercisesOgCard). The real question view in preview mode on the demo's
  first sample, inside its own keyboard context (the views configure one on
  mount) but with no keyboard drawn: at thumbnail size the question is the
  picture. The view's own title is hidden: the card names each tile.
  ExerciseStage is the live, interactive version of this.

  Draw it at its real size: the views measure the page to place things (the
  sound rail's speaker), so a transform: scale() on an ancestor misplaces them.
-->
<template>
  <component :is="demo.view" :data="data" v-bind="extraProps" preview class="ex-still" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { createKeyboardContext, provideKeyboardContext } from "@/composables/useKeyboardContext";
import { DEFAULT_AGE } from "@/components/curriculum/curriculumData";
import { keysWhenReady } from "@/components/curriculum/keysWhenReady";
import type { ExerciseDemo } from "../exercises/exerciseDemos";

const props = defineProps<{ demo: ExerciseDemo<any>; sample?: number }>();

const sample = computed(() => props.demo.samples[props.sample ?? 0]);
const level = props.demo.defaultLevel ?? 0;
const data = computed(() => props.demo.data(sample.value, level));
const extraProps = computed(() => props.demo.props?.(sample.value, level) ?? {});

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const keyboardContext = createKeyboardContext();
provideKeyboardContext(keyboardContext);
const word = props.demo.keysWord?.(sample.value);
keyboardContext.setBaseLetters((word && keysWhenReady(DEFAULT_AGE, word)) || ALPHABET);
</script>

<style scoped>
/* The views' in-app titles (Who Said That?, …): the card captions each tile */
.ex-still :deep(.wst-title),
.ex-still :deep(.ws-title),
.ex-still :deep(.ml-title),
.ex-still :deep(.sq-title) {
  display: none;
}
</style>
