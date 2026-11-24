<!--
  CurriculumView — /curriculum. Public walk through the curriculum, top to
  bottom, as a typical learner meets it: session by session, the facts each
  session brings (DripTimeline), and the lessons (ideas) among them
  (LessonSection). Wide screens put the lessons in a column on the left and
  the timeline beside them, pinned and scrubbed by the page's scroll, each
  lesson opening marked in it; narrower ones get the horizontal strip
  (DripStrip, scrolling in its own box) above the lessons. One simulated age
  (3); `?age=` swaps it.

  Data, not copy: lesson titles and descriptions come from LESSON_CATALOG;
  facts and timings from the curriculum sim (see components/curriculum/
  curriculumData.ts). Only live lessons appear — the deferred catalog's copy
  is provisional, so what's coming stays on /roadmap.

  Stills: see LessonSection. Each links to /curriculum/lesson/<id>: the live
  lesson in LessonView's preview mode (nothing recorded).

  Linked from the landing page (UnderTheHoodSection), /learning-engine, the
  header (logged out) and the footer; links back to /learning-engine (the lede's last line, and under
  the caveat). The timeline captions are still placeholders (PLACEHOLDER(P10)).
-->
<template>
    <div class="curriculum-page">
        <v-container class="py-12">
            <v-row justify="center">
                <v-col cols="12" md="11" lg="12">
                    <header class="curriculum-hero">
                        <h1 class="text-h3 font-weight-bold mb-6">{{ copy.title }}</h1>
                        <p v-for="(p, i) in copy.lede" :key="i" class="prose" v-html="renderInline(p)"></p>
                    </header>

                    <!-- Wide: the lessons as a list down the left; the timeline
                         beside them, pinned and scrubbed by the page's scroll
                         (syncDrip), lesson openings marked in it. The two aren't
                         aligned row for row; the mix is the point. Narrower:
                         the horizontal strip, then the lessons. -->
                    <div v-if="split" ref="splitEl" class="curriculum-split">
                        <div class="curriculum-split__lessons">
                            <LessonSection
                                v-for="group in lessonGroups"
                                :key="group.lesson.id"
                                :lesson="group.lesson"
                                :subs="group.subs"
                                :facts-caption="copy.factsCaption"
                                split
                            />
                        </div>
                        <aside ref="dripEl" class="curriculum-split__drip" aria-labelledby="timeline-heading">
                            <h2 id="timeline-heading" class="text-h6 font-weight-bold mb-2">{{ copy.timelineHeading }}</h2>
                            <p class="timeline-caption">{{ timelineCaption }}</p>
                            <DripTimeline :age="age" @lesson="scrollToLesson" />
                        </aside>
                    </div>
                    <template v-else>
                        <section class="curriculum-strip" aria-labelledby="timeline-heading">
                            <h2 id="timeline-heading" class="text-h5 font-weight-bold mb-3">{{ copy.timelineHeading }}</h2>
                            <DripStrip :age="age">
                                <template #caption>{{ stripCaption }}</template>
                            </DripStrip>
                        </section>
                        <LessonSection
                            v-for="group in lessonGroups"
                            :key="group.lesson.id"
                            :lesson="group.lesson"
                            :subs="group.subs"
                            :facts-caption="copy.factsCaption"
                        />
                    </template>

                    <section class="curriculum-caveat">
                        <p v-for="(p, i) in copy.caveat" :key="i" class="prose" v-html="renderInline(p)"></p>
                        <!-- Cross-link: why this order, and how it bends -->
                        <p class="curriculum-link-lead">{{ copy.howItWorks.lead }}</p>
                        <v-btn
                            to="/learning-engine"
                            variant="outlined"
                            color="primary"
                            class="text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.howItWorks.label }}
                        </v-btn>
                        <!-- Cross-link: the exercises that practise these facts -->
                        <p class="curriculum-link-lead mt-6">{{ copy.exercisesLink.lead }}</p>
                        <v-btn
                            to="/exercises"
                            variant="outlined"
                            color="primary"
                            class="text-none"
                            append-icon="mdi-arrow-right"
                        >
                            {{ copy.exercisesLink.label }}
                        </v-btn>
                    </section>
                </v-col>
            </v-row>
        </v-container>

        <LandingFooter />
    </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import LandingFooter from '../components/landing/LandingFooter.vue';
import DripStrip from '../components/curriculum/DripStrip.vue';
import DripTimeline from '../components/curriculum/DripTimeline.vue';
import { renderInline } from '../components/landing/inlineMarkup';
import LessonSection from '../components/curriculum/LessonSection.vue';
import {
    AGES,
    DEFAULT_AGE,
    groupLessons,
    lessonsForAge,
    profileFor,
} from '../components/curriculum/curriculumData';

/*
 * POTENTIAL_COPY_OPTIONS — lines that may earn a place on the page:
 *
 * - Seen before introduced, introduced before seen: a letter usually turns up
 *   in a few practice words before its formal introduction (the app shows it,
 *   then names it); a weird word is introduced first, because it only ever
 *   appears in its own cards.
 * - Some facts arrive with their lesson rather than through an introduction
 *   of their own: the lesson is the introduction (final e, i, o in "Vowels at
 *   the End"; s as /z/ in "is"; nk in "think").
 * - Roughly one new fact in hand at a time: after each introduction the app
 *   waits for a few successful answers before the next one, which still
 *   allows three or four new facts in an early session.
 */

/*
 * Copy markup (renderInline): **bold**, *italic*, `chip`. A bracketed
 * [*g* as in *word*, *word*] is a tap-to-hear fact (inlineFacts.ts):
 * the spelling, then examples; the first example says which sound it is.
 * [*g*] alone plays just the sound. [text](/path) is a link.
 */
const copy = {
    title: 'Our Curriculum',
    lede: [
      'LettersPractice teaches two kinds of thing.',
      'First, the big **ideas** or categories of phonetic rules — like *letters make sounds* or *two letters can team up to make a sound*. These arrive in micro lessons that a grown-up reads aloud.',
      'Second, each big idea holds a collection of **facts** — like [*f* as in *fix*] or [*sh* as in *ship*]. These arrive one at a time, in everyday practice.',
      "But not all facts are created equal. [*th* as in *this*, *that*, *the*], from Lesson 2, gets more use than Lesson 1's [j], [x], [z] and [y] put together. So we allow for multiple active lessons to feed content at once — data driven — the most useful facts first.",
      'At any given time, a learner is getting familiar with one or two new **facts** and a maximum of one new **idea**, always focused on growth toward real world **reading independence**.',
      "Learn more about how we manage a user's active content in the [Learning Engine](/learning-engine) page.",
        // 'The two drip separately. A new lesson opens every few sessions, once the earlier ideas are in practice. Facts come from every lesson opened so far, ordered by how much real reading each one unlocks: *th* (*the*, *that*, *this*) arrives well before *z*, though *th* belongs to the second lesson. The aim is about one new fact in hand at any moment, and at most one new idea.',
    ],
    timelineHeading: 'Fact rollout: a rough guide',
    factsCaption: 'Facts for this idea:',
    caveat: [
        'As facts are released into rotation, they fall into the hands of our learning engine, which selects exercises optimized for uptake, retention, and recombining the old with the new. When facts are shaky, new facts are stopped until we have good evidence of recovery and solidification.',
    ],
    // Cross-link to /learning-engine, under the caveat
    howItWorks: {
        lead: 'Learn more about the engine:',
        label: 'Learning Engine',
    },
    // Cross-link to /exercises, under the engine's
    exercisesLink: {
        lead: 'See (and try) the exercises that practise each fact:', // PLACEHOLDER(EX45)
        label: 'Our Exercises',
    },
};

/*
 * One age: the simulated 3-year-old. (The age toggle went, 2026-10-06: ages
 * differ by a session or two.) `?age=2..5` still swaps the sim profile, for
 * checking.
 */
const route = useRoute();
const queryAge = Number(route.query.age);
const age = AGES.includes(queryAge) ? queryAge : DEFAULT_AGE;
const lessons = lessonsForAge(age);
/** A sub-lesson shares its parent's band (1 and 1a) */
const lessonGroups = groupLessons(lessons);

/** Lessons and timeline side by side from Vuetify's lg (1280px) up */
const { lgAndUp: split } = useDisplay();

/*
 * Wide layout: the timeline panel sticks beside the lessons, as tall as the
 * window, and the page's scroll scrubs it — as far through its own length as
 * the reader is through the lessons. One scroll moves both, and they finish
 * together. Not a scroll box of its own: nested scrolling fights the wheel.
 */
const splitEl = ref<HTMLElement | null>(null);
const dripEl = ref<HTMLElement | null>(null);
let syncRaf = 0;
function syncDrip() {
    syncRaf = 0;
    const box = splitEl.value;
    const panel = dripEl.value;
    if (!box || !panel) return;
    const stuckAt = parseFloat(getComputedStyle(panel).top) || 0;
    const travel = box.offsetHeight - panel.offsetHeight;
    const through = travel > 0 ? Math.min(1, Math.max(0, (stuckAt - box.getBoundingClientRect().top) / travel)) : 0;
    panel.scrollTop = through * (panel.scrollHeight - panel.clientHeight);
}
const queueSync = () => {
    if (!syncRaf) syncRaf = requestAnimationFrame(syncDrip);
};
onMounted(() => {
    window.addEventListener('scroll', queueSync, { passive: true });
    window.addEventListener('resize', queueSync, { passive: true });
    queueSync();
});
onBeforeUnmount(() => {
    window.removeEventListener('scroll', queueSync);
    window.removeEventListener('resize', queueSync);
    cancelAnimationFrame(syncRaf);
});
watch(split, () => nextTick(queueSync));

/** Smooth, and clear of the app bar (the sections' scroll-margin) */
function scrollToLesson(id: string) {
    document.getElementById(`lesson-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/*
 * PLACEHOLDER(P10) — both captions; see the handoff. Deliberately loose:
 * real practice is spiky (some weeks daily, some not at all, sometimes two
 * sessions back to back), so they describe an order, not a calendar.
 */
const captionLead = (() => {
    const [m0, m1] = profileFor(age).sessionMinutes;
    const minutes = m0 === m1 ? `${m0}-minute` : `${m0}- to ${m1}-minute`;
    return (
        // `A typical ${age}-year-old, as we simulate one: short (${minutes}) sessions, mostly right answers. ` +
        // `Real learners vary widely, in pace and in how often they practise, so read this as an order ` +
        // `more than a calendar.`
        ''
    );
})();
/** The wide layout's timeline */
const timelineCaption =
    `${captionLead} Each row is a session that brings something new; dashed stretches are practice ` +
    `alone. Every ten sessions, a rough count of the words they could sound out by then.`;
/** The narrow layout's strip */
const stripCaption =
    `${captionLead} Each column is a session that brings something new, numbered underneath; ` +
    `+N marks sessions of practice alone.`;
</script>

<style scoped>
.curriculum-page {
    --page-bg: #fffef7;
    min-height: 100vh;
    background: var(--page-bg);
}

.curriculum-hero {
    max-width: 720px;
    margin-bottom: 40px;
}
/* A touch more room between lines: tap-to-hear chips on adjacent lines
   would otherwise touch */
.curriculum-hero .prose {
    line-height: 1.9;
}

.prose {
    line-height: 1.7;
    margin-bottom: 12px;
}

.timeline-caption {
    max-width: 720px;
    font-size: 0.875rem;
    line-height: 1.6;
    color: rgba(33, 33, 33, 0.6);
}

/* Wide: lessons | timeline. The lesson bands run off to the left. */
.curriculum-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
    gap: 48px;
    align-items: start;
}
/*
 * The timeline panel: pinned under the app bar, the window's height, scrolled
 * by syncDrip (not by the reader: overflow hidden). Its foot fades, so the cut
 * reads as "more below"; the bottom padding lets the last mark clear the fade.
 */
.curriculum-split__drip {
    position: sticky;
    top: calc(var(--v-layout-top, 0px) + 16px);
    max-height: calc(100vh - var(--v-layout-top, 0px) - 32px);
    overflow: hidden;
    padding-bottom: 48px;
    mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent);
}

/* Narrow: the strip, then the lessons' bands */
.curriculum-strip {
    margin-bottom: 40px;
}

.curriculum-caveat {
    max-width: 720px;
    padding-top: 32px;
}
.curriculum-link-lead {
    margin: 24px 0 12px;
    color: rgba(33, 33, 33, 0.6);
}
</style>
