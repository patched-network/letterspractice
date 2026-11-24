/**
 * `<link rel="preload" as="font">` in index.html for the font files the
 * landing page shows first, so they download with the HTML instead of after
 * the stylesheet has been parsed and the text laid out.
 *
 * Why it matters: the hero paints from the prerendered HTML, before the app's
 * script; its text can't paint in its typeface until that face has arrived
 * (and in Firefox, text in a face that's still loading isn't drawn at all, so
 * a face first needed at mount blinked the text using it). Preloading the
 * faces the first screen uses removes both waits.
 *
 * Build only: the files' names carry a content hash, so the links are written
 * from the bundle. Each pattern must match exactly one emitted .woff2; the
 * build fails otherwise, so a renamed or dropped face can't silently lose its
 * preload. Keep the list short: every preload competes with the stylesheet
 * and the entry script for the first bytes.
 */
import type { Plugin } from "vite";

export function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: "preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return;
        const fonts = Object.keys(ctx.bundle).filter((f) => f.endsWith(".woff2"));
        return patterns.map((pattern) => {
          const hits = fonts.filter((f) => pattern.test(f));
          if (hits.length !== 1) {
            throw new Error(`[preload-fonts] ${pattern} matched ${hits.length} font files (want exactly 1): ${hits.join(", ")}`);
          }
          return {
            tag: "link",
            attrs: { rel: "preload", href: `/${hits[0]}`, as: "font", type: "font/woff2", crossorigin: "" },
            injectTo: "head" as const,
          };
        });
      },
    },
  };
}
