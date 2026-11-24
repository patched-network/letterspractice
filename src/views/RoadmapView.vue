<!--
  RoadmapView — /roadmap. Public "what's coming / what changed" page.

  There is no shared page-frame component: public pages render their own
  content and, where wanted, drop in <LandingFooter /> themselves (the landing
  page does the same). App.vue only supplies the header.

  Layout: two columns on desktop (Coming Soon | Recent Updates). Below the md
  breakpoint they stack with Coming Soon first, as a collapsible section.
  On desktop the toggle is hidden and the section is always open.

  Copy is data. Coming Soon: edit `comingSoon` below. Recent Updates: one
  markdown file per update in src/content/roadmap/updates/, named
  YYYY-MM-DD.md (see src/content/roadmap/updates.ts). Only the latest
  RECENT_COUNT show here; the header links to all of them at /changelog, and
  each date to the update's own page. Keep entries honest and non-committal;
  no dates on upcoming items unless we mean them.
-->
<template>
    <div class="roadmap-page">
        <v-container class="py-12">
            <v-row justify="center">
                <v-col cols="12" md="11" lg="10">
                    <h1 class="visually-hidden">Roadmap</h1>

                    <div class="roadmap-columns">
                        <section class="coming-soon">
                            <h2 class="text-h4 font-weight-bold col-head">
                                <button
                                    type="button"
                                    class="col-toggle"
                                    :aria-expanded="isOpen"
                                    aria-controls="coming-soon-body"
                                    :disabled="mdAndUp"
                                    @click="open = !open"
                                >
                                    <span>Coming Soon</span>
                                    <v-icon
                                        v-if="!mdAndUp"
                                        :icon="isOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                                        size="small"
                                    />
                                </button>
                            </h2>
                            <div v-show="isOpen" id="coming-soon-body">
                                <p class="prose">{{ comingSoon.intro }}</p>
                                <ul class="prose-list">
                                    <li v-for="item in comingSoon.lessons" :key="item">{{ item }}</li>
                                </ul>
                                <p class="prose">{{ comingSoon.graduation }}</p>
                                <p class="prose">{{ comingSoon.upcomingIntro }}</p>
                                <ul class="prose-list">
                                    <li v-for="item in comingSoon.upcoming" :key="item">{{ item }}</li>
                                </ul>
                                <p class="prose">{{ comingSoon.status }}</p>
                            </div>
                        </section>

                        <section class="recent-updates">
                            <div class="col-head col-head-row">
                                <h2 class="text-h4 font-weight-bold">Recent Updates</h2>
                                <router-link to="/changelog" class="all-updates">All updates →</router-link>
                            </div>
                            <UpdateArticle v-for="u in recentUpdates" :key="u.date" :update="u" :level="3" />
                        </section>
                    </div>
                </v-col>
            </v-row>
        </v-container>

        <LandingFooter />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useDisplay } from "vuetify";
import LandingFooter from "../components/landing/LandingFooter.vue";
import UpdateArticle from "../components/roadmap/UpdateArticle.vue";
import { roadmapUpdates } from "../content/roadmap/updates";

const comingSoon = {
    intro: "The major ongoing work right now for Letters Practice is in authoring the copy and 3D animations for our lesson sequence. Right now we have five lessons in active rotation, covering the following topics:",
    lessons: [
        "Letters make sounds.",
        "Letters work together in specific ways to make specific sounds (digraphs: sh, th, ng, etc).",
        "Vowels work with the letter e in a weird way to make an alternative sound (Tim–time, cop–cope, etc).",
        "Vowels also like to make that sound when they close out a word (go, so, hi, we, she, etc).",
        "Sometimes letters misbehave, and specific words are weird.",
    ],
    graduation:
        "The phonetic skills spanned by these lessons are enough to graduate someone into the status and identity of a beginning reader.",
    upcomingIntro: "Upcoming lessons will cover topics like:",
    upcoming: [
        "Vowel teams (more digraphs, including the diphthongs ow and oy).",
        "R-controlled and L-controlled vowels (car, for, and friends).",
        "Silent letter patterns (knife, write, comb).",
        "And others!",
    ],
    status:
        "Phonetic analytics and categorization work here is largely complete. What remains is weighing relative priorities for optimal sequencing, and crafting storyboards for the letters themselves, so they introduce each idea in a way that makes good sense relative to what learners already know.",
};

const { mdAndUp } = useDisplay();
// Collapsible only on small screens; desktop always shows it.
const open = ref(true);
const isOpen = computed(() => mdAndUp.value || open.value);

// About a month of weekly updates; the rest are on /changelog.
const RECENT_COUNT = 4;
const recentUpdates = roadmapUpdates.slice(0, RECENT_COUNT);
</script>

<style scoped>
.roadmap-page {
    min-height: 100vh;
    background: #fffef7;
}

.roadmap-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px 56px;
    align-items: start;
}
@media (max-width: 959px) {
    .roadmap-columns {
        grid-template-columns: 1fr;
        gap: 32px;
    }
}

.col-head {
    margin: 0 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.col-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font: inherit;
    color: inherit;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
}
button.col-toggle:not(:disabled) {
    cursor: pointer;
}
/* Recent Updates' header: the heading and the link to /changelog on one rule. */
.col-head-row {
    display: flex;
    flex-wrap: wrap; /* a narrow phone puts the link under the heading */
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
}
.col-head-row h2 {
    margin: 0;
}
.all-updates {
    flex-shrink: 0;
    font-size: 0.875rem;
    color: rgba(33, 33, 33, 0.6);
    text-decoration: none;
}
.all-updates:hover {
    color: rgba(33, 33, 33, 0.85);
    text-decoration: underline;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.prose {
    line-height: 1.7;
    margin-bottom: 12px;
}
.prose-list {
    padding-left: 1.25rem;
    line-height: 1.7;
}

</style>
