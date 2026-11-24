/**
 * Fan Transform - Arc positioning for letter arrangement
 *
 * Arranges letters along a soft arc curve, creating a fan-out or rainbow effect
 * Letters are positioned along a circular arc with configurable radius and spread
 */

import { animate } from "animejs";
import type { TransformFunction, AnimationParams } from "../types";
import type { Word } from "../Word";
import { DEFAULT_ANIMATION, DEFAULT_UNDO_ANIMATION } from "./constants";

export interface FanOptions {
  /** Radius of the arc in pixels (default: 200) - larger = gentler curve */
  radius?: number;
  /** Arc spread angle in degrees (default: 30) - how wide the fan spreads */
  arcAngle?: number;
  /** Vertical offset of the arc center (default: 100) - positive moves arc up */
  centerY?: number;
  /** Whether letters should rotate to follow the arc tangent (default: true) */
  followTangent?: boolean;

  /** Animation duration in ms (default: 800) */
  duration?: number;
  /** Animation easing function (default: "outBack(1.7)") */
  ease?: string;
  /** Stagger delay between letters in ms (default: 60) */
  stagger?: number;
  /** Whether to animate the transformation (default: true) */
  animate?: boolean;
  /** Target letter indices to apply fan to. If not specified, applies to all letters */
  targetIndices?: number[];
}

/**
 * Creates a fan transform that arranges letters along an arc
 * Letters are distributed evenly along the arc curve with optional rotation
 */
export function createFanTransform(
  options: FanOptions = {},
): TransformFunction {
  const {
    radius = 150,
    arcAngle = 60,
    centerY = 0,
    followTangent = true,
    duration = DEFAULT_ANIMATION.duration,
    ease = "outBack(1.7)",
    stagger = DEFAULT_ANIMATION.stagger,
    animate: shouldAnimate = true,
    targetIndices,
  } = options;

  return (word: Word) => {
    // Capture original transforms
    const originalTransforms = word.letters.map(
      (letter) => letter.svgElement.getAttribute("transform") || "",
    );

    // Helper function to determine if a letter should be transformed
    const shouldTransformLetter = (index: number): boolean => {
      return !targetIndices || targetIndices.includes(index);
    };

    // Get letters to transform for arc calculations
    const lettersToTransform = word.letters.filter((_, index) =>
      shouldTransformLetter(index),
    );
    const letterCount = lettersToTransform.length;

    if (letterCount === 0) {
      // No letters to transform, return noop undo
      return () => {};
    }

    // Convert arc angle to radians
    const arcRadians = (arcAngle * Math.PI) / 180;

    // Calculate arc positions for each letter
    const arcPositions = lettersToTransform.map((letter, arcIndex) => {
      // Distribute letters evenly along the arc
      const t = letterCount === 1 ? 0 : arcIndex / (letterCount - 1); // 0 to 1
      const angle = -arcRadians / 2 + t * arcRadians; // Center the arc

      // Calculate position on arc
      const x = radius * Math.sin(angle);
      const y = -radius * Math.cos(angle); // Arc curves upward

      // Calculate rotation if following tangent
      const rotation = followTangent ? (angle * 180) / Math.PI : 0;
      console.log(
        `fan [${arcIndex}] - ${word.text[arcIndex]}:\nangle - ${angle}\n (${x}, ${y}), rotation: ${rotation}`,
      );

      return { x, y, rotation };
    });

    // Apply transformations
    if (shouldAnimate) {
      // Animate letters to arc positions with stagger
      word.letters.forEach((letter, letterIndex) => {
        if (shouldTransformLetter(letterIndex)) {
          // Find this letter's position in the arc
          const arcIndex = lettersToTransform.indexOf(letter);
          const position = arcPositions[arcIndex];

          setTimeout(() => {
            const animationParams: AnimationParams = {
              duration,
              ease,
            };

            // Use anime.js for smooth transform animation
            animate(letter.svgElement, {
              translateX: position.x,
              translateY: position.y,
              rotate: position.rotation,
              duration,
              ease,
            });
          }, letterIndex * stagger);
        }
      });
    } else {
      // Apply immediately without animation
      word.letters.forEach((letter, letterIndex) => {
        if (shouldTransformLetter(letterIndex)) {
          const arcIndex = lettersToTransform.indexOf(letter);
          const position = arcPositions[arcIndex];

          const transform = `translate(${position.x}, ${position.y}) rotate(${position.rotation})`;
          letter.svgElement.setAttribute("transform", transform);
        }
      });
    }

    // Return undo function
    return () => {
      if (shouldAnimate) {
        // Animate back to original positions
        word.letters.forEach((letter, letterIndex) => {
          if (shouldTransformLetter(letterIndex)) {
            animate(letter.svgElement, {
              translateX: 0,
              translateY: 0,
              rotate: 0,
              duration: DEFAULT_UNDO_ANIMATION.duration,
              ease: DEFAULT_UNDO_ANIMATION.ease,
              complete: () => {
                // Restore exact original transform
                letter.svgElement.setAttribute(
                  "transform",
                  originalTransforms[letterIndex],
                );
              },
            });
          }
        });
      } else {
        // Restore immediately
        word.letters.forEach((letter, letterIndex) => {
          if (shouldTransformLetter(letterIndex)) {
            letter.svgElement.setAttribute(
              "transform",
              originalTransforms[letterIndex],
            );
          }
        });
      }
    };
  };
}

/**
 * Helper function to create a rainbow/upward arc
 */
export function createRainbowTransform(
  options: Omit<FanOptions, "arcAngle" | "centerY"> = {},
): TransformFunction {
  return createFanTransform({
    ...options,
    arcAngle: 45, // Wider arc for rainbow effect
    centerY: 150, // Higher for more dramatic curve
  });
}

/**
 * Helper function to create a subtle curve
 */
export function createSubtleCurveTransform(
  options: Omit<FanOptions, "arcAngle" | "radius"> = {},
): TransformFunction {
  return createFanTransform({
    ...options,
    arcAngle: 15, // Smaller arc for subtle effect
    radius: 400, // Larger radius for gentler curve
  });
}
