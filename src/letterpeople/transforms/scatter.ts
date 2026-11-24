/**
 * Scatter Transform - Random distribution within radius
 *
 * Creates a scatter transform that spreads letters randomly within a radius
 * Attempts to avoid collisions between letters
 */

import { animate, type Target } from "animejs";
import type { TransformFunction } from "../types";
import type { Word } from "../Word";
import { DEFAULT_UNDO_ANIMATION } from "./constants";

export interface ScatterOptions {
  /** Radius of scatter area (default: 50) */
  radius?: number;
  /** Minimum distance between letters (default: 10) */
  minDistance?: number;
  /** Maximum attempts to place without collision (default: 50) */
  maxAttempts?: number;
  /** Animation duration in ms (default: 800) */
  duration?: number;
  /** Animation easing function (default: "outBack(1.7)") */
  ease?: string;
  /** Random seed for reproducible results */
  seed?: number;
}

/**
 * Creates a scatter transform that spreads letters randomly within a radius
 * Attempts to avoid collisions between letters
 */
export function createScatterTransform(options: ScatterOptions = {}): TransformFunction {
  const {
    radius = 50,
    minDistance = 10,
    maxAttempts = 50,
    duration = 800,
    ease = "outBack(1.7)",
    seed,
  } = options;

  return (word: Word) => {
    const originalTransforms = word.letters.map(
      (letter) => letter.svgElement.getAttribute("transform") || ""
    );

    // Set up seeded random if provided
    let seedState = seed || Math.random();
    const seededRandom = () => {
      seedState = (seedState * 9301 + 49297) % 233280;
      return seedState / 233280;
    };

    // Generate positions with collision avoidance
    const positions: { x: number; y: number }[] = [];

    word.letters.forEach(() => {
      let position = { x: 0, y: 0 };
      let attempts = 0;
      let validPosition = false;

      while (!validPosition && attempts < maxAttempts) {
        // Generate random position within radius
        const angle = seededRandom() * Math.PI * 2;
        const distance = seededRandom() * radius;
        position = {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
        };

        // Check distance from other letters
        validPosition = positions.every(existing => {
          const dx = position.x - existing.x;
          const dy = position.y - existing.y;
          return Math.sqrt(dx * dx + dy * dy) >= minDistance;
        });

        attempts++;
      }

      positions.push(position);
    });

    // Animate letters to scatter positions
    animate(word.letters.map(letter => letter.svgElement), {
      translateX: (el: Target, i: number) => positions[i].x,
      translateY: (el: Target, i: number) => positions[i].y,
      rotate: (el: Target, i: number) => (seededRandom() - 0.5) * 30, // Small random rotation
      duration,
      ease,
      delay: (el: Target, i: number) => i * 80, // Stagger the scatter
    });

    // Return undo function
    return () => {
      animate(word.letters.map(letter => letter.svgElement), {
        translateX: 0,
        translateY: 0,
        rotate: 0,
        duration: DEFAULT_UNDO_ANIMATION.duration,
        ease: DEFAULT_UNDO_ANIMATION.ease,
        complete: () => {
          word.letters.forEach((letter, i) => {
            letter.svgElement.setAttribute("transform", originalTransforms[i]);
          });
        }
      });
    };
  };
}