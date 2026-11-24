<template>
  <LessonShell
    :runner="runner"
    @practice-now="$emit('practice-now')"
    @back-to-menu="$emit('back-to-menu')"
  />
</template>

<script setup lang="ts">
/**
 * FinalOpenVowelsLesson — a vowel at the very end of a word makes its
 * changed sound all by itself, no sneaky e needed.
 *
 * Direct sequel to SplitDigraphLesson: same host ('e'), inverse mechanic.
 * All three exemplars are on stage AT ONCE, one per depth row, so the lesson
 * is a comparison rather than a sequence:
 *
 *      trio 1 (e does it)      trio 2 (the vowel does it alone)
 *   i  hide   i_e → AY         hi   i → AY
 *   o  note   o_e → OW         no   o → OW
 *   e  here   e_e → IY         he   e → IY
 *
 * Trio 2 is trio 1 with the last TWO letters peeled off every word — the
 * consonant and the silent e. So the single choreographed event of the
 * lesson is six letters (three consonants, three e's) walking off together,
 * leaving three vowels stranded at three word-ends, still saying the same
 * sounds. That mass exit IS the argument.
 *
 * The three targets are exactly the lesson's three GPCs (i-AY-final,
 * o-OW-final, e-IY-final), and each is phonemically identical to the
 * split-digraph fact the child already holds. a and u are excluded: a-final
 * is schwa, u-final doesn't occur (decision log D9).
 *
 * No short-vowel rung. The contrast (hid/not) lives in the child's drilled
 * closed-syllable facts, not on stage — by the time this lesson unlocks,
 * split-digraph exposure is gated on all five members. Nothing on stage ever
 * says a short vowel, so the argument is carried by what LEAVES, not by a
 * sound (or a color) changing.
 *
 * FOUR e ACTORS. `here` is h-e-r-e: the index chunks it as e_e with letters
 * {1: speak, 3: silent-e}, so its vowel-e and its silent-e are different
 * characters, and it is the vowel-e that is still speaking in `he`.
 *
 * COLOR = WHO, NOT WHAT-ROLE. Four evenly-spaced hues: one per exemplar word,
 * one for the host. Tinting by role (vowel / consonant / silent-e) the way
 * SplitDigraphLesson does is right for one word on stage and reads as a
 * checkerboard across three, so each word is a solid color instead. The audio
 * button takes the active row's hue, so its color says which word speaks.
 *
 * LAYOUT. Rows sit at three z-depths. Stage scale is 0.6 + 0.004z, so each
 * row's letter height is set to APPARENT_H / scale(z) — all three rows then
 * render at the same on-screen size despite different depths. x is applied
 * unscaled with transform-origin bottom-center, so laying out a row means
 * converting desired screen edges back through that scale (see layoutRow).
 *
 * Curriculum constraints (see Storyboarding.md + agent/lessons-audit/b.1):
 *   - No letter-name idioms — and no letter labels in dialogue text at all:
 *     the parent reads lines aloud, so a written "o" would be spoken as a
 *     letter NAME. Staging carries the addressee instead.
 */

import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Stage } from '../letterpeople/scene/Stage';
import type { Actor } from '../letterpeople/scene/Stage';
import { oklch } from '../letterpeople/util/color';
import LessonShell from './LessonShell.vue';
import { useLessonRunner, type LessonStep } from './useLessonRunner';
import {
  finalOpenVowelsSteps,
  FINAL_OPEN_VOWELS_KEEP_COUNT,
  FINAL_OPEN_VOWELS_LETTER_FOR,
  FINAL_OPEN_VOWELS_ROW_WORDS,
  type FinalOpenVowelsActorId,
} from './finalOpenVowelsSteps';

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LETTER_LINE_WIDTH = 20;
const LETTER_BORDER_WIDTH = 3;
const LETTER_EYE_SIZE = 8;

const WORD_WALK_MS = 900;
const ROW_STAGGER_MS = 170;

/** Horizon pulled high so three depth rows have room to stack. */
const HORIZON_RATIO = 0.1;

/** Depth of each word row, back → front. */
const ROW_Z = [30, 60, 90] as const;
/** The host narrates from downstage left, in front of the whole stack. */
const HOST_Z = 96;
const HOST_Z_INIT = 70;
const HOST_X = 24;
/** The host is bigger than the exhibits — she's the one talking. */
const HOST_SIZE_FACTOR = 1.5;

/** On-screen letter height, uniform across rows. Set from stage height. */
let APPARENT_H = 96;

/** Stage projection: scale is 0.6 at the horizon, 1.0 at the front. */
function scaleForZ(z: number): number {
  return 0.6 + 0.004 * z;
}

function letterColor(hue: number): string {
  return oklch(0.75, 0.13, hue);
}

/**
 * Four evenly-spaced hues: one for the host, one per exemplar word.
 *
 * Colour identifies WHO, not what-role. An earlier scheme tinted by role
 * (vowel / consonant / silent-e) the way SplitDigraphLesson does, but with
 * three words on stage simultaneously that reads as a checkerboard. Here each
 * word is a solid colour, so the stack parses as three exhibits plus a
 * narrator — and the audio button takes the active row's hue, so its colour
 * says which word is speaking.
 */
let HUE_HOST = 0;
const ROW_HUES: number[] = [0, 0, 0];

function initColors(): void {
  const base = Math.random() * 360;
  HUE_HOST = base;
  for (let i = 0; i < ROW_HUES.length; i++) {
    ROW_HUES[i] = (base + 90 * (i + 1)) % 360;
  }
}

// ---------------------------------------------------------------------------
// Actors
//
// Ids are word-scoped, not letter-scoped: three words are on stage together,
// so `h` and `e` each appear more than once. 'e' alone is the host.
// ---------------------------------------------------------------------------

type ActorId = FinalOpenVowelsActorId;
const LETTER_FOR = FINAL_OPEN_VOWELS_LETTER_FOR;

/**
 * One word per depth row. Letter order matches the phonetic index's letter
 * positions in all six words: index 1 is the vowel, index 3 is the silent e.
 * Trio 2 is always `ids.slice(0, 2)` — every word peels its last two.
 */
interface Row {
  ids: [ActorId, ActorId, ActorId, ActorId];
  z: number;
}

const ROWS: Row[] = FINAL_OPEN_VOWELS_ROW_WORDS.map((ids, i) => ({ ids, z: ROW_Z[i] }));

const KEEP_COUNT = FINAL_OPEN_VOWELS_KEEP_COUNT;

const actors = new Map<ActorId, Actor>();
let stage: Stage | null = null;

const accentHue = ref(0);

const STEPS: LessonStep<ActorId>[] = finalOpenVowelsSteps({
  stageTrio1: () => choreographyStageTrio1(),
  peelToTrio2: () => choreographyPeelToTrio2(),
  onRowWord: (rowIndex) => {
    accentHue.value = ROW_HUES[rowIndex];
  },
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
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function stageWidth(): number {
  return runner.stageContainerRef.value?.clientWidth ?? 0;
}

function stageHeight(): number {
  return runner.stageContainerRef.value?.clientHeight ?? 0;
}

function getOffscreenRight(): number {
  return stageWidth() + 240;
}

/** Rows sit right of center, leaving the host her lane on the left. */
function rowCenterX(): number {
  return stageWidth() * 0.56;
}

function aspectOf(actor: Actor | undefined): number {
  if (!actor) return 0.6;
  const svg = actor.instance.svgElement as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.height > 0) return vb.width / vb.height;
  return 0.6;
}

/**
 * Lay a row out so its letters tile at APPARENT_H on screen.
 *
 * The wrapper is placed at `left = x` UNSCALED and then scaled about its
 * bottom-center, so its on-screen left edge is `x + w*(1 - s)/2`. Invert that
 * to turn a desired screen edge into the x we must actually set.
 */
function layoutRow(
  ids: readonly ActorId[],
  z: number,
): Map<ActorId, number> {
  const s = scaleForZ(z);
  const gap = APPARENT_H * 0.08;

  const screenWidths = ids.map((id) => APPARENT_H * aspectOf(actors.get(id)));
  const total =
    screenWidths.reduce((n, w) => n + w, 0) + gap * (ids.length - 1);

  let screenLeft = rowCenterX() - total / 2;
  const out = new Map<ActorId, number>();
  ids.forEach((id, i) => {
    const unscaledW = screenWidths[i] / s;
    out.set(id, screenLeft + (unscaledW * (s - 1)) / 2);
    screenLeft += screenWidths[i] + gap;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Stage setup
// ---------------------------------------------------------------------------

function setupStage(): void {
  const el = runner.stageContainerRef.value;
  if (!el) return;

  APPARENT_H = Math.max(56, Math.min(120, stageHeight() * 0.19));

  stage = new Stage(el, {
    backgroundColor: '#FFFEF7',
    horizonRatio: HORIZON_RATIO,
  });

  const host = stage.addActor('e', 'e', {
    x: 0,
    z: HOST_Z_INIT,
    height: (APPARENT_H * HOST_SIZE_FACTOR) / scaleForZ(HOST_Z),
    letterOptions: {
      lineWidth: LETTER_LINE_WIDTH,
      borderWidth: LETTER_BORDER_WIDTH,
      eyeSize: LETTER_EYE_SIZE,
      showEyes: false,
      showMouth: false,
      showArms: false,
      color: letterColor(HUE_HOST),
    },
  });
  if (host) actors.set('e', host);
}

function positionHostCentered(): void {
  const host = actors.get('e');
  if (!host) return;
  const w = (APPARENT_H * HOST_SIZE_FACTOR * aspectOf(host)) / scaleForZ(HOST_Z);
  host.move3D(Math.round((stageWidth() - w) / 2), HOST_Z_INIT, 0);
}

async function openingFlourish(): Promise<void> {
  const host = actors.get('e')?.instance;
  if (!host) return;
  await host.eyes.show({ duration: 320 });
  await Promise.all([
    host.mouth.show({ duration: 240 }),
    host.arms.show({ duration: 240 }),
  ]);
}

function teardownStage(): void {
  stage?.destroy();
  stage = null;
  actors.clear();
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Choreography 1 — the whole stack walks on.
//
// Each row is created at its own depth, with its letter height compensated so
// all three read at the same size. The host steps downstage left to narrate.
// ---------------------------------------------------------------------------

async function choreographyStageTrio1(): Promise<void> {
  if (!stage || !runner.stageContainerRef.value) return;

  const offRight = getOffscreenRight();

  ROWS.forEach((row, rowIndex) => {
    const height = APPARENT_H / scaleForZ(row.z);
    row.ids.forEach((id, i) => {
      const actor = stage!.addActor(id, LETTER_FOR[id], {
        x: offRight + i * 60,
        z: row.z,
        height,
        letterOptions: {
          lineWidth: LETTER_LINE_WIDTH,
          borderWidth: LETTER_BORDER_WIDTH,
          eyeSize: LETTER_EYE_SIZE,
          showEyes: false,
          showMouth: true,
          showArms: false,
          color: letterColor(ROW_HUES[rowIndex]),
        },
      });
      if (actor) actors.set(id, actor);
    });
  });

  const host = actors.get('e');
  const walks: Promise<void>[] = host
    ? [host.walkTo(HOST_X, HOST_Z, WORD_WALK_MS)]
    : [];

  ROWS.forEach((row, rowIndex) => {
    const positions = layoutRow(row.ids, row.z);
    for (const id of row.ids) {
      const actor = actors.get(id);
      if (!actor) continue;
      void actor.instance.eyes.show({ duration: 200 });
      walks.push(
        delay(rowIndex * ROW_STAGGER_MS).then(() =>
          actor.walkTo(positions.get(id)!, row.z, WORD_WALK_MS),
        ),
      );
    }
  });

  await Promise.all(walks);
}

// ---------------------------------------------------------------------------
// Choreography 2 — the peel. THE money shot.
//
// Every word sheds its last two letters at the same moment: three consonants
// and the whole column of e's walk off right together. What's left is three
// vowels stranded at three word-ends — same letters, same hue, same sounds,
// and no e anywhere on stage.
// ---------------------------------------------------------------------------

async function choreographyPeelToTrio2(): Promise<void> {
  const offRight = getOffscreenRight();
  const moves: Promise<void>[] = [];

  for (const row of ROWS) {
    const leaving = row.ids.slice(KEEP_COUNT);
    const staying = row.ids.slice(0, KEEP_COUNT);

    for (const id of leaving) {
      const actor = actors.get(id);
      if (!actor) continue;
      moves.push(
        actor.walkTo(offRight, row.z, WORD_WALK_MS).then(() => {
          actor.wrapper.style.display = 'none';
        }),
      );
    }

    const positions = layoutRow(staying, row.z);
    for (const id of staying) {
      const actor = actors.get(id);
      if (!actor) continue;
      moves.push(actor.walkTo(positions.get(id)!, row.z, WORD_WALK_MS));
    }
  }

  await Promise.all(moves);
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
  accentHue.value = HUE_HOST;
  setupStage();
  positionHostCentered();

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
