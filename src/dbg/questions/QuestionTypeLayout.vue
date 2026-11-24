<!--
  QuestionTypeLayout.vue - Layout for question type debug views with keyboard context

  A two-column layout that provides:
  - Left column: Configuration panels, debug logging, presets (collapsible)
  - Right column: Question content area + ProgressiveKeyboard

  This layout provides keyboard context to child components, similar to
  KeyboardContainerLayout but optimized for question type testing.
-->

<template>
    <div class="question-type-layout">
        <!-- Header with navigation -->
        <div class="layout-header">
            <router-link to="/dbg" class="back-link">
                <v-btn
                    variant="text"
                    color="primary"
                    prepend-icon="mdi-arrow-left"
                    size="small"
                >
                    Debug Index
                </v-btn>
            </router-link>

            <div class="breadcrumb">
                <span class="breadcrumb-item">Question Types</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-current">{{ questionTitle }}</span>
            </div>

            <!-- Question type selector -->
            <v-select
                v-model="selectedQuestion"
                :items="questionOptions"
                label="Question Type"
                variant="outlined"
                density="compact"
                hide-details
                class="question-selector"
                @update:model-value="navigateToQuestion"
            />
        </div>

        <!-- Main content area: two columns -->
        <div class="layout-content">
            <!-- Left column: Configuration & Debug -->
            <div
                class="left-column"
                :class="{ 'left-column--collapsed': leftColumnCollapsed }"
            >
                <div class="column-header">
                    <span class="column-title">Configuration</span>
                    <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        @click="leftColumnCollapsed = !leftColumnCollapsed"
                    >
                        <v-icon>{{
                            leftColumnCollapsed
                                ? "mdi-chevron-right"
                                : "mdi-chevron-left"
                        }}</v-icon>
                    </v-btn>
                </div>

                <div v-show="!leftColumnCollapsed" class="column-content">
                    <!-- Keyboard State Monitor -->
                    <v-expansion-panels
                        v-model="expandedPanels"
                        multiple
                        class="debug-panels"
                    >
                        <v-expansion-panel value="events">
                            <v-expansion-panel-title>
                                <div class="panel-title">
                                    <v-icon size="small"
                                        >mdi-format-list-bulleted</v-icon
                                    >
                                    <span>Event Log</span>
                                    <v-chip size="x-small" color="primary">{{
                                        events.length
                                    }}</v-chip>
                                </div>
                            </v-expansion-panel-title>
                            <v-expansion-panel-text>
                                <div class="events-header">
                                    <v-btn
                                        size="x-small"
                                        variant="text"
                                        @click="clearEvents"
                                        >Clear</v-btn
                                    >
                                </div>
                                <div class="events-container">
                                    <div
                                        v-for="(event, index) in events"
                                        :key="index"
                                        class="event-item"
                                        :class="`event-${event.type}`"
                                    >
                                        <span class="event-time">{{
                                            event.time
                                        }}</span>
                                        <span class="event-type">{{
                                            event.type
                                        }}</span>
                                        <span class="event-data">{{
                                            event.data
                                        }}</span>
                                    </div>
                                    <div
                                        v-if="events.length === 0"
                                        class="no-events"
                                    >
                                        No events yet
                                    </div>
                                </div>
                            </v-expansion-panel-text>
                        </v-expansion-panel>

                        <v-expansion-panel value="keyboard-state">
                            <v-expansion-panel-title>
                                <div class="panel-title">
                                    <v-icon size="small">mdi-monitor-eye</v-icon>
                                    <span>Keyboard State</span>
                                </div>
                            </v-expansion-panel-title>
                            <v-expansion-panel-text>
                                <div class="state-section">
                                    <div class="state-label">Base Letters ({{ keyboardContext.baseLetters.value.length }})</div>
                                    <div class="state-value">{{ keyboardContext.baseLetters.value.join(', ') || '(none)' }}</div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Active Letters ({{ keyboardContext.activeLetters.value.length }})</div>
                                    <div class="state-value">{{ keyboardContext.activeLetters.value.join(', ') || '(none)' }}</div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Enabled Letters ({{ keyboardContext.enabledLetters.value.length }})</div>
                                    <div class="state-value">{{ keyboardContext.enabledLetters.value.join(', ') || '(none)' }}</div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Has Question Config</div>
                                    <div class="state-value">{{ keyboardContext.hasQuestionConfig.value ? 'Yes' : 'No' }}</div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Show Advance</div>
                                    <div class="state-value">{{ keyboardContext.showAdvance.value ? 'Yes' : 'No' }}</div>
                                </div>
                            </v-expansion-panel-text>
                        </v-expansion-panel>

                        <v-expansion-panel value="difficulty-debug">
                            <v-expansion-panel-title>
                                <div class="panel-title">
                                    <v-icon size="small">mdi-tune-variant</v-icon>
                                    <span>Difficulty Debug</span>
                                </div>
                            </v-expansion-panel-title>
                            <v-expansion-panel-text>
                                <div class="state-section">
                                    <div class="state-label">User ELO</div>
                                    <div class="difficulty-input-row">
                                        <v-slider
                                            v-model="userElo"
                                            :min="0"
                                            :max="2500"
                                            :step="25"
                                            density="compact"
                                            hide-details
                                            class="difficulty-slider"
                                        />
                                        <v-text-field
                                            v-model.number="userElo"
                                            type="number"
                                            variant="outlined"
                                            density="compact"
                                            hide-details
                                            class="difficulty-number"
                                        />
                                    </div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Card ELO</div>
                                    <div class="difficulty-input-row">
                                        <v-slider
                                            v-model="cardElo"
                                            :min="0"
                                            :max="2500"
                                            :step="25"
                                            density="compact"
                                            hide-details
                                            class="difficulty-slider"
                                        />
                                        <v-text-field
                                            v-model.number="cardElo"
                                            type="number"
                                            variant="outlined"
                                            density="compact"
                                            hide-details
                                            class="difficulty-number"
                                        />
                                    </div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">modifyDifficulty</div>
                                    <div class="state-value">
                                        {{ modifyDifficulty }}
                                    </div>
                                </div>
                                <div class="state-section">
                                    <div class="state-label">Capability</div>
                                    <div class="state-value">
                                        wired: {{ supportsModifyDifficulty ? "yes" : "no" }}
                                        <template v-if="supportsModifyDifficulty">
                                            · used: {{ modifyDifficultyUsed ? "yes" : "unknown" }}
                                        </template>
                                    </div>
                                </div>
                                <div class="difficulty-actions">
                                    <v-btn
                                        size="x-small"
                                        variant="text"
                                        @click="resetDifficultyDebug"
                                    >
                                        Reset to neutral
                                    </v-btn>
                                </div>
                                <div class="difficulty-note">
                                    Shared debug values only affect question views whose
                                    dbg wrappers opt in and pass through
                                    <code>modifyDifficulty</code>. Threshold details are
                                    intentionally not shown here because they are not exposed
                                    by a shared runtime metadata API.
                                </div>
                            </v-expansion-panel-text>
                        </v-expansion-panel>
                    </v-expansion-panels>

                    <!-- Slot for question-specific configuration -->
                    <div class="config-slot">
                        <slot name="config" :modify-difficulty="modifyDifficulty"></slot>
                    </div>
                </div>
            </div>

            <!-- Right column: Question content only -->
            <div class="right-column">
                <div class="question-area">
                    <slot :modify-difficulty="modifyDifficulty"></slot>
                </div>
            </div>
        </div>

        <!-- Keyboard area (direct child of root flex container) -->
        <div class="keyboard-area">
            <ProgressiveKeyboard
                ref="keyboardRef"
                :letters="keyboardLetters"
                :enabled-letters="keyboardEnabledLetters"
                :highlighted-letters="keyboardHighlightedLetters"
                :key-colors="keyboardColors"
                :space-text="keyboardSpaceText"
                :show-full-layout="keyboardContext.showFullLayout.value"
                :play-phoneme-on-press="false"
                :capture-keyboard="true"
                :lowercase-keycaps="true"
                :disabled="keyboardContext.disabled.value"
                :disable-transition-ms="keyboardContext.disableTransitionMs.value"
                :enable-transition-ms="keyboardContext.enableTransitionMs.value"
                @keypress="handleKeyboardPress"
                @keyrelease="handleKeyboardRelease"
                @keytap="handleKeyboardTap"
                @keyhover="handleKeyboardHover"
                @keyhoverend="handleKeyboardHoverEnd"
                @kbd-space="handleKeyboardAdvance"
                @kbd-enter="handleKeyboardEnter"
                @arrow-left="handleKeyboardArrowLeft"
                @arrow-right="handleKeyboardArrowRight"
                @backspace="keyboardContext.dispatchBackspace()"
                @invalid-key="handleKeyboardInvalidKey"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import ProgressiveKeyboard from "../../components/keyboard/ProgressiveKeyboard.vue";
import {
    createKeyboardContext,
    KEYBOARD_CONTEXT_KEY,
    type KeyEvent,
} from "../../composables/useKeyboardContext";
import { LETTER_GROUPS } from "../../components/keyboard/keyboardLayout";
import {
    QUESTION_DEBUG_DIFFICULTY_CONTEXT_KEY,
    createQuestionDebugDifficultyContext,
} from "./useQuestionDebugDifficulty";

// ============================================================================
// Props
// ============================================================================

const props = defineProps<{
    /** Title to display in breadcrumb */
    title?: string;
    /** Initial base letters. Defaults to all letters. Pass [] for empty keyboard. */
    initialBaseLetters?: string[];
    /** Whether the current dbg wrapper passes modifyDifficulty through to the question view. */
    supportsModifyDifficulty?: boolean;
    /** Whether the current question type is known to currently use modifyDifficulty for content shaping. */
    modifyDifficultyUsed?: boolean | null;
}>();

// ============================================================================
// Router
// ============================================================================

const route = useRoute();
const router = useRouter();

const questionOptions = [
    { title: "Spelling Question", value: "spelling" },
    { title: "Who Said That?", value: "who-said-that" },
    { title: "Word Selection", value: "word-selection" },
    { title: "Missing Letters", value: "missing-letters" },
    { title: "GPC Introduction", value: "gpc-intro" },
    { title: "Digraph GPC Introduction", value: "digraph-gpc-intro" },
    { title: "Split Digraph Introduction", value: "split-digraph-intro" },
    { title: "Sight Word Introduction", value: "sight-word-intro" },
];

const selectedQuestion = computed({
    get: () => {
        const path = route.path;
        const match = path.match(/\/dbg\/questions\/(.+)/);
        return match ? match[1] : "spelling";
    },
    set: () => {
        // Handled by navigateToQuestion
    },
});

const questionTitle = computed(() => {
    if (props.title) return props.title;
    const option = questionOptions.find(
        (o) => o.value === selectedQuestion.value,
    );
    return option?.title || "Question Debug";
});

function navigateToQuestion(value: string) {
    router.push(`/dbg/questions/${value}`);
}

// ============================================================================
// Layout State
// ============================================================================

const leftColumnCollapsed = ref(false);
const expandedPanels = ref<string[]>([]);

const supportsModifyDifficulty = computed(() => props.supportsModifyDifficulty ?? false);
const modifyDifficultyUsed = computed(() => props.modifyDifficultyUsed ?? null);

// ============================================================================
// Shared Difficulty Debug State
// ============================================================================

const userElo = ref(1000);
const cardElo = ref(1000);
const difficultyDebug = createQuestionDebugDifficultyContext(userElo, cardElo);
const modifyDifficulty = difficultyDebug.modifyDifficulty;

provide(QUESTION_DEBUG_DIFFICULTY_CONTEXT_KEY, difficultyDebug);

function resetDifficultyDebug() {
    userElo.value = 1000;
    cardElo.value = 1000;
}

watch(modifyDifficulty, (val) => {
    console.log(`[QuestionTypeLayout] modifyDifficulty changed to: ${val}`);
});

// ============================================================================
// Keyboard Context Setup (Provider Role)
// NOTE: Any modifications to event pass-throughs or context setup here
// should likely be mirrored in src/views/StudyPracticeView.vue (the production provider).
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

// Initialize base letters (represents user progress - all letters unlocked by default)
onMounted(() => {
    keyboardContext.setBaseLetters(props.initialBaseLetters ?? LETTER_GROUPS.allLettersWithSpace);
});

// ============================================================================
// Keyboard Props (computed from context)
// ============================================================================

const keyboardLetters = computed(() => {
    const active = keyboardContext.activeLetters.value;
    const result = [...active];
    if (keyboardContext.showAdvance.value && !active.includes("space")) {
        result.push("space");
    }
    // Forward enter key if context's activeLetters includes it
    if (active.includes("enter") && !result.includes("enter")) {
        result.push("enter");
    }
    return result;
});

const keyboardEnabledLetters = computed(() => {
    const enabled = keyboardContext.enabledLetters.value;
    const result = [...enabled];
    if (keyboardContext.showAdvance.value && !enabled.includes("space")) {
        result.push("space");
    }
    if (enabled.includes("enter") && !result.includes("enter")) {
        result.push("enter");
    }
    return result;
});

const keyboardHighlightedLetters = computed(() => {
    return Array.from(keyboardContext.highlights.value.keys());
});

const keyboardColors = computed(() => {
    const colors: Record<string, string> = {
        ...keyboardContext.keyColors.value,
    };

    for (const [
        letter,
        highlight,
    ] of keyboardContext.highlights.value.entries()) {
        if (typeof highlight === "string") {
            colors[letter] = highlight;
        }
    }

    if (keyboardContext.advanceColor.value) {
        colors["space"] = keyboardContext.advanceColor.value;
    }

    return colors;
});

const keyboardSpaceText = computed(() => {
    return keyboardContext.advanceText.value;
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

function logEvent(type: string, data: string) {
    const now = new Date();
    const time =
        now.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }) +
        "." +
        String(now.getMilliseconds()).padStart(3, "0");

    events.value.unshift({ time, type, data });

    if (events.value.length > 30) {
        events.value.pop();
    }
}

function clearEvents() {
    events.value = [];
}

function handleKeyboardPress(event: KeyEvent) {
    keyboardContext.dispatchKeyPress(event);
    logEvent("keypress", event.letter);
}

function handleKeyboardRelease(event: KeyEvent) {
    keyboardContext.dispatchKeyRelease(event);
    logEvent("keyrelease", event.letter);
}

function handleKeyboardTap(event: KeyEvent) {
    keyboardContext.dispatchKeyTap(event);
    logEvent("keytap", `${event.letter} (${event.source})`);
}

function handleKeyboardHover(event: KeyEvent) {
    keyboardContext.dispatchKeyHover(event);
    logEvent("keyhover", event.letter);
}

function handleKeyboardHoverEnd(event: KeyEvent) {
    keyboardContext.dispatchKeyHoverEnd(event);
    logEvent("keyhoverend", event.letter);
}

function handleKeyboardAdvance() {
    keyboardContext.dispatchAdvance();
    logEvent("advance", "spacebar");
}

function handleKeyboardEnter() {
    keyboardContext.dispatchEnter();
    logEvent("enter", "enter");
}

function handleKeyboardArrowLeft() {
    keyboardContext.dispatchArrowLeft();
    logEvent("arrow-left", "left arrow");
}

function handleKeyboardArrowRight() {
    keyboardContext.dispatchArrowRight();
    logEvent("arrow-right", "right arrow");
}

function handleKeyboardInvalidKey(letter: string) {
    keyboardContext.dispatchInvalidKey(letter);
    logEvent("invalid-key", letter);
}
</script>

<style scoped>
.question-type-layout {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    background: #fafafa;
}

/* Header */
.layout-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    background: white;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}

.back-link {
    text-decoration: none;
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    flex: 1;
}

.breadcrumb-item {
    color: #666;
}

.breadcrumb-separator {
    color: #bbb;
}

.breadcrumb-current {
    color: #333;
    font-weight: 600;
}

.question-selector {
    max-width: 200px;
}

/* Main content */
.layout-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0; /* Allow flex child to shrink below content size */
}

/* Left column */
.left-column {
    width: 320px;
    background: white;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 0.2s ease;
    overflow: hidden;
}

.left-column--collapsed {
    width: 40px;
}

.column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
}

.column-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
}

.left-column--collapsed .column-title {
    display: none;
}

.column-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

/* Debug panels */
.debug-panels {
    margin-bottom: 12px;
}

.panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
}

.difficulty-input-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.difficulty-slider {
    flex: 1;
}

.difficulty-number {
    width: 110px;
    flex: 0 0 110px;
}

.difficulty-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
}

.difficulty-note {
    margin-top: 8px;
    font-size: 0.8rem;
    color: #666;
    line-height: 1.4;
}

.state-section {
    margin-bottom: 12px;
}

.state-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    margin-bottom: 4px;
}

.state-value {
    font-size: 0.75rem;
    font-family: monospace;
    color: #333;
    background: #f9f9f9;
    padding: 4px 8px;
    border-radius: 4px;
    word-break: break-all;
    max-height: 60px;
    overflow-y: auto;
}

.letter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.flag-chips {
    display: flex;
    gap: 8px;
}

.more-text {
    font-size: 0.75rem;
    color: #999;
    align-self: center;
}

/* Events */
.events-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
}

.events-container {
    max-height: 200px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 0.75rem;
    background: #263238;
    border-radius: 4px;
    padding: 8px;
}

.event-item {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    color: #eceff1;
}

.event-time {
    color: #78909c;
    flex-shrink: 0;
}

.event-type {
    font-weight: 600;
    min-width: 80px;
}

.event-keytap .event-type {
    color: #4caf50;
}

.event-keypress .event-type {
    color: #2196f3;
}

.event-keyrelease .event-type {
    color: #ff9800;
}

.event-advance .event-type {
    color: #9c27b0;
}

.event-invalid-key .event-type {
    color: #f44336;
}

.event-data {
    color: #b0bec5;
}

.no-events {
    color: #78909c;
    text-align: center;
    padding: 8px;
}

/* Config slot */
.config-slot {
    margin-top: 12px;
}

/* Right column */
.right-column {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
}

.question-area {
    padding: 16px;
}

.keyboard-area {
    flex-shrink: 0;
    padding: 12px 16px 16px;
    background: white;
    border-top: 1px solid #e0e0e0;
}

/* Responsive */
@media (max-width: 900px) {
    .layout-content {
        flex-direction: column;
    }

    .left-column {
        width: 100%;
        max-height: 40vh;
        border-right: none;
        border-bottom: 1px solid #e0e0e0;
    }

    .left-column--collapsed {
        width: 100%;
        max-height: 40px;
    }

    .question-selector {
        display: none;
    }
}

@media (max-width: 600px) {
    .layout-header {
        flex-wrap: wrap;
        gap: 8px;
    }

    .breadcrumb {
        order: 3;
        width: 100%;
    }
}
</style>
