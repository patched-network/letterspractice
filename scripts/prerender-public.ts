/**
 * Post-build (build:webapp): make the public pages readable without
 * JavaScript, and write the files crawlers look for.
 *
 *   dist/sitemap.xml     every public page and changelog entry
 *   dist/changelog.xml   Atom feed of the changelog
 *   dist/robots.txt      public/robots.txt plus the Sitemap lines (and ROBOTS_* extras)
 *   dist/llms.txt        src/content/llms.md plus the public pages, for language models (llmstxt.org)
 *   dist/_prerendered/<path>.html   each public page, rendered (/: home.html)
 *                                   and each lesson preview, head only
 *
 * Why: the app renders in the browser, so the HTML the server sends is the
 * same empty shell on every route. Search engines that run JavaScript (Google)
 * cope; most AI crawlers and every link-preview bot (Slack, iMessage, X,
 * Bluesky…) see only the shell's site-wide title and description. Each public
 * page's HTML now carries its own head (title, description, og:/twitter:,
 * canonical) and a static copy of its content, which a browser running
 * JavaScript never displays (see [data-prerendered] in index.html).
 *
 * How: serve dist/ locally, load each page (src/content/pages.ts, plus one per
 * changelog entry) in headless Chromium with every non-local request blocked
 * (no CouchDB, analytics or fonts; the public pages render without them),
 * copy the rendered #app minus SVG, inline styles and comments, and template
 * it into the built index.html (src/seo/prerenderHtml.ts). Each alias gets a
 * copy whose canonical link names the main path.
 *
 * Lesson previews (/curriculum/lesson/<id>, LESSON_PAGES) aren't rendered:
 * the page is the interactive lesson, which has little text and needs audio
 * and media this browser can't reach. They get their head (own title,
 * description and preview card, noindex) over a short static copy, at the
 * lesson's path and at each of its /c/l/ short links: the router's redirect
 * from a short link runs in the browser, which preview bots don't. They're
 * not in the sitemap.
 *
 * Serving: the server maps a path to its file. For Caddy:
 *     @home path /
 *     rewrite @home /_prerendered/home.html
 *     @app {
 *         not path /.well-known/*
 *         file {
 *             try_files {path} /_prerendered{path}.html /index.html
 *         }
 *     }
 *     rewrite @app {file_match.relative}
 * (`try_files`, spelled out to leave /.well-known/ alone.) A missing
 * /.well-known/ file must be a 404, not the app's index.html with a 200:
 * crawlers and agents probe there (Lighthouse's agentic-browsing audit fetches
 * /.well-known/ard.json and ai-catalog.json) and read the HTML as a broken
 * manifest. The site has no agent resources to list, so no manifest.
 * The files sit in their own directory so that none is named like a route.
 * A dist/changelog/ directory, say, would be matched by the older
 * `try_files {path} {path}/ /index.html`, and /changelog would redirect to
 * /changelog/, or 404 without an index.html in it (the 2026-10-08 /curriculum
 * bug; src/router/publicCollision.test.ts). Under that older config these
 * files simply go unused, so the build can ship before the server change.
 *
 * Env: VITE_SITE_URL (.env.production or the environment), the site's origin,
 * for canonical links, the sitemap, the feed and llms.txt; unset, those are skipped.
 * Optional, for robots.txt (src/seo/feeds.ts, buildRobots), so that a
 * deployment's own policy stays out of this repo:
 *   ROBOTS_SITEMAPS        more sitemaps on the site, comma-separated paths
 *                          or URLs (e.g. a blog served under /blog/)
 *   ROBOTS_CONTENT_SIGNAL  a Content-Signal value, e.g.
 *                          "search=yes, ai-input=yes, ai-train=yes"
 * SKIP_PRERENDER=1 writes the text files and skips the browser. The build
 * fails if a page renders blank, or if its runtime head (services/pageMeta.ts:
 * title, description, canonical, structured data) disagrees with the static one.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type BrowserContext } from "playwright";
import { loadEnv } from "vite";
import {
    LESSON_PAGES,
    PUBLIC_PAGES,
    SITE_IMAGE,
    changelogEntryMeta,
    type PageImage,
    type PageMeta,
    type PublicPage,
} from "../src/content/pages";
import { parseUpdates, updatePath } from "../src/content/roadmap/updatesCore";
import { renderUpdateMarkdown } from "../src/content/roadmap/updatesMarkdown";
import { buildAtomFeed, buildLlmsTxt, buildRobots, buildSitemap, CONTENT_SIGNAL, FEED_PATH, LLMS_PATH, SITEMAP_PATH } from "../src/seo/feeds";
import { renderPrerenderedPage, textEscape } from "../src/seo/prerenderHtml";
import { pricingSentence, socialUrls, withPitch, type Pitch } from "../src/deployment/pitch";
import { changelogEntryJsonLd, homeJsonLd, serializeJsonLd } from "../src/seo/structuredData";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const UPDATES_DIR = join(ROOT, "src/content/roadmap/updates");
/** A plain-data file from the deployment's overlay (src/deployment/index.ts), or null without one. */
async function loadOverlay<T>(name: string): Promise<T | null> {
    const file = join(ROOT, "src/deployment/overlay", name);
    if (!existsSync(file)) return null;
    return ((await import(pathToFileURL(file).href)) as { default: T }).default;
}

/** Under dist/; the server's rewrite names it (see the header) */
const PRERENDERED = "_prerendered";
/**
 * Less rendered text than this means the page didn't render: an unmounted app
 * has none, the boot splash ~20 characters. The thinnest real page, /newsletter
 * (a heading, a line and a form), has ~200.
 */
const MIN_TEXT = 100;

interface Target extends PageMeta {
    path: string;
    aliases: string[];
    lastmod?: string;
    /** Serialized structured data (home and changelog entries, given a site URL) */
    jsonLd: string | null;
    image: PageImage;
    /** Out of search results and the sitemap */
    noindex: boolean;
    /** Not rendered in the browser: this static copy goes in #app instead */
    staticBody?: string;
}

interface Snapshot {
    html: string;
    text: number;
    title: string;
    description: string | null;
    canonical: string | null;
    robots: string | null;
    ogImage: string | null;
    jsonLd: string | null;
    /** `[data-deferred-pending]` elements at snapshot time: content still loading
     *  (DeferredSection.vue; <html> while inlineMarkup loads its fact resolver) */
    pending: number;
    /** Part of the copy is shown before mount ([data-prerender-show]) */
    shown: boolean;
    /** Vuetify's runtime theme stylesheet, for a shown copy's first paint */
    themeCss: string | null;
    errors: string[];
}

// Runs in the page, as source text: tsx can add helpers to compiled
// functions that don't exist in the page.
//
// Shown before mount: a page can mark a subtree [data-prerender-show] (the
// landing page's hero). Then that subtree, and every element containing it,
// keep what makes them look as the app draws them (inline
// styles, Vue's scoped-style attributes, and inside the marked subtree, SVG;
// except a [data-prerender-blank] part, whose script-drawn content was sized for
// the prerender's own viewport and so is left empty),
// and the outermost elements outside them are tagged data-prerender-off, which
// index.html hides. That includes the app bar: its contents are chosen in
// script by window width (CourseHeader's `narrow`), so the copy, taken at the
// prerender's 1280 px, would be the wide header on a phone. Its space is held
// by v-main's padding, so the header just appears at mount. Everything else is reduced as before: text and structure
// for crawlers.
const SNAPSHOT_JS = `(() => {
  const app = document.querySelector("#app").cloneNode(true);
  const shown = [...app.querySelectorAll("[data-prerender-show]")];
  const kept = shown;
  const inKept = (el) => kept.some((k) => k === el || k.contains(el));
  const holdsKept = (el) => kept.some((k) => el.contains(k));
  const visible = (el) => kept.length > 0 && (inKept(el) || holdsKept(el));
  // [data-prerender-blank] inside a shown part: drawn by script at the
  // prerender's own width (the hero's LetterPeople), so it keeps its structure
  // but loses its SVG and inline styles, and its component's CSS holds the space.
  const blanks = [...app.querySelectorAll("[data-prerender-blank]")];
  const inBlank = (el) => blanks.some((b) => b === el || b.contains(el));
  app.querySelectorAll("svg, script, style, template, noscript, canvas, video, audio, iframe").forEach((el) => {
    if (el.tagName.toLowerCase() === "svg" && shown.some((s) => s.contains(el)) && !inBlank(el)) return;
    el.remove();
  });
  blanks.forEach((b) => [b, ...b.querySelectorAll("*")].forEach((el) => el.removeAttribute("style")));
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  app.querySelectorAll("*").forEach((el) => {
    if (visible(el)) return;
    for (const a of [...el.attributes]) if (a.name === "style" || a.name.startsWith("data-v-")) el.removeAttribute(a.name);
    const parent = el.parentElement;
    if (kept.length && (!parent || parent === app || visible(parent))) el.setAttribute("data-prerender-off", "");
  });
  const head = (sel, attr) => document.head.querySelector(sel)?.getAttribute(attr) ?? null;
  return {
    html: app.innerHTML,
    text: app.textContent.replace(/\\s+/g, " ").trim().length,
    title: document.title,
    description: head('meta[name="description"]', "content"),
    canonical: head('link[rel="canonical"]', "href"),
    robots: head('meta[name="robots"]', "content"),
    ogImage: head('meta[property="og:image"]', "content"),
    jsonLd: document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? null,
    pending: document.querySelectorAll("[data-deferred-pending]").length,
    shown: shown.length > 0,
    themeCss: shown.length ? (document.getElementById("vuetify-theme-stylesheet")?.textContent ?? null) : null,
  };
})()`;

async function main(): Promise<void> {
    const env = loadEnv("production", ROOT, ["VITE_", "ROBOTS_"]);
    const siteUrl = (env.VITE_SITE_URL ?? "").replace(/\/+$/, "");
    if (siteUrl && !/^https?:\/\/[^/\s]+$/.test(siteUrl)) {
        throw new Error(`VITE_SITE_URL must be an origin like https://example.com, got "${siteUrl}"`);
    }

    const names = (await readdir(UPDATES_DIR)).filter((f) => f.endsWith(".md"));
    const files = Object.fromEntries(
        await Promise.all(names.map(async (f) => [`./updates/${f}`, await readFile(join(UPDATES_DIR, f), "utf8")])),
    );
    const { updates, rejected } = parseUpdates(files, renderUpdateMarkdown);
    if (rejected.length) throw new Error(`update files need a YYYY-MM-DD.md name and a body: ${rejected.join(", ")}`);
    const newest = updates[0]?.date;

    // The deployment's pitch and own pages: the same files the app's globs pick
    // up, so the static heads match the runtime ones.
    const pitch = await loadOverlay<Pitch>("pitch.ts");
    const extraPages = (await loadOverlay<PublicPage[]>("pages.ts")) ?? [];
    const pages = [...PUBLIC_PAGES, ...extraPages].map((p) => (p.name === "home" ? { ...p, ...withPitch(p, pitch) } : p));

    const targets: Target[] = [
        ...pages.map((p) => ({
            path: p.path,
            title: p.title,
            description: p.description,
            aliases: p.aliases ?? [],
            jsonLd: siteUrl && p.name === "home" ? serializeJsonLd(homeJsonLd(siteUrl, socialUrls(pitch))) : null,
            // These two show the latest updates; other pages' change dates we don't track.
            lastmod: p.path === "/roadmap" || p.path === "/changelog" ? newest : undefined,
            image: p.image ?? SITE_IMAGE,
            noindex: false,
        })),
        ...updates.map((u) => ({
            path: updatePath(u),
            ...changelogEntryMeta(u),
            aliases: [],
            lastmod: u.date,
            jsonLd: siteUrl ? serializeJsonLd(changelogEntryJsonLd(u, siteUrl)) : null,
            image: SITE_IMAGE,
            noindex: false,
        })),
        ...LESSON_PAGES.map((p) => ({
            path: p.path,
            title: p.title,
            description: p.description,
            aliases: p.aliases,
            jsonLd: null,
            image: p.image,
            noindex: true,
            staticBody:
                `<main><h1>${textEscape(p.heading)}</h1><p>${textEscape(p.description)}</p>` +
                `<p><a href="/curriculum">See the whole curriculum</a></p></main>`,
        })),
    ];

    if (siteUrl) {
        await writeFile(join(DIST, SITEMAP_PATH), buildSitemap(siteUrl, targets.filter((t) => !t.noindex)));
        await writeFile(join(DIST, FEED_PATH), buildAtomFeed(siteUrl, updates));
        // src/content/llms.md, with the hero's pricing line: the deployment's
        // (deployment/pitch.ts), or nothing in the open build.
        const pricing = pricingSentence(pitch);
        // Its {{access}} line: the deployment's further access notes, as bullets.
        const access = (pitch?.access ?? []).map((a) => `- ${a}\n`).join("");
        const intro = (await readFile(join(ROOT, "src/content/llms.md"), "utf8"))
            .replaceAll("{{pricing}}", pricing ? `${pricing} ` : "")
            .replace(/^\{\{access\}\}\n/m, access);
        await writeFile(join(DIST, LLMS_PATH), buildLlmsTxt(siteUrl, intro, pages));
        const contentSignal = env.ROBOTS_CONTENT_SIGNAL?.trim() || undefined;
        if (contentSignal && !CONTENT_SIGNAL.test(contentSignal)) {
            throw new Error(`ROBOTS_CONTENT_SIGNAL should be key=yes|no pairs, got "${contentSignal}"`);
        }
        const sitemaps = (env.ROBOTS_SITEMAPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const robots = await readFile(join(ROOT, "public/robots.txt"), "utf8");
        await writeFile(join(DIST, "robots.txt"), buildRobots(robots, siteUrl, { sitemaps, contentSignal }));
        const indexed = targets.filter((t) => !t.noindex).length;
        console.log(`[prerender] sitemap.xml (${indexed} pages), changelog.xml (${updates.length} entries), robots.txt, llms.txt`);
    } else {
        console.warn("[prerender] VITE_SITE_URL unset: no sitemap.xml, changelog.xml, llms.txt or canonical links");
    }

    if (process.env.SKIP_PRERENDER === "1") {
        console.log("[prerender] SKIP_PRERENDER=1: pages not rendered");
        return;
    }

    const shell = await readFile(join(DIST, "index.html"), "utf8");
    const snapshots = await renderAll(targets.filter((t) => !t.staticBody));

    const failures: string[] = [];
    const out = new Map<string, string>(); // absolute file → html
    for (const t of targets) {
        const canonicalUrl = siteUrl ? siteUrl + t.path : null;
        const image = siteUrl ? { ...t.image, url: siteUrl + t.image.path } : null;
        const head = { title: t.title, description: t.description, canonicalUrl, jsonLd: t.jsonLd, image, noindex: t.noindex };
        if (t.staticBody !== undefined) {
            const html = renderPrerenderedPage(shell, head, t.staticBody);
            for (const p of [t.path, ...t.aliases]) out.set(fileFor(p), html);
            console.log(`[prerender] ${t.path.padEnd(24)}   head only, noindex` + (t.aliases.length ? `  (+ ${t.aliases.join(", ")})` : ""));
            continue;
        }
        const snap = snapshots.get(t.path)!;
        if (snap.text < MIN_TEXT) failures.push(`${t.path}: rendered only ${snap.text} characters of text`);
        if (snap.pending) failures.push(`${t.path}: deferred content still loading when the copy was taken (${snap.pending} [data-deferred-pending])`);
        if (snap.title !== t.title) failures.push(`${t.path}: runtime title "${snap.title}", expected "${t.title}"`);
        if (snap.description !== t.description) failures.push(`${t.path}: runtime description differs from pages.ts`);
        if (snap.canonical !== canonicalUrl) failures.push(`${t.path}: runtime canonical ${snap.canonical}, expected ${canonicalUrl}`);
        if (snap.robots !== null) failures.push(`${t.path}: runtime robots "${snap.robots}" on a public page`);
        if (snap.jsonLd !== t.jsonLd) failures.push(`${t.path}: runtime structured data differs from the static`);
        if (image && snap.ogImage !== image.url) failures.push(`${t.path}: runtime og:image ${snap.ogImage}, expected ${image.url}`);
        const html = renderPrerenderedPage(shell, head, snap.html, snap.shown ? { themeCss: snap.themeCss } : undefined);
        for (const p of [t.path, ...t.aliases]) out.set(fileFor(p), html);
        console.log(
            `[prerender] ${t.path.padEnd(24)} ${String(snap.text).padStart(6)} chars ${(html.length / 1024).toFixed(0).padStart(4)} KB` +
                (t.aliases.length ? `  (+ ${t.aliases.join(", ")})` : "") +
                (snap.errors.length ? `  page errors: ${snap.errors.join(" | ").slice(0, 160)}` : ""),
        );
    }
    if (failures.length) throw new Error(`prerender checks failed:\n  ${failures.join("\n  ")}`);

    await rm(join(DIST, PRERENDERED), { recursive: true, force: true }); // no stale pages from an earlier run

    for (const [file, html] of out) {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, html);
    }
    console.log(`[prerender] wrote ${out.size} files in dist/${PRERENDERED}/`);
}

function fileFor(path: string): string {
    const dir = join(DIST, PRERENDERED);
    const file = path === "/" ? join(dir, "home.html") : resolve(dir, `.${path}.html`);
    if (!file.startsWith(dir + sep)) throw new Error(`prerender: path escapes dist/${PRERENDERED}/: ${path}`);
    return file;
}

async function renderAll(targets: Target[]): Promise<Map<string, Snapshot>> {
    const browser = await chromium.launch().catch((e: Error) => {
        throw new Error(
            `can't start Chromium (${e.message.split("\n")[0]}). Install it with ` +
                "`yarn playwright install chromium`, or set SKIP_PRERENDER=1 to build without prerendered pages.",
        );
    });
    const server = await serveDist();
    try {
        const context = await browser.newContext({ serviceWorkers: "block" });
        // Content that normally waits to be scrolled near (the landing page's
        // later sections, components/landing/DeferredSection.vue) renders at
        // once: the static copy has to hold the whole page.
        // (Source text, like SNAPSHOT_JS.)
        await context.addInitScript("window.__LP_PRERENDER__ = true;");
        await context.route("**/*", (route) =>
            route.request().url().startsWith(`${server.origin}/`) ? route.continue() : route.abort(),
        );
        const out = new Map<string, Snapshot>();
        for (const t of targets) out.set(t.path, await renderOne(context, server.origin, t));
        return out;
    } finally {
        await browser.close();
        server.close();
    }
}

async function renderOne(context: BrowserContext, origin: string, t: Target): Promise<Snapshot> {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
        await page.goto(origin + t.path, { waitUntil: "load", timeout: 30_000 });
        // Mounted (Vue marks its container data-v-app; children alone could
        // be the boot splash), the router's afterEach has applied the page's
        // head, and nothing deferred is still loading ([data-deferred-pending]:
        // components/landing/DeferredSection.vue, components/landing/inlineMarkup.ts).
        await page
            .waitForFunction(
                `document.title === ${JSON.stringify(t.title)}` +
                    ` && document.querySelector("#app[data-v-app]")?.childElementCount > 0` +
                    ` && !document.querySelector("[data-deferred-pending]")`,
                null,
                { timeout: 20_000 },
            )
            .catch(() => {}); // the checks in main() report what's wrong
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(500); // onMounted work and first-frame layout
        return { ...((await page.evaluate(SNAPSHOT_JS)) as Omit<Snapshot, "errors">), errors };
    } finally {
        await page.close();
    }
}

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
};

/** dist/ over HTTP, with the SPA fallback (unknown paths get index.html). */
async function serveDist(): Promise<{ origin: string; close: () => void }> {
    const isFile = (f: string) => stat(f).then((s) => s.isFile(), () => false);
    const server = http.createServer(async (req, res) => {
        try {
            const path = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
            let file = resolve(DIST, `.${path}`);
            if (!file.startsWith(DIST + sep) || !(await isFile(file))) file = join(DIST, "index.html");
            res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
            res.end(await readFile(file));
        } catch (e) {
            res.writeHead(500);
            res.end(String(e));
        }
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

main().catch((e: unknown) => {
    console.error(`[prerender] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
