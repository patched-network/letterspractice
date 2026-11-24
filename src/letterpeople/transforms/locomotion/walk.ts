/**
 * Walk Transform - Wiggle Waddle Animation
 *
 * Creates a bouncy walking effect using body rotation and translation.
 * Refactored to delegate animation mechanics to LetterInstance.body.
 */

import { animate } from "animejs";
import type { TransformFunction } from "../../types";
import type { Word } from "../../Word";

export interface WalkOptions {
  /** Direction of travel */
  direction: "left" | "right" | "toward" | "away";
  /** Speed in pixels per second (default: 100) */
  speed?: number;
  /** Total distance to travel in pixels (default: 200) */
  distance?: number;
  /** Whether to actually translate position, or walk in place (default: true) */
  translate?: boolean;
  /** Wobble angle in degrees for side-to-side tilt (default: 10) */
  wobbleAngle?: number;
  /** Vertical bob height in pixels (default: 6) */
  bobHeight?: number;
  /** Duration of one step cycle in ms (default: 280) */
  stepDuration?: number;
  /** Whether to loop indefinitely (default: false) */
  loop?: boolean;
  /** Stagger delay between letters in ms (default: 30) */
  stagger?: number;
  /** Easing function for step animation (default: "inOutSine") */
  ease?: string;
  /** Starting X position for stateful walks (default: 0) */
  startX?: number;
  /** Starting scale for stateful depth walks (default: 1) */
  startScale?: number;
  /** Callback with final position when walk completes */
  onComplete?: (finalState: { x: number; scale: number }) => void;
}

// Default values
const DEFAULT_SPEED = 100;
const DEFAULT_DISTANCE = 200;
const DEFAULT_WOBBLE_ANGLE = 10;
const DEFAULT_BOB_HEIGHT = 6;
const DEFAULT_STEP_DURATION = 280;
const DEFAULT_STAGGER = 30;
const DEFAULT_EASE = "inOutSine";

export function createWalkTransform(options: WalkOptions): TransformFunction {
  const {
    direction,
    speed = DEFAULT_SPEED,
    distance = DEFAULT_DISTANCE,
    translate = true,
    wobbleAngle = DEFAULT_WOBBLE_ANGLE,
    bobHeight = DEFAULT_BOB_HEIGHT,
    stepDuration = DEFAULT_STEP_DURATION,
    loop = false,
    stagger = DEFAULT_STAGGER,
    ease = DEFAULT_EASE,
    startX = 0,
    startScale = 1,
    onComplete,
  } = options;

  // Calculate step count
  const totalDuration = (distance / speed) * 1000;
  const stepCount = Math.max(1, Math.ceil(totalDuration / stepDuration));

  // Direction multipliers
  const isLateral = direction === "left" || direction === "right";
  const directionMultiplier = direction === "right" || direction === "toward" ? 1 : -1;

  return (word: Word) => {
    if (word.letters.length === 0) return () => {};

    // Start walking gait on all letters
    word.letters.forEach((letter, i) => {
      letter.body.startWalking({
        wobbleAngle,
        bobHeight,
        stepDuration,
        stagger: i * stagger,
        ease
      });
      
      // Initialize position
      const initialHorizonY = (startScale - 1) * 20;
      letter.body.setPosition(startX, initialHorizonY);
      letter.body.setScale(startScale);
    });

    let isRunning = true;
    let currentStep = 0;
    let currentX = startX;
    let currentScale = startScale;

    // Calculate per-step translation
    const stepTranslateX = translate && isLateral
      ? (distance / stepCount) * directionMultiplier
      : 0;

    const scalePerStep = !isLateral && translate
      ? ((direction === "toward" ? 0.3 : -0.3) / stepCount)
      : 0;

    const performStep = async (stepIndex: number): Promise<void> => {
      if (!isRunning) return;

      // Update cumulative position targets
      const targetX = currentX + stepTranslateX;
      const targetScale = currentScale + scalePerStep;

      // Animate translation for all letters
      await new Promise<void>((resolve) => {
        const letterPromises = word.letters.map((letter, i) => {
          return new Promise<void>((letterResolve) => {
            // We animate a dummy object to drive the BodyController updates
            // This preserves the 'animejs' timing logic from the original implementation
            const animState = { 
              x: currentX, 
              scale: currentScale 
            };

            setTimeout(() => {
              animate(animState, {
                x: targetX,
                scale: targetScale,
                duration: stepDuration,
                ease: ease,
                onUpdate: () => {
                  const horizonY = (animState.scale - 1) * 20;
                  letter.body.setPosition(animState.x, horizonY);
                  letter.body.setScale(animState.scale);
                },
                onComplete: () => letterResolve()
              });
            }, i * stagger);
          });
        });

        Promise.all(letterPromises).then(() => {
          // Update state after step completes
          currentX = targetX;
          currentScale = targetScale;
          resolve();
        });
      });
    };

    const walkLoop = async () => {
      while (isRunning) {
        await performStep(currentStep);
        currentStep++;

        if (!loop && currentStep >= stepCount) {
          isRunning = false;
          // Report final state
          onComplete?.({ x: currentX, scale: currentScale });
          // Stop walking gait
          word.letters.forEach(l => l.body.stopWalking());
          break;
        }

        if (loop && currentStep >= stepCount) {
          currentStep = 0;
          if (!translate) {
            // For walk-in-place, continue looping
          }
        }
      }
    };

    walkLoop();

    return () => {
      isRunning = false;
      word.letters.forEach(l => {
        l.body.stopWalking();
        l.body.resetPose(); // Reset position/scale/rotation
      });
    };
  };
}

export function createStrollTransform(direction: "left" | "right" = "right"): TransformFunction {
  return createWalkTransform({
    direction,
    speed: 60,
    wobbleAngle: 6,
    bobHeight: 4,
    stepDuration: 350,
    distance: 150,
  });
}

export function createMarchTransform(direction: "left" | "right" = "right"): TransformFunction {
  return createWalkTransform({
    direction,
    speed: 150,
    wobbleAngle: 12,
    bobHeight: 8,
    stepDuration: 200,
    distance: 200,
  });
}

export function createTreadmillTransform(direction: "left" | "right" = "right"): TransformFunction {
  return createWalkTransform({
    direction,
    translate: false,
    loop: true,
    wobbleAngle: 8,
    bobHeight: 5,
    stepDuration: 300,
  });
}

export function createResetTransform(
  currentState: { x: number; scale: number },
  options?: { duration?: number; stagger?: number; onComplete?: () => void }
): TransformFunction {
  const { duration = 400, stagger = 20, onComplete } = options ?? {};

  return (word: Word) => {
    word.letters.forEach((letter, i) => {
      // Animate back to origin using BodyController
      // We need to animate manually because resetPose() resets everything to 0/1 instantly (or single animation)
      // but we want to interpolate from CURRENT position.
      // Actually, BodyController.resetPose() does animate if duration is provided!
      // But it resets to (0,0) and scale 1.
      
      // We want to animate from currentState to 0.
      // BodyController state is already at currentState (from walk loop).
      // So simply calling resetPose should work?
      // Wait, resetPose() animates FROM current internal state TO default.
      // Yes, BodyController manages state.
      
      setTimeout(() => {
        letter.body.resetPose({ duration }).then(() => {
          if (i === word.letters.length - 1) {
            onComplete?.();
          }
        });
      }, i * stagger);
    });

    return () => {};
  };
}