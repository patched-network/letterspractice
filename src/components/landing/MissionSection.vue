<template>
    <section class="mission-section">
        <v-container class="py-16">
            <v-row align="center" justify="center">
                <!-- Left: the author-family portrait -->
                <v-col cols="12" md="6" lg="5" class="portrait-col">
                    <FamilyPortrait />
                </v-col>

                <!-- Right: the whole mission narrative -->
                <v-col cols="12" md="6" lg="6" class="mission-text-col">
                    <div class="lp-eyebrow">{{ copy.eyebrow }}</div>
                    <h2 class="lp-section-title mb-6" v-html="renderInline(copy.sectionTitle)"></h2>

                    <div v-if="copy.intro.length" class="mission-body mb-8">
                        <p
                            v-for="(paragraph, i) in copy.intro"
                            :key="i"
                            class="text-body-1 mb-4"
                            v-html="renderInline(paragraph)"
                        ></p>
                    </div>

                    <!-- Origin Story -->
                    <v-card variant="outlined" class="origin-card">
                        <v-card-text class="pa-6">
                            <h3 class="text-h5 font-weight-bold mb-4">
                                {{ copy.originStory.title }}
                            </h3>
                            <div class="origin-content">
                                <p
                                    v-for="(paragraph, i) in copy.originStory.paragraphs"
                                    :key="i"
                                    class="text-body-1 mb-4"
                                >
                                    {{ paragraph }}
                                </p>
                            </div>

                            <!-- Trust Markers (stacked) -->
                            <div class="trust-markers mt-2">
                                <div
                                    v-for="(marker, i) in copy.originStory.trustMarkers"
                                    :key="i"
                                    class="trust-marker"
                                >
                                    <div class="trust-icon">
                                    <v-icon size="24">{{ iconFor(marker.label) }}</v-icon>
                                </div>
                                    <div class="trust-text">
                                        <div class="trust-label">
                                            {{ marker.label }}
                                        </div>
                                        <div class="trust-detail">
                                            <template v-if="marker.link">
                                                {{ marker.detail.split(marker.link.text)[0] }}
                                                <a
                                                    :href="marker.link.url"
                                                    target="_blank"
                                                    rel="noopener"
                                                    class="foundation-link"
                                                >{{ marker.link.text }}</a>
                                                {{ marker.detail.split(marker.link.text)[1] }}
                                            </template>
                                            <template v-else>
                                                {{ marker.detail }}
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>
        </v-container>
    </section>
</template>

<script setup lang="ts">
import FamilyPortrait from "./FamilyPortrait.vue";
import { landingPageCopy } from "../../content/landingPageCopy";
import { renderInline } from "./inlineMarkup";

const copy = landingPageCopy.mission;

// Presentation-only: map commitment labels onto mdi line icons (replacing the
// emoji in copy), so the trust markers match the technique grid's register.
const TRUST_ICONS: Record<string, string> = {
    "Straightforward Business Model": "mdi-handshake-outline",
    "No Data Brokering": "mdi-lock-outline",
    "Open Foundations": "mdi-sprout-outline",
};
const iconFor = (label: string) => TRUST_ICONS[label] ?? "mdi-check-circle-outline";
</script>

<style scoped>
.mission-section {
    background: linear-gradient(135deg, #f8fef7 0%, #f0f9f0 100%);
    border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.portrait-col {
    display: flex;
    justify-content: center;
}

/* shared section-header grammar (mirrors SessionWalkthrough / HowItWorks) */
.lp-eyebrow {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.166em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
    margin-bottom: 14px;
}
.lp-section-title {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
}
@media (max-width: 720px) {
    .lp-section-title {
        font-size: 2rem;
    }
}

.origin-card {
    border-width: 2px;
    border-color: rgba(var(--v-theme-primary), 0.3) !important;
    background: linear-gradient(
        135deg,
        rgba(var(--v-theme-primary), 0.02) 0%,
        rgba(255, 255, 255, 1) 100%
    );
}

.trust-markers {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.trust-marker {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
}

.trust-icon {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
}

.trust-label {
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 0.15rem;
    color: rgb(var(--v-theme-on-surface));
}

.trust-detail {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    line-height: 1.4;
}

.foundation-link {
    color: rgb(var(--v-theme-primary));
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px solid rgba(var(--v-theme-primary), 0.3);
    transition: border-color 0.2s ease;
}

.foundation-link:hover {
    border-bottom-color: rgb(var(--v-theme-primary));
}

/* On small screens the portrait stacks above the text */
@media (max-width: 960px) {
    .portrait-col {
        margin-bottom: 2rem;
    }
}
</style>
