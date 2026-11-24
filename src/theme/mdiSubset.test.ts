/**
 * Production builds keep only the icons the source names literally
 * (scripts/vite-plugin-mdi-subset.ts). These pin the subsetting, and fail if
 * source starts composing icon names, which would render blank in production
 * only.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import subsetFont from "subset-font";
import { collectIconNames, subsetMdiCss } from "../../scripts/vite-plugin-mdi-subset";

const ROOT = resolve(__dirname, "../..");

describe("mdi subset", () => {
  it("keeps the named icons and the stylesheet's utilities, drops the rest", () => {
    const css = [
      '.mdi:before, .mdi-set { display: inline-block; }',
      '.mdi-close::before {\n  content: "\\F0156";\n}\n',
      '.mdi-abacus::before {\n  content: "\\F16E0";\n}\n',
      '.mdi-spin:before { animation: mdi-spin 2s infinite linear; }',
    ].join("\n");
    const out = subsetMdiCss(css, new Set(["mdi-close"]));
    expect(out).toMatchObject({ kept: 1, total: 2 });
    expect(out.css).toContain(".mdi-close::before");
    expect(out.css).not.toContain(".mdi-abacus");
    expect(out.css).toContain(".mdi-set");
    expect(out.css).toContain(".mdi-spin:before");
  });

  it("matches @mdi/font's own stylesheet (format unchanged)", () => {
    const css = readFileSync(join(ROOT, "node_modules/@mdi/font/css/materialdesignicons.css"), "utf8");
    const { total, kept } = subsetMdiCss(css, collectIconNames(ROOT));
    expect(total).toBeGreaterThan(7000);
    expect(kept).toBeGreaterThan(100);
  });

  it("cuts the font down to the kept glyphs, keeping them", async () => {
    const css = readFileSync(join(ROOT, "node_modules/@mdi/font/css/materialdesignicons.css"), "utf8");
    const codePoint = (name: string) =>
      parseInt(new RegExp(`\\.${name}::before\\s*\\{\\s*content:\\s*"\\\\([0-9A-F]+)"`).exec(css)![1], 16);
    const close = codePoint("mdi-close");
    const abacus = codePoint("mdi-abacus");
    const full = readFileSync(join(ROOT, "node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff2"));
    // sfnt rather than woff2, so HarfBuzz can read it back; same subsetting.
    const sfnt = await subsetFont(full, String.fromCodePoint(close), { targetFormat: "sfnt" });
    const { Blob, Face } = await import("harfbuzzjs");
    const unicodes = [...new Face(new Blob(sfnt)).collectUnicodes()];
    expect(unicodes).toContain(close);
    expect(unicodes).not.toContain(abacus);
  });

  it("finds no composed icon names in src (they'd render blank in production)", () => {
    const composed = /mdi-\$\{|['"`]mdi-['"`]\s*\+|\+\s*['"`]mdi-/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(vue|ts)$/.test(name) && !name.endsWith(".test.ts") && composed.test(readFileSync(path, "utf8"))) {
          offenders.push(path.slice(ROOT.length + 1));
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
