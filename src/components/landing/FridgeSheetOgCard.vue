<!--
  FridgeSheetOgCard: /fridge-sheet's link-preview image (og:image), 1200×630.
  The page's picture (FridgeSheetMini, nine keys coloured as on the page)
  held to a fridge door by a magnet, beside what the sheet is. Same frame as
  the lesson cards (LessonOgCard): content centred above the wordmark along
  the foot (og/OgCardFrame.vue). Path and alt text: curriculum/ogCard.ts
  (PAGE_OG_CARDS).

  Rendered by the dev-only /dbg/og/page/fridge-sheet page (dbg/OgCardsDbg.vue)
  and screenshotted by scripts/export-og-cards.ts. Emits `ready` once the
  wordmark is coloured.
-->
<template>
  <OgCardFrame :art-width="560" :gap="64" :background="FRIDGE_DOOR" class="og-fridge" @ready="emit('ready')">
    <template #art>
      <div class="og-card__sheet">
        <FridgeSheetMini :coloured="9" />
        <span class="og-card__magnet" aria-hidden="true"></span>
      </div>
    </template>

    <h1 class="og-card__title">The fridge sheet</h1>
    <p class="og-card__description">Take it offline with our trophy case and learning scaffold.</p>
    <p class="og-card__description">Color letters in as you master them - with or without the app.</p>
  </OgCardFrame>
</template>

<script setup lang="ts">
import OgCardFrame from "../og/OgCardFrame.vue";
import FridgeSheetMini from "./FridgeSheetMini.vue";

const emit = defineEmits<{ ready: [] }>();

/** A fridge door: cool off-white, a little sheen across it */
const FRIDGE_DOOR = "linear-gradient(105deg, #f6f8fa 0%, #e9eef2 55%, #f1f4f7 100%)";
</script>

<style scoped>
.og-fridge {
  --og-desc-size: 30px;
  --og-desc-gap: 20px;
}

/* Tilted and shadowed as on the page (FridgeSheetView's .sheet-pic) */
.og-card__sheet {
  position: relative;
  transform: rotate(-1.5deg);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 16px 36px rgba(0, 0, 0, 0.18);
}
.og-card__sheet :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
/* The keys are drawn already coloured; no fade-in to catch half-way */
.og-card__sheet :deep(.fsm-fill) {
  animation: none;
}
/* Bites the sheet's top edge, as the lesson cards' badge bites the still */
.og-card__magnet {
  position: absolute;
  top: 0;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -45%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f07a70 0%, #e2483d 45%, #b8322a 100%);
  box-shadow:
    0 2px 3px rgba(0, 0, 0, 0.25),
    0 6px 12px rgba(0, 0, 0, 0.15);
}


</style>
