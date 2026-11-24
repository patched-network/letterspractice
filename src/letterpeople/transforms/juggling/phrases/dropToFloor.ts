/**
 * dropToFloor — Release a ball so it falls to the ground. No catch.
 *
 * The hand lifts slightly, then releases the ball with near-zero velocity.
 * Ball falls under gravity until it hits the floor (status → 'grounded').
 * Hand returns to rest. Useful for "put the ball down" choreography.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  moveHand,
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
import { clamp, type Hand } from "./shared";

// ── Option interface ────────────────────────────────────────────────────────

export interface DropToFloorOptions {
  /** Which hand holds the ball initially. Default: 'left' */
  hand?: Hand;
  /** Slight upward lift (px) before release. Default: 8 */
  liftHeight?: number;
  /** Tiny horizontal nudge velocity on release (px/s). Positive = away from body center. Default: 5 */
  nudgeVx?: number;
  /** Ball color. Default: '#3B82F6' */
  ballColor?: string;
  /**
   * If true, the ball element is NOT removed when it hits the floor.
   * Caller is responsible for cleanup (useful for pickUp chaining).
   * Default: false
   */
  keepBallOnGround?: boolean;

  /** Reuse a persistent physics context instead of creating a new one. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop instead of creating a new one. */
  existingLoop?: PhysicsLoop;
  /** Reuse a persistent ball instead of creating a new one. */
  existingBall?: PhysicsBall;
}

// ── Result interface (extends controller with grounded ball ref) ─────────

export interface DropToFloorResult extends JugglingController {
  /** The grounded ball, available after the phrase completes. Null if keepBallOnGround is false. */
  readonly groundedBall: PhysicsBall | null;
  /** The physics context, available for chaining (e.g. pickUp). Null if not keeping ball. */
  readonly physicsContext: PhysicsContext | null;
  /** The physics loop handle, available for chaining. Null if not keeping ball. */
  readonly physicsLoop: PhysicsLoop | null;
}

const DEFAULT_BALL_COLOR = "#3B82F6";

export async function dropToFloor(
  letter: LetterInstance,
  options: DropToFloorOptions = {},
): Promise<DropToFloorResult> {
  const hand: Hand = options.hand ?? "left";
  const liftHeight = clamp(options.liftHeight ?? 8, 0, 40);
  const nudgeVx = options.nudgeVx ?? 5;
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;
  const keepBallOnGround = options.keepBallOnGround ?? false;

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();

  // Ownership flags — only clean up resources we created
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  const physCtx = options.existingContext ?? createPhysicsContext(letter);
  const ball = options.existingBall ?? addBall(physCtx, hand, ballColor);
  if (ownsBall) {
    ball.element.style.opacity = "1";
  }

  let stopRequested = false;
  let finished = false;
  let groundedBallRef: PhysicsBall | null = null;
  let keepContext = false;

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

  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeInterval) { clearInterval(gazeInterval); gazeInterval = null; }

    if (keepBallOnGround && ball.status === "grounded") {
      // Keep the ball and context alive for chaining
      groundedBallRef = ball;
      keepContext = true;
    }

    // Only stop the loop if we own it AND we're not preserving context for chaining
    if (ownsLoop && !keepContext) {
      loop.stop();
    }

    // Only remove balls if we own the ball AND we're not keeping it on the ground
    if (ownsBall && !keepBallOnGround) {
      removeAllBalls(physCtx);
    }

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  const controller: DropToFloorResult = {
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
      return 0;
    },

    get groundedBall() {
      return groundedBallRef;
    },

    get physicsContext() {
      return keepContext ? physCtx : null;
    },

    get physicsLoop() {
      return keepContext ? loop : null;
    },
  };

  lifecycle.markActive();

  // Fire-and-forget main sequence
  void (async () => {
    if (stopRequested) {
      await finish();
      return;
    }

    const restPos = physCtx.hands[hand].restPosition;

    // Phase 1: Slight lift
    if (liftHeight > 0) {
      const liftTarget = {
        x: restPos.x,
        y: restPos.y - liftHeight,
      };
      moveHand(physCtx, hand, liftTarget, 0.18);

      try {
        await waitForHandIdle(physCtx, hand, 2000);
      } catch {
        // timeout — continue
      }

      if (stopRequested) {
        await finish();
        return;
      }

      // Brief pause at top of lift
      await sleep(80);
    }

    if (stopRequested) {
      await finish();
      return;
    }

    // Phase 2: Release the ball — set to in-flight with tiny velocity
    const xSign = hand === "left" ? -1 : 1;
    ball.status = "in-flight";
    ball.heldBy = null;
    ball.velocity = { x: nudgeVx * xSign, y: -5 }; // Tiny upward + sideways nudge

    // Phase 3: Hand returns to rest
    moveHand(physCtx, hand, restPos, 0.2);

    // Phase 4: Wait for ball to hit the floor
    try {
      await waitForBallStatus(ball, "grounded", undefined, 5000);
    } catch {
      // Timeout — ball somehow didn't ground. Finish anyway.
    }

    // Small pause to let the visual settle
    await sleep(120);

    await finish();
  })();

  return controller;
}