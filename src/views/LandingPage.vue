<template>
    <div ref="root" class="landing-page">
        <!-- Hero Section with animated "Hi" -->
        <HeroGreeting data-track-seen="hero" />

        <!--
            Everything after the hero is below the fold on a phone, and loads
            and mounts only as it approaches the viewport (DeferredSection).
            placeholder-height: each section's usual height on a phone, held
            until it arrives so the page doesn't change length under the reader.
        -->

        <!-- Real-footage demo: just the frame, straddling the hero → under-
             the-hood seam. Credibility ("is this real?") before explanation.
             placeholder-height: a 16:9 frame at phone width plus 32px of
             padding; re-measure. -->
        <DeferredSection
            v-if="MEDIA_BASE"
            data-track-seen="video"
            :load="loadVideo"
            placeholder-height="240px"
        />

        <!-- What we do here: Exercises + Curriculum + Learning Engine, three
             link-out cards. Moved up under the hero 2026-11-12 (was after
             the walkthrough). placeholder-height: an estimate for three
             stacked cards on a phone (two measured 1694px); re-measure. -->
        <DeferredSection
            data-track-seen="under-the-hood"
            :load="loadUnderTheHood"
            placeholder-height="2200px"
        />

        <!-- Session walkthrough: what two minutes actually looks like -->
        <DeferredSection
            data-track-seen="walkthrough"
            :load="loadWalkthrough"
            placeholder-height="2766px"
        />

        <!-- Mission Statement & Origin Story -->
        <DeferredSection
            data-track-seen="mission"
            :load="loadMission"
            placeholder-height="1554px"
        />

        <!-- Footer: email signup + brand / contact / nav -->
        <DeferredSection
            data-track-seen="footer"
            :load="loadFooter"
            placeholder-height="876px"
        />
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import HeroGreeting from "../components/landing/HeroGreeting.vue";
import DeferredSection from "../components/landing/DeferredSection.vue";
import { MEDIA_BASE } from "../config/site";
import { useLandingTracking } from "../composables/useLandingTracking";
import { ensureCourseware } from "../services/courseware";
import { ensureDeferredVuetify } from "../services/vuetifyDeferred";

// Section visibility, CTA/link clicks and signup submits → GoatCounter events.
// Names and semantics: services/landingEvents.ts.
const root = ref<HTMLElement | null>(null);
useLandingTracking(root);

// What every other page needs and this one doesn't (the course machinery,
// services/courseware.ts; the rest of Vuetify, services/vuetifyDeferred.ts)
// isn't loaded for it. Start both on the visitor's first interaction, so a tap
// on Start doesn't wait for them, and a visitor who only looks never
// downloads them.
const INTENT = ["pointerdown", "touchstart", "keydown", "scroll"] as const;
function prefetchCourseware(): void {
    for (const e of INTENT) window.removeEventListener(e, prefetchCourseware);
    ensureCourseware().catch(() => {}); // the router retries on navigation
    ensureDeferredVuetify().catch(() => {});
}
onMounted(() => {
    for (const e of INTENT) window.addEventListener(e, prefetchCourseware, { passive: true });
});
onBeforeUnmount(() => {
    for (const e of INTENT) window.removeEventListener(e, prefetchCourseware);
});

// Each below-the-fold section is its own chunk (see DeferredSection). The demo
// video needs a media host (VITE_MEDIA_BASE); without one there's no section.
const loadVideo = () => import("../components/landing/SessionVideoSection.vue");
const loadWalkthrough = () => import("../components/landing/SessionWalkthroughSection.vue");
const loadUnderTheHood = () => import("../components/landing/UnderTheHoodSection.vue");
const loadMission = () => import("../components/landing/MissionSection.vue");
const loadFooter = () => import("../components/landing/LandingFooter.vue");
</script>

<style scoped>
.landing-page {
    min-height: 100vh;
    /* Contain horizontal bleed (the Hero's animated "Hello!" / decorative pieces
       can extend past the column on narrow screens). Without this the document
       becomes wider than the viewport, so descendants that center themselves —
       e.g. the walkthrough's sticky phone — center within the too-wide document
       and land off-center in the actual viewport.
       Use `clip`, not `hidden`: `hidden` would create a scroll container and break
       the walkthrough's `position: sticky`; `clip` clips without a scrollport. */
    overflow-x: clip;
}
</style>
