/**
 * Run Lighthouse's performance audit against a URL several times and
 * summarize: median metrics, plus where the time goes in the median run.
 *
 *   npx tsx scripts/perf/lighthouse.ts <url> [--runs 5] [--label name] [--out .perf] [--system-fonts] [--block <pattern>]…
 *
 * Settings are Lighthouse's defaults, the same ones PageSpeed Insights uses:
 * mobile form factor, simulated throttling (150 ms RTT, ~1.6 Mbps, 4× CPU
 * slowdown). The CPU slowdown is relative to the machine running the audit,
 * so absolute numbers move from machine to machine (the summary records
 * Lighthouse's benchmarkIndex for that reason). Compare runs made on one
 * machine.
 *
 * --resummarize rebuilds the summary from the reports already in
 * <out>/<label>/ (the URL is still required, for labelling).
 *
 * Writes <out>/<label>/run-N.json (full reports; open one in
 * https://googlechrome.github.io/lighthouse/viewer/), summary.json and
 * summary.md, and prints the summary.
 *
 * Lighthouse is fetched by npx at a pinned version, not a dependency. Chrome
 * is $CHROME_PATH if set, else Playwright's Chromium (a devDependency). On
 * Linux it sees only a few fonts (fonts.ts says why); --system-fonts to
 * measure with all of them.
 *
 * For a local production build served like production, use
 * scripts/perf/audit-local.sh, which builds, serves and calls this.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { fontEnv } from "./fonts";

const LIGHTHOUSE = "lighthouse@13.6.0";

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const url = argv.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: npx tsx scripts/perf/lighthouse.ts <url> [--runs 5] [--label name] [--out .perf] [--system-fonts]");
  process.exit(2);
}
const runs = Number(flag("runs", "5"));
const label = flag("label", new Date().toISOString().replace(/[:.]/g, "-"));
const outDir = resolve(flag("out", ".perf"), label);
mkdirSync(outDir, { recursive: true });

const chromePath = process.env.CHROME_PATH || chromium.executablePath();
const fonts = fontEnv(argv);

// ---- minimal shape of the parts of a Lighthouse report we read ------------
interface Audit {
  numericValue?: number;
  displayValue?: string;
  details?: { items?: Array<Record<string, unknown>>; overallSavingsBytes?: number };
}
interface Report {
  finalDisplayedUrl?: string;
  lighthouseVersion: string;
  environment: { benchmarkIndex: number; hostUserAgent: string };
  audits: Record<string, Audit | undefined>;
  runtimeError?: { code: string; message: string };
  runWarnings?: string[];
}

const METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["speed-index", "Speed Index"],
  ["total-blocking-time", "TBT"],
  ["interactive", "TTI"],
  ["cumulative-layout-shift", "CLS"],
] as const;

// ---- run ------------------------------------------------------------------
// --resummarize: rebuild summary.md/json from the run-N.json files already in
// <out>/<label>/, without running Lighthouse.
const resummarize = argv.includes("--resummarize");
const reports: Report[] = [];
for (let i = 1; i <= runs; i++) {
  const path = join(outDir, `run-${i}.json`);
  if (resummarize) {
    reports.push(JSON.parse(readFileSync(path, "utf8")) as Report);
    continue;
  }
  process.stderr.write(`[lighthouse] run ${i}/${runs} ${url}\n`);
  const r = spawnSync(
    "npx",
    [
      "-y",
      LIGHTHOUSE,
      url,
      "--only-categories=performance",
      "--output=json",
      `--output-path=${path}`,
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
      // --block <url pattern>, repeatable: what the page loses without them
      // (e.g. fonts.googleapis.com, an upper bound on self-hosting's gain).
      ...argv.flatMap((a, i) => (a === "--block" && argv[i + 1] ? [`--blocked-url-patterns=${argv[i + 1]}`] : [])),
    ],
    { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...fonts, CHROME_PATH: chromePath } },
  );
  if (r.status !== 0) {
    console.error(`[lighthouse] run ${i} failed (exit ${r.status})`);
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(path, "utf8")) as Report;
  if (report.runtimeError) {
    console.error(`[lighthouse] run ${i}: ${report.runtimeError.code} ${report.runtimeError.message}`);
    process.exit(1);
  }
  reports.push(report);
}

// ---- summarize ------------------------------------------------------------
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const num = (r: Report, id: string) => r.audits[id]?.numericValue ?? NaN;
const ms = (v: number) => (Number.isFinite(v) ? `${(v / 1000).toFixed(1)} s` : "–");
const kb = (v: number) => (Number.isFinite(v) ? `${Math.round(v / 1024)} KB` : "–");
const fmt = (id: string, v: number) => (id === "cumulative-layout-shift" ? v.toFixed(3) : ms(v));
const shortUrl = (u: unknown) => {
  const s = String(u ?? "");
  try {
    const p = new URL(s);
    return p.origin === new URL(url).origin ? p.pathname : `${p.host}${p.pathname}`;
  } catch {
    return s || "(unattributed)";
  }
};
const items = (r: Report, id: string) => r.audits[id]?.details?.items ?? [];

const metricRows = METRICS.map(([id, name]) => {
  const vals = reports.map((r) => num(r, id));
  return { id, name, median: median(vals), runs: vals };
});

// What the unthrottled load actually did. Simulated FCP can be badly wrong
// for a page whose first paint waits on a module script (this one's did: a
// flat 1.8 s against an observed 4 s), so these sit next to it.
const observed = (key: string) =>
  reports.map((r) => Number((r.audits.metrics?.details?.items?.[0] as Record<string, unknown> | undefined)?.[key] ?? NaN));
const observedRows = [
  { id: "observed-fcp", name: "FCP, observed unthrottled", vals: observed("observedFirstContentfulPaint") },
  { id: "observed-lcp", name: "LCP, observed unthrottled", vals: observed("observedLargestContentfulPaint") },
].map((o) => ({ ...o, median: median(o.vals) }));

// Bytes over the wire for the page's own scripts, and all of it.
const transfer = (r: Report, pred: (i: Record<string, unknown>) => boolean) =>
  items(r, "network-requests").filter(pred).reduce((a, i) => a + Number(i.transferSize ?? 0), 0);
const sameOrigin = (i: Record<string, unknown>) => {
  try {
    return new URL(String(i.url)).origin === new URL(url).origin;
  } catch {
    return false;
  }
};
const jsTransfer = median(reports.map((r) => transfer(r, (i) => i.resourceType === "Script" && sameOrigin(i))));
const totalTransfer = median(reports.map((r) => transfer(r, () => true)));

// The run whose TBT is the median stands for the set in the breakdowns.
const tbts = reports.map((r) => num(r, "total-blocking-time"));
const medTbt = median(tbts);
const rep = reports[tbts.indexOf([...tbts].sort((a, b) => Math.abs(a - medTbt) - Math.abs(b - medTbt))[0])];
const repIndex = reports.indexOf(rep) + 1;

const lines: string[] = [];
lines.push(`# Lighthouse: ${url}`);
lines.push("");
lines.push(
  `${runs} runs, Lighthouse ${rep.lighthouseVersion}, mobile, simulated throttling, ` +
    `${fonts.FONTCONFIG_FILE ? "minimal fonts" : "system fonts"}. ` +
    `benchmarkIndex ${reports.map((r) => Math.round(r.environment.benchmarkIndex)).join(", ")}.`,
);
lines.push("");
lines.push("| metric | median | runs |");
lines.push("|---|---|---|");
for (const m of metricRows) lines.push(`| ${m.name} | ${fmt(m.id, m.median)} | ${m.runs.map((v) => fmt(m.id, v)).join(", ")} |`);
for (const o of observedRows) lines.push(`| ${o.name} | ${ms(o.median)} | ${o.vals.map(ms).join(", ")} |`);
lines.push("");
lines.push(`Transfer (median): ${kb(jsTransfer)} of the page's own scripts, ${kb(totalTransfer)} in all.`);
lines.push("");
lines.push(`Breakdowns below are from run ${repIndex} (median TBT).`);

const missing: string[] = [];
function section(title: string, id: string, body: (its: Array<Record<string, unknown>>, a: Audit) => string[]) {
  const a = rep.audits[id];
  if (!a) {
    missing.push(id);
    return;
  }
  lines.push("", `## ${title}`, "");
  lines.push(...body(a.details?.items ?? [], a));
}

section("Transfer by type", "resource-summary", (its) => [
  "| type | requests | transfer |",
  "|---|---|---|",
  ...its.map((i) => `| ${i.label} | ${i.requestCount} | ${kb(Number(i.transferSize))} |`),
]);

section("Requests, largest first", "network-requests", (its) => [
  "| transfer | resource | type | start → end |",
  "|---|---|---|---|",
  ...[...its]
    .sort((a, b) => Number(b.transferSize) - Number(a.transferSize))
    .slice(0, 15)
    .map(
      (i) =>
        `| ${kb(Number(i.transferSize))} | ${shortUrl(i.url)} | ${i.resourceType} | ` +
        `${ms(Number(i.networkRequestTime))} → ${ms(Number(i.networkEndTime))} |`,
    ),
  "",
  "(Request times here are from the unthrottled load, not the simulated one.)",
]);

section("Main-thread work by category", "mainthread-work-breakdown", (its, a) => [
  `Total ${a.displayValue ?? ""}`,
  "",
  "| category | time |",
  "|---|---|",
  ...its.map((i) => `| ${i.groupLabel ?? i.group} | ${ms(Number(i.duration))} |`),
]);

section("Script cost (bootup-time)", "bootup-time", (its) => [
  "| script | total | evaluate | parse/compile |",
  "|---|---|---|---|",
  ...its
    .slice(0, 12)
    .map((i) => `| ${shortUrl(i.url)} | ${ms(Number(i.total))} | ${ms(Number(i.scripting))} | ${ms(Number(i.scriptParseCompile))} |`),
]);

section("Long tasks", "long-tasks", (its) => [
  `${its.length} tasks, ${ms(its.reduce((s, i) => s + Number(i.duration), 0))} in total.`,
  "",
  "| start | duration | attributed to |",
  "|---|---|---|",
  ...its.slice(0, 20).map((i) => `| ${ms(Number(i.startTime))} | ${Math.round(Number(i.duration))} ms | ${shortUrl(i.url)} |`),
]);

section("Unused JavaScript", "unused-javascript", (its, a) => [
  `Estimated savings: ${kb(a.details?.overallSavingsBytes ?? NaN)}.`,
  "",
  "| script | transfer | unused |",
  "|---|---|---|",
  ...its.slice(0, 10).map((i) => `| ${shortUrl(i.url)} | ${kb(Number(i.totalBytes))} | ${kb(Number(i.wastedBytes))} |`),
]);

section("Unused CSS", "unused-css-rules", (its, a) => [
  `Estimated savings: ${kb(a.details?.overallSavingsBytes ?? NaN)}.`,
  "",
  ...its.slice(0, 5).map((i) => `- ${shortUrl(i.url)}: ${kb(Number(i.totalBytes))} transferred, ${kb(Number(i.wastedBytes))} unused`),
]);

if (missing.length) lines.push("", `(Audits not in this Lighthouse version: ${missing.join(", ")}.)`);
if (rep.runWarnings?.length) lines.push("", "Warnings:", ...rep.runWarnings.map((w) => `- ${w}`));

const md = lines.join("\n") + "\n";
writeFileSync(join(outDir, "summary.md"), md);
writeFileSync(
  join(outDir, "summary.json"),
  JSON.stringify(
    {
      url,
      label,
      runs,
      lighthouse: rep.lighthouseVersion,
      fonts: fonts.FONTCONFIG_FILE ? "minimal" : "system",
      benchmarkIndex: reports.map((r) => r.environment.benchmarkIndex),
      metrics: Object.fromEntries([
        ...metricRows.map((m) => [m.id, { median: m.median, runs: m.runs }]),
        ...observedRows.map((o) => [o.id, { median: o.median, runs: o.vals }]),
      ]),
      transfer: { ownScripts: jsTransfer, total: totalTransfer },
      medianRun: repIndex,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(md);
process.stderr.write(`[lighthouse] wrote ${outDir}\n`);
