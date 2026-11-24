// letterpeople/src/three/fist.ts
//
// A cartoon fist with its thumb up, for a 3D arm's hand (Arm3D.setHand), and
// the "bed" hands pose that uses two of them (the b/d mnemonic).
//
// Modelled on the bed hands as someone facing them sees them, i.e. from the
// back of the hand (a child doing it sees the other side: their own curled
// fingers). The back of the hand is a rounded block with the thumb rising
// from its outer top; down its inner edge run the four big knuckles, index
// (top) to pinky, where the two fists meet. From each knuckle the finger
// runs back, away from the viewer, and curls in along the palm (the rolls a
// child sees on their own fist). Knuckles together, the left fist's
// silhouette is a b and the right's a d: a bed, the thumbs its headboard and
// footboard.
//
// Built y-up, the thumb on the -x side and the knuckles toward +x, in units
// of the fist's height (1). The back of the hand faces +z (the viewer, with
// the hand in front of the letter); z = 0 is the curled fingers' side.
// Arm3D scales, mirrors and flips it into svgSpace.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Letter3D } from "./letterMesh";

/** The fist's extents, in units of its size (measured off buildFist). */
export const FIST = {
  /** The inner edge: the knuckles, this far toward +x. */
  knuckleX: 0.457,
  /** The outer edge (the mound at the thumb's base). */
  outerX: -0.6,
  /** Top of the index knuckle; bottom of the hand. */
  top: 0.526,
  bottom: -0.56,
  /** Top of the thumb. */
  thumbTop: 1.075,
  /** The curled fingers (0) to the knuckles, proud of the back of the hand. */
  depth: 0.653,
} as const;

/**
 * Index to pinky: height, radius, and x of the knuckle (and of the finger
 * running back from it). The middle knuckle stands out furthest.
 */
const FINGERS = [
  { y: 0.375, r: 0.14, x: 0.28 },
  { y: 0.125, r: 0.145, x: 0.3 },
  { y: -0.125, r: 0.14, x: 0.29 },
  { y: -0.37, r: 0.125, x: 0.25 },
] as const;
/** The knuckles: standing a little proud of the back of the hand; their size (× the finger's radius). */
const KNUCKLE_Z = 0.5;
const KNUCKLE_SCALE = 1.08;
/** The curled part of each finger runs along the palm out to here. */
const CURL_OUTER_X = -0.12;
/** The back of the hand: a rounded block, deep enough to be the palm behind it too. */
const HAND = { x0: -0.52, x1: 0.3, y0: -0.56, y1: 0.47, z0: 0.08, z1: 0.6, round: 0.16 };
/** The thumb: from inside the hand up past the index knuckle, leaning in a touch. */
const THUMB = { base: { x: -0.37, y: 0.25 }, tip: { x: -0.33, y: 0.92 }, r: 0.155, z: 0.38 };
/** The fleshy mound at the thumb's base (palm side), rounding the outer top. */
const THENAR = { x: -0.36, y: 0.12, z: 0.25, r: 0.24, scale: [1, 1.2, 0.9] as const };

const UP = new THREE.Vector3(0, 1, 0);

/** A capsule whose cap centres are `a` and `b`. */
function capsule(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

/** The fist, unit-sized (see the file header for its frame). Meshes share `mat`. */
export function buildFist(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = "fist";
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const hand = new THREE.Mesh(
    new RoundedBoxGeometry(HAND.x1 - HAND.x0, HAND.y1 - HAND.y0, HAND.z1 - HAND.z0, 3, HAND.round),
    mat,
  );
  hand.position.set((HAND.x0 + HAND.x1) / 2, (HAND.y0 + HAND.y1) / 2, (HAND.z0 + HAND.z1) / 2);
  g.add(hand);

  for (const { y, r, x } of FINGERS) {
    // The knuckle, on the inner edge toward the back of the hand
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * KNUCKLE_SCALE, 14, 10), mat);
    knuckle.position.set(x, y, KNUCKLE_Z);
    g.add(knuckle);
    // The finger runs back from it to the far side, then curls in along the palm
    g.add(capsule(v(x, y, KNUCKLE_Z), v(x, y, r), r, mat));
    g.add(capsule(v(x, y, r), v(CURL_OUTER_X, y, r), r * 0.95, mat));
  }

  const { base, tip, r, z } = THUMB;
  g.add(capsule(v(base.x, base.y, z), v(tip.x, tip.y, z), r, mat));

  const thenar = new THREE.Mesh(new THREE.SphereGeometry(THENAR.r, 14, 10), mat);
  thenar.position.set(THENAR.x, THENAR.y, THENAR.z);
  thenar.scale.set(...THENAR.scale);
  g.add(thenar);

  return g;
}

export interface BedHandsOptions {
  /** Fist size (finger-stack height), SVG units. Default 16. */
  size?: number;
  /** How far above the shoulders the fists sit, in fist sizes. Default 0.35. */
  raise?: number;
  /** Default 350 ms. */
  duration?: number;
}

/**
 * The "bed" hands: both fists, thumbs up, knuckles together in front of the
 * letter's middle at about shoulder height (the thumbs rise above). Seen
 * front-on: a b on the left, a d on the right.
 */
export async function bedHands(letter: Letter3D, options: BedHandsOptions = {}): Promise<void> {
  const arms = letter.arms;
  if (!arms) return;
  const size = options.size ?? 16;
  const [vbX, , vbW] = letter.geometry.viewBox;
  const cx = vbX + vbW / 2;
  const shoulders = (arms.left.getShoulderPosition().y + arms.right.getShoulderPosition().y) / 2;
  const y = shoulders - (options.raise ?? 0.35) * size; // svgSpace is y-down
  const dx = FIST.knuckleX * size;
  const anim = { duration: options.duration ?? 350 };
  const reach = 4 * size;
  await Promise.all([
    arms.left.setHand("fist", { ...anim, size }),
    arms.right.setHand("fist", { ...anim, size }),
    arms.left.setHandPosition({ x: cx - dx, y }, anim, reach),
    arms.right.setHandPosition({ x: cx + dx, y }, anim, reach),
  ]);
}

/** Out of the bed hands: ball hands, arms back to rest (angle and length). */
export async function releaseBedHands(letter: Letter3D, duration = 300): Promise<void> {
  const arms = letter.arms;
  if (!arms) return;
  await Promise.all([
    arms.left.setHand("ball", { duration }),
    arms.right.setHand("ball", { duration }),
    arms.rest({ duration }),
  ]);
}
