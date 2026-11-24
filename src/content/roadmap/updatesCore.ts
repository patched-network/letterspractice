/**
 * The pure half of the roadmap updates (see updates.ts): parsing, paths, and
 * plain-text summaries. Kept free of import.meta.glob so build scripts run it
 * under Node too (scripts/prerender-public.ts builds the feed, sitemap and
 * page titles from the same files). And free of marked, which the browser
 * would then load at boot: the caller renders (updatesMarkdown.ts at build
 * time; the app gets the files as HTML already).
 */

export interface RoadmapUpdate {
    /** ISO YYYY-MM-DD, from the filename. */
    date: string;
    /** The file's first line, as plain text. */
    title: string;
    /** The first line rendered inline (may hold links, emphasis). */
    titleHtml: string;
    /** Everything after the first line. May be empty. */
    html: string;
}

const TITLE_BLOCK = /^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/i;

const DATED_FILE = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/;

function isRealDate(iso: string): boolean {
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Pure: path → file contents in, rendered by `toHtml` (renderUpdateMarkdown for
 * markdown; the app's files arrive as HTML already); newest-first updates plus
 * rejected paths out.
 */
export function parseUpdates(files: Record<string, string>, toHtml: (contents: string) => string): {
    updates: RoadmapUpdate[];
    rejected: string[];
} {
    const updates: RoadmapUpdate[] = [];
    const rejected: string[] = [];
    for (const [path, source] of Object.entries(files)) {
        const date = DATED_FILE.exec(path)?.[1];
        if (!date || !isRealDate(date) || !source.trim()) {
            rejected.push(path);
            continue;
        }
        const rendered = toHtml(source);
        const head = TITLE_BLOCK.exec(rendered);
        const titleHtml = head ? head[1].trim() : "";
        const html = head ? rendered.slice(head[0].length) : rendered;
        updates.push({ date, title: htmlToText(titleHtml), titleHtml, html });
    }
    updates.sort((a, b) => b.date.localeCompare(a.date));
    return { updates, rejected };
}

/** The update's own page: its permalink. */
export function updatePath(u: RoadmapUpdate): string {
    return `/changelog/${u.date}`;
}

export function formatUpdateDate(iso: string): string {
    // Parse as local noon so the date never shifts across a timezone boundary.
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Rendered markdown → plain text: tags dropped, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
    return html
        .replace(/<\/(p|li|h[1-6]|blockquote|pre|tr)>|<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
            if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
            const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        })
        .replace(/\s+/g, " ")
        .trim();
}

/** An update as plain text: `lead` is its title (first line), `rest` the body. */
export function updateSummary(u: RoadmapUpdate): { lead: string; rest: string } {
    return { lead: u.title, rest: htmlToText(u.html) };
}

/** Cut at a word boundary to at most `max` characters, with an ellipsis when cut. */
export function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    // The last space within the first `max` characters: a word that ends
    // exactly at the limit survives. One very long word: cut it instead.
    let end = text.slice(0, max).lastIndexOf(" ");
    if (end < max / 2) end = max - 1;
    return `${text.slice(0, end).replace(/[\s,.;:–—-]+$/, "")}…`;
}
