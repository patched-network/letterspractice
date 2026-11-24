<template>
  <div ref="paneEl" class="lesson-complete">
    <div class="lesson-complete__message">
      <v-icon size="48" color="success" class="mb-3">mdi-check-circle</v-icon>
      <h3 class="text-h5 mb-1">Lesson Complete!</h3>
    </div>
    <button
      class="lesson-complete__cta"
      type="button"
      @click="$emit('practice-now')"
    >
      <!-- One WordDisplay per word so the row can wrap to two lines on phones
           (the single-line CTA is ~490px wide at 44px letter height). maxWidth
           is the backstop for screens too narrow even for "Practicing" alone. -->
      <span class="lesson-complete__cta-row">
        <WordDisplay
          v-for="word in CTA_WORDS"
          :key="word"
          :text="word"
          :height="44"
          :max-width="wordMaxWidth"
          :options="ctaWordOptions"
          :transform-fn="ctaTransform"
          class="lesson-complete__cta-word"
        />
      </span>
    </button>
    <v-btn
      size="small"
      variant="text"
      color="default"
      class="lesson-complete__back"
      @click="$emit('back-to-menu')"
    >
      {{ backLabel }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted, onBeforeUnmount } from 'vue';
import WordDisplay from '../letterpeople/vue/WordDisplay.vue';
import type { WordOptions } from '../letterpeople/Word';
import {
  composeTransforms,
  createJiggleTransform,
  BRAND_COLOR_TRANSFORM,
} from '../letterpeople/transforms';
import { COMPLETE_PANE_BACK_LABEL } from './completePaneLabel';

defineEmits<{
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

const CTA_WORDS = ['Start', 'Practicing'];
const backLabel = inject(COMPLETE_PANE_BACK_LABEL, 'Back to Menu');

// CTA button's horizontal padding (28×2); the observed contentRect already
// excludes the pane's own padding.
const CTA_PADDING_X = 56;

const paneEl = ref<HTMLElement | null>(null);
const wordMaxWidth = ref<number | undefined>(undefined);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!paneEl.value) return;
  resizeObserver = new ResizeObserver(([entry]) => {
    wordMaxWidth.value = Math.max(0, Math.floor(entry.contentRect.width - CTA_PADDING_X));
  });
  resizeObserver.observe(paneEl.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

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

const ctaTransform = composeTransforms(
  BRAND_COLOR_TRANSFORM,
  createJiggleTransform({
    intensity: 3,
    rotationRange: 13,
    duration: 2800,
    ease: 'outElastic(1, .8)',
    stagger: 20,
  }),
);
</script>

<style scoped>
.lesson-complete {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 32px 24px;
  text-align: center;
  background: linear-gradient(135deg, #FFFEF7 0%, #E8F5E9 100%);
  z-index: 10;
}

.lesson-complete__message {
  margin-bottom: 28px;
}

.lesson-complete__cta {
  background: white;
  border: none;
  border-radius: 18px;
  padding: 14px 28px;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12), inset 0 -4px 0 rgba(0, 0, 0, 0.08);
  transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, filter 0.12s ease-out;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  max-width: 100%;
}
.lesson-complete__cta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  column-gap: 8px;
}
.lesson-complete__cta:hover {
  filter: brightness(1.03);
  transform: translateY(-1px);
}
.lesson-complete__cta:active {
  transform: translateY(2px);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.12), inset 0 -2px 0 rgba(0, 0, 0, 0.08);
}

.lesson-complete__cta-word {
  line-height: 1;
  overflow: visible;
  display: flex;
  align-items: center;
}
.lesson-complete__cta-word :deep(.word-display),
.lesson-complete__cta-word :deep(.word-visual) {
  overflow: visible !important;
  padding: 8px;
}

.lesson-complete__back {
  margin-top: 4px;
  opacity: 0.7;
}
</style>
