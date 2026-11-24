<!--
  FridgeSheetMini.vue

  A small drawing of the printed fridge sheet (public/print/), used
  as the scrollytell's closing visual in place of the phone. It is a picture of
  the sheet part-way through use, not a preview of the PDF: some keys coloured
  in crayon, one half done, the rest blank.

  Keys colour in the order a typical learner gets them (the /curriculum sim,
  keyArrivals), `coloured` of them in full and the next one half done.
  The walkthrough drives `coloured` from scroll.

  Geometry follows the real sheet (1056×816 Letter landscape, 94px keys on a
  101px pitch, QWERTY stagger from keyboardLayout.ts) so it reads as the same
  object. Keys carry plain Poppins letters rather than the sheet's LetterPeople
  outlines: at landing-page size (~35-45px per key) the faces turn to mush.
-->
<template>
  <svg
    class="fsm"
    viewBox="0 0 1056 816"
    role="img"
    aria-label="The printed fridge sheet: a keyboard of letters, some coloured in with crayon"
  >
    <defs>
      <!-- Wobbles crayon edges so fills don't read as vector boxes. -->
      <filter id="fsm-rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="7" />
      </filter>
      <pattern
        v-for="c in CRAYONS"
        :id="`fsm-hatch-${c.id}`"
        :key="c.id"
        width="9"
        height="9"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-38)"
      >
        <rect width="9" height="9" :fill="c.color" opacity="0.35" />
        <line x1="0" y1="2" x2="9" y2="2" :stroke="c.color" stroke-width="6" />
      </pattern>
      <clipPath v-for="k in LAYOUT" :id="`fsm-key-${k.letter}`" :key="k.letter">
        <rect :x="k.x" :y="k.y" :width="KEY" :height="KEY" rx="14" />
      </clipPath>
      <!-- The in-progress key: coloured from the lower-left, not yet finished. -->
      <clipPath v-if="partialPoints" id="fsm-partial">
        <polygon :points="partialPoints" />
      </clipPath>
    </defs>

    <!-- paper -->
    <rect width="1056" height="816" fill="#fffdf8" />

    <!-- wordmark, already coloured in (the sheet's first job) -->
    <text
      x="48"
      y="112"
      class="fsm-wordmark"
      filter="url(#fsm-rough)"
    >
      <tspan
        v-for="(ch, i) in WORDMARK"
        :key="i"
        :fill="ch === ' ' ? 'none' : `url(#fsm-hatch-${CRAYONS[i % CRAYONS.length].id})`"
      >{{ ch }}</tspan>
    </text>
    <text x="48" y="112" class="fsm-wordmark fsm-wordmark--line">{{ WORDMARK }}</text>
    <text x="48" y="184" class="fsm-small">Sounds in progress, belonging to:</text>
    <line x1="440" y1="186" x2="1008" y2="186" stroke="#222" stroke-width="2" />

    <!-- keys -->
    <g v-for="k in keys" :key="k.letter">
      <rect
        v-if="k.fill"
        class="fsm-fill"
        :x="k.x - 4"
        :y="k.y - 4"
        :width="KEY + 8"
        :height="KEY + 8"
        :fill="`url(#fsm-hatch-${k.fill})`"
        :clip-path="k.partial ? 'url(#fsm-partial)' : `url(#fsm-key-${k.letter})`"
        filter="url(#fsm-rough)"
      />
      <rect
        :x="k.x"
        :y="k.y"
        :width="KEY"
        :height="KEY"
        rx="14"
        fill="none"
        stroke="#222"
        stroke-width="3"
      />
      <text :x="k.x + KEY / 2" :y="k.y + KEY / 2 + 20" class="fsm-letter">{{ k.letter }}</text>
    </g>

    <text x="528" y="700" class="fsm-small fsm-center">
      Colour in each letter as the app introduces it.
    </text>
    <text x="528" y="748" class="fsm-small fsm-center fsm-url">letterspractice.com</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ROW_OFFSETS, getKeysByRow } from "@/components/keyboard/keyboardLayout";
import { DEFAULT_AGE, keyArrivals } from "@/components/curriculum/curriculumData";

const props = withDefaults(defineProps<{ coloured?: number }>(), { coloured: 5 });

const KEY = 94;
const PITCH = 101;
const KEYS_TOP = 250;
// Top row is the widest (10 keys, no offset); centre it on the page.
const KEYS_LEFT = (1056 - (10 * PITCH - (PITCH - KEY))) / 2;

const WORDMARK = "Letters Practice";

const CRAYONS = [
  { id: "red", color: "#e2483d" },
  { id: "orange", color: "#f39a2b" },
  { id: "green", color: "#3fa45b" },
  { id: "blue", color: "#3b7bd4" },
  { id: "purple", color: "#8a55c6" },
  { id: "yellow", color: "#f2c230" },
] as const;

/** Keys in the order they're coloured in; each keeps one crayon throughout. */
const ORDER = keyArrivals(DEFAULT_AGE).map((a) => a.key);
const CRAYON_OF = new Map(ORDER.map((letter, i) => [letter, CRAYONS[i % CRAYONS.length].id]));

const LAYOUT = [1, 2, 3].flatMap((row) =>
  getKeysByRow(row).map((k) => ({
    letter: k.letter,
    x: KEYS_LEFT + (k.col + ROW_OFFSETS[row]) * PITCH,
    y: KEYS_TOP + (row - 1) * PITCH,
  })),
);

const keys = computed(() => {
  const done = new Set(ORDER.slice(0, props.coloured));
  const partial = ORDER[props.coloured];
  return LAYOUT.map((k) => ({
    ...k,
    fill: done.has(k.letter) || k.letter === partial ? CRAYON_OF.get(k.letter) : undefined,
    partial: k.letter === partial,
  }));
});

const partialPoints = computed(() => {
  const partialKey = keys.value.find((k) => k.partial);
  if (!partialKey) return null;
  const { x, y } = partialKey;
  // Lower-left ~60%, with a ragged diagonal edge where the crayon stopped.
  return [
    [x, y + KEY],
    [x, y + 30],
    [x + 18, y + 38],
    [x + 34, y + 52],
    [x + 58, y + 64],
    [x + 72, y + 82],
    [x + KEY, y + 88],
    [x + KEY, y + KEY],
  ]
    .map((p) => p.join(","))
    .join(" ");
});
</script>

<style scoped>
.fsm {
  display: block;
  width: 100%;
  height: auto;
  font-family: Poppins, Roboto, system-ui, sans-serif;
}
.fsm-wordmark {
  font-size: 68px;
  font-weight: 700;
  letter-spacing: 1px;
}
.fsm-wordmark--line {
  fill: none;
  stroke: #222;
  stroke-width: 2.5;
}
/* A newly coloured key fades in rather than snapping */
.fsm-fill {
  animation: fsm-fill-in 0.35s ease;
}
@keyframes fsm-fill-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fsm-fill {
    animation: none;
  }
}
.fsm-letter {
  font-size: 56px;
  font-weight: 600;
  text-anchor: middle;
  fill: #222;
}
.fsm-small {
  font-size: 24px;
  fill: #333;
}
.fsm-center {
  text-anchor: middle;
}
.fsm-url {
  font-weight: 600;
}
</style>
