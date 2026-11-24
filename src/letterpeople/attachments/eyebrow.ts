/**
 * Eyebrow Attachment for LetterPeople
 *
 * Simple arc-based eyebrows with expression presets.
 * Integrated with EyesAttachment via brows property.
 */

import { BaseController } from "./BaseController";
import type { Point } from "../util/geometry";
import { animate, AnimationParams, JSAnimation } from "animejs";

const svgNS = "http://www.w3.org/2000/svg";

// --- Options & Interfaces ---

export interface EyebrowOptions {
  /** Width of the eyebrow (default: 10) */
  width?: number;
  /** Thickness/stroke width (default: 2.5) */
  thickness?: number;
  /** Color of the eyebrow (default: "black") */
  color?: string;
  /** Arch amount 0-1 (default: 0.25) */
  arch?: number;
  /** X coordinate of eyebrow center */
  x: number;
  /** Y coordinate of eyebrow center */
  y: number;
  /** Which side the eyebrow is on */
  side: "left" | "right";
}

// Default values
const DEFAULT_WIDTH = 10;
const DEFAULT_THICKNESS = 2.5;
const DEFAULT_COLOR = "black";
const DEFAULT_ARCH = 0.25;

// --- Expression Presets ---

export interface EyebrowState {
  /** Vertical raise amount (negative = up) */
  raise: number;
  /** Rotation in degrees (positive = inner end down for left brow) */
  rotate: number;
}

export interface ExpressionConfig {
  left: EyebrowState;
  right: EyebrowState;
}

export type EmotionPreset = "neutral" | "happy" | "sad" | "angry" | "surprised";

export const EXPRESSION_PRESETS: Record<EmotionPreset, ExpressionConfig> = {
  neutral: {
    left: { raise: 0, rotate: 0 },
    right: { raise: 0, rotate: 0 },
  },
  happy: {
    left: { raise: -2, rotate: 3 },
    right: { raise: -2, rotate: -3 },
  },
  sad: {
    left: { raise: 1, rotate: -10 },
    right: { raise: 1, rotate: 10 },
  },
  angry: {
    left: { raise: 2, rotate: 15 },
    right: { raise: 2, rotate: -15 },
  },
  surprised: {
    left: { raise: -5, rotate: 0 },
    right: { raise: -5, rotate: 0 },
  },
};

// --- Attachment Interfaces ---

export interface EyebrowAttachment {
  readonly element: SVGGElement;
  readonly type: "eyebrow";
  readonly side: "left" | "right";

  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;

  /** Raise the eyebrow (negative amount = up) */
  raise(amount: number, options?: AnimationParams): Promise<void>;
  /** Lower the eyebrow (positive amount = down) */
  lower(amount: number, options?: AnimationParams): Promise<void>;
  /** Rotate the eyebrow in degrees */
  rotate(degrees: number, options?: AnimationParams): Promise<void>;
  /** Return to neutral position */
  relax(options?: AnimationParams): Promise<void>;
  /** Set to specific state */
  setState(state: EyebrowState, options?: AnimationParams): Promise<void>;

  /** Get current state */
  getState(): EyebrowState;

  isAnimating(): boolean;
  stopAnimations(): void;
}

export interface BrowsController {
  left: EyebrowAttachment;
  right: EyebrowAttachment;

  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;

  /** Apply an expression preset */
  express(emotion: EmotionPreset, options?: AnimationParams): Promise<void>;
  /** Return both brows to neutral */
  relax(options?: AnimationParams): Promise<void>;

  isAnimating(): boolean;
  stopAnimations(): void;
}

// --- SVG Creation ---

/**
 * Creates an SVG eyebrow element as a simple arc
 */
export function createEyebrow(options: EyebrowOptions): SVGGElement {
  const width = options.width ?? DEFAULT_WIDTH;
  const thickness = options.thickness ?? DEFAULT_THICKNESS;
  const color = options.color ?? DEFAULT_COLOR;
  const arch = options.arch ?? DEFAULT_ARCH;
  const { x, y, side } = options;

  const group = document.createElementNS(svgNS, "g");
  group.setAttribute(
    "class",
    `letter-attachment letter-eyebrow letter-eyebrow-${side}`,
  );
  group.style.transformOrigin = `${x}px ${y}px`;

  // Calculate arc points
  const halfWidth = width / 2;
  const archHeight = width * arch;

  // For left eyebrow: start on left (outer), end on right (inner)
  // For right eyebrow: start on right (outer), end on left (inner)
  const startX = side === "left" ? x - halfWidth : x + halfWidth;
  const endX = side === "left" ? x + halfWidth : x - halfWidth;
  const controlY = y - archHeight;

  // Create the arc path using quadratic bezier
  const path = document.createElementNS(svgNS, "path");
  const d = `M ${startX} ${y} Q ${x} ${controlY} ${endX} ${y}`;

  path.setAttribute("d", d);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", String(thickness));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("fill", "none");
  path.setAttribute("class", "eyebrow-arc");

  group.appendChild(path);

  // Hidden by default
  group.style.opacity = "0";

  return group;
}

// --- Controller Implementations ---

class EyebrowControllerImpl
  extends BaseController
  implements EyebrowAttachment
{
  readonly type: "eyebrow" = "eyebrow";
  readonly side: "left" | "right";

  private _options: EyebrowOptions;
  private _currentState: EyebrowState = { raise: 0, rotate: 0 };
  private _center: Point;

  constructor(svgGroup: SVGGElement, options: EyebrowOptions) {
    super(svgGroup, "eyebrow");

    this._options = { ...options };
    this.side = options.side;
    this._center = { x: options.x, y: options.y };
  }

  async raise(amount: number, options?: AnimationParams): Promise<void> {
    const newState = {
      ...this._currentState,
      raise: this._currentState.raise + amount,
    };
    return this.setState(newState, options);
  }

  async lower(amount: number, options?: AnimationParams): Promise<void> {
    return this.raise(-amount, options);
  }

  async rotate(degrees: number, options?: AnimationParams): Promise<void> {
    const newState = { ...this._currentState, rotate: degrees };
    return this.setState(newState, options);
  }

  async relax(options?: AnimationParams): Promise<void> {
    return this.setState({ raise: 0, rotate: 0 }, options);
  }

  async setState(
    state: EyebrowState,
    options?: AnimationParams,
  ): Promise<void> {
    this.stopAnimations();

    const targetRaise = state.raise;
    const targetRotate = state.rotate;
    const duration = (options?.duration ?? 250) as number;
    const ease = options?.ease ?? "outQuad";

    if (duration > 0) {
      const startRaise = this._currentState.raise;
      const startRotate = this._currentState.rotate;

      const animObj = { raise: startRaise, rotate: startRotate };

      this._currentAnimation = animate(animObj, {
        raise: targetRaise,
        rotate: targetRotate,
        duration,
        ease,
        delay: options?.delay ?? 0,
        onUpdate: () => {
          this._applyTransform(animObj.raise, animObj.rotate);
        },
      });

      await this._currentAnimation.then(() => {
        this._currentState = { raise: targetRaise, rotate: targetRotate };
        this._currentAnimation = null;
      });
    } else {
      this._applyTransform(targetRaise, targetRotate);
      this._currentState = { raise: targetRaise, rotate: targetRotate };
    }
  }

  private _applyTransform(raise: number, rotate: number): void {
    this.element.style.transform = `translateY(${raise}px) rotate(${rotate}deg)`;
  }

  getState(): EyebrowState {
    return { ...this._currentState };
  }

  toString(): string {
    return `EyebrowAttachment(${this.side}): visible=${this.isVisible()}, raise=${this._currentState.raise}, rotate=${this._currentState.rotate}`;
  }
}

class BrowsControllerImpl implements BrowsController {
  public readonly left: EyebrowAttachment;
  public readonly right: EyebrowAttachment;

  private _eyebrowsWithEyes: boolean;

  constructor(
    leftBrow: EyebrowAttachment,
    rightBrow: EyebrowAttachment,
    eyebrowsWithEyes: boolean = true,
  ) {
    this.left = leftBrow;
    this.right = rightBrow;
    this._eyebrowsWithEyes = eyebrowsWithEyes;
  }

  get eyebrowsWithEyes(): boolean {
    return this._eyebrowsWithEyes;
  }

  async show(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.show(options), this.right.show(options)]);
  }

  async hide(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.hide(options), this.right.hide(options)]);
  }

  isVisible(): boolean {
    return this.left.isVisible() && this.right.isVisible();
  }

  async express(
    emotion: EmotionPreset,
    options?: AnimationParams,
  ): Promise<void> {
    const config = EXPRESSION_PRESETS[emotion];
    if (!config) {
      console.warn(`Unknown emotion preset: ${emotion}`);
      return;
    }

    await Promise.all([
      this.left.setState(config.left, options),
      this.right.setState(config.right, options),
    ]);
  }

  async relax(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.relax(options), this.right.relax(options)]);
  }

  isAnimating(): boolean {
    return this.left.isAnimating() || this.right.isAnimating();
  }

  stopAnimations(): void {
    this.left.stopAnimations();
    this.right.stopAnimations();
  }

  toString(): string {
    return `BrowsController: Left(${this.left.toString()}), Right(${this.right.toString()})`;
  }
}

// --- Factory Functions ---

/**
 * Creates an EyebrowController instance
 */
export function createEyebrowController(
  svgGroup: SVGGElement,
  options: EyebrowOptions,
): EyebrowAttachment {
  return new EyebrowControllerImpl(svgGroup, options);
}

/**
 * Creates a BrowsController instance for coordinated eyebrow control
 */
export function createBrowsController(
  leftBrow: EyebrowAttachment,
  rightBrow: EyebrowAttachment,
  eyebrowsWithEyes: boolean = true,
): BrowsController {
  return new BrowsControllerImpl(leftBrow, rightBrow, eyebrowsWithEyes);
}

/**
 * Helper to calculate eyebrow position relative to eye position
 */
export function calculateEyebrowPosition(
  eyePosition: Point,
  eyeSize: number = 8,
): Point {
  return {
    x: eyePosition.x,
    y: eyePosition.y - eyeSize * 0.9, // Position above the eye
  };
}
