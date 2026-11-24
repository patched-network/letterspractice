// letterpeople/src/letters/t-lowercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Circle,
  Point,
  getVerticalLineCircleIntersections,
  midpoint,
  pointAtAngle,
} from "../util/geometry";
import {
  lowerCaseCircles,
  placeFaceFeatures,
} from "../util/circle-letter-utils";
import {
  EFFECTIVE_LOWERCASE_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 60;

/**
 * @internal
 * Renders the base shape and calculates attachment points for the lowercase letter 't'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderT_lowercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const stemWidth = limbT;

  // --- Calculate Dimensions and Positions ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  // Vertical stem position (left side)
  const stemLeftEdgeX = (W - stemWidth) / 2;
  const stemRightEdgeX = stemLeftEdgeX + stemWidth;

  const stemBottomY = H;
  const crossTopY = H - EFFECTIVE_LOWERCASE_HEIGHT;
  const crossBottomY = crossTopY + limbT;

  // --- Path Definition ---
  // Start at the top left of the stem, then move clockwise
  const pathData = [
    `M ${stemLeftEdgeX} ${0}`,
    `L ${stemRightEdgeX} ${0}`,
    `L ${stemRightEdgeX} ${crossTopY}`,
    `L ${stemRightEdgeX + limbT * 0.65} ${crossTopY}`,
    `L ${stemRightEdgeX + limbT * 0.65} ${crossBottomY}`,
    `L ${stemRightEdgeX} ${crossBottomY}`,
    `L ${stemRightEdgeX} ${stemBottomY}`,
    `L ${stemLeftEdgeX} ${stemBottomY}`,
    `L ${stemLeftEdgeX} ${crossBottomY}`,
    `L ${stemLeftEdgeX - limbT * 0.65} ${crossBottomY}`,
    `L ${stemLeftEdgeX - limbT * 0.65} ${crossTopY}`,
    `L ${stemLeftEdgeX} ${crossTopY}`,
    `L ${stemLeftEdgeX} ${0}`,

    `Z`, // Close path
  ].join(" ");

  // ... rest of your function

  // --- Attachment Points Calculation ---
  // For r, we'll place facial features on the hook arc

  const attachments: AttachmentList = {
    // Eyes positioned at either end of the arc
    leftEye: { x: (W - limbT) / 2, y: crossTopY + limbT / 2 },
    rightEye: { x: (W + limbT) / 2, y: crossTopY + limbT / 2 },

    // Mouth positioned at the curve of the arc
    mouth: {
      x: W / 2,
      y: crossBottomY + limbT / 3,
    },

    // Hat sits on top of the stem
    hat: { x: W / 2, y: 0 },

    // Arms
    leftArm: { x: stemLeftEdgeX, y: crossBottomY + 0.666 * limbT }, // On the stem
    rightArm: { x: stemRightEdgeX, y: crossBottomY + 0.666 * limbT },

    // Legs at the bottom of the stem
    leftLeg: { x: stemLeftEdgeX + stemWidth * 0.25, y: H },
    rightLeg: { x: stemLeftEdgeX + stemWidth * 0.75, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-t-lowercase",
    parts: [{ d: pathData, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderT_lowercase;
