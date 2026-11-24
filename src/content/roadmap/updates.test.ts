import { describe, expect, it } from "vitest";
import { parseUpdates, roadmapUpdates, updateFiles, updatePath } from "./updates";
import { renderUpdateMarkdown } from "./updatesMarkdown";

const md = (files: Record<string, string>) => parseUpdates(files, renderUpdateMarkdown);

describe("roadmap update files", () => {
    it("every file in updates/ is a dated, non-empty entry", () => {
        const { rejected } = parseUpdates(updateFiles, (html) => html);
        expect(rejected).toEqual([]);
        expect(roadmapUpdates.length).toBe(Object.keys(updateFiles).length);
        expect(roadmapUpdates.length).toBeGreaterThan(0);
    });

    it("is newest-first", () => {
        const dates = roadmapUpdates.map((u) => u.date);
        expect(dates).toEqual([...dates].sort().reverse());
    });

    it("gives each update a permalink named by its file", () => {
        const paths = roadmapUpdates.map(updatePath);
        expect(paths).toContain("/changelog/2026-10-02");
        expect(new Set(paths).size).toBe(paths.length);
    });
});

describe("parseUpdates", () => {
    it("takes the date from the filename and renders markdown", () => {
        const { updates } = md({
            "./updates/2026-01-05.md": "Lead.\n\n- one\n- [two](/fridge)\n",
        });
        expect(updates).toHaveLength(1);
        expect(updates[0].date).toBe("2026-01-05");
        expect(updates[0].title).toBe("Lead.");
        expect(updates[0].html).not.toContain("Lead.");
        expect(updates[0].html).toContain("<li>one</li>");
        expect(updates[0].html).toContain('<a href="/fridge">two</a>');
    });

    it("takes the first line as the title, inline, with or without a leading #", () => {
        const { updates } = md({
            "./updates/2026-01-05.md": "\nSee [the *sheet*](/fridge) & more\n\nBody para.\n",
            "./updates/2026-01-06.md": "# Hashed title\nStraight into the body.\n",
            "./updates/2026-01-07.md": "Only a title\n",
        });
        const [only, hashed, linked] = updates;
        expect(linked.title).toBe("See the sheet & more");
        expect(linked.titleHtml).toBe('See <a href="/fridge">the <em>sheet</em></a> &amp; more');
        expect(linked.html.trim()).toBe("<p>Body para.</p>");
        expect(hashed.title).toBe("Hashed title");
        expect(hashed.html.trim()).toBe("<p>Straight into the body.</p>");
        expect(only.title).toBe("Only a title");
        expect(only.html.trim()).toBe("");
    });

    it("gives every shipped update a title", () => {
        for (const u of roadmapUpdates) expect(u.title, u.date).not.toBe("");
    });

    it("rejects misnamed files, impossible dates, and empty bodies", () => {
        const { updates, rejected } = md({
            "./updates/2026-11-2.md": "short day",
            "./updates/2026-02-30.md": "no such day",
            "./updates/notes.md": "not dated",
            "./updates/2026-03-01.md": "   \n",
            "./updates/2026-03-02.md": "kept",
        });
        expect(updates.map((u) => u.date)).toEqual(["2026-03-02"]);
        expect(rejected.sort()).toEqual([
            "./updates/2026-02-30.md",
            "./updates/2026-03-01.md",
            "./updates/2026-11-2.md",
            "./updates/notes.md",
        ]);
    });

    it("sorts newest-first regardless of input order", () => {
        const { updates } = md({
            "./updates/2025-12-31.md": "a",
            "./updates/2026-06-01.md": "b",
            "./updates/2026-01-15.md": "c",
        });
        expect(updates.map((u) => u.date)).toEqual(["2026-06-01", "2026-01-15", "2025-12-31"]);
    });
});
