// letterpeople/src/three/kiteProp.ts
//
// SPIKE: a paper kite on a string (SplitDigraphLesson3D: kit → kite). It
// springs from its holder's hand into the sky as the e joins k-i-t, then
// flies there for the rest of the lesson, its string running back to the
// hand wherever the holder goes. Cut paper, like the sets and harbor props.
//
// Motion runs on the stage ticker while the kite is up (it flies until the
// lesson ends, like the worn cape's sway).

import * as THREE from "three";
import { animate } from "animejs";
import type { Stage3D } from "./stage3d";
import { col } from "./environments";
import type { Letter3D } from "./letterMesh";
import { SHADOW_UNDER_LETTER } from "./locomotion";

export interface KiteProp {
  /** Spring from the holder's hand up to `to` (world). Resolves once it's flying. */
  launch(to: THREE.Vector3, ms?: number): Promise<void>;
  /** Is the flying kite under this world ray (a generous radius, it's moving)? */
  pick(ray: THREE.Ray): boolean;
  dispose(): void;
}

const TAIL_BOWS = 4;
const TAIL_LINK = 16;
const STRING_POINTS = 24;

/** One flat paper panel (no drop-shadow copy behind: it read as a second layer). */
function panel(shape: THREE.Shape, color: THREE.Color): THREE.Mesh {
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

function tri(a: [number, number], b: [number, number], c: [number, number]) {
  const s = new THREE.Shape();
  s.moveTo(...a);
  s.lineTo(...b);
  s.lineTo(...c);
  s.closePath();
  return s;
}

/** The kite's diamond: four paper panels and spars, spars crossing (the bridle) at (0, 8). */
export function buildKiteBody(hue: number): THREE.Group {
  const kite = new THREE.Group();
  const light = col(0.8, 0.13, hue);
  const dark = col(0.62, 0.16, hue);
  const top: [number, number] = [0, 40];
  const bottom: [number, number] = [0, -52];
  const left: [number, number] = [-28, 8];
  const right: [number, number] = [28, 8];
  const mid: [number, number] = [0, 8];
  kite.add(
    panel(tri(top, left, mid), light),
    panel(tri(top, mid, right), dark),
    panel(tri(left, bottom, mid), dark),
    panel(tri(mid, bottom, right), light),
  );
  const sparMat = new THREE.MeshLambertMaterial({ color: col(0.42, 0.04, 55) });
  const vSpar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 92, 1.5), sparMat);
  vSpar.position.set(0, -6, 1);
  const hSpar = new THREE.Mesh(new THREE.BoxGeometry(56, 2.2, 1.5), sparMat);
  hSpar.position.set(0, 8, 1);
  kite.add(vSpar, hSpar);
  return kite;
}

/**
 * @param hue Kite paper hue (degrees); the two halves alternate light / dark.
 * @param holder The hand's world position, each frame (null: hide the string).
 */
export function createKite(stage: Stage3D, hue: number, holder: () => THREE.Vector3 | null): KiteProp {
  const root = new THREE.Group();
  root.visible = false;
  stage.scene.add(root);

  // --- the kite: a diamond of four paper panels, spars, a bridle point ---
  const kite = buildKiteBody(hue);
  root.add(kite);

  // --- tail: a chain from the bottom point, with paper bows along it ---
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a });
  const tailGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: TAIL_BOWS * 2 + 1 }, () => new THREE.Vector3()),
  );
  const tail = new THREE.Line(tailGeo, lineMat);
  root.add(tail);
  const bowColors = [col(0.72, 0.15, (hue + 150) % 360), col(0.8, 0.13, (hue + 60) % 360)];
  const bows = Array.from({ length: TAIL_BOWS }, (_, i) => {
    const bow = new THREE.Group();
    const c = bowColors[i % 2];
    bow.add(panel(tri([0, 0], [-8, 5], [-8, -5]), c), panel(tri([0, 0], [8, 5], [8, -5]), c));
    root.add(bow);
    return bow;
  });

  // --- string: holder's hand → bridle, sagging a little ---
  const stringGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: STRING_POINTS }, () => new THREE.Vector3()),
  );
  const string = new THREE.Line(stringGeo, lineMat);
  string.frustumCulled = false; // its bounds change every frame
  tail.frustumCulled = false;
  root.add(string);

  // --- flight: pose from launch progress + a gentle bob and sway ---
  let launchFrom = new THREE.Vector3();
  let launchTo = new THREE.Vector3();
  let launchT0 = 0;
  let launchMs = 1200;
  let launchDone: (() => void) | null = null;
  let removeTicker: (() => void) | null = null;
  const tmp = new THREE.Vector3();
  const bridle = new THREE.Vector3();
  const easeOut = (u: number) => 1 - (1 - u) ** 3;

  const tick = (t: number) => {
    const now = performance.now();
    const u = Math.min(1, (now - launchT0) / launchMs);
    const e = easeOut(u);
    // Launch: an arc from the hand up to the flying spot, growing as it goes
    tmp.lerpVectors(launchFrom, launchTo, e);
    tmp.y += Math.sin(Math.PI * u) * 40; // a little over, then settles
    const sway = e; // bob and sway ease in with the climb
    kite.position.set(
      tmp.x + sway * 6 * Math.sin(t * 0.7),
      tmp.y + sway * 7 * Math.sin(t * 1.1 + 0.4),
      tmp.z,
    );
    kite.rotation.z = -0.25 + sway * 0.14 * Math.sin(t * 0.9) + (1 - e) * 2.5; // tumbles upright
    kite.scale.setScalar(0.25 + 0.75 * e);
    kite.updateMatrixWorld();

    // Tail: hangs from the bottom point, trailing down and away, wiggling
    const pts = tailGeo.getAttribute("position") as THREE.BufferAttribute;
    const s = kite.scale.x;
    const tailTop = new THREE.Vector3(0, -52, 0).applyMatrix4(kite.matrixWorld);
    for (let i = 0; i < pts.count; i++) {
      const k = i / (pts.count - 1);
      const along = i * (TAIL_LINK / 2) * s;
      pts.setXYZ(
        i,
        tailTop.x + along * 0.35 + 7 * s * k * Math.sin(t * 3 - i * 0.9),
        tailTop.y - along,
        tailTop.z,
      );
    }
    pts.needsUpdate = true;
    bows.forEach((bow, b) => {
      const i = (b + 1) * 2;
      bow.position.set(pts.getX(i), pts.getY(i), pts.getZ(i) + 0.5);
      bow.rotation.z = 0.3 * Math.sin(t * 3 - i * 0.9);
      bow.scale.setScalar(s);
    });

    // String: hand → bridle, sagging below the straight line
    const hand = holder();
    string.visible = !!hand;
    if (hand) {
      bridle.set(0, 8, 0).applyMatrix4(kite.matrixWorld);
      const sp = stringGeo.getAttribute("position") as THREE.BufferAttribute;
      const sag = Math.min(40, hand.distanceTo(bridle) * 0.08);
      for (let i = 0; i < sp.count; i++) {
        const k = i / (sp.count - 1);
        tmp.lerpVectors(hand, bridle, k);
        tmp.y -= sag * 4 * k * (1 - k);
        sp.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      sp.needsUpdate = true;
    }

    if (u >= 1 && launchDone) {
      launchDone();
      launchDone = null;
    }
  };

  let disposed = false;
  return {
    launch(to, ms = 1300) {
      const from = holder() ?? to.clone().setY(0);
      launchFrom = from.clone();
      launchTo = to.clone();
      launchT0 = performance.now();
      launchMs = ms;
      root.visible = true;
      if (!removeTicker) removeTicker = stage.addTicker(tick);
      return new Promise<void>((resolve) => (launchDone = resolve));
    },
    pick(ray) {
      if (!root.visible) return false;
      kite.getWorldPosition(tmp);
      return ray.distanceSqToPoint(tmp) < (55 * kite.scale.x) ** 2;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      launchDone?.();
      removeTicker?.();
      removeTicker = null;
      stage.scene.remove(root);
      const seen = new Set<unknown>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.geometry) return;
        for (const x of [m.geometry, m.material as THREE.Material]) {
          if (x && !seen.has(x)) (seen.add(x), (x as { dispose(): void }).dispose());
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The kit: a small cardboard box a letter carries at its side (kit, before it
// becomes a kite). A kite drawn on the front and two sticks poking out of
// the top, so it reads as a kite kit. Worn on the letter's content group like
// the costumes, so it follows walks and hops.
// ---------------------------------------------------------------------------

export interface KitBox {
  /** Pop in at the letter's side. */
  show(): Promise<void>;
  /** Glide to `at` (content space); `front` holds it in front of the body. */
  moveTo(at: { x: number; y: number }, front: boolean, ms: number): Promise<void>;
  /** Jitter (someone's putting it together) for `ms`. */
  shake(ms: number): Promise<void>;
  /** Spin and shrink away (the kite springs out). */
  pop(): Promise<void>;
  dispose(): void;
}

/** Kit box size (W × H × D). */
const KIT_W = 22;
const KIT_H = 17;
const KIT_D = 12;

/**
 * The kite kit itself: a cardboard box with a lid seam, a kite pictured on
 * the front and two sticks poking out of the top. Centred on the box, y-up.
 */
export function buildKitBoxBody(hue: number): THREE.Group {
  const [W, H, D] = [KIT_W, KIT_H, KIT_D];
  const card = new THREE.MeshLambertMaterial({ color: col(0.66, 0.07, 70) });
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), card);
  // Lid seam and the kite picture on the front
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.4, 1.2, D + 0.4),
    new THREE.MeshLambertMaterial({ color: col(0.5, 0.06, 65) }),
  );
  seam.position.y = H / 2 - 3;
  const pic = new THREE.Group();
  pic.add(
    panel(tri([0, 6], [-4.5, 0], [0, 0]), col(0.8, 0.13, hue)),
    panel(tri([0, 6], [0, 0], [4.5, 0]), col(0.62, 0.16, hue)),
    panel(tri([-4.5, 0], [0, -7], [0, 0]), col(0.62, 0.16, hue)),
    panel(tri([0, 0], [0, -7], [4.5, 0]), col(0.8, 0.13, hue)),
  );
  pic.position.set(0, -1, D / 2 + 0.2);
  const stickMat = new THREE.MeshLambertMaterial({ color: col(0.42, 0.04, 55) });
  const sticks = [-4, 3].map((x, i) => {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 6), stickMat);
    stick.position.set(x, H / 2 + 4, 0);
    stick.rotation.z = i ? -0.25 : 0.18;
    return stick;
  });
  const body = new THREE.Group();
  body.add(box, seam, pic, ...sticks);
  return body;
}

/**
 * @param at Box centre in the letter's content space (SVG units, y-down).
 * @param hue The kite hue (its picture on the box).
 */
export function holdKitBox(letter: Letter3D, at: { x: number; y: number }, hue: number): KitBox {
  const anchor = new THREE.Group();
  anchor.position.set(at.x, at.y, letter.frontZ / 2);
  anchor.scale.set(0.001, -0.001, 0.001); // y-up inside; hidden until show()
  letter.content.add(anchor);

  const D = KIT_D;
  const body = buildKitBoxBody(hue);
  anchor.add(body);
  anchor.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.renderOrder = SHADOW_UNDER_LETTER;
  });

  // Progress 0 → 1 over `ms` on anime's clock (one clock for all motion);
  // each step shapes its own easing from u
  const tween = (ms: number, step: (u: number) => void) =>
    new Promise<void>((resolve) => {
      const p = { u: 0 };
      animate(p, {
        u: 1,
        duration: ms,
        ease: "linear",
        onUpdate: () => {
          step(p.u);
          letter.invalidate();
        },
        onComplete: () => {
          step(1);
          letter.invalidate();
          resolve();
        },
      });
    });
  const setScale = (k: number) => anchor.scale.set(k, -k, k);

  return {
    show: () => tween(260, (u) => setScale(Math.max(0.001, 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2))),
    moveTo(to, front, ms) {
      const from = anchor.position.clone();
      const toZ = front ? letter.frontZ + D / 2 + 1.5 : letter.frontZ / 2;
      return tween(ms, (u) => {
        const e = u * u * (3 - 2 * u);
        anchor.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.z + (toZ - from.z) * e);
      });
    },
    shake: (ms) =>
      tween(ms, (u) => {
        const a = (1 - u * 0.3) * 1;
        body.rotation.z = 0.22 * a * Math.sin(u * ms * 0.05);
        body.position.set(1.8 * a * Math.sin(u * ms * 0.071), 1.2 * a * Math.sin(u * ms * 0.093), 0);
      }).then(() => {
        body.rotation.z = 0;
        body.position.set(0, 0, 0);
      }),
    pop: () =>
      tween(320, (u) => {
        setScale(Math.max(0.001, 1 - u * u));
        body.rotation.y = u * Math.PI * 2;
      }),
    dispose() {
      letter.content.remove(anchor);
      const seen = new Set<unknown>();
      anchor.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const x of [m.geometry, m.material as THREE.Material]) {
          if (!seen.has(x)) (seen.add(x), (x as { dispose(): void }).dispose());
        }
      });
    },
  };
}
