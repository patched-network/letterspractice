// letterpeople/src/letters/x-lowercase.ts
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

// Define constants for our coordinate space for lowercase 'x'
const VIEWBOX_WIDTH = 70; // Lowercase 'x' is typically narrower

// Factor for the "opening" at the center of the X, proportional to limb thickness
const CENTER_OFFSET_FACTOR = 5 / 8;

// Factor for positioning within the viewBox (consistent with other lowercase letters)
// const O_BOTTOM_PADDING_FACTOR = 0.05;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'x'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderX_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate lowercase 'x' body dimensions and position ---
  const char_width = VIEWBOX_WIDTH; // Character fills its own viewBox width
  const char_height = EFFECTIVE_LOWERCASE_HEIGHT;

  // Baseline and top position for the character body
  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - char_height;

  // --- Path Definition ---
  const T = limbT;
  const center_offset_scaled = CENTER_OFFSET_FACTOR * T;

  // Center of the character body
  const cx_char = char_width / 2;
  const cy_char = y_top_char + char_height / 2;

  // Key points for the X shape, scaled and positioned for lowercase
  // Top-left arm
  const p1 = { x: 0, y: y_top_char };
  const p2 = { x: T, y: y_top_char };
  // Center-top point of the crossing
  const p3 = { x: cx_char, y: cy_char - center_offset_scaled };
  // Top-right arm
  const p4 = { x: char_width - T, y: y_top_char };
  const p5 = { x: char_width, y: y_top_char };
  // Center-right point of the crossing
  const p6 = { x: cx_char + center_offset_scaled, y: cy_char };
  // Bottom-right arm
  const p7 = { x: char_width, y: y_baseline };
  const p8 = { x: char_width - T, y: y_baseline };
  // Center-bottom point of the crossing
  const p9 = { x: cx_char, y: cy_char + center_offset_scaled };
  // Bottom-left arm
  const p10 = { x: T, y: y_baseline };
  const p11 = { x: 0, y: y_baseline };
  // Center-left point of the crossing
  const p12 = { x: cx_char - center_offset_scaled, y: cy_char };

  // Path for the 'x' shape
  const d = [
    `M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `L ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `L ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    `L ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}`,
    `L ${p5.x.toFixed(3)} ${p5.y.toFixed(3)}`,
    `L ${p6.x.toFixed(3)} ${p6.y.toFixed(3)}`,
    `L ${p7.x.toFixed(3)} ${p7.y.toFixed(3)}`,
    `L ${p8.x.toFixed(3)} ${p8.y.toFixed(3)}`,
    `L ${p9.x.toFixed(3)} ${p9.y.toFixed(3)}`,
    `L ${p10.x.toFixed(3)} ${p10.y.toFixed(3)}`,
    `L ${p11.x.toFixed(3)} ${p11.y.toFixed(3)}`,
    `L ${p12.x.toFixed(3)} ${p12.y.toFixed(3)}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  // Adjust for lowercase proportions and positioning
  const eyeY = y_top_char + T; // Slightly below the top edge of the limbs
  const eyeXOffset = T * 1.2; // Offset from the outer edges

  const attachments: AttachmentList = {
    // Eyes in the upper quadrants of the 'x' body
    leftEye: { x: eyeXOffset, y: eyeY },
    rightEye: { x: char_width - eyeXOffset, y: eyeY },

    // Mouth in the center of the 'x' body
    mouth: { x: cx_char, y: cy_char },

    // Standard attachment points
    hat: { x: limbT / 2, y: y_top_char },
    leftArm: pointOnSegment({ p1: p12, p2: p11 }, 0.25),
    rightArm: pointOnSegment({ p1: p6, p2: p7 }, 0.25),
    // Legs at the bottom corners of the character's effective bounding box
    leftLeg: { x: T * 0.75, y: y_baseline },
    rightLeg: { x: char_width - T * 0.75, y: y_baseline },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-x-lowercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderX_lowercase;
