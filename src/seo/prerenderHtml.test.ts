import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderPrerenderedPage } from "./prerenderHtml";

// The source index.html: the build keeps its <head> tags as written.
const SHELL = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");

const meta = (html: string, attr: string, key: string) =>
    new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe("renderPrerenderedPage", () => {
    const head = { title: 'Roadmap & "plans"', description: "What's next <soon>", canonicalUrl: "https://example.com/roadmap" };
    const html = renderPrerenderedPage(SHELL, head, "<main><h1>Roadmap</h1></main>");

    it("sets the title and every description/preview tag, escaped", () => {
        expect(html).toContain("<title>Roadmap &amp; \"plans\"</title>");
        for (const [attr, key] of [["name", "title"], ["property", "og:title"], ["name", "twitter:title"]]) {
            expect(meta(html, attr, key)).toBe("Roadmap &amp; &quot;plans&quot;");
        }
        for (const [attr, key] of [["name", "description"], ["property", "og:description"], ["name", "twitter:description"]]) {
            expect(meta(html, attr, key)).toBe("What's next &lt;soon&gt;");
        }
    });

    it("points og:url, twitter:url and one canonical link at the page", () => {
        expect(meta(html, "property", "og:url")).toBe("https://example.com/roadmap");
        expect(meta(html, "name", "twitter:url")).toBe("https://example.com/roadmap");
        expect(html.match(/rel="canonical"/g)).toHaveLength(1);
        expect(html).toContain('<link rel="canonical" href="https://example.com/roadmap" />');
    });

    it("puts the page's markup in #app, marked as the prerendered copy", () => {
        expect(html).toContain('<div id="app"><div data-prerendered><main><h1>Roadmap</h1></main></div></div>');
    });

    it("leaves the shell's url tags alone and adds no canonical without a site URL", () => {
        const out = renderPrerenderedPage(SHELL, { ...head, canonicalUrl: null }, "");
        expect(meta(out, "property", "og:url")).toBe(meta(SHELL, "property", "og:url"));
        expect(out).not.toContain('rel="canonical"');
    });

    it("throws when the shell lacks a tag it must rewrite", () => {
        const broken = SHELL.replace(/<meta\s+property="og:description"[^>]*>/, "");
        expect(() => renderPrerenderedPage(broken, head, "")).toThrow(/og:description/);
    });

    it("hides the prerendered copy, but for a part marked to show, unless JavaScript is off", () => {
        expect(SHELL).toContain('[data-prerendered]:not([data-prerendered="show"]) { display: none; }');
        expect(SHELL).toContain("[data-prerendered] [data-prerender-off] { display: none !important; }");
        // without JavaScript: all of it
        expect(SHELL).toMatch(/<noscript><style>\s*\[data-prerendered\] \{ display: block !important; \}/);
        expect(SHELL).toContain("[data-prerendered] [data-prerender-off] { display: revert !important; }");
    });

    it("adds the structured data once, in the head, when given", () => {
        const out = renderPrerenderedPage(SHELL, { ...head, jsonLd: '{"@type":"WebSite"}' }, "");
        expect(out.match(/application\/ld\+json/g)).toHaveLength(1);
        expect(out.indexOf('<script type="application/ld+json">{"@type":"WebSite"}</script>')).toBeLessThan(out.indexOf("</head>"));
        expect(renderPrerenderedPage(SHELL, head, "")).not.toContain("application/ld+json");
    });

    it("sets the preview image and adds its size and alt text, escaped", () => {
        const image = { url: "https://example.com/og/lesson-bed.png", width: 1200, height: 630, alt: 'Lesson 1a: "b" & d' };
        const out = renderPrerenderedPage(SHELL, { ...head, image }, "");
        expect(meta(out, "property", "og:image")).toBe(image.url);
        expect(meta(out, "name", "twitter:image")).toBe(image.url);
        expect(meta(out, "property", "og:image:width")).toBe("1200");
        expect(meta(out, "property", "og:image:height")).toBe("630");
        expect(meta(out, "property", "og:image:alt")).toBe("Lesson 1a: &quot;b&quot; &amp; d");
        expect(meta(out, "name", "twitter:image:alt")).toBe("Lesson 1a: &quot;b&quot; &amp; d");
        expect(out.indexOf('property="og:image:alt"')).toBeLessThan(out.indexOf("</head>"));
    });

    it("leaves the shell's image alone without one, and adds no alt tags without alt text", () => {
        expect(meta(html, "property", "og:image")).toBe(meta(SHELL, "property", "og:image"));
        expect(html).not.toContain("og:image:width");
        const noAlt = renderPrerenderedPage(SHELL, { ...head, image: { url: "https://example.com/og-image.png", width: 1200, height: 630 } }, "");
        expect(noAlt).toContain('<meta property="og:image:width" content="1200" />');
        expect(noAlt).not.toContain("image:alt");
    });

    it("marks a page noindex only when asked", () => {
        expect(html).not.toContain('name="robots"');
        const out = renderPrerenderedPage(SHELL, { ...head, noindex: true }, "");
        expect(out.match(/name="robots"/g)).toHaveLength(1);
        expect(out).toContain('<meta name="robots" content="noindex" />');
    });

    it("hides the copy unless part of it is shown before mount", () => {
        expect(html).toContain('<div id="app"><div data-prerendered><main>');
        const shown = renderPrerenderedPage(SHELL, head, "<main></main>", { themeCss: ":root{--v-theme-primary:1,2,3}" });
        expect(shown).toContain('<div id="app"><div data-prerendered="show"><main>');
        expect(shown).toContain('<style id="vuetify-theme-prerendered">:root{--v-theme-primary:1,2,3}</style>');
    });

    it("marks the Play Store app before first paint, with androidApp.ts's own param and key", () => {
        const src = readFileSync(join(__dirname, "..", "services", "androidApp.ts"), "utf8");
        const key = /SESSION_KEY = "([^"]+)"/.exec(src)![1];
        const param = /LAUNCH_PARAM = "([^"]+)"/.exec(src)![1];
        const value = /LAUNCH_VALUE = "([^"]+)"/.exec(src)![1];
        expect(SHELL).toContain(`get("${param}") === "${value}"`);
        expect(SHELL).toContain(`sessionStorage.getItem("${key}") === "1"`);
        // and the shown copy hides the price there (Play billing policy)
        expect(SHELL).toContain("html[data-android-app] [data-prerendered] .hero-pricing { display: none; }");
    });

    it("can't let the theme stylesheet close its own style element", () => {
        const out = renderPrerenderedPage(SHELL, head, "", { themeCss: "a{}</style><script>x</script>" });
        expect(out).not.toContain("</style><script>");
    });
});
