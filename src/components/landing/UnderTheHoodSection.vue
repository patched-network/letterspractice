<!--
  UnderTheHoodSection — the landing page's one look under the hood, right
  under the hero (moved up 2026-11-12; was between the tour and the mission):
  a shared header, then three cards that link out.

  - Exercises (2026-11-12): what the main loop runs — a chip per exercise
    type, each deep-linked to its live demo on /exercises.

  - Curriculum: what gets taught, and when — a chip per live lesson
    (numbered and coloured as /curriculum shows them), each deep-linked to its
    section there.
  - Learning Engine: how the app chooses what comes next — a chip per
    technique, in the copy's (meaningful) order, each deep-linked to its
    section on /learning-engine (which opens that panel).

  Merged 2026-10-06 from CurriculumSection and HowItWorksSection: two
  same-shaped link-out stubs back to back read as a repeat. Copy in
  landingPageCopy.behindTheScenes; technique names from pedagogyCopy.
-->
<template>
    <section class="hood-section">
        <v-container class="py-12">
            <div class="hood-inner">
                <header class="lp-section-header">
                    <div class="lp-eyebrow">{{ copy.eyebrow }}</div>
                    <h2 class="lp-section-title">{{ copy.sectionTitle }}</h2>
                    <p v-for="(p, i) in intro" :key="i" class="lp-lede" v-html="renderInline(p)"></p>
                </header>

                <div class="hood-cards">
                    <article class="hood-card">
                        <h3 class="hood-card__title">
                            <router-link to="/exercises" data-track="cta:exercises" class="hood-card__link">{{ copy.exercises.title }}</router-link>
                        </h3>
                        <p class="hood-card__line" v-html="renderInline(copy.exercises.line)"></p>
                        <ul class="hood-chips">
                            <li v-for="ex in exercises" :key="ex.id">
                                <router-link
                                    :to="{ path: '/exercises', hash: `#${ex.id}` }"
                                    class="hood-chip"
                                >
                                    <v-icon size="18" class="hood-chip__icon">{{ ex.icon }}</v-icon>
                                    {{ ex.name }}
                                </router-link>
                            </li>
                        </ul>
                        <v-btn
                            to="/exercises"
                            data-track="cta:exercises"
                            variant="outlined"
                            color="primary"
                            class="hood-card__more text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.exercises.readMore }}
                        </v-btn>
                    </article>

                    <article class="hood-card">
                        <h3 class="hood-card__title">
                            <router-link to="/curriculum" data-track="cta:curriculum" class="hood-card__link">{{ copy.curriculum.title }}</router-link>
                        </h3>
                        <p class="hood-card__line" v-html="renderInline(copy.curriculum.line)"></p>
                        <ol class="hood-chips">
                            <li v-for="lesson in lessons" :key="lesson.id">
                                <router-link
                                    :to="{ path: '/curriculum', hash: `#lesson-${lesson.id}` }"
                                    class="hood-chip hood-chip--lesson"
                                >
                                    <LessonNumber :n="lesson.number" :color="lesson.color" />
                                    {{ lesson.title }}
                                </router-link>
                            </li>
                        </ol>
                        <v-btn
                            to="/curriculum"
                            data-track="cta:curriculum"
                            variant="outlined"
                            color="primary"
                            class="hood-card__more text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.curriculum.readMore }}
                        </v-btn>
                    </article>

                    <article class="hood-card">
                        <h3 class="hood-card__title">
                            <router-link to="/learning-engine" data-track="cta:learning-engine" class="hood-card__link">{{ copy.engine.title }}</router-link>
                        </h3>
                        <p class="hood-card__line" v-html="renderInline(copy.engine.line)"></p>
                        <ul class="hood-chips">
                            <li v-for="technique in techniques" :key="technique.id">
                                <router-link
                                    :to="{ path: '/learning-engine', hash: `#${technique.id}` }"
                                    class="hood-chip"
                                >
                                    <v-icon size="18" class="hood-chip__icon">{{ technique.icon }}</v-icon>
                                    {{ technique.name }}
                                </router-link>
                            </li>
                        </ul>
                        <v-btn
                            to="/learning-engine"
                            data-track="cta:learning-engine"
                            variant="outlined"
                            color="primary"
                            class="hood-card__more text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.engine.readMore }}
                        </v-btn>
                    </article>
                </div>
            </div>
        </v-container>
    </section>
</template>

<script setup lang="ts">
import { landingPageCopy } from "../../content/landingPageCopy";
import { pedagogyCopy } from "../../content/pedagogyCopy";
import { exercisesCopy } from "../../content/exercisesCopy";
import { DEFAULT_AGE, lessonsForAge } from "../curriculum/curriculumData";
import LessonNumber from "../curriculum/LessonNumber.vue";
import { renderInline } from "./inlineMarkup";

const copy = landingPageCopy.behindTheScenes;
const techniques = pedagogyCopy.techniques;
const exercises = exercisesCopy.exercises;
const lessons = lessonsForAge(DEFAULT_AGE);
// One paragraph or several (copy.intro is string | string[]).
const intro = ([] as string[]).concat(copy.intro);
</script>

<style scoped>
/*
 * A panel of its own: the tour above is the page cream, the mission below is
 * green — so a cool wash. (See landing/workingdoc.md on section backgrounds.)
 */
.hood-section {
    /* Vertical, not diagonal: SessionVideoSection's lower half is this
       gradient's start colour, so the seam must match across its full width. */
    background: linear-gradient(180deg, #f6f9ff 0%, #edf3fc 100%);
}

/* Header and cards share one column, so their left edges line up */
.hood-inner {
    max-width: 1120px;
    margin: 0 auto;
}

/* ---- shared section-header grammar (mirrors SessionWalkthrough .sw-header) ---- */
.lp-section-header {
    margin: 0 0 32px;
    text-align: left;
}
.lp-eyebrow {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.166em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
    margin-bottom: 14px;
}
.lp-section-title {
    margin: 0 0 18px;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
}
.lp-lede {
    max-width: 760px;
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.55;
    color: rgba(var(--v-theme-on-surface), 0.66);
}
.lp-lede + .lp-lede {
    margin-top: 0.75em;
}

/* ---- the two cards: side by side, stacked on phones ---- */
.hood-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
}
/*
 * The whole card is a link to its page, but it holds links of its own (chips,
 * the button), and links can't nest. So the title is the link, and its ::after
 * covers the card; the chips and the button sit above that layer, keeping
 * their own targets. Clicks on the card's open area count as the card's cta.
 */
.hood-card {
    position: relative;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    display: flex;
    flex-direction: column;
    padding: 24px;
    border-radius: 16px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
}
.hood-card__title {
    margin: 0 0 8px;
    font-size: 1.375rem;
    font-weight: 700;
}
.hood-card__link {
    color: inherit;
    text-decoration: none;
}
.hood-card__link::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
}
.hood-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.35);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}
.hood-card:has(.hood-card__link:focus-visible) {
    outline: 3px solid rgba(var(--v-theme-primary), 0.5);
    outline-offset: 2px;
}
.hood-card__link:focus-visible {
    outline: none;
}
.hood-chips,
.hood-card__more {
    position: relative;
    z-index: 1;
}
.hood-card__line {
    margin: 0 0 16px;
    line-height: 1.55;
    color: rgba(var(--v-theme-on-surface), 0.66);
}
/* Buttons sit at the cards' feet, level with each other */
.hood-card__more {
    align-self: flex-start;
    margin-top: auto;
}

/* ---- chips ---- */
.hood-chips {
    margin: 0 0 20px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.hood-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 10px;
    border-radius: 999px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    font-size: 0.9rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
    text-decoration: none;
    transition: border-color 0.15s ease;
}
.hood-chip--lesson {
    padding-left: 6px;
}
.hood-chip:hover {
    border-color: rgba(var(--v-theme-primary), 0.5);
}
.hood-chip__icon {
    color: rgb(var(--v-theme-primary));
}

/* ---- mobile ---- */
@media (max-width: 960px) {
    .hood-cards {
        grid-template-columns: 1fr;
    }
}
@media (max-width: 720px) {
    .lp-section-title {
        font-size: 2rem;
    }
}
</style>
