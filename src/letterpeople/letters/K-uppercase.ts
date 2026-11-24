// letterpeople/src/letters/K-uppercase.ts
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

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 75;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'K'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderK_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  const stemIntersectionBottom: Point = {
    x: T,
    y: (2 * H) / 3,
  };
  const upperArmLowerBoundary: Line = {
    p1: stemIntersectionBottom,
    p2: { x: W, y: 0 },
  };
  const upperArmUpperBountary: Line = getParallelLineSegment(
    upperArmLowerBoundary.p1,
    upperArmLowerBoundary.p2,
    T,
    "right",
  );
  const stemIntersectionTop: Point = getLineIntersection(
    upperArmUpperBountary,
    { p1: { x: T, y: 0 }, p2: { x: T, y: 1 } },
  )!;
  const upperArmUpperInside: Point = getLineIntersection(
    upperArmUpperBountary,
    { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } },
  )!;
  const upperArmUpperOutside: Point = { x: W, y: 0 };

  const lowerArmUpperBoundary: Line = {
    p1: { x: T, y: 0 },
    p2: { x: W, y: H },
  };

  const upperLowerOuterIntersection: Point = getLineIntersection(
    lowerArmUpperBoundary,
    upperArmLowerBoundary,
  )!;

  const lowerArmLowerBoundary: Line = getParallelLineSegment(
    lowerArmUpperBoundary.p1,
    lowerArmUpperBoundary.p2,
    T,
    "left",
  );

  const lowerArmLowerInside: Point = getLineIntersection(
    lowerArmLowerBoundary,
    { p1: { x: 0, y: H }, p2: { x: 1, y: H } },
  )!;
  const upperLowerBottomInteresction: Point = getLineIntersection(
    lowerArmLowerBoundary,
    upperArmLowerBoundary,
  )!;

  const d = [
    `M 0 0`,
    `H ${T}`,
    lineTo(stemIntersectionTop),
    lineTo(upperArmUpperInside),
    lineTo(upperArmUpperOutside),
    lineTo(upperLowerOuterIntersection),
    lineTo(W, H),
    lineTo(lowerArmLowerInside),
    lineTo(upperLowerBottomInteresction),
    lineTo(stemIntersectionBottom),

    `L ${T} ${H}`,
    `L ${0} ${H}`,

    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  // Ensure the keys match the expected structure if defined strictly in LetterInstance later
  const attachments: AttachmentList = {
    // Eyes and mouth on the upper part of the vertical stem
    leftEye: { x: T * 0.5, y: T * 0.7 },
    rightEye: { x: (W + upperArmUpperInside.x) / 2 - T * 0.5, y: T * 0.7 },

    mouth: { x: T, y: H / 2 },

    // Hat sits centered on top
    hat: { x: T / 2, y: 0 }, // Center on the outline thickness

    // Arms roughly mid-height
    leftArm: { x: 0, y: H * 0.6 },
    rightArm: upperLowerOuterIntersection,

    // Legs at the bottom centers of the stems
    leftLeg: { x: T / 2, y: H },
    rightLeg: { x: (W + lowerArmLowerInside.x) / 2, y: H },
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-K-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function using its descriptive name
export default renderK_uppercase;
