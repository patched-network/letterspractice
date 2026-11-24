import { animate, type AnimationParams, type JSAnimation } from "animejs";
import type { Point } from "../util/geometry";

/**
 * Facing direction enum for state queries
 */
export type FacingDirection = "camera" | "left" | "right" | "away";

export interface SkewOptions {
  /** Target skewX angle in degrees. Positive = lean right. */
  degrees: number;
  duration?: number;
  ease?: string;
}

export interface WalkOptions {
  speed?: number; // Pixels/second
  wobbleAngle?: number; // Degrees
  bobHeight?: number; // Pixels
  stepDuration?: number; // ms
  stagger?: number; // ms (phase offset)
  ease?: string;
}

/**
 * Body controller for whole-letter transformations.
 * Manages full transform stack: Position -> Scale -> Rotation (Wobble) -> Bob -> Face (RotateY).
 */
export interface BodyController {
  /** The SVG element representing the entire letter body */
  readonly element: SVGElement;

  /**
   * Apply a skewX transform (hip sway / lean).
   * Positive degrees = top leans right, negative = top leans left.
   */
  skewTo(degrees: number, options?: AnimationParams): Promise<void>;

  /**
   * Get the current skewX angle.
   */
  getCurrentSkew(): number;

  /**
   * Turn the body to face a direction using perspective transform.
   */
  turnTo(degrees: number, options?: AnimationParams): Promise<void>;

  /**
   * Turn the body to look at a specific point or letter.
   */
  lookAt(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void>;

  /**
   * Reset body to neutral position (no rotation/transform)
   */
  resetPose(options?: AnimationParams): Promise<void>;

  /**
   * Start the walking animation loop (wobble + bob).
   * Does NOT handle translation (X/Y), just the gait.
   */
  startWalking(options?: WalkOptions): void;

  /**
   * Stop the walking animation and return to neutral stance.
   */
  stopWalking(): void;

  /**
   * Set the letter's position in SVG space (not page space).
   * Used for 'legacy' transforms that move the SVG directly.
   */
  setPosition(x: number, y: number): void;

  /**
   * Set the letter's scale.
   */
  setScale(scale: number): void;

  /**
   * Get current turn angle
   */
  getCurrentTurnAngle(): number;

  /**
   * Stop any running animations
   */
  stopAnimations(): void;

  /**
   * Check if currently animating
   */
  isAnimating(): boolean;

  // --- Convenience methods ---
  faceCamera(options?: AnimationParams): Promise<void>;
  turnToward(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void>;
  turnAwayFrom(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void>;

  // --- State query methods ---
  isFacingCamera(): boolean;
  getFacingDirection(): FacingDirection;
  getCenter(): Point;
}

// Internal state for transform composition
interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotateY: number; // Facing
  rotateZ: number; // Wobble
  bobY: number; // Bob
  skewX: number; // Hip sway / lean
}

class BodyControllerImpl implements BodyController {
  readonly element: SVGElement;

  // Transform State
  private _state: TransformState = {
    x: 0,
    y: 0,
    scale: 1,
    rotateY: 0,
    rotateZ: 0,
    bobY: 0,
    skewX: 0,
  };

  private _currentAnimation: JSAnimation | null = null;
  private _walkAnimation: JSAnimation | null = null;
  private _skewAnimation: JSAnimation | null = null;
  private _transformOriginSet: boolean = false;

  constructor(svgElement: SVGElement) {
    this.element = svgElement;
  }

  private ensureTransformOrigin(): void {
    if (!this._transformOriginSet) {
      // Set to bottom center for walking/standing
      const bounds = this.element.getBoundingClientRect();
      // However, bounding box might be zero if not attached or hidden
      // We'll rely on CSS centering if possible, or assume center/bottom
      this.element.style.transformOrigin = "center bottom";
      this._transformOriginSet = true;
    }
  }

  private applyTransform() {
    const { x, y, scale, rotateY, rotateZ, bobY, skewX } = this._state;
    // Order: Translate -> Bob -> Scale -> SkewX (hip sway) -> RotateZ (Wobble) -> RotateY (Facing)
    // Note: Perspective is needed for RotateY to look 3D
    // bobY is added to y, or separate? Let's keep bob separate for clarity

    // Horizon effect: smaller = higher (negative Y)
    // Legacy walk.ts logic: const horizonY = (scaleVal - 1) * 20;
    // We should probably NOT bake horizon logic here if we want to be generic.
    // BUT walk.ts relied on it. For now, let's keep it pure.
    // If walk.ts wants horizon effect, it should set Y.

    const transform = `translate(${x}px, ${y + bobY}px) scale(${scale}) skewX(${skewX}deg) rotate(${rotateZ}deg) perspective(400px) rotateY(${rotateY}deg)`;
    this.element.style.transform = transform;
  }

  // --- Skew API ---

  async skewTo(degrees: number, options?: AnimationParams): Promise<void> {
    // Pivot from the top so the top stays fixed and the bottom swings out.
    // (Walking overrides this to 'center bottom' via ensureTransformOrigin.)
    this.element.style.transformOrigin = "center top";

    // Stop any existing skew animation but leave walk/turn alone
    if (this._skewAnimation) {
      this._skewAnimation.pause();
      this._skewAnimation = null;
    }

    if (options?.duration) {
      this._skewAnimation = animate(this._state, {
        skewX: degrees,
        duration: options.duration,
        ease: options.ease || "inOutSine",
        delay: options.delay || 0,
        onUpdate: () => this.applyTransform(),
      });

      return this._skewAnimation.then(() => {
        this._skewAnimation = null;
      });
    } else {
      this._state.skewX = degrees;
      this.applyTransform();
      return Promise.resolve();
    }
  }

  getCurrentSkew(): number {
    return this._state.skewX;
  }

  // --- Walking API ---

  startWalking(options?: WalkOptions): void {
    if (this._walkAnimation) this.stopWalking();
    this.ensureTransformOrigin();

    const speed = options?.speed ?? 100;
    const wobble = options?.wobbleAngle ?? 10;
    const bob = options?.bobHeight ?? 6;
    const stepDuration = options?.stepDuration ?? 280;
    const ease = options?.ease ?? "inOutSine";
    const phaseOffset = options?.stagger ?? 0; // ms offset

    // Walking State
    const walkState = { step: 0 };

    // We animate a proxy 'step' value and derive wobble/bob from it
    // Step 0 -> 1 is one full cycle (Left -> Right -> Left)?
    // No, usually step is 0->1 (left step), 1->2 (right step)

    // Let's implement a loop that toggles targets

    let stepCount = 0;

    const animateStep = () => {
      const isLeft = stepCount % 2 === 0;
      const targetRotate = isLeft ? wobble : -wobble;
      const targetBob = isLeft ? -bob : 0; // Bob down on step? Or up?
      // walk.ts: targetBob = isLeftTilt ? -bobHeight : 0;

      this._walkAnimation = animate(this._state, {
        rotateZ: targetRotate,
        bobY: targetBob,
        duration: stepDuration,
        ease: ease,
        delay: stepCount === 0 ? phaseOffset : 0, // Stagger start
        onUpdate: () => this.applyTransform(),
        onComplete: () => {
          stepCount++;
          animateStep(); // Loop
        },
      });
    };

    animateStep();
  }

  stopWalking(): void {
    if (this._walkAnimation) {
      this._walkAnimation.pause(); // v4 pause
      this._walkAnimation = null;
    }

    // Return to upright
    animate(this._state, {
      rotateZ: 0,
      bobY: 0,
      duration: 200,
      ease: "outQuad",
      onUpdate: () => this.applyTransform(),
    });
  }

  setPosition(x: number, y: number): void {
    this._state.x = x;
    this._state.y = y;
    this.applyTransform();
  }

  setScale(scale: number): void {
    this._state.scale = scale;
    this.applyTransform();
  }

  // --- Existing Body API (Refactored) ---

  async turnTo(degrees: number, options?: AnimationParams): Promise<void> {
    this.ensureTransformOrigin();

    if (options?.duration) {
      this._currentAnimation = animate(this._state, {
        rotateY: degrees,
        duration: options.duration,
        ease: options.ease || "outQuad",
        delay: options.delay || 0,
        onUpdate: () => this.applyTransform(),
      });

      return this._currentAnimation.then(() => {
        this._currentAnimation = null;
      });
    } else {
      this._state.rotateY = degrees;
      this.applyTransform();
      return Promise.resolve();
    }
  }

  async lookAt(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void> {
    const bodyCenter = this.getCenter();
    const targetPoint = "getCenter" in target ? target.getCenter() : target;
    const deltaX = targetPoint.x - bodyCenter.x;
    const turnAngle = Math.sign(deltaX) * Math.min(30, Math.abs(deltaX) / 10);
    return this.turnTo(turnAngle, options);
  }

  async resetPose(options?: AnimationParams): Promise<void> {
    const duration = options?.duration ?? 300;

    // Stop skew animation too
    if (this._skewAnimation) {
      this._skewAnimation.pause();
      this._skewAnimation = null;
    }

    // Reset everything
    this._currentAnimation = animate(this._state, {
      rotateY: 0,
      rotateZ: 0,
      bobY: 0,
      skewX: 0,
      x: 0,
      y: 0,
      scale: 1,
      duration,
      ease: "outQuad",
      onUpdate: () => this.applyTransform(),
    });

    return this._currentAnimation.then();
  }

  getCurrentTurnAngle(): number {
    return this._state.rotateY;
  }

  stopAnimations(): void {
    if (this._currentAnimation) {
      this._currentAnimation.pause(); // v4
      this._currentAnimation = null;
    }
    if (this._walkAnimation) {
      this._walkAnimation.pause();
      this._walkAnimation = null;
    }
    if (this._skewAnimation) {
      this._skewAnimation.pause();
      this._skewAnimation = null;
    }
  }

  isAnimating(): boolean {
    return (
      (this._currentAnimation !== null && !this._currentAnimation.completed) ||
      (this._walkAnimation !== null && !this._walkAnimation.completed) ||
      (this._skewAnimation !== null && !this._skewAnimation.completed)
    );
  }

  // --- Convenience methods ---

  async faceCamera(options?: AnimationParams): Promise<void> {
    return this.turnTo(0, options);
  }

  async turnToward(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void> {
    return this.lookAt(target, options);
  }

  async turnAwayFrom(
    target: Point | { getCenter(): Point },
    options?: AnimationParams,
  ): Promise<void> {
    const bodyCenter = this.getCenter();
    const targetPoint = "getCenter" in target ? target.getCenter() : target;
    const deltaX = targetPoint.x - bodyCenter.x;
    const awayAngle = -Math.sign(deltaX) * Math.min(30, Math.abs(deltaX) / 10);
    return this.turnTo(awayAngle, options);
  }

  // --- State query methods ---

  isFacingCamera(): boolean {
    return Math.abs(this._state.rotateY) < 15;
  }

  getFacingDirection(): FacingDirection {
    const angle = this._state.rotateY;
    const absAngle = Math.abs(angle);

    if (absAngle < 15) return "camera";
    if (absAngle > 165) return "away";
    return angle > 0 ? "right" : "left";
  }

  getCenter(): Point {
    const bounds = this.element.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }

  toString(): string {
    return `BodyController: angle=${this._state.rotateY}, pos=${this._state.x},${this._state.y}`;
  }
}

/**
 * Factory function to create a BodyController
 */
export function createBodyController(svgElement: SVGElement): BodyController {
  return new BodyControllerImpl(svgElement);
}
