// letterpeople/src/letters/o-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { Circle, pointAtAngle } from "../util/geometry";
import {
  lowerCaseCircles,
  placeFaceFeatures,
} from "../util/circle-letter-utils";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'o'.
 * Uses the standard lowerCaseCircles utility to maintain consistency with other circular letters.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderO_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate Dimensions using standard lowercase circle utility ---
  const circles = lowerCaseCircles(limbThickness);
  const outerCircle: Circle = circles.outer;
  const innerCircle: Circle = circles.inner;

  // --- Path Definition ---
  // Simple circular 'o' with outer and inner circles
  const pathData = [
    // Outer circle (clockwise) - two 180-degree arcs
    `M ${outerCircle.x + outerCircle.r} ${outerCircle.y}`,
    `A ${outerCircle.r} ${outerCircle.r} 0 0 1 ${outerCircle.x - outerCircle.r} ${outerCircle.y}`,
    `A ${outerCircle.r} ${outerCircle.r} 0 0 1 ${outerCircle.x + outerCircle.r} ${outerCircle.y}`,
    `Z`,
    // Inner circle (counter-clockwise) - two 180-degree arcs
    `M ${innerCircle.x + innerCircle.r} ${innerCircle.y}`,
    `A ${innerCircle.r} ${innerCircle.r} 0 0 0 ${innerCircle.x - innerCircle.r} ${innerCircle.y}`,
    `A ${innerCircle.r} ${innerCircle.r} 0 0 0 ${innerCircle.x + innerCircle.r} ${innerCircle.y}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const faceFeatures = placeFaceFeatures(innerCircle, outerCircle);

  const attachments: AttachmentList = {
    // Eyes and mouth positioned using placeFaceFeatures utility
    leftEye: faceFeatures.left,
    rightEye: faceFeatures.right,
    mouth: faceFeatures.mouth,

    // Hat sits on top of the circle
    hat: {
      x: outerCircle.x,
      y: outerCircle.y - outerCircle.r,
    },

    // Arms on the sides of the 'o'
    leftArm: {
      x: outerCircle.x - outerCircle.r,
      y: outerCircle.y,
    },
    rightArm: {
      x: outerCircle.x + outerCircle.r,
      y: outerCircle.y,
    },

    // Legs at the bottom of the 'o'
    leftLeg: pointAtAngle(110, outerCircle),
    rightLeg: pointAtAngle(70, outerCircle),
  };

  return {
    viewBox: [0, 0, circles.outer.r * 2, VIEWBOX_HEIGHT],
    className: "letter-base letter-o-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderO_lowercase;
