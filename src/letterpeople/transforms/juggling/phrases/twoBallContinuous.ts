/**
 * twoBallContinuous — Continuous two-ball exchange phrase routine.
 *
 * The looping version of a two-ball exchange: after both balls are caught,
 * the next exchange starts immediately with no dwell pause. The `from` hand
 * alternates each exchange for a natural throw-catch-throw-catch rhythm.
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
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  computeFlightTime,
  waitForBallStatus,
  sleep,
  type PhysicsLoop,
  type PhysicsContext,
  type PhysicsBall,
  type Hand,
} from "./physics-core";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import { clamp } from "./shared";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TwoBallContinuousOptions {
  /** Peak throw height in px. Default 28. */
  height?: number;
  /**
   * Number of complete exchanges to perform.
   * 0 = loop until stopped (default). N = exactly N exchanges.
   */
  count?: number;
  /**
   * Fraction of flight time to wait before the second throw in an exchange.
   * Lower = faster staggered rhythm. Clamped 0.3–1.0. Default 0.55.
   */
  beatTiming?: number;
  /** Throw jitter 0–1. Clamped 0–1. Default 0. */
  throwJitter?: number;
  /** Catch jitter 0–1. Clamped 0–1. Default 0. */
  catchJitter?: number;
  /** Shorthand: sets both throwJitter and catchJitter if they are not provided. Default 0. */
  jitter?: number;
  /** Which hand throws first in the FIRST exchange. Alternates each exchange. Default 'left'. */
  from?: "left" | "right";
  /** Colors for the two balls: [ball1, ball2]. */
  ballColors?: [string, string];
  /** Reuse a persistent physics context. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop. */
  existingLoop?: PhysicsLoop;
  /** Reuse existing balls. Must provide exactly 2. First ball goes to the left hand. */
  existingBalls?: PhysicsBall[];
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_BALL_COLORS: [string, string] = ["#3B82F6", "#EF4444"]; // blue, red

function oppositeHand(hand: Hand): Hand {
  return hand === "left" ? "right" : "left";
}

// ── Implementation ─────────────────────────────────────────────────────────

export async function twoBallContinuous(
  letter: LetterInstance,
  options: TwoBallContinuousOptions = {},
): Promise<JugglingController> {
  const height = options.height ?? 28;
  const count = options.count ?? 0;
  const beatTiming = clamp(options.beatTiming ?? 0.55, 0.3, 1.0);
  const throwJitter = clamp(options.throwJitter ?? options.jitter ?? 0, 0, 1);
  const catchJitter = clamp(options.catchJitter ?? options.jitter ?? 0, 0, 1);
  const startFrom: Hand = options.from ?? "left";
  const ballColors = options.ballColors ?? DEFAULT_BALL_COLORS;

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();

  let dropCount = 0;

  // ── Ownership flags ────────────────────────────────────────────────────
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBalls = !options.existingBalls;

  const physCtx = options.existingContext ?? createPhysicsContext(letter, {
    onBallGrounded: () => {
      dropCount++;
    },
  });

  // Create one ball per hand (or reuse existing)
  const ballLeft = options.existingBalls?.[0] ?? addBall(physCtx, "left", ballColors[0]);
  const ballRight = options.existingBalls?.[1] ?? addBall(physCtx, "right", ballColors[1]);
  if (ownsBalls) {
    ballLeft.element.style.opacity = "1";
    ballRight.element.style.opacity = "1";
  }

  // Map hands to their initially-held ball
  const ballInHand: Record<Hand, typeof ballLeft> = {
    left: ballLeft,
    right: ballRight,
  };

  let stopRequested = false;
  let finished = false;

  // Start the physics loop with gaze tracking
  const loop: PhysicsLoop = options.existingLoop ?? startPhysicsLoop(physCtx, (ctx) => {
    const gaze = getGazeTarget(ctx);
    lifecycle.setGazeTarget(gaze);
  });

  let gazeIntervalId: ReturnType<typeof setInterval> | null = null;
  if (!ownsLoop) {
    gazeIntervalId = setInterval(() => {
      lifecycle.setGazeTarget(getGazeTarget(physCtx));
    }, 50);
  }

  // ── Finish / cleanup ──────────────────────────────────────────────────

  const finish = async () => {
    if (finished) return;
    finished = true;
    if (gazeIntervalId !== null) { clearInterval(gazeIntervalId); gazeIntervalId = null; }
    if (ownsBalls) removeAllBalls(physCtx);
    if (ownsLoop) loop.stop();
    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ─────────────────────────────────────────────────────────

  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
    completed: lifecycle.state.stopped,
    destroy() {
      finished = true;
      stopRequested = true;
      if (gazeIntervalId !== null) { clearInterval(gazeIntervalId); gazeIntervalId = null; }
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

  // ── Main loop (fire-and-forget) ────────────────────────────────────────

  void (async () => {
    let completed = 0;
    let currentFrom: Hand = startFrom;
    try {
      while (!stopRequested && (count === 0 || completed < count)) {
        const currentTo: Hand = oppositeHand(currentFrom);

        // Resolve which ball each hand currently holds
        const ballFrom = ballInHand[currentFrom];
        const ballTo = ballInHand[currentTo];

        if (!ballFrom || !ballTo) break;

        // Compute target positions (opposite hand rest positions)
        const targetForFrom = { ...physCtx.hands[currentTo].restPosition };
        const targetForTo = { ...physCtx.hands[currentFrom].restPosition };

        // Compute flight time for the first throw (used for beat timing)
        const flightTime = computeFlightTime(
          physCtx.hands[currentFrom].position,
          targetForFrom,
          height,
          physCtx.gravity,
        );

        // ── Step 1: currentFrom hand throws its ball to currentTo ────
        throwBall(physCtx, currentFrom, ballFrom, {
          target: targetForFrom,
          targetHeight: height,
          jitter: throwJitter,
        });
        // NOTE: Do NOT issue catchBall on currentTo yet — it is still
        // holding ballTo. The throwing intent below would overwrite the
        // catching intent, causing ballFrom to never be caught.

        // ── Step 2: Wait beatTiming fraction of flight time ──────────
        const beatMs = beatTiming * flightTime * 1000;
        await sleep(beatMs);

        if (stopRequested || finished) break;

        // ── Step 3: currentTo hand throws its ball to currentFrom ────
        throwBall(physCtx, currentTo, ballTo, {
          target: targetForTo,
          targetHeight: height,
          jitter: throwJitter,
        });

        // ── Step 4: Wait for ballTo to enter flight ──────────────────
        // Now both hands have thrown and are in Returning state, so both
        // are free to accept catching intents.
        try {
          await waitForBallStatus(ballTo, "in-flight", undefined, 3000);
        } catch {
          break;
        }

        if (stopRequested || finished) break;

        // ── Step 5: Issue catches — both hands are now free ──────────
        catchBall(physCtx, currentTo, ballFrom, { jitter: catchJitter });
        catchBall(physCtx, currentFrom, ballTo, { jitter: catchJitter });

        // ── Step 6: Wait for BOTH balls to be held (catches complete) ─
        try {
          await Promise.all([
            waitForBallStatus(ballFrom, "held", currentTo, 6000),
            waitForBallStatus(ballTo, "held", currentFrom, 6000),
          ]);
        } catch {
          // Timeout — likely a drop
          break;
        }

        // ── Check for drops ──────────────────────────────────────────
        if (ballFrom.status === "grounded" || ballTo.status === "grounded") {
          dropCount++;
          break;
        }

        if (stopRequested || finished) break;

        // ── Update ball-in-hand tracking (balls have swapped hands) ──
        ballInHand[currentTo] = ballFrom;
        ballInHand[currentFrom] = ballTo;

        // ── No dwell — immediately flip and continue ─────────────────
        completed++;
        currentFrom = currentTo;
      }
    } catch (e) {
      console.warn("[twoBallContinuous] Loop error:", e);
    }

    if (dropCount > 0) {
      console.debug(
        `[twoBallContinuous] Ended after ${completed} exchange(s) with ${dropCount} drop(s)`,
      );
    }

    await finish();
  })();

  return controller;
}