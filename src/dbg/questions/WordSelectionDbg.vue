<!--
  WordSelectionDbg.vue - Debug view for WordSelection question type with keyboard context

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: Configuration, presets, difficulty status, response log, audio test
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout
        title="Word Selection"
        :supports-modify-difficulty="true"
        :modify-difficulty-used="true"
    >
        <!-- Configuration slot (left column) -->
        <template #config="{ modifyDifficulty: md }">
            <div class="ws-config">
                <!-- Target word configuration -->
                <div class="config-section">
                    <div class="config-label">Target Word</div>
                    <v-text-field
                        v-model="targetWord"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="wish"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Distractors (comma-separated)
                    </div>
                    <v-text-field
                        v-model="distractors"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="dish, fish"
                    />
                </div>

                <div class="config-section">
                    <div class="config-label">
                        Custom Instruction (optional)
                    </div>
                    <v-text-field
                        v-model="instruction"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="Find the word..."
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

                <!-- Quick presets -->
                <div class="config-section">
                    <div class="config-label">Quick Presets</div>
                    <div class="preset-chips">
                        <v-chip
                            size="small"
                            color="success"
                            variant="outlined"
                            @click="applyPreset('wish-rhymes')"
                        >
                            wish / dish / fish
                        </v-chip>
                        <v-chip
                            size="small"
                            color="success"
                            variant="outlined"
                            @click="applyPreset('bag-vowels')"
                        >
                            bag vowels
                        </v-chip>
                        <v-chip
                            size="small"
                            color="success"
                            variant="outlined"
                            @click="applyPreset('cat-consonants')"
                        >
                            cat / bat / hat
                        </v-chip>
                        <v-chip
                            size="small"
                            color="success"
                            variant="outlined"
                            @click="applyPreset('ship-minimal')"
                        >
                            ship / chip / sip
                        </v-chip>
                        <v-chip
                            size="small"
                            color="success"
                            variant="outlined"
                            @click="applyPreset('bed-minimal')"
                        >
                            bed / bad / bid
                        </v-chip>
                    </div>
                </div>

                <!-- Difficulty status -->
                <div class="config-section">
                    <div class="config-label">Difficulty Status</div>
                    <div class="difficulty-status">
                        <div class="difficulty-status-row">
                            <span class="difficulty-status-label">modifyDifficulty wired</span>
                            <v-chip size="x-small" color="success" variant="flat">
                                yes
                            </v-chip>
                        </div>
                        <div class="difficulty-status-row">
                            <span class="difficulty-status-label">currently used by this dbg view</span>
                            <v-chip size="x-small" color="success" variant="flat">
                                yes
                            </v-chip>
                        </div>
                        <div class="difficulty-status-row">
                            <span class="difficulty-status-label">current modifyDifficulty</span>
                            <span class="difficulty-status-value">{{ md }}</span>
                        </div>
                        <div class="difficulty-status-note">
                            Word Selection uses <code>modifyDifficulty</code> to vary how many
                            distractor options are built when the card is reset.
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
                            class="response-entry"
                        >
                            <div class="response-item">
                                <v-chip
                                    :color="response.correct ? 'success' : 'error'"
                                    size="x-small"
                                    class="mr-2"
                                >
                                    {{ response.correct ? "✓" : "✗" }}
                                </v-chip>
                                <span class="response-text">
                                    "{{ response.answer }}" for "{{
                                        response.target
                                    }}" ({{ response.timeSpent }}ms)
                                </span>
                            </div>
                            <!-- TaggedPerformance breakdown -->
                            <div v-if="response.performance" class="performance-tags">
                                <div
                                    v-for="(score, tag) in response.performance"
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

                <!-- Audio test panel -->
                <div class="config-section">
                    <div class="config-label">Audio Test</div>
                    <div class="audio-test">
                        <v-text-field
                            v-model="audioTestWord"
                            variant="outlined"
                            density="compact"
                            hide-details
                            placeholder="fish"
                            class="audio-test-input"
                        />
                        <v-btn
                            color="info"
                            variant="elevated"
                            size="small"
                            @click="testAudio"
                        >
                            🔊 Test
                        </v-btn>
                    </div>
                    <div
                        v-if="audioTestResult"
                        class="audio-result"
                        :class="audioTestResult.class"
                    >
                        {{ audioTestResult.message }}
                    </div>
                    <audio
                        ref="testAudioElement"
                        @ended="
                            audioTestResult = {
                                message: '✓ Played successfully',
                                class: 'audio-result--success',
                            }
                        "
                        @error="
                            audioTestResult = {
                                message: '✗ Audio not found',
                                class: 'audio-result--error',
                            }
                        "
                    />
                </div>
            </div>
        </template>

        <!-- Question content (right column) -->
        <template #default="{ modifyDifficulty: md }">
            <WordSelectionView
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
import type { Performance } from "@vue-skuilder/common";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import WordSelectionView from "../../questions/WordSelectionView.vue";

// ============================================================================
// State
// ============================================================================

const targetWord = ref("wish");
const distractors = ref("dish, fish");
const instruction = ref("");
const questionKey = ref(0);
const audioTestWord = ref("");
const audioTestResult = ref<{ message: string; class: string } | null>(null);
const testAudioElement = ref<HTMLAudioElement | null>(null);

interface ResponseEntry {
    target: string;
    answer: string;
    correct: boolean;
    timeSpent: number;
    performance?: Performance;
}

const responses = ref<ResponseEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const questionData = computed(() => [
    {
        target: targetWord.value.toLowerCase().trim(),
        distractors: distractors.value,
        instruction: instruction.value || '',
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
        target: targetWord.value,
        answer: response.userAnswer ?? response.answer ?? "(none)",
        correct: response.isCorrect ?? response.correct ?? false,
        timeSpent: response.timeSpent || 0,
        performance: response.performance,
    });

    // Keep last 10
    if (responses.value.length > 10) {
        responses.value.pop();
    }
}

function applyPreset(preset: string): void {
    switch (preset) {
        case "wish-rhymes":
            targetWord.value = "wish";
            distractors.value = "dish, fish";
            instruction.value = "";
            break;
        case "bag-vowels":
            targetWord.value = "bag";
            distractors.value = "beg, big, bog, bug";
            instruction.value = "";
            break;
        case "cat-consonants":
            targetWord.value = "cat";
            distractors.value = "bat, hat, sat, rat";
            instruction.value = "";
            break;
        case "ship-minimal":
            targetWord.value = "ship";
            distractors.value = "chip, sip, tip";
            instruction.value = "";
            break;
        case "bed-minimal":
            targetWord.value = "bed";
            distractors.value = "bad, bid, bud";
            instruction.value = "";
            break;
    }
    resetQuestion();
}

function testAudio(): void {
    if (!testAudioElement.value || !audioTestWord.value.trim()) return;

    const word = audioTestWord.value.toLowerCase().trim();
    const audioUrl = `/audio/words/${word}.mp3`;

    audioTestResult.value = {
        message: "Loading...",
        class: "audio-result--loading",
    };
    testAudioElement.value.src = audioUrl;
    testAudioElement.value.play().catch(() => {
        audioTestResult.value = {
            message: "✗ Audio not found or failed to play",
            class: "audio-result--error",
        };
    });
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
.ws-config {
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

.difficulty-status {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.difficulty-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.difficulty-status-label {
    font-size: 0.8rem;
    color: #444;
}

.difficulty-status-value {
    font-family: monospace;
    font-size: 0.8rem;
    font-weight: 700;
    color: #333;
    background: #eeeeee;
    border-radius: 4px;
    padding: 2px 8px;
}

.difficulty-status-note {
    font-size: 0.78rem;
    color: #666;
    line-height: 1.4;
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

/* Audio test */
.audio-test {
    display: flex;
    gap: 8px;
    align-items: center;
}

.audio-test-input {
    flex: 1;
}

.audio-result {
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 8px;
    padding: 4px 8px;
    border-radius: 4px;
}

.audio-result--success {
    background: #e8f5e9;
    color: #2e7d32;
}

.audio-result--error {
    background: #ffebee;
    color: #c62828;
}

.audio-result--loading {
    background: #fff3e0;
    color: #f57c00;
}
</style>
