/**
 * oneHandedTossAndCatch — Toss ball straight up from one hand, catch with the
 * same hand at a laterally offset position.
 *
 * Distinct from tossToSelf: the catch position is offset horizontally from the
 * throw position, giving a visible "toss up, shift, catch" pattern. The hand
 * moves laterally while the ball is in the air, then catches at the new spot.
 *
 * Uses physics-core gravity simulation.
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
  lerp,
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

export interface OneHandedTossAndCatchOptions {
  /** Which hand performs the toss and catch. Default: "left" */
  hand?: Hand;
  /**
   * Height of the toss arc in pixels above the hand.
   * Higher = more hang time for the hand to reposition.
   * Default: 30
   */
  height?: number;
  /** Number of repetitions. 0 = loop until stopped. Default: 3 */
  count?: number;
  /** Dwell ratio — proportion of cycle ball sits in hand. Default: 0.38 */
  dwell?: number;
  /** Throw jitter (0-1). Default: 0 */
  jitter?: number;
  /** Ball color. Default: "#3B82F6" */
  ballColor?: string;
  /**
   * Lateral offset for the catch position, as a proportion (0-1) of the
   * distance between the hand's rest position and the opposite hand's rest.
   * 0 = catch at same spot (degenerates to tossToSelf).
   * 0.5 = catch halfway toward opposite hand.
   * 1 = catch at opposite hand's rest position.
   * Default: 0.35
   */
  offset?: number;
  /**
   * Whether to alternate the toss/catch offset direction each rep.
   * When true, odd reps offset toward center, even reps offset outward.
   * Default: true
   */
  alternating?: boolean;
  /** Reuse a persistent physics context instead of creating a new one. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop instead of starting a new one. */
  existingLoop?: PhysicsLoop;
  /** Reuse a persistent ball instead of creating a new one. */
  existingBall?: PhysicsBall;
}

export async function oneHandedTossAndCatch(
  letter: LetterInstance,
  options: OneHandedTossAndCatchOptions = {},
): Promise<JugglingController> {
  const hand: Hand = options.hand ?? "left";
  const height = options.height ?? 30;
  const count = options.count ?? 3;
  const dwell = clamp(options.dwell ?? 0.38, 0.15, 0.75);
  const jitter = clamp(options.jitter ?? 0, 0, 1);
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;
  const offset = clamp(options.offset ?? 0.35, 0, 1);
  const alternating = options.alternating ?? true;

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

  const ball = options.existingBall ?? addBall(physCtx, hand, ballColor);
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

  const handRest = physCtx.hands[hand].restPosition;
  const otherRest = physCtx.hands[oppositeHand(hand)].restPosition;

  // Compute two offset positions: one toward center, one away from center
  // "Toward center" = toward the opposite hand
  const catchPosInward = {
    x: lerp(handRest.x, otherRest.x, offset),
    y: handRest.y,
  };
  // "Outward" = away from the opposite hand (mirror of the inward offset)
  const catchPosOutward = {
    x: handRest.x - (catchPosInward.x - handRest.x),
    y: handRest.y,
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    clearGaze();

    if (ownsLoop) {
      loop.stop();
    }

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
    // Start with inward offset on first rep
    let useInward = true;

    while (!stopRequested && (count === 0 || completed < count)) {
      // Determine throw and catch positions for this rep
      const catchPos = alternating
        ? useInward
          ? catchPosInward
          : catchPosOutward
        : catchPosInward;

      // The throw position is the current hand position (rest or previous catch spot).
      // On the first rep, the hand is at rest. On subsequent reps, the hand
      // is at the previous catch position — we need to move it back or keep it.
      // For a clean pattern: throw from current position, catch at offset position.
      const throwPos =
        completed === 0
          ? { ...handRest }
          : alternating
            ? useInward
              ? { ...catchPosOutward } // previous catch was outward, now inward
              : { ...catchPosInward } // previous catch was inward, now outward
            : { ...handRest };

      // If the hand isn't at the throw position, reposition it first
      if (completed > 0 && alternating) {
        // Hand is already at the previous catch position — that IS the throw position
        // No repositioning needed; we throw from where we caught
      } else if (completed > 0 && !alternating) {
        // Non-alternating: hand needs to return to rest before next throw
        moveHand(physCtx, hand, handRest, 0.15);
        try {
          await waitForHandIdle(physCtx, hand, 2000);
        } catch {
          // timeout — continue
        }
        if (stopRequested) break;
      }

      // Throw the ball up — target is the catch position
      const targetHeight = height;
      throwBall(physCtx, hand, ball, {
        target: catchPos,
        targetHeight,
        jitter,
      });

      // Wait for ball to be released before setting up catch
      try {
        await waitForBallStatus(ball, "in-flight", undefined, 3000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // While ball is in the air, move hand to the catch position
      // Compute how long the ball will be in the air so we can time the hand move
      const flightTime = computeFlightTime(
        throwPos,
        catchPos,
        targetHeight,
        physCtx.gravity,
      );

      // Move hand to catch zone — give it ~60% of the flight time to arrive,
      // letting the catch intent handle final tracking
      const handMoveDuration = Math.max(0.08, flightTime * 0.55);
      moveHand(physCtx, hand, catchPos, handMoveDuration);

      // Wait for hand to arrive, then set up catch
      try {
        await waitForHandIdle(physCtx, hand, 2000);
      } catch {
        // timeout — set catch anyway
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Now catch with the same hand at its new position
      catchBall(physCtx, hand, ball, { jitter });

      try {
        await waitForBallStatus(ball, "held", hand, 5000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Dwell
      const dwellMs = computeDwellWaitMs(flightTime, dwell);
      if (dwellMs > 0) {
        await sleep(dwellMs);
      }

      if (stopRequested) break;

      completed++;
      if (alternating) {
        useInward = !useInward;
      }
    }

    await finish();
  })();

  return controller;
}