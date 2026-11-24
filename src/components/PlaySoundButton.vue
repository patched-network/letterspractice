<!--
  PlaySoundButton.vue - Shared "play sound again" button

  Features:
  - Integrates with keyboard context to sync with spacebar
  - Uses spacebar's color
  - Listens to spacebar advance events
  - Emits play event when clicked or spacebar pressed
-->

<template>
  <button
    ref="buttonEl"
    class="play-sound-btn"
    :class="{ 'play-sound-btn--playing': isPlaying, 'play-sound-btn--pressed': isPressedByKeyboard }"
    :style="{ '--btn-color': buttonColor }"
    :disabled="isPlaying"
    @click="handleClick"
  >
    <v-icon size="28">mdi-volume-high</v-icon>
  </button>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<{
  isPlaying?: boolean;
  /** Set false to prevent this button from subscribing to keyboard advance (spacebar) events. */
  listenToAdvance?: boolean;
}>(), {
  listenToAdvance: true,
});

const emit = defineEmits<{
  (e: 'play'): void;
}>();

// ============================================================================
// Keyboard Context Integration
// ============================================================================

const keyboard = useKeyboardContextOptional();

// Get spacebar color from keyboard context
const buttonColor = computed(() => {
  if (keyboard?.advanceColor?.value) {
    return keyboard.advanceColor.value;
  }
  return '#2196f3'; // Default blue if no keyboard context
});

// ============================================================================
// Methods
// ============================================================================

const buttonEl = ref<HTMLButtonElement | null>(null);
const isPressedByKeyboard = ref(false);

function handleClick(): void {
  if (!props.isPlaying) {
    emit('play');
  }
}

/** Brief visual press when triggered programmatically (e.g., spacebar). */
function simulatePress(): void {
  isPressedByKeyboard.value = true;
  setTimeout(() => {
    isPressedByKeyboard.value = false;
  }, 150);
}

// ============================================================================
// Lifecycle
// ============================================================================

let unsubscribeAdvance: (() => void) | null = null;

onMounted(() => {
  // Listen to spacebar/advance events from keyboard context
  if (keyboard && props.listenToAdvance !== false) {
    unsubscribeAdvance = keyboard.onAdvance(() => {
      if (!props.isPlaying) {
        simulatePress();
        emit('play');
      }
    });
  }
});

onUnmounted(() => {
  if (unsubscribeAdvance) {
    unsubscribeAdvance();
  }
});
</script>

<style scoped>
/* ── Keycap-style play button ── */
.play-sound-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 16px 32px;
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  background-color: var(--btn-color, #2196f3);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.25);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition:
      transform 0.1s ease-out,
      box-shadow 0.1s ease-out,
      background-color 0.4s ease-in-out;
}

.play-sound-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.play-sound-btn:active:not(:disabled),
.play-sound-btn--pressed:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.25);
  filter: brightness(0.9);
}

.play-sound-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.play-sound-btn--playing {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>
