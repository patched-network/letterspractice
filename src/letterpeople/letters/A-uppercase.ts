// letterpeople/src/letters/A-uppercase.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  Point,
  getLineIntersection,
  getParallelLineSegment,
  midpoint,
  Line,
  pointOnSegment,
} from "../util/geometry";
import {
  DEFAULT_LIMB_THICKNESS,
  VIEWBOX_HEIGHT,
  EFFECTIVE_LOWERCASE_HEIGHT,
} from "./CONSTS";

// Define constants for our coordinate space
const VIEWBOX_WIDTH = 80;
const DEFAULT_APEX_FLAT_WIDTH_FACTOR = 1; // Factor of limbThickness for how flat the top peak is
const DEFAULT_CROSSBAR_Y_FACTOR = 0.68; // Crossbar vertical position (0=top, 1=bottom)

// Use geometry utilities imported from "../util/geometry"

/**
 * @internal
 * Renders the base shape and calculates attachment points for the uppercase letter 'A'.
 *
 * @param options - Configuration options for the letter's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderA_uppercase(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const apexFlatWidth = limbT * DEFAULT_APEX_FLAT_WIDTH_FACTOR;
  const crossbarYFactor = DEFAULT_CROSSBAR_Y_FACTOR;

  // --- Define Key Coordinates ---
  const W = VIEWBOX_WIDTH;
  const H = VIEWBOX_HEIGHT;

  const OLT: Point = { x: W / 2 - apexFlatWidth / 2, y: 0 };
  const ORT: Point = { x: W / 2 + apexFlatWidth / 2, y: 0 };
  const OLB: Point = { x: 0, y: H };
  const ORB: Point = { x: W, y: H };

  const crossbarCenterY = H * crossbarYFactor;
  const crossbarTopY = crossbarCenterY - limbT / 2;
  const crossbarBottomY = crossbarCenterY + limbT / 2;

  // Define lines for geometry calculations

  const lineCrossbarTop: Line = {
    p1: { x: 0, y: crossbarTopY },
    p2: { x: W, y: crossbarTopY },
  };
  const lineCrossbarBottom: Line = {
    p1: { x: 0, y: crossbarBottomY },
    p2: { x: W, y: crossbarBottomY },
  };
  const lineViewboxBottom: Line = { p1: { x: 0, y: H }, p2: { x: W, y: H } };
  const lineApexTopOffset: Line = {
    p1: { x: 0, y: OLT.y + limbT },
    p2: { x: W, y: OLT.y + limbT },
  };

  const lineInnerLeftLeg = getParallelLineSegment(OLT, OLB, limbT, "right");
  const lineInnerRightLeg = getParallelLineSegment(ORT, ORB, limbT, "left");

  // --- Calculate Intersection Points for the Path ---

  // Points calculated at y = limbT (near A's apex)
  const points_near_apex_L = getLineIntersection(
    lineInnerLeftLeg,
    lineApexTopOffset,
  );
  const points_near_apex_R = getLineIntersection(
    lineInnerRightLeg,
    lineApexTopOffset,
  );

  // Points calculated at y = crossbarTopY (top edge of crossbar)
  const points_on_crossbar_L = getLineIntersection(
    lineInnerLeftLeg,
    lineCrossbarTop,
  );
  const points_on_crossbar_R = getLineIntersection(
    lineInnerRightLeg,
    lineCrossbarTop,
  );

  if (
    !points_near_apex_L ||
    !points_near_apex_R ||
    !points_on_crossbar_L ||
    !points_on_crossbar_R
  ) {
    console.error(
      "Letter 'A': Failed to calculate some hole intersection points.",
    );
    throw new Error(
      "Letter 'A': Failed to calculate some hole intersection points.",
    );
  }

  // Assign points to form the standard A-hole (narrower top, wider bottom)
  // The top of the hole should be narrower. If the current calculation makes points_near_apex wider,
  // then the "top" of our desired hole should use points_on_crossbar, and "bottom" use points_near_apex.
  // This addresses the "upside down" observation.

  // These will define the TOP (narrower) edge of the hole
  const holeTopL = points_on_crossbar_L;
  const holeTopR = points_on_crossbar_R;
  const holeTop = midpoint(holeTopL, holeTopR);

  // These will define the BOTTOM (wider) edge of the hole
  const holeBottomL = points_near_apex_L;
  const holeBottomR = points_near_apex_R;
  const holeBottom = midpoint(holeBottomL, holeBottomR);

  const P_inner_L_crossbar_B = getLineIntersection(
    lineInnerLeftLeg,
    lineCrossbarBottom,
  );
  const P_inner_R_crossbar_B = getLineIntersection(
    lineInnerRightLeg,
    lineCrossbarBottom,
  );
  const P_inner_L_vb_B = getLineIntersection(
    lineInnerLeftLeg,
    lineViewboxBottom,
  );
  const P_inner_R_vb_B = getLineIntersection(
    lineInnerRightLeg,
    lineViewboxBottom,
  );

  if (
    !P_inner_L_crossbar_B ||
    !P_inner_R_crossbar_B ||
    !P_inner_L_vb_B ||
    !P_inner_R_vb_B
  ) {
    console.error(
      "Letter 'A': Failed to calculate some outer path intersection points.",
    );
    throw new Error(
      "Letter 'A': Failed to calculate some outer path intersection points.",
    );
  }

  const outerPath = [
    `M ${OLT.x.toFixed(3)} ${OLT.y.toFixed(3)}`,
    `L ${ORT.x.toFixed(3)} ${ORT.y.toFixed(3)}`,
    `L ${ORB.x.toFixed(3)} ${ORB.y.toFixed(3)}`,
    `L ${P_inner_R_vb_B.x.toFixed(3)} ${P_inner_R_vb_B.y.toFixed(3)}`,
    `L ${P_inner_R_crossbar_B.x.toFixed(3)} ${P_inner_R_crossbar_B.y.toFixed(3)}`,
    `L ${P_inner_L_crossbar_B.x.toFixed(3)} ${P_inner_L_crossbar_B.y.toFixed(3)}`,
    `L ${P_inner_L_vb_B.x.toFixed(3)} ${P_inner_L_vb_B.y.toFixed(3)}`,
    `L ${OLB.x.toFixed(3)} ${OLB.y.toFixed(3)}`,
    `Z`,
  ].join(" ");

  // Path for the hole, ensuring CCW: M BottomL -> L TopL -> L TopR -> L BottomR -> Z
  // Note: holeBottomL/R are now physically higher (closer to A's apex) than holeTopL/R (on crossbar)
  // due to the re-assignment above to "flip" the perceived upside-down hole.
  // So, the path starts at the "new bottom" (points_near_apex_L), goes to "new top" (points_on_crossbar_L), etc.
  const innerHolePath = [
    // `M ${holeBottomL.x.toFixed(3)} ${holeBottomL.y.toFixed(3)}`, // Physically higher point (near apex)
    `M ${holeBottom.x.toFixed(3)} ${holeBottom.y.toFixed(3)}`, // Physically higher point (near apex)
    `L ${holeTopL.x.toFixed(3)} ${holeTopL.y.toFixed(3)}`, // Physically lower point (on crossbar)
    `L ${holeTopR.x.toFixed(3)} ${holeTopR.y.toFixed(3)}`, // Physically lower point (on crossbar)
    // `L ${holeBottomR.x.toFixed(3)} ${holeBottomR.y.toFixed(3)}`, // Physically higher point (near apex)
    `Z`,
  ].join(" ");

  const midCrossbarX = (points_on_crossbar_L.x + points_on_crossbar_R.x) / 2;
  const midCrossbarY = crossbarTopY + limbT / 2; // Actual center of crossbar

  const attachments: AttachmentList = {
    leftEye: { x: midCrossbarX - 0.9 * limbT, y: midCrossbarY - limbT / 2 },
    rightEye: { x: midCrossbarX + 0.9 * limbT, y: midCrossbarY - limbT / 2 },
    mouth: { x: midCrossbarX, y: midCrossbarY },
    hat: { x: W / 2, y: 0 },
    leftArm: pointOnSegment({ p1: OLT, p2: OLB }, 0.5),
    rightArm: pointOnSegment({ p1: ORT, p2: ORB }, 0.5),
    leftLeg: { x: OLB.x + limbT / 2, y: H },
    rightLeg: { x: ORB.x - limbT / 2, y: H },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base letter-A-uppercase",
    parts: [{ d: `${outerPath} ${innerHolePath}`, strokeLinejoin: "round" }],
    attachments: attachments,
  };
}

export default renderA_uppercase;
