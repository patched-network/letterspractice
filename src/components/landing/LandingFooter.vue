<template>
    <footer class="landing-footer">
        <section class="footer-main">
            <v-container class="py-12">
                <div class="footer-grid">
                    <!-- col 1: brand, tagline, contact, social -->
                    <div class="footer-col footer-brand">
                        <div class="footer-wordmark">
                            <WordDisplay
                                text="Letters Practice"
                                :height="24"
                                :options="logoWordOptions"
                                :transform-fn="brandWordmarkTransform"
                            />
                        </div>
                        <p class="footer-tagline text-medium-emphasis">{{ copy.tagline }}</p>

                        <!-- Contact and social: the deployment's (deployment/pitch.ts). -->
                        <div v-if="contactEmail" class="footer-contact">
                            <a :href="`mailto:${contactEmail}`" class="footer-contact-email">
                                {{ contactEmail }}
                            </a>
                        </div>

                        <div v-if="social.length" class="footer-social">
                            <a
                                v-for="s in social"
                                :key="s.network"
                                :href="s.url"
                                target="_blank"
                                rel="noopener"
                                class="footer-social-link"
                                :aria-label="s.label"
                                :title="`${s.label} — ${s.handle}`"
                            >
                                <svg
                                    :width="SOCIAL_ICONS[s.network].size"
                                    :height="SOCIAL_ICONS[s.network].size"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
                                    <path :d="SOCIAL_ICONS[s.network].path" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    <!-- col 2: nav links (real destinations only) -->
                    <nav class="footer-col footer-nav" aria-label="Footer">
                        <p class="footer-col-head">Explore</p>
                        <ul class="footer-nav-list" :style="{ '--link-rows': linkRows }">
                            <li v-for="link in links" :key="link.text">
                                <router-link v-if="link.to" :to="link.to" class="footer-link">
                                    {{ link.text }}
                                </router-link>
                                <a
                                    v-else
                                    :href="link.href"
                                    :target="link.external ? '_blank' : undefined"
                                    :rel="link.external ? 'noopener' : undefined"
                                    class="footer-link"
                                >
                                    {{ link.text }}<span v-if="link.external" aria-hidden="true"> ↗</span>
                                </a>
                            </li>
                        </ul>
                    </nav>

                    <!-- col 3: email list signup (primary capture; body CTAs lead to /peek) -->
                    <div class="footer-col footer-signup-col">
                        <EmailSignupForm
                            compact
                            :heading="copy.emailSignup.heading"
                            :description="copy.emailSignup.description"
                            submit-text="Subscribe"
                            success-text="You're on the list — thank you!"
                            already-subscribed-text="You're already on the list!"
                        />
                    </div>
                </div>

                <!-- legal bar -->
                <div class="footer-legal">
                    <p class="text-medium-emphasis">© {{ year }} LettersPractice</p>
                    <p class="text-medium-emphasis">{{ copy.legalLine }}</p>
                </div>
            </v-container>
        </section>
    </footer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EmailSignupForm from "./EmailSignupForm.vue";
import { landingPageCopy, type FooterLink, type SocialLink } from "../../content/landingPageCopy";
import { deploymentPages, pitch } from "../../deployment";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { brandWordmarkOptions, brandWordmarkTransform } from "../brandWordmark";

const copy = landingPageCopy.footer;
const year = computed(() => new Date().getFullYear());
// The app's links, then the deployment's pages that ask for one (e.g. legal).
const links: FooterLink[] = [
    ...copy.links,
    ...deploymentPages.flatMap((p) => (p.footer ? [{ text: p.footer, to: p.path }] : [])),
];
// Wide layout runs the links down two columns (see .footer-nav-list).
const linkRows = Math.ceil(links.length / 2);

// One icon per network. Typed by SocialLink["network"], so a network added to
// the copy without an icon here is a type error, not a wrong icon.
const contactEmail = pitch?.contactEmail ?? "";
const social = pitch?.social ?? [];

const SOCIAL_ICONS: Record<SocialLink["network"], { size: number; path: string }> = {
    bluesky: {
        size: 19,
        path: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.81 9.498 7.823 4.308 4.556-5.073 1.082-6.498-2.83-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364C23.622 9.418 24 4.458 24 3.768c0-.689-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.686 12 10.8z",
    },
    twitter: {
        size: 20,
        path: "M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z",
    },
};

// Same wordmark as CourseHeader (shared via brandWordmark.ts).
const logoWordOptions = brandWordmarkOptions();
</script>

<style scoped>
.landing-footer {
    width: 100%;
}

/* Single section on the page's warm cream background */
.footer-main {
    background: #fffef7;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
}

/* 3 columns on desktop: brand | nav | signup. Nav takes its content width
   (two link columns, below); brand and signup share the rest, signup widest —
   it's the primary capture now that body CTAs point at /peek. */
.footer-grid {
    display: grid;
    grid-template-columns: 1.2fr auto 1.4fr;
    gap: 40px 48px;
    align-items: start;
}

@media (max-width: 960px) {
    .footer-grid {
        grid-template-columns: 1fr;
        gap: 36px;
    }
    /* stack order: brand → signup → nav (don't bury the capture under the list) */
    .footer-brand {
        order: 0;
    }
    .footer-signup-col {
        order: 1;
    }
    .footer-nav {
        order: 2;
    }
}

/* small uppercase column label (nav) */
.footer-col-head {
    margin: 0 0 14px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(33, 33, 33, 0.45);
}

.footer-wordmark {
    display: flex;
    align-items: center;
    line-height: 1;
    overflow: visible;
    /* WordDisplay's .word-visual carries an internal 20px pad (breathing room
       for the jiggle). We trim that pad to 10px below, then pull the box up/left
       by 10px so the first glyph lines up with the tagline + icons underneath. */
    margin: -10px 0 -6px -10px;
}
.footer-wordmark :deep(.word-display),
.footer-wordmark :deep(.word-visual) {
    overflow: visible !important;
}
.footer-wordmark :deep(.word-visual) {
    padding: 10px;
}

.footer-tagline {
    margin: 12px 0 0;
    font-size: 0.9375rem;
    line-height: 1.55;
    max-width: 340px;
}

.footer-contact {
    margin-top: 20px;
    font-size: 1rem;
}

.footer-contact-email {
    font-weight: 500;
    color: #e65100; /* primary-darken-1 */
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: border-color 200ms ease;
}
.footer-contact-email:hover {
    border-bottom-color: #f57c00;
}

.footer-social {
    margin-top: 18px;
    display: flex;
    gap: 6px;
}
.footer-social-link {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: rgba(33, 33, 33, 0.7);
    transition: all 200ms ease;
}
.footer-social-link:hover {
    background: rgba(245, 124, 0, 0.1);
    color: #e65100;
}

.footer-nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 11px;
}
/* Wide: links run down two columns (reading order: down, then across), so the
   list stops setting the footer's height. Stacked layout keeps one column. */
@media (min-width: 961px) {
    .footer-nav-list {
        grid-template-rows: repeat(var(--link-rows), auto);
        grid-auto-flow: column;
        column-gap: 32px;
    }
}
.footer-link {
    font-size: 0.9375rem;
    color: rgba(33, 33, 33, 0.7);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    padding-bottom: 1px;
    transition: all 200ms ease;
    white-space: nowrap;
}
.footer-link:hover {
    color: #e65100;
    border-bottom-color: #f57c00;
}

.footer-legal {
    margin-top: 36px;
    padding-top: 22px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    justify-content: space-between;
    align-items: center;
}
.footer-legal p {
    margin: 0;
    font-size: 0.8125rem;
}
</style>
