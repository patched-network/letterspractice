<!--
  MultipleChoiceBase.vue - Shared base component for multiple choice questions

  Provides:
  - Consistent option button rendering
  - Selection highlighting
  - Disabled state styling
  - Keyboard number hints
  - Accessibility attributes

  Used by WhoSaidThat and WordSelection question views.
-->

<template>
  <div
    class="multiple-choice-base"
    :class="{
      'mc--disabled': disabled,
      'mc--horizontal': layout === 'horizontal',
      'mc--vertical': layout === 'vertical',
      'mc--grid': layout === 'grid',
    }"
    role="radiogroup"
    :aria-label="ariaLabel"
  >
    <div class="mc-options" :class="`mc-options--${layout}`">
      <button
        v-for="(option, index) in options"
        :key="option.id"
        class="mc-option"
        :class="{
          'mc-option--selected': selectedIndex === index,
          'mc-option--disabled': option.disabled,
          'mc-option--correct': showFeedback && option.isCorrect,
          'mc-option--incorrect': showFeedback && selectedIndex === index && !option.isCorrect,
        }"
        :disabled="option.disabled || disabled"
        :aria-checked="selectedIndex === index"
        :aria-disabled="option.disabled || disabled"
        role="radio"
        @click="handleOptionClick(option, index)"
        @mouseenter="handleOptionHover(index)"
      >
        <!-- Number badge -->
        <span v-if="showNumbers" class="mc-option-number">
          {{ index + 1 }}
        </span>

        <!-- Option content slot -->
        <div class="mc-option-content">
          <slot
            name="option"
            :option="option"
            :index="index"
            :selected="selectedIndex === index"
            :disabled="option.disabled"
          >
            <!-- Default: just show label -->
            <span class="mc-option-label">{{ option.label }}</span>
          </slot>
        </div>

        <!-- Feedback icon -->
        <span v-if="showFeedback && selectedIndex === index" class="mc-option-feedback">
          <slot name="feedback" :correct="option.isCorrect">
            <span v-if="option.isCorrect" class="mc-feedback-icon mc-feedback-icon--correct">✓</span>
            <span v-else class="mc-feedback-icon mc-feedback-icon--incorrect">✗</span>
          </slot>
        </span>
      </button>
    </div>

    <!-- Keyboard hints -->
    <div v-if="showKeyboardHints && !disabled" class="mc-keyboard-hints">
      <span class="mc-hint">
        <kbd>1</kbd>-<kbd>{{ Math.min(options.length, 9) }}</kbd> to select
      </span>
      <span class="mc-hint">
        <kbd>←</kbd><kbd>→</kbd> to navigate
      </span>
      <span class="mc-hint">
        <kbd>Enter</kbd> to confirm
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { MultipleChoiceOption } from './useMultipleChoice';

// Props
interface Props {
  /** The options to display */
  options: MultipleChoiceOption[];
  /** Currently selected option index */
  selectedIndex: number;
  /** Whether the entire component is disabled */
  disabled?: boolean;
  /** Whether to show feedback (correct/incorrect) */
  showFeedback?: boolean;
  /** Whether to show number badges on options */
  showNumbers?: boolean;
  /** Whether to show keyboard shortcut hints */
  showKeyboardHints?: boolean;
  /** Layout mode */
  layout?: 'horizontal' | 'vertical' | 'grid';
  /** Accessibility label for the option group */
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  showFeedback: false,
  showNumbers: true,
  showKeyboardHints: true,
  layout: 'horizontal',
  ariaLabel: 'Select an answer',
});

// Emits
const emit = defineEmits<{
  /** Emitted when an option is clicked */
  (e: 'select', option: MultipleChoiceOption, index: number): void;
  /** Emitted when hover changes (for preview effects) */
  (e: 'hover', index: number): void;
}>();

// Handlers
function handleOptionClick(option: MultipleChoiceOption, index: number): void {
  if (!option.disabled && !props.disabled) {
    emit('select', option, index);
  }
}

function handleOptionHover(index: number): void {
  if (!props.disabled) {
    emit('hover', index);
  }
}
</script>

<style scoped>
.multiple-choice-base {
  --mc-option-bg: #f5f5f5;
  --mc-option-bg-hover: #e8e8e8;
  --mc-option-bg-selected: #e3f2fd;
  --mc-option-bg-disabled: #fafafa;
  --mc-option-bg-correct: #e8f5e9;
  --mc-option-bg-incorrect: #ffebee;
  --mc-option-border: #ddd;
  --mc-option-border-selected: #2196f3;
  --mc-option-border-correct: #4caf50;
  --mc-option-border-incorrect: #f44336;
  --mc-option-text: #333;
  --mc-option-text-disabled: #999;
  --mc-number-bg: #666;
  --mc-number-text: #fff;
  --mc-gap: 12px;
  --mc-padding: 16px;
  --mc-border-radius: 12px;

  width: 100%;
}

.mc-options {
  display: flex;
  gap: var(--mc-gap);
}

.mc-options--horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}

.mc-options--vertical {
  flex-direction: column;
  align-items: stretch;
}

.mc-options--grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--mc-gap);
}

.mc-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--mc-padding);
  background: var(--mc-option-bg);
  border: 3px solid var(--mc-option-border);
  border-radius: var(--mc-border-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  font-size: 1rem;
  color: var(--mc-option-text);
  min-width: 100px;
  text-align: left;
}

.mc-option:hover:not(:disabled) {
  background: var(--mc-option-bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.mc-option:focus-visible {
  outline: 3px solid #2196f3;
  outline-offset: 2px;
}

.mc-option--selected {
  background: var(--mc-option-bg-selected);
  border-color: var(--mc-option-border-selected);
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
}

.mc-option--disabled {
  background: var(--mc-option-bg-disabled);
  color: var(--mc-option-text-disabled);
  cursor: not-allowed;
  opacity: 0.6;
  transform: none !important;
  box-shadow: none !important;
}

.mc-option--correct {
  background: var(--mc-option-bg-correct);
  border-color: var(--mc-option-border-correct);
}

.mc-option--incorrect {
  background: var(--mc-option-bg-incorrect);
  border-color: var(--mc-option-border-incorrect);
  animation: shake 0.4s ease-in-out;
}

.mc-option-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--mc-number-bg);
  color: var(--mc-number-text);
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.mc-option--selected .mc-option-number {
  background: var(--mc-option-border-selected);
}

.mc-option--disabled .mc-option-number {
  background: #bbb;
}

.mc-option-content {
  flex: 1;
  min-width: 0;
}

.mc-option-label {
  font-weight: 500;
}

.mc-option-feedback {
  flex-shrink: 0;
}

.mc-feedback-icon {
  font-size: 1.25rem;
  font-weight: bold;
}

.mc-feedback-icon--correct {
  color: var(--mc-option-border-correct);
}

.mc-feedback-icon--incorrect {
  color: var(--mc-option-border-incorrect);
}

.mc-keyboard-hints {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 16px;
  font-size: 0.75rem;
  color: #888;
}

.mc-hint {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.75rem;
}

.mc--disabled {
  pointer-events: none;
  opacity: 0.7;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .mc-options--horizontal {
    flex-direction: column;
  }

  .mc-keyboard-hints {
    flex-wrap: wrap;
    gap: 12px;
  }

  .mc-option {
    padding: 12px;
  }
}
</style>
