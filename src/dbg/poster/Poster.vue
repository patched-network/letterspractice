<template>
    <div class="poster-page" :class="{ 'is-print': true }">
        <!-- 8.5x11 print sheet -->
        <article class="poster-sheet">
            <!-- ============ HERO BAND ============ -->
            <header class="poster-hero">
                <div class="hero-greeting" ref="heroContainer">
                    <WordDisplay
                        text="Hello!"
                        :height="180"
                        :max-width="640"
                        :options="wordOptions"
                        @word-created="onWordCreated"
                    />
                </div>
                <div v-if="config.regionBadge" class="region-badge">
                    {{ config.regionBadge }}
                </div>
            </header>

            <!-- ============ BODY BAND ============ -->
            <section class="poster-body">
                <h1 class="poster-headline">{{ config.headline }}</h1>
                <p class="poster-subhead">{{ config.subhead }}</p>
                <p class="poster-paragraph">{{ config.body }}</p>

                <ul class="poster-bullets">
                    <li v-for="(b, i) in config.bullets" :key="i">
                        <span class="bullet-dot" :style="{ background: bulletColor(i) }"></span>
                        {{ b }}
                    </li>
                </ul>

                <div class="poster-cta">
                    <div class="cta-text">
                        <div class="cta-line">{{ config.cta }}</div>
                        <div class="cta-url">{{ shortUrl }}</div>
                        <div class="cta-hint">Scan, or visit on any device.</div>
                    </div>
                    <div class="cta-qr" v-html="mainQrSvg"></div>
                </div>
            </section>

            <!-- ============ TEAR-OFF STRIP ============ -->
            <footer v-if="config.tearStripEnabled" class="tear-strip">
                <div class="tear-cue" aria-hidden="true">
                    <span>✂</span>
                    <span class="tear-cue-line"></span>
                    <span class="tear-cue-label">tear & take</span>
                    <span class="tear-cue-line"></span>
                    <span>✂</span>
                </div>
                <div class="slip-row">
                    <div
                        v-for="i in config.slipCount"
                        :key="i"
                        class="slip"
                    >
                        <div class="slip-heading">{{ config.slipHeading }}</div>
                        <div class="slip-qr" v-html="slipQrSvg"></div>
                        <div class="slip-url">{{ shortUrl }}</div>
                    </div>
                </div>
            </footer>
        </article>

        <!-- Screen-only controls -->
        <aside class="poster-controls no-print">
            <button @click="doPrint">Print poster</button>
            <span class="hint">
                Print at 100% scale, Letter paper, no headers/footers.
                Enable "Background graphics" in print settings.
            </span>
        </aside>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import QRCode from "qrcode";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import type { Word, WordOptions } from "../../letterpeople/Word";
import { generateVibrancyRainbow } from "../../letterpeople";
import {
    PEI_POSTER,
    DEFAULT_POSTER,
    fullUrl,
    type PosterConfig,
} from "./posterConfig";

const props = defineProps<{
    variant?: "default" | "pei";
}>();

const config = computed<PosterConfig>(() =>
    props.variant === "pei" ? PEI_POSTER : DEFAULT_POSTER,
);

const shortUrl = computed(() => fullUrl(config.value.slug));
const fullScanUrl = computed(() => `https://${shortUrl.value}`);

// QR codes (rendered as inline SVG strings)
const mainQrSvg = ref("");
const slipQrSvg = ref("");

const renderQrs = async () => {
    const url = fullScanUrl.value;
    mainQrSvg.value = await QRCode.toString(url, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#1a1a1a", light: "#ffffff00" },
    });
    slipQrSvg.value = await QRCode.toString(url, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#1a1a1a", light: "#ffffff00" },
    });
};

watch(fullScanUrl, renderQrs, { immediate: false });
onMounted(renderQrs);

// LetterPeople "Hello!" hero — static, eyes + arms shown.
// Use a rainbow palette so each letter gets a distinct cheerful color.
const heroColors = generateVibrancyRainbow(6); // "Hello!" = 6 chars

const wordOptions: WordOptions = {
    spacing: 16,
    letterOptions: {
        lineWidth: 22,
        borderWidth: 4,
        showArms: true,
        showEyes: true,
        showMouth: true,
        showEyebrows: true,
        armColor: "#1a1a1a",
    },
};

const onWordCreated = (word: Word) => {
    // Color each letter from the rainbow palette
    for (let i = 0; i < word.length; i++) {
        const letter = word.getLetter(i);
        if (letter && heroColors[i]) {
            letter.updateAppearance({ color: heroColors[i] });
        }
    }
};

const bulletColor = (i: number) => heroColors[(i + 1) % heroColors.length];

const doPrint = () => window.print();
</script>

<style scoped>
/* ============================================================
   PAGE SETUP — 8.5x11 portrait
   ============================================================ */
.poster-page {
    background: #ddd;
    min-height: 100vh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.poster-sheet {
    /* 8.5 x 11 inches at 96dpi = 816 x 1056 px */
    width: 8.5in;
    height: 11in;
    background: linear-gradient(180deg, #fffef7 0%, #fff8e8 60%, #ffffff 100%);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #1a1a1a;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
    box-sizing: border-box;
}

/* ============================================================
   HERO
   ============================================================ */
.poster-hero {
    position: relative;
    flex: 0 0 2.6in;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.4in 0.5in 0.2in;
    border-bottom: 2px dashed rgba(0, 0, 0, 0.08);
}

.hero-greeting {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
}

.region-badge {
    position: absolute;
    top: 0.35in;
    right: 0.5in;
    background: rgb(var(--v-theme-primary, 245 124 0));
    color: #fff;
    font-weight: 700;
    font-size: 13pt;
    padding: 6px 14px;
    border-radius: 999px;
    transform: rotate(3deg);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    letter-spacing: 0.02em;
}

/* ============================================================
   BODY
   ============================================================ */
.poster-body {
    flex: 1 1 auto;
    padding: 0.35in 0.6in 0.3in;
    display: flex;
    flex-direction: column;
}

.poster-headline {
    font-size: 32pt;
    font-weight: 800;
    line-height: 1.05;
    margin: 0 0 0.12in;
    letter-spacing: -0.01em;
}

.poster-subhead {
    font-size: 17pt;
    font-weight: 500;
    color: #444;
    margin: 0 0 0.2in;
    line-height: 1.25;
}

.poster-paragraph {
    font-size: 13pt;
    line-height: 1.5;
    margin: 0 0 0.22in;
    color: #2a2a2a;
}

.poster-bullets {
    list-style: none;
    padding: 0;
    margin: 0 0 0.25in;
    display: flex;
    flex-direction: column;
    gap: 0.1in;
}

.poster-bullets li {
    font-size: 13pt;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #1a1a1a;
}

.bullet-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 14px;
    border: 2px solid #1a1a1a;
}

/* CTA */
.poster-cta {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3in;
    padding: 0.2in 0.25in;
    background: #fff;
    border: 3px solid #1a1a1a;
    border-radius: 14px;
}

.cta-text {
    flex: 1;
    min-width: 0;
}

.cta-line {
    font-size: 22pt;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 6px;
}

.cta-url {
    font-size: 20pt;
    font-weight: 700;
    color: rgb(var(--v-theme-primary, 245 124 0));
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: -0.01em;
}

.cta-hint {
    font-size: 10pt;
    color: #666;
    margin-top: 4px;
}

.cta-qr {
    width: 1.3in;
    height: 1.3in;
    flex: 0 0 1.3in;
}

.cta-qr :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}

/* ============================================================
   TEAR-OFF STRIP
   ============================================================ */
.tear-strip {
    flex: 0 0 1.85in;
    border-top: 2px dashed #1a1a1a;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.5);
}

.tear-cue {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0.3in;
    font-size: 9pt;
    color: #666;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.tear-cue-line {
    flex: 1;
    height: 0;
    border-top: 1px dashed #999;
}

.slip-row {
    display: flex;
    flex: 1;
    align-items: stretch;
}

.slip {
    flex: 1 1 0;
    border-left: 1px dashed #1a1a1a;
    padding: 6px 4px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    /* Rotate slip content so URL reads vertically when torn off */
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    gap: 6px;
}

.slip:first-child {
    border-left: none;
}

.slip-heading {
    font-size: 8pt;
    font-weight: 600;
    text-transform: lowercase;
    color: #666;
    letter-spacing: 0.04em;
}

.slip-qr {
    width: 0.85in;
    height: 0.85in;
    flex: 0 0 0.85in;
    /* Counter-rotate so QR scans correctly */
    writing-mode: horizontal-tb;
    transform: rotate(180deg);
}

.slip-qr :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}

.slip-url {
    font-size: 10pt;
    font-weight: 700;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    color: #1a1a1a;
    letter-spacing: -0.01em;
}

/* ============================================================
   SCREEN-ONLY CONTROLS
   ============================================================ */
.poster-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    background: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.poster-controls button {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    background: rgb(var(--v-theme-primary, 245 124 0));
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.poster-controls .hint {
    font-size: 12px;
    color: #666;
    max-width: 420px;
}

/* ============================================================
   PRINT STYLES
   ============================================================ */
@media print {
    .no-print {
        display: none !important;
    }

    .poster-page {
        background: #fff;
        padding: 0;
        margin: 0;
    }

    .poster-sheet {
        box-shadow: none;
        page-break-after: avoid;
    }

    /* Force exact color rendering */
    * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
}
</style>

<style>
/* Global print page setup — must be unscoped */
@media print {
    @page {
        size: letter portrait;
        margin: 0;
    }

    html,
    body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
    }

    /* Hide app chrome: Vuetify app bar, footer, GitHub corner, dev badges */
    .v-app-bar,
    header.v-app-bar,
    .v-footer,
    .dev-date-badge {
        display: none !important;
    }

    /* Vuetify reserves space for the app bar via v-main; reset that */
    .v-main {
        padding: 0 !important;
        --v-layout-top: 0 !important;
        --v-layout-bottom: 0 !important;
        --v-layout-left: 0 !important;
        --v-layout-right: 0 !important;
    }
    .v-main__wrap {
        padding: 0 !important;
    }

    /* Hide DebugLayout chrome */
    .debug-navigation {
        display: none !important;
    }
    .debug-content {
        margin: 0 !important;
        padding: 0 !important;
    }
}
</style>
