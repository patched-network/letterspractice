<template>
    <v-container fluid class="arms-debug">
        <v-row>
            <!-- Letter display -->
            <v-col cols="12" md="8">
                <v-card>
                    <v-card-title>Arms Position Debugger</v-card-title>
                    <v-card-text>
                        <div class="letter-display">
                            <div class="letter-slot">
                                <div class="slot-label">{{ charA }}</div>
                                <div ref="containerA" class="letter-container"></div>
                            </div>
                            <div class="letter-slot">
                                <div class="slot-label">{{ charB }}</div>
                                <div ref="containerB" class="letter-container"></div>
                            </div>
                        </div>
                        <div class="coord-note">
                            Coordinates are in SVG viewBox units (Y axis: 0=top, ~130=bottom).
                            Typical shoulder Y ≈ 85–95.
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <!-- Controls -->
            <v-col cols="12" md="4">
                <!-- Letter settings -->
                <v-card>
                    <v-card-title>Letters</v-card-title>
                    <v-card-text>
                        <v-row dense>
                            <v-col cols="6">
                                <v-text-field
                                    v-model="charA"
                                    label="Left Letter"
                                    maxlength="1"
                                    @update:model-value="recreateLetters"
                                />
                            </v-col>
                            <v-col cols="6">
                                <v-text-field
                                    v-model="charB"
                                    label="Right Letter"
                                    maxlength="1"
                                    @update:model-value="recreateLetters"
                                />
                            </v-col>
                        </v-row>
                        <v-slider
                            v-model="armLength"
                            label="Arm Length"
                            :min="5"
                            :max="40"
                            :step="1"
                            thumb-label
                            @update:model-value="recreateLetters"
                        />
                    </v-card-text>
                </v-card>

                <!-- Hold Hands -->
                <v-card class="mt-4">
                    <v-card-title>Hold Hands</v-card-title>
                    <v-card-text>
                        <v-btn
                            color="primary"
                            block
                            class="mb-2"
                            :disabled="!instanceA || !instanceB"
                            @click="holdHands"
                        >
                            Clasp Inner Hands
                        </v-btn>
                        <v-btn
                            color="secondary"
                            block
                            :disabled="!instanceA || !instanceB"
                            @click="relaxAll"
                        >
                            Relax All
                        </v-btn>

                        <v-divider class="my-3" />
                        <div class="text-caption coord-readout">
                            <div><strong>Clasp point (screen px):</strong></div>
                            <div v-if="claspScreenPoint">
                                x={{ claspScreenPoint.x.toFixed(1) }}, y={{ claspScreenPoint.y.toFixed(1) }}
                            </div>
                            <div v-else>—</div>
                        </div>
                    </v-card-text>
                </v-card>

                <!-- Left letter arm state -->
                <v-card class="mt-4">
                    <v-card-title>{{ charA }} — Right Arm (inner)</v-card-title>
                    <v-card-text>
                        <div class="text-caption coord-readout">
                            <div>Shoulder: ({{ aRightShoulder.x.toFixed(1) }}, {{ aRightShoulder.y.toFixed(1) }})</div>
                            <div>Hand: ({{ aRightHand.x.toFixed(1) }}, {{ aRightHand.y.toFixed(1) }})</div>
                            <div>Angle: {{ aRightAngle.toFixed(1) }}° &nbsp; Length: {{ aRightLength.toFixed(1) }}</div>
                        </div>

                        <v-slider v-model="aRightTargetX" label="Target X" :min="-20" :max="150" :step="1" thumb-label @update:model-value="setARightHand" />
                        <v-slider v-model="aRightTargetY" label="Target Y" :min="0" :max="140" :step="1" thumb-label @update:model-value="setARightHand" />
                    </v-card-text>
                </v-card>

                <!-- Right letter arm state -->
                <v-card class="mt-4">
                    <v-card-title>{{ charB }} — Left Arm (inner)</v-card-title>
                    <v-card-text>
                        <div class="text-caption coord-readout">
                            <div>Shoulder: ({{ bLeftShoulder.x.toFixed(1) }}, {{ bLeftShoulder.y.toFixed(1) }})</div>
                            <div>Hand: ({{ bLeftHand.x.toFixed(1) }}, {{ bLeftHand.y.toFixed(1) }})</div>
                            <div>Angle: {{ bLeftAngle.toFixed(1) }}° &nbsp; Length: {{ bLeftLength.toFixed(1) }}</div>
                        </div>

                        <v-slider v-model="bLeftTargetX" label="Target X" :min="-20" :max="150" :step="1" thumb-label @update:model-value="setBLeftHand" />
                        <v-slider v-model="bLeftTargetY" label="Target Y" :min="0" :max="140" :step="1" thumb-label @update:model-value="setBLeftHand" />
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive } from "vue";
import { createLetter, type LetterInstance } from "@/letterpeople";

// ── Refs & state ─────────────────────────────────────────────────────────────

const containerA = ref<HTMLDivElement>();
const containerB = ref<HTMLDivElement>();

const charA = ref("s");
const charB = ref("h");
const armLength = ref(22);

const instanceA = ref<LetterInstance | null>(null);
const instanceB = ref<LetterInstance | null>(null);

// Arm readout state (SVG viewBox coordinates)
const aRightShoulder = reactive({ x: 0, y: 0 });
const aRightHand     = reactive({ x: 0, y: 0 });
const aRightAngle    = ref(0);
const aRightLength   = ref(0);

const bLeftShoulder  = reactive({ x: 0, y: 0 });
const bLeftHand      = reactive({ x: 0, y: 0 });
const bLeftAngle     = ref(0);
const bLeftLength    = ref(0);

// Manual target sliders (SVG viewBox coordinates)
const aRightTargetX = ref(50);
const aRightTargetY = ref(100);
const bLeftTargetX  = ref(10);
const bLeftTargetY  = ref(100);

// Clasp diagnostic
const claspScreenPoint = ref<{ x: number; y: number } | null>(null);

let stateInterval: number;

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateReadouts() {
    if (instanceA.value) {
        const s = instanceA.value.arms.right.getShoulderPosition();
        const h = instanceA.value.arms.right.getHandPosition();
        aRightShoulder.x = s.x; aRightShoulder.y = s.y;
        aRightHand.x = h.x;     aRightHand.y = h.y;
        aRightAngle.value  = instanceA.value.arms.right.getCurrentAngle();
        aRightLength.value = instanceA.value.arms.right.getCurrentLength();
    }
    if (instanceB.value) {
        const s = instanceB.value.arms.left.getShoulderPosition();
        const h = instanceB.value.arms.left.getHandPosition();
        bLeftShoulder.x = s.x; bLeftShoulder.y = s.y;
        bLeftHand.x = h.x;     bLeftHand.y = h.y;
        bLeftAngle.value  = instanceB.value.arms.left.getCurrentAngle();
        bLeftLength.value = instanceB.value.arms.left.getCurrentLength();
    }
}

/**
 * Convert a point in a letter's SVG viewBox space to screen coordinates.
 * Uses the same scale-factor approach as eye.ts startTracking().
 */
function svgLocalToScreen(letter: LetterInstance, pt: { x: number; y: number }): { x: number; y: number } {
    const svg = letter.svgElement as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const vbWidth = svg.viewBox.baseVal.width || 1;
    const scale = rect.width / vbWidth;
    return {
        x: rect.left + pt.x * scale,
        y: rect.top  + pt.y * scale,
    };
}

/**
 * Convert a screen-space point back to a letter's SVG viewBox coordinates.
 */
function screenToSvgLocal(letter: LetterInstance, pt: { x: number; y: number }): { x: number; y: number } {
    const svg = letter.svgElement as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const vbWidth = svg.viewBox.baseVal.width || 1;
    const scale = rect.width / vbWidth;
    return {
        x: (pt.x - rect.left) / scale,
        y: (pt.y - rect.top)  / scale,
    };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function holdHands() {
    if (!instanceA.value || !instanceB.value) return;

    // Inner arms: A's right arm, B's left arm
    const aRightShoulderScreen = svgLocalToScreen(
        instanceA.value,
        instanceA.value.arms.right.getShoulderPosition()
    );
    const bLeftShoulderScreen = svgLocalToScreen(
        instanceB.value,
        instanceB.value.arms.left.getShoulderPosition()
    );

    // Natural clasp point: midpoint horizontally, lower of the two shoulders vertically
    // (so neither letter is forced to reach "up" more than necessary).
    const claspX = (aRightShoulderScreen.x + bLeftShoulderScreen.x) / 2;
    const claspY = Math.max(aRightShoulderScreen.y, bLeftShoulderScreen.y) + armLength.value * 0.6;

    claspScreenPoint.value = { x: claspX, y: claspY };

    // Convert clasp point back to each letter's SVG-local space
    const claspForA = screenToSvgLocal(instanceA.value, { x: claspX, y: claspY });
    const claspForB = screenToSvgLocal(instanceB.value, { x: claspX, y: claspY });

    const anim = { duration: 400, ease: "easeOutQuad" };
    await Promise.all([
        instanceA.value.arms.right.setHandPosition(claspForA, anim),
        instanceB.value.arms.left.setHandPosition(claspForB, anim),
    ]);

    updateReadouts();
}

async function relaxAll() {
    const anim = { duration: 300 };
    const ops: Promise<void>[] = [];
    if (instanceA.value) ops.push(instanceA.value.arms.relax(anim));
    if (instanceB.value) ops.push(instanceB.value.arms.relax(anim));
    await Promise.all(ops);
    claspScreenPoint.value = null;
    updateReadouts();
}

async function setARightHand() {
    if (!instanceA.value) return;
    await instanceA.value.arms.right.setHandPosition(
        { x: aRightTargetX.value, y: aRightTargetY.value },
    );
    updateReadouts();
}

async function setBLeftHand() {
    if (!instanceB.value) return;
    await instanceB.value.arms.left.setHandPosition(
        { x: bLeftTargetX.value, y: bLeftTargetY.value },
    );
    updateReadouts();
}

// ── Letter lifecycle ──────────────────────────────────────────────────────────

function destroyLetter(which: "A" | "B") {
    if (which === "A" && instanceA.value) {
        instanceA.value.destroy();
        instanceA.value = null;
    }
    if (which === "B" && instanceB.value) {
        instanceB.value.destroy();
        instanceB.value = null;
    }
}

function createLetterIn(
    container: HTMLDivElement,
    char: string,
): LetterInstance | null {
    return createLetter(char, container, {
        showArms: true,
        showEyes: true,
        armLength: armLength.value,
        armThickness: 3,
        color: "#4a90d9",
        borderColor: "#1a5fa8",
        borderWidth: 3,
        lineWidth: 18,
        eyeSize: 5,
    });
}

function recreateLetters() {
    destroyLetter("A");
    destroyLetter("B");
    claspScreenPoint.value = null;

    if (containerA.value) {
        containerA.value.innerHTML = "";
        const inst = createLetterIn(containerA.value, charA.value || "s");
        if (inst) {
            instanceA.value = inst;
            inst.arms.show({ duration: 0 });
            const s = inst.arms.right.getShoulderPosition();
            aRightTargetX.value = Math.round(s.x + 20);
            aRightTargetY.value = Math.round(s.y + 15);
        }
    }

    if (containerB.value) {
        containerB.value.innerHTML = "";
        const inst = createLetterIn(containerB.value, charB.value || "h");
        if (inst) {
            instanceB.value = inst;
            inst.arms.show({ duration: 0 });
            const s = inst.arms.left.getShoulderPosition();
            bLeftTargetX.value = Math.round(s.x - 20);
            bLeftTargetY.value = Math.round(s.y + 15);
        }
    }

    updateReadouts();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
    recreateLetters();
    stateInterval = window.setInterval(updateReadouts, 100);
});

onUnmounted(() => {
    clearInterval(stateInterval);
    destroyLetter("A");
    destroyLetter("B");
});
</script>

<style scoped>
.arms-debug {
    padding: 20px;
}

.letter-display {
    display: flex;
    gap: 32px;
    align-items: flex-end;
    padding: 24px;
    background: #f8f9fa;
    border-radius: 8px;
    min-height: 200px;
}

.letter-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.slot-label {
    font-size: 0.75rem;
    color: #666;
    font-family: monospace;
}

.letter-container {
    height: 140px;
    display: flex;
    align-items: flex-end;
    overflow: visible;
}

.letter-container :deep(svg) {
    height: 140px;
    width: auto;
    overflow: visible;
}

.coord-note {
    margin-top: 12px;
    font-size: 0.75rem;
    color: #888;
    font-family: monospace;
}

.coord-readout {
    font-family: monospace;
    line-height: 1.8;
}
</style>
