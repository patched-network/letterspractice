<template>
  <div v-if="evaluation.perTag.length > 0" class="generic-report">
    <div
      v-for="item in evaluation.perTag"
      :key="item.tag"
      class="generic-report__item"
    >
      <div class="generic-report__label text-caption">
        <code>{{ formatTag(item.tag) }}</code>
        <span v-if="item.met" class="generic-report__met">✓</span>
      </div>
      <div class="generic-report__bars">
        <!-- Evidence: fill progress while the window fills, then the
             recency-weighted accuracy of the last EVIDENCE_WINDOW attempts. -->
        <div class="generic-report__bar">
          <div class="generic-report__track">
            <div
              class="generic-report__fill"
              :class="item.evidence.state.kind === 'filling' ? 'generic-report__fill--count' : 'generic-report__fill--elo'"
              :style="{ width: `${barPct(item)}%`, background: barColor(item) }"
            ></div>
          </div>
          <span class="generic-report__text text-caption">
            {{ evidenceStateLabel(item.evidence) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LessonReportContext, MasteryTagResult } from '../../services/lessons/progress/types';
import { getMasteryThresholds, evaluateMastery } from '../../services/lessons/progress/defaultMastery';
import { evidenceColor, evidenceStateLabel } from './badgeMaturity';

const props = defineProps<{
  context: LessonReportContext;
}>();

const evaluation = computed(() => {
  const thresholds = getMasteryThresholds(props.context.lesson);
  return evaluateMastery(thresholds, props.context.tagScores);
});

function barPct(item: MasteryTagResult): number {
  const s = item.evidence.state;
  if (s.kind === 'filling') return item.fillPct;
  if (s.kind === 'mastered') return 100;
  return Math.round(s.accuracy * 100);
}

function barColor(item: MasteryTagResult): string | undefined {
  // Filling keeps the stylesheet's neutral fill; verdict states paint the
  // same colour the badge grids use.
  return item.evidence.state.kind === 'filling' ? undefined : evidenceColor(item.evidence);
}

function formatTag(tag: string): string {
  // "concept:match:simple" → "match:simple"
  // "gpc:exercise:s-S" → "exercise: s → S"
  const parts = tag.split(':');
  if (parts.length >= 3) {
    const namespace = parts[1];
    const rest = parts.slice(2).join(':');
    const [grapheme, ...phonemeParts] = rest.split('-');
    if (phonemeParts.length > 0) {
      return `${namespace}: ${grapheme} → ${phonemeParts.join('-')}`;
    }
    return `${namespace}:${rest}`;
  }
  return tag;
}
</script>

<style scoped>
.generic-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.generic-report__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.generic-report__label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.generic-report__label code {
  font-size: 0.72rem;
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 4px;
  border-radius: 3px;
}

.generic-report__met {
  color: #4caf50;
  font-weight: 700;
  font-size: 0.75rem;
}

.generic-report__bars {
  display: flex;
  gap: 8px;
  align-items: center;
}

.generic-report__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.generic-report__track {
  flex: 1;
  height: 6px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}

.generic-report__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.generic-report__fill--count {
  background: #42a5f5;
}

.generic-report__fill--elo {
  background: #66bb6a;
}

.generic-report__text {
  font-size: 0.68rem;
  font-family: monospace;
  color: #888;
  white-space: nowrap;
  min-width: 70px;
}
</style>