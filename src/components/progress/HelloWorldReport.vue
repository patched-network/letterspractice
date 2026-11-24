<template>
  <div class="hw-report">
    <div class="hw-report__grid">
      <SkillBadge
        v-for="entry in letterData"
        :key="entry.letter"
        :label="entry.letter"
        :evidence="entry.evidence"
        :examples="entry.examples"
        :highlight-class="skillHighlightClass(highlight, entry.gpcId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonReportContext } from '../../services/lessons/progress/types';
import { LETTER_GPC_TAGS } from '../../services/lessons/progress/helloWorldReporter';
import { readSkillEvidence, isMastered, type SkillEvidence } from '../../services/lessons/progress/skillEvidence';
import { useSkillHighlight, skillHighlightClass } from '../../composables/useSkillHighlight';
import SkillBadge from './SkillBadge.vue';

const props = defineProps<{
  context: LessonReportContext;
}>();

const highlight = useSkillHighlight();

// ---------------------------------------------------------------------------
// Computed data
// ---------------------------------------------------------------------------

interface LetterBadge {
  letter: string;
  gpcId: string;
  examples: string[];
  evidence: SkillEvidence;
  met: boolean;
}

const letterData = computed<LetterBadge[]>(() => {
  const tagScores = props.context.tagScores;
  return LETTER_GPC_TAGS.map(({ letter, tag, examples }) => {
    const evidence = readSkillEvidence(tagScores[tag]?.recent);
    return {
      letter,
      gpcId: `GPC-${tag.slice('gpc:exercise:'.length)}`,
      examples,
      evidence,
      met: isMastered(evidence),
    };
  });
});
</script>

<style scoped>
.hw-report {
  margin-top: 6px;
}

.hw-report__grid {
  display: grid;
  /* Reflows on narrow screens; max-width fits exactly 13 columns (A–M / N–Z)
     at the badge's 30px min-width: 13×30 + 12×3 gap. */
  grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
  gap: 3px;
  max-width: 426px;
}

</style>