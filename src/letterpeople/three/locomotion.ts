// letterpeople/src/three/locomotion.ts
//
// SPIKE: getting around in 3D, for rigid, legless letters.
//
// Two gaits:
//  - "waddle": the fridge walk. Tip onto one outer front-bottom corner
//    (lifting the other foot, and the back edge a touch) and swing about
//    that corner; set down; repeat on the other side. Nothing slides —
//    every step is a rotation about a single contact point. A body
//    moved this way advances along the direction it faces, so the letter
//    turns (a shuffle-turn, same mechanics) to face where it's going.
//  - "hop": Luxo Jr. Crouch, launch with a stretch, lean into the travel
//    direction, land in a squash. Travels in any direction while only
//    partly turning, so the face stays readable.
//
// A Walker re-parents the letter's `root` under its own groups:
//
//   object (host adds this) ─ base ─ offset ─ squash ─ letter.root
//
//   base:   position = pivot on the floor, rotation = yaw / pitch / roll
//   offset: position = −pivot in body space (so rotation is about the pivot)
//   squash: y-scale about the floor contact
//
// Feet are the outermost points of the base (not the SVG leg attachment
// points, which sit inset from the edge).
//
// Body space = letter.root space at rest: origin on the baseline,
// horizontally centred, mid-depth; +z is the way the face points.
// Yaw 0 = facing +z (the camera). Positions are in the parent of `object`.

import * as THREE from "three";
import { createTimer } from "animejs";
import type { Letter3D } from "./letterMesh";

export type Gait = "waddle" | "hop";

export interface WalkOptions {
  gait?: Gait;
  /** Turn to a resting facing on arrival (`endYaw`, default 0 = the camera). Default true. */
  faceCamera?: boolean;
  /** The facing to settle to on arrival when `faceCamera` is on. Default 0. */
  endYaw?: number;
  /** Tempo multiplier. Default 1. Ignored when `durationMs` is given. */
  speed?: number;
  /**
   * Aim to arrive in about this long: the gait's tempo is scaled to fit,
   * within [MIN_TEMPO, MAX_TEMPO] so steps never go sluggish or frantic.
   * A long trip for a small letter can still run over.
   */
  durationMs?: number;
}

export interface HopOntoOptions {
  /** Tempo of the crouch and landing (the arc follows gravity). Default 1. */
  speed?: number;
  /** Facing on landing. Default: turned part-way toward the travel, as hops are. */
  face?: number;
  /** How high the arc peaks above the higher of the two surfaces. Default 18. */
  clearance?: number;
}

/** Where a riding letter is: its base centre, tilt (about z) and turn. */
export interface RidePose {
  x: number;
  y: number;
  z: number;
  roll: number;
  yaw?: number;
}

export interface Walker {
  /** Add this to the scene (in place of letter.root). */
  readonly object: THREE.Group;
  readonly letter: Letter3D;
  /** Where the letter stands, on the floor plane. */
  getPosition(): { x: number; z: number };
  /** Height of the surface the letter stands on (0 = the stage floor). */
  getFloorY(): number;
  /**
   * Place instantly, optionally facing `yaw` (default 0 = the camera), and
   * onto a surface at `floorY` (default: the current one).
   */
  setPosition(x: number, z: number, yaw?: number, floorY?: number): void;
  getYaw(): number;
  walkTo(target: { x: number; z: number }, options?: WalkOptions): Promise<void>;
  /**
   * One hop onto a surface at another height (a step up or down), landing at
   * `target`; the letter stands at `target.floorY` afterwards. The arc clears
   * the edge in between (a descender's tail too, going up, which takes a
   * higher hop): going up, the letter rises above the new surface
   * before it moves over; going down, it moves over before it drops. The
   * airtime follows from gravity, as every hop's does.
   */
  hopOnto(target: { x: number; z: number; floorY: number }, options?: HopOntoOptions): Promise<void>;
  /**
   * Follow a path (down a slide, say): `pose(t)` for t in 0…1 over `ms`,
   * picking up from the current pose (no easing back to standing first). It
   * rests in the last pose, tilt included (a letter left sitting on a slope);
   * the next ordinary move stands it up. The contact shadow is hidden while
   * riding and while it rests tilted.
   */
  ride(pose: (t: number) => RidePose, ms: number): Promise<void>;
  /**
   * Hover this far above the floor, on top of everything else (a word that
   * floats). The contact shadow stays on the floor, shrinking and fading with
   * the height. 0 to land.
   */
  setHover(height: number): void;
  turnTo(yaw: number, options?: WalkOptions): Promise<void>;
  /** Cancel whatever is running and settle onto both feet. */
  stop(): Promise<void>;
  isMoving(): boolean;
  /** Call once per frame (keeps the contact shadow under the letter). */
  update(): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Waddle tuning
const WADDLE_MAX_SWING = 24 * DEG; // yaw either side of heading per step
// A fridge walk's stride is its stance, and stances run 12–110 units across
// the alphabet (a 9× speed spread). Narrow-stanced letters partly make up
// for it with quicker, slightly wider steps — small legs, fast feet. Stances
// at or above the reference are unchanged.
const STANCE_REF = 40;
const MIN_CADENCE = 0.55; // step time at the narrowest stance, × normal
const NARROW_MAX_SWING = 34 * DEG;
const WADDLE_ROLL = 9 * DEG; // how far the free foot lifts
const WADDLE_PITCH = 3 * DEG; // forward tip, lifting the back corners
const WADDLE_STEP_MS = 300;
const TURN_STEP = 40 * DEG;
const TURN_STEP_MS = 220;

// Arrive-by-time: bounds on the tempo scaling
const MIN_TEMPO = 0.5;
const MAX_TEMPO = 2.2;
const tempoFor = (naturalMs: number, durationMs: number) =>
  Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, naturalMs / Math.max(1, durationMs)));

// Hop tuning. A plain hop: crouch, 312 ms in the air, land.
const HOP_MAX_LEN = 48;
const HOP_HEIGHT = 26;
const HOP_MS = 520;
const HOP_CROUCH = 0.22; // phase fractions of a plain hop (the rest is landing)
const HOP_AIR = 0.6;
const HOP_GROUND_MS = HOP_MS * (1 - HOP_AIR);
/**
 * Gravity, world units / ms², fixed by the plain hop. An arrive-on-time trip
 * never speeds up the airborne part: squeezing many small hops into the time
 * made gravity look several times too strong ("fast-forward"). Long trips
 * bound instead: fewer, longer, higher hops, whose airtime follows from
 * their height under this same gravity.
 */
const GRAVITY = (8 * HOP_HEIGHT) / (HOP_MS * HOP_AIR) ** 2;
const BOUND_MAX_LEN = 170;
const BOUND_ARC = 0.35; // bound height / length
const BOUND_MAX_HEIGHT = 80;
// Arrive-on-time may stretch or squeeze crouch + landing only this far
const HOP_GROUND_MIN = 0.6;
const HOP_GROUND_MAX = 1.5;
const HOP_MAX_TURN = 45 * DEG; // how far a hopper turns away from camera
const HOP_LEAN = 12 * DEG;

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

let shadowTexture: THREE.CanvasTexture | null = null;
function getShadowTexture(): THREE.CanvasTexture {
  if (!shadowTexture) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  return shadowTexture;
}

/** Letter meshes' renderOrder: after their contact shadow (see the shadow material). */
export const SHADOW_UNDER_LETTER = 1;

export function createWalker(letter: Letter3D, initialFloorY = 0): Walker {
  /** The surface the letter stands on; hopOnto, ride and setPosition change it. */
  let floorY = initialFloorY;
  const object = new THREE.Group();
  const base = new THREE.Group();
  base.rotation.order = "YXZ"; // yaw, then pitch/roll in the body's frame
  const offset = new THREE.Group();
  const squash = new THREE.Group();
  object.add(base);
  base.add(offset);
  offset.add(squash);
  squash.add(letter.root);

  // --- body measurements (root space at rest) ---
  const rootPos = letter.root.position.clone();
  const box = new THREE.Box3().setFromObject(letter.root);
  const minY = box.min.y - rootPos.y;
  // Where the letter meets the floor. Glyphs that hang well below the
  // baseline (g j p q y, comma) stand on the baseline and let the descender
  // sink through the floor — a deliberate break from hard-floor physics so
  // the word keeps one baseline. (Outline strokes dip a few units below
  // normal letters; the threshold ignores those.)
  const contactY = minY < -8 ? 0 : minY;
  /** How far the body hangs below where it stands: a descender's tail (0 for the rest). */
  const hang = contactY - minY;
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  // Feet: the outermost points of the body's cross-section at the contact
  // line. A rigid body rocks on its outer bottom corners; pivoting further
  // in would sink the overhang into the floor. Cross-section (edge
  // crossings), not just vertices: a descender's stem is one long segment
  // with no vertex anywhere near the baseline.
  let xl = Infinity;
  let xr = -Infinity;
  {
    letter.root.updateMatrixWorld(true);
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const take = (x: number) => {
      xl = Math.min(xl, x);
      xr = Math.max(xr, x);
    };
    letter.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const pos = mesh.isMesh ? mesh.geometry.getAttribute("position") : undefined;
      if (!pos) return;
      const index = mesh.geometry.getIndex();
      const count = index ? index.count : pos.count;
      for (let i = 0; i + 2 < count; i += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = index ? index.getX(i + k) : i + k;
          tri[k].fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld).sub(rootPos);
        }
        for (let k = 0; k < 3; k++) {
          const a = tri[k];
          const b = tri[(k + 1) % 3];
          if (a.y >= contactY && a.y <= contactY + 1.5) take(a.x);
          const da = a.y - contactY;
          const db = b.y - contactY;
          if (da * db < 0) take(a.x + ((b.x - a.x) * da) / (da - db));
        }
      }
    });
  }
  if (xr - xl < 12) {
    // Very narrow stance (i, l): widen a little so steps aren't microscopic
    const mid = (xl + xr) / 2;
    xl = mid - 6;
    xr = mid + 6;
  }
  // Front corners: tipping onto a corner (not an edge) is what lets the body
  // yaw without scrubbing.
  // Cadence: 1 = normal step time; smaller = quicker steps (narrow letters)
  const cadence = Math.max(MIN_CADENCE, Math.min(1, Math.sqrt((xr - xl) / STANCE_REF)));
  const narrowness = (1 - cadence) / (1 - MIN_CADENCE); // 0 wide … 1 narrowest
  const maxSwing = WADDLE_MAX_SWING + (NARROW_MAX_SWING - WADDLE_MAX_SWING) * narrowness;

  const front = box.max.z - rootPos.z;
  const footL = new THREE.Vector3(xl, contactY, front);
  const footR = new THREE.Vector3(xr, contactY, front);
  const centre = new THREE.Vector3(0, contactY, 0);

  // --- pose state ---
  const pivotBody = centre.clone();
  const pivotWorld = new THREE.Vector3(0, floorY, 0);
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let lift = 0;
  /** setHover's height, above everything else. */
  let hover = 0;
  let sx = 1;
  let sy = 1;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      // Blended like a transparent material, but drawn in the opaque pass
      // (transparent: false + CustomBlending ≡ normal blending): after the set
      // (renderOrder 0), before the letters (SHADOW_UNDER_LETTER). With no
      // depth write, a letter drawn later always covers it, so a descender
      // hanging below the floor, or off the harbor's pier edge, sits on top
      // of its own shadow instead of being darkened through it.
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      // Alpha as three's NormalBlending (matters on transparent stages)
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      opacity: 0.35,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = SHADOW_UNDER_LETTER - 0.5;
  object.add(shadow);
  letter.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.renderOrder = SHADOW_UNDER_LETTER;
  });

  const tmp = new THREE.Vector3();
  const bodyToParent = (p: THREE.Vector3, out: THREE.Vector3) => {
    squash.updateMatrix();
    offset.updateMatrix();
    base.updateMatrix();
    return out
      .copy(p)
      .applyMatrix4(squash.matrix)
      .applyMatrix4(offset.matrix)
      .applyMatrix4(base.matrix);
  };

  const updateShadow = () => {
    bodyToParent(centre, tmp);
    shadow.position.set(tmp.x, floorY + 0.15, tmp.z);
    shadow.rotation.z = yaw; // plane is laid flat, so its z is world yaw
    const height = Math.max(0, tmp.y - floorY);
    const k = Math.max(0.25, 1 - height / 90);
    shadow.scale.set(width * 1.25 * (0.6 + 0.4 * k), Math.max(depth * 2.2, 28) * (0.6 + 0.4 * k), 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * k;
  };

  const apply = () => {
    base.position.set(pivotWorld.x, pivotWorld.y + lift + hover, pivotWorld.z);
    base.rotation.set(pitch, yaw, roll);
    offset.position.copy(pivotBody).negate();
    squash.scale.set(sx, sy, sx);
    // scale about the floor contact
    squash.position.set(0, contactY * (1 - sy), 0);
    updateShadow();
    letter.invalidate();
  };

  /** Move the pivot to another body point without moving the body. */
  const setPivot = (p: THREE.Vector3) => {
    bodyToParent(p, tmp);
    pivotBody.copy(p);
    pivotWorld.set(tmp.x, tmp.y - lift - hover, tmp.z);
    apply();
  };

  // --- time ---
  let token = 0;
  let moving = false;
  /**
   * Run `onFrame(t)` for t in 0…1 over `ms`, on anime's shared frame loop
   * (one clock with every other tween). Resolves false if superseded.
   */
  const frames = (ms: number, onFrame: (t: number) => void, my: number) =>
    new Promise<boolean>((resolve) => {
      const timer = createTimer({
        duration: Math.max(1, ms),
        onUpdate: (self) => {
          if (my !== token) {
            timer.pause();
            resolve(false);
            return;
          }
          onFrame(Math.min(1, self.progress));
        },
        onComplete: () => {
          if (my !== token) return resolve(false);
          onFrame(1);
          resolve(true);
        },
      });
    });

  /** Ease any mid-step lean/lift/squash back to standing, pivot fixed. */
  const settle = async (my: number) => {
    const from = { pitch, roll, lift, sx, sy };
    if (Math.abs(pitch) + Math.abs(roll) + lift + Math.abs(sx - 1) + Math.abs(sy - 1) < 1e-3) return;
    await frames(
      120,
      (t) => {
        const e = easeInOut(t);
        pitch = from.pitch * (1 - e);
        roll = from.roll * (1 - e);
        lift = from.lift * (1 - e);
        sx = 1 + (from.sx - 1) * (1 - e);
        sy = 1 + (from.sy - 1) * (1 - e);
        apply();
      },
      my,
    );
  };

  /**
   * Start a move. Most moves first ease back to standing (and so get their
   * contact shadow back); a ride picks up from the pose the body is in (a
   * letter resting tilted on a slope rides on from that tilt).
   */
  const begin = async (fromStanding = true) => {
    const my = ++token;
    moving = true;
    if (fromStanding) {
      await settle(my);
      shadow.visible = true;
    }
    return my;
  };
  const end = (my: number) => {
    if (my === token) moving = false;
  };

  // --- arms: balance and swing, if the letter has them ---
  const armsTo = (left: number, right: number, ms: number) => {
    if (!letter.arms) return;
    letter.arms.left.rotateTo(left, { duration: ms, ease: "inOutSine" });
    letter.arms.right.rotateTo(right, { duration: ms, ease: "inOutSine" });
  };
  const armsRelax = (ms: number) => letter.arms?.relax({ duration: ms });

  // =========================================================================
  // Waddle
  // =========================================================================

  /** One rocking step about `foot`, yawing from `a` to `b` (absolute). */
  const waddleStep = (
    foot: "L" | "R",
    a: number,
    b: number,
    ms: number,
    rollScale: number,
    my: number,
  ) => {
    setPivot(foot === "R" ? footR : footL);
    // Standing on R: roll negative lifts L (top leans onto R). And vice versa.
    const rollSign = foot === "R" ? -1 : 1;
    // Fling the lifted side's arm out for balance
    if (foot === "R") armsTo(178, 42, ms);
    else armsTo(138, 2, ms);
    return frames(
      ms,
      (t) => {
        const up = Math.sin(Math.PI * t) * rollScale;
        yaw = a + (b - a) * easeInOut(t);
        roll = rollSign * WADDLE_ROLL * up;
        pitch = WADDLE_PITCH * up;
        apply();
      },
      my,
    );
  };

  interface Step {
    foot: "L" | "R";
    /** Absolute yaw at the start and end of the step. */
    a: number;
    b: number;
    ms: number;
    rollScale: number;
  }

  /**
   * Shuffle-turn: alternate feet, each step turning up to TURN_STEP. `minSteps`
   * lets the planner hold the step count steady while it re-aims.
   */
  const turnSteps = (from: number, to: number, minSteps = 0): Step[] => {
    const delta = wrapAngle(to - from);
    // Even a sliver of a turn is taken (skipping it would snap the yaw), but
    // quickly: a small correction gets a proportionally short step.
    if (Math.abs(delta) < 0.01 * DEG) return [];
    const n = Math.max(minSteps, Math.ceil(Math.abs(delta) / TURN_STEP));
    const per = delta / n;
    const stepMs = TURN_STEP_MS * cadence * Math.max(0.35, Math.abs(per) / TURN_STEP);
    // Turning left (yaw up) leads with the right foot planted, then alternate
    let foot: "L" | "R" = per > 0 ? "R" : "L";
    const steps: Step[] = [];
    for (let i = 0; i < n; i++) {
      steps.push({ foot, a: from + per * i, b: from + per * (i + 1), ms: stepMs, rollScale: 0.7 * Math.min(1, Math.abs(per) / TURN_STEP + 0.3) });
      foot = foot === "R" ? "L" : "R";
    }
    return steps;
  };

  /**
   * Walk `dist` along `heading`, yawing ±β about it. Yaw up pivots on the
   * right corner (left side swings forward), yaw down on the left. Each full
   * swing advances about 2w·sinβ, the opening and closing half-swings about
   * w·sinβ each; the planner's dry run corrects the rest. `minSwings` lets
   * the planner hold the swing count steady while it re-aims.
   */
  const walkSteps = (heading: number, dist: number, minSwings = 0): Step[] => {
    const w = (xr - xl) / 2;
    const swings = Math.max(1, minSwings, Math.ceil(dist / (2 * w * Math.sin(maxSwing))));
    const beta = Math.asin(Math.min(1, dist / (2 * w * swings)));
    const seq = [0];
    for (let i = 0; i < swings; i++) seq.push(i % 2 === 0 ? beta : -beta);
    seq.push(0);
    const steps: Step[] = [];
    for (let k = 0; k + 1 < seq.length; k++) {
      const a = seq[k];
      const b = seq[k + 1];
      const half = a === 0 || b === 0;
      steps.push({
        foot: b > a ? "R" : "L",
        a: heading + a,
        b: heading + b,
        ms: (half ? WADDLE_STEP_MS * 0.7 : WADDLE_STEP_MS) * cadence,
        rollScale: half ? 0.6 : 1,
      });
    }
    return steps;
  };

  /** Where a step sequence would leave the body, without animating it. */
  const dryRun = (steps: Step[]) => {
    const savedPivotBody = pivotBody.clone();
    const savedPivotWorld = pivotWorld.clone();
    const savedYaw = yaw;
    for (const st of steps) {
      setPivot(st.foot === "R" ? footR : footL);
      yaw = st.b;
      apply();
    }
    const end = getPosition();
    pivotBody.copy(savedPivotBody);
    pivotWorld.copy(savedPivotWorld);
    yaw = savedYaw;
    apply();
    return end;
  };

  /**
   * Turn, walk, (turn back): every corner pivot nudges the body sideways, so
   * aim, dry-run, and re-aim by the miss until the sequence lands on target.
   *
   * Step counts only ever grow across re-aims. For a wide letter one corner
   * pivot moves the body tens of units, so a re-aim that drops a swing or a
   * turn step lands somewhere quite different, the next re-aim adds it back,
   * and the loop ping-pongs instead of converging (h, H, M missed by 20–50).
   * The best plan seen is kept, not the last.
   */
  const planWaddle = (
    target: { x: number; z: number },
    faceCamera: boolean,
    endYaw: number,
  ): Step[] => {
    const start = getPosition();
    let aim = { ...target };
    let best: Step[] = [];
    let bestMiss = Infinity;
    const n = { turnIn: 0, swings: 0, turnOut: 0 };
    for (let i = 0; i < 12; i++) {
      const dx = aim.x - start.x;
      const dz = aim.z - start.z;
      const dist = Math.hypot(dx, dz);
      const heading = dist < 2 ? yaw : Math.atan2(dx, dz);
      const turnIn = turnSteps(yaw, heading, n.turnIn);
      const walk = dist < 2 ? [] : walkSteps(heading, dist, n.swings);
      const turnOut = faceCamera ? turnSteps(heading, endYaw, n.turnOut) : [];
      n.turnIn = turnIn.length;
      n.swings = Math.max(0, walk.length - 1); // a walk is swings + 1 steps
      n.turnOut = turnOut.length;
      const steps = [...turnIn, ...walk, ...turnOut];
      const end = dryRun(steps);
      const ex = target.x - end.x;
      const ez = target.z - end.z;
      const miss = Math.hypot(ex, ez);
      if (miss < bestMiss) {
        best = steps;
        bestMiss = miss;
      }
      if (miss < 0.5) break;
      // Full correction first; damped later, in case the plan is still flipping
      const k = i < 4 ? 1 : 0.6;
      aim = { x: aim.x + ex * k, z: aim.z + ez * k };
    }
    return best;
  };

  const runSteps = async (steps: Step[], speed: number, my: number) => {
    for (const st of steps) {
      if (!(await waddleStep(st.foot, st.a, st.b, st.ms / speed, st.rollScale, my))) return false;
    }
    yaw = wrapAngle(yaw);
    return true;
  };

  // =========================================================================
  // Hop
  // =========================================================================

  interface HopShape {
    crouchMs: number;
    airMs: number;
    landMs: number;
    height: number;
  }

  /** The plain hop, all phases scaled by `speed` (as before bounds existed). */
  const plainHop = (ms: number): HopShape => ({
    crouchMs: ms * HOP_CROUCH,
    airMs: ms * HOP_AIR,
    landMs: ms * (1 - HOP_CROUCH - HOP_AIR),
    height: HOP_HEIGHT,
  });

  /** A hop (or bound) of length `len` under GRAVITY; `ground` scales crouch + landing. */
  const hopShape = (len: number, ground: number): HopShape => {
    const height =
      len <= HOP_MAX_LEN
        ? HOP_HEIGHT
        : Math.min(BOUND_MAX_HEIGHT, Math.max(HOP_HEIGHT, BOUND_ARC * len));
    return {
      crouchMs: HOP_MS * HOP_CROUCH * ground,
      airMs: Math.sqrt((8 * height) / GRAVITY),
      landMs: HOP_MS * (1 - HOP_CROUCH - HOP_AIR) * ground,
      height,
    };
  };

  /**
   * How to cover `dist` in about `targetMs`: the hop count whose natural
   * timing comes closest, preferring fewer (bigger) hops when it's close.
   * Only crouch + landing flex to fit; the arc never speeds up.
   */
  const planHops = (dist: number, targetMs: number) => {
    const fewest = Math.max(1, Math.ceil(dist / BOUND_MAX_LEN));
    const most = Math.max(fewest, Math.ceil(dist / HOP_MAX_LEN) + 1);
    let best = { n: fewest, shape: hopShape(dist / fewest, 1) };
    let bestErr = Infinity;
    for (let n = fewest; n <= most; n++) {
      const airMs = hopShape(dist / n, 1).airMs;
      const ground = Math.max(
        HOP_GROUND_MIN,
        Math.min(HOP_GROUND_MAX, (targetMs / n - airMs) / HOP_GROUND_MS),
      );
      const err = Math.abs(n * (airMs + HOP_GROUND_MS * ground) - targetMs);
      if (err < bestErr - 0.03 * targetMs) {
        best = { n, shape: hopShape(dist / n, ground) };
        bestErr = err;
      }
    }
    return best;
  };

  /** One hop from where we stand to `to`, turning to `face` on the way. */
  const hop = (to: THREE.Vector3, face: number, heading: number, shape: HopShape, my: number) => {
    const ms = shape.crouchMs + shape.airMs + shape.landMs;
    const tUp = shape.crouchMs / ms;
    const tDown = (shape.crouchMs + shape.airMs) / ms;
    // Bigger bounds wind up deeper and stretch further
    const power = Math.min(1.6, Math.sqrt(shape.height / HOP_HEIGHT));
    setPivot(centre);
    const p0 = pivotWorld.clone();
    const yaw0 = yaw;
    const dYaw = wrapAngle(face - yaw0);
    // Lean toward the travel direction, expressed in the body's own frame
    const rel = heading - face;
    // ...scaled by how far this hop actually travels (a turn-in-place hop
    // shouldn't lunge)
    const reach = Math.min(1, p0.distanceTo(to) / HOP_MAX_LEN);
    const leanPitch = Math.cos(rel) * reach;
    const leanRoll = -Math.sin(rel) * reach;
    let launched = false;
    let landed = false;
    return frames(
      ms,
      (t) => {
        if (t < tUp) {
          // crouch
          const c = Math.sin((t / tUp) * (Math.PI / 2));
          sy = 1 - 0.14 * power * c;
          sx = 1 + 0.07 * power * c;
          lift = 0;
        } else if (t < tDown) {
          if (!launched) {
            launched = true;
            letter.mouth?.animateSpeak({ duration: 90 });
            if (letter.arms) armsTo(205, -25, 160);
          }
          const u = (t - tUp) / (tDown - tUp);
          const e = easeInOut(u);
          pivotWorld.lerpVectors(p0, to, e);
          lift = shape.height * 4 * u * (1 - u);
          sy = 1 + 0.12 * power * (1 - u); // stretch off the ground, relax at the top
          sx = 1 - 0.05 * (1 - u);
          yaw = yaw0 + dYaw * e;
          // Lean in on the way up; upright again by touchdown, so the base
          // lands flat (a tilted landing would dip an edge into the floor)
          const lean = HOP_LEAN * Math.sin(Math.PI * u) * (1 - 0.5 * u);
          pitch = lean * leanPitch;
          roll = lean * leanRoll;
        } else {
          // land
          if (!landed) {
            landed = true;
            lift = 0;
            pivotWorld.copy(to);
            yaw = yaw0 + dYaw;
            // Flat on touchdown (any residual lean is ~1° by now; decaying it
            // on the ground would dip an edge into the floor)
            pitch = roll = 0;
            armsRelax(200);
          }
          const v = (t - tDown) / (1 - tDown);
          const s = Math.sin(Math.PI * v);
          sy = 1 - 0.13 * s;
          sx = 1 + 0.06 * s;
        }
        apply();
      },
      my,
    );
  };

  /**
   * Hop to `target`: plain hops at `speed`, or, given `targetMs`, the hop
   * count (bounds on long trips) that arrives closest to on time.
   */
  const hopTo = async (
    target: { x: number; z: number },
    speed: number,
    targetMs: number | undefined,
    my: number,
  ) => {
    const from = getPosition();
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) return true;
    const heading = Math.atan2(dx, dz);
    // Turn only part-way toward the heading, so the face stays readable
    const face = Math.max(-HOP_MAX_TURN, Math.min(HOP_MAX_TURN, wrapAngle(heading)));
    const { n, shape } =
      targetMs === undefined
        ? { n: Math.max(1, Math.ceil(dist / HOP_MAX_LEN)), shape: plainHop(HOP_MS / speed) }
        : planHops(dist, targetMs);
    for (let i = 1; i <= n; i++) {
      const to = new THREE.Vector3(from.x + (dx * i) / n, floorY, from.z + (dz * i) / n);
      if (!(await hop(to, face, heading, shape, my))) return false;
      pitch = roll = 0;
      sx = sy = 1;
      apply();
    }
    return true;
  };

  const hopTurn = async (to: number, speed: number, my: number) => {
    if (Math.abs(wrapAngle(to - yaw)) < 1 * DEG) return true;
    setPivot(centre);
    return hop(pivotWorld.clone(), to, to, plainHop((HOP_MS * 0.8) / speed), my);
  };

  /** How far clear of an edge the base passes, going up or down a step. */
  const EDGE_MARGIN = 2;

  /**
   * One hop onto `to` (whose y is the surface landed on). The rise and fall
   * is ballistic under GRAVITY, peaking `clearance` above the higher
   * surface. The travel across happens only while the base is clear of the
   * step's edge: up, once it has risen past the new surface; down, before it
   * has dropped below the old one. Crouch and landing are a plain hop's.
   */
  const hopBetween = (to: THREE.Vector3, face: number, clearance: number, speed: number, my: number) => {
    setPivot(centre);
    const p0 = pivotWorld.clone();
    const rise = to.y - p0.y;
    // Going up, the edge is cleared by the whole body, a descender's tail
    // included (it only sinks through the floor it stands on)
    const tail = rise > 0 ? hang : 0;
    if (tail > 0) clearance = Math.max(clearance, tail + EDGE_MARGIN + HOP_HEIGHT * 0.3);
    const v = Math.sqrt(2 * GRAVITY * (Math.max(0, rise) + clearance));
    const airMs = (v + Math.sqrt(Math.max(0, v * v - 2 * GRAVITY * rise))) / GRAVITY;
    // The window of the flight (fractions of airMs) in which it travels across
    let h0 = 0;
    let h1 = 1;
    if (rise > 0) {
      const disc = v * v - 2 * GRAVITY * (rise + EDGE_MARGIN + tail);
      h0 = (disc > 0 ? (v - Math.sqrt(disc)) / GRAVITY : v / GRAVITY) / airMs;
    } else if (rise < 0) {
      h1 = (v + Math.sqrt(Math.max(0, v * v - 2 * GRAVITY * EDGE_MARGIN))) / GRAVITY / airMs;
    }
    const across = (u: number) => Math.min(1, Math.max(0, (u - h0) / (h1 - h0)));

    const crouchMs = (HOP_MS * HOP_CROUCH) / speed;
    const landMs = (HOP_MS * (1 - HOP_CROUCH - HOP_AIR)) / speed;
    const ms = crouchMs + airMs + landMs;
    const tUp = crouchMs / ms;
    const tDown = (crouchMs + airMs) / ms;
    const power = Math.min(1.6, Math.sqrt((Math.abs(rise) + clearance) / HOP_HEIGHT));
    const yaw0 = yaw;
    const dYaw = wrapAngle(face - yaw0);
    const heading = Math.atan2(to.x - p0.x, to.z - p0.z);
    const rel = heading - face;
    const reach = Math.min(1, Math.hypot(to.x - p0.x, to.z - p0.z) / HOP_MAX_LEN);
    const leanPitch = Math.cos(rel) * reach;
    const leanRoll = -Math.sin(rel) * reach;
    const floor0 = floorY;
    let launched = false;
    let landed = false;
    return frames(
      ms,
      (t) => {
        lift = 0;
        if (t < tUp) {
          const c = Math.sin((t / tUp) * (Math.PI / 2));
          sy = 1 - 0.14 * power * c;
          sx = 1 + 0.07 * power * c;
        } else if (t < tDown) {
          if (!launched) {
            launched = true;
            letter.mouth?.animateSpeak({ duration: 90 });
            if (letter.arms) armsTo(205, -25, 160);
          }
          const u = (t - tUp) / (tDown - tUp);
          const a = across(u);
          const e = easeInOut(a);
          pivotWorld.set(
            p0.x + (to.x - p0.x) * e,
            p0.y + v * u * airMs - 0.5 * GRAVITY * (u * airMs) ** 2,
            p0.z + (to.z - p0.z) * e,
          );
          // The shadow moves to the new surface once it's more over it than not
          floorY = e < 0.5 ? floor0 : to.y;
          sy = 1 + 0.12 * power * (1 - u);
          sx = 1 - 0.05 * (1 - u);
          yaw = yaw0 + dYaw * e;
          // Lean only while travelling across: upright again before it lands
          const lean = HOP_LEAN * Math.sin(Math.PI * a) * (1 - 0.5 * a);
          pitch = lean * leanPitch;
          roll = lean * leanRoll;
        } else {
          if (!landed) {
            landed = true;
            pivotWorld.copy(to);
            floorY = to.y;
            yaw = yaw0 + dYaw;
            pitch = roll = 0;
            armsRelax(200);
          }
          const w = (t - tDown) / (1 - tDown);
          const s = Math.sin(Math.PI * w);
          sy = 1 - 0.13 * s;
          sx = 1 + 0.06 * s;
        }
        apply();
      },
      my,
    );
  };

  // =========================================================================

  const getPosition = () => {
    bodyToParent(centre, tmp);
    return { x: tmp.x, z: tmp.z };
  };

  apply();

  return {
    object,
    letter,
    getPosition,
    getFloorY: () => floorY,
    setPosition: (x, z, facing = 0, floor = floorY) => {
      token++;
      moving = false;
      pitch = roll = lift = 0;
      sx = sy = 1;
      yaw = facing;
      floorY = floor;
      pivotBody.copy(centre);
      pivotWorld.set(x, floorY, z);
      apply();
    },
    getYaw: () => yaw,
    setHover: (height) => {
      hover = height;
      apply();
    },
    hopOnto: async (target, options) => {
      const my = await begin();
      const from = getPosition();
      const heading = Math.atan2(target.x - from.x, target.z - from.z);
      const face = options?.face ?? Math.max(-HOP_MAX_TURN, Math.min(HOP_MAX_TURN, wrapAngle(heading)));
      const to = new THREE.Vector3(target.x, target.floorY, target.z);
      if (await hopBetween(to, face, options?.clearance ?? HOP_HEIGHT * 0.7, options?.speed ?? 1, my)) {
        sx = sy = 1;
        apply();
      }
      if (my === token) armsRelax(250);
      end(my);
    },
    ride: async (pose, ms) => {
      const my = await begin(false);
      setPivot(centre);
      pitch = lift = 0;
      sx = sy = 1;
      shadow.visible = false;
      const done = await frames(
        ms,
        (t) => {
          const p = pose(t);
          pivotWorld.set(p.x, p.y, p.z);
          roll = p.roll;
          if (p.yaw !== undefined) yaw = p.yaw;
          apply();
        },
        my,
      );
      floorY = pivotWorld.y;
      // It rests in the last pose; a flat contact shadow only suits it level
      if (done) shadow.visible = Math.abs(roll) < 1e-3;
      end(my);
    },
    walkTo: async (target, options) => {
      const gait = options?.gait ?? "waddle";
      let speed = options?.speed ?? 1;
      const faceCamera = options?.faceCamera ?? true;
      const endYaw = options?.endYaw ?? 0;
      const my = await begin();
      if (gait === "waddle") {
        const steps = planWaddle(target, faceCamera, endYaw);
        if (options?.durationMs !== undefined) {
          speed = tempoFor(steps.reduce((t, st) => t + st.ms, 0), options.durationMs);
        }
        await runSteps(steps, speed, my);
      } else {
        // The settling turn-hop runs at plain tempo; the trip gets the rest
        const turnMs = faceCamera ? (HOP_MS * 0.8) / speed : 0;
        const tripMs =
          options?.durationMs !== undefined ? Math.max(1, options.durationMs - turnMs) : undefined;
        if ((await hopTo(target, speed, tripMs, my)) && faceCamera) await hopTurn(endYaw, speed, my);
      }
      if (my === token) armsRelax(250);
      end(my);
    },
    turnTo: async (to, options) => {
      const speed = options?.speed ?? 1;
      const my = await begin();
      if ((options?.gait ?? "waddle") === "waddle") await runSteps(turnSteps(yaw, to), speed, my);
      else await hopTurn(to, speed, my);
      if (my === token) armsRelax(250);
      end(my);
    },
    stop: async () => {
      const my = ++token;
      await settle(my);
      armsRelax(200);
      end(my);
    },
    isMoving: () => moving,
    update: updateShadow,
    dispose: () => {
      token++;
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
    },
  };
}
