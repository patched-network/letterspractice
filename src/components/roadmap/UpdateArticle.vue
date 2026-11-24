<!--
  UpdateArticle — one roadmap update in a list: its date (linking to the
  update's own page, /changelog/YYYY-MM-DD), its title (the file's first line)
  as a heading, then the rendered body. Used by /roadmap's Recent Updates (under
  an h2, so level 3) and the /changelog index (under the page's h1, so level 2);
  the single-update page (ChangelogEntryView) has its own layout, with the
  title as its h1.
-->
<template>
    <article class="update">
        <router-link :to="updatePath(update)" class="update-date">
            <time :datetime="update.date">{{ formatUpdateDate(update.date) }}</time>
        </router-link>
        <!-- The title links to the update's page too, unless it holds a link of its own (no nested <a>). -->
        <component :is="`h${level}`" class="update-title">
            <router-link v-if="!titleHasLink" :to="updatePath(update)" class="update-title-link">
                <span v-html="update.titleHtml" />
            </router-link>
            <span v-else v-html="update.titleHtml" @click="onLinkClick" />
        </component>
        <div v-if="update.html.trim()" class="update-body" v-html="update.html" @click="onLinkClick" />
    </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useInAppLinks } from "../../composables/useInAppLinks";
import { formatUpdateDate, updatePath, type RoadmapUpdate } from "../../content/roadmap/updates";

const props = withDefaults(defineProps<{ update: RoadmapUpdate; level?: 2 | 3 }>(), { level: 2 });

const titleHasLink = computed(() => /<a[\s>]/i.test(props.update.titleHtml));

// Rendered markdown: in-app links go through the router.
const onLinkClick = useInAppLinks();
</script>

<style scoped>
.update {
    margin-bottom: 22px;
}
.update-date {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(33, 33, 33, 0.45);
    text-decoration: none;
}
.update-date:hover {
    color: rgba(33, 33, 33, 0.7);
    text-decoration: underline;
}
.update-title {
    margin: 2px 0 0;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.35;
}
.update-title-link {
    color: inherit;
    text-decoration: none;
}
.update-title-link:hover {
    text-decoration: underline;
}
/* Rendered markdown: scoped styles need :deep() to reach v-html content. */
.update-body {
    margin-top: 6px;
    line-height: 1.6;
}
.update-body :deep(p) {
    margin: 0 0 8px;
}
.update-body :deep(ul),
.update-body :deep(ol) {
    padding-left: 1.25rem;
    margin: 0 0 8px;
}
.update-body :deep(li + li) {
    margin-top: 6px;
}
.update-body > :deep(:last-child) {
    margin-bottom: 0;
}
</style>
