// letterpeople/src/letters/H-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80; // 'H' is generally wider

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'H'.
 * This function does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderH_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias for limbThickness
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const H_half = H / 2; // Midpoint vertically
  const T_half = T / 2; // Half of limb thickness

  // Define key X and Y coordinates for clarity
  const x0 = 0; // Outer left edge
  const x1 = T; // Inner left edge / Left edge of crossbar
  const x2 = W - T; // Inner right edge / Right edge of crossbar
  const x3 = W; // Outer right edge

  const y0 = 0; // Top edge
  const y1 = H_half - T_half; // Top edge of crossbar
  const y2 = H_half + T_half; // Bottom edge of crossbar
  const y3 = H; // Bottom edge

  // Path for the 'H' shape, moving clockwise around the perimeter
  const d = [
    `M ${x0} ${y0}`, // Start at P1: Top-left outer corner (0,0)
    `H ${x1}`, // To P2: Top-left inner corner (T,0)
    `V ${y1}`, // To P3: Top-left of crossbar connection (T, H_half - T_half)
    `H ${x2}`, // To P4: Top-right of crossbar connection (W-T, H_half - T_half)
    `V ${y0}`, // To P5: Top-right inner corner (W-T, 0)
    `H ${x3}`, // To P6: Top-right outer corner (W,0)
    `V ${y3}`, // To P7: Bottom-right outer corner (W,H)
    `H ${x2}`, // To P8: Bottom-right inner corner (W-T, H)
    `V ${y2}`, // To P9: Bottom-right of crossbar connection (W-T, H_half + T_half)
    `H ${x1}`, // To P10: Bottom-left of crossbar connection (T, H_half + T_half)
    `V ${y3}`, // To P11: Bottom-left inner corner (T,H)
    `H ${x0}`, // To P12: Bottom-left outer corner (0,H)
    `Z`, // Close path (back to P1 at 0,0)
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  // (These remain unchanged as they seemed correct)
  const attachments: AttachmentList = {
    leftEye: { x: T / 2, y: T * 0.8 },
    rightEye: { x: W - T / 2, y: T * 0.8 },
    mouth: { x: W / 2, y: H_half },
    hat: { x: W / 2, y: 0 },
    leftArm: { x: 0, y: H * 0.55 },
    rightArm: { x: W, y: H * 0.55 },
    leftLeg: { x: T / 2, y: H },
    rightLeg: { x: W - T / 2, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-H-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderH_uppercase;
