<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * HelloWorldLesson — meet the letters.
 *
 * Two actors (h, i) persist on a stage. Mechanics (step advance, audio,
 * mouth-speak, audio button, keyboard wiring) live in useLessonRunner.
 * This file owns stage population, the STEPS array, and the walk-together
 * choreography (gated via the dialogue step's onEnter promise).
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { Stage } from '../letterpeople/scene/Stage';
import type { Actor } from '../letterpeople/scene/Stage';
import { oklch } from '../letterpeople/util/color';
import LessonShell from './LessonShell.vue';
import { useLessonRunner, type LessonStep } from './useLessonRunner';
import {
  helloWorldSteps,
  HELLO_WORLD_WALK_STEP_INDEX,
  type HelloWorldActorId,
} from './helloWorldSteps';

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LETTER_HEIGHT_FALLBACK = 240;
const LETTER_LINE_WIDTH = 20;
const LETTER_BORDER_WIDTH = 3;
const LETTER_EYE_SIZE = 8;

// Procedural color: random centerHue per mount; offset gives initial separation.
// HUE_RESIDUAL: fraction of offset retained after letters walk together.
const HUE_OFFSET = 25;
const HUE_RESIDUAL = 0.55;

const actorDepthInit = 70;
const WALK_DURATION_MS = 2000;

function letterColor(hue: number): string { return oklch(0.75, 0.13, hue); }

let CENTER_HUE = 0;
let H_COLOR = '';
let I_COLOR = '';

function initColors(): void {
  CENTER_HUE = Math.random() * 360;
  H_COLOR = letterColor(CENTER_HUE - HUE_OFFSET);
  I_COLOR = letterColor(CENTER_HUE + HUE_OFFSET);
}

// ---------------------------------------------------------------------------
// Actors + runner
// ---------------------------------------------------------------------------

type ActorId = HelloWorldActorId;

const actors = new Map<ActorId, Actor>();
let stage: Stage | null = null;

// accentHue drives the audio-button color. For sound steps with a single
// speaker, we shift toward that letter's hue; otherwise center.
const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = helloWorldSteps(() => walkTogether());

// Exposes STEPS for /dbg/lesson content analysis (word/beat counts) — see
// summarizeLessonSteps in useLessonRunner.ts.
defineExpose({ steps: STEPS });

const runner = useLessonRunner<ActorId>({
  steps: STEPS,
  actors,
  accentHue,
  emit: {
    lessonComplete: () => emit('lesson-complete'),
    practiceNow: () => emit('practice-now'),
  },
});

// Update accent hue per step: single-letter sound steps pick that letter's hue;
// otherwise recenter. Run on every step change.
watch(runner.currentStep, (step) => {
  if (step?.kind === 'phoneme' && step.actorIds.length === 1) {
    accentHue.value =
      step.actorIds[0] === 'h' ? CENTER_HUE - HUE_OFFSET : CENTER_HUE + HUE_OFFSET;
  } else {
    accentHue.value = CENTER_HUE;
  }
});

// ---------------------------------------------------------------------------
// Stage layout
// ---------------------------------------------------------------------------

let centeredHX = 0;
let centeredIX = 0;

function setupStage(): void {
  if (!runner.stageContainerRef.value) return;

  stage = new Stage(runner.stageContainerRef.value, {
    backgroundColor: '#FFFEF7',
    horizonRatio: 0.25,
    referenceHeight: 100, // added this
  });

  const baseLetterOptions = {
    lineWidth: LETTER_LINE_WIDTH,
    borderWidth: LETTER_BORDER_WIDTH,
    eyeSize: LETTER_EYE_SIZE,
    showEyes: false,
    showMouth: false,
    showArms: false,
  };

  const h = stage.addActor('h', 'h', {
    x: 0,
    z: actorDepthInit,
    // height: LETTER_HEIGHT_FALLBACK, // 240
    heightRef: 50,
    letterOptions: { ...baseLetterOptions, color: H_COLOR },
  });
  const i = stage.addActor('i', 'i', {
    x: 0,
    z: actorDepthInit,
    // height: LETTER_HEIGHT_FALLBACK, // 240
    heightRef: 50,
    letterOptions: { ...baseLetterOptions, color: I_COLOR },
  });
  if (h) actors.set('h', h);
  if (i) actors.set('i', i);
}

function teardownStage(): void {
  stage?.destroy();
  stage = null;
  actors.clear();
}

function resolvedLetterHeight(): number {
  for (const actor of actors.values()) {
    const h = actor.instance.svgElement.clientHeight;
    if (h > 0) return h;
  }
  return LETTER_HEIGHT_FALLBACK;
}

function measureLetterWidth(actor: Actor): number {
  const svg = actor.instance.svgElement as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  const h = svg.clientHeight || LETTER_HEIGHT_FALLBACK;
  if (vb && vb.height > 0) return h * (vb.width / vb.height);
  return svg.clientWidth || Math.round(h * 0.6);
}

function computeCenteredPositions(): void {
  const stageEl = runner.stageContainerRef.value;
  const h = actors.get('h');
  const i = actors.get('i');
  if (!stageEl || !h || !i) return;

  const containerWidth = stageEl.clientWidth;
  const hWidth = measureLetterWidth(h);
  const iWidth = measureLetterWidth(i);
  const gap = Math.round(resolvedLetterHeight() * 0);

  centeredHX = Math.round((containerWidth - hWidth - iWidth - gap) / 2);
  centeredIX = centeredHX + Math.round(hWidth) + gap;
}

function applySpreadPositions(): void {
  const stageEl = runner.stageContainerRef.value;
  const h = actors.get('h');
  const i = actors.get('i');
  if (!stageEl || !h || !i) return;

  const containerWidth = stageEl.clientWidth;
  const iWidth = measureLetterWidth(i);

  // Clamp spread so neither letter exits the container.
  const leftRoom = centeredHX;
  const rightRoom = containerWidth - (centeredIX + iWidth);
  const spread = Math.min(leftRoom, rightRoom, Math.round(resolvedLetterHeight() * 0.5));

  h.move3D(centeredHX - spread, actorDepthInit, 0);
  i.move3D(centeredIX + spread, actorDepthInit, 0);
}

// ---------------------------------------------------------------------------
// Choreography
// ---------------------------------------------------------------------------

async function walkTogether(): Promise<void> {
  const h = actors.get('h');
  const i = actors.get('i');
  if (!h || !i) return;

  const residualOffset = HUE_OFFSET * HUE_RESIDUAL;
  void h.instance.updateAppearance(
    { color: letterColor(CENTER_HUE - residualOffset) },
    { duration: WALK_DURATION_MS },
  );
  void i.instance.updateAppearance(
    { color: letterColor(CENTER_HUE + residualOffset) },
    { duration: WALK_DURATION_MS },
  );

  await Promise.all([
    h.walkTo(centeredHX, actorDepthInit + 10, WALK_DURATION_MS),
    i.walkTo(centeredIX, actorDepthInit + 10, WALK_DURATION_MS),
  ]);
  await Promise.all([
    h.instance.body.resetPose({ duration: 300 }),
    i.instance.body.resetPose({ duration: 300 }),
  ]);
}

async function openingFlourish(): Promise<void> {
  const h = actors.get('h')?.instance;
  const i = actors.get('i')?.instance;
  if (!h || !i) return;

  await Promise.all([
    h.eyes.show({ duration: 320 }),
    i.eyes.show({ duration: 320 }),
  ]);
  await Promise.all([
    h.mouth.show({ duration: 240 }),
    i.mouth.show({ duration: 240 }),
    h.arms.show({ duration: 240 }),
    i.arms.show({ duration: 240 }),
  ]);

  // Opening wave hello — each letter waves with a randomly chosen hand.
  const randomArm = () => (Math.random() < 0.5 ? 'left' : 'right');
  await Promise.all([
    h.arms.wave({ arm: randomArm() }),
    i.arms.wave({ arm: randomArm() }),
  ]);
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

const WALK_STEP_INDEX = HELLO_WORLD_WALK_STEP_INDEX;

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
  computeCenteredPositions();
  if (runner.stepIndex.value < WALK_STEP_INDEX) {
    applySpreadPositions();
  } else {
    actors.get('h')?.move3D(centeredHX, actorDepthInit, 0);
    actors.get('i')?.move3D(centeredIX, actorDepthInit, 0);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  await nextTick();
  initColors();
  accentHue.value = CENTER_HUE;
  setupStage();
  computeCenteredPositions();
  applySpreadPositions();

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
