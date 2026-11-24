// letterpeople/src/letters/s-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
  // Point, // Not used directly if path is predefined
} from "../types";
import { Point } from "../util/geometry";

import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 's'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderS_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;

  // --- Path Definition ---

  const H = EFFECTIVE_LOWERCASE_HEIGHT;
  const y_offset = VIEWBOX_HEIGHT - EFFECTIVE_LOWERCASE_HEIGHT;

  const T = limbThickness;
  const r = (H - 3 * T) / 4; // radius of 'inner-circle'
  const R = r + T; // radius of 'outer-circle'
  const VIEWBOX_WIDTH = 2 * R;
  const W = VIEWBOX_WIDTH;

  const mx = W / 2;
  const my = H / 2;

  const upperOuterCorner: Point = {
    x: mx + R,
    y: H / 4 + y_offset,
  };
  const lowerOuterCorner: Point = {
    x: mx - R,
    y: H - H / 4 + y_offset,
  };
  const bottomOfTopInnerCircle: Point = {
    x: mx,
    y: T + 2 * r + y_offset,
  };
  const topOfBottomOuterCircle: Point = bottomOfTopInnerCircle;

  const bottomOfTopOuterCircle: Point = {
    x: mx,
    y: my + T / 2 + y_offset,
  };
  const topOfBottomInnerCircle: Point = bottomOfTopOuterCircle;
  const leftOfBottomInnerCircle: Point = {
    x: mx - r,
    y: H - H / 4 + y_offset,
  };
  const rightOfTopInnerCircle: Point = {
    x: mx + r,
    y: H / 4 + y_offset,
  };
  const bottomOfBottomInnerCircle: Point = {
    x: topOfBottomInnerCircle.x,
    y: topOfBottomInnerCircle.y + 2 * r + y_offset,
  };

  const path_data = [
    `M ${upperOuterCorner.x} ${upperOuterCorner.y}`, // start upper-outer corner
    `A ${R} ${R} 0 1 0 ${bottomOfTopOuterCircle.x} ${bottomOfTopOuterCircle.y}`, // arc to bottom of outer circle
    // arc to cinch point ?
    `A ${r} ${r} 0 1 1 ${leftOfBottomInnerCircle.x} ${leftOfBottomInnerCircle.y}`, // arc to left of inner circle
    `L ${lowerOuterCorner.x} ${lowerOuterCorner.y}`, // line across lower 'end'
    `A ${R} ${R} 0 1 0 ${bottomOfTopInnerCircle.x} ${bottomOfTopInnerCircle.y}`, // arc back to bottom of top inner circle
    `A ${r} ${r} 0 1 1 ${rightOfTopInnerCircle.x} ${rightOfTopInnerCircle.y}`, // arc to right of top inner circle
    `Z`,
    // `L ${upperOuterCorner.x} ${upperOuterCorner.y}`, // line back to start
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  // These are general estimates for an 'S' shape and may require fine-tuning
  // once the letter is visually rendered with its specific path.

  const ow = outlineWidth; // shorthand for outlineWidth

  const r2 = 1.414213562; // sqrt(2)

  const eyeOffset = (r + T / 2) / r2;
  const shoulderOffset = R / r2;

  const attachments: AttachmentList = {
    // Eyes positioned in the upper curve of the 'S'
    leftEye: { x: mx - eyeOffset, y: T + r - 1.5 * eyeOffset + y_offset },
    rightEye: { x: mx + eyeOffset, y: T + r - 1.5 * eyeOffset + y_offset },

    // Mouth positioned in the central part of the 'S'
    mouth: { x: W * 0.5, y: H * 0.5 + y_offset }, // Centered

    // Hat sits centered on the top of the 'S's visual bounds.
    // The provided path starts near y=0 (specifically y=-0.14), so ow/2 is a good y for the hat.
    hat: { x: W / 2, y: ow / 2 + y_offset },

    // Arms positioned on the outer curves of the 'S'
    leftArm: { x: mx - shoulderOffset, y: T + r + shoulderOffset + y_offset }, // Mid-upper part of the left curve
    rightArm: {
      x: mx + shoulderOffset,
      y: H - (T + r + shoulderOffset) + y_offset,
    }, // Mid-lower part of the right curve

    // Legs positioned on the lower curves of the 'S'
    // The path's lowest points are near H (e.g., y=98.59 in the path data).
    leftLeg: { x: W * 0.25, y: H * 0.85 + y_offset }, // On the lower-left curve
    rightLeg: { x: W * 0.75, y: H * 0.8 + y_offset }, // On the lower-right curve
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-s-lowercase",
    parts: [{ d: path_data, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderS_lowercase;
