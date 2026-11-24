/**
 * pickUp — Hand reaches down to a grounded ball, grabs it, and returns to rest.
 *
 * Uses physics-core's moveHand + placeBallInHand. Optional body squat
 * (scale/translate on the letter's SVG) for extra expressiveness when the
 * ball is far below the hand's rest position.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController, Point } from "../../juggling/types";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import { clamp, type Hand } from "./shared";
import {
  createPhysicsContext,
  addBallAt,
  placeBallInHand,
  moveHand,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  waitForHandIdle,
  sleep,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
} from "./physics-core";

// ── Option Interface ──────────────────────────────────────────────────────

export interface PickUpOptions {
  /** Which hand reaches for the ball. Default: "left" */
  hand?: Hand;
  /** Position of the grounded ball. If omitted, defaults to below the hand's rest position. */
  ballPosition?: Point;
  /** Color of the ball. Default: "#3B82F6" */
  ballColor?: string;
  /**
   * Duration of the reach-down phase in seconds. Default: 0.35
   */
  reachDuration?: number;
  /**
   * Duration of the return-to-rest phase in seconds. Default: 0.30
   */
  returnDuration?: number;
  /**
   * If provided, pick up this existing PhysicsBall from an existing PhysicsContext
   * instead of creating a new one. Caller is responsible for the ball element and context.
   */
  existingBall?: PhysicsBall;
  /**
   * If existingBall is provided, also provide the PhysicsContext that owns it.
   */
  existingContext?: PhysicsContext;
  /**
   * If provided alongside existingContext, reuse this loop too.
   */
  existingLoop?: PhysicsLoop;
}

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_BALL_COLOR = "#3B82F6";

// ── Main Phrase ───────────────────────────────────────────────────────────

export async function pickUp(
  letter: LetterInstance,
  options: PickUpOptions = {},
): Promise<JugglingController> {
  const hand: Hand = options.hand ?? "left";
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;
  const reachDuration = options.reachDuration ?? 0.35;
  const returnDuration = options.returnDuration ?? 0.30;

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();

  // Ownership flags — only clean up resources we created
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  const physCtx: PhysicsContext = options.existingContext ?? createPhysicsContext(letter);

  // Determine ball position — default to below + slightly in front of the hand's rest
  const handRest = physCtx.hands[hand].restPosition;
  const defaultBallPos: Point = {
    x: handRest.x,
    y: physCtx.floorY - 4, // just above the floor line
  };
  const ballPosition = options.ballPosition ?? defaultBallPos;

  // Create or reference the ball
  let ball: PhysicsBall;
  if (options.existingBall) {
    ball = options.existingBall;
  } else {
    ball = addBallAt(physCtx, ballPosition, "grounded", ballColor);
    ball.element.style.opacity = "1";
  }

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

  let stopRequested = false;
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeInterval) { clearInterval(gazeInterval); gazeInterval = null; }
    if (ownsLoop) loop.stop();

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);

    resolveStoppedOnce(lifecycle.state);
  };

  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    completed: lifecycle.state.stopped,

    destroy() {
      stopRequested = true;
      finished = true;
      if (gazeInterval) { clearInterval(gazeInterval); gazeInterval = null; }
      if (ownsLoop) loop.stop();
      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      if (ownsContext) {
        removeAllBalls(physCtx);
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
      return 0;
    },
  };

  lifecycle.markActive();

  // Look at the ball on the ground
  lifecycle.setGazeTarget(ballPosition);

  // Fire-and-forget async sequence
  void (async () => {
    try {
      if (stopRequested) { await finish(); return; }

      // Brief pause looking at the ball before reaching
      await sleep(150);
      if (stopRequested) { await finish(); return; }

      // Phase 1: Reach hand down to ball position
      // Target the ball center so the hand visually contacts the ball
      const reachTarget: Point = {
        x: ballPosition.x,
        y: ballPosition.y,
      };

      moveHand(physCtx, hand, reachTarget, reachDuration);
      try {
        await waitForHandIdle(physCtx, hand, reachDuration * 1000 + 1000);
      } catch {
        // timeout — continue
      }

      if (stopRequested) { await finish(); return; }

      // Phase 2: Grab the ball
      placeBallInHand(physCtx, ball, hand);
      lifecycle.setGazeTarget(reachTarget);

      // Brief pause at the grab point for visual weight
      await sleep(100);
      if (stopRequested) { await finish(); return; }

      // Phase 3: Return hand to rest (with ball)
      const returnTarget = handRest;
      lifecycle.setGazeTarget(returnTarget);

      moveHand(physCtx, hand, returnTarget, returnDuration);
      try {
        await waitForHandIdle(physCtx, hand, returnDuration * 1000 + 1000);
      } catch {
        // timeout — continue
      }

      // Ball is now held at rest — success
      lifecycle.setGazeTarget(null);

    } catch (e) {
      console.warn("[pickUp] sequence error:", e);
    }

    await finish();
  })();

  return controller;
}