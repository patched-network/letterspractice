// letterpeople/src/letters/T-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";

import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80; // 'T' has a wide crossbar

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'T'.
 * This function does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderT_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias for limbThickness
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const midX = W / 2; // Horizontal midpoint

  // Define key X and Y coordinates for clarity
  const x0 = 0; // Outer left edge
  const x1 = W; // Outer right edge
  const xMid1 = midX - T / 2; // Left edge of vertical stem
  const xMid2 = midX + T / 2; // Right edge of vertical stem

  const y0 = 0; // Top edge
  const y1 = T; // Bottom of top bar
  const y2 = H; // Bottom edge

  // Path for the 'T' shape, moving clockwise around the perimeter
  const d = [
    `M ${x0} ${y0}`, // Start at top-left outer corner (0,0)
    `H ${x1}`, // To top-right outer corner (W,0)
    `V ${y1}`, // To bottom-right of top bar (W,T)
    `H ${xMid2}`, // To top-right of vertical stem (midX+T/2,T)
    `V ${y2}`, // To bottom-right of vertical stem (midX+T/2,H)
    `H ${xMid1}`, // To bottom-left of vertical stem (midX-T/2,H)
    `V ${y1}`, // To bottom-left of top crossbar (midX-T/2,T)
    `H ${x0}`, // To bottom-left of top bar (0,T)
    `Z`, // Close path (back to 0,0)
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  const attachments: AttachmentList = {
    // Eyes positioned on the top crossbar
    leftEye: { x: midX - (2 * T) / 3, y: T * 0.55 },
    rightEye: { x: midX + (2 * T) / 3, y: T * 0.55 },
    // Mouth on the upper part of the stem
    mouth: { x: midX, y: T * 1.8 },
    // Hat centered on top
    hat: { x: midX, y: 0 },
    // Arms on the sides of the vertical stem
    leftArm: { x: xMid1, y: H * 0.4 },
    rightArm: { x: xMid2, y: H * 0.4 },
    // Legs at the bottom of the stem
    leftLeg: { x: midX - T * 0.3, y: H },
    rightLeg: { x: midX + T * 0.3, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-T-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderT_uppercase;
