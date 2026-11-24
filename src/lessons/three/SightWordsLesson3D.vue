<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * SightWordsLesson3D — lesson 5 (sight words), three.js staging: w, a and s
 * play on a slide, and capital A narrates. Steps: sightWordsSteps.ts; the
 * play: slidePlay.ts; storyboard: Storyboarding.md.
 */

import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as THREE from 'three';
import { createTimer } from 'animejs';
import { shotCamera, type Stage3D, type Actor3D } from '../../letterpeople/three/stage3d';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import { sightWordsSteps, type SightWordsActorId } from '../sightWordsSteps';
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
import {
  PLAYGROUND_FRAME,
  PLAYGROUND_NARRATOR,
  PLAYGROUND_NARRATOR_FOR_WORD,
  faceOffShot,
  startSlidePlay,
  wordShot,
  wait,
  type SlideCast,
  type SlidePlay,
} from './slidePlay';

const props = withDefaults(defineProps<Lesson3DProps>(), {
  ...LESSON3D_DEFAULTS,
  gait: 'hop',
  environment: 'playground',
});

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

type ActorId = SightWordsActorId;

/**
 * The players, in the order the play staggers them (the first starts on the
 * platform, the next on the bottom step, the last in line), which is also
 * their turn order, for good: `s` always slides just before `a` (so it's at
 * the bottom when `a` misbehaves) and `w` just after (so it's the one
 * arriving on top).
 */
const PLAYERS = ['s', 'a', 'w'] as const;

/** Colour = who. A and a share a hue (grown-up and child); w and s sit a third of the wheel either side. */
const HUE: Record<ActorId, number> = { A: 0, a: 0, w: 0, s: 0 };

function initColors(): void {
  const base = Math.random() * 360;
  HUE.A = HUE.a = base;
  HUE.w = (base + 120) % 360;
  HUE.s = (base + 240) % 360;
}

/**
 * The narrator's balloon: to its right while the play is going on (above it,
 * in front of the steps, the balloon would cover the platform and the
 * face-off), capped (a balloon grows its text to fill the space it's given).
 */
const NARRATOR_BALLOON = { side: 'right' as const, maxWidth: 380, maxHeight: 130 };

/** The play runs this long before the first line. */
const LEAD_IN_MS = 2500;
/** The camera's move into the face-off close-up and back out. */
const SHOT_MS = 900;
/** The narrator leaves for the word this long after the close-up starts (out of shot by then), and takes this long. */
const NARRATOR_DELAY_MS = 250;
const NARRATOR_WALK_MS = 1700;

const actors = new Map<ActorId, Actor3D>();
let stage: Stage3D | null = null;
let play: SlidePlay | null = null;
let cast: SlideCast | null = null;
const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = sightWordsSteps({
  aToAnEnd: async () => {
    const a = actors.get('a');
    if (play && a) await play.holdAtAnEnd(a);
  },
  misbehave: async () => {
    if (play && cast) {
      await play.misbehave(cast, { climbing: () => void eyeRoll(), appealTo: actors.get('A') });
    }
  },
  closeUp: async () => {
    // While the camera's on the face-off, the narrator walks front and centre
    // for the word (not waited for: the press shouldn't hang on it)
    // (It sets off a beat after the camera does, so its first step is out of shot)
    // It ends facing the camera of the word shot the scene pulls back to
    // (not the play's audience point: that camera sits well to its right)
    const narrator = actors.get('A');
    if (narrator && stage && cast) {
      const to = PLAYGROUND_NARRATOR_FOR_WORD;
      const cam = shotCamera(wordShot(cast, narrator, to), stage.camera.fov, stage.camera.aspect).position;
      const endYaw = Math.atan2(cam.x - to.x, cam.z - to.z);
      void wait(NARRATOR_DELAY_MS).then(() =>
        narrator.walkTo(to.x, to.z, { gait: 'waddle', durationMs: NARRATOR_WALK_MS, endYaw }),
      );
    }
    if (stage && cast) await stage.shotTo(faceOffShot(cast), { duration: SHOT_MS });
  },
  pullBack: () => {
    const narrator = actors.get('A');
    if (stage && cast && narrator) {
      void stage.shotTo(wordShot(cast, narrator, PLAYGROUND_NARRATOR_FOR_WORD), { duration: SHOT_MS });
    }
  },
  lineUp: async () => {
    // From this line on, the narrator speaks above its head: the action moves
    // to the word forming on the right, where a side balloon would sit
    // (runs before the line's balloon shows: onEnter goes first)
    const narrator = actors.get('A');
    if (narrator) narrator.balloonPlacement = { ...NARRATOR_BALLOON, side: 'above' };
    if (play && cast) await play.formWord(cast);
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

// The face-off holds still while a sound plays (a's own, mid-taunt)
watch(runner.isPlayingAudio, (playing) => play?.quiet(playing));

// The sound presses are all on `a` (the word too): its colour on the button
watch(runner.currentStep, (step) => {
  accentHue.value = step?.kind === 'phoneme' || step?.kind === 'word' ? HUE.a : HUE.A;
});

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, props);
  const s = stage;
  const { halfWidth, ...framing } = PLAYGROUND_FRAME;
  s.frame(halfWidth, framing);
  const look = lessonLook(props);

  const narrator = s.addActor('A', 'A', {
    x: PLAYGROUND_NARRATOR.x,
    z: PLAYGROUND_NARRATOR.z,
    scale: PLAYGROUND_NARRATOR.scale,
    color: letterColor(HUE.A),
    hiddenParts: ['eyes', 'mouth', 'arms'],
    look,
  });
  if (narrator) {
    // Its balloon to its right, capped: above it (in front of the steps), a
    // balloon filling the headroom covered the platform and the face-off
    narrator.balloonPlacement = { ...NARRATOR_BALLOON };
    actors.set('A', narrator);
  }

  const players: Actor3D[] = [];
  for (const id of PLAYERS) {
    const actor = s.addActor(id, id, { color: letterColor(HUE[id]), look });
    if (!actor) continue;
    actors.set(id, actor);
    players.push(actor);
  }
  play = startSlidePlay(players);
  const [w, a, sl] = (['w', 'a', 's'] as const).map((id) => actors.get(id));
  if (w && a && sl) cast = { word: [w, a, sl], climber: a, above: w, below: sl };
}

function teardownStage(): void {
  play?.stop();
  play = null;
  cast = null;
  stage?.destroy();
  stage = null;
  actors.clear();
}

/** The narrator rolls its eyes: its gaze sweeps up over its head and back to the audience. */
async function eyeRoll(): Promise<void> {
  const narrator = actors.get('A');
  if (!narrator || !stage) return;
  const head = narrator.letter.root.getWorldPosition(new THREE.Vector3());
  head.y += 80 * PLAYGROUND_NARRATOR.scale;
  const out = stage.camera.position.clone();
  const around = new THREE.CatmullRomCurve3([
    out,
    head.clone().add(new THREE.Vector3(-120, 140, 150)),
    head.clone().add(new THREE.Vector3(0, 210, 150)),
    head.clone().add(new THREE.Vector3(120, 140, 150)),
    out,
  ]);
  void narrator.letter.brows?.express('surprised', { duration: 200 });
  await new Promise<void>((resolve) =>
    createTimer({
      duration: 1000,
      onUpdate: (self) => narrator.lookAtPoint(around.getPoint(Math.min(1, self.progress))),
      onComplete: () => resolve(),
    }),
  );
  narrator.lookAtPoint(null);
  void narrator.letter.brows?.relax({ duration: 300 });
}

async function openingFlourish(): Promise<void> {
  const narrator = actors.get('A')?.letter;
  if (!narrator) return;
  await narrator.showPart('eyes', { duration: 320 });
  await Promise.all([
    narrator.showPart('mouth', { duration: 240 }),
    narrator.showPart('arms', { duration: 240 }),
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
  initColors();
  accentHue.value = HUE.A;
  setupStage();

  runner.attach();
  window.addEventListener('resize', handleWindowResize);

  await nextTick();
  // A lead-in: the play is already under way, and turn-taking is what the
  // learner sees before anyone speaks
  await Promise.all([openingFlourish(), wait(LEAD_IN_MS)]);
  void runner.start();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize);
  runner.detach();
  teardownStage();
});
</script>
