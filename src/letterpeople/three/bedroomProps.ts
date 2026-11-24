// letterpeople/src/three/bedroomProps.ts
//
// SPIKE: the bed lesson's bedside and walls: a low-poly end table with a lamp
// and a stack of books on it, and pictures hung in the bedroom's frames. The
// lamp is a cue (it goes on when the scene wakes up) and the pictures are the
// lesson's choice (b things at the head end, d things at the foot), so they're
// props rather than part of the baked bedroom set (environments.ts "bedroom").
//
// The lamp's light exists from the start at intensity 0: adding a light to a
// lit scene recompiles every lit material's shader (a visible hitch), so it's
// only ever turned up and down.

import * as THREE from "three";
import { createTimer } from "animejs";
import { oklch } from "../util/color";
import type { Stage3D } from "./stage3d";
import { BEDROOM_WALL_Z } from "./environments";
import { PICTURES_3D, disposePicture } from "./pictures";

/** OKLCH per part: muted, like the set. */
const COLORS = {
  wood: [0.72, 0.05, 65],
  drawer: [0.76, 0.045, 68],
  knob: [0.55, 0.05, 60],
  lampBase: [0.6, 0.06, 35],
  shade: [0.92, 0.035, 88],
  pages: [0.95, 0.015, 90],
} as const satisfies Record<string, readonly [number, number, number]>;
const color = ([l, c, h]: readonly [number, number, number]) => new THREE.Color(oklch(l, c, h));

export const END_TABLE = {
  width: 54,
  depth: 40,
  /** Height of the table top's surface. */
  height: 52,
} as const;

/** The lamp's light: warm, and how bright when on (three's units: tune by eye). */
const LAMP_LIGHT_COLOR = 0xffd29a;
export const LAMP_INTENSITY = 500;
/** Light falls off as 1 / distance^decay (2 is physical; 1 lights the room more evenly). */
const LAMP_DECAY = 1;
/** The shade glowing when the lamp's on. */
const SHADE_GLOW = new THREE.Color(0xffc477);
const SHADE_GLOW_INTENSITY = 0.85;

export interface Lamp {
  readonly light: THREE.PointLight;
  readonly on: boolean;
  /** Click: the shade glows and the light comes up (over `ms`, with a flicker). */
  turnOn(ms?: number): Promise<void>;
  turnOff(ms?: number): Promise<void>;
  /** World point of the bulb (under the shade). */
  readonly bulbAt: THREE.Vector3;
}

export interface EndTable {
  readonly group: THREE.Group;
  /** World height of the table top. */
  readonly topY: number;
  readonly lamp: Lamp;
  dispose(): void;
}

/** An end table standing at (x, z) with a lamp on it, switched off. */
export function createEndTable(stage: Stage3D, at: { x: number; z: number }): EndTable {
  const group = new THREE.Group();
  group.name = "end-table";
  group.position.set(at.x, 0, at.z);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const flat = (c: THREE.Color) => keep(new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // --- Table: four stubby legs, a cabinet with a drawer, a top that overhangs ---
  const { width: W, depth: D, height: H } = END_TABLE;
  const wood = flat(color(COLORS.wood));
  const legH = 12;
  const topT = 5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(new THREE.BoxGeometry(4, legH, 4), wood, sx * (W / 2 - 5), legH / 2, sz * (D / 2 - 5));
    }
  }
  const cabH = H - topT - legH;
  add(new THREE.BoxGeometry(W - 4, cabH, D - 4), wood, 0, legH + cabH / 2, 0);
  add(new THREE.BoxGeometry(W + 4, topT, D + 4), wood, 0, H - topT / 2, 0);
  add(new THREE.BoxGeometry(W - 12, cabH * 0.42, 1.5), flat(color(COLORS.drawer)), 0, legH + cabH * 0.7, D / 2 - 1.2);
  add(new THREE.SphereGeometry(2.2, 6, 4), flat(color(COLORS.knob)), 0, legH + cabH * 0.7, D / 2 + 0.6);

  // --- Books: a stack of three at the front right, a little askew ---
  const books: [number, number, number, number, number, number][] = [
    // w, thickness, depth, hue, x, turn
    [26, 6, 19, 25, 13, 0.05],
    [23, 5, 17, 150, 14, -0.12],
    [20, 4.5, 15, 250, 12.5, 0.18],
  ];
  let by = H;
  for (const [bw, bt, bd, hue, bx, turn] of books) {
    const book = new THREE.Group();
    const cover = flat(color([0.62, 0.08, hue]));
    book.add(new THREE.Mesh(keep(new THREE.BoxGeometry(bw, bt, bd)), cover));
    // The pages, showing along the front edge
    const pages = new THREE.Mesh(keep(new THREE.BoxGeometry(bw - 2, bt - 1.6, 1)), flat(color(COLORS.pages)));
    pages.position.z = bd / 2 - 0.2;
    book.add(pages);
    book.position.set(bx, by + bt / 2, 5);
    book.rotation.y = turn;
    group.add(book);
    by += bt;
  }

  // --- Lamp: a base, a stem, a bulb, an open shade (at the back left) ---
  const lx = -12;
  const lz = -6;
  const baseH = 4;
  const stemH = 34;
  add(new THREE.CylinderGeometry(9, 11, baseH, 7), flat(color(COLORS.lampBase)), lx, H + baseH / 2, lz);
  add(new THREE.CylinderGeometry(1.7, 1.7, stemH, 6), flat(color(COLORS.lampBase)), lx, H + baseH + stemH / 2, lz);
  const bulbY = H + baseH + stemH + 2;
  const bulbMat = keep(new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe2a8, emissiveIntensity: 0, flatShading: true }));
  add(new THREE.SphereGeometry(4.5, 6, 4), bulbMat, lx, bulbY, lz);
  const shadeMat = keep(
    new THREE.MeshStandardMaterial({
      color: color(COLORS.shade),
      emissive: SHADE_GLOW,
      emissiveIntensity: 0,
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  const shadeH = 25;
  add(new THREE.CylinderGeometry(11.5, 19, shadeH, 8, 1, true), shadeMat, lx, bulbY + 3, lz);

  const light = new THREE.PointLight(LAMP_LIGHT_COLOR, 0, 0, LAMP_DECAY);
  light.position.set(lx, bulbY, lz);
  group.add(light);

  stage.scene.add(group);
  stage.invalidate();
  group.updateMatrixWorld(true);
  const bulbAt = light.getWorldPosition(new THREE.Vector3());

  let on = false;
  let level = 0;
  const setLevel = (l: number) => {
    level = l;
    light.intensity = LAMP_INTENSITY * l;
    shadeMat.emissiveIntensity = SHADE_GLOW_INTENSITY * l;
    bulbMat.emissiveIntensity = 1.5 * l;
    stage.invalidate();
  };
  let timer: { pause(): void } | null = null;
  const fade = (to: number, ms: number, flicker: boolean) =>
    new Promise<void>((resolve) => {
      timer?.pause();
      if (ms <= 0) {
        setLevel(to);
        resolve();
        return;
      }
      const from = level;
      timer = createTimer({
        duration: ms,
        onUpdate: (self) => {
          const t = Math.min(1, self.progress);
          // A filament catching: a dip a third of the way up
          const dip = flicker && t > 0.3 && t < 0.45 ? 0.45 : 1;
          setLevel((from + (to - from) * t) * dip);
        },
        onComplete: () => {
          timer = null;
          setLevel(to);
          resolve();
        },
      });
    });

  return {
    group,
    topY: H,
    lamp: {
      light,
      get on() {
        return on;
      },
      bulbAt,
      turnOn(ms = 220) {
        on = true;
        return fade(1, ms, true);
      },
      turnOff(ms = 150) {
        on = false;
        return fade(0, ms, false);
      },
    },
    dispose() {
      timer?.pause();
      stage.scene.remove(group);
      light.dispose();
      for (const d of disposables) d.dispose();
      stage.invalidate();
    },
  };
}

export interface FrameArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How much of a frame's inner area a picture fills. */
const PICTURE_FILL = 0.82;
/** Pictures are flattened against the wall to this depth (they're 3D builds). */
const PICTURE_DEPTH = 6;

/**
 * Hang a word picture (pictures/PICTURES_3D) in one of the bedroom's frames
 * (environments.ts BEDROOM_FRAMES): scaled to fit, flattened onto the mat.
 * Null if there's no picture for the word.
 */
export function hangPicture(stage: Stage3D, word: string, frame: FrameArea): { group: THREE.Group; dispose(): void } | null {
  const build = PICTURES_3D[word];
  if (!build) return null;
  const pic = build();
  const box = new THREE.Box3().setFromObject(pic);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = Math.min((frame.w * PICTURE_FILL) / size.x, (frame.h * PICTURE_FILL) / size.y);
  const holder = new THREE.Group();
  holder.name = `picture-${word}`;
  pic.position.sub(centre); // centred on its own middle
  holder.add(pic);
  holder.scale.set(k, k, Math.min(k, PICTURE_DEPTH / Math.max(size.z, 1e-3)));
  holder.position.set(frame.x, frame.y, BEDROOM_WALL_Z + 1 + (size.z * holder.scale.z) / 2);
  stage.scene.add(holder);
  stage.invalidate();
  return {
    group: holder,
    dispose() {
      stage.scene.remove(holder);
      disposePicture(pic);
      stage.invalidate();
    },
  };
}
