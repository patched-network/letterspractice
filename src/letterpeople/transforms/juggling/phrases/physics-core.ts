/**
 * Physics Core — Gravity-based throw/catch simulation for juggling phrases
 *
 * Replaces per-phrase hardcoded bezier curves + duration formulas with a shared
 * gravity-based simulation. Ball flight is pure kinematics (no easing, no beziers).
 * Hand motion within intents may use easing for feel.
 *
 * Scale reference: letter SVG height ≈ 2 meters.
 *
 * @packageDocumentation
 */

import type { Point } from "../types";
import type { LetterInstance } from "../../../types";
import { createBallElement } from "../ball-renderer";
import { Spline } from "../spline";
import { getHandRestPosition, moveBall, type Hand } from "./shared";

// Re-export Hand so consumers can import from this module directly
export type { Hand } from "./shared";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type BallStatus = "in-flight" | "held" | "grounded";

export interface PhysicsBall {
  position: Point;
  velocity: Point; // px/s
  status: BallStatus;
  heldBy: Hand | null;
  element: SVGCircleElement;
  radius: number;
  id: number;
}

// ── Hand Intents ──────────────────────────────────────────────────────────

export interface IdleIntent {
  type: "idle";
}

export interface ThrowingIntent {
  type: "throwing";
  ball: PhysicsBall;
  releaseVelocity: Point; // desired velocity at release
  startPosition: Point;
  releasePosition: Point;
  elapsed: number; // seconds since intent started
  duration: number; // seconds for wind-up
}

export interface CatchingIntent {
  type: "catching";
  ball: PhysicsBall;
  jitter: number; // 0-1
  // Computed once ball enters flight:
  predictedIntercept: Point | null;
  predictedTime: number; // seconds from tracking-start to intercept
  trackingStartPosition: Point | null;
  trackingElapsed: number; // seconds since tracking started
  jitterOffset: Point; // random offset applied to intercept, decays over time
  splineDuration: number;
  splineX: Spline | null;
  splineY: Spline | null;
}

export interface CushioningIntent {
  type: "cushioning";
  ball: PhysicsBall;
  startPosition: Point;
  startVelocity: Point;
  targetPosition: Point;
  elapsed: number;
  duration: number;
}

export interface ReturningIntent {
  type: "returning";
  targetPosition: Point;
  startPosition: Point;
  startVelocity: Point;
  elapsed: number;
  duration: number;
}

export interface PositioningIntent {
  type: "positioning";
  targetPosition: Point;
  startPosition: Point;
  elapsed: number;
  duration: number;
}

export type HandIntent =
  | IdleIntent
  | ThrowingIntent
  | CatchingIntent
  | CushioningIntent
  | ReturningIntent
  | PositioningIntent;

export interface PhysicsHand {
  position: Point;
  velocity: Point; // px/s, tracked for velocity-continuous transitions
  restPosition: Point;
  side: Hand;
  intent: HandIntent;
}

// ── Command Options ───────────────────────────────────────────────────────

export interface ThrowOptions {
  /** Where ball should arrive */
  target: Point;
  /**
   * Pixels above the throwing hand's y-position for the arc peak.
   * 5 = quick flat toss. 60 = high gentle lob.
   * Default: max(15, distance * 0.4) — scales with throw distance.
   */
  targetHeight?: number;
  /**
   * 0-1. Perturbation on launch vector. Ball still obeys gravity,
   * but aim is off. Higher = more error.
   */
  jitter?: number;
}

export interface CatchOptions {
  /**
   * 0-1. Offset on intercept prediction. Hand starts toward wrong spot,
   * corrects late. Higher = more scrambling, occasional misses.
   */
  jitter?: number;
}

// ── Simulation Context ────────────────────────────────────────────────────

export interface PhysicsCallbacks {
  onBallGrounded?: (ball: PhysicsBall) => void;
  onBallCaught?: (ball: PhysicsBall, hand: Hand) => void;
  onBallReleased?: (ball: PhysicsBall, hand: Hand) => void;
}

export interface PhysicsContext {
  balls: PhysicsBall[];
  hands: Record<Hand, PhysicsHand>;
  gravity: number; // px/s², positive = downward (SVG y-down)
  pxPerMeter: number;
  floorY: number;
  time: number; // seconds elapsed in simulation
  letter: LetterInstance;
  callbacks: PhysicsCallbacks;
  _nextBallId: number;
}

// ── Loop handle ───────────────────────────────────────────────────────────

export interface PhysicsLoop {
  stop(): void;
  readonly running: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Wind-up duration before release (seconds). Short for snappy feel. */
const THROW_WINDUP_BASE = 0.10;

/** Follow-through + return after throw (seconds) */
const RETURN_DURATION = 0.18;

/** Cushion deceleration after catch (seconds) */
const CUSHION_DURATION = 0.20;

/** px proximity for catch detection */
const BASE_CATCH_RADIUS = 8;

/** Max dt to prevent spiral-of-death on tab-away (seconds) */
const MAX_DT = 0.05;

/** Minimum catch path duration to avoid degenerate spline shapes (seconds) */
const MIN_CATCH_TRACK_TIME = 0.04;

/** Real-world height in meters that a capital letter represents */
const LETTER_HEIGHT_METERS = 2;

/** Minimum flight time to prevent degenerate micro-throws (seconds) */
const MIN_FLIGHT_TIME = 0.08;

const catchSplinePoints = [
  { x: 0, y: 0 },
  { x: 5, y: 30 },
  { x: 30, y: 100 },
  { x: 95, y: 30 },
  { x: 100, y: 0 },
];
const catchSpline = new Spline(catchSplinePoints);

// ═══════════════════════════════════════════════════════════════════════════
// Scale Reference
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Derive px-per-meter from the letter's SVG bounding box.
 * Convention: letter SVG height ≈ 2 meters.
 */
export function computePxPerMeter(letter: LetterInstance): number {
  const bbox = (letter.contentGroup as unknown as SVGGraphicsElement).getBBox();
  const height = bbox.height;
  if (height <= 0) {
    console.warn("[physics-core] SVG bbox height is 0, using fallback 100px");
    return 50; // 100px / 2m
  }
  return height / LETTER_HEIGHT_METERS;
}

/**
 * Compute the floor y-coordinate (bottom of letter content group bounding box).
 * Uses contentGroup so the floor is in the same coordinate space as arms and balls.
 */
export function computeFloorY(letter: LetterInstance): number {
  const bbox = (letter.contentGroup as unknown as SVGGraphicsElement).getBBox();
  return bbox.y + bbox.height;
}

// ═══════════════════════════════════════════════════════════════════════════
// Context Creation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a physics simulation context bound to a letter instance.
 * Arms should be visible before calling this.
 */
export function createPhysicsContext(
  letter: LetterInstance,
  callbacks: PhysicsCallbacks = {},
): PhysicsContext {
  const pxPerMeter = computePxPerMeter(letter);
  const gravity = 9.8 * pxPerMeter; // px/s²
  const floorY = computeFloorY(letter);

  const leftRest = getHandRestPosition(letter, "left");
  const rightRest = getHandRestPosition(letter, "right");

  // Debug-only — uncomment when investigating physics setup.
  // console.log(
  //   `[physics-core] Created context: pxPerMeter=${pxPerMeter.toFixed(1)}, ` +
  //     `gravity=${gravity.toFixed(1)} px/s², floorY=${floorY.toFixed(1)}, ` +
  //     `leftRest=(${leftRest.x.toFixed(1)},${leftRest.y.toFixed(1)}), ` +
  //     `rightRest=(${rightRest.x.toFixed(1)},${rightRest.y.toFixed(1)})`,
  // );

  return {
    balls: [],
    hands: {
      left: {
        position: { ...leftRest },
        velocity: { x: 0, y: 0 },
        restPosition: leftRest,
        side: "left",
        intent: { type: "idle" },
      },
      right: {
        position: { ...rightRest },
        velocity: { x: 0, y: 0 },
        restPosition: rightRest,
        side: "right",
        intent: { type: "idle" },
      },
    },
    gravity,
    pxPerMeter,
    floorY,
    time: 0,
    letter,
    callbacks,
    _nextBallId: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ball Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a ball held in the specified hand.
 */
export function addBall(
  ctx: PhysicsContext,
  hand: Hand,
  color: string = "#3B82F6",
  radius: number = 4,
): PhysicsBall {
  const handState = ctx.hands[hand];
  const element = createBallElement(ctx.letter, color, radius);

  const ball: PhysicsBall = {
    position: { ...handState.position },
    velocity: { x: 0, y: 0 },
    status: "held",
    heldBy: hand,
    element,
    radius,
    id: ctx._nextBallId++,
  };

  ctx.balls.push(ball);
  moveBall(element, ball.position.x, ball.position.y, true);

  // Debug-only — uncomment when investigating ball creation.
  // console.log(
  //   `[physics-core] Ball ${ball.id} created in ${hand} hand ` +
  //     `at (${ball.position.x.toFixed(1)}, ${ball.position.y.toFixed(1)})`,
  // );
  return ball;
}

/**
 * Create a ball at an arbitrary position (e.g. grounded or in-flight).
 */
export function addBallAt(
  ctx: PhysicsContext,
  position: Point,
  status: BallStatus = "grounded",
  color: string = "#3B82F6",
  radius: number = 4,
): PhysicsBall {
  const element = createBallElement(ctx.letter, color, radius);

  const ball: PhysicsBall = {
    position: { ...position },
    velocity: { x: 0, y: 0 },
    status,
    heldBy: null,
    element,
    radius,
    id: ctx._nextBallId++,
  };

  ctx.balls.push(ball);
  moveBall(element, ball.position.x, ball.position.y, true);
  return ball;
}

/**
 * Adopt an existing SVG circle element as a PhysicsBall.
 * Used by gatherAndStop to transfer ball elements from the siteswap
 * renderer to the physics simulation without any visual gap.
 */
export function adoptBall(
  ctx: PhysicsContext,
  element: SVGCircleElement,
  position: Point,
  velocity: Point = { x: 0, y: 0 },
  status: BallStatus = "in-flight",
): PhysicsBall {
  const radius = parseFloat(element.getAttribute("r") || "4");

  const ball: PhysicsBall = {
    position: { ...position },
    velocity: { ...velocity },
    status,
    heldBy: null,
    element,
    radius,
    id: ctx._nextBallId++,
  };

  ctx.balls.push(ball);
  return ball;
}

/**
 * Remove a ball from the simulation and DOM.
 */
export function removeBall(ctx: PhysicsContext, ball: PhysicsBall): void {
  const idx = ctx.balls.indexOf(ball);
  if (idx >= 0) ctx.balls.splice(idx, 1);
  try {
    ball.element.remove();
  } catch {
    // already removed
  }
}

/**
 * Remove all balls from the simulation.
 */
export function removeAllBalls(ctx: PhysicsContext): void {
  for (const ball of ctx.balls) {
    try {
      ball.element.remove();
    } catch {
      /* noop */
    }
  }
  ctx.balls.length = 0;
}

/**
 * Place a grounded ball into a hand (pick-up, simplified).
 */
export function placeBallInHand(
  ctx: PhysicsContext,
  ball: PhysicsBall,
  hand: Hand,
): void {
  const h = ctx.hands[hand];
  ball.status = "held";
  ball.heldBy = hand;
  ball.position = { ...h.position };
  ball.velocity = { x: 0, y: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Launch Velocity Solver
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the launch velocity needed to throw a ball from `from` to `to`
 * with the arc peaking `peakHeight` pixels above the higher of the two points.
 *
 * Coordinate system: SVG y-down. "Above" = smaller y.
 *
 * @param from       Launch position
 * @param to         Target landing position
 * @param peakHeight Pixels above max(from.y, to.y) for the arc peak (always positive)
 * @param gravity    px/s², positive = downward
 * @returns          Launch velocity vector { x: vx₀, y: vy₀ } in px/s
 */
export function computeLaunchVelocity(
  from: Point,
  to: Point,
  peakHeight: number,
  gravity: number,
): Point {
  // Peak is peakHeight pixels ABOVE the higher of from/to.
  // In SVG y-down: "above" = lower y value.
  const peakY = Math.min(from.y, to.y) - Math.max(peakHeight, 1);

  // Rise: distance from launch to peak (positive upward)
  const rise = from.y - peakY;

  if (rise <= 0) {
    // Degenerate: peak is below launch. Fallback to a gentle lob.
    const fallbackRise = 5;
    const vy0 = -Math.sqrt(2 * gravity * fallbackRise);
    return { x: (to.x - from.x) * 2, y: vy0 };
  }

  // vy₀ to reach peak:
  //   At peak, vy = 0.   vy = vy₀ + g * t_peak
  //   In SVG y-down with g positive (downward): ball goes UP means vy₀ < 0
  //   0 = vy₀ + g * t_peak  →  t_peak = -vy₀ / g
  //   Using energy: 0² = vy₀² - 2 * g * rise  (rise is upward = negative displacement in y-down)
  //   Actually: Δy = vy₀*t + 0.5*g*t². From launch to peak, Δy = peakY - from.y = -rise.
  //   At peak: 0 = vy₀² + 2*g*(-rise)  →  vy₀ = -√(2*g*rise)
  const vy0 = -Math.sqrt(2 * gravity * rise);

  // Time to peak
  const timeToPeak = -vy0 / gravity;

  // Fall from peak to target: Δy = to.y - peakY (positive, target below peak)
  const fallDistance = to.y - peakY;
  if (fallDistance < 0) {
    // Target above peak — shouldn't happen, but guard against it.
    const totalTime = Math.max(timeToPeak * 2, MIN_FLIGHT_TIME);
    return { x: (to.x - from.x) / totalTime, y: vy0 };
  }

  // Time from peak to target: Δy = 0.5 * g * t²  →  t = √(2Δy/g)
  const timeFromPeak = Math.sqrt((2 * fallDistance) / gravity);
  const totalTime = Math.max(timeToPeak + timeFromPeak, MIN_FLIGHT_TIME);

  // Horizontal velocity: constant throughout flight
  const vx0 = (to.x - from.x) / totalTime;

  return { x: vx0, y: vy0 };
}

/**
 * Convenience: compute the total flight time for a throw.
 */
export function computeFlightTime(
  from: Point,
  to: Point,
  peakHeight: number,
  gravity: number,
): number {
  const peakY = Math.min(from.y, to.y) - Math.max(peakHeight, 1);
  const rise = from.y - peakY;
  if (rise <= 0) return 0.5;

  const vy0 = -Math.sqrt(2 * gravity * rise);
  const timeToPeak = -vy0 / gravity;
  const fallDistance = to.y - peakY;
  if (fallDistance < 0) return timeToPeak * 2;
  const timeFromPeak = Math.sqrt((2 * fallDistance) / gravity);
  return timeToPeak + timeFromPeak;
}

// ═══════════════════════════════════════════════════════════════════════════
// Commands: throw / catch
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Command the specified hand to throw the ball it's holding.
 *
 * Sets the hand's intent to Throwing. The tick loop handles the wind-up,
 * release, and follow-through. Ball must be held by this hand.
 */
export function throwBall(
  ctx: PhysicsContext,
  hand: Hand,
  ball: PhysicsBall,
  options: ThrowOptions,
): void {
  const handState = ctx.hands[hand];

  if (ball.status !== "held" || ball.heldBy !== hand) {
    console.warn(
      `[physics-core] throwBall: ball ${ball.id} not held by ${hand} ` +
        `(status=${ball.status}, heldBy=${ball.heldBy})`,
    );
    return;
  }

  const target = options.target;
  const distance = Math.sqrt(
    (target.x - handState.position.x) ** 2 +
      (target.y - handState.position.y) ** 2,
  );
  const targetHeight = options.targetHeight ?? Math.max(15, distance * 0.4);
  const jitter = clamp01(options.jitter ?? 0);

  // Compute ideal launch velocity
  let launchVel = computeLaunchVelocity(
    handState.position,
    target,
    targetHeight,
    ctx.gravity,
  );

  // Apply jitter: perturb angle and speed
  if (jitter > 0) {
    const angle = Math.atan2(launchVel.y, launchVel.x);
    const speed = magnitude(launchVel);
    // Up to ±17° at jitter=1, ±7.5% speed
    const angleError = (Math.random() - 0.5) * jitter * 0.35;
    const speedFactor = 1 + (Math.random() - 0.5) * jitter * 0.15;
    const newAngle = angle + angleError;
    const newSpeed = speed * speedFactor;
    launchVel = {
      x: Math.cos(newAngle) * newSpeed,
      y: Math.sin(newAngle) * newSpeed,
    };
  }

  // Release position: slightly ahead of hand in throw direction
  const throwDir = Math.atan2(launchVel.y, launchVel.x);
  const releaseOffset = 3; // px
  const releasePosition = {
    x: handState.position.x + Math.cos(throwDir) * releaseOffset,
    y: handState.position.y + Math.sin(throwDir) * releaseOffset,
  };

  // Wind-up duration: slightly longer for bigger throws
  const speed = magnitude(launchVel);
  const windupDuration = THROW_WINDUP_BASE + speed * 0.00015;

  handState.intent = {
    type: "throwing",
    ball,
    releaseVelocity: launchVel,
    startPosition: { ...handState.position },
    releasePosition,
    elapsed: 0,
    duration: windupDuration,
  };

  // Debug-only — uncomment when investigating throw trajectories.
  // console.log(
  //   `[physics-core] throwBall: ${hand} → target(${target.x.toFixed(1)},${target.y.toFixed(1)}) ` +
  //     `peakH=${targetHeight.toFixed(1)}px vel=(${launchVel.x.toFixed(1)},${launchVel.y.toFixed(1)}) ` +
  //     `jitter=${jitter.toFixed(2)}`,
  // );
}

/**
 * Command the specified hand to attempt catching a ball.
 *
 * Can be called before the ball is in-flight (e.g. right after throwBall on
 * the *other* hand). The catch intent will wait for the ball to enter flight
 * before computing the intercept and starting to track.
 *
 * For same-hand toss-to-self, call catchBall AFTER awaiting ball release
 * (otherwise it overwrites the throwing intent).
 */
export function catchBall(
  ctx: PhysicsContext,
  hand: Hand,
  ball: PhysicsBall,
  options: CatchOptions = {},
): void {
  const handState = ctx.hands[hand];
  const jitter = clamp01(options.jitter ?? 0);

  handState.intent = {
    type: "catching",
    ball,
    jitter,
    predictedIntercept: null,
    predictedTime: 0,
    trackingStartPosition: null,
    trackingElapsed: 0,
    jitterOffset: { x: 0, y: 0 },
    splineDuration: 0,
    splineX: null,
    splineY: null,
  };

  // If ball is already in-flight, compute intercept immediately
  if (ball.status === "in-flight") {
    computeInterceptForCatch(ctx, handState);
  }

  // Debug-only — uncomment when investigating catch targeting.
  // console.log(
  //   `[physics-core] catchBall: ${hand} targeting ball ${ball.id} ` +
  //     `(status=${ball.status}, jitter=${jitter.toFixed(2)})`,
  // );
}

/**
 * Compute (or re-compute) the intercept prediction for a catching intent.
 */
function computeInterceptForCatch(
  ctx: PhysicsContext,
  hand: PhysicsHand,
): void {
  const intent = hand.intent;
  if (intent.type !== "catching") return;

  const ball = intent.ball;
  if (ball.status !== "in-flight") return;

  const catchY = hand.restPosition.y;
  const intercept = predictIntercept(ball, catchY, ctx.gravity);

  if (!intercept) {
    console.warn(
      `[physics-core] Could not predict intercept for ball ${ball.id}`,
    );
    return;
  }

  intent.predictedIntercept = intercept.position;
  intent.predictedTime = Math.max(intercept.time, MIN_CATCH_TRACK_TIME);
  intent.trackingStartPosition = { ...hand.position };
  intent.trackingElapsed = 0;

  // Compute jitter offset (decays during tracking, but retains residual at high jitter)
  if (intent.jitter > 0) {
    // Offset magnitudes scale with jitter. At jitter=1, up to ±30px horizontal, ±12px vertical.
    intent.jitterOffset = {
      x: (Math.random() - 0.5) * 2 * intent.jitter * 30,
      y: (Math.random() - 0.5) * 2 * intent.jitter * 12,
    };
  } else {
    intent.jitterOffset = { x: 0, y: 0 };
  }

  const jitteredIntercept = {
    x: intent.predictedIntercept.x + intent.jitterOffset.x,
    y: intent.predictedIntercept.y + intent.jitterOffset.y,
  };

  const ballVelocityAtIntercept = {
    x: ball.velocity.x,
    y: ball.velocity.y + ctx.gravity * intent.predictedTime,
  };

  const trajectory = buildCatchSplineTrajectory(
    hand.position,
    jitteredIntercept,
    ballVelocityAtIntercept,
    intent.predictedTime,
  );

  intent.splineDuration = trajectory.duration;
  intent.splineX = trajectory.splineX;
  intent.splineY = trajectory.splineY;
}

// ═══════════════════════════════════════════════════════════════════════════
// Intercept Prediction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Predict where (and when) a ball in-flight will cross a given y-coordinate.
 *
 * Returns the position and time (seconds from now) of the intercept,
 * preferring the descending pass through catchY.
 */
export function predictIntercept(
  ball: PhysicsBall,
  catchY: number,
  gravity: number,
): { position: Point; time: number } | null {
  // Solve:  catchY = ball.y + vy*t + 0.5*g*t²
  //         0.5g * t² + vy * t + (by - catchY) = 0
  const a = 0.5 * gravity;
  const b = ball.velocity.y;
  const c = ball.position.y - catchY;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b + sqrtD) / (2 * a);
  const t2 = (-b - sqrtD) / (2 * a);

  // Filter for positive future times (at least 5ms ahead)
  const candidates = [t1, t2].filter((t) => t > 0.005);
  if (candidates.length === 0) return null;

  // Pick: if ball is going UP (vy < 0 in SVG), prefer the later root (descending pass).
  // If ball is going DOWN, prefer the earlier root (first crossing).
  let bestT: number;
  if (ball.velocity.y < 0) {
    bestT = Math.max(...candidates);
  } else {
    bestT = Math.min(...candidates);
  }

  const x = ball.position.x + ball.velocity.x * bestT;
  return { position: { x, y: catchY }, time: bestT };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tick — The Main Simulation Step
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Advance the simulation by `dt` seconds.
 *
 * This is the ONLY function that moves balls and hands. `throwBall()` and
 * `catchBall()` set intents; tick executes them.
 */
export function tick(ctx: PhysicsContext, dt: number): void {
  ctx.time += dt;

  // Tick hands first (they may release balls)
  tickHand(ctx, ctx.hands.left, dt);
  tickHand(ctx, ctx.hands.right, dt);

  // Tick balls
  for (const ball of ctx.balls) {
    tickBall(ctx, ball, dt);
  }
}

function buildCatchSplineTrajectory(
  start: Point,
  intercept: Point,
  interceptVelocity: Point,
  duration: number,
): { duration: number; splineX: Spline; splineY: Spline } {
  const safeDuration = Math.max(duration, MIN_CATCH_TRACK_TIME);
  const durationMs = safeDuration * 1000;

  const normalizedVx = interceptVelocity.x * safeDuration;
  const normalizedVy = interceptVelocity.y * safeDuration;

  const arcHeightMagnitude = Math.min(
    28,
    Math.max(
      6,
      Math.abs(intercept.y - start.y) * 0.35 + Math.abs(normalizedVy) * 0.04,
    ),
  );
  const upwardBias = interceptVelocity.y > 0 ? 1 : 0.45;
  const arcLift = arcHeightMagnitude * upwardBias;

  const xPoints = [
    { x: 0, y: start.x },
    {
      x: durationMs * 0.28,
      y: lerp(start.x, intercept.x, 0.24),
    },
    {
      x: durationMs * 0.72,
      y: lerp(start.x, intercept.x, 0.76),
    },
    { x: durationMs, y: intercept.x },
  ];

  const arcProgress1 = catchSpline.at(28);
  const arcProgress2 = catchSpline.at(72);

  const yPoints = [
    { x: 0, y: start.y },
    {
      x: durationMs * 0.28,
      y: lerp(start.y, intercept.y, 0.24) - arcLift * (arcProgress1 / 100),
    },
    {
      x: durationMs * 0.72,
      y: lerp(start.y, intercept.y, 0.76) - arcLift * (arcProgress2 / 100),
    },
    { x: durationMs, y: intercept.y },
  ];

  const endpoint1X = 0;
  const endpoint2X = ((6 * normalizedVx) / durationMs) / durationMs;
  const endpoint1Y = 0;
  const endpoint2Y = ((6 * normalizedVy) / durationMs) / durationMs;

  return {
    duration: safeDuration,
    splineX: new Spline(xPoints, endpoint1X, endpoint2X),
    splineY: new Spline(yPoints, endpoint1Y, endpoint2Y),
  };
}

function evaluateCatchSplinePosition(
  intent: CatchingIntent,
  tSeconds: number,
): Point | null {
  if (!intent.splineX || !intent.splineY) return null;
  const tMs = Math.max(0, Math.min(tSeconds, intent.splineDuration)) * 1000;
  return {
    x: intent.splineX.at(tMs),
    y: intent.splineY.at(tMs),
  };
}

// ── Ball tick ─────────────────────────────────────────────────────────────

function tickBall(ctx: PhysicsContext, ball: PhysicsBall, dt: number): void {
  switch (ball.status) {
    case "in-flight": {
      // Kinematics: x(t) = x₀ + vx*dt,  y(t) = y₀ + vy*dt + 0.5*g*dt²
      ball.position.x += ball.velocity.x * dt;
      ball.position.y += ball.velocity.y * dt + 0.5 * ctx.gravity * dt * dt;
      ball.velocity.y += ctx.gravity * dt;

      // Ground detection
      if (ball.position.y >= ctx.floorY) {
        ball.position.y = ctx.floorY;
        ball.velocity = { x: 0, y: 0 };
        ball.status = "grounded";
        ball.heldBy = null;
        ctx.callbacks.onBallGrounded?.(ball);
      }
      break;
    }

    case "held": {
      // Follow holding hand
      if (ball.heldBy) {
        const hand = ctx.hands[ball.heldBy];
        ball.position.x = hand.position.x;
        ball.position.y = hand.position.y;
        ball.velocity = { ...hand.velocity };
      }
      break;
    }

    case "grounded":
      // Static — no update
      break;
  }

  // Sync SVG element
  moveBall(ball.element, ball.position.x, ball.position.y, true);
}

// ── Hand tick ─────────────────────────────────────────────────────────────

function tickHand(ctx: PhysicsContext, hand: PhysicsHand, dt: number): void {
  const intent = hand.intent;

  switch (intent.type) {
    case "idle": {
      hand.velocity = { x: 0, y: 0 };
      break;
    }

    case "throwing": {
      intent.elapsed += dt;
      const t = Math.min(intent.elapsed / intent.duration, 1);

      // Smooth acceleration from rest to launch velocity
      const easeT = smoothstep(t);

      hand.position = {
        x: lerp(intent.startPosition.x, intent.releasePosition.x, easeT),
        y: lerp(intent.startPosition.y, intent.releasePosition.y, easeT),
      };

      // Velocity ramps toward release velocity
      hand.velocity = {
        x: intent.releaseVelocity.x * easeT,
        y: intent.releaseVelocity.y * easeT,
      };

      // Release!
      if (t >= 1) {
        const ball = intent.ball;
        ball.status = "in-flight";
        ball.heldBy = null;
        ball.velocity = { ...intent.releaseVelocity };
        ball.position = { ...hand.position };

        ctx.callbacks.onBallReleased?.(ball, hand.side);

        // Follow-through → return to rest
        hand.intent = {
          type: "returning",
          targetPosition: { ...hand.restPosition },
          startPosition: { ...hand.position },
          startVelocity: { ...hand.velocity },
          elapsed: 0,
          duration: RETURN_DURATION,
        };
      }
      break;
    }

    case "catching": {
      const ball = intent.ball;

      // If ball is not yet in-flight, wait (don't move)
      if (ball.status === "held") {
        // Ball still held by throwing hand — hold position
        break;
      }

      // If ball just entered flight and we haven't computed intercept yet
      if (ball.status === "in-flight" && !intent.predictedIntercept) {
        computeInterceptForCatch(ctx, hand);
        if (!intent.predictedIntercept) break; // couldn't compute
      }

      // Ball grounded before we could catch it (or caught by someone else)
      if (ball.status === "grounded" || (ball.status !== "in-flight")) {
        hand.intent = {
          type: "returning",
          targetPosition: { ...hand.restPosition },
          startPosition: { ...hand.position },
          startVelocity: { ...hand.velocity },
          elapsed: 0,
          duration: RETURN_DURATION,
        };
        break;
      }

      // We have an intercept — track toward it
      if (intent.predictedIntercept && intent.trackingStartPosition) {
        intent.trackingElapsed += dt;
        const trackT = Math.min(
          intent.trackingElapsed / intent.predictedTime,
          1,
        );

        const prevX = hand.position.x;
        const prevY = hand.position.y;

        const splinePosition = evaluateCatchSplinePosition(
          intent,
          intent.trackingElapsed,
        );

        if (splinePosition) {
          hand.position = splinePosition;
        } else {
          // Fallback to previous eased lerp if spline construction failed
          const jitterResidual = intent.jitter * intent.jitter * 0.5;
          const jitterDecay = Math.max(jitterResidual, 1 - trackT * trackT);
          const target = {
            x:
              intent.predictedIntercept.x +
              intent.jitterOffset.x * jitterDecay,
            y:
              intent.predictedIntercept.y +
              intent.jitterOffset.y * jitterDecay,
          };
          const easeT = smoothstep(trackT);
          hand.position = {
            x: lerp(intent.trackingStartPosition.x, target.x, easeT),
            y: lerp(intent.trackingStartPosition.y, target.y, easeT),
          };
        }

        // Numerical velocity
        if (dt > 0) {
          hand.velocity = {
            x: (hand.position.x - prevX) / dt,
            y: (hand.position.y - prevY) / dt,
          };
        }

        // Check for catch contact
        if (ball.status === "in-flight") {
          const dx = ball.position.x - hand.position.x;
          const dy = ball.position.y - hand.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const catchRadius = BASE_CATCH_RADIUS + ball.radius;

          if (dist < catchRadius && ball.velocity.y > 0) {
            // Caught!
            ball.status = "held";
            ball.heldBy = hand.side;
            ball.velocity = { x: 0, y: 0 };

            ctx.callbacks.onBallCaught?.(ball, hand.side);

            // Transition to cushioning
            hand.intent = {
              type: "cushioning",
              ball,
              startPosition: { ...hand.position },
              startVelocity: { ...hand.velocity },
              targetPosition: { ...hand.restPosition },
              elapsed: 0,
              duration: CUSHION_DURATION,
            };
          }
        }

        // If we've exceeded predicted time significantly and still no catch, give up
        if (intent.trackingElapsed > intent.predictedTime + 0.3) {
          hand.intent = {
            type: "returning",
            targetPosition: { ...hand.restPosition },
            startPosition: { ...hand.position },
            startVelocity: { ...hand.velocity },
            elapsed: 0,
            duration: RETURN_DURATION,
          };
        }
      }
      break;
    }

    case "cushioning": {
      intent.elapsed += dt;
      const t = Math.min(intent.elapsed / intent.duration, 1);
      const easeT = easeOutCubic(t);

      hand.position = {
        x: lerp(intent.startPosition.x, intent.targetPosition.x, easeT),
        y: lerp(intent.startPosition.y, intent.targetPosition.y, easeT),
      };

      hand.velocity = {
        x: lerp(intent.startVelocity.x, 0, easeT),
        y: lerp(intent.startVelocity.y, 0, easeT),
      };

      if (t >= 1) {
        hand.position = { ...intent.targetPosition };
        hand.velocity = { x: 0, y: 0 };
        hand.intent = { type: "idle" };
      }
      break;
    }

    case "returning": {
      intent.elapsed += dt;
      const t = Math.min(intent.elapsed / intent.duration, 1);
      const easeT = easeOutCubic(t);

      hand.position = {
        x: lerp(intent.startPosition.x, intent.targetPosition.x, easeT),
        y: lerp(intent.startPosition.y, intent.targetPosition.y, easeT),
      };

      hand.velocity = {
        x: lerp(intent.startVelocity.x, 0, easeT),
        y: lerp(intent.startVelocity.y, 0, easeT),
      };

      if (t >= 1) {
        hand.position = { ...intent.targetPosition };
        hand.velocity = { x: 0, y: 0 };
        hand.intent = { type: "idle" };
      }
      break;
    }

    case "positioning": {
      intent.elapsed += dt;
      const t = Math.min(intent.elapsed / intent.duration, 1);
      const easeT = smoothstep(t);

      const prevX = hand.position.x;
      const prevY = hand.position.y;

      hand.position = {
        x: lerp(intent.startPosition.x, intent.targetPosition.x, easeT),
        y: lerp(intent.startPosition.y, intent.targetPosition.y, easeT),
      };

      // Numerical velocity for held-ball tracking
      if (dt > 0) {
        hand.velocity = {
          x: (hand.position.x - prevX) / dt,
          y: (hand.position.y - prevY) / dt,
        };
      }

      if (t >= 1) {
        hand.position = { ...intent.targetPosition };
        hand.velocity = { x: 0, y: 0 };
        hand.intent = { type: "idle" };
      }
      break;
    }
  }

  // Sync arm position
  void ctx.letter.arms[hand.side].setHandPosition(hand.position, {
    duration: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// rAF-Driven Tick Loop
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a requestAnimationFrame loop that ticks the physics simulation.
 *
 * @param ctx    The physics context to tick
 * @param onTick Optional callback invoked after each tick (for rendering/debug)
 * @returns      Handle to stop the loop
 */
export function startPhysicsLoop(
  ctx: PhysicsContext,
  onTick?: (ctx: PhysicsContext) => void,
): PhysicsLoop {
  let running = true;
  let lastTimestamp: number | null = null;
  let rafId: number | null = null;

  const loop = (timestamp: number) => {
    if (!running) return;

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      rafId = requestAnimationFrame(loop);
      return;
    }

    const rawDt = (timestamp - lastTimestamp) / 1000;
    const dt = Math.min(rawDt, MAX_DT);
    lastTimestamp = timestamp;

    tick(ctx, dt);
    onTick?.(ctx);

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);

  return {
    stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    get running() {
      return running;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the current gaze target: the highest (lowest y) in-flight ball,
 * or the most recently caught ball if none are in-flight.
 */
export function getGazeTarget(ctx: PhysicsContext): Point | null {
  let bestTarget: Point | null = null;
  let bestY = Infinity;

  for (const ball of ctx.balls) {
    if (ball.status === "in-flight" && ball.position.y < bestY) {
      bestY = ball.position.y;
      bestTarget = { ...ball.position };
    }
  }

  // Fallback: track a held ball if none in flight
  if (!bestTarget) {
    for (const ball of ctx.balls) {
      if (ball.status === "held" && ball.position.y < bestY) {
        bestY = ball.position.y;
        bestTarget = { ...ball.position };
      }
    }
  }

  return bestTarget;
}

/**
 * Check if simulation has any active motion (balls in-flight, hands not idle).
 */
export function isSimulationActive(ctx: PhysicsContext): boolean {
  const anyBallMoving = ctx.balls.some((b) => b.status === "in-flight");
  const leftBusy = ctx.hands.left.intent.type !== "idle";
  const rightBusy = ctx.hands.right.intent.type !== "idle";
  return anyBallMoving || leftBusy || rightBusy;
}

/**
 * Debug: get a snapshot of simulation state as a plain object.
 */
export function getDebugSnapshot(ctx: PhysicsContext): {
  time: number;
  balls: Array<{
    id: number;
    status: BallStatus;
    position: Point;
    velocity: Point;
    heldBy: Hand | null;
  }>;
  hands: {
    left: { position: Point; velocity: Point; intent: string };
    right: { position: Point; velocity: Point; intent: string };
  };
} {
  return {
    time: ctx.time,
    balls: ctx.balls.map((b) => ({
      id: b.id,
      status: b.status,
      position: { ...b.position },
      velocity: { ...b.velocity },
      heldBy: b.heldBy,
    })),
    hands: {
      left: {
        position: { ...ctx.hands.left.position },
        velocity: { ...ctx.hands.left.velocity },
        intent: ctx.hands.left.intent.type,
      },
      right: {
        position: { ...ctx.hands.right.position },
        velocity: { ...ctx.hands.right.velocity },
        intent: ctx.hands.right.intent.type,
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Async Helpers (for sequencing throw/catch in debug & phrase routines)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait for a ball to reach a specific status.
 * Resolves immediately if ball is already in that status.
 * Rejects after timeout (default 5s).
 */
export function waitForBallStatus(
  ball: PhysicsBall,
  status: BallStatus,
  hand?: Hand,
  timeoutMs: number = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const check = () => {
      if (ball.status === status && (!hand || ball.heldBy === hand)) {
        resolve();
        return;
      }
      if (performance.now() - startTime > timeoutMs) {
        reject(
          new Error(
            `Timeout waiting for ball ${ball.id} status=${status}` +
              (hand ? ` heldBy=${hand}` : ""),
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

/**
 * Wait for a hand to become idle.
 */
export function waitForHandIdle(
  ctx: PhysicsContext,
  hand: Hand,
  timeoutMs: number = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const check = () => {
      if (ctx.hands[hand].intent.type === "idle") {
        resolve();
        return;
      }
      if (performance.now() - startTime > timeoutMs) {
        reject(new Error(`Timeout waiting for ${hand} hand to become idle`));
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

/**
 * Wait for the simulation to fully settle (all hands idle, no balls in-flight).
 */
export function waitForSettled(
  ctx: PhysicsContext,
  timeoutMs: number = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const check = () => {
      if (!isSimulationActive(ctx)) {
        resolve();
        return;
      }
      if (performance.now() - startTime > timeoutMs) {
        reject(new Error("Timeout waiting for simulation to settle"));
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Easing / Math Utilities
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Additional Commands
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Command a hand to move to a target position (with or without a held ball).
 * Uses smoothstep easing. Hand transitions to Idle on arrival.
 */
export function moveHand(
  ctx: PhysicsContext,
  hand: Hand,
  target: Point,
  duration: number = 0.2,
): void {
  const h = ctx.hands[hand];
  h.intent = {
    type: "positioning",
    targetPosition: { ...target },
    startPosition: { ...h.position },
    elapsed: 0,
    duration: Math.max(duration, 0.02),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Dwell Computation
// ═══════════════════════════════════════════════════════════════════════════

/** Approximate windup duration in ms (for dwell calculations) */
const EST_WINDUP_MS = 120;
/** Approximate cushion duration in ms (for dwell calculations) */
const EST_CUSHION_MS = 200;
/**
 * Minimum explicit in-hand dwell (ms). The dwell model subtracts ~320ms of
 * windup+cushion overhead, so for short arcs (small `height`) the computed
 * wait floors to 0 and successive tosses run back-to-back ("rapid touch").
 * This floor guarantees a perceptible settle on every catch-to-throw cycle.
 * Larger throws compute well above it, so it only binds at low heights.
 */
const MIN_DWELL_WAIT_MS = 150;

/**
 * Compute the explicit wait time (ms) the ball should sit in-hand between
 * catch-settle and next throw, given the desired dwell ratio.
 *
 * dwell = inHandTime / cycleTime, where cycleTime = flightTime + inHandTime.
 * inHandTime includes windup + cushion + explicit wait.
 *
 * @param flightTimeSeconds  Total flight time from computeFlightTime()
 * @param dwell              0–1 proportion of cycle spent in-hand
 * @returns                  Milliseconds of explicit dwell wait. 0 only when
 *                           dwell ≤ 0 (caller explicitly wants none); otherwise
 *                           at least MIN_DWELL_WAIT_MS so tosses don't rattle.
 */
export function computeDwellWaitMs(
  flightTimeSeconds: number,
  dwell: number,
): number {
  if (dwell <= 0) return 0;
  if (dwell >= 1) return 2000; // cap

  const flightMs = flightTimeSeconds * 1000;
  const inHandMs = (dwell * flightMs) / (1 - dwell);
  return Math.max(MIN_DWELL_WAIT_MS, inHandMs - EST_WINDUP_MS - EST_CUSHION_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// Easing / Math Utilities
// ═══════════════════════════════════════════════════════════════════════════

/** Linear interpolation. Exported for use by phrase routines. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function magnitude(v: Point): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Sleep helper for phrase sequencing. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}