/**
 * Byte budgets for the landing page's first load, read from a production
 * build (`build:webapp`, which writes a brotli `.br` beside each file). Fails
 * (exit 1) if a file is over budget; prints every file with its headroom.
 *
 *   npx tsx scripts/perf/budgets.ts [--dist dist]
 *
 * Sizes are brotli, what a browser that accepts it is sent. Unlike timings,
 * they don't care how fast the machine is, so they can gate. Run nightly
 * (.github/workflows/nightly-landing.yml). When a change shrinks a file for
 * good, lower its budget here to keep the gain; raise one only on purpose,
 * saying why in the commit.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";

/**
 * Brotli bytes. Set 2026-11-04 (entry JS 418 KB, CSS 34 KB, HTML 10 KB) plus a few % headroom.
 * Entry script lowered 2026-11-06 with @vue-skuilder 0.2.36 (per-module builds) and the lazy
 * userDebugAPI: 178 KB measured.
 */
const BUDGETS = {
  "entry script": 186_000,
  "entry stylesheet": 36_000,
  "landing page HTML": 12_000,
};

const argv = process.argv.slice(2);
const at = argv.indexOf("--dist");
const dist = at >= 0 && argv[at + 1] ? argv[at + 1] : "dist";

const shell = readFileSync(join(dist, "index.html"), "utf8");
const href = (pattern: RegExp, what: string) => {
  const found = pattern.exec(shell)?.[1];
  if (!found) throw new Error(`[budgets] no ${what} in ${dist}/index.html`);
  return join(dist, found);
};
// The entry is a modulepreload since scripts/vite-plugin-boot-after-paint.ts;
// a plain module script tag before that.
const files: Record<keyof typeof BUDGETS, string> = {
  "entry script": href(/(?:rel="modulepreload"[^>]*href|<script type="module"[^>]*src)="\/(assets\/index-[^"]+\.js)"/, "entry script"),
  "entry stylesheet": href(/<link rel="stylesheet"[^>]*href="\/(assets\/index-[^"]+\.css)"/, "entry stylesheet"),
  "landing page HTML": join(dist, "_prerendered/home.html"),
};

const brotliSize = (file: string) =>
  existsSync(`${file}.br`) ? statSync(`${file}.br`).size : brotliCompressSync(readFileSync(file)).length;

let over = false;
for (const [name, file] of Object.entries(files) as [keyof typeof BUDGETS, string][]) {
  const size = brotliSize(file);
  const budget = BUDGETS[name];
  if (size > budget) over = true;
  const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
  console.log(
    `[budgets] ${name}: ${kb(size)} of ${kb(budget)} (${size > budget ? "OVER by " + kb(size - budget) : kb(budget - size) + " to spare"})  ${file}`,
  );
}
process.exit(over ? 1 : 0);
