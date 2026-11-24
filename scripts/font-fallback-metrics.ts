/**
 * The descriptor values in src/theme/fontFallbacks.css: for each web face, a
 * local fallback scaled to its width and given its vertical metrics.
 *
 *   npx tsx scripts/font-fallback-metrics.ts [<dir with LiberationSans-{Regular,Bold}.ttf>]
 *
 * Liberation Sans stands in for Arial (identical advance widths, by design).
 * The default directory is where Debian/Ubuntu's fonts-liberation puts them.
 *
 *   size-adjust     = web face's advance over SAMPLE / fallback's (per em)
 *   ascent-override = web hhea ascender / unitsPerEm / size-adjust (likewise
 *                     descent and line gap), the formula Next.js's font
 *                     fallbacks use
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontverter from "fontverter";
import * as hb from "harfbuzzjs";

const SAMPLE =
  "Teach your child to read. Short daily practice, letter by letter, sound by sound. " +
  "LettersPractice is early literacy for toddlers and preschoolers: the letters themselves teach, " +
  "practise and play. Try a session free; no account needed. The quick brown fox jumps over the lazy dog 0123456789.";

const FACES = [
  { family: "Roboto", file: "@fontsource/roboto/files/roboto-latin-400-normal.woff2", fallback: "Regular" },
  { family: "Roboto", file: "@fontsource/roboto/files/roboto-latin-700-normal.woff2", fallback: "Bold" },
  { family: "Poppins", file: "@fontsource/poppins/files/poppins-latin-400-normal.woff2", fallback: "Regular" },
  { family: "Poppins", file: "@fontsource/poppins/files/poppins-latin-700-normal.woff2", fallback: "Bold" },
] as const;

function tableOffsets(sfnt: Buffer): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < sfnt.readUInt16BE(4); i++) {
    const at = 12 + 16 * i;
    out[sfnt.toString("latin1", at, at + 4)] = sfnt.readUInt32BE(at + 8);
  }
  return out;
}

function vertical(sfnt: Buffer) {
  const t = tableOffsets(sfnt);
  return {
    upem: sfnt.readUInt16BE(t.head + 18),
    ascender: sfnt.readInt16BE(t.hhea + 4),
    descender: sfnt.readInt16BE(t.hhea + 6),
    lineGap: sfnt.readInt16BE(t.hhea + 8),
  };
}

/** SAMPLE's advance, shaped, in ems. */
function advance(sfnt: Buffer): number {
  const font = new hb.Font(new hb.Face(new hb.Blob(sfnt), 0));
  const buffer = new hb.Buffer();
  buffer.addText(SAMPLE);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const units = buffer.getGlyphPositions().reduce((sum: number, g: { xAdvance: number }) => sum + g.xAdvance, 0);
  return units / vertical(sfnt).upem;
}

const dir = process.argv[2] ?? "/usr/share/fonts/truetype/liberation";
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

for (const face of FACES) {
  const web = Buffer.from(await fontverter.convert(readFileSync(join("node_modules", face.file)), "truetype"));
  const fallback = readFileSync(join(dir, `LiberationSans-${face.fallback}.ttf`));
  const sizeAdjust = advance(web) / advance(fallback);
  const v = vertical(web);
  console.log(
    `${face.family} ${face.fallback === "Bold" ? "bold" : "regular"}: ` +
      `size-adjust: ${pct(sizeAdjust)}; ascent-override: ${pct(v.ascender / v.upem / sizeAdjust)}; ` +
      `descent-override: ${pct(-v.descender / v.upem / sizeAdjust)}; line-gap-override: ${pct(v.lineGap / v.upem / sizeAdjust)};`,
  );
}
