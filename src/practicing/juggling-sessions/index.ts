/**
 * Juggling vignette session loader.
 *
 * Re-exports stage configs and types from the v2 architecture.
 *
 * @packageDocumentation
 */

export { loadStageConfig, IMPLEMENTED_STAGE_COUNT } from "./stages";

import { IMPLEMENTED_STAGE_COUNT } from "./stages";

/**
 * Maximum valid stage index (0-based).
 */
export const MAX_STAGE = IMPLEMENTED_STAGE_COUNT - 1;

// Re-export types for convenience
export type {
  VignetteSession,
  VignetteSegment,
  VignetteStageConfig,
  SkillId,
  SkillParams,
} from "./types";
