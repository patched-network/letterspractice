import { describe, expect, it } from 'vitest';
import { Spring, SPRINGS, springEasing } from './springMotion';

function settle(s: Spring, maxS = 5): { t: number; peak: number } {
  let t = 0;
  let peak = s.x;
  while (s.step(1 / 60) && t < maxS) {
    t += 1 / 60;
    peak = Math.max(peak, s.x);
  }
  return { t, peak };
}

describe('Spring', () => {
  it('settles on its target, a little past it on the way (enter)', () => {
    const s = new Spring(0, SPRINGS.enter);
    s.to = 100;
    const { t, peak } = settle(s);
    expect(s.x).toBe(100);
    expect(s.v).toBe(0);
    expect(t).toBeLessThan(1);
    expect(peak).toBeGreaterThan(100); // overshoots
    expect(peak).toBeLessThan(110); // by a hint
  });

  it('keeps its velocity when the target moves', () => {
    const s = new Spring(0, SPRINGS.enter);
    s.to = 100;
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    const v = s.v;
    s.to = 200; // retarget mid-flight
    expect(s.v).toBe(v);
    s.step(1 / 60);
    expect(s.v).toBeGreaterThan(v); // pulled on, not restarted
  });

  it('carries a release speed past a near target', () => {
    const s = new Spring(0, SPRINGS.enter);
    s.v = 2000; // thrown right, target where it is
    s.step(1 / 60);
    expect(s.x).toBeGreaterThan(20);
    settle(s);
    expect(s.x).toBe(0);
  });

  it('shake: a kick from rest swings both ways and comes back', () => {
    const s = new Spring(0, SPRINGS.shake);
    s.v = 380;
    let min = 0;
    let max = 0;
    while (s.step(1 / 60)) (min = Math.min(min, s.x)), (max = Math.max(max, s.x));
    expect(max).toBeGreaterThan(3);
    expect(min).toBeLessThan(-1);
    expect(s.x).toBe(0);
  });
});

describe('springEasing', () => {
  it('falls back to a plain ease-out without CSS linear()', () => {
    const e = springEasing({ stiffness: 420, damping: 24 });
    expect(e.easing).toMatch(/^cubic-bezier|^linear\(/);
    expect(e.ms).toBeGreaterThan(100);
  });
});
