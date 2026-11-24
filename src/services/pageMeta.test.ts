import { describe, expect, it } from "vitest";
import { HOME_META, LESSON_PAGES, SITE_IMAGE, publicPageByName } from "../content/pages";
import { roadmapUpdates } from "../content/roadmap/updates";
import { resolvePageMeta } from "./pageMeta";

describe("resolvePageMeta", () => {
    it("gives a public page its own copy and canonical path", () => {
        const roadmap = publicPageByName.get("roadmap")!;
        expect(resolvePageMeta({ name: "roadmap", params: {} })).toEqual({
            title: roadmap.title,
            description: roadmap.description,
            canonicalPath: "/roadmap",
            noindex: false,
            image: SITE_IMAGE,
            jsonLd: null,
        });
    });

    it("gives a lesson preview its own copy and card, kept out of the index", () => {
        const lesson = LESSON_PAGES.find((p) => p.lessonId === "digraphs")!;
        expect(resolvePageMeta({ name: "curriculum-lesson", params: { lessonId: "digraphs" } })).toEqual({
            title: lesson.title,
            description: lesson.description,
            canonicalPath: "/curriculum/lesson/digraphs",
            noindex: true,
            image: lesson.image,
            jsonLd: null,
        });
    });

    it("gives a changelog entry its update's copy", () => {
        const u = roadmapUpdates[0];
        const meta = resolvePageMeta({ name: "changelog-entry", params: { date: u.date } });
        expect(meta.canonicalPath).toBe(`/changelog/${u.date}`);
        expect(meta.title).not.toBe(HOME_META.title);
    });

    it("marks a missing changelog entry or lesson, an app route and an unmatched path noindex", () => {
        const routes: Parameters<typeof resolvePageMeta>[0][] = [
            { name: "changelog-entry", params: { date: "1999-01-01" } },
            { name: "curriculum-lesson", params: { lessonId: "nope" } },
            { name: "study", params: {} },
            { name: undefined, params: {} },
        ];
        for (const to of routes) {
            expect(resolvePageMeta(to, "https://example.com")).toEqual({
                ...HOME_META,
                canonicalPath: null,
                noindex: true,
                image: SITE_IMAGE,
                jsonLd: null,
            });
        }
    });

    it("gives the home page and changelog entries structured data, given a site URL", () => {
        const home = resolvePageMeta({ name: "home", params: {} }, "https://example.com").jsonLd as { "@graph": { "@type": string }[] };
        expect(home["@graph"].map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication"]);
        const u = roadmapUpdates[0];
        const entry = resolvePageMeta({ name: "changelog-entry", params: { date: u.date } }, "https://example.com").jsonLd;
        expect(entry?.["@type"]).toBe("BlogPosting");
        expect(resolvePageMeta({ name: "home", params: {} }, "").jsonLd).toBeNull();
    });
});
