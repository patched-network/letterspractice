/**
 * Transform Composition Utilities
 *
 * Provides utilities for combining multiple TransformFunction instances
 * into a single composable transform.
 */

import type { TransformFunction } from "../types";
import type { Word } from "../Word";

/**
 * Composes multiple transform functions into a single transform
 *
 * Transforms are applied in order (left to right).
 * The returned undo function will call all individual undo functions
 * in reverse order (right to left) to properly clean up.
 *
 * @param transforms - Transform functions to compose
 * @returns A single composed TransformFunction
 *
 * @example
 * ```typescript
 * const combined = composeTransforms(
 *   createRainbowTransform(),
 *   createJiggleTransform({ intensity: 5 })
 * );
 *
 * // Apply to word
 * const undo = combined(wordInstance);
 *
 * // Later, undo both transforms
 * undo();
 * ```
 */
export function composeTransforms(...transforms: TransformFunction[]): TransformFunction {
  return (word: Word) => {
    // Apply all transforms and collect their undo functions
    const undoFunctions: Array<(() => void)> = [];

    for (const transform of transforms) {
      const undo = transform(word);
      if (undo && typeof undo === 'function') {
        undoFunctions.push(undo);
      }
    }

    // Return composed undo function that calls all undos in reverse order
    if (undoFunctions.length === 0) {
      return undefined;
    }

    return () => {
      // Undo in reverse order (LIFO - last applied, first undone)
      for (let i = undoFunctions.length - 1; i >= 0; i--) {
        undoFunctions[i]();
      }
    };
  };
}

/**
 * Applies transforms sequentially with delays between each
 * Useful for staged visual effects
 *
 * @param transforms - Array of transforms with optional delays
 * @returns A single composed TransformFunction
 *
 * @example
 * ```typescript
 * const staged = composeTransformsSequential([
 *   { transform: createColorTransform({ colors: 'red' }), delay: 0 },
 *   { transform: createJiggleTransform(), delay: 500 }
 * ]);
 * ```
 */
export function composeTransformsSequential(
  transforms: Array<{ transform: TransformFunction; delay?: number }>
): TransformFunction {
  return (word: Word) => {
    const undoFunctions: Array<(() => void)> = [];
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];

    // Apply transforms with delays
    transforms.forEach(({ transform, delay = 0 }, index) => {
      const timeout = setTimeout(() => {
        const undo = transform(word);
        if (undo && typeof undo === 'function') {
          undoFunctions.push(undo);
        }
      }, delay);

      timeouts.push(timeout);
    });

    // Return undo that clears timeouts and undoes transforms
    return () => {
      // Clear any pending timeouts
      timeouts.forEach(timeout => clearTimeout(timeout));

      // Undo applied transforms in reverse order
      for (let i = undoFunctions.length - 1; i >= 0; i--) {
        undoFunctions[i]();
      }
    };
  };
}
