/**
 * Color Transform - Dynamic color changes with smooth transitions
 *
 * Changes the fill color of letters with smooth transitions
 * Supports single colors, arrays of colors per letter, or color patterns
 */

import { animate } from "animejs";
import type { TransformFunction, AnimationParams } from "../types";
import type { Word } from "../Word";
import { DEFAULT_ANIMATION, DEFAULT_UNDO_ANIMATION } from "./constants";
import {
  generateVibrancyRainbow,
  randomVibrancyColor,
  ColorPresets,
  oklch,
} from "../util/color";

export interface ColorOptions {
  /** Colors to apply. Single color, array of colors per letter, or color generator */
  colors: string | string[] | ((index: number, letter: string) => string);
  /** Animation duration in ms (default: 600) */
  duration?: number;
  /** Animation easing function (default: "outQuad") */
  ease?: string;
  /** Stagger delay between letters in ms (default: 50) */
  stagger?: number;
  /** Whether to animate color transitions (default: true) */
  animate?: boolean;
}

/**
 * Creates a color transform that changes letter fill colors
 * Supports single colors, per-letter colors, or color generation functions
 */
export function createColorTransform(options: ColorOptions): TransformFunction {
  const {
    colors,
    duration = DEFAULT_ANIMATION.duration,
    ease = "outQuad", // Color transitions look better with smoother easing
    stagger = DEFAULT_ANIMATION.stagger,
    animate: shouldAnimate = true,
  } = options;

  return (word: Word) => {
    // console.log("ColorTransform called with word:", word);
    // console.log("Word has letters:", word.letters.length);

    // Capture original colors from the letter's current appearance
    const originalColors = word.letters.map((letter) => {
      // Try to get the current computed color
      const computedStyle = window.getComputedStyle(letter.svgElement);
      const currentColor =
        computedStyle.fill ||
        letter.svgElement.getAttribute("fill") ||
        "currentColor";
      // console.log(`Letter ${letter.character} original color:`, currentColor);
      return currentColor;
    });

    // Generate target colors for each letter
    const targetColors = word.letters.map((letter, index) => {
      if (typeof colors === "string") {
        return colors;
      } else if (Array.isArray(colors)) {
        return colors[index % colors.length];
      } else if (typeof colors === "function") {
        return colors(index, letter.character);
      }
      return "currentColor";
    });

    // Apply color changes using the proper LetterInstance API with animation
    // console.log("Applying colors:", targetColors);

    if (shouldAnimate) {
      // Apply colors with animation and stagger
      word.letters.forEach((letter, index) => {
        // console.log(`Setting letter ${index} (${letter.character}) to color: ${targetColors[index]}`);
        const animationParams: AnimationParams = {
          duration,
          ease,
          delay: index * stagger,
        };
        letter.updateAppearance(
          { color: targetColors[index] },
          animationParams,
        );
      });
    } else {
      // Apply colors immediately without animation
      word.letters.forEach((letter, index) => {
        // console.log(`Setting letter ${index} (${letter.character}) to color: ${targetColors[index]}`);
        letter.updateAppearance({ color: targetColors[index] });
      });
    }

    // Return undo function that restores original colors
    return () => {
      // console.log("Undoing colors, restoring to:", originalColors);

      if (shouldAnimate) {
        // Animate back to original colors with undo timing
        word.letters.forEach((letter, index) => {
          const undoAnimationParams: AnimationParams = {
            duration: DEFAULT_UNDO_ANIMATION.duration,
            ease: DEFAULT_UNDO_ANIMATION.ease,
            delay: index * (DEFAULT_UNDO_ANIMATION.delay || 0),
          };
          letter.updateAppearance(
            { color: originalColors[index] },
            undoAnimationParams,
          );
        });
      } else {
        // Restore immediately without animation
        word.letters.forEach((letter, index) => {
          letter.updateAppearance({ color: originalColors[index] });
        });
      }
    };
  };
}

/**
 * Simple color interpolation for basic color values
 * Handles hex colors, rgb(), rgba(), and named colors
 */
function interpolateColorSimple(
  from: string,
  to: string,
  progress: number,
): string {
  // If progress is 0, return from color
  if (progress <= 0) return from;
  // If progress is 1, return to color
  if (progress >= 1) return to;

  // For now, just return the target color when progress > 0
  // This gives an immediate color change which is what we want for most cases
  return to;
}

// Predefined color patterns for convenience
export const colorPatterns = {
  /** Rainbow colors using OKLCH for perceptual uniformity */
  rainbow: generateVibrancyRainbow(
    12,
    ColorPresets.vibrancyHigh.lightness,
    ColorPresets.vibrancyHigh.chroma,
  ),

  /** Warm colors using OKLCH */
  warm: [
    oklch(0.7, 0.15, 30), // Orange
    oklch(0.7, 0.15, 50), // Yellow-orange
    oklch(0.7, 0.12, 70), // Yellow
    oklch(0.65, 0.16, 15), // Red-orange
    oklch(0.6, 0.14, 10), // Red
  ],

  /** Cool colors using OKLCH */
  cool: [
    oklch(0.7, 0.12, 200), // Cyan
    oklch(0.65, 0.14, 230), // Blue
    oklch(0.6, 0.15, 260), // Blue-purple
    oklch(0.65, 0.13, 290), // Purple
    oklch(0.7, 0.11, 320), // Purple-pink
  ],

  /** Gradient from blue to purple using OKLCH */
  gradient: [
    oklch(0.65, 0.14, 240), // Blue
    oklch(0.65, 0.14, 250),
    oklch(0.65, 0.14, 260),
    oklch(0.65, 0.14, 270), // Purple
    oklch(0.65, 0.14, 280),
  ],

  /** Christmas colors */
  christmas: [
    oklch(0.55, 0.16, 15), // Christmas red
    oklch(0.6, 0.12, 145), // Christmas green
    oklch(0.55, 0.16, 15), // Christmas red
    oklch(0.6, 0.12, 145), // Christmas green
  ],

  /** Pastel colors using OKLCH */
  pastel: [
    oklch(0.85, 0.08, 60), // Pastel yellow
    oklch(0.85, 0.08, 30), // Pastel peach
    oklch(0.85, 0.08, 350), // Pastel pink
    oklch(0.85, 0.08, 50), // Pastel orange
    oklch(0.85, 0.08, 280), // Pastel purple
    oklch(0.85, 0.08, 220), // Pastel blue
  ],
};

/**
 * Helper function to create a rainbow transform
 */
export function createRainbowTransform(
  options: Omit<ColorOptions, "colors"> = {},
): TransformFunction {
  return createColorTransform({
    ...options,
    colors: colorPatterns.rainbow,
  });
}

/**
 * Helper function to create a single color transform
 */
export function createSingleColorTransform(
  color: string,
  options: Omit<ColorOptions, "colors"> = {},
): TransformFunction {
  return createColorTransform({
    ...options,
    colors: color,
  });
}

/**
 * Helper function to create a randomized color transform
 * Each letter gets a random vibrant color using OKLCH
 */
export function createRandomColorTransform(
  options: Omit<ColorOptions, "colors"> = {},
): TransformFunction {
  return createColorTransform({
    ...options,
    colors: (index: number, letter: string) =>
      randomVibrancyColor(
        ColorPresets.vibrancyHigh.lightness,
        ColorPresets.vibrancyHigh.chroma,
      ),
  });
}
