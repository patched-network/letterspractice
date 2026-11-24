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
import { circlePath } from "../util/drawing";
import { midpoint, Point, pointAtAngle } from "../util/geometry";

// Period-specific constants
const VIEWBOX_WIDTH = 40; // Narrow width for period

/**
 * @internal
 * Renders a period (.) character.
 *
 * @param options - Configuration options for the period's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderPeriod(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate period position ---
  // Period sits near the baseline at the bottom
  const radius = limbT / 2;
  const cx = limbT / 2;
  const cy = VIEWBOX_HEIGHT - radius; // Position at bottom with radius offset

  // --- Create circle element ---

  // --- Attachment Points Calculation ---
  const centerPoint = { x: cx, y: cy };
  const leftEye: Point = {
    x: cx - limbT / 4,
    y: cy - 0.4 * limbT,
  };
  const rightEye: Point = {
    x: cx + limbT / 4,
    y: cy - 0.4 * limbT,
  };

  const attachments: AttachmentList = {
    leftEye,
    rightEye,
    mouth: centerPoint,
    hat: {
      x: cx,
      y: cy - limbT / 2,
    },
    leftArm: {
      x: 0,
      y: cy,
    },
    rightArm: {
      x: limbT,
      y: cy,
    },
    leftLeg: {
      x: cx,
      y: VIEWBOX_HEIGHT,
    },
    rightLeg: {
      x: cx,
      y: VIEWBOX_HEIGHT,
    },
  };

  return {
    viewBox: [0, 0, limbT, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-period",
    parts: [
      { d: circlePath(cx, cy, radius) },
    ],
    attachments: attachments,
  };
}

export default renderPeriod;
