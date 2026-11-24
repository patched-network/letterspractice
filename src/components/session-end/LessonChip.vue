<!--
  LessonChip — one GPC on the session summary, in /curriculum's look: its
  lesson's colour as a left edge (FactChip). A ✱ marks a miss this session.
  Tooltip (hover, focus or tap): the fact with example words, optionally its
  lesson, the miss count, and the last couple of wrong answers where the
  card says them plainly (a spelling's typed word, who-said-that's pick).
-->
<template>
  <v-tooltip
    location="top"
    open-delay="150"
    open-on-click
    max-width="260"
    content-class="app-tooltip app-tooltip--edged"
    :content-props="{ style: { '--tip-edge': color } }"
  >
    <template #activator="{ props: tip }">
      <span v-bind="tip" class="lesson-chip" tabindex="0" :style="{ '--lesson-color': color }">
        <span class="grapheme-label">{{ label }}</span>
        <span v-if="count && count > 1" class="exercise-count">×{{ count }}</span>
        <span v-if="miss" class="miss-mark" aria-label="missed this session">✱</span>
      </span>
    </template>
    <div class="chip-tip">
      <div>{{ factLine }}</div>
      <div v-if="lessonLine" class="chip-tip__lesson">{{ lessonLine }}</div>
      <div v-if="miss" class="chip-tip__miss">
        <span class="chip-tip__mark">✱</span> missed {{ miss.failCount }} of {{ miss.totalAttempts }} {{ miss.totalAttempts === 1 ? 'try' : 'tries' }}
        <div v-for="(m, i) in recentMisses" :key="i" class="chip-tip__detail">
          <template v-if="m.kind === 'spelled'">wrote <b>{{ m.answer }}</b> for <b>{{ m.word }}</b></template>
          <template v-else>picked <b>{{ m.answer }}</b> for <b>{{ m.target }}</b></template>
        </div>
      </div>
    </div>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { GPC_OVERRIDES } from '../../services/curriculum';
import { LESSON_CATALOG } from '../../services/lessons';
import { findFact, lessonColor } from '../curriculum/curriculumData';
import { formatBadgeTooltip } from '../progress/badgeMaturity';
import type { MissDetail } from '../../composables/useSessionSummary';

const props = defineProps<{
  grapheme: string;
  gpcShortId: string;
  lessonId: string | null;
  /** Exercise count, shown as ×N when over 1 */
  count?: number;
  /** This session's misses on it, if any */
  miss?: { failCount: number; totalAttempts: number; misses?: MissDetail[] };
  /** Name the lesson in the tooltip (where no group header does) */
  showLesson?: boolean;
}>();

/** Neutral edge for GPCs outside a live lesson */
const NO_LESSON_COLOR = 'rgba(var(--v-theme-on-surface), 0.25)';

const color = computed(() => (props.lessonId && lessonColor(props.lessonId)) || NO_LESSON_COLOR);

/** Split digraphs read "a…e" */
const label = computed(() => props.grapheme.replace(/_/g, '…'));

/**
 * "sh as in ship, shop, or fish." Examples: /curriculum's (the sim's most
 * frequent readable words), else the curriculum override's. A whole word
 * is its own example.
 */
const factLine = computed(() => {
  if (props.gpcShortId.startsWith('WORD-')) return `${label.value}, read as a whole word.`;
  const examples =
    findFact(props.gpcShortId)?.examples ?? GPC_OVERRIDES[`GPC-${props.gpcShortId}`]?.examples ?? [];
  return formatBadgeTooltip(label.value, examples.slice(0, 3));
});

/** Up to the last two distinct wrong answers, latest first. */
const MAX_MISS_DETAILS = 2;
const recentMisses = computed(() => {
  const seen = new Set<string>();
  const out: MissDetail[] = [];
  for (const m of [...(props.miss?.misses ?? [])].reverse()) {
    const key = JSON.stringify(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length === MAX_MISS_DETAILS) break;
  }
  return out;
});

const lessonLine = computed(() => {
  if (!props.showLesson) return '';
  const i = LESSON_CATALOG.findIndex((l) => l.id === props.lessonId);
  return i < 0 ? '' : `Lesson ${i + 1} · ${LESSON_CATALOG[i].title}`;
});
</script>

<style scoped>
.lesson-chip {
  display: inline-flex;
  align-items: baseline;
  padding: 2px 8px 3px;
  border-left: 4px solid var(--lesson-color);
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  cursor: default;
}

.lesson-chip:focus-visible {
  outline: 2px solid var(--lesson-color);
  outline-offset: 2px;
}

.grapheme-label {
  font-weight: 600;
  font-family: 'Roboto Mono', monospace;
  font-size: 0.85rem;
}

.exercise-count {
  font-size: 0.7rem;
  margin-left: 3px;
  opacity: 0.7;
}

.miss-mark {
  margin-left: 3px;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--v-theme-warning));
}

.chip-tip {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip-tip__lesson,
.chip-tip__miss {
  font-size: 0.75rem;
}

.chip-tip__lesson {
  opacity: 0.8;
}

.chip-tip__mark {
  color: rgb(var(--v-theme-warning));
  font-weight: 700;
}

.chip-tip__detail {
  margin-top: 2px;
  padding-left: 12px;
}

.chip-tip__detail b {
  font-family: 'Roboto Mono', monospace;
  font-weight: 600;
}
</style>
