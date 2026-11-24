/**
 * useMultipleChoice - Shared composable for multiple choice question types
 *
 * Provides common functionality for:
 * - Keyboard navigation (1-9 for direct selection, arrows for movement)
 * - Selection state management
 * - Option rendering patterns
 * - Audio feedback coordination
 *
 * Used by WhoSaidThat and WordSelection question types.
 */

import { ref, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef } from 'vue';
import { useKeyboardInput, type KeyEvent } from '../../composables/useKeyboardContext';

export interface MultipleChoiceOption<T = unknown> {
  /** Unique identifier for this option */
  id: string;
  /** Display label */
  label: string;
  /** Whether this is the correct answer */
  isCorrect: boolean;
  /** Whether this option has been disabled (wrong guess) */
  disabled: boolean;
  /** Custom data attached to this option */
  data?: T;
}

export interface UseMultipleChoiceOptions<T = unknown> {
  /** The options to choose from */
  options: Ref<MultipleChoiceOption<T>[]>;
  /** Callback when an option is selected */
  onSelect: (option: MultipleChoiceOption<T>, index: number) => void;
  /** Callback when selection changes via arrow keys */
  onSelectionChange?: (index: number) => void;
  /** Whether to auto-focus first enabled option on mount */
  autoFocus?: boolean;
  /** Whether keyboard input is currently disabled */
  disabled?: Ref<boolean>;
  /** Enable wrap-around navigation */
  wrapNavigation?: boolean;
}

export interface UseMultipleChoiceReturn<T = unknown> {
  /** Currently highlighted/focused option index */
  selectedIndex: Ref<number>;
  /** The currently selected option (or null) */
  selectedOption: ComputedRef<MultipleChoiceOption<T> | null>;
  /** Select an option by index */
  selectByIndex: (index: number) => void;
  /** Move selection left/up */
  selectPrevious: () => void;
  /** Move selection right/down */
  selectNext: () => void;
  /** Confirm the current selection */
  confirmSelection: () => void;
  /** Get the keyboard number for an option (1-indexed) */
  getOptionNumber: (index: number) => number;
  /** Check if an option is currently selected/highlighted */
  isSelected: (index: number) => boolean;
  /** Reset selection state */
  reset: () => void;
  /** Keyboard event unsubscribe function (for manual cleanup if needed) */
  cleanup: () => void;
}

/**
 * Shared composable for multiple choice question keyboard/selection handling
 */
export function useMultipleChoice<T = unknown>(
  config: UseMultipleChoiceOptions<T>
): UseMultipleChoiceReturn<T> {
  const {
    options,
    onSelect,
    onSelectionChange,
    autoFocus = true,
    disabled = ref(false),
    wrapNavigation = true,
  } = config;

  // State
  const selectedIndex = ref(0);
  const cleanupFns: (() => void)[] = [];

  // Get keyboard context (will throw if not in keyboard container)
  let keyboard: ReturnType<typeof useKeyboardInput> | null = null;
  try {
    keyboard = useKeyboardInput();
  } catch {
    // Not in keyboard context - that's okay, component can work without it
    console.warn('[useMultipleChoice] No keyboard context available - keyboard shortcuts disabled');
  }

  // Computed
  const selectedOption = computed<MultipleChoiceOption<T> | null>(() => {
    const opts = options.value;
    if (selectedIndex.value >= 0 && selectedIndex.value < opts.length) {
      return opts[selectedIndex.value];
    }
    return null;
  });

  // Find next enabled option in a direction
  function findNextEnabledIndex(startIndex: number, direction: 1 | -1): number {
    const opts = options.value;
    if (opts.length === 0) return -1;

    let index = startIndex + direction;
    let iterations = 0;
    const maxIterations = opts.length;

    while (iterations < maxIterations) {
      // Handle wrapping
      if (index < 0) {
        index = wrapNavigation ? opts.length - 1 : 0;
        if (!wrapNavigation) return startIndex; // Can't go further
      } else if (index >= opts.length) {
        index = wrapNavigation ? 0 : opts.length - 1;
        if (!wrapNavigation) return startIndex; // Can't go further
      }

      // Check if this option is enabled
      if (!opts[index].disabled) {
        return index;
      }

      index += direction;
      iterations++;
    }

    // All options disabled, return current
    return startIndex;
  }

  // Find first enabled option
  function findFirstEnabledIndex(): number {
    const opts = options.value;
    for (let i = 0; i < opts.length; i++) {
      if (!opts[i].disabled) return i;
    }
    return 0;
  }

  // Methods
  function selectByIndex(index: number): void {
    const opts = options.value;
    if (index >= 0 && index < opts.length && !opts[index].disabled) {
      selectedIndex.value = index;
      onSelectionChange?.(index);
    }
  }

  function selectPrevious(): void {
    if (disabled.value) return;
    const newIndex = findNextEnabledIndex(selectedIndex.value, -1);
    if (newIndex !== selectedIndex.value) {
      selectedIndex.value = newIndex;
      onSelectionChange?.(newIndex);
    }
  }

  function selectNext(): void {
    if (disabled.value) return;
    const newIndex = findNextEnabledIndex(selectedIndex.value, 1);
    if (newIndex !== selectedIndex.value) {
      selectedIndex.value = newIndex;
      onSelectionChange?.(newIndex);
    }
  }

  function confirmSelection(): void {
    if (disabled.value) return;
    const opt = selectedOption.value;
    if (opt && !opt.disabled) {
      onSelect(opt, selectedIndex.value);
    }
  }

  function getOptionNumber(index: number): number {
    return index + 1;
  }

  function isSelected(index: number): boolean {
    return selectedIndex.value === index;
  }

  function reset(): void {
    selectedIndex.value = findFirstEnabledIndex();
  }

  // Keyboard handling
  function handleKeyTap(event: KeyEvent): void {
    if (disabled.value) return;

    const letter = event.letter.toLowerCase();

    // Number keys 1-9 for direct selection
    if (/^[1-9]$/.test(letter)) {
      const index = parseInt(letter, 10) - 1;
      const opts = options.value;
      if (index < opts.length && !opts[index].disabled) {
        selectedIndex.value = index;
        onSelect(opts[index], index);
      }
      return;
    }

    // Handle arrow-like keys if we expand keyboard later
    // For now, check for special key names that keyboard might emit
    switch (letter) {
      case 'arrowleft':
      case 'left':
        selectPrevious();
        break;
      case 'arrowright':
      case 'right':
        selectNext();
        break;
      case 'arrowup':
      case 'up':
        selectPrevious();
        break;
      case 'arrowdown':
      case 'down':
        selectNext();
        break;
      case 'enter':
      case 'space':
        confirmSelection();
        break;
    }
  }

  // Setup keyboard listener
  if (keyboard) {
    const unsubKeyTap = keyboard.onKeyTap(handleKeyTap);
    cleanupFns.push(unsubKeyTap);

    // Configure keyboard to show numbers for options
    // Note: ProgressiveKeyboard might not support numbers yet, but this prepares for it
    keyboard.requestConfig({
      disabled: disabled.value,
    });
  }

  // Also listen for native keyboard events for arrow keys
  function handleNativeKeyDown(e: KeyboardEvent): void {
    if (disabled.value) return;

    // Number keys
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const index = parseInt(e.key, 10) - 1;
      const opts = options.value;
      if (index < opts.length && !opts[index].disabled) {
        selectedIndex.value = index;
        onSelect(opts[index], index);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        selectPrevious();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        selectNext();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        confirmSelection();
        break;
    }
  }

  // Lifecycle
  onMounted(() => {
    // Add native keyboard listener
    window.addEventListener('keydown', handleNativeKeyDown);
    cleanupFns.push(() => window.removeEventListener('keydown', handleNativeKeyDown));

    // Auto-focus first enabled option
    if (autoFocus) {
      selectedIndex.value = findFirstEnabledIndex();
    }
  });

  // Watch for disabled state changes
  watch(disabled, (isDisabled) => {
    if (keyboard) {
      keyboard.updateConfig({ disabled: isDisabled });
    }
  });

  // Watch for options changes to reset selection if needed
  watch(options, (newOpts) => {
    // If current selection is out of bounds or disabled, find a valid one
    if (
      selectedIndex.value >= newOpts.length ||
      (newOpts[selectedIndex.value] && newOpts[selectedIndex.value].disabled)
    ) {
      selectedIndex.value = findFirstEnabledIndex();
    }
  }, { deep: true });

  // Cleanup function
  function cleanup(): void {
    cleanupFns.forEach(fn => fn());
    cleanupFns.length = 0;
  }

  onUnmounted(cleanup);

  return {
    selectedIndex,
    selectedOption,
    selectByIndex,
    selectPrevious,
    selectNext,
    confirmSelection,
    getOptionNumber,
    isSelected,
    reset,
    cleanup,
  };
}

/**
 * Utility to create options array from simple data
 */
export function createOptions<T>(
  items: Array<{ id: string; label: string; data?: T }>,
  correctId: string
): MultipleChoiceOption<T>[] {
  return items.map(item => ({
    id: item.id,
    label: item.label,
    isCorrect: item.id === correctId,
    disabled: false,
    data: item.data,
  }));
}

/**
 * Shuffle options for display (Fisher-Yates)
 */
export function shuffleOptions<T>(options: MultipleChoiceOption<T>[]): MultipleChoiceOption<T>[] {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
