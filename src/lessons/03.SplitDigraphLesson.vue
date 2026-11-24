<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * SplitDigraphLesson — silent E and the magic-e pattern.
 *
 * 'e' is the persistent host. CVC→CVCe pairs rotate through
 * (splitDigraphSteps.ts):
 *   cap → cape  (a_e)
 *   kit → kite  (i_e)
 *
 * Pedagogical hook builds on DigraphLesson: silent-e is framed as
 * "another kind of letter team," but a sneaky one — e tucks at the end
 * and the OTHER letter changes sound (rather than the pair making a new
 * shared sound).
 *
 * Curriculum constraint: don't lean on letter-name idioms ("a says its
 * name") — names aren't taught in this app. Reveals describe the sound
 * change directly.
 */

import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Stage } from '../letterpeople/scene/Stage';
import type { Actor } from '../letterpeople/scene/Stage';
import { oklch } from '../letterpeople/util/color';
import LessonShell from './LessonShell.vue';
import { useLessonRunner, type LessonStep } from './useLessonRunner';
import { splitDigraphSteps, type SplitDigraphActorId } from './splitDigraphSteps';

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

const actorDepthInit = 70;
const WORD_WALK_MS = 900;
const CAMEO_WALK_MS = 800;

function letterColor(hue: number): string {
  return oklch(0.75, 0.13, hue);
}

// Hue scheme (initialized at mount):
//   E_HUE       → e the host
//   VOWEL_SHORT → vowel before e arrives (cool, distant from e)
//   VOWEL_LONG  → vowel after e arrives (warmer, pulled toward E_HUE)
//   CONSONANT   → flanking consonants
//   CAMEO_*     → sh, qu cameo pairs
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

// ---------------------------------------------------------------------------
// Actors + runner
// ---------------------------------------------------------------------------

type ActorId = SplitDigraphActorId;

const actors = new Map<ActorId, Actor>();
let stage: Stage | null = null;

const accentHue = ref(0);

let currentWordIds: ActorId[] = [];

const STEPS: LessonStep<ActorId>[] = splitDigraphSteps({
  digraphCameo: () => choreographyDigraphCameo(),
  setupWord: (ids, vowel) => choreographySetupWord(ids, vowel),
  eArrives: (vowel) => choreographyEArrives(vowel),
  swapWord: (oldIds, newIds, vowel) => choreographySwapWord(oldIds, newIds, vowel),
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
  // Tap / drag the letters to hear their sounds (after "cape", a and e are one team)
  touchReplay: true,
});

// ---------------------------------------------------------------------------
// Stage setup
// ---------------------------------------------------------------------------

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

  const e = stage.addActor('e', 'e', {
    x: 0,
    z: actorDepthInit,
    height: LETTER_HEIGHT,
    letterOptions: { ...baseLetterOptions, color: letterColor(HUE_E) },
  });
  if (e) actors.set('e', e);
}

async function openingFlourish(): Promise<void> {
  const e = actors.get('e')?.instance;
  if (!e) return;
  await e.eyes.show({ duration: 320 });
  await Promise.all([
    e.mouth.show({ duration: 240 }),
    e.arms.show({ duration: 240 }),
  ]);
}

function teardownStage(): void {
  stage?.destroy();
  stage = null;
  actors.clear();
  currentWordIds = [];
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function getOffscreenRight(): number {
  return (runner.stageContainerRef.value?.clientWidth ?? 0) + 200;
}

function measureLetterWidth(actor: Actor): number {
  const svg = actor.instance.svgElement as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.height > 0) return LETTER_HEIGHT * (vb.width / vb.height);
  return svg.clientWidth || Math.round(LETTER_HEIGHT * 0.6);
}

function positionECentered(): void {
  const stageEl = runner.stageContainerRef.value;
  const e = actors.get('e');
  if (!stageEl || !e) return;
  const w = measureLetterWidth(e);
  const cx = Math.round((stageEl.clientWidth - w) / 2);
  e.move3D(cx, actorDepthInit, 0);
}

function computeRowPositions(letterIds: ActorId[]): Map<ActorId, number> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl) return new Map();
  const containerWidth = stageEl.clientWidth;
  const gap = Math.round(LETTER_HEIGHT * 0.06);

  const widths: number[] = [];
  let totalWidth = 0;
  for (const id of letterIds) {
    const actor = actors.get(id);
    const w = actor
      ? measureLetterWidth(actor)
      : Math.round(LETTER_HEIGHT * 0.6);
    widths.push(w);
    totalWidth += w;
  }
  totalWidth += gap * (letterIds.length - 1);

  let x = Math.round((containerWidth - totalWidth) / 2);
  const positions = new Map<ActorId, number>();
  for (let i = 0; i < letterIds.length; i++) {
    positions.set(letterIds[i], x);
    x += widths[i] + gap;
  }
  return positions;
}

function ensureActor(id: ActorId, x: number, hue: number): Actor | undefined {
  if (!stage) return undefined;
  const existing = actors.get(id);
  if (existing) {
    existing.wrapper.style.display = '';
    existing.move3D(x, actorDepthInit, 0);
    return existing;
  }
  const actor = stage.addActor(id, id, {
    x,
    z: actorDepthInit,
    height: LETTER_HEIGHT,
    letterOptions: {
      lineWidth: LETTER_LINE_WIDTH,
      borderWidth: LETTER_BORDER_WIDTH,
      eyeSize: LETTER_EYE_SIZE,
      showEyes: false,
      showMouth: true,
      showArms: false,
      color: letterColor(hue),
    },
  });
  if (actor) actors.set(id, actor);
  return actor ?? undefined;
}

// ---------------------------------------------------------------------------
// Cameo: sh + qu pop in, wave, exit (concurrent with opening dialogue)
// ---------------------------------------------------------------------------

async function choreographyDigraphCameo(): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl || !stage) return;

  const containerWidth = stageEl.clientWidth;
  const offRight = containerWidth + 200;
  const offLeft = -300;

  const eActor = actors.get('e');
  const eW = eActor ? measureLetterWidth(eActor) : 0;
  const eX = eActor ? eActor.x : containerWidth / 2;

  const s = ensureActor('s', offLeft - 200, HUE_CAMEO_SH);
  const h = ensureActor('h', offLeft - 100, HUE_CAMEO_SH);
  const q = ensureActor('q', offRight + 100, HUE_CAMEO_QU);
  const u = ensureActor('u', offRight + 200, HUE_CAMEO_QU);

  for (const actor of [s, h, q, u]) {
    if (!actor) continue;
    void actor.instance.eyes.show({ duration: 200 });
    void actor.instance.arms.show({ duration: 200 });
  }

  const gap = Math.round(LETTER_HEIGHT * 0.1);
  const sideGap = 100;
  const sW = s ? measureLetterWidth(s) : 0;
  const hW = h ? measureLetterWidth(h) : 0;
  const qW = q ? measureLetterWidth(q) : 0;

  const hTargetX = Math.round(eX - sideGap - hW);
  const sTargetX = hTargetX - gap - sW;
  const qTargetX = Math.round(eX + eW + sideGap);
  const uTargetX = qTargetX + qW + gap;

  await Promise.all([
    s ? s.walkTo(sTargetX, actorDepthInit + 5, CAMEO_WALK_MS) : Promise.resolve(),
    h ? h.walkTo(hTargetX, actorDepthInit + 5, CAMEO_WALK_MS) : Promise.resolve(),
    q ? q.walkTo(qTargetX, actorDepthInit + 5, CAMEO_WALK_MS) : Promise.resolve(),
    u ? u.walkTo(uTargetX, actorDepthInit + 5, CAMEO_WALK_MS) : Promise.resolve(),
  ]);

  await Promise.all([
    s?.instance.arms.wave({ duration: 600 }) ?? Promise.resolve(),
    h?.instance.arms.wave({ duration: 600 }) ?? Promise.resolve(),
    q?.instance.arms.wave({ duration: 600 }) ?? Promise.resolve(),
    u?.instance.arms.wave({ duration: 600 }) ?? Promise.resolve(),
  ]);

  await Promise.all([
    s
      ? s.walkTo(offLeft, actorDepthInit, CAMEO_WALK_MS).then(() => {
          s.wrapper.style.display = 'none';
        })
      : Promise.resolve(),
    h
      ? h.walkTo(offLeft, actorDepthInit, CAMEO_WALK_MS).then(() => {
          h.wrapper.style.display = 'none';
        })
      : Promise.resolve(),
    q
      ? q.walkTo(offRight, actorDepthInit, CAMEO_WALK_MS).then(() => {
          q.wrapper.style.display = 'none';
        })
      : Promise.resolve(),
    u
      ? u.walkTo(offRight, actorDepthInit, CAMEO_WALK_MS).then(() => {
          u.wrapper.style.display = 'none';
        })
      : Promise.resolve(),
  ]);
}

// ---------------------------------------------------------------------------
// Word setup: walk CVC into centered row; e slides to right side
// ---------------------------------------------------------------------------

async function choreographySetupWord(
  wordIds: [ActorId, ActorId, ActorId],
  vowelId: ActorId,
): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl) return;

  const offRight = getOffscreenRight();
  let stagger = 0;
  for (const id of wordIds) {
    const hue = id === vowelId ? HUE_VOWEL_SHORT : HUE_CONSONANT;
    ensureActor(id, offRight + stagger, hue);
    stagger += 80;
  }

  for (const id of wordIds) {
    const actor = actors.get(id);
    if (!actor) continue;
    void actor.instance.eyes.show({ duration: 200 });
    void actor.instance.mouth.show({ duration: 200 });
    // Reset color in case a reused actor was previously transformed
    void actor.instance.updateAppearance(
      {
        color: letterColor(
          id === vowelId ? HUE_VOWEL_SHORT : HUE_CONSONANT,
        ),
      },
      { duration: WORD_WALK_MS },
    );
  }

  accentHue.value = HUE_VOWEL_SHORT;
  currentWordIds = [...wordIds];

  const positions = computeRowPositions(wordIds);

  // Park 'e' just outside the word's right edge (still on stage, out of the way)
  const e = actors.get('e');
  let ePromise: Promise<void> = Promise.resolve();
  if (e) {
    const lastId = wordIds[wordIds.length - 1];
    const lastActor = actors.get(lastId);
    const lastX = positions.get(lastId) ?? 0;
    const lastW = lastActor ? measureLetterWidth(lastActor) : 0;
    const eW = measureLetterWidth(e);
    const sideX = Math.min(stageEl.clientWidth - eW - 20, lastX + lastW + 80);
    ePromise = e.walkTo(sideX, actorDepthInit + 25, WORD_WALK_MS);
  }

  await Promise.all([
    ePromise,
    ...wordIds.map((id) => {
      const actor = actors.get(id);
      if (!actor) return Promise.resolve();
      return actor.walkTo(
        positions.get(id)!,
        actorDepthInit + 10,
        WORD_WALK_MS,
      );
    }),
  ]);
}

// ---------------------------------------------------------------------------
// E arrives: row + e re-center together; vowel transforms to long color
// ---------------------------------------------------------------------------

async function choreographyEArrives(vowelId: ActorId): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl) return;

  const fullOrder: ActorId[] = [...currentWordIds, 'e'];
  const positions = computeRowPositions(fullOrder);

  const vowelActor = actors.get(vowelId);
  if (vowelActor) {
    void vowelActor.instance.updateAppearance(
      { color: letterColor(HUE_VOWEL_LONG) },
      { duration: WORD_WALK_MS },
    );
  }

  accentHue.value = HUE_VOWEL_LONG;

  await Promise.all(
    fullOrder.map((id) => {
      const actor = actors.get(id);
      if (!actor) return Promise.resolve();
      return actor.walkTo(
        positions.get(id)!,
        actorDepthInit + 10,
        WORD_WALK_MS,
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Swap word: walk old letters off-left; cycle reused letters to off-right;
// then setup the new word
// ---------------------------------------------------------------------------

async function choreographySwapWord(
  oldIds: ActorId[],
  newIds: [ActorId, ActorId, ActorId],
  newVowelId: ActorId,
): Promise<void> {
  const stageEl = runner.stageContainerRef.value;
  if (!stageEl) return;

  const offLeft = -300;
  const newSet = new Set<ActorId>(newIds);

  // Reused letters (e.g. 'p' in cap→pin): snap off-screen-right *first*, before
  // the departing letters' walk-off is awaited. Otherwise the reused letter
  // visibly lingers in its old position for the full WORD_WALK_MS while the
  // others leave, then teleports — reads as "p sticks around." setupWord then
  // walks it back in fresh.
  const offRight = getOffscreenRight();
  for (const id of oldIds) {
    if (!newSet.has(id)) continue;
    const actor = actors.get(id);
    if (!actor) continue;
    actor.move3D(offRight, actorDepthInit, 0);
  }

  // Letters not reused: walk off left and hide
  await Promise.all(
    oldIds.map((id) => {
      if (newSet.has(id)) return Promise.resolve();
      const actor = actors.get(id);
      if (!actor) return Promise.resolve();
      return actor.walkTo(offLeft, actorDepthInit, WORD_WALK_MS).then(() => {
        actor.wrapper.style.display = 'none';
      });
    }),
  );

  await choreographySetupWord(newIds, newVowelId);
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function handleWindowResize(): void {
  if (runner.hasAudioButton.value) runner.recomputeAudioButton(true);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  await nextTick();
  initColors();
  accentHue.value = HUE_E;
  setupStage();
  positionECentered();

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
