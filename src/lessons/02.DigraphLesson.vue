<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * DigraphLesson — letter teams that make a sound together.
 *
 * SH is the only exemplar. After the opening SH demo, two words are
 * presented (ship, fish) with sh anchored in place; the other letters
 * walk in around it from whichever side they're needed. Each word steps
 * through its phonemes one advance at a time, then plays the whole-word
 * recording.
 *
 * For the ship→fish transition, `i`/`p` exit stage right while a fresh
 * `f`/`i2` walk in from stage left simultaneously — `i2` is a second
 * `i` actor so the two words can overlap without an actor reuse race.
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { Stage } from '../letterpeople/scene/Stage';
import type { Actor } from '../letterpeople/scene/Stage';
import { oklch } from '../letterpeople/util/color';
import LessonShell from './LessonShell.vue';
import { useLessonRunner, type LessonStep } from './useLessonRunner';
import { digraphSteps, type DigraphActorId } from './digraphSteps';

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LETTER_HEIGHT = 240;
const LETTER_LINE_WIDTH = 20;
const LETTER_BORDER_WIDTH = 3;
const LETTER_EYE_SIZE = 8;

const HUE_OFFSET = 25;
const HUE_RESIDUAL = 0;

const WALK_DURATION_MS = 1800;
const WORD_WALK_MS = 900;
const actorDepthInit = 70;

function letterColor(hue: number): string { return oklch(0.75, 0.13, hue); }

let HUE_SH = 0;
let COLOR_S = '';
let COLOR_H = '';

function initColors(): void {
  HUE_SH = Math.random() * 360;
  COLOR_S = letterColor(HUE_SH - HUE_OFFSET);
  COLOR_H = letterColor(HUE_SH + HUE_OFFSET);
}

// ---------------------------------------------------------------------------
// Actors + runner
// ---------------------------------------------------------------------------

type ActorId = DigraphActorId;

const actors = new Map<ActorId, Actor>();
let stage: Stage | null = null;

const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = digraphSteps({
  hWalksIn: () => choreographyHWalksIn(),
  shipWalkIn: () => choreographyShipWalkIn(),
  shipOutFishIn: () => choreographyShipOutFishIn(),
});

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
  // Tap / drag the letters to hear sounds they've already made
  touchReplay: true,
});

// ---------------------------------------------------------------------------
// Stage setup
// ---------------------------------------------------------------------------

let centeredLeftX = 0;
let centeredRightX = 0;

function setupStage(): void {
  if (!runner.stageContainerRef.value) return;

  stage = new Stage(runner.stageContainerRef.value, {
    backgroundColor: '#FFFEF7',
    horizonRatio: 0.25,
  });

  const baseLetterOptions = {
    lineWidth: LETTER_LINE_WIDTH,
    borderWidth: LETTER_BORDER_WIDTH,
    eyeSize: LETTER_EYE_SIZE,
    showEyes: false,
    showMouth: false,
    showArms: false,
  };

  const s = stage.addActor('s', 's', {
    x: 0,
    z: actorDepthInit,
    height: LETTER_HEIGHT,
    letterOptions: { ...baseLetterOptions, color: COLOR_S },
  });
  const h = stage.addActor('h', 'h', {
    x: 0,
    z: actorDepthInit,
    height: LETTER_HEIGHT,
    letterOptions: { ...baseLetterOptions, color: COLOR_H },
  });
  if (s) actors.set('s', s);
  if (h) actors.set('h', h);
}

async function openingFlourish(): Promise<void> {
  const s = actors.get('s')?.instance;
  if (!s) return;
  await s.eyes.show({ duration: 320 });
  await Promise.all([
    s.mouth.show({ duration: 240 }),
    s.arms.show({ duration: 240 }),
  ]);
}

function teardownStage(): void {
  stage?.destroy();
  stage = null;
  actors.clear();
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function measureLetterWidth(actor: Actor): number {
  const svg = actor.instance.svgElement as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.height > 0) return LETTER_HEIGHT * (vb.width / vb.height);
  return svg.clientWidth || Math.round(LETTER_HEIGHT * 0.6);
}

function fallbackLetterWidth(): number {
  return Math.round(LETTER_HEIGHT * 0.6);
}

function computePairPositions(leftId: ActorId, rightId: ActorId): void {
  const stageEl = runner.stageContainerRef.value;
  const left = actors.get(leftId);
  const right = actors.get(rightId);
  if (!stageEl || !left || !right) return;

  const containerWidth = stageEl.clientWidth;
  const leftW = measureLetterWidth(left);
  const rightW = measureLetterWidth(right);
  const gap = Math.round(LETTER_HEIGHT * 0.1);

  centeredLeftX = Math.round((containerWidth - leftW - rightW - gap) / 2);
  centeredRightX = centeredLeftX + Math.round(leftW) + gap;
}

function positionSAlone(): void {
  const stageEl = runner.stageContainerRef.value;
  const s = actors.get('s');
  if (!stageEl || !s) return;

  const containerWidth = stageEl.clientWidth;
  const sW = measureLetterWidth(s);
  const cx = Math.round((containerWidth - sW) / 2);
  s.move3D(cx, actorDepthInit, 0);
}

/**
 * Word-letter positioning with sh anchored. Returns target x for each id in
 * `wordOrder`, computed by laying out the word from the fixed sh pair outward.
 * The word ends up off-center on whichever side has the extra letters.
 */
function computeWordPositionsAnchoredAtSh(
  wordOrder: ActorId[],
): Map<ActorId, number> {
  const positions = new Map<ActorId, number>();
  const gap = Math.round(LETTER_HEIGHT * 0.06);

  const sIdx = wordOrder.indexOf('s');
  const hIdx = wordOrder.indexOf('h');
  if (sIdx < 0 || hIdx < 0) return positions;

  const widths = wordOrder.map((id) => {
    const a = actors.get(id);
    return a ? measureLetterWidth(a) : fallbackLetterWidth();
  });

  // Anchor: sh keeps its current centered-pair position.
  positions.set('s', centeredLeftX);
  positions.set('h', centeredRightX);

  // Walk left from sh.
  let cursor = centeredLeftX;
  for (let i = sIdx - 1; i >= 0; i--) {
    cursor -= widths[i] + gap;
    positions.set(wordOrder[i], cursor);
  }

  // Walk right from sh.
  cursor = centeredRightX + widths[hIdx];
  for (let i = hIdx + 1; i < wordOrder.length; i++) {
    cursor += gap;
    positions.set(wordOrder[i], cursor);
    cursor += widths[i];
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Pair-rotation choreography
// ---------------------------------------------------------------------------

async function choreographyHWalksIn(): Promise<void> {
  accentHue.value = HUE_SH;
  const stageEl = runner.stageContainerRef.value;
  const s = actors.get('s');
  const h = actors.get('h');
  if (!stageEl || !s || !h) return;

  computePairPositions('s', 'h');
  const offscreenRight = stageEl.clientWidth + 100;

  h.move3D(offscreenRight, actorDepthInit, 0);

  void h.instance.eyes.show({ duration: 200 });
  void h.instance.mouth.show({ duration: 200 });
  void h.instance.arms.show({ duration: 200 });

  const residualOffset = HUE_OFFSET * HUE_RESIDUAL;

  void s.instance.updateAppearance(
    { color: letterColor(HUE_SH - residualOffset) },
    { duration: WALK_DURATION_MS },
  );
  void h.instance.updateAppearance(
    { color: letterColor(HUE_SH + residualOffset) },
    { duration: WALK_DURATION_MS },
  );

  await Promise.all([
    s.walkTo(centeredLeftX, actorDepthInit + 10, WALK_DURATION_MS),
    h.walkTo(centeredRightX, actorDepthInit + 10, WALK_DURATION_MS),
  ]);
  await Promise.all([
    s.instance.body.resetPose({ duration: 300 }),
    h.instance.body.resetPose({ duration: 300 }),
  ]);
}

// ---------------------------------------------------------------------------
// Word formation choreography
// ---------------------------------------------------------------------------

function ensureExtraActor(id: ActorId, startX: number): Actor | null {
  if (!stage) return null;
  if (actors.has(id)) {
    const existing = actors.get(id)!;
    existing.wrapper.style.display = '';
    existing.move3D(startX, actorDepthInit, 0);
    return existing;
  }
  // 'i2' is a second 'i' renderer.
  const letterChar = id === 'i2' ? 'i' : id;
  const actor = stage.addActor(id, letterChar, {
    x: startX,
    z: actorDepthInit,
    height: LETTER_HEIGHT,
    letterOptions: {
      lineWidth: LETTER_LINE_WIDTH,
      borderWidth: LETTER_BORDER_WIDTH,
      eyeSize: LETTER_EYE_SIZE,
      showEyes: false,
      showMouth: false,
      showArms: false,
      color: letterColor(accentHue.value + 60),
    },
  });
  if (actor) actors.set(id, actor);
  return actor ?? null;
}

async function walkExtraIn(
  actor: Actor,
  targetX: number,
  hueOffset: number,
): Promise<void> {
  void actor.instance.eyes.show({ duration: 200 });
  void actor.instance.mouth.show({ duration: 200 });
  void actor.instance.updateAppearance(
    { color: letterColor(accentHue.value + hueOffset) },
    { duration: WORD_WALK_MS },
  );
  await actor.walkTo(targetX, actorDepthInit + 10, WORD_WALK_MS);
}

async function choreographyShipWalkIn(): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl || !stage) return;

  const offscreenRight = stageEl.clientWidth + 200;

  // Create extras first so measureLetterWidth gets real viewBox-derived widths
  // when positions are computed (otherwise they fall back to a fat default).
  const i = ensureExtraActor('i', offscreenRight);
  const p = ensureExtraActor('p', offscreenRight + 120);
  await nextTick();

  computePairPositions('s', 'h');
  const positions = computeWordPositionsAnchoredAtSh(['s', 'h', 'i', 'p']);

  const walks: Promise<void>[] = [];
  if (i) walks.push(walkExtraIn(i, positions.get('i') ?? 0, 60));
  if (p) walks.push(walkExtraIn(p, positions.get('p') ?? 0, 120));
  await Promise.all(walks);
}

async function choreographyShipOutFishIn(): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl || !stage) return;

  const offscreenRight = stageEl.clientWidth + 200;
  const offscreenLeft = -300;

  // Create fish extras first so position math sees their real widths.
  const f = ensureExtraActor('f', offscreenLeft - 120);
  const i2 = ensureExtraActor('i2', offscreenLeft);
  await nextTick();

  // sh stays put; recompute the pair anchor in case of resize.
  computePairPositions('s', 'h');
  const positions = computeWordPositionsAnchoredAtSh(['f', 'i2', 's', 'h']);

  const walks: Promise<void>[] = [];

  const i = actors.get('i');
  const p = actors.get('p');
  if (i) {
    walks.push(
      i.walkTo(offscreenRight, actorDepthInit, WORD_WALK_MS).then(() => {
        i.wrapper.style.display = 'none';
      }),
    );
  }
  if (p) {
    walks.push(
      p.walkTo(offscreenRight + 120, actorDepthInit, WORD_WALK_MS).then(() => {
        p.wrapper.style.display = 'none';
      }),
    );
  }

  if (f) walks.push(walkExtraIn(f, positions.get('f') ?? 0, 60));
  if (i2) walks.push(walkExtraIn(i2, positions.get('i2') ?? 0, 120));

  await Promise.all(walks);
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
  const step = runner.currentStep.value;
  if (step?.kind === 'phoneme' && step.actorIds.length === 2) {
    computePairPositions(step.actorIds[0], step.actorIds[1]);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  await nextTick();
  initColors();
  accentHue.value = HUE_SH;
  setupStage();

  positionSAlone();

  const stageEl = runner.stageContainerRef.value;
  const h = actors.get('h');
  if (stageEl && h) {
    h.move3D(stageEl.clientWidth + 100, actorDepthInit, 0);
  }

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
