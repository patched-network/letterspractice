<!--
    A landing-page section that loads and mounts only as it approaches the
    viewport.

    Why: on a phone, everything after the hero is below the fold, and mounting
    all of it up front (live exercises, LetterPeople, the family portrait, the
    footer) sat in the same long task as the hero's first paint.
    Deferred, the first paint is the hero alone, and a
    visitor who never scrolls never pays for the rest. The section's code is a
    separate chunk (`load`), fetched at the same moment.

    Until it mounts, the wrapper holds `placeholderHeight` of space, so the
    page's length and the sections after it don't jump when it arrives. It
    arrives `AHEAD` of the viewport, so a reader scrolling normally never sees
    the placeholder.

    The prerender (scripts/prerender-public.ts) sets window.__LP_PRERENDER__ so
    that every section renders at once: the static copy crawlers read must hold
    the whole page. It waits for no `[data-deferred-pending]` to remain before
    taking that copy.

    Attributes (data-track-seen, for useLandingTracking) land on the wrapper,
    which is always present.
-->
<template>
    <div
        ref="el"
        :data-deferred-pending="component ? undefined : ''"
        :style="component ? undefined : { minHeight: placeholderHeight }"
    >
        <component :is="component" v-if="component" />
    </div>
</template>

<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref, shallowRef, type Component } from "vue";
import { isStaleChunkError, recoverFromStaleBuild } from "../../services/pwa";

const props = withDefaults(
    defineProps<{
        /** The section, as a dynamic import: () => import("./Section.vue") */
        load: () => Promise<{ default: Component }>;
        /** Space held until the section mounts; its usual height on a phone. */
        placeholderHeight?: string;
    }>(),
    { placeholderHeight: "100vh" },
);

/** How far below (or above) the viewport a section starts loading. */
const AHEAD = "400px 0px";

const el = ref<HTMLElement | null>(null);
const component = shallowRef<Component | null>(null);
let observer: IntersectionObserver | null = null;
let started = false;

function start(): void {
    if (started) return;
    started = true;
    observer?.disconnect();
    observer = null;
    props
        .load()
        .then((m) => (component.value = markRaw(m.default)))
        .catch((err) => {
            // Almost always a deploy that removed this tab's build: reload on
            // the new one, as the router does for a route's chunk.
            if (isStaleChunkError(err) && recoverFromStaleBuild(location.pathname + location.search)) {
                console.warn("[DeferredSection] chunk load failed (stale build?), reloading", err);
                return;
            }
            console.error("[DeferredSection] failed to load section", err);
        });
}

const isPrerender = typeof window !== "undefined" && (window as unknown as { __LP_PRERENDER__?: boolean }).__LP_PRERENDER__ === true;
if (isPrerender) start();

onMounted(() => {
    if (started) return;
    if (!el.value || typeof IntersectionObserver === "undefined") {
        start();
        return;
    }
    observer = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) start();
        },
        { rootMargin: AHEAD },
    );
    observer.observe(el.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>
