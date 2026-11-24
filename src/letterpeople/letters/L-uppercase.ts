// src/letters/L-uppercase.ts
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
const VIEWBOX_WIDTH = 65;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'L'.
 * This function does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderL_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Path Definition (Filled Shape Outline) ---
  const T = limbThickness; // Alias
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  const d = [
    `M 0 0`,
    `H ${T}`,
    `V ${H - T}`,
    `H ${W}`,
    `V ${H}`,
    `H 0`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  // Ensure the keys match the expected structure if defined strictly in LetterInstance later
  const attachments: AttachmentList = {
    // Eyes and mouth on the upper part of the vertical stem
    leftEye: { x: T * 0.3, y: T * 0.8 },
    rightEye: { x: T * 0.7, y: T * 0.8 },
    mouth: { x: T / 2, y: T * 1.3 },

    // Hat sits centered on top
    hat: { x: T / 2, y: 0 }, // Center on the outline thickness

    // Arms roughly mid-height
    leftArm: { x: 0, y: H * 0.6 }, // Center on left outline
    rightArm: { x: T, y: H * 0.6 }, // Center on right edge of vertical stem outline

    // Legs at the bottom centers of the stems
    leftLeg: { x: T / 2, y: H }, // Center on bottom outline
    rightLeg: { x: T + (W - T) / 2, y: H }, // Center on bottom outline
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-L-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

// Export the function using its descriptive name
export default renderL_uppercase;
