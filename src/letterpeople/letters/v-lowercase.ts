// letterpeople/src/letters/v-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  midpoint,
  getLineIntersection,
  getParallelLineSegment,
  Line,
  Point,
  pointOnSegment,
} from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space for lowercase 'v'
const VIEWBOX_WIDTH = 70; // Lowercase 'v' is typically narrower

// v-specific geometry constants (proportional to character size)
const DEFAULT_HORIZONTAL_SPREAD_FACTOR = 0.9; // v is 90% of its own width at the top

// --- Geometry Helper Functions (copied from V-uppercase.ts) ---
// Using geometry utilities from "../util/geometry"

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 'v'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderV_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate lowercase 'v' body dimensions and position ---
  const char_width = VIEWBOX_WIDTH;
  const char_height = EFFECTIVE_LOWERCASE_HEIGHT;

  const y_baseline = VIEWBOX_HEIGHT;
  const y_top_char = y_baseline - char_height;

  // --- Define Key Coordinates for lowercase 'v' ---
  const hCenter_char = char_width / 2;
  const horizontalSpread_char = char_width * DEFAULT_HORIZONTAL_SPREAD_FACTOR;

  // Outer vertices of the 'v' body
  const OTL_char: Point = {
    x: hCenter_char - horizontalSpread_char / 2,
    y: y_top_char,
  };
  const OTR_char: Point = {
    x: hCenter_char + horizontalSpread_char / 2,
    y: y_top_char,
  };
  const OBA_char: Point = { x: hCenter_char, y: y_baseline }; // Outer Bottom Apex on baseline

  // Define lines for geometry calculations
  const lineOuterLeftLeg: Line = { p1: OTL_char, p2: OBA_char };
  const lineOuterRightLeg: Line = { p1: OTR_char, p2: OBA_char };

  // Inner leg lines
  const lineInnerLeftLeg = getParallelLineSegment(
    OTL_char,
    OBA_char,
    limbT,
    "right",
  );
  const lineInnerRightLeg = getParallelLineSegment(
    OTR_char,
    OBA_char,
    limbT,
    "left",
  );

  // Top inner horizontal line for the character's body
  const lineTopInnerHorizontal_char: Line = {
    p1: { x: 0, y: y_top_char }, // Extends across character width at y_top_char
    p2: { x: char_width, y: y_top_char },
  };

  // Calculate intersection points for the character body
  const ITL_char = getLineIntersection(
    lineInnerLeftLeg,
    lineTopInnerHorizontal_char,
  );
  const ITR_char = getLineIntersection(
    lineInnerRightLeg,
    lineTopInnerHorizontal_char,
  );
  const IBA_char = getLineIntersection(lineInnerLeftLeg, lineInnerRightLeg);

  if (!ITL_char || !ITR_char || !IBA_char) {
    const msg =
      "Letter 'v': Failed to calculate some inner intersection points.";
    console.error(msg, { ITL_char, ITR_char, IBA_char });
    throw new Error(msg);
  }

  if (IBA_char.y < ITL_char.y || IBA_char.y < ITR_char.y) {
    console.warn(
      "Letter 'v': Inner bottom apex is above inner top points. LimbThickness might be too large.",
    );
  }

  // --- Construct Path Data ---
  // The modification to IBA_char.y is to create a slightly blunted inner apex,
  // proportional to the character height, similar to V-uppercase.
  const innerApexYModified = IBA_char.y + char_height / 8;

  const pathData = [
    `M ${OTL_char.x.toFixed(3)} ${OTL_char.y.toFixed(3)}`,
    `L ${ITL_char.x.toFixed(3)} ${ITL_char.y.toFixed(3)}`,
    `L ${IBA_char.x.toFixed(3)} ${innerApexYModified.toFixed(3)}`, // Modified Inner Bottom Apex
    `L ${ITR_char.x.toFixed(3)} ${ITR_char.y.toFixed(3)}`,
    `L ${OTR_char.x.toFixed(3)} ${OTR_char.y.toFixed(3)}`,
    `L ${OBA_char.x.toFixed(3)} ${OBA_char.y.toFixed(3)}`,
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const eyeY = y_top_char + limbT / 2;
  const midUpperWidth_char = (ITR_char.x + ITL_char.x) / 2;

  const attachments: AttachmentList = {
    leftEye: {
      x: ITL_char.x - limbT / 4,
      y: eyeY,
    },
    rightEye: {
      x: ITR_char.x + limbT / 4,
      y: eyeY,
    },
    mouth: midpoint(IBA_char, OBA_char),

    hat: { x: hCenter_char, y: y_top_char },

    leftArm: pointOnSegment(lineOuterLeftLeg, 0.4),
    rightArm: pointOnSegment(lineOuterRightLeg, 0.4),

    leftLeg: pointOnSegment(lineOuterLeftLeg, 0.8),
    rightLeg: pointOnSegment(lineOuterRightLeg, 0.8),
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-v-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderV_lowercase;
