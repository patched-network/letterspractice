/**
 * Type definitions for juggling animation
 */

export interface Point {
  x: number;
  y: number;
}

export interface Vector {
  x: number;
  y: number;
}

/**
 * Animation types for ball motion
 */
export type AnimationType = 'catch' | 'throw' | 'wait';

/**
 * Base animation interface
 */
export interface BaseAnimation {
  type: AnimationType;
  duration: number;
  position: Point;
  getPosition: (time: number) => Point;
}

/**
 * Catch animation (hand motion with ball)
 * Uses spline interpolation for smooth hand movement
 */
export interface CatchAnimation extends BaseAnimation {
  type: 'catch';
  width: number;        // Horizontal distance traveled
  yModifier: number;    // Vertical amplitude modifier
}

/**
 * Throw animation (ball in air)
 * Uses physics-based trajectory
 */
export interface ThrowAnimation extends BaseAnimation {
  type: 'throw';
  velocity: Vector;
  acceleration: Vector;
}

/**
 * Wait animation (ball held in hand)
 * Static position
 */
export interface WaitAnimation extends BaseAnimation {
  type: 'wait';
}

/**
 * Union type for all animation types
 */
export type BallAnimation = CatchAnimation | ThrowAnimation | WaitAnimation;

/**
 * Ball representation
 */
export interface Ball {
  position: Point;
  color: string;
  animations: BallAnimation[];
  animationAt: number;
  elapsed: number;
}

/**
 * Siteswap pattern dimensions
 * Used for coordinate space calculations
 */
export interface SaniDimensions {
  innerWidth: number;
  innerHeight: number;
  catchHeight: number;
}

/**
 * Configuration options for juggling preparation
 */
export interface JugglingConfig {
  beatDuration: number;    // Duration of one beat in milliseconds
  dwell: number;          // Dwell time ratio (0-1)
  ballRadius: number;     // Radius of balls
  ballColor: string;      // Color of balls
  reversed?: boolean;     // Reverse left/right hands (optional, default false)
}

/**
 * Hand path extracted from ball animations
 */
export interface HandPath {
  positions: Point[];
  timings: number[];     // Milliseconds from start
}

/**
 * Ball position for rendering
 */
export interface BallPosition {
  x: number;
  y: number;
  id: number;
}

/**
 * Options for juggling animation
 */
export interface JugglingOptions {
  beatDuration?: number;
  dwell?: number;
  loop?: boolean;
  reversed?: boolean;            // Reverse throw style (over-top vs inside)
  onFrame?: (balls: BallPosition[]) => void;
  isPaused?: () => boolean;      // Check if animation should pause
  shouldStep?: () => boolean;    // Check if should step one frame (when paused)
}

/**
 * Shared controller contract returned by juggling backends.
 *
 * The existing siteswap backend and future phrase-based routines both use this
 * lifecycle shape, while remaining free to use different internal scheduling
 * strategies.
 */
export interface JugglingController {
  /**
   * Gracefully stop emitting new motion and resolve when the current juggling
   * phrase or pattern has settled.
   */
  stop(): Promise<void>;

  /**
   * Hard stop and immediate teardown.
   */
  destroy(): void;

  /**
   * Suggested current gaze target in letter-local coordinates, or null when no
   * strong focus point is available.
   */
  readonly gazeTarget: Point | null;

  /**
   * Promise that resolves when the phrase finishes for any reason
   * (natural completion, stop request, or destroy). Unlike stop(),
   * accessing this does NOT request early termination.
   */
  readonly completed: Promise<void>;

  /**
   * Whether this controller is still actively producing motion.
   */
  readonly active: boolean;

  /**
   * Number of drops (balls reaching grounded status) observed during this
   * phrase's execution. Updated in real-time as the phrase runs.
   * Returns 0 if drop tracking is not supported by this controller.
   */
  readonly dropCount: number;
}

/**
 * Stage dimensions for letter coordinate mapping
 */
export interface StageDimensions {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Metadata returned from prepareSiteswap
 */
export interface PrepareMetadata {
  cycleDuration: number;  // Pattern cycle duration in milliseconds
}
