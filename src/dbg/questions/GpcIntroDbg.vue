<!--
  GpcIntroDbg.vue - Debug view for GpcIntro question type with keyboard context

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Configuration, presets, response log
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout title="GPC Introduction" :initial-base-letters="[]">
        <!-- Configuration slot (left column) -->
        <template #config>
            <div class="gpc-config">
                <!-- GPC Configuration -->
                <div class="config-section">
                    <div class="config-label">GPC ID</div>
                    <v-text-field
                        v-model="gpcId"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="GPC-s-S"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Letter</div>
                    <v-text-field
                        v-model="letter"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="s"
                        maxlength="1"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Phoneme (ARPAbet)</div>
                    <v-text-field
                        v-model="phoneme"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="S"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Onset Words (comma-separated)
                    </div>
                    <v-text-field
                        v-model="onsetWords"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="sat,sun,sit"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Core Words (comma-separated, optional)
                    </div>
                    <v-text-field
                        v-model="coreWords"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="cat,bag"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Coda Words (comma-separated, optional)
                    </div>
                    <v-text-field
                        v-model="codaWords"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="bus,gas"
                    />
                    <v-btn
                        color="primary"
                        variant="elevated"
                        size="small"
                        class="mt-2"
                        block
                        @click="resetQuestion"
                    >
                        Apply & Reset
                    </v-btn>
                </div>

                <div class="config-section">
                    <div class="config-label">3D (spike)</div>
                    <v-switch
                        v-model="letters3d"
                        label="3D letter (sways on intro, still on keycap)"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                </div>

                <!-- Consonant Presets -->
                <div class="config-section">
                    <div class="config-label">Consonant Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in consonantPresets"
                            :key="preset.letter"
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.letter.toUpperCase() }} /{{
                                preset.phoneme
                            }}/
                        </v-chip>
                    </div>
                </div>

                <!-- Vowel Presets -->
                <div class="config-section">
                    <div class="config-label">Vowel Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in vowelPresets"
                            :key="preset.letter"
                            size="small"
                            color="secondary"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.letter.toUpperCase() }} /{{
                                preset.phoneme
                            }}/
                        </v-chip>
                    </div>
                </div>


                <!-- Edge Cases -->
                <div class="config-section">
                    <div class="config-label">Edge Cases</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in edgeCasePresets"
                            :key="preset.letter"
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.letter.toUpperCase() }}
                            <span class="ml-1 text-caption">{{ preset.note }}</span>
                        </v-chip>
                    </div>
                </div>

                <!-- Response log -->
                <div class="config-section">
                    <div class="config-label">Response Log</div>
                    <div class="response-log">
                        <div v-if="responses.length === 0" class="no-responses">
                            No responses yet
                        </div>
                        <div
                            v-for="(response, i) in responses"
                            :key="i"
                            class="response-item"
                        >
                            <v-chip color="success" size="x-small" class="mr-2">✓</v-chip>
                            <span class="response-text">
                                Intro complete for {{ response.gpcId }}
                                ({{ response.timeSpent }}ms)
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Replan log -->
                <div class="config-section">
                    <div class="config-label">Replan Hints</div>
                    <div class="response-log">
                        <div v-if="replans.length === 0" class="no-responses">
                            No replan emitted yet
                        </div>
                        <div v-for="(r, i) in replans" :key="i" class="replan-item">
                            <div class="replan-label">{{ r.label }}</div>
                            <div class="replan-row">
                                <span class="replan-key">boost:</span>
                                <span
                                    v-for="(val, tag) in r.boostTags"
                                    :key="tag"
                                    class="replan-tag replan-tag--boost"
                                >{{ tag }} ×{{ val }}</span>
                            </div>
                            <div class="replan-row">
                                <span class="replan-key">exclude:</span>
                                <span
                                    v-for="tag in r.excludeTags"
                                    :key="tag"
                                    class="replan-tag replan-tag--exclude"
                                >{{ tag }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Question content (right column) -->
        <GpcIntroView
            v-if="questionKey > 0"
            :key="questionKey"
            :data="questionData"
            :letters3d="letters3d"
            @emit-response="handleResponse"
            @request-replan="handleReplan"
        />
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import GpcIntroView from "../../questions/GpcIntroView.vue";

// ============================================================================
// Preset types
// ============================================================================

interface GpcPreset {
    letter: string;
    phoneme: string;
    gpcId: string;
    onsetWords: string;
    coreWords: string;
    codaWords: string;
    note?: string;
}

// ============================================================================
// Presets
// ============================================================================

const consonantPresets: GpcPreset[] = [
    { letter: "b", phoneme: "B", gpcId: "GPC-b-B", onsetWords: "bat,big,bus", coreWords: "", codaWords: "cab,tub" },
    { letter: "c", phoneme: "K", gpcId: "GPC-c-K", onsetWords: "cat,cup,cap", coreWords: "", codaWords: "" },
    { letter: "d", phoneme: "D", gpcId: "GPC-d-D", onsetWords: "dog,dip,den", coreWords: "", codaWords: "bad,red" },
    { letter: "f", phoneme: "F", gpcId: "GPC-f-F", onsetWords: "fan,fun,fig", coreWords: "", codaWords: "off,if" },
    { letter: "g", phoneme: "G", gpcId: "GPC-g-G", onsetWords: "gas,got,gum", coreWords: "", codaWords: "big,dog" },
    { letter: "h", phoneme: "HH", gpcId: "GPC-h-HH", onsetWords: "hat,hip,hug", coreWords: "", codaWords: "" },
    { letter: "j", phoneme: "JH", gpcId: "GPC-j-JH", onsetWords: "jam,jog,jug", coreWords: "", codaWords: "" },
    { letter: "k", phoneme: "K", gpcId: "GPC-k-K", onsetWords: "kit,kid,keg", coreWords: "", codaWords: "" },
    { letter: "l", phoneme: "L", gpcId: "GPC-l-L", onsetWords: "lip,log,let", coreWords: "", codaWords: "pal,fill" },
    { letter: "m", phoneme: "M", gpcId: "GPC-m-M", onsetWords: "mat,man,map", coreWords: "", codaWords: "ham,jam" },
    { letter: "n", phoneme: "N", gpcId: "GPC-n-N", onsetWords: "nap,net,nut", coreWords: "", codaWords: "can,fun" },
    { letter: "p", phoneme: "P", gpcId: "GPC-p-P", onsetWords: "pat,pig,pan", coreWords: "", codaWords: "cap,cup" },
    { letter: "q", phoneme: "K", gpcId: "GPC-q-K", onsetWords: "quit,quiz", coreWords: "", codaWords: "" },
    { letter: "r", phoneme: "R", gpcId: "GPC-r-R", onsetWords: "rat,run,rug", coreWords: "", codaWords: "" },
    { letter: "s", phoneme: "S", gpcId: "GPC-s-S", onsetWords: "sat,sun,sit", coreWords: "", codaWords: "bus,gas" },
    { letter: "t", phoneme: "T", gpcId: "GPC-t-T", onsetWords: "top,ten,tip", coreWords: "", codaWords: "cat,hat" },
    { letter: "v", phoneme: "V", gpcId: "GPC-v-V", onsetWords: "van,vet,vim", coreWords: "", codaWords: "" },
    { letter: "w", phoneme: "W", gpcId: "GPC-w-W", onsetWords: "wet,win,wag", coreWords: "", codaWords: "" },
    { letter: "x", phoneme: "K_S", gpcId: "GPC-x-K_S", onsetWords: "", coreWords: "", codaWords: "fox,box,mix" },
    { letter: "y", phoneme: "Y", gpcId: "GPC-y-Y", onsetWords: "yam,yes,yet", coreWords: "", codaWords: "" },
    { letter: "z", phoneme: "Z", gpcId: "GPC-z-Z", onsetWords: "zip,zap,zoo", coreWords: "", codaWords: "fuzz,buzz" },
];

const vowelPresets: GpcPreset[] = [
    { letter: "a", phoneme: "AE", gpcId: "GPC-a-AE", onsetWords: "ant,add,ash", coreWords: "cat,bag,hat", codaWords: "" },
    { letter: "e", phoneme: "EH", gpcId: "GPC-e-EH", onsetWords: "egg,end,elk", coreWords: "bed,red,pet", codaWords: "" },
    { letter: "i", phoneme: "IH", gpcId: "GPC-i-IH", onsetWords: "inn,ill,itch", coreWords: "big,sit,dig", codaWords: "" },
    { letter: "o", phoneme: "AA", gpcId: "GPC-o-AA", onsetWords: "ox,odd,off", coreWords: "dog,hot,pot", codaWords: "" },
    { letter: "u", phoneme: "AH", gpcId: "GPC-u-AH", onsetWords: "up,us,ump", coreWords: "bus,cup,fun", codaWords: "" },
];

const edgeCasePresets: GpcPreset[] = [
    { letter: "h", phoneme: "HH", gpcId: "GPC-h-HH", onsetWords: "hat,hip,hug", coreWords: "", codaWords: "", note: "no coda" },
    { letter: "c", phoneme: "K", gpcId: "GPC-c-K", onsetWords: "cat,cup,cap", coreWords: "", codaWords: "", note: "hard" },
    { letter: "c", phoneme: "S", gpcId: "GPC-c-S", onsetWords: "cell,cent,city", coreWords: "", codaWords: "", note: "soft" },
    { letter: "g", phoneme: "G", gpcId: "GPC-g-G", onsetWords: "gas,got,gum", coreWords: "", codaWords: "big,dog", note: "hard" },
    { letter: "g", phoneme: "JH", gpcId: "GPC-g-JH", onsetWords: "gem,gym,gel", coreWords: "", codaWords: "", note: "soft" },
    { letter: "x", phoneme: "K_S", gpcId: "GPC-x-K_S", onsetWords: "", coreWords: "", codaWords: "fox,box,mix", note: "coda only" },
];

// ============================================================================
// State
// ============================================================================

const gpcId = ref("GPC-s-S");
const letter = ref("s");
const phoneme = ref("S");
const onsetWords = ref("sat,sun,sit");
const coreWords = ref("");
const codaWords = ref("bus,gas");
const questionKey = ref(0);
const letters3d = ref(false);
watch(letters3d, () => resetQuestion());

interface ResponseEntry {
    gpcId: string;
    timeSpent: number;
}

interface ReplanEntry {
    label: string;
    boostTags: Record<string, number>;
    excludeTags: string[];
}

const responses = ref<ResponseEntry[]>([]);
const replans = ref<ReplanEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const questionData = computed(() => [
    {
        gpcId: gpcId.value,
        letter: letter.value.toLowerCase(),
        phoneme: phoneme.value.toUpperCase(),
        onsetWords: onsetWords.value,
        coreWords: coreWords.value,
        codaWords: codaWords.value,
    },
]);

// ============================================================================
// Methods
// ============================================================================

function resetQuestion(): void {
    questionKey.value++;
}

function handleResponse(response: any): void {
    responses.value.unshift({
        gpcId: gpcId.value,
        timeSpent: response.timeSpent || 0,
    });

    // Keep last 10
    if (responses.value.length > 10) {
        responses.value.pop();
    }
}

function handleReplan(options: any): void {
    replans.value.unshift({
        label: options.label ?? '(no label)',
        boostTags: options.hints?.boostTags ?? {},
        excludeTags: options.hints?.excludeTags ?? [],
    });
    if (replans.value.length > 5) replans.value.pop();
}

function applyPreset(preset: GpcPreset): void {
    gpcId.value = preset.gpcId;
    letter.value = preset.letter;
    phoneme.value = preset.phoneme;
    onsetWords.value = preset.onsetWords;
    coreWords.value = preset.coreWords;
    codaWords.value = preset.codaWords;
    resetQuestion();
}

// ============================================================================
// Initialization
// ============================================================================

// Start with default question
questionKey.value = 1;
</script>

<style scoped>
/* Configuration styles */
.gpc-config {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.config-section {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 8px;
}

.config-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin-bottom: 8px;
}

.preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.response-log {
    max-height: 150px;
    overflow-y: auto;
    font-size: 0.875rem;
}

.no-responses {
    color: #999;
    font-style: italic;
}

.response-item {
    display: flex;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid #eee;
}

.response-item:last-child {
    border-bottom: none;
}

.response-text {
    font-family: monospace;
    font-size: 0.8rem;
}

.replan-item {
    padding: 6px 0;
    border-bottom: 1px solid #eee;
    font-family: monospace;
    font-size: 0.75rem;
}
.replan-item:last-child { border-bottom: none; }
.replan-label { font-weight: 600; color: #333; margin-bottom: 3px; }
.replan-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 2px; }
.replan-key { color: #888; font-size: 0.7rem; min-width: 48px; }
.replan-tag { padding: 1px 5px; border-radius: 4px; font-size: 0.7rem; }
.replan-tag--boost { background: #e3f2fd; color: #1565c0; }
.replan-tag--exclude { background: #fce4ec; color: #b71c1c; }
</style>