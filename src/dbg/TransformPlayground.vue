<template>
    <div class="transform-playground">
        <h2>🎮 Transform Playground</h2>
        <p class="subtitle">Interactive transform function editor with live preview</p>

        <!-- Main Controls -->
        <div class="playground-layout">
            <!-- Controls Panel -->
            <div class="controls-panel">
                <section class="control-group">
                    <h3>📝 Text & Basic Settings</h3>

                    <div class="form-group">
                        <label for="text-input">Text to Transform:</label>
                        <input
                            id="text-input"
                            v-model="settings.text"
                            type="text"
                            class="text-input"
                            placeholder="Enter your text..."
                        />
                    </div>

                    <div class="form-group">
                        <label for="height-input">Height (px):</label>
                        <input
                            id="height-input"
                            v-model.number="settings.height"
                            type="range"
                            min="60"
                            max="200"
                            class="range-input"
                        />
                        <span class="range-value">{{ settings.height }}px</span>
                    </div>

                    <div class="form-group">
                        <label>Transform Type:</label>
                        <div class="radio-group">
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="none"
                                />
                                None
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="jiggle"
                                />
                                Jiggle
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="scatter"
                                />
                                Scatter
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="perspective"
                                />
                                Perspective
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="color"
                                />
                                Color
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="settings.transformType"
                                    type="radio"
                                    value="fan"
                                />
                                Fan Arc
                            </label>
                        </div>
                    </div>
                </section>

                <!-- Jiggle Options -->
                <section v-if="settings.transformType === 'jiggle'" class="control-group">
                    <h3>🎲 Jiggle Options</h3>

                    <div class="form-group">
                        <label for="jiggle-intensity">Intensity:</label>
                        <input
                            id="jiggle-intensity"
                            v-model.number="jiggleOptions.intensity"
                            type="range"
                            min="5"
                            max="50"
                            class="range-input"
                        />
                        <span class="range-value">{{ jiggleOptions.intensity }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="jiggle-rotation">Rotation Range:</label>
                        <input
                            id="jiggle-rotation"
                            v-model.number="jiggleOptions.rotationRange"
                            type="range"
                            min="0"
                            max="45"
                            class="range-input"
                        />
                        <span class="range-value">{{ jiggleOptions.rotationRange }}°</span>
                    </div>

                    <div class="form-group">
                        <label for="jiggle-duration">Duration:</label>
                        <input
                            id="jiggle-duration"
                            v-model.number="jiggleOptions.duration"
                            type="range"
                            min="200"
                            max="1500"
                            class="range-input"
                        />
                        <span class="range-value">{{ jiggleOptions.duration }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="jiggle-stagger">Stagger Delay:</label>
                        <input
                            id="jiggle-stagger"
                            v-model.number="jiggleOptions.stagger"
                            type="range"
                            min="0"
                            max="200"
                            class="range-input"
                        />
                        <span class="range-value">{{ jiggleOptions.stagger }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="jiggle-ease">Easing:</label>
                        <select id="jiggle-ease" v-model="jiggleOptions.ease" class="select-input">
                            <option value="outElastic(1, .6)">Elastic</option>
                            <option value="outBounce">Bounce</option>
                            <option value="outBack(1.7)">Back</option>
                            <option value="outQuad">Quad</option>
                            <option value="outCubic">Cubic</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="jiggle-seed">Random Seed:</label>
                        <input
                            id="jiggle-seed"
                            v-model.number="jiggleOptions.seed"
                            type="number"
                            min="1"
                            max="9999"
                            class="number-input"
                        />
                        <button @click="randomizeSeed" class="small-btn">🎲</button>
                    </div>
                </section>

                <!-- Scatter Options -->
                <section v-if="settings.transformType === 'scatter'" class="control-group">
                    <h3>💫 Scatter Options</h3>

                    <div class="form-group">
                        <label for="scatter-radius">Scatter Radius:</label>
                        <input
                            id="scatter-radius"
                            v-model.number="scatterOptions.radius"
                            type="range"
                            min="20"
                            max="120"
                            class="range-input"
                        />
                        <span class="range-value">{{ scatterOptions.radius }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="scatter-distance">Min Distance:</label>
                        <input
                            id="scatter-distance"
                            v-model.number="scatterOptions.minDistance"
                            type="range"
                            min="5"
                            max="30"
                            class="range-input"
                        />
                        <span class="range-value">{{ scatterOptions.minDistance }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="scatter-duration">Duration:</label>
                        <input
                            id="scatter-duration"
                            v-model.number="scatterOptions.duration"
                            type="range"
                            min="300"
                            max="2000"
                            class="range-input"
                        />
                        <span class="range-value">{{ scatterOptions.duration }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="scatter-ease">Easing:</label>
                        <select id="scatter-ease" v-model="scatterOptions.ease" class="select-input">
                            <option value="outBack(1.7)">Back</option>
                            <option value="outElastic(1, .8)">Elastic</option>
                            <option value="outBounce">Bounce</option>
                            <option value="outQuart">Quart</option>
                            <option value="outQuint">Quint</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="scatter-seed">Random Seed:</label>
                        <input
                            id="scatter-seed"
                            v-model.number="scatterOptions.seed"
                            type="number"
                            min="1"
                            max="9999"
                            class="number-input"
                        />
                        <button @click="randomizeSeed" class="small-btn">🎲</button>
                    </div>
                </section>

                <!-- Perspective Options -->
                <section v-if="settings.transformType === 'perspective'" class="control-group">
                    <h3>🎭 Perspective Options</h3>

                    <div class="form-group">
                        <label for="perspective-distance">Perspective Distance:</label>
                        <input
                            id="perspective-distance"
                            v-model.number="perspectiveOptions.distance"
                            type="range"
                            min="200"
                            max="1200"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.distance }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-rotatex">Rotate X:</label>
                        <input
                            id="perspective-rotatex"
                            v-model.number="perspectiveOptions.rotateX"
                            type="range"
                            min="-60"
                            max="60"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.rotateX }}°</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-rotatey">Rotate Y:</label>
                        <input
                            id="perspective-rotatey"
                            v-model.number="perspectiveOptions.rotateY"
                            type="range"
                            min="-60"
                            max="60"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.rotateY }}°</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-rotatez">Rotate Z:</label>
                        <input
                            id="perspective-rotatez"
                            v-model.number="perspectiveOptions.rotateZ"
                            type="range"
                            min="-45"
                            max="45"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.rotateZ }}°</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-scale">Scale:</label>
                        <input
                            id="perspective-scale"
                            v-model.number="perspectiveOptions.scale"
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.scale }}x</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-duration">Duration:</label>
                        <input
                            id="perspective-duration"
                            v-model.number="perspectiveOptions.duration"
                            type="range"
                            min="400"
                            max="2000"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.duration }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-stagger">Stagger Delay:</label>
                        <input
                            id="perspective-stagger"
                            v-model.number="perspectiveOptions.stagger"
                            type="range"
                            min="0"
                            max="150"
                            class="range-input"
                        />
                        <span class="range-value">{{ perspectiveOptions.stagger }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="perspective-ease">Easing:</label>
                        <select id="perspective-ease" v-model="perspectiveOptions.ease" class="select-input">
                            <option value="outQuart">Quart</option>
                            <option value="outCubic">Cubic</option>
                            <option value="outBack(1.7)">Back</option>
                            <option value="outElastic(1, .8)">Elastic</option>
                            <option value="outBounce">Bounce</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Transform Origin:</label>
                        <div class="grid-control">
                            <select v-model="perspectiveOptions.originX" class="select-input">
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                            <select v-model="perspectiveOptions.originY" class="select-input">
                                <option value="top">Top</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="perspective-indices">Target Indices (space-separated):</label>
                        <input
                            id="perspective-indices"
                            v-model="perspectiveOptions.targetIndicesText"
                            type="text"
                            class="text-input"
                            placeholder="e.g. 0 2 4 (leave empty for all letters)"
                        />
                        <small style="color: #666; font-size: 0.8em; margin-top: 4px; display: block;">
                            Enter letter indices separated by spaces. Empty = all letters.
                        </small>
                    </div>
                </section>

                <!-- Color Options -->
                <section v-if="settings.transformType === 'color'" class="control-group">
                    <h3>🎨 Color Options</h3>

                    <div class="form-group">
                        <label>Color Mode:</label>
                        <div class="radio-group">
                            <label class="radio-option">
                                <input
                                    v-model="colorOptions.mode"
                                    type="radio"
                                    value="single"
                                />
                                Single Color
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="colorOptions.mode"
                                    type="radio"
                                    value="pattern"
                                />
                                Pattern
                            </label>
                            <label class="radio-option">
                                <input
                                    v-model="colorOptions.mode"
                                    type="radio"
                                    value="custom"
                                />
                                Custom Array
                            </label>
                        </div>
                    </div>

                    <!-- Single Color Mode -->
                    <div v-if="colorOptions.mode === 'single'" class="form-group">
                        <label for="single-color">Color:</label>
                        <input
                            id="single-color"
                            v-model="colorOptions.singleColor"
                            type="color"
                            class="color-input"
                        />
                        <input
                            v-model="colorOptions.singleColor"
                            type="text"
                            class="text-input color-text"
                            placeholder="#ff0000"
                        />
                    </div>

                    <!-- Pattern Mode -->
                    <div v-if="colorOptions.mode === 'pattern'" class="form-group">
                        <label for="color-pattern">Pattern:</label>
                        <select id="color-pattern" v-model="colorOptions.pattern" class="select-input">
                            <option value="rainbow">Rainbow</option>
                            <option value="warm">Warm</option>
                            <option value="cool">Cool</option>
                            <option value="pastel">Pastel</option>
                            <option value="gradient">Blue-Purple Gradient</option>
                            <option value="christmas">Christmas</option>
                        </select>
                    </div>

                    <!-- Custom Array Mode -->
                    <div v-if="colorOptions.mode === 'custom'" class="form-group">
                        <label for="custom-colors">Colors (comma-separated):</label>
                        <textarea
                            id="custom-colors"
                            v-model="colorOptions.customColors"
                            class="text-input"
                            rows="3"
                            placeholder="#ff0000, #00ff00, #0000ff, #ffff00"
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label for="color-duration">Duration:</label>
                        <input
                            id="color-duration"
                            v-model.number="colorOptions.duration"
                            type="range"
                            min="200"
                            max="2000"
                            class="range-input"
                        />
                        <span class="range-value">{{ colorOptions.duration }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="color-ease">Easing:</label>
                        <select id="color-ease" v-model="colorOptions.ease" class="select-input">
                            <option value="outQuad">Quad</option>
                            <option value="outCubic">Cubic</option>
                            <option value="outQuart">Quart</option>
                            <option value="linear">Linear</option>
                            <option value="outBack(1.7)">Back</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="color-stagger">Stagger Delay:</label>
                        <input
                            id="color-stagger"
                            v-model.number="colorOptions.stagger"
                            type="range"
                            min="0"
                            max="200"
                            class="range-input"
                        />
                        <span class="range-value">{{ colorOptions.stagger }}ms</span>
                    </div>

                    <div class="form-group">
                        <label>
                            <input
                                v-model="colorOptions.animate"
                                type="checkbox"
                                class="checkbox-input"
                            />
                            Animate color transitions
                        </label>
                    </div>
                </section>

                <!-- Fan Options -->
                <section v-if="settings.transformType === 'fan'" class="control-group">
                    <h3>🌈 Fan Arc Options</h3>

                    <div class="form-group">
                        <label for="fan-radius">Arc Radius:</label>
                        <input
                            id="fan-radius"
                            v-model.number="fanOptions.radius"
                            type="range"
                            min="100"
                            max="500"
                            class="range-input"
                        />
                        <span class="range-value">{{ fanOptions.radius }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="fan-arc-angle">Arc Angle:</label>
                        <input
                            id="fan-arc-angle"
                            v-model.number="fanOptions.arcAngle"
                            type="range"
                            min="5"
                            max="90"
                            class="range-input"
                        />
                        <span class="range-value">{{ fanOptions.arcAngle }}°</span>
                    </div>

                    <div class="form-group">
                        <label for="fan-center-y">Vertical Offset:</label>
                        <input
                            id="fan-center-y"
                            v-model.number="fanOptions.centerY"
                            type="range"
                            min="0"
                            max="200"
                            class="range-input"
                        />
                        <span class="range-value">{{ fanOptions.centerY }}px</span>
                    </div>

                    <div class="form-group">
                        <label for="fan-duration">Duration:</label>
                        <input
                            id="fan-duration"
                            v-model.number="fanOptions.duration"
                            type="range"
                            min="300"
                            max="2000"
                            class="range-input"
                        />
                        <span class="range-value">{{ fanOptions.duration }}ms</span>
                    </div>

                    <div class="form-group">
                        <label for="fan-ease">Easing:</label>
                        <select id="fan-ease" v-model="fanOptions.ease" class="select-input">
                            <option value="outBack(1.7)">Back</option>
                            <option value="outElastic(1, .8)">Elastic</option>
                            <option value="outBounce">Bounce</option>
                            <option value="outQuart">Quart</option>
                            <option value="outCubic">Cubic</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="fan-stagger">Stagger Delay:</label>
                        <input
                            id="fan-stagger"
                            v-model.number="fanOptions.stagger"
                            type="range"
                            min="0"
                            max="200"
                            class="range-input"
                        />
                        <span class="range-value">{{ fanOptions.stagger }}ms</span>
                    </div>

                    <div class="form-group">
                        <label>
                            <input
                                v-model="fanOptions.followTangent"
                                type="checkbox"
                                class="checkbox-input"
                            />
                            Rotate letters to follow arc tangent
                        </label>
                    </div>

                    <div class="form-group">
                        <label>
                            <input
                                v-model="fanOptions.animate"
                                type="checkbox"
                                class="checkbox-input"
                            />
                            Animate transformation
                        </label>
                    </div>

                    <div class="form-group">
                        <label for="fan-indices">Target Indices (space-separated):</label>
                        <input
                            id="fan-indices"
                            v-model="fanOptions.targetIndicesText"
                            type="text"
                            class="text-input"
                            placeholder="e.g. 0 2 4 (leave empty for all letters)"
                        />
                        <small style="color: #666; font-size: 0.8em; margin-top: 4px; display: block;">
                            Enter letter indices separated by spaces. Empty = all letters.
                        </small>
                    </div>
                </section>

                <!-- Action Buttons -->
                <section class="control-group">
                    <h3>🎬 Actions</h3>
                    <div class="button-group">
                        <button @click="applyTransform" class="primary-btn">
                            ✨ Apply Transform
                        </button>
                        <button @click="removeTransform" class="secondary-btn">
                            🔄 Remove Transform
                        </button>
                        <button @click="regenerateTransform" class="secondary-btn">
                            🎲 Regenerate
                        </button>
                    </div>
                </section>

                <!-- Export Config -->
                <section class="control-group">
                    <h3>📋 Export Configuration</h3>
                    <textarea
                        readonly
                        :value="exportConfig"
                        class="export-textarea"
                        placeholder="Transform configuration will appear here..."
                    ></textarea>
                    <button @click="copyConfig" class="secondary-btn">
                        📋 Copy to Clipboard
                    </button>
                </section>
            </div>

            <!-- Preview Area -->
            <div class="preview-area">
                <section class="preview-section">
                    <h3>🖼️ Live Preview</h3>
                    <div class="preview-container">
                        <WordDisplay
                            :text="settings.text"
                            :height="settings.height"
                            :transform-fn="currentTransform"
                            @transform-applied="onTransformApplied"
                            @transform-removed="onTransformRemoved"
                        />
                    </div>
                </section>

                <!-- Event Log -->
                <section class="log-section">
                    <h3>📋 Event Log</h3>
                    <div class="event-log">
                        <div
                            v-for="(event, index) in eventLog"
                            :key="index"
                            class="log-entry"
                            :class="event.type"
                        >
                            <span class="timestamp">{{ event.timestamp }}</span>
                            <span class="message">{{ event.message }}</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { WordDisplay } from "../letterpeople/vue";
import { createJiggleTransform, createScatterTransform, createPerspectiveTransform, createColorTransform, createFanTransform, colorPatterns } from "../letterpeople/transforms";
import type { JiggleOptions, ScatterOptions, PerspectiveOptions, ColorOptions, FanOptions } from "../letterpeople/transforms";
import { TransformFunction } from "@/letterpeople/types";

// Settings state
const settings = ref({
    text: "TRANSFORM ME",
    height: 120,
    transformType: "none" as "none" | "jiggle" | "scatter" | "perspective" | "shadow" | "color" | "fan",
});

// Transform options
const jiggleOptions = ref<JiggleOptions>({
    intensity: 15,
    rotationRange: 20,
    duration: 600,
    stagger: 50,
    ease: "outElastic(1, .6)",
    seed: 42,
});

const scatterOptions = ref<ScatterOptions>({
    radius: 50,
    minDistance: 10,
    duration: 800,
    ease: "outBack(1.7)",
    seed: 123,
});

// Extended interface for perspective playground options
interface PerspectivePlaygroundOptions extends PerspectiveOptions {
    targetIndicesText: string;
}

const perspectiveOptions = ref<PerspectivePlaygroundOptions>({
    distance: 600,
    rotateX: 15,
    rotateY: 0,
    rotateZ: 0,
    scale: 1,
    duration: 800,
    ease: "outQuart",
    stagger: 60,
    originX: "center",
    originY: "center",
    targetIndicesText: "", // Empty string = all letters
});

interface ColorPlaygroundOptions {
    mode: "single" | "pattern" | "custom";
    singleColor: string;
    pattern: keyof typeof colorPatterns;
    customColors: string;
    duration: number;
    ease: string;
    stagger: number;
    animate: boolean;
}

const colorOptions = ref<ColorPlaygroundOptions>({
    mode: "pattern",
    singleColor: "#ff0000",
    pattern: "rainbow",
    customColors: "#ff0000, #00ff00, #0000ff, #ffff00",
    duration: 600,
    ease: "outQuad",
    stagger: 50,
    animate: true,
});

// Extended interface for fan playground options
interface FanPlaygroundOptions extends FanOptions {
    targetIndicesText: string;
}

const fanOptions = ref<FanPlaygroundOptions>({
    radius: 200,
    arcAngle: 30,
    centerY: 100,
    followTangent: true,
    duration: 800,
    ease: "outBack(1.7)",
    stagger: 60,
    animate: true,
    targetIndicesText: "", // Empty string = all letters
});

// Transform state
const currentTransform = ref<TransformFunction | undefined>(undefined);
const transformActive = ref(false);

// Event logging
interface LogEvent {
    timestamp: string;
    message: string;
    type: "info" | "success" | "error";
}

const eventLog = ref<LogEvent[]>([]);

// Computed transform configuration export
const exportConfig = computed(() => {
    if (settings.value.transformType === "none") {
        return "// No transform selected";
    }

    let config;
    switch (settings.value.transformType) {
        case "jiggle":
            config = jiggleOptions.value;
            break;
        case "scatter":
            config = scatterOptions.value;
            break;
        case "perspective":
            // Use the same parsing logic for export
            const perspectiveExportConfig = {
                ...perspectiveOptions.value,
            };

            // Parse and include targetIndices in export
            if (perspectiveOptions.value.targetIndicesText.trim()) {
                try {
                    const parsedIndices = perspectiveOptions.value.targetIndicesText
                        .trim()
                        .split(/\s+/)
                        .map(n => parseInt(n))
                        .filter(n => !isNaN(n));

                    if (parsedIndices.length > 0) {
                        perspectiveExportConfig.targetIndices = parsedIndices;
                    }
                } catch (error) {
                    // Skip targetIndices if parsing fails
                }
            }

            // Remove the text field from export config
            delete (perspectiveExportConfig as any).targetIndicesText;
            config = perspectiveExportConfig;
            break;
        case "color":
            // Convert playground options to ColorOptions
            const colorConfig: Partial<ColorOptions> = {
                duration: colorOptions.value.duration,
                ease: colorOptions.value.ease,
                stagger: colorOptions.value.stagger,
                animate: colorOptions.value.animate,
            };
            if (colorOptions.value.mode === "single") {
                colorConfig.colors = colorOptions.value.singleColor;
            } else if (colorOptions.value.mode === "pattern") {
                colorConfig.colors = colorPatterns[colorOptions.value.pattern];
            } else if (colorOptions.value.mode === "custom") {
                colorConfig.colors = colorOptions.value.customColors.split(',').map(c => c.trim());
            }
            config = colorConfig;
            break;
        case "fan":
            // Use the same parsing logic for export
            const fanExportConfig = {
                ...fanOptions.value,
            };

            // Parse and include targetIndices in export
            if (fanOptions.value.targetIndicesText.trim()) {
                try {
                    const parsedIndices = fanOptions.value.targetIndicesText
                        .trim()
                        .split(/\s+/)
                        .map(n => parseInt(n))
                        .filter(n => !isNaN(n));

                    if (parsedIndices.length > 0) {
                        fanExportConfig.targetIndices = parsedIndices;
                    }
                } catch (error) {
                    // Skip targetIndices if parsing fails
                }
            }

            // Remove the text field from export config
            delete (fanExportConfig as any).targetIndicesText;
            config = fanExportConfig;
            break;
        default:
            config = {};
    }

    return `import { create${settings.value.transformType.charAt(0).toUpperCase() + settings.value.transformType.slice(1)}Transform } from '@/letterpeople/transforms';

const ${settings.value.transformType}Transform = create${settings.value.transformType.charAt(0).toUpperCase() + settings.value.transformType.slice(1)}Transform(${JSON.stringify(config, null, 2)});

// Usage:
<WordDisplay
  text="${settings.value.text}"
  :height="${settings.value.height}"
  :transform-fn="${settings.value.transformType}Transform"
/>`;
});

// Methods
const applyTransform = () => {
    switch (settings.value.transformType) {
        case "jiggle":
            currentTransform.value = createJiggleTransform(jiggleOptions.value);
            break;
        case "scatter":
            currentTransform.value = createScatterTransform(scatterOptions.value);
            break;
        case "perspective":
            // Parse target indices from text input
            const perspectiveConfig: PerspectiveOptions = {
                ...perspectiveOptions.value,
            };

            // Parse targetIndicesText into targetIndices array
            if (perspectiveOptions.value.targetIndicesText.trim()) {
                try {
                    const parsedIndices = perspectiveOptions.value.targetIndicesText
                        .trim()
                        .split(/\s+/)
                        .map(n => parseInt(n))
                        .filter(n => !isNaN(n)); // Remove any NaN values

                    if (parsedIndices.length > 0) {
                        perspectiveConfig.targetIndices = parsedIndices;
                    }
                } catch (error) {
                    console.warn("Failed to parse target indices, using all letters:", error);
                    // targetIndices will remain undefined = all letters
                }
            }

            currentTransform.value = createPerspectiveTransform(perspectiveConfig);
            break;
        case "color":
            // Convert playground options to proper ColorOptions
            const colorConfig: ColorOptions = {
                colors: colorOptions.value.mode === "single"
                    ? colorOptions.value.singleColor
                    : colorOptions.value.mode === "pattern"
                    ? colorPatterns[colorOptions.value.pattern]
                    : colorOptions.value.customColors.split(',').map(c => c.trim()),
                duration: colorOptions.value.duration,
                ease: colorOptions.value.ease,
                stagger: colorOptions.value.stagger,
                animate: colorOptions.value.animate,
            };
            currentTransform.value = createColorTransform(colorConfig);
            break;
        case "fan":
            // Parse target indices from text input
            const fanConfig: FanOptions = {
                ...fanOptions.value,
            };

            // Parse targetIndicesText into targetIndices array
            if (fanOptions.value.targetIndicesText.trim()) {
                try {
                    const parsedIndices = fanOptions.value.targetIndicesText
                        .trim()
                        .split(/\s+/)
                        .map(n => parseInt(n))
                        .filter(n => !isNaN(n)); // Remove any NaN values

                    if (parsedIndices.length > 0) {
                        fanConfig.targetIndices = parsedIndices;
                    }
                } catch (error) {
                    console.warn("Failed to parse target indices, using all letters:", error);
                    // targetIndices will remain undefined = all letters
                }
            }

            currentTransform.value = createFanTransform(fanConfig);
            break;
        default:
            currentTransform.value = undefined;
    }
    transformActive.value = !!currentTransform.value;
};

const removeTransform = () => {
    currentTransform.value = undefined;
    transformActive.value = false;
};

const regenerateTransform = () => {
    if (transformActive.value && settings.value.transformType !== "none") {
        // Force regeneration by removing and reapplying
        removeTransform();
        setTimeout(() => {
            applyTransform();
        }, 100);
    }
};

const randomizeSeed = () => {
    const seed = Math.floor(Math.random() * 9999) + 1;
    if (settings.value.transformType === "jiggle") {
        jiggleOptions.value.seed = seed;
    } else if (settings.value.transformType === "scatter") {
        scatterOptions.value.seed = seed;
    }
    // Perspective doesn't use seeds, but we could randomize rotation values
    else if (settings.value.transformType === "perspective") {
        perspectiveOptions.value.rotateX = Math.floor(Math.random() * 60) - 30;
        perspectiveOptions.value.rotateY = Math.floor(Math.random() * 60) - 30;
        perspectiveOptions.value.rotateZ = Math.floor(Math.random() * 30) - 15;
    }
};

const copyConfig = async () => {
    try {
        await navigator.clipboard.writeText(exportConfig.value);
        addLogEntry("Configuration copied to clipboard!", "success");
    } catch (error) {
        addLogEntry("Failed to copy configuration", "error");
    }
};

const addLogEntry = (message: string, type: LogEvent["type"] = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    eventLog.value.unshift({ timestamp, message, type });
    if (eventLog.value.length > 20) {
        eventLog.value = eventLog.value.slice(0, 20);
    }
};

// Event handlers
const onTransformApplied = () => {
    addLogEntry(`${settings.value.transformType} transform applied`, "success");
};

const onTransformRemoved = () => {
    addLogEntry("Transform removed", "info");
};

// Auto-apply when transform type changes
watch(() => settings.value.transformType, () => {
    if (settings.value.transformType !== "none") {
        applyTransform();
    } else {
        removeTransform();
    }
});

// Initialize log
addLogEntry("Transform Playground loaded", "info");
</script>

<style scoped>
.transform-playground {
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
    font-family: 'Segoe UI', system-ui, sans-serif;
}

.subtitle {
    color: #666;
    margin-bottom: 30px;
    font-size: 16px;
}

.playground-layout {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 30px;
    min-height: 600px;
}

/* Controls Panel */
.controls-panel {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 20px;
    height: fit-content;
    overflow-y: auto;
    max-height: 90vh;
}

.control-group {
    margin-bottom: 25px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e9ecef;
}

.control-group:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.control-group h3 {
    margin: 0 0 15px 0;
    color: #495057;
    font-size: 16px;
    font-weight: 600;
}

/* Form Controls */
.form-group {
    margin-bottom: 15px;
}

.grid-control {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #495057;
    font-size: 14px;
}

.text-input, .number-input, .select-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.15s ease-in-out;
}

.text-input:focus, .number-input:focus, .select-input:focus {
    outline: none;
    border-color: #80bdff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.range-input {
    width: calc(100% - 60px);
    margin-right: 10px;
}

.range-value {
    display: inline-block;
    width: 50px;
    text-align: right;
    font-size: 12px;
    color: #6c757d;
    font-weight: 500;
}

.radio-group {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
}

.radio-option {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    cursor: pointer;
}

.radio-option input[type="radio"] {
    margin: 0;
}

.number-input {
    width: calc(100% - 40px);
    display: inline-block;
}

.small-btn {
    width: 30px;
    height: 34px;
    margin-left: 5px;
    border: 1px solid #ced4da;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.small-btn:hover {
    background: #e9ecef;
}

/* Buttons */
.button-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.primary-btn, .secondary-btn {
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
}

.primary-btn {
    background: #007bff;
    color: white;
}

.primary-btn:hover {
    background: #0056b3;
}

.secondary-btn {
    background: #6c757d;
    color: white;
}

.secondary-btn:hover {
    background: #545b62;
}

/* Export Area */
.export-textarea {
    width: 100%;
    height: 120px;
    padding: 10px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    resize: vertical;
    margin-bottom: 10px;
}

/* Preview Area */
.preview-area {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.preview-section, .log-section {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 20px;
}

.preview-section h3, .log-section h3 {
    margin: 0 0 15px 0;
    color: #495057;
    font-size: 16px;
    font-weight: 600;
}

.preview-container {
    min-height: 200px;
    border: 2px dashed #dee2e6;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8f9fa;
}

/* Event Log */
.event-log {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 10px;
    background: #f8f9fa;
}

.log-entry {
    display: flex;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid #e9ecef;
    font-size: 12px;
}

.log-entry:last-child {
    border-bottom: none;
}

.timestamp {
    color: #6c757d;
    font-weight: 500;
    min-width: 80px;
}

.message {
    flex: 1;
}

.log-entry.success .message {
    color: #155724;
}

.log-entry.error .message {
    color: #721c24;
}

.log-entry.info .message {
    color: #495057;
}

/* Color Controls */
.color-input {
    width: 40px;
    height: 34px;
    padding: 0;
    border: 1px solid #ced4da;
    border-radius: 4px;
    cursor: pointer;
    background: none;
    vertical-align: middle;
}

.color-text {
    width: calc(100% - 50px);
    margin-left: 10px;
    display: inline-block;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
}

.checkbox-input {
    margin-right: 8px;
    transform: scale(1.1);
}

/* Responsive Design */
@media (max-width: 1200px) {
    .playground-layout {
        grid-template-columns: 350px 1fr;
    }
}

@media (max-width: 900px) {
    .playground-layout {
        grid-template-columns: 1fr;
    }

    .controls-panel {
        max-height: none;
    }
}
</style>
