import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  throwBall,
  catchBall,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  computeFlightTime,
  computeDwellWaitMs,
  waitForBallStatus,
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
import { clamp } from "./shared";

const DEFAULT_BALL_COLORS: [string, string] = ["#3B82F6", "#EF4444"];

export interface SyncColumnsOptions {
  /** Peak height in px above hand rest position. Default 20. */
  height?: number;
  /** Number of toss cycles. 0 = loop until stopped. Default 3. */
  count?: number;
  /** Proportion of cycle spent with balls in hand. Clamped 0.2–0.75. Default 0.42. */
  dwell?: number;
  /** 0–1 perturbation on launch vector. Clamped 0–1. Default 0. */
  throwJitter?: number;
  /** Shorthand alias for throwJitter. */
  jitter?: number;
  /** 0–1 offset on catch intercept prediction. Clamped 0–1. Default 0. */
  catchJitter?: number;
  /** Colors for [left, right] balls. */
  ballColors?: [string, string];
  /**
   * Timing offset between the two hands' throws, expressed as a fraction of
   * the ball's flight time. 0 = perfectly simultaneous (sync columns).
   * 0.5 = right hand throws when left's ball reaches apex (async columns).
   * Clamped 0–0.9. Default 0.
   */
  offset?: number;
  /** Reuse a persistent physics context. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop. */
  existingLoop?: PhysicsLoop;
  /** Reuse existing balls [leftBall, rightBall]. Must provide exactly 2. */
  existingBalls?: PhysicsBall[];
}

/**
 * Columns phrase: both hands toss to themselves (no crossing), each catching
 * its own ball.
 *
 * With `offset === 0` (default) both hands throw simultaneously — "sync columns"
 * (toss-toss-catch-catch rhythm).
 *
 * With `offset > 0` the right-hand throw is delayed by `offset × flightTime` —
 * "async columns" (left-throw, right-throw-at-apex, left-catch, right-catch).
 */
export async function syncColumns(
  letter: LetterInstance,
  options: SyncColumnsOptions = {},
): Promise<JugglingController> {
  const height = options.height ?? 20;
  const count = options.count ?? 3;
  const dwell = clamp(options.dwell ?? 0.42, 0.2, 0.75);
  const throwJit = clamp(options.throwJitter ?? options.jitter ?? 0, 0, 1);
  const catchJit = clamp(options.catchJitter ?? 0, 0, 1);
  const ballColors = options.ballColors ?? DEFAULT_BALL_COLORS;
  const offset = clamp(options.offset ?? 0, 0, 0.9);

  await letter.arms.show({ duration: 0 });

  // ── Ownership flags ─────────────────────────────────────────────────────

  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBalls = !options.existingBalls;

  // ── Lifecycle & physics setup ───────────────────────────────────────────

  const lifecycle = createControllerLifecycle();

  let dropCount = 0;

  const physCtx =
    options.existingContext ??
    createPhysicsContext(letter, {
      onBallGrounded: () => {
        dropCount++;
      },
    });

  const leftBall =
    options.existingBalls?.[0] ?? addBall(physCtx, "left", ballColors[0]);
  const rightBall =
    options.existingBalls?.[1] ?? addBall(physCtx, "right", ballColors[1]);
  if (ownsBalls) {
    leftBall.element.style.opacity = "1";
    rightBall.element.style.opacity = "1";
  }

  let stopRequested = false;
  let finished = false;

  // Start the physics loop with gaze tracking
  const loop: PhysicsLoop =
    options.existingLoop ??
    startPhysicsLoop(physCtx, (ctx) => {
      const gaze = getGazeTarget(ctx);
      lifecycle.setGazeTarget(gaze);
    });

  // When reusing an external loop, poll gaze separately
  let gazeIntervalId: ReturnType<typeof setInterval> | null = null;
  if (!ownsLoop) {
    gazeIntervalId = setInterval(() => {
      lifecycle.setGazeTarget(getGazeTarget(physCtx));
    }, 50);
  }

  const leftRest = physCtx.hands.left.restPosition;
  const rightRest = physCtx.hands.right.restPosition;
  const targetHeight = height;

  // Flight time is symmetric — same height, same-hand toss — compute once
  const flightTime = computeFlightTime(
    leftRest,
    leftRest,
    targetHeight,
    physCtx.gravity,
  );
  const dwellMs = computeDwellWaitMs(flightTime, dwell);
  const offsetMs = offset * flightTime * 1000;

  // ── Teardown ────────────────────────────────────────────────────────────

  const finish = async () => {
    if (finished) return;
    finished = true;
    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }
    if (ownsBalls) {
      leftBall.element.style.opacity = "0";
      rightBall.element.style.opacity = "0";
      removeAllBalls(physCtx); // safe: we own them all
    }
    if (ownsLoop) loop.stop();
    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ──────────────────────────────────────────────────────────

  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    completed: lifecycle.state.stopped,
    destroy() {
      finished = true;
      if (gazeIntervalId !== null) {
        clearInterval(gazeIntervalId);
        gazeIntervalId = null;
      }
      if (ownsContext) {
        removeAllBalls(physCtx);
        loop.stop();
      } else if (ownsLoop) {
        loop.stop();
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

  // ── Helpers ─────────────────────────────────────────────────────────────

  const isGrounded = (ball: typeof leftBall) =>
    (ball.status as string) === "grounded";

  // ── Async toss loop (fire-and-forget) ───────────────────────────────────

  void (async () => {
    let completed = 0;

    while (!stopRequested && (count === 0 || completed < count)) {
      if (offset <= 0) {
        // ── SYNC: both hands throw simultaneously ─────────────────────
        throwBall(physCtx, "left", leftBall, {
          target: leftRest,
          targetHeight,
          jitter: throwJit,
        });
        throwBall(physCtx, "right", rightBall, {
          target: rightRest,
          targetHeight,
          jitter: throwJit,
        });

        // Wait for both balls to be released into flight
        try {
          await Promise.all([
            waitForBallStatus(leftBall, "in-flight", undefined, 3000),
            waitForBallStatus(rightBall, "in-flight", undefined, 3000),
          ]);
        } catch {
          break;
        }

        if (stopRequested) break;
        if (isGrounded(leftBall) || isGrounded(rightBall)) break;

        // Both hands catch their own ball
        catchBall(physCtx, "left", leftBall, { jitter: catchJit });
        catchBall(physCtx, "right", rightBall, { jitter: catchJit });
      } else {
        // ── ASYNC: left throws first, right follows after offset ───────
        //
        // Rhythm: left-throw → (offset delay) → right-throw →
        //         left-catch → right-catch
        //
        // At offset ≈ 0.5 the right hand throws when the left ball
        // is near its apex, producing the classic "async columns" look.

        // 1. Left throws
        throwBall(physCtx, "left", leftBall, {
          target: leftRest,
          targetHeight,
          jitter: throwJit,
        });

        try {
          await waitForBallStatus(leftBall, "in-flight", undefined, 3000);
        } catch {
          break;
        }

        if (stopRequested || isGrounded(leftBall)) break;

        // Left hand is now in Returning state — safe to issue catch.
        // Issuing early lets the catching intent compute the intercept
        // while we wait for the offset delay.
        catchBall(physCtx, "left", leftBall, { jitter: catchJit });

        // 2. Wait for offset
        await sleep(offsetMs);
        if (stopRequested) break;

        // 3. Right throws
        throwBall(physCtx, "right", rightBall, {
          target: rightRest,
          targetHeight,
          jitter: throwJit,
        });

        try {
          await waitForBallStatus(rightBall, "in-flight", undefined, 3000);
        } catch {
          break;
        }

        if (stopRequested || isGrounded(rightBall)) break;

        // Right hand is now in Returning state — issue catch.
        catchBall(physCtx, "right", rightBall, { jitter: catchJit });
      }

      // Wait for both balls to be caught (held by their respective hand)
      try {
        await Promise.all([
          waitForBallStatus(leftBall, "held", "left", 5000),
          waitForBallStatus(rightBall, "held", "right", 5000),
        ]);
      } catch {
        break;
      }

      if (stopRequested) break;
      if (isGrounded(leftBall) || isGrounded(rightBall)) break;

      // Dwell: balls sit in hands before next toss cycle
      if (dwellMs > 0) {
        await sleep(dwellMs);
      }

      if (stopRequested) break;

      completed++;
    }

    await finish();
  })();

  return controller;
}

// ── asyncColumns convenience wrapper ──────────────────────────────────────

export interface AsyncColumnsOptions extends SyncColumnsOptions {
  /**
   * Timing offset between the two hands' throws, as a fraction of flight
   * time. Default 0.5 (right throws at left's apex).
   */
  offset?: number;
}

/**
 * Asynchronous columns: same as `syncColumns` but the right-hand throw is
 * staggered by `offset × flightTime` (default 0.5 — at the left ball's
 * apex). Produces a "left-throw, right-throw, left-catch, right-catch"
 * rhythm.
 */
export async function asyncColumns(
  letter: LetterInstance,
  options: AsyncColumnsOptions = {},
): Promise<JugglingController> {
  return syncColumns(letter, {
    ...options,
    offset: options.offset ?? 0.5,
  });
}