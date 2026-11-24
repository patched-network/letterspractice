// letterpeople/src/letters/P-uppercase.ts
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
const VIEWBOX_WIDTH = 70;
const DEFAULT_LOOP_WIDTH = 45; // Width of the loop part

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'P'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderP_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const loopWidth = 3 * limbT; //  DEFAULT_LOOP_WIDTH;

  // --- Path Definition ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Loop dimensions
  const loopTop = 0;
  const loopHeight = 3 * limbT; // Loop takes up half the height
  const stemWidth = limbT;

  // Define key points
  const x0 = 0; // Left edge of stem
  const x1 = stemWidth; // Right edge of stem
  const x2 = loopWidth; // Right edge of loop
  const y0 = 0; // Top edge
  const y1 = loopHeight; // Bottom of loop
  const y2 = H; // Bottom edge

  // Path for the 'P' shape - clockwise from top left
  const path = [
    // Start at top-left corner
    `M ${x0} ${y0}`,

    // Top horizontal of stem to start of loop
    `H ${x1}`,

    // Outer curve of the loop (right side)
    `C ${x1 + (x2 - x1) * 0.5} ${y0}, ${x2} ${y0 + loopHeight * 0.3}, ${x2} ${y0 + loopHeight * 0.5}`,

    // Lower curve of the loop
    `C ${x2} ${y0 + loopHeight * 0.7}, ${x1 + (x2 - x1) * 0.5} ${y1}, ${x1} ${y1}`,

    // Back to stem and down
    `V ${y2}`,

    // Left side of stem back up
    `H ${x0}`,

    // Close the path
    `Z`,

    // Inner hole path (counter-clockwise)
    `M ${limbT} ${limbT}`, // upper-left starting point
    `V ${2 * limbT}`, // down the stem
    `C ${2 * limbT} ${2 * limbT} ${2 * limbT} ${1.75 * limbT} ${x2 - limbT} ${y0 + loopHeight * 0.5}`,
    `C ${2 * limbT} ${1.25 * limbT} ${2 * limbT} ${limbT} ${limbT} ${limbT}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const loopCenterX = (x1 + x2) / 2;
  const loopCenterY = loopHeight / 2;

  const attachments: AttachmentList = {
    // Eyes in the loop part
    leftEye: { x: limbT * 0.5, y: limbT * 0.5 },
    rightEye: { x: limbT * 1.4, y: limbT * 0.5 },
    // Mouth in the loop, below the eyes
    mouth: { x: limbT, y: limbT * 2.5 },

    // Standard attachment points
    hat: { x: W / 4, y: 0 }, // Centered on top of the left half
    leftArm: { x: 0, y: H * 0.4 }, // On the stem
    rightArm: { x: x2, y: loopHeight / 2 }, // On the right side of the loop
    leftLeg: { x: stemWidth / 4, y: H }, // Bottom of stem
    rightLeg: { x: (3 * stemWidth) / 4, y: H }, // Also at bottom of stem since P only has one leg
  };

  return {
    viewBox: [0, 0, x2, VIEWBOX_HEIGHT],
    className: "letter-base letter-P-uppercase",
    parts: [{ d: path, strokeLinejoin: "round", strokeLinecap: "butt" }],
    attachments: attachments,
  };
}

export default renderP_uppercase;
