// letterpeople/src/three/brows.ts
//
// SPIKE: 3D eyebrows — short arched tubes floating just in front of each
// eye, so they read as part of the eye unit and never collide with the
// letter's outline. Same state model and expression presets as the SVG
// brows (raise in SVG units, negative = up; rotate in degrees about the
// brow centre), so `express(...)` means the same thing in both renderers.
//
// Lives in the letter's `svgSpace` (y-down, SVG units).

import * as THREE from "three";
import { animate, type AnimationParams, type JSAnimation } from "animejs";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Point } from "../util/geometry";
import {
  EXPRESSION_PRESETS,
  type EmotionPreset,
  type EyebrowState,
} from "../attachments/eyebrow";

const DEG = Math.PI / 180;

export interface Brow3DOptions {
  /** Brow centre in SVG units. */
  center: Point;
  z: number;
  /** Defaults match the SVG brow: width 10, thickness 2.5, arch 0.25. */
  width?: number;
  thickness?: number;
  arch?: number;
  color: THREE.ColorRepresentation;
  /** Called after every visual change (render-on-demand hosts redraw). */
  onChange?: () => void;
}

export interface Brow3D {
  readonly group: THREE.Group;
  setState(state: EyebrowState, options?: AnimationParams): Promise<void>;
  getState(): EyebrowState;
  raise(amount: number, options?: AnimationParams): Promise<void>;
  lower(amount: number, options?: AnimationParams): Promise<void>;
  rotate(degrees: number, options?: AnimationParams): Promise<void>;
  relax(options?: AnimationParams): Promise<void>;
  stopAnimations(): void;
}

export interface Brows3D {
  readonly left: Brow3D;
  readonly right: Brow3D;
  express(emotion: EmotionPreset, options?: AnimationParams): Promise<void>;
  relax(options?: AnimationParams): Promise<void>;
  stopAnimations(): void;
}

/** Arched tube with rounded ends, centred on the origin. */
function browGeometry(width: number, thickness: number, arch: number): THREE.BufferGeometry {
  const hw = width / 2;
  const r = thickness / 2;
  // Same arc as the SVG brow: ends on the centre line, control point
  // `width * arch` above it (y-down, so negative y is up).
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-hw, 0, 0),
    new THREE.Vector3(0, -width * arch, 0),
    new THREE.Vector3(hw, 0, 0),
  );
  const tube = new THREE.TubeGeometry(curve, 16, r, 8, false);
  const capL = new THREE.SphereGeometry(r, 8, 6).translate(-hw, 0, 0);
  const capR = new THREE.SphereGeometry(r, 8, 6).translate(hw, 0, 0);
  const merged = mergeGeometries([tube, capL, capR]);
  tube.dispose();
  capL.dispose();
  capR.dispose();
  return merged;
}

export function createBrow3D(opts: Brow3DOptions): Brow3D {
  const group = new THREE.Group();
  group.position.set(opts.center.x, opts.center.y, opts.z);
  group.add(
    new THREE.Mesh(
      browGeometry(opts.width ?? 10, opts.thickness ?? 2.5, opts.arch ?? 0.25),
      new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.5 }),
    ),
  );

  let state: EyebrowState = { raise: 0, rotate: 0 };
  const shown: EyebrowState = { raise: 0, rotate: 0 };
  let anim: JSAnimation | null = null;

  const apply = () => {
    group.position.y = opts.center.y + shown.raise;
    group.rotation.z = shown.rotate * DEG; // SVG clockwise == +z in svgSpace
    opts.onChange?.();
  };

  const stopAnimations = () => {
    anim?.pause();
    anim = null;
  };

  // Mirrors EyebrowControllerImpl.setState (default 250ms outQuad), but
  // tweens from what's on screen so an interrupted expression doesn't snap.
  const setState = (target: EyebrowState, options?: AnimationParams) => {
    stopAnimations();
    state = { ...target };
    const duration = typeof options?.duration === "number" ? options.duration : 250;
    if (duration <= 0) {
      Object.assign(shown, target);
      apply();
      return Promise.resolve();
    }
    anim = animate(shown, {
      raise: target.raise,
      rotate: target.rotate,
      duration,
      ease: options?.ease ?? "outQuad",
      delay: options?.delay ?? 0,
      onUpdate: apply,
    });
    return anim.then(() => undefined);
  };

  return {
    group,
    setState,
    getState: () => ({ ...state }),
    raise: (amount, options) => setState({ ...state, raise: state.raise + amount }, options),
    lower: (amount, options) => setState({ ...state, raise: state.raise - amount }, options),
    rotate: (degrees, options) => setState({ ...state, rotate: degrees }, options),
    relax: (options) => setState({ raise: 0, rotate: 0 }, options),
    stopAnimations,
  };
}

export function createBrows3D(left: Brow3D, right: Brow3D): Brows3D {
  return {
    left,
    right,
    express: async (emotion, options) => {
      const preset = EXPRESSION_PRESETS[emotion];
      await Promise.all([
        left.setState(preset.left, options),
        right.setState(preset.right, options),
      ]);
    },
    relax: async (options) => {
      await Promise.all([left.relax(options), right.relax(options)]);
    },
    stopAnimations: () => {
      left.stopAnimations();
      right.stopAnimations();
    },
  };
}
