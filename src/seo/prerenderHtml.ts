/**
 * One prerendered page's HTML: the built index.html (the "shell") with the
 * page's own title, description, preview tags (image included), canonical
 * link and robots, and a static copy of the rendered page inside #app. Pure
 * string templating; scripts/prerender-public.ts supplies the rendered markup.
 *
 * Each tag it rewrites must appear in the shell exactly once. If index.html
 * changes shape (a tag renamed, duplicated or removed) this throws, so the
 * build fails instead of shipping pages with the wrong head.
 */

export interface PrerenderHead {
    title: string;
    description: string;
    /** Absolute; null leaves og:url/twitter:url as the shell has them, with no canonical link */
    canonicalUrl: string | null;
    /** Serialized JSON-LD (seo/structuredData.ts serializeJsonLd), or null for none */
    jsonLd?: string | null;
    /** The preview image, URL absolute; null leaves the shell's og:image/twitter:image */
    image?: { url: string; width: number; height: number; alt?: string } | null;
    /** Keep the page out of search results (a robots meta) */
    noindex?: boolean;
}

/** Text for an HTML text node (the static copy of a page that isn't rendered in a browser) */
export function textEscape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function attrEscape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
    const matches = html.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
    if (matches?.length !== 1) {
        throw new Error(`prerender: expected exactly one ${what} in index.html, found ${matches?.length ?? 0}`);
    }
    return html.replace(pattern, () => replacement);
}

function setMetaContent(html: string, attr: "name" | "property", key: string, value: string): string {
    const pattern = new RegExp(`(<meta\\s+${attr}="${key.replace(/[.:]/g, "\\$&")}"\\s+content=")[^"]*(")`);
    const m = pattern.exec(html);
    return replaceOnce(html, pattern, `${m?.[1] ?? ""}${attrEscape(value)}${m?.[2] ?? ""}`, `<meta ${attr}="${key}">`);
}

/**
 * A page whose static copy is partly shown before the app mounts (index.html,
 * [data-prerender-show]): its wrapper is marked so, and Vuetify's theme
 * stylesheet, which the app otherwise only writes at runtime, comes along in
 * the head so the shown part has its colours from the first paint.
 */
export interface PrerenderShown {
    themeCss: string | null;
}

export function renderPrerenderedPage(
    shell: string,
    head: PrerenderHead,
    appHtml: string,
    shown?: PrerenderShown,
): string {
    let html = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>${textEscape(head.title)}</title>`, "<title>");
    html = setMetaContent(html, "name", "title", head.title);
    html = setMetaContent(html, "name", "description", head.description);
    html = setMetaContent(html, "property", "og:title", head.title);
    html = setMetaContent(html, "property", "og:description", head.description);
    html = setMetaContent(html, "name", "twitter:title", head.title);
    html = setMetaContent(html, "name", "twitter:description", head.description);
    const added: string[] = [];
    if (head.canonicalUrl) {
        html = setMetaContent(html, "property", "og:url", head.canonicalUrl);
        html = setMetaContent(html, "name", "twitter:url", head.canonicalUrl);
        added.push(`<link rel="canonical" href="${attrEscape(head.canonicalUrl)}" />`);
    }
    if (head.image) {
        const { url, width, height, alt } = head.image;
        html = setMetaContent(html, "property", "og:image", url);
        html = setMetaContent(html, "name", "twitter:image", url);
        added.push(`<meta property="og:image:width" content="${width}" />`);
        added.push(`<meta property="og:image:height" content="${height}" />`);
        if (alt) {
            added.push(`<meta property="og:image:alt" content="${attrEscape(alt)}" />`);
            added.push(`<meta name="twitter:image:alt" content="${attrEscape(alt)}" />`);
        }
    }
    if (head.noindex) added.push(`<meta name="robots" content="noindex" />`);
    if (head.jsonLd) added.push(`<script type="application/ld+json">${head.jsonLd}</script>`);
    // The id differs from Vuetify's own (vuetify-theme-stylesheet), which it
    // adds at mount; the two hold the same rules.
    if (shown?.themeCss) added.push(`<style id="vuetify-theme-prerendered">${shown.themeCss.replace(/<\//g, "<\\/")}</style>`);
    if (added.length) {
        html = replaceOnce(html, /<\/head>/, `\n        ${added.join("\n        ")}\n    </head>`, "</head>");
    }
    return replaceOnce(
        html,
        /<div id="app"><\/div>/,
        `<div id="app"><div data-prerendered${shown ? '="show"' : ""}>${appHtml}</div></div>`,
        '<div id="app"></div>',
    );
}
