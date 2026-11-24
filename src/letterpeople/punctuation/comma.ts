// letterpeople/src/punctuation/period.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "../letters/CONSTS";
import { Circle, Point } from "../util/geometry";
import { moveTo } from "../util/drawing";

// Period-specific constants
const VIEWBOX_WIDTH = 40; // Narrow width for period

/**
 * @internal
 * Renders a period (.) character.
 *
 * @param options - Configuration options for the period's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderComma(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate period position ---
  // Period sits near the baseline at the bottom
  const radius = limbT / 2;
  const cx = limbT / 2;
  const cy = VIEWBOX_HEIGHT - radius; // Position at bottom with radius offset

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
  const leftEye: Point = {
    x: cx - limbT / 4,
    y: cy - 0.4 * limbT,
  };
  const rightEye: Point = {
    x: cx + limbT / 4,
    y: cy - 0.4 * limbT,
  };

  const pathData = [
    moveTo(bottomOfCircle),
    `A ${radius} ${radius} 0 1 1 ${rightOfCircle.x} ${rightOfCircle.y}`,
    `A ${radius} ${2 * radius} 0 0 1 ${descendedPoint.x} ${descendedPoint.y}`,
    `A ${radius / 8} ${radius / 2} 0 0 0 ${bottomOfCircle.x} ${bottomOfCircle.y}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const centerPoint = { x: cx, y: cy };

  const attachments: AttachmentList = {
    leftEye,
    rightEye,
    mouth: centerPoint,
    hat: {
      x: cx,
      y: cy - limbT / 2,
    },
    leftArm: leftOfCircle,
    rightArm: rightOfCircle,
    leftLeg: descendedPoint,
    rightLeg: descendedPoint,
  };

  return {
    viewBox: [0, 0, limbT, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-period",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderComma;
