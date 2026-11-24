// letterpeople/src/letters/O-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import { Point } from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
  VIEWBOX_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80; // Consistent with 'E', 'H'

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'O'.
 * This function uses two elliptical paths (outer and inner) to create the hole.
 * It does NOT add attachments like eyes/mouth; that happens in the main createLetter function.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderO_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;

  // --- Path Definition (Filled Shape Outline with Hole) ---

  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const cx = W / 2; // Center X
  const cy = H / 2; // Center Y

  // Outer ellipse radii
  // Subtract half outline width from each side if stroke is centered,
  // or full outline width if stroke is entirely inside/outside.
  // Assuming path defines the fill boundary, and stroke is additional.
  // For simplicity, let's consider the viewBox dimensions as the outer limit of the fill.
  // outerRy spans the full half-height so the bottom centerline sits at the
  // baseline y = H and the centered stroke spills to H + outlineWidth/2, matching
  // the flat-bottomed letters (E, H, L, R…). Insetting it would float the O half
  // a stroke above them. (Width is inset — there's no baseline to meet sideways.)
  const outerRx = (W - outlineWidth) / 2;
  const outerRy = H / 2;

  // Inner ellipse radii (for the hole)
  // Ensure inner radii are positive and create a visible hole.
  // The smallest radius for the hole should be at least a tiny positive value.
  const minInnerRadius = 1; // Minimum radius for the inner ellipse to be drawable
  let innerRx = outerRx - limbThickness;
  let innerRy = outerRy - limbThickness;

  innerRx = Math.max(minInnerRadius, innerRx);
  innerRy = Math.max(minInnerRadius, innerRy);

  // If limbThickness is so large it would make the hole disappear or invert,
  // cap it so that innerRx/innerRy are at least minInnerRadius.
  // This effectively means the thickest the limb can be is outerR - minInnerRadius.

  // Path data string:
  // 1. Outer ellipse (clockwise)
  //    M cx, cy - outerRy  (Move to top-center of outer ellipse)
  //    A outerRx, outerRy, 0, 1, 1, cx, cy + outerRy (Arc to bottom-center)
  //    A outerRx, outerRy, 0, 1, 1, cx, cy - outerRy (Arc back to top-center)
  //    Z (Close outer path)
  // 2. Inner ellipse (counter-clockwise for hole with nonzero fill-rule)
  //    M cx, cy - innerRy  (Move to top-center of inner ellipse)
  //    A innerRx, innerRy, 0, 1, 0, cx, cy + innerRy (Arc to bottom-center, CCW)
  //    A innerRx, innerRy, 0, 1, 0, cx, cy - innerRy (Arc back to top-center, CCW)
  //    Z (Close inner path)

  const d = [
    // Outer ellipse (clockwise)
    `M ${cx} ${cy - outerRy}`,
    `A ${outerRx} ${outerRy} 0 1 1 ${cx} ${cy + outerRy}`,
    `A ${outerRx} ${outerRy} 0 1 1 ${cx} ${cy - outerRy}`,
    `Z`,
    // Inner ellipse (counter-clockwise)
    `M ${cx} ${cy - innerRy}`,
    `A ${innerRx} ${innerRy} 0 1 0 ${cx} ${cy + innerRy}`,
    `A ${innerRx} ${innerRy} 0 1 0 ${cx} ${cy - innerRy}`,
    `Z`,
  ].join(" ");

  // fill-rule is 'nonzero' by default, which is what we want.

  // --- Attachment Points Calculation (Relative to 0,0 of the viewBox) ---
  const attachments: AttachmentList = {
    // Eyes and mouth inside the hole, relative to inner radii
    leftEye: { x: cx - innerRx * 0.6, y: limbThickness / 1.75 },
    rightEye: { x: cx + innerRx * 0.6, y: limbThickness / 1.75 },
    mouth: { x: cx, y: H - limbThickness / 2 },

    // Hat sits centered on top of the SVG bounds
    hat: { x: cx, y: 0 },

    // Arms on the far left/right edges of the SVG bounds, vertically centered
    leftArm: { x: 0, y: cy },
    rightArm: { x: W, y: cy },

    // Legs at the bottom of the SVG bounds, somewhat spread based on outer radius
    leftLeg: { x: cx - outerRx * 0.5, y: H },
    rightLeg: { x: cx + outerRx * 0.5, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-O-uppercase",
    parts: [{ d, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderO_uppercase;
