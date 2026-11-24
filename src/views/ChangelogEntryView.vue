<!--
  ChangelogEntryView — /changelog/:date. One /roadmap update on its own page:
  the permalink each date in Recent Updates links to. Updates are markdown
  files in src/content/roadmap/updates/ (see content/roadmap/updates.ts).

  The title (the file's first line) is the heading, with the date under it;
  older/newer links walk the updates, and the back
  link goes to all of them (/changelog).
-->
<template>
    <div class="changelog-page">
        <v-container class="py-12">
            <v-row justify="center">
                <v-col cols="12" md="9" lg="7">
                    <router-link to="/changelog" class="back-link">← Changelog</router-link>

                    <article v-if="update" class="entry">
                        <h1 class="text-h4 font-weight-bold entry-title" v-html="update.titleHtml" @click="onLinkClick" />
                        <time class="entry-date" :datetime="update.date">{{ formatUpdateDate(update.date) }}</time>
                        <div v-if="update.html.trim()" class="entry-body" v-html="update.html" @click="onLinkClick" />
                    </article>

                    <div v-else class="entry">
                        <h1 class="text-h4 font-weight-bold entry-title">No update here</h1>
                        <p class="prose">
                            There's no update at this address. The
                            <router-link to="/changelog">changelog</router-link> lists them all.
                        </p>
                    </div>

                    <nav v-if="older || newer" class="entry-nav" aria-label="More updates">
                        <router-link v-if="older" :to="updatePath(older)">
                            ← {{ formatUpdateDate(older.date) }}
                        </router-link>
                        <router-link v-if="newer" :to="updatePath(newer)" class="nav-newer">
                            {{ formatUpdateDate(newer.date) }} →
                        </router-link>
                    </nav>
                </v-col>
            </v-row>
        </v-container>

        <LandingFooter />
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import LandingFooter from "../components/landing/LandingFooter.vue";
import { useInAppLinks } from "../composables/useInAppLinks";
import { formatUpdateDate, roadmapUpdates, updatePath } from "../content/roadmap/updates";

const props = defineProps<{ date: string }>();

const onLinkClick = useInAppLinks();

// roadmapUpdates is newest first: the one before is newer, the one after older.
const index = computed(() => roadmapUpdates.findIndex((u) => u.date === props.date));
const update = computed(() => (index.value >= 0 ? roadmapUpdates[index.value] : null));
const newer = computed(() => (index.value > 0 ? roadmapUpdates[index.value - 1] : null));
const older = computed(() => (index.value >= 0 ? (roadmapUpdates[index.value + 1] ?? null) : null));
</script>

<style scoped>
.changelog-page {
    min-height: 100vh;
    background: #fffef7;
}

.back-link {
    display: inline-block;
    margin-bottom: 28px;
    font-size: 0.875rem;
    color: rgba(33, 33, 33, 0.6);
    text-decoration: none;
}
.back-link:hover {
    text-decoration: underline;
}

.entry-title {
    margin: 0 0 6px;
}
.entry-date {
    display: block;
    margin-bottom: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(33, 33, 33, 0.45);
}

/* Rendered markdown: scoped styles need :deep() to reach v-html content. */
.prose,
.entry-body :deep(p) {
    line-height: 1.7;
    margin: 0 0 12px;
}
.entry-body :deep(ul),
.entry-body :deep(ol) {
    padding-left: 1.25rem;
    line-height: 1.7;
    margin: 0 0 12px;
}
.entry-body :deep(li + li) {
    margin-top: 6px;
}

.entry-nav {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 0.875rem;
}
.entry-nav a {
    color: rgba(33, 33, 33, 0.7);
    text-decoration: none;
}
.entry-nav a:hover {
    text-decoration: underline;
}
/* Keep "newer" on the right when there's no "older" */
.nav-newer {
    margin-left: auto;
}
</style>
