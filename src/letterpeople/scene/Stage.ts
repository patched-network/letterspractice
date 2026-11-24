import { createLetter } from "../index";
import type { LetterInstance, LetterOptions } from "../types";
import type { Point } from "../util/geometry";
import { SpeechBalloon } from "./SpeechBalloon";
import type { SpeechBalloonOptions } from "./SpeechBalloon";
import { colorToOklch, oklchToRgbString } from "../util/color";
import { animate } from "animejs";

// Speech balloons key off their speaker's letter color: a light, gently
// desaturated tint of the same hue for the body (chroma capped, lightness
// raised so text stays legible), a dark tint of the same hue for the text,
// and no border. Tweak these three constants to taste.
const BALLOON_BODY_LIGHTNESS = 0.94;
const BALLOON_BODY_CHROMA_CAP = 0.045;
const BALLOON_TEXT_LIGHTNESS = 0.4;
const BALLOON_TEXT_CHROMA_CAP = 0.1;

/**
 * Derive speaker-coded balloon colors from an actor's letter color. Returns
 * neutral defaults (white body, dark grey text, no border) when the letter has
 * no color or it can't be parsed.
 */
export function balloonColorsForLetter(letterColor?: string): SpeechBalloonOptions {
  const base = letterColor ? colorToOklch(letterColor) : null;
  if (!base) {
    return { backgroundColor: "white", textColor: "#333", borderColor: "none" };
  }
  return {
    backgroundColor: oklchToRgbString({
      l: BALLOON_BODY_LIGHTNESS,
      c: Math.min(base.c, BALLOON_BODY_CHROMA_CAP),
      h: base.h,
    }),
    textColor: oklchToRgbString({
      l: BALLOON_TEXT_LIGHTNESS,
      c: Math.min(base.c, BALLOON_TEXT_CHROMA_CAP),
      h: base.h,
    }),
    borderColor: "none",
  };
}

export interface StageOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  horizonRatio?: number; // 0-1, default 0.3. Where the "back" of the stage is.
  referenceWidth?: number; // Logical authoring width for reference-frame placement.
  referenceHeight?: number; // Logical authoring height for reference-frame sizing.
}

export interface ActorOptions {
  x?: number; // Absolute x position in pixels. Use xPercent for responsive placement.
  xPercent?: number; // 0–100, percentage of container width. Takes precedence over x.
  xRef?: number; // Logical x position in the stage reference frame.
  z?: number; // 0 (back/horizon) to 100 (front). Defaults to 50.
  height?: number; // Base height of the letter in pixels (at scale 1)
  heightRef?: number; // Logical height in the stage reference frame.
  letterOptions?: LetterOptions;
}

export interface Projection {
  top: number;
  scale: number;
  zIndex: number;
}

export class Actor {
  readonly id: string;
  readonly instance: LetterInstance;
  readonly wrapper: HTMLElement;
  readonly balloon: SpeechBalloon;
  readonly stage: Stage;
  
  // Logical position
  private _x: number;
  private _z: number;
  
  private _silenceTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    stage: Stage,
    id: string,
    wrapper: HTMLElement,
    instance: LetterInstance,
    x: number,
    z: number,
    letterColor?: string
  ) {
    this.stage = stage;
    this.id = id;
    this.wrapper = wrapper;
    this.instance = instance;
    this._x = x;
    this._z = z;

    this.balloon = new SpeechBalloon({
      text: "...",
      maxWidth: 200,
      ...balloonColorsForLetter(letterColor),
    });

    // Initial positioning
    this.updateVisuals(this._x, this._z);
  }
  
  get x() { return this._x; }
  get z() { return this._z; }
  
  /**
   * Move the actor in 3D stage space.
   * @param x Horizontal position (pixels)
   * @param z Depth position (0-100)
   * @param duration Animation duration in ms
   */
  async move3D(x: number, z: number, duration: number = 0) {
    // If instant
    if (duration === 0) {
      this._x = x;
      this._z = z;
      this.updateVisuals(x, z);
      return;
    }

    // Animate
    const start = { x: this._x, z: this._z };
    const target = { x, z };

    return new Promise<void>(resolve => {
       animate(start, {
         x: target.x,
         z: target.z,
         duration,
         ease: 'inOutQuad',
         onUpdate: () => {
           this.updateVisuals(start.x, start.z);
         },
         onComplete: () => {
           this._x = x;
           this._z = z;
           this.updateVisuals(x, z);
           resolve();
         }
       });
    });
  }

  /**
   * Legacy 2D move support - assumes keeping current Z
   */
  async moveTo(x: number, y: number, duration: number = 0) {
      // Ignore y, keep current z
      return this.move3D(x, this._z, duration);
  }

  /**
   * Walk to a position in 3D stage space.
   * Coordinates gait animation with spatial movement.
   */
  async walkTo(x: number, z: number, duration: number = 1000) {
    const dx = x - this._x;
    
    // Determine facing based on movement
    let angle = 0;
    if (Math.abs(dx) > 10) {
        // Moving laterally: Face Left/Right (20deg)
        angle = dx > 0 ? 20 : -20;
    } else {
        // Moving mostly vertically: Face Camera (0deg)
        angle = 0;
    }
    
    // Turn first (fast)
    await this.instance.body.turnTo(angle, { duration: 300 });
    
    // Start gait
    this.instance.body.startWalking();
    
    // Move
    await this.move3D(x, z, duration);
    
    // Stop gait, then face camera
    this.instance.body.stopWalking();
    await this.instance.body.faceCamera({ duration: 200 });
  }

  private updateVisuals(x: number, z: number) {
      const proj = this.stage.project(z);

      // proj.top is the ground line — offset upward by the actor's height
      // so the actor's feet sit on the ground, not their head
      const h = this.instance.svgElement.clientHeight
        || parseFloat(this.instance.svgElement.style.height)
        || 150;

      this.wrapper.style.left = `${x}px`;
      this.wrapper.style.top = `${proj.top - h}px`;
      this.wrapper.style.transform = `scale(${proj.scale})`;
      this.wrapper.style.transformOrigin = "bottom center"; // Scale from feet
      this.wrapper.style.zIndex = Math.round(proj.zIndex).toString();
  }

  async say(text: string, duration?: number) {
      if (this._silenceTimeout) {
        clearTimeout(this._silenceTimeout);
        this._silenceTimeout = null;
      }

      await this.balloon.hide({ duration: 150 });
      this.balloon.setText(text);
      await this.balloon.show();
      
      if (duration) {
        this._silenceTimeout = setTimeout(() => this.silence(), duration);
      }
  }

  async silence() {
      if (this._silenceTimeout) {
        clearTimeout(this._silenceTimeout);
        this._silenceTimeout = null;
      }
      await this.balloon.hide();
  }
  
  /**
   * Helper to look at another actor or point
   */
  // TODO: Coordinate space mismatch — getCenter() returns viewport coords
  // (from getBoundingClientRect), but eyes.lookAt() interprets its argument as
  // an SVG-space direction vector. This "works" only when the viewport origin
  // is near (0,0) and the target is far enough away that the direction is
  // roughly correct. Should be converted to use lookAtPoint() with proper
  // viewport→SVG coordinate transform, or the direction should be computed
  // relative to the eye's own position.
  async lookAt(target: Actor | { x: number, y: number }) {
      const point = target instanceof Actor ? target.instance.getCenter() : target;
      return this.instance.eyes.lookAt(point);
  }

  /**
   * Convert a stage-relative pixel coordinate to this actor's SVG-local
   * coordinate space. Needed for setHandPosition() targeting toward
   * stage-placed props.
   */
  toLocalPoint(stagePoint: Point): Point {
    const proj = this.stage.project(this._z);
    const svg = this.instance.svgElement as SVGSVGElement;
    
    // Unscaled wrapper dimensions
    const hPx = svg.clientHeight || parseFloat(svg.style.height) || 150;
    const wPx = svg.clientWidth || (hPx * (svg.viewBox.baseVal.width / svg.viewBox.baseVal.height));
    
    // Transform origin is "bottom center" (50% 100%)
    const originX = wPx / 2;
    const originY = hPx;
    
    // Wrapper is positioned at (this._x, proj.top - hPx) so feet sit on ground line
    const baseStageX = this._x;
    const baseStageY = proj.top - hPx;

    // Stage coordinates of the transform origin (bottom center of wrapper)
    const stageOriginX = baseStageX + originX;
    const stageOriginY = baseStageY + originY; // = proj.top (ground line)

    // Unscale the target point
    const unscaledPxX = originX + (stagePoint.x - stageOriginX) / proj.scale;
    const unscaledPxY = originY + (stagePoint.y - stageOriginY) / proj.scale;
    
    // Map to viewBox
    const vb = svg.viewBox.baseVal;
    const svgX = vb.x + (unscaledPxX / wPx) * vb.width;
    const svgY = vb.y + (unscaledPxY / hPx) * vb.height;
    
    return { x: svgX, y: svgY };
  }

  /**
   * Convert a point in this actor's SVG-local coordinate space to
   * stage-relative pixel coordinates. Inverse of toLocalPoint().
   */
  toStagePoint(localPoint: Point): Point {
    const proj = this.stage.project(this._z);
    const svg = this.instance.svgElement as SVGSVGElement;
    
    const hPx = svg.clientHeight || parseFloat(svg.style.height) || 150;
    const wPx = svg.clientWidth || (hPx * (svg.viewBox.baseVal.width / svg.viewBox.baseVal.height));
    
    const vb = svg.viewBox.baseVal;
    
    // SVG-local → unscaled pixel offset from wrapper origin
    const unscaledPxX = ((localPoint.x - vb.x) / vb.width) * wPx;
    const unscaledPxY = ((localPoint.y - vb.y) / vb.height) * hPx;
    
    // Transform origin is "bottom center" (50% 100%)
    const originX = wPx / 2;
    const originY = hPx;
    
    // Wrapper is at (this._x, proj.top - hPx); transform origin is bottom center
    const stageOriginX = this._x + originX;
    const stageOriginY = proj.top; // ground line = wrapper top + hPx

    // Apply scale around origin
    const stageX = stageOriginX + (unscaledPxX - originX) * proj.scale;
    const stageY = stageOriginY + (unscaledPxY - originY) * proj.scale;
    
    return { x: stageX, y: stageY };
  }
}

export class Stage {
  readonly container: HTMLElement;
  readonly actors: Map<string, Actor> = new Map();
  private balloonLayer: HTMLElement;
  private _rafId: number | null = null;
  
  // Config
  private _horizonRatio: number;
  private _referenceWidth: number | null;
  private _referenceHeight: number | null;

  constructor(container: HTMLElement, options: StageOptions = {}) {
    this.container = container;
    this.container.style.position = "relative";
    this.container.style.overflow = "hidden"; // Clip content
    if (options.width) this.container.style.width = `${options.width}px`;
    if (options.height) this.container.style.height = `${options.height}px`;
    if (options.backgroundColor) this.container.style.background = options.backgroundColor;
    
    this._horizonRatio = options.horizonRatio ?? 0.3;
    this._referenceWidth = options.referenceWidth ?? null;
    this._referenceHeight = options.referenceHeight ?? null;

    this.balloonLayer = document.createElement("div");
    this.balloonLayer.style.position = "absolute";
    this.balloonLayer.style.top = "0";
    this.balloonLayer.style.left = "0";
    this.balloonLayer.style.width = "100%";
    this.balloonLayer.style.height = "100%";
    this.balloonLayer.style.pointerEvents = "none"; // Let clicks pass through to actors
    this.balloonLayer.style.zIndex = "1000";
    this.container.appendChild(this.balloonLayer);
    
    // Start update loop for balloon positions
    this.startLoop();
  }

  addActor(id: string, char: string, options: ActorOptions): Actor | null {
      const wrapper = document.createElement("div");
      wrapper.style.position = "absolute";
      wrapper.style.overflow = "visible";
      // Position will be set by Actor constructor via updateVisuals
      
      // Add wrapper before balloon layer
      this.container.insertBefore(wrapper, this.balloonLayer);

      const instance = createLetter(char, wrapper, options.letterOptions);
      if (!instance) {
          wrapper.remove();
          return null;
      }

      let resolvedX: number;
      if (options.xPercent !== undefined) {
        const containerWidth = this.container.clientWidth || 400;
        resolvedX = (options.xPercent / 100) * containerWidth;
      } else if (options.xRef !== undefined) {
        resolvedX = this.resolveX(options.xRef);
      } else {
        resolvedX = options.x ?? 0;
      }

      // Ensure height is set so the SVG is visible
      const height = options.heightRef !== undefined
        ? this.resolveHeight(options.heightRef)
        : (options.height || 150);
      instance.svgElement.style.height = `${height}px`;
      instance.svgElement.style.width = "auto";
      instance.svgElement.style.overflow = "visible";
      
      const z = options.z ?? 50;
      const actor = new Actor(this, id, wrapper, instance, resolvedX, z, options.letterOptions?.color);
      
      // Setup balloon in the upper layer
      this.balloonLayer.appendChild(actor.balloon.element);
      this.updateActorBalloon(actor);
      
      this.actors.set(id, actor);
      return actor;
  }
  
  getActor(id: string): Actor | undefined {
      return this.actors.get(id);
  }
  
  /**
   * Project a Z depth (0-100) to stage properties
   */
  project(z: number): Projection {
      const depth = Math.max(0, Math.min(100, z)) / 100; // 0..1
      const height = this.container.clientHeight || 400; // Fallback
      
      const horizonY = height * this._horizonRatio;
      const frontY = height * 0.95; // 5% padding at bottom
      
      // Scale: 0.6 at horizon, 1.0 at front
      const scale = 0.6 + (0.4 * depth);
      
      // Y: Interpolate between horizon and front
      const top = horizonY + ((frontY - horizonY) * depth);
      
      // Z-Index: direct mapping
      const zIndex = Math.floor(z * 10);
      
      return { top, scale, zIndex };
  }

  get referenceWidth(): number | null {
      return this._referenceWidth;
  }

  get referenceHeight(): number | null {
      return this._referenceHeight;
  }

  resolveX(xRef: number): number {
      if (!this._referenceWidth) return xRef;
      const width = this.container.clientWidth || this._referenceWidth;
      return (xRef / this._referenceWidth) * width;
  }

  resolveY(yRef: number): number {
      if (!this._referenceHeight) return yRef;
      const height = this.container.clientHeight || this._referenceHeight;
      return (yRef / this._referenceHeight) * height;
  }

  resolveWidth(widthRef: number): number {
      if (!this._referenceWidth) return widthRef;
      const width = this.container.clientWidth || this._referenceWidth;
      return (widthRef / this._referenceWidth) * width;
  }

  resolveHeight(heightRef: number): number {
      if (!this._referenceHeight) return heightRef;
      const height = this.container.clientHeight || this._referenceHeight;
      return (heightRef / this._referenceHeight) * height;
  }
  
  destroy() {
      this.stopLoop();
      this.container.innerHTML = "";
      this.actors.clear();
  }
  
  private startLoop() {
      const tick = () => {
          this.actors.forEach(actor => this.updateActorBalloon(actor));
          this._rafId = requestAnimationFrame(tick);
      };
      this._rafId = requestAnimationFrame(tick);
  }
  
  private stopLoop() {
      if (this._rafId !== null) {
          cancelAnimationFrame(this._rafId);
          this._rafId = null;
      }
  }
  
  private updateActorBalloon(actor: Actor) {
      // We want the balloon to track the character's head/mouth
      // Using getBoundingClientRect accounts for all transforms (CSS, anime.js, etc.)
      const rect = actor.instance.getBoundingRect();
      const containerRect = this.container.getBoundingClientRect();
      
      // Relative center X
      const centerX = rect.left + rect.width / 2 - containerRect.left;
      
      // Top Y (above the head)
      const topY = rect.top - containerRect.top;

      // Constrain the balloon to the headroom above the head, then let it
      // maximize its text to fill that box. This guarantees the balloon never
      // clips off the top of the stage (the box can't exceed the available
      // space) and never covers the character (the box sits above the head).
      const GAP = 10; // matches SpeechBalloon's arrow offset
      const MARGIN = 8; // keep-clear band at the stage edges
      const containerW = this.container.clientWidth || 400;
      const maxW = Math.min(containerW - MARGIN * 2, 460);
      const maxH = topY - GAP - MARGIN;
      actor.balloon.fit(maxW, maxH);

      // fit() bounds the bubble's *width* to the stage, but the bubble is
      // centered on the actor — near an edge it would bleed off the side.
      // Shift it back inside; the arrow stays anchored over the actor.
      const half = actor.balloon.getWidth() / 2;
      const clampedX = Math.min(
        Math.max(centerX, MARGIN + half),
        containerW - MARGIN - half,
      );
      actor.balloon.setShift(clampedX - centerX);

      actor.balloon.setPosition(centerX, topY);
  }
}
