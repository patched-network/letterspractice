<template>
    <div class="transform-test">
        <h2>Transform Function Testing</h2>

        <!-- Basic Transform Tests -->
        <section class="test-section">
            <h3>1. Basic Jiggle Transform</h3>
            <WordDisplay
                text="LETTERS PRACTICE"
                :height="120"
                :transform-fn="jiggleActive ? jiggleTransform : undefined"
                @transform-applied="handleTransformApplied"
                @transform-removed="handleTransformRemoved"
            />
            <div class="controls">
                <button @click="toggleJiggle">
                    {{ jiggleActive ? "Remove" : "Apply" }} Jiggle
                </button>
                <button @click="refreshJiggle" :disabled="!jiggleActive">
                    Refresh Jiggle
                </button>
            </div>
        </section>

        <!-- Event-Driven Transform Tests -->
        <section class="test-section">
            <h3>2. Hover Ripple Effect</h3>
            <WordDisplay
                text="HOVER ME"
                :height="120"
                :transform-fn="hoverTransform"
            />
            <p>
                <em>Move your mouse over the letters to see ripple effect</em>
            </p>
        </section>

        <!-- No Transform Baseline -->
        <section class="test-section">
            <h3>3. No Transform (Baseline)</h3>
            <WordDisplay text="NORMAL TEXT" :height="120" />
            <p><em>This text has no transforms applied</em></p>
        </section>

        <!-- Transform Switching Test -->
        <section class="test-section">
            <h3>4. Transform Switching</h3>
            <WordDisplay
                text="TRANSFORM"
                :height="120"
                :transform-fn="currentTransform"
            />
            <div class="controls">
                <button @click="setTransform('none')">No Transform</button>
                <button @click="setTransform('jiggle')">Jiggle</button>
                <button @click="setTransform('wave')">Wave</button>
                <button @click="setTransform('hover')">Hover Effect</button>
            </div>
            <p>Current transform: {{ currentTransformName }}</p>
        </section>

        <!-- Color Transform Tests -->
        <section class="test-section">
            <h3>5. Color Transform Functions</h3>
            <WordDisplay
                text="COLOR MAGIC"
                :height="120"
                :transform-fn="currentColorTransform"
                @transform-applied="handleTransformApplied"
                @transform-removed="handleTransformRemoved"
            />
            <div class="controls">
                <button @click="setColorTransform('none')">No Color Transform</button>
                <button @click="setColorTransform('red')">Red</button>
                <button @click="setColorTransform('rainbow')">Rainbow</button>
                <button @click="setColorTransform('warm')">Warm Colors</button>
                <button @click="setColorTransform('cool')">Cool Colors</button>
                <button @click="setColorTransform('pastel')">Pastel</button>
            </div>
            <p>Current color transform: {{ currentColorTransformName }}</p>
        </section>

        <!-- OKLCH Rainbow Colors Test -->
        <section class="test-section">
            <h3>6. OKLCH Rainbow Colors</h3>
            <WordDisplay
                text="RAINBOW LETTERS"
                :height="120"
                :letter-options="rainbowColors"
            />
            <div class="controls">
                <button @click="generateNewRainbow">Generate New Rainbow</button>
                <button @click="randomizeAllColors">Randomize All Colors</button>
            </div>
            <p><em>Each letter gets a perceptually uniform vibrant color using OKLCH</em></p>
        </section>

        <!-- Event Log -->
        <section class="test-section">
            <h3>7. Event Log</h3>
            <div class="event-log">
                <h4>Transform Events:</h4>
                <ul>
                    <li v-for="(event, index) in eventLog" :key="index">
                        {{ event }}
                    </li>
                </ul>
            </div>
        </section>

        <!-- Debug Information -->
        <section class="test-section">
            <h3>8. Debug Information</h3>
            <pre>{{ debugInfo }}</pre>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { WordDisplay } from "../letterpeople/vue";
import type { TransformFunction } from "../letterpeople/types";
import { animate, Target } from "animejs";
import { generateVibrancyRainbow, randomVibrancyColor, ColorPresets } from "../letterpeople/util/color";
import { createColorTransform, createRainbowTransform, createSingleColorTransform, colorPatterns } from "../letterpeople/transforms";

// Component state
const jiggleActive = ref(false);
const currentTransformName = ref("none");
const currentTransform = ref<TransformFunction | undefined>(undefined);
const currentColorTransformName = ref("none");
const currentColorTransform = ref<TransformFunction | undefined>(undefined);
const eventLog = ref<string[]>([]);
const rainbowColors = ref<{ [index: number]: { color: string } }>({});

// Debug info
const debugInfo = reactive({
    jiggleActive: false,
    currentTransform: "none",
    currentColorTransform: "none",
    eventsReceived: 0,
    lastEvent: {},
});

// Transform Functions

// Animated jiggle transform using anime.js
const jiggleTransform: TransformFunction = (word) => {
    // Capture original transforms
    const originalTransforms = word.letters.map(
        (letter) => letter.svgElement.getAttribute("transform") || "",
    );

    // Generate target positions for each letter
    const targetTransforms = word.letters.map(() => ({
        x: (Math.random() - 0.5) * 15,
        y: (Math.random() - 0.5) * 10,
        rotate: (Math.random() - 0.5) * 20,
    }));

    // Animate all letters to their jiggle positions
    animate(
        word.letters.map((letter) => letter.svgElement),
        {
            translateX: (el: Target, i: number) => targetTransforms[i].x,
            translateY: (el: Target, i: number) => targetTransforms[i].y,
            rotate: (el: Target, i: number) => targetTransforms[i].rotate,
            duration: 600,
            ease: "outElastic(1, .6)",
            delay: (el: Target, i: number) => i * 50,
        },
    );

    // Return undo function that animates back to original positions
    return () => {
        animate(
            word.letters.map((letter) => letter.svgElement),
            {
                translateX: 0,
                translateY: 0,
                rotate: 0,
                duration: 400,
                ease: "outQuad",
                complete: () => {
                    // Restore original transforms after animation
                    word.letters.forEach((letter, i) => {
                        letter.svgElement.setAttribute(
                            "transform",
                            originalTransforms[i],
                        );
                    });
                },
            },
        );
    };
};

// Wave transform
const waveTransform: TransformFunction = (word) => {
    const originalTransforms = word.letters.map(
        (letter) => letter.svgElement.getAttribute("transform") || "",
    );

    word.letters.forEach((letter, i) => {
        const y = Math.sin(i * 0.8) * 15;
        const rotate = Math.sin(i * 0.5) * 10;

        letter.svgElement.setAttribute(
            "transform",
            `translate(0, ${y}) rotate(${rotate})`,
        );
    });

    return () => {
        word.letters.forEach((letter, i) => {
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
        });
    };
};

// Hover ripple effect
const hoverTransform: TransformFunction = (word) => {
    const originalTransforms = word.letters.map(
        (letter) => letter.svgElement.getAttribute("transform") || "",
    );

    const handleMouseMove = (event: MouseEvent) => {
        const containerRect = word.getBoundingRect();
        const hoverPoint = {
            x: event.clientX - containerRect.left,
            y: event.clientY - containerRect.top,
        };

        word.letters.forEach((letter) => {
            const letterCenter = letter.getCenter();
            const letterRect = letter.getBoundingRect();

            // Convert to container-relative coordinates
            const relativeCenter = {
                x: letterRect.left + letterRect.width / 2 - containerRect.left,
                y: letterRect.top + letterRect.height / 2 - containerRect.top,
            };

            const distance = Math.hypot(
                hoverPoint.x - relativeCenter.x,
                hoverPoint.y - relativeCenter.y,
            );

            const intensity = Math.max(0, 1 - distance / 100);
            const scale = 1 + intensity * 0.4;
            const translateY = -intensity * 8;

            letter.svgElement.style.transform = `scale(${scale}) translateY(${translateY}px)`;
        });
    };

    const handleMouseLeave = () => {
        word.letters.forEach((letter, i) => {
            letter.svgElement.style.transform = "";
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
        });
    };

    word.container.addEventListener("mousemove", handleMouseMove);
    word.container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
        word.container.removeEventListener("mousemove", handleMouseMove);
        word.container.removeEventListener("mouseleave", handleMouseLeave);
        word.letters.forEach((letter, i) => {
            letter.svgElement.style.transform = "";
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
        });
    };
};

// Methods
const toggleJiggle = () => {
    jiggleActive.value = !jiggleActive.value;
    debugInfo.jiggleActive = jiggleActive.value;
};

const refreshJiggle = () => {
    if (jiggleActive.value) {
        // Force re-trigger by toggling the reactive prop
        jiggleActive.value = false;
        // Use nextTick to ensure the prop change is processed
        setTimeout(() => {
            jiggleActive.value = true;
        }, 10);
    }
};

const setTransform = (transformType: string) => {
    currentTransformName.value = transformType;

    switch (transformType) {
        case "none":
            currentTransform.value = undefined;
            break;
        case "jiggle":
            currentTransform.value = jiggleTransform;
            break;
        case "wave":
            currentTransform.value = waveTransform;
            break;
        case "hover":
            currentTransform.value = hoverTransform;
            break;
        default:
            currentTransform.value = undefined;
    }

    debugInfo.currentTransform = transformType;
};

const setColorTransform = (transformType: string) => {
    currentColorTransformName.value = transformType;

    switch (transformType) {
        case "none":
            currentColorTransform.value = undefined;
            break;
        case "red":
            currentColorTransform.value = createSingleColorTransform("#ff0000");
            break;
        case "rainbow":
            currentColorTransform.value = createRainbowTransform();
            break;
        case "warm":
            currentColorTransform.value = createColorTransform({ colors: colorPatterns.warm });
            break;
        case "cool":
            currentColorTransform.value = createColorTransform({ colors: colorPatterns.cool });
            break;
        case "pastel":
            currentColorTransform.value = createColorTransform({ colors: colorPatterns.pastel });
            break;
        default:
            currentColorTransform.value = undefined;
    }

    debugInfo.currentColorTransform = transformType;
};

// Event handlers
const handleTransformApplied = (transformFn: TransformFunction) => {
    addToEventLog(`Transform applied: ${transformFn.name || "anonymous"}`);
    debugInfo.eventsReceived++;
    debugInfo.lastEvent = { type: "transformApplied", timestamp: Date.now() };
};

const handleTransformRemoved = () => {
    addToEventLog("Transform removed");
    debugInfo.eventsReceived++;
    debugInfo.lastEvent = { type: "transformRemoved", timestamp: Date.now() };
};

const addToEventLog = (message: string) => {
    eventLog.value.unshift(`${new Date().toLocaleTimeString()}: ${message}`);
    if (eventLog.value.length > 10) {
        eventLog.value = eventLog.value.slice(0, 10);
    }
};

// OKLCH Color Methods
const generateNewRainbow = () => {
    const colors = generateVibrancyRainbow(14, ColorPresets.vibrancyHigh.lightness, ColorPresets.vibrancyHigh.chroma);
    const newRainbowColors: { [index: number]: { color: string } } = {};

    colors.forEach((color, index) => {
        newRainbowColors[index] = { color };
    });

    rainbowColors.value = newRainbowColors;
    addToEventLog(`Generated new rainbow with ${colors.length} colors`);
};

const randomizeAllColors = () => {
    const newColors: { [index: number]: { color: string } } = {};

    // "RAINBOW LETTERS" = 14 characters
    for (let i = 0; i < 14; i++) {
        newColors[i] = {
            color: randomVibrancyColor(ColorPresets.vibrancyHigh.lightness, ColorPresets.vibrancyHigh.chroma)
        };
    }

    rainbowColors.value = newColors;
    addToEventLog("Randomized all letter colors");
};

// Initialize rainbow colors on mount
generateNewRainbow();
</script>

<style scoped>
.transform-test {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
}

.test-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f9f9f9;
}

.test-section h3 {
    margin-top: 0;
    color: #333;
    border-bottom: 2px solid #4caf50;
    padding-bottom: 8px;
}

.controls {
    margin-top: 15px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.controls button {
    padding: 8px 16px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.controls button:hover {
    background: #1976d2;
}

.controls button:disabled {
    background: #ccc;
    cursor: not-allowed;
}

.event-log {
    margin-top: 15px;
    padding: 15px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
}

.event-log ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.event-log li {
    padding: 4px 0;
    border-bottom: 1px solid #eee;
    font-family: monospace;
    font-size: 13px;
}

pre {
    background: #f0f0f0;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
}

/* WordDisplay component styling within this test */
.transform-test :deep(.word-display) {
    margin: 10px 0;
    padding: 5px;
    border: 1px dashed #999;
    border-radius: 4px;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Test-specific animations */
@keyframes highlight {
    0% {
        background-color: transparent;
    }
    50% {
        background-color: #ffeb3b;
    }
    100% {
        background-color: transparent;
    }
}

.test-section:target {
    animation: highlight 2s ease-in-out;
}
</style>
