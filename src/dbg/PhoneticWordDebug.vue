<template>
    <div class="phonetic-word-debug">
        <h1>🔊 PhoneticWord Component Debug</h1>
        <p class="subtitle">Test phonetic exploration, audio playback, and stepper functionality</p>

        <!-- Word Selection -->
        <section class="debug-section">
            <h2>Word Configuration</h2>
            <div class="controls-row">
                <v-autocomplete
                    v-model="selectedWordKey"
                    :items="wordOptions"
                    :custom-filter="fuzzyFilter"
                    item-title="label"
                    item-value="key"
                    label="Select Word (type to search)"
                    variant="outlined"
                    density="comfortable"
                    class="word-select"
                    clearable
                    auto-select-first
                />
                <v-text-field
                    v-model="customWord"
                    label="Custom Word"
                    variant="outlined"
                    density="comfortable"
                    placeholder="Type a word..."
                    class="custom-word-input"
                />
                <v-btn color="primary" @click="useCustomWord" :disabled="!customWord">
                    Use Custom
                </v-btn>
            </div>
        </section>

        <!-- Two Column Layout -->
        <div class="two-column-layout">
            <!-- Left Column: Main Demo Area -->
            <div class="left-column">
                <section class="debug-section demo-section">
                    <h2>Interactive Demo</h2>
                    <div class="demo-container">
                        <div class="word-display-area">
                            <PhoneticWord
                                ref="phoneticWordRef"
                                :word="currentWordConfig.word"
                                :word-audio="currentWordConfig.wordAudio"
                                :speaker-timings="currentWordConfig.speakerTimings"
                                :phonetic-chunks="currentWordConfig.phoneticChunks"
                                :options="wordOptions_display"
                                :height="150"
                                :clickable-letters="clickableLetters"
                                :underline-next-chunk="underlineNextChunk"
                                :underline-color="underlineColor"
                                :include-whole-word-step="includeWholeWordStep"
                                :chunk-delay="chunkDelay"
                                @word-created="handleWordCreated"
                                @word-destroyed="handleWordDestroyed"
                                @chunk-played="handleChunkPlayed"
                                @chunk-complete="handleChunkComplete"
                                @word-audio-started="handleWordAudioStarted"
                                @word-audio-ended="handleWordAudioEnded"
                                @letter-clicked="handleLetterClicked"
                                @stepper-advanced="handleStepperAdvanced"
                                @stepper-complete="handleStepperComplete"
                            />
                        </div>

                        <!-- Chunk Visualization -->
                        <div class="chunk-visualization" v-if="currentWordConfig.phoneticChunks">
                            <h4>Phonetic Chunks</h4>
                            <div class="chunks-row">
                                <div
                                    v-for="(chunk, index) in currentWordConfig.phoneticChunks"
                                    :key="index"
                                    class="chunk-badge"
                                    :class="{ active: currentStep === index }"
                                    @click="playSpecificChunk(index)"
                                >
                                    <span class="chunk-letters">{{ getChunkLetters(chunk) }}</span>
                                    <span class="chunk-label" v-if="chunk.label">{{ chunk.label }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Playback Controls -->
                    <div class="playback-controls">
                        <v-btn-group variant="outlined">
                            <v-btn
                                color="success"
                                @click="playWord"
                                :disabled="!currentWordConfig.wordAudio"
                                prepend-icon="mdi-play"
                            >
                                Play Word
                            </v-btn>
                            <v-btn
                                color="warning"
                                @click="stopWord"
                                prepend-icon="mdi-stop"
                            >
                                Stop
                            </v-btn>
                        </v-btn-group>

                        <v-divider vertical class="mx-4" />

                        <v-btn-group variant="outlined">
                            <v-btn
                                color="primary"
                                @click="stepPrevious"
                                :disabled="currentStep <= 0"
                                icon="mdi-skip-previous"
                            />
                            <v-btn
                                color="primary"
                                @click="stepNext"
                                prepend-icon="mdi-skip-next"
                            >
                                Step ({{ currentStep + 1 }}/{{ totalChunks }})
                            </v-btn>
                            <v-btn
                                color="primary"
                                @click="resetStepper"
                                icon="mdi-restart"
                            />
                        </v-btn-group>

                        <v-divider vertical class="mx-4" />

                        <v-btn
                            color="secondary"
                            @click="playAllChunks"
                            prepend-icon="mdi-play-box-multiple"
                        >
                            Play All Chunks
                        </v-btn>

                        <v-divider vertical class="mx-4" />

                        <v-btn-group variant="outlined">
                            <v-btn
                                color="pink"
                                @click="celebrateRandom"
                                prepend-icon="mdi-party-popper"
                            >
                                Celebrate
                            </v-btn>
                            <v-btn
                                color="pink-lighten-2"
                                @click="celebrateUnison"
                            >
                                Unison
                            </v-btn>
                            <v-btn
                                color="pink-lighten-2"
                                @click="celebrateStagger"
                            >
                                Stagger
                            </v-btn>
                            <v-btn
                                color="pink-lighten-2"
                                @click="celebrateWave"
                            >
                                Wave
                            </v-btn>
                        </v-btn-group>
                    </div>
                </section>
            </div>

            <!-- Right Column: Settings, Effect Testing, Event Log -->
            <div class="right-column">
                <!-- Settings -->
                <section class="debug-section">
                    <h2>Settings</h2>
                    <div class="settings-grid">
                        <v-switch
                            v-model="clickableLetters"
                            label="Clickable Letters"
                            color="primary"
                            hide-details
                        />
                        <v-switch
                            v-model="showCharacterMode"
                            label="Character Mode (eyes/mouth/arms)"
                            color="primary"
                            hide-details
                        />
                        <v-switch
                            v-model="underlineNextChunk"
                            label="Underline Next Chunk"
                            color="primary"
                            hide-details
                        />
                        <v-switch
                            v-model="includeWholeWordStep"
                            label="Include 'Whole Word' Step"
                            color="primary"
                            hide-details
                        />
                        <div class="color-picker-row">
                            <label for="letter-color" class="color-label">Letter Color</label>
                            <input
                                id="letter-color"
                                v-model="letterColor"
                                type="color"
                                class="color-input"
                            />
                            <span class="color-value">{{ letterColor }}</span>
                        </div>
                        <div class="color-picker-row">
                            <label for="underline-color" class="color-label">Underline Color</label>
                            <input
                                id="underline-color"
                                v-model="underlineColor"
                                type="color"
                                class="color-input"
                            />
                            <span class="color-value">{{ underlineColor }}</span>
                        </div>
                        <v-slider
                            v-model="chunkDelay"
                            :min="100"
                            :max="1000"
                            :step="50"
                            label="Chunk Delay (ms)"
                            thumb-label
                            hide-details
                        />
                    </div>
                </section>

                <!-- Effect Test Panel -->
                <section class="debug-section">
                    <h2>Effect Testing</h2>
                    <div class="effect-test-content">
                        <div class="effect-test-controls">
                            <v-select
                                v-model="testEffectType"
                                :items="effectTypes"
                                label="Effect Type"
                                variant="outlined"
                                density="comfortable"
                            />
                            <v-text-field
                                v-model.number="testLetterIndex"
                                type="number"
                                label="Letter Index"
                                variant="outlined"
                                density="comfortable"
                                :min="0"
                                :max="currentWordConfig.word.length - 1"
                            />
                            <v-btn color="accent" @click="testEffect" block>
                                Apply Effect
                            </v-btn>
                        </div>
                        <div class="effect-description">
                            <strong>Effects:</strong>
                            <ul>
                                <li><code>speak</code> - Mouth animation (opens and closes)</li>
                                <li><code>highlight</code> - Yellow color flash</li>
                                <li><code>bounce</code> - Upward bounce animation</li>
                                <li><code>glow</code> - Gold glow effect</li>
                                <li><code>silent-e</code> - Subtle opacity pulse</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <!-- Event Log -->
                <section class="debug-section">
                    <h2>Event Log</h2>
                    <div class="event-log">
                        <div class="event-log-controls">
                            <v-btn size="small" variant="text" @click="clearEventLog">
                                Clear Log
                            </v-btn>
                        </div>
                        <ul class="event-list">
                            <li v-for="(event, index) in eventLog" :key="index" :class="event.type">
                                <span class="event-time">{{ event.time }}</span>
                                <span class="event-type">{{ event.type }}</span>
                                <span class="event-data">{{ event.data }}</span>
                            </li>
                        </ul>
                        <div v-if="eventLog.length === 0" class="no-events">
                            No events yet. Interact with the word above to see events.
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <!-- Word Configuration Examples (full width at bottom) -->
        <section class="debug-section">
            <h2>Configuration Examples</h2>
            <v-expansion-panels>
                <v-expansion-panel title="Current Word Configuration">
                    <v-expansion-panel-text>
                        <pre class="config-code">{{ JSON.stringify(currentWordConfig, null, 2) }}</pre>
                    </v-expansion-panel-text>
                </v-expansion-panel>
                <v-expansion-panel title="API Reference">
                    <v-expansion-panel-text>
                        <div class="api-reference">
                            <h4>Props</h4>
                            <ul>
                                <li><code>word</code> - The literal spelling of the word</li>
                                <li><code>wordAudio</code> - URL(s) for whole-word audio</li>
                                <li><code>speakerTimings</code> - Timing offsets for letter animations during word playback</li>
                                <li><code>phoneticChunks</code> - Ordered list of phonetic segments with audio and effects</li>
                                <li><code>clickableLetters</code> - Enable clicking letters to play their chunk</li>
                                <li><code>underlineNextChunk</code> - Underline the next chunk in the stepper sequence</li>
                                <li><code>underlineColor</code> - Color for the next chunk underline (CSS color string)</li>
                                <li><code>includeWholeWordStep</code> - Include a "whole word" step at the end of the sequence</li>
                                <li><code>chunkDelay</code> - Delay between chunks when auto-playing</li>
                            </ul>
                            <h4>Exposed Methods</h4>
                            <ul>
                                <li><code>playWord()</code> - Play word audio with synchronized animations</li>
                                <li><code>stopWord()</code> - Stop word audio</li>
                                <li><code>playChunk(index)</code> - Play a specific phonetic chunk</li>
                                <li><code>stepNext()</code> / <code>stepPrevious()</code> - Navigate chunks</li>
                                <li><code>playAllChunks()</code> - Auto-play through all chunks</li>
                                <li><code>resetStepper()</code> - Reset to beginning</li>
                            </ul>
                            <h4>Events</h4>
                            <ul>
                                <li><code>@chunk-played</code> - Emitted when a chunk starts playing</li>
                                <li><code>@chunk-complete</code> - Emitted when a chunk finishes</li>
                                <li><code>@letter-clicked</code> - Emitted when a letter is clicked</li>
                                <li><code>@stepper-advanced</code> - Emitted when stepper moves</li>
                                <li><code>@stepper-complete</code> - Emitted when all chunks played</li>
                            </ul>
                        </div>
                    </v-expansion-panel-text>
                </v-expansion-panel>
            </v-expansion-panels>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { PhoneticWord } from "../letterpeople/vue";
import type { PhoneticChunk, LetterEffect } from "../letterpeople/vue";
import type { Word } from "../letterpeople/Word";
import type { LetterInstance } from "../letterpeople/types";
import { getPhonetics, getAvailableWords, computeSpeakerTimingsForWord } from "../services/phonetics";
import type { SpeakerTiming } from "../services/phonetics";

// ============================================================================
// Types
// ============================================================================

interface WordConfig {
    word: string;
    wordAudio?: string;
    speakerTimings?: SpeakerTiming[];
    phoneticChunks?: PhoneticChunk[];
}

interface EventLogEntry {
    time: string;
    type: string;
    data: string;
}

// ============================================================================
// Load Word Configurations from Generated Index
// ============================================================================

// Build SAMPLE_WORDS dynamically from the generated phonetic index
const SAMPLE_WORDS: Record<string, WordConfig> = {};

const availableWords = getAvailableWords();
availableWords.forEach(word => {
    const phonetics = getPhonetics(word);
    if (phonetics) {
        // Note: wordAudio and speakerTimings are now auto-looked up by PhoneticWord
        // We only need to provide them explicitly for overrides
        SAMPLE_WORDS[word] = {
            word: phonetics.word,
            phoneticChunks: phonetics?.chunks as PhoneticChunk[],
            // wordAudio and speakerTimings will be auto-computed by PhoneticWord
        };
    }
});

console.log(`[PhoneticWordDebug] Loaded ${availableWords.length} words with auto-lookup enabled`);

// ============================================================================
// Refs & State
// ============================================================================

const phoneticWordRef = ref<InstanceType<typeof PhoneticWord> | null>(null);
const selectedWordKey = ref<string>("ship"); // Default to 'ship' (known to be in index)
const customWord = ref<string>("");
const eventLog = ref<EventLogEntry[]>([]);

// Settings
const clickableLetters = ref(true);
const showCharacterMode = ref(true);
const underlineNextChunk = ref(true);
const underlineColor = ref('#1976d2');
const includeWholeWordStep = ref(false);
const chunkDelay = ref(300);
const letterColor = ref('#FF6B6B');

// Effect testing
const testEffectType = ref<LetterEffect>('speak');
const testLetterIndex = ref(0);
const effectTypes: LetterEffect[] = ['speak', 'highlight', 'bounce', 'glow', 'silent-e', 'r-control', 'l-control'];

// Stepper state (tracked locally for UI)
const currentStep = ref(-1);
const totalChunks = ref(0);

// ============================================================================
// Computed
// ============================================================================

const wordOptions = computed(() =>
    Object.entries(SAMPLE_WORDS).map(([key, config]) => ({
        key,
        label: `${config.word} (${config.phoneticChunks?.length || 0} chunks)`,
    }))
);

const currentWordConfig = computed((): WordConfig => {
    return SAMPLE_WORDS[selectedWordKey.value] || SAMPLE_WORDS[availableWords[0]] || { word: 'test', phoneticChunks: [] };
});

const wordOptions_display = computed(() => ({
    letterOptions: {
        color: letterColor.value,
        ...(showCharacterMode.value ? {
            showEyes: true,
            showMouth: true,
            showArms: false,
        } : {}),
    },
    spacing: 8,
}));

// ============================================================================
// Methods
// ============================================================================

/**
 * Fuzzy filter for word search.
 * Matches if all characters in the query appear in order in the word.
 * Examples: "shp" matches "ship", "cak" matches "cake"
 */
const fuzzyFilter = (itemTitle: string, queryText: string, item: any) => {
    if (!queryText) return true;

    const word = item.raw.key.toLowerCase();
    const query = queryText.toLowerCase().trim();

    // Simple substring match (fast path)
    if (word.includes(query)) return true;

    // Fuzzy match: all query chars must appear in order
    let queryIndex = 0;
    for (let i = 0; i < word.length && queryIndex < query.length; i++) {
        if (word[i] === query[queryIndex]) {
            queryIndex++;
        }
    }

    return queryIndex === query.length;
};

const useCustomWord = () => {
    if (!customWord.value) return;

    // Create a simple config for custom word (no audio)
    SAMPLE_WORDS['custom'] = {
        word: customWord.value,
        phoneticChunks: customWord.value.split('').map((char, i) => ({
            letters: { [i]: 'speak' as LetterEffect },
            phoneme: 'AH', // todo: map
            label: char,
        })),
    };
    selectedWordKey.value = 'custom';
};

const getChunkLetters = (chunk: PhoneticChunk): string => {
    const indices = Object.keys(chunk.letters).map(Number).sort((a, b) => a - b);
    return indices.map(i => currentWordConfig.value.word[i] || '?').join('');
};

// Playback controls
const playWord = () => phoneticWordRef.value?.playWord();
const stopWord = () => phoneticWordRef.value?.stopWord();
const stepNext = () => phoneticWordRef.value?.stepNext();
const stepPrevious = () => phoneticWordRef.value?.stepPrevious();
const resetStepper = () => {
    phoneticWordRef.value?.resetStepper();
    currentStep.value = -1;
};
const playAllChunks = () => phoneticWordRef.value?.playAllChunks();
const playSpecificChunk = (index: number) => phoneticWordRef.value?.playChunk(index);

// Celebration controls
const doCelebrate = async (strategy: 'random' | 'unison' | 'stagger' | 'wave') => {
    const word = phoneticWordRef.value?.getWordInstance();
    if (word) {
        addEventLog('celebrate', `Strategy: ${strategy}`);
        await word.celebrate({ strategy });
        addEventLog('celebrate', 'Complete');
    }
};
const celebrateRandom = () => doCelebrate('random');
const celebrateUnison = () => doCelebrate('unison');
const celebrateStagger = () => doCelebrate('stagger');
const celebrateWave = () => doCelebrate('wave');

// Effect testing
const testEffect = async () => {
    const letter = phoneticWordRef.value?.getLetterInstance(testLetterIndex.value);
    if (letter) {
        await phoneticWordRef.value?.applyEffect(letter, testEffectType.value);
        addEventLog('effect-test', `Applied ${testEffectType.value} to letter ${testLetterIndex.value}`);
    }
};

// Event logging
const addEventLog = (type: string, data: string) => {
    eventLog.value.unshift({
        time: new Date().toLocaleTimeString(),
        type,
        data,
    });
    if (eventLog.value.length > 50) {
        eventLog.value = eventLog.value.slice(0, 50);
    }
};

const clearEventLog = () => {
    eventLog.value = [];
};

// ============================================================================
// Event Handlers
// ============================================================================

const handleWordCreated = (instance: Word) => {
    addEventLog('word-created', `Created word with ${instance.length} letters`);
    totalChunks.value = currentWordConfig.value.phoneticChunks?.length || 0;
    currentStep.value = -1;
};

const handleWordDestroyed = () => {
    addEventLog('word-destroyed', 'Word instance destroyed');
};

const handleChunkPlayed = (payload: { index: number; chunk: PhoneticChunk }) => {
    addEventLog('chunk-played', `Chunk ${payload.index}: "${getChunkLetters(payload.chunk)}" (${payload.chunk.label || 'no label'})`);
    currentStep.value = payload.index;
};

const handleChunkComplete = (payload: { index: number; chunk: PhoneticChunk }) => {
    addEventLog('chunk-complete', `Chunk ${payload.index} finished`);
};

const handleWordAudioStarted = () => {
    addEventLog('word-audio-started', 'Word audio playback started');
};

const handleWordAudioEnded = () => {
    addEventLog('word-audio-ended', 'Word audio playback ended');
};

const handleLetterClicked = (payload: { index: number; letter: LetterInstance }) => {
    addEventLog('letter-clicked', `Letter ${payload.index}: "${payload.letter.character}"`);
};

const handleStepperAdvanced = (payload: { from: number; to: number }) => {
    addEventLog('stepper-advanced', `${payload.from} → ${payload.to}`);
    currentStep.value = payload.to;
};

const handleStepperComplete = () => {
    addEventLog('stepper-complete', 'All chunks played');
};
</script>

<style scoped>
.phonetic-word-debug {
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
}

.phonetic-word-debug h1 {
    margin-bottom: 8px;
    color: #1976d2;
}

.subtitle {
    color: #666;
    margin-bottom: 24px;
}

.debug-section {
    margin-bottom: 32px;
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    background: #fafafa;
}

.debug-section h2 {
    margin-top: 0;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #1976d2;
    color: #333;
}

.controls-row {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
}

.word-select {
    min-width: 300px;
    flex: 1;
    max-width: 400px;
}

.custom-word-input {
    min-width: 200px;
}

.demo-section {
    background: #fff;
}

.demo-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    margin-bottom: 24px;
}

.word-display-area {
    padding: 32px;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    border-radius: 16px;
    min-width: 300px;
    display: flex;
    justify-content: center;
}

.chunk-visualization {
    text-align: center;
}

.chunk-visualization h4 {
    margin-bottom: 12px;
    color: #666;
}

.chunks-row {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
}

.chunk-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 20px;
    background: #e3f2fd;
    border: 2px solid #90caf9;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.chunk-badge:hover {
    background: #bbdefb;
    transform: translateY(-2px);
}

.chunk-badge.active {
    background: #1976d2;
    border-color: #1976d2;
    color: white;
}

.chunk-letters {
    font-size: 1.5rem;
    font-weight: bold;
    font-family: monospace;
}

.chunk-label {
    font-size: 0.85rem;
    opacity: 0.8;
    margin-top: 4px;
}

.playback-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 16px;
    background: #f5f5f5;
    border-radius: 8px;
}

.settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    align-items: center;
}

.color-picker-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.color-label {
    font-size: 14px;
    color: #333;
}

.color-input {
    width: 50px;
    height: 40px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.2s;
}

.color-input:hover {
    border-color: #1976d2;
}

.color-value {
    font-family: monospace;
    font-size: 13px;
    color: #666;
    background: #f5f5f5;
    padding: 4px 8px;
    border-radius: 4px;
}

.event-log {
    background: #263238;
    border-radius: 8px;
    padding: 16px;
    max-height: 300px;
    overflow-y: auto;
}

.event-log-controls {
    text-align: right;
    margin-bottom: 8px;
}

.event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-family: monospace;
    font-size: 13px;
}

.event-list li {
    padding: 6px 8px;
    border-bottom: 1px solid #37474f;
    display: flex;
    gap: 12px;
    color: #b0bec5;
}

.event-time {
    color: #78909c;
    min-width: 80px;
}

.event-type {
    color: #4fc3f7;
    min-width: 140px;
    font-weight: 500;
}

.event-list li.chunk-played .event-type { color: #81c784; }
.event-list li.chunk-complete .event-type { color: #aed581; }
.event-list li.letter-clicked .event-type { color: #ffb74d; }
.event-list li.word-audio-started .event-type { color: #ba68c8; }
.event-list li.word-audio-ended .event-type { color: #ce93d8; }
.event-list li.stepper-advanced .event-type { color: #4dd0e1; }
.event-list li.stepper-complete .event-type { color: #80deea; }
.event-list li.effect-test .event-type { color: #f48fb1; }

.event-data {
    color: #eceff1;
}

.no-events {
    color: #78909c;
    text-align: center;
    padding: 24px;
    font-style: italic;
}

.config-code {
    background: #263238;
    color: #a5d6a7;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 12px;
}

.api-reference {
    line-height: 1.8;
}

.api-reference h4 {
    margin-top: 16px;
    margin-bottom: 8px;
    color: #1976d2;
}

.api-reference code {
    background: #e3f2fd;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
}

.two-column-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
}

.left-column,
.right-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.effect-test-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.effect-test-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.effect-description {
    background: #fff3e0;
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid #ff9800;
}

.effect-description ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
}

.effect-description code {
    background: #ffe0b2;
    padding: 1px 4px;
    border-radius: 3px;
}

@media (max-width: 768px) {
    .phonetic-word-debug {
        padding: 16px;
    }

    .controls-row {
        flex-direction: column;
        align-items: stretch;
    }

    .word-select,
    .custom-word-input {
        min-width: unset;
        width: 100%;
    }

    .playback-controls {
        flex-direction: column;
    }

    .two-column-layout {
        grid-template-columns: 1fr;
    }
}
</style>
