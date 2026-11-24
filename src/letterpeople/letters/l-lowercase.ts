// src/letters/l-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import type { Point } from "../util/geometry";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "./CONSTS";

// Define constants for our coordinate space
const TAIL_WIDTH = 15; // Width of the tail at the bottom

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'l'.
 * This function does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderL_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // Set viewBox immediately, other attributes (width, height, aspect ratio)
  // might be better set on the instance in createLetter or by the user via CSS.

  // Add a class for potential base styling

  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  // Create the lowercase 'l' with a distinctive tail at the bottom right
  const T = limbThickness; // Alias
  const W = T + TAIL_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const TW = TAIL_WIDTH; // Tail width

  // Path moves from top left, across, down, right for the tail, back up, and closes
  const d = [
    // Start at top left
    `M 0 0`,
    // Top edge right
    `H ${T}`,
    // Right side down to bottom of letter minus tail height
    `V ${H - T}`,
    // Right to form tail
    `H ${Math.min(W, (W + T) / 2 + TW)}`,
    // Down to complete bottom
    `V ${H}`,
    // Left across the whole bottom (under stem and tail)
    `L 0 ${H}`,
    // Back up to starting point
    // `V 0`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  // Calculate the center of the vertical stem
  const stemCenterX = limbThickness / 2;

  const attachments: AttachmentList = {
    // Eyes and mouth near the top of the vertical stem, centered
    leftEye: { x: stemCenterX - T * 0.2, y: T * 0.8 },
    rightEye: { x: stemCenterX + T * 0.2, y: T * 0.8 },
    mouth: { x: stemCenterX, y: T * 1.3 },

    // Hat sits centered on top
    hat: { x: stemCenterX, y: 0 },

    // Arms at mid-height, on the left and right edges of the stem
    leftArm: { x: 0, y: H * 0.4 },
    rightArm: { x: T, y: H * 0.4 },

    // Legs at the bottom
    leftLeg: { x: stemCenterX - T * 0.3, y: H }, // On bottom edge, left side
    rightLeg: { x: stemCenterX + TW * 0.7, y: H }, // On bottom edge, right side (in the tail)
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, W, VIEWBOX_HEIGHT],
    className: "letter-base letter-l-lowercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function
export default renderL_lowercase;
