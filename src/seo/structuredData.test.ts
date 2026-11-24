import { describe, expect, it } from "vitest";
import { changelogEntryJsonLd, homeJsonLd, serializeJsonLd } from "./structuredData";

const SITE = "https://example.com";
type Node = Record<string, unknown>;

describe("homeJsonLd", () => {
    const graph = (homeJsonLd(SITE)["@graph"] as Node[]);
    const byType = (t: string) => graph.find((n) => n["@type"] === t)!;

    it("describes the organization, the site and the app", () => {
        expect(graph.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication"]);
        expect(byType("WebSite")).toMatchObject({ name: "LettersPractice", url: `${SITE}/` });
        expect(byType("WebApplication")).toMatchObject({ applicationCategory: "EducationalApplication" });
    });

    it("links the organization to the given social profiles, with an absolute logo", () => {
        const profiles = ["https://bsky.app/profile/example.bsky.social"];
        const org = (homeJsonLd(SITE, profiles)["@graph"] as Node[]).find((n) => n["@type"] === "Organization")!;
        expect(org.sameAs).toEqual(profiles);
        expect(byType("Organization").sameAs).toBeUndefined();
        expect(byType("Organization").logo).toBe(`${SITE}/pwa-512x512.png`);
    });

    it("points the site and app at the organization as publisher", () => {
        const org = byType("Organization")["@id"];
        expect(byType("WebSite").publisher).toEqual({ "@id": org });
        expect(byType("WebApplication").publisher).toEqual({ "@id": org });
    });
});

describe("changelogEntryJsonLd", () => {
    const post = changelogEntryJsonLd(
        { date: "2026-11-02", title: "Gentler limits, and a new mini-lesson.", titleHtml: "", html: "<ul>\n<li>One session a day.</li>\n</ul>\n" },
        SITE,
    );

    it("is a dated BlogPosting at the entry's permalink", () => {
        expect(post).toMatchObject({
            "@type": "BlogPosting",
            headline: "Gentler limits, and a new mini-lesson",
            url: `${SITE}/changelog/2026-11-02`,
            datePublished: "2026-11-02T12:00:00Z",
            dateModified: "2026-11-02T12:00:00Z",
        });
    });

    it("keeps headlines within Google's 110 characters", () => {
        const long = changelogEntryJsonLd({ date: "2026-11-02", title: "word ".repeat(40), titleHtml: "", html: "" }, SITE);
        expect((long.headline as string).length).toBeLessThanOrEqual(110);
    });
});

describe("serializeJsonLd", () => {
    it("escapes < so the content can't close its script tag", () => {
        const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
        expect(out).not.toContain("<");
        expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
    });
});
