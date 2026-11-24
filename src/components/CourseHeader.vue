<template>
    <div>
        <v-app-bar elevation="0" color="background">
            <v-toolbar-title class="d-flex align-center logo-title">
                <!-- Links home on `copy` routes only (router meta). Always the
                     same <a> (href toggled), so the wordmark never remounts
                     and re-jiggles on copy↔app navigation. Without an href
                     it's inert: not focusable, not announced as a link. -->
                <a
                    class="logo-link"
                    :href="linkHome ? homeHref : undefined"
                    :aria-label="linkHome ? 'Letters Practice home' : undefined"
                    @click="linkHome && goHome($event)"
                >
                    <img
                        v-if="logo"
                        :src="logo"
                        alt="Course Logo"
                        height="32"
                        class="mr-2"
                    />
                    <div class="logo-word">
                        <WordDisplay
                            ref="logoWord"
                            :text="narrow ? 'L  P' : 'Letters Practice'"
                            :height="narrow ? 24 : isMobile ? 20 : 24"
                            :options="logoWordOptions"
                            :transform-fn="brandWordmarkTransform"
                        />
                    </div>
                </a>
            </v-toolbar-title>

            <v-spacer></v-spacer>

            <!-- Top-level Study wayfinding (logged-in only).
                 Calm nav link, not an engagement CTA — see anti-binge ethos.
                 Hidden while studying (/study*) and on the post-session /progress
                 arrival — you're already studying / just finished; don't nag.
                 Non-logged-in treatment TBD. -->
            <v-btn
                v-if="showStudyButton"
                to="/study"
                color="primary"
                variant="flat"
                class="mr-2 text-none"
            >
                Study Now
            </v-btn>

            <!-- Logged-out wayfinding to /curriculum. Quiet text link, not a
                 CTA; marketing pages only (see CURRICULUM_LINK_ROUTES), and
                 hidden in the narrow band where the row is already full. -->
            <v-btn
                v-if="showCurriculumLink"
                to="/curriculum"
                variant="text"
                class="mr-1 text-none"
            >
                Our Curriculum
            </v-btn>

            <!-- Logged-out landing CTA — pops in once the visitor has scrolled
                 through the walkthrough (gentle overshoot, matches the app's
                 speech-balloon easing). Mirrors the hero's primary action. -->
            <transition name="cta-pop">
                <v-btn
                    v-if="showLandingCta"
                    to="/peek"
                    :size="narrow ? 'small' : undefined"
                    color="primary"
                    variant="flat"
                    class="mr-2 text-none"
                >
                    {{ landingCtaLabel }}
                </v-btn>
            </transition>

            <AuthStatus />
        </v-app-bar>
    </div>
</template>

<style scoped>
.logo-title {
    overflow: visible !important;
    flex: 1 0 auto !important; /* Don't allow the title to shrink below its content */
    min-width: 0;
}

.logo-link {
    display: flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
    border-radius: 8px;
}
.logo-link:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -6px;
}

.logo-word {
    /* Ensure word display fits in navbar */
    line-height: 1;
    overflow: visible;
    display: flex;
    align-items: center;
}

/* Deep selector to ensure the WordDisplay internal containers don't clip */
.logo-word :deep(.word-display),
.logo-word :deep(.word-visual) {
    overflow: visible !important;
    padding: 20px;
}

/* Compact band (matches the `narrow` breakpoint): reclaim the ~32px of
   horizontal padding so the "L P" lettermark and the action buttons (up to
   Try a sample lesson / Log In / Sign Up) share the row without overflow. */
@media (max-width: 800px) {
    .logo-word :deep(.word-display),
    .logo-word :deep(.word-visual) {
        padding: 20px 4px;
    }
}

/* Landing CTA pop-in: gentle drop + overshoot settle (same easing as the
   walkthrough's speech balloons, so the motion vocabulary is consistent). */
.cta-pop-enter-active {
    transition:
        opacity 0.5s ease,
        transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cta-pop-leave-active {
    transition: opacity 0.3s ease;
}
.cta-pop-enter-from {
    opacity: 0;
    transform: translateY(-8px) scale(0.85);
}
.cta-pop-leave-to {
    opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
    .cta-pop-enter-active {
        transition: opacity 0.25s ease;
    }
    .cta-pop-enter-from {
        transform: none;
    }
}
</style>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useLink, useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import { useAuthStore } from "@vue-skuilder/common-ui";
import { useSessionArrival } from "../composables/useSessionArrival";
import { useLandingCta, resetLandingCta } from "../composables/useLandingCta";
import { landingPageCopy } from "../content/landingPageCopy";
import AuthStatus from "./AuthStatus.vue";
import WordDisplay from "../letterpeople/vue/WordDisplay.vue";
import type { WordDisplayRef } from "@/letterpeople/vue";
import { brandWordmarkOptions, brandWordmarkTransform } from "./brandWordmark";

defineProps<{
    logo?: string;
}>();

const authStore = useAuthStore();
const route = useRoute();
const { arrivedFromSession, clearSessionArrival } = useSessionArrival();
const { revealed: landingCtaRevealed } = useLandingCta();

// Wordmark → landing page, on reading pages only (see RouteMeta.copy).
const { href: homeHref, navigate: goHome } = useLink({ to: "/" });
const linkHome = computed(() => route.meta.copy === true);

// The post-session arrival flag is a one-shot: clear it the moment we leave
// /progress, so a later cold visit shows the CTA again.
watch(
    () => route.path,
    (path) => {
        if (path !== "/progress") clearSessionArrival();
        // Leaving the landing route re-arms the scroll-reveal CTA so a later
        // cold visit earns it again (the walkthrough flips it back on).
        if (path !== "/") resetLandingCta();
    },
);

// Logged-out landing CTA: appears only after the visitor has scrolled through
// the walkthrough (see useLandingCta / SessionWalkthroughSection). Mirrors the
// hero's primary action — a zero-commitment sample lesson (/peek). Logged-in
// users get the always-on "Study Now" wayfinding above instead.
const showLandingCta = computed(() => {
    if (authStore.isLoggedIn) return false;
    if (route.path !== "/") return false;
    return landingCtaRevealed.value;
});
const landingCtaLabel = landingPageCopy.hero.cta.primary;

// Marketing surfaces only — not mid-study (/peek, /study*), /progress, account
// or auth flows, where it's a distraction rather than wayfinding — and not
// /curriculum itself. By route name so aliases (/showHN, /subscribe, /pedagogy)
// come along.
const CURRICULUM_LINK_ROUTES = new Set([
    "home",
    "learning-engine",
    "exercises",
    "privacy",
    "terms",
    "showHN",
    "newsletter",
    "gift",
]);

const showCurriculumLink = computed(() => {
    if (authStore.isLoggedIn) return false;
    if (narrow.value) return false;
    return CURRICULUM_LINK_ROUTES.has(route.name as string);
});

const showStudyButton = computed(() => {
    if (!authStore.isLoggedIn) return false;
    // Already studying — the CTA is redundant on every /study* route.
    if (route.path === "/study" || route.path.startsWith("/study/")) return false;
    // Just finished a session and landed on /progress — don't nag to study more.
    if (route.path === "/progress" && arrivedFromSession.value) return false;
    return true;
});

const { mobile, width } = useDisplay();
const isMobile = computed(() => mobile.value);
// Below this width the full "Letters Practice" wordmark can't share the row with
// the action buttons — and `.logo-title` is `flex: 1 0 auto` (won't shrink), so
// the overflow pushes the buttons off-screen rather than clipping the logo.
// Collapse to the "L P" lettermark (+ trimmed padding, see <style>) so they fit.
// 800, not 600: the logged-out landing header now carries up to three buttons
// (Try a sample lesson · Log In · Sign Up), which needs the wider collapse band.
const narrow = computed(() => width.value < 800);
const logoWord = ref<WordDisplayRef>();

const logoWordOptions = computed(() => brandWordmarkOptions(isMobile.value ? 0 : 2));

const waveTimer = setTimeout(
    () => {
        // The 'P' waves hello. getLetterInstance indexes letters only (spaces
        // skipped), so the P is index 7 in "Letters Practice" but index 1 in the
        // narrow 'L  P' lettermark. Guard throughout so a missing letter/arm
        // (e.g. mid-text-swap) never throws from the timer.
        const word = logoWord.value;
        const pIndex = narrow.value ? 1 : 7;
        const left = word?.getLetterInstance(pIndex)?.arms?.left;
        if (!left) return;
        left.show();
        left.wave();
    },
    1000 + Math.random() * 4000,
);
// The header unmounts on `bare` routes; don't leave the timer behind.
onBeforeUnmount(() => clearTimeout(waveTimer));
</script>
