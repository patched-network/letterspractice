/**
 * Performer: the renderer-neutral surface that LetterPeople animation
 * sequences (celebrations.ts, speech.ts) drive.
 *
 * `svgPerformer` adapts an SVG LetterInstance; other renderers (e.g. the
 * three.js spike's `performer3D`) supply their own. Sequences accept either
 * a LetterInstance or a Performer and normalise with `asPerformer`.
 */

import { utils, type AnimationParams } from "animejs";
import type { AttachmentList, LetterInstance } from "../types";
import type {
  ArmAttachment,
  ArmsWaveOptions,
  EyesAttachment,
  MouthAttachment,
} from "../attachments/types";
import type { BrowsController } from "../attachments/eyebrow";
import { animatePromise } from "../util/animation";
import type { CelebrationType } from "./celebrations";

// ============================================================================
// Performer: what a sequence needs from a letter, independent of renderer
// ============================================================================

type PerformerArm = Pick<
  ArmAttachment,
  "rotateTo" | "getHandPosition" | "getShoulderPosition" | "setHandPosition"
>;

/** One confetti bit, positioned in letter content space. */
export interface ConfettiBit {
  place(x: number, y: number, rotateDeg: number, opacity: number): void;
  remove(): void;
}

/**
 * The surface animation sequences (celebrations, speech) drive. `LetterInstance` (SVG) is adapted by
 * `svgPerformer`; other renderers (e.g. three.js) supply their own.
 * Coordinates are letter content space (SVG units, y-down).
 */
export interface Performer {
  eyes: Pick<EyesAttachment, "isVisible" | "lookAt" | "blink"> & {
    brows?: Pick<BrowsController, "express" | "relax">;
  };
  mouth: Pick<MouthAttachment, "updateShape" | "animateSpeak">;
  arms: {
    isVisible(): boolean;
    /** Grow the arms in / put them away (no-op for a letter built without). */
    show(options?: AnimationParams): Promise<void>;
    hide(options?: AnimationParams): Promise<void>;
    wave(options?: ArmsWaveOptions): Promise<void>;
    relax(options?: AnimationParams): Promise<void>;
    left: PerformerArm;
    right: PerformerArm;
  };
  attachmentCoords: AttachmentList;
  /**
   * Animate the whole body. `props` are anime.js tween props over
   * translateY / scale / scaleX / scaleY / rotate / rotateY, in CSS terms
   * (px, deg, y-down, clockwise). `origin` is the pivot: feet or middle of
   * the body.
   */
  pose(props: Record<string, any>, origin: "bottom" | "center"): Promise<void>;
  /** Return body transforms to identity. */
  resetPose(): void;
  /** Body fill colour (for confetti hues), if known. */
  fillColor(): string | null;
  spawnConfettiBit(width: number, height: number, fill: string): ConfettiBit;
  /**
   * Types `type: "random"` picks from. Defaults to RANDOM_CELEBRATIONS;
   * renderers with real depth add RANDOM_CELEBRATIONS_3D's extras.
   */
  randomPool?: readonly CelebrationType[];
}

const svgNS = "http://www.w3.org/2000/svg";

/** Adapts an SVG LetterInstance to the performer surface. */
export function svgPerformer(letter: LetterInstance): Performer {
  const element = letter.svgElement;
  return {
    eyes: letter.eyes,
    mouth: letter.mouth,
    arms: letter.arms,
    attachmentCoords: letter.attachmentCoords,
    pose: (props, origin) => {
      element.style.transformOrigin = origin === "bottom" ? "center bottom" : "center center";
      return animatePromise(element, props);
    },
    resetPose: () => resetBodyTransform(element),
    fillColor: () => letterFill(letter),
    spawnConfettiBit: (w, h, fill) => {
      const el = document.createElementNS(svgNS, "rect");
      el.setAttribute("width", String(w));
      el.setAttribute("height", String(h));
      el.setAttribute("x", String(-w / 2));
      el.setAttribute("y", String(-h / 2));
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", "rgba(0, 0, 0, 0.25)");
      el.setAttribute("stroke-width", String(letterHeight(letter.attachmentCoords) * 0.005));
      el.setAttribute("pointer-events", "none");
      letter.contentGroup.appendChild(el);
      return {
        place: (x, y, rot, opacity) => {
          el.setAttribute("transform", `translate(${x} ${y}) rotate(${rot})`);
          el.setAttribute("opacity", String(opacity));
        },
        remove: () => el.remove(),
      };
    },
  };
}

/** Normalise a sequence target: SVG letters get the SVG adapter. */
export function asPerformer(target: LetterInstance | Performer): Performer {
  return "svgElement" in target ? svgPerformer(target) : target;
}

// ============================================================================
// SVG helpers
// ============================================================================

/** Approximate letter height in its own SVG units (hat point → feet). */
export function letterHeight(coords: AttachmentList): number {
  const { hat, leftLeg, rightLeg } = coords;
  const h = Math.max(leftLeg.y, rightLeg.y) - hat.y;
  return h > 0 ? h : 100;
}

/** The letter's body fill, read from its rendered paths. */
function letterFill(letter: LetterInstance): string | null {
  for (const path of Array.from(letter.svgElement.querySelectorAll(".letter-path"))) {
    const fill = path.getAttribute("fill");
    if (fill && fill !== "none") return fill;
  }
  return null;
}

/**
 * Put the body's anime-tracked transforms back to identity. Clearing
 * `style.transform` alone leaves anime's cached values (e.g. rotate: 360)
 * in place, which the next animation then tweens from.
 */
function resetBodyTransform(element: SVGElement): void {
  utils.set(element, { translateY: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1 });
}
