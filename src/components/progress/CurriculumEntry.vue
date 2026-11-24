<template>
  <div
    class="curriculum-entry"
    :class="{
      'curriculum-entry--mature': status === 'mature',
      'curriculum-entry--ongoing': status === 'ongoing',
      'curriculum-entry--available': status === 'available',
      'curriculum-entry--locked': status === 'locked',
    }"
  >
    <!-- Numbered bullet (rainbow-spread accent) -->
    <div class="curriculum-entry__bullet" :style="bulletStyle">
      {{ lessonNumber(lesson.id) ?? index + 1 }}
    </div>

    <!-- Content -->
    <div class="curriculum-entry__content">
      <div class="curriculum-entry__header">
        <span class="curriculum-entry__title">{{ lesson.title }}</span>
        <v-chip
          size="x-small"
          :color="chipColor"
          variant="tonal"
          class="ml-2"
        >
          {{ chipLabel }}
        </v-chip>
      </div>

      <div
        class="curriculum-entry__description text-medium-emphasis"
        v-html="renderInline(displayDescription)"
      ></div>

      <!-- Blocked-by-lesson indicator (locked only) -->
      <div
        v-if="status === 'locked' && context.blockedByLesson"
        class="curriculum-entry__blocked text-caption text-medium-emphasis"
      >
        ⏳ Requires: {{ context.blockedByLesson }}
      </div>

      <!-- Inline report from reporter (ongoing/mature, or locked with progress data) -->
      <div
        v-if="showInlineReport"
        class="curriculum-entry__report"
      >
        <component
          :is="reporter.inlineComponent"
          :context="context"
        />
      </div>

      <!-- Maturity label if reporter provides one -->
      <div
        v-if="maturityLabel"
        class="curriculum-entry__maturity-label text-caption"
        :class="{ 'text-success': status === 'mature' }"
      >
        {{ maturityLabel }}
      </div>

      <!-- Explicit Review Lesson button -->
      <v-btn
        v-if="isClickable"
        size="small"
        variant="outlined"
        class="mt-2"
        @click.stop="$emit('navigate', lesson.id)"
      >
        Review Lesson
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonDefinition } from '../../services/lessons.types';
import type {
  LessonDisplayStatus,
  LessonReportContext,
  LessonProgressReporter,
} from '../../services/lessons/progress/types';
import { getReporter } from '../../services/lessons/progress/registry';
import { renderInline } from '../landing/inlineMarkup';
import { lessonNumber } from '../../services/lessons';

const props = defineProps<{
  lesson: LessonDefinition;
  status: LessonDisplayStatus;
  context: LessonReportContext;
  /** Position in the curriculum (0-based); the bullet number if the lesson has no display number. */
  index: number;
  /** Pastel rainbow accent for the bullet (from CurriculumCard's palette). */
  accent?: string;
  /**
   * Mirrors CurriculumCard's prop: when false (admin / /showHN), the
   * "Review Lesson" button is hidden rather than rendered inert.
   */
  navigable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'navigate', lessonId: string): void;
}>();

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

const reporter = computed<LessonProgressReporter>(() => getReporter(props.lesson.id));

// ---------------------------------------------------------------------------
// Display logic
// ---------------------------------------------------------------------------

const displayDescription = computed(() => {
  return props.lesson.progressDescription ?? props.lesson.description;
});

const bulletStyle = computed(() => ({
  background: props.accent ?? 'rgba(var(--v-theme-on-surface), 0.12)',
}));

const isClickable = computed(() => {
  if (props.navigable === false) return false;
  return props.status === 'available' || props.status === 'ongoing' || props.status === 'mature';
});

/**
 * Show the inline report for:
 * - ongoing: the main use case — shows progress toward mastery
 * - mature: still useful to see the state (especially if it can regress)
 * - locked: only if there's no lesson blocker (show mastery prereq progress)
 */
const showInlineReport = computed(() => {
  if (props.status === 'ongoing' || props.status === 'mature') return true;
  if (props.status === 'locked' && !props.context.blockedByLesson) return true;
  return false;
});

// The report's one summary line: inline report components render no count
// of their own, so this shows wherever the report does.
const maturityLabel = computed<string | null>(() => {
  if (!showInlineReport.value) return null;
  if (!reporter.value.maturityLabel) return null;
  return reporter.value.maturityLabel(props.context);
});

const chipColor = computed(() => {
  switch (props.status) {
    case 'mature': return 'success';
    case 'ongoing': return 'info';
    case 'available': return 'warning';
    case 'locked': return 'default';
  }
});

const chipLabel = computed(() => {
  switch (props.status) {
    case 'mature': return 'Mastered';
    case 'ongoing': return 'Learning';
    case 'available': return 'Ready';
    case 'locked': return 'Locked';
  }
});
</script>

<style scoped>
.curriculum-entry {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
}

.curriculum-entry--locked {
  opacity: 0.7;
}

.curriculum-entry__bullet {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(0, 0, 0, 0.72);
}

.curriculum-entry__content {
  flex: 1;
  min-width: 0;
}

.curriculum-entry__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.curriculum-entry__title {
  font-weight: 600;
  font-size: 0.92rem;
}

.curriculum-entry__description {
  font-size: 0.82rem;
  margin-top: 2px;
  line-height: 1.3;
}

.curriculum-entry__blocked {
  margin-top: 4px;
  font-style: italic;
}

.curriculum-entry__report {
  margin-top: 4px;
}

.curriculum-entry__maturity-label {
  margin-top: 4px;
  font-size: 0.72rem;
  font-weight: 600;
}
</style>