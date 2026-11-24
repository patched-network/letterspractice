// letterpeople/src/letters/y-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  Point,
  getVerticalLineCircleIntersections,
  pointAtAngle,
} from "../util/geometry";
import {
  lowerCaseCircles,
  placeFaceFeatures,
} from "../util/circle-letter-utils";
import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 70;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'y'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderY_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const stemWidth = limbThickness;

  // --- Calculate Dimensions and Positions ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Circle properties (bowl of the 'a')
  const circleOuterRadius = EFFECTIVE_LOWERCASE_HEIGHT / 2;
  const circleCenterY = EFFECTIVE_LOWERCASE_HEIGHT / 2; // Positioned towards the bottom
  const circleInnerRadius = circleOuterRadius - limbThickness;

  // Position the circle on the left side of its allocated space
  // The 'a' character's body will be from 0 to EFFECTIVE_LOWERCASE_HEIGHT
  const circleCenterX = circleOuterRadius;

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

  // Vertical stem position (right side of the character)
  // Unlike 'd', we cut this off at the lowercase height
  const stemRightEdgeX = W;
  const stemLeftEdgeX = stemRightEdgeX - stemWidth;
  const stemTopY = 0; // stem at top

  const stemUpperLeft: Point = {
    x: stemLeftEdgeX,
    y: stemTopY,
  };
  const stemUpperRight: Point = {
    x: stemRightEdgeX,
    y: stemTopY,
  };
  const stemBottomLeft: Point = {
    x: stemLeftEdgeX,
    y: H,
  };
  const stemBottomRight: Point = {
    x: stemRightEdgeX,
    y: H,
  };

  const stemCircles = lowerCaseCircles(limbThickness);
  const lowerArcPoint = pointAtAngle(110, stemCircles.outer);
  const upperArcPoint = pointAtAngle(110, stemCircles.inner);

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
      `a's 'circle' (at x=${outerCircle.x}) is not joined to its stem (at x=${stemLeftEdgeX})! Radius: ${outerCircle.r}. Effective height: ${EFFECTIVE_LOWERCASE_HEIGHT}`,
    );
  }

  // const upperConnection: Point = connections.upperIntersection!;
  const lowerConnection: Point = connections.lowerIntersection!;

  // --- Path Definition ---
  // Start at the upper connection point, then move clockwise for the outer shape
  const pathData = [
    `M ${stemUpperLeft.x} ${stemUpperLeft.y}`, // Start at top left of stem (at lowercase height)
    `L ${stemUpperRight.x} ${stemUpperRight.y}`, // Line to top right of stem (at lowercase height)
    `L ${stemUpperRight.x} ${stemCircles.outer.y}`,
    // Arc from bottom right of stem to bottom left of stem
    `A ${stemCircles.outer.r} ${stemCircles.outer.r} 0 0 1 ${W / 2} ${H}`, // Arc to bottom
    `A ${stemCircles.outer.r} ${stemCircles.outer.r} 0 0 1 ${0} ${stemCircles.outer.y + limbThickness / 8}`, // finish stem arc
    `L ${limbThickness} ${stemCircles.outer.y + limbThickness / 8}`,
    `A ${stemCircles.inner.r} ${stemCircles.inner.r} 0 0 0 ${stemUpperLeft.x} ${stemCircles.inner.y}`, // Arc for stem

    `L ${lowerConnection.x} ${lowerConnection.y}`, // Line to the lower connection point (stem's left, bottom-ish)

    `A ${stemCircles.outer.r} ${stemCircles.outer.r} 0 0 1 ${0} ${EFFECTIVE_LOWERCASE_HEIGHT / 2}`, // arc to outisde of left-side 'arm'
    `L ${0} ${stemUpperLeft.y}`, // up to top
    `L ${limbThickness} ${stemUpperLeft.y}`,
    `L ${limbThickness} ${EFFECTIVE_LOWERCASE_HEIGHT / 2}`,
    `A ${stemCircles.inner.r} ${stemCircles.inner.r} 0 0 0 ${stemUpperLeft.x} ${EFFECTIVE_LOWERCASE_HEIGHT / 2}`,

    // Arc from lower connection to upper connection, forming the left side of the 'a'
    // Using large-arc-flag=1, sweep-flag=1
    // `A ${circleOuterRadius} ${circleOuterRadius} 0 1 1 ${upperConnection.x} ${upperConnection.y}`,
    `Z`, // Close outer path
  ].join(" ");

  // --- Attachment Points Calculation ---
  const faceFeatures = placeFaceFeatures(innerCircle, outerCircle);

  const attachments: AttachmentList = {
    // Eyes and mouth positioned using placeFaceFeatures utility
    leftEye: { x: limbThickness / 2, y: limbThickness / 2 },
    rightEye: { x: stemUpperRight.x - limbThickness / 2, y: limbThickness / 2 },
    mouth: faceFeatures.mouth,

    // Hat sits on top of the circle since the stem is cut off
    hat: {
      x: outerCircle.x,
      y: circleCenterY - outerCircle.r,
    },

    // Arms
    // Left arm on the far left of the circle
    leftArm: {
      x: outerCircle.x - outerCircle.r,
      y: outerCircle.y,
    },
    // Right arm on the stem (far right of 'a's body)
    rightArm: { x: stemRightEdgeX, y: outerCircle.y },

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
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-y-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderY_lowercase;
