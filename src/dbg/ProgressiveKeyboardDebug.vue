<template>
    <div class="progressive-keyboard-debug">
        <h1>⌨️ Progressive Keyboard Debug</h1>
        <p class="subtitle">
            Test progressive keyboard rendering, phoneme playback, and
            interaction patterns. Configure keys using mode toggle and checkboxes.
        </p>

        <div class="two-column-layout">
            <!-- LEFT COLUMN: Configuration -->
            <div class="config-column">
              <v-expansion-panels
                v-model="openPanels"
                multiple
                variant="accordion"
                class="config-panels"
              >
                <!-- Letter Configuration -->
                <v-expansion-panel value="letters">
                  <v-expansion-panel-title>Letter/Number Selection</v-expansion-panel-title>
                  <v-expansion-panel-text>

                    <!-- Mode Toggle -->
                    <div class="mode-toggle">
                        <v-btn-toggle
                            v-model="keyMode"
                            mandatory
                            color="primary"
                            variant="outlined"
                            density="comfortable"
                            class="mode-toggle-group"
                        >
                            <v-btn value="numbers">Numbers</v-btn>
                            <v-btn value="letters">Letters</v-btn>
                            <v-btn value="custom">Custom</v-btn>
                        </v-btn-toggle>
                    </div>

                    <!-- Custom Input (only when mode=custom) -->
                    <div v-if="keyMode === 'custom'" class="custom-input-row">
                        <v-text-field
                            v-model="customInput"
                            label="Custom Keys"
                            placeholder="e.g., a b c or 1 2 3 4"
                            density="compact"
                            variant="outlined"
                            :hint="customInputHint"
                            :error="customInputError !== null"
                            :error-messages="customInputError || undefined"
                            persistent-hint
                        />
                    </div>

                    <!-- Special Keys Checkboxes -->
                    <div class="special-keys">
                        <h3>Special Keys</h3>
                        <div class="special-keys-grid">
                            <v-checkbox
                                v-model="includeSpacebar"
                                label="Spacebar"
                                density="compact"
                                hide-details
                            />
                            <v-checkbox
                                v-model="includeEnter"
                                label="Enter"
                                density="compact"
                                hide-details
                            />
                            <v-checkbox
                                v-model="includeArrows"
                                label="Arrows"
                                density="compact"
                                hide-details
                            />
                            <v-checkbox
                                v-model="includeShift"
                                label="Shift"
                                density="compact"
                                hide-details
                            />
                            <v-checkbox
                                v-model="includeBackspace"
                                label="Backspace"
                                density="compact"
                                hide-details
                            />
                        </div>
                    </div>

                    <!-- Active Keys Display -->
                    <div class="letter-chips">
                        <span class="chips-label">Active Keys:</span>
                        <v-chip
                            v-for="letter in activeLetters"
                            :key="letter"
                            :color="
                                highlightedLetters.includes(letter)
                                    ? 'warning'
                                    : 'primary'
                            "
                            variant="elevated"
                            size="small"
                            class="letter-chip"
                            @click="toggleHighlight(letter)"
                        >
                            {{
                                letter === "space"
                                    ? "␣"
                                    : letter === "enter"
                                      ? "↵"
                                      : letter === "arrowleft"
                                        ? "◄"
                                        : letter === "arrowright"
                                          ? "►"
                                          : letter.toUpperCase()
                            }}
                        </v-chip>
                        <span
                            v-if="activeLetters.length === 0"
                            class="no-letters"
                        >
                            No keys selected
                        </span>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>

                <!-- Settings -->
                <v-expansion-panel value="settings">
                  <v-expansion-panel-title>Settings</v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="settings-grid">
                        <v-switch
                            v-model="playPhonemeOnPress"
                            label="Play Phoneme on Press"
                            color="primary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="captureKeyboard"
                            label="Capture Physical Keyboard"
                            color="primary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="keyboardDisabled"
                            label="Disable Keyboard"
                            color="error"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="showDecorations"
                            label="Show Decorations on Highlighted"
                            color="primary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="showFullLayout"
                            label="Show Full Layout (Ghost Keys)"
                            color="secondary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="lowercaseKeycaps"
                            label="Lowercase Keycaps"
                            color="primary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="playOnRelease"
                            label="Play Phoneme on Release (chord mode)"
                            color="primary"
                            density="compact"
                            hide-details
                        />

                        <v-switch
                            v-model="enableChords"
                            label="Enable Chord Definitions"
                            color="primary"
                            density="compact"
                            hide-details
                        />
                    </div>

                    <div class="base-color-control">
                        <span class="color-label">Base Key Color:</span>
                        <div class="color-swatches">
                            <button
                                v-for="color in baseColorOptions"
                                :key="`base-${color}`"
                                class="color-swatch"
                                :class="{
                                    'color-swatch--selected':
                                        baseKeyColor === color,
                                }"
                                :style="{ backgroundColor: color }"
                                @click="baseKeyColor = color"
                            />
                        </div>
                    </div>

                    <div class="font-family-control">
                        <v-select
                            v-model="selectedFont"
                            :items="fontFamilyOptions"
                            label="Keycap Font (I/l clarity)"
                            density="compact"
                            variant="outlined"
                            hint="Choose font with clear letter distinction"
                            persistent-hint
                        />
                    </div>

                    <div class="size-controls">
                        <v-slider
                            v-model="minKeySize"
                            label="Min Key Size"
                            :min="32"
                            :max="80"
                            :step="4"
                            thumb-label
                            density="compact"
                        />

                        <v-slider
                            v-model="maxKeySize"
                            label="Max Key Size"
                            :min="80"
                            :max="160"
                            :step="8"
                            thumb-label
                            density="compact"
                        />
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>

                <!-- Animation Controls -->
                <v-expansion-panel value="animation">
                  <v-expansion-panel-title>Animation Testing</v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="animation-controls">
                        <v-select
                            v-model="animationTarget"
                            :items="activeLetters"
                            label="Target Letter"
                            density="compact"
                            variant="outlined"
                            class="animation-select"
                        />

                        <v-btn-group variant="outlined" density="compact">
                            <v-btn @click="triggerAnimation('pulse')"
                                >Pulse</v-btn
                            >
                            <v-btn @click="triggerAnimation('bounce')"
                                >Bounce</v-btn
                            >
                            <v-btn @click="triggerAnimation('shake')"
                                >Shake</v-btn
                            >
                            <v-btn @click="triggerAnimation('glow')"
                                >Glow</v-btn
                            >
                        </v-btn-group>

                        <v-btn color="secondary" @click="flashAllKeys">
                            Flash All
                        </v-btn>

                        <v-btn color="accent" @click="playAllPhonemes">
                            Play All Phonemes
                        </v-btn>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>

                <!-- Enabled Letters Control -->
                <v-expansion-panel value="enabled">
                  <v-expansion-panel-title>Enabled Letters Control</v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <p class="section-hint">
                        Click letters to toggle enabled/disabled state
                    </p>
                    <div class="enabled-letters-grid">
                        <v-chip
                            v-for="letter in activeLetters"
                            :key="`enabled-${letter}`"
                            :color="
                                enabledLetters.includes(letter)
                                    ? 'success'
                                    : 'grey'
                            "
                            variant="elevated"
                            class="enabled-chip"
                            @click="toggleEnabled(letter)"
                        >
                            {{ letter.toUpperCase() }}
                            <v-icon
                                end
                                :icon="
                                    enabledLetters.includes(letter)
                                        ? 'mdi-check'
                                        : 'mdi-close'
                                "
                                size="small"
                            />
                        </v-chip>
                    </div>
                    <div class="enabled-actions">
                        <v-btn size="small" @click="enableAllLetters"
                            >Enable All</v-btn
                        >
                        <v-btn size="small" @click="disableAllLetters">
                            Disable All
                        </v-btn>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>

                <!-- Key Colors -->
                <v-expansion-panel value="colors">
                  <v-expansion-panel-title>Custom Key Colors</v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="color-controls">
                        <v-select
                            v-model="colorTarget"
                            :items="activeLetters"
                            label="Target Letter"
                            density="compact"
                            variant="outlined"
                            class="color-select"
                        />

                        <div class="color-swatches">
                            <button
                                v-for="color in colorOptions"
                                :key="color"
                                class="color-swatch"
                                :style="{ backgroundColor: color }"
                                @click="setKeyColor(colorTarget, color)"
                            />
                        </div>

                        <v-btn size="small" @click="clearKeyColors">
                            Reset Colors
                        </v-btn>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>

            <!-- RIGHT COLUMN: Results (sticky so the keyboard stays visible) -->
            <div class="results-column">
                <!-- Keyboard Demo -->
                <section class="debug-section demo-section">
                    <h2>Keyboard Demo</h2>
                    <div class="demo-container">
                        <ProgressiveKeyboard
                            ref="keyboardRef"
                            :letters="activeLetters"
                            :enabled-letters="enabledLetters"
                            :highlighted-letters="highlightedLetters"
                            :play-phoneme-on-press="playPhonemeOnPress && !playOnRelease"
                            :play-phoneme-on-release="playOnRelease"
                            :chord-definitions="debugChordDefinitions"
                            :capture-keyboard="captureKeyboard"
                            :min-key-size="minKeySize"
                            :max-key-size="maxKeySize"
                            :key-colors="keyColors"
                            :disabled="keyboardDisabled"
                            :show-full-layout="showFullLayout"
                            :lowercase-keycaps="lowercaseKeycaps"
                            :font-family="selectedFont"
                            :base-key-color="baseKeyColor"
                            @keypress="handleKeyPress"
                            @keyrelease="handleKeyRelease"
                            @keytap="handleKeyTap"
                            @phoneme-start="handlePhonemeStart"
                            @phoneme-end="handlePhonemeEnd"
                            @invalid-key="handleInvalidKey"
                            @kbd-space="handleKbdSpace"
                            @kbd-enter="handleKbdEnter"
                            @arrow-left="handleArrowLeft"
                            @arrow-right="handleArrowRight"
                            @backspace="handleBackspace"
                            @kbd-shift="handleKbdShift"
                        >
                            <template
                                v-if="showDecorations"
                                #key-decoration="{
                                    letter,
                                    isPressed,
                                    isHighlighted,
                                }"
                            >
                                <div
                                    v-if="isHighlighted"
                                    class="custom-decoration hint-arrow"
                                >
                                    ↓
                                </div>
                            </template>
                        </ProgressiveKeyboard>
                    </div>
                </section>

                <!-- Event Log -->
                <section class="debug-section">
                    <h2>Event Log</h2>
                    <div class="event-log-controls">
                        <v-btn
                            size="small"
                            variant="text"
                            @click="clearEventLog"
                        >
                            Clear Log
                        </v-btn>
                    </div>
                    <div class="event-log">
                        <ul v-if="eventLog.length > 0" class="event-list">
                            <li
                                v-for="(event, index) in eventLog
                                    .slice()
                                    .reverse()"
                                :key="index"
                                :class="event.type"
                            >
                                <span class="event-time">{{ event.time }}</span>
                                <span class="event-type">{{ event.type }}</span>
                                <span class="event-data">{{ event.data }}</span>
                            </li>
                        </ul>
                        <p v-else class="no-events">
                            No events yet. Interact with the keyboard!
                        </p>
                    </div>
                </section>

                <!-- Keyboard Layout Info -->
                <section class="debug-section">
                    <h2>Layout Information</h2>
                    <div class="layout-info">
                        <div class="info-card">
                            <h4>Active Keys</h4>
                            <p>{{ activeLetters.length }} letters</p>
                        </div>
                        <div class="info-card">
                            <h4>Bounding Box</h4>
                            <p>
                                X: {{ boundingBox.minX.toFixed(2) }} -
                                {{ boundingBox.maxX.toFixed(2) }}
                            </p>
                            <p>
                                Y: {{ boundingBox.minY.toFixed(2) }} -
                                {{ boundingBox.maxY.toFixed(2) }}
                            </p>
                        </div>
                        <div class="info-card">
                            <h4>Hand Distribution</h4>
                            <p>Left: {{ handDistribution.left }}</p>
                            <p>Right: {{ handDistribution.right }}</p>
                        </div>
                    </div>

                    <div class="api-reference">
                        <h4>Exposed Methods</h4>
                        <code>getKeyElement(letter)</code> - Get DOM element for
                        a key
                        <code>animateKey(letter, animation, options)</code> -
                        Trigger animation
                        <code>flashKey(letter, color?, duration?)</code> - Flash
                        a key <code>focus()</code> - Focus keyboard for input
                        <code>playLetterPhoneme(letter)</code> - Play phoneme
                        audio
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import {
    ProgressiveKeyboard,
    LETTER_GROUPS,
    PHONICS_PROGRESSION,
    getKeysBoundingBox,
    getKeyDefinition,
} from "../components/keyboard";
import type { KeyEvent } from "../components/keyboard";

// ============================================================================
// Types
// ============================================================================

interface EventLogEntry {
    time: string;
    type: string;
    data: string;
}

// ============================================================================
// State
// ============================================================================

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

// Key selection mode
const keyMode = ref<"numbers" | "letters" | "custom">("letters");
const customInput = ref<string>("");
const includeSpacebar = ref(true);
const includeEnter = ref(false);
const includeArrows = ref(false);
const includeShift = ref(false);
const includeBackspace = ref(false);

// Collapsible control panels (open set persisted across reloads)
const PANELS_KEY = "dbg:progressive-keyboard:open-panels";
const DEFAULT_PANELS = ["letters", "settings"];
function loadPanels(): string[] {
    try {
        const raw = localStorage.getItem(PANELS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return DEFAULT_PANELS;
}
const openPanels = ref<string[]>(loadPanels());
watch(openPanels, (v) => {
    try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(v));
    } catch {
        /* ignore */
    }
});

// UI state
const highlightedLetters = ref<string[]>([]);
const eventLog = ref<EventLogEntry[]>([]);

// Settings
const playPhonemeOnPress = ref(true);
const captureKeyboard = ref(true);
const keyboardDisabled = ref(false);
const showDecorations = ref(true);
const showFullLayout = ref(false);
const lowercaseKeycaps = ref(false);
const playOnRelease = ref(true);
const enableChords = ref(true);
const minKeySize = ref(48);
const maxKeySize = ref(120);
const baseKeyColor = ref("#4caf50");
const selectedFont = ref("'Poppins', sans-serif");

// Font family options with good I/l distinction for early literacy
const fontFamilyOptions = [
    {
        title: "Poppins (Default — geometric, matches LetterPeople)",
        value: "'Poppins', sans-serif",
    },
    { title: "Inherit (Roboto, via Vuetify)", value: "inherit" },
    {
        title: "Comic Sans (Literacy-friendly)",
        value: "'Comic Sans MS', 'Comic Sans', cursive",
    },
    { title: "Verdana (Clear sans-serif)", value: "Verdana, sans-serif" },
    { title: "Georgia (Serif)", value: "Georgia, serif" },
    { title: "Century Gothic", value: "'Century Gothic', sans-serif" },
    { title: "Tahoma", value: "Tahoma, sans-serif" },
    { title: "Courier New (Monospace)", value: "'Courier New', monospace" },
];

// Animation
const animationTarget = ref<string>("");

// Colors
const colorTarget = ref<string>("");
const keyColors = reactive<Record<string, string>>({});
const colorOptions = [
    "#4caf50",
    "#2196f3",
    "#ff9800",
    "#e91e63",
    "#9c27b0",
    "#00bcd4",
    "#ff5722",
    "#795548",
];

const baseColorOptions = [
    "#4caf50", // Green (default)
    "#2196f3", // Blue
    "#9c27b0", // Purple
    "#e91e63", // Pink
    "#ff9800", // Orange
    "#00bcd4", // Cyan
    "#607d8b", // Blue Grey
    "#795548", // Brown
];

// ============================================================================
// Computed
// ============================================================================

/**
 * Parse custom input and validate that it's EITHER all letters OR all numbers
 * Returns { keys: string[], error: string | null }
 */
const customInputParsed = computed(() => {
    const input = customInput.value.trim();
    if (!input) {
        return { keys: [], error: null };
    }

    // Parse space-separated or comma-separated input
    const tokens = input
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((t) => t.length > 0);

    if (tokens.length === 0) {
        return { keys: [], error: null };
    }

    // Separate letters and numbers
    const letters: string[] = [];
    const numbers: string[] = [];
    const invalid: string[] = [];

    for (const token of tokens) {
        if (token.length === 1 && token >= "a" && token <= "z") {
            letters.push(token);
        } else if (token.length === 1 && token >= "0" && token <= "9") {
            numbers.push(token);
        } else {
            invalid.push(token);
        }
    }

    // Check for invalid tokens
    if (invalid.length > 0) {
        return {
            keys: [],
            error: `Invalid input: ${invalid.join(", ")}. Use only letters (a-z) or numbers (0-9).`,
        };
    }

    // Check for mixing letters and numbers
    if (letters.length > 0 && numbers.length > 0) {
        return {
            keys: [],
            error: "Cannot mix letters and numbers. Use either letters OR numbers, not both.",
        };
    }

    // Return whichever is present
    const keys = letters.length > 0 ? letters : numbers;
    return { keys: [...new Set(keys)], error: null }; // Remove duplicates
});

/**
 * Hint text for custom input
 */
const customInputHint = computed(() => {
    if (keyMode.value !== "custom") return "";
    return "Enter letters (a-z) or numbers (0-9), space-separated";
});

/**
 * Error message for custom input (null if valid)
 */
const customInputError = computed(() => {
    if (keyMode.value !== "custom") return null;
    return customInputParsed.value.error;
});

/**
 * Build active letters from mode + special key checkboxes
 */
const activeLetters = computed(() => {
    let baseKeys: string[] = [];

    if (keyMode.value === "numbers") {
        // All number keys
        baseKeys = LETTER_GROUPS.allNumbers;
    } else if (keyMode.value === "letters") {
        // All letter keys
        baseKeys = LETTER_GROUPS.allLetters;
    } else if (keyMode.value === "custom") {
        // Use parsed custom input
        baseKeys = customInputParsed.value.keys;
    }

    // Add special keys based on checkboxes
    const keys = [...baseKeys];
    if (includeSpacebar.value) keys.push("space");
    if (includeEnter.value) keys.push("enter");
    if (includeArrows.value) {
        keys.push("arrowleft", "arrowright");
    }
    if (includeShift.value) {
        keys.push("shift");
    }
    if (includeBackspace.value) {
        keys.push("backspace");
    }

    return keys;
});

/**
 * Enabled letters - all active letters are enabled by default
 */
const enabledLetters = ref<string[]>([]);

// Sync enabledLetters with activeLetters
watch(
    activeLetters,
    (newLetters) => {
        // Keep previously enabled letters that are still active
        const stillActive = enabledLetters.value.filter((l) =>
            newLetters.includes(l),
        );
        // Add newly active letters that weren't previously tracked
        const newlyActive = newLetters.filter(
            (l) => !enabledLetters.value.includes(l),
        );
        enabledLetters.value = [...stillActive, ...newlyActive];
    },
    { immediate: true },
);

const boundingBox = computed(() => getKeysBoundingBox(activeLetters.value));

const handDistribution = computed(() => {
    let left = 0;
    let right = 0;

    for (const letter of activeLetters.value) {
        const keyDef = getKeyDefinition(letter);
        if (keyDef) {
            if (keyDef.hand === "left") left++;
            else right++;
        }
    }

    return { left, right };
});

const debugChordDefinitions = computed((): Record<string, string> => {
    if (!enableChords.value) return {};
    return {
        sh: "/audio/arpa/SH.mp3",
        ch: "/audio/arpa/CH.mp3",
        th: "/audio/arpa/TH.mp3",
        ck: "/audio/arpa/K.mp3",
        ng: "/audio/arpa/NG.mp3",
        ph: "/audio/arpa/F.mp3",
        wh: "/audio/arpa/W.mp3",
        a_e: "/audio/arpa/EY.mp3",
        e_e: "/audio/arpa/IY.mp3", // long-press e
        i_e: "/audio/arpa/AY.mp3",
        o_e: "/audio/arpa/OW.mp3",
        u_e: "/audio/arpa/UW.mp3",
    };
});

// ============================================================================
// Methods
// ============================================================================

function toggleHighlight(letter: string) {
    const idx = highlightedLetters.value.indexOf(letter);
    if (idx >= 0) {
        highlightedLetters.value.splice(idx, 1);
    } else {
        highlightedLetters.value.push(letter);
    }
}

function toggleEnabled(letter: string) {
    const idx = enabledLetters.value.indexOf(letter);
    if (idx >= 0) {
        enabledLetters.value.splice(idx, 1);
    } else {
        enabledLetters.value.push(letter);
    }
}

function enableAllLetters() {
    enabledLetters.value = [...activeLetters.value];
}

function disableAllLetters() {
    enabledLetters.value = [];
}

function setKeyColor(letter: string, color: string) {
    if (letter) {
        keyColors[letter] = color;
    }
}

function clearKeyColors() {
    Object.keys(keyColors).forEach((key) => delete keyColors[key]);
}

async function triggerAnimation(type: "pulse" | "bounce" | "shake" | "glow") {
    if (animationTarget.value && keyboardRef.value) {
        await keyboardRef.value.animateKey(animationTarget.value, type);
        addEventLog("animation", `${type} on ${animationTarget.value}`);
    }
}

async function flashAllKeys() {
    if (!keyboardRef.value) return;

    for (const letter of activeLetters.value) {
        keyboardRef.value.flashKey(letter, "#ffc107", 200);
        await new Promise((r) => setTimeout(r, 100));
    }
}

async function playAllPhonemes() {
    if (!keyboardRef.value) return;

    for (const letter of activeLetters.value) {
        await keyboardRef.value.playLetterPhoneme(letter);
        await new Promise((r) => setTimeout(r, 500));
    }
}

// Event handlers
function handleKeyPress(event: KeyEvent) {
    addEventLog("keypress", `${event.letter.toUpperCase()} (${event.source})`);
}

function handleKeyRelease(event: KeyEvent) {
    addEventLog(
        "keyrelease",
        `${event.letter.toUpperCase()} (${event.source})`,
    );
}

function handleKeyTap(event: KeyEvent) {
    addEventLog("keytap", `${event.letter.toUpperCase()} (${event.source})`);
}

function handlePhonemeStart(letter: string) {
    addEventLog("phoneme-start", letter.toUpperCase());
}

function handlePhonemeEnd(letter: string) {
    addEventLog("phoneme-end", letter.toUpperCase());
}

function handleInvalidKey(letter: string) {
    addEventLog("invalid-key", `Attempted: ${letter.toUpperCase()}`);
}

function handleKbdSpace() {
    addEventLog("kbd-space", "Spacebar pressed");
}

function handleKbdEnter() {
    addEventLog("kbd-enter", "Enter pressed");
}

function handleArrowLeft() {
    addEventLog("arrow-left", "Left arrow pressed");
}

function handleArrowRight() {
    addEventLog("arrow-right", "Right arrow pressed");
}

function handleBackspace() {
    addEventLog("backspace", "Backspace pressed");
}

function handleKbdShift(active: boolean) {
    addEventLog("kbd-shift", `Shift ${active ? "activated" : "deactivated"}`);
}

function addEventLog(type: string, data: string) {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    eventLog.value.push({ time, type, data });

    // Keep log size manageable
    if (eventLog.value.length > 50) {
        eventLog.value.shift();
    }
}

function clearEventLog() {
    eventLog.value = [];
}

// Watch for active letters changes to reset animation target
watch(activeLetters, (newLetters) => {
    if (newLetters.length > 0 && !newLetters.includes(animationTarget.value)) {
        animationTarget.value = newLetters[0];
    }
    if (newLetters.length > 0 && !newLetters.includes(colorTarget.value)) {
        colorTarget.value = newLetters[0];
    }
});

// Initialize animation target
watch(
    activeLetters,
    (letters) => {
        if (letters.length > 0 && !animationTarget.value) {
            animationTarget.value = letters[0];
        }
        if (letters.length > 0 && !colorTarget.value) {
            colorTarget.value = letters[0];
        }
    },
    { immediate: true },
);
</script>

<style scoped>
.progressive-keyboard-debug {
    max-width: 1600px;
    margin: 0 auto;
    padding: 24px;
    font-family:
        system-ui,
        -apple-system,
        sans-serif;
}

.progressive-keyboard-debug h1 {
    font-size: 2rem;
    margin-bottom: 8px;
}

.subtitle {
    color: #666;
    margin-bottom: 32px;
}

.two-column-layout {
    display: grid;
    grid-template-columns: 450px 1fr;
    gap: 24px;
    align-items: start;
}

.config-column,
.results-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.results-column {
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
}

.config-panels :deep(.v-expansion-panel-title) {
    font-size: 1.1rem;
    font-weight: 500;
}

.debug-section {
    padding: 20px;
    background: #f5f5f5;
    border-radius: 12px;
}

.debug-section h2 {
    font-size: 1.25rem;
    margin-bottom: 16px;
    color: #333;
}

.controls-row {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
}

.letter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 16px;
}

.chips-label {
    font-weight: 500;
    margin-right: 8px;
}

.letter-chip {
    cursor: pointer;
}

.no-letters {
    color: #999;
    font-style: italic;
}

/* Mode toggle styles */
.mode-toggle {
    margin-bottom: 16px;
}

.mode-toggle-group {
    width: 100%;
}

.custom-input-row {
    margin-bottom: 16px;
}

/* Special keys section */
.special-keys {
    margin-top: 16px;
    padding: 12px;
    background: white;
    border-radius: 8px;
}

.special-keys h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #555;
}

.special-keys-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
}

.demo-section {
    background: #e8f5e9;
}

.demo-container {
    display: flex;
    justify-content: center;
    padding: 32px;
    background: white;
    border-radius: 8px;
    min-height: 200px;
}

.settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}

.size-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 16px;
}

.animation-controls {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
}

.animation-select {
    min-width: 120px;
}

.section-hint {
    color: #666;
    font-size: 0.875rem;
    margin-bottom: 12px;
}

.enabled-letters-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
}

.enabled-chip {
    cursor: pointer;
}

.enabled-actions {
    display: flex;
    gap: 8px;
}

.color-controls {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
}

.color-select {
    min-width: 120px;
}

.color-swatches {
    display: flex;
    gap: 8px;
}

.color-swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s ease;
}

.color-swatch:hover {
    transform: scale(1.15);
}

.color-swatch--selected {
    transform: scale(1.2);
    box-shadow:
        0 0 0 3px white,
        0 0 0 5px currentColor;
}

.base-color-control {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
}

.color-label {
    font-weight: 500;
    color: #333;
}

.font-family-control {
    margin-top: 16px;
}

.event-log-controls {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
}

.event-log {
    background: #1e1e1e;
    border-radius: 8px;
    padding: 12px;
    max-height: 200px;
    overflow-y: auto;
}

.event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-family: "Monaco", "Consolas", monospace;
    font-size: 0.8rem;
}

.event-list li {
    display: flex;
    gap: 12px;
    padding: 4px 0;
    border-bottom: 1px solid #333;
}

.event-time {
    color: #888;
}

.event-type {
    color: #4caf50;
    min-width: 100px;
}

.event-list li.keypress .event-type {
    color: #2196f3;
}

.event-list li.keyrelease .event-type {
    color: #90caf9;
}

.event-list li.keytap .event-type {
    color: #4caf50;
}

.event-list li.phoneme-start .event-type {
    color: #ff9800;
}

.event-list li.phoneme-end .event-type {
    color: #ffcc80;
}

.event-list li.invalid-key .event-type {
    color: #f44336;
}

.event-list li.animation .event-type {
    color: #e91e63;
}

.event-list li.kbd-space .event-type {
    color: #00e676;
    font-weight: bold;
}

.event-list li.kbd-enter .event-type {
    color: #00e676;
    font-weight: bold;
}

.event-data {
    color: #fff;
}

.no-events {
    color: #666;
    text-align: center;
    font-style: italic;
}

.layout-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
}

.info-card {
    background: white;
    padding: 12px;
    border-radius: 8px;
}

.info-card h4 {
    font-size: 0.875rem;
    color: #666;
    margin-bottom: 8px;
}

.info-card p {
    margin: 4px 0;
    font-weight: 500;
}

.api-reference {
    background: white;
    padding: 16px;
    border-radius: 8px;
}

.api-reference h4 {
    margin-bottom: 12px;
}

.api-reference code {
    display: block;
    background: #f5f5f5;
    padding: 8px 12px;
    margin: 4px 0;
    border-radius: 4px;
    font-size: 0.85rem;
}

.custom-decoration {
    position: absolute;
    pointer-events: none;
}

.hint-arrow {
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
    color: #ffc107;
    animation: bounce-arrow 0.6s ease-in-out infinite;
}

@keyframes bounce-arrow {
    0%,
    100% {
        transform: translateX(-50%) translateY(0);
    }
    50% {
        transform: translateX(-50%) translateY(-8px);
    }
}

@media (max-width: 1200px) {
    .two-column-layout {
        grid-template-columns: 1fr;
    }

    .results-column {
        position: static;
        max-height: none;
        overflow-y: visible;
    }
}

@media (max-width: 768px) {
    .progressive-keyboard-debug {
        padding: 16px;
    }

    .progressive-keyboard-debug h1 {
        font-size: 1.5rem;
    }

    .controls-row {
        flex-direction: column;
    }

    .size-controls {
        grid-template-columns: 1fr;
    }

    .animation-controls {
        flex-direction: column;
        align-items: stretch;
    }
}
</style>
