// LetterPeople SVG/PNG asset export.
//
// Iterates the cartesian product of letters × cases × poses × hue modes,
// driving a headless Chromium against the dev-only /__letter-export route
// and writing static SVG + PNG assets plus a manifest.
//
// Usage:
//   yarn export:letterpeople
//   LP_LETTERS=A,a yarn export:letterpeople              # subset of letters
//   LP_POSES=resting,waving yarn export:letterpeople     # subset of poses
//   LP_EXPORT_SERVER=http://localhost:5173 yarn export:letterpeople  # reuse running dev server
//   LP_OUT=/tmp/assets-test yarn export:letterpeople     # custom output dir
//   LP_NO_PNG=1 yarn export:letterpeople                 # skip PNG generation
//   LP_FROZEN_TIME=2026-01-01T00:00:00Z yarn export:letterpeople  # freeze manifest timestamp

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser } from "playwright";
import { optimize } from "svgo";
import sharp from "sharp";

import { POSES, POSE_NAMES, type PoseName } from "./poses";
import { seedToHue } from "./seed";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_OUT_DIR = path.join(PROJECT_ROOT, "assets-export");

const HUE_MODES = ["auto", "neutral"] as const;
type HueMode = (typeof HUE_MODES)[number];

interface LetterId {
  letter: string;
  case: "upper" | "lower";
  id: string; // e.g. "A-upper"
}

function allLetters(): LetterId[] {
  const out: LetterId[] = [];
  for (let c = 65; c <= 90; c++) {
    const upper = String.fromCharCode(c);
    const lower = String.fromCharCode(c + 32);
    out.push({ letter: upper, case: "upper", id: `${upper}-upper` });
    out.push({ letter: lower, case: "lower", id: `${lower}-lower` });
  }
  return out;
}

function parseEnvList<T extends string>(env: string | undefined, all: readonly T[]): T[] {
  if (!env) return [...all];
  const parts = env.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.filter((p): p is T => (all as readonly string[]).includes(p));
}

function filterLetters(env: string | undefined): LetterId[] {
  const all = allLetters();
  if (!env) return all;
  const want = new Set(env.split(",").map((s) => s.trim()).filter(Boolean));
  return all.filter((l) => want.has(l.letter) || want.has(l.id));
}

// ---------------------------------------------------------------------------
// Vite dev server lifecycle
// ---------------------------------------------------------------------------

async function spawnViteServer(): Promise<{ url: string; proc: ChildProcess }> {
  const port = 5179; // distinct from default 5173 to avoid clash with developer's running server
  const proc = spawn("yarn", ["dev", "--port", String(port), "--strictPort"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = `http://localhost:${port}`;

  await new Promise<void>((resolve, reject) => {
    let buf = "";
    const timeout = setTimeout(() => reject(new Error("vite startup timeout")), 60_000);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (/ready in|Local:\s+http/i.test(buf)) {
        clearTimeout(timeout);
        proc.stdout?.off("data", onData);
        resolve();
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (c) => process.stderr.write(c));
    proc.on("exit", (code) => {
      if (code !== 0) reject(new Error(`vite exited early with code ${code}`));
    });
  });

  return { url, proc };
}

// ---------------------------------------------------------------------------
// Per-render extraction
// ---------------------------------------------------------------------------

interface RenderJob {
  letter: LetterId;
  pose: PoseName;
  hueMode: HueMode;
}

async function renderOne(
  browser: Browser,
  serverUrl: string,
  job: RenderJob,
  outDir: string,
  generatePng: boolean,
): Promise<{ svgBytes: number; pngBytes?: number; png2xBytes?: number }> {
  const seed = job.letter.id;
  const url = new URL("/__letter-export", serverUrl);
  url.searchParams.set("letter", job.letter.letter);
  url.searchParams.set("case", job.letter.case);
  url.searchParams.set("pose", job.pose);
  url.searchParams.set("hue", job.hueMode);
  url.searchParams.set("seed", seed);

  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () =>
        (window as unknown as { __letterReady?: boolean; __letterError?: string }).__letterReady === true ||
        !!(window as unknown as { __letterError?: string }).__letterError,
      undefined,
      { timeout: 15_000 },
    );

    const err = await page.evaluate(
      () => (window as unknown as { __letterError?: string }).__letterError,
    );
    if (err) throw new Error(`harness: ${err}`);

    // Locate the rendered SVG inside the harness container.
    const svgHandle = await page.$(".letter-container svg");
    if (!svgHandle) throw new Error("no <svg> found in .letter-container");

    // Inject a <title> into the SVG (accessibility + SVGO preserves it).
    const titleText = `${job.letter.letter} — ${job.pose}`;
    await svgHandle.evaluate((el, title) => {
      const ns = "http://www.w3.org/2000/svg";
      const t = document.createElementNS(ns, "title");
      t.textContent = title;
      el.insertBefore(t, el.firstChild);
    }, titleText);

    const rawSvg = await svgHandle.evaluate((el) => el.outerHTML);

    // SVGO pass.
    const optimized = optimize(rawSvg, {
      multipass: true,
      // SVGO v4's preset-default keeps viewBox and titles by default. Path
      // rewriting is disabled: convertPathData collapsed multi-arc glyphs
      // (lowercase s became a single arc, j lost its inner curve) — the
      // renderers' path data is already minimal, so nothing is lost.
      plugins: [
        {
          name: "preset-default",
          params: { overrides: { convertPathData: false, mergePaths: false } },
        },
      ],
    });
    const svgOut = optimized.data;

    // Subdir per letter, neutral assets in a parallel "neutral" subtree
    const root = job.hueMode === "neutral" ? `${outDir}-neutral` : outDir;
    const letterDir = path.join(root, job.letter.id);
    await mkdir(letterDir, { recursive: true });

    const svgPath = path.join(letterDir, `${job.pose}.svg`);
    await writeFile(svgPath, svgOut, "utf8");

    let pngBytes: number | undefined;
    let png2xBytes: number | undefined;
    if (generatePng) {
      const elShot = await svgHandle.boundingBox();
      if (!elShot) throw new Error("no bounding box for svg");

      // Screenshot at 2x via deviceScaleFactor would be ideal but page-level only;
      // keep simple: screenshot at native, then resize via sharp to target heights.
      const buf = await svgHandle.screenshot({ omitBackground: true, type: "png" });

      const png1x = await sharp(buf).resize({ height: 256 }).png({ compressionLevel: 9 }).toBuffer();
      const png2x = await sharp(buf).resize({ height: 512 }).png({ compressionLevel: 9 }).toBuffer();

      const png1Path = path.join(letterDir, `${job.pose}.png`);
      const png2Path = path.join(letterDir, `${job.pose}@2x.png`);
      await writeFile(png1Path, png1x);
      await writeFile(png2Path, png2x);
      pngBytes = png1x.byteLength;
      png2xBytes = png2x.byteLength;
    }

    return { svgBytes: Buffer.byteLength(svgOut, "utf8"), pngBytes, png2xBytes };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Manifest writers
// ---------------------------------------------------------------------------

interface PerLetterMeta {
  letter: string;
  case: "upper" | "lower";
  hue: number;
  poses: PoseName[];
  files: Record<string, { svg: string; png1x?: string; png2x?: string }>;
}

interface Manifest {
  version: string;
  generated: string;
  letters: Array<{
    id: string;
    letter: string;
    case: "upper" | "lower";
    hue: number;
    poses: PoseName[];
    files: PerLetterMeta["files"];
  }>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const letters = filterLetters(process.env.LP_LETTERS);
  const poses = parseEnvList<PoseName>(process.env.LP_POSES, POSE_NAMES);
  const generatePng = process.env.LP_NO_PNG !== "1";
  const outDir = process.env.LP_OUT ? path.resolve(process.env.LP_OUT) : DEFAULT_OUT_DIR;
  const frozenTime = process.env.LP_FROZEN_TIME ?? new Date().toISOString();
  const reuseServer = process.env.LP_EXPORT_SERVER;

  // Sort everything for deterministic output
  letters.sort((a, b) => a.id.localeCompare(b.id));
  poses.sort();

  console.log(`[export] letters=${letters.length} poses=${poses.length} hueModes=${HUE_MODES.length}`);
  console.log(`[export] output: ${outDir}`);

  // Wipe + recreate output dir for idempotency
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const neutralDir = `${outDir}-neutral`;
  if (existsSync(neutralDir)) await rm(neutralDir, { recursive: true, force: true });
  await mkdir(neutralDir, { recursive: true });

  let serverUrl: string;
  let serverProc: ChildProcess | undefined;
  if (reuseServer) {
    serverUrl = reuseServer.replace(/\/+$/, "");
    console.log(`[export] reusing existing server at ${serverUrl}`);
  } else {
    console.log(`[export] spawning vite dev server...`);
    const spawned = await spawnViteServer();
    serverUrl = spawned.url;
    serverProc = spawned.proc;
    console.log(`[export] vite ready at ${serverUrl}`);
  }

  const browser = await chromium.launch({ headless: true });

  const startMs = Date.now();
  const perLetter = new Map<string, PerLetterMeta>();

  try {
    for (const letter of letters) {
      const hue = seedToHue(letter.id);
      const meta: PerLetterMeta = {
        letter: letter.letter,
        case: letter.case,
        hue,
        poses: [...poses],
        files: {},
      };
      perLetter.set(letter.id, meta);

      for (const pose of poses) {
        for (const hueMode of HUE_MODES) {
          const t0 = Date.now();
          const res = await renderOne(
            browser,
            serverUrl,
            { letter, pose, hueMode },
            outDir,
            generatePng,
          );
          const dt = Date.now() - t0;
          process.stdout.write(
            `[export] ${letter.id} ${pose} ${hueMode} svg=${res.svgBytes}B${
              res.pngBytes !== undefined ? ` png=${res.pngBytes}B/${res.png2xBytes}B` : ""
            } (${dt}ms)\n`,
          );
        }

        // Record canonical (auto-hue) file paths in meta. Neutral lives in a parallel tree.
        meta.files[pose] = {
          svg: `${letter.id}/${pose}.svg`,
          ...(generatePng
            ? {
                png1x: `${letter.id}/${pose}.png`,
                png2x: `${letter.id}/${pose}@2x.png`,
              }
            : {}),
        };
      }

      await writeFile(
        path.join(outDir, letter.id, "meta.json"),
        JSON.stringify(meta, null, 2),
        "utf8",
      );
    }

    // Top-level manifest
    const manifest: Manifest = {
      version: frozenTime.split("T")[0].replace(/-/g, "."),
      generated: frozenTime,
      letters: [...perLetter.values()].map((m) => ({
        id: `${m.letter}-${m.case}`,
        letter: m.letter,
        case: m.case,
        hue: m.hue,
        poses: m.poses,
        files: m.files,
      })),
    };

    await writeFile(
      path.join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const totalMs = Date.now() - startMs;
    console.log(`[export] done in ${totalMs}ms — ${perLetter.size} letters × ${poses.length} poses × ${HUE_MODES.length} hue modes`);
  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill("SIGTERM");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
