<template>
    <v-card class="echo-child pa-4" elevation="2">
        <v-card-title class="d-flex align-center ga-2">
            <v-icon color="primary">mdi-keyboard</v-icon>
            Simple Key Echo
        </v-card-title>
        <v-card-subtitle>
            Demonstrates basic keyboard context consumption. Press keys to see them appear here.
        </v-card-subtitle>

        <v-card-text>
            <!-- Typed letters display -->
            <div class="echo-display mb-4">
                <div class="echo-letters">
                    <span
                        v-for="(letter, index) in typedLetters"
                        :key="index"
                        class="echo-letter"
                        :class="{ 'echo-letter--recent': index === typedLetters.length - 1 }"
                    >
                        {{ letter === ' ' ? '␣' : letter }}
                    </span>
                    <span v-if="typedLetters.length === 0" class="echo-placeholder">
                        Type something...
                    </span>
                </div>
            </div>

            <!-- Controls -->
            <div class="echo-controls d-flex ga-2 flex-wrap">
                <v-btn
                    variant="outlined"
                    color="secondary"
                    size="small"
                    @click="clearTyped"
                >
                    <v-icon start>mdi-backspace</v-icon>
                    Clear
                </v-btn>

                <v-btn
                    variant="outlined"
                    :color="showAdvance ? 'primary' : 'grey'"
                    size="small"
                    @click="toggleAdvance"
                >
                    <v-icon start>{{ showAdvance ? 'mdi-check' : 'mdi-close' }}</v-icon>
                    Spacebar: {{ showAdvance ? 'On' : 'Off' }}
                </v-btn>

                <v-btn
                    variant="outlined"
                    color="warning"
                    size="small"
                    @click="highlightVowels"
                >
                    <v-icon start>mdi-format-color-highlight</v-icon>
                    Highlight Vowels
                </v-btn>

                <v-btn
                    variant="outlined"
                    color="info"
                    size="small"
                    @click="clearHighlights"
                >
                    <v-icon start>mdi-format-color-fill</v-icon>
                    Clear Highlights
                </v-btn>
            </div>

            <!-- Config request demo -->
            <v-divider class="my-4" />

            <div class="config-demo">
                <h4 class="text-subtitle-2 mb-2">Request Specific Letters</h4>
                <v-text-field
                    v-model="customLetters"
                    label="Letters to request (e.g., 'cat')"
                    variant="outlined"
                    density="compact"
                    hint="These letters will be enabled on the keyboard"
                    persistent-hint
                    class="mb-2"
                />
                <v-btn
                    variant="elevated"
                    color="primary"
                    size="small"
                    @click="applyCustomLetters"
                >
                    Apply Config
                </v-btn>
            </div>

            <!-- Last event info -->
            <v-divider class="my-4" />

            <div class="last-event">
                <h4 class="text-subtitle-2 mb-2">Last Event</h4>
                <v-chip v-if="lastEvent" :color="lastEventColor" variant="tonal">
                    <v-icon start size="small">{{ lastEventIcon }}</v-icon>
                    {{ lastEvent.type }}: {{ lastEvent.data }}
                </v-chip>
                <span v-else class="text-medium-emphasis">No events yet</span>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useKeyboardContext, type KeyEvent } from '../../composables/useKeyboardContext';

// ============================================================================
// Keyboard Context (injected from parent layout)
// ============================================================================

const keyboard = useKeyboardContext();

// ============================================================================
// State
// ============================================================================

const typedLetters = ref<string[]>([]);
const showAdvance = ref(true);
const customLetters = ref('cat');
const lastEvent = ref<{ type: string; data: string } | null>(null);

// ============================================================================
// Event Handlers
// ============================================================================

const unsubKeyTap = keyboard.onKeyTap((event: KeyEvent) => {
    typedLetters.value.push(event.letter);
    lastEvent.value = { type: 'keytap', data: event.letter };
    
    // Keep last 50 letters
    if (typedLetters.value.length > 50) {
        typedLetters.value.shift();
    }
});

const unsubAdvance = keyboard.onAdvance(() => {
    typedLetters.value.push(' ');
    lastEvent.value = { type: 'advance', data: 'space' };
});

const unsubInvalid = keyboard.onInvalidKey((letter: string) => {
    lastEvent.value = { type: 'invalid', data: letter };
});

// Clean up subscriptions on unmount
onUnmounted(() => {
    unsubKeyTap();
    unsubAdvance();
    unsubInvalid();
    keyboard.clearQuestionConfig();
});

// ============================================================================
// Computed
// ============================================================================

const lastEventColor = computed(() => {
    if (!lastEvent.value) return 'grey';
    switch (lastEvent.value.type) {
        case 'keytap': return 'success';
        case 'advance': return 'primary';
        case 'invalid': return 'error';
        default: return 'grey';
    }
});

const lastEventIcon = computed(() => {
    if (!lastEvent.value) return 'mdi-help';
    switch (lastEvent.value.type) {
        case 'keytap': return 'mdi-keyboard';
        case 'advance': return 'mdi-arrow-right';
        case 'invalid': return 'mdi-alert';
        default: return 'mdi-help';
    }
});

// ============================================================================
// Actions
// ============================================================================

function clearTyped() {
    typedLetters.value = [];
}

function toggleAdvance() {
    showAdvance.value = !showAdvance.value;
    keyboard.updateConfig({ showAdvance: showAdvance.value });
}

function highlightVowels() {
    keyboard.requestConfig({
        highlights: {
            a: 'warning',
            e: 'warning',
            i: 'warning',
            o: 'warning',
            u: 'warning',
        },
    });
}

function clearHighlights() {
    keyboard.clearAllHighlights();
}

function applyCustomLetters() {
    const letters = customLetters.value.toLowerCase().split('').filter(l => l.trim());
    if (letters.length > 0) {
        keyboard.requestConfig({
            letters,
            enabledLetters: letters,
        });
    }
}
</script>

<style scoped>
.echo-child {
    max-width: 600px;
    margin: 0 auto;
}

.echo-display {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 16px;
    min-height: 80px;
}

.echo-letters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-family: 'Comic Sans MS', 'Andika', sans-serif;
    font-size: 1.5rem;
}

.echo-letter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 40px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform 0.15s ease, background-color 0.15s ease;
}

.echo-letter--recent {
    background: rgb(var(--v-theme-primary));
    color: white;
    transform: scale(1.1);
}

.echo-placeholder {
    color: #999;
    font-style: italic;
    font-size: 1rem;
}

.config-demo {
    background: #fafafa;
    border-radius: 8px;
    padding: 12px;
}

.last-event {
    text-align: center;
}
</style>