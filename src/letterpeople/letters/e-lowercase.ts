// letterpeople/src/letters/e-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  Line,
  Point,
  getLineCircleIntersections,
  getVerticalLineCircleIntersections,
  pointAtAngle,
} from "../util/geometry";
import { placeFaceFeatures } from "../util/circle-letter-utils";
import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
} from "./CONSTS";

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'a'.
 * This function uses a circle on the left and a vertical stem on the right,
 * with the stem cut off at the lowercase height constant.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderE_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = Math.min(
    EFFECTIVE_LOWERCASE_HEIGHT / 5,
    options?.lineWidth ?? DEFAULT_LIMB_THICKNESS,
  );
  const fillColor = options?.color ?? "currentColor";
  const outlineColor = options?.borderColor ?? "black";
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;
  const stemWidth = limbThickness;

  // --- Calculate Dimensions and Positions ---
  const H = VIEWBOX_HEIGHT;

  // Circle properties (bowl of the 'a')
  const circleOuterRadius = EFFECTIVE_LOWERCASE_HEIGHT / 2;
  const circleCenterY = H - EFFECTIVE_LOWERCASE_HEIGHT / 2; // Positioned towards the bottom
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

  const rightMost: Point = {
    x: circleCenterX + circleOuterRadius,
    y: circleCenterY,
  };

  const outerStemPoint: Point = pointAtAngle(25, outerCircle);
  const innerStemPoint: Point = pointAtAngle(25, innerCircle);
  const innerCircleLowerLineIntersection: Point = {
    x: circleCenterX - innerCircle.r,
    y: circleCenterY,
  };

  const holeFloor: Line = {
    p1: { x: 0, y: rightMost.y - 0.666 * limbThickness },
    p2: { x: 1, y: rightMost.y - 0.666 * limbThickness },
  };
  const holeCorners = getLineCircleIntersections(holeFloor, innerCircle);

  // console.log(`rightMost ${rightMost.x}, ${rightMost.y}`);
  // console.log(`outerStemPoint ${outerStemPoint.x}, ${outerStemPoint.y}`);
  // console.log(`innerStemPoint ${innerStemPoint.x}, ${innerStemPoint.y}`);
  // console.log(
  //   `innerCircleLowerLineIntersection ${innerCircleLowerLineIntersection.x}, ${innerCircleLowerLineIntersection.y}`,
  // );

  // --- Path Definition ---
  // Start at the upper connection point, then move clockwise for the outer shape

  // note: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const pathData = [
    `M ${rightMost.x} ${rightMost.y}`, // Start at the outside corner of upper section
    `A ${outerCircle.r} ${outerCircle.r} 0 1 0 ${outerStemPoint.x} ${outerStemPoint.y}`, // Big-arc around to stem point
    `L ${innerStemPoint.x} ${innerStemPoint.y}`, // Line to inner stem point
    `A ${innerCircle.r} ${innerCircle.r} 0 0 1 ${innerCircleLowerLineIntersection.x} ${innerCircleLowerLineIntersection.y}`,
    `Z`,

    // and the semi-circle 'hole'
    `M ${holeCorners[0].x} ${holeCorners[0].y}`,
    `A ${innerCircle.r} ${innerCircle.r} 0 0 1 ${holeCorners[1].x} ${holeCorners[1].y}`,
    `Z`, // Close inner path
  ].join(" ");


  // --- Attachment Points Calculation ---
  const faceFeatures = placeFaceFeatures(innerCircle, outerCircle);

  const attachments: AttachmentList = {
    // Eyes and mouth positioned using placeFaceFeatures utility
    leftEye: faceFeatures.left,
    rightEye: faceFeatures.right,
    mouth: faceFeatures.mouth,

    // Hat sits on top of the circle since the stem is cut off
    hat: {
      x: outerCircle.x,
      y: circleCenterY - outerCircle.r,
    },

    // Arms
    // Left arm on the far left of the circle
    leftArm: pointAtAngle(190, outerCircle),
    // Right arm on the stem (far right of 'a's body)
    // rightArm: { x: stemRightEdgeX, y: H * 0.75 }, // Position on the shortened stem
    rightArm: pointAtAngle(-10, outerCircle),

    // Legs
    leftLeg: pointAtAngle(105, outerCircle),
    // Right leg at the bottom of the stem
    rightLeg: pointAtAngle(75, outerCircle),
  };

  return {
    viewBox: [0, 0, rightMost.x, VIEWBOX_HEIGHT],
    className: "letter-base letter-e-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderE_lowercase;
