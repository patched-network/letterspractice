<!--
  PunctuationThinking.vue

  An on-brand "thinking…" loading indicator built from LetterPeople.

  A row of period-people (".") with eyes bob in a traveling wave, like a living
  typing indicator. Every Nth wave, the last dot leaps a little higher and
  morphs into an exclamation ("!") — a small "found one!" beat — then settles
  back to a period and the wave continues.

  Self-contained and side-effect-free: it creates its own LetterInstances on
  mount and tears them down on unmount. Safe to drop into any loading slot and
  to interrupt at any frame (the parent just unmounts it).

  Dot count is responsive by default (≈3 phone / 4 tablet / 5 desktop), keyed
  off the container width. Pass an explicit `dots` to override.

  Visual-tuning knobs live near the top; eyeball them at /dbg/thinking-dots.
-->
<template>
  <div ref="rootEl" class="pt-thinking" :style="{ gap: gap + 'px' }" aria-hidden="true">
    <div
      v-for="i in resolvedDots"
      :key="resolvedDots + '-' + i"
      class="pt-cell"
      :style="cellStyle"
    >
      <div class="pt-bobber" :ref="setBobber(i - 1)">
        <div class="pt-glyph" :style="glyphStyle" :ref="setPeriod(i - 1)"></div>
        <div
          v-if="i - 1 === resolvedDots - 1"
          class="pt-glyph pt-glyph--exclaim"
          :style="glyphStyle"
          :ref="setExclaim"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  type ComponentPublicInstance,
} from 'vue';
import { animate } from 'animejs';
import { createLetter, type LetterInstance } from '../../letterpeople';
import { generateVibrancyRainbow } from '../../letterpeople/util/color';

interface Props {
  /** Force a dot count. Omit for responsive (≈3 phone / 4 tablet / 5 desktop). */
  dots?: number;
  /** Rendered height of each glyph's SVG box in px (drives dot size). */
  glyphHeight?: number;
  /** Horizontal gap between dots in px. */
  gap?: number;
}

const props = withDefaults(defineProps<Props>(), {
  dots: undefined,
  glyphHeight: 88,
  gap: 14,
});

// --- Visual / timing tuning knobs ---------------------------------------
const DOT_THICKNESS = 46; // period lineWidth → fatness of the dot
const EYE_RATIO = 0.32; // eye diameter as a fraction of dot thickness
const BOB_HEIGHT = 16; // px a dot rises during a normal bob
const BOB_UP_MS = 200;
const BOB_DOWN_MS = 360;
const WAVE_STAGGER = 150; // base delay between adjacent dots in a wave
const CYCLE_GAP = 380; // pause between waves
const FOUND_EVERY = 3; // every Nth wave, last dot becomes "!"
const FOUND_HOLD = 650; // how long the "!" lingers before reverting

// Per-bob organic jitter (fraction). Keeps the wave from feeling mechanical.
const HEIGHT_JITTER = 0.18;
const DURATION_JITTER = 0.12;

// Distribution of per-dot start delays across the row. `inOutSine` gives the
// wave a natural ease-in/ease-out "whip" instead of a rigid linear march.
const waveEase = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

// Responsive breakpoints: container width (px) → dot count.
function widthToDots(w: number): number {
  const width = w > 0 ? w : (typeof window !== 'undefined' ? window.innerWidth : 840);
  if (width < 480) return 3;
  if (width < 840) return 4;
  return 5;
}

// Fraction of the glyph SVG box that sits BELOW the dot (descender space).
// Used to drop the glyph down so the dot rests near the cell's baseline.
const BASELINE_DROP = 0.3;

// --- Reactive sizing -----------------------------------------------------
const rootEl = ref<HTMLElement | null>(null);
const containerWidth = ref(0);

const resolvedDots = computed(() =>
  props.dots ?? widthToDots(containerWidth.value),
);

const cellStyle = computed(() => ({
  width: Math.round(props.glyphHeight * 0.5) + 'px',
  height: Math.round(props.glyphHeight * 0.6) + 'px',
}));

const glyphStyle = computed(() => ({
  height: props.glyphHeight + 'px',
  bottom: Math.round(-BASELINE_DROP * props.glyphHeight) + 'px',
}));

// --- Template ref collection --------------------------------------------
type RefEl = Element | ComponentPublicInstance | null;

const bobberEls = ref<HTMLElement[]>([]);
const periodEls = ref<HTMLElement[]>([]);
const exclaimEl = ref<HTMLElement | null>(null);

const setBobber = (idx: number) => (el: RefEl) => {
  if (el) bobberEls.value[idx] = el as HTMLElement;
};
const setPeriod = (idx: number) => (el: RefEl) => {
  if (el) periodEls.value[idx] = el as HTMLElement;
};
const setExclaim = (el: RefEl) => {
  if (el) exclaimEl.value = el as HTMLElement;
};

// --- LetterPeople instances ---------------------------------------------
let periodInstances: (LetterInstance | null)[] = [];
let exclaimInstance: LetterInstance | null = null;

let running = false;
let blinkTimer: ReturnType<typeof setInterval> | undefined;

// --- Animation helpers ---------------------------------------------------
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (base: number, frac: number) => base * (1 - frac + Math.random() * frac * 2);

function tween(targets: unknown, params: Record<string, unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    animate(targets as never, { ...params, onComplete: () => resolve() } as never);
  });
}

async function bob(el: HTMLElement | undefined) {
  if (!el) return;
  const height = jitter(BOB_HEIGHT, HEIGHT_JITTER);
  el.style.transformOrigin = 'center bottom';
  await tween(el, {
    translateY: -height,
    scaleY: 1.05,
    scaleX: 0.97,
    duration: jitter(BOB_UP_MS, DURATION_JITTER),
    ease: 'outQuad',
  });
  if (!running) return;
  await tween(el, {
    translateY: 0,
    scaleY: 1,
    scaleX: 1,
    duration: jitter(BOB_DOWN_MS, DURATION_JITTER),
    ease: 'outElastic(1, 0.55)',
  });
}

async function foundBeat() {
  const count = resolvedDots.value;
  const el = bobberEls.value[count - 1];
  const periodG = periodEls.value[count - 1];
  const exclaimG = exclaimEl.value;
  if (!el) return;

  el.style.transformOrigin = 'center bottom';

  // Leap higher than a normal bob.
  await tween(el, {
    translateY: -BOB_HEIGHT * 2.3,
    scaleY: 1.12,
    scaleX: 0.93,
    duration: 240,
    ease: 'outQuad',
  });
  if (!running) return;

  // Crossfade period → exclamation at the apex.
  if (periodG && exclaimG) {
    await Promise.all([
      tween(periodG, { opacity: 0, duration: 140, ease: 'linear' }),
      tween(exclaimG, { opacity: 1, duration: 140, ease: 'linear' }),
    ]);
  }
  if (!running) return;

  // Settle back down as the "!".
  await tween(el, {
    translateY: 0,
    scaleY: 1,
    scaleX: 1,
    duration: 460,
    ease: 'outElastic(1, 0.5)',
  });

  await delay(FOUND_HOLD);
  if (!running) return;

  // Revert to a period for the next wave.
  if (periodG && exclaimG) {
    await Promise.all([
      tween(exclaimG, { opacity: 0, duration: 200, ease: 'linear' }),
      tween(periodG, { opacity: 1, duration: 200, ease: 'linear' }),
    ]);
  }
}

async function runWave(found: boolean) {
  const count = resolvedDots.value;
  const last = count - 1;
  // Eased distribution of start delays across the row (vs. linear stagger).
  const span = last * WAVE_STAGGER;
  await Promise.all(
    bobberEls.value.slice(0, count).map((el, i) => {
      const t = last > 0 ? span * waveEase(i / last) : 0;
      const turn = delay(t);
      if (found && i === last) return turn.then(() => foundBeat());
      return turn.then(() => bob(el));
    }),
  );
}

async function loop() {
  let waveIndex = 0;
  while (running) {
    const found = (waveIndex + 1) % FOUND_EVERY === 0;
    await runWave(found);
    if (!running) break;
    await delay(CYCLE_GAP);
    waveIndex++;
  }
}

// --- Build / teardown ----------------------------------------------------
function build() {
  const count = resolvedDots.value;
  const eyeSize = Math.round(DOT_THICKNESS * EYE_RATIO);
  // Pleasant vibrant spread, matching the brand's random-vibrancy ethos.
  const colors = generateVibrancyRainbow(count, 0.68, 0.17, 25);

  periodInstances = periodEls.value.slice(0, count).map((target, i) => {
    if (!target) return null;
    const inst = createLetter('.', target, {
      color: colors[i % colors.length],
      showEyes: true,
      lineWidth: DOT_THICKNESS,
      borderWidth: 3,
      eyeSize,
    });
    // Pupils follow the cursor — the dots "watch" the helper while they work.
    inst?.eyes.startTracking({ intensity: 0.7 });
    return inst;
  });

  if (exclaimEl.value) {
    exclaimInstance = createLetter('!', exclaimEl.value, {
      color: colors[(count - 1) % colors.length],
      showEyes: true,
      lineWidth: DOT_THICKNESS,
      borderWidth: 3,
      eyeSize,
    });
    exclaimInstance?.eyes.startTracking({ intensity: 0.7 });
    exclaimEl.value.style.opacity = '0';
  }

  running = true;
  void loop();

  // Occasional blink on a random dot keeps them feeling alive.
  blinkTimer = setInterval(() => {
    const alive = periodInstances.filter(Boolean) as LetterInstance[];
    if (alive.length) {
      alive[Math.floor(Math.random() * alive.length)].eyes.blink({ duration: 140 });
    }
  }, 1400);
}

function teardown() {
  running = false;
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = undefined;
  // Stop the pupil-tracking rAF loops before detaching the SVGs.
  periodInstances.forEach((inst) => inst?.eyes.stopTracking());
  exclaimInstance?.eyes.stopTracking();
  periodInstances.forEach((inst) => inst?.destroy());
  exclaimInstance?.destroy();
  periodInstances = [];
  exclaimInstance = null;
}

// --- Lifecycle -----------------------------------------------------------
let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  // Measure the available width up front so the first render picks the right
  // dot count, then keep it current with a ResizeObserver (e.g. orientation
  // change). Prefer the parent's width — our own width depends on dot count.
  const measured = rootEl.value?.parentElement ?? rootEl.value;
  if (measured) {
    containerWidth.value = measured.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(measured);
  }

  build();
});

// Rebuild cleanly whenever the resolved dot count changes. The keyed v-for
// remounts every cell, so the ref arrays repopulate from scratch.
watch(resolvedDots, async () => {
  teardown();
  bobberEls.value = [];
  periodEls.value = [];
  exclaimEl.value = null;
  await nextTick();
  build();
});

onBeforeUnmount(() => {
  teardown();
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.pt-thinking {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.pt-cell {
  position: relative;
  overflow: visible;
}

.pt-bobber {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.pt-glyph {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  pointer-events: none;
}

.pt-glyph :deep(svg) {
  height: 100%;
  width: auto;
  display: block;
  overflow: visible;
}
</style>
