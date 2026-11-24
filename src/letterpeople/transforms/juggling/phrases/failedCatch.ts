/**
 * failedCatch — Throw with artificially high catch jitter, guaranteeing a miss.
 *
 * The ball is thrown from one hand toward the opposite hand's rest position,
 * but the catching hand's jitter is cranked high enough that the catch will
 * fail. The ball ends up grounded; the catching hand reaches and misses,
 * then both hands return to rest.
 *
 * This is primarily a config wrapper around the existing throw/catch system:
 * high catch jitter + a low targetHeight produces a convincing fumble.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../../juggling/types";
import {
  createPhysicsContext,
  addBall,
  throwBall,
  catchBall,
  removeBall,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  waitForBallStatus,
  waitForHandIdle,
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
import { clamp, oppositeHand, type Hand } from "./shared";

// ── Option interface ──────────────────────────────────────────────────────

export interface FailedCatchOptions {
  /** Which hand throws. Default: "left" */
  from?: Hand;
  /**
   * Arc height in px above the throwing hand for the toss.
   * A moderate height gives the catching hand time to reach and miss.
   * Default: 25
   */
  height?: number;
  /**
   * Number of failed catches to perform. 0 = loop until stopped.
   * Default: 1 (single fumble — the most common choreographic use)
   */
  count?: number;
  /**
   * Throw jitter (0-1). A small amount makes the throw look slightly off.
   * Default: 0.15
   */
  throwJitter?: number;
  /**
   * Catch jitter floor. The actual catch jitter will be
   * max(catchJitter, 0.85) — ie always high enough to miss.
   * Default: 0.95
   */
  catchJitter?: number;
  /** Whether to alternate throwing hand each rep. Default: false */
  alternating?: boolean;
  /** Ball color hex. Default: "#3B82F6" */
  ballColor?: string;
  /**
   * If true, the grounded ball's SVG element is left in place after finish
   * (for a subsequent pickUp phrase to grab). The ball element is still
   * owned by this controller's physics context, but it won't be removed on
   * stop — only on destroy.
   *
   * Default: true
   */
  leaveBallOnFloor?: boolean;

  /** Reuse a persistent physics context instead of creating a new one. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop instead of creating a new one. */
  existingLoop?: PhysicsLoop;
  /** Reuse a persistent ball instead of creating a new one. */
  existingBall?: PhysicsBall;
}

const DEFAULT_BALL_COLOR = "#3B82F6";

/**
 * Minimum catch jitter to guarantee a miss. The physics-core catch intent
 * gives up after `predictedTime + 0.3s`, and at jitter ≥ 0.85 the initial
 * offset is large enough that the hand almost never converges in time.
 */
const MIN_MISS_JITTER = 0.85;

export async function failedCatch(
  letter: LetterInstance,
  options: FailedCatchOptions = {},
): Promise<JugglingController> {
  const startHand: Hand = options.from ?? "left";
  const height = options.height ?? 25;
  const count = options.count ?? 1;
  const throwJitter = clamp(options.throwJitter ?? 0.15, 0, 1);
  const catchJitter = Math.max(
    clamp(options.catchJitter ?? 0.95, 0, 1),
    MIN_MISS_JITTER,
  );
  const alternating = options.alternating ?? false;
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;
  const leaveBallOnFloor = options.leaveBallOnFloor ?? true;

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

  let ball: PhysicsBall = options.existingBall ?? addBall(physCtx, startHand, ballColor);
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

  // ── Finish / teardown ─────────────────────────────────────────────────

  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeInterval) { clearInterval(gazeInterval); gazeInterval = null; }

    if (ownsLoop) loop.stop();

    if (ownsBall && !leaveBallOnFloor) {
      removeAllBalls(physCtx);
    }
    // If leaving ball on floor or ball not owned, keep it for caller/shared context.

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ────────────────────────────────────────────────────────

  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    completed: lifecycle.state.stopped,
    destroy() {
      finished = true;
      if (gazeInterval) { clearInterval(gazeInterval); gazeInterval = null; }
      if (ownsLoop) loop.stop();
      if (ownsContext) removeAllBalls(physCtx);
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

  // ── Main loop ─────────────────────────────────────────────────────────

  void (async () => {
    let completed = 0;
    let currentFrom: Hand = startHand;

    while (!stopRequested && (count === 0 || completed < count)) {
      const from = currentFrom;
      const to = oppositeHand(from);
      const target = { ...physCtx.hands[to].restPosition };

      // Throw with optional slight jitter for realism
      throwBall(physCtx, from, ball, {
        target,
        targetHeight: height,
        jitter: throwJitter,
      });

      // Issue the catch with guaranteed-miss jitter
      catchBall(physCtx, to, ball, { jitter: catchJitter });

      // Wait for the ball to hit the floor (the catch should fail)
      try {
        await waitForBallStatus(ball, "grounded", undefined, 8000);

        // Ball grounded — track the drop when we don't own the context
        // (ownsContext uses the onBallGrounded callback instead)
        if (!ownsContext) {
          dropCount++;
        }
      } catch {
        // Timeout — ball might have been caught despite high jitter (rare).
        // If caught, break out; this is an edge case.
        if ((ball.status as string) === "held") {
          // Unexpected success — treat as completion anyway
          completed++;
          if (alternating) currentFrom = to;
          continue;
        }
        break;
      }

      if (stopRequested) break;

      // Wait for the catching hand to finish its give-up return
      try {
        await waitForHandIdle(physCtx, to, 3000);
      } catch {
        // Timeout on hand settle — continue anyway
      }

      // Also wait for the throwing hand to return
      try {
        await waitForHandIdle(physCtx, from, 2000);
      } catch {
        // continue
      }

      if (stopRequested) break;

      // Brief pause for dramatic effect after the drop
      await sleep(200);

      completed++;

      if (alternating) {
        currentFrom = to;
      }

      // If looping, we need a new ball for the next rep
      // (the previous one is grounded)
      if (count === 0 || completed < count) {
        // Remove the grounded ball and create a fresh one
        if (!leaveBallOnFloor) {
          removeBall(physCtx, ball);
        }
        ball = addBall(physCtx, currentFrom, ballColor);
      }
    }

    await finish();
  })();

  return controller;
}