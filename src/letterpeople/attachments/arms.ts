import { BaseController } from "./BaseController";
import type { Point } from "../util/geometry";
import type {
  ArmAttachment,
  ArmsAttachment,
  ArmWaveOptions,
  ArmsWaveOptions,
} from "./types";
import { animate, AnimationParams, JSAnimation } from "animejs";

const svgNS = "http://www.w3.org/2000/svg";

/**
 * Reflect an arm angle across the horizontal axis (down ↔ up), keeping its
 * left/right lean. Maps a resting (hanging) angle to its raised counterpart:
 * right 30°→330° (up-right), left 150°→210° (up-left), 90° (down)→270° (up).
 */
export function mirrorUpAngle(angle: number): number {
  return (((360 - angle) % 360) + 360) % 360;
}

/**
 * Pick the rotation value congruent to `target` (mod 360) that is nearest to
 * `from`, so an animated sweep takes the short way around rather than
 * windmilling (e.g. raising the right arm 30°→330° goes up the outside as
 * −60°, not +300°).
 */
export function nearestRotation(target: number, from: number): number {
  let r = target;
  while (r - from > 180) r -= 360;
  while (r - from < -180) r += 360;
  return r;
}

/**
 * Options for customizing the appearance of an arm attachment.
 */
export interface ArmOptions {
  /** The length of the arm. Defaults to 15. */
  length?: number;
  /** The thickness of the arm. Defaults to 3. */
  thickness?: number;
  /** Fill color of the arm. Defaults to 'black'. */
  fillColor?: string;
  /** Stroke color for the arm outline. Defaults to 'none'. */
  strokeColor?: string;
  /** Stroke width for the arm outline. Defaults to 1. */
  strokeWidth?: number;
  /** The angle of the arm in degrees (0 = straight right, 90 = straight down). Defaults to 45. */
  angle?: number;
  /** The starting X coordinate for the arm (at the shoulder). */
  x: number;
  /** The starting Y coordinate for the arm (at the shoulder). */
  y: number;
}

// --- Default values ---
const DEFAULT_ARM_LENGTH = 17;
const DEFAULT_ARM_THICKNESS = 3;
const DEFAULT_FILL_COLOR = "black";
const DEFAULT_STROKE_COLOR = "none";
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_ARM_ANGLE = 45;

/**
 * Creates SVG elements representing an arm.
 *
 * @param options - Configuration for the arm's appearance and position.
 * @returns An SVGGElement containing the arm's SVG elements.
 */
export function createArm(options: ArmOptions): SVGGElement {
  // Process options with defaults
  const length = options.length ?? DEFAULT_ARM_LENGTH;
  const thickness = options.thickness ?? DEFAULT_ARM_THICKNESS;
  const fillColor = options.fillColor ?? DEFAULT_FILL_COLOR;
  const strokeColor = options.strokeColor ?? DEFAULT_STROKE_COLOR;
  const strokeWidth = options.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const angle = options.angle ?? DEFAULT_ARM_ANGLE;
  const x = options.x;
  const y = options.y;

  // Create a group element to hold the arm parts
  const group = document.createElementNS(svgNS, "g");
  group.setAttribute("class", "letter-attachment letter-arm");
  group.style.transformOrigin = `${x}px ${y}px`;

  // Calculate end position based on angle and length
  const angleInRadians = (angle * Math.PI) / 180;
  const endX = x + Math.cos(angleInRadians) * length;
  const endY = y + Math.sin(angleInRadians) * length;

  // Create a simple capsule-shaped arm with rounded ends
  const arm = document.createElementNS(svgNS, "path");

  // Calculate perpendicular direction for arm width
  const perpAngleInRadians = angleInRadians + Math.PI / 2;
  const halfWidth = thickness / 2;

  // Calculate offset vectors
  const offsetX = Math.cos(perpAngleInRadians) * halfWidth;
  const offsetY = Math.sin(perpAngleInRadians) * halfWidth;

  // Points for the rectangle part of the arm
  const p1x = x + offsetX;
  const p1y = y + offsetY;
  const p2x = x - offsetX;
  const p2y = y - offsetY;
  const p3x = endX - offsetX;
  const p3y = endY - offsetY;
  const p4x = endX + offsetX;
  const p4y = endY + offsetY;

  // Create a path with rounded ends using arcs (perfect semi-circles)
  const pathData = [
    // Start at top-left of shoulder
    `M ${p1x.toFixed(2)} ${p1y.toFixed(2)}`,

    // Draw line to top-right near hand
    `L ${p4x.toFixed(2)} ${p4y.toFixed(2)}`,

    // Draw semi-circle for hand end (clockwise)
    `A ${halfWidth.toFixed(2)} ${halfWidth.toFixed(2)} 0 1 1 ${p3x.toFixed(2)} ${p3y.toFixed(2)}`,

    // Draw line back to bottom-left near shoulder
    `L ${p2x.toFixed(2)} ${p2y.toFixed(2)}`,

    // Draw semi-circle for shoulder end (clockwise) - changed to go outward
    `A ${halfWidth.toFixed(2)} ${halfWidth.toFixed(2)} 0 1 0 ${p1x.toFixed(2)} ${p1y.toFixed(2)}`,

    // Close the path
    `Z`,
  ].join(" ");

  arm.setAttribute("d", pathData);
  arm.setAttribute("fill", fillColor);

  if (strokeColor !== "none" && strokeWidth > 0) {
    arm.setAttribute("stroke", strokeColor);
    arm.setAttribute("stroke-width", String(strokeWidth));
    arm.setAttribute("stroke-linejoin", "round");
    arm.setAttribute("stroke-linecap", "round");
  }

  // Add to the group
  group.appendChild(arm);

  // Add a hand/end cap to the arm
  const hand = document.createElementNS(svgNS, "circle");
  hand.setAttribute("cx", String(endX));
  hand.setAttribute("cy", String(endY));
  hand.setAttribute("r", String(thickness * 1.2)); // Hand size proportional to arm thickness
  hand.setAttribute("fill", fillColor);

  if (strokeColor !== "none" && strokeWidth > 0) {
    hand.setAttribute("stroke", strokeColor);
    hand.setAttribute("stroke-width", String(strokeWidth));
  }

  group.appendChild(hand);

  // Initialize as hidden by default (opacity only - allows animation)
  group.style.opacity = "0";

  return group;
}

// --- Type definition for arms attachment ---

// --- Implementation ---

class ArmControllerImpl extends BaseController implements ArmAttachment {
  readonly type: "arm" = "arm";
  private _options: ArmOptions;
  private _currentAngle: number;
  private _defaultAngle: number; // Store the initial resting angle
  private _bakedAngle: number; // Track the angle baked into current geometry
  private _currentLength: number;
  private _attachmentCoord: Point;
  private _isBehindBody: boolean = false;
  /**
   * Reference to the contentGroup that holds this arm and the letter body.
   * Set via `setContentGroup()` after construction — allows z-layer reordering.
   */
  private _contentGroup: SVGGElement | null = null;

  constructor(svgGroup: SVGGElement, options: ArmOptions) {
    super(svgGroup, "arm"); // Type is now included in attachmentTypes

    this._options = { ...options };
    this._defaultAngle = options.angle ?? DEFAULT_ARM_ANGLE;
    this._bakedAngle = this._defaultAngle; // Initially baked at default angle
    this._currentAngle = this._defaultAngle;
    this._currentLength = options.length ?? DEFAULT_ARM_LENGTH;
    this._attachmentCoord = { x: options.x, y: options.y };
  }

  /**
   * Provide the contentGroup reference so z-layer reordering can work.
   * Called by createLetter() after construction.
   */
  setContentGroup(contentGroup: SVGGElement): void {
    this._contentGroup = contentGroup;
  }

  async rotateTo(angle: number, options?: AnimationParams): Promise<void> {
    this.stopAnimations();

    const startAngle = this._currentAngle;
    this._currentAngle = angle;

    // CSS rotation is relative to the baked geometry angle
    const startRotation = startAngle - this._bakedAngle;
    const targetRotation = angle - this._bakedAngle;

    if (options && options.duration) {
      this._currentAnimation = animate(this.element, {
        rotate: [startRotation, targetRotation],
        duration: options.duration,
        easing: options.ease || "easeOutSine",
        delay: options.delay || 0,
      });

      return this._currentAnimation.then(() => {
        this._currentAnimation = null;
      });
    } else {
      this.element.style.transform = `rotate(${targetRotation}deg)`;
      return Promise.resolve();
    }
  }

  /**
   * Wave hello: raise the arm to `raiseAngle` (default: the up-and-out mirror
   * of its resting angle), oscillate the hand there, then lower it back to
   * where it started. CSS `rotate` is relative to the baked geometry angle, so
   * all targets below are expressed as `<armAngle> − bakedAngle`.
   */
  async wave(options?: ArmWaveOptions): Promise<void> {
    this.stopAnimations();

    const startAngle = this._currentAngle;
    const raiseAngle = options?.raiseAngle ?? mirrorUpAngle(this._defaultAngle);
    const amplitude =
      typeof options?.amplitude === "number" ? options.amplitude : 40;
    const count = typeof options?.count === "number" ? options.count : 3;
    const cycle =
      typeof options?.duration === "number" ? options.duration : 500;
    const half = cycle / 2;
    const liftMs = Math.max(220, half);

    // Apply any initial delay
    if (options?.delay && typeof options.delay === "number") {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delay as number),
      );
    }

    const baked = this._bakedAngle;
    const startRot = startAngle - baked;
    // Raise/lower take the short way around so the hand goes up the outside.
    const raiseRot = nearestRotation(raiseAngle - baked, startRot);

    try {
      // 1. Raise the arm to the waving position.
      this._currentAnimation = animate(this.element, {
        rotate: [startRot, raiseRot],
        duration: liftMs,
        ease: "outQuad",
      });
      await this._currentAnimation.then();
      this._currentAngle = raiseAngle;

      // 2. Oscillate the hand around the raised position.
      for (let i = 0; i < count; i++) {
        this._currentAnimation = animate(this.element, {
          rotate: raiseRot - amplitude / 2,
          duration: half,
          ease: "inOutQuad",
        });
        await this._currentAnimation.then();

        this._currentAnimation = animate(this.element, {
          rotate: raiseRot + amplitude / 2,
          duration: half,
          ease: "inOutQuad",
        });
        await this._currentAnimation.then();
      }

      // Settle back at the raised center before lowering.
      this._currentAnimation = animate(this.element, {
        rotate: raiseRot,
        duration: half,
        ease: "inOutQuad",
      });
      await this._currentAnimation.then();

      // 3. Lower the arm back to where it started.
      const restRot = nearestRotation(startAngle - baked, raiseRot);
      this._currentAnimation = animate(this.element, {
        rotate: restRot,
        duration: liftMs,
        ease: "inQuad",
      });
      await this._currentAnimation.then();

      this._currentAnimation = null;
      this._currentAngle = startAngle; // Reset to the original angle
    } catch (e) {
      // Handle animation interruptions: snap back to the starting pose.
      this._currentAngle = startAngle;
      this.element.style.transform = `rotate(${startAngle - baked}deg)`;
      this._currentAnimation = null;
      throw e;
    }
  }

  async relax(options?: AnimationParams): Promise<void> {
    return this.rotateTo(this._defaultAngle, options);
  }

  async setLength(newLength: number, options?: AnimationParams): Promise<void> {
    this.stopAnimations();

    const oldLength = this._currentLength;
    this._currentLength = newLength;

    // We need to recreate the arm with the new length
    // Always bake at current angle, then clear transform (no double rotation)
    const newOptions = {
      ...this._options,
      length: newLength,
      x: this._attachmentCoord.x,
      y: this._attachmentCoord.y,
      angle: this._currentAngle,
    };

    // If no animation, simply replace the arm
    if (!options || !options.duration) {
      const newArmGroup = createArm(newOptions);

      // Since we baked the current angle into geometry, reset CSS rotation to 0
      // (otherwise we'd have double rotation: baked + CSS)
      newArmGroup.style.transform = "";

      // Replace the old arm with the new one
      this.element.innerHTML = newArmGroup.innerHTML;
      this.element.style.transform = "";

      // Update baked angle to match the geometry we just created
      this._bakedAngle = this._currentAngle;
      return Promise.resolve();
    }

    // For animation, we'll use scaling
    // Calculate the scale factor
    const scaleFactor = newLength / oldLength;

    // Animate the scale
    this._currentAnimation = animate(this.element, {
      scaleX: scaleFactor,
      duration: options.duration,
      easing: options.ease || "easeOutQuad",
      delay: options.delay || 0,
    });

    return this._currentAnimation.then(() => {
      this._currentAnimation = null;

      // After animation completes, replace with correctly sized arm to avoid accumulated transforms
      // Bake current angle into geometry, then clear transform (no double rotation)
      const newArmGroup = createArm(newOptions);
      this.element.innerHTML = newArmGroup.innerHTML;
      this.element.style.transform = "";

      // Update baked angle to match the geometry we just created
      this._bakedAngle = this._currentAngle;
    });
  }

  getCurrentAngle(): number {
    return this._currentAngle;
  }

  getCurrentLength(): number {
    return this._currentLength;
  }

  getShoulderPosition(): Point {
    return { x: this._attachmentCoord.x, y: this._attachmentCoord.y };
  }

  getHandPosition(): Point {
    const shoulder = this.getShoulderPosition();
    const angleRad = (this._currentAngle * Math.PI) / 180;

    // Calculate hand position from shoulder + rotation + length
    const handX = shoulder.x + Math.cos(angleRad) * this._currentLength;
    const handY = shoulder.y + Math.sin(angleRad) * this._currentLength;

    return { x: handX, y: handY };
  }

  bringToFront(): void {
    if (!this._isBehindBody) return; // already in front
    if (!this._contentGroup) {
      console.warn("[ArmController] bringToFront: no contentGroup reference");
      return;
    }
    // Move to end of contentGroup → paints on top of everything
    this._contentGroup.appendChild(this.element);
    this._isBehindBody = false;
  }

  sendToBack(): void {
    if (this._isBehindBody) return; // already behind
    if (!this._contentGroup) {
      console.warn("[ArmController] sendToBack: no contentGroup reference");
      return;
    }
    // Insert before the first child of contentGroup → paints behind everything
    // (The first child is typically the letter body <path>)
    const firstChild = this._contentGroup.firstChild;
    if (firstChild) {
      this._contentGroup.insertBefore(this.element, firstChild);
    }
    this._isBehindBody = true;
  }

  isBehindBody(): boolean {
    return this._isBehindBody;
  }

  async setHandPosition(
    target: Point,
    options?: AnimationParams,
  ): Promise<void> {
    this.stopAnimations();

    const shoulder = this.getShoulderPosition();

    // Calculate required angle and length to reach target
    const deltaX = target.x - shoulder.x;
    const deltaY = target.y - shoulder.y;

    const targetAngle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    const targetLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Clamp length to reasonable bounds
    const clampedLength = Math.max(5, Math.min(30, targetLength));

    if (!options?.duration) {
      this.placeHand(targetAngle, clampedLength);
      return;
    }

    // Animated: tween angle + length together through one proxy, placing the
    // hand instantly each frame. (Running rotateTo + setLength side by side
    // doesn't work — each calls stopAnimations(), reverting the other, whose
    // promise then never settles.) Angle takes the short way round.
    const proxy = {
      angle: this._currentAngle,
      length: this._currentLength,
    };
    this._currentAnimation = animate(proxy, {
      angle: nearestRotation(targetAngle, proxy.angle),
      length: clampedLength,
      duration: options.duration,
      ease: options.ease || "outQuad",
      delay: options.delay || 0,
      onUpdate: () => this.placeHand(proxy.angle, proxy.length),
    });

    return this._currentAnimation.then(() => {
      this._currentAnimation = null;
    });
  }

  /**
   * Instantly pose the arm at `angle` / `length` without touching running
   * animations. Rebuilds geometry only when the length actually changes —
   * during high-frequency hand tracking (e.g. juggling) most frames only
   * need a rotation.
   */
  private placeHand(angle: number, length: number): void {
    this._currentAngle = angle;

    if (Math.abs(length - this._currentLength) < 0.5) {
      this.element.style.transform = `rotate(${angle - this._bakedAngle}deg)`;
      return;
    }

    this._currentLength = length;
    const newArmGroup = createArm({
      ...this._options,
      length,
      x: this._attachmentCoord.x,
      y: this._attachmentCoord.y,
      angle,
    });
    this.element.innerHTML = newArmGroup.innerHTML;
    this.element.style.transform = "";
    this._bakedAngle = angle;
  }

  toString(): string {
    return `ArmAttachment: visible=${this.isVisible()}, angle=${this._currentAngle}°, length=${this._currentLength}`;
  }
}

// --- Arms Group Controller Implementation ---
class ArmsGroupControllerImpl implements ArmsAttachment {
  public readonly left: ArmAttachment;
  public readonly right: ArmAttachment;

  constructor(leftArm: ArmAttachment, rightArm: ArmAttachment) {
    this.left = leftArm;
    this.right = rightArm;
  }

  async show(options?: AnimationParams): Promise<void> {
    // console.log(`[ArmsGroupController] show: called with options=`, options);
    // console.log(
    //   `[ArmsGroupController] show: left arm type=${this.left.type}, right arm type=${this.right.type}`,
    // );
    await Promise.all([this.left.show(options), this.right.show(options)]);
    // console.log(`[ArmsGroupController] show: completed for both arms`);
  }

  async hide(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.hide(options), this.right.hide(options)]);
  }

  /**
   * Wave hello. Defaults to a single one-handed wave with the right arm; pass
   * `{ arm: 'left' }` for the other hand or `{ arm: 'both' }` to raise both
   * arms (staggered for a more natural effect).
   */
  async wave(options?: ArmsWaveOptions): Promise<void> {
    const arm = options?.arm ?? "right";

    if (arm === "left") return this.left.wave(options);
    if (arm === "right") return this.right.wave(options);

    // Both arms: stagger by 150ms.
    const rightArmDelay =
      typeof options?.delay === "number" ? options.delay : 0;
    const leftArmDelay = rightArmDelay + 150;

    await Promise.all([
      this.right.wave({ ...options, delay: rightArmDelay }),
      this.left.wave({ ...options, delay: leftArmDelay }),
    ]);
  }

  async relax(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.relax(options), this.right.relax(options)]);
  }

  async setLength(newLength: number, options?: AnimationParams): Promise<void> {
    await Promise.all([
      this.left.setLength(newLength, options),
      this.right.setLength(newLength, options),
    ]);
  }

  isVisible(): boolean {
    return this.left.isVisible() && this.right.isVisible();
  }

  isAnimating(): boolean {
    const leftAnimating = this.left.isAnimating
      ? this.left.isAnimating()
      : false;
    const rightAnimating = this.right.isAnimating
      ? this.right.isAnimating()
      : false;
    return leftAnimating || rightAnimating;
  }

  stopAnimations(): void {
    this.left.stopAnimations?.();
    this.right.stopAnimations?.();
  }

  toString(): string {
    return `ArmsGroup: Left Arm (${this.left.toString()}), Right Arm (${this.right.toString()})`;
  }
}

// --- Factory Functions ---

/**
 * Creates an ArmController instance.
 * @param contentGroup - Optional reference to the parent contentGroup `<g>`.
 *   When provided, enables `sendToBack()` / `bringToFront()` z-layer control.
 */
export function createArmController(
  svgGroup: SVGGElement,
  options: ArmOptions,
  contentGroup?: SVGGElement,
): ArmAttachment {
  const ctrl = new ArmControllerImpl(svgGroup, options);
  if (contentGroup) {
    ctrl.setContentGroup(contentGroup);
  }
  return ctrl;
}

/**
 * Creates an ArmsGroupController instance.
 */
export function createArmsGroupController(
  leftArm: ArmAttachment,
  rightArm: ArmAttachment,
): ArmsAttachment {
  return new ArmsGroupControllerImpl(leftArm, rightArm);
}
