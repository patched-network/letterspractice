<template>
    <div class="logo-exporter">
        <v-container>
            <v-card class="mx-auto" max-width="1200">
                <v-card-title>Letters Practice Logo Exporter</v-card-title>
                <v-card-text>
                    <div
                        class="logo-preview"
                        :class="whiteBackground ? 'white-bg' : 'transparent-bg'"
                        ref="previewContainer"
                    >
                        <div class="logo-content">
                            <WordDisplay
                                :key="renderKey"
                                ref="logoWord"
                                :text="displayText"
                                :height="logoHeight"
                                :options="computedWordOptions"
                                :transform-fn="exportTransform"
                                @word-created="onWordCreated"
                            />
                            <div
                                v-if="tagline1"
                                class="tagline"
                                :style="taglineStyle"
                            >
                                {{ tagline1 }}
                            </div>
                            <div
                                v-if="tagline2"
                                class="tagline tagline-2"
                                :style="tagline2Style"
                            >
                                {{ tagline2 }}
                            </div>
                            <div
                                v-if="tagline3"
                                class="tagline tagline-3"
                                :style="tagline3Style"
                            >
                                {{ tagline3 }}
                            </div>
                        </div>
                    </div>

                    <v-divider class="my-4"></v-divider>

                    <div class="controls">
                        <v-row>
                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Text & Layout</h4>

                                <v-text-field
                                    v-model="displayText"
                                    label="Display Text"
                                    placeholder="LP"
                                    variant="outlined"
                                    density="compact"
                                    class="mb-2"
                                ></v-text-field>

                                <v-text-field
                                    v-model="tagline1"
                                    label="Tagline Line 1"
                                    placeholder="Early literacy for every child."
                                    variant="outlined"
                                    density="compact"
                                    class="mb-2"
                                ></v-text-field>

                                <v-text-field
                                    v-model="tagline2"
                                    label="Tagline Line 2 (optional)"
                                    :placeholder="tagline2Placeholder"
                                    variant="outlined"
                                    density="compact"
                                    class="mb-2"
                                ></v-text-field>

                                <v-text-field
                                    v-model="tagline3"
                                    label="Tagline Line 3 (optional)"
                                    placeholder="letterspractice.com"
                                    variant="outlined"
                                    density="compact"
                                    class="mb-2"
                                ></v-text-field>

                                <v-slider
                                    v-model="logoHeight"
                                    label="Letter Height"
                                    :min="50"
                                    :max="400"
                                    :step="10"
                                    thumb-label
                                ></v-slider>

                                <v-slider
                                    v-model="taglineFontSize"
                                    label="Tagline Size"
                                    :min="12"
                                    :max="48"
                                    :step="2"
                                    thumb-label
                                    :disabled="!tagline1 && !tagline2 && !tagline3"
                                ></v-slider>
                            </v-col>

                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Character Features</h4>

                                <v-row dense>
                                    <v-col cols="6">
                                        <div class="text-caption text-medium-emphasis mb-1">UPPERCASE</div>
                                        <v-switch
                                            v-model="upperShowEyes"
                                            label="Eyes"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="upperShowEyebrows"
                                            label="Eyebrows"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="upperShowMouth"
                                            label="Mouth"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="upperShowArms"
                                            label="Arms"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                    </v-col>
                                    <v-col cols="6">
                                        <div class="text-caption text-medium-emphasis mb-1">lowercase</div>
                                        <v-switch
                                            v-model="lowerShowEyes"
                                            label="Eyes"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="lowerShowEyebrows"
                                            label="Eyebrows"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="lowerShowMouth"
                                            label="Mouth"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                        <v-switch
                                            v-model="lowerShowArms"
                                            label="Arms"
                                            color="primary"
                                            density="compact"
                                            hide-details
                                        ></v-switch>
                                    </v-col>
                                </v-row>

                                <v-slider
                                    v-model="lineWidth"
                                    label="Line Width"
                                    :min="8"
                                    :max="48"
                                    :step="2"
                                    thumb-label
                                    class="mt-4"
                                ></v-slider>

                                <v-slider
                                    v-model="eyeSize"
                                    label="Eye Size"
                                    :min="4"
                                    :max="24"
                                    :step="1"
                                    thumb-label
                                    :disabled="!upperShowEyes && !lowerShowEyes"
                                ></v-slider>
                            </v-col>
                        </v-row>

                        <v-divider class="my-4"></v-divider>

                        <v-row>
                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Outline &amp; Jiggle</h4>

                                <v-switch
                                    v-model="showOutline"
                                    label="Outline"
                                    color="primary"
                                    density="compact"
                                    hide-details
                                ></v-switch>
                                <v-slider
                                    v-model="outlineWidth"
                                    label="Outline Width"
                                    :min="0"
                                    :max="10"
                                    :step="0.5"
                                    thumb-label
                                    :disabled="!showOutline"
                                    class="mt-2"
                                ></v-slider>

                                <v-switch
                                    v-model="jiggleEnabled"
                                    label="Jiggle"
                                    color="primary"
                                    density="compact"
                                    hide-details
                                ></v-switch>
                                <v-slider
                                    v-model="jiggleAmount"
                                    label="Jiggle Amount"
                                    :min="0"
                                    :max="12"
                                    :step="0.5"
                                    thumb-label
                                    :disabled="!jiggleEnabled"
                                    class="mt-2"
                                ></v-slider>
                            </v-col>

                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Color</h4>

                                <v-select
                                    v-model="colorMode"
                                    label="Color Mode"
                                    :items="[
                                        { title: 'Brand spread (random per letter)', value: 'brand' },
                                        { title: 'Single color', value: 'single' },
                                    ]"
                                    variant="outlined"
                                    density="compact"
                                ></v-select>

                                <div
                                    v-if="colorMode === 'single'"
                                    class="d-flex align-center mb-2"
                                    style="gap: 12px"
                                >
                                    <input
                                        type="color"
                                        v-model="singleColor"
                                        style="width: 48px; height: 40px; border: none; background: none; cursor: pointer"
                                    />
                                    <v-text-field
                                        v-model="singleColor"
                                        label="Hex"
                                        variant="outlined"
                                        density="compact"
                                        hide-details
                                        style="max-width: 160px"
                                    ></v-text-field>
                                </div>
                                <div v-else class="text-caption text-medium-emphasis mb-2">
                                    Each letter gets its own vibrant brand color. Use
                                    <strong>Re-roll</strong> below for a new spread.
                                </div>
                            </v-col>
                        </v-row>

                        <v-divider class="my-4"></v-divider>

                        <v-row>
                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Export Options</h4>

                                <v-select
                                    v-model="exportFormat"
                                    label="Export Format"
                                    :items="['SVG', 'PNG']"
                                    variant="outlined"
                                    density="compact"
                                ></v-select>

                                <v-switch
                                    v-model="whiteBackground"
                                    label="White Background"
                                    color="primary"
                                ></v-switch>

                                <v-alert type="info" density="compact" class="mb-3">
                                    OG images should be 1200x630px. Use PNG with white background.
                                </v-alert>
                            </v-col>

                            <v-col cols="12" md="6">
                                <h4 class="mb-3">Actions</h4>

                                <v-btn
                                    color="secondary"
                                    block
                                    @click="rerollLogo"
                                    :disabled="!wordInstance"
                                    class="mb-3"
                                >
                                    Re-roll Colors & Jiggle
                                </v-btn>

                                <v-btn
                                    color="primary"
                                    block
                                    @click="exportLogo"
                                    :disabled="!wordInstance"
                                >
                                    Download {{ exportFormat }}
                                </v-btn>
                            </v-col>
                        </v-row>
                    </div>
                </v-card-text>
            </v-card>
        </v-container>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { WordOptions, Word } from "../letterpeople/Word";
import WordDisplay from "../letterpeople/vue/WordDisplay.vue";
import {
    createJiggleTransform,
    createColorTransform,
    createSingleColorTransform,
    composeTransforms,
} from "../letterpeople/transforms";
import { randomVibrancyColor, ColorPresets } from "../letterpeople/util/color";
import { shallowRef } from "vue";
import { FREE_TIER_WORD_THRESHOLD } from "../services/curriculum";

// Free-tier tagline placeholder. Interpolates the live gate constant so the
// suggested copy can't drift back to the dead "Free Month" model (the OG image
// baked in that stale line once). Current model: first
// FREE_TIER_WORD_THRESHOLD words free, then $20 lifetime.
const tagline2Placeholder = `${FREE_TIER_WORD_THRESHOLD.toLocaleString()} Words Free • $20 Lifetime`;

const logoWord = ref();
const previewContainer = ref<HTMLElement>();
const wordInstance = shallowRef<Word | null>(null);

// Text controls
const displayText = ref("LP");
const tagline1 = ref("");
const tagline2 = ref("");
const tagline3 = ref("");
const taglineFontSize = ref(24);

// Layout controls
const logoHeight = ref(150);
const exportFormat = ref<"SVG" | "PNG">("PNG");
const whiteBackground = ref(false);

// Character feature controls - uppercase
const upperShowEyes = ref(true);
const upperShowEyebrows = ref(true);
const upperShowMouth = ref(true);
const upperShowArms = ref(true);

// Character feature controls - lowercase
const lowerShowEyes = ref(false);
const lowerShowEyebrows = ref(false);
const lowerShowMouth = ref(false);
const lowerShowArms = ref(false);

const lineWidth = ref(24);
const eyeSize = ref(12);

// Outline (letter border stroke). Off => borderWidth 0 => no visible outline
// (e.g. the wordmark). On => outlineWidth drives stroke thickness.
const showOutline = ref(true);
const outlineWidth = ref(2);

// Jiggle (random per-letter offset + rotation). Off => letters sit straight,
// as in the landing hero's static "read". `jiggleAmount` scales both the
// positional intensity and the rotation range together.
const jiggleEnabled = ref(true);
const jiggleAmount = ref(3);

// Color: "brand" = the random vibrant spread (one color per letter, used for
// the wordmark); "single" = every letter one chosen color (used for "read").
const colorMode = ref<"brand" | "single">("brand");
const singleColor = ref("#F57C00"); // brand primary

// Stored brand spread + jiggle seed. Kept STABLE across re-renders so tuning an
// unrelated control (line width, outline, features) no longer re-randomizes the
// logo — only an explicit Re-roll changes them. Cleared on text/mode change.
const brandColors = ref<string[]>([]);
const seed = ref(Math.floor(Math.random() * 1e9));

// Base word options - features will be applied per-letter via transform
const computedWordOptions = computed<WordOptions>(() => ({
    spacing: 2,
    letterOptions: {
        lineWidth: lineWidth.value,
        borderWidth: showOutline.value ? outlineWidth.value : 0,
        showEyes: true,  // Enable by default, transform will hide as needed
        eyeSize: eyeSize.value,
        showArms: true,
        showMouth: true,
        // Decouple brows from eyes so the eyebrow toggles are independent
        // (default true would auto-show/hide brows with eyes). Brows are always
        // created (hidden); caseAwareFeatureTransform drives their visibility.
        eyebrowsWithEyes: false,
    },
}));

// Tagline styling
const taglineStyle = computed(() => ({
    fontSize: `${taglineFontSize.value}px`,
    marginTop: '16px',
    fontFamily: 'Roboto, sans-serif',
    fontWeight: '400',
    color: '#333',
    textAlign: 'center' as const,
}));

const tagline2Style = computed(() => ({
    fontSize: `${Math.round(taglineFontSize.value * 0.85)}px`,
    marginTop: '8px',
    fontFamily: 'Roboto, sans-serif',
    fontWeight: '400',
    color: '#555',
    textAlign: 'center' as const,
}));

const tagline3Style = computed(() => ({
    fontSize: `${Math.round(taglineFontSize.value * 0.75)}px`,
    marginTop: '6px',
    fontFamily: 'Roboto, sans-serif',
    fontWeight: '400',
    color: '#666',
    textAlign: 'center' as const,
}));

// Transform that applies case-specific feature visibility
const caseAwareFeatureTransform = (word: Word) => {
    for (const letter of word) {
        const char = letter.character;
        const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
        const isLower = char === char.toLowerCase() && char !== char.toUpperCase();

        // Determine which settings to apply
        const showEyes = isUpper ? upperShowEyes.value : isLower ? lowerShowEyes.value : false;
        const showEyebrows = isUpper ? upperShowEyebrows.value : isLower ? lowerShowEyebrows.value : false;
        const showMouth = isUpper ? upperShowMouth.value : isLower ? lowerShowMouth.value : false;
        const showArms = isUpper ? upperShowArms.value : isLower ? lowerShowArms.value : false;

        // Apply visibility (instant, no animation)
        if (showEyes) {
            letter.eyes.show({ duration: 0 });
        } else {
            letter.eyes.hide({ duration: 0 });
        }

        // Eyebrows are toggled independently of eyes (see eyebrowsWithEyes: false)
        if (letter.eyes.brows) {
            if (showEyebrows) {
                letter.eyes.brows.show({ duration: 0 });
            } else {
                letter.eyes.brows.hide({ duration: 0 });
            }
        }

        if (showMouth) {
            letter.mouth.show({ duration: 0 });
        } else {
            letter.mouth.hide({ duration: 0 });
        }

        if (showArms) {
            letter.arms.show({ duration: 0 });
        } else {
            letter.arms.hide({ duration: 0 });
        }
    }
};

// Ensure the stored brand spread has one stable color per letter. Extends (never
// re-rolls) so adding/removing letters keeps existing colors put.
const ensureBrandColors = (count: number) => {
    while (brandColors.value.length < count) {
        brandColors.value.push(
            randomVibrancyColor(
                ColorPresets.vibrancyHigh.lightness,
                ColorPresets.vibrancyHigh.chroma,
            ),
        );
    }
};

// The composed transform, rebuilt per render from current controls. Colors come
// from stored state (stable), jiggle is seeded (reproducible) — so a re-create
// triggered by any control lands the letters identically instead of jumping.
const exportTransform = (word: Word): void => {
    const colorTransform =
        colorMode.value === "single"
            ? createSingleColorTransform(singleColor.value, {
                  duration: 0,
                  animate: false,
              })
            : (() => {
                  ensureBrandColors(word.length);
                  return createColorTransform({
                      colors: brandColors.value.slice(0, word.length),
                      duration: 0,
                      animate: false,
                  });
              })();

    const parts = [colorTransform];
    if (jiggleEnabled.value && jiggleAmount.value > 0) {
        parts.push(
            createJiggleTransform({
                intensity: jiggleAmount.value,
                rotationRange: jiggleAmount.value * 4.3,
                duration: 500,
                ease: "outElastic(1, .8)",
                stagger: 20,
                seed: seed.value,
            }),
        );
    }
    parts.push(caseAwareFeatureTransform);
    composeTransforms(...parts)(word);
};

// Force a clean re-create when any color/jiggle control changes (these live
// outside `options`, so WordDisplay's options watch wouldn't catch them).
// Option sliders (line width, outline, eyeSize) already re-create via options.
const renderKey = computed(() =>
    [
        displayText.value,
        colorMode.value,
        singleColor.value,
        jiggleEnabled.value,
        jiggleAmount.value,
        seed.value,
    ].join("|"),
);

const onWordCreated = (word: Word) => {
    wordInstance.value = word;
};

// Watch for toggle changes and reapply case-aware features
watch(
    [upperShowEyes, upperShowEyebrows, upperShowMouth, upperShowArms, lowerShowEyes, lowerShowEyebrows, lowerShowMouth, lowerShowArms],
    () => {
        if (wordInstance.value) {
            caseAwareFeatureTransform(wordInstance.value);
        }
    }
);

// New text means a different set of letters — drop the stored spread so brand
// colors are freshly generated for the new word (rather than carrying stale
// per-index colors from the previous text).
watch(displayText, () => {
    brandColors.value = [];
});

const rerollLogo = () => {
    // Fresh brand spread + new jiggle seed; the seed change bumps renderKey and
    // re-creates the word deterministically with the new randomness.
    brandColors.value = [];
    seed.value = Math.floor(Math.random() * 1e9);
};

const exportLogo = async () => {
    if (!wordInstance.value) return;

    const wordElement = wordInstance.value.element;

    if (exportFormat.value === "SVG") {
        exportAsSVG(wordElement);
    } else {
        await exportAsPNG(wordElement);
    }
};

const exportAsSVG = (element: HTMLElement) => {
    // Find all SVG elements within the word
    const svgs = element.querySelectorAll("svg");

    if (svgs.length === 0) return;

    // Calculate actual bounding box from all SVG elements
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

    svgs.forEach((svg) => {
        const bbox = svg.getBoundingClientRect();
        minX = Math.min(minX, bbox.left);
        minY = Math.min(minY, bbox.top);
        maxX = Math.max(maxX, bbox.right);
        maxY = Math.max(maxY, bbox.bottom);
    });

    const padding = 20; // Add padding around the logo
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    // Create a wrapper SVG that contains all letter SVGs
    const wrapperSVG = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
    );
    wrapperSVG.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    wrapperSVG.setAttribute("width", width.toString());
    wrapperSVG.setAttribute("height", height.toString());
    wrapperSVG.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Clone and position each letter SVG
    svgs.forEach((svg) => {
        const svgBBox = svg.getBoundingClientRect();
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

        // Calculate position relative to wrapper (with padding offset)
        const x = svgBBox.left - minX + padding;
        const y = svgBBox.top - minY + padding;

        // Get computed transform from the SVG element
        const computedStyle = window.getComputedStyle(svg);
        const cssTransform = computedStyle.transform;

        // Combine position and CSS transform
        let transformAttr = `translate(${x}, ${y})`;
        if (cssTransform && cssTransform !== "none") {
            // Parse matrix and convert to SVG transform
            const matrix = cssTransform.match(/matrix\((.+)\)/);
            if (matrix) {
                const values = matrix[1].split(", ");
                transformAttr += ` matrix(${values.join(" ")})`;
            }
        }

        g.setAttribute("transform", transformAttr);

        // Copy all children from the letter SVG
        Array.from(svg.children).forEach((child) => {
            g.appendChild(child.cloneNode(true));
        });

        wrapperSVG.appendChild(g);
    });

    // Convert to string and download
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(wrapperSVG);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "letters-practice-logo.svg";
    link.click();

    URL.revokeObjectURL(url);
};

const exportAsPNG = async (element: HTMLElement) => {
    // Get the logo-content container for full bounds including tagline
    const logoContent = previewContainer.value?.querySelector('.logo-content') as HTMLElement;
    if (!logoContent) return;

    // Get all SVGs
    const svgs = element.querySelectorAll("svg");
    if (svgs.length === 0) return;

    // Calculate bounding box including tagline
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

    // Include SVG bounds
    svgs.forEach((svg) => {
        const bbox = svg.getBoundingClientRect();
        minX = Math.min(minX, bbox.left);
        minY = Math.min(minY, bbox.top);
        maxX = Math.max(maxX, bbox.right);
        maxY = Math.max(maxY, bbox.bottom);
    });

    // Include tagline bounds if present
    const taglineEls = logoContent.querySelectorAll('.tagline') as NodeListOf<HTMLElement>;
    taglineEls.forEach((el) => {
        const taglineBBox = el.getBoundingClientRect();
        minX = Math.min(minX, taglineBBox.left);
        minY = Math.min(minY, taglineBBox.top);
        maxX = Math.max(maxX, taglineBBox.right);
        maxY = Math.max(maxY, taglineBBox.bottom);
    });

    const padding = 40; // Add padding around the logo
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    // Create a canvas
    const canvas = document.createElement("canvas");
    const scale = 2; // For higher resolution
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);

    // Set background if white background is enabled
    if (whiteBackground.value) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
    }

    // Convert each SVG to image and draw on canvas
    const drawPromises = Array.from(svgs).map(async (svg) => {
        const svgBBox = svg.getBoundingClientRect();
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
                const x = svgBBox.left - minX + padding;
                const y = svgBBox.top - minY + padding;
                ctx.drawImage(img, x, y, svgBBox.width, svgBBox.height);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.src = url;
        });
    });

    await Promise.all(drawPromises);

    // Draw tagline text if present
    const tagline1El = logoContent.querySelector('.tagline:not(.tagline-2)') as HTMLElement;
    const tagline2El = logoContent.querySelector('.tagline-2') as HTMLElement;

    if (tagline1El && tagline1.value) {
        const taglineBBox = tagline1El.getBoundingClientRect();
        ctx.font = `${taglineFontSize.value}px Roboto, sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = (taglineBBox.left + taglineBBox.width / 2) - minX + padding;
        const y = taglineBBox.top - minY + padding;
        ctx.fillText(tagline1.value, x, y);
    }

    if (tagline2El && tagline2.value) {
        const taglineBBox = tagline2El.getBoundingClientRect();
        ctx.font = `${Math.round(taglineFontSize.value * 0.85)}px Roboto, sans-serif`;
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = (taglineBBox.left + taglineBBox.width / 2) - minX + padding;
        const y = taglineBBox.top - minY + padding;
        ctx.fillText(tagline2.value, x, y);
    }

    const tagline3El = logoContent.querySelector('.tagline-3') as HTMLElement;
    if (tagline3El && tagline3.value) {
        const taglineBBox = tagline3El.getBoundingClientRect();
        ctx.font = `${Math.round(taglineFontSize.value * 0.75)}px Roboto, sans-serif`;
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = (taglineBBox.left + taglineBBox.width / 2) - minX + padding;
        const y = taglineBBox.top - minY + padding;
        ctx.fillText(tagline3.value, x, y);
    }

    // Download PNG
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "letters-practice-logo.png";
        link.click();
        URL.revokeObjectURL(url);
    }, "image/png");
};
</script>

<style scoped>
.logo-exporter {
    padding: 40px 0;
    min-height: 100vh;
}

.logo-preview {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    padding: 60px;
    overflow: visible;
    border-radius: 8px;
    transition: background 0.3s ease;
}

.logo-content {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.tagline {
    white-space: nowrap;
}

.logo-preview.transparent-bg {
    background:
        linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
        linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
        linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
    background-size: 20px 20px;
    background-position:
        0 0,
        0 10px,
        10px -10px,
        -10px 0px;
    background-color: white;
}

.logo-preview.white-bg {
    background-color: white;
}

.logo-preview :deep(.word-display) {
    overflow: visible !important;
}

.logo-preview :deep(.word-visual) {
    overflow: visible !important;
}

.controls {
    padding: 20px 0;
}

h4 {
    color: rgba(0, 0, 0, 0.6);
    font-weight: 500;
}
</style>
