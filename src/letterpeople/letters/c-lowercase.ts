// letterpeople/src/letters/c-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
} from "./CONSTS";

// Define constants for our coordinate space
const DEFAULT_OPENING_ANGLE_DEG = 40; // Same opening as uppercase C
const OUTER_CIRCLE_DIAMETER = 70;

// Factor for positioning within the viewBox (consistent with other lowercase letters)
const O_BOTTOM_PADDING_FACTOR = 0.05;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'c'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderC_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;
  const openingAngleDeg = DEFAULT_OPENING_ANGLE_DEG;

  // --- Calculate lowercase 'c' body dimensions and position ---
  const char_width = OUTER_CIRCLE_DIAMETER;
  const char_height = EFFECTIVE_LOWERCASE_HEIGHT;

  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - char_height;

  const cx_char = char_width / 2;
  const cy_char = y_top_char + char_height / 2;

  // --- Path Definition ---

  // Radii for the character's body. outerRy_char spans the full half-height so
  // the bottom centerline sits on the baseline (cy_char + outerRy_char =
  // y_baseline) and the centered stroke spills below by outlineWidth/2 — matching
  // the flat-bottomed letters, whose bottom edge sits at the baseline and spills.
  // Insetting it would float the c half a stroke above them. (Width is inset —
  // there's no baseline to meet sideways.)
  const outerRx_char = (char_width - outlineWidth) / 2;
  const outerRy_char = char_height / 2;

  const minInnerRadius = 1;
  let innerRx_char = outerRx_char - limbThickness;
  let innerRy_char = outerRy_char - limbThickness;

  innerRx_char = Math.max(minInnerRadius, innerRx_char);
  innerRy_char = Math.max(minInnerRadius, innerRy_char);

  // Calculate angles for the opening points
  const angleTopOpenRad = (-openingAngleDeg * Math.PI) / 180;
  const angleBottomOpenRad = (openingAngleDeg * Math.PI) / 180;

  // Calculate key points for the path based on character dimensions
  const pOuterTopOpen_char = {
    x: cx_char + outerRx_char * Math.cos(angleTopOpenRad),
    y: cy_char + outerRy_char * Math.sin(angleTopOpenRad),
  };
  const pOuterBottomOpen_char = {
    x: cx_char + outerRx_char * Math.cos(angleBottomOpenRad),
    y: cy_char + outerRy_char * Math.sin(angleBottomOpenRad),
  };
  const pInnerTopOpen_char = {
    x: cx_char + innerRx_char * Math.cos(angleTopOpenRad),
    y: cy_char + innerRy_char * Math.sin(angleTopOpenRad),
  };
  const pInnerBottomOpen_char = {
    x: cx_char + innerRx_char * Math.cos(angleBottomOpenRad),
    y: cy_char + innerRy_char * Math.sin(angleBottomOpenRad),
  };

  const d = [
    `M ${pOuterTopOpen_char.x} ${pOuterTopOpen_char.y}`,
    `A ${outerRx_char} ${outerRy_char} 0 1 0 ${pOuterBottomOpen_char.x} ${pOuterBottomOpen_char.y}`,
    `L ${pInnerBottomOpen_char.x} ${pInnerBottomOpen_char.y}`,
    `A ${innerRx_char} ${innerRy_char} 0 1 1 ${pInnerTopOpen_char.x} ${pInnerTopOpen_char.y}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const attachments: AttachmentList = {
    leftEye: {
      x: cx_char - innerRx_char * 0.6,
      y: cy_char - (innerRy_char + outerRy_char) / 2,
    },
    rightEye: {
      x: cx_char + innerRx_char * 0.5,
      y: cy_char - (innerRy_char + outerRy_char) / 2,
    },
    mouth: {
      x: cx_char - innerRx_char * 0.1,
      y: cy_char + (innerRy_char + outerRy_char) / 2,
    },

    hat: { x: cx_char, y: y_top_char },

    leftArm: {
      x: cx_char - outerRx_char,
      y: cy_char,
    },
    rightArm: {
      x: (pOuterTopOpen_char.x + pInnerTopOpen_char.x) / 2,
      y: (pOuterTopOpen_char.y + pInnerTopOpen_char.y) / 2,
    },

    leftLeg: {
      x: cx_char - outerRx_char * 0.5,
      y: y_baseline,
    },
    rightLeg: {
      x: (pOuterBottomOpen_char.x + pInnerBottomOpen_char.x) / 2,
      y: (pOuterBottomOpen_char.y + pInnerBottomOpen_char.y) / 2,
    },
  };

  return {
    viewBox: [0, 0, pOuterTopOpen_char.x, VIEWBOX_HEIGHT],
    className: "letter-base letter-c-lowercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderC_lowercase;
