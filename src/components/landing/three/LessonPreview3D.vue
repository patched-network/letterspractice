<template>
  <!-- Stage3D takes over its container's position, so it gets an inner box
       and the walkthrough positions this one. -->
  <div class="lesson-preview3d">
    <div ref="container" class="lesson-preview3d__stage" />
  </div>
</template>

<script setup lang="ts">
/**
 * LessonPreview3D — the walkthrough's lesson beat on the three.js stage: the
 * opening picture of the Hello World lesson (HelloWorldLesson3D: the room,
 * the two letters standing apart, parts popping in), with the real speech
 * balloons. Not the lesson itself: no runner or shell; lines come in on
 * scroll (`reveal`). No wave (the lesson's opens with one): it held the
 * lines back long enough to miss them on a scroll-through.
 *
 * Built at idle, ahead of its beat, and kept: entering the beat only starts
 * animations, so a fast scroll past it costs nothing. Each entry replays the
 * opening (parts hide again on the way out). Renders on demand, so while
 * hidden it draws nothing.
 *
 * Emits `ready` once the stage stands, `failed` if WebGL refuses (3D is then
 * marked failed and the walkthrough keeps its 2D scene).
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Actor3D, Stage3D } from '../../../letterpeople/three/stage3d';
import type { FacePart } from '../../../letterpeople/three/letterMesh';
import {
  LESSON3D_DEFAULTS,
  createLessonStage,
  lessonLook,
  letterColor,
  rowCenters,
  WORD_GAP,
} from '../../../lessons/three/lesson3d';

const props = defineProps<{
  /** Left to right: each letter and its line */
  cast: { char: string; line: string }[];
  /** The lesson beat is showing */
  active: boolean;
  /** How many of the lines are up (scroll-driven) */
  reveal: number;
}>();

const emit = defineEmits<{ (e: 'ready'): void; (e: 'failed'): void }>();

/** The lessons' room; 'plain' is the quiet alternative for a screen this small. */
const ENVIRONMENT = LESSON3D_DEFAULTS.environment;
/** Eyes follow the pointer over the phone. */
const TRACK_POINTER = true;
/** HelloWorldLesson3D's opening layout: standing apart, set back. */
const SPREAD = 55;
const START_Z = 12 - SPREAD;
const HUE_OFFSET = 25;
/** Balloon box caps, px: uncapped, the text grows to fill the phone. */
const BALLOON = { side: 'above' as const, maxWidth: 160, maxHeight: 84 };
const PARTS: FacePart[] = ['eyes', 'mouth', 'arms'];
/** The walkthrough's fade-out; parts hide for the replay once it's done. */
const FADE_MS = 450;

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const container = ref<HTMLElement | null>(null);
let stage: Stage3D | null = null;
let actors: Actor3D[] = [];
let stopIdles: (() => void)[] = [];
/** Which actors' lines are up, so a new line doesn't re-say the old ones */
const speaking = new Set<number>();
const hasIdle = typeof window !== 'undefined' && 'requestIdleCallback' in window;
let idleHandle = 0;
/** Bumped on every entry and exit, so a stale opening stops where it is. */
let run = 0;
/** The opening has finished: lines may show. */
const assembled = ref(false);

function build(): void {
  const el = container.value;
  if (!el) return;
  try {
    stage = createLessonStage(el, {
      ...LESSON3D_DEFAULTS,
      environment: ENVIRONMENT,
      trackPointer: TRACK_POINTER && !reducedMotion,
    });
  } catch {
    emit('failed');
    return;
  }
  const centerHue = Math.random() * 360;
  const look = lessonLook(LESSON3D_DEFAULTS);
  const n = props.cast.length;
  actors = props.cast.flatMap(({ char }, i) => {
    const hue = centerHue + (n > 1 ? HUE_OFFSET * ((2 * i) / (n - 1) - 1) : 0);
    const actor = stage!.addActor(`${char}${i}`, char, {
      color: letterColor(hue),
      hiddenParts: reducedMotion ? [] : [...PARTS],
      look,
    });
    if (actor) actor.balloonPlacement = { ...BALLOON };
    return actor ? [actor] : [];
  });
  const together = rowCenters(actors.map((a) => a.width));
  const half = (actors.reduce((s, a) => s + a.width, 0) + WORD_GAP * (n - 1)) / 2;
  actors.forEach((a, i) => {
    const out = n > 1 ? SPREAD * ((2 * i) / (n - 1) - 1) : 0;
    a.moveTo(together[i] + out, START_Z);
  });
  stage.frame(half + SPREAD + 20);
  emit('ready');
  if (props.active) void enter();
}

async function enter(): Promise<void> {
  const mine = ++run;
  if (reducedMotion) {
    assembled.value = true;
    return;
  }
  stopIdles = actors.map((a) => a.startIdle());
  // Back in before the last exit's parts went: start the opening from bare
  hideParts();
  const letters = actors.map((a) => a.letter);
  await Promise.all(letters.map((l) => l.showPart('eyes', { duration: 320 })));
  if (mine !== run) return;
  await Promise.all(
    letters.flatMap((l) => [l.showPart('mouth', { duration: 240 }), l.showPart('arms', { duration: 240 })]),
  );
  if (mine === run) assembled.value = true;
}

function exit(): void {
  const mine = ++run;
  assembled.value = false;
  stopIdles.forEach((stop) => stop());
  stopIdles = [];
  speaking.clear();
  for (const a of actors) void a.silence();
  if (!reducedMotion) setTimeout(() => {
    if (mine === run) hideParts();
  }, FADE_MS);
}

function hideParts(): void {
  if (!stage) return;
  for (const a of actors) for (const part of PARTS) void a.letter.hidePart(part, { duration: 0 });
}

watch(
  () => props.active,
  (on) => {
    if (!stage) return;
    if (on) void enter();
    else exit();
  },
);

/** Lines up to `reveal`, left to right, once the letters are assembled. */
watch(
  [() => props.reveal, assembled],
  ([reveal, ready]) => {
    actors.forEach((a, i) => {
      const up = ready && i < reveal;
      if (up === speaking.has(i)) return;
      if (up) {
        speaking.add(i);
        void a.say(props.cast[i].line);
      } else {
        speaking.delete(i);
        void a.silence();
      }
    });
  },
);

onMounted(() => {
  // A second idle slot: the chunk loaded in one; the stage builds in its own
  idleHandle = hasIdle ? window.requestIdleCallback(build, { timeout: 3000 }) : window.setTimeout(build, 200);
});

onBeforeUnmount(() => {
  if (hasIdle) window.cancelIdleCallback(idleHandle);
  else window.clearTimeout(idleHandle);
  exit();
  stage?.destroy();
  stage = null;
  actors = [];
});
</script>

<style scoped>
.lesson-preview3d__stage {
  width: 100%;
  height: 100%;
}
</style>
