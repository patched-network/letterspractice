// letterpeople/src/letters/Z-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { lineTo } from "../util/drawing";
import {
  getLineIntersection,
  getParallelLineSegment,
  Line,
  Point,
} from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'Z'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderZ_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias
  const H = VIEWBOX_HEIGHT;
  const W = 0.75 * H;

  const D = T * 1.5;

  //////////
  // POINTS
  //////////

  const upperLeft: Point = {
    x: 0,
    y: 0,
  };
  const upperLeftBottom: Point = {
    x: 0,
    y: T,
  };
  const upperRight: Point = {
    x: W,
    y: 0,
  };
  const upperBevel: Point = {
    x: W,
    y: upperRight.y + T,
  };
  const upperIndent: Point = {
    x: W - D,
    y: upperBevel.y,
  };

  const lowerBevel: Point = {
    x: 0,
    y: H - T,
  };
  const lowerLeft: Point = {
    x: 0,
    y: H,
  };
  const lowerRight: Point = {
    x: W,
    y: H,
  };
  const lowerRightTop: Point = {
    x: W,
    y: H - T,
  };
  const lowerIndent: Point = {
    x: D,
    y: lowerBevel.y,
  };

  const d = [
    `M ${upperLeft.x} ${upperLeft.y}`,
    lineTo(upperRight),
    lineTo(upperBevel),
    lineTo(lowerIndent),
    lineTo(lowerRightTop),
    lineTo(lowerRight),
    lineTo(lowerLeft),
    lineTo(lowerBevel),
    lineTo(upperIndent),
    lineTo(upperLeftBottom),

    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  const attachments: AttachmentList = {
    // Eyes and mouth on the upper part of the vertical stem
    leftEye: { x: T / 2, y: T * 0.5 },
    rightEye: { x: W - T / 2, y: T * 0.5 },

    mouth: { x: W / 2, y: H / 2 },

    // Hat sits centered on top
    hat: { x: T / 2, y: 0 }, // Center on the outline thickness

    // Arms
    leftArm: lowerBevel,
    rightArm: lowerRightTop,

    // Legs at the bottom centers of the stems
    leftLeg: { x: W / 2 - T, y: H }, // Center on bottom outline
    rightLeg: { x: W / 2 + T, y: H }, // Center on bottom outline
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, W, VIEWBOX_HEIGHT],
    className: "letter-base letter-Z-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function using its descriptive name
export default renderZ_uppercase;
