// letterpeople/src/three/bedProp.ts
//
// SPIKE: the bed lesson's bed. The word *bed* standing in a row is the bed,
// seen side-on: b's stem is the headboard, d's stem the footboard. A sheet
// (clothSim.ts) lies between them over the three bowls, on an invisible plank
// resting on the bowl tops (so it lies flat rather than hugging the bowls),
// and hangs down front and back, hiding the faces; the stems stand clear of
// it. It comes off in one pull to show what the bed is
// made of.
//
// Two layers:
// - `bedLayout()` is pure (numbers and colliders, no three.js): where the
//   posts and bowls are for a bed centred at x, z, and the sheet's start.
// - `createBed()` builds the sheet on a stage, drops it into its rest shape,
//   and runs the pull.
//
// The letters themselves are ordinary actors, placed by the lesson at
// `layout.letterX` facing the camera square on (yaw 0). The layout assumes
// the default 3D look (lineWidth 20, depth 14 + bevel).

import * as THREE from "three";
import { oklch } from "../util/color";
import { Cloth, roundedBox, type Collider, type Vec3 } from "./clothSim";
import type { Stage3D } from "./stage3d";

export const BED = {
  /** Every lowercase bowl letter is this wide (65) and this tall at its bowl (x-height). */
  letterWidth: 65,
  xHeight: 65,
  /** Stem height and width (cap height; lineWidth). */
  postHeight: 100,
  stem: 20,
  /** Gap between the letters (lesson3d WORD_GAP). */
  gap: 6,
  /** Half the letters' depth: extrusion 14 + bevel, centred. */
  letterHalfDepth: 9,
  /**
   * The invisible plank the sheet lies on: across the bowl tops, post to
   * post. A little deeper than the letters (18), so the sheet hangs clear of
   * their faces.
   */
  plank: { thickness: 3, depth: 26 },
  sheet: {
    /** Clearance between each end of the sheet and the inside of the post. */
    endGap: 2,
    /** Front to back: over the plank and down both sides to about the floor. */
    sizeZ: 160,
    /**
     * The sheet is this much longer than the gap between the posts: it
     * spreads to fill the gap and bunches a little against the posts, rather
     * than coming up short of them.
     */
    slackX: 1.06,
    /** Particle spacing: the sheet's grid, and how fine its folds are. */
    spacing: 7.5,
    /** Dropped from this far above the plank. */
    dropFrom: 4,
  },
} as const;

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface BedLayout {
  /** Centre x of the head letter (b), the middle one (e) and the foot letter (d). */
  letterX: readonly [number, number, number];
  /** Depth of the row (the letters' z). */
  z: number;
  /** The posts: b's stem (head end) and d's stem (foot end). */
  headPost: Box;
  footPost: Box;
  /** The invisible plank's top surface height. */
  plankTop: number;
  /** Everything the sheet lies on or meets: the plank, the posts. */
  colliders: Collider[];
  /** The flat sheet, before it drops. */
  sheet: { center: Vec3; sizeX: number; sizeZ: number };
}

/** The posts' colliders: a touch fatter than the stems, so the sheet's edge triangles don't cut into them. */
const POST_PAD = 2;
const POST_ROUND = 3;
/** The sheet holds onto the plank while it drapes (clothSim Collider.grip). */
const PLANK_GRIP = 0.3;

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/** The bed's parts for a bed centred at (`centerX`, `z`). Pure. */
export function bedLayout(centerX = 0, z = 0): BedLayout {
  const w = BED.letterWidth;
  const total = 3 * w + 2 * BED.gap;
  const left = centerX - total / 2;
  const right = left + total;
  const letterX = [left + w / 2, left + w + BED.gap + w / 2, right - w / 2] as const;
  const hz = BED.letterHalfDepth;

  const headPost = box(left, 0, z - hz, left + BED.stem, BED.postHeight, z + hz);
  const footPost = box(right - BED.stem, 0, z - hz, right, BED.postHeight, z + hz);

  // What the sheet lies on: the invisible plank across the bowl tops, post
  // to post. For the cloth it's a solid block from the plank's top down to
  // the floor: the sheet only collides at its particles, so the hanging sides
  // would drag it round a thin plank's edge and in underneath. The sheet
  // hangs straight down from the plank's edges either way.
  const plankTop = BED.xHeight + BED.plank.thickness;
  const pd = BED.plank.depth / 2;
  const grip = <C extends Collider>(c: C, g: number): C => Object.assign(c, { grip: g });
  const pad = (b: Box): Box =>
    box(b.min.x - POST_PAD, 0, b.min.z - POST_PAD, b.max.x + POST_PAD, b.max.y + POST_PAD, b.max.z + POST_PAD);
  const plank = box(headPost.max.x, 0, z - pd, footPost.min.x, plankTop, z + pd);
  const colliders: Collider[] = [
    grip(roundedBox(plank.min, plank.max, 1.5), PLANK_GRIP),
    roundedBox(pad(headPost).min, pad(headPost).max, POST_ROUND),
    roundedBox(pad(footPost).min, pad(footPost).max, POST_ROUND),
  ];

  // Between the posts, end to end
  const x0 = headPost.max.x + POST_PAD + BED.sheet.endGap;
  const x1 = footPost.min.x - POST_PAD - BED.sheet.endGap;
  return {
    letterX,
    z,
    headPost,
    footPost,
    plankTop,
    colliders,
    sheet: {
      center: { x: (x0 + x1) / 2, y: plankTop + BED.sheet.dropFrom, z },
      sizeX: x1 - x0,
      sizeZ: BED.sheet.sizeZ,
    },
  };
}

/** The sheet in its rest shape over the bed (deterministic: the same every run). */
export function drapedSheet(layout: BedLayout): Cloth {
  const cloth = new Cloth({ ...layout.sheet, spacing: BED.sheet.spacing, slackX: BED.sheet.slackX });
  cloth.colliders = layout.colliders;
  cloth.settle();
  return cloth;
}

export interface PullOptions {
  /** Where to take hold: the sheet nearest this point is held. */
  grabAt: Vec3;
  /** How much of the sheet the hand takes, around that point. Default 14. */
  grabRadius?: number;
  /** The hand's path from where it took hold, t 0 → 1 (ease it as wanted). */
  path: (t: number, from: Vec3) => Vec3;
  durationMs: number;
  /** How tightly the held bunch is balled up by the end (1 = as grabbed). Default 0.4. */
  gather?: number;
  /** Each frame, the hand's point and t (a letter's hand can follow it). */
  onHand?: (at: Vec3, t: number) => void;
}

export interface Bed {
  readonly layout: BedLayout;
  readonly cloth: Cloth;
  readonly group: THREE.Group;
  /** Where the sheet would be held from, near `at` (where a hand should reach). */
  holdPointNear(at: Vec3): Vec3;
  /** Pull the sheet off along a path; it's gone from the stage when this resolves. */
  pullSheet(options: PullOptions): Promise<void>;
  /**
   * Make the bed: a fresh, flat sheet appears `lift` above the bed and
   * floats down onto it, settling (live) for up to `maxMs`.
   */
  coverAgain(options?: { lift?: number; maxMs?: number }): Promise<void>;
  dispose(): void;
}

/** OKLCH per part: muted like the other sets so the letters out-shout them. */
const COLORS = {
  sheet: [0.8, 0.075, 285],
  sheetDots: [0.95, 0.03, 285],
} as const satisfies Record<string, readonly [number, number, number]>;
const css = ([l, c, h]: readonly [number, number, number]) => oklch(l, c, h);

/** A dotted sheet pattern (a canvas texture; null where there's no DOM, e.g. headless checks). */
function sheetTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = css(COLORS.sheet);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = css(COLORS.sheetDots);
  for (const [x, y] of [
    [0.25, 0.25],
    [0.75, 0.75],
  ]) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** World units per repeat of the sheet's dot pattern. */
const SHEET_TILE = 34;

/** Sim step for the pull (fixed, for a stable cloth); at most this many per frame. */
const PULL_DT = 1 / 60;
const PULL_MAX_STEPS = 3;

/**
 * Build the bed's sheet on `stage`, already draped. The letters are the
 * lesson's actors.
 */
export function createBed(stage: Stage3D, layout: BedLayout): Bed {
  const group = new THREE.Group();
  group.name = "bed";
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T) => {
    disposables.push(d);
    return d;
  };

  // --- Sheet ---
  const cloth = drapedSheet(layout);
  const geo = keep(new THREE.BufferGeometry());
  const posAttr = new THREE.BufferAttribute(cloth.pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  const { cols, rows } = cloth;
  const uvs = new Float32Array(cloth.count * 2);
  const tilesU = layout.sheet.sizeX / SHEET_TILE;
  const tilesV = layout.sheet.sizeZ / SHEET_TILE;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = cloth.index(i, j) * 2;
      uvs[k] = (i / (cols - 1)) * tilesU;
      uvs[k + 1] = (j / (rows - 1)) * tilesV;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = cloth.index(i, j);
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d); // faces +y while the sheet lies flat
    }
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  const pattern = sheetTexture();
  if (pattern) keep(pattern);
  const sheetMat = keep(
    new THREE.MeshStandardMaterial({
      ...(pattern ? { map: pattern } : { color: css(COLORS.sheet) }),
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  const sheet = new THREE.Mesh(geo, sheetMat);
  sheet.name = "bed-sheet";
  sheet.frustumCulled = false; // its bounds change as it moves
  group.add(sheet);

  stage.scene.add(group);
  stage.invalidate();

  const refresh = () => {
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    stage.invalidate();
  };

  let stopPull: (() => void) | null = null;

  return {
    layout,
    cloth,
    group,
    holdPointNear(at) {
      const k = cloth.nearest(at) * 3;
      return { x: cloth.pos[k], y: cloth.pos[k + 1], z: cloth.pos[k + 2] };
    },
    pullSheet(o) {
      return new Promise<void>((resolve) => {
        const from = cloth.grab(o.grabAt, o.grabRadius ?? 14);
        const gather = o.gather ?? 0.4;
        // Pulled, it should slide off what it's lying on
        cloth.friction = 0.08;
        cloth.gripping = false;
        const total = o.durationMs / 1000;
        let simT = 0;
        let acc = 0;
        let last = -1;
        const removeTicker = stage.addTicker((tSec) => {
          if (last < 0) {
            last = tSec;
            return;
          }
          acc += Math.min(0.1, tSec - last);
          last = tSec;
          let steps = 0;
          while (acc >= PULL_DT && steps < PULL_MAX_STEPS) {
            acc -= PULL_DT;
            steps++;
            simT += PULL_DT;
            const t = Math.min(1, simT / total);
            cloth.setGrabTarget(o.path(t, from), 1 + (gather - 1) * t);
            cloth.step(PULL_DT);
          }
          // Fell behind (a slow device): drop the time rather than spiral
          if (steps === PULL_MAX_STEPS) acc = 0;
          refresh();
          const t = Math.min(1, simT / total);
          o.onHand?.(o.path(t, from), t);
          if (t >= 1) finish();
        });
        const finish = () => {
          removeTicker();
          stopPull = null;
          cloth.release();
          sheet.visible = false;
          stage.invalidate();
          resolve();
        };
        stopPull = finish;
      });
    },
    coverAgain(o = {}) {
      return new Promise<void>((resolve) => {
        stopPull?.();
        cloth.reset(o.lift ?? 45);
        cloth.friction = 0.35;
        cloth.gripping = true;
        // Settles sooner than a free sheet would, so it's still by the end
        const damping = cloth.damping;
        cloth.damping = 0.975;
        sheet.visible = true;
        refresh();
        const maxSec = (o.maxMs ?? 2600) / 1000;
        const before = new Float32Array(cloth.pos.length);
        let simT = 0;
        let acc = 0;
        let last = -1;
        const removeTicker = stage.addTicker((tSec) => {
          if (last < 0) {
            last = tSec;
            return;
          }
          acc += Math.min(0.1, tSec - last);
          last = tSec;
          let steps = 0;
          let fastest = Infinity;
          while (acc >= PULL_DT && steps < PULL_MAX_STEPS) {
            acc -= PULL_DT;
            steps++;
            simT += PULL_DT;
            before.set(cloth.pos);
            cloth.step(PULL_DT);
            fastest = 0;
            for (let p = 0; p < cloth.pos.length; p += 3) {
              const d = Math.abs(cloth.pos[p + 1] - before[p + 1]) + Math.abs(cloth.pos[p] - before[p]) + Math.abs(cloth.pos[p + 2] - before[p + 2]);
              if (d > fastest) fastest = d;
            }
          }
          if (steps === PULL_MAX_STEPS) acc = 0;
          refresh();
          // At rest (or out of time): stop simulating
          if (simT >= maxSec || (simT > 0.6 && fastest / PULL_DT < 3)) finish();
        });
        const finish = () => {
          removeTicker();
          stopPull = null;
          cloth.damping = damping;
          stage.invalidate();
          resolve();
        };
        stopPull = finish;
      });
    },
    dispose() {
      stopPull?.();
      stage.scene.remove(group);
      for (const d of disposables) d.dispose();
      stage.invalidate();
    },
  };
}
