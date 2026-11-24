/**
 * Does the page paint before the app's script starts running? It should:
 * scripts/vite-plugin-boot-after-paint.ts starts the entry chunk only after
 * the first paint, so the prerendered hero never waits for the seconds of
 * evaluation behind it.
 *
 * The case it guards against is the entry script arriving before the
 * stylesheet. Then, with Vite's plain `<script type="module">`, Chromium can
 * start evaluating before it paints, and first paint waits for all of it
 * (reproduced here at 4× CPU: FCP 3.1 s instead of ~1 s; lighthouse-metrics
 * saw FCP ~3.8 s in half its regions). So this holds the stylesheet back
 * (700 ms), slows the CPU 4×, and fails (exit 1) if the entry chunk's
 * evaluation starts before first contentful paint in any run.
 *
 *   npx tsx scripts/perf/paint-before-boot.ts <url> [--runs 3] [--compare]
 *
 * --compare also loads each page with the loader swapped back for Vite's
 * plain tag and reports it (expected to fail sometimes; not counted).
 * Against a local production build (scripts/perf/serve-dist.mjs). Chromium
 * only. Evaluation start is the entry's first DOM call: Vite's modulepreload
 * polyfill, at the top of the chunk, creates a <link>.
 */
import { chromium, type Browser } from "playwright";

const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: npx tsx scripts/perf/paint-before-boot.ts <url> [--runs 3] [--compare]");
  process.exit(2);
}
const runsAt = argv.indexOf("--runs");
const runs = runsAt >= 0 ? Number(argv[runsAt + 1]) : 3;
const compare = argv.includes("--compare");

const LOADER = /<link rel="modulepreload" crossorigin href="([^"]+)" fetchpriority="low">\s*<script>[\s\S]*?<\/script>/;

async function load(browser: Browser, plainTag: boolean): Promise<{ fcp: number; evaluation: number }> {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 } });
  try {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const create = document.createElement.bind(document);
      document.createElement = ((tag: string, options?: ElementCreationOptions) => {
        const w = window as unknown as { __entryEvaluatedAt?: number };
        if (w.__entryEvaluatedAt === undefined && tag.toLowerCase() === "link") w.__entryEvaluatedAt = performance.now();
        return create(tag, options);
      }) as typeof document.createElement;
    });
    await page.route(/\/assets\/index-[^/]+\.css$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    if (plainTag) {
      await page.route(url!, async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        const src = LOADER.exec(html)?.[1];
        if (!src) throw new Error("no boot-after-paint loader in the page");
        const body = html.replace(LOADER, `<script type="module" crossorigin src="${src}"></script>`);
        await route.fulfill({ response, body, headers: { ...response.headers(), "content-length": String(Buffer.byteLength(body)) } });
      });
    }
    await page.goto(url!, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("#app[data-v-app]"), null, { timeout: 60_000 });
    return await page.evaluate(() => ({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN,
      evaluation: (window as unknown as { __entryEvaluatedAt?: number }).__entryEvaluatedAt ?? NaN,
    }));
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
let failed = false;
try {
  for (let i = 1; i <= runs; i++) {
    for (const plainTag of compare ? [false, true] : [false]) {
      const { fcp, evaluation } = await load(browser, plainTag);
      const ok = evaluation >= fcp;
      if (!plainTag && !ok) failed = true;
      console.log(
        `[paint-before-boot] ${plainTag ? "plain <script> tag" : "build as is"}, run ${i}/${runs}: ` +
          `FCP ${Math.round(fcp)} ms, entry evaluation from ${Math.round(evaluation)} ms — ` +
          (ok ? "ok" : plainTag ? "evaluated before first paint" : "FAIL: evaluated before first paint"),
      );
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
