/**
 * springMotion — springs that keep their velocity, for things a finger
 * handles (the sound rail's speaker).
 *
 * After ding (github.com/YusufCeng1z/ding, MIT; packages/core/src/motion.ts
 * and spring.ts), rebuilt on anime:
 *   - `Spring`: a mass-spring-damper on one number. Moving its target keeps
 *     its velocity, so a retarget mid-flight, or a release from a moving
 *     finger, carries on smoothly instead of restarting from rest. (anime's
 *     own spring is an easing curve: it restarts from zero velocity.)
 *   - `runSpring`: every live spring task ticks from one anime timer, so they
 *     share anime's main loop with the rest of the app's animation; the timer
 *     pauses when nothing is moving.
 *   - `springEasing`: a spring baked into a CSS linear() easing (solved by
 *     anime), for CSS transitions that should land with a little give.
 */

import { createTimer, spring, type Timer } from 'animejs';

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** Starting points, from ding's toasts. */
export const SPRINGS = {
  /** Arrival: quick, lands with a hint of overshoot. */
  enter: { stiffness: 320, damping: 26 },
  /** A change of size: liquid but controlled. */
  morph: { stiffness: 340, damping: 27 },
  /** A "no": a stiff, underdamped shake. */
  shake: { stiffness: 520, damping: 13 },
} satisfies Record<string, SpringConfig>;

export class Spring {
  v = 0;
  to: number;
  constructor(
    public x: number,
    public cfg: SpringConfig,
  ) {
    this.to = x;
  }
  /** Jump to a value and stop there. */
  snap(x: number): void {
    this.x = this.to = x;
    this.v = 0;
  }
  /** Advance dt seconds (semi-implicit Euler, fixed substeps). Returns true while still moving. */
  step(dt: number): boolean {
    const { stiffness: k, damping: c, mass: m = 1 } = this.cfg;
    const h = 1 / 240;
    for (let t = 0; t < dt; t += h) {
      const hh = Math.min(h, dt - t);
      this.v += ((-k * (this.x - this.to) - c * this.v) / m) * hh;
      this.x += this.v * hh;
    }
    if (Math.abs(this.v) < 0.5 && Math.abs(this.x - this.to) < 0.05) {
      this.x = this.to;
      this.v = 0;
      return false;
    }
    return true;
  }
}

// One anime timer for every running task
const tasks = new Set<(dt: number) => boolean>();
let timer: Timer | null = null;
let last = 0;

function tick(): void {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  for (const task of tasks) if (!task(dt)) tasks.delete(task);
  if (!tasks.size) timer?.pause();
}

/** Run `task(dt)` (seconds) each frame until it returns false. Re-adding a running task is a no-op. */
export function runSpring(task: (dt: number) => boolean): void {
  const idle = !tasks.size;
  tasks.add(task);
  if (!idle) return;
  last = performance.now();
  if (!timer) timer = createTimer({ onUpdate: tick });
  else timer.resume();
}

export function stopSpring(task: (dt: number) => boolean): void {
  tasks.delete(task);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A spring as a CSS transition easing: `linear()` sampled at 60 per second
 * over its settling time. Where linear() isn't supported: a plain ease-out.
 */
export function springEasing(cfg: SpringConfig): { easing: string; ms: number } {
  if (typeof CSS === 'undefined' || !CSS.supports('transition-timing-function', 'linear(0, 1)')) {
    return { easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', ms: 320 };
  }
  const s = spring({ stiffness: cfg.stiffness, damping: cfg.damping, mass: cfg.mass ?? 1 });
  const ms = Math.round(s.settlingDuration);
  const steps = Math.max(2, Math.ceil((ms / 1000) * 60));
  const pts = Array.from({ length: steps + 1 }, (_, i) => (i === steps ? '1' : String(+s.ease(i / steps).toFixed(4))));
  return { easing: `linear(${pts.join(',')})`, ms };
}
