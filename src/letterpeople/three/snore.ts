// letterpeople/src/three/snore.ts
//
// SPIKE: a sleeping letter snores. Its mouth opens slowly on the in-breath and
// falls shut on the out-breath, and each out-breath lets a little z go: a
// faceless lowercase z that drifts up and away, swaying, swelling and then
// shrinking to nothing. (z, the snoring sound, as the letters would have it.)
// No two z's go quite the same way: each gets its own puff out of the mouth,
// drift speed and sway.
//
// Runs on a stage ticker (so the stage renders continuously while it
// snores). stop() lets the z's in the air finish; dispose() clears at once.

import * as THREE from "three";
import { createLetter3D, type Letter3D } from "./letterMesh";
import type { Stage3D } from "./stage3d";

export interface SnoreOptions {
  /** Colour of the z's. */
  color: string;
  /** One breath, ms. Default 2600. */
  breathMs?: number;
  /** World units per second the z's drift, and which way (x). Default up and a little right. */
  drift?: { x: number; y: number };
}

export interface Snore {
  /** Stop breathing out z's; the ones in the air finish. Resolves when they have. */
  stop(): Promise<void>;
  dispose(): void;
}

/** A z's life, seconds; how big it gets (letter scale); how many can be in the air. */
const Z_LIFE = 3.2;
const Z_SCALE = 0.2;
const Z_POOL = 3;
/** Share of the breath spent breathing in (mouth opening); the rest is the out-breath. */
const IN_BREATH = 0.7;
/** Mouth openness asleep: closed-ish, and at the top of the in-breath. */
const MOUTH_REST = 0.12;
const MOUTH_OPEN = 0.55;

/**
 * Each z's own way up. The puff: a push out of the mouth, within PUFF_SPREAD
 * radians of straight up, that dies away over PUFF_TAU s (it carries the z
 * speed × tau further). Then the drift, scaled per z; a sway side to side;
 * and a slower meander on top.
 */
const PUFF_SPEED = [15, 35] as const;
const PUFF_SPREAD = 0.5;
const PUFF_TAU = 0.35;
const DRIFT_X_SCALE = [0.4, 1.6] as const;
const DRIFT_Y_SCALE = [0.85, 1.2] as const;
const SWAY_AMP = [4, 7.5] as const;
const SWAY_RATE = [2, 2.8] as const; // rad/s
const MEANDER_AMP = [0, 4] as const;
const MEANDER_RATE = [0.6, 1.2] as const; // rad/s
const TILT = [0.2, 0.38] as const; // rad

const between = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

interface Puff {
  letter: Letter3D;
  born: number;
  from: THREE.Vector3;
  /** Drift velocity, world units/s. */
  vx: number;
  vy: number;
  /** The puff's starting velocity (decays over PUFF_TAU). */
  kx: number;
  ky: number;
  /** Sway: side (±1), amplitude, rate. */
  side: number;
  swayAmp: number;
  swayRate: number;
  meanderAmp: number;
  meanderRate: number;
  meanderPhase: number;
  tilt: number;
}

export function startSnore(stage: Stage3D, sleeper: Letter3D, options: SnoreOptions): Snore {
  const breath = (options.breathMs ?? 2600) / 1000;
  const drift = options.drift ?? { x: 10, y: 34 };
  const zs: Puff[] = [];
  const pool: Letter3D[] = [];
  for (let i = 0; i < Z_POOL; i++) {
    const z = createLetter3D("z", {
      color: options.color,
      depth: 8,
      bevel: 1,
      outline: "cookie",
      shading: "standard",
      outlineWidth: 1,
      lineWidth: 20,
      showEyes: false,
      showMouth: false,
      showArms: false,
      onChange: () => stage.invalidate(),
    });
    if (!z) continue;
    z.root.visible = false;
    stage.scene.add(z.root);
    pool.push(z);
  }

  const mouthAt = () => {
    const m = sleeper.geometry.attachments.mouth;
    sleeper.content.updateWorldMatrix(true, false);
    return sleeper.content.localToWorld(new THREE.Vector3(m.x, m.y, sleeper.frontZ + 2));
  };

  let start = -1;
  let lastBreath = -1;
  let breathing = true;
  let finished: (() => void) | null = null;

  const removeTicker = stage.addTicker((tSec) => {
    if (start < 0) start = tSec;
    const t = tSec - start;

    if (breathing) {
      const n = Math.floor(t / breath);
      const p = (t / breath) % 1;
      const open = p < IN_BREATH ? Math.sin((p / IN_BREATH) * Math.PI * 0.5) : 1 - (p - IN_BREATH) / (1 - IN_BREATH);
      void sleeper.mouth?.updateShape({ openness: MOUTH_REST + (MOUTH_OPEN - MOUTH_REST) * open, mood: 0.5 });
      // Out-breath: a z goes
      if (p >= IN_BREATH && n !== lastBreath) {
        lastBreath = n;
        const free = pool.find((z) => !zs.some((live) => live.letter === z));
        if (free) {
          const angle = (Math.random() * 2 - 1) * PUFF_SPREAD;
          const speed = between(PUFF_SPEED);
          zs.push({
            letter: free,
            born: t,
            from: mouthAt(),
            vx: drift.x * between(DRIFT_X_SCALE),
            vy: drift.y * between(DRIFT_Y_SCALE),
            kx: Math.sin(angle) * speed,
            ky: Math.cos(angle) * speed,
            side: Math.random() < 0.5 ? -1 : 1,
            swayAmp: between(SWAY_AMP),
            swayRate: between(SWAY_RATE),
            meanderAmp: between(MEANDER_AMP),
            meanderRate: between(MEANDER_RATE),
            meanderPhase: Math.random() * Math.PI * 2,
            tilt: between(TILT),
          });
          free.root.visible = true;
        }
      }
    }

    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      const a = (t - z.born) / Z_LIFE;
      if (a >= 1) {
        z.letter.root.visible = false;
        zs.splice(i, 1);
        continue;
      }
      const age = t - z.born;
      const r = z.letter.root;
      // The puff's push, integrated: it carries the z speed × tau, then it's spent
      const puff = PUFF_TAU * (1 - Math.exp(-age / PUFF_TAU));
      // Every wobble starts at zero, so each z leaves from the mouth
      const sway = Math.sin(age * z.swayRate) * z.swayAmp * z.side;
      const meander = (Math.sin(age * z.meanderRate + z.meanderPhase) - Math.sin(z.meanderPhase)) * z.meanderAmp;
      r.position.set(
        z.from.x + z.vx * age + z.kx * puff + sway + meander,
        z.from.y + z.vy * age + z.ky * puff,
        z.from.z,
      );
      r.scale.setScalar(Z_SCALE * Math.pow(Math.sin(Math.PI * a), 0.6) + 0.001);
      r.rotation.z = Math.sin(age * z.swayRate + 1) * z.tilt * z.side;
    }

    if (!breathing && zs.length === 0) {
      removeTicker();
      finished?.();
      finished = null;
    }
  });

  return {
    stop() {
      breathing = false;
      return new Promise<void>((resolve) => {
        if (zs.length === 0) {
          removeTicker();
          resolve();
        } else {
          finished = resolve;
        }
      });
    },
    dispose() {
      breathing = false;
      removeTicker();
      for (const z of pool) {
        stage.scene.remove(z.root);
        z.dispose();
      }
      pool.length = 0;
      zs.length = 0;
      stage.invalidate();
    },
  };
}
