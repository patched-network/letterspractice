/**
 * schema.org structured data (JSON-LD) for the public pages: what search
 * engines and other machine readers take LettersPractice to be, rather than
 * inferring it from prose.
 *
 *   home                 the Organization (logo, social profiles), the WebSite
 *                        (the site name Google shows in results) and the
 *                        WebApplication
 *   /changelog/<date>    a BlogPosting: headline, date, publisher
 *
 * Other public pages carry none. Absolute URLs throughout, so it needs the
 * site origin (VITE_SITE_URL); without it there's no structured data.
 *
 * Pure: services/pageMeta.ts puts it in the page at runtime, and
 * scripts/prerender-public.ts into the prerendered HTML, from the same
 * functions; the prerender checks the two match.
 */
import { changelogEntryMeta, SITE_DESCRIPTION, SITE_NAME } from "../content/pages";
import { formatUpdateDate, truncate, updatePath, updateSummary, type RoadmapUpdate } from "../content/roadmap/updatesCore";
import { updateTimestamp } from "./feeds";

export type JsonLd = Record<string, unknown>;

const organizationId = (siteUrl: string) => `${siteUrl}/#organization`;

/** `sameAs`: the deployment's social profiles (deployment/pitch.ts socialUrls); omitted when none. */
export function homeJsonLd(siteUrl: string, sameAs: string[] = []): JsonLd {
    const home = `${siteUrl}/`;
    const publisher = { "@id": organizationId(siteUrl) };
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": organizationId(siteUrl),
                name: SITE_NAME,
                url: home,
                logo: `${siteUrl}/pwa-512x512.png`,
                ...(sameAs.length ? { sameAs } : {}),
            },
            {
                "@type": "WebSite",
                "@id": `${siteUrl}/#website`,
                name: SITE_NAME,
                url: home,
                publisher,
            },
            {
                "@type": "WebApplication",
                "@id": `${siteUrl}/#app`,
                name: SITE_NAME,
                url: home,
                description: SITE_DESCRIPTION,
                applicationCategory: "EducationalApplication",
                operatingSystem: "Web, Android",
                browserRequirements: "Requires JavaScript.",
                image: `${siteUrl}/og-image.png`,
                publisher,
            },
        ],
    };
}

export function changelogEntryJsonLd(u: RoadmapUpdate, siteUrl: string): JsonLd {
    const url = siteUrl + updatePath(u);
    const { lead } = updateSummary(u);
    const at = updateTimestamp(u.date);
    const organization = { "@type": "Organization", "@id": organizationId(siteUrl), name: SITE_NAME, url: `${siteUrl}/` };
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": `${url}#post`,
        // Google truncates headlines past 110 characters.
        headline: truncate(lead ? lead.replace(/\.$/, "") : `Update, ${formatUpdateDate(u.date)}`, 110),
        description: changelogEntryMeta(u).description,
        url,
        mainEntityOfPage: url,
        datePublished: at,
        dateModified: at,
        image: `${siteUrl}/og-image.png`,
        author: organization,
        publisher: { ...organization, logo: `${siteUrl}/pwa-512x512.png` },
        isPartOf: { "@id": `${siteUrl}/#website` },
    };
}

/** JSON for a <script type="application/ld+json">, with `<` escaped so the content can't close the tag. */
export function serializeJsonLd(data: JsonLd): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
