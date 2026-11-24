<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * FinalOpenVowelsLesson3D — three.js rework of 04.FinalOpenVowelsLesson
 * (SPIKE, dbg-only).
 *
 * Same step script and word rows (finalOpenVowelsSteps), runner and shell.
 * The SVG lesson fakes three depth rows with per-row scale; here the rows
 * stand on risers (choir-bleacher steps) at real depths, so back rows stay
 * visible over front ones. Letters file along their riser to their places,
 * and the peel sends six letters off along the risers at once. Row letters
 * are scaled to cancel perspective so the three words read the same size
 * (the SVG's deliberate choice); the host is 1.5×.
 */

import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as THREE from 'three';
import type { Stage3D, Actor3D } from '../../letterpeople/three/stage3d';
import { oklch } from '../../letterpeople/util/color';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import {
  finalOpenVowelsSteps,
  FINAL_OPEN_VOWELS_KEEP_COUNT,
  FINAL_OPEN_VOWELS_LETTER_FOR,
  FINAL_OPEN_VOWELS_ROW_WORDS,
  type FinalOpenVowelsActorId,
} from '../finalOpenVowelsSteps';
import {
  LESSON3D_DEFAULTS,
  createLessonStage,
  lessonLook,
  delay,
  letterColor,
  rowCenters,
  walkOffAndHide,
  watchEnvironment,
  watchFreeCamera,
  watchStageGrid,
  type Lesson3DProps,
} from './lesson3d';

const props = withDefaults(defineProps<Lesson3DProps>(), LESSON3D_DEFAULTS);

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Longer than the SVG's 900: rows file in from the wings. */
const WORD_WALK_MS = 1800;
const ROW_STAGGER_MS = 170;

/**
 * Rows back → front: depth and riser height. Chosen by a numeric sweep so no
 * row's letters hide the row behind (worst overlap 0.6% of a row's height,
 * at 2:1 and 1.2:1 stages); 45-high steps had the front rows covering ~40%.
 * Risers are as deep as the row spacing: one continuous bleacher.
 */
const ROW_Z = [-210, -100, 10] as const;
const ROW_FLOOR = [180, 90, 0] as const;
const RISER_DEPTH = 110;
/** Word rows sit right of centre, leaving the host her lane on the left. */
const ROW_CENTER_X = 70;
/** The host narrates from downstage left, in front of the stack. */
const HOST_X = -250;
const HOST_Z = 80;
const HOST_SCALE = 1.5;

type ActorId = FinalOpenVowelsActorId;
const LETTER_FOR = FINAL_OPEN_VOWELS_LETTER_FOR;
const KEEP = FINAL_OPEN_VOWELS_KEEP_COUNT;

interface Row {
  ids: readonly ActorId[];
  z: number;
  floorY: number;
}
const ROWS: Row[] = FINAL_OPEN_VOWELS_ROW_WORDS.map((ids, i) => ({
  ids,
  z: ROW_Z[i],
  floorY: ROW_FLOOR[i],
}));

/** Colour = who (see the SVG lesson's header): one hue per word + host. */
let HUE_HOST = 0;
const ROW_HUES: number[] = [0, 0, 0];

function initColors(): void {
  const base = Math.random() * 360;
  HUE_HOST = base;
  for (let i = 0; i < ROW_HUES.length; i++) ROW_HUES[i] = (base + 90 * (i + 1)) % 360;
}

const actors = new Map<ActorId, Actor3D>();
let stage: Stage3D | null = null;
let risers: THREE.Group | null = null;
const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = finalOpenVowelsSteps({
  stageTrio1: () => choreographyStageTrio1(),
  peelToTrio2: () => choreographyPeelToTrio2(),
  onRowWord: (rowIndex) => {
    accentHue.value = ROW_HUES[rowIndex];
  },
});

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

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/** Low-poly riser steps, running well past both wings. */
function buildRisers(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.MeshLambertMaterial({ color: oklch(0.84, 0.035, 65), flatShading: true });
  const face = new THREE.MeshLambertMaterial({ color: oklch(0.76, 0.04, 62), flatShading: true });
  ROWS.forEach((row) => {
    if (row.floorY <= 0) return;
    const box = new THREE.Mesh(new THREE.BoxGeometry(4000, row.floorY, RISER_DEPTH), [
      face, face, top, face, face, face, // +x −x +y −y +z −z
    ]);
    box.position.set(0, row.floorY / 2, row.z);
    g.add(box);
  });
  return g;
}

/**
 * Scale for a row at depth z so it reads the same size on screen as a row
 * at the front (the SVG lesson's uniform-size choice), given the camera.
 */
function sizeForDepth(z: number): number {
  const camZ = stage?.framedCameraZ ?? 600;
  const front = ROW_Z[ROW_Z.length - 1];
  return (camZ - z) / (camZ - front);
}

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, props);
  // Host lane on the left, the stack to the right, back row up on its riser
  stage.frame(360, { centerX: -20, top: ROW_FLOOR[0] + 100 });

  risers = buildRisers();
  stage.scene.add(risers);

  const host = stage.addActor('e', 'e', {
    x: 0,
    z: 20,
    scale: HOST_SCALE,
    color: letterColor(HUE_HOST),
    hiddenParts: ['eyes', 'mouth', 'arms'],
    look: lessonLook(props),
  });
  if (host) actors.set('e', host);
}

function teardownStage(): void {
  if (risers) {
    const mats = new Set<THREE.Material>();
    risers.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    });
    mats.forEach((m) => m.dispose());
  }
  risers = null;
  stage?.destroy();
  stage = null;
  actors.clear();
}

async function openingFlourish(): Promise<void> {
  const host = actors.get('e')?.letter;
  if (!host) return;
  await host.showPart('eyes', { duration: 320 });
  await Promise.all([host.showPart('mouth', { duration: 240 }), host.showPart('arms', { duration: 240 })]);
}

function rowTargets(ids: readonly ActorId[]): Map<ActorId, number> {
  const xs = rowCenters(ids.map((id) => actors.get(id)?.width ?? 50), 8, ROW_CENTER_X);
  return new Map(ids.map((id, i) => [id, xs[i]]));
}

const walk = () => ({ gait: props.gait, durationMs: WORD_WALK_MS });

// ---------------------------------------------------------------------------
// Choreography 1 — the stack files on; the host steps downstage left
// ---------------------------------------------------------------------------

async function choreographyStageTrio1(): Promise<void> {
  if (!stage) return;

  ROWS.forEach((row, rowIndex) => {
    const offR = stage!.offstageX('right', row.z);
    row.ids.forEach((id, i) => {
      const actor = stage!.addActor(id, LETTER_FOR[id], {
        x: offR + i * 80,
        z: row.z,
        floorY: row.floorY,
        scale: sizeForDepth(row.z),
        color: letterColor(ROW_HUES[rowIndex]),
        hiddenParts: ['eyes', 'arms'],
        look: lessonLook(props),
      });
      if (actor) actors.set(id, actor);
    });
  });

  const walks: Promise<void>[] = [];
  const host = actors.get('e');
  if (host) walks.push(host.walkTo(HOST_X, HOST_Z, walk()));

  ROWS.forEach((row, rowIndex) => {
    const at = rowTargets(row.ids);
    for (const id of row.ids) {
      const actor = actors.get(id);
      if (!actor) continue;
      void actor.letter.showPart('eyes', { duration: 200 });
      walks.push(delay(rowIndex * ROW_STAGGER_MS).then(() => actor.walkTo(at.get(id)!, row.z, walk())));
    }
  });

  await Promise.all(walks);
}

// ---------------------------------------------------------------------------
// Choreography 2 — the peel: every word sheds its last two letters at once
// ---------------------------------------------------------------------------

async function choreographyPeelToTrio2(): Promise<void> {
  if (!stage) return;
  const moves: Promise<void>[] = [];
  for (const row of ROWS) {
    const offR = stage.offstageX('right', row.z);
    row.ids.slice(KEEP).forEach((id, k) => {
      const actor = actors.get(id);
      if (actor) moves.push(walkOffAndHide(actor, offR + k * 80, row.z, walk()));
    });
    const staying = row.ids.slice(0, KEEP);
    const at = rowTargets(staying);
    for (const id of staying) {
      const actor = actors.get(id);
      if (actor) moves.push(actor.walkTo(at.get(id)!, row.z, walk()));
    }
  }
  await Promise.all(moves);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
}

onMounted(async () => {
  await nextTick();
  initColors();
  accentHue.value = HUE_HOST;
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
