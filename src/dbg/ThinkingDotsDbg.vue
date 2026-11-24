<!--
  ThinkingDotsDbg.vue

  Playground for the PunctuationThinking loading indicator.
  Lets you eyeball sizing / spacing and remount it to re-watch the
  "found one!" exclamation beat.
-->
<template>
  <div class="dbg-thinking">
    <h1>🔵 Thinking Dots — session loader</h1>

    <div class="controls">
      <label>
        dots (0 = auto/responsive)
        <input v-model.number="dots" type="number" min="0" max="6" />
      </label>
      <label>
        glyphHeight
        <input v-model.number="glyphHeight" type="number" min="40" max="200" step="4" />
      </label>
      <label>
        gap
        <input v-model.number="gap" type="number" min="0" max="40" />
      </label>
      <button @click="remount">↻ remount</button>
    </div>

    <p class="hint">
      Mimics the real loading slot: a soft card on a surface background. Every
      3rd wave the last dot leaps and becomes an exclamation.
    </p>

    <div class="stage">
      <div class="card">
        <PunctuationThinking
          v-if="mounted"
          :key="instanceKey"
          :dots="dots || undefined"
          :glyph-height="glyphHeight"
          :gap="gap"
        />
        <p class="caption">Gathering today's letters…</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PunctuationThinking from '../components/loading/PunctuationThinking.vue';

const dots = ref(0); // 0 → responsive (resize the window to see 3/4/5)
const glyphHeight = ref(88);
const gap = ref(14);

const mounted = ref(true);
const instanceKey = ref(0);

const remount = () => {
  mounted.value = false;
  instanceKey.value++;
  requestAnimationFrame(() => {
    mounted.value = true;
  });
};
</script>

<style scoped>
.dbg-thinking {
  padding: 24px;
}

.controls {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.controls label {
  display: inline-flex;
  flex-direction: column;
  font-size: 0.8rem;
  gap: 2px;
}

.controls input {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.controls button {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.hint {
  color: rgba(0, 0, 0, 0.55);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.stage {
  display: flex;
  justify-content: center;
  padding: 48px;
  background: #f4f4f5;
  border-radius: 12px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px 32px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.caption {
  margin: 16px 0 0;
  color: rgba(0, 0, 0, 0.6);
}
</style>
