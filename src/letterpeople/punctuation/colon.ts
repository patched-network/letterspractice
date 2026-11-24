// letterpeople/src/punctuation/colon.ts
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

/**
 * @internal
 * Renders a colon (:) character.
 *
 * @param options - Configuration options for the colon's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderColon(options?: LetterOptions): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate positions ---
  const radius = limbT / 2;
  const cx = limbT / 2;

  // Position colon centered vertically within lowercase letter height
  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - EFFECTIVE_LOWERCASE_HEIGHT;
  const char_height = EFFECTIVE_LOWERCASE_HEIGHT;

  const dotSpacing = limbT * 1.5; // Space between dots
  const totalHeight = 2 * radius + dotSpacing; // Total height of both dots

  // Center the colon vertically in the lowercase region
  const centerY = y_top_char + char_height / 2;
  const lowerCy = centerY + totalHeight / 2 - radius;
  const upperCy = centerY - totalHeight / 2 + radius;

  // --- Create upper circle ---

  // --- Create lower circle ---

  // --- Attachment Points Calculation ---
  // Eyes inside the upper dot
  const leftEye: Point = {
    x: cx - limbT * 0.225,
    y: upperCy,
  };
  const rightEye: Point = {
    x: cx + limbT * 0.225,
    y: upperCy,
  };

  // Limbs and mouth on the lower dot
  const lowerCenter: Point = { x: cx, y: lowerCy };

  const attachments: AttachmentList = {
    leftEye,
    rightEye,
    mouth: lowerCenter,
    hat: {
      x: cx,
      y: upperCy - limbT / 2,
    },
    leftArm: {
      x: 0,
      y: lowerCy,
    },
    rightArm: {
      x: limbT,
      y: lowerCy,
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
    className: "letter-base punctuation-colon",
    parts: [
      { d: circlePath(cx, upperCy, radius) },
      { d: circlePath(cx, lowerCy, radius) },
    ],
    attachments: attachments,
  };
}

export default renderColon;
