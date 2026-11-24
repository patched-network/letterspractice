<template>
  <!-- The GPC intro's grapheme as 3D LetterPeople (SPIKE, opt-in via the
       intro views' `letters3d`). One letter (GpcIntroView) or a team of 2–3
       (DigraphGpcIntroView), standing in a row. Used in both frames the
       grapheme appears in: the intro (greets, sways, speaks its phoneme) and
       the final card / keycap (stands still, celebrates on the keypress).
       Transparent stage: whatever is behind shows through. -->
  <div ref="host" class="gpc-letter-3d" :style="hostStyle" />
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { Stage3D, type Actor3D } from '../../letterpeople/three/stage3d';
import { mark3DFailed } from '../../services/letters3d';
import { celebrate as celebrateSequence } from '../../letterpeople/animations';
import {
  DESCENDER_LETTERS,
  DESCENDER_DEPTH,
  getLetterGeometry,
} from '../../letterpeople/letters/registry';

const props = withDefaults(
  defineProps<{
    /** The grapheme: one letter, or a team ('sh', 'tch'). */
    text: string;
    color: string;
    /** Gentle idle sway (the original spike page's). */
    sway?: boolean;
    /** Arrive with the SVG character's greeting: face pops in, smile, wave. */
    greet?: boolean;
    /**
     * Give the canvas an explicit height (px) and a matching natural width,
     * for containers that size to their content. Without it the canvas fills
     * its container.
     */
    heightPx?: number;
  }>(),
  { sway: false, greet: false, heightPx: undefined },
);

const emit = defineEmits<{
  /** The 3D stage couldn't start (WebGL refused it). */
  (e: 'unavailable'): void;
}>();

/** Room above the cap line for raised arms and brows. */
const ARM_HEADROOM = 18;
/** Air around the letters' vertical extent (1.12 = 6% each side). */
const FRAME_AIR = 1.12;
/** Side room for arms, world units. */
const ARM_REACH = 30;
/** Gap between letters in a team (the SVG WordDisplay's spacing). */
const TEAM_GAP = 10;
const TAN_HALF_FOV = Math.tan((15 * Math.PI) / 180); // Stage3D camera: 30° fov

const SWAY_YAW = 0.45; // radians either side
const SWAY_ROLL = 0.05;
/** The face the SVG character settles into. */
const SMILE = { openness: 0.2, mood: 0.88 };
/** Greeting stagger between team members (as the SVG digraph view). */
const GREET_STAGGER_MS = 150;

const chars = computed(() => [...props.text]);
const bottom = computed(() =>
  chars.value.some((c) => DESCENDER_LETTERS.has(c)) ? -DESCENDER_DEPTH : 0,
);
const TOP = 100 + ARM_HEADROOM;
/** Team width in world units (letters + gaps), from the shared geometry. */
const teamWidth = computed(() => {
  const widths = chars.value.map((c) => getLetterGeometry(c, { lineWidth: 20 })?.viewBox[2] ?? 60);
  return widths.reduce((a, w) => a + w, 0) + TEAM_GAP * Math.max(0, widths.length - 1);
});

const hostStyle = computed(() => {
  if (!props.heightPx) return {};
  // Pixels per world unit at the framed height → the width the team needs
  const pxPerUnit = props.heightPx / ((TOP - bottom.value) * FRAME_AIR);
  return {
    height: `${props.heightPx}px`,
    width: `${Math.round((teamWidth.value + 2 * ARM_REACH) * FRAME_AIR * pxPerUnit)}px`,
    maxWidth: '100%',
    minHeight: 'unset',
  };
});

const host = ref<HTMLElement | null>(null);
let stage: Stage3D | null = null;
const actors: Actor3D[] = [];
let stopSway: (() => void) | null = null;
const idleStops: (() => void)[] = [];
let disposed = false;

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function greet(a: Actor3D, startMs: number): Promise<void> {
  // As the SVG intro views: face appears, then smile and wave
  if (startMs) await delay(startMs);
  if (disposed) return;
  await Promise.all([
    a.letter.showPart('eyes', { duration: 400 }),
    a.letter.showPart('mouth', { duration: 400 }),
  ]);
  if (disposed) return;
  await Promise.all([
    a.letter.brows?.express('happy', { duration: 350 }),
    a.letter.mouth?.updateShape(SMILE, { duration: 350 }),
  ]);
  if (disposed) return;
  void a.letter.arms?.wave({ duration: 900 });
}

onMounted(() => {
  const el = host.value;
  if (!el) return;
  try {
    stage = new Stage3D(el, { transparent: true, trackPointer: !reducedMotion });
  } catch (err) {
    // WebGL refused the stage: the intro view swaps in the SVG letter
    mark3DFailed(err);
    emit('unavailable');
    return;
  }
  const greeting = props.greet && !reducedMotion;

  // Lay the team out in a row, centred on x = 0
  let left = -teamWidth.value / 2;
  chars.value.forEach((c, i) => {
    const actor = stage!.addActor(`l${i}`, c, {
      color: props.color,
      hiddenParts: greeting ? ['eyes', 'mouth'] : [],
      look: { lineWidth: 20 }, // outline width: the 3D default (DEFAULT_LOOK)
    });
    if (!actor) return;
    actor.moveTo(left + actor.width / 2, 0);
    left += actor.width + TEAM_GAP;
    actors.push(actor);
  });

  // Frame the team's vertical extent — descender (if any) up to arm headroom
  // — with a little air: ~3/4 of the canvas height for most letters.
  const distance = ((TOP - bottom.value) * FRAME_AIR) / (2 * TAN_HALF_FOV);
  stage.frame(teamWidth.value / 2 + ARM_REACH, {
    top: TOP,
    heightFactor: distance / TOP,
    lookFactor: (TOP + bottom.value) / 2 / TOP,
  });

  actors.forEach((a, i) => {
    if (greeting) void greet(a, i * GREET_STAGGER_MS);
    else {
      void a.letter.brows?.express('happy', { duration: 0 });
      void a.letter.mouth?.updateShape(SMILE);
    }
  });

  if (reducedMotion) return;
  for (const a of actors) idleStops.push(a.startIdle());
  if (props.sway) {
    // Each member sways about its own centre, slightly out of phase
    stopSway = stage.addTicker((t) => {
      actors.forEach((a, i) => {
        const phase = i * 0.45;
        a.letter.root.rotation.y = Math.sin(t * 1.3 + phase) * SWAY_YAW;
        a.letter.root.rotation.z = Math.sin(t * 1.9 + phase) * SWAY_ROLL;
      });
    });
  }
});

onBeforeUnmount(() => {
  disposed = true;
  stopSway?.();
  idleStops.forEach((stop) => stop());
  stage?.destroy();
  stage = null;
  actors.length = 0;
});

/** Mouth pulse for the phoneme, on every member (the SVG views pulse 400 ms). */
function speak(durationMs = 400): void {
  for (const a of actors) void a.letter.mouth?.animateSpeak({ duration: durationMs });
}

/** The keypress payoff for member `index` (default: the only / first one). */
async function celebrate(index = 0): Promise<void> {
  const a = actors[index];
  if (!a || reducedMotion) return;
  await celebrateSequence(a.performer, { type: 'random' });
}

defineExpose({ speak, celebrate });
</script>

<style scoped>
.gpc-letter-3d {
  width: 100%;
  height: 100%;
  /* Without heightPx, the intro frame's container sizes by min-height only;
     match the SVG letter's display height so the canvas has room. */
  min-height: 340px;
  position: relative;
}
</style>
