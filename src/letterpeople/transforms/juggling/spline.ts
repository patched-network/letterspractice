/**
 * Cubic spline interpolation
 * Ported from sani.js/src/spline.js
 * Based on: http://www.lce.hut.fi/teaching/S-114.1100/lect_6.pdf
 */

interface Point {
  x: number;
  y: number;
}

/**
 * Polynomial class for spline calculations
 */
class Polynomial {
  coefficients: number[];

  constructor(coefficients: number[]) {
    this.coefficients = coefficients;
  }

  /**
   * Evaluate polynomial at x using Horner's method
   */
  at(x: number): number {
    return this.coefficients.reduce((result, current) => current + (x * result));
  }

  /**
   * Return derivative of this polynomial
   */
  differentiate(): Polynomial {
    return new Polynomial(
      this.coefficients.slice(0, -1).map((c, i, { length }) => (length - i) * c)
    );
  }
}

/**
 * Cubic spline interpolation through a set of points
 */
export class Spline {
  polynomials: Polynomial[];
  xs: number[];
  ys: number[];

  constructor(points: Point[], endpoint1 = 0, endpoint2 = 0) {
    this.polynomials = [];
    this.xs = points.map(({ x }) => x);
    this.ys = points.map(({ y }) => y);
    const n = this.xs.length;

    const hs: number[] = [];
    const qs: number[] = [];
    const us: number[] = [];
    const vs: number[] = [];
    const zs: number[] = [];

    // Calculate h and q values
    for (let i = 0; i < n - 1; i++) {
      hs[i] = this.xs[i + 1] - this.xs[i];
      qs[i] = (this.ys[i + 1] - this.ys[i]) / hs[i];
    }

    // Calculate u and v values
    us[0] = 2 * (hs[0] + hs[1]);
    vs[0] = 6 * (qs[1] - qs[0]);
    for (let i = 1; i < n - 1; i++) {
      us[i] = (2 * (hs[i] + hs[i - 1])) - (hs[i - 1] * hs[i - 1] / us[i - 1]);
      vs[i] = (6 * (qs[i] - qs[i - 1])) - (hs[i - 1] * vs[i - 1] / us[i - 1]);
    }

    // Calculate z values (second derivatives)
    zs[0] = endpoint1;
    zs[n - 1] = endpoint2;
    for (let i = n - 2; i > 0; i--) {
      zs[i] = (vs[i] - (hs[i] * zs[i + 1])) / us[i];
    }

    // Build polynomials for each interval
    for (let i = 0; i < n - 1; i++) {
      const d = this.ys[i];
      const c = -(hs[i] * zs[i + 1] / 6) - (hs[i] * zs[i] / 3) + ((this.ys[i + 1] - this.ys[i]) / hs[i]);
      const b = zs[i] / 2;
      const a = (zs[i + 1] - zs[i]) / (6 * hs[i]);

      this.polynomials.push(new Polynomial([a, b, c, d]));
    }
  }

  /**
   * Evaluate spline at x
   */
  at(x: number): number {
    const { xs } = this;
    const n = this.polynomials.length;

    const min = Math.min(xs[0], xs[n]);
    const max = Math.max(xs[0], xs[n]);
    if (x < min || x > max) {
      throw new Error("Out of bounds.");
    }

    let i = 0;

    // Points going left to right
    if (xs[0] < xs[n]) {
      while (i < n && x > xs[i + 1]) {
        i++;
      }
    }
    // Or right to left
    else {
      while (i < n && x < xs[i + 1]) {
        i++;
      }
    }

    return this.polynomials[i].at(x - xs[i]);
  }

  /**
   * Find the maximum y value of the spline
   */
  maximum(): Point {
    const maximum: Point = {
      x: 0,
      y: 0
    };

    const { xs } = this;

    for (let i = 0; i < this.polynomials.length; i++) {
      const der = this.polynomials[i].differentiate();

      const [a, b, c] = der.coefficients;

      // Find x values where f'(x) = 0
      const delta = Math.sqrt((b * b) - (4 * a * c));
      const x1 = ((-b + delta) / (2 * a)) + xs[i];
      const x2 = ((-b - delta) / (2 * a)) + xs[i];

      // Check if they are within visible intervals
      const min = Math.min(xs[i], xs[i + 1]);
      const max = Math.max(xs[i], xs[i + 1]);

      if (x1 >= min && x1 <= max) {
        const y = this.at(x1);
        if (y > maximum.y) {
          maximum.x = x1;
          maximum.y = y;
        }
      }

      if (x2 >= min && x2 <= max) {
        const y = this.at(x2);
        if (y > maximum.y) {
          maximum.x = x2;
          maximum.y = y;
        }
      }
    }

    return maximum;
  }
}
