// letterpeople/src/punctuation/question.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "../letters/CONSTS";
import { circlePath } from "../util/drawing";
import {
  Circle,
  getLineCircleIntersections,
  Line,
  lowerOf,
  Point,
  pointAtAngle,
} from "../util/geometry";
import { lineTo } from "../util/drawing";
import { placeFaceFeatures } from "../util/circle-letter-utils";

/**
 * @internal
 * Renders a question mark (?) character.
 *
 * @param options - Configuration options for the question mark's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderQuestion(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate dimensions ---
  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = 0;

  // Circular part of the question mark (upper portion)
  const circleRadius = EFFECTIVE_LOWERCASE_HEIGHT / 2.25; // Outer radius
  const innerRadius = Math.max(limbT / 2, circleRadius - limbT);

  // Position circle in upper portion
  const circleCenterX = circleRadius;
  const circleCenterY = y_top_char + circleRadius;

  const outerCircle: Circle = {
    x: circleCenterX,
    y: circleCenterY,
    r: circleRadius,
  };

  const innerCircle: Circle = {
    x: circleCenterX,
    y: circleCenterY,
    r: innerRadius,
  };

  // We want to draw roughly 3/4 of the circle
  // Starting from top-left, going around to the bottom
  // Angles: 180° (left) -> 270° (bottom) -> 360°/0° (right) -> ~45° (upper right opening)
  const startAngle = 180; // Left side
  // const endAngle = 45; // Upper right (opening of the question mark)

  const centerLine: Line = {
    p1: { x: circleCenterX, y: 0 },
    p2: { x: circleCenterX, y: 1 },
  };
  const tailRightEdge: Line = {
    p1: { x: circleCenterX + limbT * 0.4, y: 0 },
    p2: { x: circleCenterX + limbT * 0.4, y: 1 },
  };
  const tailLeftEdge: Line = {
    p1: { x: circleCenterX - limbT * 0.4, y: 0 },
    p2: { x: circleCenterX - limbT * 0.4, y: 1 },
  };

  // Calculate key points on the circles
  const outerStart = pointAtAngle(startAngle, outerCircle);
  // const outerEnd = pointAtAngle(endAngle, outerCircle);
  const outerEnd = lowerOf(
    getLineCircleIntersections(tailRightEdge, outerCircle),
  );
  const innerStart = pointAtAngle(startAngle, innerCircle);
  const innerEnd = lowerOf(
    getLineCircleIntersections(tailLeftEdge, innerCircle),
  );
  // const innerEnd = pointAtAngle(endAngle, innerCircle);

  // The "tail" of the question mark descends from the circle
  const tailStartOuter = outerEnd;
  const tailStartInner = innerEnd;

  // Tail descends vertically, ending above the dot
  const dotRadius = limbT / 2;
  const dotCenterY = y_baseline - dotRadius;
  const dotSpacing = limbT * 0.25; // Space between tail and dot

  const tailEndY = dotCenterY - dotRadius - dotSpacing;

  const tailEndOuter: Point = {
    x: circleCenterX + 0.4 * limbT,
    y: tailEndY,
  };
  const tailEndInner: Point = {
    x: circleCenterX - 0.4 * limbT,
    y: tailEndY,
  };

  const tailRounding = limbT / 3;

  const tailInnerTop: Point = {
    x: tailEndInner.x,
    y: circleCenterY + innerRadius + tailRounding,
  };

  // --- Create the question mark path ---

  // Arc flags: large-arc-flag determines if we take the long way around
  // We want 3/4 of a circle, which is 270°, so we use large-arc-flag=1
  const largeArcFlag = 1; // 3/4 circle is > 180°
  const sweepFlag = 1; // Clockwise

  const pathData = [
    // Start at outer circle's starting point
    `M ${outerStart.x} ${outerStart.y}`,
    // Arc along outer circle from start to end
    `A ${circleRadius} ${circleRadius} 0 ${largeArcFlag} ${sweepFlag} ${outerEnd.x} ${outerEnd.y}`,
    // Line down to tail end (outer side)
    `L ${tailEndOuter.x} ${tailEndOuter.y}`,
    // Line across to inner tail end
    `L ${tailEndInner.x} ${tailEndInner.y}`,
    lineTo(tailInnerTop),
    // // Line back up to inner circle end point
    // `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${tailRounding} ${tailRounding} 0 0 1 ${tailEndInner.x + tailRounding} ${circleCenterY + innerRadius}`,
    lineTo(circleCenterX, circleCenterY + innerRadius),
    // Arc back along inner circle (counter-clockwise) to starting point
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    // Close the path
    `Z`,
  ].join(" ");

  // --- Create the dot ---
  const dotCenterX = circleCenterX;

  const VIEWBOX_WIDTH = 2 * circleRadius;

  // --- Attachment Points Calculation ---
  // Eyes inside the circular part
  const eyeY = circleCenterY - innerRadius * 0.3;
  const eyeXOffset = innerRadius * 0.4;

  const features = placeFaceFeatures(innerCircle, outerCircle);

  // Mouth at center of circle
  const mouth: Point = {
    x: circleCenterX,
    y: circleCenterY,
  };

  const attachments: AttachmentList = {
    leftEye: features.left,
    rightEye: features.right,
    mouth: { x: features.mouth.x + 3, y: features.mouth.y },
    hat: {
      x: circleCenterX,
      y: 0,
    },
    leftArm: {
      x: circleCenterX - circleRadius,
      y: circleCenterY,
    },
    rightArm: {
      x: circleCenterX + circleRadius,
      y: circleCenterY,
    },
    leftLeg: {
      x: dotCenterX,
      y: y_baseline,
    },
    rightLeg: {
      x: dotCenterX,
      y: y_baseline,
    },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-question",
    parts: [
      { d: pathData, strokeLinejoin: "round", fillRule: "nonzero" },
      { d: circlePath(dotCenterX, dotCenterY, dotRadius) },
    ],
    attachments: attachments,
  };
}

export default renderQuestion;
