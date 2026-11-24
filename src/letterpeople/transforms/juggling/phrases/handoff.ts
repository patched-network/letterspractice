import type { LetterInstance } from "../../../types";
import type { JugglingController } from "../types";
import {
  createPhysicsContext,
  addBall,
  removeBall,
  removeAllBalls,
  startPhysicsLoop,
  moveHand,
  placeBallInHand,
  waitForHandIdle,
  getGazeTarget,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
} from "./physics-core";
import {
  getHandRestPosition,
  oppositeHand,
  clamp,
  type HandoffOptions,
} from "./shared";
import {
  createControllerLifecycle,
  resolveStoppedOnce,
  resetEphemeralControllerState,
} from "../controller";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export async function handoff(
  letter: LetterInstance,
  options: HandoffOptions = {},
): Promise<JugglingController> {
  const startHand = options.from ?? "left";
  const count = options.count ?? 2;
  const dwell = clamp(options.dwell ?? 0.5, 0.25, 0.85);
  const alternating = options.alternating ?? true;
  const ballColor = options.ballColor ?? "#3B82F6";
  const width = clamp(options.width ?? 0.5, 0, 1);

  await letter.arms.show({ duration: 0 });

  // ── Ownership ────────────────────────────────────────────────────────
  const ownsContext = !options.existingContext;
  const ownsLoop = !options.existingLoop;
  const ownsBall = !options.existingBall;

  // ── Create or reuse ──────────────────────────────────────────────────
  const physCtx: PhysicsContext =
    options.existingContext ?? createPhysicsContext(letter);

  const lifecycle = createControllerLifecycle();

  const loop: PhysicsLoop =
    options.existingLoop ??
    startPhysicsLoop(physCtx, (ctx) => {
      lifecycle.setGazeTarget(getGazeTarget(ctx));
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

  // ── State flags ──────────────────────────────────────────────────────
  let stopRequested = false;
  let finished = false;

  // ── Finish / cleanup ─────────────────────────────────────────────────
  const finish = async () => {
    if (finished) return;
    finished = true;
    lifecycle.markStopped();
    lifecycle.setGazeTarget(null);

    if (gazeIntervalId !== null) {
      clearInterval(gazeIntervalId);
      gazeIntervalId = null;
    }

    // Return both hands to rest
    moveHand(
      physCtx,
      "left",
      getHandRestPosition(letter, "left"),
      0.16,
    );
    moveHand(
      physCtx,
      "right",
      getHandRestPosition(letter, "right"),
      0.16,
    );
    try {
      await waitForHandIdle(physCtx, "left", 1000);
      await waitForHandIdle(physCtx, "right", 1000);
    } catch {
      // timeout — proceed with cleanup regardless
    }

    if (ownsBall) {
      ball.element.style.opacity = "0";
      removeBall(physCtx, ball);
    }
    if (ownsLoop) loop.stop();
    resolveStoppedOnce(lifecycle.state);
  };

  // ── Controller ───────────────────────────────────────────────────────
  const controller: JugglingController = {
    async stop() {
      stopRequested = true;
      return lifecycle.state.stopped;
    },

    completed: lifecycle.state.stopped,

    destroy() {
      finished = true;
      stopRequested = true;
      if (gazeIntervalId !== null) {
        clearInterval(gazeIntervalId);
        gazeIntervalId = null;
      }
      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      if (ownsContext) removeAllBalls(physCtx);
      if (ownsLoop) loop.stop();
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

  // ── Main handoff loop (async, fire-and-forget) ───────────────────────
  void (async () => {
    let currentFrom = startHand;
    let completed = 0;

    while (!stopRequested && (count === 0 || completed < count)) {
      const from = currentFrom;
      const to = oppositeHand(from);

      const fromRest = getHandRestPosition(letter, from);
      const toRest = getHandRestPosition(letter, to);

      // Width controls how far each hand extends from center:
      // width=0: both hands meet at tight center (quick handoff)
      // width=1: hands use full range toward their rest positions (wide sweep)
      const centerX = (fromRest.x + toRest.x) / 2;
      const centerY = Math.min(fromRest.y, toRest.y) - 4;

      const fromMid = {
        x: lerp(
          centerX + (from === "left" ? -2 : 2),
          fromRest.x,
          width * 0.5,
        ),
        y: centerY,
      };
      const toMid = {
        x: lerp(
          centerX + (to === "left" ? -2 : 2),
          toRest.x,
          width * 0.5,
        ),
        y: centerY + 1,
      };

      // Duration calculations — same formulas as original, converted ms → seconds
      const carryInDuration =
        Math.max(140, 180 + dwell * 180) / 1000;
      const transferDuration =
        Math.max(90, 70 + dwell * 120) / 1000;
      const carryOutDuration =
        Math.max(120, 150 + dwell * 150) / 1000;

      // Ensure ball is in the from-hand (physics tick auto-positions it)
      if (ball.heldBy !== from) {
        placeBallInHand(physCtx, ball, from);
      }

      // ── Step 1: Both hands move inward (ball follows from-hand) ──
      moveHand(physCtx, from, fromMid, carryInDuration);
      moveHand(physCtx, to, toMid, carryInDuration);
      try {
        await waitForHandIdle(physCtx, from, 3000);
        await waitForHandIdle(physCtx, to, 3000);
      } catch {
        // timeout
      }

      if (stopRequested) break;

      // ── Step 2: From-hand carries ball to transfer midpoint ──────
      const transferMid = {
        x: (fromMid.x + toMid.x) / 2,
        y: (fromMid.y + toMid.y) / 2,
      };
      moveHand(physCtx, from, transferMid, transferDuration);
      try {
        await waitForHandIdle(physCtx, from, 2000);
      } catch {
        // timeout
      }

      if (stopRequested) break;

      // Transfer ball to receiving hand
      placeBallInHand(physCtx, ball, to);

      // ── Step 3: Both hands return to rest (ball follows to-hand) ─
      moveHand(physCtx, from, fromRest, carryOutDuration);
      moveHand(physCtx, to, toRest, carryOutDuration);
      try {
        await waitForHandIdle(physCtx, from, 3000);
        await waitForHandIdle(physCtx, to, 3000);
      } catch {
        // timeout
      }

      if (stopRequested) break;

      completed++;
      if (alternating) {
        currentFrom = to;
      }
    }

    await finish();
  })();

  return controller;
}