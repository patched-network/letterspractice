/**
 * @file Defines common types for LetterPeople attachments.
 */

import type { AnimationParams } from "animejs";
import type { Point } from "../util/geometry";

export type attachmentTypes =
  | "eyes-group"
  | "eye"
  | "mouth"
  | "arm"
  | "arms-group"
  | "eyebrow"
  | "brows-group"
  | "legs";

/**
 * Represents a generic, controllable attachment part of a LetterInstance.
 * Specific attachment types (e.g., EyeAttachment, MouthAttachment) will implement
 * this interface, potentially adding their own specific methods.
 */
export interface BaseAttachment {
  /**
   * A read-only reference to the root SVG group (<g>) element for this attachment.
   * This element contains all visual parts of the attachment.
   */
  readonly element: SVGGElement;

  /**
   * A read-only string identifying the type of attachment (e.g., 'eye', 'mouth', 'eyebrow').
   */
  readonly type: attachmentTypes;

  /**
   * Makes the attachment visible, potentially with an animation.
   * @param options Optional animation parameters for the transition.
   * @returns A Promise that resolves when the show animation completes (or immediately if no animation).
   */
  show(options?: AnimationParams): Promise<void>;

  /**
   * Makes the attachment invisible, potentially with an animation.
   * @param options Optional animation parameters for the transition.
   * @returns A Promise that resolves when the hide animation completes (or immediately if no animation).
   */
  hide(options?: AnimationParams): Promise<void>;

  /**
   * Checks if the attachment is currently considered visible (or transitioning to visible).
   * This might check CSS classes, display style, or internal state.
   * @returns True if visible, false otherwise.
   */
  isVisible(): boolean;

  /**
   * Formats the state of the attachment for debugging purposes.
   * @returns A description of the current state of the attachment .
   */
  toString(): string;

  /**
   * Optional: Checks if the attachment is currently undergoing an animation controlled by its methods.
   * @returns True if animating, false otherwise.
   */
  isAnimating?(): boolean;

  /**
   * Optional: Immediately stops any ongoing animations controlled by this attachment.
   */
  stopAnimations?(): void;

  // Note: A 'destroy' method isn't included here, as the attachment's SVG element
  // is typically removed when the parent LetterInstance is destroyed. If attachments
  // need more complex cleanup (e.g., removing global event listeners), a destroy
  // method could be added.
}

// Example of a more specific attachment interface (defined elsewhere, e.g., mouth.ts)

import type { MouthParameters } from "./mouth"; // Assuming this is where MouthParameters is defined

export interface MouthAttachment extends BaseAttachment {
  readonly type: "mouth";

  // Method to update the mouth shape, potentially animated
  updateShape(
    params: Partial<MouthParameters>,
    options?: AnimationParams,
  ): Promise<void>;

  // Method to get current shape parameters
  getCurrentShapeParams(): MouthParameters;

  // Specific animation like speaking
  animateSpeak(speakOptions?: AnimationParams): Promise<void>;
}

// Import BrowsController type for integration
import type { BrowsController } from "./eyebrow";

export interface EyesAttachment {
  // expose individual eyes
  left: EyeAttachment;
  right: EyeAttachment;

  // Eyebrows controller (optional, may not be present if eyebrows disabled)
  brows?: BrowsController;

  // and helper fcns that apply actions to both eyes - eg, blink, scowl, etc
  blink(blinkOptions?: AnimationParams): Promise<void>;

  /**
   * Make both eyes look in the specified direction
   * @param direction The direction to look in as {x, y} coordinates or angle in degrees
   * @param options Optional animation parameters for the eye movement
   */
  lookAt(
    direction: { x: number; y: number } | number,
    options?: AnimationParams,
  ): Promise<void>;

  /**
   * Make both eyes look toward a specific point in SVG coordinate space.
   * Each eye computes its own direction from its center to the target.
   */
  lookAtPoint(
    point: { x: number; y: number },
    options?: AnimationParams,
  ): Promise<void>;

  /**
   * Start tracking the mouse cursor with both eyes
   * @param options Options for tracking behavior
   */
  startTracking(options?: {
    intensity?: number; // How strongly the eyes follow (0-1), defaults to 0.5
    ease?: string; // Easing function for tracking movement
  }): void;

  /**
   * Stop tracking the cursor with both eyes
   */
  stopTracking(): void;

  /**
   * Check if eyes are currently tracking the cursor
   */
  isTracking(): boolean;

  // Common interface methods (matching ArmsAttachment pattern)
  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;
  isAnimating(): boolean;
  stopAnimations(): void;
  toString(): string;
}

export interface EyeAttachment extends BaseAttachment {
  readonly type: "eye";

  /**
   * Causes the eye to quickly close and reopen
   * @param blinkOptions Optional animation parameters for the wink.
   */
  wink(blinkOptions?: AnimationParams): Promise<void>;

  /**
   * Shows the eye by opening it: it appears shut (a slit) and the lid opens,
   * rather than fading in already open. `show()` is the fade.
   */
  open(options?: AnimationParams): Promise<void>;

  /** Hides the eye by shutting it, then letting the slit go. The reverse of `open()`. */
  close(options?: AnimationParams): Promise<void>;

  /**
   * Makes the pupil look in a specific direction
   * @param direction The direction to look in as {x, y} coordinates or angle in degrees.
   * @param options Optional animation parameters for the eye movement.
   */
  lookAt(
    direction: { x: number; y: number } | number,
    options?: AnimationParams,
  ): Promise<void>;

  /**
   * Makes the pupil look toward a specific point in SVG coordinate space.
   * Computes direction from the eye center to the target point.
   * @param point The target point in SVG coordinates to look at.
   * @param options Optional animation parameters for the eye movement.
   */
  lookAtPoint(
    point: { x: number; y: number },
    options?: AnimationParams,
  ): Promise<void>;

  /**
   * Returns the current position of the pupil as an offset from center
   */
  getPupilPosition(): { x: number; y: number };

  /**
   * Start tracking the mouse cursor with the pupil
   * @param options Options for tracking behavior
   */
  startTracking(options?: {
    intensity?: number; // How strongly the eyes follow (0-1), defaults to 0.5
    ease?: string; // Easing function for tracking movement
  }): void;

  /**
   * Stop tracking the cursor
   */
  stopTracking(): void;

  /**
   * Check if this eye is currently tracking the cursor
   */
  isTracking(): boolean;
}

/**
 * Options for the arm "wave hello" gesture.
 *
 * Unlike a resting sway, `wave()` raises the arm to `raiseAngle`, oscillates
 * the hand there `count` times with peak-to-peak `amplitude`, then lowers it
 * back to where it started.
 */
export type ArmWaveOptions = AnimationParams & {
  /**
   * Angle (degrees; 0 = right, 90 = down) to raise the arm to before
   * oscillating. Defaults to the vertical mirror of the arm's resting angle —
   * an up-and-out raise (right 30°→330°, left 150°→210°).
   */
  raiseAngle?: number;
  /** Peak-to-peak oscillation of the raised hand, in degrees. Default 40. */
  amplitude?: number;
  /** Number of back-and-forth oscillations. Default 3. */
  count?: number;
};

export type ArmsWaveOptions = ArmWaveOptions & {
  /**
   * Which arm waves. Default `'right'` — a single one-handed hello.
   * `'both'` raises both arms (staggered).
   */
  arm?: "left" | "right" | "both";
};

export interface ArmsAttachment {
  // expose individual arms
  left: ArmAttachment;
  right: ArmAttachment;

  // helper functions that apply to both arms
  wave(options?: ArmsWaveOptions): Promise<void>;
  relax(options?: AnimationParams): Promise<void>; // Return both arms to resting position

  // common interface methods
  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;
  isAnimating(): boolean;
  stopAnimations(): void;
  toString(): string;
}

export interface ArmAttachment extends BaseAttachment {
  readonly type: "arm";

  rotateTo(angle: number, options?: AnimationParams): Promise<void>;
  wave(options?: ArmWaveOptions): Promise<void>;
  relax(options?: AnimationParams): Promise<void>; // Return to default resting position
  setLength(newLength: number, options?: AnimationParams): Promise<void>;
  getCurrentAngle(): number;

  // Hand Position API Extension
  getCurrentLength(): number;
  getShoulderPosition(): Point;
  getHandPosition(): Point;
  setHandPosition(target: Point, options?: AnimationParams): Promise<void>;

  // Z-layer control (for passing arm behind/in-front-of letter body)
  /**
   * Move this arm's SVG group to render in front of the letter body.
   * This is the default state — arms paint on top of the letter path.
   */
  bringToFront(): void;
  /**
   * Move this arm's SVG group to render behind the letter body.
   * Used for choreography where an arm passes behind the character
   * (e.g. flossing dance, behind-the-back catches).
   */
  sendToBack(): void;
  /**
   * Returns true if this arm is currently rendering behind the letter body.
   */
  isBehindBody(): boolean;
}
