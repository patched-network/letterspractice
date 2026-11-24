/**
 * Transform Constants
 *
 * Shared constants and default values for transform functions
 */

// Common animation defaults (using milliseconds - aligns with CSS and native timers)
export const DEFAULT_ANIMATION = {
  duration: 600,
  ease: "outElastic(1, .6)",
  delay: 0,
  stagger: 50,
} as const;

export const DEFAULT_UNDO_ANIMATION = {
  duration: 400,
  ease: "outQuad",
  delay: 0,
} as const;