import { describe, expect, it } from "vitest";
import { absolutizeLinks, buildAtomFeed, buildLlmsTxt, buildRobots, buildSitemap, CONTENT_SIGNAL, xmlEscape } from "./feeds";

const SITE = "https://example.com";

describe("buildSitemap", () => {
    it("lists absolute URLs, with lastmod only where known", () => {
        const xml = buildSitemap(SITE, [{ path: "/" }, { path: "/changelog/2026-11-02", lastmod: "2026-11-02" }]);
        expect(xml).toContain("<url><loc>https://example.com/</loc></url>");
        expect(xml).toContain(
            "<url><loc>https://example.com/changelog/2026-11-02</loc><lastmod>2026-11-02</lastmod></url>",
        );
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    });
});

describe("buildAtomFeed", () => {
    const updates = [
        { date: "2026-11-02", title: "New & improved.", titleHtml: "New &amp; improved.", html: '<ul>\n<li><a href="/fridge">sheet</a></li>\n</ul>\n' },
        { date: "2026-10-02", title: "We added a change log.", titleHtml: "We added a change log.", html: "" },
    ];
    const xml = buildAtomFeed(SITE, updates);

    it("has one entry per update, newest first, with permalinks as ids", () => {
        const ids = [...xml.matchAll(/<entry>[\s\S]*?<id>([^<]+)<\/id>/g)].map((m) => m[1]);
        expect(ids).toEqual([`${SITE}/changelog/2026-11-02`, `${SITE}/changelog/2026-10-02`]);
    });

    it("titles entries with the lead sentence, escaped", () => {
        expect(xml).toContain("<title>New &amp; improved</title>");
    });

    it("dates the feed by its newest entry, at noon UTC", () => {
        expect(xml.indexOf("<updated>2026-11-02T12:00:00Z</updated>")).toBeLessThan(xml.indexOf("<entry>"));
    });

    it("carries the content as escaped HTML with absolute links", () => {
        expect(xml).toContain("&lt;a href=&quot;https://example.com/fridge&quot;&gt;sheet&lt;/a&gt;");
        expect(xml).not.toMatch(/<content[^>]*>[^<]*<a /);
    });

    it("names itself and the changelog", () => {
        expect(xml).toContain(`<link rel="self" type="application/atom+xml" href="${SITE}/changelog.xml"/>`);
        expect(xml).toContain(`<link rel="alternate" type="text/html" href="${SITE}/changelog"/>`);
    });
});

describe("buildRobots", () => {
    it("replaces any Sitemap line, commented or not, with the build's", () => {
        const out = buildRobots("User-agent: *\nAllow: /\n\n# Sitemap: https://old.example/sitemap.xml\nSitemap: x\n", SITE);
        expect(out).toBe("User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n");
    });

    it("lists extra sitemaps after the app's, as paths or URLs", () => {
        const out = buildRobots("User-agent: *\nAllow: /\n", SITE, {
            sitemaps: ["/blog/sitemap.xml", "docs/sitemap.xml", "https://other.example/sitemap.xml"],
        });
        expect(out.split("\n").filter((l) => l.startsWith("Sitemap:"))).toEqual([
            "Sitemap: https://example.com/sitemap.xml",
            "Sitemap: https://example.com/blog/sitemap.xml",
            "Sitemap: https://example.com/docs/sitemap.xml",
            "Sitemap: https://other.example/sitemap.xml",
        ]);
    });

    it("puts the content signal in the User-agent: * group", () => {
        const out = buildRobots("User-agent: *\nAllow: /\nDisallow: /dbg/\n", SITE, { contentSignal: "search=yes, ai-train=yes" });
        expect(out).toBe(
            "User-agent: *\nContent-Signal: search=yes, ai-train=yes\nAllow: /\nDisallow: /dbg/\n\nSitemap: https://example.com/sitemap.xml\n",
        );
    });

    it("starts a User-agent: * group for the signal when the file has none", () => {
        const out = buildRobots("# nothing here\n", SITE, { contentSignal: "ai-train=yes" });
        expect(out.startsWith("User-agent: *\nContent-Signal: ai-train=yes\n")).toBe(true);
    });
});

describe("CONTENT_SIGNAL", () => {
    it("accepts key=yes|no pairs and rejects anything else", () => {
        expect(CONTENT_SIGNAL.test("search=yes, ai-input=yes, ai-train=yes")).toBe(true);
        expect(CONTENT_SIGNAL.test("ai-train=no")).toBe(true);
        expect(CONTENT_SIGNAL.test("ai-train=maybe")).toBe(false);
        expect(CONTENT_SIGNAL.test("search=yes; ai-train=yes")).toBe(false);
    });
});

describe("helpers", () => {
    it("escapes XML", () => {
        expect(xmlEscape(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
    });

    it("makes root-relative links absolute, leaving others", () => {
        expect(absolutizeLinks('<a href="/a"><img src="/b.png"><a href="//cdn.x/y"><a href="https://z">', SITE)).toBe(
            '<a href="https://example.com/a"><img src="https://example.com/b.png"><a href="//cdn.x/y"><a href="https://z">',
        );
    });
});

describe("buildLlmsTxt", () => {
    const pages = [
        { path: "/", title: "Home [beta]", description: "Start here." },
        { path: "/curriculum", title: "Our Curriculum - LettersPractice", description: "What it teaches." },
    ];

    it("is the intro, then the pages with absolute links", () => {
        const txt = buildLlmsTxt(SITE, "# Site\n\n> Summary.\n", pages);
        expect(txt.startsWith("# Site\n\n> Summary.\n\n## Pages")).toBe(true);
        expect(txt).toContain(`- [Home \\[beta\\]](${SITE}/): Start here.`);
        expect(txt).toContain(`- [Our Curriculum](${SITE}/curriculum): What it teaches.`);
    });

    it("refuses an intro without an H1, or with a placeholder left", () => {
        expect(() => buildLlmsTxt(SITE, "Site\n", pages)).toThrow(/H1/);
        expect(() => buildLlmsTxt(SITE, "# Site\n{{pricing}}\n", pages)).toThrow(/\{\{pricing\}\}/);
    });
});
