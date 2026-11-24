// letterpeople/src/letters/Q-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  // Point, // Not directly used beyond types
  AttachmentList,
} from "../types";
import {
  DEFAULT_LIMB_THICKNESS,
  DEFAULT_OUTLINE_WIDTH,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80;

// Tail specific constants
const TAIL_CONNECTION_ANGLE_START_DEG = 30; // Angle on 'O' for upper tail connect (0 deg = 3 o'clock)
const TAIL_CONNECTION_ANGLE_END_DEG = 60; // Angle on 'O' for lower tail connect
const TAIL_LENGTH_FACTOR = 0.18;
const TAIL_TIP_THICKNESS_FACTOR = 0.9;
const TAIL_OUTWARD_ANGLE_DEG = 50; // General direction of the tail (0 deg = right, 90 deg = down)

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'Q'.
 * The outer shape (O-body + tail) is a single continuous path for a clean stroke.
 * The inner hole is a separate sub-path.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderQ_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbThickness = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;

  // --- Path Definition ---

  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;
  const cx = W / 2; // Center X
  const cy = H / 2; // Center Y

  // Outer ellipse radii for the 'O' body. outerRy spans the full half-height so
  // the bowl's bottom centerline sits at the baseline y = H and the centered
  // stroke spills to H + outlineWidth/2, matching the flat-bottomed letters
  // (E, H, L, R…). Insetting it would float the bowl half a stroke above them.
  // (Width is inset — there's no baseline to meet sideways.)
  const outerRx = (W - outlineWidth) / 2;
  const outerRy = H / 2;

  // Inner ellipse radii (for the hole in 'O')
  const minInnerRadius = 1;
  let innerRx = outerRx - limbThickness;
  let innerRy = outerRy - limbThickness;
  innerRx = Math.max(minInnerRadius, innerRx);
  innerRy = Math.max(minInnerRadius, innerRy);

  // --- Calculate Tail Connection and Tip Points ---
  const angle1_rad = (TAIL_CONNECTION_ANGLE_START_DEG * Math.PI) / 180;
  const angle2_rad = (TAIL_CONNECTION_ANGLE_END_DEG * Math.PI) / 180;
  const tail_dir_rad = (TAIL_OUTWARD_ANGLE_DEG * Math.PI) / 180;

  // Points where tail connects to the 'O's outer ellipse
  const t1x = cx + outerRx * Math.cos(angle1_rad); // Upper connection point on ellipse
  const t1y = cy + outerRy * Math.sin(angle1_rad);
  const t2x = cx + outerRx * Math.cos(angle2_rad); // Lower connection point on ellipse
  const t2y = cy + outerRy * Math.sin(angle2_rad);

  const midConnectX = (t1x + t2x) / 2;
  const midConnectY = (t1y + t2y) / 2;
  const tailActualLength = VIEWBOX_WIDTH * TAIL_LENGTH_FACTOR;
  const tipCenterX = midConnectX + tailActualLength * Math.cos(tail_dir_rad);
  const tipCenterY = midConnectY + tailActualLength * Math.sin(tail_dir_rad);
  const tailTipThickness = limbThickness * TAIL_TIP_THICKNESS_FACTOR;
  const halfTipThick = tailTipThickness / 2;
  const perpAngleRad = tail_dir_rad + Math.PI / 2;

  const t4x = tipCenterX + halfTipThick * Math.cos(perpAngleRad); // "Upper" or "leading" tip point of tail
  const t4y = Math.min(
    tipCenterY + halfTipThick * Math.sin(perpAngleRad),
    H - outlineWidth,
  );
  const t3x = tipCenterX - halfTipThick * Math.cos(perpAngleRad); // "Lower" or "trailing" tip point of tail
  const t3y = tipCenterY - halfTipThick * Math.sin(perpAngleRad);

  // --- Construct the Path Data ---
  // Point at the top of the 'O'
  const o_top_x = cx;
  const o_top_y = cy - outerRy;

  // Outer Q path (clockwise)
  // Arc from top of 'O' to t1 (upper tail connection)
  // This arc is < 180 degrees, sweep-flag = 1 (clockwise)
  const outer_q_path_data = [
    `M ${o_top_x} ${o_top_y}`, // Start at top of 'O'
    `A ${outerRx} ${outerRy} 0 0 1 ${t1x} ${t1y}`, // Arc to upper tail connection
    `L ${t3x} ${t3y}`, // Line to upper-outer tail tip
    `L ${t4x} ${t4y}`, // Line to lower-outer tail tip
    `L ${t2x} ${t2y}`, // Line to lower tail connection on 'O'
    // Arc from t2 back to top of 'O'
    // This arc is > 180 degrees, sweep-flag = 1 (clockwise)
    `A ${outerRx} ${outerRy} 0 1 1 ${o_top_x} ${o_top_y}`,
    `Z`, // Close the outer Q shape
  ].join(" ");

  // Inner 'O' hole path (counter-clockwise)
  const inner_hole_path_data = [
    `M ${cx} ${cy - innerRy}`,
    `A ${innerRx} ${innerRy} 0 1 0 ${cx} ${cy + innerRy}`,
    `A ${innerRx} ${innerRy} 0 1 0 ${cx} ${cy - innerRy}`,
    `Z`,
  ].join(" ");

  // fill-rule is 'nonzero' by default.

  // --- Attachment Points Calculation ---
  const attachments: AttachmentList = {
    leftEye: { x: cx - innerRx * 0.6, y: limbThickness / 1.75 },
    rightEye: { x: cx + innerRx * 0.6, y: limbThickness / 1.75 },
    mouth: { x: cx, y: H - limbThickness / 2 },
    hat: { x: cx, y: 0 },
    leftArm: { x: 0, y: cy },
    rightArm: { x: W, y: cy },
    leftLeg: { x: cx - outerRx * 0.4, y: H },
    rightLeg: { x: cx + outerRx * 0.1, y: H },
  };

  return {
    viewBox: [0, 0, t3x, VIEWBOX_HEIGHT],
    className: "letter-base letter-Q-uppercase",
    parts: [{ d: `${outer_q_path_data} ${inner_hole_path_data}`, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderQ_uppercase;
