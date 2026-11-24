<template>
    <v-container fluid class="floss-debug">
        <v-row>
            <!-- Letter display -->
            <v-col cols="12" md="7">
                <v-card>
                    <v-card-title
                        >💃 Floss Debug — Arm Z-Layer & Body Skew</v-card-title
                    >
                    <v-card-text>
                        <div class="letter-display">
                            <div class="letter-slot">
                                <div class="slot-label">{{ selectedChar }}</div>
                                <div
                                    ref="letterContainer"
                                    class="letter-container"
                                ></div>
                            </div>
                        </div>

                        <!-- Status readout -->
                        <div class="status-bar mt-3">
                            <span
                                class="status-chip"
                                :class="{ active: leftArmBehind }"
                            >
                                L-arm: {{ leftArmBehind ? "BEHIND" : "front" }}
                            </span>
                            <span
                                class="status-chip"
                                :class="{ active: rightArmBehind }"
                            >
                                R-arm: {{ rightArmBehind ? "BEHIND" : "front" }}
                            </span>
                            <span class="status-chip skew-chip">
                                skewX: {{ currentSkew.toFixed(1) }}°
                            </span>
                            <span
                                v-if="flossLoopActive"
                                class="status-chip active"
                            >
                                🕺 flossing
                            </span>
                            <span v-if="showLegs" class="status-chip active">
                                🦵 legs
                            </span>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <!-- Controls -->
            <v-col cols="12" md="5">
                <!-- Letter picker -->
                <v-card>
                    <v-card-text class="py-2">
                        <v-row dense>
                            <v-col cols="6">
                                <v-text-field
                                    v-model="selectedChar"
                                    label="Character"
                                    maxlength="1"
                                    density="compact"
                                    hide-details
                                    @update:model-value="recreateLetter"
                                />
                            </v-col>
                            <v-col cols="6">
                                <v-text-field
                                    v-model.number="armLength"
                                    label="Arm Length"
                                    type="number"
                                    :min="8"
                                    :max="35"
                                    density="compact"
                                    hide-details
                                    @update:model-value="recreateLetter"
                                />
                            </v-col>
                        </v-row>
                        <v-switch
                            v-model="showLegs"
                            label="Show Legs"
                            density="compact"
                            hide-details
                            @update:model-value="toggleLegs"
                        />
                        <v-slider
                            v-model="legFloorY"
                            label="Floor Y"
                            :min="100"
                            :max="170"
                            :step="1"
                            density="compact"
                            hide-details
                            thumb-label
                            :disabled="!showLegs"
                            @update:model-value="onLegFloorYChange"
                        />
                        <v-slider
                            v-model="legKneeBend"
                            label="Knee Bend"
                            :min="-20"
                            :max="20"
                            :step="1"
                            density="compact"
                            hide-details
                            thumb-label
                            :disabled="!showLegs"
                            @update:model-value="onLegKneeBendChange"
                        />
                    </v-card-text>
                </v-card>

                <!-- Arm Z-Layer controls -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Arm Z-Layer</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-row dense>
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    :color="
                                        leftArmBehind ? 'warning' : 'primary'
                                    "
                                    :disabled="!instance"
                                    @click="toggleLeftArmLayer"
                                >
                                    L-Arm
                                    {{ leftArmBehind ? "→ Front" : "→ Back" }}
                                </v-btn>
                            </v-col>
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    :color="
                                        rightArmBehind ? 'warning' : 'primary'
                                    "
                                    :disabled="!instance"
                                    @click="toggleRightArmLayer"
                                >
                                    R-Arm
                                    {{ rightArmBehind ? "→ Front" : "→ Back" }}
                                </v-btn>
                            </v-col>
                        </v-row>

                        <v-row dense class="mt-1">
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    variant="outlined"
                                    :disabled="!instance"
                                    @click="swapArmLayers"
                                >
                                    Swap Both
                                </v-btn>
                            </v-col>
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    variant="outlined"
                                    :disabled="!instance"
                                    @click="bothArmsFront"
                                >
                                    Both Front
                                </v-btn>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>

                <!-- Body Skew controls -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Body Skew</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-slider
                            v-model="skewTarget"
                            label="Skew °"
                            :min="-20"
                            :max="20"
                            :step="0.5"
                            density="compact"
                            hide-details
                            thumb-label
                            @update:model-value="applySkew"
                        />

                        <v-row dense>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="skewTo(-8)"
                                >
                                    ← −8°
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="skewTo(0)"
                                >
                                    Reset
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="skewTo(8)"
                                >
                                    +8° →
                                </v-btn>
                            </v-col>
                        </v-row>

                        <v-slider
                            v-model="skewDuration"
                            label="Duration (ms)"
                            :min="0"
                            :max="1000"
                            :step="50"
                            density="compact"
                            hide-details
                            thumb-label
                            class="mt-1"
                        />
                    </v-card-text>
                </v-card>

                <!-- Arm Position controls -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Arm Position</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-slider
                            v-model="leftArmAngle"
                            label="L-Arm °"
                            :min="0"
                            :max="360"
                            :step="5"
                            density="compact"
                            hide-details
                            thumb-label
                            @update:model-value="applyLeftArmAngle"
                        />
                        <v-slider
                            v-model="rightArmAngle"
                            label="R-Arm °"
                            :min="0"
                            :max="360"
                            :step="5"
                            density="compact"
                            hide-details
                            thumb-label
                            @update:model-value="applyRightArmAngle"
                        />
                        <v-btn
                            block
                            size="small"
                            variant="outlined"
                            :disabled="!instance"
                            @click="relaxArms"
                        >
                            Relax Arms
                        </v-btn>
                    </v-card-text>
                </v-card>

                <!-- Floss loop -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >🕺 Floss Loop</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-slider
                            v-model="flossBeatMs"
                            label="Beat (ms)"
                            :min="150"
                            :max="1200"
                            :step="50"
                            density="compact"
                            hide-details
                            thumb-label
                        />
                        <v-slider
                            v-model="flossAmplitude"
                            label="Hip amp (°)"
                            :min="1"
                            :max="18"
                            :step="0.5"
                            density="compact"
                            hide-details
                            thumb-label
                        />
                        <v-row dense class="mt-1">
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    color="success"
                                    :disabled="!instance || flossLoopActive"
                                    @click="startFlossLoop"
                                >
                                    ▶ Loop
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance || flossLoopActive"
                                    @click="flossStep"
                                >
                                    ⏭ Step
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    color="error"
                                    :disabled="!flossLoopActive"
                                    @click="stopFlossLoop"
                                >
                                    ■ Stop
                                </v-btn>
                            </v-col>
                        </v-row>
                        <div class="beat-readout mt-1">
                            Beat {{ flossBeat }}/5 —
                            {{ FLOSS_BEAT_LABELS[flossBeat % 6] }}
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { createLetter, type LetterInstance } from "@/letterpeople";
// The beat itself lives in the library (letterpeople/animations/floss.ts) so the
// tuning done in this view is the same dance the app performs. This view keeps
// the loop/step/parameter UI; it no longer owns the choreography.
import { flossOneBeat, FLOSS_BEAT_LABELS } from "@/letterpeople/animations";

// ── Refs ─────────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement>();
const instance = ref<LetterInstance | null>(null);

const selectedChar = ref("F");
const armLength = ref(20);

// Arm z-layer state (read from controller, kept in sync for UI)
const leftArmBehind = ref(false);
const rightArmBehind = ref(false);
const showLegs = ref(false);
const legFloorY = ref(135);
const legKneeBend = ref(8);

// Skew state
const skewTarget = ref(0);
const skewDuration = ref(300);
const currentSkew = ref(0);

// Arm angles
const leftArmAngle = ref(150);
const rightArmAngle = ref(30);

// Floss loop
const flossBeatMs = ref(400);
const flossAmplitude = ref(7);
const flossLoopActive = ref(false);
const flossBeat = ref(0); // current beat index (0-5), exposed for UI
let flossAborted = false;
let flossPromise: Promise<void> | null = null;

let skewPollInterval: number | undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function syncState() {
    if (!instance.value) return;
    leftArmBehind.value = instance.value.arms.left.isBehindBody();
    rightArmBehind.value = instance.value.arms.right.isBehindBody();
    currentSkew.value = instance.value.body.getCurrentSkew();
}

// ── Letter lifecycle ─────────────────────────────────────────────────────────

function destroyLetter() {
    stopFlossLoop();
    if (instance.value) {
        instance.value.legs.stopSync();
        instance.value.destroy();
        instance.value = null;
    }
}

function recreateLetter() {
    destroyLetter();
    if (!letterContainer.value) return;
    letterContainer.value.innerHTML = "";

    const char = selectedChar.value || "F";
    const inst = createLetter(char, letterContainer.value, {
        showArms: true,
        showEyes: true,
        showMouth: true,
        showEyebrows: true,
        eyebrowsWithEyes: true,
        armLength: armLength.value,
        armThickness: 3.5,
        color: "#E57373",
        borderColor: "#C62828",
        borderWidth: 3,
        lineWidth: 20,
        eyeSize: 6,
        legFloorY: legFloorY.value,
        legKneeBend: legKneeBend.value,
    });

    if (inst) {
        instance.value = inst;
        inst.arms.show({ duration: 0 });
        inst.eyes.show({ duration: 0 });
        inst.mouth.show({ duration: 0 });
        if (showLegs.value) {
            inst.legs.show({ duration: 0 });
            inst.legs.startSync();
        }
    }

    leftArmBehind.value = false;
    rightArmBehind.value = false;
    skewTarget.value = 0;
    currentSkew.value = 0;
    leftArmAngle.value = 150;
    rightArmAngle.value = 30;
}

// ── Arm z-layer actions ──────────────────────────────────────────────────────

function toggleLeftArmLayer() {
    if (!instance.value) return;
    if (instance.value.arms.left.isBehindBody()) {
        instance.value.arms.left.bringToFront();
    } else {
        instance.value.arms.left.sendToBack();
    }
    syncState();
}

function toggleRightArmLayer() {
    if (!instance.value) return;
    if (instance.value.arms.right.isBehindBody()) {
        instance.value.arms.right.bringToFront();
    } else {
        instance.value.arms.right.sendToBack();
    }
    syncState();
}

function onLegFloorYChange(val: number) {
    if (!instance.value) return;
    instance.value.legs.setFloorY(val);
}

function onLegKneeBendChange(val: number) {
    if (!instance.value) return;
    instance.value.legs.setKneeBend(val);
}

function toggleLegs(val: boolean | null) {
    if (!instance.value) return;
    if (val) {
        instance.value.legs.show({ duration: 200 });
        instance.value.legs.startSync();
    } else {
        instance.value.legs.stopSync();
        instance.value.legs.hide({ duration: 200 });
    }
}

function swapArmLayers() {
    if (!instance.value) return;
    const leftWasBehind = instance.value.arms.left.isBehindBody();
    const rightWasBehind = instance.value.arms.right.isBehindBody();

    if (leftWasBehind) {
        instance.value.arms.left.bringToFront();
    } else {
        instance.value.arms.left.sendToBack();
    }
    if (rightWasBehind) {
        instance.value.arms.right.bringToFront();
    } else {
        instance.value.arms.right.sendToBack();
    }
    syncState();
}

function bothArmsFront() {
    if (!instance.value) return;
    instance.value.arms.left.bringToFront();
    instance.value.arms.right.bringToFront();
    syncState();
}

// ── Skew actions ─────────────────────────────────────────────────────────────

async function applySkew() {
    if (!instance.value) return;
    const dur = skewDuration.value;
    if (dur > 0) {
        await instance.value.body.skewTo(skewTarget.value, { duration: dur });
    } else {
        await instance.value.body.skewTo(skewTarget.value);
    }
    syncState();
}

async function skewTo(degrees: number) {
    skewTarget.value = degrees;
    await applySkew();
}

// ── Arm angle actions ────────────────────────────────────────────────────────

async function applyLeftArmAngle() {
    if (!instance.value) return;
    await instance.value.arms.left.rotateTo(leftArmAngle.value, {
        duration: 200,
    });
}

async function applyRightArmAngle() {
    if (!instance.value) return;
    await instance.value.arms.right.rotateTo(rightArmAngle.value, {
        duration: 200,
    });
}

async function relaxArms() {
    if (!instance.value) return;
    await instance.value.arms.relax({ duration: 300 });
    leftArmAngle.value = 150;
    rightArmAngle.value = 30;
}

// ── Floss loop ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const id = setTimeout(() => {
            if (!flossAborted) resolve();
        }, ms);
        if (flossAborted) {
            clearTimeout(id);
            resolve();
        }
    });
}

/**
 * The floss dance is a 6-beat repeating loop.
 *
 * Every beat: arms swing one direction, hips swing the opposite.
 * Arms alternate: R→L, L→R, R→L, L→R, R→L, L→R.
 * Hips are opposite: L→R, R→L, L→R, R→L, L→R, R→L.
 *
 * Z-layer (which hand goes behind) follows a 3-beat sub-cycle per hand:
 *
 * Beat 0: Arms R→L, R-hand behind,      hips L→R
 * Beat 1: Arms L→R, R-hand returns front, hips R→L
 * Beat 2: Arms R→L, both in front,       hips L→R
 * Beat 3: Arms L→R, L-hand behind,       hips R→L
 * Beat 4: Arms R→L, L-hand returns front, hips L→R
 * Beat 5: Arms L→R, both in front,       hips R→L
 *
 * Then back to beat 0 (arms at right, ready to swing left).
 */

async function flossLoop() {
    if (!instance.value) return;
    const inst = instance.value;
    flossBeat.value = 0;

    while (!flossAborted) {
        await flossOneBeat(inst, flossBeat.value, {
            beatMs: flossBeatMs.value,
            amplitude: flossAmplitude.value,
            isAborted: () => flossAborted,
        });
        if (flossAborted) break;
        flossBeat.value = (flossBeat.value + 1) % 6;
    }
}

function startFlossLoop() {
    if (!instance.value || flossLoopActive.value) return;
    flossAborted = false;
    flossLoopActive.value = true;
    flossPromise = flossLoop().finally(() => {
        flossLoopActive.value = false;
        flossPromise = null;
    });
}

async function flossStep() {
    if (!instance.value || flossLoopActive.value) return;
    const inst = instance.value;

    await flossOneBeat(inst, flossBeat.value, {
        beatMs: flossBeatMs.value,
        amplitude: flossAmplitude.value,
        isAborted: () => flossAborted,
    });
    flossBeat.value = (flossBeat.value + 1) % 6;
    syncState();
}

function stopFlossLoop() {
    flossAborted = true;
    flossLoopActive.value = false;

    // Reset to neutral
    if (instance.value) {
        instance.value.arms.left.bringToFront();
        instance.value.arms.right.bringToFront();
        instance.value.body.skewTo(0, { duration: 200 });
        instance.value.arms.relax({ duration: 300 });
    }

    syncState();
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
    recreateLetter();
    skewPollInterval = window.setInterval(syncState, 60);
});

onUnmounted(() => {
    if (skewPollInterval !== undefined) clearInterval(skewPollInterval);
    destroyLetter();
});
</script>

<style scoped>
.floss-debug {
    padding: 16px;
}

.letter-display {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: 32px;
    background: #fafafa;
    border-radius: 12px;
    min-height: 280px;
}

.letter-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.slot-label {
    font-size: 0.8rem;
    color: #666;
    font-family: monospace;
    font-weight: 600;
}

.letter-container {
    height: 200px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: visible;
}

.letter-container :deep(svg) {
    height: 200px;
    width: auto;
    overflow: visible;
}

.status-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.status-chip {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-family: monospace;
    font-weight: 600;
    background: #e8e8e8;
    color: #666;
    transition:
        background 0.2s,
        color 0.2s;
}

.status-chip.active {
    background: #fff3e0;
    color: #e65100;
}

.status-chip.skew-chip {
    background: #e3f2fd;
    color: #1565c0;
}

.beat-readout {
    font-family: monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-align: center;
}
</style>
