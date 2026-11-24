<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * DigraphLesson3D — three.js rework of 02.DigraphLesson (SPIKE, dbg-only).
 *
 * Same step script (digraphSteps), runner and shell. Staging in world units:
 * entrances and exits come from just offstage at depth, so walkers cross in
 * three-quarter view rather than side-on; sh stays anchored while each word's
 * other letters arrange around it.
 *
 * Its set is the harbor (environments.ts): the words stand along the pier's
 * front edge (the p of ship ends up sitting there, tail over the water), a
 * ship drifts in for `ship` and fish swim by for `fish` (harborProps.ts).
 * Other environments still work; they just have no ship or fish.
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import type { Stage3D, Actor3D } from '../../letterpeople/three/stage3d';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import { digraphSteps, type DigraphActorId } from '../digraphSteps';
import {
  LESSON3D_DEFAULTS,
  WORD_GAP,
  createLessonStage,
  holdHands,
  lessonLook,
  letterColor,
  walkOffAndHide,
  watchFreeCamera,
  watchStageGrid,
  type Lesson3DProps,
} from './lesson3d';
import { harborKind, HARBOR_WORD_Z } from '../../letterpeople/three/environments';
import { createHarborProps, type HarborProps } from '../../letterpeople/three/harborProps';

// Hop is this lesson's gait: its long entrances from the wings read as bounds.
// The harbor is its set.
const props = withDefaults(defineProps<Lesson3DProps>(), {
  ...LESSON3D_DEFAULTS,
  gait: 'hop',
  environment: 'harbor-cutaway',
});

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HUE_OFFSET = 25;
const HUE_RESIDUAL = 0;
const WALK_DURATION_MS = 1800;
/** Longer than the SVG's 900: entrances start offstage at depth. */
const WORD_WALK_MS = 1600;

/** Where words stand (the harbor's pier edge), and how far back entrances / exits happen. */
const WORD_Z = HARBOR_WORD_Z;
const WINGS_Z = -150;
/** sh pair gap (SVG: 0.1 × letter height). */
const PAIR_GAP = 10;
/**
 * Letters in a word all face square to the camera, so the word stands in a
 * straight row. (A lone actor's default rest turns it toward the audience
 * point, which fans a word into an arc.) Square rather than a shared angle:
 * a word that grows (sh → ship) would otherwise turn sh again.
 */
const WORD_YAW = 0;

let HUE_SH = 0;

type ActorId = DigraphActorId;

const actors = new Map<ActorId, Actor3D>();
let stage: Stage3D | null = null;
const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = digraphSteps({
  hWalksIn: () => choreographyHWalksIn(),
  shipWalkIn: () => choreographyShipWalkIn(),
  shipOutFishIn: () => choreographyShipOutFishIn(),
});

const runner = useLessonRunner<ActorId>({
  steps: STEPS,
  actors,
  accentHue,
  emit: {
    lessonComplete: () => emit('lesson-complete'),
    practiceNow: () => emit('practice-now'),
  },
  // Tap / drag the letters to hear their sounds; tap the ship or a fish for
  // its word (each once its word has been sounded out).
  touchReplay: {
    pickWord: (x, y) => (stage && harbor ? harbor.pick(stage.rayFromClient(x, y)) : null),
  },
});

defineExpose({ steps: STEPS, advance: () => runner.handleAdvance() });

// ---------------------------------------------------------------------------
// Set: framing and the harbor's ship + fish follow the environment (live swap)
// ---------------------------------------------------------------------------

let harbor: HarborProps | null = null;

function applySet(): void {
  if (!stage) return;
  if (props.environment) stage.setEnvironment(props.environment);
  const kind = harborKind(props.environment);
  // Widest moment: a four-letter word anchored off-centre at sh. The cutaway
  // looks lower, to see the water under the pier.
  stage.frame(250, kind === 'cutaway' ? { lookFactor: CUTAWAY_LOOK } : {});
  harbor?.dispose();
  harbor = kind ? createHarborProps(stage, kind) : null;
}
/** Cutaway framing: aim point as a fraction of letter height (default 0.8). */
const CUTAWAY_LOOK = 0.2;

watch(() => props.environment, applySet);
watchFreeCamera(props, () => stage);
watchStageGrid(props, () => stage);

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

const HIDDEN = ['eyes', 'mouth', 'arms'] as const;

function addActor(id: ActorId, color: string, x: number, z: number): Actor3D | null {
  if (!stage) return null;
  const actor = stage.addActor(id, id === 'i2' ? 'i' : id, {
    x,
    z,
    color,
    hiddenParts: [...HIDDEN],
    look: lessonLook(props),
  });
  if (actor) actors.set(id, actor);
  return actor;
}

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, { ...props, environment: undefined });
  applySet();

  addActor('s', letterColor(HUE_SH - HUE_OFFSET), 0, 0);
  const h = addActor('h', letterColor(HUE_SH + HUE_OFFSET), 0, WINGS_Z);
  h?.moveTo(stage.offstageX('right', WINGS_Z), WINGS_Z);
}

function teardownStage(): void {
  harbor?.dispose();
  harbor = null;
  stage?.destroy();
  stage = null;
  actors.clear();
}

async function openingFlourish(): Promise<void> {
  const s = actors.get('s')?.letter;
  if (!s) return;
  await s.showPart('eyes', { duration: 320 });
  await Promise.all([s.showPart('mouth', { duration: 240 }), s.showPart('arms', { duration: 240 })]);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** sh centred as a pair. */
function pairX(): { s: number; h: number } {
  const s = actors.get('s')!;
  const h = actors.get('h')!;
  const total = s.width + PAIR_GAP + h.width;
  return { s: -total / 2 + s.width / 2, h: total / 2 - h.width / 2 };
}

/** Word x-centres with sh held at its pair position; extras extend outward. */
function anchoredAtSh(order: ActorId[]): Map<ActorId, number> {
  const out = new Map<ActorId, number>();
  const pair = pairX();
  out.set('s', pair.s);
  out.set('h', pair.h);
  const width = (id: ActorId) => actors.get(id)?.width ?? 50;
  const sIdx = order.indexOf('s');
  const hIdx = order.indexOf('h');
  let edge = pair.s - width('s') / 2;
  for (let i = sIdx - 1; i >= 0; i--) {
    edge -= WORD_GAP;
    out.set(order[i], edge - width(order[i]) / 2);
    edge -= width(order[i]);
  }
  edge = pair.h + width('h') / 2;
  for (let i = hIdx + 1; i < order.length; i++) {
    edge += WORD_GAP;
    out.set(order[i], edge + width(order[i]) / 2);
    edge += width(order[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Choreography
// ---------------------------------------------------------------------------

async function choreographyHWalksIn(): Promise<void> {
  accentHue.value = HUE_SH;
  const s = actors.get('s');
  const h = actors.get('h');
  if (!s || !h) return;

  void h.letter.showPart('eyes', { duration: 200 });
  void h.letter.showPart('mouth', { duration: 200 });
  void h.letter.showPart('arms', { duration: 200 });

  const residual = HUE_OFFSET * HUE_RESIDUAL;
  void s.letter.setColor(letterColor(HUE_SH - residual), { duration: WALK_DURATION_MS });
  void h.letter.setColor(letterColor(HUE_SH + residual), { duration: WALK_DURATION_MS });

  const pair = pairX();
  const opts = { gait: props.gait, durationMs: WALK_DURATION_MS, endYaw: WORD_YAW };
  await Promise.all([s.walkTo(pair.s, WORD_Z, opts), h.walkTo(pair.h, WORD_Z, opts)]);
  // A team: s and h hold hands from here on (sh stays put while the words
  // form around it)
  await holdHands(s.letter, h.letter);
}

/** Bring an extra letter on from the wings (creating it the first time). */
function ensureExtra(id: ActorId, side: 'left' | 'right', stagger: number): Actor3D | null {
  if (!stage) return null;
  const x = stage.offstageX(side, WINGS_Z) + (side === 'right' ? stagger : -stagger);
  const existing = actors.get(id);
  if (existing) {
    existing.setVisible(true);
    existing.moveTo(x, WINGS_Z);
    return existing;
  }
  return addActor(id, letterColor(accentHue.value + 60), x, WINGS_Z);
}

async function walkExtraIn(actor: Actor3D, targetX: number, hueOffset: number): Promise<void> {
  void actor.letter.showPart('eyes', { duration: 200 });
  void actor.letter.showPart('mouth', { duration: 200 });
  void actor.letter.setColor(letterColor(accentHue.value + hueOffset), { duration: WORD_WALK_MS });
  await actor.walkTo(targetX, WORD_Z, {
    gait: props.gait,
    durationMs: WORD_WALK_MS,
    endYaw: WORD_YAW,
  });
}

async function choreographyShipWalkIn(): Promise<void> {
  void harbor?.shipSailIn();
  // i and p come on from the right; the p lands on the pier edge, tail over the water
  const i = ensureExtra('i', 'right', 0);
  const p = ensureExtra('p', 'right', 90);
  const at = anchoredAtSh(['s', 'h', 'i', 'p']);
  await Promise.all([
    i ? walkExtraIn(i, at.get('i')!, 60) : undefined,
    p ? walkExtraIn(p, at.get('p')!, 120) : undefined,
  ]);
}

async function choreographyShipOutFishIn(): Promise<void> {
  if (!stage) return;
  const f = ensureExtra('f', 'left', 90);
  const i2 = ensureExtra('i2', 'left', 0);
  const at = anchoredAtSh(['f', 'i2', 's', 'h']);
  const exit = { gait: props.gait, durationMs: WORD_WALK_MS };
  const offRight = stage.offstageX('right', WINGS_Z);

  void harbor?.shipSailOut();
  harbor?.startFish();
  const i = actors.get('i');
  const p = actors.get('p');
  await Promise.all([
    i ? walkOffAndHide(i, offRight, WINGS_Z, exit) : undefined,
    p ? walkOffAndHide(p, offRight + 90, WINGS_Z, exit) : undefined,
    f ? walkExtraIn(f, at.get('f')!, 60) : undefined,
    i2 ? walkExtraIn(i2, at.get('i2')!, 120) : undefined,
  ]);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
}

onMounted(async () => {
  await nextTick();
  HUE_SH = Math.random() * 360;
  accentHue.value = HUE_SH;
  setupStage();

  runner.attach();
  window.addEventListener('resize', handleWindowResize);

  await nextTick();
  await openingFlourish();
  void runner.start();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize);
  runner.detach();
  teardownStage();
});
</script>
