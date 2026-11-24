/**
 * Per-route <head>: the tab title, description, link-preview (og:/twitter:)
 * tags, canonical link and robots. Applied after every navigation
 * (router.afterEach in src/router/index.ts).
 *
 * Public pages (content/pages.ts, plus each /changelog/<date>) get their own
 * title and description and a canonical URL. Lesson previews
 * (/curriculum/lesson/<id>) get the same, plus their own preview card, but are
 * noindex (see LESSON_PAGES). Every other route keeps the site-wide home copy
 * and is marked noindex: app screens (study, account, admin), not-found
 * addresses, and a /changelog/<date> or lesson that doesn't exist.
 *
 * Every page names a preview image (og:image, twitter:image, with size and,
 * where there is one, alt text): its own, or the site's (SITE_IMAGE).
 *
 * Search engines that run JavaScript read the result of this. Crawlers that
 * don't (most AI crawlers, link-preview bots) read the static copy that
 * scripts/prerender-public.ts writes into each public page's HTML at build
 * time; the prerender checks the two agree.
 *
 * The home page and each changelog entry also carry schema.org structured
 * data (seo/structuredData.ts) in a <script type="application/ld+json">.
 *
 * Canonical, og:url, og:image and the structured data need the site's origin,
 * VITE_SITE_URL. Unset (local dev, a self-hosted build without it): no
 * canonical link or structured data, and og:url and the image tags are left as
 * index.html has them.
 */
import type { RouteLocationNormalized } from "vue-router";
import {
    HOME_META,
    SITE_IMAGE,
    changelogEntryMeta,
    lessonPageById,
    publicPageByName,
    type PageImage,
    type PageMeta,
} from "../content/pages";
import { roadmapUpdates, updatePath } from "../content/roadmap/updates";
import { SITE_URL } from "../config/site";
import { deploymentPages, pitch } from "../deployment";
import { socialUrls, withPitch } from "../deployment/pitch";
import { changelogEntryJsonLd, homeJsonLd, serializeJsonLd, type JsonLd } from "../seo/structuredData";

export interface ResolvedPageMeta extends PageMeta {
    /** The page's canonical path (canonical link, og:url); null for an address with no page of its own */
    canonicalPath: string | null;
    /** Kept out of search results: app screens, unknown addresses, lesson previews */
    noindex: boolean;
    /** The preview image: the page's own, or the site's */
    image: PageImage;
    /** schema.org structured data, or null */
    jsonLd: JsonLd | null;
}

export { SITE_URL };

const deploymentPageByName = new Map(deploymentPages.map((p) => [p.name, p]));

export function resolvePageMeta(
    to: Pick<RouteLocationNormalized, "name" | "params">,
    siteUrl = SITE_URL,
): ResolvedPageMeta {
    const page = typeof to.name === "string" ? (publicPageByName.get(to.name) ?? deploymentPageByName.get(to.name)) : undefined;
    if (page) {
        const jsonLd = page.name === "home" && siteUrl ? homeJsonLd(siteUrl, socialUrls(pitch)) : null;
        // The home description carries the deployment's tagline, if it sells access.
        const { title, description } = page.name === "home" ? withPitch(page, pitch) : page;
        return {
            title,
            description,
            canonicalPath: page.path,
            noindex: false,
            image: page.image ?? SITE_IMAGE,
            jsonLd,
        };
    }
    if (to.name === "changelog-entry") {
        const update = roadmapUpdates.find((u) => u.date === to.params.date);
        if (update) {
            const jsonLd = siteUrl ? changelogEntryJsonLd(update, siteUrl) : null;
            const { title, description } = changelogEntryMeta(update);
            return { title, description, canonicalPath: updatePath(update), noindex: false, image: SITE_IMAGE, jsonLd };
        }
    }
    if (to.name === "curriculum-lesson") {
        const lesson = lessonPageById.get(String(to.params.lessonId));
        if (lesson) {
            const { title, description, path, image } = lesson;
            return { title, description, canonicalPath: path, noindex: true, image, jsonLd: null };
        }
    }
    return { ...HOME_META, canonicalPath: null, noindex: true, image: SITE_IMAGE, jsonLd: null };
}

export function applyPageMeta(meta: ResolvedPageMeta, doc: Document = document, siteUrl = SITE_URL): void {
    doc.title = (import.meta.env.DEV ? "[dev] " : "") + meta.title;
    setMeta(doc, "name", "title", meta.title);
    setMeta(doc, "name", "description", meta.description);
    setMeta(doc, "property", "og:title", meta.title);
    setMeta(doc, "property", "og:description", meta.description);
    setMeta(doc, "name", "twitter:title", meta.title);
    setMeta(doc, "name", "twitter:description", meta.description);

    const url = meta.canonicalPath !== null && siteUrl ? siteUrl + meta.canonicalPath : null;
    if (url) {
        setMeta(doc, "property", "og:url", url);
        setMeta(doc, "name", "twitter:url", url);
    }
    if (siteUrl) {
        const { path, width, height, alt } = meta.image;
        setMeta(doc, "property", "og:image", siteUrl + path);
        setMeta(doc, "name", "twitter:image", siteUrl + path);
        setMeta(doc, "property", "og:image:width", String(width));
        setMeta(doc, "property", "og:image:height", String(height));
        setMeta(doc, "property", "og:image:alt", alt ?? null);
        setMeta(doc, "name", "twitter:image:alt", alt ?? null);
    }
    let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (url) {
        if (!canonical) {
            canonical = doc.createElement("link");
            canonical.rel = "canonical";
            doc.head.appendChild(canonical);
        }
        canonical.href = url;
    } else {
        canonical?.remove();
    }

    setMeta(doc, "name", "robots", meta.noindex ? "noindex" : null);

    let ld = doc.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (meta.jsonLd) {
        if (!ld) {
            ld = doc.createElement("script");
            ld.type = "application/ld+json";
            doc.head.appendChild(ld);
        }
        ld.textContent = serializeJsonLd(meta.jsonLd);
    } else {
        ld?.remove();
    }
}

/** Set a <meta>'s content, creating it if missing; null removes it. */
function setMeta(doc: Document, attr: "name" | "property", key: string, content: string | null): void {
    let el = doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (content === null) {
        el?.remove();
        return;
    }
    if (!el) {
        el = doc.createElement("meta");
        el.setAttribute(attr, key);
        doc.head.appendChild(el);
    }
    el.content = content;
}
