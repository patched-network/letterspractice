// letterpeople/src/punctuation/semicolon.ts
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
import { Point } from "../util/geometry";
import { moveTo } from "../util/drawing";

/**
 * @internal
 * Renders a semicolon (;) character.
 *
 * @param options - Configuration options for the semicolon's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderSemicolon(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Upper dot (period part) ---
  const radius = limbT / 2;
  const cx = limbT / 2;

  // Position semicolon centered vertically within lowercase letter height
  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - EFFECTIVE_LOWERCASE_HEIGHT;
  const char_height = EFFECTIVE_LOWERCASE_HEIGHT;

  const dotSpacing = limbT * 1.5;
  const totalHeight = 2 * radius + dotSpacing; // Total height (dot + comma)

  // Center the semicolon vertically in the lowercase region
  const centerY = y_top_char + char_height / 2;
  const commaBaseCy = centerY + totalHeight / 2 - radius;
  const upperDotCy = centerY - totalHeight / 2 + radius;

  // Create upper circle (the period part)

  // --- Lower comma part (reusing comma geometry exactly) ---
  const bottomOfCircle: Point = {
    x: limbT / 2,
    y: VIEWBOX_HEIGHT,
  };
  const rightOfCircle: Point = {
    x: limbT,
    y: VIEWBOX_HEIGHT - limbT / 2,
  };
  const leftOfCircle: Point = {
    x: 0,
    y: VIEWBOX_HEIGHT - limbT / 2,
  };

  const descendedPoint: Point = {
    x: limbT / 2,
    y: VIEWBOX_HEIGHT + limbT / 2,
  };

  const pathData = [
    moveTo(bottomOfCircle),
    `A ${radius} ${radius} 0 1 1 ${rightOfCircle.x} ${rightOfCircle.y}`,
    `A ${radius} ${2 * radius} 0 0 1 ${descendedPoint.x} ${descendedPoint.y}`,
    `A ${radius / 8} ${radius / 2} 0 0 0 ${bottomOfCircle.x} ${bottomOfCircle.y}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  // Eyes inside the upper dot
  const leftEye: Point = {
    x: cx - limbT * 0.225,
    y: upperDotCy,
  };
  const rightEye: Point = {
    x: cx + limbT * 0.225,
    y: upperDotCy,
  };

  // Limbs and mouth on the lower comma
  const lowerCenter: Point = { x: cx, y: VIEWBOX_HEIGHT - limbT / 2 };

  const attachments: AttachmentList = {
    leftEye,
    rightEye,
    mouth: lowerCenter,
    hat: {
      x: cx,
      y: upperDotCy - limbT / 2,
    },
    leftArm: leftOfCircle,
    rightArm: rightOfCircle,
    leftLeg: descendedPoint,
    rightLeg: descendedPoint,
  };

  return {
    viewBox: [0, 0, limbT, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-semicolon",
    parts: [
      { d: circlePath(cx, upperDotCy, radius) },
      { d: pathData, strokeLinejoin: "round", fillRule: "nonzero" },
    ],
    attachments: attachments,
  };
}

export default renderSemicolon;
