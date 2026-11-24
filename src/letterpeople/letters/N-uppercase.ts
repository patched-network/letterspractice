// letterpeople/src/letters/N-uppercase.ts
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
const VIEWBOX_WIDTH = 80; // 'N' is typically not as wide as 'M'

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'N'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderN_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  const jointWidth = limbT * 1.75;

  // The letter N is composed of two vertical stems and one diagonal
  // We'll define the path by moving clockwise around the outline
  const path = [
    // Start at top-left corner
    `M 0 0`,
    // Top edge of left stem
    `H ${limbT}`,
    // Diagonal from top-right of left stem to bottom-left of right stem
    `L ${W - limbT} ${H - jointWidth}`,
    // Up the right edge of right stem
    `V 0`,
    // Along the top edge of right stem
    `H ${W}`,
    // Down the right edge
    `V ${H}`,
    // Along the bottom edge
    `H ${W - limbT}`,
    // Diagonal from bottom-left of right stem to top-right of left stem (in opposite direction)
    `L ${limbT} ${jointWidth}`,
    // Down the inner edge of left stem
    `V ${H}`,
    // Along the bottom edge of left stem
    "H 0",
    // Close the path
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  // Find a good spot for attachments along the diagonal
  const diagMidX = W / 2;
  const diagMidY = H / 2;

  const attachments: AttachmentList = {
    // Eyes along the diagonal
    leftEye: { x: limbT * 0.55, y: limbT * 0.7 },
    rightEye: { x: W - limbT * 0.5, y: limbT * 0.7 },
    // Mouth centered below the eyes
    mouth: { x: W - limbT * 0.7, y: H - jointWidth / 2 },

    // Standard attachment points
    hat: { x: W / 2, y: 0 }, // Centered on top
    leftArm: { x: 0, y: H * 0.5 }, // Mid-height on left edge
    rightArm: { x: W, y: H * 0.5 }, // Mid-height on right edge
    leftLeg: { x: limbT / 2, y: H }, // Bottom of left stem
    rightLeg: { x: W - limbT / 2, y: H }, // Bottom of right stem
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-N-uppercase",
    parts: [{ d: path, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderN_uppercase;
