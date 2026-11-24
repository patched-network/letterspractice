import { animate } from "animejs";
import type { AnimationParams } from "../types";
import type { Point } from "../util/geometry";

export interface SpeechBalloonOptions {
  text?: string;
  className?: string; // For custom styling
  maxWidth?: number;
  offset?: Point; // Offset from target point
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
}

export class SpeechBalloon {
  readonly element: HTMLElement; // The wrapper for positioning
  private bubble: HTMLElement;   // The scaling visual element
  private contentElement: HTMLElement;
  private arrowElement: HTMLElement;
  private _isVisible: boolean = false;

  // Auto-fit state: cached so we only re-search font size when the text or the
  // available box actually changes (the position loop calls fit() every frame).
  private _fitText: string = "";
  private _fitW: number = -1;
  private _fitH: number = -1;
  private static readonly MIN_FONT = 12;
  private static readonly MAX_FONT = 34;

  // Horizontal shift state (see setShift) — memoized with the bubble width so
  // the arrow re-anchors when either changes.
  private _shift = 0;
  private _shiftBubbleW = -1;
  /**
   * Tail size. The arrow is two stacked CSS triangles whose border widths are
   * all ARROW_SIZE, so it renders ARROW_SIZE tall and 2·ARROW_SIZE wide. Bumped
   * up now that the balloon is borderless — the tail needs the extra mass to
   * stay legible as a pointer without its old dark outline.
   */
  private static readonly ARROW_SIZE = 12;
  /**
   * Keep the arrow clear of the bubble's rounded corners (radius 20px), padded
   * by the arrow's half-width so the whole base clears the curve.
   */
  private static readonly ARROW_INSET = 20 + SpeechBalloon.ARROW_SIZE;
  /**
   * A side tail's tip sits this far down the bubble's left edge by default,
   * px, and no nearer its top or bottom corner than this (setSideTailOffset).
   */
  static readonly SIDE_TAIL_Y = 26;
  private _tailSide: "bottom" | "left" = "bottom";
  private _sideTailY = SpeechBalloon.SIDE_TAIL_Y;
  private readonly bgColor: string;
  private readonly borderColor: string;

  constructor(options: SpeechBalloonOptions = {}) {
    // Wrapper: handles positioning relative to the target point
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.pointerEvents = "none";
    this.element.style.zIndex = "100";
    // Center horizontally, move up by 100% + 10px spacing
    this.element.style.transform = "translate(-50%, calc(-100% - 10px))";

    // Bubble: handles scaling animation and visual style
    this.bubble = document.createElement("div");
    this.bubble.style.transformOrigin = "bottom center";
    this.bubble.style.transform = "scale(0)";
    this.bubble.style.opacity = "0";

    // Basic styling. borderColor omitted (or "none") drops the border entirely;
    // the arrow then falls back to the body color so it reads as a solid tail.
    const bgColor = options.backgroundColor || "white";
    const hasBorder = !!options.borderColor && options.borderColor !== "none";
    const borderColor = hasBorder ? options.borderColor! : bgColor;
    const textColor = options.textColor || "black";
    this.bgColor = bgColor;
    this.borderColor = borderColor;

    this.bubble.style.background = bgColor;
    // border-box so fit()'s maxWidth and offsetWidth both mean the outer box.
    this.bubble.style.boxSizing = "border-box";
    this.bubble.style.border = hasBorder ? `2px solid ${borderColor}` : "none";
    this.bubble.style.borderRadius = "20px";
    this.bubble.style.padding = "10px 15px";
    this.bubble.style.fontFamily = "sans-serif";
    this.bubble.style.fontSize = "22px";
    this.bubble.style.color = textColor;
    this.bubble.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.1)";
    this.bubble.style.whiteSpace = "pre-wrap"; // Handle newlines

    if (options.maxWidth) {
      this.bubble.style.maxWidth = `${options.maxWidth}px`;
    }

    this.element.appendChild(this.bubble);

    // Content
    this.contentElement = document.createElement("div");
    this.contentElement.textContent = options.text || "";
    this.bubble.appendChild(this.contentElement);

    // Arrow (triangle). Sized entirely off ARROW_SIZE so the tail scales as one
    // piece: outer triangle is the border color, inner (pulled up 2px) the body.
    const a = SpeechBalloon.ARROW_SIZE;
    this.arrowElement = document.createElement("div");
    this.arrowElement.style.position = "absolute";
    this.arrowElement.style.bottom = `-${a}px`;
    this.arrowElement.style.left = "50%";
    this.arrowElement.style.transform = "translateX(-50%)";
    this.arrowElement.style.width = "0";
    this.arrowElement.style.height = "0";
    this.arrowElement.style.borderLeft = `${a}px solid transparent`;
    this.arrowElement.style.borderRight = `${a}px solid transparent`;
    this.arrowElement.style.borderTop = `${a}px solid ${borderColor}`;

    const innerArrow = document.createElement("div");
    innerArrow.style.position = "absolute";
    innerArrow.style.top = `-${a + 2}px`;
    innerArrow.style.left = `-${a}px`;
    innerArrow.style.borderLeft = `${a}px solid transparent`;
    innerArrow.style.borderRight = `${a}px solid transparent`;
    innerArrow.style.borderTop = `${a}px solid ${bgColor}`;
    this.arrowElement.appendChild(innerArrow);

    this.bubble.appendChild(this.arrowElement);

    if (options.className) {
      this.bubble.classList.add(options.className);
    }
  }

  setText(text: string) {
    this.contentElement.textContent = text;
    // Force a re-fit on the next fit() call (text drives the required box).
    this._fitText = "";
  }

  /**
   * Size the balloon to a bounded box, then maximize the text to fill it.
   *
   * The caller (Stage) derives the box from the space actually available above
   * the actor's head, so the balloon can never clip off the stage nor cover the
   * character: instead the font shrinks to fit. Cheap to call every frame —
   * the binary search only runs when the text or box dimensions change.
   *
   * @param maxWidth  Max outer width of the bubble, px.
   * @param maxHeight Max outer height of the bubble, px (the headroom).
   */
  fit(maxWidth: number, maxHeight: number) {
    const w = Math.max(80, Math.round(maxWidth));
    const h = Math.max(28, Math.round(maxHeight));
    const text = this.contentElement.textContent ?? "";
    // Re-search only on meaningful changes (text edit or resize), not on the
    // sub-pixel headroom drift produced while an actor walks — that would make
    // the font flicker. Walking only ever *grows* the headroom, so the cached
    // (smaller-box) fit stays safely within bounds in the meantime.
    if (
      this._fitText === text &&
      Math.abs(this._fitW - w) <= 8 &&
      Math.abs(this._fitH - h) <= 8
    ) {
      return;
    }

    // Wrap at the box width; the search only needs to satisfy the height.
    this.bubble.style.maxWidth = `${w}px`;

    let lo = SpeechBalloon.MIN_FONT;
    let hi = SpeechBalloon.MAX_FONT;
    let best = lo;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      this.contentElement.style.fontSize = `${mid}px`;
      // offsetWidth/Height are layout sizes, unaffected by the scale transform.
      if (this.bubble.offsetHeight <= h && this.bubble.offsetWidth <= w) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    this.contentElement.style.fontSize = `${best}px`;

    this._fitText = text;
    this._fitW = w;
    this._fitH = h;
  }

  /**
   * Positions the balloon's arrow tip at the specified coordinates relative to the parent container.
   */
  setPosition(x: number, y: number) {
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  /**
   * Where the tail comes out: "bottom" (the default: the balloon sits above
   * its speaker, setPosition() naming the tip under it) or "left" (the
   * balloon sits to the speaker's right: setPosition() names the tip, level
   * with SIDE_TAIL_Y down the bubble's left edge).
   */
  setTailSide(side: "bottom" | "left") {
    if (side === this._tailSide) return;
    this._tailSide = side;
    const a = SpeechBalloon.ARROW_SIZE;
    const arrow = this.arrowElement.style;
    const inner = (this.arrowElement.firstElementChild as HTMLElement).style;
    if (side === "left") {
      this._sideTailY = SpeechBalloon.SIDE_TAIL_Y;
      this.element.style.transform = `translate(${a}px, -${this._sideTailY}px)`;
      this.bubble.style.transformOrigin = "left top";
      Object.assign(arrow, {
        bottom: "", left: `-${a}px`, top: `${this._sideTailY - a}px`, transform: "",
        borderLeft: "", borderRight: `${a}px solid ${this.borderColor}`,
        borderTop: `${a}px solid transparent`, borderBottom: `${a}px solid transparent`,
      });
      Object.assign(inner, {
        top: `-${a}px`, left: "2px",
        borderLeft: "", borderRight: `${a}px solid ${this.bgColor}`,
        borderTop: `${a}px solid transparent`, borderBottom: `${a}px solid transparent`,
      });
    } else {
      this.element.style.transform = "translate(-50%, calc(-100% - 10px))";
      this.bubble.style.transformOrigin = "bottom center";
      Object.assign(arrow, {
        top: "", bottom: `-${a}px`, left: "50%", transform: "translateX(-50%)",
        borderRight: `${a}px solid transparent`, borderLeft: `${a}px solid transparent`,
        borderTop: `${a}px solid ${this.borderColor}`, borderBottom: "",
      });
      Object.assign(inner, {
        top: `-${a + 2}px`, left: `-${a}px`,
        borderRight: `${a}px solid transparent`, borderLeft: `${a}px solid transparent`,
        borderTop: `${a}px solid ${this.bgColor}`, borderBottom: "",
      });
      // setShift re-applies the wrapper transform next call
      this._shift = 0;
      this._shiftBubbleW = -1;
    }
  }

  /**
   * With a left tail: move the tail `y` px down the bubble's left edge,
   * keeping its tip where setPosition() put it (the bubble moves instead).
   */
  setSideTailOffset(y: number) {
    if (this._tailSide !== "left") return;
    const t = Math.round(y);
    if (t === this._sideTailY) return;
    this._sideTailY = t;
    const a = SpeechBalloon.ARROW_SIZE;
    this.element.style.transform = `translate(${a}px, -${t}px)`;
    this.arrowElement.style.top = `${t - a}px`;
  }

  /** Outer (border-box) height of the bubble, px. */
  getHeight(): number {
    return this.bubble.offsetHeight;
  }

  /** Outer (border-box) width of the bubble, px. */
  getWidth(): number {
    return this.bubble.offsetWidth;
  }

  /**
   * Slide the bubble horizontally off its anchor point while the arrow stays
   * pointing at the anchor. The caller (Stage) uses this to keep the bubble
   * on-stage when the actor stands near an edge — without it, the centered
   * bubble bleeds off the side by up to half its width.
   *
   * @param shift px to move the bubble right of the anchor (negative = left)
   */
  setShift(shift: number) {
    const s = Math.round(shift);
    const w = this.bubble.offsetWidth;
    if (s === this._shift && w === this._shiftBubbleW) return;
    this._shift = s;
    this._shiftBubbleW = w;

    // The wrapper carries the shift (its transform isn't animated; the scale
    // animation lives on the bubble, so the two don't fight).
    this.element.style.transform = `translate(calc(-50% + ${s}px), calc(-100% - 10px))`;

    // Re-anchor the arrow over the actor: bubble center sits at anchor+s, so
    // the arrow belongs at (center - s), clamped inside the rounded corners.
    const arrowX = Math.max(
      SpeechBalloon.ARROW_INSET,
      Math.min(w - SpeechBalloon.ARROW_INSET, w / 2 - s),
    );
    this.arrowElement.style.left = `${arrowX}px`;
  }

  async show(options: AnimationParams = {}): Promise<void> {
    if (this._isVisible) return;
    this._isVisible = true;

    return new Promise((resolve) => {
      animate(this.bubble, {
        scale: [0, 1],
        opacity: [0, 1],
        duration: options.duration || 300,
        ease: options.ease || "outBack",
        delay: options.delay || 0,
        onComplete: () => {
          if (options.complete) options.complete();
          resolve();
        }
      });
    });
  }

  async hide(options: AnimationParams = {}): Promise<void> {
    if (!this._isVisible) return;
    this._isVisible = false;

    return new Promise((resolve) => {
      animate(this.bubble, {
        scale: [1, 0],
        opacity: [1, 0],
        duration: options.duration || 200,
        ease: options.ease || "inBack",
        delay: options.delay || 0,
        onComplete: () => {
          if (options.complete) options.complete();
          resolve();
        }
      });
    });
  }
}
