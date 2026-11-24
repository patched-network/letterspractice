// Email "Practice" CTA button image export.
//
// Drives a headless Chromium against the dev-only /__cta-export route (which
// renders the production Practice CTA from HubChoices.vue), screenshots the
// button, and writes a single PNG to public/email/nudge-cta.png — the image
// the re-engagement nudge email links to (src/services/lifecycleEmail.ts).
//
// Colours are a fresh random draw per render (BRAND_COLOR_TRANSFORM), so each
// run reshuffles the per-letter palette — intended on-brand behaviour. Wired
// into deploy-letterspractice (runs before `yarn build:webapp`).
//
// Usage:
//   yarn export:email-cta
//   LP_EXPORT_SERVER=http://localhost:5173 yarn export:email-cta   # reuse running dev server
//   LP_OUT=/tmp/cta.png yarn export:email-cta                      # custom output path

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join(PROJECT_ROOT, "public", "email", "nudge-cta.png");

// Display width is 260px in the email; render at 2x for retina crispness.
const TARGET_WIDTH = 520;

async function spawnViteServer(): Promise<{ url: string; proc: ChildProcess }> {
  const port = 5180; // distinct from default 5173 and export-letterpeople's 5179
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

async function main() {
  const outPath = process.env.LP_OUT ? path.resolve(process.env.LP_OUT) : DEFAULT_OUT;
  const reuseServer = process.env.LP_EXPORT_SERVER;

  let serverUrl: string;
  let serverProc: ChildProcess | undefined;
  if (reuseServer) {
    serverUrl = reuseServer.replace(/\/+$/, "");
    console.log(`[cta-export] reusing existing server at ${serverUrl}`);
  } else {
    console.log(`[cta-export] spawning vite dev server...`);
    const spawned = await spawnViteServer();
    serverUrl = spawned.url;
    serverProc = spawned.proc;
    console.log(`[cta-export] vite ready at ${serverUrl}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    // deviceScaleFactor 3 → screenshot is super-sampled; sharp downscales to
    // TARGET_WIDTH for a crisp result.
    const page = await browser.newPage({
      viewport: { width: 600, height: 400, deviceScaleFactor: 3 },
    });

    await page.goto(new URL("/__cta-export", serverUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        (window as unknown as { __ctaReady?: boolean }).__ctaReady === true ||
        !!(window as unknown as { __ctaError?: string }).__ctaError,
      undefined,
      { timeout: 15_000 },
    );
    const err = await page.evaluate(
      () => (window as unknown as { __ctaError?: string }).__ctaError,
    );
    if (err) throw new Error(`harness: ${err}`);

    // Screenshot the padded wrap so the button's outset drop-shadow is included.
    const handle = await page.$(".cta-wrap");
    if (!handle) throw new Error("no .cta-wrap element found");
    const raw = await handle.screenshot({ omitBackground: true, type: "png" });

    await mkdir(path.dirname(outPath), { recursive: true });
    const out = await sharp(raw)
      .resize({ width: TARGET_WIDTH })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(outPath, out);

    console.log(`[cta-export] wrote ${outPath} (${out.byteLength}B, ${TARGET_WIDTH}px wide)`);
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
