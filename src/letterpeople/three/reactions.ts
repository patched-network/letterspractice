/**
 * Social cues between 3D letters: one misbehaves (a grin, a taunting wave, a
 * smug wiggle, a sheepish face once it's caught), the others mind (a glare,
 * stamping, a jabbing arm, an appeal to someone). The sight-words lesson's
 * face-off (lessons/three/slidePlay.ts) plays them out. The sight-word intro
 * card (questions/three/SightWord3D.vue) keeps it quiet: faces only
 * (`frownAt`, `contrite`, then `makeUp`).
 *
 * The longer moves check `alive()` between beats, so a caller can end one
 * part-way (it then stops starting new beats). Waits run on anime's clock,
 * as the rest of the choreography.
 */

import * as THREE from 'three';
import { createTimer } from 'animejs';
import type { Actor3D } from './stage3d';

export type Alive = () => boolean;
const always: Alive = () => true;

/** Wait `ms` on anime's clock. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    createTimer({ duration: Math.max(1, ms), onComplete: () => resolve() });
  });
}

/** Where to look to meet a letter's eyes. */
export const headOf = (a: Actor3D) =>
  a.letter.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 55, 0));

/** Both arms raised (left, right), for laughing and cheering. */
export const ARMS_UP: [number, number] = [215, -35];

// --- The face ---

const mouthRest = new WeakMap<Actor3D, { openness: number; mood: number }>();

/** Change the mouth's shape, remembering its resting one for `restMouth`. */
export function setMouth(a: Actor3D, shape: { openness?: number; mood?: number }) {
  const now = a.letter.mouth?.getCurrentShapeParams();
  if (!now) return;
  if (!mouthRest.has(a)) mouthRest.set(a, { ...now });
  void a.letter.mouth?.updateShape(shape, { duration: 250 });
}

/** Back to the mouth's shape before `setMouth`. */
export function restMouth(a: Actor3D) {
  const rest = mouthRest.get(a);
  if (rest) void a.letter.mouth?.updateShape(rest, { duration: 250 });
  mouthRest.delete(a);
}

/** A cheeky grin, at `target` (null: at the audience). */
export function grin(a: Actor3D, target: Actor3D | null = null) {
  void a.letter.brows?.express('happy', { duration: 250 });
  setMouth(a, { mood: 1 });
  a.lookAtPoint(target ? headOf(target) : null);
}

/** A glare at `target`. */
export function glare(a: Actor3D, target: Actor3D) {
  void a.letter.brows?.express('angry', { duration: 250 });
  setMouth(a, { mood: 0.15 });
  a.lookAtPoint(headOf(target));
}

/** Caught out: sad brows. */
export function sheepish(a: Actor3D) {
  void a.letter.brows?.express('sad', { duration: 250 });
}

/** Let it go: gaze, arms, pose and mouth back to rest, and a smile. */
export function makeUp(a: Actor3D) {
  a.lookAtPoint(null);
  a.letter.arms?.stopAnimations();
  void a.letter.arms?.relax({ duration: 250 });
  a.letter.resetPose();
  restMouth(a);
  void a.letter.brows?.express('happy', { duration: 250 });
}

// --- Quiet (faces only) ---

/** A quiet glare at `target`: brows a little down in the middle, a slight frown, eyes on it. */
export function frownAt(a: Actor3D, target: Actor3D) {
  void a.letter.brows?.left.setState({ raise: 1, rotate: 8 }, { duration: 300 });
  void a.letter.brows?.right.setState({ raise: 1, rotate: -8 }, { duration: 300 });
  setMouth(a, { mood: 0.32 });
  a.lookAtPoint(headOf(target));
}

/**
 * Contrite: puppy brows (inner ends up), a small frown, eyes down at the
 * floor in front, and a little shrink that it recovers from. The face holds
 * until `makeUp`.
 */
export async function contrite(a: Actor3D, shrink = true, alive: Alive = always) {
  void a.letter.brows?.left.setState({ raise: -1, rotate: -14 }, { duration: 300 });
  void a.letter.brows?.right.setState({ raise: -1, rotate: 14 }, { duration: 300 });
  setMouth(a, { mood: 0.35 });
  a.lookAtPoint(headOf(a).add(new THREE.Vector3(0, -70, 60)));
  if (!shrink) return;
  await a.letter.pose({ scale: 0.93, duration: 280, ease: 'outQuad' }, 'bottom');
  await wait(600);
  if (!alive()) return;
  await a.letter.pose({ scale: 1, duration: 450, ease: 'inOutSine' }, 'bottom');
}

// --- Minding ---

/** Two little hops on the spot (fists up), then trembling. */
export async function stamp(a: Actor3D, alive: Alive = always) {
  for (let i = 0; i < 2; i++) {
    if (!alive()) return;
    const here = a.walker.getPosition();
    await a.walker.hopOnto(
      { ...here, floorY: a.walker.getFloorY() },
      { face: a.walker.getYaw(), clearance: 10, speed: 1.6 },
    );
  }
  if (!alive()) return;
  await a.letter.pose({ rotate: [0, -4, 4, -4, 4, 0], duration: 420, ease: 'linear' }, 'bottom');
}

/**
 * Jabbing an arm, mouth going: the right arm points right and down (at a
 * letter to the viewer's right), the left one mirrors it.
 */
export async function jab(a: Actor3D, alive: Alive = always, side: 'left' | 'right' = 'right') {
  const arms = a.letter.arms;
  void a.letter.mouth?.animateSpeak({ duration: 700 });
  for (const angle of [15, 38, 15, 38, 25]) {
    if (!alive()) return;
    if (side === 'right') await arms?.right.rotateTo(angle, { duration: 140, ease: 'outQuad' });
    else await arms?.left.rotateTo(180 - angle, { duration: 140, ease: 'outQuad' });
  }
  if (!alive()) return;
  void arms?.relax({ duration: 300 });
}

/**
 * Appealing to someone (null: the audience) with arms spread and pleading
 * brows, then back to glaring at `culprit`.
 */
export async function appeal(a: Actor3D, to: Actor3D | null, culprit: Actor3D, alive: Alive = always) {
  const arms = a.letter.arms;
  a.lookAtPoint(to ? headOf(to) : null);
  void a.letter.brows?.express('sad', { duration: 200 });
  void arms?.left.rotateTo(165, { duration: 250 });
  void arms?.right.rotateTo(15, { duration: 250 });
  void a.letter.mouth?.animateSpeak({ duration: 500 });
  await wait(900);
  if (!alive()) return;
  void arms?.relax({ duration: 300 });
  void a.letter.brows?.express('angry', { duration: 200 });
  a.lookAtPoint(headOf(culprit));
}

// --- Misbehaving ---

/** A taunting wave (left arm) at whoever it's looking at. */
export async function tauntWave(a: Actor3D) {
  await a.letter.arms?.wave({ arm: 'left' });
}

/** A grin at the audience and a smug wiggle, then back to `backTo`. */
export async function smugWiggle(a: Actor3D, backTo: Actor3D | null, alive: Alive = always) {
  a.lookAtPoint(null);
  void a.letter.pose({ rotate: [0, -6, 6, -6, 0], duration: 600, ease: 'inOutSine' }, 'bottom');
  await wait(800);
  if (!alive()) return;
  a.lookAtPoint(backTo ? headOf(backTo) : null);
}

/** Laughing on the spot: arms up, mouth going, two little bounces. */
export async function laugh(a: Actor3D, alive: Alive = always) {
  const arms = a.letter.arms;
  void arms?.left.rotateTo(ARMS_UP[0], { duration: 150 });
  void arms?.right.rotateTo(ARMS_UP[1], { duration: 150 });
  void a.letter.mouth?.animateSpeak({ duration: 600 });
  for (let i = 0; i < 2; i++) {
    if (!alive()) break;
    await a.letter.pose({ translateY: 8, duration: 150, ease: 'outQuad' }, 'bottom');
    await a.letter.pose({ translateY: 0, duration: 150, ease: 'inQuad' }, 'bottom');
  }
  void arms?.relax({ duration: 250 });
}
