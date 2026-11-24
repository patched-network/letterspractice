/**
 * Physics motion formulas for juggling calculations
 * Ported from sani.js/src/motion.js
 */

export const motion = {
  /**
   * Calculate displacement using kinematic equation: s = ut + 0.5at²
   * @param u - Initial velocity
   * @param a - Acceleration
   * @param t - Time
   * @returns Displacement
   */
  s: (u: number, a: number, t: number): number => {
    return (u * t) + (0.5 * a * t * t);
  },

  /**
   * Calculate final velocity using kinematic equation: v² = u² + 2as
   * Solving for v: v = √(u² + 2as)
   * @param u - Initial velocity
   * @param a - Acceleration
   * @param s - Displacement
   * @returns Final velocity
   */
  v: (u: number, a: number, s: number): number => {
    return Math.sqrt((u * u) + (2 * a * s));
  }
};

/**
 * Standard gravity constant (m/ms²)
 * Negative because y-axis points up in sani.js coordinate system
 */
export const gravity = {
  x: 0,
  y: -9.81 / 1000
};
