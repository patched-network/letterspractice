<!--
  LessonOgCard: a lesson's link-preview image (og:image), 1200×630. Drawn
  like the lesson's band on /curriculum (LessonSection): the colour wash, the
  still with its "Lesson N" badge, the title, the description and the facts.
  Trimmed for a thumbnail: no session kicker, no example words, no play pill.
  Which fact chips it shows (and the alt text that names them): ogCard.ts.

  Drawn in the shared frame (og/OgCardFrame.vue). Rendered by the dev-only
  /dbg/og/lesson/:lessonId page (dbg/OgCardsDbg.vue) and screenshotted by
  scripts/export-og-cards.ts. Emits `ready` once the wordmark is coloured and
  the still has loaded (or failed to).
-->
<template>
  <OgCardFrame :background="wash" :art-ready="stillSettled" @ready="emit('ready')">
    <template #art>
      <div class="og-card__still">
        <img
          v-if="!stillMissing"
          :src="`/curriculum-stills/${lesson.id}.png`"
          alt=""
          @load="stillSettled = true"
          @error="onStillError"
        />
        <div v-else class="og-card__placeholder" :style="{ '--lesson-color': lesson.color }"></div>
        <LessonNumber :n="lesson.number" :color="lesson.color" size="badge" class="og-card__badge" />
      </div>
    </template>

    <h1 class="og-card__title">{{ lesson.title }}</h1>
    <p class="og-card__description og-card__description--clamped" v-html="renderInline(lesson.description)"></p>
    <div class="og-card__facts" :style="{ '--lesson-color': lesson.color }">
      <span v-for="g in chips.shown" :key="g" class="og-card__chip">{{ g }}</span>
      <span v-if="chips.more" class="og-card__chip og-card__chip--more">+{{ chips.more }}</span>
    </div>
  </OgCardFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { renderInline } from "../landing/inlineMarkup";
import OgCardFrame from "../og/OgCardFrame.vue";
import LessonNumber from "./LessonNumber.vue";
import type { CurriculumLesson } from "./curriculumData";
import { ogCardSpellings } from "./ogCard";

const props = defineProps<{ lesson: CurriculumLesson }>();
const emit = defineEmits<{ ready: [] }>();

const chips = computed(() => ogCardSpellings(props.lesson));
const wash = computed(() => `color-mix(in srgb, ${props.lesson.color} 9%, #fffef7)`);

const stillMissing = ref(false);
const stillSettled = ref(false);
function onStillError() {
  stillMissing.value = true;
  stillSettled.value = true;
}
</script>

<style scoped>
.og-card__still {
  position: relative;
}
.og-card__still img,
.og-card__placeholder {
  display: block;
  width: 100%;
  max-height: 440px;
  object-fit: contain;
  border-radius: 16px;
}
.og-card__placeholder {
  aspect-ratio: 4 / 3;
  background: color-mix(in srgb, var(--lesson-color) 14%, #ffffff);
}
/* The badge bites the still's top edge; the wash-coloured ring is the cut */
.og-card__badge {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 10px 24px;
  font-size: 1.6rem;
  box-shadow: 0 0 0 7px var(--og-bg);
}

.og-card__description--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.og-card__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
/* FactChip's look (white, the lesson's colour down the left), spelling only */
.og-card__chip {
  min-width: 52px;
  padding: 6px 14px 8px;
  border-left: 5px solid var(--lesson-color);
  border-radius: 5px;
  background: #ffffff;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.2;
}
.og-card__chip--more {
  border-left-color: transparent;
  background: transparent;
  color: rgba(33, 33, 33, 0.55);
  font-weight: 500;
}

</style>
