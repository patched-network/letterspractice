// letterpeople/src/letters/toSvg.ts
import type { LetterGeometry, LetterOptions } from "../types";
import { DEFAULT_OUTLINE_WIDTH } from "./CONSTS";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @internal
 * Builds the base SVG for a letter from its renderer-independent geometry.
 * Each part becomes a `path.letter-path` styled from `options`
 * (fill ← color, stroke ← borderColor, stroke-width ← borderWidth).
 */
export function geometryToSvg(
  geometry: LetterGeometry,
  options?: LetterOptions,
): SVGSVGElement {
  const fillColor = options?.color ?? "currentColor";
  const outlineColor = options?.borderColor ?? "black";
  const outlineWidth = options?.borderWidth ?? DEFAULT_OUTLINE_WIDTH;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", geometry.viewBox.join(" "));
  svg.setAttribute("class", geometry.className);

  for (const part of geometry.parts) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", part.d);
    path.setAttribute("class", "letter-path");
    path.setAttribute("fill", fillColor);
    path.setAttribute("stroke", outlineColor);
    path.setAttribute("stroke-width", String(outlineWidth));
    if (part.strokeLinejoin) {
      path.setAttribute("stroke-linejoin", part.strokeLinejoin);
    }
    if (part.strokeLinecap) {
      path.setAttribute("stroke-linecap", part.strokeLinecap);
    }
    if (part.fillRule) {
      path.setAttribute("fill-rule", part.fillRule);
    }
    svg.appendChild(path);
  }

  return svg;
}
