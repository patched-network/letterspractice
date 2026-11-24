/**
 * Perspective Transform - 3D perspective effects
 *
 * Creates a perspective transform that applies 3D perspective effects
 * Simulates depth and rotation in 3D space using CSS transforms
 */

import type { TransformFunction } from "../types";
import type { Word } from "../Word";
import { DEFAULT_UNDO_ANIMATION } from "./constants";

export interface PerspectiveOptions {
  /** Perspective distance (default: 600) - lower = more dramatic */
  distance?: number;
  /** Rotation around X axis in degrees (default: 15) */
  rotateX?: number;
  /** Rotation around Y axis in degrees (default: 0) */
  rotateY?: number;
  /** Rotation around Z axis in degrees (default: 0) */
  rotateZ?: number;
  /** Scale factor (default: 1) */
  scale?: number;
  /** Animation duration in ms (default: 800) */
  duration?: number;
  /** Animation easing function (default: "outQuart") */
  ease?: string;
  /** Stagger delay between letters in ms (default: 60) */
  stagger?: number;
  /** Transform origin X position (default: "center") */
  originX?: "left" | "center" | "right" | string;
  /** Transform origin Y position (default: "center") */
  originY?: "top" | "center" | "bottom" | string;
  /** Target letter indices to apply perspective to. If not specified, applies to all letters */
  targetIndices?: number[];
}

/**
 * Creates a perspective transform that applies 3D perspective effects
 * Simulates depth and rotation in 3D space using CSS transforms
 */
export function createPerspectiveTransform(options: PerspectiveOptions = {}): TransformFunction {
  const {
    distance = 600,
    rotateX = 15,
    rotateY = 0,
    rotateZ = 0,
    scale = 1,
    duration = 800,
    ease = "outQuart",
    stagger = 60,
    originX = "center",
    originY = "center",
    targetIndices,
  } = options;

  return (word: Word) => {
    const originalTransforms = word.letters.map(
      (letter) => letter.svgElement.getAttribute("transform") || ""
    );
    const originalStyles = word.letters.map(
      (letter) => letter.svgElement.getAttribute("style") || ""
    );

    // Helper function to determine if a letter should be transformed
    const shouldTransformLetter = (index: number): boolean => {
      return !targetIndices || targetIndices.includes(index);
    };

    // Build the 3D transform string
    const targetTransform = [
      `perspective(${distance}px)`,
      rotateX !== 0 ? `rotateX(${rotateX}deg)` : "",
      rotateY !== 0 ? `rotateY(${rotateY}deg)` : "",
      rotateZ !== 0 ? `rotateZ(${rotateZ}deg)` : "",
      scale !== 1 ? `scale(${scale})` : "",
    ].filter(Boolean).join(" ");

    // Set initial state and transform origin for all letters
    word.letters.forEach((letter, i) => {
      const element = letter.svgElement;
      element.style.transformOrigin = `${originX} ${originY}`;
      element.style.transform = "";
    });

    // Apply the transforms only to target letters
    word.letters.forEach((letter, i) => {
      if (shouldTransformLetter(i)) {
        setTimeout(() => {
          letter.svgElement.style.transition = `transform ${duration}ms ease-out`;
          letter.svgElement.style.transform = targetTransform;
        }, i * stagger);
      }
    });

    // Return undo function
    return () => {
      word.letters.forEach((letter, i) => {
        // Only undo the letters that were transformed
        if (shouldTransformLetter(i)) {
          letter.svgElement.style.transition = `transform ${DEFAULT_UNDO_ANIMATION.duration}ms ease-out`;
          letter.svgElement.style.transform = "";

          // Clean up after animation
          setTimeout(() => {
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
            letter.svgElement.setAttribute("style", originalStyles[i]);
          }, DEFAULT_UNDO_ANIMATION.duration);
        }
      });
    };
  };
}