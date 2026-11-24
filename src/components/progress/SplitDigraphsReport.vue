<template>
  <div class="sd-report">
    <div class="sd-report__grid">
      <SkillBadge
        v-for="entry in badgeData"
        :key="entry.grapheme"
        :label="entry.grapheme"
        :evidence="entry.evidence"
        :examples="entry.examples"
        :highlight-class="skillHighlightClass(highlight, entry.gpcIds)"
      >
        <span class="sd-report__vowel">{{ entry.vowel }}</span>
        <span class="sd-report__gap">—</span>
        <span class="sd-report__e">e</span>
      </SkillBadge>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonReportContext } from '../../services/lessons/progress/types';
import { splitDigraphPatterns } from '../../services/lessons/progress/splitDigraphsReporter';
import { useSkillHighlight, skillHighlightClass } from '../../composables/useSkillHighlight';
import SkillBadge from './SkillBadge.vue';

const props = defineProps<{
  context: LessonReportContext;
}>();

const highlight = useSkillHighlight();

const badgeData = computed(() =>
  splitDigraphPatterns(props.context.tagScores).map((p) => ({
    ...p,
    vowel: p.grapheme[0],
    // Cap at 3 examples for tooltip readability
    examples: p.examples.slice(0, 3),
  })),
);
</script>

<style scoped>
.sd-report {
  margin-top: 6px;
}

.sd-report__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 340px;
}


.sd-report__gap {
  font-size: 0.6rem;
  opacity: 0.7;
  margin: 0 1px;
}
</style>
