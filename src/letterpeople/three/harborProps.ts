// letterpeople/src/three/harborProps.ts
//
// SPIKE: the moving props of the harbor set (environments.ts): a ship that
// sails in and rides at anchor, and a few fish that keep swimming by. Cut
// paper, like the set. The lesson cues them (DigraphLesson3D: the ship for
// `ship`, the fish for `fish`).
//
// Motion runs on the stage's ticker only while something is moving, so the
// stage is back to rendering on demand once the props are gone.

import * as THREE from "three";
import type { Stage3D } from "./stage3d";
import {
  col,
  paperCutout,
  HARBOR_CUT_Z,
  HARBOR_EDGE_Z,
  HARBOR_WATER_Y,
  HARBOR_WAVE_Z,
  type HarborKind,
} from "./environments";

export interface HarborProps {
  /**
   * Drift in from the left, slowly, and come to rest on the left of the view,
   * bobbing there until sailed out. Resolves on coming to rest.
   */
  shipSailIn(): Promise<void>;
  /** Drift on off to the right (from wherever it is). Resolves once gone. */
  shipSailOut(): Promise<void>;
  /** A few fish swim by, back and forth, until stopFish(). */
  startFish(): void;
  /** Fish finish their current pass, then no more. */
  stopFish(): void;
  /** What's under a world ray: the ship, a fish, or nothing (for tap-to-hear). */
  pick(ray: THREE.Ray): "ship" | "fish" | null;
  dispose(): void;
}

/** How far back the ship sails: beyond the pier, in front of the headlands. */
const SHIP_Z = -900;
const SHIP_SCALE = 0.85; // masts clear the top of a 2:1 view
/** Where it comes to rest, as a fraction of the half-view left of centre at SHIP_Z. */
const SHIP_ANCHOR = 0.55;
/**
 * Drift speeds in view widths per second (at SHIP_Z), so the on-screen pace
 * is the same at any aspect (2:1 view: the bow shows after ~1 s, at rest
 * after ~9.5 s; ~14 s from rest to gone — scripts/ship-drift.mts). About a
 * quarter of the old eased 4.2 s / 5.2 s trips' peak speeds. Speed changes ease over SHIP_EASE_S, and the ship brakes
 * into its resting spot rather than stopping dead.
 */
const SHIP_IN_SPEED = 0.045;
const SHIP_OUT_SPEED = 0.08;
const SHIP_EASE_S = 2.5;

function shape(points: [number, number][]) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  return s;
}

/** A two-masted paper ship, bow toward +x, waterline at y = 0. */
export function buildShip(): THREE.Group {
  const ship = new THREE.Group();
  const layer = (o: THREE.Object3D, z: number) => ((o.position.z = z), ship.add(o), o);
  const wood = col(0.5, 0.04, 55);
  const sailColor = col(0.975, 0.012, 85);

  for (const x of [-45, 70]) {
    layer(paperCutout(shape([[x - 3, 30], [x + 3, 30], [x + 3, 265], [x - 3, 265]]), wood, 3), 0);
  }
  // Square sails (lower, upper) on each mast, bellied a little
  const sail = (x: number, y0: number, y1: number, w0: number, w1: number) => {
    const s = new THREE.Shape();
    s.moveTo(x - w0 / 2, y0);
    s.quadraticCurveTo(x, y0 - 8, x + w0 / 2, y0);
    s.lineTo(x + w1 / 2, y1);
    s.quadraticCurveTo(x, y1 - 4, x - w1 / 2, y1);
    s.closePath();
    return paperCutout(s, sailColor, 4);
  };
  for (const x of [-45, 70]) {
    layer(sail(x, 80, 160, 118, 100), 2);
    layer(sail(x, 172, 240, 92, 74), 2);
  }
  // Jib, bowsprit to foremast
  layer(paperCutout(shape([[92, 70], [72, 250], [196, 62]]), sailColor, 4), 1);
  // Pennant
  layer(paperCutout(shape([[70, 265], [110, 256], [70, 248]]), col(0.7, 0.12, 30), 2), 1);
  // Hull, raised at stern and bow, with a pale stripe and portholes
  const hull = new THREE.Shape();
  hull.moveTo(-150, 30);
  hull.lineTo(-165, 66);
  hull.lineTo(-112, 66);
  hull.lineTo(-104, 44);
  hull.lineTo(118, 44);
  hull.lineTo(176, 70);
  hull.lineTo(160, 26);
  hull.quadraticCurveTo(128, -18, 64, -22);
  hull.lineTo(-104, -22);
  hull.quadraticCurveTo(-148, -18, -150, 30);
  layer(paperCutout(hull, col(0.56, 0.08, 35), 5), 4);
  layer(paperCutout(shape([[-140, 26], [150, 26], [146, 34], [-142, 34]]), col(0.88, 0.04, 80), 1), 5);
  for (const x of [-80, -30, 20, 70]) {
    layer(paperCutout(new THREE.Shape().absarc(x, 10, 6, 0, Math.PI * 2, false), col(0.42, 0.04, 40), 1), 5);
  }
  ship.scale.setScalar(SHIP_SCALE);
  return ship;
}

// Bolder than the set's muted palette: they have to read through the water
/** Tap radius round a fish's centre, world units (a fish is ~50 long). */
const FISH_PICK_R = 40;

export const FISH_COLORS = [col(0.76, 0.15, 50), col(0.86, 0.14, 92), col(0.7, 0.15, 22)];

export interface Fish {
  group: THREE.Group;
  tail: THREE.Group;
}

/** A paper fish, nose toward +x, centred on its body. */
export function buildFish(color: THREE.Color, size: number): Fish {
  const group = new THREE.Group();
  const body = new THREE.Shape();
  body.moveTo(-20, 0);
  body.quadraticCurveTo(2, 18, 28, 0);
  body.quadraticCurveTo(2, -18, -20, 0);
  group.add(paperCutout(body, color, 2));
  const fin = paperCutout(shape([[-2, 8], [8, 17], [12, 7]]), color.clone().multiplyScalar(0.88), 1);
  fin.position.z = -0.5;
  group.add(fin);
  // Tail: pivots at the body's back end, flaps by turning (paper foreshortens)
  const tail = new THREE.Group();
  tail.position.x = -18;
  tail.add(paperCutout(shape([[2, 0], [-16, 13], [-10, 0], [-16, -13]]), color.clone().multiplyScalar(0.92), 2));
  group.add(tail);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(4, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  eye.position.set(15, 3, 0.5);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(2, 10), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  pupil.position.set(16, 3, 0.6);
  group.add(eye, pupil);
  group.scale.setScalar(size);
  return { group, tail };
}

export function createHarborProps(stage: Stage3D, kind: HarborKind): HarborProps {
  const root = new THREE.Group();
  stage.scene.add(root);

  // --- one ticker while anything moves ---
  const movers = new Set<(t: number) => boolean | void>();
  let removeTicker: (() => void) | null = null;
  const tick = (t: number) => {
    for (const m of [...movers]) if (m(t) === false) movers.delete(m);
    if (!movers.size && removeTicker) {
      removeTicker();
      removeTicker = null;
    }
  };
  /** Run `m(t)` every frame until it returns false. */
  const move = (m: (t: number) => boolean | void) => {
    movers.add(m);
    if (!removeTicker) removeTicker = stage.addTicker(tick);
  };

  // --- ship ---
  const ship = buildShip();
  ship.visible = false;
  root.add(ship);
  let shipX = 0;
  let shipBobbing = false;
  const viewWidth = (z: number) => stage.offstageX("right", z, 0) - stage.offstageX("left", z, 0);
  const shipMargin = 260 * SHIP_SCALE;

  // Drift: one mover owns shipX. Velocity eases toward a target; sailing in,
  // the target is capped by a braking curve so it comes to rest at the
  // anchor; sailing out, it just cruises until it's out of view.
  let shipV = 0; // units / s
  let drift: { mode: "in" | "out"; done: () => void } | null = null;
  const driftTo = (mode: "in" | "out") =>
    new Promise<void>((resolve) => {
      const previous = drift;
      drift = { mode, done: resolve };
      previous?.done(); // sailing out mid-entrance: the entrance is over too
      if (previous) return; // its mover keeps running, now in the new mode
      let last = -1;
      move((t) => {
        const dt = last < 0 ? 0 : Math.min(0.1, t - last);
        last = t;
        if (!drift) return false;
        const vw = viewWidth(SHIP_Z);
        const accel = (SHIP_IN_SPEED * vw) / SHIP_EASE_S;
        let target: number;
        let stopAt = Infinity;
        if (drift.mode === "in") {
          const centre = (stage.offstageX("right", SHIP_Z, 0) + stage.offstageX("left", SHIP_Z, 0)) / 2;
          stopAt = centre - (SHIP_ANCHOR * vw) / 2;
          target = Math.min(SHIP_IN_SPEED * vw, Math.sqrt(2 * accel * Math.max(0, stopAt - shipX)));
        } else {
          target = SHIP_OUT_SPEED * vw;
        }
        shipV += Math.max(-accel * 2 * dt, Math.min(accel * dt, target - shipV));
        shipX = Math.min(stopAt, shipX + shipV * dt);
        const arrived =
          drift.mode === "in"
            ? stopAt - shipX < 0.5 && shipV < 1
            : shipX >= stage.offstageX("right", SHIP_Z, shipMargin);
        if (arrived) {
          if (drift.mode === "in") shipV = 0;
          drift.done();
          drift = null;
          return false;
        }
      });
    });
  const bob = () => {
    if (shipBobbing) return;
    shipBobbing = true;
    move((t) => {
      if (!shipBobbing) return false;
      ship.position.set(shipX, HARBOR_WATER_Y + 1.5 * Math.sin(t * 1.3), SHIP_Z);
      ship.rotation.z = 0.025 * Math.sin(t * 1.05 + 0.6);
    });
  };

  // --- fish ---
  const fish = FISH_COLORS.map((c, i) => buildFish(c, 1.15 - i * 0.12));
  for (const f of fish) {
    f.group.visible = false;
    root.add(f.group);
  }
  let fishOn = false;
  let fishRunning = false;
  /** Lanes (z, depth) the three fish keep to. */
  const lanes =
    kind === "cutaway"
      ? [
          // Between the quay wall and the cut, shallow enough to stay in a 2:1 view
          // Between the quay wall and the cut: deep enough that the surface
          // never clips a back, shallow enough to stay in a 2:1 view
          { z: HARBOR_EDGE_Z + 20, y: HARBOR_WATER_Y - 36 },
          { z: HARBOR_EDGE_Z + 36, y: HARBOR_WATER_Y - 50 },
          { z: HARBOR_CUT_Z - 14, y: HARBOR_WATER_Y - 34 },
        ]
      : [
          { z: (HARBOR_WAVE_Z[0] + HARBOR_WAVE_Z[1]) / 2, y: HARBOR_WATER_Y - 34 },
          // (The front lane's flat is lower-crested: swim deeper to stay hidden)
          { z: (HARBOR_WAVE_Z[1] + HARBOR_WAVE_Z[2]) / 2, y: HARBOR_WATER_Y - 46 },
          { z: (HARBOR_WAVE_Z[0] + HARBOR_WAVE_Z[1]) / 2 + 8, y: HARBOR_WATER_Y - 34 },
        ];

  /** One fish crosses the view; resolves when it's out the other side. */
  const swimPass = (f: Fish, lane: { z: number; y: number }, dir: 1 | -1, phase: number) =>
    new Promise<void>((resolve) => {
      const x0 = stage.offstageX(dir > 0 ? "left" : "right", lane.z, 60);
      const x1 = stage.offstageX(dir > 0 ? "right" : "left", lane.z, 60);
      const speed = kind === "cutaway" ? 95 : 150; // units / s
      const dur = Math.abs(x1 - x0) / speed;
      f.group.visible = true;
      f.group.scale.x = Math.abs(f.group.scale.x) * dir; // mirror to face the way it swims
      let t0 = -1;
      move((t) => {
        if (t0 < 0) t0 = t;
        const s = t - t0;
        const u = Math.min(1, s / dur);
        const x = x0 + (x1 - x0) * u;
        let y: number;
        let pitch: number;
        if (kind === "cutaway") {
          // Gentle undulation under the surface
          const w = (Math.PI * 2) / 2.4;
          y = lane.y + 7 * Math.sin(s * w + phase);
          pitch = Math.atan2(7 * w * Math.cos(s * w + phase), speed);
        } else {
          // Leap out between the flats every so often, hidden between leaps
          const period = 1.5;
          const leap = 0.8;
          const k = ((s + phase) % period) / leap;
          if (k < 1) {
            const h = 62;
            y = lane.y + h * 4 * k * (1 - k);
            pitch = Math.atan2((h * 4 * (1 - 2 * k)) / leap, speed);
          } else {
            y = lane.y;
            pitch = 0;
          }
        }
        f.group.position.set(x, y, lane.z);
        f.group.rotation.z = pitch * dir;
        f.tail.rotation.y = 0.55 * Math.sin(s * 10 + phase);
        if (u >= 1) {
          f.group.visible = false;
          resolve();
          return false;
        }
      });
    });

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      let t0 = -1;
      move((t) => {
        if (t0 < 0) t0 = t;
        if ((t - t0) * 1000 >= ms) {
          resolve();
          return false;
        }
      });
    });

  const runFish = async () => {
    if (fishRunning) return;
    fishRunning = true;
    let dir: 1 | -1 = 1;
    while (fishOn && !disposed) {
      await Promise.all(
        fish.map((f, i) => wait(i * 650 + Math.random() * 300).then(() => swimPass(f, lanes[i], dir, i * 1.9))),
      );
      dir = dir > 0 ? -1 : 1;
      if (fishOn && !disposed) await wait(1200 + Math.random() * 1500);
    }
    fishRunning = false;
  };

  let disposed = false;
  return {
    async shipSailIn() {
      // Already drifting in from the wings, at cruise: no burst of speed on screen
      shipX = stage.offstageX("left", SHIP_Z, shipMargin);
      shipV = SHIP_IN_SPEED * viewWidth(SHIP_Z);
      ship.visible = true;
      bob();
      await driftTo("in");
    },
    async shipSailOut() {
      if (!ship.visible) return;
      await driftTo("out");
      if (disposed) return;
      shipBobbing = false;
      ship.visible = false;
      stage.invalidate();
    },
    startFish() {
      fishOn = true;
      void runFish();
    },
    stopFish() {
      fishOn = false;
    },
    pick(ray) {
      // Fish: small and moving, so a generous radius round each one's centre
      // (and mirrored fish would defeat a one-sided mesh test anyway).
      const p = new THREE.Vector3();
      for (const f of fish) {
        if (!f.group.visible) continue;
        f.group.getWorldPosition(p);
        if (ray.distanceSqToPoint(p) < FISH_PICK_R ** 2) return "fish";
      }
      // Ship: its hull, masts and sails, anywhere in their outline's box
      if (ship.visible) {
        ship.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(ship);
        if (ray.intersectsBox(box)) return "ship";
      }
      return null;
    },
    dispose() {
      disposed = true;
      fishOn = false;
      shipBobbing = false;
      drift?.done();
      drift = null;
      movers.clear();
      removeTicker?.();
      removeTicker = null;
      stage.scene.remove(root);
      const seen = new Set<unknown>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const x of [m.geometry, m.material as THREE.Material]) {
          if (!seen.has(x)) (seen.add(x), (x as { dispose(): void }).dispose());
        }
      });
    },
  };
}
