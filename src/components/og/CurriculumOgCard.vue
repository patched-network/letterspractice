<!--
  CurriculumOgCard: /curriculum's link-preview image. Stills from the live
  lessons (as on each lesson's own card, LessonOgCard), each with its
  lesson-number badge, in a grid beside the page's title and a count of what
  the lessons teach. Re-export after a lesson is added or its still changes.

  Rendered by /dbg/og/page/curriculum (dbg/OgCardsDbg.vue) and screenshotted
  by scripts/export-og-cards.ts. Ready once every still has loaded (or
  failed to: a missing still shows as a tinted block).
-->
<template>
  <OgCardFrame :art-width="640" :gap="48" :art-ready="settledCount >= shown.length" @ready="emit('ready')">
    <template #art>
      <div class="og-cur__grid">
        <div v-for="l in shown" :key="l.id" class="og-cur__still" :style="{ '--lesson-color': l.color }">
          <img
            v-if="!missing.has(l.id)"
            :src="`/curriculum-stills/${l.id}.png`"
            alt=""
            @load="settledCount++"
            @error="onError(l.id)"
          />
          <div v-else class="og-cur__placeholder"></div>
          <LessonNumber :n="l.number" :color="l.color" size="badge" class="og-cur__badge" />
        </div>
      </div>
    </template>

    <h1 class="og-card__title">Our Curriculum</h1>
    <p class="og-card__description">Big ideas in short read-aloud lessons.</p>
    <p class="og-card__description og-cur__count">
      {{ lessons.length }} lessons · {{ spellings }} sound-spellings
    </p>
  </OgCardFrame>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { DEFAULT_AGE, lessonsForAge } from "../curriculum/curriculumData";
import LessonNumber from "../curriculum/LessonNumber.vue";
import OgCardFrame from "./OgCardFrame.vue";

const emit = defineEmits<{ ready: [] }>();

/** Two rows of three fit the picture's column */
const MAX_STILLS = 6;

const lessons = lessonsForAge(DEFAULT_AGE);
const shown = lessons.slice(0, MAX_STILLS);
/** Sight words (WORD-…) aren't sound-spellings */
const spellings = new Set(lessons.flatMap((l) => l.facts.map((f) => f.gpc)).filter((g) => !g.startsWith("WORD-"))).size;

const missing = reactive(new Set<string>());
const settledCount = ref(0);
function onError(id: string) {
  missing.add(id);
  settledCount.value++;
}
</script>

<style scoped>
.og-cur__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 34px 18px;
  padding-top: 18px;
}
.og-cur__still {
  position: relative;
}
.og-cur__still img,
.og-cur__placeholder {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 12px;
}
.og-cur__placeholder {
  background: color-mix(in srgb, var(--lesson-color) 14%, #ffffff);
}
/* Bites the still's top edge, as on the lesson cards */
.og-cur__badge {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 14px;
  font-size: 1.1rem;
  box-shadow: 0 0 0 5px var(--og-bg);
}
.og-cur__count {
  color: rgba(33, 33, 33, 0.6);
}
</style>
