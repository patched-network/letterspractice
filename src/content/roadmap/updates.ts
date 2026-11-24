/**
 * /roadmap "Recent Updates": one markdown file per update, named by its date.
 *
 *     src/content/roadmap/updates/YYYY-MM-DD.md
 *
 * The filename is the date. The first line is the title: rendered as the
 * entry's heading, and used as its page title and feed entry title
 * (updateSummary), so keep it a phrase that stands on its own. A leading `#`
 * is allowed but not needed. The rest is the body, as any markdown (usually a
 * lead paragraph, then bullets), and may be empty. To add an update, add a file.
 * Internal links (`[its own page](/fridge)`) navigate in-app (useInAppLinks).
 *
 * Each update also has its own page, /changelog/YYYY-MM-DD (updatePath;
 * ChangelogEntryView), which /roadmap's dates link to. The filename is the
 * permalink, so don't rename a file once it has shipped.
 *
 * Files are rendered to HTML at build time and bundled as HTML
 * (import.meta.glob, ?html: scripts/vite-plugin-markdown-html.ts), so the app
 * ships no markdown parser. The content is repo-authored, so the HTML is
 * trusted and not sanitized; don't route user-supplied text through here. The same files feed
 * the build's Atom feed, sitemap and prerendered pages
 * (scripts/prerender-public.ts), through the pure half in updatesCore.ts.
 *
 * A misnamed file (e.g. `2026-11-2.md`), an impossible date, or an empty body
 * is skipped with a warning rather than breaking the page;
 * updates.test.ts fails on any such file, so it can't land silently.
 */
import { parseUpdates, type RoadmapUpdate } from "./updatesCore";

export * from "./updatesCore";

/** Path → the file rendered to HTML (at build time). */
export const updateFiles = import.meta.glob<string>("./updates/*.md", {
    query: "?html",
    import: "default",
    eager: true,
});

const parsed = parseUpdates(updateFiles, (html) => html);
if (parsed.rejected.length) {
    console.warn("[roadmap] skipped update files (need YYYY-MM-DD.md, non-empty):", parsed.rejected);
}

export const roadmapUpdates: RoadmapUpdate[] = parsed.updates;
