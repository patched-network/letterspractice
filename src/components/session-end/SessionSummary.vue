<template>
  <div class="session-summary">
    <!-- Header -->
    <div class="summary-header">
      <v-icon icon="mdi-star-circle" color="amber" size="32" class="mr-2" />
      <h2 class="text-h5 font-weight-bold">Session Complete!</h2>
    </div>

    <div class="summary-stat text-body-2 text-medium-emphasis mb-4">
      {{ totalCards }} {{ totalCards === 1 ? 'card' : 'cards' }} practiced
    </div>

    <!-- New Topics -->
    <section v-if="newTopics.length > 0" class="summary-section">
      <h3 class="section-title">
        <v-icon icon="mdi-lightbulb-on" color="success" size="20" class="mr-1" />
        New Today
      </h3>
      <div class="topic-chips">
        <LessonChip
          v-for="topic in newTopics"
          :key="topic.gpcShortId"
          :grapheme="topic.grapheme"
          :gpc-short-id="topic.gpcShortId"
          :lesson-id="topic.lessonId"
          show-lesson
        />
      </div>
    </section>

    <!-- Reviewed Topics -->
    <section v-if="reviewedTopics.length > 0" class="summary-section">
      <h3 class="section-title">
        <v-icon icon="mdi-refresh" color="primary" size="20" class="mr-1" />
        Reviewed
      </h3>
      <!-- One block per lesson, in /curriculum's lesson colours (catalog
           order); GPCs outside a live lesson go last, uncoloured. -->
      <div
        v-for="group in reviewGroups"
        :key="group.key"
        class="review-group"
        :style="{ '--lesson-color': group.color }"
      >
        <div class="review-group__title">
          <LessonNumber v-if="group.number" :n="group.number" :color="group.color" />
          {{ group.title }}
        </div>
        <div class="topic-chips">
          <LessonChip
            v-for="topic in group.topics"
            :key="topic.gpcShortId"
            :grapheme="topic.grapheme"
            :gpc-short-id="topic.gpcShortId"
            :lesson-id="topic.lessonId"
            :count="topic.exerciseCount"
            :miss="troubleById.get(topic.gpcShortId)"
          />
        </div>
      </div>
      <p v-if="troubleSpots.length > 0" class="miss-note">
        <span class="miss-mark">✱</span> missed this session — these come back soon with more support.
      </p>
    </section>

    <!-- Coming Soon -->
    <section v-if="comingSoon.length > 0" class="summary-section">
      <h3 class="section-title">
        <v-icon icon="mdi-arrow-right-circle" color="info" size="20" class="mr-1" />
        Coming Soon
      </h3>
      <div class="coming-soon-letters">
        <div
          v-for="topic in comingSoon"
          :key="topic.letter"
          class="coming-soon-letter"
        >
          <span class="coming-letter-upper">{{ topic.letter.toUpperCase() }}</span>
          <span class="coming-letter-lower">{{ topic.letter.toLowerCase() }}</span>
        </div>
      </div>
    </section>

    <!-- Empty state (no intros and no exercises — shouldn't happen, but handle gracefully) -->
    <div v-if="newTopics.length === 0 && reviewedTopics.length === 0" class="empty-state">
      <v-icon icon="mdi-check-circle" color="success" size="48"></v-icon>
      <p class="text-body-1 mt-2">Great job practicing!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IntroTopic, ReviewedTopic, ComingSoonTopic, TroubleSpot } from '../../composables/useSessionSummary';
import { LESSON_CATALOG, lessonNumber } from '../../services/lessons';
import { lessonColor } from '../curriculum/curriculumData';
import LessonNumber from '../curriculum/LessonNumber.vue';
import LessonChip from './LessonChip.vue';

const props = defineProps<{
  newTopics: IntroTopic[];
  reviewedTopics: ReviewedTopic[];
  troubleSpots: TroubleSpot[];
  comingSoon: ComingSoonTopic[];
  totalCards: number;
}>();

/** Neutral edge for GPCs outside a live lesson */
const NO_LESSON_COLOR = 'rgba(var(--v-theme-on-surface), 0.25)';

/** This session's misses, by GPC: a mark on the Reviewed chip */
const troubleById = computed(() => new Map(props.troubleSpots.map((t) => [t.gpcShortId, t])));

/** The review topics by lesson, in catalog order; the rest last. All of
 *  them, always: no "+N more" cap. */
const reviewGroups = computed(() => {
  const groups = LESSON_CATALOG.map((lesson, i) => ({
    key: lesson.id,
    title: lesson.title,
    number: lessonNumber(lesson.id) ?? String(i + 1),
    color: lessonColor(lesson.id) ?? NO_LESSON_COLOR,
    topics: props.reviewedTopics.filter((t) => t.lessonId === lesson.id),
  }));
  const rest = props.reviewedTopics.filter(
    (t) => !LESSON_CATALOG.some((l) => l.id === t.lessonId),
  );
  groups.push({ key: 'other', title: 'Other', number: '', color: NO_LESSON_COLOR, topics: rest });
  return groups.filter((g) => g.topics.length > 0);
});
</script>

<style scoped>
.session-summary {
  padding: 16px 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.summary-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.summary-stat {
  padding-left: 40px; /* Align with text after icon */
}

.summary-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.topic-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Reviewed, by lesson: a faint wash of the lesson's colour behind each
   group (/curriculum's look; the chips are LessonChip) */
.review-group {
  margin-top: 6px;
  padding: 6px 8px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--lesson-color) 7%, rgb(var(--v-theme-surface)));
}

.review-group__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 6px;
}

.miss-mark {
  margin-left: 3px;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--v-theme-warning));
}

.miss-note {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 6px 0 0;
  line-height: 1.3;
}

.coming-soon-letters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.coming-soon-letter {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-info), 0.08);
  border: 1px dashed rgba(var(--v-theme-info), 0.3);
  min-width: 48px;
}

.coming-letter-upper {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
  color: rgba(var(--v-theme-info), 0.6);
}

.coming-letter-lower {
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
  color: rgba(var(--v-theme-info), 0.4);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px;
}

@media (max-width: 600px) {
  .session-summary {
    padding: 12px 16px;
  }

  .summary-header h2 {
    font-size: 1.1rem !important;
  }

  .coming-soon-letters {
    gap: 8px;
  }
}
</style>