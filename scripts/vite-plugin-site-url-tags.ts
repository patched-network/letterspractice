/**
 * index.html's site-wide link-preview tags (og:url, og:image, twitter:url,
 * twitter:image) are absolute: `%VITE_SITE_URL%/...`. With VITE_SITE_URL set
 * (a deployment's build) Vite fills them in. Unset (local dev, a self-hosted
 * build without a site URL), this drops those tags instead: a relative og:image
 * is useless to preview bots, and leaving the placeholder makes Vite warn on
 * every page load. Same rule as the app: an unset site URL means "unknown"
 * (src/config/site.ts), not localhost.
 */
import type { Plugin } from "vite";

/** `html` without any tag or line that uses %VITE_SITE_URL%. */
export function dropSiteUrlTags(html: string): string {
    return html.replace(/^[ \t]*<meta\b[^>]*%VITE_SITE_URL%[^>]*>[ \t]*\r?\n?/gm, "");
}

export function siteUrlTags(): Plugin {
    let siteUrl = "";
    return {
        name: "site-url-tags",
        configResolved(config) {
            siteUrl = config.env.VITE_SITE_URL ?? "";
        },
        transformIndexHtml: {
            order: "pre", // before Vite's own %ENV% replacement
            handler: (html) => (siteUrl ? html : dropSiteUrlTags(html)),
        },
    };
}
