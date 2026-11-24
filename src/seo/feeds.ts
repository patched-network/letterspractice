/**
 * Build-time text files for crawlers and feed readers: sitemap.xml, the
 * changelog's Atom feed (changelog.xml) and robots.txt. Pure string builders;
 * scripts/prerender-public.ts writes them into dist/. All URLs are absolute,
 * from the site origin (VITE_SITE_URL), as sitemaps and feeds require.
 */
import { changelogEntryMeta, SITE_NAME } from "../content/pages";
import { formatUpdateDate, updatePath, updateSummary, type RoadmapUpdate } from "../content/roadmap/updatesCore";

export const FEED_PATH = "/changelog.xml";
export const SITEMAP_PATH = "/sitemap.xml";
export const LLMS_PATH = "/llms.txt";

export function xmlEscape(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** An update's date as a timestamp: noon UTC, so readers anywhere show the same day. */
export function updateTimestamp(date: string): string {
    return `${date}T12:00:00Z`;
}

/** Root-relative href/src values made absolute, for HTML read off-site (feed readers). */
export function absolutizeLinks(html: string, siteUrl: string): string {
    return html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${siteUrl}/`);
}

export interface SitemapEntry {
    path: string;
    /** YYYY-MM-DD; omitted when we don't know when the page last changed */
    lastmod?: string;
}

export function buildSitemap(siteUrl: string, entries: SitemapEntry[]): string {
    const urls = entries.map(
        (e) =>
            `  <url><loc>${xmlEscape(siteUrl + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`,
    );
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
    ].join("\n");
}

/** Atom feed of the updates (newest first, as given). */
export function buildAtomFeed(siteUrl: string, updates: RoadmapUpdate[]): string {
    const changelogUrl = `${siteUrl}/changelog`;
    const entries = updates.map((u) => {
        const url = siteUrl + updatePath(u);
        const { lead } = updateSummary(u);
        const title = lead ? lead.replace(/\.$/, "") : `Update, ${formatUpdateDate(u.date)}`;
        const at = updateTimestamp(u.date);
        return [
            "  <entry>",
            `    <title>${xmlEscape(title)}</title>`,
            `    <link rel="alternate" type="text/html" href="${xmlEscape(url)}"/>`,
            `    <id>${xmlEscape(url)}</id>`,
            `    <published>${at}</published>`,
            `    <updated>${at}</updated>`,
            `    <summary>${xmlEscape(changelogEntryMeta(u).description)}</summary>`,
            `    <content type="html">${xmlEscape(absolutizeLinks(u.html, siteUrl))}</content>`,
            "  </entry>",
        ].join("\n");
    });
    return [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        `  <title>${SITE_NAME} changelog</title>`,
        `  <subtitle>Updates to ${SITE_NAME}, an early-literacy app for young children.</subtitle>`,
        `  <link rel="self" type="application/atom+xml" href="${xmlEscape(siteUrl + FEED_PATH)}"/>`,
        `  <link rel="alternate" type="text/html" href="${xmlEscape(changelogUrl)}"/>`,
        `  <id>${xmlEscape(changelogUrl)}</id>`,
        `  <updated>${updates.length ? updateTimestamp(updates[0].date) : "1970-01-01T00:00:00Z"}</updated>`,
        `  <author><name>${SITE_NAME}</name></author>`,
        ...entries,
        "</feed>",
        "",
    ].join("\n");
}

/** A deployment's additions to robots.txt (scripts/prerender-public.ts reads them from ROBOTS_* env). */
export interface RobotsExtras {
    /** More sitemaps on this site, as paths ("/blog/sitemap.xml") or absolute URLs */
    sitemaps?: string[];
    /**
     * A Content-Signal value ("search=yes, ai-input=yes, ai-train=yes"): the
     * site's stated permissions for search, AI answers and AI training, per
     * the proposed convention at https://contentsignals.org. Goes in the
     * `User-agent: *` group.
     */
    contentSignal?: string;
}

/** `key=yes|no` pairs, comma-separated: what a Content-Signal value may be. */
export const CONTENT_SIGNAL = /^[a-z-]+=(yes|no)(\s*,\s*[a-z-]+=(yes|no))*$/;

/**
 * public/robots.txt plus the deployment's extras, ending with the sitemaps.
 * Any Sitemap line already in the file (commented or not) is dropped, so the
 * origin only ever comes from the build.
 */
export function buildRobots(robots: string, siteUrl: string, extras: RobotsExtras = {}): string {
    let lines = robots.split("\n").filter((line) => !/^\s*#?\s*sitemap\s*:/i.test(line));
    if (extras.contentSignal) {
        const signal = `Content-Signal: ${extras.contentSignal}`;
        const group = lines.findIndex((line) => /^\s*user-agent\s*:\s*\*\s*$/i.test(line));
        if (group === -1) lines = ["User-agent: *", signal, "", ...lines];
        else lines.splice(group + 1, 0, signal);
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const sitemaps = [SITEMAP_PATH, ...(extras.sitemaps ?? [])].map((s) =>
        /^https?:\/\//i.test(s) ? s : `${siteUrl}${s.startsWith("/") ? "" : "/"}${s}`,
    );
    return `${lines.join("\n")}\n\n${sitemaps.map((s) => `Sitemap: ${s}`).join("\n")}\n`;
}

export interface LlmsPage {
    path: string;
    title: string;
    description: string;
}

/**
 * llms.txt (llmstxt.org): Markdown opening with an H1. The hand-written intro
 * (src/content/llms.md, placeholders already filled) followed by the public
 * pages, each linked with what it is, from the same list as the sitemap
 * (content/pages.ts), so a page added there appears in both. Throws if the
 * intro doesn't open with an H1 or still has a {{placeholder}}.
 */
export function buildLlmsTxt(siteUrl: string, intro: string, pages: LlmsPage[]): string {
    if (!/^# \S/.test(intro)) throw new Error("llms.txt intro must open with an H1 (# Title)");
    const unfilled = intro.match(/\{\{[^}]*\}\}/);
    if (unfilled) throw new Error(`llms.txt intro has an unfilled placeholder: ${unfilled[0]}`);
    const text = (s: string) => s.replace(/([[\]])/g, "\\$1");
    // Page titles end " - LettersPractice" (pages.ts), which the H1 already says.
    const name = (title: string) => text(title.endsWith(` - ${SITE_NAME}`) ? title.slice(0, -` - ${SITE_NAME}`.length) : title);
    return [
        intro.trimEnd(),
        "",
        "## Pages",
        "",
        ...pages.map((p) => `- [${name(p.title)}](${siteUrl}${p.path}): ${p.description}`),
        "",
        "## Updates",
        "",
        `- [Changelog feed](${siteUrl}${FEED_PATH}): every update to the site, newest first (Atom)`,
        "",
    ].join("\n");
}
