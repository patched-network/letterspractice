<!--
  The link-preview cards: each live lesson's (LessonOgCard) and the page
  cards (PAGE_OG_CARDS in components/curriculum/ogCard.ts: the site-wide
  default and a few pages' own), all drawn in og/OgCardFrame.vue.

  /dbg/og/lesson/<id>     one lesson's card at 1200×630, top left.
  /dbg/og/page/<id>       one page card, likewise (site, fridge-sheet, …).
                          scripts/export-og-cards.ts screenshots these once
                          window.__ogReady is set.
  /dbg/og                 the index of every preview image in production: each
                          image any page names (drawn cards and the site-wide
                          default), with every page that names it, worked out by
                          resolvePageMeta, the function production uses, so it
                          can't drift from what ships. Then every drawn card,
                          live, at full and feed size (500px wide, about what X
                          and Bluesky show), for judging legibility. Then a
                          summary of the structured data (seo/structuredData.ts).
                          (/dbg/og/lesson too.)
-->
<template>
  <div v-if="pageCardId" class="og-single">
    <component :is="PAGE_CARD_COMPONENTS[pageCardId]" v-if="PAGE_CARD_COMPONENTS[pageCardId]" @ready="onReady" />
    <p v-else>Unknown page card: {{ pageCardId }}</p>
  </div>

  <div v-else-if="lessonId" class="og-single">
    <LessonOgCard v-if="lesson" :lesson="lesson" @ready="onReady" />
    <p v-else>Unknown lesson: {{ lessonId }}</p>
  </div>

  <div v-else class="og-gallery">
    <header class="og-gallery__intro">
      <h1>Link-preview images (og:image)</h1>
      <p>
        Every image a page names, and every page that names it. Worked out by
        <code>resolvePageMeta</code> (services/pageMeta.ts), the function that sets the head in production, run over
        every public page, lesson preview, changelog entry and app route. Any page that isn't listed in
        <code>src/content/pages.ts</code>, or that has no <code>image</code> there, ends up under the site-wide default.
      </p>
      <nav>
        <a href="#in-use">Images in use</a> · <a href="#cards">Cards, live</a> ·
        <a href="#structured-data">Structured data</a>
      </nav>
    </header>

    <h2 id="in-use" class="og-gallery__heading">Images in use</h2>
    <section v-for="img in imagesInUse" :key="img.path" class="og-gallery__item">
      <h3 class="og-gallery__label">
        <code>{{ img.path }}</code>
        <span class="og-gallery__meta">{{ img.width }}×{{ img.height }}</span>
        <a v-if="img.cardHref" :href="img.cardHref">drawn card: open alone</a>
        <span v-else-if="img.draftHref" class="og-gallery__warn">hand-made PNG, live; a drawn draft sits beside it</span>
        <span v-else class="og-gallery__warn">no card draws this: not re-exportable</span>
      </h3>
      <p class="og-gallery__alt">
        alt: <template v-if="img.alt">{{ img.alt }}</template><em v-else>none</em>
      </p>
      <div class="og-gallery__row">
        <img :src="img.path" class="og-gallery__committed" :alt="img.alt ?? ''" />
        <figure v-if="img.draftHref" class="og-gallery__prior">
          <div class="og-gallery__draft">
            <component :is="PAGE_CARD_COMPONENTS[img.draftId!]" class="og-gallery__draft-scaled" />
          </div>
          <figcaption>Draft redraw, live render (not served): <a :href="img.draftHref">open alone</a></figcaption>
        </figure>
        <div class="og-gallery__users">
          <details v-for="g in img.groups" :key="g.kind" class="og-gallery__group" :open="!g.collapsed">
            <summary>{{ g.title }} ({{ g.pages.length }})</summary>
            <ul>
              <li v-for="pg in g.pages" :key="pg.path">
                <a :href="pg.path"><code>{{ pg.path }}</code></a>
                <span v-if="pg.aliases.length" class="og-gallery__meta"> also {{ pg.aliases.join(", ") }}</span>
                <span v-if="pg.noindex" class="og-gallery__meta"> · noindex</span>
                <span v-if="pg.title" class="og-gallery__meta"> · {{ pg.title }}</span>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </section>

    <h2 id="cards" class="og-gallery__heading">Cards, live</h2>
    <p class="og-gallery__note">
      What <code>scripts/export-og-cards.ts</code> screenshots into <code>public/</code>, at full size and at feed
      size (500px wide, about what X and Bluesky show). Compare these with the committed PNGs above: a difference means
      the card needs re-exporting.
    </p>
    <section v-for="c in gallery" :key="c.key" class="og-gallery__item">
      <h3 class="og-gallery__label">
        {{ c.label }}
        <a :href="c.href">open alone</a>
      </h3>
      <div class="og-gallery__row">
        <LessonOgCard v-if="c.lesson" :lesson="c.lesson" />
        <component :is="c.component" v-else />
        <div class="og-gallery__feed">
          <LessonOgCard v-if="c.lesson" :lesson="c.lesson" class="og-gallery__scaled" />
          <component :is="c.component" v-else class="og-gallery__scaled" />
        </div>
      </div>
    </section>

    <h2 id="structured-data" class="og-gallery__heading">Structured data (JSON-LD)</h2>
    <p class="og-gallery__note">
      From <code>src/seo/structuredData.ts</code>, built here with the origin <code>{{ origin }}</code>. Only the
      pages below carry any; every other public page has none. The images it names are listed per node.
    </p>
    <table class="og-gallery__table">
      <thead>
        <tr><th>Page</th><th>Node</th><th>Images</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in structuredRows" :key="i">
          <td>{{ row.page }}</td>
          <td><code>{{ row.type }}</code></td>
          <td>
            <span v-for="im in row.images" :key="im.key" class="og-gallery__ld-img">
              {{ im.key }}: <code>{{ im.path }}</code>
              <img :src="im.path" alt="" />
            </span>
            <em v-if="!row.images.length">none</em>
          </td>
        </tr>
      </tbody>
    </table>
    <details v-for="sample in structuredSamples" :key="sample.page" class="og-gallery__group">
      <summary>Raw JSON-LD: {{ sample.page }}</summary>
      <pre>{{ JSON.stringify(sample.data, null, 2) }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import LessonOgCard from "../components/curriculum/LessonOgCard.vue";
import { DEFAULT_AGE, lessonsForAge, type CurriculumLesson } from "../components/curriculum/curriculumData";
import { PAGE_OG_CARDS, PAGE_OG_CARD_IDS, isDraftCard, lessonOgImagePath, type PageOgCardId } from "../components/curriculum/ogCard";
import FridgeSheetOgCard from "../components/landing/FridgeSheetOgCard.vue";
import CurriculumOgCard from "../components/og/CurriculumOgCard.vue";
import ExercisesOgCard from "../components/og/ExercisesOgCard.vue";
import LearningEngineOgCard from "../components/og/LearningEngineOgCard.vue";
import SiteOgCard from "../components/og/SiteOgCard.vue";
import { LESSON_PAGES, PUBLIC_PAGES, SITE_IMAGE, type PageImage } from "../content/pages";
import { roadmapUpdates, updatePath } from "../content/roadmap/updates";
import { changelogEntryJsonLd, homeJsonLd, type JsonLd } from "../seo/structuredData";
import { resolvePageMeta, SITE_URL } from "../services/pageMeta";

declare global {
  interface Window {
    __ogReady?: boolean;
    __ogError?: string;
  }
}

const route = useRoute();
const router = useRouter();
const lessons = lessonsForAge(DEFAULT_AGE);
/** Each page card's component; a new card goes in PAGE_OG_CARDS and here */
const PAGE_CARD_COMPONENTS: Record<string, Component> = {
  site: SiteOgCard,
  "fridge-sheet": FridgeSheetOgCard,
  exercises: ExercisesOgCard,
  curriculum: CurriculumOgCard,
  "learning-engine": LearningEngineOgCard,
} satisfies Record<PageOgCardId, Component>;

const pageCardId = computed(() => (route.name === "og-page-card" ? String(route.params.cardId) : ""));
const lessonId = computed(() => (route.params.lessonId as string | undefined) || "");
const lesson = computed(() => lessons.find((l) => l.id === lessonId.value));

const gallery: { key: string; label: string; href: string; lesson?: CurriculumLesson; component?: Component }[] = [
  ...PAGE_OG_CARD_IDS.map((id) => ({
    key: id,
    label: `${id} · ${isDraftCard(id) ? "draft, not served" : PAGE_OG_CARDS[id].path}`,
    href: `/dbg/og/page/${id}`,
    component: PAGE_CARD_COMPONENTS[id],
  })),
  ...lessons.map((l) => ({ key: l.id, label: `${l.number} · ${l.id}`, href: `/dbg/og/lesson/${l.id}`, lesson: l })),
];

if (lessonId.value && !lesson.value) window.__ogError = `unknown lesson: ${lessonId.value}`;
if (pageCardId.value && !PAGE_CARD_COMPONENTS[pageCardId.value]) window.__ogError = `unknown page card: ${pageCardId.value}`;

async function onReady() {
  await document.fonts.ready;
  window.__ogReady = true;
}

// ---- The index: every page, the image resolvePageMeta gives it ----

type PageKind = "public" | "lesson" | "changelog" | "app";

interface PageUse {
  kind: PageKind;
  path: string;
  aliases: string[];
  title: string;
  noindex: boolean;
  image: PageImage;
}

const KIND_TITLES: Record<PageKind, string> = {
  public: "Public pages (content/pages.ts)",
  lesson: "Lesson previews",
  changelog: "Changelog entries (/changelog/<date>)",
  app: "Every other route: app screens, not-found (home copy, noindex)",
};
const COLLAPSED: PageKind[] = ["changelog", "app"];

/** The dev page that draws a committed card, by its image path */
const CARD_HREFS = new Map<string, string>([
  ...PAGE_OG_CARD_IDS.filter((id) => !isDraftCard(id)).map((id): [string, string] => [PAGE_OG_CARDS[id].path, `/dbg/og/page/${id}`]),
  ...lessons.map((l): [string, string] => [lessonOgImagePath(l.id), `/dbg/og/lesson/${l.id}`]),
]);

/** The router's routes that aren't covered by name above: they get resolvePageMeta's fallback */
function appRoutes(): PageUse[] {
  const named = new Set<string>([...PUBLIC_PAGES.map((p) => p.name), "changelog-entry", "curriculum-lesson"]);
  return router
    .getRoutes()
    .filter((r) => !r.redirect && !r.path.startsWith("/dbg") && !(typeof r.name === "string" && named.has(r.name)))
    .map((r) => {
      const meta = resolvePageMeta({ name: r.name, params: {} });
      return { kind: "app" as const, path: r.path, aliases: [], title: "", noindex: meta.noindex, image: meta.image };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const pageUses = computed<PageUse[]>(() => [
  ...PUBLIC_PAGES.map((p) => {
    const meta = resolvePageMeta({ name: p.name, params: {} });
    return { kind: "public" as const, path: p.path, aliases: p.aliases ?? [], title: meta.title, noindex: meta.noindex, image: meta.image };
  }),
  ...LESSON_PAGES.map((p) => {
    const meta = resolvePageMeta({ name: "curriculum-lesson", params: { lessonId: p.lessonId } });
    return { kind: "lesson" as const, path: p.path, aliases: p.aliases, title: meta.title, noindex: meta.noindex, image: meta.image };
  }),
  ...roadmapUpdates.map((u) => {
    const meta = resolvePageMeta({ name: "changelog-entry", params: { date: u.date } });
    return { kind: "changelog" as const, path: updatePath(u), aliases: [], title: meta.title, noindex: meta.noindex, image: meta.image };
  }),
  ...appRoutes(),
]);

function draftFor(path: string): { draftId?: PageOgCardId; draftHref?: string } {
  const id = PAGE_OG_CARD_IDS.find((d) => isDraftCard(d) && PAGE_OG_CARDS[d].path === path);
  return id ? { draftId: id, draftHref: `/dbg/og/page/${id}` } : {};
}

const imagesInUse = computed(() => {
  const byPath = new Map<string, { image: PageImage; uses: PageUse[] }>();
  for (const use of pageUses.value) {
    const entry = byPath.get(use.image.path) ?? { image: use.image, uses: [] };
    entry.uses.push(use);
    byPath.set(use.image.path, entry);
  }
  // The site-wide default first: it's the one most pages fall back to.
  return [...byPath.values()]
    .sort((a, b) => Number(b.image.path === SITE_IMAGE.path) - Number(a.image.path === SITE_IMAGE.path))
    .map(({ image, uses }) => ({
      ...image,
      cardHref: CARD_HREFS.get(image.path),
      // A draft card for this image: drawn, but the committed PNG is still the live one
      ...draftFor(image.path),
      groups: (Object.keys(KIND_TITLES) as PageKind[])
        .map((kind) => ({
          kind,
          title: KIND_TITLES[kind],
          collapsed: COLLAPSED.includes(kind),
          pages: uses.filter((u) => u.kind === kind),
        }))
        .filter((g) => g.pages.length),
    }));
});

// ---- Structured data ----

const origin = SITE_URL || window.location.origin;

const latestUpdate = roadmapUpdates[0];
const structuredSamples: { page: string; data: JsonLd }[] = [
  { page: "/", data: homeJsonLd(origin) },
  ...(latestUpdate
    ? [{ page: `${updatePath(latestUpdate)} (latest; every entry is shaped alike)`, data: changelogEntryJsonLd(latestUpdate, origin) }]
    : []),
];

const IMAGE_KEYS = ["image", "logo"];

/** Each typed node, with the images it names (nested ones too, e.g. publisher.logo) */
function ldNodes(data: JsonLd): { type: string; images: { key: string; path: string }[] }[] {
  const nodes = Array.isArray(data["@graph"]) ? (data["@graph"] as JsonLd[]) : [data];
  return nodes.map((node) => {
    const images: { key: string; path: string }[] = [];
    const walk = (obj: unknown, prefix: string) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (IMAGE_KEYS.includes(k) && typeof v === "string") images.push({ key: prefix + k, path: v.replace(origin, "") });
        else if (typeof v === "object") walk(v, `${prefix}${k}.`);
      }
    };
    walk(node, "");
    return { type: String(node["@type"]), images };
  });
}

const structuredRows = structuredSamples.flatMap((s) => ldNodes(s.data).map((n) => ({ page: s.page, ...n })));
</script>

<style scoped>
.og-single {
  width: 1200px;
  height: 630px;
}

.og-gallery {
  padding: 32px;
  background: #e8e8e8;
  min-height: 100vh;
}
.og-gallery__item {
  margin-bottom: 48px;
}
.og-gallery__intro {
  max-width: 900px;
  margin-bottom: 32px;
}
.og-gallery__heading {
  margin: 48px 0 16px;
  padding-top: 16px;
  border-top: 2px solid #bbb;
}
.og-gallery__note {
  max-width: 900px;
}
.og-gallery__meta {
  color: #666;
  font-weight: 400;
  margin-left: 8px;
}
.og-gallery__warn {
  color: #a04000;
  font-weight: 400;
  margin-left: 12px;
}
.og-gallery__alt {
  margin: -6px 0 12px;
  color: #444;
}
.og-gallery__committed {
  width: 600px;
  height: 315px;
  border-radius: 12px;
  background: #fff;
}
.og-gallery__prior {
  margin: 0;
}
.og-gallery__draft {
  width: 600px;
  height: 315px;
  overflow: hidden;
  border-radius: 12px;
}
.og-gallery__draft-scaled {
  transform: scale(0.5);
  transform-origin: top left;
}
.og-gallery__prior figcaption {
  margin-top: 4px;
  font-size: 0.85rem;
  color: #666;
}
.og-gallery__users {
  flex: 1;
  min-width: 320px;
}
.og-gallery__group {
  margin-bottom: 12px;
}
.og-gallery__group summary {
  font-weight: 600;
  cursor: pointer;
}
.og-gallery__group ul {
  margin: 4px 0 0;
  padding-left: 20px;
}
.og-gallery__group pre {
  font-size: 12px;
  background: #fff;
  padding: 12px;
  overflow-x: auto;
}
.og-gallery__table {
  border-collapse: collapse;
  background: #fff;
  margin-bottom: 16px;
}
.og-gallery__table th,
.og-gallery__table td {
  border: 1px solid #ccc;
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}
.og-gallery__ld-img {
  display: flex;
  align-items: center;
  gap: 8px;
}
.og-gallery__ld-img img {
  height: 40px;
}
.og-gallery__label {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}
.og-gallery__label a {
  margin-left: 12px;
  font-weight: 400;
}
.og-gallery__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 32px;
}
.og-gallery__feed {
  width: 500px;
  height: 262.5px;
  overflow: hidden;
  border-radius: 12px;
}
.og-gallery__scaled {
  transform: scale(calc(500 / 1200));
  transform-origin: top left;
}
</style>
