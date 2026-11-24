<template>
  <!--
    Dev-only render harness for the email "Practice" CTA button image,
    consumed by scripts/export-email-cta.ts. Mirrors the production Practice
    CTA in src/components/hub/HubChoices.vue (.hub-cta--practice) so the
    exported PNG is pixel-faithful. Colours are a fresh random draw each render
    (BRAND_COLOR_TRANSFORM), which is the intended on-brand reshuffle.
  -->
  <div class="cta-export-harness">
    <div ref="wrap" class="cta-wrap" :data-ready="ready ? 'true' : 'false'">
      <button class="hub-cta hub-cta--practice" type="button">
        <WordDisplay
          text="Practice"
          :height="44"
          :options="ctaWordOptions"
          :transform-fn="ctaTransform"
          class="hub-cta__word"
          @transform-applied="onTransformApplied"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import WordDisplay from '../letterpeople/vue/WordDisplay.vue';
import type { WordOptions } from '../letterpeople/Word';
import { BRAND_COLOR_TRANSFORM } from '../letterpeople/transforms';

declare global {
  interface Window {
    __ctaReady?: boolean;
    __ctaError?: string;
  }
}

const wrap = ref<HTMLDivElement | null>(null);
const ready = ref(false);

// Mirrors HubChoices.vue ctaWordOptions (source of truth). Eyes/arms/mouth off,
// borderless glyphs — the clean form used in the hub CTA.
const ctaWordOptions: WordOptions = {
  spacing: 2,
  letterOptions: {
    lineWidth: 22,
    borderWidth: 0,
    showEyes: false,
    showArms: false,
    showMouth: false,
  },
};

// Production composes BRAND_COLOR_TRANSFORM with a jiggle animation; for a
// static asset we want the resting (upright) frame, so colour-only.
const ctaTransform = BRAND_COLOR_TRANSFORM;

function onTransformApplied() {
  // Two RAFs to ensure the recoloured SVG has painted before signalling.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ready.value = true;
      window.__ctaReady = true;
    }),
  );
}
</script>

<!--
  Unscoped: Vuetify paints an opaque theme background on html/body/.v-application,
  which would otherwise fill the transparent padding around the button. Force it
  transparent so the screenshot (omitBackground) yields a clean alpha around the pill.
-->
<style>
html,
body,
#app,
.v-application,
.v-application__wrap {
  background: transparent !important;
}
</style>

<style scoped>
.cta-export-harness {
  display: inline-block;
  background: transparent;
}

/* Padding so the button's outset drop-shadow isn't clipped by the screenshot. */
.cta-wrap {
  display: inline-block;
  padding: 16px;
  background: transparent;
}

/* --- replicated verbatim from HubChoices.vue (.hub-cta / --practice / __word) --- */
.hub-cta {
  background: white;
  border: none;
  border-radius: 18px;
  padding: 14px 28px;
  cursor: pointer;
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.12),
    inset 0 -4px 0 rgba(0, 0, 0, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.hub-cta--practice {
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.12),
    inset 0 -4px 0 rgba(255, 152, 0, 0.45);
}
.hub-cta__word {
  line-height: 1;
  overflow: visible;
  display: flex;
  align-items: center;
}
.hub-cta__word :deep(.word-display),
.hub-cta__word :deep(.word-visual) {
  overflow: visible !important;
  padding: 8px;
}
</style>
