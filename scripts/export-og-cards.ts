// Link-preview cards (og:image), 1200×630 PNGs: each live lesson's, and the
// page cards (PAGE_OG_CARDS: the site-wide default and a few pages' own).
//
// Drives headless Chromium against the dev-only card pages (src/dbg/OgCardsDbg.vue):
// /dbg/og/lesson/<id> (src/components/curriculum/LessonOgCard.vue) and
// /dbg/og/page/<id> (src/components/og/*OgCard.vue,
// src/components/landing/FridgeSheetOgCard.vue). Waits for window.__ogReady
// and screenshots each card. Rendered at 2x and downscaled, for crisper text
// than a 1x capture.
//
// Needs a running dev server (`yarn dev`; LP_EXPORT_SERVER for another port). The
// wordmark's colours are a fresh random draw per render (BRAND_COLOR_TRANSFORM),
// as in the email CTA export.
//
// Usage:
//   npx tsx scripts/export-og-cards.ts                   # every card
//   npx tsx scripts/export-og-cards.ts digraphs bed      # just these lessons
//   npx tsx scripts/export-og-cards.ts site exercises    # just these page cards
//   LP_EXPORT_SERVER=http://localhost:5180 npx tsx scripts/export-og-cards.ts
//   LP_OUT_DIR=tmp/og-cards npx tsx scripts/export-og-cards.ts   # try a change without touching public/
//
// Output: each card's image path under public/ (lessonOgImagePath, PAGE_OG_CARDS),
// e.g. public/og/lesson-<id>.png, public/og/exercises.png, public/og-image.png;
// committed. A draft card (PAGE_OG_CARDS `draft`: the site card, for now) goes
// to tmp/og-drafts/<id>.png instead, leaving the live image alone. Each page names its card as og:image (src/content/pages.ts), and
// /dbg/og lists which page uses which. Re-run after a card's look or copy
// changes, or what it draws does, and commit the result;
// src/components/curriculum/ogCard.test.ts fails while a live lesson has no
// card, src/content/pages.test.ts while any page's image is missing.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { DEFAULT_AGE, lessonsForAge } from "../src/components/curriculum/curriculumData";
import {
  OG_CARD_HEIGHT as HEIGHT,
  OG_CARD_WIDTH as WIDTH,
  OG_DRAFT_DIR,
  PAGE_OG_CARDS,
  PAGE_OG_CARD_IDS,
  isDraftCard,
  lessonOgImagePath,
} from "../src/components/curriculum/ogCard";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The page's signals (src/dbg/OgCardsDbg.vue) */
type OgWindow = { __ogReady?: boolean; __ogError?: string };

/** A card: the id to ask for it by, the dev page that draws it, where its PNG goes (site path, under public/) */
interface Card {
  id: string;
  page: string;
  image: string;
  /** Not the live image (PAGE_OG_CARDS `draft`): exported to OG_DRAFT_DIR instead */
  draft?: boolean;
}

const CARDS: Card[] = [
  ...lessonsForAge(DEFAULT_AGE).map((l) => ({ id: l.id, page: `/dbg/og/lesson/${l.id}`, image: lessonOgImagePath(l.id) })),
  ...PAGE_OG_CARD_IDS.map((id) => ({
    id,
    page: `/dbg/og/page/${id}`,
    image: PAGE_OG_CARDS[id].path,
    draft: isDraftCard(id),
  })),
];

async function main() {
  const server = (process.env.LP_EXPORT_SERVER ?? "http://localhost:5173").replace(/\/+$/, "");
  const outDir = path.resolve(PROJECT_ROOT, process.env.LP_OUT_DIR ?? "public");
  const known = CARDS.map((c) => c.id);
  const ids = process.argv.slice(2);
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length) throw new Error(`no such card: ${unknown.join(", ")} (cards: ${known.join(", ")})`);
  const cards = ids.length ? CARDS.filter((c) => ids.includes(c.id)) : CARDS;

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
    });
    for (const { id, page: cardPage, image, draft } of cards) {
      await page.goto(`${server}${cardPage}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => (window as unknown as OgWindow).__ogReady === true || !!(window as unknown as OgWindow).__ogError,
        undefined,
        { timeout: 30_000 },
      );
      const err = await page.evaluate(() => (window as unknown as OgWindow).__ogError);
      if (err) throw new Error(`${id}: ${err}`);

      const card = await page.$(".og-card");
      if (!card) throw new Error(`${id}: no .og-card on the page`);
      const raw = await card.screenshot({ type: "png" });
      const png = await sharp(raw).resize({ width: WIDTH, height: HEIGHT }).png({ compressionLevel: 9 }).toBuffer();
      const out = draft ? path.resolve(PROJECT_ROOT, OG_DRAFT_DIR, `${id}.png`) : path.join(outDir, image);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, png);
      console.log(`[og-cards] ${out} (${Math.round(png.byteLength / 1024)} KB)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
