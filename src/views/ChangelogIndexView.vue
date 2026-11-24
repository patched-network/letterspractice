<!--
  ChangelogIndexView — /changelog. Every roadmap update, newest first; each
  date links to that update's own page (ChangelogEntryView). /roadmap shows
  only the latest few and links here. Updates are markdown files in
  src/content/roadmap/updates/ (see content/roadmap/updates.ts).
-->
<template>
    <div class="changelog-page">
        <v-container class="py-12">
            <v-row justify="center">
                <v-col cols="12" md="9" lg="7">
                    <router-link to="/roadmap" class="back-link">← Roadmap</router-link>
                    <h1 class="text-h4 font-weight-bold page-title">Changelog</h1>
                    <UpdateArticle v-for="u in roadmapUpdates" :key="u.date" :update="u" />
                </v-col>
            </v-row>
        </v-container>

        <LandingFooter />
    </div>
</template>

<script setup lang="ts">
import LandingFooter from "../components/landing/LandingFooter.vue";
import UpdateArticle from "../components/roadmap/UpdateArticle.vue";
import { roadmapUpdates } from "../content/roadmap/updates";
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

.page-title {
    margin: 0 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
</style>
