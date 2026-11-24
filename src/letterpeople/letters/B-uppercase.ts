// letterpeople/src/letters/B-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  getCircleCircleIntersections,
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

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'B'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderB_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- B Geometry Calculations ---
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

  const upperBowlOuterCircle: Circle = {
    x: circleX,
    y: circleX,
    r: circleX,
  };

  const lowerBowlOuterCircle: Circle = {
    x: circleX + limbT / 6,
    y: VIEWBOX_HEIGHT - (circleX + limbT / 16),
    r: circleX + limbT / 6,
  };
  const lowerBowlOutsideX = 2 * lowerBowlOuterCircle.x;

  const bowlsIntersection = getCircleCircleIntersections(
    upperBowlOuterCircle,
    lowerBowlOuterCircle,
  ).sort((a, b) => a.x - b.x)[1]; // rightmost intersection point

  // --- Construct Path Data ---

  const outerPathData = [
    `M ${upperLeft.x} ${upperLeft.y}`, // Top-left of stem
    `L ${bowlTop.x} ${bowlTop.y}`, // Top-right of stem
    `A ${upperBowlOuterCircle.r} ${upperBowlOuterCircle.r} 0 0 1 ${bowlsIntersection.x} ${bowlsIntersection.y}`, // arc to lower bowl
    `A ${lowerBowlOuterCircle.r} ${lowerBowlOuterCircle.r} 0 0 1 ${lowerBowlOuterCircle.x} ${VIEWBOX_HEIGHT}`, // arc to bottom line
    `L ${0} ${VIEWBOX_HEIGHT}`, // to bottom-right leg outer point
    // `L ${angleLegOutside.x - limbT} ${angleLegOutside.y}`, // to bottom-right leg outer point
    // `L ${Math.max(limbT, bowlLogInnerIntersection.x)} ${innerLegIntersectionY}`, // to bottom-right leg outer point
    // `L ${limbT} ${innerLegIntersectionY}`,
    // `L ${limbT} ${VIEWBOX_HEIGHT}`,
    // `L 0 ${VIEWBOX_HEIGHT}`,

    `Z`, // Close path
  ].join(" ");

  // Inner holes for the bowls
  const upperInnerPathData = [
    `M ${limbT} ${limbT}`, // upper left w/ 'offset'
    `L ${limbT} ${2 * limbT}`, // down the stem
    `L ${limbT * 1.5} ${2 * limbT}`, // 'spacer' effect
    `A ${limbT / 2} ${limbT / 2} 0 0 0 ${limbT * 1.5} ${limbT}`, // and arc back.

    `Z`, //
  ].join(" ");

  const lowerInnerPathData = [
    `M ${limbT} ${VIEWBOX_HEIGHT - limbT}`, // upper left w/ 'offset'
    `L ${limbT} ${VIEWBOX_HEIGHT - 2 * limbT}`, // down the stem
    `L ${limbT * 1.5} ${VIEWBOX_HEIGHT - 2 * limbT}`, // 'spacer' effect
    `A ${limbT / 2} ${limbT / 2} 0 0 1 ${limbT * 1.5} ${VIEWBOX_HEIGHT - limbT}`, // and arc back.

    `Z`, //
  ].join(" ");

  // Combine outer path and inner hole using fill-rule
  const combinedPathData =
    outerPathData + " " + upperInnerPathData + " " + lowerInnerPathData;

  // --- Attachment Points Calculation ---

  const attachments: AttachmentList = {
    leftEye: { x: limbT / 2, y: limbT / 2 },
    rightEye: { x: circleX + limbT / 2, y: limbT / 2 },

    leftArm: { x: 0, y: 3 * limbT },
    rightArm: bowlsIntersection,

    hat: { x: circleX - limbT / 4, y: 0 },

    mouth: { x: circleX, y: 2.5 * limbT },

    leftLeg: { x: limbT / 2, y: VIEWBOX_HEIGHT },
    rightLeg: { x: circleX, y: VIEWBOX_HEIGHT },
  };

  return {
    viewBox: [0, 0, lowerBowlOutsideX, VIEWBOX_HEIGHT],
    className: "letter-base letter-B-uppercase",
    parts: [{ d: combinedPathData, fillRule: "evenodd" }],
    attachments: attachments,
  };
}

export default renderB_uppercase;
