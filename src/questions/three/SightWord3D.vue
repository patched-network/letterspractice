<template>
  <!-- A sight-word intro's word as 3D LetterPeople, standing on (or over)
       something, plus an onlooker off to the side when every letter
       misbehaves. Visuals only: the view (SightWordIntroView) plays the audio
       and drives the steps. Transparent stage: whatever is behind shows
       through. -->
  <div ref="host" class="sight-word-3d" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { Stage3D, type Actor3D } from '../../letterpeople/three/stage3d';
import { contrite, frownAt, makeUp as letGo, wait } from '../../letterpeople/three/reactions';
import { rowCenters } from '../../lessons/three/lesson3d';
import { DESCENDER_DEPTH, DESCENDER_LETTERS } from '../../letterpeople/letters/registry';
import { mark3DFailed } from '../../services/letters3d';
import type { LetterEffect } from '../../composables/useTimedWordPlayback';
import type { SightWordStaging, SightWordStep } from '../sightWordIntroPlan';

const props = withDefaults(
  defineProps<{
    word: string;
    /** One per letter. */
    colors: string[];
    /** Someone off to the side to react (the word has nobody left to). */
    onlooker?: boolean;
    staging?: SightWordStaging;
  }>(),
  { onlooker: false, staging: 'floor' },
);

const emit = defineEmits<{
  /** The 3D stage couldn't start (WebGL refused it). */
  (e: 'unavailable'): void;
  /** The word has arrived. */
  (e: 'arrived'): void;
}>();

/** Gap between the word's letters (as GpcLetter3D's team). */
const LETTER_GAP = 10;
/** Room above the cap line for raised arms and brows. */
const HEADROOM = 18;
/** Surfaces: margin round the word, and how deep (front to back). */
const SURFACE_PAD_X = 30;
const SURFACE_DEPTH = 90;
const SURFACE_RADIUS = 14;
const SURFACE_HEIGHT: Partial<Record<SightWordStaging, number>> = { platform: 18, mat: 3 };
/** The surface's outline (as the letters' cookie outline). */
const OUTLINE = 2.5;
const FLOAT_HEIGHT = 26;
const FLOAT_BOB = 5;
/** The upright card ('card' staging). */
const CARD_PAD_X = 34;
const CARD_PAD_BOTTOM = 16;
const CARD_Z = -30;
const CARD_COLOR = '#fbf7ee';
const CARD_EDGE = '#e2dac8';
/** The onlooker: smaller than the word, clear of it to the right, downstage. */
const ONLOOKER_SCALE = 0.8;
const ONLOOKER_GAP = 36;
const ONLOOKER_Z = 40;
/** The step marker (the SVG stepper's underline): below the letters, in front. */
const MARK_DROP = 12;
const MARK_HEIGHT = 7;
const MARK_MS = 250;
/** Room either side for arms, world units. */
const ARM_REACH = 30;
/** Air around the content's vertical extent. */
const FRAME_AIR = 1.12;
const TAN_HALF_FOV = Math.tan((15 * Math.PI) / 180); // Stage3D camera: 30° fov
/**
 * The word is in place from the start, so it slides in with the card; its
 * entrance waits until the card has (StudySession's card-slide enter: 100ms
 * delay + 250ms).
 */
const ENTRANCE_DELAY_MS = 450;
/** No surface: faces pop in along the word (as GpcLetter3D's greeting, less the wave). */
const GREET_STAGGER_MS = 150;
/**
 * Onto a surface, the word starts backstage: on the floor behind it, this
 * far behind its outline (letter centres), and hops up.
 */
const BACKSTAGE_GAP = 16;
const CLIMB_STAGGER_MS = 110;
/** The hop up peaks this far above the surface: under the walker's default, so a tall letter's head stays in frame. */
const CLIMB_CLEARANCE = 12;
/** The face the letters settle into (as GpcLetter3D). */
const SMILE = { openness: 0.2, mood: 0.88 };
/** Untyped letters wait pale: their colour this far drained to white (1: pure white). */
const UNTYPED_DRAIN = 0.85;
/**
 * The letter to type next stands ready: coloured in, raised, grown a touch.
 * Lift and hop are translateY and the grow is scaleX/Y, off `scale`: the
 * hush and contrite tween that, and a tween on the same channel replaces theirs.
 */
const READY_LIFT = 8;
const READY_SCALE = 1.06;
const READY_MS = 220;
/** Typed, it hops this much higher, then lands. */
const HOP_LIFT = 10;
const HOP_MS = 130;

const host = ref<HTMLElement | null>(null);
let stage: Stage3D | null = null;
const actors: Actor3D[] = [];
let onlooker: Actor3D | null = null;
const cleanups: (() => void)[] = [];
let disposed = false;
/** Where the letters stand, and the front of whatever they stand on. */
let baseY = 0;
let frontZ = 12;
/** The surface's materials (see surfaceAsFloor). */
let surfaceMaterials: THREE.Material[] = [];

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function track(s: Stage3D, ...objects: THREE.Object3D[]): void {
  s.scene.add(...objects);
  cleanups.push(() => {
    s.scene.remove(...objects);
    for (const o of objects) {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
  });
}

/** A slab on the floor, `halfWidth` either side of x = 0, with an outline. */
function addSurface(s: Stage3D, halfWidth: number, height: number, color: string) {
  const slab = (w: number, d: number, h: number, r: number) => {
    const g = new THREE.ExtrudeGeometry(roundedRect(w, d, r), { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // extruded up from the floor, lying in x/z
    return g;
  };
  const w = 2 * halfWidth;
  const top = new THREE.Mesh(
    slab(w, SURFACE_DEPTH, height, SURFACE_RADIUS),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  // Inverted hull: a little bigger, back faces only, dark
  const hull = new THREE.Mesh(
    slab(w + 2 * OUTLINE, SURFACE_DEPTH + 2 * OUTLINE, height + OUTLINE, SURFACE_RADIUS + OUTLINE),
    new THREE.MeshBasicMaterial({ color: '#1b1b1b', side: THREE.BackSide }),
  );
  // Before the letters, hull first: once it stops writing depth
  // (surfaceAsFloor), draw order is what layers it
  hull.renderOrder = -2;
  top.renderOrder = -1;
  surfaceMaterials = [hull.material, top.material];
  track(s, hull, top);
}

/**
 * The word is up: from here the surface is a raised floor. Like the stage
 * floor it stops writing depth, so a descender's tail sinks through it
 * rather than vanishing into it (you's y would read as a v). Until then it
 * hides the letters' feet backstage.
 */
function surfaceAsFloor(): void {
  for (const m of surfaceMaterials) m.depthWrite = false;
  stage?.invalidate();
}

/** The upright card behind the word, with a darker edge peeking out below it. */
function addCard(s: Stage3D, halfWidth: number, bottom: number, top: number) {
  const geometry = () => new THREE.ShapeGeometry(roundedRect(2 * halfWidth, top - bottom, 18));
  const face = new THREE.Mesh(geometry(), new THREE.MeshBasicMaterial({ color: CARD_COLOR, toneMapped: false }));
  const edge = new THREE.Mesh(geometry(), new THREE.MeshBasicMaterial({ color: CARD_EDGE, toneMapped: false }));
  const cy = (top + bottom) / 2;
  face.position.set(0, cy, CARD_Z);
  edge.position.set(0, cy - 5, CARD_Z - 1);
  track(s, edge, face);
}

/** The surface's colour: the first letter's, pale (as the intros' raised cards). */
function surfaceColor(): string {
  return '#' + new THREE.Color(props.colors[0] ?? '#cccccc').lerp(new THREE.Color('#ffffff'), 0.62).getHexString();
}

/** Tween over `ms` on the stage's ticker; resolves when done. */
function tween(ms: number, step: (k: number) => void): Promise<void> {
  const s = stage;
  if (!s || ms <= 0) {
    step(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let t0: number | null = null;
    const stop = s.addTicker((t) => {
      t0 ??= t;
      const k = Math.min(1, ((t - t0) * 1000) / ms);
      step(k);
      if (k >= 1) {
        stop();
        resolve();
      }
    });
  });
}
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

onMounted(async () => {
  const el = host.value;
  if (!el) return;
  try {
    stage = new Stage3D(el, { transparent: true, trackPointer: !reducedMotion });
  } catch (err) {
    // WebGL refused the stage: the view steps the word in SVG instead
    mark3DFailed(err);
    emit('unavailable');
    return;
  }
  const s = stage;
  const staging = props.staging;
  const surface = SURFACE_HEIGHT[staging];
  baseY = surface ?? (staging === 'float' ? FLOAT_HEIGHT : 0);

  const chars = [...props.word];
  const greeting = surface === undefined && !reducedMotion;
  chars.forEach((c, i) => {
    const actor = s.addActor(`l${i}`, c, {
      color: props.colors[i % props.colors.length],
      floorY: surface ?? 0,
      // No arms: the reactions are faces only
      hiddenParts: greeting ? ['arms', 'eyes', 'mouth'] : ['arms'],
      look: { lineWidth: 20 },
    });
    if (!actor) return;
    // Pale until typed (see progress); the brows keep a hint of the colour
    void actor.letter.setColor(untypedColor(i));
    actors.push(actor);
  });
  progressStates = actors.map(() => 'untyped');
  const centers = rowCenters(
    actors.map((a) => a.width),
    LETTER_GAP,
  );
  const halfWord = actors.length ? centers[centers.length - 1] + actors[actors.length - 1].width / 2 : 50;

  let top = baseY + 100 + HEADROOM;
  let bottom = baseY - MARK_DROP - MARK_HEIGHT;
  if (chars.some((c) => DESCENDER_LETTERS.has(c))) bottom = Math.min(bottom, baseY - DESCENDER_DEPTH);
  let right: number;
  if (surface !== undefined) {
    const half = halfWord + SURFACE_PAD_X;
    addSurface(s, half, surface, surfaceColor());
    frontZ = SURFACE_DEPTH / 2 + 1;
    bottom = Math.min(bottom, -OUTLINE - 12); // its front edge sits lower in view
    right = half;
  } else if (staging === 'card') {
    const half = halfWord + CARD_PAD_X;
    top = 136;
    bottom = -CARD_PAD_BOTTOM;
    addCard(s, half, bottom, top);
    right = half;
  } else {
    right = halfWord;
  }
  if (staging === 'float') top += FLOAT_BOB;

  // The onlooker: the first letter's capital (the grown-up, as the lesson's
  // A), on the floor, off to the right of the word and whatever it's on
  if (props.onlooker && chars.length) {
    onlooker = s.addActor('onlooker', chars[0].toUpperCase(), {
      color: props.colors[0],
      scale: ONLOOKER_SCALE,
      look: { lineWidth: 20 },
    });
    if (onlooker) {
      const x = right + ONLOOKER_GAP + onlooker.width / 2;
      const z = surface !== undefined ? frontZ + 20 : ONLOOKER_Z;
      // Turned part-way toward the word
      onlooker.moveTo(x, z, s.audienceYaw(x, z) - 0.4);
      right = x + onlooker.width / 2;
    }
  }

  // Frame it all with a little air
  const left = -(surface !== undefined ? halfWord + SURFACE_PAD_X : staging === 'card' ? halfWord + CARD_PAD_X : halfWord);
  const distance = ((top - bottom) * FRAME_AIR) / (2 * TAN_HALF_FOV);
  s.frame((right - left) / 2 + ARM_REACH, {
    centerX: (left + right) / 2,
    top,
    heightFactor: distance / top,
    lookFactor: (top + bottom) / 2 / top,
  });

  for (const a of [...actors, onlooker]) {
    if (!a) continue;
    void a.letter.brows?.express('happy', { duration: 0 });
    void a.letter.mouth?.updateShape(SMILE);
    if (!reducedMotion) cleanups.push(a.startIdle());
  }

  if (staging === 'float') {
    // Each letter bobs out of phase with its neighbours
    const bob = (t: number) =>
      actors.forEach((a, i) => a.walker.setHover(FLOAT_HEIGHT + (reducedMotion ? 0 : FLOAT_BOB * Math.sin(t * 1.6 + i * 0.9))));
    bob(0);
    if (!reducedMotion) cleanups.push(s.addTicker(bob));
  }

  // The word arrives. It's there from the start, so it slides in with the
  // card; then, once the card is in, faces pop in along it. Onto a surface
  // it waits backstage (on the floor behind it) and hops up, in reading order
  if (reducedMotion) {
    actors.forEach((a, i) => a.moveTo(centers[i], 0));
  } else if (surface !== undefined) {
    // Square on (turned toward the audience, a wide letter's corner would
    // swing into the surface); the hop up turns them
    const z = -(SURFACE_DEPTH / 2 + OUTLINE + BACKSTAGE_GAP);
    actors.forEach((a, i) => a.walker.setPosition(centers[i], z, 0, 0));
    await wait(ENTRANCE_DELAY_MS);
    await Promise.all(
      actors.map(async (a, i) => {
        await wait(i * CLIMB_STAGGER_MS);
        if (disposed) return;
        await a.walker.hopOnto({ x: centers[i], z: 0, floorY: surface }, {
          face: s.audienceYaw(centers[i], 0),
          clearance: CLIMB_CLEARANCE,
        });
        // A tail shows as soon as it lands (the rest have left the floor by then, or nearly)
        if (DESCENDER_LETTERS.has(chars[i])) surfaceAsFloor();
      }),
    );
  } else {
    actors.forEach((a, i) => a.moveTo(centers[i], 0));
    await wait(ENTRANCE_DELAY_MS);
    await Promise.all(
      actors.map(async (a, i) => {
        await wait(i * GREET_STAGGER_MS);
        if (disposed) return;
        await Promise.all([a.letter.showPart('eyes', { duration: 400 }), a.letter.showPart('mouth', { duration: 400 })]);
      }),
    );
  }
  surfaceAsFloor();
  if (!disposed) emit('arrived');
});

onBeforeUnmount(() => {
  disposed = true;
  clearMark(true);
  cleanups.forEach((stop) => stop());
  cleanups.length = 0;
  stage?.destroy();
  stage = null;
  actors.length = 0;
  onlooker = null;
});

// --- The step marker ---

let marks: THREE.Mesh[] = [];

function markColor(color: string): THREE.Color {
  return new THREE.Color(color).offsetHSL(0, 0.08, -0.12);
}

function addMark(fromX: number, toX: number, color: string, faint: boolean): THREE.Mesh | null {
  if (!stage) return null;
  const w = toX - fromX;
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(w, MARK_HEIGHT, 3),
    new THREE.MeshBasicMaterial({
      color: markColor(color),
      toneMapped: false,
      transparent: faint,
      opacity: faint ? 0.45 : 1,
    }),
  );
  bar.position.set((fromX + toX) / 2, baseY - MARK_DROP, frontZ + 1.5);
  bar.scale.x = 0.001;
  stage.scene.add(bar);
  return bar;
}

/** Take the marker away (growing it back out). */
function clearMark(now = false): Promise<void> {
  const old = marks;
  marks = [];
  const remove = () => {
    for (const m of old) {
      stage?.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    stage?.invalidate();
  };
  if (now || !old.length) {
    remove();
    return Promise.resolve();
  }
  return tween(MARK_MS * 0.6, (k) => old.forEach((m) => (m.scale.x = Math.max(0.001, 1 - easeOut(k))))).then(remove);
}

/**
 * Underline what the next press plays, as the SVG stepper does: a bar under
 * each of the step's letters (faint under one that only hushes), or, for the
 * whole word, one bar under all of it.
 */
async function mark(step: SightWordStep | 'word', color: string): Promise<void> {
  await clearMark();
  if (!stage || !actors.length) return;
  const span = (a: Actor3D) => [a.position.x - (a.width / 2) * 0.85, a.position.x + (a.width / 2) * 0.85] as const;
  if (step === 'word') {
    const [from] = span(actors[0]);
    const [, to] = span(actors[actors.length - 1]);
    const bar = addMark(from, to, color, false);
    if (bar) marks.push(bar);
  } else {
    for (const [i, effect] of Object.entries(step.letters)) {
      const a = actors[Number(i)];
      if (!a) continue;
      const [from, to] = span(a);
      const bar = addMark(from, to, color, effect === 'silent-e');
      if (bar) marks.push(bar);
    }
  }
  const mine = marks;
  await tween(reducedMotion ? 0 : MARK_MS, (k) => mine.forEach((m) => (m.scale.x = Math.max(0.001, easeOut(k)))));
}

// --- Progress: the word colours in as it's typed ---

type LetterProgress = 'untyped' | 'ready' | 'typed';
let progressStates: LetterProgress[] = [];

function letterColor(i: number): string {
  return props.colors[i % props.colors.length];
}

function untypedColor(i: number): THREE.Color {
  return new THREE.Color(letterColor(i)).lerp(new THREE.Color('#ffffff'), UNTYPED_DRAIN);
}

/**
 * Where the learner has got to: letters before `typed` are coloured in, `ready`
 * (the one to type next, if any) stands up in its colour, and the rest wait
 * pale. A ready letter, once typed, hops down into place.
 */
function progress(typed: number, ready: number | null): void {
  const ms = (n: number) => (reducedMotion ? 0 : n);
  actors.forEach((a, i) => {
    const to: LetterProgress = i < typed ? 'typed' : i === ready ? 'ready' : 'untyped';
    const from = progressStates[i];
    if (to === from) return;
    progressStates[i] = to;
    const l = a.letter;
    if (to === 'ready') {
      void l.setColor(letterColor(i), { duration: ms(READY_MS) });
      const grow = { scaleX: READY_SCALE, scaleY: READY_SCALE };
      void l.pose({ translateY: -READY_LIFT, ...grow, duration: ms(READY_MS), ease: 'outBack' }, 'bottom');
    } else if (to === 'typed') {
      if (from === 'untyped') void l.setColor(letterColor(i), { duration: ms(READY_MS) });
      void hopDown(a);
    } else {
      void l.setColor(untypedColor(i), { duration: ms(READY_MS) });
      void l.pose({ translateY: 0, scaleX: 1, scaleY: 1, duration: ms(READY_MS) }, 'bottom');
    }
  });
}

async function hopDown(a: Actor3D): Promise<void> {
  const l = a.letter;
  const rest = { translateY: 0, scaleX: 1, scaleY: 1 };
  if (reducedMotion) return l.pose({ ...rest, duration: 0 }, 'bottom');
  await l.pose({ translateY: -(READY_LIFT + HOP_LIFT), duration: HOP_MS, ease: 'outQuad' }, 'bottom');
  await l.pose({ ...rest, duration: HOP_MS + 40, ease: 'inQuad' }, 'bottom');
}

// --- Playing ---

/** A step's letters say its sound (or hush, the silent ones); resolves when they're done. */
async function playStep(step: SightWordStep, durationMs = 400): Promise<void> {
  await Promise.all(
    Object.entries(step.letters).map(([i, effect]) => actors[Number(i)]?.applyEffect(effect, { duration: durationMs })),
  );
}

/** One letter's effect (the timed whole word). */
function applyEffect(index: number, effect: LetterEffect, durationMs = 280): void {
  void actors[index]?.applyEffect(effect, { duration: durationMs });
}

/**
 * Faces only, no body motion: whoever minds (the letters that behave, or the
 * onlooker) frowns at the culprits, and the culprits look contrite (with a
 * little shrink they recover from). The faces hold until `makeUp`.
 */
async function react(culprits: number[], minders: number[]): Promise<void> {
  const bad = culprits.map((i) => actors[i]).filter(Boolean);
  const culprit = bad[0];
  if (!culprit) return;
  const mind = minders.length ? minders.map((i) => actors[i]).filter(Boolean) : onlooker ? [onlooker] : [];
  for (const m of mind) frownAt(m, culprit);
  await Promise.all([wait(700), ...bad.map((b) => contrite(b, !reducedMotion, () => !disposed))]);
}

/** Before the whole word: everyone lets it go, and smiles. */
async function makeUp(): Promise<void> {
  for (const a of [...actors, onlooker]) if (a) letGo(a);
  await wait(reducedMotion ? 0 : 300);
}

/** The word said: everyone bounces, one after another. */
async function cheer(): Promise<void> {
  if (reducedMotion) return;
  const all = [...actors, onlooker].filter((a): a is Actor3D => !!a);
  await Promise.all(all.map((a, i) => wait(i * 90).then(() => a.applyEffect('bounce'))));
}

defineExpose({ progress, playStep, applyEffect, react, makeUp, cheer, mark, clearMark });
</script>

<style scoped>
.sight-word-3d {
  width: 100%;
  height: 100%;
  min-height: 300px;
  position: relative;
}
</style>
