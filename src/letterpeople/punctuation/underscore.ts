import type {
  LetterOptions,
  LetterGeometry,
  AttachmentList,
} from "../types";
import {
  VIEWBOX_HEIGHT,
  DEFAULT_LIMB_THICKNESS,
} from "../letters/CONSTS";
import { rectPath } from "../util/drawing";

const VIEWBOX_WIDTH = 80;

/**
 * @internal
 * Renders an underscore (_) character as a horizontal bar at the baseline.
 *
 * @param options - Configuration options for the underscore's appearance.
 * @returns The letter's geometry (body path data, viewBox) and attachment coordinates.
 */
function renderUnderscore(options?: LetterOptions): LetterGeometry {
  const limbT = options?.lineWidth ?? DEFAULT_LIMB_THICKNESS;
  const color = options?.color ?? "currentColor";

  // Render as a rounded rectangle at the baseline
  const rectHeight = limbT;

  // Attachment points - placed away from the bar to avoid clutter if they are accidentally shown
  const attachments: AttachmentList = {
    leftEye: { x: VIEWBOX_WIDTH * 0.25, y: VIEWBOX_HEIGHT * 0.5 },
    rightEye: { x: VIEWBOX_WIDTH * 0.75, y: VIEWBOX_HEIGHT * 0.5 },
    mouth: { x: VIEWBOX_WIDTH * 0.5, y: VIEWBOX_HEIGHT * 0.6 },
    hat: { x: VIEWBOX_WIDTH * 0.5, y: VIEWBOX_HEIGHT * 0.2 },
    leftArm: { x: 0, y: VIEWBOX_HEIGHT - rectHeight / 2 },
    rightArm: { x: VIEWBOX_WIDTH, y: VIEWBOX_HEIGHT - rectHeight / 2 },
    leftLeg: { x: VIEWBOX_WIDTH * 0.3, y: VIEWBOX_HEIGHT },
    rightLeg: { x: VIEWBOX_WIDTH * 0.7, y: VIEWBOX_HEIGHT },
  };

  return {
    viewBox: [0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    className: "letter-base punctuation-underscore",
    parts: [
      { d: rectPath(0, VIEWBOX_HEIGHT - rectHeight, VIEWBOX_WIDTH, rectHeight, rectHeight / 2) },
    ],
    attachments,
  };
}

export default renderUnderscore;
