/**
 * Does the landing page's hero survive the hand-over from its static copy
 * to the app? The hero shows from the prerendered HTML before the app loads
 * (index.html, [data-prerender-show]); Vue's mount replaces it. A good
 * hand-over is invisible. This holds the entry script back, takes the static
 * hero's measurements, lets the app load, and fails (exit 1) if, in any run:
 *
 *   - a tracked element's box moved by more than 1 px between the static
 *     copy and the mounted app (header excepted: the static copy leaves it out)
 *   - any text element of the static hero went missing, faded or moved in a
 *     frame around the mount: in Firefox at every actual paint (MozAfterPaint),
 *     elsewhere at every animation frame
 *   - a font face was still loading at mount (Firefox draws no text in a face
 *     that's loading: that's how the app bar's labels blinked)
 *   - layout shifts added up past 0.01 (Chromium only; the others lack the API)
 *
 * Some of these are races (Vuetify's layout settling a frame early or late),
 * so it runs several times.
 *
 *   npx tsx scripts/perf/hero-swap-check.ts <url> [--engine chromium|firefox|webkit]
 *       [--viewport mobile|desktop] [--runs 3]
 *
 * Against a local production build (scripts/perf/serve-dist.mjs). Exit 2 if
 * the browser can't start (WebKit on Linux needs `sudo npx playwright
 * install-deps webkit`). The vignette's letters arriving at mount is expected
 * and not counted (it reserves their space).
 */
import { chromium, firefox, webkit, type Browser, type BrowserType } from "playwright";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const url = argv.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error(
    "usage: npx tsx scripts/perf/hero-swap-check.ts <url> [--engine chromium|firefox|webkit] [--viewport mobile|desktop] [--runs 3]",
  );
  process.exit(2);
}
const engineName = flag("engine", "chromium");
const engine = ({ chromium, firefox, webkit } as Record<string, BrowserType>)[engineName];
const viewport = flag("viewport", "mobile");
const runs = Number(flag("runs", "3"));

const BOXES: Record<string, string> = {
  headline: ".hero-headline",
  vignette: ".hero-read",
  copy: ".hero-copy",
  subtitle: ".hero-copy p",
  cta: ".hero-cta-row",
};
// Text the static copy shows that must stay put through the mount.
const TEXT = ".hero-greeting h1, .hero-greeting p, .hero-greeting button";

// Page-side helpers, as source text (tsx would add helpers that don't exist there).
const PAGE_SETUP = `
  window.__shifts = (PerformanceObserver.supportedEntryTypes || []).includes("layout-shift") ? 0 : null;
  if (window.__shifts !== null) {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts += e.value; })
      .observe({ type: "layout-shift", buffered: true });
  }
  window.__boxes = (sel) => {
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      if (!el) { out[k] = null; continue; }
      const r = el.getBoundingClientRect();
      out[k] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    return out;
  };
  window.__text = (sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    let op = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    return [el.textContent.replace(/\\s+/g, " ").trim().slice(0, 40), Math.round(r.x), Math.round(r.y), Math.round(op * 100)];
  }).filter((t) => t[0]);
  // Frames from window.__recordFrom() until a second after mount: at each
  // paint where the browser reports them (Firefox), else each animation frame.
  window.__frames = []; window.__mountFonts = null; window.__recording = false;
  const sample = () => {
    if (!window.__recording) return;
    const mounted = !!document.querySelector("#app[data-v-app]");
    if (mounted && window.__mountFonts === null) {
      window.__mountFonts = [...document.fonts].filter((x) => x.status === "loading").map((x) => x.family + " " + x.weight);
      window.__mountedAt = performance.now();
    }
    window.__frames.push([Math.round(performance.now()), window.__text(${JSON.stringify(TEXT)})]);
    if (window.__mountedAt && performance.now() - window.__mountedAt > 1000) window.__recording = false;
  };
  window.__byPaint = typeof window.mozInnerScreenX === "number";
  if (window.__byPaint) window.addEventListener("MozAfterPaint", sample);
  window.__recordFrom = () => {
    window.__recording = true;
    if (!window.__byPaint) { const f = () => { sample(); if (window.__recording) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  };
`;

type Text = [string, number, number, number];

async function checkOnce(browser: Browser): Promise<{ failures: string[]; note: string }> {
  const mobile = viewport === "mobile";
  const ctx = await browser.newContext({
    serviceWorkers: "block",
    viewport: mobile ? { width: 412, height: 823 } : { width: 1440, height: 900 },
    ...(mobile && engine !== firefox ? { deviceScaleFactor: 1.75, isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(PAGE_SETUP);
  const page = await ctx.newPage();
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });

  const failures: string[] = [];
  await page.goto(url!, { waitUntil: "commit" }); // module scripts hold DOMContentLoaded
  await page.waitForSelector(".hero-headline", { state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500); // stylesheet, fonts
  if (!(await page.evaluate(() => !!document.querySelector('[data-prerendered="show"] .hero-greeting')))) {
    failures.push("the static hero isn't shown before mount");
  }
  const before = (await page.evaluate(`window.__boxes(${JSON.stringify(BOXES)})`)) as Record<string, number[] | null>;
  const staticText = (await page.evaluate(`window.__text(${JSON.stringify(TEXT)})`)) as Text[];
  await page.evaluate("window.__recordFrom()");
  release();
  await page.waitForFunction(() => document.querySelector("#app[data-v-app]"), null, { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const after = (await page.evaluate(`window.__boxes(${JSON.stringify(BOXES)})`)) as Record<string, number[] | null>;
  const frames = (await page.evaluate("window.__frames")) as [number, Text[]][];
  const mountFonts = (await page.evaluate("window.__mountFonts")) as string[] | null;
  const shifts = (await page.evaluate("window.__shifts")) as number | null;
  const byPaint = (await page.evaluate("window.__byPaint")) as boolean;
  await ctx.close();

  for (const k of Object.keys(BOXES)) {
    const a = before[k];
    const c = after[k];
    if (!a || !c) {
      failures.push(`${k}: ${a ? "gone after mount" : "missing from the static copy"}`);
      continue;
    }
    // The vignette's width follows its letters, which arrive at mount; its height is reserved.
    const dims = k === "vignette" ? [1, 3] : [0, 1, 2, 3];
    if (dims.some((i) => Math.abs(a[i] - c[i]) > 1)) failures.push(`${k}: box ${JSON.stringify(a)} → ${JSON.stringify(c)}`);
  }
  for (const [text, x, y] of staticText) {
    for (const [t, list] of frames) {
      const m = list.find((e) => e[0] === text);
      const problem = !m
        ? "not on the page"
        : m[3] < 100
          ? `at opacity ${m[3]}%`
          : Math.abs(m[1] - x) > 1 || Math.abs(m[2] - y) > 1
            ? `at (${m[1]}, ${m[2]}), was (${x}, ${y})`
            : null;
      if (problem) {
        failures.push(`"${text}" ${problem} at ${t} ms`);
        break;
      }
    }
  }
  if (frames.length === 0) failures.push("no frames recorded around the mount");
  if (mountFonts?.length) failures.push(`font faces still loading at mount: ${mountFonts.join(", ")}`);
  if (shifts !== null && shifts > 0.01) failures.push(`layout shift ${shifts.toFixed(4)}`);
  const note =
    `${staticText.length} static text elements, ${frames.length} ${byPaint ? "paints" : "frames"}, ` +
    `layout shift ${shifts === null ? "n/a" : shifts.toFixed(4)}`;
  return { failures, note };
}

const browser = await engine
  .launch(
    engine === chromium
      ? { args: ["--no-sandbox"] }
      : engine === firefox
        ? { firefoxUserPrefs: { "dom.send_after_paint_to_content": true } }
        : {},
  )
  .catch((err: Error) => {
    console.error(
      `[hero-swap-check] can't start ${engineName}: ` +
        (err.message.split("\n").find((l) => /missing|not found|install/i.test(l))?.trim() ?? err.message.split("\n")[0]),
    );
    process.exit(2);
  });

let failed = false;
for (let i = 1; i <= runs; i++) {
  const { failures, note } = await checkOnce(browser);
  console.log(`[hero-swap-check] ${engineName} ${viewport}, run ${i}/${runs}: ${note}${failures.length ? "" : " — ok"}`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  if (failures.length) failed = true;
}
await browser.close();
process.exit(failed ? 1 : 0);
