import { describe, expect, it } from "vitest";
import { htmlToText, truncate, updateSummary } from "./updatesCore";

describe("htmlToText", () => {
    it("drops tags, decodes entities and keeps blocks apart", () => {
        expect(htmlToText('<p>Tom &amp; <em>&quot;Jo&quot;</em></p><ul><li>a</li><li>b&#39;s</li></ul>')).toBe(
            'Tom & "Jo" a b\'s',
        );
    });

    it("decodes numeric entities, leaves unknown ones", () => {
        expect(htmlToText("&#8212; &#x2014; &bogus;")).toBe("— — &bogus;");
    });
});

describe("updateSummary", () => {
    it("is the title, then the body as text", () => {
        const u = { date: "2026-11-02", title: "Lead", titleHtml: "Lead", html: "<p>Para.</p>\n<ul>\n<li>One</li>\n</ul>\n" };
        expect(updateSummary(u)).toEqual({ lead: "Lead", rest: "Para. One" });
    });
});

describe("truncate", () => {
    it("leaves short text alone", () => {
        expect(truncate("short", 10)).toBe("short");
    });

    it("cuts at a word boundary with an ellipsis, within the limit", () => {
        const out = truncate("the quick brown fox jumps over the lazy dog", 20);
        expect(out).toBe("the quick brown fox…");
        expect(out.length).toBeLessThanOrEqual(20);
    });

    it("drops trailing punctuation before the ellipsis", () => {
        expect(truncate("one, two, three, four, five", 15)).toBe("one, two…");
    });
});
