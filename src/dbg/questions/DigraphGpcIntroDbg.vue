<!--
  DigraphGpcIntroDbg.vue - Debug view for DigraphGpcIntro question type with keyboard context

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Configuration, presets, response log
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout title="Digraph GPC Introduction" :initial-base-letters="[]">
        <!-- Configuration slot (left column) -->
        <template #config>
            <div class="gpc-config">
                <div class="config-section">
                    <div class="config-label">3D (spike)</div>
                    <v-switch
                        v-model="letters3d"
                        label="3D letters (sway on intro, still on final card)"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                </div>

                <!-- GPC Configuration -->
                <div class="config-section">
                    <div class="config-label">GPC ID</div>
                    <v-text-field
                        v-model="gpcId"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="GPC-sh-SH"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Grapheme (2-3 chars)</div>
                    <v-text-field
                        v-model="grapheme"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="sh"
                        maxlength="3"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Phoneme (ARPAbet)</div>
                    <v-text-field
                        v-model="phoneme"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="SH"
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
                        placeholder="ship,shop,shell"
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
                        placeholder="fish,wish"
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

                <!-- Digraph Presets -->
                <div class="config-section">
                    <div class="config-label">Digraph Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="preset in digraphPresets"
                            :key="preset.grapheme"
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.grapheme.toUpperCase() }} /{{
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
                            :key="preset.gpcId"
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset(preset)"
                        >
                            {{ preset.grapheme.toUpperCase() }}
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
        <DigraphGpcIntroView
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
import DigraphGpcIntroView from "../../questions/DigraphGpcIntroView.vue";

// ============================================================================
// Preset types
// ============================================================================

interface DigraphGpcPreset {
    grapheme: string;
    phoneme: string;
    gpcId: string;
    onsetWords: string;
    codaWords: string;
    note?: string;
}

// ============================================================================
// Presets
// ============================================================================

const digraphPresets: DigraphGpcPreset[] = [
    { grapheme: "sh", phoneme: "SH", gpcId: "GPC-sh-SH", onsetWords: "ship,shop,shine", codaWords: "fish,wish,cash" },
    { grapheme: "ch", phoneme: "CH", gpcId: "GPC-ch-CH", onsetWords: "chip,chat,chin", codaWords: "rich,much,such" },
    { grapheme: "th", phoneme: "TH", gpcId: "GPC-th-TH", onsetWords: "thin,think,thank", codaWords: "worth,earth" },
    { grapheme: "th", phoneme: "DH", gpcId: "GPC-th-DH", onsetWords: "this,that,them", codaWords: "" },
    { grapheme: "ng", phoneme: "NG", gpcId: "GPC-ng-NG", onsetWords: "", codaWords: "sing,ring,long" },
    { grapheme: "ph", phoneme: "F", gpcId: "GPC-ph-F", onsetWords: "phone", codaWords: "" },
    { grapheme: "wh", phoneme: "W", gpcId: "GPC-wh-W", onsetWords: "when,which,while", codaWords: "" },
    { grapheme: "ck", phoneme: "K", gpcId: "GPC-ck-K", onsetWords: "", codaWords: "back,kick,luck" },
];

const edgeCasePresets: DigraphGpcPreset[] = [
    { grapheme: "ng", phoneme: "NG", gpcId: "GPC-ng-NG", onsetWords: "", codaWords: "sing,ring,long", note: "coda only" },
    { grapheme: "ck", phoneme: "K", gpcId: "GPC-ck-K", onsetWords: "", codaWords: "back,kick,luck", note: "coda only" },
    { grapheme: "qu", phoneme: "K_W", gpcId: "GPC-qu-K_W", onsetWords: "quit,quick,quite", codaWords: "", note: "multi-phoneme" },
];

// ============================================================================
// State
// ============================================================================

const gpcId = ref("GPC-sh-SH");
const grapheme = ref("sh");
const phoneme = ref("SH");
const onsetWords = ref("ship,shop,shine");
const codaWords = ref("fish,wish,cash");
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
        grapheme: grapheme.value.toLowerCase(),
        phoneme: phoneme.value.toUpperCase(),
        onsetWords: onsetWords.value,
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

function applyPreset(preset: DigraphGpcPreset): void {
    gpcId.value = preset.gpcId;
    grapheme.value = preset.grapheme;
    phoneme.value = preset.phoneme;
    onsetWords.value = preset.onsetWords;
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