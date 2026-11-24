<template>
  <div class="dg-report">
    <div class="dg-report__grid">
      <SkillBadge
        v-for="entry in badgeData"
        :key="entry.tag"
        :label="entry.grapheme"
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
import { DIGRAPH_GPC_TAGS } from '../../services/lessons/progress/digraphsReporter';
import { readSkillEvidence, isMastered, type SkillEvidence } from '../../services/lessons/progress/skillEvidence';
import { useSkillHighlight, skillHighlightClass } from '../../composables/useSkillHighlight';
import SkillBadge from './SkillBadge.vue';

const props = defineProps<{
  context: LessonReportContext;
}>();

const highlight = useSkillHighlight();

interface DigraphBadge {
  grapheme: string;
  tag: string;
  gpcId: string;
  examples: string[];
  evidence: SkillEvidence;
  met: boolean;
}

const badgeData = computed<DigraphBadge[]>(() => {
  const tagScores = props.context.tagScores;
  return DIGRAPH_GPC_TAGS.map(({ grapheme, tag, examples }) => {
    const evidence = readSkillEvidence(tagScores[tag]?.recent);
    return {
      grapheme,
      tag,
      gpcId: `GPC-${tag.slice('gpc:exercise:'.length)}`,
      examples,
      evidence,
      met: isMastered(evidence),
    };
  });
});
</script>

<style scoped>
.dg-report {
  margin-top: 6px;
}

.dg-report__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 340px;
}

</style>
