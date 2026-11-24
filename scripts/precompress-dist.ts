/**
 * Post-build (build:webapp, after the prerender): a brotli copy beside each
 * compressible file in dist/ (`assets/index-….js` → `assets/index-….js.br`),
 * for a server that serves precompressed sidecars to browsers that accept
 * brotli and falls back to the file itself (or its own on-the-fly gzip) for
 * the rest. Caddy: `file_server { precompressed br }`, keeping `encode gzip`.
 * A server without that setting ignores the .br files.
 *
 * Why at build time: brotli's best level (11) is too slow to run per
 * request, and it's the level that pays. On the entry chunk: gzip 519 KB,
 * brotli 11 410 KB (−21%); its stylesheet 54 → 31 KB. Brotli at an
 * on-the-fly level, or Caddy's on-the-fly zstd, recovers little of that.
 *
 * Skips source maps (not fetched by visitors), already-compressed formats,
 * and files where brotli saves under 10% or 512 bytes.
 *
 *   npx tsx scripts/precompress-dist.ts [dist]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";

const compress = promisify(brotliCompress);
const DIST = resolve(process.argv[2] ?? "dist");
const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|xml|txt|webmanifest)$/;
const MIN_SAVING = 512;
const MIN_RATIO = 0.9; // the .br must be under 90% of the original
const CONCURRENCY = 4; // zlib's async work runs on libuv's thread pool (4 by default)

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // dist/audio is a symlink to the shared audio store on the server, and
    // isn't in the build anyway; follow no symlinks.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walk(path, out);
    else if (COMPRESSIBLE.test(entry.name)) out.push(path);
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  const files: string[] = [];
  await walk(DIST, files);

  let written = 0;
  let rawBytes = 0;
  let brBytes = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const raw = await readFile(file);
      const br = await compress(raw, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        },
      });
      if (raw.length - br.length < MIN_SAVING || br.length > raw.length * MIN_RATIO) continue;
      await writeFile(file + ".br", br);
      written++;
      rawBytes += raw.length;
      brBytes += br.length;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  console.log(
    `[precompress] ${written} of ${files.length} files: ${kb(rawBytes)} → ${kb(brBytes)} brotli ` +
      `(${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
}

main().catch((err) => {
  console.error("[precompress]", err);
  process.exit(1);
});
