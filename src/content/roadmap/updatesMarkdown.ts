/**
 * An update file's markdown → HTML. Build time only: the Vite plugin that
 * hands the app each file as HTML (scripts/vite-plugin-markdown-html.ts) and
 * the prerender (scripts/prerender-public.ts) call this; nothing the browser
 * loads imports it, so marked never ships. The content is repo-authored, so the
 * HTML is trusted and not sanitized (updates.ts).
 */
import { marked } from "marked";

/**
 * The file's first non-blank line is its title (a leading `#` is optional and
 * dropped); it renders inline, as the `<h1>` that opens the HTML. The rest
 * renders as ordinary markdown. parseUpdates splits the `<h1>` back off.
 */
export function renderUpdateMarkdown(source: string): string {
    const lines = source.replace(/^\s*\n/, "").split("\n");
    const title = (lines.shift() ?? "").replace(/^#+\s*/, "").trim();
    const body = lines.join("\n");
    return `<h1>${marked.parseInline(title, { async: false })}</h1>\n${marked.parse(body, { async: false })}`;
}
