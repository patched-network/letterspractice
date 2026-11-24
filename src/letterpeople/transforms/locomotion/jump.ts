/**
 * Jump Transform - Squash and Stretch Animation
 *
 * Creates a cartoon-style jump animation with anticipation squash,
 * launch stretch, air time, and landing recovery.
 *
 * Uses anime.js for smooth, coordinated animations.
 */

import { animate, createTimeline } from "animejs";
import type { TransformFunction } from "../../types";
import type { Word } from "../../Word";

export type GravityStyle = 'realistic' | 'princess-peach';

export interface JumpEasing {
  /** Easing for anticipation squash (default: "inQuad") */
  anticipation?: string;
  /** Easing for launch phase - only used in princess-peach mode (default: "outQuad") */
  launch?: string;
  /** Easing for airborne arc - only used in realistic mode (default: "easeInOutQuad") */
  airborne?: string;
  /** Easing for fall phase - only used in princess-peach mode (default: "inQuad") */
  fall?: string;
  /** Easing for landing recovery (default: "outElastic(1, 0.5)") */
  land?: string;
}

export interface JumpOptions {
  /** Jump height in pixels (default: 50) */
  height?: number;
  /** Total animation duration in ms (default: 700) */
  duration?: number;
  /** Squash factor for anticipation/landing, 0-1 where 0.7 = 30% squash (default: 0.7) */
  squashFactor?: number;
  /** Stretch factor at peak, >1 where 1.25 = 25% stretch (default: 1.25) */
  stretchFactor?: number;
  /** Stagger delay between letters in ms (default: 40) */
  stagger?: number;
  /** Number of jumps to perform (default: 1) */
  count?: number;
  /** Per-phase easing overrides */
  ease?: JumpEasing;
  /** Gravity style: realistic (smooth parabolic arc) or princess-peach (cartoonish hang at peak) (default: 'realistic') */
  gravityStyle?: GravityStyle;
}

// Phase timing for realistic gravity mode (percentages of total duration)
const REALISTIC_PHASE_TIMING = {
  anticipation: 0.15, // 15% - crouch down
  airborne: 0.70, // 70% - continuous parabolic arc
  land: 0.15, // 15% - impact + recovery
};

// Phase timing for princess-peach gravity mode (percentages of total duration)
const PRINCESS_PEACH_PHASE_TIMING = {
  anticipation: 0.15, // 15% - crouch down
  launch: 0.25, // 25% - launch to peak
  air: 0.2, // 20% - hang time at peak
  fall: 0.25, // 25% - fall to ground
  land: 0.15, // 15% - impact + recovery
};

// Default easing functions
const DEFAULT_EASE: Required<JumpEasing> = {
  anticipation: "inQuad",
  launch: "outQuad",
  airborne: "easeInOutQuad",
  fall: "inQuad",
  land: "outElastic(1, 0.5)",
};

/**
 * Creates a jump transform with squash-and-stretch animation
 *
 * @param options - Configuration for the jump animation
 * @returns TransformFunction that can be applied to a Word
 *
 * @example
 * ```typescript
 * const jump = createJumpTransform({ height: 60, squashFactor: 0.65 });
 * const cleanup = jump(word);
 * // Later: cleanup();
 * ```
 */
export function createJumpTransform(
  options: JumpOptions = {},
): TransformFunction {
  const {
    height = 50,
    duration = 700,
    squashFactor = 0.7,
    stretchFactor = 1.25,
    stagger = 40,
    count = 1,
    ease = {},
    gravityStyle = 'realistic',
  } = options;

  // Merge ease options with defaults
  const easing: Required<JumpEasing> = {
    ...DEFAULT_EASE,
    ...ease,
  };

  // Calculate phase durations based on gravity style
  const phaseDurations = gravityStyle === 'realistic'
    ? {
        anticipation: duration * REALISTIC_PHASE_TIMING.anticipation,
        airborne: duration * REALISTIC_PHASE_TIMING.airborne,
        land: duration * REALISTIC_PHASE_TIMING.land,
      }
    : {
        anticipation: duration * PRINCESS_PEACH_PHASE_TIMING.anticipation,
        launch: duration * PRINCESS_PEACH_PHASE_TIMING.launch,
        air: duration * PRINCESS_PEACH_PHASE_TIMING.air,
        fall: duration * PRINCESS_PEACH_PHASE_TIMING.fall,
        land: duration * PRINCESS_PEACH_PHASE_TIMING.land,
      };

  // Calculate compensated scale for volume preservation
  // When squashing vertically, expand horizontally to maintain perceived volume
  const squashCompensateX = 1 + (1 - squashFactor) * 0.5;
  const stretchCompensateX = 1 - (stretchFactor - 1) * 0.5;

  return (word: Word) => {
    const elements = word.letters.map((l) => l.svgElement);

    if (elements.length === 0) {
      return () => {};
    }

    // Store original transforms
    const originalTransforms = elements.map((el) => el.style.transform || "");
    const originalTransformOrigins = elements.map(
      (el) => el.style.transformOrigin || "",
    );

    // Set transform origin to bottom center for natural squash effect
    elements.forEach((el) => {
      el.style.transformOrigin = "center bottom";
    });

    let isRunning = true;
    let currentJump = 0;

    // Common anticipation phase for both gravity styles
    const anticipationPhase = async () => {
      await new Promise<void>((resolve) => {
        animate(elements, {
          scaleY: squashFactor,
          scaleX: squashCompensateX,
          duration: phaseDurations.anticipation,
          ease: easing.anticipation,
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
    };

    // Common landing phase for both gravity styles
    const landingPhase = async () => {
      await new Promise<void>((resolve) => {
        animate(elements, {
          scaleY: 1,
          scaleX: 1,
          duration: phaseDurations.land,
          ease: easing.land,
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
    };

    // Realistic jump: continuous parabolic arc with no hang
    const performRealisticJump = async () => {
      if (!isRunning) return;

      // Phase 1: Anticipation
      await anticipationPhase();
      if (!isRunning) return;

      // Phase 2a: Rise to peak (first half of airborne arc)
      // Go from squashed (current state) to neutral at apex
      const halfAirborneDuration = (phaseDurations as any).airborne / 2;

      await new Promise<void>((resolve) => {
        animate(elements, {
          translateY: -height,
          scaleY: 1.0,
          scaleX: 1.0,
          duration: halfAirborneDuration,
          ease: 'outQuad',
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
      if (!isRunning) return;

      // Phase 2b: Fall from peak (second half of airborne arc)
      await new Promise<void>((resolve) => {
        animate(elements, {
          translateY: 0,
          scaleY: squashFactor,
          scaleX: squashCompensateX,
          duration: halfAirborneDuration,
          ease: 'inQuad',
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
      if (!isRunning) return;

      // Phase 3: Landing recovery
      await landingPhase();
    };

    // Princess Peach jump: classic cartoon with hang at peak
    const performPrincessPeachJump = async () => {
      if (!isRunning) return;

      // Phase 1: Anticipation
      await anticipationPhase();
      if (!isRunning) return;

      // Phase 2: Launch (stretch up + translate)
      await new Promise<void>((resolve) => {
        animate(elements, {
          scaleY: stretchFactor,
          scaleX: stretchCompensateX,
          translateY: -height,
          duration: (phaseDurations as any).launch,
          ease: easing.launch,
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
      if (!isRunning) return;

      // Phase 3: Air time (the hang/float at peak)
      await new Promise<void>((resolve) => {
        animate(elements, {
          scaleY: stretchFactor * 0.92,
          scaleX: 1,
          duration: (phaseDurations as any).air,
          ease: "linear",
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
      if (!isRunning) return;

      // Phase 4: Fall (translate down + pre-squash)
      await new Promise<void>((resolve) => {
        animate(elements, {
          translateY: 0,
          scaleY: squashFactor,
          scaleX: squashCompensateX,
          duration: (phaseDurations as any).fall,
          ease: easing.fall,
          delay: (_el: any, i: number) => i * stagger,
          onComplete: () => resolve(),
        });
      });
      if (!isRunning) return;

      // Phase 5: Landing recovery
      await landingPhase();
    };

    // Main jump function - select implementation based on gravity style
    const performJump = async () => {
      if (gravityStyle === 'realistic') {
        await performRealisticJump();
      } else {
        await performPrincessPeachJump();
      }

      currentJump++;

      // Continue for multiple jumps
      if (isRunning && currentJump < count) {
        // Small pause between jumps
        await new Promise((r) => setTimeout(r, 100));
        await performJump();
      }
    };

    // Start the jump animation
    performJump();

    // Return cleanup function
    return () => {
      isRunning = false;

      // Restore original state
      elements.forEach((el, i) => {
        el.style.transform = originalTransforms[i];
        el.style.transformOrigin = originalTransformOrigins[i];
      });
    };
  };
}

/**
 * Convenience function for a single small hop
 */
export function createHopTransform(): TransformFunction {
  return createJumpTransform({
    height: 25,
    duration: 400,
    squashFactor: 0.85,
    stretchFactor: 1.1,
    stagger: 25,
    gravityStyle: 'realistic',
  });
}

/**
 * Convenience function for an excited bouncy jump
 */
export function createBouncyJumpTransform(): TransformFunction {
  return createJumpTransform({
    height: 70,
    duration: 800,
    squashFactor: 0.6,
    stretchFactor: 1.35,
    stagger: 30,
    gravityStyle: 'realistic',
    ease: {
      land: "outElastic(1.2, 0.4)",
    },
  });
}
