/**
 * Production builds ship only the Material Design Icons the app names.
 *
 * @mdi/font's stylesheet has a `.mdi-<name>::before { content: "…" }` rule
 * for every one of its ~7,400 icons (~290 KB of render-blocking CSS), and its
 * woff2 holds every glyph (~400 KB), for the couple of hundred icons this app
 * uses. This plugin (build only):
 *   - drops the glyph rules for icon names that appear nowhere in
 *       - the app's source (src/, index.html, content/phoneticAnalytics/lib/)
 *       - the framework's builds (node_modules/@vue-skuilder/{name}/dist)
 *       - Vuetify's mdi icon aliases ($close, $expand, … → mdi-…)
 *   - points the @font-face's woff2 at a subset of the font holding just the
 *     kept icons' glyphs (subset-font; written to node_modules/.cache, then
 *     emitted by Vite under its own content hash, so a changed icon set is a
 *     new file name). The woff/ttf/eot fallbacks stay whole: only browsers
 *     without woff2 fetch them.
 * Everything else in the stylesheet (`.mdi`, `.mdi-spin`, `.mdi-rotate-*` and
 * the other utilities) is left as it is. `vite dev` serves the full sheet.
 *
 * So an icon has to be named literally somewhere scanned: `mdi-close`, not
 * `` `mdi-${name}` ``. A composed name would render blank in production only
 * (src/theme/mdiSubset.test.ts checks for them). The build logs what it kept.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import subsetFont from "subset-font";
import type { Plugin } from "vite";

const ICON_NAME = /mdi-[a-z0-9]+(?:-[a-z0-9]+)*/g;
const GLYPH_RULE = /\.(mdi-[a-z0-9-]+)::before\s*\{\s*content:\s*"\\([0-9A-Fa-f]+)";?\s*\}\s*/g;
const MDI_CSS = /\/@mdi\/font\/css\/materialdesignicons(\.min)?\.css$/;
const WOFF2_URL = /url\("\.\.\/fonts\/materialdesignicons-webfont\.woff2(\?[^"]*)?"\)/;
const SOURCE_FILE = /\.(vue|ts|js|mjs|json|md|html)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE_FILE.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
}

/** Every `mdi-…` name the scanned files mention. */
export function collectIconNames(root: string): Set<string> {
  const files: string[] = [join(root, "index.html")];
  walk(join(root, "src"), files);
  walk(join(root, "content/phoneticAnalytics/lib"), files);
  const framework = join(root, "node_modules/@vue-skuilder");
  if (existsSync(framework)) {
    for (const pkg of readdirSync(framework)) walk(join(framework, pkg, "dist"), files);
  }
  files.push(join(root, "node_modules/vuetify/lib/iconsets/mdi.js"));

  const names = new Set<string>();
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, "utf8").matchAll(ICON_NAME)) names.add(m[0]);
  }
  return names;
}

/**
 * The stylesheet without the glyph rules for icons not in `keep`, and the
 * code points of the glyphs it kept.
 */
export function subsetMdiCss(
  css: string,
  keep: Set<string>,
): { css: string; kept: number; total: number; codePoints: number[] } {
  let total = 0;
  const codePoints: number[] = [];
  const out = css.replace(GLYPH_RULE, (rule, name: string, hex: string) => {
    total++;
    if (!keep.has(name)) return "";
    codePoints.push(parseInt(hex, 16));
    return rule;
  });
  return { css: out, kept: codePoints.length, total, codePoints };
}

export function mdiSubset(root: string): Plugin {
  let names: Set<string> | null = null;
  return {
    name: "mdi-subset",
    apply: "build",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0];
      if (!MDI_CSS.test(file)) return null;
      names ??= collectIconNames(root);
      const { css, kept, total, codePoints } = subsetMdiCss(code, names);
      if (total === 0) {
        this.warn("no icon rules matched: @mdi/font's stylesheet format changed? Shipping it whole.");
        return null;
      }

      // The font, cut down to the kept glyphs.
      const fontPath = join(dirname(file), "../fonts/materialdesignicons-webfont.woff2");
      if (!WOFF2_URL.test(css) || !existsSync(fontPath)) {
        this.warn("woff2 not found where expected: shipping the whole font.");
        console.log(`[mdi-subset] kept ${kept} of ${total} icons (font not subset)`);
        return { code: css, map: null };
      }
      const full = readFileSync(fontPath);
      const subset = await subsetFont(full, String.fromCodePoint(...codePoints), { targetFormat: "woff2" });
      const outDir = join(root, "node_modules/.cache/mdi-subset");
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, "materialdesignicons-subset.woff2");
      writeFileSync(outPath, subset);
      const rewritten = css.replace(WOFF2_URL, `url("${relative(dirname(file), outPath)}")`);

      console.log(
        `[mdi-subset] kept ${kept} of ${total} icons; woff2 ${Math.round(full.length / 1024)} → ` +
          `${Math.round(subset.length / 1024)} KB`,
      );
      return { code: rewritten, map: null };
    },
  };
}
