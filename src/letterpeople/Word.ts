import { createLetter } from "./index";
import type { LetterInstance, LetterOptions } from "./types";
import {
  celebrate as celebrateLetter,
  RANDOM_CELEBRATIONS,
  type CelebrateOptions,
} from "./animations/celebrations";

export interface WordOptions {
  spacing?: number; // Fixed spacing between letters (pixels)
  letterOptions?: LetterOptions; // Default options applied to all letters
  skipInvalidChars?: boolean; // Skip unsupported characters instead of throwing
}

export class Word {
  readonly letters: LetterInstance[] = [];
  readonly element: HTMLElement;
  readonly text: string;
  private _spacing: number = 10;

  constructor(text: string, container: HTMLElement, options?: WordOptions) {
    this.text = text;
    this._spacing = options?.spacing ?? 10;

    const defaultOptions: WordOptions = {
      letterOptions: {
        color: "#faf",
        lineWidth: 20,
        borderWidth: 4,
        debug: false,
      },
      skipInvalidChars: true,
      spacing: 5,
    };

    options = options ?? defaultOptions;

    options.letterOptions =
      options.letterOptions ?? defaultOptions.letterOptions;
    // options.skipInvalidChars = options.skipInvalidChars ??
    options.spacing = options.spacing ?? defaultOptions.spacing;

    // Get computed height from container (handles both CSS classes and inline styles)
    const computedStyle = window.getComputedStyle(container);
    const containerHeight = computedStyle.height;

    // console.log(`Creating word ${text}, options: ${JSON.stringify(options)}`);

    // Create wrapper container for the word
    this.element = document.createElement("div");
    this.element.className = "letterpeople-word";
    this.element.style.display = "flex";
    this.element.style.alignItems = "flex-end"; // Align to baseline
    this.element.style.gap = `${this._spacing}px`;
    this.element.style.height = containerHeight;
    this.element.style.overflow = "visible"; // Allow transforms/animations to extend beyond bounds
    container.appendChild(this.element);

    // Create letters
    this._createLetters(text, options, containerHeight);
  }

  private _createLetters(
    text: string,
    options?: WordOptions,
    containerHeight?: string,
  ): void {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Skip spaces
      if (char === " ") {
        this._createSpacer();
        continue;
      }

      // Create letter wrapper
      const letterWrapper = document.createElement("div");
      letterWrapper.className = "letterpeople-letter-wrapper";
      letterWrapper.style.position = "relative";
      letterWrapper.style.overflow = "visible"; // Allow rotated/transformed letters to extend beyond wrapper
      if (containerHeight) {
        letterWrapper.style.height = containerHeight;
      }
      this.element.appendChild(letterWrapper);

      try {
        const letterInstance = createLetter(
          char,
          letterWrapper,
          options?.letterOptions,
        );

        if (letterInstance) {
          // Calculate container expansion for arm space
          const svg = letterInstance.svgElement;
          if (svg) {
            if (containerHeight) {
              svg.style.height = containerHeight;
              svg.style.width = "auto"; // Let width scale proportionally
            }

            // Use tight containers with overflow for arms
            const breathingRenderingContainer = 500; // give space for svg render
            letterWrapper.style.width = `${breathingRenderingContainer}px`;

            // Keep container tight to letter size
            letterWrapper.style.width = `${svg.clientWidth}px`;
            svg.style.overflow = "visible";
          }
          this.letters.push(letterInstance);
        }
      } catch (error) {
        this._handleInvalidCharacter(
          char,
          letterWrapper,
          options?.skipInvalidChars,
        );
      }
    }
  }

  private _createSpacer(): void {
    const spacer = document.createElement("div");
    spacer.className = "letterpeople-spacer";
    spacer.style.width = `${this._spacing * 2}px`; // Double spacing for word breaks
    spacer.style.height = "1px";
    this.element.appendChild(spacer);
  }

  private _handleInvalidCharacter(
    char: string,
    wrapper: HTMLElement,
    skipInvalid?: boolean,
  ): void {
    if (skipInvalid) {
      // Remove the wrapper and continue
      wrapper.remove();
      return;
    }

    // Create placeholder for unsupported character
    const placeholder = document.createElement("div");
    placeholder.className = "letterpeople-placeholder";
    placeholder.style.width = "40px";
    placeholder.style.height = "60px";
    placeholder.style.border = "1px dashed #ccc";
    placeholder.style.display = "flex";
    placeholder.style.alignItems = "center";
    placeholder.style.justifyContent = "center";
    placeholder.style.fontSize = "24px";
    placeholder.style.color = "#999";
    placeholder.textContent = char;
    wrapper.appendChild(placeholder);
  }

  /**
   * Get letter by index position
   */
  getLetter(index: number): LetterInstance | null {
    if (index < 0 || index >= this.letters.length) {
      return null;
    }
    return this.letters[index];
  }

  /**
   * Get letter by character, optionally specifying which occurrence
   */
  getLetterByChar(char: string, occurrence: number = 0): LetterInstance | null {
    let found = 0;
    for (const letter of this.letters) {
      if (letter.character === char) {
        if (found === occurrence) {
          return letter;
        }
        found++;
      }
    }
    return null;
  }

  /**
   * Update spacing between all letters
   */
  updateSpacing(spacing: number): void {
    this._spacing = spacing;
    this.element.style.gap = `${spacing}px`;

    // Update spacer widths (for word breaks)
    const spacers = this.element.querySelectorAll(".letterpeople-spacer");
    spacers.forEach((spacer) => {
      (spacer as HTMLElement).style.width = `${spacing * 2}px`;
    });
  }

  /**
   * Get the number of actual letter instances (excluding spaces/placeholders)
   */
  get length(): number {
    return this.letters.length;
  }

  /**
   * Get all letter characters in order
   */
  get characters(): string[] {
    return this.letters.map((letter) => letter.character);
  }

  /**
   * Set the z-index of a specific letter for layering control
   */
  setLetterZIndex(index: number, zIndex: number): void {
    const letter = this.getLetter(index);
    if (letter && letter.parentElement) {
      (letter.parentElement as HTMLElement).style.zIndex = String(zIndex);
    }
  }

  /**
   * Bring a letter to the front (highest z-index)
   */
  bringLetterToFront(index: number): void {
    const letter = this.getLetter(index);
    if (letter && letter.parentElement) {
      // Find the highest current z-index among letters
      let maxZIndex = 0;
      this.letters.forEach((l) => {
        if (l.parentElement) {
          const currentZ = parseInt(
            (l.parentElement as HTMLElement).style.zIndex || "0",
          );
          maxZIndex = Math.max(maxZIndex, currentZ);
        }
      });

      // Set this letter to be higher
      (letter.parentElement as HTMLElement).style.zIndex = String(
        maxZIndex + 1,
      );
    }
  }

  /**
   * Send a letter to the back (lowest z-index)
   */
  sendLetterToBack(index: number): void {
    const letter = this.getLetter(index);
    if (letter && letter.parentElement) {
      // Find the lowest current z-index among letters
      let minZIndex = 0;
      this.letters.forEach((l) => {
        if (l.parentElement) {
          const currentZ = parseInt(
            (l.parentElement as HTMLElement).style.zIndex || "0",
          );
          minZIndex = Math.min(minZIndex, currentZ);
        }
      });

      // Set this letter to be lower
      (letter.parentElement as HTMLElement).style.zIndex = String(
        minZIndex - 1,
      );
    }
  }

  /**
   * Get the bounding rectangle of the word container
   * @returns DOMRect with position and dimensions
   */
  getBoundingRect(): DOMRect {
    return this.element.getBoundingClientRect();
  }

  /**
   * Get the container element for event binding and positioning
   * @returns HTMLElement that contains all letters
   */
  get container(): HTMLElement {
    return this.element;
  }

  /**
   * Clean up and remove from DOM
   */
  destroy(): void {
    // Destroy all letter instances
    this.letters.forEach((letter) => {
      letter.destroy();
    });

    // Remove wrapper element
    this.element.remove();

    // Clear letters array
    this.letters.length = 0;
  }

  // ===========================================================================
  // Celebrations
  // ===========================================================================

  /**
   * Word-level celebration. Randomly picks a strategy:
   *  - "unison"   – all letters do the same random celebration simultaneously
   *  - "stagger"  – each letter does its own random celebration with a stagger delay
   *  - "wave"     – a single celebration type ripples across the letters
   *
   * Pass a specific strategy or type to override randomness.
   * Designed for easy expansion: add new strategies here, new letter-level
   * types in animations/celebrations.ts.
   */
  async celebrate(options: WordCelebrateOptions = {}): Promise<void> {
    if (this.letters.length === 0) return;

    // Full characterization — it's party time
    for (const letter of this.letters) {
      letter.eyes.show({ duration: 0 });
      letter.mouth.show({ duration: 0 });
    }

    let { strategy = "random" } = options;
    const { staggerMs = 60, letterOptions } = options;

    if (strategy === "random") {
      const strategies: WordCelebrateStrategy[] = ["unison", "stagger", "wave"];
      strategy = strategies[Math.floor(Math.random() * strategies.length)];
    }

    switch (strategy) {
      case "unison": {
        // All letters, same random type, all at once
        const type = letterOptions?.type ?? "random";
        await Promise.all(
          this.letters.map((letter) => celebrateLetter(letter, { ...letterOptions, type }))
        );
        break;
      }

      case "stagger": {
        // Each letter picks its own random celebration, staggered
        await Promise.all(
          this.letters.map((letter, i) =>
            new Promise<void>((resolve) =>
              setTimeout(async () => {
                await celebrateLetter(letter, { ...letterOptions, type: "random" });
                resolve();
              }, i * staggerMs)
            )
          )
        );
        break;
      }

      case "wave": {
        // Pick one type, ripple it across letters
        const types = RANDOM_CELEBRATIONS;
        const type = letterOptions?.type !== "random"
          ? letterOptions?.type ?? types[Math.floor(Math.random() * types.length)]
          : types[Math.floor(Math.random() * types.length)];
        await Promise.all(
          this.letters.map((letter, i) =>
            new Promise<void>((resolve) =>
              setTimeout(async () => {
                await celebrateLetter(letter, { ...letterOptions, type });
                resolve();
              }, i * staggerMs)
            )
          )
        );
        break;
      }
    }
  }

  /**
   * Iterator support - allows for (const letter of word)
   */
  *[Symbol.iterator](): Iterator<LetterInstance> {
    for (const letter of this.letters) {
      yield letter;
    }
  }
}

// =============================================================================
// Word Celebration Types
// =============================================================================

export type WordCelebrateStrategy = "unison" | "stagger" | "wave" | "random";

export interface WordCelebrateOptions {
  /** Strategy for coordinating letters. "random" picks one. */
  strategy?: WordCelebrateStrategy;
  /** Delay between letters for stagger/wave strategies (ms, default: 60) */
  staggerMs?: number;
  /** Options passed to each letter's celebrate() */
  letterOptions?: CelebrateOptions;
}
