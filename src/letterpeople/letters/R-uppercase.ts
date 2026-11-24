// letterpeople/src/letters/R-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  getLineCircleIntersections,
  getLineIntersection,
  getParallelLineSegment,
  Line,
  midpoint,
  Point,
} from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 5;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'R'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderR_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- R Geometry Calculations ---
  const upperLeft: Point = {
    x: 0,
    y: 0,
  };

  const spacer = limbT * 0.5; // horizontal space before starting 'circle' of R-top
  const circleX = limbT + spacer;

  const bowlTop: Point = {
    ...upperLeft,
    x: circleX,
  };

  const bowlOuterCircle: Circle = {
    x: circleX,
    y: circleX,
    r: circleX,
  };
  const bowlInnerCircle: Circle = {
    x: circleX,
    y: circleX,
    r: circleX - limbT,
  };

  const bowlOutsideX = 2 * circleX;
  const angleLegOutside: Point = {
    x: bowlOutsideX,
    y: VIEWBOX_HEIGHT,
  };

  const bowlLegOuterIntersection = getLineCircleIntersections(
    {
      p1: {
        x: spacer,
        y: 0,
      },
      p2: angleLegOutside,
    },
    bowlOuterCircle,
  ).sort((a, b) => a.y - b.y)[1]; // lower intersection point
  const bowlLogInnerIntersection = getLineCircleIntersections(
    {
      p1: {
        x: 0,
        y: 0,
      },
      p2: {
        x: angleLegOutside.x - limbT,
        y: angleLegOutside.y,
      },
    },
    bowlOuterCircle,
  ).sort((a, b) => a.y - b.y)[1]; // lower intersection point

  const innerLegIntersectionY = Math.max(
    2 * bowlOuterCircle.r,
    bowlLogInnerIntersection.y,
  );

  const bowlDiagIntersection: Point = {
    x: 2 * limbT,
    y: VIEWBOX_HEIGHT / 2,
  };

  // --- Construct Path Data ---

  const outerPathData = [
    `M ${upperLeft.x} ${upperLeft.y}`, // Top-left of stem
    `L ${bowlTop.x} ${bowlTop.y}`, // Top-right of stem
    `A ${bowlOuterCircle.r} ${bowlOuterCircle.r} 0 0 1 ${bowlLegOuterIntersection.x} ${bowlLegOuterIntersection.y}`, // arc to bowlDiagIntersection
    `L ${angleLegOutside.x} ${angleLegOutside.y}`, // to bottom-right leg outer point
    `L ${angleLegOutside.x - limbT} ${angleLegOutside.y}`, // to bottom-right leg outer point
    `L ${Math.max(limbT, bowlLogInnerIntersection.x)} ${innerLegIntersectionY}`, // to bottom-right leg outer point
    `L ${limbT} ${innerLegIntersectionY}`,
    `L ${limbT} ${VIEWBOX_HEIGHT}`,
    `L 0 ${VIEWBOX_HEIGHT}`,

    `Z`, // Close path
  ].join(" ");

  // Inner hole for the bowl

  const innerPathData = [
    `M ${limbT} ${limbT}`, // upper left w/ 'offset'
    `L ${limbT} ${2 * limbT}`, // down the stem
    `L ${limbT * 1.5} ${2 * limbT}`, // 'spacer' effect
    `A ${limbT / 2} ${limbT / 2} 0 0 0 ${limbT * 1.5} ${limbT}`, // and arc back.

    `Z`, //
  ].join(" ");

  // Combine outer path and inner hole using fill-rule
  const combinedPathData = outerPathData + " " + innerPathData;

  // --- Attachment Points Calculation ---

  const attachments: AttachmentList = {
    leftEye: { x: limbT / 2, y: limbT / 2 },
    rightEye: { x: circleX + limbT / 2, y: limbT / 2 },

    leftArm: { x: 0, y: 3 * limbT },
    rightArm: bowlLegOuterIntersection,

    hat: { x: circleX - limbT / 4, y: 0 },

    mouth: { x: circleX, y: 2.5 * limbT },

    leftLeg: { x: limbT / 2, y: VIEWBOX_HEIGHT },
    rightLeg: { x: angleLegOutside.x - limbT / 2, y: VIEWBOX_HEIGHT },
  };

  return {
    viewBox: [0, 0, bowlOutsideX, VIEWBOX_HEIGHT],
    className: "letter-base letter-R-uppercase",
    parts: [{ d: combinedPathData, fillRule: "evenodd" }],
    attachments: attachments,
  };
}

export default renderR_uppercase;
