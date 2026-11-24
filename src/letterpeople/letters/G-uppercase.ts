// letterpeople/src/letters/G-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { Point } from "../util/geometry";

import {
  VIEWBOX_HEIGHT,
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_LIMB_THICKNESS,
} from "./CONSTS";

// Define constants for our coordinate space
// const VIEWBOX_WIDTH = 80; // Consistent with 'O'
const DEFAULT_OPENING_ANGLE_DEG = 40; // Half-angle of the G's opening (e.g., 40 means 80-degree total opening)

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'G'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderG_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;
  // const openingAngleDeg = DEFAULT_OPENING_ANGLE_DEG;

  // --- Path Definition ---

  const arcWidth = 80;
  const H = VIEWBOX_HEIGHT;
  const cx = arcWidth / 2; // Center X
  const cy = H / 2; // Center Y

  // Outer ellipse radii. outerRy spans the full half-height so the bottom
  // centerline sits at the baseline y = H and the centered stroke spills to
  // H + outlineWidth/2, matching the flat-bottomed letters (E, H, L, R…).
  // Insetting it would float the G half a stroke above them. (Width is inset —
  // there's no baseline to meet sideways.)
  const outerRx = (arcWidth - outlineWidth) / 2;
  const outerRy = H / 2;

  // Inner ellipse radii (for the hole)
  const minInnerRadius = 1; // Minimum radius for the inner part to be drawable
  let innerRx = outerRx - limbThickness;
  let innerRy = outerRy - limbThickness;

  innerRx = Math.max(minInnerRadius, innerRx);
  innerRy = Math.max(minInnerRadius, innerRy);

  // Calculate angles for the opening points
  // Angles are in radians, 0 is to the right (East), positive is counter-clockwise.
  const angleTopOpenRad = (-50 * Math.PI) / 180;
  const angleBottomOpenRad = (10 * Math.PI) / 180;

  // Calculate key points for the path
  const pOuterTopOpen = {
    x: cx + outerRx * Math.cos(angleTopOpenRad),
    y: cy + outerRy * Math.sin(angleTopOpenRad),
  };
  const pOuterBottomOpen = {
    x: cx + outerRx * Math.cos(angleBottomOpenRad),
    y: cy + outerRy * Math.sin(angleBottomOpenRad),
  };
  const pInnerTopOpen = {
    x: cx + innerRx * Math.cos(angleTopOpenRad),
    y: cy + innerRy * Math.sin(angleTopOpenRad),
  };
  const pInnerBottomOpen = {
    x: cx + innerRx * Math.cos(angleBottomOpenRad),
    y: cy + innerRy * Math.sin(angleBottomOpenRad),
  };

  // Path data string:
  // 1. Move to outer top of opening.
  // 2. Arc along outer edge (CCW, large arc) to outer bottom of opening.
  // 3. Line to inner bottom of opening.
  // 4. Arc along inner edge (CW, large arc) to inner top of opening.
  // 5. Close path (line to outer top of opening).
  const d = [
    `M ${pOuterTopOpen.x.toFixed(3)} ${pOuterTopOpen.y.toFixed(3)}`,
    `A ${outerRx.toFixed(3)} ${outerRy.toFixed(3)} 0 1 0 ${pOuterBottomOpen.x.toFixed(3)} ${pOuterBottomOpen.y.toFixed(3)}`, // Outer arc (CCW)
    // the 'stroke' of the G
    `H ${pOuterBottomOpen.x + limbThickness * 0.4}`,
    `V ${pOuterBottomOpen.y - limbThickness * 0.8}`,
    `H ${pInnerBottomOpen.x - limbThickness * 0.45}`,
    `V ${pOuterBottomOpen.y}`,

    `L ${pInnerBottomOpen.x.toFixed(3)} ${pOuterBottomOpen.y.toFixed(3)}`,
    `A ${innerRx.toFixed(3)} ${innerRy.toFixed(3)} 0 1 1 ${pInnerTopOpen.x.toFixed(3)} ${pInnerTopOpen.y.toFixed(3)}`, // Inner arc (CW)
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const attachments: AttachmentList = {
    // Eyes in the hollow part, slightly left-biased
    leftEye: { x: cx - innerRx * 0.5, y: cy - (innerRy + outerRy - 3) / 2 },
    rightEye: { x: cx + innerRx * 0.5, y: cy - (innerRy + outerRy - 3) / 2 },
    mouth: { x: cx - innerRx * 0.1, y: cy + (innerRy + outerRy) / 2 },

    // Hat sits centered on top of the G's curve (highest point of G)
    hat: { x: cx, y: cy - outerRy },

    // Left arm on the far left of the G's curve
    leftArm: { x: cx - outerRx, y: cy },
    // Right arm in the middle of the top opening's thickness
    rightArm: {
      x: (pOuterTopOpen.x + pInnerTopOpen.x) / 2,
      y: (pOuterTopOpen.y + pInnerTopOpen.y) / 2,
    },

    // Left leg towards the bottom-left of the G's curve
    leftLeg: { x: cx - outerRx * 0.5, y: cy + outerRy },
    // Right leg in the middle of the bottom opening's thickness
    rightLeg: {
      x: (pOuterBottomOpen.x + pInnerBottomOpen.x) / 2,
      y: (pOuterBottomOpen.y + pInnerBottomOpen.y) / 2,
    },
  };

  return {
    viewBox: [0, 0, pOuterBottomOpen.x + limbThickness * 0.4, VIEWBOX_HEIGHT],
    className: "letter-base letter-G-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderG_uppercase;
