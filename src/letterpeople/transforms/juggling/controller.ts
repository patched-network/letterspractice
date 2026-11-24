import type { Point } from "./types";

/**
 * Shared lifecycle state used by juggling controllers.
 *
 * This is intentionally small: it supports both the existing sampled-path
 * siteswap runtime and future anime.js-driven phrase routines without forcing
 * them onto the same internal scheduling model.
 */
export interface ControllerState {
  active: boolean;
  stopping: boolean;
  destroyed: boolean;
  gazeTarget: Point | null;
  stopped: Promise<void>;
  resolveStopped: () => void;
}

/**
 * Small helper shape for implementations that want convenience methods instead
 * of mutating raw state fields directly.
 */
export interface ControllerLifecycle {
  readonly state: ControllerState;
  markActive(): void;
  markStopping(): void;
  markStopped(): void;
  markDestroyed(): void;
  setGazeTarget(target: Point | null): void;
}

/**
 * Create the shared lifecycle state for a juggling controller.
 */
export function createControllerState(): ControllerState {
  let resolved = false;
  let resolveStoppedInternal: (() => void) | null = null;

  const stopped = new Promise<void>((resolve) => {
    resolveStoppedInternal = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
  });

  return {
    active: false,
    stopping: false,
    destroyed: false,
    gazeTarget: null,
    stopped,
    resolveStopped: () => {
      resolveStoppedInternal?.();
    },
  };
}

/**
 * Wrap a ControllerState in a small helper API.
 *
 * This is useful when a backend wants a compact imperative interface while
 * still keeping all public/shared controller data in one state object.
 */
export function createControllerLifecycle(
  state: ControllerState = createControllerState(),
): ControllerLifecycle {
  return {
    state,

    markActive() {
      if (state.destroyed) return;
      state.active = true;
    },

    markStopping() {
      if (state.destroyed) return;
      state.stopping = true;
    },

    markStopped() {
      state.active = false;
      state.stopping = false;
      state.resolveStopped();
    },

    markDestroyed() {
      state.destroyed = true;
      state.active = false;
      state.stopping = false;
      state.gazeTarget = null;
      state.resolveStopped();
    },

    setGazeTarget(target: Point | null) {
      state.gazeTarget = target;
    },
  };
}

/**
 * Resolve a stop request exactly once, even if multiple cleanup paths race.
 *
 * Safe to call from:
 * - natural animation completion
 * - graceful stop completion
 * - hard destroy teardown
 */
export function resolveStoppedOnce(state: ControllerState): void {
  state.resolveStopped();
}

/**
 * Clear ephemeral state when a controller is no longer presenting motion.
 */
export function resetEphemeralControllerState(state: ControllerState): void {
  state.gazeTarget = null;
}

/**
 * Guard helper for implementations that want to bail early if a controller
 * should no longer emit or update motion.
 */
export function shouldAbortController(state: ControllerState): boolean {
  return state.destroyed || !state.active;
}