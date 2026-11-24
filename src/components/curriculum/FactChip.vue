<!--
  FactChip — one fact (GPC) in a /curriculum lesson section: its spelling and
  example words; tap to hear its sound, then the first example. A whole word
  (Weird Words) shows only the word. Compact (the timeline's rows): one
  example, beside the spelling. A fact with no intro card of its own
  (it arrives with its lesson) gets a dashed edge.
-->
<template>
  <button
    type="button"
    class="fact-chip"
    :class="{
      'fact-chip--word': isWord,
      'fact-chip--rides': fact.kind === 'released',
      'fact-chip--compact': compact,
    }"
    :style="{ '--chip-color': color }"
    :aria-label="ariaLabel"
    @click="playFact(fact)"
  >
    <span class="fact-chip__grapheme">{{ fact.grapheme }}</span>
    <span v-if="!isWord && fact.examples.length" class="fact-chip__examples">
      {{ compact ? fact.examples[0] : fact.examples.join(', ') }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FactInfo } from './curriculumData';
import { playFact } from './playFact';

const props = defineProps<{ fact: FactInfo; color: string; compact?: boolean }>();

const isWord = computed(() => props.fact.gpc.startsWith('WORD-'));
const ariaLabel = computed(() =>
  isWord.value
    ? `${props.fact.grapheme} — play the word`
    : `${props.fact.grapheme}, as in ${props.fact.examples.join(', ')} — play the sound`,
);
</script>

<style scoped>
.fact-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 64px;
  padding: 6px 10px 7px;
  border: 0;
  border-left: 4px solid var(--chip-color);
  border-radius: 4px;
  /* White, to stand off the section's wash */
  background: #ffffff;
  color: #212121;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}
.fact-chip:hover,
.fact-chip:focus-visible {
  background: color-mix(in srgb, var(--chip-color) 18%, #ffffff);
}
.fact-chip:focus-visible {
  outline: 2px solid var(--chip-color);
  outline-offset: 2px;
}
.fact-chip--rides {
  border-left-style: dashed;
}
.fact-chip__grapheme {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}
.fact-chip--word .fact-chip__grapheme {
  font-size: 1.05rem;
}
.fact-chip--compact {
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 4px 10px 5px;
}
.fact-chip--compact .fact-chip__grapheme {
  font-size: 1.05rem;
}
.fact-chip__examples {
  font-size: 0.75rem;
  color: rgba(33, 33, 33, 0.6);
  line-height: 1.3;
}
</style>
