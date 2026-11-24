// src/letters/i-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import type { Point } from "../util/geometry";
import {
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "./CONSTS";
import { circlePath, rectPath } from "../util/drawing";

// Define constants for our coordinate space
// const VIEWBOX_WIDTH = 40; // Narrower than most letters
const DEFAULT_STEM_THICKNESS = DEFAULT_LIMB_THICKNESS; // Thickness of vertical stem
const DEFAULT_DOT_DIAMETER = DEFAULT_LIMB_THICKNESS * 1.6; // Oversized dot to fit facial features
const LC_LINE = VIEWBOX_HEIGHT - EFFECTIVE_LOWERCASE_HEIGHT; // y=35: top of lowercase body

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'i'.
 * The dot is oversized to accommodate facial features (eyes, mouth).
 * This function does NOT add attachments; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderI_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const stemThickness = options?.lineWidth ?? DEFAULT_STEM_THICKNESS;
  const dotDiameter = options?.lineWidth
    ? options.lineWidth * 1.6
    : DEFAULT_DOT_DIAMETER;

  // --- Group for the letter parts ---

  // --- Calculate positions ---
  const W = dotDiameter;
  const H = VIEWBOX_HEIGHT;

  // Center the stem horizontally
  const stemCenterX = W / 2;
  const stemLeft = stemCenterX - stemThickness / 2;
  const stemRight = stemCenterX + stemThickness / 2;

  // Dot sits on the LC line: bottom edge at y=LC_LINE, center above it
  const dotRadius = dotDiameter / 2;
  const dotCenterX = stemCenterX;
  const dotCenterY = LC_LINE - dotRadius;

  // Stem starts below LC line so dot overlaps the top of the stem
  const stemTop = LC_LINE + dotRadius;

  // --- Create the dot (circle) ---

  // --- Create the stem (rectangle) ---

  // Stem first, dot on top — dot's fill covers the stem's top-edge stroke
  // group.setAttribute("class", "letter-path");

  // --- Attachment Points Calculation ---
  // For the 'i', we'll put facial features on the dot
  const attachments: AttachmentList = {
    // Eyes in the upper part of the dot
    leftEye: {
      x: dotCenterX - dotRadius * 0.3,
      y: dotCenterY - dotRadius * 0.4,
    },
    rightEye: {
      x: dotCenterX + dotRadius * 0.3,
      y: dotCenterY - dotRadius * 0.4,
    },

    // Mouth in the lower part of the dot
    mouth: { x: dotCenterX, y: dotCenterY + dotRadius * 0.3 },

    // Hat sits on top of the dot
    hat: { x: dotCenterX, y: dotCenterY - dotRadius },

    // Arms at the middle of the stem
    leftArm: {
      x: stemLeft,
      y: stemTop + (H - stemTop) * 0.4,
    },
    rightArm: {
      x: stemRight,
      y: stemTop + (H - stemTop) * 0.4,
    },

    // Legs at the bottom of the stem
    leftLeg: { x: stemCenterX - stemThickness * 0.3, y: H },
    rightLeg: { x: stemCenterX + stemThickness * 0.3, y: H },
  };

  // Return the result conforming to LetterGeometry
  return {
    viewBox: [0, 0, dotDiameter, VIEWBOX_HEIGHT],
    className: "letter-base letter-i-lowercase",
    parts: [
      { d: rectPath(stemLeft, stemTop, stemThickness, H - stemTop), strokeLinejoin: "round" },
      { d: circlePath(dotCenterX, dotCenterY, dotRadius) },
    ],
    attachments: attachments,
  };
}

// Export the function
export default renderI_lowercase;
