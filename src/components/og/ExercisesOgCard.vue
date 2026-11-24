<!--
  ExercisesOgCard: /exercises' link-preview image. The page's four live
  demos (exercises/exerciseDemos.ts), each held still on its first sample
  (ExerciseStill) in a 2×2 grid under its in-app name, beside the page's
  title. Each question is drawn at the tile's width, not scaled (see
  .og-ex__screen), and without its own title (the tile's name says it). The
  questions are the real views, so the card follows them; re-export after a
  question view's look changes.

  The views animate in (LetterPeople entrances) and give no "settled" signal,
  so the card waits SETTLE_MS after mounting before saying it's ready.

  Rendered by /dbg/og/page/exercises (dbg/OgCardsDbg.vue) and screenshotted by
  scripts/export-og-cards.ts.
-->
<template>
  <OgCardFrame :art-width="700" :gap="40" :art-ready="settled" @ready="emit('ready')">
    <template #art>
      <div class="og-ex__grid">
        <figure v-for="ex in exercises" :key="ex.id" class="og-ex__tile">
          <figcaption class="og-ex__name">{{ ex.name }}</figcaption>
          <div class="og-ex__screen">
            <ExerciseStill :demo="EXERCISE_DEMOS[ex.id]" :sample="SAMPLE[ex.id]" />
          </div>
        </figure>
      </div>
    </template>

    <h1 class="og-card__title">{{ exercisesCopy.title }}</h1>
    <p class="og-card__description">Four simple exercises. Each starts with a <b>sound</b> and asks for <b>print</b>.</p>
  </OgCardFrame>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { exercisesCopy, type ExerciseId } from "../../content/exercisesCopy";
import { EXERCISE_DEMOS } from "../exercises/exerciseDemos";
import ExerciseStill from "./ExerciseStill.vue";
import OgCardFrame from "./OgCardFrame.vue";

const emit = defineEmits<{ ready: [] }>();

const exercises = exercisesCopy.exercises;

/** Which demo sample each tile shows: WST's second is a letter team (sh/ch) */
const SAMPLE: Partial<Record<ExerciseId, number>> = { wst: 1 };

const SETTLE_MS = 3000;
const settled = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  timer = setTimeout(() => (settled.value = true), SETTLE_MS);
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.og-ex__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.og-ex__tile {
  margin: 0;
}
.og-ex__name {
  margin: 0 0 6px 4px;
  font-size: 20px;
  font-weight: 600;
  color: rgba(33, 33, 33, 0.75);
}
/* A phone-ish screen, the question drawn at the tile's own width. Not scaled
   down with a transform: the views place things by measuring the page
   (getBoundingClientRect: MissingLetters' sound rail), and a transformed
   ancestor puts those in the wrong place. */
.og-ex__screen {
  height: 200px;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}
</style>
