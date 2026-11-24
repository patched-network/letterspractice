<template>
  <div class="sw-report">
    <div v-if="inPlay.length" class="sw-report__words">
      <span v-for="w in shown" :key="w" class="sw-report__word">{{ w }}</span>
      <span v-if="hiddenCount > 0" class="sw-report__more text-medium-emphasis">+{{ hiddenCount }} more</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonReportContext } from '../../services/lessons/progress/types';
import { sightWordsInPlay } from '../../services/lessons/progress/sightWordsReporter';

const props = defineProps<{
  context: LessonReportContext;
}>();

/** Words shown before "+N more": the report sits in a curriculum row. */
const SHOWN_MAX = 12;

const inPlay = computed(() => sightWordsInPlay(props.context.tagScores).inPlay);
const shown = computed(() => inPlay.value.slice(0, SHOWN_MAX));
const hiddenCount = computed(() => Math.max(0, inPlay.value.length - SHOWN_MAX));
</script>

<style scoped>
.sw-report {
  margin-top: 6px;
}

.sw-report__words {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  max-width: 340px;
}

.sw-report__word {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.sw-report__more {
  font-size: 0.7rem;
  margin-left: 2px;
}
</style>
