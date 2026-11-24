import type { Component } from 'vue';

/**
 * The fixed logical authoring frame for vignette scenes.
 *
 * Scenes are composed against this frame (actor placement, heights, walk
 * targets are all in these units) and contain-fit scaled to whatever space
 * the host gives them — see useContainScale. Design/test against this frame
 * in /dbg/vignettes; the live end screen just renders it bigger or smaller.
 */
export const VIGNETTE_FRAME = {
  width: 800,
  height: 450,
} as const;

export interface VignetteProps {
  /** Skill transfer stage 0 to maxStage (controls how much the character has learned) */
  stage: number;
  /** Auto-play the sequence on mount */
  autoPlay?: boolean;
}

/** 
 * Basic metadata exported by the component itself 
 * (Does not include the component to avoid circular dependencies)
 */
export interface VignetteInfo {
  /** Display name of the vignette */
  name: string;
  /** The maximum stage index (e.g., 5 means 0-5 inclusive) */
  maxStage: number;
  /** Brief description of what this vignette shows */
  description?: string;
}

/**
 * Full metadata used by consumers/registries
 */
export interface VignetteMetadata extends VignetteInfo {
  /** The component itself */
  component: Component<any>;
}
