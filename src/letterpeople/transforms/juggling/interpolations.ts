import { Point } from "./types";

export interface interpPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * Interpolate hand motion across a gap using Catmull-Rom splines
 * @param startContext - Points before the gap (at least 2, ideally 3)
 * @param endContext - Points after the gap (at least 2, ideally 3)
 * @param hand - Which hand ('left' or 'right') for logging
 * @returns Array of interpolated timeline entries to fill the gap
 */
export function interpolateGap(
  startContext: interpPoint[],
  endContext: interpPoint[],
  hand: 'left' | 'right'
): { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] {
  if (startContext.length < 2 || endContext.length < 2) {
    console.warn(`[${hand}] Insufficient context for interpolation`);
    return [];
  }

  // Delegate to VelocityMatched algorithm
  return interpolateGap_VelocityMatched(startContext, endContext, hand);

  /* Original Catmull-Rom implementation (unused)
  // Use the last point before gap and first point after gap as boundaries
  const p1 = startContext[startContext.length - 1];
  const p2 = endContext[0];

  // Get context for tangent estimation
  // p0 is second-to-last before gap, p3 is second after gap
  const p0 = startContext.length >= 2 ? startContext[startContext.length - 2] : p1;
  const p3 = endContext.length >= 2 ? endContext[1] : p2;

  console.log(`[${hand}] Interpolating gap from t=${p1.t.toFixed(1)} to t=${p2.t.toFixed(1)} (${(p2.t - p1.t).toFixed(1)}ms)`);

  const t0 = p0.t, t1 = p1.t, t2 = p2.t, t3 = p3.t;

  // Catmull-Rom tangent estimation
  const m1x = (p2.x - p0.x) / (t2 - t0);
  const m2x = (p3.x - p1.x) / (t3 - t1);
  const m1y = (p2.y - p0.y) / (t2 - t0);
  const m2y = (p3.y - p1.y) / (t3 - t1);

  const dt = t2 - t1;
  const SAMPLE_INTERVAL = 16; // ms
  const nSteps = Math.max(2, Math.floor(dt / SAMPLE_INTERVAL));

  const result: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] = [];

  // Generate interpolated points (skip i=0 since p1 is already in the result)
  for (let i = 1; i < nSteps; i++) {
    const t = t1 + (i / nSteps) * dt;
    const s = (t - t1) / dt; // normalized 0–1

    // Cubic Hermite basis functions
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;

    const x = h00 * p1.x + h10 * dt * m1x + h01 * p2.x + h11 * dt * m2x;
    const y = h00 * p1.y + h10 * dt * m1y + h01 * p2.y + h11 * dt * m2y;

    result.push({
      time: t,
      position: { x, y },
      hand,
      ballId: -1 // Interpolated points don't belong to a specific ball
    });
  }

  console.log(`[${hand}] Generated ${result.length} interpolated points`);
  return result;
  */
}

// ============================================================================
// ALTERNATIVE INTERPOLATION ALGORITHMS
// Swap these function names in addInterpolationBetweenCatches() to experiment
// ============================================================================

/**
 * OPTION 1: Enhanced Catmull-Rom using all 3 context points
 * Better tangent estimation with more historical data
 */
function interpolateGap_CatmullRom3Point(
  startContext: interpPoint[],
  endContext: interpPoint[],
  hand: 'left' | 'right'
): { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] {
  if (startContext.length < 3 || endContext.length < 3) {
    console.warn(`[${hand}] Insufficient context for 3-point interpolation, falling back`);
    return interpolateGap(startContext, endContext, hand);
  }

  // Use 3 points from each side
  const p0 = startContext[startContext.length - 3]; // Earlier history
  const p1 = startContext[startContext.length - 2];
  const p2 = startContext[startContext.length - 1]; // Release point

  const p3 = endContext[0]; // Catch point
  const p4 = endContext[1];
  const p5 = endContext[2]; // Future context

  console.log(`[${hand}] 3-point interpolation from t=${p2.t.toFixed(1)} to t=${p3.t.toFixed(1)}`);

  // Enhanced tangent calculation using 3 points
  // Weighted average: more weight to closer points
  const w1 = 0.7, w2 = 0.3; // Weights for closer vs farther points

  const m2x_near = (p3.x - p1.x) / (p3.t - p1.t);
  const m2x_far = (p3.x - p0.x) / (p3.t - p0.t);
  const m2x = w1 * m2x_near + w2 * m2x_far;

  const m2y_near = (p3.y - p1.y) / (p3.t - p1.t);
  const m2y_far = (p3.y - p0.y) / (p3.t - p0.t);
  const m2y = w1 * m2y_near + w2 * m2y_far;

  const m3x_near = (p4.x - p2.x) / (p4.t - p2.t);
  const m3x_far = (p5.x - p2.x) / (p5.t - p2.t);
  const m3x = w1 * m3x_near + w2 * m3x_far;

  const m3y_near = (p4.y - p2.y) / (p4.t - p2.t);
  const m3y_far = (p5.y - p2.y) / (p5.t - p2.t);
  const m3y = w1 * m3y_near + w2 * m3y_far;

  const dt = p3.t - p2.t;
  const SAMPLE_INTERVAL = 16;
  const nSteps = Math.max(2, Math.floor(dt / SAMPLE_INTERVAL));

  const result: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] = [];

  for (let i = 1; i < nSteps; i++) {
    const t = p2.t + (i / nSteps) * dt;
    const s = (t - p2.t) / dt;

    // Hermite basis
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;

    const x = h00 * p2.x + h10 * dt * m2x + h01 * p3.x + h11 * dt * m3x;
    const y = h00 * p2.y + h10 * dt * m2y + h01 * p3.y + h11 * dt * m3y;

    result.push({
      time: t,
      position: { x, y },
      hand,
      ballId: -1
    });
  }

  console.log(`[${hand}] 3-point: ${result.length} interpolated points`);
  return result;
}

/**
 * OPTION 3: Hermite with velocity constraints
 * Derives velocities from catch motion to create natural deceleration/acceleration
 */
function interpolateGap_VelocityMatched(
  startContext: interpPoint[],
  endContext: interpPoint[],
  hand: 'left' | 'right'
): { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] {
  if (startContext.length < 2 || endContext.length < 2) {
    console.warn(`[${hand}] Insufficient context for velocity-matched interpolation`);
    return [];
  }

  const p2 = startContext[startContext.length - 1]; // Release point
  const p3 = endContext[0]; // Catch point

  console.log(`[${hand}] Velocity-matched interpolation from t=${p2.t.toFixed(1)} to t=${p3.t.toFixed(1)}`);

  // Calculate velocities from catch motion (last 2-3 points)
  const v_release_x = startContext.length >= 2
    ? (p2.x - startContext[startContext.length - 2].x) / (p2.t - startContext[startContext.length - 2].t)
    : 0;
  const v_release_y = startContext.length >= 2
    ? (p2.y - startContext[startContext.length - 2].y) / (p2.t - startContext[startContext.length - 2].t)
    : 0;

  const v_catch_x = endContext.length >= 2
    ? (endContext[1].x - p3.x) / (endContext[1].t - p3.t)
    : 0;
  const v_catch_y = endContext.length >= 2
    ? (endContext[1].y - p3.y) / (endContext[1].t - p3.t)
    : 0;

  // Apply physics: deceleration after release (reduce velocity), acceleration into catch
  const decelFactor = 0.2; // Hand slows down after release (not matching ball)
  const m2x = v_release_x * decelFactor;
  const m2y = v_release_y * decelFactor;

  const accelFactor = 0.6; // Hand accelerates to match incoming ball
  const m3x = v_catch_x * accelFactor;
  const m3y = v_catch_y * accelFactor;

  const dt = p3.t - p2.t;
  const SAMPLE_INTERVAL = 16;
  const nSteps = Math.max(2, Math.floor(dt / SAMPLE_INTERVAL));

  const result: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] = [];

  for (let i = 1; i < nSteps; i++) {
    const t = p2.t + (i / nSteps) * dt;
    const s = (t - p2.t) / dt;

    // Hermite basis with velocity constraints
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;

    const x = h00 * p2.x + h10 * dt * m2x + h01 * p3.x + h11 * dt * m3x;
    const y = h00 * p2.y + h10 * dt * m2y + h01 * p3.y + h11 * dt * m3y;

    result.push({
      time: t,
      position: { x, y },
      hand,
      ballId: -1
    });
  }

  console.log(`[${hand}] Velocity-matched: ${result.length} points (v_release=${v_release_x.toFixed(1)}, v_catch=${v_catch_x.toFixed(1)})`);
  return result;
}

/**
 * OPTION 4: Cubic Bézier with pull-back and approach control points
 * Creates natural juggling motion with slight pull-back after throw
 */
function interpolateGap_Bezier(
  startContext: interpPoint[],
  endContext: interpPoint[],
  hand: 'left' | 'right'
): { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] {
  if (startContext.length < 2 || endContext.length < 2) {
    console.warn(`[${hand}] Insufficient context for Bézier interpolation`);
    return [];
  }

  // P0 = release point, P3 = catch point
  const P0 = startContext[startContext.length - 1];
  const P3 = endContext[0];

  console.log(`[${hand}] Bézier interpolation from t=${P0.t.toFixed(1)} to t=${P3.t.toFixed(1)}`);

  // Calculate throw velocity
  const v_throw_x = startContext.length >= 2
    ? (P0.x - startContext[startContext.length - 2].x) / (P0.t - startContext[startContext.length - 2].t)
    : 0;
  const v_throw_y = startContext.length >= 2
    ? (P0.y - startContext[startContext.length - 2].y) / (P0.t - startContext[startContext.length - 2].t)
    : 0;

  // Calculate catch approach velocity
  const v_catch_x = endContext.length >= 2
    ? (endContext[1].x - P3.x) / (endContext[1].t - P3.t)
    : 0;
  const v_catch_y = endContext.length >= 2
    ? (endContext[1].y - P3.y) / (endContext[1].t - P3.t)
    : 0;

  const dt = P3.t - P0.t;

  // Control points
  // P1: Pull-back after release (hand continues throw motion briefly then reverses)
  const pullbackIntensity = 0.15; // 15% pullback
  const pullbackTime = dt * 0.25; // Pullback happens in first 25% of gap
  const P1 = {
    x: P0.x + (v_throw_x * pullbackTime * (1 - pullbackIntensity)),
    y: P0.y + (v_throw_y * pullbackTime * (1 - pullbackIntensity)),
    t: P0.t + pullbackTime
  };

  // P2: Approach vector for catch (hand accelerates to meet ball)
  const approachIntensity = 0.85; // Hand is 85% matched to ball velocity
  const approachTime = dt * 0.25; // Approach happens in last 25% of gap
  const P2 = {
    x: P3.x - (v_catch_x * approachTime * approachIntensity),
    y: P3.y - (v_catch_y * approachTime * approachIntensity),
    t: P3.t - approachTime
  };

  const SAMPLE_INTERVAL = 16;
  const nSteps = Math.max(2, Math.floor(dt / SAMPLE_INTERVAL));

  const result: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] = [];

  for (let i = 1; i < nSteps; i++) {
    const s = i / nSteps; // Parameter from 0 to 1

    // Cubic Bézier formula
    const b0 = (1 - s) ** 3;
    const b1 = 3 * (1 - s) ** 2 * s;
    const b2 = 3 * (1 - s) * s ** 2;
    const b3 = s ** 3;

    const x = b0 * P0.x + b1 * P1.x + b2 * P2.x + b3 * P3.x;
    const y = b0 * P0.y + b1 * P1.y + b2 * P2.y + b3 * P3.y;
    const t = P0.t + s * dt;

    result.push({
      time: t,
      position: { x, y },
      hand,
      ballId: -1
    });
  }

  console.log(`[${hand}] Bézier: ${result.length} points (pullback=${pullbackIntensity}, approach=${approachIntensity})`);
  return result;
}


