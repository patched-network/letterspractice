/**
 * Metric-matched fallbacks for the self-hosted typefaces.
 *
 * The fonts load with `font-display: swap` (main.ts), so text that paints
 * before its face has arrived (the landing page's hero, from the prerendered
 * HTML) is drawn in a system font first and redrawn in Roboto or Poppins a
 * moment later. With a plain `sans-serif` fallback the two set at different
 * widths and line heights: lines rewrap and everything below moves (CLS 0.05
 * in two lighthouse-metrics regions, 2026-11-04). src/theme/fontFallbacks.css
 * declares "Roboto Fallback" and "Poppins Fallback": a local Arial (or the
 * metric-compatible Liberation Sans) scaled and given the web font's ascent,
 * descent and line gap, so the swap changes letterforms but not layout.
 *
 * This PostCSS step puts the fallback family right after its web family in
 * every font-family stack, Vuetify's 79 `Roboto, sans-serif` rules included,
 * so no stylesheet has to name it. @font-face rules are left alone. The
 * `font` shorthand isn't rewritten (nothing on the first screen uses it with
 * these families). Inline styles set from script aren't either.
 */
import type { AtRule, Plugin } from "postcss";

/** Web family (lower case) → its fallback family, declared in src/theme/fontFallbacks.css. */
export const FONT_FALLBACKS: Record<string, string> = {
  roboto: "Roboto Fallback",
  poppins: "Poppins Fallback",
};

const unquote = (family: string) => family.replace(/^(["'])(.*)\1$/, "$2");

/** A font-family value with each web family followed by its fallback (idempotent). */
export function withFontFallbacks(value: string): string {
  const families = value.split(",").map((f) => f.trim());
  const named = new Set(families.map((f) => unquote(f).toLowerCase()));
  const out: string[] = [];
  for (const family of families) {
    out.push(family);
    const fallback = FONT_FALLBACKS[unquote(family).toLowerCase()];
    if (fallback && !named.has(fallback.toLowerCase())) out.push(`"${fallback}"`);
  }
  const next = out.join(", ");
  return next === families.join(", ") ? value : next;
}

export function fontFallbacks(): Plugin {
  return {
    postcssPlugin: "font-fallbacks",
    Declaration: {
      "font-family": (decl) => {
        const parent = decl.parent;
        if (parent?.type === "atrule" && (parent as AtRule).name === "font-face") return;
        const next = withFontFallbacks(decl.value);
        if (next !== decl.value) decl.value = next;
      },
    },
  };
}
