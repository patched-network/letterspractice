/**
 * Public pages: the routes that are for anyone, not just a learner in a
 * session. Each has its own title and description, which become the browser
 * tab title, the search snippet and the link-preview card.
 *
 * This list is the one place that decides what is public:
 *   - services/pageMeta.ts applies the title/description on navigation, and
 *     marks every route NOT listed here (study, account, admin…) noindex;
 *   - scripts/prerender-public.ts renders each path to static HTML at build
 *     time (aliases get a copy that names the canonical path), and lists them
 *     in sitemap.xml.
 * /changelog/<date> pages are public too, generated from the update files
 * (changelogEntryMeta). pages.test.ts checks every name/path/alias here
 * against the router.
 *
 * Lesson previews (/curriculum/lesson/<id>, LESSON_PAGES) are shared rather
 * than searched for: they get their own head and preview card, but stay out
 * of the index and the sitemap.
 *
 * Copy: honest, plain, drawn from the page itself. Titles stay under ~60
 * characters (search results truncate around there), descriptions under ~160.
 * The home title and description deliberately repeat index.html's static
 * ones (see the comment there).
 *
 * Pure (no import.meta.glob), so build scripts can import it under Node.
 */
import { DEFAULT_AGE, lessonsForAge } from "../components/curriculum/curriculumData";
import {
    OG_CARD_HEIGHT,
    OG_CARD_WIDTH,
    PAGE_OG_CARDS,
    lessonOgAlt,
    lessonOgImagePath,
    type PageOgCardId,
} from "../components/curriculum/ogCard";
import { lessonShortPaths } from "../services/lessonShortLinks";
import { formatUpdateDate, truncate, updateSummary, type RoadmapUpdate } from "./roadmap/updatesCore";

export const SITE_NAME = "LettersPractice";

/** A link-preview image (og:image, twitter:image) */
export interface PageImage {
    /** Site-relative; made absolute with VITE_SITE_URL */
    path: string;
    width: number;
    height: number;
    /** What the image shows (og:image:alt, twitter:image:alt) */
    alt?: string;
}

export interface PageMeta {
    title: string;
    description: string;
    /** The page's own preview image; SITE_IMAGE when unset */
    image?: PageImage;
}

/** A page card's image (components/curriculum/ogCard.ts PAGE_OG_CARDS) */
function pageCardImage(id: PageOgCardId): PageImage {
    const { path, alt } = PAGE_OG_CARDS[id];
    return { path, width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT, alt };
}

/** index.html's og:image, for every page without its own (og/SiteOgCard.vue) */
export const SITE_IMAGE: PageImage = pageCardImage("site");

export interface PublicPage extends PageMeta {
    /** Route name in src/router/index.ts */
    name: string;
    path: string;
    /** The route's aliases: same page, other addresses */
    aliases?: string[];
    /** Link text in the landing footer. Used for a deployment's pages (src/deployment/), e.g. its legal pages. */
    footer?: string;
}

/** A page title: "<title> - LettersPractice" */
export const titled = (title: string) => `${title} - ${SITE_NAME}`;

/** What the app is, in a sentence (also the web manifest's description, vite.config.ts) */
export const SITE_DESCRIPTION = "Teach your child to read with a guided, interactive workbook.";

/**
 * The home page as the open build has it, and index.html's static tags. A
 * deployment that sells access appends its tagline at runtime and in the
 * prerender (deployment/pitch.ts withPitch).
 */
export const HOME_META: PageMeta = {
    title: titled("Teach your child to read"),
    description: SITE_DESCRIPTION,
};

/**
 * The open app's public pages. A deployment adds its own (its overlay's
 * pages.ts: src/deployment/), which services/pageMeta.ts and the prerender
 * append.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
    { name: "home", path: "/", ...HOME_META },
    {
        name: "curriculum",
        path: "/curriculum",
        title: titled("Our Curriculum"),
        description:
            "How LettersPractice teaches phonics: big ideas in short read-aloud lessons, and the sound-spelling facts inside them, one at a time in everyday practice.",
        image: pageCardImage("curriculum"),
    },
    {
        name: "learning-engine",
        path: "/learning-engine",
        aliases: ["/how-it-works", "/pedagogy"],
        title: titled("Our Learning Engine"),
        description:
            "How LettersPractice picks the next exercise: an open-source engine that weighs review, recombination and new material for each learner, every day.",
        image: pageCardImage("learning-engine"),
    },
    {
        name: "exercises",
        path: "/exercises",
        aliases: ["/questions"],
        title: titled("Our Exercises"),
        description:
            "The four exercises behind LettersPractice, live: why each one, how its cards are made, and what a wrong answer tells the learning engine.",
        image: pageCardImage("exercises"),
    },
    {
        name: "showHN",
        path: "/tech-demo",
        aliases: ["/showHN", "/showhn"],
        title: titled("Technical demo"),
        description:
            "A live LettersPractice study session, with the learning engine's own bookkeeping alongside. Built on Skuilder, the open-source courseware platform we maintain.",
    },
    {
        name: "roadmap",
        path: "/roadmap",
        title: titled("Roadmap"),
        description: "What we're building next for LettersPractice, the lessons in rotation now, and what shipped recently.",
    },
    {
        name: "changelog",
        path: "/changelog",
        title: titled("Changelog"),
        description: "Every LettersPractice update, newest first.",
    },
    {
        name: "fridge-sheet",
        path: "/fridge-sheet",
        aliases: ["/fridge"],
        title: titled("The fridge sheet"),
        description:
            "A free printable letter-sound sheet for the fridge: colour in each letter as the app introduces it. US Letter PDF, with or without letter faces.",
        image: pageCardImage("fridge-sheet"),
    },
    {
        name: "newsletter",
        path: "/newsletter",
        aliases: ["/subscribe"],
        title: titled("Newsletter"),
        description:
            "Occasional notes from LettersPractice, when we publish or ship something worth telling you about. Unsubscribe anytime.",
    },
    {
        name: "pei",
        path: "/pei",
        title: titled("Free for PEI families"),
        description:
            "LettersPractice is made on Prince Edward Island, and PEI families get full access to the early-literacy app: no cost, no catch, no expiry.",
    },
];

export const publicPageByName: ReadonlyMap<string, PublicPage> = new Map(PUBLIC_PAGES.map((p) => [p.name, p]));

/**
 * A live lesson's reader preview, /curriculum/lesson/<id>. People share these
 * (often as /c/l/<id or number> short links), so each gets its own title,
 * description and preview card (components/curriculum/ogCard.ts). Not indexed:
 * the page is the interactive lesson, with little text for a search engine to
 * read; /curriculum is the page to find.
 */
export interface LessonPage extends PageMeta {
    lessonId: string;
    path: string;
    /** Its short links: same page, so preview bots get it without the router's redirect */
    aliases: string[];
    /** "Lesson 2: Letter Teammates", the heading of the page's static copy */
    heading: string;
    image: PageImage;
}

/** Copy markup (components/landing/inlineMarkup.ts) as plain text: labels kept, marks dropped. */
export function plainCopy(text: string): string {
    return text
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](/path)
        .replace(/\[([^\]]+)\]/g, "$1") // [*g* as in *word*]
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/`([^`]+)`/g, "$1");
}

export const LESSON_PAGES: readonly LessonPage[] = lessonsForAge(DEFAULT_AGE).map((lesson) => {
    const heading = `Lesson ${lesson.number}: ${lesson.title}`;
    return {
        lessonId: lesson.id,
        path: `/curriculum/lesson/${lesson.id}`,
        aliases: lessonShortPaths(lesson.id),
        heading,
        title: titled(heading),
        description: truncate(`${plainCopy(lesson.description)} A short read-aloud phonics lesson from ${SITE_NAME}.`, 160),
        image: {
            path: lessonOgImagePath(lesson.id),
            width: OG_CARD_WIDTH,
            height: OG_CARD_HEIGHT,
            alt: lessonOgAlt(lesson),
        },
    };
});

export const lessonPageById: ReadonlyMap<string, LessonPage> = new Map(LESSON_PAGES.map((p) => [p.lessonId, p]));

/** A changelog entry's page: its lead sentence as the title, the rest as the description. */
export function changelogEntryMeta(u: RoadmapUpdate): PageMeta {
    const { lead, rest } = updateSummary(u);
    const date = formatUpdateDate(u.date);
    return {
        title: titled(lead ? truncate(lead.replace(/\.$/, ""), 80) : `Update, ${date}`),
        description: truncate(`${date}: ${rest || lead}`, 160),
    };
}
