/**
 * cascadePhrase — Physics-based 3-ball cascade phrase routine.
 *
 * Wraps the cascade algorithm from `SiteswapPhysicsDebug.vue` into a proper
 * phrase routine implementing the `JugglingController` contract.
 *
 * Key features:
 * - **Live-updating parameters**: height, throwJitter, catchJitter, beatTiming,
 *   dwell are read on each beat (not captured once at construction). Pass a
 *   getter function `() => number` or a static number.
 * - **maxBeats**: stops after N throws (for flash / limited attempts).
 * - **gatherAndStop()**: graceful gather — catches all in-flight balls, no new throws.
 * - **Per-throw and per-catch jitter** for independent control.
 *
 * Follows the structural pattern of existing phrases: creates own PhysicsContext
 * + PhysicsLoop, fire-and-forget async loop with `stopRequested` flag.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../../types";
import type { JugglingController, Point } from "../types";
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
  waitForHandIdle,
  sleep,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
  type Hand,
} from "./physics-core";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";

// ── Types ──────────────────────────────────────────────────────────────────

/** A parameter that can be either a static value or a live-updating getter. */
export type LiveParam = number | (() => number);

function resolve(param: LiveParam): number {
  return typeof param === "function" ? param() : param;
}

export interface CascadeOptions {
  /** Number of balls. Default 3. */
  balls?: number;
  /** Peak throw height in px. Supports live-updating getter. Default 45. */
  height?: LiveParam;
  /** Throw jitter 0–1. Supports live-updating getter. Default 0. */
  throwJitter?: LiveParam;
  /** Catch jitter 0–1. Supports live-updating getter. Default 0. */
  catchJitter?: LiveParam;
  /**
   * Beat timing: fraction of flight time to wait before the next throw.
   * 0.5 = throw when previous ball is near peak. Lower = faster rhythm.
   * Supports live-updating getter. Default 0.55.
   */
  beatTiming?: LiveParam;
  /** Dwell ratio — not used for explicit waiting in cascade, reserved for
   *  future refinement. Default 0.25. */
  dwell?: LiveParam;
  /** Maximum beats (throws) before auto-stop. 0 = unlimited. Default 0. */
  maxBeats?: number;
  /** Ball colors. Default ['#3B82F6', '#EF4444', '#10B981']. */
  ballColors?: string[];
  /** Ball radius. Default 4. */
  ballRadius?: number;
  /** Initial delay in ms before the first throw. Default 400. */
  startDelay?: number;
  /**
   * If provided, the cascade will use this existing PhysicsContext instead of
   * creating a new one. Useful for chaining from other phrases.
   */
  existingContext?: PhysicsContext;
  /**
   * If provided alongside existingContext, reuse this loop too.
   */
  existingLoop?: PhysicsLoop;
  /**
   * If provided, reuse these existing balls instead of creating new ones.
   * The array length should match the `balls` option (default 3).
   * Balls should already be held in alternating hands (L, R, L, R, ...).
   */
  existingBalls?: PhysicsBall[];
}

/**
 * Extended controller for cascade that adds gatherAndStop and beat count.
 */
export interface CascadeController extends JugglingController {
  /** Gracefully gather all in-flight balls and stop. No new throws. */
  gatherAndStop(): Promise<void>;
  /** Current beat (throw) count. */
  readonly beatCount: number;
  /** The underlying PhysicsContext — exposed for chaining. */
  readonly physicsContext: PhysicsContext;
}

// ── Default ball colors ────────────────────────────────────────────────────

const DEFAULT_BALL_COLORS = ["#3B82F6", "#EF4444", "#10B981"]; // blue, red, green

// ── Implementation ─────────────────────────────────────────────────────────

export async function cascadePhrase(
  letter: LetterInstance,
  options: CascadeOptions = {},
): Promise<CascadeController> {
  const numBalls = options.balls ?? 3;
  const height: LiveParam = options.height ?? 45;
  const throwJitter: LiveParam = options.throwJitter ?? 0;
  const catchJitter: LiveParam = options.catchJitter ?? 0;
  const beatTiming: LiveParam = options.beatTiming ?? 0.55;
  const maxBeats = options.maxBeats ?? 0;
  const ballColors = options.ballColors ?? DEFAULT_BALL_COLORS;
  const ballRadius = options.ballRadius ?? 4;
  const startDelay = options.startDelay ?? 400;

  await letter.arms.show({ duration: 0 });

  const lifecycle = createControllerLifecycle();

  let dropCount = 0;

  // Use existing context or create a new one
  const ownsContext = !options.existingContext;
  const ownsBalls = !options.existingBalls;
  const physCtx: PhysicsContext = options.existingContext ?? createPhysicsContext(letter, {
    onBallGrounded: () => { dropCount++; },
  });

  let stopRequested = false;
  let gatherRequested = false;
  let finished = false;
  let beats = 0;

  // Start the physics loop with gaze tracking
  const ownsLoop = !options.existingLoop;
  const loop: PhysicsLoop =
    options.existingLoop ??
    startPhysicsLoop(physCtx, (ctx) => {
      const gaze = getGazeTarget(ctx);
      lifecycle.setGazeTarget(gaze);
    });

  // If we're using an existing loop but not providing our own gaze tracking,
  // set up a gaze poll
  let gazeIntervalId: ReturnType<typeof setInterval> | null = null;
  if (!ownsLoop) {
    gazeIntervalId = setInterval(() => {
      const gaze = getGazeTarget(physCtx);
      lifecycle.setGazeTarget(gaze);
    }, 50);
  }

  // ── Place balls ────────────────────────────────────────────────────────
  // Standard cascade initial placement:
  //   numBalls=3: L has B0+B2, R has B1
  //   General: alternate L, R, L, R, ... starting from left
  const balls: PhysicsBall[] = options.existingBalls ?? [];
  if (ownsBalls) {
    for (let i = 0; i < numBalls; i++) {
      const hand: Hand = i % 2 === 0 ? "left" : "right";
      const color = ballColors[i % ballColors.length];
      const ball = addBall(physCtx, hand, color, ballRadius);
      ball.element.style.opacity = "1";
      balls.push(ball);
    }
  }

  // ── Finish / cleanup ──────────────────────────────────────────────────

  const finish = async () => {
    if (finished) return;
    finished = true;
    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }
    if (ownsBalls) removeAllBalls(physCtx);
    if (ownsLoop) loop.stop();
    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    if (ownsContext) {
      await letter.arms.relax({ duration: 150 });
    }
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Gather logic ───────────────────────────────────────────────────────

  const doGather = async (): Promise<void> => {
    // Track what ball is incoming to each hand from the cascade loop.
    // The main loop tracks this via `incomingTo` but we also need to
    // handle any balls the loop didn't get to.

    // Issue catch commands for any remaining in-flight balls
    const alreadyCatching = new Set<number>();

    // Check which hands are currently catching
    for (const hand of ["left", "right"] as Hand[]) {
      if (physCtx.hands[hand].intent.type === "catching") {
        const intent = physCtx.hands[hand].intent as { ball?: PhysicsBall };
        if (intent.ball) alreadyCatching.add(intent.ball.id);
      }
    }

    // Find un-caught in-flight balls
    const inFlight = physCtx.balls.filter(
      (b) => b.status === "in-flight" && !alreadyCatching.has(b.id),
    );

    for (const ball of inFlight) {
      // Find a free hand
      const freeHand: Hand | null =
        physCtx.hands.left.intent.type !== "catching" ? "left" :
        physCtx.hands.right.intent.type !== "catching" ? "right" :
        null;

      if (freeHand) {
        catchBall(physCtx, freeHand, ball, { jitter: 0 });
        // Wait for that hand to finish before assigning the next
        await waitForHandIdle(physCtx, freeHand, 4000).catch(() => {});
      }
    }

    // Wait for all balls to settle (held or grounded)
    for (let i = 0; i < 200; i++) {
      const anyInFlight = physCtx.balls.some((b) => b.status === "in-flight");
      if (!anyInFlight) break;
      await sleep(25);
    }
  };

  // ── Controller ─────────────────────────────────────────────────────────

  const controller: CascadeController = {
    completed: lifecycle.state.stopped,

    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },

    destroy() {
      finished = true;
      stopRequested = true;
      gatherRequested = false;
      if (gazeIntervalId !== null) {
        clearInterval(gazeIntervalId);
        gazeIntervalId = null;
      }
      if (ownsBalls) removeAllBalls(physCtx);
      if (ownsLoop) loop.stop();
      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      letter.arms.stopAnimations();
      resolveStoppedOnce(lifecycle.state);
    },

    async gatherAndStop() {
      gatherRequested = true;
      return lifecycle.state.stopped;
    },

    get gazeTarget(): Point | null {
      return lifecycle.state.gazeTarget;
    },

    get active(): boolean {
      return lifecycle.state.active;
    },

    get dropCount(): number {
      return dropCount;
    },

    get beatCount(): number {
      return beats;
    },

    get physicsContext(): PhysicsContext {
      return physCtx;
    },
  };

  lifecycle.markActive();

  // ── Main cascade loop (async, fire-and-forget) ─────────────────────────

  void (async () => {
    const ctx = physCtx;

    // Track what ball is in-flight toward each hand.
    // When a hand finishes its throw, we tell it to catch whatever is incoming.
    const incomingTo: Record<Hand, PhysicsBall | null> = {
      left: null,
      right: null,
    };

    let currentHand: Hand = "left";

    try {
      await sleep(startDelay);
      if (stopRequested || finished) {
        await finish();
        return;
      }

      while (!stopRequested && !gatherRequested && !finished) {
        // Check maxBeats
        if (maxBeats > 0 && beats >= maxBeats) break;

        const otherHand: Hand = currentHand === "left" ? "right" : "left";

        // ── Find a ball held by the current hand ──────────────────────
        let ballToThrow = ctx.balls.find(
          (b) => b.status === "held" && b.heldBy === currentHand,
        );

        if (!ballToThrow) {
          // Hand might still be finishing a catch. Wait up to ~500ms.
          for (
            let i = 0;
            i < 25 && !stopRequested && !gatherRequested && !finished;
            i++
          ) {
            await sleep(20);
            ballToThrow = ctx.balls.find(
              (b) => b.status === "held" && b.heldBy === currentHand,
            );
            if (ballToThrow) break;
          }
          if (!ballToThrow) {
            // Hand still empty — cascade may have dropped. Skip to other hand.
            currentHand = otherHand;
            continue;
          }
        }

        if (stopRequested || gatherRequested || finished) break;

        // ── Read live parameters for this beat ───────────────────────
        const currentHeight = resolve(height);
        const currentThrowJitter = resolve(throwJitter);
        const currentCatchJitter = resolve(catchJitter);
        const currentBeatTiming = resolve(beatTiming);

        // ── Compute timing ───────────────────────────────────────────
        const target = { ...ctx.hands[otherHand].restPosition };
        const flightTime = computeFlightTime(
          ctx.hands[currentHand].position,
          target,
          currentHeight,
          ctx.gravity,
        );

        const throwStartTime = performance.now();

        // ── 1. THROW from currentHand → otherHand ───────────────────
        throwBall(ctx, currentHand, ballToThrow, {
          target,
          targetHeight: currentHeight,
          jitter: currentThrowJitter,
        });

        // Record that this ball is now incoming to otherHand
        incomingTo[otherHand] = ballToThrow;

        beats++;

        // ── 2. Wait for ball release ─────────────────────────────────
        // The throw wind-up is ~100-150ms. Once the ball enters flight,
        // the hand transitions to "returning". We can now reassign it.
        try {
          await waitForBallStatus(ballToThrow, "in-flight", undefined, 2000);
        } catch {
          // Throw release timeout — break out of the loop
          break;
        }

        if (stopRequested || gatherRequested || finished) break;

        // ── 3. Catch incoming ball (if any) on currentHand ───────────
        // After release, currentHand is in "returning" state. If a ball
        // was thrown TO currentHand on a previous beat, set catch now.
        const incoming = incomingTo[currentHand];
        if (incoming && incoming.status === "in-flight") {
          catchBall(ctx, currentHand, incoming, {
            jitter: currentCatchJitter,
          });
          incomingTo[currentHand] = null;
        }

        // ── 4. Beat timing: wait until it's time for the next throw ──
        const elapsed = performance.now() - throwStartTime;
        const beatMs = flightTime * currentBeatTiming * 1000;
        const remaining = Math.max(beatMs - elapsed, 30);
        await sleep(remaining);

        if (stopRequested || gatherRequested || finished) break;

        // ── 5. Switch hands ──────────────────────────────────────────
        currentHand = otherHand;
      }

      // ── Gather phase ───────────────────────────────────────────────────
      if ((gatherRequested || (maxBeats > 0 && beats >= maxBeats)) && !stopRequested && !finished) {
        // Issue catch commands for tracked incoming balls first
        for (const [hand, ball] of Object.entries(incomingTo) as [Hand, PhysicsBall | null][]) {
          if (ball && ball.status === "in-flight") {
            catchBall(ctx, hand, ball, { jitter: 0 });
          }
        }
        await doGather();
      }
    } catch (e) {
      console.warn("[cascadePhrase] Cascade error:", e);
    }

    await finish();
  })();

  return controller;
}