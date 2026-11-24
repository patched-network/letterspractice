<template>
    <div class="phonetic-word-child">
        <h2 class="text-h5 mb-2">PhoneticWord + Keyboard Stepper</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
            Press <kbd>spacebar</kbd> to step through phonetic chunks.
            The spacebar key color matches the underline color.
        </p>

        <!-- Word configuration -->
        <v-card class="config-card mb-4" elevation="1">
            <v-card-text>
                <v-row dense>
                    <v-col cols="12" md="4">
                        <v-select
                            v-model="selectedWord"
                            :items="wordOptions"
                            label="Word"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-text-field
                            v-model="underlineColor"
                            label="Underline Color"
                            variant="outlined"
                            density="compact"
                            hide-details
                        >
                            <template v-slot:prepend-inner>
                                <div
                                    class="color-preview"
                                    :style="{ backgroundColor: underlineColor }"
                                />
                            </template>
                        </v-text-field>
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-btn
                            color="secondary"
                            variant="outlined"
                            @click="resetStepper"
                        >
                            <v-icon start>mdi-restart</v-icon>
                            Reset
                        </v-btn>
                    </v-col>
                </v-row>

                <v-row dense class="mt-2">
                    <v-col cols="12" md="4">
                        <v-switch
                            v-model="includeWholeWord"
                            label="Include whole word step"
                            color="primary"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-switch
                            v-model="showUnderline"
                            label="Show next chunk underline"
                            color="primary"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-slider
                            v-model="wordHeight"
                            :min="60"
                            :max="200"
                            :step="10"
                            label="Height"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Stepper state display -->
        <v-card class="stepper-state mb-4" elevation="1">
            <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-2">
                <div class="d-flex align-center ga-2">
                    <span class="text-body-2 text-medium-emphasis">Step:</span>
                    <v-chip color="primary" size="small">
                        {{ currentStep + 1 }} / {{ totalSteps }}
                    </v-chip>
                </div>
                <div class="d-flex align-center ga-2">
                    <span class="text-body-2 text-medium-emphasis">Status:</span>
                    <v-chip :color="statusColor" size="small">
                        {{ statusText }}
                    </v-chip>
                </div>
                <div class="d-flex align-center ga-2">
                    <span class="text-body-2 text-medium-emphasis">Events:</span>
                    <v-chip color="info" size="small">
                        {{ eventCount }}
                    </v-chip>
                </div>
            </v-card-text>
        </v-card>

        <!-- PhoneticWord display -->
        <v-card class="word-display-card mb-4" elevation="2">
            <v-card-text class="d-flex justify-center align-center pa-6">
                <PhoneticWord
                    ref="phoneticWordRef"
                    :key="wordKey"
                    :word="currentWordConfig.word"
                    :phonetic-chunks="currentWordConfig.phoneticChunks"
                    :word-audio="currentWordConfig.wordAudio"
                    :speaker-timings="currentWordConfig.speakerTimings"
                    :height="wordHeight"
                    :max-width="500"
                    :underline-next-chunk="showUnderline"
                    :underline-color="underlineColor"
                    :include-whole-word-step="includeWholeWord"
                    :keyboard-context="keyboard"
                    :clickable-letters="true"
                    @stepper-advanced="handleStepperAdvanced"
                    @stepper-complete="handleStepperComplete"
                    @chunk-played="handleChunkPlayed"
                    @chunk-complete="handleChunkComplete"
                />
            </v-card-text>
        </v-card>

        <!-- Event log -->
        <v-card v-if="events.length > 0" class="event-log" elevation="1">
            <v-card-title class="d-flex justify-space-between align-center text-subtitle-1">
                Event Log
                <v-btn size="x-small" variant="text" @click="clearEvents">Clear</v-btn>
            </v-card-title>
            <v-card-text>
                <div class="events-list">
                    <div
                        v-for="(event, i) in events"
                        :key="i"
                        class="event-item"
                        :class="`event-${event.type}`"
                    >
                        <span class="event-time">{{ event.time }}</span>
                        <span class="event-type">{{ event.type }}</span>
                        <span class="event-data">{{ event.data }}</span>
                    </div>
                </div>
            </v-card-text>
        </v-card>

        <!-- Instructions -->
        <v-alert type="info" variant="tonal" class="mt-4">
            <strong>How it works:</strong>
            <ul class="mt-2 mb-0">
                <li>PhoneticWord receives <code>keyboardContext</code> prop</li>
                <li>It subscribes to <code>onAdvance</code> events (spacebar)</li>
                <li>Each advance calls <code>stepNext()</code> internally</li>
                <li>The advance button color is set to <code>underlineColor</code></li>
            </ul>
        </v-alert>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import PhoneticWord from '../../letterpeople/vue/PhoneticWord.vue';
import type { PhoneticChunk } from '../../letterpeople/vue/PhoneticWord.vue';
import { useKeyboardContext } from '../../composables/useKeyboardContext';
import { getPhonetics, getAvailableWords, computeSpeakerTimingsForWord } from '../../services/phonetics';
import type { SpeakerTiming } from '../../services/phonetics';

// ============================================================================
// Keyboard Context
// ============================================================================

const keyboard = useKeyboardContext();

// Configure keyboard - we only need the advance button
keyboard.requestConfig({
    letters: [],
    showAdvance: true,
});

// Cleanup on unmount
onUnmounted(() => {
    keyboard.clearQuestionConfig();
});

// ============================================================================
// Word Configurations
// ============================================================================

interface WordConfig {
    word: string;
    phoneticChunks: PhoneticChunk[];
    wordAudio?: string;
    speakerTimings?: SpeakerTiming[];
}

// Build word configs dynamically from the generated phonetic index
const SHOWCASE_WORDS = ['cat', 'dog', 'ship', 'cake', 'fish'];
const WORD_CONFIGS: Record<string, WordConfig> = {};

for (const word of SHOWCASE_WORDS) {
    const phonetics = getPhonetics(word);
    if (phonetics) {
        // Note: wordAudio and speakerTimings are now auto-looked up by PhoneticWord
        WORD_CONFIGS[word] = {
            word: phonetics.word,
            phoneticChunks: phonetics.chunks as PhoneticChunk[],
            // wordAudio and speakerTimings will be auto-computed by PhoneticWord
        };
    }
}

const wordOptions = Object.keys(WORD_CONFIGS).map(key => ({
    title: WORD_CONFIGS[key].word,
    value: key,
}));

// ============================================================================
// State
// ============================================================================

const selectedWord = ref('cat');
const underlineColor = ref('#FF5722'); // Deep orange - visible and friendly
const showUnderline = ref(true);
const includeWholeWord = ref(true);
const wordHeight = ref(120);
const wordKey = ref(0);
const phoneticWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);

const currentStep = ref(-1);
const eventCount = ref(0);

interface EventLogEntry {
    time: string;
    type: string;
    data: string;
}

const events = ref<EventLogEntry[]>([]);

// ============================================================================
// Computed
// ============================================================================

const currentWordConfig = computed(() => WORD_CONFIGS[selectedWord.value]);

const totalSteps = computed(() => {
    const chunks = currentWordConfig.value.phoneticChunks.length;
    return chunks + (includeWholeWord.value ? 1 : 0);
});

const statusText = computed(() => {
    if (currentStep.value < 0) return 'Ready';
    if (currentStep.value >= totalSteps.value - 1) return 'Complete';
    return 'Stepping';
});

const statusColor = computed(() => {
    if (currentStep.value < 0) return 'grey';
    if (currentStep.value >= totalSteps.value - 1) return 'success';
    return 'primary';
});

// ============================================================================
// Event Handlers
// ============================================================================

function logEvent(type: string, data: string) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

    events.value.unshift({ time, type, data });
    eventCount.value++;

    if (events.value.length > 30) {
        events.value.pop();
    }
}

function handleStepperAdvanced(payload: { from: number; to: number }) {
    currentStep.value = payload.to;
    logEvent('advance', `${payload.from} → ${payload.to}`);
}

function handleStepperComplete() {
    logEvent('complete', 'Stepper finished');
}

function handleChunkPlayed(payload: { index: number; chunk: any }) {
    logEvent('chunk-play', `#${payload.index}: ${payload.chunk.label || 'chunk'}`);
}

function handleChunkComplete(payload: { index: number; chunk: any }) {
    logEvent('chunk-done', `#${payload.index}`);
}

function resetStepper() {
    wordKey.value++;
    currentStep.value = -1;
    logEvent('reset', 'Stepper reset');
}

function clearEvents() {
    events.value = [];
    eventCount.value = 0;
}

// ============================================================================
// Watchers
// ============================================================================

watch(selectedWord, () => {
    wordKey.value++;
    currentStep.value = -1;
    logEvent('word-change', currentWordConfig.value.word);
});

watch(underlineColor, (color) => {
    // The keyboard advance color will update automatically via PhoneticWord
    logEvent('color-change', color);
});
</script>

<style scoped>
.phonetic-word-child {
    max-width: 800px;
    margin: 0 auto;
}

.config-card {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

.color-preview {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.2);
}

.word-display-card {
    background: #fafafa;
    min-height: 200px;
}

.stepper-state {
    background: rgba(var(--v-theme-primary), 0.05);
}

.events-list {
    max-height: 200px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 0.75rem;
}

.event-item {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.event-time {
    color: #888;
    flex-shrink: 0;
}

.event-type {
    font-weight: 600;
    min-width: 80px;
}

.event-advance .event-type { color: #FF5722; }
.event-complete .event-type { color: #4CAF50; }
.event-chunk-play .event-type { color: #2196F3; }
.event-chunk-done .event-type { color: #9C27B0; }
.event-reset .event-type { color: #607D8B; }
.event-word-change .event-type { color: #FF9800; }
.event-color-change .event-type { color: #E91E63; }

.event-data {
    color: #333;
}

kbd {
    background: #eee;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: monospace;
    font-size: 0.875em;
}

code {
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.875em;
}

ul {
    padding-left: 20px;
}

ul li {
    margin-bottom: 4px;
}
</style>
