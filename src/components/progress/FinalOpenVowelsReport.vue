<template>
  <div class="fov-report">
    <div class="fov-report__grid">
      <SkillBadge
        v-for="entry in badgeData"
        :key="entry.tag"
        :label="entry.grapheme"
        :evidence="entry.evidence"
        :examples="entry.examples"
        :highlight-class="skillHighlightClass(highlight, entry.gpcId)"
      >
        <!-- Leading gap marks word-final position, so the badge reads as
             "something, then e at the end" and doesn't visually collide with
             the short-vowel e/i/o badges in the hello-world grid above. -->
        <span class="fov-report__gap">—</span>
        <span class="fov-report__vowel">{{ entry.grapheme }}</span>
      </SkillBadge>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonReportContext } from '../../services/lessons/progress/types';
import { FINAL_OPEN_VOWEL_GPC_TAGS } from '../../services/lessons/progress/finalOpenVowelsReporter';
import { readSkillEvidence, isMastered, type SkillEvidence } from '../../services/lessons/progress/skillEvidence';
import { useSkillHighlight, skillHighlightClass } from '../../composables/useSkillHighlight';
import SkillBadge from './SkillBadge.vue';

const props = defineProps<{
  context: LessonReportContext;
}>();

const highlight = useSkillHighlight();

interface FinalOpenBadge {
  grapheme: string;
  tag: string;
  gpcId: string;
  examples: string[];
  evidence: SkillEvidence;
  met: boolean;
}

const badgeData = computed<FinalOpenBadge[]>(() => {
  const tagScores = props.context.tagScores;
  return FINAL_OPEN_VOWEL_GPC_TAGS.map(({ grapheme, tag, examples }) => {
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
.fov-report {
  margin-top: 6px;
}

.fov-report__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 340px;
}


.fov-report__gap {
  font-size: 0.6rem;
  opacity: 0.7;
  margin: 0 1px;
}
</style>
