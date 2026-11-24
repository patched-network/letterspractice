/**
 * Juggling animation for LetterPeople
 * Main API entry point
 *
 * This module provides juggling animation capabilities for LetterPeople characters
 * using siteswap notation. It handles ball physics, hand path calculation, and
 * synchronized arm/ball rendering.
 *
 * @example
 * ```typescript
 * import { animateJuggling } from '@/letterpeople/transforms/juggling';
 *
 * const cleanup = await animateJuggling(letter, "531", {
 *   loop: true,
 *   beatDuration: 300,
 *   dwell: 0.4
 * });
 *
 * // Stop animation
 * cleanup();
 * ```
 *
 * @packageDocumentation
 */

import { prepareSiteswap } from "./prepare";
import { extractHandPaths, extractBallPaths, debugHandPaths } from "./hands";
import type {
  Ball,
  JugglingConfig,
  JugglingOptions,
  BallPosition,
  SaniDimensions,
  HandPath,
  PrepareMetadata,
  JugglingController,
  Point,
} from "./types";
import type { LetterInstance } from "../../types";
import {
  createControllerLifecycle,
  resetEphemeralControllerState,
  resolveStoppedOnce,
} from "./controller";

// Re-export types
export type {
  Ball,
  JugglingConfig,
  JugglingOptions,
  BallPosition,
  SaniDimensions,
  HandPath,
  PrepareMetadata,
  JugglingController,
};

// Re-export utilities (for advanced usage)
export { prepareSiteswap, extractHandPaths, extractBallPaths, debugHandPaths };
export { BallRenderer, createBallElement } from "./ball-renderer";
export { createControllerLifecycle } from "./controller";
export { tossToSelf, arcPass, handoff, drop } from "./phrases";

// @ts-ignore - siteswap.js doesn't have types
import Siteswap from "siteswap.js";
import { mapSaniPathToLetter, mapSaniToLetter } from "./coordinate-mapping";
import { BallRenderer } from "./ball-renderer";
import {
  gatherAndStop as gatherAndStopImpl,
  type GatherResult,
} from "./phrases/gatherAndStop";

/**
 * Extended controller returned by animateJuggling, adding the ability
 * to seamlessly transition from siteswap rendering to physics-core.
 *
 * @deprecated Use physics-core phrases (e.g. cascadePhrase) instead.
 */
export interface SiteswapController extends JugglingController {
  /**
   * Gracefully finish the current siteswap cycle, then catch all balls
   * using the physics engine. Returns a GatherResult with held/grounded
   * balls and a live PhysicsContext for follow-on actions.
   *
   * Unlike stop(), this does NOT destroy ball elements — they transfer
   * to the physics simulation without any visual gap.
   */
  gatherAndStop(): Promise<GatherResult>;
}

export type { GatherResult };

// Import descender constants for ball position adjustment
const DESCENDER_LETTERS = new Set(["g", "j", "p", "q", "y"]);
const DESCENDER_DEPTH = 35; // viewBox units

/**
 * Animate a letter character juggling a siteswap pattern
 *
 * @deprecated Use physics-core phrases (e.g. cascadePhrase) instead.
 *
 * This is the main API function for creating juggling animations. It:
 * 1. Parses the siteswap pattern
 * 2. Calculates ball trajectories using physics simulation
 * 3. Extracts hand paths from ball catch animations
 * 4. Animates the letter's arms to follow hand paths
 * 5. Renders balls synchronized with hand positions
 *
 * @param letter - LetterInstance to animate (must have arms visible)
 * @param pattern - Siteswap pattern string (e.g., "3", "531", "441", "97531")
 * @param options - Animation configuration options
 * @param options.loop - If true, animation repeats indefinitely (default: false)
 * @param options.beatDuration - Duration of one beat in milliseconds (default: 300)
 * @param options.dwell - Dwell time ratio 0-1, time ball spends in hand (default: 0.4)
 * @param options.reversed - If true, uses reverse cascade style (over-top throws) (default: false)
 * @param options.isPaused - Function returning pause state (for pause/resume control)
 * @param options.shouldStep - Function returning true to step one frame when paused
 * @returns Promise resolving to a juggling controller with graceful `stop()`,
 * immediate `destroy()`, `active`, and `gazeTarget`
 *
 * @throws {Error} If siteswap pattern is invalid
 * @throws {Error} If pattern requires more than 2 hands
 * @throws {Error} If pattern has no throws (greatestValue === 0)
 *
 * @example
 * ```typescript
 * // Basic 3-ball cascade
 * const controller = await animateJuggling(letter, "3");
 *
 * // Advanced pattern with options
 * const controller = await animateJuggling(letter, "531", {
 *   loop: true,
 *   beatDuration: 250,
 *   dwell: 0.5,
 *   reversed: false
 * });
 *
 * // With pause/resume control
 * let paused = false;
 * const controller = await animateJuggling(letter, "441", {
 *   loop: true,
 *   isPaused: () => paused,
 *   shouldStep: () => stepRequested
 * });
 *
 * // Stop animation
 * controller.destroy();
 * ```
 */
export async function animateJuggling(
  letter: LetterInstance,
  pattern: string,
  options?: JugglingOptions,
): Promise<SiteswapController> {
  console.log(`[juggling] animateJuggling called with pattern: ${pattern}`);
  await letter.arms.show();

  // Default options
  const config: JugglingConfig = {
    beatDuration: options?.beatDuration ?? 300,
    dwell: options?.dwell ?? 0.4,
    ballRadius: 10,
    ballColor: "#FF6B6B",
    reversed: options?.reversed ?? false
  };

  // Parse siteswap
  const siteswap = new Siteswap(pattern);
  if (!siteswap.valid) {
    throw new Error(`Invalid siteswap pattern: ${pattern}`);
  }

  if (siteswap.degree > 2) {
    throw new Error(`Pattern requires ${siteswap.degree} hands (only 2 supported)`);
  }

  if (siteswap.greatestValue === 0) {
    throw new Error(`Empty pattern (no throws)`);
  }

  // Prepare ball animations
  const [balls, dimensions, metadata] = prepareSiteswap(siteswap, config);
  console.log(
    `[juggling] Prepared ${balls.length} balls, sani: ${dimensions.innerWidth.toFixed(0)}×${dimensions.innerHeight.toFixed(0)}`,
  );

  // Extract hand paths in sani.js coordinate space
  const saniHandPaths = extractHandPaths(balls, dimensions, metadata);
  console.log(
    `[juggling] Hand paths extracted: L=${saniHandPaths.left.positions.length}pts, R=${saniHandPaths.right.positions.length}pts`,
  );

  // Map hand paths to letter coordinate space
  const letterHandPaths = {
    left: mapSaniPathToLetter(saniHandPaths.left.positions, dimensions, letter),
    right: mapSaniPathToLetter(
      saniHandPaths.right.positions,
      dimensions,
      letter,
    ),
  };

  const leftShoulder = letter.arms.left.getShoulderPosition();
  console.log(`[juggling] Stage: baseline Y=${leftShoulder.y.toFixed(1)}`);

  // Extract ball paths in sani.js coordinate space
  const shouldLoop = options?.loop ?? false;
  const saniBallPaths = extractBallPaths(balls, dimensions, metadata, shouldLoop);
  console.log(
    `[juggling] Ball paths extracted: ${saniBallPaths.length} balls`,
  );

  // Map ball paths to letter coordinate space (with descender offset)
  const letterBallPaths: HandPath[] = saniBallPaths.map(ballPath => ({
    timings: ballPath.timings,
    positions: ballPath.positions.map(pos => {
      const letterPos = mapSaniToLetter(pos, dimensions, letter);
      // Apply descender offset for ball positions
      if (DESCENDER_LETTERS.has(letter.character)) {
        letterPos.y += DESCENDER_DEPTH;
      }
      return letterPos;
    })
  }));

  // Create ball renderer with pre-computed paths
  const ballRenderer = new BallRenderer(letter, balls, letterBallPaths);
  console.log(
    `[juggling] Ball renderer created with ${balls.length} balls (looping=${shouldLoop})`,
  );

  // Animation/controller state
  const lifecycle = createControllerLifecycle();
  const leftTimings = saniHandPaths.left.timings;
  const rightTimings = saniHandPaths.right.timings;
  const cycleDuration = metadata.cycleDuration;
  const isLooping = shouldLoop;

  let rafId: number | null = null;
  let startTime: number | null = null;
  let pausedAccumulated = 0;
  let pauseStartedAt: number | null = null;
  let lastSteppedTime = 0;
  let gracefulStopRequested = false;
  let gatherStopRequested = false;
  let gatherResolve: ((result: GatherResult) => void) | null = null;
  let destroyed = false;
  let gracefulStopResolveAt = isLooping ? cycleDuration : cycleDuration;

  console.log(`[juggling] Using pattern cycle duration: ${cycleDuration}ms`);

  const updateGazeTarget = (currentTime: number): void => {
    let bestTarget: Point | null = null;
    let bestY = Number.POSITIVE_INFINITY;

    letterBallPaths.forEach((ballPath) => {
      const nextIndex = ballPath.timings.findIndex((t) => t > currentTime);
      const index =
        nextIndex === -1
          ? ballPath.timings.length - 1
          : Math.max(0, nextIndex - 1);

      if (index >= 0 && index < ballPath.positions.length) {
        const pos = ballPath.positions[index];
        if (pos.y < bestY) {
          bestY = pos.y;
          bestTarget = pos;
        }
      }
    });

    lifecycle.setGazeTarget(bestTarget);
  };

  const cleanupNow = () => {
    if (destroyed) return;
    destroyed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lifecycle.markDestroyed();
    resetEphemeralControllerState(lifecycle.state);
    ballRenderer.destroy();
    letter.arms.stopAnimations();
    resolveStoppedOnce(lifecycle.state);
  };

  const finishGracefully = async () => {
    if (destroyed) return;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lifecycle.markStopped();
    resetEphemeralControllerState(lifecycle.state);
    await letter.arms.relax({ duration: 150 });
    ballRenderer.destroy();
    resolveStoppedOnce(lifecycle.state);
  };

  const finishWithGather = async (currentTime: number) => {
    if (destroyed) return;

    // Stop the siteswap rAF loop
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    lifecycle.markStopped();

    // Compute hand positions at the transition moment (same lookup as animate loop)
    const getPathPosAt = (timings: number[], positions: Point[], time: number): Point => {
      const nextIdx = timings.findIndex((t) => t > time);
      const idx = nextIdx === -1 ? timings.length - 1 : Math.max(0, nextIdx - 1);
      const clamped = Math.min(idx, positions.length - 1);
      return { ...positions[Math.max(0, clamped)] };
    };

    const handPositions = {
      left: getPathPosAt(leftTimings, letterHandPaths.left, currentTime),
      right: getPathPosAt(rightTimings, letterHandPaths.right, currentTime),
    };

    console.log(
      `[juggling] Hand positions at gather: L=(${handPositions.left.x.toFixed(1)},${handPositions.left.y.toFixed(1)}) ` +
        `R=(${handPositions.right.x.toFixed(1)},${handPositions.right.y.toFixed(1)})`,
    );

    // Export ball elements from the renderer (without destroying them)
    const exportedBalls = ballRenderer.exportBalls();
    // Now destroy the renderer — it has released its elements
    ballRenderer.destroy();

    console.log(
      `[juggling] Exported ${exportedBalls.length} balls for physics gather`,
    );

    // Run the physics-based gather
    const result = await gatherAndStopImpl(
      letter,
      exportedBalls,
      letterBallPaths,
      currentTime,
      handPositions,
    );

    resetEphemeralControllerState(lifecycle.state);
    resolveStoppedOnce(lifecycle.state);

    if (gatherResolve) {
      gatherResolve(result);
      gatherResolve = null;
    }
  };

  const controller: SiteswapController = {
    completed: lifecycle.state.stopped,
    async stop() {
      if (destroyed) {
        return lifecycle.state.stopped;
      }

      if (!lifecycle.state.active) {
        resolveStoppedOnce(lifecycle.state);
        return lifecycle.state.stopped;
      }

      gracefulStopRequested = true;
      lifecycle.markStopping();

      const effectiveElapsed = lastSteppedTime;
      const currentTime = isLooping
        ? effectiveElapsed % cycleDuration
        : effectiveElapsed;
      gracefulStopResolveAt = isLooping
        ? effectiveElapsed - currentTime + cycleDuration
        : cycleDuration;

      console.log(
        `[juggling] Graceful stop requested at elapsed=${effectiveElapsed.toFixed(1)}ms current=${currentTime.toFixed(1)}ms resolveAt=${gracefulStopResolveAt.toFixed(1)}ms`,
      );

      return lifecycle.state.stopped;
    },

    async gatherAndStop(): Promise<GatherResult> {
      if (destroyed || !lifecycle.state.active) {
        throw new Error("Cannot gatherAndStop: controller not active");
      }

      // Set up the gather path — reuse the graceful stop's cycle-end timing
      gatherStopRequested = true;
      gracefulStopRequested = true;
      lifecycle.markStopping();

      const effectiveElapsed = lastSteppedTime;
      const currentTime = isLooping
        ? effectiveElapsed % cycleDuration
        : effectiveElapsed;
      gracefulStopResolveAt = isLooping
        ? effectiveElapsed - currentTime + cycleDuration
        : cycleDuration;

      console.log(
        `[juggling] Gather stop requested at elapsed=${effectiveElapsed.toFixed(1)}ms resolveAt=${gracefulStopResolveAt.toFixed(1)}ms`,
      );

      // Return a promise that resolves when the gather completes
      return new Promise<GatherResult>((resolve) => {
        gatherResolve = resolve;
      });
    },

    destroy() {
      cleanupNow();
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

  const animate = (timestamp: number) => {
    if (destroyed) return;
    if (!lifecycle.state.active && !lifecycle.state.stopping) return;

    if (startTime === null) {
      startTime = timestamp;
    }

    const paused = options?.isPaused?.() || false;
    const shouldStep = options?.shouldStep?.() || false;

    if (paused && !shouldStep) {
      if (pauseStartedAt === null) {
        pauseStartedAt = timestamp;
      }
      rafId = requestAnimationFrame(animate);
      return;
    }

    if (pauseStartedAt !== null) {
      pausedAccumulated += timestamp - pauseStartedAt;
      pauseStartedAt = null;
    }

    let rawTime = timestamp - startTime - pausedAccumulated;

    if (shouldStep) {
      rawTime = lastSteppedTime + 16;
      pausedAccumulated = timestamp - startTime - rawTime;
    }

    lastSteppedTime = rawTime;

    // Always use cycle-relative time for looping patterns — even during
    // graceful stop. The stop condition checks rawTime separately.
    // Without this, path lookups clamp to the final sample and the
    // animation freezes instead of continuing to the cycle boundary.
    const currentTime = isLooping
      ? rawTime % cycleDuration
      : rawTime;

    if (shouldStep) {
      const cycleProgress = ((Math.min(currentTime, cycleDuration) / cycleDuration) * 100).toFixed(1);
      console.log(
        `\n━━━ STEP: t=${rawTime.toFixed(1)}ms current=${currentTime.toFixed(1)}ms cycle=${cycleProgress}% of ${cycleDuration}ms ━━━`,
      );
    }

    const leftNextIndex = leftTimings.findIndex((t) => t > currentTime);
    const rightNextIndex = rightTimings.findIndex((t) => t > currentTime);

    const leftIndex =
      leftNextIndex === -1
        ? leftTimings.length - 1
        : Math.max(0, leftNextIndex - 1);

    const rightIndex =
      rightNextIndex === -1
        ? rightTimings.length - 1
        : Math.max(0, rightNextIndex - 1);

    ballRenderer.updateFromPaths(currentTime, letterBallPaths);
    updateGazeTarget(currentTime);

    if (leftIndex >= 0 && leftIndex < letterHandPaths.left.length) {
      const leftPos = letterHandPaths.left[leftIndex];
      void letter.arms.left.setHandPosition(leftPos, { duration: 0 });
    }

    if (rightIndex >= 0 && rightIndex < letterHandPaths.right.length) {
      const rightPos = letterHandPaths.right[rightIndex];
      void letter.arms.right.setHandPosition(rightPos, { duration: 0 });
    }

    if (options?.onFrame) {
      const positions: BallPosition[] = [];
      letterBallPaths.forEach((ballPath, idx) => {
        const nextIndex = ballPath.timings.findIndex((t) => t > currentTime);
        const index =
          nextIndex === -1
            ? ballPath.timings.length - 1
            : Math.max(0, nextIndex - 1);

        if (index >= 0 && index < ballPath.positions.length) {
          const pos = ballPath.positions[index];
          positions.push({ x: pos.x, y: pos.y, id: idx });
        }
      });
      options.onFrame(positions);
    }

    if (shouldStep || rawTime === 0) {
      letterBallPaths.forEach((ballPath, idx) => {
        const nextIndex = ballPath.timings.findIndex((t) => t > currentTime);
        const index =
          nextIndex === -1
            ? ballPath.timings.length - 1
            : Math.max(0, nextIndex - 1);

        if (index >= 0 && index < ballPath.positions.length) {
          const letterPos = ballPath.positions[index];
          console.log(
            `[jd] Ball${idx}: letter(${letterPos.x.toFixed(1)},${letterPos.y.toFixed(1)})`,
          );
        } else {
          console.log(`[jd] Ball${idx}: not visible`);
        }
      });
      if (shouldStep) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      }
    }

    if (!isLooping && rawTime >= cycleDuration) {
      console.log(
        `[juggling] Animation complete (duration=${cycleDuration}ms)`,
      );
      void finishGracefully();
      return;
    }

    if (gracefulStopRequested && rawTime >= gracefulStopResolveAt) {
      if (gatherStopRequested) {
        console.log(
          `[juggling] Gather stop: exporting balls at elapsed=${rawTime.toFixed(1)}ms`,
        );
        void finishWithGather(currentTime);
        return;
      }
      console.log(
        `[juggling] Graceful stop complete at elapsed=${rawTime.toFixed(1)}ms`,
      );
      void finishGracefully();
      return;
    }

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);

  return controller;
}
