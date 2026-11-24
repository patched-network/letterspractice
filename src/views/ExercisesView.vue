<!--
  ExercisesView: /exercises (alias /questions). The third "what we do here"
  page, beside /curriculum (what is taught, and when) and /learning-engine
  (which exercise comes next): what the exercises are.

  Lede → the grid (pick/make × one sound/whole word, a cell per exercise,
  each a jump link) → a section per exercise: the task, a live demo
  (ExerciseStage: the real question view, preview mode, on its own real
  keyboard), why this exercise, where its cards come from, what a mistake
  tells us → what they all share → links out + CTA.

  Wide (≥1100px): prose left, the demo pinned right while its section scrolls
  by; the hero does the same with the lede and the grid. Narrow: task, demo, prose. Pure CSS; DOM order is the narrow reading
  order.

  Copy lives in content/exercisesCopy.ts. The landing's UnderTheHoodSection
  shows a chip per exercise that deep-links here by section id
  (`/exercises#wst`): keep the ids stable. Scrolling to the hash is the
  router's job (scrollBehavior); sections carry scroll-margin-top.
-->
<template>
    <div class="exercises-page">
        <v-container fluid class="py-12">
            <div class="ex-column">
                <header class="ex-hero">
                    <div class="ex-hero__text">
                        <h1 class="text-h3 font-weight-bold mb-6">{{ copy.title }}</h1>
                        <template v-for="(p, i) in copy.lede" :key="i">
                            <!-- "## Heading" lines in the lede are subheads -->
                            <h2 v-if="p.startsWith('## ')" class="lede-head">{{ p.slice(3) }}</h2>
                            <p v-else class="lede" v-html="renderInline(p)"></p>
                        </template>
                    </div>

                    <!-- The grid the four fill: pick/make × one sound/whole word -->
                    <div class="ex-grid" role="table" aria-label="The four exercises">
                        <div role="row" class="ex-grid__row">
                            <span role="columnheader" class="ex-grid__corner"></span>
                            <span role="columnheader" class="ex-grid__head">{{ copy.gridLabels.part }}</span>
                            <span role="columnheader" class="ex-grid__head">{{ copy.gridLabels.whole }}</span>
                        </div>
                        <div v-for="mode in MODES" :key="mode" role="row" class="ex-grid__row">
                            <span role="rowheader" class="ex-grid__head ex-grid__head--row">
                                {{ copy.gridLabels[mode] }}
                            </span>
                            <a
                                v-for="grain in GRAINS"
                                :key="grain"
                                role="cell"
                                class="ex-grid__cell"
                                :style="{ '--ex-color': exColor(cellOf(mode, grain).id) }"
                                :href="`#${cellOf(mode, grain).id}`"
                                @click.prevent="jump(cellOf(mode, grain).id)"
                            >
                                <v-icon size="22" class="ex-grid__icon">{{ cellOf(mode, grain).icon }}</v-icon>
                                <span class="ex-grid__name">{{ cellOf(mode, grain).name }}</span>
                                <span class="ex-grid__task">{{ cellOf(mode, grain).task }}</span>
                            </a>
                        </div>
                    </div>
                </header>

                <section
                    v-for="ex in copy.exercises"
                    :id="ex.id"
                    :key="ex.id"
                    class="ex-section"
                    :style="{ '--ex-color': exColor(ex.id) }"
                    :aria-labelledby="`${ex.id}-heading`"
                >
                    <div class="ex-section__head">
                        <div class="ex-section__eyebrow">
                            {{ copy.gridLabels[ex.cell.mode] }} · {{ copy.gridLabels[ex.cell.grain] }}
                        </div>
                        <h2 :id="`${ex.id}-heading`" class="text-h4 font-weight-bold mb-2">{{ ex.name }}</h2>
                        <p class="ex-section__task">{{ ex.task }}</p>
                    </div>

                    <div class="ex-section__demo">
                        <ExerciseStage
                            :demo="EXERCISE_DEMOS[ex.id]"
                            :caption="ex.levelsCaption"
                            :levels-label="`${ex.name}: how much help`"
                        />
                    </div>

                    <div class="ex-section__prose">
                        <h3 class="ex-sub">{{ copy.sectionLabels.why }}</h3>
                        <p v-for="(p, i) in ex.why" :key="`w${i}`" class="prose" v-html="renderInline(p)"></p>

                        <h3 class="ex-sub">{{ copy.sectionLabels.made }}</h3>
                        <p v-for="(p, i) in ex.made" :key="`m${i}`" class="prose" v-html="renderInline(p)"></p>

                        <h3 class="ex-sub">{{ copy.sectionLabels.mistakes }}</h3>
                        <p v-for="(p, i) in ex.mistakes" :key="`x${i}`" class="prose" v-html="renderInline(p)"></p>

                        <GraderTry v-if="ex.id === 'spelling'" />
                    </div>
                </section>

                <section class="ex-threads" aria-labelledby="threads-heading">
                    <h2 id="threads-heading" class="text-h4 font-weight-bold mb-4">{{ copy.threads.title }}</h2>
                    <p v-for="item in copy.threads.items" :key="item.label" class="prose">
                        <strong>{{ item.label }}</strong>
                        {{ " " }}<span v-html="renderInline(item.text)"></span>
                    </p>
                </section>

                <div class="ex-links">
                    <div class="ex-link">
                        <p class="link-lead">{{ copy.links.curriculum.lead }}</p>
                        <v-btn
                            to="/curriculum"
                            variant="outlined"
                            color="primary"
                            class="text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.links.curriculum.label }}
                        </v-btn>
                    </div>
                    <div class="ex-link">
                        <p class="link-lead">{{ copy.links.engine.lead }}</p>
                        <v-btn
                            to="/learning-engine"
                            variant="outlined"
                            color="primary"
                            class="text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.links.engine.label }}
                        </v-btn>
                    </div>
                </div>

                <div class="page-cta">
                    <p class="link-lead">{{ copy.ctaLead }}</p>
                    <v-btn to="/peek" color="primary" variant="flat" class="text-none">
                        {{ ctaLabel }}
                    </v-btn>
                </div>
            </div>
        </v-container>

        <LandingFooter />
    </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { exercisesCopy, type ExerciseCell } from "../content/exercisesCopy";
import { landingPageCopy } from "../content/landingPageCopy";
import { renderInline } from "../components/landing/inlineMarkup";
import LandingFooter from "../components/landing/LandingFooter.vue";
import ExerciseStage from "../components/exercises/ExerciseStage.vue";
import GraderTry from "../components/exercises/GraderTry.vue";
import { EXERCISE_DEMOS } from "../components/exercises/exerciseDemos";
import { CATEGORICAL } from "../theme/categoricalPalette";

const copy = exercisesCopy;
const ctaLabel = landingPageCopy.hero.cta.primary;

const MODES = ["recognise", "produce"] as const;
const GRAINS = ["part", "whole"] as const;
function cellOf(mode: ExerciseCell["mode"], grain: ExerciseCell["grain"]) {
    return copy.exercises.find((e) => e.cell.mode === mode && e.cell.grain === grain)!;
}

// Each exercise's colour: the palette /curriculum's lessons use, in page order.
// It tints the section's band, its eyebrow and its grid cell's icon.
function exColor(id: string): string {
    const i = copy.exercises.findIndex((e) => e.id === id);
    return CATEGORICAL[Math.max(0, i) % CATEGORICAL.length];
}

// Same-page anchor: through the router, so scrollBehavior handles the offset
const router = useRouter();
function jump(id: string): void {
    router.push({ hash: `#${id}` });
}
</script>

<style scoped>
.exercises-page {
    --page-bg: #fffef7;
    min-height: 100vh;
    background: var(--page-bg);
}
.ex-column {
    max-width: 720px;
    margin: 0 auto;
}

.ex-hero {
    margin-bottom: 48px;
}
.lede {
    font-size: 1.125rem;
    line-height: 1.7;
    margin: 0 0 12px;
    color: rgba(33, 33, 33, 0.75);
}
.lede-head {
    margin: 28px 0 8px;
    font-size: 1.25rem;
    font-weight: 700;
}
.prose {
    line-height: 1.7;
    margin: 0 0 12px;
}

/* ---- the grid ---- */
.ex-grid {
    display: grid;
    gap: 8px;
    margin-top: 28px;
}
.ex-grid__row {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    align-items: stretch;
}
.ex-grid__head {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
    align-self: end;
}
.ex-grid__head--row {
    align-self: center;
}
.ex-grid__cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 14px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s ease;
}
.ex-grid__cell:hover {
    border-color: color-mix(in srgb, var(--ex-color) 50%, transparent);
}
.ex-grid__icon {
    color: var(--ex-color);
}
.ex-grid__name {
    font-weight: 700;
}
.ex-grid__task {
    font-size: 0.875rem;
    line-height: 1.45;
    color: rgba(33, 33, 33, 0.66);
}

/* ---- a section per exercise ---- */
/* A full-bleed band in a wash of the exercise's colour, as /curriculum's
   lessons do (LessonSection.vue): the shadow carries the wash to the
   viewport's edges; the clip keeps it to the section's height. */
.ex-section {
    --ex-wash: color-mix(in srgb, var(--ex-color) 7%, var(--page-bg));
    padding: 48px 0;
    background: var(--ex-wash);
    box-shadow: 0 0 0 100vmax var(--ex-wash);
    clip-path: inset(0 -100vmax);
    scroll-margin-top: var(--v-layout-top, 0px);
}

.ex-section__eyebrow {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ex-color);
    margin-bottom: 6px;
}
.ex-section__task {
    font-size: 1.125rem;
    line-height: 1.6;
    margin: 0 0 20px;
    color: rgba(33, 33, 33, 0.75);
}
.ex-section__demo {
    margin-bottom: 24px;
}
.ex-sub {
    margin: 20px 0 6px;
    font-size: 1.05rem;
    font-weight: 700;
}
.ex-sub:first-child {
    margin-top: 0;
}

.ex-threads {
    margin: 56px 0 48px;
}

/* ---- links out ---- */
.ex-links {
    display: flex;
    flex-wrap: wrap;
    gap: 24px 48px;
}
.link-lead {
    margin: 0 0 12px;
    color: rgba(33, 33, 33, 0.6);
}
.page-cta {
    margin-top: 48px;
    text-align: center;
}

/* :deep() — chips are injected via v-html, so they lack the scoped attr. */
.exercises-page :deep(code) {
    background: rgba(var(--v-theme-primary), 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.95em;
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
}

/* ---- wide: prose left, demo pinned right ---- */
@media (min-width: 1100px) {
    .ex-column {
        max-width: 1240px;
    }
    .ex-threads,
    .ex-links,
    .page-cta {
        max-width: 720px;
    }
    .page-cta {
        margin-left: 0;
        text-align: left;
    }
    /* Same columns as the sections below: lede left, grid pinned right */
    .ex-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(420px, 520px);
        column-gap: 48px;
        align-items: start;
    }
    .ex-grid {
        position: sticky;
        top: calc(var(--v-layout-top, 0px) + 24px);
        margin-top: 0;
    }
    .ex-section {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(420px, 520px);
        grid-template-areas:
            "head demo"
            "prose demo";
        grid-template-rows: auto 1fr;
        column-gap: 48px;
        align-items: start;
        padding: 72px 0;
    }
    .ex-section__head {
        grid-area: head;
    }
    .ex-section__prose {
        grid-area: prose;
    }
    .ex-section__demo {
        grid-area: demo;
        position: sticky;
        top: calc(var(--v-layout-top, 0px) + 24px);
        margin-bottom: 0;
    }
}

@media (max-width: 600px) {
    .ex-grid__row {
        grid-template-columns: 44px minmax(0, 1fr) minmax(0, 1fr);
        gap: 6px;
    }
    .ex-grid__head--row {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        justify-self: center;
    }
    .ex-grid__cell {
        padding: 10px 12px;
    }
    .ex-grid__task {
        display: none;
    }
}
</style>
