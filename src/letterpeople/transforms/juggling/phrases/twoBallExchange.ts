/**
 * twoBallExchange — Physics-based two-ball crossing exchange.
 *
 * Each exchange cycle: first hand throws to opposite hand, brief beat delay,
 * then opposite hand throws back. Both balls cross in the air simultaneously
 * (offset by beatTiming). Extracted from `doTwoHandExchange()` in the
 * SiteswapPhysicsDebug view and wrapped in the standard phrase routine contract.
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
  computeDwellWaitMs,
  waitForBallStatus,
  sleep,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
  type Hand,
} from "./physics-core";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import { clamp } from "./shared";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TwoBallExchangeOptions {
  /** Peak throw height in px above the higher hand. Default 28. */
  height?: number;
  /**
   * Number of complete exchanges to perform.
   * 1 = single crossing pair, 0 = loop until stopped. Default 1.
   */
  count?: number;
  /**
   * Fraction of the first ball's flight time to wait before the second hand
   * throws. Clamped to [0.3, 1.0]. Default 0.55.
   *
   * Lower values produce a tighter crossing; higher values make the throws
   * more sequential.
   */
  beatTiming?: number;
  /** Throw jitter 0–1. Clamped to [0, 1]. Default 0. */
  throwJitter?: number;
  /** Catch jitter 0–1. Clamped to [0, 1]. Default 0. */
  catchJitter?: number;
  /** Shorthand applied to both throw and catch jitter when individual values are not set. */
  jitter?: number;
  /** Dwell ratio between exchanges. Default 0.42. */
  dwell?: number;
  /** Which hand throws first. Default 'left'. */
  from?: "left" | "right";
  /** Colors for the two balls: [firstHandBall, secondHandBall]. */
  ballColors?: [string, string];
  /** Reuse a persistent physics context. */
  existingContext?: PhysicsContext;
  /** Reuse a persistent physics loop. */
  existingLoop?: PhysicsLoop;
  /** Reuse existing balls. Must provide exactly 2. First ball goes to the `from` hand. */
  existingBalls?: PhysicsBall[];
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_BALL_COLORS: [string, string] = ["#3B82F6", "#EF4444"]; // blue, red
const DEFAULT_BALL_RADIUS = 4;

// ── Implementation ─────────────────────────────────────────────────────────

export async function twoBallExchange(
  letter: LetterInstance,
  options: TwoBallExchangeOptions = {},
): Promise<JugglingController> {
  const startHand: Hand = options.from ?? "left";
  const otherHand: Hand = startHand === "left" ? "right" : "left";
  const height = options.height ?? 28;
  const count = options.count ?? 1;
  const beatTiming = clamp(options.beatTiming ?? 0.55, 0.3, 1.0);
  const throwJitter = clamp(options.throwJitter ?? options.jitter ?? 0, 0, 1);
  const catchJitter = clamp(options.catchJitter ?? options.jitter ?? 0, 0, 1);
  const dwell = options.dwell ?? 0.42;
  const ballColors = options.ballColors ?? DEFAULT_BALL_COLORS;

  // ── Ownership flags ────────────────────────────────────────────────────

  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBalls = !options.existingBalls;

  // ── Setup ──────────────────────────────────────────────────────────────

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();

  let stopRequested = false;
  let finished = false;
  let dropCount = 0;
  let completedExchanges = 0;

  const physCtx = options.existingContext ?? createPhysicsContext(letter, {
    onBallGrounded: () => {
      dropCount++;
    },
  });

  // One ball per hand
  const ballA = options.existingBalls?.[0] ?? addBall(physCtx, startHand, ballColors[0], DEFAULT_BALL_RADIUS);
  const ballB = options.existingBalls?.[1] ?? addBall(physCtx, otherHand, ballColors[1], DEFAULT_BALL_RADIUS);
  if (ownsBalls) {
    ballA.element.style.opacity = "1";
    ballB.element.style.opacity = "1";
  }

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

  // ── Finish (idempotent teardown) ───────────────────────────────────────

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

  // ── Main exchange loop (async, fire-and-forget) ────────────────────────

  void (async () => {
    const ctx = physCtx;

    // Cache rest positions — these are stable for the letter's current pose
    const leftRest = { ...ctx.hands.left.restPosition };
    const rightRest = { ...ctx.hands.right.restPosition };

    // Map hand → rest target (where a ball thrown TO that hand should land)
    const restOf: Record<Hand, { x: number; y: number }> = {
      left: leftRest,
      right: rightRest,
    };

    // Which ball starts in which hand
    // ballA starts in startHand, ballB starts in otherHand
    let firstBall = ballA; // ball in the hand that throws first
    let secondBall = ballB; // ball in the hand that throws second
    let firstHand: Hand = startHand;
    let secondHand: Hand = otherHand;

    try {
      while (!stopRequested && !finished && (count === 0 || completedExchanges < count)) {
        // ── 1. First hand throws to second hand's rest position ──────
        const firstTarget = { ...restOf[secondHand] };

        throwBall(ctx, firstHand, firstBall, {
          target: firstTarget,
          targetHeight: height,
          jitter: throwJitter,
        });
        // NOTE: Do NOT issue catchBall on secondHand yet — it is still
        // holding secondBall. The throwing intent below would overwrite
        // the catching intent, causing the first ball to never be caught.

        // ── 2. Compute beat delay from first ball's flight time ──────
        const flightTime = computeFlightTime(
          ctx.hands[firstHand].position,
          firstTarget,
          height,
          ctx.gravity,
        );
        const beatDelayMs = flightTime * beatTiming * 1000;
        await sleep(beatDelayMs);

        if (stopRequested || finished) break;

        // ── 3. Second hand throws to first hand's rest position ──────
        const secondTarget = { ...restOf[firstHand] };

        throwBall(ctx, secondHand, secondBall, {
          target: secondTarget,
          targetHeight: height,
          jitter: throwJitter,
        });

        // ── 4. Wait for second ball to enter flight ──────────────────
        // Now secondHand is in Returning state (threw its ball) and
        // firstHand is also in Returning/Idle state. Both hands are
        // free to accept catching intents.
        try {
          await waitForBallStatus(secondBall, "in-flight", undefined, 3000);
        } catch {
          break;
        }

        if (stopRequested || finished) break;

        // ── 5. Issue catches — both hands are now free ───────────────
        catchBall(ctx, secondHand, firstBall, { jitter: catchJitter });
        catchBall(ctx, firstHand, secondBall, { jitter: catchJitter });

        // ── 6. Wait for both balls to be held (both caught) ──────────
        try {
          await Promise.all([
            waitForBallStatus(firstBall, "held", secondHand, 6000),
            waitForBallStatus(secondBall, "held", firstHand, 6000),
          ]);
        } catch {
          // Timeout — likely a drop or severe jitter miss
          break;
        }

        if (stopRequested || finished) break;

        // ── 5. Check for drops ───────────────────────────────────────
        if (firstBall.status === "grounded") dropCount++;
        if (secondBall.status === "grounded") dropCount++;
        if (firstBall.status === "grounded" || secondBall.status === "grounded") break;

        // ── 6. Dwell pause ───────────────────────────────────────────
        const dwellMs = computeDwellWaitMs(flightTime, dwell);
        if (dwellMs > 0) {
          await sleep(dwellMs);
        }

        if (stopRequested || finished) break;

        // ── 7. Advance ──────────────────────────────────────────────
        completedExchanges++;

        // After exchange, balls have swapped hands. Swap references so
        // the next iteration throws from the correct hand with the
        // correct ball. firstHand now holds secondBall, secondHand
        // holds firstBall.
        const tmpBall = firstBall;
        firstBall = secondBall;
        secondBall = tmpBall;

        // Hands stay the same — first hand always initiates. If you
        // want alternating initiator, swap hands too:
        //   [firstHand, secondHand] = [secondHand, firstHand];
      }
    } catch (e) {
      console.warn("[twoBallExchange] Exchange error:", e);
    }

    await finish();
  })();

  return controller;
}