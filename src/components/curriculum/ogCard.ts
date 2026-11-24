/**
 * Link-preview cards (og:image) drawn by the app: each live lesson's, and the
 * page cards (PAGE_OG_CARDS: the site-wide default and a few public pages'
 * own). Where each is served, their size, which fact spellings a lesson's
 * shows, and the alt text. Shared by the cards themselves (all drawn in
 * og/OgCardFrame.vue), the page metadata (content/pages.ts) and the export
 * script (scripts/export-og-cards.ts), so the alt text names what the image
 * shows.
 *
 * The PNGs are committed under public/; regenerate them with the export
 * script after a card's look or copy changes, or what it draws does (a
 * lesson's title, description, facts or still; FridgeSheetMini; the exercise
 * demos). ogCard.test.ts fails while a live lesson has none; pages.test.ts,
 * while any page's is missing. /dbg/og shows which page uses which.
 */
import type { CurriculumLesson } from "./curriculumData";

export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;

/** Fact chips on a card before the rest collapse into "+N" (two rows, roughly) */
const MAX_CHIPS = 12;

/**
 * The card's wordmark: our address. Brand material, like the PNGs it ends up
 * in.
 */
export const OG_WORDMARK = "LettersPractice.com";

/**
 * The page cards: drawn for one page (or, "site", for every page without its
 * own), each by its own component (og/<Name>OgCard.vue, landing/
 * FridgeSheetOgCard.vue) at /dbg/og/page/<id>. content/pages.ts names them.
 */
export const PAGE_OG_CARDS = {
    /**
     * index.html's og:image, and every page's without one of its own
     * (SITE_IMAGE). Draft: the live PNG is the hand-made original; SiteOgCard
     * is a redraw kept for future tweaks, and exports to tmp/og-drafts/, not
     * over it. Drop `draft` to make the drawn one live.
     */
    site: {
        path: "/og-image.png",
        draft: true,
        alt: "LettersPractice: Teach your child to read, the word read spelled by letter characters with faces, beside more of them on coloured tiles.",
    },
    "fridge-sheet": {
        path: "/og/fridge-sheet.png",
        alt: "The fridge sheet, a free printable: a sheet of letter keys held to a fridge by a magnet, some keys coloured in with crayon.",
    },
    exercises: {
        path: "/og/exercises.png",
        alt: "Our Exercises: the four exercises side by side, as a child sees them in the app.",
    },
    curriculum: {
        path: "/og/curriculum.png",
        alt: "Our Curriculum: stills from the read-aloud lessons, each with its lesson number.",
    },
    "learning-engine": {
        path: "/og/learning-engine.png",
        alt: "Our Learning Engine: review, recombination and new material, drawn as three streams of cards merging into one day's session.",
    },
} as const satisfies Record<string, { path: string; alt: string; draft?: boolean }>;

/** A draft card's export goes here (project-relative, gitignored), not to its live path */
export const OG_DRAFT_DIR = "tmp/og-drafts";

export function isDraftCard(id: PageOgCardId): boolean {
    return "draft" in PAGE_OG_CARDS[id] && PAGE_OG_CARDS[id].draft === true;
}

export type PageOgCardId = keyof typeof PAGE_OG_CARDS;
export const PAGE_OG_CARD_IDS = Object.keys(PAGE_OG_CARDS) as PageOgCardId[];

/** Where a lesson's card is served (public/og/) */
export function lessonOgImagePath(lessonId: string): string {
    return `/og/lesson-${lessonId}.png`;
}

/**
 * The spellings a card shows: distinct, in the lesson's order (most useful
 * first; th is one chip, not two), at most MAX_CHIPS with the rest as `more`.
 */
export function ogCardSpellings(lesson: Pick<CurriculumLesson, "facts">): { shown: string[]; more: number } {
    const all = [...new Set(lesson.facts.map((f) => f.grapheme))];
    if (all.length <= MAX_CHIPS) return { shown: all, more: 0 };
    const shown = all.slice(0, MAX_CHIPS - 1);
    return { shown, more: all.length - shown.length };
}

/** The card's alt text: what it shows, in the order it shows it. */
export function lessonOgAlt(lesson: Pick<CurriculumLesson, "number" | "title" | "facts">): string {
    const { shown, more } = ogCardSpellings(lesson);
    const words = lesson.facts.length > 0 && lesson.facts.every((f) => f.gpc.startsWith("WORD-"));
    const noun = words ? "word" : "spelling";
    const count = shown.length + more;
    const list = more ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
    const what = count ? `, beside the ${count === 1 ? noun : `${noun}s`} it teaches: ${list}` : "";
    return `Lesson ${lesson.number}, ${lesson.title}: a still from the lesson${what}.`;
}
