// letterpeople/src/letters/C-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { ellipticalArcPoint, midpoint } from "../util/geometry";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
} from "./CONSTS";

// Define constants for our coordinate space
// const VIEWBOX_WIDTH = 80; // Consistent with 'O'
const DEFAULT_OPENING_ANGLE_DEG = 40; // Half-angle of the C's opening (e.g., 40 means 80-degree total opening)

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'C'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderC_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;
  const openingAngleDeg = DEFAULT_OPENING_ANGLE_DEG;

  // --- Path Definition ---

  const arcWidth = 80;
  const H = VIEWBOX_HEIGHT;
  const cx = arcWidth / 2; // Center X
  const cy = H / 2; // Center Y

  // Outer ellipse radii. outerRy spans the full half-height (cy ± H/2) so the
  // bottom centerline sits at the baseline y = H and the centered stroke spills
  // to H + outlineWidth/2 — matching the flat-bottomed letters (E, H, L, R…),
  // which draw their bottom edge at y = H and let the stroke spill below.
  // Insetting outerRy by outlineWidth/2 (as the width is, where there's no
  // baseline to meet) would leave the ink bottom at y = H while the flat letters
  // sit half a stroke lower, making the C float. index.ts pads the wrapping
  // viewBox so the spill isn't clipped.
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
  const angleTopOpenRad = (-openingAngleDeg * Math.PI) / 180;
  const angleBottomOpenRad = (openingAngleDeg * Math.PI) / 180;

  // Calculate key points for the path
  const pOuterTopOpen = ellipticalArcPoint(
    cx,
    cy,
    outerRx,
    outerRy,
    angleTopOpenRad,
  );
  const pOuterBottomOpen = ellipticalArcPoint(
    cx,
    cy,
    outerRx,
    outerRy,
    angleBottomOpenRad,
  );
  const pInnerTopOpen = ellipticalArcPoint(
    cx,
    cy,
    innerRx,
    innerRy,
    angleTopOpenRad,
  );
  const pInnerBottomOpen = ellipticalArcPoint(
    cx,
    cy,
    innerRx,
    innerRy,
    angleBottomOpenRad,
  );

  // Path data string:
  // 1. Move to outer top of opening.
  // 2. Arc along outer edge (CCW, large arc) to outer bottom of opening.
  // 3. Line to inner bottom of opening.
  // 4. Arc along inner edge (CW, large arc) to inner top of opening.
  // 5. Close path (line to outer top of opening).
  const d = [
    `M ${pOuterTopOpen.x} ${pOuterTopOpen.y}`,
    `A ${outerRx} ${outerRy} 0 1 0 ${pOuterBottomOpen.x} ${pOuterBottomOpen.y}`, // Outer arc (CCW)
    `L ${pInnerBottomOpen.x} ${pInnerBottomOpen.y}`,
    `A ${innerRx} ${innerRy} 0 1 1 ${pInnerTopOpen.x} ${pInnerTopOpen.y}`, // Inner arc (CW)
    `Z`,
  ].join(" ");

  // --- Attachment Points Calculation ---
  const attachments: AttachmentList = {
    // Eyes in the hollow part, slightly left-biased
    leftEye: { x: cx - innerRx * 0.5, y: cy - (innerRy + outerRy - 3) / 2 },
    rightEye: { x: cx + innerRx * 0.5, y: cy - (innerRy + outerRy - 3) / 2 },
    mouth: { x: cx - innerRx * 0.1, y: cy + (innerRy + outerRy) / 2 },

    // Hat sits centered on top of the C's curve (highest point of C)
    hat: { x: cx, y: cy - outerRy },

    // Left arm on the far left of the C's curve
    leftArm: { x: cx - outerRx, y: cy },
    // Right arm in the middle of the top opening's thickness
    rightArm: midpoint(pOuterTopOpen, pInnerTopOpen),

    // Left leg towards the bottom-left of the C's curve
    leftLeg: { x: cx - outerRx * 0.5, y: cy + outerRy },
    // Right leg in the middle of the bottom opening's thickness
    rightLeg: midpoint(pOuterBottomOpen, pInnerBottomOpen),
  };

  return {
    viewBox: [0, 0, pOuterTopOpen.x, VIEWBOX_HEIGHT],
    className: "letter-base letter-C-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderC_uppercase;
