/**
 * arcPass — Physics-based arc pass between hands.
 *
 * Uses the physics-core gravity simulation instead of bezier curves.
 * Ball is thrown from one hand and caught by the opposite hand.
 * Since the hands are different, throwBall + catchBall can be issued
 * simultaneously (no sequencing issue like tossToSelf).
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  removeBall,
  removeAllBalls,
  throwBall,
  catchBall,
  startPhysicsLoop,
  getGazeTarget,
  computeFlightTime,
  computeDwellWaitMs,
  waitForBallStatus,
  sleep,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
} from "./physics-core";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import { clamp, oppositeHand, type ArcPassOptions, type Hand } from "./shared";

const DEFAULT_BALL_COLOR = "#3B82F6";

export async function arcPass(
  letter: LetterInstance,
  options: ArcPassOptions = {},
): Promise<JugglingController> {
  const startHand: Hand = options.from ?? "left";
  const height = options.height ?? 25;
  const count = options.count ?? 4;
  const dwell = clamp(options.dwell ?? 0.38, 0.18, 0.7);
  const jitter = clamp(options.jitter ?? 0, 0, 1);
  const alternating = options.alternating ?? true;
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;

  await letter.arms.show({ duration: 0 });

  // ── Ownership ────────────────────────────────────────────────────────
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  // ── Create or reuse ──────────────────────────────────────────────────
  const lifecycle = createControllerLifecycle();
  let dropCount = 0;

  const physCtx: PhysicsContext =
    options.existingContext ??
    createPhysicsContext(letter, {
      onBallGrounded: () => { dropCount++; },
    });

  const loop: PhysicsLoop =
    options.existingLoop ??
    startPhysicsLoop(physCtx, (ctx) => {
      const gaze = getGazeTarget(ctx);
      lifecycle.setGazeTarget(gaze);
    });

  // If reusing an external loop, poll gaze ourselves
  let gazeIntervalId: ReturnType<typeof setInterval> | null = null;
  if (!ownsLoop) {
    gazeIntervalId = setInterval(() => {
      lifecycle.setGazeTarget(getGazeTarget(physCtx));
    }, 50);
  }

  const ball: PhysicsBall =
    options.existingBall ?? addBall(physCtx, startHand, ballColor);

  if (ownsBall) {
    ball.element.style.opacity = "1";
  }

  let stopRequested = false;
  let finished = false;

  const targetHeight = height;

  // ── Finish / cleanup ─────────────────────────────────────────────────
  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);

    if (ownsBall) {
      ball.element.style.opacity = "0";
      removeBall(physCtx, ball);
    }
    if (ownsLoop) loop.stop();

    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ───────────────────────────────────────────────────────
  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    completed: lifecycle.state.stopped,
    destroy() {
      finished = true;
      stopRequested = true;

      if (gazeIntervalId !== null) {
        clearInterval(gazeIntervalId);
        gazeIntervalId = null;
      }

      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);

      if (ownsContext) {
        removeAllBalls(physCtx);
        loop.stop();
      } else if (ownsLoop) {
        loop.stop();
      }

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

  // ── Run the arc-pass loop asynchronously ─────────────────────────────
  void (async () => {
    let completed = 0;
    let currentFrom: Hand = startHand;

    while (!stopRequested && (count === 0 || completed < count)) {
      const from = currentFrom;
      const to = oppositeHand(from);
      const target = { ...physCtx.hands[to].restPosition };

      // Compute flight time and dwell for this specific throw
      const flightTime = computeFlightTime(
        physCtx.hands[from].position,
        target,
        targetHeight,
        physCtx.gravity,
      );
      // computeDwellWaitMs enforces a minimum settle (MIN_DWELL_WAIT_MS), so
      // cross-passes never rattle with zero dwell at small arc heights.
      const dwellMs = computeDwellWaitMs(flightTime, dwell);

      // Issue throw and catch simultaneously — different hands, no conflict
      throwBall(physCtx, from, ball, { target, targetHeight, jitter });
      catchBall(physCtx, to, ball, { jitter });

      // Wait for the ball to arrive in the catching hand
      try {
        await waitForBallStatus(ball, "held", to, 6000);
      } catch {
        break;
      }

      if (stopRequested || ball.status === "grounded") break;

      // Dwell: ball sits in hand before next throw
      if (dwellMs > 0) {
        await sleep(dwellMs);
      }

      if (stopRequested) break;

      completed++;
      if (alternating) currentFrom = to;
    }

    await finish();
  })();

  return controller;
}