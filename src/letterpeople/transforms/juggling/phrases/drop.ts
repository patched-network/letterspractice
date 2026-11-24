import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";
import {
  clamp,
  oppositeHand,
  type DropOptions,
  type Hand,
} from "./shared";
import {
  createPhysicsContext,
  addBall,
  removeBall,
  catchBall,
  moveHand,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  computeDwellWaitMs,
  waitForBallStatus,
  waitForHandIdle,
  sleep,
  lerp,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
} from "./physics-core";

const DEFAULT_BALL_COLOR = "#3B82F6";

export async function drop(
  letter: LetterInstance,
  options: DropOptions = {},
): Promise<JugglingController> {
  const startHand: Hand = options.from ?? "left";
  const height = options.height ?? 15;
  const count = options.count ?? 3;
  const dwell = clamp(options.dwell ?? 0.45, 0.22, 0.8);
  const jitter = clamp(options.jitter ?? 0, 0, 1);
  const ballColor = options.ballColor ?? DEFAULT_BALL_COLOR;
  const width = clamp(options.width ?? 0.3, 0, 1);

  await letter.arms.show({ duration: 0 });

  // ── Ownership ────────────────────────────────────────────────────────
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  // ── Create or reuse ──────────────────────────────────────────────────
  const physCtx: PhysicsContext =
    options.existingContext ?? createPhysicsContext(letter);

  const lifecycle = createControllerLifecycle();

  const physLoop: PhysicsLoop =
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

  // ── Lifecycle flags ──────────────────────────────────────────────────
  let stopRequested = false;
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;

    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }

    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);

    // Return hands to rest
    moveHand(physCtx, "left", physCtx.hands.left.restPosition, 0.16);
    moveHand(physCtx, "right", physCtx.hands.right.restPosition, 0.16);

    // Brief pause for hands to settle visually, then tear down
    await sleep(180);

    if (ownsBall) {
      ball.element.style.opacity = "0";
      removeBall(physCtx, ball);
    }
    if (ownsLoop) physLoop.stop();
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
      stopRequested = true;
      finished = true;
      if (gazeIntervalId !== null) {
        clearInterval(gazeIntervalId);
        gazeIntervalId = null;
      }
      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      if (ownsContext) removeAllBalls(physCtx);
      if (ownsLoop) physLoop.stop();
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

  // ── Main async loop ──────────────────────────────────────────────────
  void (async () => {
    let currentFrom: Hand = startHand;
    let completed = 0;

    while (!stopRequested && (count === 0 || completed < count)) {
      const from = currentFrom;
      const to = oppositeHand(from);
      const fromRest = physCtx.hands[from].restPosition;
      const toRest = physCtx.hands[to].restPosition;

      const centerX = (fromRest.x + toRest.x) / 2;

      // A drop is straight DOWN a single vertical column near the centre line:
      // the ball-hand lifts HIGH and the catch-hand waits LOW directly under
      // it (same x). `width` only shifts the whole column laterally a little
      // (0 = dead centre); it does NOT separate the hands sideways.
      const dropX = lerp(centerX, fromRest.x, width * 0.4);
      const liftPos = { x: dropX, y: fromRest.y - height };
      const catchPos = { x: dropX, y: toRest.y };

      // Phase 1: lift the ball-hand high AND bring the catch-hand in/under to
      // wait directly below it. The lift is slow and deliberate (scaled with
      // height); the catch hand settles in a touch quicker so it's ready.
      const liftDuration = clamp(0.3 + height * 0.01, 0.35, 0.75);
      moveHand(physCtx, from, liftPos, liftDuration);
      moveHand(physCtx, to, catchPos, 0.28);
      try {
        await waitForHandIdle(physCtx, from, 2000);
        await waitForHandIdle(physCtx, to, 2000);
      } catch (_e) {
        // timeout — continue anyway
      }
      if (stopRequested) break;

      // Phase 2: release into free-fall — a true drop, not a toss. throwBall
      // always arcs the ball UP to a peak above the launch point first (even a
      // tiny targetHeight), so for a straight vertical drop we release the ball
      // manually: set it in-flight with (near) zero velocity and let gravity
      // carry it straight down into the waiting hand. jitter adds a small
      // horizontal slip on a bad rep.
      const jitterVx = (Math.random() - 0.5) * jitter * 24;
      ball.status = "in-flight";
      ball.heldBy = null;
      ball.velocity = { x: jitterVx, y: 0 };

      // Upper hand has let go — relax it gently back toward rest.
      moveHand(physCtx, from, fromRest, 0.4);

      // Lower hand waits and receives the descending ball.
      catchBall(physCtx, to, ball, { jitter });

      try {
        await waitForBallStatus(ball, "held", to, 5000);
      } catch (_e) {
        // timeout or miss
      }
      if (stopRequested || (ball.status as string) === "grounded") break;

      // Catch cushion: the receiving hand gives downward a little, absorbing
      // the drop, then settles back to rest — the same feel as the two-handed
      // catch (overrides physics-core's default cushion-straight-to-rest).
      const catchDip = { x: catchPos.x, y: catchPos.y + 9 };
      moveHand(physCtx, to, catchDip, 0.1);
      try {
        await waitForHandIdle(physCtx, to, 800);
      } catch {
        // timeout — continue
      }
      if (stopRequested) break;
      moveHand(physCtx, to, toRest, 0.22);

      // Let both hands finish easing back to rest (relax) before the next drop.
      // Without this the next rep redirects them mid-return — reads as a snap.
      try {
        await waitForHandIdle(physCtx, from, 1500);
        await waitForHandIdle(physCtx, to, 1500);
      } catch {
        // timeout — continue
      }
      if (stopRequested) break;

      // Dwell — a real beat between drops (free-fall is short, so
      // computeDwellWaitMs floors to ~0; keep a minimum so it doesn't rattle).
      const fallDist = Math.max(1, catchPos.y - liftPos.y);
      const flightTime = Math.sqrt((2 * fallDist) / physCtx.gravity);
      const dwellMs = Math.max(160, computeDwellWaitMs(flightTime, dwell));
      await sleep(dwellMs);

      completed++;
      currentFrom = to;
    }

    await finish();
  })();

  return controller;
}