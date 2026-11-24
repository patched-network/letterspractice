import type { VignetteStageConfig } from "../types";

/**
 * Stage 1: "First Contact"
 *
 * j meets J juggling and learns the handoff.
 *
 * The intro sequence is handled by direct choreography in JJugglingVignette.vue
 * (runSession1Intro), NOT by the runner. The intro array is kept empty.
 *
 * The skillPool, jBehavior, and remediationMap ARE consumed by runIdleLoop()
 * which takes over after the scripted intro completes.
 */
export const stage01: VignetteStageConfig = {
  id: 1,
  title: "First Contact",
  theme: "j meets J juggling; learns the handoff",

  // Intro is driven by direct choreography — see JJugglingVignette.vue
  intro: [],

  // Idle loop: j practices handoffs with zero starting jitter (session 1 = easy)
  skillPool: [
    {
      skill: "handoff",
      weight: 1.0,
      params: { width: 0.3, count: 4, dwell: 0.5 },
      jitterStart: { throw: 0, catch: 0 },
    },
  ],

  // J watches j during idle loop (no independent cascade yet)
  jBehavior: {
    mode: "watch",
    reactions: true,
  },

  // No remediation needed — handoff is the base skill
  remediationMap: {},
};