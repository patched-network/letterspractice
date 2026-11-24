// letterpeople/src/letters/d-lowercase.ts
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
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'd'.
 * This function uses a circle on the left and a vertical stem on the right.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderD_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const stemWidth = limbThickness;

  // --- Calculate Dimensions and Positions ---
  const W = 65;
  const H = VIEWBOX_HEIGHT;

  // Circle properties (bowl of the 'd')
  const circleOuterRadius = EFFECTIVE_LOWERCASE_HEIGHT / 2;
  const circleCenterY = H - EFFECTIVE_LOWERCASE_HEIGHT / 2; // Positioned towards the bottom
  const circleInnerRadius = circleOuterRadius - limbThickness;

  // Position the circle on the left side of its allocated space
  // The 'd' character's body will be from (W - EFFECTIVE_LOWERCASE_HEIGHT) to W
  const characterBaseX = W - EFFECTIVE_LOWERCASE_HEIGHT;
  const circleCenterX = characterBaseX + circleOuterRadius;

  const outerCircle: Circle = {
    x: circleCenterX,
    y: circleCenterY,
    r: circleOuterRadius,
  };
  const innerCircle: Circle = {
    x: circleCenterX,
    y: circleCenterY,
    r: circleInnerRadius > 0 ? circleInnerRadius : 0, // Ensure non-negative radius
  };

  // console.log(`InnerCircle calc for 'd'`, innerCircle);

  // Vertical stem position (right side of the character)
  const stemRightEdgeX = W;
  const stemLeftEdgeX = stemRightEdgeX - stemWidth;

  const stemUpperLeft: Point = {
    x: stemLeftEdgeX,
    y: 0,
  };
  const stemUpperRight: Point = {
    x: stemRightEdgeX,
    y: 0,
  };
  const stemBottomLeft: Point = {
    x: stemLeftEdgeX,
    y: H,
  };
  const stemBottomRight: Point = {
    x: stemRightEdgeX,
    y: H,
  };

  // Calculate connection between stem and circle
  // The stem connects to the circle along the line x = stemLeftEdgeX
  const connections = getVerticalLineCircleIntersections(
    stemLeftEdgeX,
    outerCircle,
  );
  if (
    connections.upperIntersection === null ||
    connections.lowerIntersection === null
  ) {
    throw new Error(
      `d's 'circle' (at x=${outerCircle.x}) is not joined to its stem (at x=${stemLeftEdgeX})! Radius: ${outerCircle.r}. Effective height: ${EFFECTIVE_LOWERCASE_HEIGHT}`,
    );
  }

  const upperConnection: Point = connections.upperIntersection!;
  const lowerConnection: Point = connections.lowerIntersection!;

  // --- Path Definition ---
  // Start at the upper connection point, then move clockwise for the outer shape
  const pathData = [
    `M ${upperConnection.x} ${upperConnection.y}`, // Start at the upper connection point (stem's left, top-ish)
    `L ${stemUpperLeft.x} ${stemUpperLeft.y}`, // Line to top left of stem
    `L ${stemUpperRight.x} ${stemUpperRight.y}`, // Line to top right of stem
    `L ${stemBottomRight.x} ${stemBottomRight.y}`, // Line to bottom right of stem
    `L ${stemBottomLeft.x} ${stemBottomLeft.y}`, // Line to bottom left of stem
    `L ${lowerConnection.x} ${lowerConnection.y}`, // Line to the lower connection point (stem's left, bottom-ish)
    // Arc from lower connection to upper connection, forming the left side of the 'd'
    // Using large-arc-flag=1, sweep-flag=1
    `A ${circleOuterRadius} ${circleOuterRadius} 0 1 1 ${upperConnection.x} ${upperConnection.y}`,
    `Z`, // Close outer path

    // Now draw the counter-clockwise inner circle to create the hole
    // Start at the rightmost point of the inner circle
    `M ${innerCircle.x + innerCircle.r} ${innerCircle.y}`,
    // Arc 1: Draw a 180-degree semi-circle counter-clockwise to the leftmost point.
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

    // Hat sits on top of the stem (stem is on the right)
    hat: { x: (stemLeftEdgeX + stemRightEdgeX) / 2, y: 0 },

    // Arms
    // Left arm on the far left of the 'd's body
    leftArm: { x: characterBaseX, y: outerCircle.y },
    // Right arm on the stem (far right of 'd's body)
    rightArm: { x: stemRightEdgeX, y: H * 0.4 },

    // Legs
    // Left leg at the bottom center of the circle
    leftLeg: { x: outerCircle.x, y: H },
    // Right leg at the bottom of the stem
    rightLeg: {
      x: (stemLeftEdgeX + stemRightEdgeX) / 2,
      y: H,
    },
  };

  return {
    viewBox: [0, 0, W, VIEWBOX_HEIGHT],
    className: "letter-base letter-d-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderD_lowercase;
