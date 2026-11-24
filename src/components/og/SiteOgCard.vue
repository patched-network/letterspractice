<!--
  SiteOgCard: the site-wide link-preview image, /og-image.png: index.html's
  og:image, and every page's without a card of its own (SITE_IMAGE in
  content/pages.ts). The landing hero in short: its headline, with "read"
  spelled by LetterPeople, the pitch, the free tier; letter characters on
  tiles beside it. Redrawn here (2026-11-16) from a static PNG that had no
  source, so it can be re-exported when the brand moves.

  Copy follows the landing hero (content/landingPageCopy.ts hero); the price
  is written out here, as in the deployment's pitch (deployment/pitch.ts), so change both together.

  Rendered by /dbg/og/page/site (dbg/OgCardsDbg.vue) and screenshotted by
  scripts/export-og-cards.ts into public/og-image.png.
-->
<template>
  <OgCardFrame art-side="right" :art-width="380" :gap="24" :art-ready="lettersIn === LETTER_COUNT" @ready="emit('ready')">
    <template #art>
      <div class="og-site__tiles">
        <div
          v-for="(t, i) in TILES"
          :key="i"
          class="og-site__tile"
          :style="{ '--tile-color': t.color, '--x': `${t.x}px`, '--y': `${t.y}px`, '--r': `${t.r}deg` }"
        >
          <WordDisplay :text="t.letter" :height="120" :options="faceOptions(t.color)" @word-created="lettersIn++" />
        </div>
      </div>
    </template>

    <h1 class="og-card__title og-site__headline">
      {{ hero.headline.replace(" ", " ") }}
      <span class="og-site__read">
        <WordDisplay
          :text="hero.headlineWord"
          :height="86"
          :options="faceOptions(READ_COLOR)"
          @word-created="lettersIn++"
        />
      </span>
    </h1>
    <p class="og-card__description">Family-led learning for kids aged <b>2–5+</b>.</p>
    <p class="og-card__description">A <b>few minutes</b> a day, with guidance from our 26 in-house experts.</p>
    <p class="og-site__pill">
      First {{ FREE_TIER_WORD_THRESHOLD.toLocaleString("en-US") }} words free <span>· then $20 lifetime</span>
    </p>
  </OgCardFrame>
</template>

<script setup lang="ts">
import { ref } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import type { WordOptions } from "../../letterpeople/Word";
import { landingPageCopy } from "../../content/landingPageCopy";
import { FREE_TIER_WORD_THRESHOLD } from "../../services/curriculum";
import OgCardFrame from "./OgCardFrame.vue";

const emit = defineEmits<{ ready: [] }>();

const hero = landingPageCopy.hero;
const READ_COLOR = "#f57c00";

/** Scattered up the right side, as on the old card */
const TILES = [
  { letter: "e", color: "#ec6a5c", x: 10, y: -10, r: -6 },
  { letter: "z", color: "#a970d6", x: 170, y: 30, r: 5 },
  { letter: "p", color: "#17a9c0", x: 30, y: 220, r: 4 },
  { letter: "z", color: "#3b9f48", x: 200, y: 250, r: -5 },
];
/** One WordDisplay per tile, and "read" */
const LETTER_COUNT = TILES.length + 1;
const lettersIn = ref(0);

function faceOptions(color: string): WordOptions {
  return {
    spacing: 4,
    letterOptions: {
      color,
      lineWidth: 18,
      borderWidth: 3,
      borderColor: "#212121",
      showEyes: true,
      showMouth: true,
      showArms: true,
      armColor: "#212121",
    },
  };
}
</script>

<style scoped>
.og-site__headline {
  font-size: 84px;
  line-height: 1.05;
  margin-bottom: 28px;
}
.og-site__read {
  display: inline-block;
  vertical-align: -14px;
}
.og-card__description {
  --og-desc-size: 28px;
  --og-desc-gap: 10px;
}
.og-site__pill {
  display: inline-block;
  margin: 18px 0 0;
  padding: 12px 26px;
  border: 2px solid #f6c48a;
  border-radius: 999px;
  background: #fff1e0;
  color: #e65100;
  font-size: 24px;
  font-weight: 700;
}
.og-site__pill span {
  color: rgba(33, 33, 33, 0.6);
  font-weight: 500;
}

.og-site__tiles {
  position: relative;
  height: 440px;
}
.og-site__tile {
  position: absolute;
  left: var(--x);
  top: var(--y);
  width: 170px;
  height: 170px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background: color-mix(in srgb, var(--tile-color) 16%, #ffffff);
  transform: rotate(var(--r));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
</style>
