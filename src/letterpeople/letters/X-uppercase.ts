// letterpeople/src/letters/X-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { pointOnSegment } from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'X'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderX_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const T = limbT;
  const halfTplusplus = (5 / 8) * limbT;

  // Key points for the X shape
  // Top left diagonal points
  const p1 = { x: 0, y: 0 }; // Top-left corner
  const p2 = { x: limbT, y: 0 }; // Inner point of top-left

  // center
  const p3 = { x: W / 2, y: H / 2 - halfTplusplus }; // middle top

  // upper right corner
  const p4 = { x: W - T, y: 0 }; // Top-right corner
  const p5 = { x: W, y: 0 }; // Bottom-right corner

  // center
  const p6 = { x: W / 2 + halfTplusplus, y: H / 2 }; // middle right

  // Bottom right corner
  const p7 = { x: W, y: H };
  const p8 = { x: W - T, y: H };

  // center
  const p9 = { x: W / 2, y: H / 2 + halfTplusplus }; // middle bottom

  // Bottom left diagonal points
  const p10 = { x: limbT, y: H }; // Inner bottom-left
  const p11 = { x: 0, y: H }; // Bottom-left corner

  // center
  const p12 = { x: W / 2 - halfTplusplus, y: H / 2 }; // middle right

  // Path for the 'X' shape, defined as two separate shapes that cross
  const path = [
    `M ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `L ${p4.x} ${p4.y}`,
    `L ${p5.x} ${p5.y}`,
    `L ${p6.x} ${p6.y}`,
    `L ${p7.x} ${p7.y}`,
    `L ${p8.x} ${p8.y}`,
    `L ${p9.x} ${p9.y}`,
    `L ${p10.x} ${p10.y}`,
    `L ${p11.x} ${p11.y}`,
    `L ${p12.x} ${p12.y}`,
    `Z`, // Close first diagonal
  ].join(" ");

  // --- Attachment Points Calculation ---
  const attachments: AttachmentList = {
    // Eyes in the upper halves of the X
    leftEye: { x: limbT, y: limbT },
    rightEye: { x: W - limbT, y: limbT },

    // Mouth in the center
    mouth: { x: W / 2, y: H / 2 },

    // Standard attachment points
    hat: { x: W / 2, y: 0 }, // Centered on top
    leftArm: pointOnSegment({ p1: p12, p2: p11 }, 0.25),
    rightArm: pointOnSegment({ p1: p6, p2: p7 }, 0.25),
    leftLeg: { x: limbT / 2, y: H }, // Bottom-left
    rightLeg: { x: W - limbT / 2, y: H }, // Bottom-right
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-X-uppercase",
    parts: [{ d: path, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderX_uppercase;
