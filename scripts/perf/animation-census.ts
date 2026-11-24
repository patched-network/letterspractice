/**
 * What keeps a page busy after it has loaded? Counts, over a window of
 * seconds, every requestAnimationFrame and setInterval callback by the source
 * line that scheduled it (through the build's sourcemaps), and lists the
 * running CSS/Web animations with whether their element is on screen.
 *
 *   npx tsx scripts/perf/animation-census.ts <url> [--dist dist] [--warmup 8] [--window 10] [--scroll 0]
 *     --warmup  seconds after load before counting (default 8)
 *     --window  seconds to count for (default 10)
 *     --scroll  scroll to this y before counting (default 0, the top)
 *
 * Mobile viewport, as in boot-profile.ts. A loop that's still running when
 * nothing on screen moves is the thing to look for.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { SourceMapConsumer } from "source-map-js";
import { fontEnv } from "./fonts";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const url = argv.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: npx tsx scripts/perf/animation-census.ts <url> [--dist dist] [--warmup 8] [--window 10] [--scroll 0]");
  process.exit(2);
}
const DIST = resolve(flag("dist", "dist"));
const WARMUP = Number(flag("warmup", "8")) * 1000;
const WINDOW = Number(flag("window", "10")) * 1000;
const SCROLL = Number(flag("scroll", "0"));

const browser = await chromium.launch({ args: ["--no-sandbox"], env: { ...process.env, ...fontEnv(argv) } });
const page = await (
  await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true })
).newPage();

// tsx (esbuild, keepNames) wraps named functions in a __name() helper, which
// doesn't exist in the page that page.evaluate() runs these callbacks in.
await page.addInitScript("window.__name = (f) => f;");
await page.addInitScript(() => {
  const counts = new Map<string, number>();
  const w = window as unknown as { __census: { counts: Map<string, number>; on: boolean } };
  w.__census = { counts, on: false };
  // The scheduling call site: the first stack frame outside this wrapper.
  const site = (kind: string) => {
    const lines = (new Error().stack ?? "").split("\n").slice(3);
    const frame = lines.find((l) => /https?:\/\//.test(l)) ?? lines[0] ?? "";
    const m = frame.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
    return m ? `${kind} ${m[1]}:${m[2]}:${m[3]}` : `${kind} ${frame.trim()}`;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    if (w.__census.on) {
      const k = site("raf");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return raf(cb);
  };
  const si = window.setInterval.bind(window);
  window.setInterval = ((cb: TimerHandler, ms?: number, ...rest: unknown[]) => {
    const k = site(`interval(${ms ?? 0}ms)`);
    const wrapped = typeof cb === "function"
      ? (...a: unknown[]) => {
          if (w.__census.on) counts.set(k, (counts.get(k) ?? 0) + 1);
          (cb as (...x: unknown[]) => void)(...a);
        }
      : cb;
    return si(wrapped as TimerHandler, ms, ...rest);
  }) as typeof window.setInterval;
});

await page.goto(url, { waitUntil: "load", timeout: 120_000 });
if (SCROLL) await page.evaluate((y) => window.scrollTo(0, y), SCROLL);
await page.waitForTimeout(WARMUP);
await page.evaluate(() => {
  (window as unknown as { __census: { on: boolean } }).__census.on = true;
});
await page.waitForTimeout(WINDOW);
const result = await page.evaluate(() => {
  const c = (window as unknown as { __census: { counts: Map<string, number>; on: boolean } }).__census;
  c.on = false;
  const onScreen = (el: Element | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
  };
  const describe = (el: Element | null) =>
    el ? `${el.tagName.toLowerCase()}${el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : ""}` : "(none)";
  const anims = new Map<string, { n: number; onScreen: number }>();
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue;
    const target = (a.effect as KeyframeEffect | null)?.target ?? null;
    const name =
      (a as CSSAnimation).animationName ??
      ((a as CSSTransition).transitionProperty ? `transition:${(a as CSSTransition).transitionProperty}` : a.id || "(web animation)");
    const k = `${name} on ${describe(target)}`;
    const v = anims.get(k) ?? { n: 0, onScreen: 0 };
    v.n++;
    if (onScreen(target)) v.onScreen++;
    anims.set(k, v);
  }
  return { counts: [...c.counts], anims: [...anims], scrollY: Math.round(scrollY) };
});
await browser.close();

// ---- map call sites through sourcemaps ---------------------------------------
const consumers = new Map<string, SourceMapConsumer | null>();
function mapSite(k: string): string {
  const m = k.match(/^(\S+) (https?:\/\/\S+):(\d+):(\d+)$/);
  if (!m) return k;
  const [, kind, u, line, col] = m;
  const p = new URL(u).pathname;
  if (!consumers.has(p)) {
    const mapPath = join(DIST, p + ".map");
    consumers.set(p, p.startsWith("/assets/") && existsSync(mapPath) ? new SourceMapConsumer(JSON.parse(readFileSync(mapPath, "utf8"))) : null);
  }
  const pos = consumers.get(p)?.originalPositionFor({ line: Number(line), column: Number(col) - 1 });
  return pos?.source
    ? `${kind} ${pos.source.replace(/^(\.\.\/)+/, "").replace(/^.*node_modules\//, "")}:${pos.line}`
    : `${kind} ${p}:${line}:${col}`;
}

const merged = new Map<string, number>();
for (const [k, n] of result.counts) {
  const mk = mapSite(k);
  merged.set(mk, (merged.get(mk) ?? 0) + n);
}
const secs = WINDOW / 1000;
console.log(`# Animation census: ${url}`);
console.log(`\nCounted for ${secs} s, from ${WARMUP / 1000} s after load, at scrollY ${result.scrollY}.\n`);
console.log("## Scheduled callbacks per second\n\n| per second | scheduled at |\n|---|---|");
for (const [k, n] of [...merged].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`| ${(n / secs).toFixed(1)} | ${k} |`);
console.log("\n## Running CSS/Web animations\n\n| count | on screen | animation on element |\n|---|---|---|");
for (const [k, v] of [...result.anims].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(`| ${v.n} | ${v.onScreen} | ${k} |`);
