<template>
    <div class="keyboard-context-debug">
        <h1>Keyboard Context Debug</h1>
        <p class="subtitle">
            Testing the keyboard context system for question-keyboard communication
        </p>

        <!-- Configuration Panel -->
        <v-card class="config-panel mb-4" elevation="2">
            <v-card-title>Base Configuration</v-card-title>
            <v-card-text>
                <v-row>
                    <v-col cols="12" md="6">
                        <v-select
                            v-model="selectedLetterGroup"
                            :items="letterGroupOptions"
                            label="Letter Group"
                            variant="outlined"
                            density="compact"
                        />
                    </v-col>
                    <v-col cols="12" md="6">
                        <v-text-field
                            v-model="customWord"
                            label="Test Word"
                            variant="outlined"
                            density="compact"
                            hint="Word for the spelling question"
                        />
                    </v-col>
                </v-row>

                <v-row>
                    <v-col cols="12" md="4">
                        <v-select
                            v-model="scaffoldLevel"
                            :items="scaffoldOptions"
                            label="Scaffold Level"
                            variant="outlined"
                            density="compact"
                        />
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-switch
                            v-model="showQuestion"
                            label="Show Question"
                            color="primary"
                        />
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-btn
                            color="primary"
                            variant="elevated"
                            @click="resetQuestion"
                        >
                            Reset Question
                        </v-btn>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Context State Display -->
        <v-card class="context-state mb-4" elevation="2">
            <v-card-title>Keyboard Context State</v-card-title>
            <v-card-text>
                <v-row>
                    <v-col cols="12" md="6">
                        <div class="state-item">
                            <strong>Base Letters:</strong>
                            <v-chip-group>
                                <v-chip
                                    v-for="letter in keyboardContext.baseLetters.value"
                                    :key="letter"
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                >
                                    {{ letter }}
                                </v-chip>
                            </v-chip-group>
                        </div>
                    </v-col>
                    <v-col cols="12" md="6">
                        <div class="state-item">
                            <strong>Active Letters:</strong>
                            <v-chip-group>
                                <v-chip
                                    v-for="letter in keyboardContext.activeLetters.value"
                                    :key="letter"
                                    size="small"
                                    color="success"
                                >
                                    {{ letter }}
                                </v-chip>
                            </v-chip-group>
                        </div>
                    </v-col>
                </v-row>

                <v-row>
                    <v-col cols="12" md="6">
                        <div class="state-item">
                            <strong>Highlighted:</strong>
                            <v-chip-group>
                                <v-chip
                                    v-for="[letter, color] in keyboardContext.highlights.value"
                                    :key="letter"
                                    size="small"
                                    :color="typeof color === 'string' ? color : 'warning'"
                                    variant="elevated"
                                >
                                    {{ letter }}
                                </v-chip>
                            </v-chip-group>
                            <span v-if="keyboardContext.highlights.value.size === 0" class="text-medium-emphasis">
                                (none)
                            </span>
                        </div>
                    </v-col>
                    <v-col cols="12" md="6">
                        <div class="state-item">
                            <strong>Has Question Config:</strong>
                            <v-chip
                                :color="keyboardContext.hasQuestionConfig.value ? 'success' : 'grey'"
                                size="small"
                            >
                                {{ keyboardContext.hasQuestionConfig.value ? 'Yes' : 'No' }}
                            </v-chip>
                        </div>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Event Log -->
        <v-card class="event-log mb-4" elevation="2">
            <v-card-title class="d-flex justify-space-between align-center">
                Event Log
                <v-btn
                    size="small"
                    variant="text"
                    color="secondary"
                    @click="clearEvents"
                >
                    Clear
                </v-btn>
            </v-card-title>
            <v-card-text>
                <div class="events-container">
                    <div
                        v-for="(event, index) in events"
                        :key="index"
                        class="event-item"
                        :class="`event-${event.type}`"
                    >
                        <span class="event-time">{{ event.time }}</span>
                        <span class="event-type">{{ event.type }}</span>
                        <span class="event-data">{{ event.data }}</span>
                    </div>
                    <div v-if="events.length === 0" class="text-medium-emphasis text-center pa-4">
                        No events yet. Press keys to see events.
                    </div>
                </div>
            </v-card-text>
        </v-card>

        <!-- Question Area -->
        <div v-if="showQuestion" class="question-area mb-4">
            <SpellingQuestionView
                :key="questionKey"
                :data="questionData"
                @emit-response="handleQuestionResponse"
            />
        </div>

        <!-- Manual Controls -->
        <v-card class="manual-controls mb-4" elevation="2">
            <v-card-title>Manual Context Controls</v-card-title>
            <v-card-text>
                <v-row>
                    <v-col cols="12" md="4">
                        <v-text-field
                            v-model="testLetter"
                            label="Test Letter"
                            variant="outlined"
                            density="compact"
                            maxlength="1"
                        />
                    </v-col>
                    <v-col cols="12" md="8">
                        <v-btn-group variant="outlined">
                            <v-btn @click="simulateKeyTap">
                                Simulate Tap
                            </v-btn>
                            <v-btn @click="triggerHint">
                                Hint (Pulse)
                            </v-btn>
                            <v-btn @click="triggerShake">
                                Hint (Shake)
                            </v-btn>
                            <v-btn @click="flashKeyTest">
                                Flash
                            </v-btn>
                        </v-btn-group>
                    </v-col>
                </v-row>

                <v-row class="mt-2">
                    <v-col>
                        <v-btn
                            variant="outlined"
                            color="secondary"
                            @click="keyboardContext.clearQuestionConfig()"
                        >
                            Clear Question Config
                        </v-btn>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Keyboard Area -->
        <div class="keyboard-area">
            <ProgressiveKeyboard
                ref="keyboardRef"
                :letters="keyboardLetters"
                :enabled-letters="keyboardEnabledLetters"
                :highlighted-letters="keyboardHighlightedLetters"
                :key-colors="keyboardColors"
                :show-full-layout="false"
                :play-phoneme-on-press="true"
                :capture-keyboard="true"
                :lowercase-keycaps="true"
                @keypress="handleKeyboardPress"
                @keyrelease="handleKeyboardRelease"
                @keytap="handleKeyboardTap"
                @kbd-space="handleKeyboardAdvance"
                @invalid-key="handleKeyboardInvalidKey"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, provide } from 'vue';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import SpellingQuestionView from '../questions/SpellingQuestionView.vue';
import {
    createKeyboardContext,
    provideKeyboardContext,
    KEYBOARD_CONTEXT_KEY,
    type KeyEvent,
} from '../composables/useKeyboardContext';
import { LETTER_GROUPS } from '../components/keyboard/keyboardLayout';

// ============================================================================
// Keyboard Context Setup (simulating StudyPracticeView)
// ============================================================================

const keyboardContext = createKeyboardContext();
provide(KEYBOARD_CONTEXT_KEY, keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

// Connect keyboard ref when mounted
watch(keyboardRef, (newRef) => {
    if (newRef) {
        keyboardContext.connectKeyboard(newRef);
    }
});

// ============================================================================
// Configuration
// ============================================================================

const letterGroupOptions = [
    { title: 'CVC Basic + Space', value: 'cvcBasicWithSpace' },
    { title: 'CVC Basic', value: 'cvcBasic' },
    { title: 'Short Vowels', value: 'shortVowels' },
    { title: 'Home Row', value: 'homeRow' },
    { title: 'All Letters', value: 'allLetters' },
    { title: 'All Letters + Space', value: 'allLettersWithSpace' },
];

const scaffoldOptions = [
    { title: 'Level 0 - Full Scaffold (Color Coded)', value: 0 },
    { title: 'Level 1 - Blanks Only', value: 1 },
    { title: 'Level 2 - Length Hint Only', value: 2 },
    { title: 'Level 3 - No Hints', value: 3 },
];

const selectedLetterGroup = ref<keyof typeof LETTER_GROUPS>('cvcBasicWithSpace');
const customWord = ref('cat');
const scaffoldLevel = ref(0);
const showQuestion = ref(true);
const questionKey = ref(0);
const testLetter = ref('a');

// Update base letters when group changes
watch(selectedLetterGroup, (group) => {
    keyboardContext.setBaseLetters(LETTER_GROUPS[group]);
});

// Initialize base letters
onMounted(() => {
    keyboardContext.setBaseLetters(LETTER_GROUPS[selectedLetterGroup.value]);
});

// ============================================================================
// Question Data
// ============================================================================

const questionData = computed(() => [{
    word: customWord.value.toLowerCase(),
    scaffoldLevel: scaffoldLevel.value,
}]);

function resetQuestion() {
    questionKey.value++;
    keyboardContext.clearQuestionConfig();
}

function handleQuestionResponse(response: any) {
    logEvent('response', JSON.stringify(response));
}

// ============================================================================
// Keyboard Props (computed from context)
// ============================================================================

const keyboardLetters = computed(() => {
    const active = keyboardContext.activeLetters.value;
    if (keyboardContext.showAdvance.value && !active.includes('space')) {
        return [...active, 'space'];
    }
    return active;
});

const keyboardEnabledLetters = computed(() => {
    const enabled = keyboardContext.enabledLetters.value;
    if (keyboardContext.showAdvance.value && !enabled.includes('space')) {
        return [...enabled, 'space'];
    }
    return enabled;
});

const keyboardHighlightedLetters = computed(() => {
    return Array.from(keyboardContext.highlights.value.keys());
});

const keyboardColors = computed(() => {
    const colors: Record<string, string> = { ...keyboardContext.keyColors.value };

    for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
        if (typeof highlight === 'string') {
            colors[letter] = highlight;
        }
    }

    if (keyboardContext.advanceColor.value) {
        colors['space'] = keyboardContext.advanceColor.value;
    }

    return colors;
});

// ============================================================================
// Event Handling
// ============================================================================

interface EventLogEntry {
    time: string;
    type: string;
    data: string;
}

const events = ref<EventLogEntry[]>([]);

function logEvent(type: string, data: string) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

    events.value.unshift({ time, type, data });

    // Keep only last 50 events
    if (events.value.length > 50) {
        events.value.pop();
    }
}

function clearEvents() {
    events.value = [];
}

function handleKeyboardPress(event: KeyEvent) {
    keyboardContext.dispatchKeyPress(event);
    logEvent('keypress', event.letter);
}

function handleKeyboardRelease(event: KeyEvent) {
    keyboardContext.dispatchKeyRelease(event);
    logEvent('keyrelease', event.letter);
}

function handleKeyboardTap(event: KeyEvent) {
    keyboardContext.dispatchKeyTap(event);
    logEvent('keytap', `${event.letter} (${event.source})`);
}

function handleKeyboardAdvance() {
    keyboardContext.dispatchAdvance();
    logEvent('advance', 'spacebar');
}

function handleKeyboardInvalidKey(letter: string) {
    keyboardContext.dispatchInvalidKey(letter);
    logEvent('invalid-key', letter);
}

// ============================================================================
// Manual Controls
// ============================================================================

function simulateKeyTap() {
    if (testLetter.value) {
        keyboardContext.simulateKeyTap(testLetter.value);
        logEvent('simulate', `tap ${testLetter.value}`);
    }
}

function triggerHint() {
    if (testLetter.value) {
        keyboardContext.hintKey(testLetter.value, 'pulse', { duration: 400 });
        logEvent('hint', `pulse ${testLetter.value}`);
    }
}

function triggerShake() {
    if (testLetter.value) {
        keyboardContext.hintKey(testLetter.value, 'shake', { duration: 400 });
        logEvent('hint', `shake ${testLetter.value}`);
    }
}

function flashKeyTest() {
    if (testLetter.value) {
        keyboardContext.flashKey(testLetter.value, '#FFD700', 500);
        logEvent('flash', testLetter.value);
    }
}
</script>

<style scoped>
.keyboard-context-debug {
    padding: 20px;
    max-width: 900px;
    margin: 0 auto;
    padding-bottom: 300px; /* Space for keyboard */
}

.keyboard-context-debug h1 {
    text-align: center;
    margin-bottom: 8px;
}

.subtitle {
    text-align: center;
    color: #666;
    margin-bottom: 24px;
}

.state-item {
    margin-bottom: 12px;
}

.state-item strong {
    display: block;
    margin-bottom: 4px;
    font-size: 0.875rem;
    color: #666;
}

.events-container {
    max-height: 200px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 0.85rem;
}

.event-item {
    display: flex;
    gap: 12px;
    padding: 4px 8px;
    border-bottom: 1px solid #eee;
}

.event-time {
    color: #999;
    min-width: 100px;
}

.event-type {
    font-weight: 600;
    min-width: 80px;
}

.event-keytap .event-type { color: #4caf50; }
.event-keypress .event-type { color: #2196f3; }
.event-keyrelease .event-type { color: #9e9e9e; }
.event-advance .event-type { color: #ff9800; }
.event-invalid-key .event-type { color: #f44336; }
.event-response .event-type { color: #9c27b0; }
.event-simulate .event-type { color: #00bcd4; }
.event-hint .event-type { color: #e91e63; }
.event-flash .event-type { color: #ffc107; }

.event-data {
    color: #333;
}

.question-area {
    max-width: 500px;
    margin: 0 auto;
}

.keyboard-area {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #f5f5f5;
    border-top: 1px solid #ddd;
    padding: 12px;
    display: flex;
    justify-content: center;
    z-index: 100;
}
</style>
