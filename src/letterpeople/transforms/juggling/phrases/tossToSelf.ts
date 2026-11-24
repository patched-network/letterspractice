import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  removeBall,
  removeAllBalls,
  throwBall,
  catchBall,
  moveHand,
  placeBallInHand,
  startPhysicsLoop,
  getGazeTarget,
  computeFlightTime,
  computeDwellWaitMs,
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
import {
  clamp,
  getHandRestPosition,
  oppositeHand,
  type Hand,
  type TossToSelfOptions,
} from "./shared";

const DEFAULT_BALL_COLOR = "#3B82F6";

/**
 * Organic in-hand rest between idle tosses: usually a short, slightly varied
 * beat; occasionally a longer "settle" pause. Keeps the alternating practice
 * cadence from feeling robotic.
 */
function organicRestMs(): number {
  const base = 180 + Math.random() * 320; // 180–500ms
  if (Math.random() < 0.18) {
    return base + 400 + Math.random() * 600; // occasional ~580–1500ms pause
  }
  return base;
}

export async function tossToSelf(
  letter: LetterInstance,
  options: TossToSelfOptions,
): Promise<JugglingController> {
  const hand = options.hand;
  const height = options.height ?? 20;
  const count = options.count ?? 3;
  const dwell = clamp(options.dwell ?? 0.42, 0.2, 0.75);
  const jitter = clamp(options.jitter ?? 0, 0, 1);
  const alternating = options.alternating ?? false;
  const switchChance = clamp(options.switchChance ?? 0.6, 0, 1);
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
    options.existingBall ?? addBall(physCtx, hand, ballColor);

  if (ownsBall) {
    ball.element.style.opacity = "1";
  }

  // ── State flags ──────────────────────────────────────────────────────
  let stopRequested = false;
  let finished = false;

  const handRestPosition = physCtx.hands[hand].restPosition;
  const targetHeight = height;

  // Compute flight time once (same-hand: from and to are the same rest position)
  const flightTime = computeFlightTime(
    handRestPosition,
    handRestPosition,
    targetHeight,
    physCtx.gravity,
  );
  const dwellMs = computeDwellWaitMs(flightTime, dwell);

  // ── Finish / cleanup ─────────────────────────────────────────────────
  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }

    if (ownsBall) {
      ball.element.style.opacity = "0";
      removeBall(physCtx, ball);
    }
    if (ownsLoop) loop.stop();

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);
    await letter.arms.relax({ duration: 150 });
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ───────────────────────────────────────────────────────
  const controller: JugglingController = {
    completed: lifecycle.state.stopped,
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },
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

  // Carry the ball from one hand to the other (a brief handoff) so an
  // alternating toss-to-self visibly uses both hands. Mirrors the handoff
  // phrase's transfer: both hands meet near center, the ball changes hands,
  // then both return to rest. The held ball follows the from-hand inward.
  async function carryToHand(from: Hand, to: Hand): Promise<void> {
    const fromRest = getHandRestPosition(letter, from);
    const toRest = getHandRestPosition(letter, to);
    const cx = (fromRest.x + toRest.x) / 2;
    const cy = Math.min(fromRest.y, toRest.y) - 4;

    moveHand(physCtx, from, { x: cx + (from === "left" ? -2 : 2), y: cy }, 0.18);
    moveHand(physCtx, to, { x: cx + (to === "left" ? -2 : 2), y: cy + 1 }, 0.18);
    try {
      await waitForHandIdle(physCtx, from, 1500);
      await waitForHandIdle(physCtx, to, 1500);
    } catch {
      /* timeout */
    }
    if (stopRequested) return;

    placeBallInHand(physCtx, ball, to);

    moveHand(physCtx, from, fromRest, 0.16);
    moveHand(physCtx, to, toRest, 0.16);
    try {
      await waitForHandIdle(physCtx, from, 1500);
      await waitForHandIdle(physCtx, to, 1500);
    } catch {
      /* timeout */
    }
  }

  // ── Main toss loop (async, fire-and-forget) ──────────────────────────
  void (async () => {
    let currentHand: Hand = hand;
    let completed = 0;

    while (!stopRequested && (count === 0 || completed < count)) {
      // Make sure the ball is in the hand we're about to toss from.
      if (ball.heldBy !== currentHand) {
        placeBallInHand(physCtx, ball, currentHand);
      }

      const restPos = physCtx.hands[currentHand].restPosition;

      // Throw the ball to the tossing hand's rest position
      throwBall(physCtx, currentHand, ball, {
        target: restPos,
        targetHeight,
        jitter,
      });

      // Wait for the ball to become in-flight (released from hand)
      try {
        await waitForBallStatus(ball, "in-flight", undefined, 3000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Command the same hand to catch
      catchBall(physCtx, currentHand, ball, { jitter });

      // Wait for the ball to be caught (held by this hand)
      try {
        await waitForBallStatus(ball, "held", currentHand, 5000);
      } catch {
        break;
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Let the catch settle before the next throw. After a catch the hand is
      // in a ~200ms `cushioning` intent (easing the ball back to rest); issuing
      // the next throwBall() before that completes overwrites the cushioning
      // and snaps the ball/hand back mid-settle. At normal heights the explicit
      // dwell already covers this, but for tiny tosses computeDwellWaitMs floors
      // to 0 and the cushion gets cut off. Waiting for the hand to go idle makes
      // every toss a discrete catch→settle→throw regardless of height.
      try {
        await waitForHandIdle(physCtx, currentHand, 1000);
      } catch {
        // timeout — proceed anyway
      }

      if (stopRequested || (ball.status as string) === "grounded") break;

      // Rest in hand before the next toss. When alternating (idle practice),
      // use a varied organic pause instead of the fixed dwell — usually a quick
      // beat, occasionally a longer settle — so the cadence isn't metronomic.
      const restMs = alternating ? organicRestMs() : dwellMs;
      if (restMs > 0) {
        await sleep(restMs);
      }

      if (stopRequested) break;

      completed++;

      // Decide the next hand. When alternating, usually carry the ball to the
      // other hand (both hands take turns), but sometimes keep it for a
      // same-hand re-throw — a more natural, less robotic practice feel.
      if (alternating && !stopRequested && (count === 0 || completed < count)) {
        if (Math.random() < switchChance) {
          await carryToHand(currentHand, oppositeHand(currentHand));
          if (stopRequested) break;
          currentHand = oppositeHand(currentHand);
        }
        // else: re-throw from the same hand next rep
      }
    }

    await finish();
  })();

  return controller;
}