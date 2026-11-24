// letterpeople/src/three/pictures/kit.ts
//
// SPIKE: the drawing kit for word pictures: a palette, shape makers and a
// layered paper-cut-out builder. Pictures are drawn in the XY plane facing
// +z, about 100 units across (a letter's cap height), in any position (the
// viewers frame each one by its bounds).
//
// Layering: each part sits on a numbered layer, LAYER units apart. A cut-out's
// drop shadow sits 3 behind its face, so it lands on the layer below. Printed
// details (eyes, spots, stripes) go a fraction above their layer (+0.1, glints
// +0.2), below the next layer's shadow.

import * as THREE from "three";
import { col, paperCutout } from "../environments";

export { col };

export const LAYER = 4;
/** Straight snips per curve (same as the sets' paper cut-outs). */
const SEGMENTS = 8;

export type P = [number, number];

/**
 * OKLCH [lightness, chroma, hue]. Picture colours sit alongside the letters
 * (L 0.75, C 0.13): brighter than the muted sets, calm rather than neon.
 * Pale colours (cream, pale) need an outline or a coloured neighbour to hold
 * their edge against the cream stage (scripts/word-pictures.mts measures it).
 */
export const PAL_LCH = {
  red: [0.63, 0.17, 27],
  pink: [0.83, 0.075, 5],
  rose: [0.71, 0.11, 5],
  orange: [0.73, 0.16, 50],
  amber: [0.8, 0.15, 72],
  yellow: [0.88, 0.15, 95],
  gold: [0.8, 0.13, 82],
  darkGold: [0.66, 0.12, 72],
  green: [0.72, 0.15, 145],
  darkGreen: [0.6, 0.13, 150],
  teal: [0.72, 0.1, 200],
  glass: [0.87, 0.055, 225],
  blue: [0.64, 0.13, 252],
  purple: [0.64, 0.13, 305],
  brown: [0.56, 0.08, 55],
  darkBrown: [0.44, 0.06, 50],
  tan: [0.8, 0.06, 70],
  card: [0.72, 0.08, 68],
  cream: [0.965, 0.018, 90],
  grey: [0.72, 0.012, 250],
  darkGrey: [0.4, 0.012, 250],
  ink: [0.27, 0.01, 260],
} as const satisfies Record<string, readonly [number, number, number]>;

export type PalName = keyof typeof PAL_LCH;

export const PAL = Object.fromEntries(
  Object.entries(PAL_LCH).map(([k, [l, c, h]]) => [k, col(l, c, h)]),
) as Record<PalName, THREE.Color>;

/** Mark a mesh as a printed or outline detail (not a paper face): the checks and style converters read it. */
const DETAIL = "detail";

export const isDetail = (o: THREE.Object3D) => o.userData.kind === DETAIL;

// --- shapes ---

export function circle(x: number, y: number, r: number): THREE.Shape {
  return new THREE.Shape().absarc(x, y, r, 0, Math.PI * 2, false);
}

export function ellipse(x: number, y: number, rx: number, ry: number, rot = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, rot);
  return s;
}

export function poly(points: P[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  return s;
}

/** A polygon with its corners rounded off: radius `r` for all, or a list per corner (cycled: [5, 2] alternates). */
export function roundPoly(points: P[], r: number | number[]): THREE.Shape {
  const s = new THREE.Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const ri = Array.isArray(r) ? r[i % r.length] : r;
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const k = Math.min(ri, la / 2, lb / 2);
    const p1: P = [p[0] + ((a[0] - p[0]) * k) / la, p[1] + ((a[1] - p[1]) * k) / la];
    const p2: P = [p[0] + ((b[0] - p[0]) * k) / lb, p[1] + ((b[1] - p[1]) * k) / lb];
    if (i === 0) s.moveTo(...p1);
    else s.lineTo(...p1);
    s.quadraticCurveTo(p[0], p[1], p2[0], p2[1]);
  }
  s.closePath();
  return s;
}

/** Rounded rectangle by centre and size. */
export function roundRect(cx: number, cy: number, w: number, h: number, r: number): THREE.Shape {
  return roundPoly(
    [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ],
    r,
  );
}

/** Points of an n-pointed star (tips first, at the top when rot = 0). */
export function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5, rot = 0): P[] {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? inner : outer;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as P;
  });
}

/**
 * A crescent: the circle (0, 0, r) with the circle (cx, cy, rCut) bitten
 * out of it. The bite must overlap the edge (it opens toward (cx, cy)).
 */
export function crescent(r: number, cx: number, cy: number, rCut: number): THREE.Shape {
  const d = Math.hypot(cx, cy);
  const th = Math.atan2(cy, cx);
  const a = Math.acos((r * r + d * d - rCut * rCut) / (2 * r * d));
  const s = new THREE.Shape();
  s.absarc(0, 0, r, th + a, th + 2 * Math.PI - a, false);
  const p1: P = [r * Math.cos(th + a), r * Math.sin(th + a)];
  const p2: P = [r * Math.cos(th - a), r * Math.sin(th - a)];
  // Back along the bite, through its side inside the circle
  s.absarc(cx, cy, rCut, Math.atan2(p2[1] - cy, p2[0] - cx), Math.atan2(p1[1] - cy, p1[0] - cx), true);
  s.closePath();
  return s;
}

/** A hole to punch in a shape (shape.holes.push). */
export function circleHole(x: number, y: number, r: number): THREE.Path {
  return new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, true);
}

export function withHoles(shape: THREE.Shape, ...holes: THREE.Path[]): THREE.Shape {
  shape.holes.push(...holes);
  return shape;
}

/** Mirror points left-right (x → -x), in the same order (per-corner radii still line up). */
export function mirror(points: P[]): P[] {
  return points.map(([x, y]) => [-x, y] as P);
}

/** Rotate points by `angle` about `about`. */
export function rotate(points: P[], angle: number, about: P = [0, 0]): P[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map(([x, y]) => {
    const dx = x - about[0];
    const dy = y - about[1];
    return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c] as P;
  });
}

/**
 * A ribbon `width` wide along `points` (mitred joins; round caps on an open
 * line): whiskers, strings, outlines, stripes.
 */
export function strokeGeometry(points: P[], width: number, closed = false, roundCaps = true): THREE.BufferGeometry {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const n = pts.length;
  const h = width / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  const leftNormal = (i: number) => {
    const d = pts[(i + 1) % n].clone().sub(pts[i]).normalize();
    return new THREE.Vector2(-d.y, d.x);
  };
  for (let i = 0; i < n; i++) {
    let nrm: THREE.Vector2;
    if (!closed && i === 0) nrm = leftNormal(0);
    else if (!closed && i === n - 1) nrm = leftNormal(n - 2);
    else {
      const n0 = leftNormal((i - 1 + n) % n);
      const n1 = leftNormal(i % n);
      nrm = n0.clone().add(n1);
      const len = nrm.length();
      if (len < 1e-6) nrm = n1;
      else nrm.divideScalar(len).multiplyScalar(1 / Math.max(nrm.dot(n1), 0.5));
    }
    pos.push(pts[i].x + nrm.x * h, pts[i].y + nrm.y * h, 0, pts[i].x - nrm.x * h, pts[i].y - nrm.y * h, 0);
  }
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    const b = ((s + 1) % n) * 2;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  if (!closed && roundCaps && n > 1) {
    const cap = (p: THREE.Vector2, from: number) => {
      const c = pos.length / 3;
      pos.push(p.x, p.y, 0);
      const k = 8;
      for (let j = 0; j <= k; j++) {
        const a = from + (Math.PI * j) / k;
        pos.push(p.x + h * Math.cos(a), p.y + h * Math.sin(a), 0);
      }
      for (let j = 0; j < k; j++) idx.push(c, c + 1 + j, c + 2 + j);
    };
    const l0 = leftNormal(0);
    const l1 = leftNormal(n - 2);
    cap(pts[0], Math.atan2(l0.y, l0.x));
    cap(pts[n - 1], Math.atan2(l1.y, l1.x) - Math.PI);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}

// --- the builder ---

export class Pic {
  readonly root = new THREE.Group();

  /** A paper cut-out with a drop shadow (`shadow` = its offset; 0 = none). */
  cut(shape: THREE.Shape, color: THREE.Color, layer: number, name?: string, shadow = 3): THREE.Object3D {
    const o =
      shadow > 0
        ? paperCutout(shape, color, shadow)
        : new THREE.Mesh(new THREE.ShapeGeometry(shape, SEGMENTS), new THREE.MeshLambertMaterial({ color }));
    return this.put(o, layer, name);
  }

  /** A printed detail: flat, lit like paper, no shadow (spots, stripes, windows). */
  print(shape: THREE.Shape, color: THREE.Color, layer: number, name?: string): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, SEGMENTS), new THREE.MeshLambertMaterial({ color }));
    m.userData.kind = DETAIL;
    return this.put(m, layer, name);
  }

  /** Ink: flat and unlit, so it stays its exact colour (eyes, noses). */
  ink(shape: THREE.Shape, color: THREE.Color, layer: number, name?: string): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, SEGMENTS), new THREE.MeshBasicMaterial({ color }));
    m.userData.kind = DETAIL;
    return this.put(m, layer, name);
  }

  /** A stroke along points (see strokeGeometry). Unlit unless `lit`. */
  line(
    points: P[],
    width: number,
    color: THREE.Color,
    layer: number,
    opts: { closed?: boolean; roundCaps?: boolean; lit?: boolean; name?: string } = {},
  ): THREE.Object3D {
    const material = opts.lit ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshBasicMaterial({ color });
    const m = new THREE.Mesh(strokeGeometry(points, width, !!opts.closed, opts.roundCaps ?? true), material);
    m.userData.kind = DETAIL;
    return this.put(m, layer, opts.name);
  }

  /** An outline round a shape's edge (for pale shapes on the cream stage). */
  outline(shape: THREE.Shape, width: number, color: THREE.Color, layer: number): THREE.Object3D {
    const pts = shape.getPoints(SEGMENTS).map((v) => [v.x, v.y] as P);
    if (pts.length > 2) {
      const [f, l] = [pts[0], pts[pts.length - 1]];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-3) pts.pop();
    }
    return this.line(pts, width, color, layer, { closed: true, lit: true });
  }

  /** A friendly dot eye with a glint (glint toward the upper left). */
  eye(x: number, y: number, r: number, layer: number) {
    this.ink(circle(x, y, r), PAL.ink, layer, "eye");
    this.ink(circle(x - r * 0.32, y + r * 0.34, r * 0.34), PAL.cream, layer + 0.1);
  }

  /** A tyre and hub. */
  wheel(x: number, y: number, r: number, layer: number) {
    this.cut(circle(x, y, r), PAL.darkGrey, layer, "wheel", 2);
    this.print(circle(x, y, r * 0.48), PAL.grey, layer + 0.1);
    this.ink(circle(x, y, r * 0.16), PAL.darkGrey, layer + 0.2);
  }

  private put(o: THREE.Object3D, layer: number, name?: string) {
    o.position.z = layer * LAYER;
    if (name) o.name = name;
    this.root.add(o);
    return o;
  }
}
