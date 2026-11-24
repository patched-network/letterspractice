/**
 * Locomotion Transforms
 *
 * Transforms for letter movement: jumping, walking, and related animations.
 */

export {
  createJumpTransform,
  createHopTransform,
  createBouncyJumpTransform,
  type JumpOptions,
  type JumpEasing,
  type GravityStyle,
} from "./jump";

export {
  createWalkTransform,
  createStrollTransform,
  createMarchTransform,
  createTreadmillTransform,
  createResetTransform,
  type WalkOptions,
} from "./walk";
