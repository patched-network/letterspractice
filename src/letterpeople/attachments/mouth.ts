import { BaseController } from "./BaseController";
import type { Point } from "../util/geometry";
import type { MouthAttachment } from "./types";
import { animate, AnimationParams, JSAnimation, utils } from "animejs";

const svgNS = "http://www.w3.org/2000/svg";

// Helper function for linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

// Clamp a value between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Parameters controlling the dynamic shape of the morphing mouth.
 */
export interface MouthParameters {
  /**
   * Controls the transition from a curve to a circle-like shape.
   * 0: Collapsed to a curve (mood determines smile/frown).
   * 1: Full circle-like shape.
   * Clamped between 0 and 1.
   */
  openness: number; // 0-1

  /**
   * Controls the curvature from frown to smile, most prominent when openness is low.
   * 0: Maximum frown.
   * 0.5: Neutral horizontal curve/ellipse-like shape.
   * 1: Maximum smile.
   * Clamped between 0 and 1.
   */
  mood: number; // 0-1
}

/**
 * Static options for customizing the appearance of the morphing mouth.
 */
export interface MouthAppearanceOptions {
  /** The maximum horizontal width of the mouth. Defaults to 20. */
  width?: number;
  /** Fill color for the mouth shape. Defaults to 'black'. Use 'none' for no fill. */
  fillColor?: string;
  /** Stroke color for the mouth outline. Defaults to 'none'. */
  strokeColor?: string;
  /** Stroke width for the mouth outline. Defaults to 1. Only visible if strokeColor is not 'none'. */
  strokeWidth?: number;
  /** Maximum curvature influence for mood (as ratio of width/2). Defaults to 0.8 (may need tuning for Beziers). */
  maxMoodInfluenceRatio?: number;
  /** Controls the "pointiness" of the Bezier curve. 1.0 is smooth, >1 makes it pointier. Defaults to 1.0. */
  bezierSharpness?: number; // New option for tuning Bezier shape
}

// --- Default values ---
const DEFAULT_MOUTH_WIDTH = 20;
const DEFAULT_FILL_COLOR = "black";
const DEFAULT_STROKE_COLOR = "none";
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_MAX_MOOD_RATIO = 0.8; // Adjusted default for Bezier
const DEFAULT_BEZIER_SHARPNESS = 1.0; // Default to smooth quadratic curve

/** Default expression for a freshly created mouth. */
export const DEFAULT_MOUTH_PARAMS: MouthParameters = {
  openness: 0.2,
  mood: 0.7,
};

/**
 * Renderer-independent mouth outline: two quadratic Beziers sharing the
 * endpoints `start` (left) and `end` (right). Coordinates are letter-local
 * SVG units (y-down).
 */
export interface MouthCurve {
  start: Point;
  end: Point;
  /** Control point of the start→end (lower) curve. */
  bottomControl: Point;
  /** Control point of the end→start (upper) curve. */
  topControl: Point;
}

/**
 * Computes the mouth outline for the given parameters. The shape transitions
 * between a curve (smile/frown) and a circle-like shape.
 *
 * @param x - The desired center X coordinate for the mouth.
 * @param y - The desired center Y coordinate for the mouth baseline.
 * @param params - Dynamic parameters controlling the mouth shape (openness, mood).
 * @param options - Optional static configuration for the mouth's appearance.
 */
export function computeMouthCurve(
  x: number,
  y: number,
  params: MouthParameters,
  options?: MouthAppearanceOptions,
): MouthCurve {
  const width = options?.width ?? DEFAULT_MOUTH_WIDTH;
  const strokeColor = options?.strokeColor ?? DEFAULT_STROKE_COLOR;
  const strokeWidth = options?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const maxMoodRatio = options?.maxMoodInfluenceRatio ?? DEFAULT_MAX_MOOD_RATIO;
  const sharpness = options?.bezierSharpness ?? DEFAULT_BEZIER_SHARPNESS;

  // Clamp parameters for safety
  const openness = clamp(params.openness, 0, 1);
  const mood = clamp(params.mood, 0, 1);

  const rx = Math.max(0.1, width / 2); // Horizontal radius

  // Minimum vertical extent (prevents complete collapse)
  const min_ry = Math.max(
    2,
    strokeColor !== "none" && strokeWidth > 0 ? strokeWidth / 2 : 0.5,
  );

  // Base vertical extent: interpolates from min_ry to rx based on openness
  const baseVerticalExtent = Math.max(min_ry, lerp(min_ry, rx, openness));

  // Mood influence: interpolates from -1 (frown) to +1 (smile)
  const moodFactor = lerp(-1, 1, mood);

  // Vertical offset caused by mood (strongest at openness=0), applied to
  // both control points
  const moodVerticalOffset = moodFactor * (rx * maxMoodRatio) * (1 - openness);

  // Positive Y is down, Negative Y is up.
  const bottomControlPointYTarget = y + baseVerticalExtent + moodVerticalOffset;
  const topControlPointYTarget = y - baseVerticalExtent + moodVerticalOffset;

  // Sharpness > 1 pulls the control points further from the baseline,
  // making the curve peak sharper
  return {
    start: { x: x - rx, y },
    end: { x: x + rx, y },
    bottomControl: { x, y: y + (bottomControlPointYTarget - y) * sharpness },
    topControl: { x, y: y + (topControlPointYTarget - y) * sharpness },
  };
}

/** SVG path data for a mouth curve. */
export function mouthCurveToPathD(c: MouthCurve): string {
  const f = (n: number) => n.toFixed(3);
  return [
    `M ${f(c.start.x)} ${f(c.start.y)}`,
    `Q ${f(c.bottomControl.x)} ${f(c.bottomControl.y)} ${f(c.end.x)} ${f(c.end.y)}`,
    `Q ${f(c.topControl.x)} ${f(c.topControl.y)} ${f(c.start.x)} ${f(c.start.y)}`,
    `Z`,
  ].join(" ");
}

/** SVG path data for the mouth at the given parameters. */
export function mouthPathD(
  x: number,
  y: number,
  params: MouthParameters,
  options?: MouthAppearanceOptions,
): string {
  return mouthCurveToPathD(computeMouthCurve(x, y, params, options));
}

/**
 * Creates SVG elements representing a morphable mouth shape using Bezier curves.
 *
 * @param x - The desired center X coordinate for the mouth.
 * @param y - The desired center Y coordinate for the mouth baseline.
 * @param params - Dynamic parameters controlling the mouth shape (openness, mood).
 * @param options - Optional static configuration for the mouth's appearance.
 * @returns An SVGGElement containing the mouth path.
 */
export function createMorphingMouth(
  x: number,
  y: number,
  params: MouthParameters,
  options?: MouthAppearanceOptions,
): SVGGElement {
  const fillColor = options?.fillColor ?? DEFAULT_FILL_COLOR;
  const strokeColor = options?.strokeColor ?? DEFAULT_STROKE_COLOR;
  const strokeWidth = options?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const d = mouthPathD(x, y, params, options);

  // --- Create SVG Elements ---
  const group = document.createElementNS(svgNS, "g");
  group.setAttribute(
    "class",
    "letter-attachment letter-mouth letter-mouth-bezier",
  );

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", fillColor);

  if (strokeColor !== "none" && strokeWidth > 0) {
    path.setAttribute("stroke", strokeColor);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
  } else {
    path.removeAttribute("stroke");
    path.removeAttribute("stroke-width");
  }

  group.appendChild(path);
  group.style.transformOrigin = `${x}px ${y}px`;

  // Initialize as hidden by default (opacity only - allows animation)
  group.style.opacity = "0";

  return group;
}

class MouthControllerImpl extends BaseController implements MouthAttachment {
  readonly type = "mouth";
  private _currentParams: MouthParameters;
  private _appearanceOptions?: MouthAppearanceOptions;
  private _attachmentCoord: Point;

  constructor(
    svgGroup: SVGGElement,
    initialParams: MouthParameters,
    appearanceOptions: MouthAppearanceOptions | undefined,
    attachmentCoord: Point,
  ) {
    super(svgGroup, "mouth");

    this._currentParams = { ...initialParams };
    this._appearanceOptions = appearanceOptions;
    this._attachmentCoord = attachmentCoord;
  }

  async updateShape(
    params: Partial<MouthParameters>,
    animOptions?: AnimationParams,
  ): Promise<void> {
    this.stopAnimations(); // Now non-optional in this class

    const oldParams = { ...this._currentParams };
    const newParams: MouthParameters = { ...this._currentParams, ...params };

    this._currentParams = { ...newParams };

    if (animOptions && animOptions.duration) {
      const animationDefaults = {
        duration: 300,
        ease: "inOutQuad",
        delay: 0,
        ...animOptions,
      };

      const tweenState = { ...oldParams };

      // Corrected animate call
      this._currentAnimation = animate(tweenState, {
        ...newParams, // Target values for properties in tweenState
        duration: animationDefaults.duration,
        ease: animationDefaults.ease,
        delay: animationDefaults.delay,
        onUpdate: () => {
          this.element
            .querySelector("path")
            ?.setAttribute(
              "d",
              mouthPathD(
                this._attachmentCoord.x,
                this._attachmentCoord.y,
                tweenState as MouthParameters,
                this._appearanceOptions,
              ),
            );
        },
        onComplete: () => {
          this._currentAnimation = null;
          this.element
            .querySelector("path")
            ?.setAttribute(
              "d",
              mouthPathD(
                this._attachmentCoord.x,
                this._attachmentCoord.y,
                this._currentParams,
                this._appearanceOptions,
              ),
            );
        },
        autoplay: true,
      });
      return this._currentAnimation.then();
    } else {
      const newMouthGroupContent = createMorphingMouth(
        this._attachmentCoord.x,
        this._attachmentCoord.y,
        this._currentParams,
        this._appearanceOptions,
      );
      this.element.innerHTML = newMouthGroupContent.innerHTML;
      this.element.style.transformOrigin =
        newMouthGroupContent.style.transformOrigin;
      return Promise.resolve();
    }
  }

  getCurrentShapeParams(): MouthParameters {
    return { ...this._currentParams };
  }

  toString(): string {
    return `MouthAttachment: visible=${this.isVisible()}, params=${JSON.stringify(this._currentParams)}`;
  }

  async animateSpeak(speakOptions?: AnimationParams): Promise<void> {
    this.stopAnimations(); // Now non-optional in this class
    const originalParams = this.getCurrentShapeParams();
    const openParams = {
      ...originalParams,
      openness: clamp(originalParams.openness + 0.4, 0, 1),
    };
    const duration = speakOptions?.duration ?? 200;
    const openEase = speakOptions?.ease ?? "outQuad";
    const closeEase = speakOptions?.ease ?? "inQuad";

    await this.updateShape(openParams, {
      ...speakOptions,
      ease: openEase,
      duration: duration,
    });
    await this.updateShape(originalParams, {
      ...speakOptions,
      ease: closeEase,
      duration: duration,
      delay: 0,
    });
  }
}

export function createMorphingMouthController(
  svgGroup: SVGGElement,
  initialParams: MouthParameters,
  appearanceOptions: MouthAppearanceOptions | undefined,
  attachmentCoord: Point,
): MouthAttachment {
  return new MouthControllerImpl(
    svgGroup,
    initialParams,
    appearanceOptions,
    attachmentCoord,
  );
}
