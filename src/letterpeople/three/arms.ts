// letterpeople/src/three/arms.ts
//
// SPIKE: 3D arms with the same animation surface as the SVG ArmAttachment
// (rotateTo / wave / relax / setHandPosition), so sequences written against
// `letter.arms` can drive either renderer.
//
// Lives in the letter's `svgSpace` (y-down, SVG units). Angles use the SVG
// convention (0 = right, 90 = down); inside svgSpace that is exactly
// `rotation.z`, since the y flip is already applied by the parent.

import * as THREE from "three";
import { animate, type AnimationParams, type JSAnimation } from "animejs";
import type { Point } from "../util/geometry";
import type { ArmWaveOptions, ArmsWaveOptions } from "../attachments/types";
import { mirrorUpAngle, nearestRotation } from "../attachments/arms";
import { buildFist } from "./fist";

const DEG = Math.PI / 180;

export interface Arm3DOptions {
  shoulder: Point;
  /** Resting angle in degrees (SVG convention). */
  restAngle: number;
  length?: number;
  thickness?: number;
  color?: THREE.ColorRepresentation;
  /** z of the letter's back and front faces, in svgSpace. */
  backZ: number;
  frontZ: number;
  /** 0 = back face, 1 = front face. Default 1 (arms paint over the body, as in SVG). */
  shoulderDepth?: number;
  /**
   * Which side of the letter the arm is on, facing the camera: a fist's
   * thumb goes on this (outer) side. Default: the side its rest angle hangs to.
   */
  side?: "left" | "right";
  /** Called after every visual change (render-on-demand hosts redraw). */
  onChange?: () => void;
}

export interface Arm3D {
  readonly group: THREE.Group;
  rotateTo(angle: number, options?: AnimationParams): Promise<void>;
  wave(options?: ArmWaveOptions): Promise<void>;
  /** Back to the rest angle (the length is kept: see rest()). */
  relax(options?: AnimationParams): Promise<void>;
  /** Back to the rest angle and the rest length together (after a reach). */
  rest(options?: AnimationParams): Promise<void>;
  setLength(length: number, options?: AnimationParams): Promise<void>;
  /** Reach toward `target` (arm length kept to 5 … `maxLength`, default 30, as the SVG arms). */
  setHandPosition(target: Point, options?: AnimationParams, maxLength?: number): Promise<void>;
  /**
   * The hand: the usual ball, or a fist with its thumb up (fist.ts), `size`
   * tall (the thumb rises about half that again; default 12). The fist
   * stays upright whatever the arm's angle, thumb on the arm's outer side,
   * knuckles toward the letter's middle, the back of the hand away from the
   * letter: in front of it while the shoulder is at the front, behind it at
   * the back.
   */
  setHand(shape: HandShape, options?: AnimationParams & { size?: number }): Promise<void>;
  getHand(): HandShape;
  getCurrentAngle(): number;
  getCurrentLength(): number;
  getShoulderPosition(): Point;
  getHandPosition(): Point;
  /** Slide the shoulder between back (0) and front (1) face. */
  setShoulderDepth(t: number, options?: AnimationParams): Promise<void>;
  getShoulderDepth(): number;
  stopAnimations(): void;
}

export type HandShape = "ball" | "fist";

/** Fist size when none is given (finger-stack height, SVG units). */
const DEFAULT_FIST_SIZE = 12;
/** Gap between the fist and the letter's face it's held in front of (or behind). */
const FIST_CLEARANCE = 0.4;

export interface Arms3D {
  readonly left: Arm3D;
  readonly right: Arm3D;
  wave(options?: ArmsWaveOptions): Promise<void>;
  relax(options?: AnimationParams): Promise<void>;
  rest(options?: AnimationParams): Promise<void>;
  setShoulderDepth(t: number, options?: AnimationParams): Promise<void>;
  stopAnimations(): void;
}

export function createArm3D(opts: Arm3DOptions): Arm3D {
  const thickness = opts.thickness ?? 3;
  const radius = thickness / 2;
  const handRadius = thickness * 1.2; // matches SVG hand circle
  // Near-black rather than black so the key light still shows the limb's form.
  const mat = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x1c1c1c, roughness: 0.45 });

  // Pivot at the shoulder; limb built along +x and rotated about z.
  const group = new THREE.Group();
  group.position.set(opts.shoulder.x, opts.shoulder.y, 0);

  const limb = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  limb.rotation.z = -Math.PI / 2; // CapsuleGeometry runs along y
  const hand = new THREE.Mesh(new THREE.SphereGeometry(handRadius, 16, 12), mat);
  group.add(limb, hand);
  const restLength = opts.length ?? 15;
  const side = opts.side ?? (Math.cos(opts.restAngle * DEG) < 0 ? "left" : "right");

  // The fist (built on first use): `fist` sits at the hand and turns against
  // the arm to stay upright; `fistBody` inside it is the model, scaled to
  // size, mirrored to the arm's side and flipped y-up (svgSpace is y-down).
  let fist: THREE.Group | null = null;
  let fistBody: THREE.Group | null = null;
  let fistSize = DEFAULT_FIST_SIZE;
  let handShape: HandShape = "ball";
  /** 0 = ball, 1 = fist (the ball shrinks as the fist grows). */
  let fistAmount = 0;
  let shapeAnim: JSAnimation | null = null;

  let angle = opts.restAngle;
  let length = 0;
  let depth = opts.shoulderDepth ?? 1;
  let anim: JSAnimation | null = null;
  let depthAnim: JSAnimation | null = null;
  // Bumped by every command; a multi-step wave bails when superseded.
  let generation = 0;

  const buildLimb = (len: number) => {
    length = len;
    limb.geometry.dispose();
    limb.geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, len), 4, 12);
    limb.position.x = len / 2;
    hand.position.x = len;
    if (fist) fist.position.x = len;
  };

  /**
   * The fist's depth: from the arm's plane (a hand's radius off the face)
   * forward to clear the front face, or back to clear the back face
   * (mirrored in z, so the back of the hand still faces away from the letter).
   */
  const placeFistDepth = () => {
    if (!fist || !fistBody) return;
    const inFront = depth >= 0.5;
    fist.position.z = (inFront ? -1 : 1) * (handRadius - FIST_CLEARANCE);
    fistBody.scale.set((side === "left" ? 1 : -1) * fistSize, -fistSize, (inFront ? 1 : -1) * fistSize);
  };

  // Front: hand sphere just clears the face. Back: mirror of that.
  const applyDepth = () => {
    const front = opts.frontZ + handRadius;
    const back = opts.backZ - handRadius;
    group.position.z = back + (front - back) * depth;
    placeFistDepth();
    opts.onChange?.();
  };

  const place = (a: number, len: number) => {
    angle = a;
    group.rotation.z = a * DEG;
    if (fist) fist.rotation.z = -a * DEG;
    if (Math.abs(len - length) > 0.01) buildLimb(len);
    opts.onChange?.();
  };

  const disposeFist = () => {
    if (!fist) return;
    group.remove(fist);
    fist.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); // the material is the arm's
    fist = fistBody = null;
  };

  /** The fist at `size`, built (or rebuilt) as needed. */
  const ensureFist = (size: number) => {
    if (fist && size === fistSize) return;
    disposeFist();
    fistSize = size;
    fist = new THREE.Group();
    fistBody = buildFist(mat);
    fist.add(fistBody);
    fist.position.x = length;
    fist.rotation.z = -angle * DEG;
    group.add(fist);
    placeFistDepth();
  };

  const applyShape = (t: number) => {
    fistAmount = t;
    hand.visible = t < 1;
    hand.scale.setScalar(Math.max(0.001, 1 - t));
    if (fist) {
      fist.visible = t > 0;
      fist.scale.setScalar(Math.max(0.001, t));
    }
    opts.onChange?.();
  };

  buildLimb(opts.length ?? 15);
  place(angle, length);
  applyDepth();

  const stopAnimations = () => {
    generation++;
    anim?.pause();
    anim = null;
  };

  /** Tween angle (short way round) and/or length through one proxy. */
  const tween = (
    to: { angle?: number; length?: number },
    options: AnimationParams | undefined,
    defaultEase: string,
  ): Promise<void> => {
    const targetAngle = to.angle ?? angle;
    const targetLength = to.length ?? length;
    if (!options?.duration) {
      place(targetAngle, targetLength);
      return Promise.resolve();
    }
    const proxy = { angle, length };
    anim = animate(proxy, {
      angle: targetAngle,
      length: targetLength,
      duration: options.duration,
      ease: options.ease ?? defaultEase,
      delay: options.delay ?? 0,
      onUpdate: () => place(proxy.angle, proxy.length),
    });
    return anim.then(() => undefined);
  };

  const rotateTo = (a: number, options?: AnimationParams) => {
    stopAnimations();
    return tween({ angle: a }, options, "outSine");
  };

  // Mirrors ArmControllerImpl.wave
  const wave = async (options?: ArmWaveOptions) => {
    stopAnimations();
    const gen = generation;
    const startAngle = angle;
    const raiseAngle = options?.raiseAngle ?? mirrorUpAngle(opts.restAngle);
    const amplitude = options?.amplitude ?? 40;
    const count = options?.count ?? 3;
    const cycle = typeof options?.duration === "number" ? options.duration : 500;
    const half = cycle / 2;
    const liftMs = Math.max(220, half);
    if (typeof options?.delay === "number") {
      await new Promise((r) => setTimeout(r, options.delay as number));
      if (gen !== generation) return;
    }

    const raise = nearestRotation(raiseAngle, startAngle);
    const steps: [number, number, string][] = [[raise, liftMs, "outQuad"]];
    for (let i = 0; i < count; i++) {
      steps.push([raise - amplitude / 2, half, "inOutQuad"]);
      steps.push([raise + amplitude / 2, half, "inOutQuad"]);
    }
    steps.push([raise, half, "inOutQuad"]);
    steps.push([nearestRotation(startAngle, raise), liftMs, "inQuad"]);

    for (const [a, duration, ease] of steps) {
      if (gen !== generation) return;
      await tween({ angle: a }, { duration, ease }, ease);
    }
  };

  const setHandPosition = (target: Point, options?: AnimationParams, maxLength = 30) => {
    stopAnimations();
    const dx = target.x - opts.shoulder.x;
    const dy = target.y - opts.shoulder.y;
    const a = Math.atan2(dy, dx) / DEG;
    const len = Math.max(5, Math.min(maxLength, Math.hypot(dx, dy)));
    return tween({ angle: nearestRotation(a, angle), length: len }, options, "outQuad");
  };

  const setHand = (shape: HandShape, options?: AnimationParams & { size?: number }) => {
    if (shape === "fist") ensureFist(options?.size ?? fistSize);
    handShape = shape;
    shapeAnim?.pause();
    shapeAnim = null;
    const to = shape === "fist" ? 1 : 0;
    if (!options?.duration) {
      applyShape(to);
      return Promise.resolve();
    }
    const proxy = { t: fistAmount };
    shapeAnim = animate(proxy, {
      t: to,
      duration: options.duration,
      // The fist pops in with a little overshoot; going, it just shrinks away
      ease: options.ease ?? (to ? "outBack(1.6)" : "inQuad"),
      delay: options.delay ?? 0,
      onUpdate: () => applyShape(proxy.t),
    });
    return shapeAnim.then(() => undefined);
  };

  const setShoulderDepth = (t: number, options?: AnimationParams) => {
    depthAnim?.pause();
    depthAnim = null;
    if (!options?.duration) {
      depth = t;
      applyDepth();
      return Promise.resolve();
    }
    const proxy = { depth };
    depthAnim = animate(proxy, {
      depth: t,
      duration: options.duration,
      ease: options.ease ?? "inOutSine",
      delay: options.delay ?? 0,
      onUpdate: () => {
        depth = proxy.depth;
        applyDepth();
      },
    });
    return depthAnim.then(() => undefined);
  };

  return {
    group,
    rotateTo,
    wave,
    relax: (options) => rotateTo(opts.restAngle, options),
    rest: (options) => {
      stopAnimations();
      return tween({ angle: nearestRotation(opts.restAngle, angle), length: restLength }, options, "outQuad");
    },
    setLength: (len, options) => {
      stopAnimations();
      return tween({ length: len }, options, "outQuad");
    },
    setHandPosition,
    setHand,
    getHand: () => handShape,
    getCurrentAngle: () => angle,
    getCurrentLength: () => length,
    getShoulderPosition: () => ({ ...opts.shoulder }),
    getHandPosition: () => ({
      x: opts.shoulder.x + Math.cos(angle * DEG) * length,
      y: opts.shoulder.y + Math.sin(angle * DEG) * length,
    }),
    setShoulderDepth,
    getShoulderDepth: () => depth,
    stopAnimations: () => {
      stopAnimations();
      depthAnim?.pause();
      depthAnim = null;
      shapeAnim?.pause();
      shapeAnim = null;
    },
  };
}

export function createArms3D(left: Arm3D, right: Arm3D): Arms3D {
  return {
    left,
    right,
    // Mirrors ArmsGroupControllerImpl.wave: right-handed by default,
    // 'both' staggers the left arm by 150ms.
    wave: async (options) => {
      const arm = options?.arm ?? "right";
      if (arm === "left") return left.wave(options);
      if (arm === "right") return right.wave(options);
      const d = typeof options?.delay === "number" ? options.delay : 0;
      await Promise.all([
        right.wave({ ...options, delay: d }),
        left.wave({ ...options, delay: d + 150 }),
      ]);
    },
    relax: async (options) => {
      await Promise.all([left.relax(options), right.relax(options)]);
    },
    rest: async (options) => {
      await Promise.all([left.rest(options), right.rest(options)]);
    },
    setShoulderDepth: async (t, options) => {
      await Promise.all([left.setShoulderDepth(t, options), right.setShoulderDepth(t, options)]);
    },
    stopAnimations: () => {
      left.stopAnimations();
      right.stopAnimations();
    },
  };
}
