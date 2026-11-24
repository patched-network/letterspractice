<template>
    <div class="keyboard-container-layout">
        <!-- Navigation bar -->
        <div class="container-navigation">
            <router-link to="/dbg" class="back-link">
                <v-btn
                    variant="outlined"
                    color="primary"
                    prepend-icon="mdi-arrow-left"
                    size="small"
                >
                    Back to Debug Index
                </v-btn>
            </router-link>

            <div class="breadcrumb">
                <span class="breadcrumb-item">Debug</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item">Keyboard Container</span>
                <template v-if="childTitle">
                    <span class="breadcrumb-separator">›</span>
                    <span class="breadcrumb-current">{{ childTitle }}</span>
                </template>
            </div>

            <!-- Child route selector -->
            <v-select
                v-model="selectedChild"
                :items="childRouteOptions"
                label="Test Component"
                variant="outlined"
                density="compact"
                hide-details
                class="child-selector"
                @update:model-value="navigateToChild"
            />
        </div>

        <!-- Context state debug panel (collapsible) -->
        <v-expansion-panels v-model="debugPanelOpen" class="debug-panels mb-2">
            <v-expansion-panel value="context">
                <v-expansion-panel-title>
                    <div class="d-flex align-center ga-2">
                        <v-icon size="small">mdi-bug</v-icon>
                        <span>Keyboard Context State</span>
                        <v-chip size="x-small" color="success" v-if="keyboardContext.hasQuestionConfig.value">
                            Config Active
                        </v-chip>
                    </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                    <v-row dense>
                        <v-col cols="12" md="4">
                            <div class="state-item">
                                <strong>Base Letters ({{ keyboardContext.baseLetters.value.length }}):</strong>
                                <div class="letter-chips">
                                    <v-chip
                                        v-for="letter in keyboardContext.baseLetters.value.slice(0, 15)"
                                        :key="letter"
                                        size="x-small"
                                        color="primary"
                                        variant="outlined"
                                    >
                                        {{ letter }}
                                    </v-chip>
                                    <span v-if="keyboardContext.baseLetters.value.length > 15" class="text-caption">
                                        +{{ keyboardContext.baseLetters.value.length - 15 }} more
                                    </span>
                                </div>
                            </div>
                        </v-col>
                        <v-col cols="12" md="4">
                            <div class="state-item">
                                <strong>Active Letters ({{ keyboardContext.activeLetters.value.length }}):</strong>
                                <div class="letter-chips">
                                    <v-chip
                                        v-for="letter in keyboardContext.activeLetters.value.slice(0, 15)"
                                        :key="letter"
                                        size="x-small"
                                        color="success"
                                    >
                                        {{ letter }}
                                    </v-chip>
                                    <span v-if="keyboardContext.activeLetters.value.length > 15" class="text-caption">
                                        +{{ keyboardContext.activeLetters.value.length - 15 }} more
                                    </span>
                                </div>
                            </div>
                        </v-col>
                        <v-col cols="12" md="4">
                            <div class="state-item">
                                <strong>Enabled Letters ({{ keyboardContext.enabledLetters.value.length }}):</strong>
                                <div class="letter-chips">
                                    <v-chip
                                        v-for="letter in keyboardContext.enabledLetters.value.slice(0, 15)"
                                        :key="letter"
                                        size="x-small"
                                        color="info"
                                    >
                                        {{ letter }}
                                    </v-chip>
                                    <span v-if="keyboardContext.enabledLetters.value.length > 15" class="text-caption">
                                        +{{ keyboardContext.enabledLetters.value.length - 15 }} more
                                    </span>
                                </div>
                            </div>
                        </v-col>
                    </v-row>
                    <v-row dense class="mt-2">
                        <v-col cols="12" md="6">
                            <div class="state-item">
                                <strong>Highlights:</strong>
                                <span v-if="keyboardContext.highlights.value.size === 0" class="text-medium-emphasis">
                                    (none)
                                </span>
                                <v-chip
                                    v-for="[letter, highlight] in keyboardContext.highlights.value"
                                    :key="letter"
                                    size="x-small"
                                    :color="typeof highlight === 'string' ? highlight : 'warning'"
                                    variant="elevated"
                                    class="mr-1"
                                >
                                    {{ letter }}
                                </v-chip>
                            </div>
                        </v-col>
                        <v-col cols="12" md="6">
                            <div class="state-item d-flex ga-2 align-center">
                                <strong>Flags:</strong>
                                <v-chip
                                    size="x-small"
                                    :color="keyboardContext.showAdvance.value ? 'success' : 'grey'"
                                >
                                    Advance: {{ keyboardContext.showAdvance.value ? 'On' : 'Off' }}
                                </v-chip>
                                <v-chip
                                    size="x-small"
                                    :color="keyboardContext.disabled.value ? 'error' : 'grey'"
                                >
                                    Disabled: {{ keyboardContext.disabled.value ? 'Yes' : 'No' }}
                                </v-chip>
                            </div>
                        </v-col>
                    </v-row>

                    <!-- Base letter group selector -->
                    <v-row dense class="mt-3">
                        <v-col cols="12" md="6">
                            <v-select
                                v-model="selectedLetterGroup"
                                :items="letterGroupOptions"
                                label="Base Letter Group"
                                variant="outlined"
                                density="compact"
                                hide-details
                            />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-btn
                                variant="outlined"
                                color="secondary"
                                size="small"
                                @click="keyboardContext.clearQuestionConfig()"
                            >
                                Clear Question Config
                            </v-btn>
                        </v-col>
                    </v-row>
                </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="events">
                <v-expansion-panel-title>
                    <div class="d-flex align-center ga-2">
                        <v-icon size="small">mdi-format-list-bulleted</v-icon>
                        <span>Event Log</span>
                        <v-chip size="x-small" color="primary">
                            {{ events.length }}
                        </v-chip>
                    </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                    <div class="d-flex justify-end mb-2">
                        <v-btn size="x-small" variant="text" @click="clearEvents">Clear</v-btn>
                    </div>
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
                        <div v-if="events.length === 0" class="text-medium-emphasis text-center pa-2">
                            No events yet
                        </div>
                    </div>
                </v-expansion-panel-text>
            </v-expansion-panel>
        </v-expansion-panels>

        <!-- Child content area -->
        <div class="child-content-area">
            <router-view />
        </div>

        <!-- Persistent Keyboard Area (fixed at bottom) -->
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
                @keyhover="handleKeyboardHover"
                @kbd-space="handleKeyboardAdvance"
                @arrow-left="handleKeyboardArrowLeft"
                @arrow-right="handleKeyboardArrowRight"
                @backspace="keyboardContext.dispatchBackspace()"
                @invalid-key="handleKeyboardInvalidKey"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import {
    createKeyboardContext,
    KEYBOARD_CONTEXT_KEY,
    type KeyEvent,
} from '../composables/useKeyboardContext';
import { LETTER_GROUPS } from '../components/keyboard/keyboardLayout';

// ============================================================================
// Router
// ============================================================================

const route = useRoute();
const router = useRouter();

// Child route options for the selector
const childRouteOptions = [
    { title: 'Spelling Question', value: 'spelling' },
    { title: 'Simple Key Echo', value: 'echo' },
    { title: 'PhoneticWord Stepper', value: 'phonetic' },
];

const selectedChild = computed({
    get: () => {
        // Extract child route from current path
        const path = route.path;
        const match = path.match(/\/dbg\/kbc\/(.+)/);
        return match ? match[1] : 'spelling';
    },
    set: () => {
        // Handled by navigateToChild
    },
});

const childTitle = computed(() => {
    const option = childRouteOptions.find(o => o.value === selectedChild.value);
    return option?.title || null;
});

function navigateToChild(value: string) {
    router.push(`/dbg/kbc/${value}`);
}

// ============================================================================
// Keyboard Context Setup (Provider Role - like StudyPracticeView)
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
// Base Letter Configuration
// ============================================================================

const letterGroupOptions = [
    { title: 'All Letters', value: 'allLetters' },
    { title: 'CVC Basic + Space', value: 'cvcBasicWithSpace' },
    { title: 'CVC Basic', value: 'cvcBasic' },
    { title: 'Short Vowels', value: 'shortVowels' },
    { title: 'Home Row', value: 'homeRow' },
    { title: 'All Letters + Space', value: 'allLettersWithSpace' },
];

const selectedLetterGroup = ref<keyof typeof LETTER_GROUPS>('allLettersWithSpace');

// Update base letters when group changes
watch(selectedLetterGroup, (group) => {
    keyboardContext.setBaseLetters(LETTER_GROUPS[group]);
});

// Initialize base letters
onMounted(() => {
    keyboardContext.setBaseLetters(LETTER_GROUPS[selectedLetterGroup.value]);
});

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
// Event Handling & Logging
// ============================================================================

interface EventLogEntry {
    time: string;
    type: string;
    data: string;
}

const events = ref<EventLogEntry[]>([]);
const debugPanelOpen = ref<string[]>([]);

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

function handleKeyboardHover(event: KeyEvent) {
    keyboardContext.dispatchKeyHover(event);
    logEvent('keyhover', event.letter);
}

function handleKeyboardAdvance() {
    keyboardContext.dispatchAdvance();
    logEvent('advance', 'spacebar');
}

function handleKeyboardArrowLeft() {
    keyboardContext.dispatchArrowLeft();
    logEvent('arrow-left', 'left arrow');
}

function handleKeyboardArrowRight() {
    keyboardContext.dispatchArrowRight();
    logEvent('arrow-right', 'right arrow');
}

function handleKeyboardInvalidKey(letter: string) {
    keyboardContext.dispatchInvalidKey(letter);
    logEvent('invalid-key', letter);
}
</script>

<style scoped>
.keyboard-container-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100%;
}

.container-navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    background: white;
    flex-wrap: wrap;
}

.back-link {
    text-decoration: none;
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #666;
    flex: 1;
}

.breadcrumb-item {
    opacity: 0.7;
}

.breadcrumb-separator {
    opacity: 0.5;
    font-weight: bold;
}

.breadcrumb-current {
    font-weight: 600;
    color: rgb(var(--v-theme-primary));
}

.child-selector {
    min-width: 200px;
    max-width: 250px;
}

.debug-panels {
    margin: 8px 16px;
}

.state-item {
    margin-bottom: 4px;
}

.state-item strong {
    display: block;
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 2px;
}

.letter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
}

.events-container {
    max-height: 150px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 0.75rem;
}

.event-item {
    display: flex;
    gap: 8px;
    padding: 2px 4px;
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

.event-keytap .event-type { color: #4CAF50; }
.event-keypress .event-type { color: #2196F3; }
.event-keyrelease .event-type { color: #9C27B0; }
.event-advance .event-type { color: #FF9800; }
.event-invalid-key .event-type { color: #F44336; }

.event-data {
    color: #333;
}

.child-content-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    padding-bottom: 280px; /* Space for keyboard */
}

.keyboard-area {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.9), white);
    padding: 12px 16px 16px;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
    z-index: 100;
}

@media (max-width: 768px) {
    .container-navigation {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }

    .breadcrumb {
        order: -1;
        flex: none;
    }

    .child-selector {
        width: 100%;
        max-width: none;
    }

    .child-content-area {
        padding: 12px;
        padding-bottom: 260px;
    }
}

@media (min-width: 960px) {
    .keyboard-area {
        padding: 16px 10%;
    }
}
</style>
