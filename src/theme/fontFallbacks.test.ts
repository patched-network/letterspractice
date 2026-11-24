import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { FONT_FALLBACKS, fontFallbacks, withFontFallbacks } from "../../scripts/postcss-font-fallbacks";

describe("withFontFallbacks", () => {
  it("puts the fallback right after its web family", () => {
    expect(withFontFallbacks("Roboto, sans-serif")).toBe('Roboto, "Roboto Fallback", sans-serif');
    expect(withFontFallbacks('"Poppins", system-ui, sans-serif')).toBe('"Poppins", "Poppins Fallback", system-ui, sans-serif');
    expect(withFontFallbacks("Poppins, Roboto, sans-serif")).toBe(
      'Poppins, "Poppins Fallback", Roboto, "Roboto Fallback", sans-serif',
    );
  });

  it("leaves other stacks, and already-rewritten ones, as they are", () => {
    expect(withFontFallbacks("monospace, monospace")).toBe("monospace, monospace");
    expect(withFontFallbacks("inherit")).toBe("inherit");
    const once = withFontFallbacks("Roboto, sans-serif");
    expect(withFontFallbacks(once)).toBe(once);
  });
});

describe("fontFallbacks (PostCSS)", () => {
  const run = (css: string) => postcss([fontFallbacks()]).process(css, { from: undefined }).css;

  it("rewrites rules, minified or not, and keeps !important", () => {
    expect(run(".a{font-family:Roboto,sans-serif}")).toBe('.a{font-family:Roboto, "Roboto Fallback", sans-serif}');
    expect(run(".b { font-family: Roboto, sans-serif !important; }")).toBe(
      '.b { font-family: Roboto, "Roboto Fallback", sans-serif !important; }',
    );
  });

  it("leaves @font-face rules alone", () => {
    const face = "@font-face{font-family:Roboto;src:url(r.woff2)}";
    expect(run(face)).toBe(face);
  });
});

describe("src/theme/fontFallbacks.css", () => {
  const css = readFileSync(new URL("./fontFallbacks.css", import.meta.url), "utf8");

  it("declares a regular and a bold face for every fallback family", () => {
    for (const family of Object.values(FONT_FALLBACKS)) {
      const faces = css.match(new RegExp(`font-family: "${family}";[^}]*`, "g")) ?? [];
      expect(faces.map((f) => /font-weight: (\S+)/.exec(f)?.[1]).sort()).toEqual(["100", "550"]);
    }
  });
});
