// letterpeople/src/letters/M-uppercase.ts
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
const VIEWBOX_WIDTH = 90; // 'M' is typically wider than 'H' or 'L'
const DEFAULT_VALLEY_Y_FACTOR = 0.7; // Determines how far down the 'V' tip goes (0.0 to 1.0)
const DEFAULT_ARMPIT_Y_FACTOR = 1.5; // Multiplier for limbThickness to set y-coord of V's "armpit"

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'M'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderM_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  const valleyYFactor = DEFAULT_VALLEY_Y_FACTOR;
  const armpitYFactor = DEFAULT_ARMPIT_Y_FACTOR;

  // --- Path Definition ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Key coordinates for the 'M' shape
  const x0 = 0; // Outer left edge
  const x1 = limbT; // Inner left edge / Start of left diagonal
  const x_center = W / 2; // Centerline
  const x2 = W - limbT; // Inner right edge / Start of right diagonal
  const x3 = W; // Outer right edge

  const y0 = 0; // Top edge
  const y_armpit = limbT * armpitYFactor; // Y-coordinate where the V's "underside" connects to vertical stems
  const y_valley_tip_outer = H * valleyYFactor; // Y-coordinate of the outer tip of the V
  // This makes the V's central part effectively `limbT` thick in the Y-direction
  const y_valley_tip_inner = y_valley_tip_outer - limbT * armpitYFactor;
  const y_bottom = H; // Bottom edge

  // Path for the 'M' shape, clockwise outline
  const d = [
    `M ${x0} ${y0}`, // Top-left outer
    `L ${x1} ${y0}`, // Top-left inner (start of V's top edge)
    `L ${x_center} ${y_valley_tip_inner}`, // Inner V-tip (highest point of V-opening)
    `L ${x2} ${y0}`, // Top-right inner (end of V's top edge)
    `L ${x3} ${y0}`, // Top-right outer
    `L ${x3} ${y_bottom}`, // Bottom-right outer
    `L ${x2} ${y_bottom}`, // Bottom-right inner (of vertical leg)
    `L ${x2} ${y_armpit}`, // Connection point for V's "underside" on right leg
    `L ${x_center} ${y_valley_tip_outer}`, // Outer V-tip (lowest point of V)
    `L ${x1} ${y_armpit}`, // Connection point for V's "underside" on left leg
    `L ${x1} ${y_bottom}`, // Bottom-left inner (of vertical leg)
    `L ${x0} ${y_bottom}`, // Bottom-left outer
    `Z`, // Close path
  ].join(" ");

  // --- Attachment Points Calculation ---
  // V-opening space: top edge at y_armpit, bottom tip at y_valley_tip_inner
  const vOpeningTopY = y_armpit;
  const vOpeningBottomTipY = y_valley_tip_inner;
  const vOpeningHeight = vOpeningBottomTipY - vOpeningTopY;

  const attachments: AttachmentList = {
    // Eyes within the V-opening
    leftEye: {
      x: limbT * 0.7,
      y: limbT * 0.7,
    },
    rightEye: {
      x: VIEWBOX_WIDTH - limbT * 0.7,
      y: limbT * 0.7,
    },
    // Mouth within the V-opening, below the eyes
    mouth: {
      x: x_center,
      y: (y_valley_tip_inner + y_valley_tip_outer) / 2 - 5,
    },
    // Standard attachment points
    hat: { x: W / 2, y: 0 }, // Centered on top
    leftArm: { x: 0, y: H * 0.5 }, // Mid-height on the outer edge
    rightArm: { x: W, y: H * 0.5 }, // Mid-height on the outer edge
    leftLeg: { x: limbT / 2, y: H }, // Centered on bottom of left vertical stem
    rightLeg: { x: W - limbT / 2, y: H }, // Centered on bottom of right vertical stem
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-M-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderM_uppercase;
