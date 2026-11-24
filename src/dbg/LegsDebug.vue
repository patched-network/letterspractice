<template>
    <v-container fluid class="legs-debug">
        <v-row>
            <!-- Letter display -->
            <v-col cols="12" md="7">
                <v-card>
                    <v-card-title>🦵 Legs Debug — Floor, Sync & Skew</v-card-title>
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
                                :class="{ active: legsVisible }"
                            >
                                legs: {{ legsVisible ? "VISIBLE" : "hidden" }}
                            </span>
                            <span
                                class="status-chip"
                                :class="{ active: legsSyncing }"
                            >
                                sync: {{ legsSyncing ? "ON" : "off" }}
                            </span>
                            <span class="status-chip skew-chip">
                                skewX: {{ currentSkew.toFixed(1) }}°
                            </span>
                            <span class="status-chip">
                                floorY: {{ floorY }}
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
                    </v-card-text>
                </v-card>

                <!-- Legs controls -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Legs Controls</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-row dense>
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    :color="legsVisible ? 'error' : 'success'"
                                    :disabled="!instance"
                                    @click="toggleLegsVisibility"
                                >
                                    {{ legsVisible ? "Hide Legs" : "Show Legs" }}
                                </v-btn>
                            </v-col>
                            <v-col cols="6">
                                <v-btn
                                    block
                                    size="small"
                                    :color="legsSyncing ? 'warning' : 'info'"
                                    :disabled="!instance"
                                    @click="toggleLegsSync"
                                >
                                    Sync: {{ legsSyncing ? "Stop" : "Start" }}
                                </v-btn>
                            </v-col>
                        </v-row>

                        <v-slider
                            v-model="floorY"
                            label="Floor Y"
                            :min="100"
                            :max="170"
                            :step="1"
                            density="compact"
                            hide-details
                            thumb-label
                            class="mt-2"
                            @update:model-value="onFloorYChange"
                        />

                        <v-slider
                            v-model="kneeBend"
                            label="Knee Bend"
                            :min="-20"
                            :max="20"
                            :step="1"
                            density="compact"
                            hide-details
                            thumb-label
                            class="mt-1"
                            @update:model-value="recreateLetter"
                        />
                    </v-card-text>
                </v-card>

                <!-- Skew test -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Skew Test</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-slider
                            v-model="skewAngle"
                            label="Skew °"
                            :min="-20"
                            :max="20"
                            :step="0.5"
                            density="compact"
                            hide-details
                            thumb-label
                        />

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

                        <v-btn
                            block
                            size="small"
                            color="primary"
                            :disabled="!instance"
                            class="mt-2"
                            @click="applySkew"
                        >
                            Apply Skew
                        </v-btn>
                    </v-card-text>
                </v-card>

                <!-- Quick poses -->
                <v-card class="mt-1">
                    <v-card-title class="text-body-2 py-1 px-3"
                        >Quick Poses</v-card-title
                    >
                    <v-card-text class="py-1">
                        <v-row dense>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="quickSkew(-10)"
                                >
                                    ← −10°
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="quickSkew(0)"
                                >
                                    Reset
                                </v-btn>
                            </v-col>
                            <v-col cols="4">
                                <v-btn
                                    block
                                    size="small"
                                    :disabled="!instance"
                                    @click="quickSkew(10)"
                                >
                                    +10° →
                                </v-btn>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { createLetter, type LetterInstance } from "@/letterpeople";

// ── Refs ─────────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement>();
const instance = ref<LetterInstance | null>(null);

const selectedChar = ref("F");
const armLength = ref(20);

// Legs state
const legsVisible = ref(false);
const legsSyncing = ref(false);
const floorY = ref(135);
const kneeBend = ref(8);

// Skew state
const skewAngle = ref(0);
const skewDuration = ref(300);
const currentSkew = ref(0);

let skewPollInterval: number | undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function syncState() {
    if (!instance.value) return;
    legsVisible.value = instance.value.legs.isVisible();
    legsSyncing.value = instance.value.legs.isSyncing();
    currentSkew.value = instance.value.body.getCurrentSkew();
}

// ── Letter lifecycle ─────────────────────────────────────────────────────────

function destroyLetter() {
    if (instance.value) {
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
        showLegs: true,
        armLength: armLength.value,
        armThickness: 3.5,
        color: "#81C784",
        borderColor: "#2E7D32",
        borderWidth: 3,
        lineWidth: 20,
        eyeSize: 6,
        legKneeBend: kneeBend.value,
        legFloorY: floorY.value,
    });

    if (inst) {
        instance.value = inst;
        inst.arms.show({ duration: 0 });
        inst.eyes.show({ duration: 0 });
        inst.mouth.show({ duration: 0 });
        inst.legs.show({ duration: 0 });
        inst.legs.startSync();
    }

    skewAngle.value = 0;
    currentSkew.value = 0;
    syncState();
}

// ── Legs actions ─────────────────────────────────────────────────────────────

async function toggleLegsVisibility() {
    if (!instance.value) return;
    if (instance.value.legs.isVisible()) {
        await instance.value.legs.hide();
    } else {
        await instance.value.legs.show();
    }
    syncState();
}

function toggleLegsSync() {
    if (!instance.value) return;
    if (instance.value.legs.isSyncing()) {
        instance.value.legs.stopSync();
    } else {
        instance.value.legs.startSync();
    }
    syncState();
}

function onFloorYChange(newValue: number) {
    if (!instance.value) return;
    instance.value.legs.setFloorY(newValue);
}

// ── Skew actions ─────────────────────────────────────────────────────────────

async function applySkew() {
    if (!instance.value) return;
    const dur = skewDuration.value;
    if (dur > 0) {
        await instance.value.body.skewTo(skewAngle.value, { duration: dur });
    } else {
        await instance.value.body.skewTo(skewAngle.value);
    }
    syncState();
}

async function quickSkew(degrees: number) {
    if (!instance.value) return;
    skewAngle.value = degrees;
    await instance.value.body.skewTo(degrees, { duration: 400 });
    syncState();
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
    recreateLetter();
    skewPollInterval = window.setInterval(syncState, 50);
});

onUnmounted(() => {
    if (skewPollInterval !== undefined) clearInterval(skewPollInterval);
    destroyLetter();
});
</script>

<style scoped>
.legs-debug {
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
</style>
