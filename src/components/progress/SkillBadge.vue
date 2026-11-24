<template>
  <v-tooltip location="top" open-delay="150" max-width="280">
    <template #activator="{ props: tip }">
      <div
        v-bind="tip"
        class="skill-badge"
        :class="[{ 'skill-badge--filling': isFilling }, highlightClass]"
        :style="{ background: color }"
      >
        <span class="skill-badge__label"><slot>{{ label }}</slot></span>
      </div>
    </template>
    <div class="skill-tip">
      <div class="skill-tip__head">
        <strong>{{ label }}</strong>
        <span class="skill-tip__state">{{ stateLabel }}</span>
      </div>
      <div v-if="examplesLine" class="skill-tip__examples">{{ examplesLine }}</div>
      <div v-if="evidence.strip.length" class="skill-tip__strip" aria-label="recent attempts, oldest first">
        <span
          v-for="(tick, i) in evidence.strip"
          :key="i"
          class="skill-tip__tick"
          :class="tick.ok ? 'skill-tip__tick--ok' : 'skill-tip__tick--miss'"
          :title="labelForCardId(tick.card)"
        >
          <span class="skill-tip__mark">{{ tick.ok ? '✓' : '✗' }}</span>
          <span class="skill-tip__word">{{ labelForCardId(tick.card) }}</span>
        </span>
      </div>
      <div v-else class="skill-tip__empty">No attempts recorded yet.</div>
      <div class="skill-tip__meta">
        <span>{{ evidence.distinctCards }} {{ evidence.distinctCards === 1 ? 'word' : 'words' }}</span>
        <span>·</span>
        <span>last seen {{ lastSeen }}</span>
      </div>
      <div v-if="evidence.warmHits" class="skill-tip__warm">
        + {{ evidence.warmHits }} same-session {{ evidence.warmHits === 1 ? 're-show' : 're-shows' }} right, not counted
      </div>
    </div>
  </v-tooltip>
</template>

<script setup lang="ts">
/**
 * One skill tile: colour = evidence state, hover = the evidence itself
 * (ordered hit/miss strip labelled by word, distinct-card count, last seen).
 * No click-through. Colour and copy come from badgeMaturity.ts; the state
 * comes from the shared read policy (skillEvidence.ts).
 */
import { computed } from 'vue';
import type { SkillEvidence } from '../../services/lessons/progress/skillEvidence';
import { labelForCardId } from '../../services/lessons/progress/cardLabel';
import { evidenceColor, evidenceStateLabel, formatBadgeTooltip, formatLastSeen } from './badgeMaturity';

const props = defineProps<{
  /** Badge text and tooltip heading (grapheme / letter). */
  label: string;
  evidence: SkillEvidence;
  /** Example words for the tooltip's "as in" line. */
  examples?: string[];
  /** Pass-through for useSkillHighlight's class binding. */
  highlightClass?: string;
}>();

// Unseen and emerging tiles are grey-to-faded, so they keep dark text.
const isFilling = computed(() => props.evidence.state.kind === 'filling');
const color = computed(() => evidenceColor(props.evidence));
const stateLabel = computed(() => evidenceStateLabel(props.evidence));
const examplesLine = computed(() =>
  props.examples && props.examples.length ? formatBadgeTooltip(props.label, props.examples) : '',
);
const lastSeen = computed(() => formatLastSeen(props.evidence.lastSeen));
</script>

<style scoped>
.skill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 30px;
  padding: 0 6px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: monospace;
  color: #fff;
  cursor: default;
  user-select: none;
  transition: background 0.3s ease;
}

.skill-badge--filling {
  color: rgba(0, 0, 0, 0.62);
}

.skill-tip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.78rem;
}

.skill-tip__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.skill-tip__state {
  opacity: 0.85;
}

.skill-tip__examples,
.skill-tip__meta,
.skill-tip__empty,
.skill-tip__warm {
  opacity: 0.8;
  font-size: 0.72rem;
}

.skill-tip__meta {
  display: flex;
  gap: 6px;
}

.skill-tip__strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.skill-tip__tick {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.7rem;
  line-height: 1.4;
}

.skill-tip__tick--ok {
  background: rgba(76, 175, 80, 0.35);
}

.skill-tip__tick--miss {
  background: rgba(244, 67, 54, 0.4);
}

.skill-tip__mark {
  font-weight: 700;
}
</style>
