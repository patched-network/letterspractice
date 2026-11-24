// letterpeople/src/letters/Y-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { lineTo } from "../util/drawing";
import { Point, pointOnSegment } from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80;
const DEFAULT_FORK_Y_POSITION = 0.5; // Position where the fork splits (0.0=top, 1.0=bottom)

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'Y'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderY_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Calculate the fork position
  const forkY = H * DEFAULT_FORK_Y_POSITION;
  const centerX = W / 2;

  // Key points for the Y shape
  // Top points
  const topLeft: Point = { x: 0, y: 0 }; // Top-left
  const topLeftInner: Point = { x: limbT, y: 0 }; // Top-left inner
  const forkPoint: Point = { x: centerX, y: forkY - limbT / 2 }; // Top of center stem
  const topRightInner: Point = { x: W - limbT, y: 0 }; // Top-right inner
  const topRight: Point = { x: W, y: 0 }; // Top-right

  // Bottom points
  const p6: Point = { x: centerX + limbT / 2, y: forkY }; // Bottom of right diagonal
  const p7: Point = { x: centerX + limbT / 2, y: forkY }; // Right side of center stem, top
  const p8: Point = { x: centerX + limbT / 2, y: H }; // Right side of center stem, bottom
  const p9: Point = { x: centerX - limbT / 2, y: H }; // Left side of center stem, bottom
  const p10: Point = { x: centerX - limbT / 2, y: forkY }; // Left side of center stem, top
  const p11: Point = { x: centerX - limbT / 2, y: forkY }; // Bottom of left diagonal

  // Path for the 'Y' shape
  const d = [
    `M ${topLeft.x} ${topLeft.y}`, // Start at top-left
    lineTo(topLeftInner),
    lineTo(forkPoint),
    lineTo(topRightInner),
    lineTo(topRight),

    `L ${p6.x} ${p6.y}`, // To bottom of right diagonal
    `L ${p7.x} ${p7.y}`, // To right side of center stem, top
    `L ${p8.x} ${p8.y}`, // To right side of center stem, bottom
    `L ${p9.x} ${p9.y}`, // To left side of center stem, bottom
    `L ${p10.x} ${p10.y}`, // To left side of center stem, top
    `L ${p11.x} ${p11.y}`, // To bottom of left diagonal
    `Z`, // Close path
  ].join(" ");

  // --- Attachment Points Calculation ---

  const attachments: AttachmentList = {
    // Eyes on the upper diagonals
    leftEye: { x: limbT * 0.85, y: limbT * 0.6 },
    rightEye: { x: W - limbT * 0.85, y: limbT * 0.6 },

    // Mouth on the upper part of the center stem
    mouth: { x: centerX, y: forkY + limbT * 0.7 },

    // Standard attachment points
    hat: { x: W / 2, y: 0 }, // Centered on top
    leftArm: pointOnSegment({ p1: topLeft, p2: p10 }, 0.8),
    rightArm: pointOnSegment({ p1: topRight, p2: p6 }, 0.8),
    leftLeg: { x: centerX - limbT * 0.4, y: H }, // Left side of bottom stem,
    rightLeg: { x: centerX + limbT * 0.4, y: H }, // Right side of bottom stem
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-Y-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderY_uppercase;
