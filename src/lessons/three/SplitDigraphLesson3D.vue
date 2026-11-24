<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * SplitDigraphLesson3D — three.js rework of 03.SplitDigraphLesson (SPIKE,
 * dbg-only).
 *
 * Same step script (splitDigraphSteps), runner and shell. e hosts centre
 * stage; the sh / qu cameo and each word enter from the wings at depth (so
 * walkers stay in three-quarter view); e parks downstage of the word, then
 * steps up to join its end. The word steps' silent-e beat plays through
 * Actor3D's provisional 3D treatment.
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import type { Stage3D, Actor3D } from '../../letterpeople/three/stage3d';
import { wearCapAndCape, type CapAndCape } from '../../letterpeople/three/costumes';
import { createKite, holdKitBox, type KiteProp, type KitBox } from '../../letterpeople/three/kiteProp';
import * as THREE from 'three';
import { oklch } from '../../letterpeople/util/color';
import LessonShell from '../LessonShell.vue';
import { useLessonRunner, type LessonStep } from '../useLessonRunner';
import { splitDigraphSteps, type SplitDigraphActorId } from '../splitDigraphSteps';
import {
  LESSON3D_DEFAULTS,
  createLessonStage,
  delay,
  lessonLook,
  letterColor,
  rowCenters,
  walkOffAndHide,
  watchEnvironment,
  watchFreeCamera,
  watchStageGrid,
  type Lesson3DProps,
} from './lesson3d';

// Hop is this lesson's gait: its entrances and exits are long, and the
// waddle's speed-up over those distances reads as frantic (Colin, session 3).
// The meadow is its set: a kite flies there (kit → kite).
const props = withDefaults(defineProps<Lesson3DProps>(), {
  ...LESSON3D_DEFAULTS,
  gait: 'hop',
  environment: 'meadow',
});

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Longer than the SVG's 900 / 800: entrances start offstage at depth. */
const WORD_WALK_MS = 1600;
const CAMEO_WALK_MS = 1400;

const WORD_Z = 10;
/** e parks downstage right, well in front of the word, in the corner of the view. */
const PARK_Z = 100;
/** Space kept between the parked e and the right edge of the view (world units). */
const PARK_EDGE_MARGIN = 30;
/** The CVC word sits this far left of centre, clear of the e's corner. */
const WORD_OFFSET_X = -57;
const WINGS_Z = -150;
/** Camera height as a fraction of its distance (Stage3D default 0.16). */
const CAMERA_ELEVATION = 0.07;
/** Cameo pairs stand this far either side of e. */
const CAMEO_SIDE_GAP = 60;
const CAMEO_PAIR_GAP = 10;

// Hue scheme, as the SVG lesson (see its header)
let HUE_E = 0;
let HUE_VOWEL_SHORT = 0;
let HUE_VOWEL_LONG = 0;
let HUE_CONSONANT = 0;
let HUE_CAMEO_SH = 0;
let HUE_CAMEO_QU = 0;

function initColors(): void {
  HUE_E = Math.random() * 360;
  HUE_VOWEL_SHORT = (HUE_E + 200) % 360;
  HUE_VOWEL_LONG = (HUE_E + 30) % 360;
  HUE_CONSONANT = (HUE_E + 110) % 360;
  HUE_CAMEO_SH = (HUE_E + 150) % 360;
  HUE_CAMEO_QU = (HUE_E + 250) % 360;
}

type ActorId = SplitDigraphActorId;

const actors = new Map<ActorId, Actor3D>();
let stage: Stage3D | null = null;
/** The e's costume: a cap from the start, which becomes a cape once e has joined c-a-p. */
let costume: CapAndCape | null = null;
/** The vowel's matching cape, put on as the e's cap becomes its cape: the team, across the p. */
let vowelCape: CapAndCape | null = null;
/** The kite: springs from the e's hand into the sky as the e joins k-i-t. */
let kite: KiteProp | null = null;
/** Where the kite flies: upper left, clear of the e's balloon on the right. */
const KITE_AT = new THREE.Vector3(-175, 215, -160);
/** The e holds the string in its left hand, raised toward the kite (letter units). */
const KITE_HAND = { x: -8, y: 48 };
/** The kit (box) the e carries during kit: at its left side, and the hand on it. */
let kitBox: KitBox | null = null;
const KIT_BOX_AT = { x: -13, y: 77 };
const KIT_HAND = { x: -5, y: 70 };
/** Assembling: the box comes to the front centre and both hands reach in to it. */
const KIT_WORK_AT = { x: 32.5, y: 80 };
const KIT_WORK_HANDS = [
  { x: 27, y: 80 },
  { x: 38, y: 80 },
];
const accentHue = ref(0);
let currentWordIds: ActorId[] = [];

const STEPS: LessonStep<ActorId>[] = splitDigraphSteps({
  digraphCameo: () => choreographyDigraphCameo(),
  setupWord: (ids, vowel) => choreographySetupWord(ids, vowel),
  eArrives: (vowel) => choreographyEArrives(vowel),
  swapWord: (oldIds, newIds, vowel) => choreographySwapWord(oldIds, newIds, vowel),
});

const runner = useLessonRunner<ActorId>({
  steps: STEPS,
  actors,
  accentHue,
  emit: {
    lessonComplete: () => emit('lesson-complete'),
    practiceNow: () => emit('practice-now'),
  },
  // Tap / drag the letters to hear their sounds (after "cape", a and e are one
  // team); tap the kite for its word once it's been heard
  touchReplay: {
    pickWord: (x, y) => (stage && kite?.pick(stage.rayFromClient(x, y)) ? 'kite' : null),
  },
});

// The e uncovers its mouth as soon as it has something to say
watch(runner.currentStep, (step) => {
  if (mouthCovered && step?.kind === 'dialogue' && step.actorId === 'e') void uncoverMouth();
});

defineExpose({ steps: STEPS, advance: () => runner.handleAdvance() });
watchEnvironment(props, () => stage);
watchFreeCamera(props, () => stage);
watchStageGrid(props, () => stage);

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;
  stage = createLessonStage(el, props);
  // Widest moment: the cameo (s h · e · q u). A lower camera than the other
  // lessons: level enough to see both the e's eyes under its cap.
  stage.frame(260, { elevation: CAMERA_ELEVATION });

  const e = stage.addActor('e', 'e', {
    x: 0,
    z: 0,
    color: letterColor(HUE_E),
    hiddenParts: ['eyes', 'mouth', 'arms'],
    look: lessonLook(props),
  });
  if (e) {
    actors.set('e', e);
    costume = wearCapAndCape(e.letter, stage, capeColor());
  }
}

/** Opposite the e's hue, so it reads against the e and the word. The vowel's cape matches. */
const capeColor = () => oklch(0.56, 0.17, (HUE_E + 180) % 360);

function teardownStage(): void {
  kitBox?.dispose();
  kitBox = null;
  kite?.dispose();
  kite = null;
  costume?.dispose();
  costume = null;
  vowelCape?.dispose();
  vowelCape = null;
  stage?.destroy();
  stage = null;
  actors.clear();
  currentWordIds = [];
}

async function openingFlourish(): Promise<void> {
  const e = actors.get('e')?.letter;
  if (!e) return;
  await e.showPart('eyes', { duration: 320 });
  await Promise.all([e.showPart('mouth', { duration: 240 }), e.showPart('arms', { duration: 240 })]);
}

/**
 * Bring a letter on from the wings, creating it the first time. As the SVG
 * lesson: mouths start visible, eyes / arms pop in per scene.
 */
function ensureActor(id: ActorId, side: 'left' | 'right', stagger: number, hue: number): Actor3D | null {
  if (!stage) return null;
  const x = stage.offstageX(side, WINGS_Z) + (side === 'right' ? stagger : -stagger);
  const existing = actors.get(id);
  if (existing) {
    existing.setVisible(true);
    existing.moveTo(x, WINGS_Z);
    return existing;
  }
  const actor = stage.addActor(id, id, {
    x,
    z: WINGS_Z,
    color: letterColor(hue),
    hiddenParts: ['eyes', 'arms'],
    look: lessonLook(props),
  });
  if (actor) actors.set(id, actor);
  return actor;
}

const walk = (ms: number) => ({ gait: props.gait, durationMs: ms });
/**
 * Letters in a word all settle square to the camera, so the word stands in a
 * straight row (as the digraph lesson). A lone actor's default rest turns it
 * toward the audience point, which fans a word into an arc.
 */
const WORD_YAW = 0;
const wordWalk = (ms: number) => ({ ...walk(ms), endYaw: WORD_YAW });

// ---------------------------------------------------------------------------
// Cameo: sh + qu come on either side of e, wave, and leave
// ---------------------------------------------------------------------------

async function choreographyDigraphCameo(): Promise<void> {
  if (!stage) return;
  const e = actors.get('e');
  const s = ensureActor('s', 'left', 90, HUE_CAMEO_SH);
  const h = ensureActor('h', 'left', 0, HUE_CAMEO_SH);
  const q = ensureActor('q', 'right', 0, HUE_CAMEO_QU);
  const u = ensureActor('u', 'right', 90, HUE_CAMEO_QU);
  if (!e || !s || !h || !q || !u) return;

  for (const a of [s, h, q, u]) {
    void a.letter.showPart('eyes', { duration: 200 });
    void a.letter.showPart('arms', { duration: 200 });
  }

  const eX = e.position.x;
  const hX = eX - e.width / 2 - CAMEO_SIDE_GAP - h.width / 2;
  const sX = hX - h.width / 2 - CAMEO_PAIR_GAP - s.width / 2;
  const qX = eX + e.width / 2 + CAMEO_SIDE_GAP + q.width / 2;
  const uX = qX + q.width / 2 + CAMEO_PAIR_GAP + u.width / 2;
  const z = 5;

  const w = walk(CAMEO_WALK_MS);
  await Promise.all([s.walkTo(sX, z, w), h.walkTo(hX, z, w), q.walkTo(qX, z, w), u.walkTo(uX, z, w)]);
  await Promise.all([s, h, q, u].map((a) => a.letter.arms?.wave({ duration: 600 })));

  const offL = stage.offstageX('left', WINGS_Z);
  const offR = stage.offstageX('right', WINGS_Z);
  await Promise.all([
    walkOffAndHide(s, offL - 90, WINGS_Z, w),
    walkOffAndHide(h, offL, WINGS_Z, w),
    walkOffAndHide(q, offR, WINGS_Z, w),
    walkOffAndHide(u, offR + 90, WINGS_Z, w),
  ]);
}

// ---------------------------------------------------------------------------
// Word setup: CVC walks into a centred row; e parks downstage right
// ---------------------------------------------------------------------------

function rowTargets(ids: ActorId[], centerX = 0): Map<ActorId, number> {
  const xs = rowCenters(ids.map((id) => actors.get(id)?.width ?? 50), undefined, centerX);
  return new Map(ids.map((id, i) => [id, xs[i]]));
}

async function choreographySetupWord(wordIds: [ActorId, ActorId, ActorId], vowelId: ActorId): Promise<void> {
  wordIds.forEach((id, k) => {
    const hue = id === vowelId ? HUE_VOWEL_SHORT : HUE_CONSONANT;
    const actor = ensureActor(id, 'right', k * 90, hue);
    if (!actor) return;
    void actor.letter.showPart('eyes', { duration: 200 });
    void actor.letter.showPart('mouth', { duration: 200 });
    // Reset colour in case a reused actor was previously transformed
    void actor.letter.setColor(letterColor(hue), { duration: WORD_WALK_MS });
  });

  accentHue.value = HUE_VOWEL_SHORT;
  currentWordIds = [...wordIds];
  // kit: the e has a kite kit, a box, in hand (it becomes the kite when e joins)
  if (wordIds.join('') === 'kit') void carryKit();
  // The CVC word sits a little left of centre; the e parks in the
  // downstage-right corner, so the separation between them is plain
  const e = actors.get('e');
  const at = rowTargets(wordIds, WORD_OFFSET_X);

  const last = actors.get(wordIds[wordIds.length - 1]);
  const moves: Promise<void>[] = wordIds.map(
    (id) => actors.get(id)?.walkTo(at.get(id)!, WORD_Z, wordWalk(WORD_WALK_MS)) ?? Promise.resolve(),
  );
  // (e, parked alone, keeps its turn toward the audience until it joins the word)
  if (e && last && stage) {
    const parkX = stage.offstageX('right', PARK_Z, -(e.width / 2 + PARK_EDGE_MARGIN));
    costume?.flutter(WORD_WALK_MS + 600, 10);
    moves.push(e.walkTo(parkX, PARK_Z, walk(WORD_WALK_MS)));
  }
  await Promise.all(moves);
}

// ---------------------------------------------------------------------------
// e arrives: the row and e re-centre together; the vowel takes its long hue
// ---------------------------------------------------------------------------

async function choreographyEArrives(vowelId: ActorId): Promise<void> {
  const order: ActorId[] = [...currentWordIds, 'e'];
  const at = rowTargets(order);
  void actors.get(vowelId)?.letter.setColor(letterColor(HUE_VOWEL_LONG), { duration: WORD_WALK_MS });
  accentHue.value = HUE_VOWEL_LONG;
  const word = currentWordIds.join('');
  // kit → kite happens where the e is parked (the kit put together, arms
  // busy and box jittering, then the box pops and the kite springs from its
  // hand), and it walks over flying it
  if (word === 'kit') await assembleAndLaunchKite();
  costume?.flutter(WORD_WALK_MS + 600, 10);
  await Promise.all(
    order.map((id) => actors.get(id)?.walkTo(at.get(id)!, WORD_Z, wordWalk(WORD_WALK_MS)) ?? Promise.resolve()),
  );
  // cap → cape once the e is in its place, and its friend the vowel gets a
  // matching cape in the same beat
  if (word === 'cap') {
    const vowel = actors.get(vowelId);
    if (stage && vowel) vowelCape ??= wearCapAndCape(vowel.letter, stage, capeColor(), { cap: false });
    await Promise.all([costume?.capToCape(), vowelCape?.putOnCape()]);
  }
  // In the word, the e stays quiet: it covers its mouth
  await coverMouth();
}

// ---------------------------------------------------------------------------
// The e's hand over its mouth while it's in a word (it's the silent one).
// The right hand: the left may be holding the kite string. Uncovered as soon
// as the e speaks again.
// ---------------------------------------------------------------------------

/** The right arm's pose before covering (to put it back), while covered. */
let mouthCovered: { angle: number; length: number } | null = null;
/** The e's right shoulder is ~45 units from its mouth, past the arms' usual 30. */
const COVER_REACH = 50;

async function coverMouth(): Promise<void> {
  const e = actors.get('e')?.letter;
  const arm = e?.arms?.right;
  if (!e || !arm || mouthCovered) return;
  mouthCovered = { angle: arm.getCurrentAngle(), length: arm.getCurrentLength() };
  // The mouth goes as the hand gets there, so the hand seems to hide it
  await Promise.all([
    arm.setHandPosition(e.geometry.attachments.mouth, { duration: 380, ease: 'inOutSine' }, COVER_REACH),
    delay(220).then(() => e.hidePart('mouth', { duration: 140 })),
  ]);
}

async function uncoverMouth(): Promise<void> {
  const e = actors.get('e')?.letter;
  const arm = e?.arms?.right;
  const was = mouthCovered;
  mouthCovered = null;
  if (!e || !arm || !was) return;
  const sh = arm.getShoulderPosition();
  const rad = (was.angle * Math.PI) / 180;
  await Promise.all([
    arm.setHandPosition(
      { x: sh.x + was.length * Math.cos(rad), y: sh.y + was.length * Math.sin(rad) },
      { duration: 280, ease: 'outQuad' },
      COVER_REACH,
    ),
    e.showPart('mouth', { duration: 180 }),
  ]);
}

const KITE_HUE = () => (HUE_E + 90) % 360;

async function carryKit(): Promise<void> {
  const e = actors.get('e');
  if (!e) return;
  kitBox ??= holdKitBox(e.letter, KIT_BOX_AT, KITE_HUE());
  await Promise.all([kitBox.show(), e.letter.arms?.left.setHandPosition(KIT_HAND, { duration: 260 })]);
}

/** Both arms working fast, as if putting something together. */
async function busyHands(ms: number): Promise<void> {
  const arms = actors.get('e')?.letter.arms;
  if (!arms) return;
  const base = [arms.left.getCurrentAngle(), arms.right.getCurrentAngle()];
  const until = performance.now() + ms;
  let k = 0;
  while (performance.now() < until) {
    const swing = (i: number) => base[i] + (k % 2 ? 1 : -1) * (i ? -1 : 1) * (20 + Math.random() * 20);
    await Promise.all([
      arms.left.rotateTo(swing(0), { duration: 75 }),
      arms.right.rotateTo(swing(1), { duration: 75 }),
    ]);
    k++;
  }
  await Promise.all([arms.left.rotateTo(base[0], { duration: 90 }), arms.right.rotateTo(base[1], { duration: 90 })]);
}

/** The e's left hand, in world space (the kite string's end). */
function eHandWorld(): THREE.Vector3 | null {
  const e = actors.get('e');
  const arm = e?.letter.arms?.left;
  if (!e || !arm || !e.visible) return null;
  const hand = arm.getHandPosition();
  e.letter.content.updateWorldMatrix(true, false);
  return e.letter.content.localToWorld(new THREE.Vector3(hand.x, hand.y, e.letter.frontZ));
}

async function assembleAndLaunchKite(): Promise<void> {
  const e = actors.get('e');
  if (!stage || !e) return;
  // Hands together toward the middle first, the box with them, then busy
  const arms = e.letter.arms;
  await Promise.all([
    kitBox?.moveTo(KIT_WORK_AT, true, 320),
    arms?.left.setHandPosition(KIT_WORK_HANDS[0], { duration: 320 }),
    arms?.right.setHandPosition(KIT_WORK_HANDS[1], { duration: 320 }),
  ]);
  await Promise.all([busyHands(1000), kitBox?.shake(1000)]);
  kite ??= createKite(stage, KITE_HUE(), eHandWorld);
  // The box pops as the kite springs from the hand, which rises with it
  await Promise.all([
    kitBox?.pop(),
    e.letter.arms?.left.setHandPosition(KITE_HAND, { duration: 400 }),
    kite.launch(KITE_AT),
  ]);
  kitBox?.dispose();
  kitBox = null;
}

// ---------------------------------------------------------------------------
// Swap word: departing letters exit left; reused letters recycle via the
// right wing; then set up the new word
// ---------------------------------------------------------------------------

async function choreographySwapWord(
  oldIds: ActorId[],
  newIds: [ActorId, ActorId, ActorId],
  newVowelId: ActorId,
): Promise<void> {
  if (!stage) return;
  const reused = new Set<ActorId>(newIds);
  // Reused letters (p in cap→pin) jump to the wings first, so they don't
  // linger in place while the others leave (as the SVG lesson).
  for (const id of oldIds) {
    if (reused.has(id)) actors.get(id)?.moveTo(stage.offstageX('right', WINGS_Z), WINGS_Z);
  }
  const offL = stage.offstageX('left', WINGS_Z);
  vowelCape?.flutter(WORD_WALK_MS + 600, 10);
  await Promise.all(
    oldIds
      .filter((id) => !reused.has(id))
      .map((id, k) => {
        const a = actors.get(id);
        return a ? walkOffAndHide(a, offL - k * 90, WINGS_Z, walk(WORD_WALK_MS)) : undefined;
      }),
  );
  // The vowel's cape left with it: stop its sway
  vowelCape?.dispose();
  vowelCape = null;
  await choreographySetupWord(newIds, newVowelId);
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
  accentHue.value = HUE_E;
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
