<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * HelloWorldLesson3D — the three.js rework of 01.HelloWorldLesson (SPIKE,
 * dbg-only: /dbg/lesson/three).
 *
 * Same step script (helloWorldSteps), runner and shell as the SVG lesson; the
 * stage is a Stage3D whose actors implement LessonActor. Differences are
 * confined to staging: layout is in world units (letter height 100) rather
 * than measured pixels, the opening flourish pops parts in, and the
 * walk-together is a real gait that arrives on the SVG version's schedule.
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import type { Stage3D, Actor3D } from '../../letterpeople/three/stage3d';
import {
  LESSON3D_DEFAULTS,
  createLessonStage,
  lessonLook,
  letterColor,
  watchEnvironment,
  watchFreeCamera,
  watchStageGrid,
  type Lesson3DProps,
} from './lesson3d';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import { helloWorldSteps, type HelloWorldActorId } from '../helloWorldSteps';

const props = withDefaults(defineProps<Lesson3DProps>(), LESSON3D_DEFAULTS);

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants (colour + timing match the SVG lesson)
// ---------------------------------------------------------------------------

const HUE_OFFSET = 25;
const HUE_RESIDUAL = 0.55;
const WALK_DURATION_MS = 2000;

/** Gap between the letters once they've walked together, world units. */
const TOGETHER_GAP = 6;
/** How far each letter stands out from the together spot at the start. */
const SPREAD = 55;
/** The walk-together also brings them a step toward the camera. */
const TOGETHER_Z = 12;
/**
 * Start as far back as they are apart, so the walk-together heads 45° off
 * the camera axis. A fridge-walk can only travel the way it faces: a purely
 * sideways walk would turn the letters fully side-on, a diagonal one meets
 * in three-quarter view with no sliding.
 */
const START_Z = TOGETHER_Z - SPREAD;

let CENTER_HUE = 0;

// ---------------------------------------------------------------------------
// Actors + runner
// ---------------------------------------------------------------------------

type ActorId = HelloWorldActorId;

const actors = new Map<ActorId, Actor3D>();
let stage: Stage3D | null = null;
const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = helloWorldSteps(() => walkTogether());

const runner = useLessonRunner<ActorId>({
  steps: STEPS,
  actors,
  accentHue,
  emit: {
    lessonComplete: () => emit('lesson-complete'),
    practiceNow: () => emit('practice-now'),
  },
});

defineExpose({ steps: STEPS, advance: () => runner.handleAdvance() });

watchEnvironment(props, () => stage);
watchFreeCamera(props, () => stage);
watchStageGrid(props, () => stage);

watch(runner.currentStep, (step) => {
  if (step?.kind === 'phoneme' && step.actorIds.length === 1) {
    accentHue.value =
      step.actorIds[0] === 'h' ? CENTER_HUE - HUE_OFFSET : CENTER_HUE + HUE_OFFSET;
  } else {
    accentHue.value = CENTER_HUE;
  }
});

// ---------------------------------------------------------------------------
// Stage + layout (world units)
// ---------------------------------------------------------------------------

/** Centre x of each letter when standing together, word centred on x = 0. */
let togetherX: Record<ActorId, number> = { h: 0, i: 0 };

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, props);

  const hidden = ['eyes', 'mouth', 'arms'] as const;
  const look = lessonLook(props);
  const h = stage.addActor('h', 'h', {
    color: letterColor(CENTER_HUE - HUE_OFFSET),
    hiddenParts: [...hidden],
    look,
  });
  const i = stage.addActor('i', 'i', {
    color: letterColor(CENTER_HUE + HUE_OFFSET),
    hiddenParts: [...hidden],
    look,
  });
  if (!h || !i) return;
  actors.set('h', h);
  actors.set('i', i);

  const wh = h.letter.width;
  const wi = i.letter.width;
  const total = wh + TOGETHER_GAP + wi;
  togetherX = { h: -total / 2 + wh / 2, i: total / 2 - wi / 2 };

  h.moveTo(togetherX.h - SPREAD, START_Z);
  i.moveTo(togetherX.i + SPREAD, START_Z);
  // Frame the spread pair (the widest the scene gets)
  stage.frame(total / 2 + SPREAD + 20);
}

function teardownStage(): void {
  stage?.destroy();
  stage = null;
  actors.clear();
}

// ---------------------------------------------------------------------------
// Choreography
// ---------------------------------------------------------------------------

async function walkTogether(): Promise<void> {
  const h = actors.get('h');
  const i = actors.get('i');
  if (!h || !i) return;

  const residual = HUE_OFFSET * HUE_RESIDUAL;
  void h.letter.setColor(letterColor(CENTER_HUE - residual), { duration: WALK_DURATION_MS });
  void i.letter.setColor(letterColor(CENTER_HUE + residual), { duration: WALK_DURATION_MS });

  await Promise.all([
    h.walkTo(togetherX.h, TOGETHER_Z, { gait: props.gait, durationMs: WALK_DURATION_MS }),
    i.walkTo(togetherX.i, TOGETHER_Z, { gait: props.gait, durationMs: WALK_DURATION_MS }),
  ]);
}

async function openingFlourish(): Promise<void> {
  const h = actors.get('h');
  const i = actors.get('i');
  if (!h || !i) return;

  await Promise.all([
    h.letter.showPart('eyes', { duration: 320 }),
    i.letter.showPart('eyes', { duration: 320 }),
  ]);
  await Promise.all([
    h.letter.showPart('mouth', { duration: 240 }),
    i.letter.showPart('mouth', { duration: 240 }),
    h.letter.showPart('arms', { duration: 240 }),
    i.letter.showPart('arms', { duration: 240 }),
  ]);

  // Opening wave hello — each letter waves with a randomly chosen hand.
  const randomArm = () => (Math.random() < 0.5 ? 'left' : 'right');
  await Promise.all([
    h.letter.arms?.wave({ arm: randomArm() }),
    i.letter.arms?.wave({ arm: randomArm() }),
  ]);
}

// ---------------------------------------------------------------------------
// Resize: the stage re-frames its own camera; the audio button re-measures.
// Positions are in world units, so letters don't need re-placing.
// ---------------------------------------------------------------------------

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  await nextTick();
  CENTER_HUE = Math.random() * 360;
  accentHue.value = CENTER_HUE;
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
