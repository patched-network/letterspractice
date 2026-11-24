<template>
    <div class="letter-debug-container">
        <div class="controls">
            <h3>LetterPeople Sandbox-</h3>

            <label>
                Text to Render:
                <input v-model="textInput" type="text" class="text-input" />
            </label>

            <!-- Color controls side by side -->
            <div class="controls-row">
                <label class="control-item">
                    Fill Color:
                    <input
                        v-model="fillColor"
                        type="color"
                        style="width: 100%"
                    />
                </label>
                <label class="control-item">
                    Outline Color:
                    <input
                        v-model="strokeColor"
                        type="color"
                        style="width: 100%"
                    />
                </label>
            </div>

            <!-- Number inputs side by side -->
            <div class="controls-row">
                <label class="control-item">
                    Limb Thickness:
                    <input
                        v-model.number="lineWidth"
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        style="width: 100%"
                    />
                </label>
                <label class="control-item">
                    Outline Width:
                    <input
                        v-model.number="strokeWidth"
                        type="number"
                        min="0"
                        max="20"
                        step="0.5"
                        style="width: 100%"
                    />
                </label>
            </div>

            <label>
                Letter Size:
                <span class="range-value">{{ letterSize }}px</span>
                <input
                    v-model.number="letterSize"
                    type="range"
                    min="20"
                    max="300"
                    step="5"
                />
            </label>

            <div class="divider"></div>

            <!-- Attachment Toggle Controls -->
            <h4>Attachments</h4>

            <div class="controls-row">
                <label class="checkbox-label control-item">
                    <input v-model="showEyes" type="checkbox" />
                    <span>👁️Eyes</span>
                </label>

                <label class="checkbox-label control-item">
                    <input v-model="showMouth" type="checkbox" />
                    <span>👄&nbsp;Mouth</span>
                </label>

                <label class="checkbox-label control-item">
                    <input v-model="showArms" type="checkbox" />
                    <span>💪Arms</span>
                </label>
            </div>

            <!-- Eyes Controls Panel -->
            <div class="control-panel">
                <div
                    class="panel-header"
                    :class="{ collapsed: !eyesExpanded }"
                    @click="eyesExpanded = !eyesExpanded"
                >
                    <h4><span>👁️</span> Eyes</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div v-show="eyesExpanded" class="panel-content">
                    <div class="controls-row">
                        <label class="control-item">
                            Size:
                            <span class="range-value">{{ eyeSize }}°</span>
                            <input
                                v-model.number="eyeSize"
                                type="range"
                                min="1"
                                max="40"
                                step="1"
                            />
                        </label>
                        <label class="control-item">
                            Look Angle:
                            <span class="range-value">{{ eyeAngle }}°</span>
                            <input
                                v-model.number="eyeAngle"
                                type="range"
                                min="0"
                                max="360"
                                step="15"
                            />
                        </label>
                        <label class="control-item">
                            Pupil Distance:
                            <span class="range-value">{{ eyeDistance }}%</span>
                            <input
                                v-model.number="eyeDistance"
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                            />
                        </label>
                    </div>
                    <div class="controls-row">
                        <button @click="blinkAllLetters" type="button">
                            Blink
                        </button>
                        <button @click="toggleEyeTracking" type="button">
                            Track Cursor
                        </button>
                    </div>
                    <label class="checkbox-label">
                        <input v-model="eyeTracking" type="checkbox" />
                        <span>Follow Mouse Cursor</span>
                    </label>
                </div>
            </div>

            <!-- Mouth Controls Panel -->
            <div class="control-panel">
                <div
                    class="panel-header"
                    :class="{ collapsed: !mouthExpanded }"
                    @click="mouthExpanded = !mouthExpanded"
                >
                    <h4><span>👄</span> Mouth</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div v-show="mouthExpanded" class="panel-content">
                    <div class="controls-row">
                        <label class="control-item">
                            Openness:
                            <span class="range-value">{{
                                mouthOpenness.toFixed(2)
                            }}</span>
                            <input
                                v-model.number="mouthOpenness"
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                            />
                        </label>
                        <label class="control-item">
                            Mood:
                            <span class="range-value">{{
                                mouthMood.toFixed(2)
                            }}</span>
                            <input
                                v-model.number="mouthMood"
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                            />
                        </label>
                    </div>
                    <button @click="animateMouth" type="button">Speak</button>
                </div>
            </div>

            <!-- Arms Controls Panel -->
            <div class="control-panel">
                <div
                    class="panel-header"
                    :class="{ collapsed: !armsExpanded }"
                    @click="armsExpanded = !armsExpanded"
                >
                    <h4><span>💪</span> Arms</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div v-show="armsExpanded" class="panel-content">
                    <div class="controls-row">
                        <label class="control-item">
                            Left Angle:
                            <span class="range-value">{{ leftArmAngle }}°</span>
                            <input
                                v-model.number="leftArmAngle"
                                type="range"
                                min="0"
                                max="360"
                                step="5"
                            />
                        </label>
                        <label class="control-item">
                            Right Angle:
                            <span class="range-value"
                                >{{ rightArmAngle }}°</span
                            >
                            <input
                                v-model.number="rightArmAngle"
                                type="range"
                                min="0"
                                max="360"
                                step="5"
                            />
                        </label>
                    </div>
                    <label>
                        Arm Length:
                        <span class="range-value">{{
                            armLength.toFixed(1)
                        }}</span>
                        <input
                            v-model.number="armLength"
                            type="range"
                            min="5"
                            max="30"
                            step="0.5"
                        />
                    </label>
                    <button @click="waveArms" type="button">Wave Arms</button>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Debug controls Panel -->
            <div class="control-panel">
                <div
                    class="panel-header"
                    :class="{ collapsed: !debugExpanded }"
                    @click="debugExpanded = !debugExpanded"
                >
                    <h4><span>🔧</span> Debug</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div v-show="debugExpanded" class="panel-content">
                    <label class="checkbox-label">
                        <input v-model="showAttachments" type="checkbox" />
                        <span>Show Attachment Points</span>
                    </label>
                    <label class="checkbox-label">
                        <input v-model="showBaseline" type="checkbox" />
                        <span>Show Descender Baseline</span>
                    </label>
                    <label class="checkbox-label">
                        <input v-model="showLowercaseLine" type="checkbox" />
                        <span>Show Lowercase Line</span>
                    </label>
                    <label class="checkbox-label">
                        <input v-model="showBoundingBox" type="checkbox" />
                        <span>Show Bounding Box</span>
                    </label>
                </div>
            </div>
        </div>

        <div
            ref="letterDisplayArea"
            class="letter-display-area"
            :style="{ '--letter-size': letterSize + 'px' }"
        >
            <!-- Letters will be rendered here -->
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { createLetter, Word } from "../letterpeople";
import type { WordOptions } from "../letterpeople/Word";
import type { LetterInstance } from "../letterpeople/types";

// Reactive data
const textInput = ref(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?:;'",
);
const fillColor = ref("#add8e6");
const strokeColor = ref("#333333");
const lineWidth = ref(25);
const strokeWidth = ref(4);
const letterSize = ref(260);

// Attachment toggles
const showEyes = ref(true);
const showMouth = ref(true);
const showArms = ref(true);

// Panel expansion states
const eyesExpanded = ref(false);
const mouthExpanded = ref(false);
const armsExpanded = ref(false);
const debugExpanded = ref(false);

// Eye controls
const eyeSize = ref(10);
const eyeAngle = ref(0);
const eyeDistance = ref(50);
const eyeTracking = ref(false);

// Mouth controls
const mouthOpenness = ref(0.1);
const mouthMood = ref(0.7);

// Arm controls
const leftArmAngle = ref(150);
const rightArmAngle = ref(30);
const armLength = ref(15);

// Debug controls
const showAttachments = ref(true);
const showBaseline = ref(true);
const showLowercaseLine = ref(true);
const showBoundingBox = ref(true);

// Letter display
const letterDisplayArea = ref<HTMLElement | null>(null);
const letterInstances = ref<LetterInstance[]>([]);

// Methods
const renderLetters = async () => {
    if (!letterDisplayArea.value) return;

    // Clear existing letters
    letterDisplayArea.value.innerHTML = "";
    letterInstances.value = [];

    // Render each character
    for (const char of textInput.value) {
        if (char === " ") continue; // Skip spaces

        const wrapper = document.createElement("div");
        wrapper.className = "letter-wrapper";
        wrapper.style.width = letterSize.value + "px";
        wrapper.style.height = letterSize.value + "px";
        letterDisplayArea.value.appendChild(wrapper);

        // console.log(`Attempting to create letter: ${char}`);
        const letterInstance = createLetter(char, wrapper, {
            color: fillColor.value,
            borderColor: strokeColor.value,
            lineWidth: lineWidth.value,
            borderWidth: strokeWidth.value,
            debug: showBaseline.value,
            eyeSize: eyeSize.value,
            mouthParams: {
                openness: mouthOpenness.value,
                mood: mouthMood.value,
            },
            armLength: armLength.value,
            armThickness: 3,
            armColor: strokeColor.value,
        });

        if (letterInstance) {
            // console.log(`Successfully created letter: ${char}`);
            // Force SVG sizing explicitly
            letterInstance.svgElement.setAttribute("width", "100%");
            letterInstance.svgElement.setAttribute("height", "100%");
            letterInstances.value.push(letterInstance);
            // Apply initial visibility states
            updateAttachmentVisibility(letterInstance);

            // Visualize attachment points if enabled
            visualizeAttachmentPoints(
                letterInstance.svgElement,
                letterInstance.attachmentCoords,
            );

            // Visualize lowercase line if enabled
            visualizeLowercaseLine(letterInstance.svgElement);

            // Visualize bounding box if enabled
            visualizeBoundingBox(wrapper, letterInstance);
        } else {
            // console.log(`Failed to create letter: ${char} - returned null`);
            // Remove the wrapper and create placeholder directly
            letterDisplayArea.value.removeChild(wrapper);
            const placeholder = document.createElement("div");
            placeholder.className = "placeholder";
            placeholder.style.width = letterSize.value + "px";
            placeholder.style.height = letterSize.value + "px";
            placeholder.textContent = char;
            letterDisplayArea.value.appendChild(placeholder);
        }
    }
};

const updateAttachmentVisibility = (letterInstance: LetterInstance) => {
    if (letterInstance.eyes) {
        if (showEyes.value) {
            letterInstance.eyes.show();
        } else {
            letterInstance.eyes.hide();
        }
    }
    if (letterInstance.mouth) {
        if (showMouth.value) {
            letterInstance.mouth.show();
        } else {
            letterInstance.mouth.hide();
        }
    }
    if (letterInstance.arms) {
        if (showArms.value) {
            letterInstance.arms.show();
        } else {
            letterInstance.arms.hide();
        }
    }
};

const blinkAllLetters = () => {
    letterInstances.value.forEach((instance) => {
        if (instance.eyes) {
            instance.eyes.blink();
        }
    });
};

const toggleEyeTracking = () => {
    eyeTracking.value = !eyeTracking.value;
};

const animateMouth = () => {
    letterInstances.value.forEach((instance) => {
        if (instance.mouth) {
            instance.mouth.animateSpeak();
        }
    });
};

const waveArms = () => {
    letterInstances.value.forEach((instance) => {
        if (instance.arms) {
            instance.arms.wave();
        }
    });
};

const visualizeAttachmentPoints = (
    svgElement: SVGElement,
    attachmentCoords: any,
) => {
    // Remove existing visualization
    svgElement
        .querySelectorAll(".attachment-point, .attachment-label")
        .forEach((el) => el.remove());

    if (!showAttachments.value) return;

    // Add visualization for each attachment point
    Object.entries(attachmentCoords).forEach(([name, coord]: [string, any]) => {
        if (
            coord &&
            typeof coord === "object" &&
            "x" in coord &&
            "y" in coord
        ) {
            // Create red circle for attachment point
            const circle = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "circle",
            );
            circle.setAttribute("cx", coord.x.toString());
            circle.setAttribute("cy", coord.y.toString());
            circle.setAttribute("r", "2");
            circle.setAttribute("class", "attachment-point");
            circle.setAttribute("fill", "red");
            circle.setAttribute("stroke", "darkred");
            circle.setAttribute("stroke-width", "0.5");

            // Create label
            const label = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text",
            );
            label.setAttribute("x", (coord.x + 3).toString());
            label.setAttribute("y", (coord.y - 3).toString());
            label.setAttribute("class", "attachment-label");
            label.setAttribute("font-size", "8");
            label.setAttribute("font-family", "sans-serif");
            label.setAttribute("fill", "black");
            label.textContent = name;

            svgElement.appendChild(circle);
            svgElement.appendChild(label);
        }
    });
};

const visualizeLowercaseLine = (svgElement: SVGElement) => {
    // Remove existing lowercase line from SVG
    const existing = svgElement.querySelector(".lowercase-line-debug");
    if (existing) existing.remove();

    if (!showLowercaseLine.value) return;

    // Get the SVG's viewBox
    const viewBox = svgElement.getAttribute("viewBox");
    if (!viewBox) return;

    const [vbX, vbY, vbWidth, vbHeight] = viewBox.split(" ").map(Number);

    // Calculate lowercase line position (VIEWBOX_HEIGHT - EFFECTIVE_LOWERCASE_HEIGHT)
    const VIEWBOX_HEIGHT = 100;
    const EFFECTIVE_LOWERCASE_HEIGHT = 65;
    const lowercaseLineY = VIEWBOX_HEIGHT - EFFECTIVE_LOWERCASE_HEIGHT;

    // Create SVG line for lowercase line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(vbX));
    line.setAttribute("y1", String(lowercaseLineY));
    line.setAttribute("x2", String(vbX + vbWidth));
    line.setAttribute("y2", String(lowercaseLineY));
    line.setAttribute("stroke", "blue");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-dasharray", "4");
    line.setAttribute("class", "lowercase-line-debug");
    line.setAttribute("pointer-events", "none");

    svgElement.appendChild(line);
};

const visualizeBoundingBox = (
    wrapper: HTMLElement,
    letterInstance: LetterInstance,
) => {
    const svgElement = letterInstance.svgElement;

    // Remove existing bounding box from SVG
    const existing = svgElement.querySelector(".bounding-box-debug");
    if (existing) existing.remove();

    if (!showBoundingBox.value) return;

    // Get the SVG's viewBox to draw the bounding box in SVG coordinates
    const viewBox = svgElement.getAttribute("viewBox");
    if (!viewBox) return;

    const [vbX, vbY, vbWidth, vbHeight] = viewBox.split(" ").map(Number);

    // Create SVG rectangle for bounding box (covering entire viewBox)
    const bbox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bbox.setAttribute("x", String(vbX));
    bbox.setAttribute("y", String(vbY));
    bbox.setAttribute("width", String(vbWidth));
    bbox.setAttribute("height", String(vbHeight));
    bbox.setAttribute("fill", "none");
    bbox.setAttribute("stroke", "lime");
    bbox.setAttribute("stroke-width", "2");
    bbox.setAttribute("class", "bounding-box-debug");
    bbox.setAttribute("pointer-events", "none");

    svgElement.appendChild(bbox);
};

// Watchers
watch(
    [
        textInput,
        fillColor,
        strokeColor,
        lineWidth,
        strokeWidth,
        letterSize,
        eyeSize,
        mouthOpenness,
        mouthMood,
        armLength,
        showBaseline,
        showLowercaseLine,
    ],
    () => {
        nextTick(() => {
            renderLetters();
        });
    },
    { deep: true },
);

watch(
    [showEyes, showMouth, showArms],
    () => {
        letterInstances.value.forEach(updateAttachmentVisibility);
    },
    { deep: true },
);

// Eye controls watchers
watch([eyeAngle, eyeDistance, eyeSize], () => {
    letterInstances.value.forEach((instance) => {
        if (instance.eyes && !instance.eyes.isTracking()) {
            // Convert angle and distance to x,y coordinates
            const angle = (eyeAngle.value * Math.PI) / 180; // Convert to radians
            const distance = eyeDistance.value / 100; // 0-1 range
            const maxDistance = 3; // Maximum pupil offset

            const x = Math.cos(angle) * distance * maxDistance;
            const y = Math.sin(angle) * distance * maxDistance;

            instance.eyes.lookAt({ x, y }, { duration: 200 });
        }
    });
});

watch(eyeTracking, (enabled) => {
    letterInstances.value.forEach((instance) => {
        if (instance.eyes) {
            if (enabled) {
                instance.eyes.startTracking({
                    intensity: eyeDistance.value / 100,
                });
            } else {
                instance.eyes.stopTracking();
            }
        }
    });
});

// Arm controls watchers
watch([leftArmAngle, rightArmAngle], () => {
    letterInstances.value.forEach((instance) => {
        if (instance.arms) {
            instance.arms.left.rotateTo(leftArmAngle.value, { duration: 200 });
            instance.arms.right.rotateTo(rightArmAngle.value, {
                duration: 200,
            });
        }
    });
});

// Attachment points visualization watcher
watch(showAttachments, () => {
    letterInstances.value.forEach((instance) => {
        visualizeAttachmentPoints(
            instance.svgElement,
            instance.attachmentCoords,
        );
    });
});

// Bounding box visualization watcher
watch(showBoundingBox, () => {
    const wrappers =
        letterDisplayArea.value?.querySelectorAll(".letter-wrapper");
    wrappers?.forEach((wrapper, index) => {
        const instance = letterInstances.value[index];
        if (instance) {
            visualizeBoundingBox(wrapper as HTMLElement, instance);
        }
    });
});

// Lifecycle
onMounted(() => {
    renderLetters();
});
</script>

<style scoped>
.letter-debug-container {
    display: flex;
    gap: 30px;
    padding: 20px;
    font-family: sans-serif;
}

.controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid #eee;
    padding: 12px;
    border-radius: 5px;
    height: fit-content;
    min-width: 280px;
    max-width: 340px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.controls label,
.controls .checkbox-label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.9em;
}

.controls .checkbox-label {
    flex-direction: row;
    gap: 8px;
    align-items: center;
}

.controls input[type="text"],
.controls input[type="number"],
.controls input[type="color"],
.controls input[type="range"] {
    padding: 5px;
    border: 1px solid #ccc;
    border-radius: 3px;
    box-sizing: border-box;
    width: 100%;
    font-size: 0.9em;
}

.controls input[type="color"] {
    height: 30px;
    padding: 2px;
}

.controls .range-value {
    font-size: 0.8em;
    color: #555;
    text-align: right;
}

.control-panel {
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-bottom: 8px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.panel-header {
    background-color: #f5f5f5;
    padding: 6px 10px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background-color 0.2s ease;
}

.panel-header h4 {
    margin: 0;
    font-size: 0.95em;
    color: #444;
    display: flex;
    align-items: center;
    gap: 4px;
}

.panel-content {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid #eee;
    background-color: #fcfcfc;
}

.panel-content button {
    margin-top: 4px;
    padding: 5px 10px;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 0.9em;
}

.panel-content button:hover {
    background-color: #e8e8e8;
}

.divider {
    height: 1px;
    background-color: #ddd;
    margin: 10px 0;
}

.toggle-icon {
    font-size: 10px;
    transition: transform 0.2s ease;
    color: #666;
}

.panel-header.collapsed .toggle-icon {
    transform: rotate(-90deg);
}

.panel-header:hover {
    background-color: #e9e9e9;
}

.controls-row {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
    align-items: center;
}

.control-item {
    flex: 1;
    min-width: 0;
}

.letter-display-area {
    border: 1px dashed dodgerblue;
    padding: 10px;
    min-height: 100px;
    flex-grow: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-start;
}

.letter-wrapper {
    width: var(--letter-size);
    height: var(--letter-size);
    display: inline-block;
    position: relative;
}

.letter-wrapper svg {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 80px;
    min-height: 80px;
    border: 1px solid blue; /* Debug border */
}

.placeholder {
    width: var(--letter-size);
    height: var(--letter-size);
    border: 1px dashed red;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--letter-size) * 0.4);
    color: red;
    background-color: #fee;
    box-sizing: border-box;
}
</style>
