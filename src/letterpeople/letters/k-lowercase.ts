// src/letters/k-lowercase.ts
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
 * Renders the base shape and calculates attachment points for the lowercase letter 'k'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderK_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias
  const H = VIEWBOX_HEIGHT;
  const LH = EFFECTIVE_LOWERCASE_HEIGHT;

  const armWidth = T * 0.7;

  const lowerCaseBoundary: Line = {
    p1: { x: 0, y: H - EFFECTIVE_LOWERCASE_HEIGHT },
    p2: { x: 1, y: H - EFFECTIVE_LOWERCASE_HEIGHT },
  };
  const baseLine: Line = {
    p1: { x: 0, y: H },
    p2: { x: 1, y: H },
  };

  const stemIntersectionBottom: Point = {
    x: T,
    y: H - LH / 3,
  };
  const stemIntersectionTop: Point = {
    x: T,
    y: H - 2 * (LH / 3),
  };

  // move at a 45 degree angle
  const upperArmUpperBountary: Line = {
    p1: stemIntersectionTop,
    p2: {
      x: stemIntersectionTop.x + 1,
      y: stemIntersectionTop.y - 1,
    },
  };
  const upperArmLowerBoundary: Line = getParallelLineSegment(
    upperArmUpperBountary.p1,
    upperArmUpperBountary.p2,
    armWidth,
    "left",
  );

  const upperArmUpperInside: Point = getLineIntersection(
    upperArmUpperBountary,
    lowerCaseBoundary,
  )!;
  const upperArmUpperOutside: Point = getLineIntersection(
    upperArmLowerBoundary,
    lowerCaseBoundary,
  )!;

  const lowerArmLowerBoundary: Line = {
    p1: stemIntersectionBottom,
    p2: {
      x: stemIntersectionBottom.x + 1,
      y: stemIntersectionBottom.y + 1,
    },
  };

  const lowerArmUpperBoundary: Line = getParallelLineSegment(
    lowerArmLowerBoundary.p1,
    lowerArmLowerBoundary.p2,
    armWidth,
    "right",
  );

  const upperLowerOuterIntersection: Point = getLineIntersection(
    lowerArmUpperBoundary,
    upperArmLowerBoundary,
  )!;

  const lowerArmLowerInside: Point = getLineIntersection(
    lowerArmLowerBoundary,
    { p1: { x: 0, y: H }, p2: { x: 1, y: H } },
  )!;

  const lowerArmLowerOutside: Point = getLineIntersection(
    lowerArmUpperBoundary,
    baseLine,
  )!;

  const d = [
    `M 0 0`,
    `H ${T}`,
    lineTo(stemIntersectionTop),
    lineTo(upperArmUpperInside),
    lineTo(upperArmUpperOutside),
    lineTo(upperLowerOuterIntersection),
    lineTo(lowerArmLowerOutside),
    lineTo(lowerArmLowerInside),
    lineTo(stemIntersectionBottom),

    `L ${T} ${H}`,
    `L ${0} ${H}`,

    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  const attachments: AttachmentList = {
    // Eyes and mouth on the upper part of the vertical stem
    leftEye: { x: T * 0.3, y: T * 0.8 },
    rightEye: { x: T * 0.7, y: T * 0.8 },
    mouth: { x: T / 2, y: T * 1.3 },

    // Hat sits centered on top
    hat: { x: T / 2, y: 0 }, // Center on the outline thickness

    // Arms roughly mid-height
    leftArm: { x: 0, y: H * 0.6 },
    rightArm: upperLowerOuterIntersection,

    // Legs at the bottom centers of the stems
    leftLeg: { x: T / 2, y: H }, // Center on bottom outline
    rightLeg: { x: (lowerArmLowerInside.x + lowerArmLowerOutside.x) / 2, y: H }, // Center on bottom outline
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, lowerArmLowerOutside.x, VIEWBOX_HEIGHT],
    className: "letter-base letter-k-lowercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function
export default renderK_lowercase;
