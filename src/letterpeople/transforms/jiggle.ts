/**
 * Jiggle Transform - Randomized positioning and rotation
 *
 * Creates a jiggle effect with randomized positioning and rotation
 * Each letter gets a random offset and rotation within specified ranges
 */

import { animate, type Target } from "animejs";
import type { TransformFunction } from "../types";
import type { Word } from "../Word";
import { DEFAULT_ANIMATION, DEFAULT_UNDO_ANIMATION } from "./constants";

export interface JiggleOptions {
  /** Intensity of position offset (default: 15) */
  intensity?: number;
  /** Range of rotation in degrees (default: 20) */
  rotationRange?: number;
  /** Animation duration in ms (default: 600) */
  duration?: number;
  /** Animation easing function (default: "outElastic(1, .6)") */
  ease?: string;
  /** Stagger delay between letters in ms (default: 50) */
  stagger?: number;
  /** Random seed for reproducible results */
  seed?: number;
}

/**
 * Creates a jiggle transform with randomized positioning and rotation
 * Each letter gets a random offset and rotation within specified ranges
 */
export function createJiggleTransform(options: JiggleOptions = {}): TransformFunction {
  const {
    intensity = 15,
    rotationRange = 20,
    duration = DEFAULT_ANIMATION.duration,
    ease = DEFAULT_ANIMATION.ease,
    stagger = DEFAULT_ANIMATION.stagger,
    seed,
  } = options;

  return (word: Word) => {
    // Capture original transforms
    const originalTransforms = word.letters.map(
      (letter) => letter.svgElement.getAttribute("transform") || ""
    );

    // Set up seeded random if provided
    let seedState = seed || Math.random();
    const seededRandom = () => {
      seedState = (seedState * 9301 + 49297) % 233280;
      return seedState / 233280;
    };

    // Generate target transforms for each letter
    const targetTransforms = word.letters.map(() => ({
      x: (seededRandom() - 0.5) * intensity,
      y: (seededRandom() - 0.5) * intensity * 0.6, // Slightly less Y movement
      rotate: (seededRandom() - 0.5) * rotationRange,
    }));

    // Animate all letters to their jiggle positions
    animate(word.letters.map(letter => letter.svgElement), {
      translateX: (el: Target, i: number) => targetTransforms[i].x,
      translateY: (el: Target, i: number) => targetTransforms[i].y,
      rotate: (el: Target, i: number) => targetTransforms[i].rotate,
      duration,
      ease,
      delay: (el: Target, i: number) => i * stagger,
    });

    // Return undo function that animates back to original positions
    return () => {
      animate(word.letters.map(letter => letter.svgElement), {
        translateX: 0,
        translateY: 0,
        rotate: 0,
        duration: DEFAULT_UNDO_ANIMATION.duration,
        ease: DEFAULT_UNDO_ANIMATION.ease,
        complete: () => {
          // Restore original transforms after animation
          word.letters.forEach((letter, i) => {
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
          });
        }
      });
    };
  };
}