<!--
  WhoSaidThatDbg.vue - Debug view for WhoSaidThat question type with keyboard context

  Supports both single-letter and digraph suspects.
  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Configuration, presets, response log
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout
        title="Who Said That? (v2 — Digraph-capable)"
        :supports-modify-difficulty="true"
        :modify-difficulty-used="true"
    >
        <!-- Configuration slot (left column) -->
        <template #config>
            <div class="wst-config">
                <!-- Phoneme configuration -->
                <div class="config-section">
                    <div class="config-label">Target Phoneme (ARPAbet)</div>
                    <v-text-field
                        v-model="targetPhoneme"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="SH"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">Correct Letter/Digraph</div>
                    <v-text-field
                        v-model="correctLetter"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="sh"
                        maxlength="3"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Distractors (comma-separated, letters or digraphs)
                    </div>
                    <v-text-field
                        v-model="distractors"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="ch, th, ph"
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
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('sh-ch-th')"
                        >
                            SH vs CH vs TH
                        </v-chip>
                        <v-chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('ng-n')"
                        >
                            NG vs N
                        </v-chip>
                        <v-chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('ph-f')"
                        >
                            PH vs F
                        </v-chip>
                        <v-chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('ch-k')"
                        >
                            CH vs K
                        </v-chip>
                        <v-chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('wh-w')"
                        >
                            WH vs W
                        </v-chip>
                        <v-chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            @click="applyPreset('ck-k-c')"
                        >
                            CK vs K vs C
                        </v-chip>
                    </div>
                </div>

                <!-- Mixed (digraph + single letter) Presets -->
                <div class="config-section">
                    <div class="config-label">Mixed Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            @click="applyPreset('sh-s-ch')"
                        >
                            SH vs S vs CH
                        </v-chip>
                        <v-chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            @click="applyPreset('th-t-d')"
                        >
                            TH vs T vs D
                        </v-chip>
                        <v-chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            @click="applyPreset('b-d-p')"
                        >
                            B vs D vs P (single)
                        </v-chip>
                    </div>
                </div>

                <!-- Single-letter Presets -->
                <div class="config-section">
                    <div class="config-label">Single-letter Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            size="small"
                            color="info"
                            variant="outlined"
                            @click="applyPreset('vowels')"
                        >
                            Short Vowels
                        </v-chip>
                        <v-chip
                            size="small"
                            color="info"
                            variant="outlined"
                            @click="applyPreset('s-z')"
                        >
                            S vs Z
                        </v-chip>
                    </div>
                </div>

                <!-- Auto-distractor Presets (no prescribed distractors — uses modifyDifficulty) -->
                <div class="config-section">
                    <div class="config-label">Auto Distractors — Digraph</div>
                    <div class="preset-chips">
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-sh')"
                        >
                            SH (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-ch')"
                        >
                            CH (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-th')"
                        >
                            TH (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-ng')"
                        >
                            NG (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-ph')"
                        >
                            PH (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-wh')"
                        >
                            WH (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-ck')"
                        >
                            CK (auto)
                        </v-chip>
                    </div>
                </div>

                <div class="config-section">
                    <div class="config-label">Auto Distractors — Single Letter</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="letter in 'bdfghjklmnprstvwyz'.split('')"
                            :key="letter"
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-' + letter)"
                        >
                            {{ letter.toUpperCase() }} (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-vowel-a')"
                        >
                            A /æ/ (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-vowel-e')"
                        >
                            E /ɛ/ (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-vowel-i')"
                        >
                            I /ɪ/ (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-vowel-o')"
                        >
                            O /ɑ/ (auto)
                        </v-chip>
                        <v-chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            @click="applyPreset('auto-vowel-u')"
                        >
                            U /ʌ/ (auto)
                        </v-chip>
                    </div>
                </div>

                <!-- Difficulty capability -->
                <div class="config-section">
                    <div class="config-label">Difficulty Capability</div>
                    <div class="capability-list">
                        <div class="capability-row">
                            <span class="capability-name">modifyDifficulty wired</span>
                            <v-chip size="x-small" color="success" variant="flat">
                                yes
                            </v-chip>
                        </div>
                        <div class="capability-row">
                            <span class="capability-name">currently used by this dbg view</span>
                            <v-chip size="x-small" color="success" variant="flat">
                                yes
                            </v-chip>
                        </div>
                        <div class="capability-note">
                            Effect is strongest for cards that auto-generate suspects.
                            Explicit distractor lists may not visibly change with difficulty.
                        </div>
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
                            <v-chip
                                :color="response.correct ? 'success' : 'error'"
                                size="x-small"
                                class="mr-2"
                            >
                                {{ response.correct ? "✓" : "✗" }}
                            </v-chip>
                            <span class="response-text">
                                "{{ response.answer }}" for /{{
                                    response.phoneme
                                }}/ ({{ response.timeSpent }}ms)
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Question content (right column) -->
        <template #default="{ modifyDifficulty: md }">
            <WhoSaidThatView
                v-if="questionKey > 0"
                :key="questionKey"
                :data="questionData"
                :modify-difficulty="md"
                @emit-response="handleResponse"
            />
        </template>
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import WhoSaidThatView from "../../questions/WhoSaidThatView.vue";

// ============================================================================
// State
// ============================================================================

const targetPhoneme = ref("SH");
const correctLetter = ref("sh");
const distractors = ref("ch, th, ph");
const questionKey = ref(0);

interface ResponseEntry {
    phoneme: string;
    answer: string;
    correct: boolean;
    timeSpent: number;
}

const responses = ref<ResponseEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const questionData = computed(() => [
    {
        targetPhoneme: targetPhoneme.value.toUpperCase(),
        correctLetter: correctLetter.value,
        distractors: distractors.value,
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
        phoneme: targetPhoneme.value,
        answer: response.answer || "(none)",
        correct: response.correct || false,
        timeSpent: response.timeSpent || 0,
    });

    // Keep last 10
    if (responses.value.length > 10) {
        responses.value.pop();
    }
}

function applyPreset(preset: string): void {
    switch (preset) {
        // Digraph-only presets
        case "sh-ch-th":
            targetPhoneme.value = "SH";
            correctLetter.value = "sh";
            distractors.value = "ch, th, ph";
            break;
        case "ng-n":
            targetPhoneme.value = "NG";
            correctLetter.value = "ng";
            distractors.value = "n, m";
            break;
        case "ph-f":
            targetPhoneme.value = "F";
            correctLetter.value = "ph";
            distractors.value = "v, wh, ch";
            break;
        case "ch-k":
            targetPhoneme.value = "CH";
            correctLetter.value = "ch";
            distractors.value = "k, c, sh";
            break;
        case "wh-w":
            targetPhoneme.value = "W";
            correctLetter.value = "wh";
            distractors.value = "v, y";
            break;
        case "ck-k-c":
            targetPhoneme.value = "K";
            correctLetter.value = "ck";
            distractors.value = "g, t, d";
            break;

        // Mixed presets (digraph + single letter)
        case "sh-s-ch":
            targetPhoneme.value = "SH";
            correctLetter.value = "sh";
            distractors.value = "s, ch, z";
            break;
        case "th-t-d":
            targetPhoneme.value = "TH";
            correctLetter.value = "th";
            distractors.value = "t, d, s";
            break;

        // Single-letter presets (same as WST1 — verify backwards compatibility)
        case "b-d-p":
            targetPhoneme.value = "B";
            correctLetter.value = "b";
            distractors.value = "d, p, t";
            break;
        case "vowels":
            targetPhoneme.value = "AE";
            correctLetter.value = "a";
            distractors.value = "e, i, o, u";
            break;
        case "s-z":
            targetPhoneme.value = "S";
            correctLetter.value = "s";
            distractors.value = "z, c";
            break;

        // Auto-distractor digraph presets
        case "auto-sh": targetPhoneme.value = "SH"; correctLetter.value = "sh"; distractors.value = ""; break;
        case "auto-ch": targetPhoneme.value = "CH"; correctLetter.value = "ch"; distractors.value = ""; break;
        case "auto-th": targetPhoneme.value = "TH"; correctLetter.value = "th"; distractors.value = ""; break;
        case "auto-ng": targetPhoneme.value = "NG"; correctLetter.value = "ng"; distractors.value = ""; break;
        case "auto-ph": targetPhoneme.value = "F";  correctLetter.value = "ph"; distractors.value = ""; break;
        case "auto-wh": targetPhoneme.value = "W";  correctLetter.value = "wh"; distractors.value = ""; break;
        case "auto-ck": targetPhoneme.value = "K";  correctLetter.value = "ck"; distractors.value = ""; break;

        // Auto-distractor single-letter presets (consonants)
        case "auto-b": targetPhoneme.value = "B";  correctLetter.value = "b"; distractors.value = ""; break;
        case "auto-d": targetPhoneme.value = "D";  correctLetter.value = "d"; distractors.value = ""; break;
        case "auto-f": targetPhoneme.value = "F";  correctLetter.value = "f"; distractors.value = ""; break;
        case "auto-g": targetPhoneme.value = "G";  correctLetter.value = "g"; distractors.value = ""; break;
        case "auto-h": targetPhoneme.value = "HH"; correctLetter.value = "h"; distractors.value = ""; break;
        case "auto-j": targetPhoneme.value = "JH"; correctLetter.value = "j"; distractors.value = ""; break;
        case "auto-k": targetPhoneme.value = "K";  correctLetter.value = "k"; distractors.value = ""; break;
        case "auto-l": targetPhoneme.value = "L";  correctLetter.value = "l"; distractors.value = ""; break;
        case "auto-m": targetPhoneme.value = "M";  correctLetter.value = "m"; distractors.value = ""; break;
        case "auto-n": targetPhoneme.value = "N";  correctLetter.value = "n"; distractors.value = ""; break;
        case "auto-p": targetPhoneme.value = "P";  correctLetter.value = "p"; distractors.value = ""; break;
        case "auto-r": targetPhoneme.value = "R";  correctLetter.value = "r"; distractors.value = ""; break;
        case "auto-s": targetPhoneme.value = "S";  correctLetter.value = "s"; distractors.value = ""; break;
        case "auto-t": targetPhoneme.value = "T";  correctLetter.value = "t"; distractors.value = ""; break;
        case "auto-v": targetPhoneme.value = "V";  correctLetter.value = "v"; distractors.value = ""; break;
        case "auto-w": targetPhoneme.value = "W";  correctLetter.value = "w"; distractors.value = ""; break;
        case "auto-y": targetPhoneme.value = "Y";  correctLetter.value = "y"; distractors.value = ""; break;
        case "auto-z": targetPhoneme.value = "Z";  correctLetter.value = "z"; distractors.value = ""; break;

        // Auto-distractor vowel presets (short sounds)
        case "auto-vowel-a": targetPhoneme.value = "AE"; correctLetter.value = "a"; distractors.value = ""; break;
        case "auto-vowel-e": targetPhoneme.value = "EH"; correctLetter.value = "e"; distractors.value = ""; break;
        case "auto-vowel-i": targetPhoneme.value = "IH"; correctLetter.value = "i"; distractors.value = ""; break;
        case "auto-vowel-o": targetPhoneme.value = "AA"; correctLetter.value = "o"; distractors.value = ""; break;
        case "auto-vowel-u": targetPhoneme.value = "AH"; correctLetter.value = "u"; distractors.value = ""; break;
    }
    resetQuestion();
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    // Initialize with default question
    questionKey.value = 1;
});
</script>

<style scoped>
/* Configuration styles */
.wst-config {
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

.capability-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.capability-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.capability-name {
    font-size: 0.85rem;
    color: #333;
}

.capability-note {
    font-size: 0.78rem;
    line-height: 1.4;
    color: #666;
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
</style>