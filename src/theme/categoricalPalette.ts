/**
 * The site's one categorical palette: a fixed hue order, never cycled, for
 * anything that needs "this is one of N kinds" colour (lessons, the learning
 * engine's rivals, …). Hues come from here; a role picks a TIER, derived
 * procedurally in OKLCH (DESIGN_SYSTEM.md: Bridging Tiers), rather than
 * keeping its own hex list.
 *
 *   base — the slots as listed: bright marks on the page surface
 *          (/curriculum's lesson discs, with ink text on them).
 *   deep — lightness capped at DEEP_MAX_L, hue and chroma kept: deep enough to
 *          knock a white glyph out of (>= 3.9:1 for slots 1–6).
 *
 * Slots are the dataviz reference palette, validated on #fffef7: base for
 * adjacent pairs of slots 1–5 (three sit below 3:1 on the surface, so every
 * mark carries a label); deep for adjacent pairs of slots 1–6 in order.
 * Revalidate (dataviz skill's validate_palette.js) before using a new slot or
 * a new order.
 *
 * Two roles share hues, so keep them apart: a page that shows lessons and
 * rivals side by side (the landing's Under the Hood cards) colours one set
 * only.
 */
import {
  adjustLightness,
  colorToOklch,
  oklchToRgbString,
  parseColor,
  rgbToHex,
} from "../letterpeople/util/color";

export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

/** Deep tier's lightness cap (OKLCH L). */
export const DEEP_MAX_L = 0.58;

/** A base slot, deepened for white glyphs: L capped, hue and chroma kept. */
export function deepTier(hex: string): string {
  const o = colorToOklch(hex);
  if (!o) return hex;
  const rgb = parseColor(oklchToRgbString(adjustLightness(o, Math.min(0, DEEP_MAX_L - o.l))));
  return rgb ? rgbToHex(...rgb) : hex;
}
