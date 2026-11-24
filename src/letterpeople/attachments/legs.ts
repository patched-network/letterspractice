import type { AnimationParams } from "animejs";
import type { Point } from "../util/geometry";
import type { BodyController } from "./body";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Configuration for the legs attachment.
 */
export interface LegsOptions {
  /** Left hip attachment point in SVG-local coords */
  leftHip: Point;
  /** Right hip attachment point in SVG-local coords */
  rightHip: Point;
  /** Y coordinate of the "floor" where feet rest, in SVG-local coords.
   *  Defaults to VIEWBOX_HEIGHT + DESCENDER_DEPTH (135) — the descender baseline. */
  floorY?: number;
  /** Horizontal spread of feet relative to hips. 1.0 = directly below hips at rest. */
  footSpread?: number;
  /** Leg stroke color */
  color?: string;
  /** Leg stroke width (SVG units) */
  thickness?: number;
  /** Foot radius (SVG units) */
  footRadius?: number;
  /** Whether to show a "knee" bend (quadratic bezier mid-control offset) */
  kneeBend?: number;
}

/**
 * Public interface for controlling legs.
 */
export interface LegsAttachment {
  /** The root SVG group element containing both legs */
  readonly element: SVGGElement;

  /** Show legs with optional animation */
  show(options?: AnimationParams): Promise<void>;

  /** Hide legs with optional animation */
  hide(options?: AnimationParams): Promise<void>;

  /** Whether legs are currently visible */
  isVisible(): boolean;

  /** Start the rAF sync loop that tracks body skew */
  startSync(): void;

  /** Stop the rAF sync loop */
  stopSync(): void;

  /** Whether the sync loop is currently running */
  isSyncing(): boolean;

  /** Force a single sync update (useful for manual stepping) */
  syncOnce(): void;

  /** Update the floor Y position */
  setFloorY(y: number): void;

  /** Get the current floor Y */
  getFloorY(): number;

  /** Update the knee bend amount (SVG px perpendicular offset; negative = bow-legged) */
  setKneeBend(value: number): void;

  /** Get the current knee bend */
  getKneeBend(): number;

  /** Update foot positions (e.g. for walking) */
  setFootPositions(left: Point, right: Point): void;

  /** Get current foot positions */
  getFootPositions(): { left: Point; right: Point };

  /** Clean up resources */
  destroy(): void;

  toString(): string;
}

// ── Default constants ──────────────────────────────────────────────────────

/** Default floor Y: VIEWBOX_HEIGHT + DESCENDER_DEPTH = 135 */
const DEFAULT_FLOOR_Y = 135;
const DEFAULT_COLOR = "#444";
const DEFAULT_THICKNESS = 3;
const DEFAULT_FOOT_RADIUS = 4;
const DEFAULT_KNEE_BEND = 8;
const DEFAULT_FOOT_SPREAD = 1.0;

// ── Implementation ─────────────────────────────────────────────────────────

class LegsControllerImpl implements LegsAttachment {
  readonly element: SVGGElement;

  private _bodyController: BodyController;
  private _leftHip: Point;
  private _rightHip: Point;
  private _floorY: number;
  private _footSpread: number;
  private _kneeBend: number;

  // Foot positions (SVG-local, pre-skew space for "rest" position)
  private _leftFoot: Point;
  private _rightFoot: Point;

  // SVG elements
  private _leftLegPath: SVGPathElement;
  private _rightLegPath: SVGPathElement;
  private _leftFootCircle: SVGCircleElement;
  private _rightFootCircle: SVGCircleElement;

  // rAF sync
  private _rafId: number | null = null;
  private _syncing: boolean = false;
  private _visible: boolean = false;

  constructor(
    contentGroup: SVGGElement,
    bodyController: BodyController,
    _svgElement: SVGElement,
    options: LegsOptions,
  ) {
    this._bodyController = bodyController;
    this._leftHip = { ...options.leftHip };
    this._rightHip = { ...options.rightHip };
    this._floorY = options.floorY ?? DEFAULT_FLOOR_Y;
    this._footSpread = options.footSpread ?? DEFAULT_FOOT_SPREAD;
    this._kneeBend = options.kneeBend ?? DEFAULT_KNEE_BEND;

    const color = options.color ?? DEFAULT_COLOR;
    const thickness = options.thickness ?? DEFAULT_THICKNESS;
    const footRadius = options.footRadius ?? DEFAULT_FOOT_RADIUS;

    // Default foot positions: directly below hips at floor level
    this._leftFoot = {
      x: this._leftHip.x * this._footSpread,
      y: this._floorY,
    };
    this._rightFoot = {
      x: this._rightHip.x * this._footSpread,
      y: this._floorY,
    };

    // Create SVG group
    this.element = document.createElementNS(SVG_NS, "g");
    this.element.setAttribute("class", "letter-attachment letter-legs");
    this.element.style.opacity = "0";

    // Create leg paths
    this._leftLegPath = document.createElementNS(SVG_NS, "path");
    this._leftLegPath.setAttribute("fill", "none");
    this._leftLegPath.setAttribute("stroke", color);
    this._leftLegPath.setAttribute("stroke-width", String(thickness));
    this._leftLegPath.setAttribute("stroke-linecap", "round");
    this._leftLegPath.setAttribute("stroke-linejoin", "round");

    this._rightLegPath = document.createElementNS(SVG_NS, "path");
    this._rightLegPath.setAttribute("fill", "none");
    this._rightLegPath.setAttribute("stroke", color);
    this._rightLegPath.setAttribute("stroke-width", String(thickness));
    this._rightLegPath.setAttribute("stroke-linecap", "round");
    this._rightLegPath.setAttribute("stroke-linejoin", "round");

    // Create foot circles
    this._leftFootCircle = document.createElementNS(SVG_NS, "circle");
    this._leftFootCircle.setAttribute("r", String(footRadius));
    this._leftFootCircle.setAttribute("fill", color);

    this._rightFootCircle = document.createElementNS(SVG_NS, "circle");
    this._rightFootCircle.setAttribute("r", String(footRadius));
    this._rightFootCircle.setAttribute("fill", color);

    // Assemble
    this.element.appendChild(this._leftLegPath);
    this.element.appendChild(this._rightLegPath);
    this.element.appendChild(this._leftFootCircle);
    this.element.appendChild(this._rightFootCircle);

    // Insert the legs group at the beginning of contentGroup
    // so they render behind the letter body (legs are behind the character)
    const firstChild = contentGroup.firstChild;
    if (firstChild) {
      contentGroup.insertBefore(this.element, firstChild);
    } else {
      contentGroup.appendChild(this.element);
    }

    // Initial render
    this._updatePaths();
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  async show(options?: AnimationParams): Promise<void> {
    this._visible = true;
    const duration = (options?.duration as number) ?? 250;
    if (duration > 0) {
      // Simple opacity transition
      this.element.style.transition = `opacity ${duration}ms ease`;
      this.element.style.opacity = "1";
      return new Promise((resolve) => setTimeout(resolve, duration));
    } else {
      this.element.style.opacity = "1";
    }
  }

  async hide(options?: AnimationParams): Promise<void> {
    this._visible = false;
    const duration = (options?.duration as number) ?? 250;
    if (duration > 0) {
      this.element.style.transition = `opacity ${duration}ms ease`;
      this.element.style.opacity = "0";
      return new Promise((resolve) => setTimeout(resolve, duration));
    } else {
      this.element.style.opacity = "0";
    }
  }

  isVisible(): boolean {
    return this._visible;
  }

  // ── Sync loop ────────────────────────────────────────────────────────────

  startSync(): void {
    if (this._syncing) return;
    this._syncing = true;
    this._tick();
  }

  stopSync(): void {
    this._syncing = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  isSyncing(): boolean {
    return this._syncing;
  }

  syncOnce(): void {
    this._updatePaths();
  }

  private _tick = (): void => {
    if (!this._syncing) return;
    this._updatePaths();
    this._rafId = requestAnimationFrame(this._tick);
  };

  // ── Core path computation ────────────────────────────────────────────────

  /**
   * Recompute leg paths for the current body skew.
   *
   * The legs group lives inside the skewed SVG (no counter-skew on the group).
   * Hip coords stay at their SVG-local positions — the body's skewX(θ) with
   * transform-origin "center top" shifts them on screen automatically.
   *
   * Foot coords are compensated so they appear stationary on screen despite
   * the parent skew:
   *   screen_x = local_x + local_y · tan(θ)
   *   → local_x = desired_screen_x − local_y · tan(θ)
   */
  private _updatePaths(): void {
    const skewDeg = this._bodyController.getCurrentSkew();
    const tanSkew = Math.tan((skewDeg * Math.PI) / 180);

    // Hips: plain SVG-local coords — body skew moves them on screen
    const leftHipLocal = this._leftHip;
    const rightHipLocal = this._rightHip;

    // Feet: compensate for parent skew so they stay planted
    const leftFootLocal: Point = {
      x: this._leftFoot.x - this._leftFoot.y * tanSkew,
      y: this._leftFoot.y,
    };
    const rightFootLocal: Point = {
      x: this._rightFoot.x - this._rightFoot.y * tanSkew,
      y: this._rightFoot.y,
    };
    this._drawLeg(
      this._leftLegPath,
      this._leftFootCircle,
      leftHipLocal,
      leftFootLocal,
      -1,
    );
    this._drawLeg(
      this._rightLegPath,
      this._rightFootCircle,
      rightHipLocal,
      rightFootLocal,
      1,
    );
  }

  /**
   * Draw a single leg as a quadratic bezier with a knee control point.
   * @param side -1 for left leg, +1 for right leg (affects knee bend direction)
   */
  private _drawLeg(
    pathEl: SVGPathElement,
    footEl: SVGCircleElement,
    hip: Point,
    foot: Point,
    side: number,
  ): void {
    // Midpoint between hip and foot
    const midX = (hip.x + foot.x) / 2;
    const midY = (hip.y + foot.y) / 2;

    // Perpendicular offset for knee bend
    const dx = foot.x - hip.x;
    const dy = foot.y - hip.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;

    // Knee control point: offset perpendicular to the hip→foot line.
    // Slight inward bend (knees point inward)
    const kneeX = midX + perpX * this._kneeBend * side;
    const kneeY = midY + perpY * this._kneeBend * side;

    const d = `M ${hip.x.toFixed(2)} ${hip.y.toFixed(2)} Q ${kneeX.toFixed(2)} ${kneeY.toFixed(2)} ${foot.x.toFixed(2)} ${foot.y.toFixed(2)}`;
    pathEl.setAttribute("d", d);

    footEl.setAttribute("cx", foot.x.toFixed(2));
    footEl.setAttribute("cy", foot.y.toFixed(2));
  }

  // ── Configuration ────────────────────────────────────────────────────────

  setFloorY(y: number): void {
    this._floorY = y;
    this._leftFoot.y = y;
    this._rightFoot.y = y;
    this._updatePaths();
  }

  getFloorY(): number {
    return this._floorY;
  }

  setKneeBend(value: number): void {
    this._kneeBend = value;
    this._updatePaths();
  }

  getKneeBend(): number {
    return this._kneeBend;
  }

  setFootPositions(left: Point, right: Point): void {
    this._leftFoot = { ...left };
    this._rightFoot = { ...right };
    this._updatePaths();
  }

  getFootPositions(): { left: Point; right: Point } {
    return {
      left: { ...this._leftFoot },
      right: { ...this._rightFoot },
    };
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    this.stopSync();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  toString(): string {
    return `LegsAttachment: visible=${this._visible}, syncing=${this._syncing}, floorY=${this._floorY}`;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a legs attachment controller.
 *
 * @param contentGroup  The <g> element that holds letter body and attachments.
 * @param bodyController  The body controller (for reading current skew).
 * @param svgElement  The root <svg> element (transform target).
 * @param options  Leg configuration.
 */
export function createLegsController(
  contentGroup: SVGGElement,
  bodyController: BodyController,
  svgElement: SVGElement,
  options: LegsOptions,
): LegsAttachment {
  return new LegsControllerImpl(
    contentGroup,
    bodyController,
    svgElement,
    options,
  );
}
