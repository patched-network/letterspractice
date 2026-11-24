// letterpeople/src/punctuation/exclamation.ts
import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "../letters/CONSTS";
import { circlePath } from "../util/drawing";

/**
 * @internal
 * Renders an exclamation point (!) character.
 *
 * @param options - Configuration options for the exclamation's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderExclamation(
  options?: LetterOptions,
): LetterGeometry {
  // --- Options Processing ---
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;

  // --- Calculate dimensions ---
  const cx = limbT / 2;

  // Dot at bottom (similar to period)
  const dotRadius = limbT / 2;
  const dotCenterY = VIEWBOX_HEIGHT - dotRadius;

  // Vertical stem takes most of the height
  const stemWidth = limbT;
  const stemHeight = VIEWBOX_HEIGHT * 0.65; // About 65% of total height
  const stemTop = 0;
  const stemBottom = stemHeight;

  // Gap between stem and dot
  const gapSize = limbT * 0.5;

  // --- Create stem path ---
  const stemLeft = cx - stemWidth / 2;
  const stemRight = cx + stemWidth / 2;
  const stemBottomLeft = cx - (0.8 * stemWidth) / 2;
  const stemBottomRight = cx + (0.8 * stemWidth) / 2;

  const stemPath = [
    `M ${stemLeft} ${stemTop}`,
    `L ${stemRight} ${stemTop}`,
    `L ${stemBottomRight} ${stemBottom}`,
    `L ${stemBottomLeft} ${stemBottom} Z`,
  ].join(" ");

  // --- Create dot circle ---

  // --- Attachment Points Calculation ---
  // Center points on the stem for visibility
  const centerPoint = { x: cx, y: VIEWBOX_HEIGHT / 2 };

  const attachments: AttachmentList = {
    leftEye: { x: cx - stemWidth * 0.3, y: stemTop + stemHeight * 0.2 },
    rightEye: { x: cx + stemWidth * 0.3, y: stemTop + stemHeight * 0.2 },
    mouth: { x: cx, y: stemTop + stemHeight * 0.5 },
    hat: { x: cx, y: stemTop },
    leftArm: { x: cx - stemWidth / 2, y: stemTop + stemHeight * 0.4 },
    rightArm: { x: cx + stemWidth / 2, y: stemTop + stemHeight * 0.4 },
    leftLeg: { x: cx - dotRadius * 0.5, y: dotCenterY },
    rightLeg: { x: cx + dotRadius * 0.5, y: dotCenterY },
  };

  return {
    viewBox: [0, 0, limbT, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-exclamation",
    parts: [
      { d: stemPath, strokeLinejoin: "round" },
      { d: circlePath(cx, dotCenterY, dotRadius) },
    ],
    attachments: attachments,
  };
}

export default renderExclamation;
