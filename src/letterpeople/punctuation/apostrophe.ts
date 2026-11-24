// letterpeople/src/punctuation/apostrophe.ts
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
import { Point } from "../util/geometry";
import { moveTo } from "../util/drawing";

/**
 * @internal
 * Renders an apostrophe (') character.
 *
 * @param options - Configuration options for the apostrophe's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderApostrophe(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Position apostrophe above lowercase letter height ---
  const radius = limbT / 2;
  const cx = limbT / 2;

  // Position apostrophe to sit on top of lowercase line
  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - EFFECTIVE_LOWERCASE_HEIGHT;

  // The bottom of the comma shape sits at the lowercase top line
  const baseY = y_top_char;

  // Reuse comma geometry exactly, but positioned higher
  const bottomOfCircle: Point = {
    x: limbT / 2,
    y: baseY,
  };
  const rightOfCircle: Point = {
    x: limbT,
    y: baseY - limbT / 2,
  };
  const leftOfCircle: Point = {
    x: 0,
    y: baseY - limbT / 2,
  };

  const descendedPoint: Point = {
    x: limbT / 2,
    y: baseY + limbT / 2,
  };

  const pathData = [
    moveTo(bottomOfCircle),
    `A ${radius} ${radius} 0 1 1 ${rightOfCircle.x} ${rightOfCircle.y}`,
    `A ${radius} ${2 * radius} 0 0 1 ${descendedPoint.x} ${descendedPoint.y}`,
    `A ${radius / 8} ${radius / 2} 0 0 0 ${bottomOfCircle.x} ${bottomOfCircle.y}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const circleCenterY = baseY - radius;

  const leftEye: Point = {
    x: cx - limbT / 4,
    y: circleCenterY - 0.4 * limbT,
  };
  const rightEye: Point = {
    x: cx + limbT / 4,
    y: circleCenterY - 0.4 * limbT,
  };

  const centerPoint = { x: cx, y: circleCenterY };

  const attachments: AttachmentList = {
    leftEye,
    rightEye,
    mouth: centerPoint,
    hat: {
      x: cx,
      y: circleCenterY - limbT / 2,
    },
    leftArm: leftOfCircle,
    rightArm: rightOfCircle,
    leftLeg: descendedPoint,
    rightLeg: descendedPoint,
  };

  return {
    viewBox: [0, 0, limbT, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-apostrophe",
    parts: [{ d: pathData, strokeLinejoin: "round", fillRule: "nonzero" }],
    attachments: attachments,
  };
}

export default renderApostrophe;
