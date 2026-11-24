<!--
  LessonSection — one live lesson on /curriculum, with its sub-lessons (1 and
  1a): for each, its still (links to the viewer), number, when it opens,
  title, description and the facts it brings into practice. One band of the
  lesson's colour holds them all; the change of colour is the divider between
  lessons. A sub-lesson sits below its parent, subordinate: a smaller still
  and a step-down heading.

  Two settings (CurriculumView): dropped into the timeline where the lesson
  opens (narrow screens), the band edge to edge of the window; or in the
  lessons column beside the timeline (`split`, wide screens), the band from
  the window's left to the column's edge, so it never paints over the
  timeline.

  Stills: public/curriculum-stills/<lesson-id>.png, posed with the free camera
  in /dbg/lesson/three, each its own shape — list a new one's size in STILLS.
  A lesson without one shows a placeholder panel. Not public/curriculum/: a
  directory named like a route shadows it on direct load (Caddy's try_files
  matches the directory, which has no index.html: a 404).
-->
<template>
  <div
    class="lesson"
    :class="{ 'lesson--split': split }"
    :style="{ '--lesson-color': lesson.color }"
  >
    <section
      v-for="{ lesson: l, sub } in rows"
      :key="l.id"
      :id="`lesson-${l.id}`"
      class="lesson-row"
      :class="{ 'lesson-row--sub': sub }"
    >
      <router-link
        :to="`/curriculum/lesson/${l.id}`"
        class="lesson-still"
        :aria-label="`Watch the ${l.title} lesson`"
      >
        <img
          v-if="STILLS[l.id] && !missingStills.has(l.id)"
          :src="`/curriculum-stills/${l.id}.png`"
          :width="STILLS[l.id][0]"
          :height="STILLS[l.id][1]"
          :alt="`A moment from the ${l.title} lesson`"
          loading="lazy"
          @error="missingStills.add(l.id)"
        />
        <div v-else class="lesson-still__placeholder" aria-hidden="true"></div>
        <LessonNumber :n="l.number" :color="l.color" size="badge" class="lesson-still__number" />
        <span class="lesson-still__play" aria-hidden="true">
          <span class="lesson-still__play-disc"><v-icon size="16">mdi-play</v-icon></span>
          Watch the lesson
        </span>
      </router-link>

      <div class="lesson-body">
        <p v-if="l.session !== null" class="lesson-kicker">
          {{ l.session <= 1 ? 'From the first session' : `Opens around session ${Math.round(l.session)}` }}
        </p>
        <component :is="sub ? 'h3' : 'h2'" class="font-weight-bold mb-3" :class="sub ? 'text-h5' : 'text-h4'">
          <span class="visually-hidden">Lesson {{ l.number }}: </span>{{ l.title }}
        </component>
        <p class="prose" v-html="renderInline(l.description)"></p>
        <p class="lesson-facts-caption">{{ factsCaption }}</p>
        <div class="lesson-facts">
          <FactChip v-for="fact in l.facts" :key="fact.gpc" :fact="fact" :color="l.color" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { renderInline } from '../landing/inlineMarkup';
import type { CurriculumLesson } from './curriculumData';
import FactChip from './FactChip.vue';
import LessonNumber from './LessonNumber.vue';

const props = defineProps<{
  lesson: CurriculumLesson;
  /** Its sub-lessons (curriculumData groupLessons), drawn below it in the same band */
  subs?: CurriculumLesson[];
  factsCaption: string;
  split?: boolean;
}>();

const rows = computed(() => [
  { lesson: props.lesson, sub: false },
  ...(props.subs ?? []).map((lesson) => ({ lesson, sub: true })),
]);

/**
 * Each still's pixel size. The stills keep their posed shapes (a crop to one
 * frame would cut balloons and letters), and the sizes reserve each box before
 * the lazy image loads — so the page doesn't shift under a reader, and coming
 * back from the viewer restores the exact scroll.
 */
const STILLS: Record<string, [number, number]> = {
  'hello-world': [1098, 657],
  bed: [1068, 756],
  digraphs: [1098, 657],
  'split-digraphs': [1429, 804],
  'final-open-vowels': [959, 679],
  'sight-words': [959, 679],
};
/** A still that fails to load falls back to the placeholder */
const missingStills = reactive(new Set<string>());
</script>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.prose {
  line-height: 1.7;
  margin-bottom: 12px;
}

.lesson {
  /*
   * A faint wash of the lesson's colour, edge to edge of the window: the
   * change of colour is the divider. The shadow carries the band past the
   * column (shadows add no scroll); the clip keeps it to the section's height.
   */
  --lesson-wash: color-mix(in srgb, var(--lesson-color) 7%, var(--page-bg));
  display: grid;
  gap: 48px;
  padding: 40px 0;
  background: var(--lesson-wash);
  box-shadow: 0 0 0 100vmax var(--lesson-wash);
  clip-path: inset(0 -100vmax);
}

/* One lesson: still | body. Scrolled to (the timeline's links) with the
   band's top padding showing above it, as when each lesson was its own band. */
.lesson-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 24px 40px;
  align-items: start;
  scroll-margin-top: calc(var(--v-layout-top, 0px) + 64px);
}
@media (max-width: 959px) {
  .lesson-row {
    grid-template-columns: 1fr;
  }
}

/* A sub-lesson: a smaller still, set against its body text in the wide
   layout so it reads as indented under the parent's. */
.lesson-row--sub .lesson-still {
  width: 75%;
  justify-self: end;
}
@media (max-width: 959px) {
  .lesson-row--sub .lesson-still {
    justify-self: start;
  }
}
/*
 * Beside the timeline: the band runs in from the window's left and stops at
 * the column's edge (rounded there); the clip keeps it off the timeline. The
 * clip carries the rounding too: the shadow would square the corners.
 */
.lesson--split {
  padding: 40px 32px 40px 0;
  border-radius: 0 16px 16px 0;
  clip-path: inset(0 0 0 -100vmax round 0 16px 16px 0);
}

.lesson-still {
  position: relative;
  display: block;
  border-radius: 12px;
  color: inherit;
}
.lesson-still:focus-visible {
  outline: 3px solid var(--lesson-color);
  outline-offset: 3px;
}
.lesson-still__play {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  font-size: 0.875rem;
  font-weight: 600;
  color: #212121;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.lesson-still__play-disc {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--lesson-color);
}
/* The badge bites the still's top edge; the wash-coloured ring is the cut */
.lesson-still__number {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 1;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 5px var(--lesson-wash);
}
.lesson-still:hover .lesson-still__play,
.lesson-still:focus-visible .lesson-still__play {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);
}
.lesson-still img,
.lesson-still__placeholder {
  display: block;
  width: 100%;
  border-radius: 12px;
}
.lesson-still img {
  height: auto;
}
.lesson-still__placeholder {
  aspect-ratio: 4 / 3;
  background: color-mix(in srgb, var(--lesson-color) 14%, #ffffff);
}

.lesson-kicker {
  margin: 0 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(33, 33, 33, 0.5);
}

.lesson-facts-caption {
  margin: 20px 0 8px;
  font-size: 0.875rem;
  color: rgba(33, 33, 33, 0.6);
}
.lesson-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
