// letterpeople/src/three/slideProp.ts
//
// SPIKE: a playground slide, for the sight-words lesson's playground set
// (environments.ts "playground"). A chunky toddler slide seen side-on: steps
// up from the left, a platform, and a chute curving down to the right onto a
// flat run-out. Letters use it (hop up the steps, slide down, run back up the
// chute), so its measurements are exported: `slideMetrics()` for the treads,
// `chuteY` / `chuteAngle` for the chute's surface.
//
// Slide-local frame: floor at y = 0, x = 0 at the middle of the footprint,
// z = 0 on the centre line. Letters on it stand face-on to the camera (a
// letter side-on is a thin slab), so a tread is as deep as a wide letter:
// one standing on a step stays clear of the next riser. Lowercase widths run
// 60–80 (i 32, l 35, s 43; m 110), so w (80) overhangs a tread slightly and m
// doesn't fit at all (agent/threejs-letterpeople/scripts/slide-fit.mts).
//
// Static: the playground set bakes it with the rest of the set.

import * as THREE from "three";
import { oklch } from "../util/color";

export const SLIDE = {
  /** Height of each step; the platform is the top step. (Was 32: raised
   * 2026-09-28 to lift the platform above the narrator's speech balloon.) */
  rise: 48,
  /** Steps below the platform. */
  steps: 2,
  /** Tread depth along x (fits a letter standing face-on). */
  tread: 72,
  platformWidth: 84,
  /** Front to back (z) of the steps and platform. */
  depth: 76,
  chuteWidth: 52,
  /** Horizontal length of the chute's curve. */
  chuteRun: 176,
  /** The flat run-out at the bottom of the chute. */
  runout: 44,
  /** Top of the run-out above the floor. */
  runoutY: 14,
  /** Thickness of the chute bed. */
  bed: 7,
  /** Height of the chute's side walls above the bed. */
  wall: 12,
  wallThickness: 5,
  /** The handrail arch over the back edge of the platform. */
  railHeight: 36,
} as const;

/** OKLCH per part: playground-plastic colours, muted like the other sets so the letters out-shout them. */
const COLORS = {
  steps: [0.74, 0.07, 245], // blue
  chute: [0.74, 0.1, 35], // coral
  rail: [0.86, 0.09, 92], // yellow
} as const satisfies Record<string, readonly [number, number, number]>;

export interface SlideTread {
  x0: number;
  x1: number;
  /** Top surface. */
  y: number;
}

export interface SlideMetrics {
  /** Everything a letter can stand on, bottom step first; the last is the platform. */
  treads: SlideTread[];
  platform: SlideTread;
  /** The chute's curve runs x0 (the platform lip) → x1; the run-out x1 → x2. */
  chute: { x0: number; x1: number; x2: number };
  /** Footprint along x. */
  x0: number;
  x1: number;
}

const TOTAL_RUN = SLIDE.steps * SLIDE.tread + SLIDE.platformWidth + SLIDE.chuteRun + SLIDE.runout;
const PLATFORM_Y = SLIDE.rise * (SLIDE.steps + 1);

export function slideMetrics(): SlideMetrics {
  const x0 = -TOTAL_RUN / 2;
  const treads: SlideTread[] = [];
  for (let i = 0; i < SLIDE.steps; i++) {
    treads.push({ x0: x0 + i * SLIDE.tread, x1: x0 + (i + 1) * SLIDE.tread, y: SLIDE.rise * (i + 1) });
  }
  const px0 = x0 + SLIDE.steps * SLIDE.tread;
  const platform = { x0: px0, x1: px0 + SLIDE.platformWidth, y: PLATFORM_Y };
  treads.push(platform);
  const c0 = platform.x1;
  return {
    treads,
    platform,
    chute: { x0: c0, x1: c0 + SLIDE.chuteRun, x2: c0 + SLIDE.chuteRun + SLIDE.runout },
    x0,
    x1: x0 + TOTAL_RUN,
  };
}

const CHUTE_X0 = -TOTAL_RUN / 2 + SLIDE.steps * SLIDE.tread + SLIDE.platformWidth;
const DROP = PLATFORM_Y - SLIDE.runoutY;

/** 0 at the platform lip … 1 at the foot of the curve. */
const chuteU = (x: number) => THREE.MathUtils.clamp((x - CHUTE_X0) / SLIDE.chuteRun, 0, 1);

/**
 * Height of the chute's top surface at slide-local x: level with the
 * platform at the lip, a smoothstep down (level at both ends, steepest
 * midway), level along the run-out.
 */
export function chuteY(x: number): number {
  const u = chuteU(x);
  return PLATFORM_Y - DROP * u * u * (3 - 2 * u);
}

/**
 * The chute's slope at x as a rotation about z: what a letter sitting on it
 * takes (negative: the chute falls to the right). 0 on the level ends.
 */
export function chuteAngle(x: number): number {
  const u = chuteU(x);
  return Math.atan((-DROP / SLIDE.chuteRun) * 6 * u * (1 - u));
}

const material = ([l, c, h]: readonly [number, number, number]) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(oklch(l, c, h)) });

/**
 * Extrude an x–y profile to `depth` in z, centred on z = 0. The bevel rounds
 * the edges without growing the piece: its outer edge is the profile itself
 * and the total depth is `depth`.
 */
function extrude(shape: THREE.Shape, depth: number, bevel: number, mat: THREE.Material): THREE.Mesh {
  const inner = depth - 2 * bevel;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -inner / 2);
  return new THREE.Mesh(geo, mat);
}

/** Samples along the chute's curve. */
const CHUTE_SAMPLES = 28;

/** The chute surface from x0 to the end of the run-out, as [x, y] points (+ `dy`). */
function chuteLine(x0: number, dy: number): [number, number][] {
  const pts: [number, number][] = [];
  if (x0 < CHUTE_X0) pts.push([x0, chuteY(x0) + dy]);
  for (let i = 0; i <= CHUTE_SAMPLES; i++) {
    const x = CHUTE_X0 + (SLIDE.chuteRun * i) / CHUTE_SAMPLES;
    pts.push([x, chuteY(x) + dy]);
  }
  pts.push([CHUTE_X0 + SLIDE.chuteRun + SLIDE.runout, SLIDE.runoutY + dy]);
  return pts;
}

/** A band between two lines over the same xs: `top` left → right, then `bottom` back. */
function band(top: [number, number][], bottom: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(...top[0]);
  for (const p of top.slice(1)) s.lineTo(...p);
  for (const p of [...bottom].reverse()) s.lineTo(...p);
  s.closePath();
  return s;
}

/** Build the slide (slide-local frame; see the top of this file). */
export function buildSlide(): THREE.Group {
  const m = slideMetrics();
  const group = new THREE.Group();
  const stepsMat = material(COLORS.steps);
  const chuteMat = material(COLORS.chute);

  // Steps and platform: one stepped block, down to the floor
  const block = new THREE.Shape();
  block.moveTo(m.x0, 0);
  for (const t of m.treads) {
    block.lineTo(t.x0, t.y);
    block.lineTo(t.x1, t.y);
  }
  block.lineTo(m.platform.x1, 0);
  block.closePath();
  group.add(extrude(block, SLIDE.depth, 2.5, stepsMat));

  // Chute bed: the surface letters sit on, `bed` thick
  const surface = chuteLine(CHUTE_X0, 0);
  group.add(extrude(band(surface, chuteLine(CHUTE_X0, -SLIDE.bed)), SLIDE.chuteWidth, 2, chuteMat));

  // Side walls: over the bed's edges, rising `wall` above it; they start a
  // little back over the platform, a lip to hold on to
  const lead = 10;
  const wallShape = band(chuteLine(CHUTE_X0 - lead, SLIDE.wall), chuteLine(CHUTE_X0 - lead, -SLIDE.bed));
  for (const side of [-1, 1]) {
    const wall = extrude(wallShape, SLIDE.wallThickness, 1.5, chuteMat);
    wall.position.z = side * (SLIDE.chuteWidth / 2 - SLIDE.wallThickness / 2);
    group.add(wall);
  }

  // A foot under the run-out's end (the curve itself flies free)
  const footH = SLIDE.runoutY - SLIDE.bed;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(18, footH, SLIDE.chuteWidth - 12), stepsMat);
  foot.position.set(m.chute.x2 - 17, footH / 2, 0);
  group.add(foot);

  // Handrail: an arch along the platform's back edge (none at the front,
  // where it would cross the letter standing there)
  const { x0: px0, x1: px1, y: py } = m.platform;
  const h = SLIDE.railHeight;
  const z = -SLIDE.depth / 2 + 6;
  const a = px0 + 8;
  const b = px1 - 8;
  const rail = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a, py - 4, z),
      new THREE.Vector3(a, py + h * 0.7, z),
      new THREE.Vector3(a + 10, py + h, z),
      new THREE.Vector3(b - 10, py + h, z),
      new THREE.Vector3(b, py + h * 0.7, z),
      new THREE.Vector3(b, py - 4, z),
    ],
    false,
    "centripetal",
  );
  group.add(new THREE.Mesh(new THREE.TubeGeometry(rail, 48, 3.5, 8, false), material(COLORS.rail)));

  return group;
}
