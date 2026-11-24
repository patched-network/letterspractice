<!--
  LearningEngineOgCard: /learning-engine's link-preview image. The page's
  opening claim drawn out: three streams of cards (new material, review,
  recombination) merging into one day's session, beside the page's title.

  Colours follow the rivals that feed each stream (pedagogy/rivals.ts):
  new material is the curriculum's, review is spaced repetition's, and
  recombination takes the next slot. Every stream is also labelled, so
  colour is never the only identity. Sounds and words are drawn differently:
  a sound is a square letter tile (a keycap), a word a wide card. The
  contents are illustrative, not drawn from the engine: an early session, one
  new sound (a) beside four known ones, and words that combine them.

  Rendered by /dbg/og/page/learning-engine (dbg/OgCardsDbg.vue) and
  screenshotted by scripts/export-og-cards.ts.
-->
<template>
  <OgCardFrame :art-width="620" :gap="52" @ready="emit('ready')">
    <template #art>
      <div class="og-eng">
        <div class="og-eng__streams">
          <div v-for="s in STREAMS" :key="s.id" class="og-eng__stream" :style="{ '--c': s.color }">
            <span class="og-eng__label">{{ s.label }}</span>
            <div class="og-eng__items">
              <span v-for="item in s.items" :key="item" :class="chipClass(item)">{{ item }}</span>
              <span v-if="s.more" class="og-eng__more">…</span>
            </div>
            <!-- Runs from the last chip down to the merge, so every stream's line is unbroken -->
            <span class="og-eng__stem" aria-hidden="true"></span>
          </div>
        </div>

        <svg class="og-eng__merge" viewBox="0 0 620 64" aria-hidden="true">
          <path
            v-for="(s, i) in STREAMS"
            :key="s.id"
            :d="`M ${COLUMN_X[i]} 0 C ${COLUMN_X[i]} 36, 310 28, 310 64`"
            :stroke="s.color"
            stroke-width="6"
            fill="none"
            stroke-linecap="round"
          />
        </svg>

        <div class="og-eng__session">
          <span class="og-eng__today">Today</span>
          <span
            v-for="(c, i) in SESSION"
            :key="i"
            :class="[chipClass(c.text), 'og-eng__chip--session']"
            :style="{ '--c': byId[c.from].color }"
            >{{ c.text }}</span
          >
          <span class="og-eng__more">…</span>
        </div>
      </div>
    </template>

    <h1 class="og-card__title">{{ pedagogyCopy.title }}</h1>
    <p class="og-card__description">The right mix of review, recombination and new material, for each child, every day.</p>
  </OgCardFrame>
</template>

<script setup lang="ts">
import { pedagogyCopy } from "../../content/pedagogyCopy";
import { CATEGORICAL, deepTier } from "../../theme/categoricalPalette";
import OgCardFrame from "./OgCardFrame.vue";

const emit = defineEmits<{ ready: [] }>();

type StreamId = "new" | "review" | "recombine";
/** `more`: the list goes on (an ellipsis after it) */
const STREAMS: { id: StreamId; label: string; color: string; items: string[]; more?: boolean }[] = [
  { id: "new", label: "New", color: deepTier(CATEGORICAL[0]), items: ["a"] },
  { id: "review", label: "Review", color: deepTier(CATEGORICAL[1]), items: ["i", "s", "f", "n"], more: true },
  { id: "recombine", label: "Recombine", color: deepTier(CATEGORICAL[2]), items: ["sit", "sat", "fit", "fan"], more: true },
];

/** Each stream column's centre in the merge's 620-wide viewBox: three columns, 20px gaps */
const COLUMN_X = [0, 1, 2].map((i) => ((620 - 40) / 3) * (i + 0.5) + 20 * i);
const byId = Object.fromEntries(STREAMS.map((s) => [s.id, s])) as Record<StreamId, (typeof STREAMS)[number]>;

/** Recombination's items are words; everything else is a sound (a grapheme: sh would be one) */
const WORDS = new Set(byId.recombine.items);
const isWord = (text: string) => WORDS.has(text);
const chipClass = (text: string) => ["og-eng__chip", isWord(text) ? "og-eng__chip--word" : "og-eng__chip--sound"];

/** One session, interleaved: the new sound a few times, review, and words built from both */
const SESSION: { text: string; from: StreamId }[] = [
  { text: "s", from: "review" },
  { text: "sit", from: "recombine" },
  { text: "a", from: "new" },
  { text: "sat", from: "recombine" },
  { text: "f", from: "review" },
  { text: "fan", from: "recombine" },
  { text: "a", from: "new" },
  { text: "fit", from: "recombine" },
];
</script>

<style scoped>
.og-eng__streams {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.og-eng__stream {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
/* Fills the column below its chips (the grid stretches all three to the
   tallest), meeting the merge curve: the same colour and weight as the curve */
.og-eng__stem {
  flex: 1;
  min-height: 6px;
  width: 6px;
  border-radius: 3px 3px 0 0;
  background: var(--c);
}
.og-eng__more {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: rgba(33, 33, 33, 0.45);
}
/* Under review's two-by-two, centred across both columns */
.og-eng__items > .og-eng__more {
  grid-column: 1 / -1;
  justify-self: center;
}
.og-eng__label {
  margin-bottom: 4px;
  padding: 4px 16px;
  border-radius: 999px;
  background: var(--c);
  color: #ffffff;
  font-size: 22px;
  font-weight: 700;
}
.og-eng__items {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
/* Review's four sounds sit two by two */
/* Review's four sounds sit two by two */
.og-eng__stream:nth-child(2) .og-eng__items {
  display: grid;
  grid-template-columns: repeat(2, auto);
}
.og-eng__chip {
  box-sizing: border-box;
  background: #ffffff;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}
/* A sound: a square keycap, coloured all round */
.og-eng__chip--sound {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 4px solid var(--c);
  border-radius: 10px;
  box-shadow: 0 3px 0 color-mix(in srgb, var(--c) 45%, #ffffff);
  font-size: 30px;
}
/* A word: a wide card, the colour down its left edge */
.og-eng__chip--word {
  min-width: 104px;
  padding: 9px 16px 11px;
  border-left: 7px solid var(--c);
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  font-size: 26px;
}
.og-eng__merge {
  display: block;
  width: 100%;
  height: 64px;
  margin: 0 0 6px;
}
.og-eng__session {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  border-radius: 14px;
  background: rgba(33, 33, 33, 0.05);
}
.og-eng__today {
  margin-right: 6px;
  font-size: 22px;
  font-weight: 700;
  color: rgba(33, 33, 33, 0.7);
}
.og-eng__chip--session.og-eng__chip--sound {
  width: 44px;
  height: 44px;
  font-size: 26px;
}
.og-eng__chip--session.og-eng__chip--word {
  min-width: 0;
  padding: 7px 10px 9px;
  font-size: 24px;
}
</style>
