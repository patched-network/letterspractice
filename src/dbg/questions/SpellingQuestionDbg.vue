<!--
  SpellingQuestionDbg.vue - Debug view for SpellingQuestion with keyboard context

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Word picker, scaffold level override, response log with TaggedPerformance.
  Right column: SpellingQuestionView (production component) + keyboard.

  Follows same pattern as WordSelectionDbg: renders the production view
  directly with mock ViewData[].
-->

<template>
    <QuestionTypeLayout title="Spelling Question">
        <template #config>
            <div class="spelling-config">
                <!-- Word picker -->
                <div class="config-section">
                    <div class="config-label">Word</div>
                    <v-select
                        v-model="targetWord"
                        :items="wordPresets"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="resetQuestion"
                    />
                </div>

                <!-- Custom word input -->
                <div class="config-section">
                    <div class="config-label">Custom Word</div>
                    <div class="custom-word-row">
                        <v-text-field
                            v-model="customWord"
                            variant="outlined"
                            density="compact"
                            hide-details
                            placeholder="type a word..."
                        />
                        <v-btn
                            color="primary"
                            variant="elevated"
                            size="small"
                            @click="applyCustomWord"
                            :disabled="!customWord.trim()"
                        >
                            Go
                        </v-btn>
                    </div>
                </div>

                <!-- Quick presets by category -->
                <div class="config-section">
                    <div class="config-label">Quick Presets</div>
                    <div class="preset-group">
                        <div class="preset-group-label">Simple (CVC)</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="word in presetSimple"
                                :key="word"
                                size="small"
                                color="primary"
                                variant="outlined"
                                @click="selectWord(word)"
                            >
                                {{ word }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Digraphs</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="word in presetDigraphs"
                                :key="word"
                                size="small"
                                color="secondary"
                                variant="outlined"
                                @click="selectWord(word)"
                            >
                                {{ word }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Split Digraphs</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="word in presetSplitDigraphs"
                                :key="word"
                                size="small"
                                color="info"
                                variant="outlined"
                                @click="selectWord(word)"
                            >
                                {{ word }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Longer Words</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="word in presetLonger"
                                :key="word"
                                size="small"
                                color="warning"
                                variant="outlined"
                                @click="selectWord(word)"
                            >
                                {{ word }}
                            </v-chip>
                        </div>
                    </div>
                </div>

                <!-- Scaffold level override (prep for Phase 2) -->
                <div class="config-section">
                    <div class="config-label">Scaffold Level</div>
                    <v-select
                        v-model="scaffoldLevel"
                        :items="scaffoldLevelOptions"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="resetQuestion"
                    />
                </div>

                <!-- Difficulty capability -->
                <div class="config-section">
                    <div class="config-label">Difficulty Capability</div>
                    <div class="capability-grid">
                        <div class="capability-row">
                            <span class="capability-label">modifyDifficulty wired</span>
                            <v-chip size="x-small" color="warning" variant="flat">
                                no
                            </v-chip>
                        </div>
                        <div class="capability-row">
                            <span class="capability-label">currently used by this dbg view</span>
                            <v-chip size="x-small" color="warning" variant="flat">
                                no
                            </v-chip>
                        </div>
                        <div class="config-hint">
                            This view exposes scaffold-level override instead. Although
                            `SpellingQuestionView` accepts a `modifyDifficulty` prop,
                            this dbg wrapper does not currently pass it through, and no
                            source-level usage has been confirmed in the production view.
                        </div>
                    </div>
                </div>

                <!-- Phonetics info -->
                <div class="config-section">
                    <div class="config-label">Phonetics Info</div>
                    <div v-if="phoneticsInfo" class="phonetics-info">
                        <div class="phonetics-row">
                            <span class="phonetics-label">Phonemes:</span>
                            <span class="phonetics-value">{{ phoneticsInfo.phonemes }}</span>
                        </div>
                        <div class="phonetics-row">
                            <span class="phonetics-label">Chunks:</span>
                            <span class="phonetics-value">{{ phoneticsInfo.chunkCount }}</span>
                        </div>
                        <div
                            v-for="(chunk, i) in phoneticsInfo.chunks"
                            :key="i"
                            class="phonetics-chunk"
                        >
                            <span class="chunk-label">{{ chunk.label || '?' }}</span>
                            <span class="chunk-phoneme">/{{ chunk.phoneme }}/</span>
                            <span class="chunk-positions">pos: {{ chunk.positions }}</span>
                        </div>
                    </div>
                    <div v-else class="no-phonetics">
                        No phonetics data for "{{ targetWord }}"
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
                            v-for="(r, i) in responses"
                            :key="i"
                            class="response-entry"
                        >
                            <div class="response-item">
                                <v-chip
                                    :color="r.correct ? 'success' : 'error'"
                                    size="x-small"
                                    class="mr-2"
                                >
                                    {{ r.correct ? "✓" : "✗" }}
                                </v-chip>
                                <span class="response-text">
                                    "{{ r.answer }}" for "{{ r.word }}" ({{ r.timeSpent }}ms)
                                </span>
                                <v-chip v-if="r.phonetic" color="info" size="x-small" class="ml-2">
                                    phonetic: {{ r.phonetic.join(", ") }}
                                </v-chip>
                                <v-chip v-if="r.advanced" color="success" size="x-small" variant="outlined" class="ml-2">
                                    ready-to-advance
                                </v-chip>
                            </div>
                            <!-- TaggedPerformance breakdown -->
                            <div v-if="r.performance" class="performance-tags">
                                <div
                                    v-for="(score, tag) in r.performance"
                                    :key="String(tag)"
                                    class="perf-tag"
                                    :class="{
                                        'perf-tag--global': tag === '_global',
                                        'perf-tag--zero': score === 0,
                                        'perf-tag--null': score === null,
                                        'perf-tag--good': typeof score === 'number' && score > 0,
                                    }"
                                >
                                    <span class="perf-tag-name">{{ tag }}</span>
                                    <span class="perf-tag-score">
                                        {{ score === null ? 'count' : typeof score === 'number' ? score.toFixed(2) : score }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <SpellingQuestionView
            v-if="questionKey > 0"
            :key="questionKey"
            :data="questionData"
            :initial-level="scaffoldLevel"
            @emit-response="handleResponse"
            @ready-to-advance="handleReadyToAdvance"
        />
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Performance } from "@vue-skuilder/common";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import SpellingQuestionView from "../../questions/SpellingQuestionView.vue";
import { getPhonetics } from "../../services/phonetics";
import { gradeSpelling } from "../../questions/spelling/grade";
import type { ScaffoldLevel } from "../../questions/spelling/types";

// ============================================================================
// Word Presets
// ============================================================================

const presetSimple = [
    "cat", "dog", "sit", "bat", "bed", "hot", "sad", "bag", "big", "cup",
];

const presetDigraphs = [
    "ship", "shop", "chin", "thin", "chat", "fish", "rush", "much",
];

const presetSplitDigraphs = [
    "cake", "bone", "make", "hide", "tune", "bike", "home", "nose",
];

const presetLonger = [
    "jump", "hand", "nest", "lamp", "dust", "stamp", "frost",
];

// Words with phonetic misspellings to try: necst, fone, fiks, thingk.
const presetPhonetic = ["next", "phone", "fix", "think"];

const wordPresets = [
    ...presetSimple,
    ...presetDigraphs,
    ...presetSplitDigraphs,
    ...presetLonger,
    ...presetPhonetic,
].sort();

// ============================================================================
// Scaffold Level Options
// ============================================================================

const scaffoldLevelOptions = [
    { title: "Level 0 — Copy (See-Do)", value: 0 },
    { title: "Level 1 — Restricted", value: 1 },
    { title: "Level 2 — Guided", value: 2 },
    { title: "Level 3 — Unaided", value: 3 },
];

// ============================================================================
// State
// ============================================================================

const targetWord = ref("cat");
const customWord = ref("");
const scaffoldLevel = ref<ScaffoldLevel>(3);
const questionKey = ref(0);

interface ResponseEntry {
    word: string;
    answer: string;
    correct: boolean;
    timeSpent: number;
    performance?: Performance;
    /** Replacements when the answer reads back as the word (grade.ts rule 0). */
    phonetic?: string[];
    /** The view emitted ready-to-advance after a deferred submit. */
    advanced?: boolean;
}

const responses = ref<ResponseEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const questionData = computed(() => [
    { word: targetWord.value.toLowerCase() },
]);

const phoneticsInfo = computed(() => {
    const phonetics = getPhonetics(targetWord.value.toLowerCase());
    if (!phonetics) return null;

    return {
        phonemes: phonetics.phonemes.join(' '),
        chunkCount: phonetics.chunks.length,
        chunks: phonetics.chunks.map((chunk) => ({
            label: chunk.label ?? '',
            phoneme: chunk.phoneme,
            positions: Object.keys(chunk.letters).join(', '),
        })),
    };
});

// ============================================================================
// Methods
// ============================================================================

function resetQuestion(): void {
    questionKey.value++;
}

function selectWord(word: string): void {
    targetWord.value = word;
    resetQuestion();
}

function applyCustomWord(): void {
    const word = customWord.value.trim().toLowerCase();
    if (word) {
        targetWord.value = word;
        resetQuestion();
    }
}

function handleResponse(response: any): void {
    const answer = response.userAnswer ?? response.answer ?? "(none)";
    const word = targetWord.value.toLowerCase();
    responses.value.unshift({
        word: targetWord.value,
        answer,
        correct: response.isCorrect ?? response.correct ?? false,
        timeSpent: response.timeSpent || 0,
        performance: response.performance,
        phonetic: gradeSpelling(word, getPhonetics(word), String(answer)).phonetic?.replacements,
    });
    if (responses.value.length > 20) responses.value.pop();
}

function handleReadyToAdvance(): void {
    if (responses.value[0]) responses.value[0].advanced = true;
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    questionKey.value = 1;
});
</script>

<style scoped>
.spelling-config {
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

.capability-grid {
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

.capability-label {
    font-size: 0.875rem;
    color: #333;
}

.config-hint {
    font-size: 0.7rem;
    color: #999;
    font-style: italic;
    margin-top: 6px;
}

.custom-word-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.custom-word-row .v-text-field {
    flex: 1;
}

/* ---------- Preset chips ---------- */

.preset-group {
    margin-bottom: 8px;
}

.preset-group:last-child {
    margin-bottom: 0;
}

.preset-group-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #888;
    margin-bottom: 4px;
}

.preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

/* ---------- Phonetics info ---------- */

.phonetics-info {
    font-size: 0.8rem;
    font-family: monospace;
}

.phonetics-row {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
}

.phonetics-label {
    font-weight: 600;
    color: #666;
    min-width: 70px;
}

.phonetics-value {
    color: #333;
}

.phonetics-chunk {
    display: flex;
    gap: 8px;
    padding: 2px 8px;
    margin: 2px 0;
    background: #e8eaf6;
    border-radius: 4px;
    font-size: 0.75rem;
}

.chunk-label {
    font-weight: 700;
    color: #283593;
    min-width: 32px;
}

.chunk-phoneme {
    color: #5c6bc0;
    min-width: 40px;
}

.chunk-positions {
    color: #7986cb;
}

.no-phonetics {
    color: #999;
    font-style: italic;
    font-size: 0.8rem;
}

/* ---------- Response log ---------- */

.response-log {
    max-height: 300px;
    overflow-y: auto;
    font-size: 0.875rem;
}

.no-responses {
    color: #999;
    font-style: italic;
}

.response-entry {
    padding: 6px 0;
    border-bottom: 1px solid #eee;
}

.response-entry:last-child {
    border-bottom: none;
}

.response-item {
    display: flex;
    align-items: center;
    padding: 2px 0;
}

.response-text {
    font-family: monospace;
    font-size: 0.8rem;
}

.config-hint {
    margin-top: 8px;
    font-size: 0.75rem;
    color: #666;
    line-height: 1.4;
}

/* ---------- TaggedPerformance display ---------- */

.performance-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
    padding-left: 36px;
}

.perf-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: monospace;
    background: #e3f2fd;
    color: #1565c0;
}

.perf-tag--global {
    background: #f3e5f5;
    color: #7b1fa2;
    font-weight: 600;
}

.perf-tag--zero {
    background: #ffebee;
    color: #c62828;
}

.perf-tag--null {
    background: #fff8e1;
    color: #f57f17;
}

.perf-tag--good {
    background: #e8f5e9;
    color: #2e7d32;
}

.perf-tag-name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.perf-tag-score {
    font-weight: 700;
}
</style>