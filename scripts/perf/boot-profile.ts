/**
 * Where does a page load's main-thread time go? Loads a URL once in a fresh
 * Chromium profile with the V8 CPU profiler on, and reports:
 *   - a timeline: the app's console logs, first paint, LCP, long tasks
 *   - CPU self-time by source package/directory and by function, split at
 *     first contentful paint, mapped through the build's sourcemaps
 *
 *   npx tsx scripts/perf/boot-profile.ts <url> [--dist dist] [--cpu 1] [--settle 15] [--trace]
 *     --cpu     CPU slowdown via DevTools emulation (default 1: none)
 *     --settle  seconds to keep profiling after the load event (default 15)
 *     --trace   also record a Chrome trace and report style recalculation,
 *               layout and stylesheet parsing: totals, and the largest ones
 *               with the script that forced them
 *     --system-fonts  let Chromium see every installed font (Linux; see fonts.ts)
 *
 * No network throttling. This is about CPU; lighthouse.ts covers the network.
 * Viewport is Lighthouse's mobile one (412×823, DPR 1.75) so the same layout
 * renders. Writes .perf/profile-<time>.cpuprofile (opens in DevTools'
 * Performance panel) next to the printed report.
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
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
  console.error("usage: npx tsx scripts/perf/boot-profile.ts <url> [--dist dist] [--cpu 1] [--settle 15] [--trace] [--system-fonts]");
  process.exit(2);
}
const DIST = resolve(flag("dist", "dist"));
const CPU = Number(flag("cpu", "1"));
const SETTLE_MS = Number(flag("settle", "15")) * 1000;
const TRACE = argv.includes("--trace");

interface CallFrame { functionName: string; url: string; lineNumber: number; columnNumber: number }
interface ProfileNode { id: number; callFrame: CallFrame }
interface Profile { nodes: ProfileNode[]; startTime: number; endTime: number; samples: number[]; timeDeltas: number[] }

const fonts = fontEnv(argv);
const browser = await chromium.launch({ args: ["--no-sandbox"], env: { ...process.env, ...fonts } });
const context = await browser.newContext({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.addInitScript(() => {
  const w = window as unknown as { __perf: { longtasks: [number, number][]; lcp: number; fcp: number } };
  w.__perf = { longtasks: [], lcp: 0, fcp: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__perf.longtasks.push([e.startTime, e.duration]);
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") w.__perf.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
});

const cdp = await context.newCDPSession(page);
// Same-origin first, so the profiled navigation stays in this renderer.
await page.goto(new URL("/robots.txt", url).href);
if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
const logs: { t: number; text: string }[] = [];
await cdp.send("Runtime.enable");
cdp.on("Runtime.consoleAPICalled", (e: { timestamp: number; args: { value?: unknown; description?: string }[] }) => {
  const text = e.args.map((a) => (a.value !== undefined ? String(a.value) : (a.description ?? ""))).join(" ");
  logs.push({ t: e.timestamp, text });
});
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
if (TRACE) {
  await browser.startTracing(page, {
    categories: ["devtools.timeline", "blink.user_timing", "loading", "disabled-by-default-devtools.timeline.stack"],
  });
}
await cdp.send("Profiler.start");
const profilerStartWall = Date.now();
await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.waitForTimeout(SETTLE_MS);
const { profile } = (await cdp.send("Profiler.stop")) as { profile: Profile };
const traceBuf = TRACE ? await browser.stopTracing() : null;
const perf = await page.evaluate(() => {
  const w = window as unknown as { __perf: { longtasks: [number, number][]; lcp: number; fcp: number } };
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  return { ...w.__perf, timeOrigin: performance.timeOrigin, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
});
await browser.close();

// Profile time (µs, monotonic) → page time (ms since navigation start), via
// the wall clock at Profiler.start. Good to a few ms.
const profToPage = (us: number) => (us - profile.startTime) / 1000 + (profilerStartWall - perf.timeOrigin);

// ---- sourcemap attribution -------------------------------------------------
const consumers = new Map<string, SourceMapConsumer | null>();
function consumerFor(scriptUrl: string): SourceMapConsumer | null {
  if (consumers.has(scriptUrl)) return consumers.get(scriptUrl)!;
  let c: SourceMapConsumer | null = null;
  try {
    const p = new URL(scriptUrl).pathname;
    const mapPath = join(DIST, p + ".map");
    if (p.startsWith("/assets/") && existsSync(mapPath)) c = new SourceMapConsumer(JSON.parse(readFileSync(mapPath, "utf8")));
  } catch {
    c = null;
  }
  consumers.set(scriptUrl, c);
  return c;
}
function bucket(src: string): string {
  const s = src.replace(/^(\.\.\/)+/, "");
  const nm = s.match(/node_modules\/((@[^/]+\/)?[^/]+)/);
  if (nm) return nm[1];
  const parts = s.split("/");
  return parts.slice(0, Math.min(parts.length - 1, 2)).join("/") || s;
}
const nodeInfo = new Map<number, { bucket: string; fn: string }>();
for (const n of profile.nodes) {
  const cf = n.callFrame;
  let b: string;
  let fn = cf.functionName || "(anonymous)";
  if (!cf.url) b = cf.functionName || "(native)";
  else {
    const c = consumerFor(cf.url);
    const pos = c?.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
    if (pos?.source) {
      b = bucket(pos.source);
      fn = `${pos.name ?? fn} (${pos.source.replace(/^(\.\.\/)+/, "").replace(/^.*node_modules\//, "")}:${pos.line})`;
    } else b = new URL(cf.url).host === new URL(url).host ? new URL(cf.url).pathname : new URL(cf.url).host;
  }
  nodeInfo.set(n.id, { bucket: b, fn });
}

type Tally = Map<string, number>;
const windows = { pre: { b: new Map(), f: new Map() }, post: { b: new Map(), f: new Map() } } as Record<"pre" | "post", { b: Tally; f: Tally }>;
let t = profile.startTime;
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i];
  const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
  const info = nodeInfo.get(profile.samples[i])!;
  if (info.bucket === "(idle)") continue;
  const w = profToPage(t) < perf.fcp ? windows.pre : windows.post;
  w.b.set(info.bucket, (w.b.get(info.bucket) ?? 0) + dt);
  w.f.set(info.fn, (w.f.get(info.fn) ?? 0) + dt);
}

// ---- report ----------------------------------------------------------------
const s = (msv: number) => `${(msv / 1000).toFixed(2)} s`;
const out: string[] = [];
out.push(
  `# Boot profile: ${url}`,
  "",
  `CPU slowdown ${CPU}×, no network throttling, settle ${SETTLE_MS / 1000} s, ` +
    `${fonts.FONTCONFIG_FILE ? "minimal fonts" : "system fonts"}.`,
  "",
);
out.push(`DOMContentLoaded ${s(perf.dcl)} · load ${s(perf.load)} · FCP ${s(perf.fcp)} · LCP ${s(perf.lcp)}`, "");
const lt = perf.longtasks;
out.push(
  `Long tasks: ${lt.length}, ${s(lt.reduce((a, [, d]) => a + d, 0))} total; ` +
    `blocking (each minus 50 ms) after FCP: ${s(lt.filter(([st]) => st >= perf.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0))}.`,
  "",
);
out.push("## Timeline", "", "```");
const events: [number, string][] = [
  [perf.dcl, "— DOMContentLoaded"],
  [perf.load, "— load"],
  [perf.fcp, "— FCP"],
  [perf.lcp, "— LCP"],
  ...lt.map(([st, d]) => [st, `  long task ${Math.round(d)} ms`] as [number, string]),
  ...logs.map((l) => [l.t - perf.timeOrigin, `  log: ${l.text.replace(/\s+/g, " ").slice(0, 110)}`] as [number, string]),
];
for (const [at, what] of events.sort((a, b) => a[0] - b[0]).slice(0, 120)) out.push(`${s(at).padStart(8)}  ${what}`);
out.push("```");
for (const [name, w] of [["before FCP", windows.pre], ["after FCP", windows.post]] as const) {
  const total = [...w.b.values()].reduce((a, b) => a + b, 0);
  out.push("", `## CPU ${name}: ${s(total)}`, "", "| self time | package / dir |", "|---|---|");
  for (const [k, v] of [...w.b].sort((a, b) => b[1] - a[1]).slice(0, 20)) out.push(`| ${s(v)} | ${k} |`);
  out.push("", "| self time | function |", "|---|---|");
  for (const [k, v] of [...w.f].sort((a, b) => b[1] - a[1]).slice(0, 25)) out.push(`| ${s(v)} | ${k.replace(/\|/g, "\\|")} |`);
}

// ---- trace: style, layout, stylesheet parsing -------------------------------
interface TraceFrame { functionName: string; url: string; lineNumber: number; columnNumber: number }
interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: {
    data?: { documentLoaderURL?: string; isLoadingMainFrame?: boolean; styleSheetUrl?: string };
    elementCount?: number;
    beginData?: { dirtyObjects?: number; totalObjects?: number; stackTrace?: TraceFrame[] };
  };
}
if (traceBuf) {
  const events = (JSON.parse(traceBuf.toString("utf8")) as { traceEvents: TraceEvent[] }).traceEvents;
  const nav = events.find(
    (e) => e.name === "navigationStart" && e.args?.data?.isLoadingMainFrame && e.args.data.documentLoaderURL?.startsWith(url),
  );
  if (!nav) out.push("", "(trace: no navigationStart for the page; skipped)");
  else {
    const main = events.filter((e) => e.pid === nav.pid && e.tid === nav.tid && e.ph === "X" && e.dur !== undefined);
    const at = (e: TraceEvent) => (e.ts - nav.ts) / 1000;
    // Trace stack frames are 1-based in line and column.
    const forcedBy = (e: TraceEvent) => {
      const f = e.args?.beginData?.stackTrace?.[0];
      if (!f) return "";
      const pos = consumerFor(f.url)?.originalPositionFor({ line: f.lineNumber, column: Math.max(0, f.columnNumber - 1) });
      return pos?.source
        ? `${pos.name ?? f.functionName} (${pos.source.replace(/^(\.\.\/)+/, "").replace(/^.*node_modules\//, "")}:${pos.line})`
        : `${f.functionName || "(anonymous)"} (${shortPath(f.url)}:${f.lineNumber})`;
    };
    const shortPath = (u: string) => {
      try {
        return new URL(u).pathname;
      } catch {
        return u;
      }
    };
    const kinds = ["UpdateLayoutTree", "Layout", "ParseAuthorStyleSheet", "PrePaint", "Paint", "Layerize"];
    out.push("", "## Style and layout (trace)", "", "| work | before FCP | after FCP | count |", "|---|---|---|---|");
    for (const k of kinds) {
      const es = main.filter((e) => e.name === k);
      const pre = es.filter((e) => at(e) < perf.fcp).reduce((a, e) => a + e.dur! / 1000, 0);
      const post = es.filter((e) => at(e) >= perf.fcp).reduce((a, e) => a + e.dur! / 1000, 0);
      out.push(`| ${k} | ${s(pre)} | ${s(post)} | ${es.length} |`);
    }
    const top = (name: string, n: number) =>
      main
        .filter((e) => e.name === name)
        .sort((a, b) => b.dur! - a.dur!)
        .slice(0, n);
    out.push("", "Largest style recalculations:", "", "| at | duration | elements | forced by |", "|---|---|---|---|");
    for (const e of top("UpdateLayoutTree", 8)) {
      out.push(`| ${s(at(e))} | ${Math.round(e.dur! / 1000)} ms | ${e.args?.elementCount ?? "?"} | ${forcedBy(e) || "(rendering)"} |`);
    }
    out.push("", "Largest layouts:", "", "| at | duration | dirty / total objects | forced by |", "|---|---|---|---|");
    for (const e of top("Layout", 8)) {
      const b = e.args?.beginData;
      out.push(`| ${s(at(e))} | ${Math.round(e.dur! / 1000)} ms | ${b?.dirtyObjects ?? "?"} / ${b?.totalObjects ?? "?"} | ${forcedBy(e) || "(rendering)"} |`);
    }
    const sheets = top("ParseAuthorStyleSheet", 6);
    if (sheets.length) {
      out.push("", "Stylesheet parsing:", "");
      for (const e of sheets) out.push(`- ${Math.round(e.dur! / 1000)} ms ${shortPath(e.args?.data?.styleSheetUrl ?? "(inline)")}`);
    }
  }
}

mkdirSync(".perf", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(".perf", `profile-${stamp}.cpuprofile`), JSON.stringify(profile));
writeFileSync(join(".perf", `profile-${stamp}.md`), out.join("\n") + "\n");
console.log(out.join("\n"));
