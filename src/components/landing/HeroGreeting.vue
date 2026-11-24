<template>
    <!-- data-prerender-show: the prerender keeps this section faithful (styles,
         scoping attributes, the vignette's SVG) and index.html shows it from
         the HTML, before the app has loaded; Vue's mount replaces it.
         scripts/prerender-public.ts, "Shown before mount". -->
    <section class="hero-greeting" ref="heroSection" data-prerender-show>
        <!-- NOT `fluid`: every other landing section uses a plain v-container,
             so a fluid hero put its left edge at 16px while the sections below
             started at Vuetify's gutter — a 104px mismatch at 1440, 44px at
             1920. The hero must share the page's left edge. -->
        <v-container class="fill-height py-12 py-md-16">
            <v-row align="center" class="fill-height">
                <!-- Left: the headline, with "read" posed as a live exercise.
                     The H1 carries the complete phrase "Teach your child to
                     read" as real DOM text — the visible line plus an sr-only
                     word — because the SVG vignette is aria-hidden and invisible
                     to search. Do not drop the sr-only span.

                     `headlineWordCycle` is the TAP payload: tapping the word
                     advances read → spell → learn → read. The sr-only span
                     stays "read" through all of it — the keyword is the H1's
                     text, not a readout of animation state, and the vignette is
                     aria-hidden either way. Do not bind it to the cycle. -->
                <v-col cols="12" md="6" class="text-center text-md-left">
                    <h1 class="hero-headline text-h3 text-md-h2 text-lg-h1 font-weight-bold">
                        <span class="hero-headline__line">{{ copy.headline }}</span>
                        <span class="sr-only">{{ " " + copy.headlineWord }}</span>
                        <HeroReadVignette
                            :word="copy.headlineWord"
                            :blank-index="copy.headlineBlankIndex"
                            :cycle="copy.headlineWordCycle"
                            :encore="copy.headlineWordEncore"
                        />
                    </h1>
                </v-col>

                <!-- Right: Hero copy -->
                <v-col cols="12" md="6">
                    <div class="hero-copy">
                        <p class="text-h6 text-md-h5 mb-6 text-medium-emphasis">
                            {{ copy.subtitle }}
                        </p>
                        <p
                            class="text-h6 text-md-h5 mb-3 text-medium-emphasis"
                            v-html="renderInline(copy.description)"
                        ></p>
                        <p
                            class="text-h6 text-md-h5 mb-6 text-medium-emphasis"
                            v-html="renderInline(copy.descriptionOffscreen)"
                        ></p>
                        <!-- The deployment's pricing line (deployment/pitch.ts);
                             none in the open build. Not in the Play Store app,
                             which sells nothing (services/androidApp.ts). -->
                        <p v-if="pitch && !androidApp" class="hero-pricing text-h6 text-md-h5 mb-6 text-medium-emphasis">
                            {{ pitch.pricing }} <b>{{ pitch.pricingHighlight }}</b>.
                        </p>
                    </div>
                </v-col>
            </v-row>

            <!-- Full-width CTA row beneath the Hello|copy columns. Pills reuse
                 the study hub's CTA idiom (HubChoices.vue) — the product's own
                 button language instead of theme-orange v-btns. Lip colors
                 echo the hub: orange = Practice (peek shows practice), green =
                 Learn (study is where lessons live). Auth-aware: a returning
                 visitor resumes study; a new visitor gets a zero-commitment
                 sample (/peek) alongside a start-learning path (/study). -->
            <v-row>
                <v-col cols="12">
                    <div class="hero-cta-row">
                        <template v-if="isLoggedIn">
                            <div class="hero-cta-group">
                                <button
                                    class="hub-cta hub-cta--learn"
                                    type="button"
                                    data-track="cta:hero-resume"
                                    @click="router.push('/study')"
                                >
                                    <span class="hub-cta__label">{{ copy.cta.resume }}</span>
                                </button>
                                <p class="hub-cta__subtitle">
                                    <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account-child</v-icon>
                                    <span>{{ copy.cta.resumeCaption }}</span>
                                </p>
                            </div>
                            <v-btn variant="text" size="large" to="/peek" rounded="lg" data-track="cta:hero-sample">
                                {{ copy.cta.sample }}
                            </v-btn>
                        </template>
                        <template v-else>
                            <div class="hero-cta-group">
                                <button
                                    class="hub-cta hub-cta--practice"
                                    type="button"
                                    data-track="cta:hero-peek"
                                    @click="router.push('/peek')"
                                >
                                    <span class="hub-cta__label">{{ copy.cta.primary }}</span>
                                </button>
                                <p class="hub-cta__subtitle">
                                    <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account</v-icon>
                                    <span>{{ copy.cta.primaryCaption }}</span>
                                </p>
                            </div>
                            <div class="hero-cta-group">
                                <button
                                    class="hub-cta hub-cta--learn"
                                    type="button"
                                    data-track="cta:hero-study"
                                    @click="router.push('/study')"
                                >
                                    <span class="hub-cta__label">{{ copy.cta.secondary }}</span>
                                </button>
                                <p class="hub-cta__subtitle">
                                    <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account-child</v-icon>
                                    <span>{{ copy.cta.secondaryCaption }}</span>
                                </p>
                            </div>
                        </template>
                    </div>
                </v-col>
            </v-row>
        </v-container>
    </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@vue-skuilder/common-ui";
import HeroReadVignette from "./HeroReadVignette.vue";
import { landingPageCopy } from "../../content/landingPageCopy";
import { renderInline } from "./inlineMarkup";
import { isAndroidApp } from "../../services/androidApp";
import { pitch } from "../../deployment";

const androidApp = isAndroidApp();

const copy = landingPageCopy.hero;

const router = useRouter();
const authStore = useAuthStore();
const isLoggedIn = computed(() => authStore.isLoggedIn);

// Refs
const heroSection = ref<HTMLElement | null>(null);
</script>

<style scoped>
.hero-greeting {
    /* Capped, not a bare 80vh. The hero's content height is fixed (~470px at
       its tallest) while 80vh grows with the viewport, so on a tall screen the
       section inflated to hold it: 864px of section for 383px of content at
       1920x1080 — 241px of dead air above AND below. The cap keeps the
       "own the fold" intent on normal screens and stops the blowout on tall
       ones. */
    min-height: min(80vh, 660px);
    display: flex;
    align-items: center;
    /* Vertical, not diagonal: SessionVideoSection continues this gradient's
       end color (#fff8e8) as its own start color, so the seam between the two
       sections must match along the FULL width of the border, not just one
       corner. Hero → video reads as one continuous argument (claim →
       evidence), not a color break. */
    background: linear-gradient(180deg, #fffef7 0%, #fff8e8 100%);
}

/* Headline: the text line and the LetterPeople word are separate display rows.
   Inline flow of SVG glyphs inside the text line is not attempted — the glyphs
   have no baseline to share with the type. */
.hero-headline {
    /* Poppins rather than the Vuetify default (Roboto). The text line and the
       LetterPeople word below it are two different rendering systems, and the
       seam between them is a LETTERFORM mismatch, not a size one: Poppins is
       the same geometric, single-story construction the glyphs use (true-circle
       bowls, single-story `a`), where Roboto's neo-grotesque double-story `a`
       reads as a different alphabet sitting on top of the word.

       Same call, same reason, as the keyboard keycaps — see the `fontFamily`
       default in components/keyboard/ProgressiveKeyboard.vue.

       Size deliberately unchanged: at lg the line is 96px/700, whose cap-height
       (67.0px measured) sits within 0.5% of the word's x-height at --hr-h=165
       (67.3px). The two rows already share that metric; only the shapes were
       off. Poppins does set ~15% wider than Roboto at the same size, so the
       line wraps a word earlier. */
    font-family: "Poppins", sans-serif;
    margin-bottom: 8px;
}

.hero-headline__line {
    display: block;
    /* Vuetify's display classes ship line-height 1.0 for .text-h1/.text-h2
       (1.05 for .text-h3), which is set for a single-line heading. This one
       wraps to two lines at every width below 1920, and solid-set Poppins at
       96px reads cramped. Unitless so it holds across the responsive
       text-h3 / text-md-h2 / text-lg-h1 ladder. */
    line-height: 1.12;
}

/* The vignette centers itself; left-align it with the text from md up, where
   the headline itself goes left-aligned (text-md-left above). */
@media (min-width: 960px) {
    .hero-headline :deep(.hero-read__row) {
        margin-left: 0;
    }
}

/* Visually-hidden "read" — the H1's keyword lives here in real text, since the
   word itself renders as aria-hidden SVG. */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Let the flex columns shrink below their content's intrinsic min-content width.
   Without this the word's intrinsic width can force the whole v-row wider than the
   viewport (the default flex `min-width: auto` trap), dragging the copy column
   off-screen with it. */
.hero-greeting :deep(.v-col) {
    min-width: 0;
}

.hero-copy {
    /* Never exceed the column/viewport on small screens. The 760px ceiling is
       the measure the rest of the page uses (HowItWorks / Mission /
       SessionVideo all cap their prose there) and only takes effect at xl,
       where a 600px block left 300px of dead space at the right edge of its
       column. Below xl the column is narrower than 600px anyway, so the `100%`
       term wins and nothing changes. */
    max-width: min(760px, 100%);
}

/* --- Hero CTA row -------------------------------------------------------
   Full-width beneath the Hello|copy columns; pills side-by-side on desktop,
   stacked (via wrap) on narrow widths. */
.hero-cta-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 32px 56px;
    padding-top: 16px;
}

.hero-cta-group {
    display: flex;
    flex-direction: column;
    align-items: center;
}

/* .hub-cta* replicated verbatim from HubChoices.vue (source of truth for the
   pill idiom) — same established pattern as views/__CtaExport.vue. Keep in
   sync with the hub. */
.hub-cta {
    background: white;
    border: none;
    border-radius: 18px;
    padding: 14px 28px;
    cursor: pointer;
    box-shadow:
        0 6px 14px rgba(0, 0, 0, 0.12),
        inset 0 -4px 0 rgba(0, 0, 0, 0.08);
    transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, filter 0.12s ease-out;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
}

.hub-cta:hover {
    filter: brightness(1.03);
    transform: translateY(-1px);
}

.hub-cta:active {
    transform: translateY(2px);
    box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.12),
        inset 0 -2px 0 rgba(0, 0, 0, 0.08);
}

.hub-cta:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 3px;
}

/* Faint color-coding via a soft bottom-edge tint (hub: green=Learn, orange=Practice) */
.hub-cta--learn {
    box-shadow:
        0 6px 14px rgba(0, 0, 0, 0.12),
        inset 0 -4px 0 rgba(76, 175, 80, 0.45);
}
.hub-cta--practice {
    box-shadow:
        0 6px 14px rgba(0, 0, 0, 0.12),
        inset 0 -4px 0 rgba(255, 152, 0, 0.45);
}

/* Hero-specific: pills carry plain-text labels (sentence-length copy doesn't
   work as LetterPeople glyphs the way the hub's one-word labels do). */
.hub-cta__label {
    font-weight: 600;
    font-size: 1.15rem;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1.2;
}

.hub-cta__subtitle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: rgba(0, 0, 0, 0.65);
    line-height: 1.3;
    margin: 10px 0 0;
}

.hub-cta__subtitle-icon {
    color: rgba(0, 0, 0, 0.45);
    flex-shrink: 0;
}

/* Mobile adjustments */
@media (max-width: 960px) {
    .hero-greeting {
        min-height: auto;
    }

    .hero-headline {
        margin-bottom: 1.5rem;
    }

    .hero-copy {
        text-align: center;
        margin: 0 auto;
    }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
    .hero-greeting {
        background: rgba(255, 254, 247, 1);
    }
}
</style>
