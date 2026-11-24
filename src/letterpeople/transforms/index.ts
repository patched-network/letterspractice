/**
 * Transform Functions Library - Barrel Exports
 *
 * This module provides reusable, configurable transform functions that can be
 * applied to WordDisplay components for geometric letter positioning and effects.
 *
 * All transform functions follow the pattern:
 * - Accept configuration options as parameters
 * - Return a TransformFunction that works with the Word instance
 * - Use anime.js or CSS transitions for smooth animations
 * - Return undo functions for clean prop removal
 */

// Import for brand constant
import { createRandomColorTransform } from "./color";

/**
 * Brand color transform - used for logo and username displays
 * Applies random vibrant colors with no animation
 */
export const BRAND_COLOR_TRANSFORM = createRandomColorTransform({
  duration: 0,
  animate: false,
});

// Export constants
export * from "./constants";

// Export individual transform functions and their interfaces
export { createJiggleTransform, type JiggleOptions } from "./jiggle";
export { createScatterTransform, type ScatterOptions } from "./scatter";
export {
  createPerspectiveTransform,
  type PerspectiveOptions,
} from "./perspective";
export {
  createColorTransform,
  createRainbowTransform,
  createSingleColorTransform,
  createRandomColorTransform,
  colorPatterns,
  type ColorOptions,
} from "./color";
export {
  createFanTransform,
  createRainbowTransform as createRainbowArcTransform,
  createSubtleCurveTransform,
  type FanOptions,
} from "./fan";
export { composeTransforms, composeTransformsSequential } from "./compose";

// Locomotion transforms (jumping, walking, etc.)
export {
  createJumpTransform,
  createHopTransform,
  createBouncyJumpTransform,
  createWalkTransform,
  createStrollTransform,
  createMarchTransform,
  createTreadmillTransform,
  type JumpOptions,
  type JumpEasing,
  type WalkOptions,
} from "./locomotion";

// Export transform registry for easy iteration/discovery
export const transforms = {
  jiggle: createJiggleTransform,
  perspective: createPerspectiveTransform,
  scatter: createScatterTransform,
  color: createColorTransform,
  rainbow: createRainbowTransform,
  fan: createFanTransform,
  jump: createJumpTransform,
  walk: createWalkTransform,
  // shadow: createShadowTransform,
  compose: composeTransforms,
} as const;

// Export type for all available transforms
export type AvailableTransforms = keyof typeof transforms;

// Import individual functions for the registry
import { createJiggleTransform } from "./jiggle";
import { createPerspectiveTransform } from "./perspective";
import { createScatterTransform } from "./scatter";
import { createColorTransform, createRainbowTransform } from "./color";
import { createFanTransform } from "./fan";
import { composeTransforms } from "./compose";
import { createJumpTransform, createWalkTransform } from "./locomotion";
// import { createShadowTransform } from "./shadow";
