<!--
  OgCardFrame: the frame every link-preview card (og:image) is drawn in,
  1200×630. A picture (slot `art`) beside the copy (default slot), centred
  above the coloured LettersPractice.com wordmark along the foot.

  The copy's classes are global so each card's own markup can use them:
    .og-card__title        the card's heading
    .og-card__description  a line or two under it (size: --og-desc-size)

  Emits `ready` once the wordmark is coloured and the card says its picture
  is in (`artReady`): /dbg/og (dbg/OgCardsDbg.vue) then tells
  scripts/export-og-cards.ts to screenshot `.og-card`.
-->
<template>
  <div class="og-card" :class="`og-card--art-${artSide}`" :style="frameStyle">
    <div class="og-card__art"><slot name="art" /></div>
    <div class="og-card__body"><slot /></div>

    <div class="og-card__wordmark">
      <WordDisplay
        :text="OG_WORDMARK"
        :height="52"
        :options="wordmarkOptions"
        :transform-fn="BRAND_COLOR_TRANSFORM"
        @transform-applied="wordSettled = true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { BRAND_COLOR_TRANSFORM } from "../../letterpeople/transforms";
import { brandWordmarkOptions } from "../brandWordmark";
import { OG_WORDMARK } from "../curriculum/ogCard";

const props = withDefaults(
  defineProps<{
    /** The picture's column, px */
    artWidth?: number;
    /** Between picture and copy, px */
    gap?: number;
    artSide?: "left" | "right";
    /** The card's background (any CSS background); also --og-bg, for cut-out rings */
    background?: string;
    /** False until the picture has loaded or settled */
    artReady?: boolean;
  }>(),
  { artWidth: 520, gap: 56, artSide: "left", background: "#fffef7", artReady: true },
);
const emit = defineEmits<{ ready: [] }>();

const frameStyle = computed(() => ({
  "--og-bg": props.background,
  background: props.background,
  gap: `${props.gap}px`,
  gridTemplateColumns:
    props.artSide === "left" ? `${props.artWidth}px minmax(0, 1fr)` : `minmax(0, 1fr) ${props.artWidth}px`,
}));

const wordmarkOptions = brandWordmarkOptions(2);
const wordSettled = ref(false);

let readySent = false;
watchEffect(() => {
  if (!readySent && wordSettled.value && props.artReady) {
    readySent = true;
    emit("ready");
  }
});
</script>

<style scoped>
.og-card {
  position: relative;
  box-sizing: border-box;
  width: 1200px;
  height: 630px;
  overflow: hidden;
  display: grid;
  align-items: center;
  /* Deeper at the foot: the content centres above the wordmark */
  padding: 48px 64px 112px;
  color: #212121;
  font-family: Roboto, system-ui, sans-serif;
}
.og-card__art {
  position: relative;
  min-width: 0;
}
.og-card--art-right .og-card__art {
  order: 2;
}

/* Centred along the foot, under both columns */
.og-card__wordmark {
  position: absolute;
  left: 50%;
  bottom: 4px;
  transform: translateX(-50%);
}
</style>

<style>
.og-card__title {
  margin: 0 0 16px;
  font-size: 60px;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.01em;
}
.og-card__description {
  margin: 0 0 var(--og-desc-gap, 28px);
  font-size: var(--og-desc-size, 28px);
  line-height: 1.4;
  color: rgba(33, 33, 33, 0.85);
}
</style>
