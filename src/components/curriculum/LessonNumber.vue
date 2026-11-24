<!--
  LessonNumber — a lesson's number on its colour, wherever /curriculum names a
  lesson: a disc in the strip's legend and openings (sm), a "Lesson N" badge
  on each section's still (badge). Decorative: the lesson's title always sits
  beside it and carries the name, so it's hidden from screen readers.

  Ink text on every colour: knocked out (page-coloured) it would fall under
  3:1 on the green, yellow and pink.
-->
<template>
  <span
    class="lesson-number"
    :class="`lesson-number--${size}`"
    :style="{ '--lesson-color': color }"
    aria-hidden="true"
  >{{ size === 'badge' ? `Lesson ${n}` : n }}</span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ n: number | string; color: string; size?: 'sm' | 'badge' }>(), { size: 'sm' });
</script>

<style scoped>
.lesson-number {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 999px;
  background: var(--lesson-color);
  color: #212121;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.lesson-number--sm {
  width: 16px;
  height: 16px;
  font-size: 0.625rem;
}
.lesson-number--badge {
  padding: 8px 16px;
  font-size: 1rem;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
