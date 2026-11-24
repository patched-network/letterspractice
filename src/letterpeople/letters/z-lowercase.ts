// letterpeople/src/letters/z-lowercase.ts
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
  EFFECTIVE_LOWERCASE_HEIGHT,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'z'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderZ_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias
  const H = VIEWBOX_HEIGHT;
  const LH = EFFECTIVE_LOWERCASE_HEIGHT;
  const W = LH; // have the `z` fill a square?

  const diagWidth = T * 0.7;
  const D = T * 1.75;

  const lowerCaseBoundary: Line = {
    p1: { x: 0, y: H - EFFECTIVE_LOWERCASE_HEIGHT },
    p2: { x: 1, y: H - EFFECTIVE_LOWERCASE_HEIGHT },
  };
  const baseLine: Line = {
    p1: { x: 0, y: H },
    p2: { x: 1, y: H },
  };

  //////////
  // POINTS
  //////////

  const upperLeft: Point = {
    x: 0,
    y: H - LH,
  };
  const upperLeftBottom: Point = {
    x: 0,
    y: H - LH + T,
  };
  const upperRight: Point = {
    x: W,
    y: H - LH,
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

  const stemIntersectionBottom: Point = {
    x: T,
    y: H - LH / 3,
  };
  const stemIntersectionTop: Point = {
    x: T,
    y: H - 2 * (LH / 3),
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
    leftEye: { x: T / 2, y: H - LH + T * 0.5 },
    rightEye: { x: W - T / 2, y: H - LH + T * 0.5 },

    mouth: { x: W / 2, y: H - LH / 2 },

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
    className: "letter-base letter-z-lowercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function using its descriptive name
export default renderZ_lowercase;
