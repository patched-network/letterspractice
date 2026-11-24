<!--
  MissingLettersDbg.vue - Debug view for MissingLetters question type with keyboard context

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Word picker, blanks editor, presets, phonetics info, response log.
  Right column: MissingLettersView (production component) + keyboard.

  Follows same pattern as SpellingQuestionDbg: renders the production view
  directly with mock ViewData[].
-->

<template>
    <QuestionTypeLayout
        :key="layoutKey"
        title="Missing Letters"
        :initial-base-letters="initialBaseLetters"
        :supports-modify-difficulty="true"
        :modify-difficulty-used="null"
    >
        <template #config>
            <div class="ml-config">
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

                <!-- Blanks editor -->
                <div class="config-section">
                    <div class="config-label">Blank Positions (0-based, comma-separated)</div>
                    <div class="custom-word-row">
                        <v-text-field
                            v-model="blanksInput"
                            variant="outlined"
                            density="compact"
                            hide-details
                            placeholder="0,2"
                        />
                        <v-btn
                            color="primary"
                            variant="elevated"
                            size="small"
                            @click="resetQuestion"
                        >
                            Apply
                        </v-btn>
                    </div>
                    <div class="config-hint">
                        Word "{{ targetWord }}" has {{ targetWord.length }} letters (indices 0–{{ targetWord.length - 1 }})
                    </div>
                    <!-- Visual letter grid for toggling blanks -->
                    <div class="blanks-toggle-grid">
                        <div
                            v-for="(letter, i) in targetWord.split('')"
                            :key="'toggle-' + i"
                            class="blanks-toggle-cell"
                            :class="{ 'blanks-toggle-cell--blank': isBlankIndex(i) }"
                            @click="toggleBlankIndex(i)"
                        >
                            <span class="blanks-toggle-letter">{{ letter.toUpperCase() }}</span>
                            <span class="blanks-toggle-index">{{ i }}</span>
                        </div>
                    </div>
                </div>

                <!-- RETIRE(overhead-audio-button): this toggle. Live; remembered per browser (soundRail.ts). -->
                <div class="config-section">
                    <div class="config-label">Sound cue</div>
                    <v-btn-toggle v-model="soundCueStyle" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" value="button">Overhead button</v-btn>
                        <v-btn size="small" value="rail">Sound rail</v-btn>
                    </v-btn-toggle>
                </div>

                <!-- Time-based option-shaving controls -->
                <div class="config-section">
                    <div class="config-label">Time-Shaving (anti-hang)</div>
                    <v-switch
                        v-model="shaveEnabled"
                        label="Enabled"
                        color="primary"
                        density="compact"
                        hide-details
                        @update:model-value="resetQuestion"
                    />
                    <div class="config-sublabel">Timing</div>
                    <v-btn-toggle v-model="shaveTiming" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" value="instant">Instant</v-btn>
                        <v-btn size="small" value="fast">Fast</v-btn>
                        <v-btn size="small" value="realistic">Realistic</v-btn>
                    </v-btn-toggle>
                    <div class="config-sublabel">Strategy</div>
                    <v-btn-toggle v-model="shaveStrategy" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" value="random">Random</v-btn>
                        <v-btn size="small" value="geometric">Geometric</v-btn>
                    </v-btn-toggle>
                    <div class="config-sublabel">Max waves</div>
                    <v-btn-toggle v-model="shaveMaxWaves" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" :value="1">1</v-btn>
                        <v-btn size="small" :value="2">2</v-btn>
                        <v-btn size="small" :value="3">3</v-btn>
                    </v-btn-toggle>
                    <div class="config-sublabel">Dim fade (disable)</div>
                    <v-btn-toggle v-model="shaveDimMs" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" :value="400">0.4s</v-btn>
                        <v-btn size="small" :value="1000">1s</v-btn>
                        <v-btn size="small" :value="2000">2s</v-btn>
                        <v-btn size="small" :value="2500">2.5s</v-btn>
                    </v-btn-toggle>
                    <div class="config-sublabel">Restore fade (re-enable)</div>
                    <v-btn-toggle v-model="shaveEnableMs" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" :value="200">0.2s</v-btn>
                        <v-btn size="small" :value="400">0.4s</v-btn>
                        <v-btn size="small" :value="600">0.6s</v-btn>
                    </v-btn-toggle>
                    <div class="config-sublabel">Board size (base letters)</div>
                    <v-btn-toggle v-model="boardSize" mandatory density="compact" divided class="shave-toggle">
                        <v-btn size="small" value="full">Full</v-btn>
                        <v-btn size="small" value="medium">Med</v-btn>
                        <v-btn size="small" value="small">Small</v-btn>
                        <v-btn size="small" value="tiny">Tiny</v-btn>
                    </v-btn-toggle>
                    <div class="config-hint">
                        Watch "Enabled Letters (N)" (Keyboard State panel) shrink as
                        waves fire; the perf log's _global / gpc:* scores cap at 0.5
                        once shaving has touched a blank. Small/Tiny boards always
                        include the current word's letters.
                    </div>
                </div>

                <!-- Quick presets by category -->
                <div class="config-section">
                    <div class="config-label">Quick Presets</div>
                    <div class="preset-group">
                        <div class="preset-group-label">Simple CVC</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="preset in presetSimple"
                                :key="preset.label"
                                size="small"
                                color="primary"
                                variant="outlined"
                                @click="applyPreset(preset)"
                            >
                                {{ preset.label }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Vowel Focus</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="preset in presetVowels"
                                :key="preset.label"
                                size="small"
                                color="secondary"
                                variant="outlined"
                                @click="applyPreset(preset)"
                            >
                                {{ preset.label }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Multi-Blank</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="preset in presetMulti"
                                :key="preset.label"
                                size="small"
                                color="info"
                                variant="outlined"
                                @click="applyPreset(preset)"
                            >
                                {{ preset.label }}
                            </v-chip>
                        </div>
                    </div>
                    <div class="preset-group">
                        <div class="preset-group-label">Digraphs</div>
                        <div class="preset-chips">
                            <v-chip
                                v-for="preset in presetDigraphs"
                                :key="preset.label"
                                size="small"
                                color="warning"
                                variant="outlined"
                                @click="applyPreset(preset)"
                            >
                                {{ preset.label }}
                            </v-chip>
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
                            <v-chip
                                v-if="chunk.hasBlankedPosition"
                                size="x-small"
                                color="warning"
                                variant="flat"
                                class="ml-1"
                            >
                                tested
                            </v-chip>
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
                                    "{{ r.answer }}" for "{{ r.word }}" blanks=[{{ r.blanks }}] ({{ r.timeSpent }}ms)
                                </span>
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

        <template #default="{ modifyDifficulty: md }">
            <MissingLettersView
                v-if="questionKey > 0"
                :key="questionKey"
                :data="questionData"
                :modify-difficulty="md"
                :shave-enabled="shaveEnabled"
                :shave-first-delay-ms="shaveFirstDelayMs"
                :shave-interval-ms="shaveIntervalMs"
                :shave-strategy="shaveStrategy"
                :shave-max-waves="shaveMaxWaves"
                :shave-disable-transition-ms="shaveDimMs"
                :shave-enable-transition-ms="shaveEnableMs"
                @emit-response="handleResponse"
            />
        </template>
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Performance } from "@vue-skuilder/common";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import MissingLettersView from "../../questions/MissingLettersView.vue";
import { soundCueStyle } from "../../lessons/soundRail";
import { getPhonetics } from "../../services/phonetics";

// ============================================================================
// Preset Type
// ============================================================================

interface Preset {
    label: string;
    word: string;
    blanks: string;
}

// ============================================================================
// Presets
// ============================================================================

const presetSimple: Preset[] = [
    { label: "c_t", word: "cat", blanks: "1" },
    { label: "_at", word: "cat", blanks: "0" },
    { label: "ca_", word: "cat", blanks: "2" },
    { label: "d_g", word: "dog", blanks: "1" },
    { label: "b_d", word: "bed", blanks: "1" },
    { label: "s_t", word: "sit", blanks: "1" },
];

const presetVowels: Preset[] = [
    { label: "b_g", word: "bag", blanks: "1" },
    { label: "b_g", word: "big", blanks: "1" },
    { label: "b_g", word: "bug", blanks: "1" },
    { label: "h_t", word: "hot", blanks: "1" },
    { label: "c_p", word: "cup", blanks: "1" },
];

const presetMulti: Preset[] = [
    { label: "_a_", word: "cat", blanks: "0,2" },
    { label: "_o_", word: "dog", blanks: "0,2" },
    { label: "j_m_", word: "jump", blanks: "1,3" },
    { label: "h_n_", word: "hand", blanks: "1,3" },
    { label: "_es_", word: "nest", blanks: "0,3" },
    { label: "l_ _p", word: "lamp", blanks: "1,2" },
];

const presetDigraphs: Preset[] = [
    { label: "__ip", word: "ship", blanks: "0,1" },
    { label: "fi__", word: "fish", blanks: "2,3" },
    { label: "__in", word: "chin", blanks: "0,1" },
    { label: "__at", word: "chat", blanks: "0,1" },
    { label: "ru__", word: "rush", blanks: "2,3" },
];

const allWords = [
    "cat", "dog", "sit", "bat", "bed", "hot", "sad", "bag", "big", "cup",
    "ship", "shop", "chin", "thin", "chat", "fish", "rush", "much",
    "jump", "hand", "nest", "lamp", "dust",
].sort();

// ============================================================================
// State
// ============================================================================

const targetWord = ref("cat");
const blanksInput = ref("1");
const customWord = ref("");
const questionKey = ref(0);

// --- Time-shaving controls ---
const shaveEnabled = ref(true);
const shaveTiming = ref<"instant" | "fast" | "realistic">("fast");
const shaveStrategy = ref<"random" | "geometric">("random");
const shaveMaxWaves = ref(2);
const shaveDimMs = ref(2000);
const shaveEnableMs = ref(400);
const boardSize = ref<"full" | "medium" | "small" | "tiny">("full");

const SHAVE_TIMING_MAP = {
    instant: { first: 800, interval: 600 },
    fast: { first: 2500, interval: 1500 },
    realistic: { first: 15000, interval: 15000 },
} as const;

const shaveFirstDelayMs = computed(() => SHAVE_TIMING_MAP[shaveTiming.value].first);
const shaveIntervalMs = computed(() => SHAVE_TIMING_MAP[shaveTiming.value].interval);

const BOARD_SIZE_MAP = { full: 26, medium: 12, small: 6, tiny: 4 } as const;

/**
 * Base letters seeded into the keyboard context. `undefined` → the layout's
 * default (all 26). For reduced boards we always include the current word's
 * letters (so the card stays solvable) plus alphabetical filler up to size.
 */
const initialBaseLetters = computed<string[] | undefined>(() => {
    if (boardSize.value === "full") return undefined;
    const size = BOARD_SIZE_MAP[boardSize.value];
    const wordLetters = Array.from(
        new Set(targetWord.value.toLowerCase().split("")),
    ).filter((l) => /^[a-z]$/.test(l));
    const result = [...wordLetters];
    for (const l of "abcdefghijklmnopqrstuvwxyz") {
        if (result.length >= size) break;
        if (!result.includes(l)) result.push(l);
    }
    return [...result, "space"];
});

/**
 * Remount the layout (re-seeding base letters) whenever the effective base set
 * changes — i.e. when board size changes, or when the word changes on a reduced
 * board. A full board's base is constant, so word changes there ride the inner
 * view's own questionKey remount instead.
 */
const layoutKey = computed(
    () => `${boardSize.value}|${initialBaseLetters.value?.join(",") ?? "ALL"}`,
);

interface ResponseEntry {
    word: string;
    blanks: string;
    answer: string;
    correct: boolean;
    timeSpent: number;
    performance?: Performance;
}

const responses = ref<ResponseEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const wordPresets = computed(() => allWords);

const questionData = computed(() => [
    {
        word: targetWord.value.toLowerCase(),
        blanks: blanksInput.value,
    },
]);

const parsedBlanks = computed(() => {
    if (!blanksInput.value || blanksInput.value.trim() === "") return [];
    return blanksInput.value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number)
        .filter((n) => n >= 0 && n < targetWord.value.length)
        .sort((a, b) => a - b);
});

const phoneticsInfo = computed(() => {
    const phonetics = getPhonetics(targetWord.value.toLowerCase());
    if (!phonetics) return null;

    const blankSet = new Set(parsedBlanks.value);

    return {
        phonemes: phonetics.phonemes.join(" "),
        chunkCount: phonetics.chunks.length,
        chunks: phonetics.chunks.map((chunk) => {
            const positions = Object.keys(chunk.letters).map(Number);
            return {
                label: chunk.label ?? "",
                phoneme: chunk.phoneme,
                positions: positions.join(", "),
                hasBlankedPosition: positions.some((p) => blankSet.has(p)),
            };
        }),
    };
});

// ============================================================================
// Methods
// ============================================================================

function isBlankIndex(index: number): boolean {
    return parsedBlanks.value.includes(index);
}

function toggleBlankIndex(index: number): void {
    const current = parsedBlanks.value;
    let updated: number[];
    if (current.includes(index)) {
        updated = current.filter((i) => i !== index);
    } else {
        updated = [...current, index].sort((a, b) => a - b);
    }
    // Ensure at least one blank
    if (updated.length === 0) return;
    blanksInput.value = updated.join(",");
    resetQuestion();
}

function resetQuestion(): void {
    questionKey.value++;
}

function selectWord(word: string): void {
    targetWord.value = word;
    // Auto-set blanks to middle letter for simple words
    const midIdx = Math.floor(word.length / 2);
    blanksInput.value = String(midIdx);
    resetQuestion();
}

function applyCustomWord(): void {
    const word = customWord.value.trim().toLowerCase();
    if (word) {
        targetWord.value = word;
        const midIdx = Math.floor(word.length / 2);
        blanksInput.value = String(midIdx);
        resetQuestion();
    }
}

function applyPreset(preset: Preset): void {
    targetWord.value = preset.word;
    blanksInput.value = preset.blanks;
    resetQuestion();
}

function handleResponse(response: any): void {
    responses.value.unshift({
        word: targetWord.value,
        blanks: blanksInput.value,
        answer: response.userAnswer ?? response.answer ?? "(none)",
        correct: response.isCorrect ?? response.correct ?? false,
        timeSpent: response.timeSpent || 0,
        performance: response.performance,
    });
    if (responses.value.length > 20) responses.value.pop();
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    questionKey.value = 1;
});
</script>

<style scoped>
.ml-config {
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

.config-hint {
    font-size: 0.75rem;
    color: #888;
    margin-top: 6px;
    font-style: italic;
}

.config-sublabel {
    font-size: 0.7rem;
    font-weight: 600;
    color: #777;
    margin: 10px 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}

.shave-toggle {
    flex-wrap: wrap;
}

.custom-word-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.custom-word-row .v-text-field {
    flex: 1;
}

/* Blanks toggle grid */
.blanks-toggle-grid {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
}

.blanks-toggle-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 48px;
    border: 2px solid #ccc;
    border-radius: 6px;
    cursor: pointer;
    background: white;
    transition: all 0.15s ease;
    user-select: none;
}

.blanks-toggle-cell:hover {
    border-color: #2196f3;
    background: #e3f2fd;
}

.blanks-toggle-cell--blank {
    border-color: #f57c00;
    background: #fff3e0;
    border-style: dashed;
}

.blanks-toggle-cell--blank:hover {
    border-color: #e65100;
    background: #ffe0b2;
}

.blanks-toggle-letter {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.2;
}

.blanks-toggle-cell--blank .blanks-toggle-letter {
    color: #f57c00;
    text-decoration: line-through;
}

.blanks-toggle-index {
    font-size: 0.6rem;
    color: #999;
    line-height: 1;
}

/* Presets */
.preset-group {
    margin-bottom: 8px;
}

.preset-group:last-child {
    margin-bottom: 0;
}

.preset-group-label {
    font-size: 0.7rem;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
}

.preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

/* Phonetics info */
.phonetics-info {
    font-size: 0.85rem;
}

.phonetics-row {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
}

.phonetics-label {
    font-weight: 600;
    color: #555;
    min-width: 70px;
}

.phonetics-value {
    font-family: monospace;
}

.phonetics-chunk {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    font-family: monospace;
    font-size: 0.8rem;
}

.chunk-label {
    font-weight: 700;
    color: #1565c0;
    min-width: 30px;
}

.chunk-phoneme {
    color: #666;
}

.chunk-positions {
    color: #999;
    font-size: 0.75rem;
}

.no-phonetics {
    color: #999;
    font-style: italic;
    font-size: 0.85rem;
}

/* Response log */
.response-log {
    max-height: 200px;
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
}

.response-text {
    font-family: monospace;
    font-size: 0.8rem;
}

/* TaggedPerformance display */
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