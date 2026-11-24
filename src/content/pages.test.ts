import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lessonShortPaths } from "../services/lessonShortLinks";
import { changelogEntryMeta, HOME_META, LESSON_PAGES, plainCopy, PUBLIC_PAGES, SITE_IMAGE } from "./pages";

// The router source, read as text (as publicCollision.test.ts does), so the
// test needs no Vue or router runtime.
const ROUTER = readFileSync(join(__dirname, "..", "router", "index.ts"), "utf8");

describe("PUBLIC_PAGES", () => {
    it.each(PUBLIC_PAGES.map((p) => [p.name, p]))("%s matches its route's path and aliases", (_name, page) => {
        const m = new RegExp(
            `path: "${page.path}",\\s*(?:alias: (\\[[^\\]]*\\]|"[^"]*"),\\s*)?name: "${page.name}"`,
        ).exec(ROUTER);
        expect(m, `no route { path: "${page.path}", name: "${page.name}" }`).not.toBeNull();
        const routerAliases = [...(m![1] ?? "").matchAll(/"([^"]+)"/g)].map((a) => a[1]).sort();
        expect(routerAliases).toEqual([...(page.aliases ?? [])].sort());
    });

    it("has unique names and paths", () => {
        expect(new Set(PUBLIC_PAGES.map((p) => p.name)).size).toBe(PUBLIC_PAGES.length);
        const paths = PUBLIC_PAGES.flatMap((p) => [p.path, ...(p.aliases ?? [])]);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it.each(PUBLIC_PAGES.map((p) => [p.path, p]))("%s has a search-sized title and description", (_path, page) => {
        expect(page.title.length).toBeLessThanOrEqual(60);
        expect(page.description.length).toBeGreaterThanOrEqual(40);
        expect(page.description.length).toBeLessThanOrEqual(160);
    });

    it("keeps the home copy in step with index.html's static tags", () => {
        const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");
        expect(html).toContain(`<title>${HOME_META.title}</title>`);
        expect(html).toContain(`<meta name="description" content="${HOME_META.description}" />`);
        expect(html).toMatch(new RegExp(`<meta property="og:image" content="[^"]*${SITE_IMAGE.path}" />`));
    });
});

/** A PNG's pixel size, from its IHDR chunk */
function pngSize(file: string): [number, number] {
    const b = readFileSync(file);
    expect(b.subarray(1, 4).toString("latin1"), `${file} isn't a PNG`).toBe("PNG");
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("preview images", () => {
    const images = [
        ["(site default)", SITE_IMAGE],
        ...[...PUBLIC_PAGES, ...LESSON_PAGES].flatMap((p) => (p.image ? [[p.path, p.image] as const] : [])),
    ] as const;

    it.each(images)("%s: its image is committed at the size its tags declare", (_path, image) => {
        // A card missing? scripts/export-og-cards.ts draws them (dev server up); commit public/og/.
        const file = join(__dirname, "..", "..", "public", image.path);
        expect(pngSize(file)).toEqual([image.width, image.height]);
    });
});

describe("changelogEntryMeta", () => {
    it("titles the page with the lead sentence and describes it with the rest", () => {
        const meta = changelogEntryMeta({
            date: "2026-11-02",
            title: "Gentler limits, and a new mini-lesson.",
            titleHtml: "Gentler limits, and a new mini-lesson.",
            html: "<ul>\n<li>One session a day.</li>\n</ul>\n",
        });
        expect(meta.title).toBe("Gentler limits, and a new mini-lesson - LettersPractice");
        expect(meta.description).toBe("November 2, 2026: One session a day.");
    });

    it("falls back to the date when the update has no title", () => {
        const meta = changelogEntryMeta({ date: "2026-10-02", title: "", titleHtml: "", html: "<ul>\n<li>A thing.</li>\n</ul>\n" });
        expect(meta.title).toBe("Update, October 2, 2026 - LettersPractice");
        expect(meta.description).toBe("October 2, 2026: A thing.");
    });

    it("uses the lead as the description when there's nothing after it", () => {
        const meta = changelogEntryMeta({
            date: "2026-10-02",
            title: "We added a change log.",
            titleHtml: "We added a change log.",
            html: "",
        });
        expect(meta.description).toBe("October 2, 2026: We added a change log.");
    });
});

describe("LESSON_PAGES", () => {
    it("has a page per live lesson, at its preview's route", () => {
        expect(ROUTER).toMatch(/path: "\/curriculum\/lesson\/:lessonId",\s*name: "curriculum-lesson"/);
        for (const p of LESSON_PAGES) expect(p.path).toBe(`/curriculum/lesson/${p.lessonId}`);
    });

    it.each(LESSON_PAGES.map((p) => [p.path, p]))("%s has a search-sized title and description, in plain text", (_path, page) => {
        expect(page.title.length).toBeLessThanOrEqual(60);
        expect(page.description.length).toBeGreaterThanOrEqual(40);
        expect(page.description.length).toBeLessThanOrEqual(160);
        expect(page.description).not.toMatch(/[*`[\]]/);
    });

    it("lists each lesson's short links as aliases", () => {
        for (const p of LESSON_PAGES) expect(p.aliases).toEqual(lessonShortPaths(p.lessonId));
    });

    it("titles the page with the lesson's number and name", () => {
        const bed = LESSON_PAGES.find((p) => p.lessonId === "bed")!;
        expect(bed.heading).toBe("Lesson 1a: Making our bed");
        expect(bed.title).toBe("Lesson 1a: Making our bed - LettersPractice");
    });
});

describe("plainCopy", () => {
    it("drops emphasis and keeps fact and link labels", () => {
        expect(plainCopy("A *handy* way to tell **b** from _d_ and `x`.")).toBe("A handy way to tell b from d and x.");
        expect(plainCopy("Like [*sh* as in *ship*], see [the engine](/learning-engine).")).toBe(
            "Like sh as in ship, see the engine.",
        );
    });
});
