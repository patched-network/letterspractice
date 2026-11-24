/**
 * Stage config derivation — turns the skill timeline (skill-timeline.ts) into
 * VignetteStageConfig objects via the formulas in TODO-session-progression.md:
 *
 *   Pool weight:  frontier = 1.0; else max(0.30 * exp(-age * 0.35), 0.04)
 *                 (the 0.04 floor is the callback-play guarantee — old skills
 *                 keep resurfacing intermittently forever)
 *   Jitter:       max(0.04, introJitter * (0.3 + 0.7 * exp(-age * 0.35)))
 *
 * where age = stage - milestone.stage. Stages without a new milestone are
 * consolidation stages: the frontier stays the newest milestone, its jitter
 * one decay-step lower.
 *
 * @packageDocumentation
 */

import type {
  RemediationConfig,
  SkillId,
  SkillPoolEntry,
  VignetteStageConfig,
} from "../types";
import {
  SKILL_TIMELINE,
  STAGE_METAS,
  type SkillMilestone,
  type StageMeta,
} from "./skill-timeline";
import { buildIntro } from "./intro-templates";

const JITTER_FLOOR = 0.04;
const WEIGHT_FLOOR = 0.04;

function ageDecay(age: number): number {
  return 0.3 + 0.7 * Math.exp(-age * 0.35);
}

/** Milestones introduced by `stageId` and not retired by a newer variant. */
export function milestonesActiveAt(stageId: number): SkillMilestone[] {
  const introduced = SKILL_TIMELINE.filter((m) => m.stage <= stageId);
  const superseded = new Set(
    introduced.map((m) => m.supersedes).filter((k): k is string => !!k),
  );
  return introduced.filter((m) => !superseded.has(m.key));
}

/** The frontier milestone for a stage: newest introduced, unless overridden. */
export function frontierMilestone(stageId: number, meta?: StageMeta): SkillMilestone {
  const active = milestonesActiveAt(stageId);
  if (meta?.frontierKey) {
    const named = active.find((m) => m.key === meta.frontierKey);
    if (named) return named;
  }
  return active.reduce((a, b) => (b.stage >= a.stage ? b : a));
}

function jitterAt(m: SkillMilestone, stageId: number): { throw: number; catch: number } {
  const decay = ageDecay(stageId - m.stage);
  return {
    throw: Math.max(JITTER_FLOOR, m.introJitter.throw * decay),
    catch: Math.max(JITTER_FLOOR, m.introJitter.catch * decay),
  };
}

export function deriveStageConfig(stageId: number): VignetteStageConfig {
  const meta = STAGE_METAS[stageId - 1];
  if (!meta) {
    throw new Error(`[derive] No stage metadata for stage ${stageId}`);
  }

  const active = milestonesActiveAt(stageId);
  const frontier = frontierMilestone(stageId, meta);

  const skillPool: SkillPoolEntry[] = active.map((m) => {
    const age = stageId - m.stage;
    const weight =
      m.key === frontier.key
        ? 1.0
        : Math.max(0.3 * Math.exp(-age * 0.35), WEIGHT_FLOOR);
    return {
      skill: m.skill,
      weight,
      params: m.params,
      jitterStart: jitterAt(m, stageId),
    };
  });

  // Remediation: per active milestone, resolved by key. When multiple active
  // milestones share a SkillId (rare — variants usually supersede), the
  // newest one's remediation wins because `active` is in timeline order.
  const byKey = new Map(SKILL_TIMELINE.map((m) => [m.key, m]));
  const remediationMap: Partial<Record<SkillId, RemediationConfig>> = {};
  for (const m of active) {
    if (!m.remediation || m.remediation.reps <= 0) continue;
    const target = byKey.get(m.remediation.key);
    if (!target) {
      console.warn(`[derive] Unknown remediation key "${m.remediation.key}" on ${m.key}`);
      continue;
    }
    remediationMap[m.skill] = {
      skill: target.skill,
      params: target.params,
      reps: m.remediation.reps,
    };
  }

  const jMode = meta.jMode ?? (stageId <= 3 ? "watch" : "cascade");

  return {
    id: stageId,
    title: meta.title,
    theme: meta.theme,
    intro: buildIntro(meta, frontier),
    skillPool,
    jBehavior: {
      mode: jMode,
      ...(jMode === "cascade"
        ? { cascadeParams: { height: 45, jitter: 0.03 } }
        : {}),
      reactions: true,
    },
    remediationMap,
  };
}
