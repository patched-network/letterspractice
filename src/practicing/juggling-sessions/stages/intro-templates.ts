/**
 * Intro sequence templates for derived stages (hybrid: templates + escape hatch).
 *
 * Each template builds a VignetteSegment[] played by runner.ts before the idle
 * loop. Stage 1 is the escape hatch — its bespoke direct choreography lives in
 * JJugglingVignette.vue and its config keeps an empty intro.
 *
 * @packageDocumentation
 */

import type { SkillParams, VignetteSegment } from "../types";
import type { SkillMilestone, StageMeta } from "./skill-timeline";

/**
 * Demo params guard: cascades with maxBeats 0 run forever and would hang an
 * untimed demo segment; clamp to a short flash. Also caps rep counts so the
 * intro stays in the 5-15s band.
 */
function demoParams(m: SkillMilestone, opts?: { slow?: boolean; quick?: boolean }): SkillParams {
  const p: SkillParams = { ...m.params, jitter: 0.03 };
  if ((m.skill === "cascade" || m.skill === "cascadeFlash") && !p.maxBeats) {
    p.maxBeats = 6;
  }
  if (opts?.slow) {
    // Slow, deliberate first demo: fewer reps, generous dwell
    if (p.count) p.count = Math.min(p.count, 2);
    p.dwell = Math.max(p.dwell ?? 0.5, 0.5);
  }
  if (opts?.quick && p.count) {
    p.count = Math.min(p.count, 2);
  }
  return p;
}

/** J turns to j, demos the new skill slowly, then once at tempo. */
function demoIntro(m: SkillMilestone): VignetteSegment[] {
  return [
    { step: 1, type: "transition", actor: "both", action: "faceEachOther", durationMs: 600 },
    { step: 2, type: "demo", actor: "J", skill: m.skill, params: demoParams(m, { slow: true }) },
    { step: 3, type: "demo", actor: "J", skill: m.skill, params: demoParams(m) },
    { step: 4, type: "transition", actor: "both", action: "encouragement", durationMs: 800 },
  ];
}

/** Brief nod + single reminder demo — j already knows this skill. */
function consolidationIntro(m: SkillMilestone): VignetteSegment[] {
  return [
    { step: 1, type: "transition", actor: "J", action: "nod", durationMs: 800 },
    { step: 2, type: "demo", actor: "J", skill: m.skill, params: demoParams(m, { quick: true }) },
  ];
}

/** Stage 20: J showcases the full cascade, slow and high. j studies it. */
function revealIntro(): VignetteSegment[] {
  return [
    {
      step: 1,
      type: "showcase",
      actor: "J",
      skill: "cascade",
      params: { height: 50, beatTiming: 0.65, jitter: 0.03 },
      durationMs: 5000,
    },
    { step: 2, type: "transition", actor: "J", action: "gatherAndStop", durationMs: 600 },
    {
      step: 3,
      type: "demo",
      actor: "J",
      skill: "cascadeFlash",
      params: { height: 42, maxBeats: 3, jitter: 0.03 },
    },
    { step: 4, type: "transition", actor: "j", action: "lookAt", meta: { target: "J" }, durationMs: 900 },
  ];
}

/** Stage 30: J and j cascade together, then celebrate. Terminal stage. */
function graduationIntro(): VignetteSegment[] {
  return [
    {
      step: 1,
      type: "together",
      actor: "both",
      skill: "cascadeFlash",
      params: { height: 42, maxBeats: 10, beatTiming: 0.55, throwJitter: 0.04, catchJitter: 0.04 },
    },
    { step: 2, type: "transition", actor: "both", action: "celebrate", durationMs: 1200 },
  ];
}

/** Build the intro sequence for a stage from its metadata + frontier milestone. */
export function buildIntro(meta: StageMeta, frontier: SkillMilestone): VignetteSegment[] {
  switch (meta.intro) {
    case "bespoke":
      return []; // direct choreography in JJugglingVignette.vue
    case "demo":
      return demoIntro(frontier);
    case "consolidation":
      return consolidationIntro(frontier);
    case "reveal":
      return revealIntro();
    case "graduation":
      return graduationIntro();
  }
}
