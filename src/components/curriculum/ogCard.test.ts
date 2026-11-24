import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGE, lessonsForAge } from "./curriculumData";
import { OG_CARD_HEIGHT, OG_CARD_WIDTH, lessonOgAlt, lessonOgImagePath, ogCardSpellings } from "./ogCard";

const PUBLIC = join(__dirname, "..", "..", "..", "public");
const lessons = lessonsForAge(DEFAULT_AGE);

/** A PNG's pixel size, from its IHDR chunk */
function pngSize(file: string): [number, number] {
    const b = readFileSync(file);
    expect(b.subarray(1, 4).toString("latin1"), `${file} isn't a PNG`).toBe("PNG");
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("lesson link-preview cards", () => {
    it.each(lessons.map((l) => [l.id]))("%s has its card committed, at 1200×630", (id) => {
        // Missing? Run scripts/export-og-cards.ts with the dev server up, and commit public/og/.
        expect(pngSize(join(PUBLIC, lessonOgImagePath(id)))).toEqual([OG_CARD_WIDTH, OG_CARD_HEIGHT]);
    });
});

describe("ogCardSpellings", () => {
    const facts = (gs: string[]) => gs.map((g, i) => ({ gpc: `${g}-${i}`, grapheme: g }));

    it("shows each spelling once, in order", () => {
        expect(ogCardSpellings({ facts: facts(["th", "th", "sh"]) } as never)).toEqual({ shown: ["th", "sh"], more: 0 });
    });

    it("shows twelve at most, the twelfth slot becoming +N", () => {
        const many = "abcdefghijklmnop".split("");
        expect(ogCardSpellings({ facts: facts(many.slice(0, 12)) } as never).more).toBe(0);
        expect(ogCardSpellings({ facts: facts(many) } as never)).toEqual({ shown: many.slice(0, 11), more: 5 });
    });
});

describe("lessonOgAlt", () => {
    it("names the lesson and the spellings the card shows", () => {
        const digraphs = lessons.find((l) => l.id === "digraphs")!;
        const { shown } = ogCardSpellings(digraphs);
        expect(lessonOgAlt(digraphs)).toBe(
            `Lesson 2, Letter Teammates: a still from the lesson, beside the spellings it teaches: ${shown.join(", ")}.`,
        );
    });

    it("counts the spellings the card folds into +N, and calls whole words words", () => {
        const sightWords = lessons.find((l) => l.id === "sight-words")!;
        const { more } = ogCardSpellings(sightWords);
        expect(more).toBeGreaterThan(0);
        expect(lessonOgAlt(sightWords)).toMatch(new RegExp(`beside the words it teaches: .* and ${more} more\\.$`));
    });

    it("uses the singular for one spelling", () => {
        const bed = lessons.find((l) => l.id === "bed")!;
        expect(lessonOgAlt(bed)).toBe("Lesson 1a, Making our bed: a still from the lesson, beside the spelling it teaches: b.");
    });
});
