// src/attachments/eye.ts

import { animate, type AnimationParams, type JSAnimation } from "animejs";
import type { EyeAttachment, EyesAttachment } from "./types";
import type { BrowsController } from "./eyebrow";
import { BaseController } from "./BaseController";
import type { Point } from "../util/geometry";

// Declare mouse position variables without modifying global Window
let globalMouseX = 0;
let globalMouseY = 0;

/** mousemove listener, attached while any eye tracks the cursor. */
function trackMouse(e: MouseEvent): void {
  globalMouseX = e.clientX;
  globalMouseY = e.clientY;
}

const svgNS = "http://www.w3.org/2000/svg";

/**
 * Options for customizing the appearance of an eye attachment.
 */
export interface EyeOptions {
  /** Overall diameter of the eye's white part (sclera). Defaults to 10. */
  size?: number;
  /** Fill color of the sclera. Defaults to 'white'. */
  fillColor?: string;
  /** Fill color of the pupil. Defaults to 'black'. */
  pupilColor?: string;
  /** Ratio of pupil diameter to eye diameter (e.g., 0.4 means pupil is 40% of eye size). Defaults to 0.4. */
  pupilSizeRatio?: number;
  /** Optional outline color for the sclera. Defaults to 'grey'. Set to 'none' for no outline. */
  strokeColor?: string;
  /** Optional outline width for the sclera. Defaults to 0.5. */
  strokeWidth?: number;
  /** Maximum distance the pupil can move from center (as a ratio of eye radius). Defaults to 0.3. */
  pupilMobilityRatio?: number;
}

// --- Default values ---
const DEFAULT_EYE_SIZE = 10;
const DEFAULT_FILL_COLOR = "#eee";
const DEFAULT_PUPIL_COLOR = "black";
const DEFAULT_PUPIL_RATIO = 0.4;
const DEFAULT_STROKE_COLOR = "black";
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_PUPIL_MOBILITY_RATIO = 0.6; // How far the pupil can move from center (60% of radius)

/**
 * Creates SVG elements representing a simple eye.
 *
 * @param x - The desired center X coordinate for the eye.
 * @param y - The desired center Y coordinate for the eye.
 * @param options - Optional configuration for the eye's appearance.
 * @returns An SVGGElement containing the eye's parts (sclera and pupil).
 */
export function createEye(
  x: number,
  y: number,
  options?: EyeOptions,
): SVGGElement {
  // Process options with defaults
  const size = options?.size ?? DEFAULT_EYE_SIZE;
  const fillColor = options?.fillColor ?? DEFAULT_FILL_COLOR;
  const pupilColor = options?.pupilColor ?? DEFAULT_PUPIL_COLOR;
  const pupilRatio = options?.pupilSizeRatio ?? DEFAULT_PUPIL_RATIO;
  const strokeColor = options?.strokeColor ?? DEFAULT_STROKE_COLOR;
  const strokeWidth = options?.strokeWidth ?? DEFAULT_STROKE_WIDTH;

  // Calculate dimensions
  const radius = size / 2;
  const pupilRadius = radius * pupilRatio;

  // Create a group element to hold the eye parts
  const group = document.createElementNS(svgNS, "g");
  group.setAttribute("class", "letter-attachment letter-eye"); // Add classes for potential styling

  // stransformations relative to eye's center
  group.style.transformOrigin = `${x}px ${y}px`;

  // Initialize as hidden by default (opacity only - allows animation)
  group.style.opacity = "0";

  // Create the sclera (white part)
  const sclera = document.createElementNS(svgNS, "circle");
  sclera.setAttribute("cx", String(x));
  sclera.setAttribute("cy", String(y));
  sclera.setAttribute("r", String(radius));
  sclera.setAttribute("fill", fillColor);
  if (strokeColor !== "none" && strokeWidth > 0) {
    sclera.setAttribute("stroke", strokeColor);
    sclera.setAttribute("stroke-width", String(strokeWidth));
  }

  // Create the pupil
  const pupil = document.createElementNS(svgNS, "circle");
  // Center the pupil within the sclera
  pupil.setAttribute("cx", String(x));
  pupil.setAttribute("cy", String(y));
  pupil.setAttribute("r", String(pupilRadius));
  pupil.setAttribute("fill", pupilColor);
  pupil.setAttribute("class", "letter-eye-pupil");

  // Add parts to the group
  group.appendChild(sclera);
  group.appendChild(pupil);

  return group;
}

// --- Eye Controller Implementation ---
class EyeControllerImpl extends BaseController implements EyeAttachment {
  readonly type = "eye";
  private _options: EyeOptions; // Store options for potential future use
  private _eyeCenter: Point;
  private _currentPupilOffset: Point = { x: 0, y: 0 }; // Offset from center
  private _maxPupilOffset: number;
  private _isTracking: boolean = false;
  private _trackingIntensity: number = 0.5;
  private _trackingEase: string = "easeOutQuad";

  constructor(svgGroup: SVGGElement, options?: EyeOptions, center?: Point) {
    super(svgGroup, "eye");

    this._options = {
      // Store a merged copy of defaults and provided options
      size: options?.size ?? DEFAULT_EYE_SIZE,
      fillColor: options?.fillColor ?? DEFAULT_FILL_COLOR,
      pupilColor: options?.pupilColor ?? DEFAULT_PUPIL_COLOR,
      pupilSizeRatio: options?.pupilSizeRatio ?? DEFAULT_PUPIL_RATIO,
      strokeColor: options?.strokeColor ?? DEFAULT_STROKE_COLOR,
      strokeWidth: options?.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      pupilMobilityRatio:
        options?.pupilMobilityRatio ?? DEFAULT_PUPIL_MOBILITY_RATIO,
      ...options,
    };

    // Find eye center if not provided
    if (center) {
      this._eyeCenter = { ...center };
    } else {
      // Extract from the sclera element's cx/cy attributes
      const sclera = this.element.querySelector(
        "circle:not(.letter-eye-pupil)",
      );
      if (sclera) {
        this._eyeCenter = {
          x: parseFloat(sclera.getAttribute("cx") || "0"),
          y: parseFloat(sclera.getAttribute("cy") || "0"),
        };
      } else {
        // Fallback using element's bounding box
        const bbox = this.element.getBoundingClientRect();
        this._eyeCenter = {
          x: bbox.width / 2,
          y: bbox.height / 2,
        };
      }
    }

    // Calculate max pupil movement distance
    const eyeSize = this._options.size ?? DEFAULT_EYE_SIZE;
    const mobilityRatio =
      this._options.pupilMobilityRatio ?? DEFAULT_PUPIL_MOBILITY_RATIO;
    this._maxPupilOffset = (eyeSize / 2) * mobilityRatio;
  }

  toString(): string {
    return `EyeAttachment: visible=${this.isVisible()}, tracking=${this._isTracking}`;
  }

  /** Shut scale for open()/close(): the slit wink() closes to. */
  private static readonly SHUT = 0.05;

  // Show by opening: visible at once, as a slit, then the lid opens
  async open(options?: AnimationParams): Promise<void> {
    this.stopAnimations();
    this._isVisibleState = true;
    const duration = (options?.duration as number | undefined) ?? 180;
    this.element.style.opacity = "1";
    this._currentAnimation = animate(this.element, {
      scaleY: [EyeControllerImpl.SHUT, 1],
      duration,
      ease: options?.ease ?? "outQuad",
      delay: options?.delay ?? 0,
    });
    await this._currentAnimation.then(() => {
      this._currentAnimation = null;
    });
  }

  // Hide by shutting: the lid closes, then the slit goes
  async close(options?: AnimationParams): Promise<void> {
    this.stopAnimations();
    this._isVisibleState = false;
    const duration = (options?.duration as number | undefined) ?? 150;
    this._currentAnimation = animate(this.element, {
      scaleY: [1, EyeControllerImpl.SHUT],
      duration,
      ease: options?.ease ?? "inQuad",
      delay: options?.delay ?? 0,
    });
    await this._currentAnimation.then(() => {
      this._currentAnimation = null;
    });
    // Unless something showed it again meanwhile
    if (this._isVisibleState) return;
    this.element.style.opacity = "0";
    animate(this.element, { scaleY: 1, duration: 0 }); // rest open, for the next show()
  }

  // Eye animation: wink by scaling vertically
  async wink(options?: AnimationParams): Promise<void> {
    // Store tracking state before winking
    const wasTracking = this._isTracking;

    // Temporarily stop tracking during animation
    if (wasTracking) {
      this.stopTracking();
    }

    this.stopAnimations();
    const duration = options?.duration ?? 150; // Fast blink
    const ease = options?.ease ?? "inOutSine";

    // Simple wink: quickly scale Y to 0 and back.
    // The eye's resting scaleY is always 1 (nothing but wink touches it), so we
    // open back to a fixed 1 rather than reading it from the live transform.
    // Reading it back latched a stuck blink: if a prior wink was interrupted
    // (e.g. its open half snapped to 0.05 while the tab was hidden, freezing
    // rAF), the next wink would read originalScaleY=0.05 and animate [0.05,0.05],
    // making the slit permanent. A constant open value lets it self-heal.
    const originalScaleY = 1;

    // Store pupil position before wink
    const prevPupilPos = this.getPupilPosition();

    try {
      // Animate closing
      this._currentAnimation = animate(this.element, {
        scaleY: [originalScaleY, 0.05],
        duration: duration as number,
        ease: ease, // Use the same ease for closing part
        delay: 50,
      });

      // Wait for animation to finish using promise based approach
      await new Promise((resolve) => {
        setTimeout(resolve, (duration as number) + 50);
      });

      // Animation might have been cancelled
      if (this._isVisibleState === false) return;

      // Animate opening
      this._currentAnimation = animate(this.element, {
        scaleY: [0.05, originalScaleY],
        duration: duration as number,
        ease: ease, // Use the same ease for opening part
      });

      // Wait for animation to finish using promise based approach
      await new Promise((resolve) => {
        setTimeout(resolve, duration as number);
      });
    } catch (err) {
      console.error("Wink animation error:", err);
    } finally {
      this._currentAnimation = null;
    }

    // Restore pupil position if it was moved
    if (prevPupilPos.x !== 0 || prevPupilPos.y !== 0) {
      this.lookAt(prevPupilPos, { duration: 0 }); // Instantly restore position without animation
    }

    // Resume tracking if it was active before
    if (wasTracking) {
      this.startTracking({
        intensity: this._trackingIntensity,
        ease: this._trackingEase,
      });
    }
  }

  /**
   * Makes the pupil look in a specific direction
   */
  async lookAt(
    direction: { x: number; y: number } | number,
    options?: AnimationParams,
  ): Promise<void> {
    // Store tracking state (for potential later use) and stop tracking
    // Note: We don't auto-resume tracking later - the caller is responsible for that
    const wasTrackingLocal = this._isTracking;
    if (wasTrackingLocal) {
      this.stopTracking();
    }

    // If we're animating the pupil, stop that animation
    if (this._currentAnimation && this._currentAnimation.completed === false) {
      this._currentAnimation.pause();
      this._currentAnimation = null;
    }

    let targetX: number = 0;
    let targetY: number = 0;

    // Calculate target position based on input type
    if (typeof direction === "number") {
      // Direction is an angle in degrees
      const angleInRadians = (direction * Math.PI) / 180;
      targetX = Math.cos(angleInRadians) * this._maxPupilOffset;
      targetY = Math.sin(angleInRadians) * this._maxPupilOffset;
    } else {
      // Direction is a point, normalize to max offset
      const magnitude = Math.sqrt(
        direction.x * direction.x + direction.y * direction.y,
      );
      if (magnitude > 0) {
        const scale = Math.min(magnitude, this._maxPupilOffset) / magnitude;
        targetX = direction.x * scale;
        targetY = direction.y * scale;
      }
    }

    // Get the pupil element
    const pupil = this.element.querySelector(
      ".letter-eye-pupil",
    ) as SVGCircleElement;
    if (!pupil) return Promise.resolve();

    // Determine animation params
    const duration = options?.duration ?? 150;
    const ease = options?.ease ?? "easeOutQuad";

    if (typeof duration === "number" && duration > 0) {
      // Animate pupil to target position
      const startX = this._currentPupilOffset.x;
      const startY = this._currentPupilOffset.y;

      // Use a simple object to track properties
      const animObj = { x: startX, y: startY };

      try {
        // Create the animation
        this._currentAnimation = animate(animObj, {
          x: targetX,
          y: targetY,
          duration: duration as number,
          ease: ease,
          onUpdate: () => {
            if (pupil) {
              // Use the animated object directly
              pupil.setAttribute("cx", String(this._eyeCenter.x + animObj.x));
              pupil.setAttribute("cy", String(this._eyeCenter.y + animObj.y));
              this._currentPupilOffset = { x: animObj.x, y: animObj.y };
            }
          },
        });

        // Wait for animation to finish using setTimeout instead of the animation promise
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            // Update final position
            if (pupil) {
              pupil.setAttribute("cx", String(this._eyeCenter.x + targetX));
              pupil.setAttribute("cy", String(this._eyeCenter.y + targetY));
              this._currentPupilOffset = { x: targetX, y: targetY };
            }
            resolve();
          }, duration as number);
        });

        // Clean up
        this._currentAnimation = null;
      } catch (err) {
        console.error("Eye lookAt animation error:", err);
        this._currentAnimation = null;
      }

      // Note: We don't auto-resume tracking here
      // The wink method or caller is responsible for managing tracking state

      return;
    } else {
      // Immediately set position without animation
      pupil.setAttribute("cx", String(this._eyeCenter.x + targetX));
      pupil.setAttribute("cy", String(this._eyeCenter.y + targetY));
      this._currentPupilOffset = { x: targetX, y: targetY };

      // Note: We don't auto-resume tracking here
      // The wink method or caller is responsible for managing tracking state

      return;
    }
  }

  /**
   * Makes the pupil look toward a specific point in SVG coordinate space.
   * Computes direction from the eye center to the target point.
   */
  async lookAtPoint(
    point: { x: number; y: number },
    options?: AnimationParams,
  ): Promise<void> {
    // Compute direction from eye center to the target point
    const direction = {
      x: point.x - this._eyeCenter.x,
      y: point.y - this._eyeCenter.y,
    };
    return this.lookAt(direction, options);
  }

  /**
   * Get current pupil position as offset from center
   */
  getPupilPosition(): { x: number; y: number } {
    return { ...this._currentPupilOffset };
  }

  /**
   * Start tracking the mouse cursor
   */
  startTracking(options?: { intensity?: number; ease?: string }): void {
    if (this._isTracking) return; // Already tracking

    // Update tracking parameters
    this._trackingIntensity = options?.intensity ?? 0.5;
    this._trackingEase = options?.ease ?? "easeOutQuad";

    this._isTracking = true;
    EyeControllerImpl._track(this);
  }

  /**
   * Stop tracking the cursor
   */
  stopTracking(): void {
    this._isTracking = false;
    EyeControllerImpl._untrack(this);
  }

  // --- Cursor tracking: one loop shared by every tracking eye ---------------
  //
  // Pointing a pupil at the cursor needs the letter's on-screen position, a
  // layout read. Each eye used to run its own requestAnimationFrame loop that
  // read its position and then moved its pupil: every write dirtied layout,
  // so the next eye's read forced a fresh layout, for every eye, every frame,
  // forever. With the landing page's ~66 eyes that was most of a phone's CPU.
  // Now: one loop; all reads before any write (one layout per frame at most);
  // only letters on screen; a pupil is written only when it moves; and the
  // loop stops while no tracking eye is on screen.

  private static _trackers = new Set<EyeControllerImpl>();
  private static _frameRequest: number | null = null;
  /** Each tracked letter SVG: whether it's on screen, and how many tracking eyes it holds. */
  private static _svgs = new Map<SVGSVGElement, { visible: boolean; eyes: number }>();
  private static _observer: IntersectionObserver | null = null;

  /** The letter SVG this eye is drawn in, counted in _svgs once found. */
  private _trackedSvg: SVGSVGElement | null = null;
  private _pupilEl: SVGCircleElement | null = null;

  private static _track(eye: EyeControllerImpl): void {
    const T = EyeControllerImpl;
    if (T._trackers.has(eye)) return;
    T._trackers.add(eye);
    if (T._trackers.size === 1) document.addEventListener("mousemove", trackMouse);
    T._svgOf(eye);
    T._schedule();
  }

  private static _untrack(eye: EyeControllerImpl): void {
    const T = EyeControllerImpl;
    if (!T._trackers.delete(eye)) return;
    const svg = eye._trackedSvg;
    eye._trackedSvg = null;
    const entry = svg && T._svgs.get(svg);
    if (svg && entry && --entry.eyes === 0) {
      T._svgs.delete(svg);
      T._observer?.unobserve(svg);
    }
    if (T._trackers.size === 0) {
      document.removeEventListener("mousemove", trackMouse);
      if (T._frameRequest !== null) cancelAnimationFrame(T._frameRequest);
      T._frameRequest = null;
    }
  }

  private static _svgOf(eye: EyeControllerImpl): SVGSVGElement | null {
    if (eye._trackedSvg) return eye._trackedSvg;
    const svg = eye.element.closest("svg");
    if (!svg) return null;
    const T = EyeControllerImpl;
    eye._trackedSvg = svg;
    const entry = T._svgs.get(svg);
    if (entry) entry.eyes++;
    else {
      // Assumed on screen until the observer's first report says otherwise.
      T._svgs.set(svg, { visible: true, eyes: 1 });
      T._visibility()?.observe(svg);
    }
    return svg;
  }

  private static _visibility(): IntersectionObserver | null {
    const T = EyeControllerImpl;
    if (T._observer || typeof IntersectionObserver === "undefined") return T._observer;
    T._observer = new IntersectionObserver(
      (entries) => {
        let cameIntoView = false;
        for (const e of entries) {
          const entry = T._svgs.get(e.target as SVGSVGElement);
          if (!entry) continue;
          if (e.isIntersecting && !entry.visible) cameIntoView = true;
          entry.visible = e.isIntersecting;
        }
        if (cameIntoView) T._schedule();
      },
      { rootMargin: "100px" },
    );
    return T._observer;
  }

  private static _schedule(): void {
    const T = EyeControllerImpl;
    if (T._frameRequest === null && T._trackers.size > 0) {
      T._frameRequest = requestAnimationFrame(T._frame);
    }
  }

  private static _frame = (): void => {
    const T = EyeControllerImpl;
    T._frameRequest = null;

    // Read: each on-screen letter's position and scale, once.
    const placed = new Map<SVGSVGElement, { scale: number; left: number; top: number }>();
    const active: EyeControllerImpl[] = [];
    for (const eye of T._trackers) {
      const svg = T._svgOf(eye);
      if (!svg || !svg.isConnected || T._svgs.get(svg)?.visible === false) continue;
      if (!placed.has(svg)) {
        const rect = svg.getBoundingClientRect();
        placed.set(svg, {
          scale: rect.width / svg.viewBox.baseVal.width || 1,
          left: rect.left,
          top: rect.top,
        });
      }
      active.push(eye);
    }

    // Write: move the pupils that need moving.
    for (const eye of active) eye._pointAtCursor(placed.get(eye._trackedSvg!)!);

    if (active.length > 0) T._schedule();
  };

  private _pointAtCursor(svg: { scale: number; left: number; top: number }): void {
    // Direction from the eye (in viewport coordinates) to the cursor
    const dirX = globalMouseX - (this._eyeCenter.x * svg.scale + svg.left);
    const dirY = globalMouseY - (this._eyeCenter.y * svg.scale + svg.top);
    const distance = Math.sqrt(dirX * dirX + dirY * dirY);
    if (distance <= 0) return;

    // Normalize and scale by intensity and max offset
    const k = (Math.min(distance, this._maxPupilOffset) / distance) * this._trackingIntensity;
    const targetX = dirX * k;
    const targetY = dirY * k;
    if (
      Math.abs(targetX - this._currentPupilOffset.x) < 0.01 &&
      Math.abs(targetY - this._currentPupilOffset.y) < 0.01
    ) {
      return;
    }

    this._pupilEl ??= this.element.querySelector<SVGCircleElement>(".letter-eye-pupil");
    if (!this._pupilEl) return;
    this._pupilEl.setAttribute("cx", String(this._eyeCenter.x + targetX));
    this._pupilEl.setAttribute("cy", String(this._eyeCenter.y + targetY));
    this._currentPupilOffset = { x: targetX, y: targetY };
  }

  /**
   * Check if tracking is active
   */
  isTracking(): boolean {
    return this._isTracking;
  }

  /**
   * Override the parent stopAnimations to include tracking
   */
  stopAnimations(): void {
    super.stopAnimations();
    this.stopTracking();
  }
}

// --- Eyes Group Controller Implementation ---
class EyesGroupControllerImpl implements EyesAttachment {
  public readonly left: EyeAttachment;
  public readonly right: EyeAttachment;
  public brows?: BrowsController;

  private _eyebrowsWithEyes: boolean;

  constructor(
    leftEye: EyeAttachment,
    rightEye: EyeAttachment,
    brows?: BrowsController,
    eyebrowsWithEyes: boolean = true,
  ) {
    this.left = leftEye;
    this.right = rightEye;
    this.brows = brows;
    this._eyebrowsWithEyes = eyebrowsWithEyes;
  }

  async show(options?: AnimationParams): Promise<void> {
    const promises: Promise<void>[] = [
      this.left.show(options),
      this.right.show(options),
    ];

    // Auto-show brows if configured
    if (this._eyebrowsWithEyes && this.brows) {
      promises.push(this.brows.show(options));
    }

    await Promise.all(promises);
  }

  async hide(options?: AnimationParams): Promise<void> {
    const promises: Promise<void>[] = [
      this.left.hide(options),
      this.right.hide(options),
    ];

    // Auto-hide brows with eyes
    if (this._eyebrowsWithEyes && this.brows) {
      promises.push(this.brows.hide(options));
    }

    await Promise.all(promises);
  }

  async blink(options?: AnimationParams): Promise<void> {
    await Promise.all([this.left.wink(options), this.right.wink(options)]);
  }

  async lookAt(
    direction: { x: number; y: number } | number,
    options?: AnimationParams,
  ): Promise<void> {
    await Promise.all([
      this.left.lookAt(direction, options),
      this.right.lookAt(direction, options),
    ]);
  }

  async lookAtPoint(
    point: { x: number; y: number },
    options?: AnimationParams,
  ): Promise<void> {
    await Promise.all([
      this.left.lookAtPoint(point, options),
      this.right.lookAtPoint(point, options),
    ]);
  }

  startTracking(options?: { intensity?: number; ease?: string }): void {
    this.left.startTracking(options);
    this.right.startTracking(options);
  }

  stopTracking(): void {
    this.left.stopTracking();
    this.right.stopTracking();
  }

  isTracking(): boolean {
    return this.left.isTracking() || this.right.isTracking();
  }

  isVisible(): boolean {
    // Considered visible if both eyes are visible
    return this.left.isVisible() && this.right.isVisible();
  }

  toString(): string {
    return `EyesGroup: Left Eye (${this.left.toString()}), Right Eye (${this.right.toString()})`;
  }

  isAnimating(): boolean {
    // Considered animating if either eye is animating
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
    this.brows?.stopAnimations?.();
  }

  /**
   * Set the brows controller after construction
   * Used when brows need to be added after eyes are created
   */
  setBrows(brows: BrowsController, eyebrowsWithEyes: boolean = true): void {
    this.brows = brows;
    this._eyebrowsWithEyes = eyebrowsWithEyes;
  }
}

// --- Factory Functions ---

/**
 * Creates an EyeController instance.
 */
export function createEyeController(
  svgGroup: SVGGElement,
  options?: EyeOptions,
  center?: Point,
): EyeAttachment {
  return new EyeControllerImpl(svgGroup, options, center);
}

/**
 * Creates an EyesGroupController instance.
 */
export function createEyesGroupController(
  leftEye: EyeAttachment,
  rightEye: EyeAttachment,
  brows?: BrowsController,
  eyebrowsWithEyes?: boolean,
): EyesAttachment {
  return new EyesGroupControllerImpl(
    leftEye,
    rightEye,
    brows,
    eyebrowsWithEyes,
  );
}