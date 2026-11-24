import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dropSiteUrlTags } from "./vite-plugin-site-url-tags";

describe("dropSiteUrlTags", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    it("removes every tag that uses %VITE_SITE_URL% and nothing else", () => {
        const out = dropSiteUrlTags(html);
        expect(out).not.toContain("%VITE_SITE_URL%");
        const dropped = html.split("\n").length - out.split("\n").length;
        expect(dropped).toBe(html.split("\n").filter((l) => l.includes("%VITE_SITE_URL%")).length);
        expect(out).toContain('property="og:title"');
        expect(out).toContain('name="twitter:card"');
    });
});
