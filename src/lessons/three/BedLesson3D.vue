<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * BedLesson3D — lesson 1a, "Making our bed": the b/d "bed" mnemonic, three.js
 * staging (3D-only; preview: /dbg/lesson/three). A low-poly bedroom at night. The word
 * *bed* is the bed, seen side-on (b's stem the headboard, d's the footboard),
 * under a sheet lying on an invisible plank across the bowls. An end table
 * with a lamp stands at the head end; i is asleep on the bed, snoring.
 *
 * The lamp goes on, i wakes and leaps over the footboard, and dawn comes up
 * in the window while i introduces the bed: whips off the sheet, the letters
 * say their sounds, b and d own up to being easy to mix up, and i makes the
 * bed again.
 *
 * Steps: bedSteps.ts. Props: letterpeople/three/{bedProp, bedroomProps,
 * snore}.ts; the room: environments.ts "bedroom".
 */

import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as THREE from 'three';
import { createTimer } from 'animejs';
import { bedLayout, createBed, type Bed, type BedLayout } from '../../letterpeople/three/bedProp';
import { createEndTable, END_TABLE, hangPicture, type EndTable } from '../../letterpeople/three/bedroomProps';
import { BEDROOM_FRAMES } from '../../letterpeople/three/environments';
import { startSnore, type Snore } from '../../letterpeople/three/snore';
import { bedHands as makeBedHands } from '../../letterpeople/three/fist';
import { shotCamera, type CameraShot, type Stage3D, type Actor3D } from '../../letterpeople/three/stage3d';
import type { Vec3 } from '../../letterpeople/three/clothSim';
import { oklch } from '../../letterpeople/util/color';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import { bedSteps, type BedActorId } from '../bedSteps';
import {
  LESSON3D_DEFAULTS,
  createLessonStage,
  lessonLook,
  letterColor,
  delay,
  watchEnvironment,
  watchFreeCamera,
  watchStageGrid,
  type Lesson3DProps,
} from './lesson3d';

const props = withDefaults(defineProps<Lesson3DProps>(), {
  ...LESSON3D_DEFAULTS,
  gait: 'hop',
  environment: 'bedroom',
});

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

type ActorId = BedActorId;
const BED_LETTERS = ['b', 'e', 'd'] as const;

// ---------------------------------------------------------------------------
// Set (world units; letter cap height 100)
// ---------------------------------------------------------------------------

/** The bed's centre; the end table on its left at the head end, i on its right once up. */
const BED_X = 0;
const BED_Z = 0;
/** The end table: this far out from the headboard, and set back a little. */
const TABLE_GAP = 10;
const TABLE_Z = -6;
/** Camera: half the width to fit, centre, and the top of the content. */
const FRAME = { halfWidth: 215, centerX: 0, top: 120 };

/** Night: the stage's lights this low (1 = full). With the lamp on; and by day. */
const NIGHT_LEVEL = 0.22;
const LAMP_LIT_LEVEL = 0.5;
const DAY_LEVEL = 1;
/** Night to day in the window (and the room brightening with it). */
const DAWN_MS = 9000;

/** The sleeper lies on the sheet, its dot toward the headboard, its feet this far from it. */
const SLEEPER_FEET_FROM_HEADBOARD = 112;
/** Half the thickness of a lying i (stem 20, plus outline) above the sheet's top. */
const SLEEPER_HALF = 11;
/**
 * Where i lands, leaping over the footboard: this far out from it (its
 * centre), a step forward. Well clear of the d, so the four don't read as a
 * word.
 */
const LANDING_DX = 64;
const LANDING_Z = 22;
/** Where i stands to take hold of the sheet (it hops in, then back out to its spot). */
const GRAB_STANCE_DX = 34;
/** How high the leap peaks above the bed (it has to clear the footboard). */
const LEAP_CLEARANCE = 50;

/** Where i takes hold of the sheet: its front corner, just inside the footboard. */
const GRAB_NEAR = { dx: -12, y: 36, dz: 12 };
const PULL_MS = 1500;
/** i's hand stays with the sheet for this much of the pull, then lets it fly. */
const HAND_WITH_SHEET = 0.22;
/** How far i can stretch an arm (default arm reach is 30). */
const REACH = 75;

/** b and d step forward this far when owning up (e stays put). */
const STEP_FORWARD = 40;

/**
 * The bed hands: i's fists (finger-stack height; the thumbs rise about half
 * that again), and the close-up on them: all of i, from a low camera to see
 * the fists. On a wide screen the shot is centred `dx` right of i, leaving
 * room for its balloon beside it (and the footboard just out of shot); on a
 * tall one it's centred on i, its balloon above as usual.
 */
const FIST_SIZE = 16;
const HANDS_SHOT = {
  wide: { dx: 75, halfWidth: 105 },
  tall: { dx: 0, halfWidth: 45 },
  y: 52,
  halfHeight: 60,
  elevation: 0.12,
};
const HANDS_SHOT_MS = 900;
/** On a wide screen, i's line goes beside it in the close-up, not above. */
const HANDS_BALLOON = { side: 'right' as const, maxWidth: 360, maxHeight: 140 };

/**
 * What hangs in the bedroom's frames: b things at the head end (left), d
 * things at the foot end (right, by the door). Pictures from
 * letterpeople/three/pictures.
 */
const WALL_ART: [keyof typeof BEDROOM_FRAMES, string][] = [
  ['leftOuter', 'bear'],
  ['leftInner', 'bat'],
  ['rightInner', 'dog'],
];

/** The bed is one colour, a wood brown (all three letters: one piece of furniture). */
const BED_HUE = 58;
const BED_COLOR = oklch(0.62, 0.085, BED_HUE);
const HUE: Record<ActorId, number> = { i: 0, b: BED_HUE, e: BED_HUE, d: BED_HUE };
/**
 * i's hue stays at least this far round the wheel from the bed's, so it
 * never reads as part of the bed (no orange, red or mustard i). letterColor
 * fixes lightness and chroma, so hue is the only thing that varies: this
 * leaves 138–338 (greens, blues, purples, pinks).
 */
const MIN_HUE_FROM_BED = 80;
function initColors(): void {
  HUE.i = (BED_HUE + MIN_HUE_FROM_BED + Math.random() * (360 - 2 * MIN_HUE_FROM_BED)) % 360;
}

/**
 * The runner's actors. The sleeper joins only once awake: the runner's idle
 * loop blinks visible eyes, and a blink would leave its shut eyes open.
 */
const actors = new Map<ActorId, Actor3D>();
let sleeper: Actor3D | null = null;
let stage: Stage3D | null = null;
let layout: BedLayout | null = null;
let bed: Bed | null = null;
let table: EndTable | null = null;
let snore: Snore | null = null;
let dawn: { pause(): void } | null = null;
let art: { dispose(): void }[] = [];
const accentHue = ref(0);

// ---------------------------------------------------------------------------
// Steps + runner
// ---------------------------------------------------------------------------

const STEPS: LessonStep<ActorId>[] = bedSteps({
  wakeUp: () => wakeUp(),
  pullSheet: () => pullSheet(),
  mixUp: () => mixUp(),
  together: () => together(),
  makeBed: () => makeBed(),
  bedHands: () => bedHands(),
});

const runner = useLessonRunner<ActorId>({
  steps: STEPS,
  actors,
  accentHue,
  // Tap / drag the letters to hear their sounds, but no ghost finger sweeping the word
  touchReplay: { hint: false },
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
  if (step?.kind === 'dialogue') accentHue.value = HUE[step.actorId];
  else if (step?.kind === 'phoneme') accentHue.value = HUE[step.actorIds[0]];
  else if (step?.kind === 'word') accentHue.value = HUE.b;
});

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/** Top of the sheet where it lies flat on the plank. */
let sheetTop = 0;
let sleeperFeetX = 0;

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, props);
  const s = stage;
  s.frame(FRAME.halfWidth, { centerX: FRAME.centerX, top: FRAME.top });
  s.setLightLevel(NIGHT_LEVEL);
  s.setDaylight(0);
  const look = lessonLook(props);
  const L = bedLayout(BED_X, BED_Z);
  layout = L;

  // The bed's letters: square to the camera (a word), asleep (no faces yet)
  BED_LETTERS.forEach((id, i) => {
    const actor = s.addActor(id, id, { color: BED_COLOR, hiddenParts: ['eyes', 'mouth', 'arms'], look });
    if (!actor) return;
    actor.moveTo(L.letterX[i], L.z, 0);
    actors.set(id, actor);
  });
  bed = createBed(s, L);

  art = WALL_ART.flatMap(([frame, word]) => hangPicture(s, word, BEDROOM_FRAMES[frame]) ?? []);

  table = createEndTable(s, {
    x: L.headPost.min.x - TABLE_GAP - END_TABLE.width / 2,
    z: TABLE_Z,
  });

  // i, asleep on its back along the bed: eyes shut, arms tucked away, snoring
  sheetTop = L.plankTop + bed.cloth.thickness + 0.5;
  sleeperFeetX = L.headPost.max.x + SLEEPER_FEET_FROM_HEADBOARD;
  const i = s.addActor('i', 'i', { color: letterColor(HUE.i), hiddenParts: ['arms'], look });
  if (i) {
    sleeper = i;
    void i.letter.setEyesShut(1);
    void i.walker.ride(
      () => ({ x: sleeperFeetX, y: sheetTop + SLEEPER_HALF, z: L.z, roll: Math.PI / 2, yaw: 0 }),
      1,
    );
    snore = startSnore(s, i.letter, { color: oklch(0.93, 0.04, 250) });
  }
}

function teardownStage(): void {
  dawn?.pause();
  dawn = null;
  snore?.dispose();
  snore = null;
  for (const a of art) a.dispose();
  art = [];
  table?.dispose();
  table = null;
  bed?.dispose();
  bed = null;
  sleeper = null;
  layout = null;
  stage?.destroy();
  stage = null;
  actors.clear();
}

// ---------------------------------------------------------------------------
// Choreography
// ---------------------------------------------------------------------------

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** World point → a letter's own (SVG-unit, y-down) space, for its arms. */
function toLetterSpace(actor: Actor3D, at: Vec3): { x: number; y: number } {
  actor.letter.content.updateWorldMatrix(true, false);
  const v = actor.letter.content.worldToLocal(new THREE.Vector3(at.x, at.y, at.z));
  return { x: v.x, y: v.y };
}

/** The lamp goes on; i wakes, sits up, stretches with a yawn and leaps over the footboard. */
async function wakeUp(): Promise<void> {
  const i = sleeper;
  if (!stage || !table || !layout || !i) return;
  const l = i.letter;

  // Click
  await Promise.all([table.lamp.turnOn(), stage.setLightLevel(LAMP_LIT_LEVEL, 350)]);
  await delay(300);

  // Stops snoring; the eyes flutter open
  void snore?.stop();
  void l.mouth?.updateShape({ openness: 0.2, mood: 0.6 }, { duration: 250 });
  void l.brows?.express('surprised', { duration: 200 });
  await l.setEyesShut(0.55, { duration: 280 });
  await l.setEyesShut(1, { duration: 160 });
  await l.setEyesShut(0, { duration: 260 });
  void l.brows?.relax({ duration: 300 });
  await delay(200);

  // Sits up (stiffly, up onto its feet: it's an i)
  const lying = sheetTop + SLEEPER_HALF;
  await i.walker.ride((t) => {
    const e = easeOutCubic(t);
    return { x: sleeperFeetX, y: lying + (sheetTop - lying) * e, z: BED_Z, roll: (Math.PI / 2) * (1 - e), yaw: 0 };
  }, 650);
  i.walker.setPosition(sleeperFeetX, BED_Z, 0, sheetTop);

  // Stretch and a yawn
  await l.showPart('arms', { duration: 200 });
  await Promise.all([
    l.arms?.left.rotateTo(-118, { duration: 380 }),
    l.arms?.right.rotateTo(-62, { duration: 380 }),
    l.mouth?.updateShape({ openness: 0.95, mood: 0.45 }, { duration: 380 }),
    l.setEyesShut(0.7, { duration: 380 }),
  ]);
  await delay(450);
  await Promise.all([
    l.arms?.relax({ duration: 300 }),
    l.mouth?.updateShape({ openness: 0.2, mood: 0.75 }, { duration: 300 }),
    l.setEyesShut(0, { duration: 300 }),
  ]);

  // Over the footboard, to stand beside the foot of the bed (the whole bed in view)
  await i.walker.hopOnto(
    { x: layout.footPost.max.x + LANDING_DX, z: LANDING_Z, floorY: 0 },
    { clearance: LEAP_CLEARANCE, face: 0 },
  );
  actors.set('i', i);
  startDawn();
}

/** Night to day in the window, the room brightening with it. Not waited for. */
function startDawn(): void {
  const s = stage;
  if (!s) return;
  dawn?.pause();
  dawn = createTimer({
    duration: DAWN_MS,
    onUpdate: (self) => {
      const t = Math.min(1, self.progress);
      s.setDaylight(t);
      void s.setLightLevel(LAMP_LIT_LEVEL + (DAY_LEVEL - LAMP_LIT_LEVEL) * t);
    },
    onComplete: () => {
      dawn = null;
    },
  });
}

/** A short hop along the front of the bed, ending square to the camera. */
function hopTo(a: Actor3D, x: number, z: number): Promise<void> {
  return a.walkTo(x, z, { gait: props.gait, durationMs: 450, endYaw: 0 });
}

/**
 * i hops in to the foot of the bed, takes the sheet's front corner and whips
 * it off up and away, then hops back out to its spot as the bed wakes.
 */
async function pullSheet(): Promise<void> {
  const i = actors.get('i');
  if (!stage || !bed || !layout || !i) return;
  const s = stage;
  const { footPost, z } = layout;

  await hopTo(i, footPost.max.x + GRAB_STANCE_DX, LANDING_Z);
  const hold = bed.holdPointNear({ x: footPost.min.x + GRAB_NEAR.dx, y: GRAB_NEAR.y, z: z + GRAB_NEAR.dz });
  const arm = i.letter.arms?.left;
  // Where the hand rests (angle and length): the reach stretches the arm, and relax() only turns it
  const restHand = arm?.getHandPosition();
  await arm?.setHandPosition(toLetterSpace(i, hold), { duration: 300 }, REACH);
  await delay(120);

  const offX = s.offstageX('right', 0) + 200;
  let letGo = false;
  await bed.pullSheet({
    grabAt: hold,
    durationMs: PULL_MS,
    // A yank up and back, then it sails off over i's head
    path: (t, from) => {
      const u = 1 - (1 - t) * (1 - t);
      const p1 = { x: from.x + 50, y: from.y + 150, z: from.z - 10 };
      const p2 = { x: offX, y: from.y + 260, z: -60 };
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      return {
        x: a * from.x + b * p1.x + c * p2.x,
        y: a * from.y + b * p1.y + c * p2.y,
        z: a * from.z + b * p1.z + c * p2.z,
      };
    },
    onHand: (at, t) => {
      if (!arm || letGo) return;
      if (t < HAND_WITH_SHEET) {
        void arm.setHandPosition(toLetterSpace(i, at), undefined, REACH);
      } else {
        letGo = true;
        if (restHand) void arm.setHandPosition(restHand, { duration: 400 }, REACH);
        else void arm.relax({ duration: 400 });
      }
    },
  });

  // i back out to its spot; the bed wakes up, head to foot
  await Promise.all([
    hopTo(i, footPost.max.x + LANDING_DX, LANDING_Z),
    ...BED_LETTERS.map(async (id, n) => {
      const l = actors.get(id)?.letter;
      if (!l) return;
      await delay(n * 220);
      await l.showPart('eyes', { duration: 300 });
      await l.blink({ duration: 160 });
      await l.showPart('mouth', { duration: 200 });
    }),
  ]);
}

/** b and d step forward, owning up (eyes down, brows sad, a little smaller); e stays put and looks on. */
async function mixUp(): Promise<void> {
  if (!layout) return;
  const L = layout;
  const [b, e, d] = BED_LETTERS.map((id) => actors.get(id));
  if (!b || !e || !d) return;
  const walk = (a: Actor3D, x: number, z: number) =>
    a.walkTo(x, z, { gait: props.gait, durationMs: 700, endYaw: 0 });
  await Promise.all([walk(b, L.letterX[0], L.z + STEP_FORWARD), walk(d, L.letterX[2], L.z + STEP_FORWARD)]);

  const floorAhead = (a: Actor3D) => new THREE.Vector3(a.position.x, 0, a.position.z + 90);
  const headOf = (a: Actor3D) => new THREE.Vector3(a.position.x, 55, a.position.z);
  for (const a of [b, d]) {
    a.lookAtPoint(floorAhead(a));
    void a.letter.brows?.express('sad', { duration: 300 });
    void a.letter.mouth?.updateShape({ mood: 0.3 }, { duration: 300 });
    void a.letter.pose({ scale: 0.94, duration: 350, ease: 'outQuad' }, 'bottom');
  }
  // e looks from one to the other
  e.lookAtPoint(headOf(b));
  await delay(700);
  // A sheepish glance at each other, then back at the floor
  b.lookAtPoint(headOf(d));
  d.lookAtPoint(headOf(b));
  e.lookAtPoint(headOf(d));
  await delay(600);
  b.lookAtPoint(floorAhead(b));
  d.lookAtPoint(floorAhead(d));
  e.lookAtPoint(null);
}

/** b and d back in the row, cheered up: the bed again. */
async function together(): Promise<void> {
  if (!layout) return;
  const L = layout;
  const all = BED_LETTERS.map((id) => actors.get(id));
  await Promise.all(
    all.map(async (a, n) => {
      if (!a) return;
      a.lookAtPoint(null);
      void a.letter.brows?.relax({ duration: 300 });
      void a.letter.mouth?.updateShape({ mood: 0.75 }, { duration: 300 });
      if (BED_LETTERS[n] === 'e') return; // never left
      void a.letter.pose({ scale: 1, duration: 300, ease: 'outQuad' }, 'bottom');
      await a.walkTo(L.letterX[n], L.z, { gait: props.gait, durationMs: 700, endYaw: 0 });
      // Square on, exactly where the sheet expects them
      a.moveTo(L.letterX[n], L.z, 0);
    }),
  );
}

/** i makes the bed: a flick of the arms, and a fresh sheet floats down over it. */
async function makeBed(): Promise<void> {
  const i = actors.get('i');
  if (!bed || !i) return;
  const l = i.letter;
  await Promise.all([
    l.arms?.left.rotateTo(-140, { duration: 260 }),
    l.arms?.right.rotateTo(-40, { duration: 260 }),
  ]);
  const covered = bed.coverAgain();
  void l.arms?.relax({ duration: 450 });
  // The bed settles back in under it
  void delay(500).then(() =>
    Promise.all(
      BED_LETTERS.map((id) => {
        const bl = actors.get(id)?.letter;
        return bl ? Promise.all([bl.hidePart('eyes', { duration: 250 }), bl.hidePart('mouth', { duration: 250 })]) : null;
      }),
    ),
  );
  await covered;
}

/**
 * The camera closes in on i, which turns square to it and makes the bed with
 * its hands: two thumbs up, knuckles together (a b and a d, seen from here).
 */
async function bedHands(): Promise<void> {
  const i = actors.get('i');
  const s = stage;
  if (!s || !i) return;
  const wide = s.camera.aspect >= 1;
  const fit = wide ? HANDS_SHOT.wide : HANDS_SHOT.tall;
  if (wide) i.balloonPlacement = { ...HANDS_BALLOON };
  const { x, z } = i.position;
  const shot: CameraShot = {
    target: new THREE.Vector3(x + fit.dx, HANDS_SHOT.y, z),
    halfWidth: fit.halfWidth,
    halfHeight: HANDS_SHOT.halfHeight,
    elevation: HANDS_SHOT.elevation,
  };
  const cam = shotCamera(shot, s.camera.fov, s.camera.aspect).position;
  // Turn first: a turn relaxes the arms when it's done
  await Promise.all([
    s.shotTo(shot, { duration: HANDS_SHOT_MS }),
    i.walker.turnTo(Math.atan2(cam.x - x, cam.z - z), { gait: props.gait }),
  ]);
  void i.letter.mouth?.updateShape({ openness: 0.25, mood: 0.85 }, { duration: 300 });
  await makeBedHands(i.letter, { size: FIST_SIZE });
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
  accentHue.value = HUE.i;
  setupStage();

  runner.attach();
  window.addEventListener('resize', handleWindowResize);

  await nextTick();
  void runner.start();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize);
  runner.detach();
  teardownStage();
});
</script>
