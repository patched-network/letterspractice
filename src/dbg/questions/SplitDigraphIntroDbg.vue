<!--
  SplitDigraphIntroDbg.vue - Debug view for SplitDigraphIntro question type

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Configuration, presets, response log
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout title="Split Digraph (Magic-E) Introduction" :initial-base-letters="[]">
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
                        placeholder="GPC-a_e-EY"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Active Vowel</div>
                    <v-text-field
                        v-model="vowel"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="a"
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
                        placeholder="EY"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Exemplar Words (comma-separated)
                    </div>
                    <v-text-field
                        v-model="words"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="cake,name,gate"
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

                <!-- Split Digraph Presets -->
                <div class="config-section">
                    <div class="config-label">Magic-E Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in splitDigraphPresets"
                            :key="preset.gpcId"
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.vowel }}_e /{{ preset.phoneme }}/
                        </v-chip>
                    </div>
                </div>

                <!-- Edge Cases -->
                <div class="config-section">
                    <div class="config-label">Edge Cases</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in edgeCasePresets"
                            :key="preset.gpcId"
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.vowel }}_e
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
        <SplitDigraphIntroView
            v-if="questionKey > 0"
            :key="questionKey"
            :data="questionData"
            @emit-response="handleResponse"
            @request-replan="handleReplan"
        />
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import SplitDigraphIntroView from "../../questions/SplitDigraphIntroView.vue";

// ============================================================================
// Preset types
// ============================================================================

interface SplitDigraphPreset {
    vowel: string;
    phoneme: string;
    gpcId: string;
    words: string;
    note?: string;
}

// ============================================================================
// Presets
// ============================================================================

const splitDigraphPresets: SplitDigraphPreset[] = [
    { vowel: "a", phoneme: "EY", gpcId: "GPC-a_e-EY", words: "cake,name,gate" },
    { vowel: "i", phoneme: "AY", gpcId: "GPC-i_e-AY", words: "mice,hide,pine" },
    { vowel: "o", phoneme: "OW", gpcId: "GPC-o_e-OW", words: "vote,hope,note" },
    { vowel: "e", phoneme: "IY", gpcId: "GPC-e_e-IY", words: "here,these" },
    { vowel: "u", phoneme: "UW", gpcId: "GPC-u_e-UW", words: "dude,cube,fuse" },
];

const edgeCasePresets: SplitDigraphPreset[] = [
    { vowel: "e", phoneme: "IY", gpcId: "GPC-e_e-IY", words: "here,these", note: "e=e" },
    { vowel: "a", phoneme: "EY", gpcId: "GPC-a_e-EY", words: "cake", note: "single word" },
    { vowel: "i", phoneme: "AY", gpcId: "GPC-i_e-AY", words: "mice,hide,pine,bite,ride", note: "many words" },
];

// ============================================================================
// State
// ============================================================================

const gpcId = ref("GPC-a_e-EY");
const vowel = ref("a");
const phoneme = ref("EY");
const words = ref("cake,name,gate");
const questionKey = ref(0);

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
        vowel: vowel.value.toLowerCase(),
        phoneme: phoneme.value.toUpperCase(),
        words: words.value,
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

function applyPreset(preset: SplitDigraphPreset): void {
    gpcId.value = preset.gpcId;
    vowel.value = preset.vowel;
    phoneme.value = preset.phoneme;
    words.value = preset.words;
    resetQuestion();
}

// ============================================================================
// Initialization
// ============================================================================

questionKey.value = 1;
</script>

<style scoped>
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
