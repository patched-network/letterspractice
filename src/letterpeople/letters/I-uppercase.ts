// letterpeople/src/letters/I-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 60; // 'I' is narrow

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'I'.
 * This function does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderI_uppercase(
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
  const xMid = midX - T / 2; // Left edge of vertical stem
  const xMid2 = midX + T / 2; // Right edge of vertical stem

  const y0 = 0; // Top edge
  const y1 = T; // Bottom of top bar
  const y2 = H - T; // Top of bottom bar
  const y3 = H; // Bottom edge

  // Path for the 'I' shape, moving clockwise around the perimeter
  const d = [
    `M ${x0} ${y0}`, // Start at top-left outer corner (0,0)
    `H ${x1}`, // To top-right outer corner (W,0)
    `V ${y1}`, // To bottom-right of top bar (W,T)
    `H ${xMid2}`, // To top-right of vertical stem (midX+T/2,T)
    `V ${y2}`, // To bottom-right of vertical stem (midX+T/2,H-T)
    `H ${x1}`, // To top-right of bottom bar (W,H-T)
    `V ${y3}`, // To bottom-right outer corner (W,H)
    `H ${x0}`, // To bottom-left outer corner (0,H)
    `V ${y2}`, // To bottom-left of bottom bar (0,H-T)
    `H ${xMid}`, // To bottom-left of vertical stem (midX-T/2,H-T)
    `V ${y1}`, // To top-left of vertical stem (midX-T/2,T)
    `H ${x0}`, // To bottom-left of top bar (0,T)
    `Z`, // Close path (back to 0,0)
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  const attachments: AttachmentList = {
    leftEye: { x: midX - T * 0.3, y: T * 0.6 },
    rightEye: { x: midX + T * 0.3, y: T * 0.6 },
    mouth: { x: midX, y: T * 1.5 },
    hat: { x: midX, y: 0 },
    leftArm: { x: xMid, y: H * 0.55 },
    rightArm: { x: xMid2, y: H * 0.55 },
    leftLeg: { x: midX - T * 0.3, y: H },
    rightLeg: { x: midX + T * 0.3, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-I-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderI_uppercase;
