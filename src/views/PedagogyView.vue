<!--
  PedagogyView — /learning-engine (aliases /how-it-works, /pedagogy; renamed
  from How It Works 2026-10-06, beside /curriculum).

  What *this* child does next, and why: the Team of Rivals. Lede → the rivals
  (each technique: what it wants, who it argues with) → how they settle it
  (multiplied scores, shown by DovetailWidget) → how the engine knows (the
  evidence the rivals work from) → curriculum link + CTA.

  Sectioned text, not an accordion (2026-10-08): this was a collapsed insert
  on the landing page; as its own page it reads top to bottom. Same paper as
  /curriculum (--page-bg) and the same 720px prose measure.

  From lg (1280px) up, side by side (2026-10-09): hero + rivals on the left,
  the Team of Rivals panel sticky on the right (scrolls inside itself if it
  outgrows the window), its closing lines under the rivals; the rest of the
  page follows under the left column.
  Pure CSS — DOM order is the narrow layout's reading order.

  Copy lives in content/pedagogyCopy.ts. The landing's UnderTheHoodSection
  shows a chip per technique that deep-links here by section id
  (`/learning-engine#srs`) — keep the ids stable. Scrolling to the hash is the
  router's job (scrollBehavior); sections carry scroll-margin-top.
-->
<template>
    <div class="pedagogy-page">
        <v-container fluid class="py-12">
            <div class="pedagogy-column">
                <!-- From lg (1280px) up: reading on the left, the Team of Rivals
                     panel pinned on the right, so a rival's chip is in reach
                     while you read its section. Below that, one column. -->
                <div class="pedagogy-split">
                    <div class="split-reading">
                        <header class="pedagogy-hero">
                            <h1 class="text-h3 font-weight-bold mb-6">{{ copy.title }}</h1>
                            <p v-for="(p, i) in copy.lede" :key="i" class="lede" v-html="renderInline(p)"></p>
                            <div v-if="SHOW_WORKING_TEXT && copy.ledeWorking.length" class="working-text">
                                <div class="working-label">working text</div>
                                <ul>
                                    <li v-for="(pt, i) in copy.ledeWorking" :key="i" v-html="renderInline(pt)"></li>
                                </ul>
                            </div>
                        </header>

                        <!-- The techniques (code: rivals) -->
                        <section class="pedagogy-part" aria-labelledby="rivals-heading">
                            <h2 id="rivals-heading" class="text-h4 font-weight-bold mb-3">{{ copy.rivalsTitle }}</h2>
                            <p v-for="(p, i) in copy.rivalsLede" :key="i" class="part-lede" v-html="renderInline(p)"></p>
                            <PedagogySectionBlock v-for="s in rivals" :key="s.id" :section="s" />
                        </section>
                    </div>

                    <!-- How they settle it: the page's core -->
                    <section id="team-of-rivals" class="rivals-panel" aria-labelledby="settle-heading">
                        <div class="rivals-eyebrow">
                            <v-icon size="24">mdi-scale-balance</v-icon>
                        </div>
                        <h2 id="settle-heading" class="text-h4 font-weight-bold mb-4">
                            {{ copy.teamOfRivals.title }}
                        </h2>
                        <DovetailWidget />
                    </section>

                    <!-- Outside the panel so the pinned panel fits a window:
                         under the panel when narrow, under the rivals when wide. -->
                    <div class="rivals-closing">
                        <p v-for="(p, i) in copy.teamOfRivals.closing" :key="i" class="prose" v-html="renderInline(p)"></p>
                    </div>
                </div>

                <!-- How the engine knows: the evidence the rivals work from -->
                <section class="pedagogy-part" aria-labelledby="know-heading">
                    <h2 id="know-heading" class="text-h4 font-weight-bold mb-3">{{ copy.knowTitle }}</h2>
                    <p class="part-lede" v-html="renderInline(copy.knowLede)"></p>
                    <PedagogySectionBlock v-for="s in evidence" :key="s.id" :section="s" />
                </section>

                <!-- Cross-link: the order these techniques produce, on /curriculum -->
                <div class="curriculum-link">
                    <p class="link-lead">{{ copy.curriculumLink.lead }}</p>
                    <v-btn
                        to="/curriculum"
                        variant="outlined"
                        color="primary"
                        class="text-none"
                        append-icon="mdi-arrow-right"
                    >
                        {{ copy.curriculumLink.label }}
                    </v-btn>
                </div>

                <!-- Cross-link: the exercises the engine chooses between, live -->
                <div class="curriculum-link mt-8">
                    <p class="link-lead" v-html="renderInline(copy.exercisesLink.lead)"></p>
                    <v-btn
                        to="/exercises"
                        variant="outlined"
                        color="primary"
                        class="text-none"
                        append-icon="mdi-arrow-right"
                    >
                        {{ copy.exercisesLink.label }}
                    </v-btn>
                </div>

                <div class="page-cta">
                    <p class="link-lead">{{ copy.ctaLead }}</p>
                    <v-btn to="/peek" color="primary" variant="flat" class="text-none">
                        {{ ctaLabel }}
                    </v-btn>
                </div>
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import { pedagogyCopy, SHOW_WORKING_TEXT } from "../content/pedagogyCopy";
import { landingPageCopy } from "../content/landingPageCopy";
import { renderInline } from "../components/landing/inlineMarkup";
import PedagogySectionBlock from "../components/pedagogy/PedagogySectionBlock.vue";
import DovetailWidget from "../components/pedagogy/DovetailWidget.vue";

const copy = pedagogyCopy;
const ctaLabel = landingPageCopy.hero.cta.primary;

const rivals = copy.techniques.filter((s) => s.group === "rival");
const evidence = copy.techniques.filter((s) => s.group === "evidence");
</script>

<style scoped>
.pedagogy-page {
    --page-bg: #fffef7;
    min-height: 100vh;
    background: var(--page-bg);
}
.pedagogy-column {
    max-width: 720px;
    margin: 0 auto;
}

.pedagogy-hero {
    margin-bottom: 40px;
}
.lede {
    font-size: 1.125rem;
    line-height: 1.7;
    margin: 0 0 12px;
    color: rgba(33, 33, 33, 0.75);
}
.prose {
    line-height: 1.7;
    margin: 0 0 12px;
}

.pedagogy-part {
    margin-bottom: 48px;
}
.part-lede {
    line-height: 1.7;
    margin: 0 0 8px;
    color: rgba(33, 33, 33, 0.66);
}

/* ---- Team of Rivals: a tinted panel, the page's centre of gravity ---- */
.rivals-panel {
    margin: 0 0 56px;
    padding: 32px;
    border: 2px solid rgba(var(--v-theme-secondary), 0.2);
    border-radius: 20px;
    background: linear-gradient(
        135deg,
        rgba(var(--v-theme-secondary), 0.08) 0%,
        rgba(var(--v-theme-secondary), 0.03) 100%
    );
    scroll-margin-top: calc(var(--v-layout-top, 0px) + 24px);
}
.rivals-closing {
    margin: -32px 0 56px;
}
.rivals-eyebrow {
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-secondary));
    margin-bottom: 10px;
}

/* ---- links out ---- */
.curriculum-link {
    padding-top: 8px;
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
.pedagogy-page :deep(code) {
    background: rgba(var(--v-theme-primary), 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.95em;
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
}

.working-text {
    border: 2px dashed rgba(var(--v-theme-warning), 0.7);
    border-radius: 10px;
    padding: 10px 14px 10px 8px;
    background: rgba(var(--v-theme-warning), 0.06);
}
.working-label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-warning));
    margin-left: 8px;
    margin-bottom: 4px;
}
.working-text ul {
    margin: 0;
    padding-left: 24px;
}

/* ---- desktop: side by side ---- */
@media (min-width: 1280px) {
    .pedagogy-column {
        max-width: 1440px;
    }
    .pedagogy-column > :not(.pedagogy-split) {
        max-width: 720px;
    }
    .pedagogy-split {
        display: grid;
        grid-template-columns: minmax(0, 720px) minmax(480px, 1fr);
        grid-template-areas:
            "reading panel"
            "closing panel";
        column-gap: 48px;
        align-items: start;
    }
    .split-reading {
        grid-area: reading;
    }
    .rivals-closing {
        grid-area: closing;
        margin: 24px 0 0;
    }
    .pedagogy-split .rivals-panel {
        grid-area: panel;
    }
    .pedagogy-split .rivals-panel h2 {
        font-size: 1.5rem !important;
        margin-bottom: 8px !important;
    }
    .pedagogy-split .rivals-panel :deep(.dovetail) {
        margin: 16px 0 0;
    }
    .pedagogy-split .rivals-panel :deep(.cand) {
        padding: 6px 12px;
        margin-bottom: 6px;
    }
    .split-reading .pedagogy-part {
        margin-bottom: 0;
    }
    .pedagogy-split .rivals-panel {
        position: sticky;
        top: calc(var(--v-layout-top, 0px) + 24px);
        max-height: calc(100vh - var(--v-layout-top, 0px) - 48px);
        overflow-y: auto;
        margin: 0;
        padding: 24px;
    }
    .pedagogy-split + * {
        margin-top: 56px;
    }
}

@media (max-width: 600px) {
    .rivals-panel {
        padding: 24px 16px;
    }
}
</style>
