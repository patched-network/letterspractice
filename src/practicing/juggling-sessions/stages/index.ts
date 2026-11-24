import type { VignetteStageConfig } from "../types";
import { stage01 } from "./stage-01";
import { deriveStageConfig } from "./derive";
import { STAGE_COUNT } from "./skill-timeline";

const cache = new Map<number, VignetteStageConfig>();

/**
 * Load a VignetteStageConfig by stage index (0-based).
 * Stage 0 → config id 1, Stage 1 → config id 2, etc.
 *
 * Indexes past the end clamp to the terminal stage (graduation, which loops
 * forever) — there is no "beyond the curriculum" blank scene.
 *
 * Stage 1 keeps its hand-authored config (bespoke intro choreography);
 * stages 2+ are derived from the skill timeline.
 */
export function loadStageConfig(stageIndex: number): VignetteStageConfig | null {
  const clamped = Math.min(Math.max(stageIndex, 0), STAGE_COUNT - 1);
  const id = clamped + 1;
  if (id === 1) return stage01;

  let config = cache.get(id);
  if (!config) {
    config = deriveStageConfig(id);
    cache.set(id, config);
  }
  return config;
}

export const IMPLEMENTED_STAGE_COUNT = STAGE_COUNT;
