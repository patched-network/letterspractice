/**
 * tossTo2HandedCatch — Throw from one hand, both hands converge to a shared
 * catch point (midpoint between hands, elevated). The ball is caught by the
 * throwing hand at the converge point while the other hand mirrors the motion,
 * giving the visual impression of a two-handed catch.
 *
 * Uses physics-core for the throw arc. The non-throwing hand is moved via
 * `moveHand` to converge at the catch point simultaneously.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  throwBall,
  catchBall,
  moveHand,
  removeBall,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  computeFlightTime,
  computeDwellWaitMs,
  waitForBallStatus,
  waitForHandIdle,
  sleep,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from "./physics-core";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import { clamp, oppositeHand, type Hand } from "./shared";

const DEFAULT_BALL_COLOR = "#3B82F6";

export interface TossTo2HandedCatchOptions {
  /** Starting hand for the throw. Default: "left" */
  from?: Hand;
  /** Arc peak height in px above throw position. Default: 40 (high lob). */
  height?: number;
  /** Number of repetitions. 0 = loop until stopped. Default: 3 */
  count?: number;
  /** Dwell proportion (0-1). Default: 0.45 */
  dwell?: number;
  /** Throw jitter (0-1). Default: 0 */
  jitter?: number;
  /** Alternate throwing hand each rep. Default: true */
  alternating?: boolean;
  /** Ball color. Default: "#3B82F6" */
  ballColor?: string;

  /** Reuse a persistent physics context instead of creating a new one. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop instead of creating a new one. */
  existingLoop?: PhysicsLoop;
  /** Reuse a persistent ball instead of creating a new one. */
  existingBall?: PhysicsBall;
}

export async function tossTo2HandedCatch(
  letter: LetterInstance,
  options: TossTo2HandedCatchOptions = {},
): Promise<JugglingController> {
  const startHand: Hand = options.from ?? "left";
  const height = options.height ?? 40;
  const count = options.count ?? 3;
  const dwell = clamp(options.dwell ?? 0.45, 0.2, 0.8);
  const jitter = clamp(options.jitter ?? 0, 0, 1);
  const alternating = options.alternating ?? true;
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();
  let dropCount = 0;

  // Ownership flags — only clean up resources we created
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  const physCtx = options.existingContext ?? createPhysicsContext(letter, {
    onBallGrounded: () => { dropCount++; },
  });

  const ball = options.existingBall ?? addBall(physCtx, startHand, ballColor);
  if (ownsBall) {
    ball.element.style.opacity = "1";
  }

  let stopRequested = false;
  let finished = false;

  // Gaze polling interval for when we don't own the loop
  let gazeInterval: ReturnType<typeof setInterval> | null = null;

  const loop: PhysicsLoop = options.existingLoop ?? startPhysicsLoop(physCtx, (ctx) => {
    const gaze = getGazeTarget(ctx);
    lifecycle.setGazeTarget(gaze);
  });

  // When reusing an external loop, it won't call our gaze callback,
  // so poll gaze on a 50ms interval instead.
  if (!ownsLoop) {
    gazeInterval = setInterval(() => {
      const gaze = getGazeTarget(physCtx);
      lifecycle.setGazeTarget(gaze);
    }, 50);
  }

  const clearGaze = () => {
    if (gazeInterval !== null) {
      clearInterval(gazeInterval);
      gazeInterval = null;
    }
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    clearGaze();

    if (ownsLoop) {
      loop.stop();
    }

    // Return hands to rest
    moveHand(physCtx, "left", physCtx.hands.left.restPosition, 0.16);
    moveHand(physCtx, "right", physCtx.hands.right.restPosition, 0.16);
    await sleep(180);

    if (ownsBall) {
      ball.element.style.opacity = "0";
      removeBall(physCtx, ball);
    }

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  const controller: JugglingController = {
    completed: lifecycle.state.stopped,
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    destroy() {
      finished = true;
      clearGaze();

      if (ownsLoop) {
        loop.stop();
      }

      if (ownsContext) {
        removeAllBalls(physCtx);
      } else if (ownsBall) {
        removeBall(physCtx, ball);
      }

      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      letter.arms.stopAnimations();
      resolveStoppedOnce(lifecycle.state);
    },
    get gazeTarget() {
      return lifecycle.state.gazeTarget;
    },
    get active() {
      return lifecycle.state.active;
    },
    get dropCount() {
      return dropCount;
    },
  };

  lifecycle.markActive();

  void (async () => {
    let completed = 0;
    let currentFrom: Hand = startHand;

    while (!stopRequested && (count === 0 || completed < count)) {
      const from = currentFrom;
      const to = oppositeHand(from);

      const fromRest = physCtx.hands[from].restPosition;
      const toRest = physCtx.hands[to].restPosition;

      // Catch point: midpoint between hands, slightly elevated
      const catchPoint = {
        x: (fromRest.x + toRest.x) / 2,
        y: Math.min(fromRest.y, toRest.y) - 4,
      };

      const targetHeight = height;

      // Estimate flight time so we can time the off-hand convergence
      const flightTime = computeFlightTime(
        fromRest,
        catchPoint,
        targetHeight,
        physCtx.gravity,
      );

      const dwellMs = computeDwellWaitMs(flightTime, dwell);

      // Phase 1: Throw the ball toward the midpoint catch zone
      throwBall(physCtx, from, ball, {
        target: catchPoint,
        targetHeight,
        jitter,
      });

      // Wait for the ball to actually leave the throwing hand
      try {
        await waitForBallStatus(ball, "in-flight", undefined, 3000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Now issue catch on the OPPOSITE hand (the "catching" hand / leader).
      // It tracks toward the ball's intercept via the catching intent.
      catchBall(physCtx, to, ball, { jitter: 0 });

      // Move the throwing hand smoothly toward the catch point over the flight time.
      // The catching hand moves independently via catchBall spline tracking.
      // Both converge naturally to (approximately) the same point.
      const convergeDuration = Math.max(flightTime * 0.85, 0.15);
      moveHand(physCtx, from, catchPoint, convergeDuration);

      // Wait for the ball to be caught by the catching hand
      try {
        await waitForBallStatus(ball, "held", to, 6000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // ── Group cushion ────────────────────────────────────────────────
      // Both hands give downward together, absorbing the catch as a unit,
      // before returning to base. This overrides the catching hand's default
      // cushion-to-rest (physics-core eases a freshly-caught ball straight
      // back to restPosition, which reads as an instant snap-back). Instead we
      // dip both hands a little below the catch point with the ball cupped
      // between them, hold briefly, then rise to rest together.
      const cushionDip = { x: catchPoint.x, y: catchPoint.y + 11 };
      moveHand(physCtx, from, cushionDip, 0.12);
      moveHand(physCtx, to, cushionDip, 0.12);
      try {
        await waitForHandIdle(physCtx, to, 1000);
      } catch {
        // timeout — continue
      }
      if (stopRequested) break;

      // Brief two-handed hold at the bottom of the cushion
      await sleep(Math.max(50, dwellMs * 0.25));
      if (stopRequested) break;

      // Phase 2: Return both hands to rest together (gentle rise)
      moveHand(physCtx, from, fromRest, 0.2);
      moveHand(physCtx, to, toRest, 0.2);

      // Wait for both hands to settle
      try {
        await waitForHandIdle(physCtx, to, 3000);
        await waitForHandIdle(physCtx, from, 3000);
      } catch {
        // timeout — continue
      }

      if (stopRequested) break;

      // Remaining dwell
      const remainingDwell = Math.max(0, dwellMs * 0.7);
      if (remainingDwell > 0) {
        await sleep(remainingDwell);
      }

      if (stopRequested) break;

      completed++;

      if (alternating) {
        // Ball is held by `to`. Next rep throws from `to`, so just swap.
        currentFrom = to;
      }
    }

    await finish();
  })();

  return controller;
}