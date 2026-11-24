/**
 * Keyboard Context Composable
 *
 * Provides a reactive bridge between StudyPracticeView (which owns the ProgressiveKeyboard)
 * and question components (which configure the keyboard and respond to input).
 *
 * Usage:
 *
 * In StudyPracticeView (provider):
 * ```ts
 * const keyboardContext = createKeyboardContext();
 * provide(KEYBOARD_CONTEXT_KEY, keyboardContext);
 * // Connect keyboard ref after mount
 * keyboardContext.connectKeyboard(keyboardRef.value);
 * ```
 *
 * In Question components (consumer):
 * ```ts
 * const keyboard = useKeyboardContext();
 * keyboard.requestConfig({ letters: ['c', 'a', 't'], showAdvance: false });
 * keyboard.onKeyTap((event) => handleInput(event.letter));
 * onUnmounted(() => keyboard.clearQuestionConfig());
 * ```
 */

import {
  ref,
  computed,
  inject,
  provide,
  onUnmounted,
  type Ref,
  type ComputedRef,
} from "vue";
import type {
  KeyboardContext,
  KeyboardContextProvider,
  KeyboardConfigRequest,
  KeyboardComponentRef,
  KeyEventHandler,
  AdvanceHandler,
  HighlightMap,
  KeyHighlight,
  Unsubscribe,
  KeyEvent,
  KeyAnimationType,
  KeyAnimationOptions,
} from "./keyboardContext.types";
import { KEYBOARD_CONTEXT_KEY } from "./keyboardContext.types";

// Re-export types and injection key for convenience
export * from "./keyboardContext.types";

/**
 * Event emitter for keyboard events
 */
class KeyboardEventEmitter {
  private keyTapHandlers = new Set<KeyEventHandler>();
  private keyPressHandlers = new Set<KeyEventHandler>();
  private keyReleaseHandlers = new Set<KeyEventHandler>();
  private keyHoverHandlers = new Set<KeyEventHandler>();
  private keyHoverEndHandlers = new Set<KeyEventHandler>();
  private advanceHandlers = new Set<AdvanceHandler>();
  private enterHandlers = new Set<AdvanceHandler>();
  private arrowLeftHandlers = new Set<AdvanceHandler>();
  private arrowRightHandlers = new Set<AdvanceHandler>();
  private backspaceHandlers = new Set<AdvanceHandler>();
  private invalidKeyHandlers = new Set<(letter: string) => void>();

  onKeyTap(handler: KeyEventHandler): Unsubscribe {
    this.keyTapHandlers.add(handler);
    return () => this.keyTapHandlers.delete(handler);
  }

  onKeyPress(handler: KeyEventHandler): Unsubscribe {
    this.keyPressHandlers.add(handler);
    return () => this.keyPressHandlers.delete(handler);
  }

  onKeyRelease(handler: KeyEventHandler): Unsubscribe {
    this.keyReleaseHandlers.add(handler);
    return () => this.keyReleaseHandlers.delete(handler);
  }

  onKeyHover(handler: KeyEventHandler): Unsubscribe {
    this.keyHoverHandlers.add(handler);
    return () => this.keyHoverHandlers.delete(handler);
  }

  onKeyHoverEnd(handler: KeyEventHandler): Unsubscribe {
    this.keyHoverEndHandlers.add(handler);
    return () => this.keyHoverEndHandlers.delete(handler);
  }

  onAdvance(handler: AdvanceHandler): Unsubscribe {
    this.advanceHandlers.add(handler);
    return () => this.advanceHandlers.delete(handler);
  }

  onEnter(handler: AdvanceHandler): Unsubscribe {
    this.enterHandlers.add(handler);
    return () => this.enterHandlers.delete(handler);
  }

  onArrowLeft(handler: AdvanceHandler): Unsubscribe {
    this.arrowLeftHandlers.add(handler);
    return () => this.arrowLeftHandlers.delete(handler);
  }

  onArrowRight(handler: AdvanceHandler): Unsubscribe {
    this.arrowRightHandlers.add(handler);
    return () => this.arrowRightHandlers.delete(handler);
  }

  onBackspace(handler: AdvanceHandler): Unsubscribe {
    this.backspaceHandlers.add(handler);
    return () => this.backspaceHandlers.delete(handler);
  }

  onInvalidKey(handler: (letter: string) => void): Unsubscribe {
    this.invalidKeyHandlers.add(handler);
    return () => this.invalidKeyHandlers.delete(handler);
  }

  emitKeyTap(event: KeyEvent): void {
    this.keyTapHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error("[KeyboardContext] Error in keyTap handler:", e);
      }
    });
  }

  emitKeyPress(event: KeyEvent): void {
    this.keyPressHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error("[KeyboardContext] Error in keyPress handler:", e);
      }
    });
  }

  emitKeyRelease(event: KeyEvent): void {
    this.keyReleaseHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error("[KeyboardContext] Error in keyRelease handler:", e);
      }
    });
  }

  emitKeyHover(event: KeyEvent): void {
    this.keyHoverHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error("[KeyboardContext] Error in keyHover handler:", e);
      }
    });
  }

  emitKeyHoverEnd(event: KeyEvent): void {
    this.keyHoverEndHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error("[KeyboardContext] Error in keyHoverEnd handler:", e);
      }
    });
  }

  emitAdvance(): void {
    this.advanceHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[KeyboardContext] Error in advance handler:", e);
      }
    });
  }

  emitEnter(): void {
    this.enterHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[KeyboardContext] Error in enter handler:", e);
      }
    });
  }

  emitArrowLeft(): void {
    this.arrowLeftHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[KeyboardContext] Error in arrowLeft handler:", e);
      }
    });
  }

  emitArrowRight(): void {
    this.arrowRightHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[KeyboardContext] Error in arrowRight handler:", e);
      }
    });
  }

  emitBackspace(): void {
    this.backspaceHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.error("[KeyboardContext] Error in backspace handler:", e);
      }
    });
  }

  emitInvalidKey(letter: string): void {
    this.invalidKeyHandlers.forEach((handler) => {
      try {
        handler(letter);
      } catch (e) {
        console.error("[KeyboardContext] Error in invalidKey handler:", e);
      }
    });
  }
}

/**
 * Create a keyboard context provider (call in StudyPracticeView)
 */
export function createKeyboardContext(): KeyboardContextProvider {
  // === State ===
  const baseLetters = ref<string[]>([]);
  const questionLetters = ref<string[] | null>(null);
  const overrideBase = ref(false);
  const explicitEnabledLetters = ref<string[] | null>(null);
  const highlights = ref<HighlightMap>(new Map());
  const keyColors = ref<Record<string, string>>({});
  const showAdvance = ref(true);
  const advanceColor = ref<string | undefined>(undefined);
  const advanceText = ref<string | undefined>(undefined);
  const disabled = ref(false);
  const showFullLayout = ref(true);
  const showArrows = ref(true);
  const disableTransitionMs = ref(400);
  const enableTransitionMs = ref(400);

  // Keyboard component reference for animations
  let keyboardRef: KeyboardComponentRef | null = null;

  // Event emitter
  const emitter = new KeyboardEventEmitter();

  // === Computed ===

  const activeLetters = computed<string[]>(() => {
    const base = baseLetters.value;
    const question = questionLetters.value;

    // When overrideBase is set, use question letters directly (no intersection).
    // Used by question types like WhoSaidThat that define their own complete key set,
    // or GpcIntro that wants an empty set (spacebar only via showAdvance).
    if (overrideBase.value && question !== null) {
      return question.map((l) => l.toLowerCase());
    }

    if (!question || question.length === 0) {
      return base;
    }

    // Intersect question letters with base letters
    const baseSet = new Set(base.map((l) => l.toLowerCase()));
    return question
      .map((l) => l.toLowerCase())
      .filter(
        (l) =>
          baseSet.has(l) ||
          l === "space" ||
          l === "enter" ||
          l === "arrowleft" ||
          l === "arrowright" ||
          l === "backspace" ||
          /^[0-9]$/.test(l), // Allow number keys
      ); // Always allow special keys (space, enter, arrows, backspace, numbers) if requested
  });

  const enabledLetters = computed<string[]>(() => {
    if (explicitEnabledLetters.value !== null) {
      return explicitEnabledLetters.value;
    }
    return activeLetters.value;
  });

  const hasQuestionConfig = computed<boolean>(() => {
    return questionLetters.value !== null;
  });

  // === Configuration API ===

  function requestConfig(config: KeyboardConfigRequest): void {
    if (config.letters !== undefined) {
      questionLetters.value = config.letters.map((l) => l.toLowerCase());
    }
    overrideBase.value = config.overrideBase ?? false;
    if (config.enabledLetters !== undefined) {
      explicitEnabledLetters.value = config.enabledLetters.map((l) =>
        l.toLowerCase(),
      );
    }
    if (config.highlights !== undefined) {
      const newHighlights = new Map<string, KeyHighlight>();
      for (const [letter, highlight] of Object.entries(config.highlights)) {
        newHighlights.set(letter.toLowerCase(), highlight);
      }
      highlights.value = newHighlights;
    }
    if (config.keyColors !== undefined) {
      const newColors: Record<string, string> = {};
      for (const [letter, color] of Object.entries(config.keyColors)) {
        newColors[letter.toLowerCase()] = color;
      }
      keyColors.value = newColors;
    }
    if (config.showAdvance !== undefined) {
      showAdvance.value = config.showAdvance;
    }
    if (config.advanceColor !== undefined) {
      advanceColor.value = config.advanceColor;
    }
    if (config.disabled !== undefined) {
      disabled.value = config.disabled;
    }
    if (config.advanceText !== undefined) {
      advanceText.value = config.advanceText;
    }
    if (config.showFullLayout !== undefined) {
      showFullLayout.value = config.showFullLayout;
    }
    if (config.showArrows !== undefined) {
      showArrows.value = config.showArrows;
    }
    if (config.disableTransitionMs !== undefined) {
      disableTransitionMs.value = config.disableTransitionMs;
    }
    if (config.enableTransitionMs !== undefined) {
      enableTransitionMs.value = config.enableTransitionMs;
    }
  }

  function updateConfig(partial: Partial<KeyboardConfigRequest>): void {
    if (partial.letters !== undefined) {
      questionLetters.value = partial.letters.map((l) => l.toLowerCase());
    }
    if (partial.overrideBase !== undefined) {
      overrideBase.value = partial.overrideBase;
    }
    if (partial.enabledLetters !== undefined) {
      explicitEnabledLetters.value = partial.enabledLetters.map((l) =>
        l.toLowerCase(),
      );
    }
    if (partial.highlights !== undefined) {
      for (const [letter, highlight] of Object.entries(partial.highlights)) {
        highlights.value.set(letter.toLowerCase(), highlight);
      }
      // Trigger reactivity
      highlights.value = new Map(highlights.value);
    }
    if (partial.keyColors !== undefined) {
      keyColors.value = {
        ...keyColors.value,
        ...Object.fromEntries(
          Object.entries(partial.keyColors).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        ),
      };
    }
    if (partial.showAdvance !== undefined) {
      showAdvance.value = partial.showAdvance;
    }
    if (partial.advanceColor !== undefined) {
      advanceColor.value = partial.advanceColor;
    }
    if (partial.disabled !== undefined) {
      disabled.value = partial.disabled;
    }
    if (partial.advanceText !== undefined) {
      advanceText.value = partial.advanceText;
    }
    if (partial.showFullLayout !== undefined) {
      showFullLayout.value = partial.showFullLayout;
    }
    if (partial.disableTransitionMs !== undefined) {
      disableTransitionMs.value = partial.disableTransitionMs;
    }
    if (partial.enableTransitionMs !== undefined) {
      enableTransitionMs.value = partial.enableTransitionMs;
    }
  }

  function clearQuestionConfig(): void {
    questionLetters.value = null;
    overrideBase.value = false;
    explicitEnabledLetters.value = null;
    highlights.value = new Map();
    keyColors.value = {};
    showAdvance.value = true;
    advanceColor.value = undefined;
    advanceText.value = undefined;
    disabled.value = false;
    showFullLayout.value = true;
    showArrows.value = true;
    disableTransitionMs.value = 400;
    enableTransitionMs.value = 400;
  }

  function setHighlight(letter: string, highlight: KeyHighlight): void {
    highlights.value.set(letter.toLowerCase(), highlight);
    // Trigger reactivity
    highlights.value = new Map(highlights.value);
  }

  function clearHighlight(letter: string): void {
    highlights.value.delete(letter.toLowerCase());
    // Trigger reactivity
    highlights.value = new Map(highlights.value);
  }

  function clearAllHighlights(): void {
    highlights.value = new Map();
  }

  // === Animation API ===

  async function hintKey(
    letter: string,
    animation: KeyAnimationType,
    options?: KeyAnimationOptions,
  ): Promise<void> {
    if (!keyboardRef) {
      console.warn("[KeyboardContext] Cannot animate: keyboard not connected");
      return;
    }
    await keyboardRef.animateKey(letter.toLowerCase(), animation, options);
  }

  async function flashKey(
    letter: string,
    color?: string,
    duration?: number,
  ): Promise<void> {
    if (!keyboardRef) {
      console.warn("[KeyboardContext] Cannot flash: keyboard not connected");
      return;
    }
    await keyboardRef.flashKey(letter.toLowerCase(), color, duration);
  }

  // === Event Subscription API ===

  function onKeyTap(handler: KeyEventHandler): Unsubscribe {
    return emitter.onKeyTap(handler);
  }

  function onKeyPress(handler: KeyEventHandler): Unsubscribe {
    return emitter.onKeyPress(handler);
  }

  function onKeyRelease(handler: KeyEventHandler): Unsubscribe {
    return emitter.onKeyRelease(handler);
  }

  function onKeyHover(handler: KeyEventHandler): Unsubscribe {
    return emitter.onKeyHover(handler);
  }

  function onKeyHoverEnd(handler: KeyEventHandler): Unsubscribe {
    return emitter.onKeyHoverEnd(handler);
  }

  function onAdvance(handler: AdvanceHandler): Unsubscribe {
    return emitter.onAdvance(handler);
  }

  function onEnter(handler: AdvanceHandler): Unsubscribe {
    return emitter.onEnter(handler);
  }

  function onArrowLeft(handler: AdvanceHandler): Unsubscribe {
    return emitter.onArrowLeft(handler);
  }

  function onArrowRight(handler: AdvanceHandler): Unsubscribe {
    return emitter.onArrowRight(handler);
  }

  function onBackspace(handler: AdvanceHandler): Unsubscribe {
    return emitter.onBackspace(handler);
  }

  function onInvalidKey(handler: (letter: string) => void): Unsubscribe {
    return emitter.onInvalidKey(handler);
  }

  // === Utility ===

  function simulateKeyTap(letter: string): void {
    // Import getKeyDefinition dynamically to avoid circular deps
    // For simulated events, use a minimal key definition
    const event: KeyEvent = {
      letter: letter.toLowerCase(),
      keyDef: {
        letter: letter.toLowerCase(),
        x: 0,
        y: 0,
        row: 1, // default to top row for unmapped letters
        col: 0,
        hand: "left",
        finger: 4, // index finger
      },
      timestamp: Date.now(),
      source: "mouse",
    };
    emitter.emitKeyTap(event);
  }

  function focus(): void {
    keyboardRef?.focus();
  }

  async function playPhoneme(letter: string): Promise<void> {
    if (!keyboardRef) {
      console.warn(
        "[KeyboardContext] Cannot play phoneme: keyboard not connected",
      );
      return;
    }
    await keyboardRef.playLetterPhoneme(letter.toLowerCase());
  }

  // === Provider-only API ===

  function addBaseLetter(letter: string): void {
    const l = letter.toLowerCase();
    if (!baseLetters.value.includes(l)) {
      baseLetters.value = [...baseLetters.value, l];
    }
  }

  function setBaseLetters(letters: string[]): void {
    baseLetters.value = letters.map((l) => l.toLowerCase());
  }

  function connectKeyboard(ref: KeyboardComponentRef | null): void {
    keyboardRef = ref;
  }

  function dispatchKeyTap(event: KeyEvent): void {
    emitter.emitKeyTap(event);
  }

  function dispatchKeyPress(event: KeyEvent): void {
    emitter.emitKeyPress(event);
  }

  function dispatchKeyRelease(event: KeyEvent): void {
    emitter.emitKeyRelease(event);
  }

  function dispatchKeyHover(event: KeyEvent): void {
    emitter.emitKeyHover(event);
  }

  function dispatchKeyHoverEnd(event: KeyEvent): void {
    emitter.emitKeyHoverEnd(event);
  }

  function dispatchAdvance(): void {
    emitter.emitAdvance();
  }

  function dispatchEnter(): void {
    emitter.emitEnter();
  }

  function dispatchArrowLeft(): void {
    emitter.emitArrowLeft();
  }

  function dispatchArrowRight(): void {
    emitter.emitArrowRight();
  }

  function dispatchBackspace(): void {
    emitter.emitBackspace();
  }

  function dispatchInvalidKey(letter: string): void {
    emitter.emitInvalidKey(letter);
  }

  // === Build Context Object ===

  const context: KeyboardContextProvider = {
    // Reactive state
    baseLetters,
    activeLetters,
    enabledLetters,
    highlights,
    keyColors,
    showAdvance,
    advanceColor,
    advanceText,
    disabled,
    hasQuestionConfig,
    overrideBase,
    showFullLayout,
    showArrows,
    disableTransitionMs,
    enableTransitionMs,

    // Configuration API
    requestConfig,
    updateConfig,
    clearQuestionConfig,
    setHighlight,
    clearHighlight,
    clearAllHighlights,
    addBaseLetter,

    // Animation API
    hintKey,
    flashKey,

    // Event subscription
    onKeyTap,
    onKeyPress,
    onKeyRelease,
    onKeyHover,
    onKeyHoverEnd,
    onAdvance,
    onEnter,
    onArrowLeft,
    onArrowRight,
    onBackspace,
    onInvalidKey,

    // Utility
    simulateKeyTap,
    focus,
    playPhoneme,

    // Provider-only
    setBaseLetters,
    connectKeyboard,
    dispatchKeyTap,
    dispatchKeyPress,
    dispatchKeyRelease,
    dispatchKeyHover,
    dispatchKeyHoverEnd,
    dispatchAdvance,
    dispatchEnter,
    dispatchArrowLeft,
    dispatchArrowRight,
    dispatchBackspace,
    dispatchInvalidKey,
  };

  return context;
}

/**
 * Inject keyboard context in a question component.
 * Throws if context is not provided (question not rendered in StudyPracticeView).
 */
export function useKeyboardContext(): KeyboardContext {
  const context = inject(KEYBOARD_CONTEXT_KEY);

  if (!context) {
    throw new Error(
      "[useKeyboardContext] Keyboard context not found. " +
        "Ensure this component is rendered within StudyPracticeView or another provider.",
    );
  }

  return context;
}

/**
 * Inject keyboard context, returning null if not available.
 * Use this when the component might render outside of StudyPracticeView.
 */
export function useKeyboardContextOptional(): KeyboardContext | null {
  return inject(KEYBOARD_CONTEXT_KEY, null);
}

/**
 * Provide keyboard context to child components.
 * Call this in StudyPracticeView's setup.
 */
export function provideKeyboardContext(context: KeyboardContextProvider): void {
  provide(KEYBOARD_CONTEXT_KEY, context);
}

/**
 * Convenience composable for questions that auto-cleans up on unmount.
 * Returns the keyboard context with automatic cleanup of question config.
 */
export function useKeyboardInput(): KeyboardContext {
  const keyboard = useKeyboardContext();

  onUnmounted(() => {
    keyboard.clearQuestionConfig();
  });

  return keyboard;
}
