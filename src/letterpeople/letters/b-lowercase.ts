// letterpeople/src/letters/b-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  Point,
  getVerticalLineCircleIntersections,
} from "../util/geometry";
import { placeFaceFeatures } from "../util/circle-letter-utils";
import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
// const VIEWBOX_WIDTH = 70;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'b'.
 * This function uses a vertical stem on the left and a circle on the right.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderB_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const stemWidth = limbThickness;

  // --- Calculate Dimensions and Positions ---
  // const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Position the circle center
  const circleCenterY = H - EFFECTIVE_LOWERCASE_HEIGHT / 2;
  const circleOuterRadius = EFFECTIVE_LOWERCASE_HEIGHT / 2;
  const circleInnerRadius = circleOuterRadius - limbThickness; // make the stroke of the circle limbThickness wide

  // Create the vertical stem position (left side)
  const stemX = 0;

  const stemUpperLeft: Point = {
    x: 0,
    y: 0,
  };
  const stemUpperRight: Point = {
    x: stemWidth,
    y: 0,
  };
  const stemBottomLeft: Point = {
    x: 0,
    y: H,
  };
  const stemBottomRight: Point = {
    x: stemWidth,
    y: H,
  };

  const outerCircle: Circle = {
    x: circleOuterRadius,
    y: circleCenterY,
    r: circleOuterRadius,
  };
  const innerCircle: Circle = {
    x: circleOuterRadius,
    y: circleCenterY,
    r: circleOuterRadius - limbThickness,
  };

  // console.log(`InnerCircle calc`, innerCircle);

  // Calculate connection between stem and circle
  const connections = getVerticalLineCircleIntersections(
    stemWidth,
    outerCircle,
  );
  if (
    connections.upperIntersection === null ||
    connections.lowerIntersection === null
  ) {
    throw new Error("b's `circle` is not joined to its stem!");
  }

  const upper: Point = connections.upperIntersection!;
  const lower: Point = connections.lowerIntersection!;

  // --- Path Definition ---
  // Start at the lower connection point, then move clockwise
  const pathData = [
    // draw the outline of the letter
    `M ${lower.x} ${lower.y}`, // Start at the lower connection point
    `L ${stemBottomRight.x} ${stemBottomRight.y}`, // Line to bottom right of stem
    `L ${stemBottomLeft.x} ${stemBottomLeft.y}`, // Line to bottom left of stem
    `L ${stemUpperLeft.x} ${stemUpperLeft.y}`, // Line to upper left of stem
    `L ${stemUpperRight.x} ${stemUpperRight.y}`, // Line to upper right of stem
    `L ${upper.x} ${upper.y}`, // Line to the upper connection point
    // Arc from upper connection to lower connection
    // Using large-arc-flag=1 makes it draw the long arc path
    `A ${circleOuterRadius} ${circleOuterRadius} 0 1 1 ${lower.x} ${lower.y}`,
    `Z`, // Close path

    // Now draw the counter-clockwise inner circle to create the hole
    // Move to the rightmost point of the inner circle
    `M ${innerCircle.x + innerCircle.r} ${innerCircle.y}`,
    // Arc 1: Draw a 180-degree semi-circle counter-clockwise to the leftmost point.
    // rx, ry, x-axis-rotation, large-arc-flag (0 for semi-circle), sweep-flag (0 for CCW), x, y
    `A ${innerCircle.r} ${innerCircle.r} 0 0 0 ${innerCircle.x - innerCircle.r} ${innerCircle.y}`,
    // Arc 2: Draw the second 180-degree semi-circle counter-clockwise back to the starting (rightmost) point.
    `A ${innerCircle.r} ${innerCircle.r} 0 0 0 ${innerCircle.x + innerCircle.r} ${innerCircle.y}`,
    `Z`, // Close inner path
  ].join(" ");

  // --- Attachment Points Calculation ---
  const faceFeatures = placeFaceFeatures(innerCircle, outerCircle);

  const attachments: AttachmentList = {
    // Eyes and mouth positioned using placeFaceFeatures utility
    leftEye: faceFeatures.left,
    rightEye: faceFeatures.right,
    mouth: faceFeatures.mouth,

    // Hat sits on top of the stem
    hat: { x: stemWidth / 2, y: 0 },

    // Arms on the sides
    leftArm: { x: 0, y: H * 0.4 }, // On the stem
    rightArm: { x: outerCircle.x + outerCircle.r, y: outerCircle.y }, // On the far right of the circle

    // Legs at the bottom
    leftLeg: { x: stemWidth / 2, y: H }, // Bottom of stem
    rightLeg: { x: outerCircle.x, y: H }, // Bottom center of circle
  };

  return {
    viewBox: [0, 0, outerCircle.x + outerCircle.r, VIEWBOX_HEIGHT],
    className: "letter-base letter-b-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderB_lowercase;
