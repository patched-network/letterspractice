<template>
  <!-- The author-family group shot on the three.js stage (SPIKE: dbg-only for
       now, /dbg/family/three). Same members, sizes and spacing as the SVG
       FamilyPortrait (DEFAULT_FAMILY_PORTRAIT); floats on the page with only
       contact shadows beneath. -->
  <div ref="container" class="portrait3d" :style="{ height: heightPx + 'px' }" @click="celebrateRandom" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Stage3D, type Actor3D } from '../../../letterpeople/three/stage3d';
import type { OutlineStyle } from '../../../letterpeople/three/letterMesh';
import { celebrate } from '../../../letterpeople/animations';
import {
  DEFAULT_FAMILY_PORTRAIT,
  REST_MOUTH,
  framePortrait,
  type PortraitMember,
} from '../familyPortrait';

const props = withDefaults(defineProps<{ trackPointer?: boolean; outline?: OutlineStyle }>(), {
  trackPointer: true,
  outline: 'cookie',
});

const BORDER_COLOR = '#2a2a2a';
/** Kids stand this far in front of the adults (the SVG's z-stacking). */
const KID_Z = 60;
/**
 * The adults overlap on screen. At the same depth their solids (~29–31 units
 * thick at portrait scale) intersect, which shows as shading artefacts where
 * they cross; stagger them, R the nearer. Spacing (with KID_Z) keeps every
 * pair clear even with the hull outline's shell: C–R ≥ 1.7, R–kids ≥ 8.2.
 */
const ADULT_Z: Record<string, number> = { C: -20, R: 20 };

const config = framePortrait(DEFAULT_FAMILY_PORTRAIT);
const { baseline } = config;
/** Canvas keeps the framed SVG stage's aspect. */
const aspect = config.stage.width / config.stage.height;

const container = ref<HTMLElement | null>(null);
const heightPx = ref(360);
let stage: Stage3D | null = null;
const actors = new Map<PortraitMember, Actor3D>();
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Glyph cap height in px, as the SVG renders it: the wrapper is `size` tall
 * and holds the body plus descender space plus stroke padding (see
 * belowBaselineFrac). The 3D letter is 100 units tall at scale 1.
 */
function capPx(m: PortraitMember): number {
  const pad = baseline.borderWidth + m.lineWidth / 2;
  const totalH = baseline.viewboxBody + baseline.descenderDepth + 2 * pad;
  return (m.size * baseline.viewboxBody) / totalH;
}

function build(): void {
  const el = container.value;
  if (!el) return;
  stage = new Stage3D(el, { transparent: true, trackPointer: props.trackPointer && !reducedMotion });

  const centerX = config.stage.width / 2;
  let left = Infinity;
  let right = -Infinity;
  let top = 0;
  for (const m of config.members) {
    const scale = capPx(m) / 100;
    const actor = stage.addActor(m.char + m.role, m.char, {
      x: m.x - centerX,
      z: m.role === 'kid' ? KID_Z : (ADULT_Z[m.char] ?? 0),
      scale,
      color: m.color,
      hiddenParts: ['arms'], // armless still life; arms pop out to wave
      look: {
        lineWidth: m.lineWidth,
        outlineWidth: baseline.borderWidth,
        outlineColor: BORDER_COLOR,
        outline: props.outline,
      },
    });
    if (!actor) continue;
    actors.set(m, actor);
    left = Math.min(left, m.x - centerX - actor.width / 2);
    right = Math.max(right, m.x - centerX + actor.width / 2);
    top = Math.max(top, capPx(m));
    // The settled family-photo face
    void actor.letter.brows?.express('happy', { duration: 0 });
    void actor.letter.mouth?.updateShape({ ...REST_MOUTH });
  }
  // Tight framing: group plus a little side air, headroom for waving arms
  stage.frame((right - left) / 2 + 20, {
    centerX: (left + right) / 2,
    top: top + 30,
    heightFactor: 3,
    lookFactor: 0.5,
  });
}

function resize(): void {
  const w = container.value?.clientWidth ?? 0;
  heightPx.value = Math.round(Math.min(w, config.stage.width) / aspect);
}

// ---------------------------------------------------------------------------
// Choreography (the SVG portrait's, in 3D)
// ---------------------------------------------------------------------------

/**
 * Everyone waves, un-synchronized: each member pops one arm out from the
 * shoulder, waves with jittered timing, and tucks it away again.
 */
function wave(): void {
  if (reducedMotion) return;
  for (const actor of actors.values()) {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const part = side === 'left' ? 'armLeft' : 'armRight';
    const duration = 650 + (Math.random() * 2 - 1) * 180;
    const delay = Math.random() * 320;
    const arm = actor.letter.arms?.[side];
    if (!arm) continue;
    setTimeout(async () => {
      await actor.letter.showPart(part, { duration: 240 });
      await arm.wave({ duration });
      await actor.letter.hidePart(part, { duration: 300 });
    }, delay);
  }
}

/** "Say cheese!": big smiles and a blink, then settle. */
function sayCheese(): void {
  for (const actor of actors.values()) {
    void actor.letter.mouth?.updateShape({ openness: 0.5, mood: 1 }, { duration: 200 });
    setTimeout(() => void actor.letter.blink({ duration: 180 }), 200);
    setTimeout(() => void actor.letter.mouth?.updateShape({ ...REST_MOUTH }, { duration: 400 }), 900);
  }
}

/** Click: a random idle member does a random celebration, then settles. */
const celebrating = new Set<Actor3D>();
function celebrateRandom(): void {
  if (reducedMotion) return;
  const idle = [...actors.values()].filter((a) => !celebrating.has(a));
  if (!idle.length) return;
  const actor = idle[Math.floor(Math.random() * idle.length)];
  celebrating.add(actor);
  void celebrate(actor.performer, { type: 'random' }).finally(() => {
    celebrating.delete(actor);
    void actor.letter.mouth?.updateShape({ ...REST_MOUTH }, { duration: 320 });
    void actor.letter.brows?.express('happy', { duration: 320 });
  });
}

defineExpose({ wave, sayCheese, celebrateRandom });

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let resizeObserver: ResizeObserver | undefined;
let viewObserver: IntersectionObserver | undefined;
const idleStops: (() => void)[] = [];

onMounted(() => {
  resize();
  resizeObserver = new ResizeObserver(resize);
  if (container.value) resizeObserver.observe(container.value);
  build();
  if (reducedMotion) return; // the static, posed still life

  for (const actor of actors.values()) idleStops.push(actor.startIdle());

  // Wave hello once the family reaches the middle band of the viewport (as
  // the SVG portrait)
  viewObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        wave();
        viewObserver?.disconnect();
      }
    },
    { rootMargin: '-35% 0px -35% 0px', threshold: 0 },
  );
  if (container.value) viewObserver.observe(container.value);
});

onBeforeUnmount(() => {
  viewObserver?.disconnect();
  resizeObserver?.disconnect();
  idleStops.forEach((stop) => stop());
  stage?.destroy();
  stage = null;
  actors.clear();
});
</script>

<style scoped>
.portrait3d {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  position: relative;
  cursor: pointer;
}
</style>
