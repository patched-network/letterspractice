/**
 * Skill timeline — the single source of truth for the 30-stage juggling
 * progression. Stage configs (pools, jitter, remediation) are DERIVED from
 * this table by `derive.ts`; hand-tuning happens here, not in 30 config files.
 *
 * See TODO-session-progression.md for the design rules and formulas.
 *
 * @packageDocumentation
 */

import type { SkillId, SkillParams } from "../types";

// ── Milestones ───────────────────────────────────────────────────────────

/**
 * A skill milestone: a skill (or param-variant of a skill) entering j's
 * repertoire at a particular stage.
 */
export interface SkillMilestone {
  /** Unique key, e.g. "arcPass.tall". */
  key: string;
  /** Which SkillId the idle runner executes. */
  skill: SkillId;
  /** 1-based stage at which this milestone is introduced (becomes frontier). */
  stage: number;
  /** Base parameters for the skill at this milestone. */
  params: SkillParams;
  /**
   * Jitter at introduction. Ceilings: throw ≤ 0.5, catch ≤ 0.55 — a miss
   * every 2-3 attempts reads as effortful, not broken.
   */
  introJitter: { throw: number; catch: number };
  /**
   * Key of an earlier milestone this one retires from pools (same skill,
   * grown params — the old variant is a visual duplicate).
   */
  supersedes?: string;
  /** Drop remediation: which milestone to fall back to, and how many reps. */
  remediation?: { key: string; reps: number };
}

export const SKILL_TIMELINE: SkillMilestone[] = [
  {
    key: "handoff",
    skill: "handoff",
    stage: 1,
    params: { width: 0.3, count: 4, dwell: 0.5 },
    introJitter: { throw: 0, catch: 0 },
  },
  {
    key: "tossToSelf.tiny",
    skill: "tossToSelf",
    stage: 2,
    params: { height: 10, count: 3, alternating: true },
    introJitter: { throw: 0.4, catch: 0.5 },
    remediation: { key: "handoff", reps: 2 },
  },
  {
    key: "catch2H.low",
    skill: "tossTo2HandedCatch",
    stage: 4,
    params: { height: 18, count: 3, alternating: true },
    introJitter: { throw: 0.4, catch: 0.45 },
    remediation: { key: "tossToSelf.tiny", reps: 2 },
  },
  {
    key: "catch2H.high",
    skill: "tossTo2HandedCatch",
    stage: 5,
    params: { height: 28, count: 3, alternating: true },
    introJitter: { throw: 0.3, catch: 0.35 },
    supersedes: "catch2H.low",
    remediation: { key: "tossToSelf.tiny", reps: 2 },
  },
  {
    key: "dropCatch",
    skill: "dropCatch",
    stage: 6,
    params: { height: 30, count: 4, width: 0.3 },
    introJitter: { throw: 0.35, catch: 0.45 },
    remediation: { key: "catch2H.high", reps: 2 },
  },
  {
    key: "oneHand",
    skill: "oneHandedTossAndCatch",
    stage: 7,
    params: { height: 22, count: 3, offset: 0.3, alternating: true },
    introJitter: { throw: 0.45, catch: 0.55 },
    remediation: { key: "dropCatch", reps: 2 },
  },
  {
    key: "arcPass.easy",
    skill: "arcPass",
    stage: 9,
    params: { height: 24, count: 4, dwell: 0.6, alternating: true },
    introJitter: { throw: 0.4, catch: 0.45 },
    remediation: { key: "oneHand", reps: 2 },
  },
  {
    key: "arcPass.med",
    skill: "arcPass",
    stage: 10,
    params: { height: 26, count: 4, alternating: true },
    introJitter: { throw: 0.35, catch: 0.4 },
    supersedes: "arcPass.easy",
    remediation: { key: "oneHand", reps: 2 },
  },
  {
    key: "arcPass.tall",
    skill: "arcPass",
    stage: 11,
    params: { height: 34, count: 5, dwell: 0.22, alternating: true },
    introJitter: { throw: 0.3, catch: 0.35 },
    supersedes: "arcPass.med",
    remediation: { key: "oneHand", reps: 2 },
  },
  {
    key: "syncCol",
    skill: "syncColumns",
    stage: 12,
    params: { height: 20, count: 3 },
    introJitter: { throw: 0.4, catch: 0.5 },
    remediation: { key: "tossToSelf.tiny", reps: 2 },
  },
  {
    key: "asyncCol",
    skill: "asyncColumns",
    stage: 14,
    params: { height: 20, count: 4, beatTiming: 0.5 },
    introJitter: { throw: 0.35, catch: 0.45 },
    remediation: { key: "syncCol", reps: 2 },
  },
  {
    key: "exchange",
    skill: "2ballExchange",
    stage: 16,
    params: { height: 28, count: 1, beatTiming: 0.55 },
    introJitter: { throw: 0.4, catch: 0.5 },
    remediation: { key: "arcPass.tall", reps: 3 },
  },
  {
    key: "continuous",
    skill: "2ballContinuous",
    stage: 18,
    params: { height: 28, count: 4, beatTiming: 0.55 },
    introJitter: { throw: 0.3, catch: 0.4 },
    remediation: { key: "exchange", reps: 1 },
  },
  {
    key: "flash3",
    skill: "cascadeFlash",
    stage: 21,
    params: { height: 38, maxBeats: 3 },
    introJitter: { throw: 0.4, catch: 0.5 },
    remediation: { key: "continuous", reps: 2 },
  },
  {
    key: "flash5",
    skill: "cascadeFlash",
    stage: 23,
    params: { height: 40, maxBeats: 5 },
    introJitter: { throw: 0.3, catch: 0.38 },
    supersedes: "flash3",
    remediation: { key: "continuous", reps: 2 },
  },
  {
    key: "flash6",
    skill: "cascadeFlash",
    stage: 24,
    params: { height: 42, maxBeats: 6 },
    introJitter: { throw: 0.25, catch: 0.3 },
    supersedes: "flash5",
    remediation: { key: "continuous", reps: 2 },
  },
  {
    key: "flash10",
    skill: "cascadeFlash",
    stage: 25,
    params: { height: 40, maxBeats: 10 },
    introJitter: { throw: 0.2, catch: 0.25 },
    supersedes: "flash6",
    remediation: { key: "continuous", reps: 2 },
  },
  {
    key: "cascade.run",
    skill: "cascade",
    stage: 26,
    params: { height: 40, maxBeats: 0 },
    introJitter: { throw: 0.15, catch: 0.18 },
    supersedes: "flash10",
    remediation: { key: "continuous", reps: 2 },
  },
  {
    key: "cascade.high",
    skill: "cascade",
    stage: 28,
    params: { height: 50, maxBeats: 10 },
    introJitter: { throw: 0.15, catch: 0.18 },
  },
  {
    key: "cascade.fast",
    skill: "cascade",
    stage: 29,
    params: { height: 28, beatTiming: 0.48, maxBeats: 8 },
    introJitter: { throw: 0.15, catch: 0.18 },
  },
];

// ── Per-stage metadata ───────────────────────────────────────────────────

export type IntroKind =
  | "bespoke" // direct choreography in JJugglingVignette.vue (stage 1 only)
  | "demo" // J demos the frontier skill (default for milestone stages)
  | "consolidation" // brief nod + reminder demo (stages with no new milestone)
  | "reveal" // stage 20: J showcases the full cascade
  | "graduation"; // stage 30: together-cascade

export interface StageMeta {
  /** 1-based stage id. */
  id: number;
  title: string;
  theme: string;
  intro: IntroKind;
  /** Override J's idle mode (default: watch for stages 1-3, cascade after). */
  jMode?: "watch" | "cascade";
  /**
   * Override the frontier milestone (weight 1.0 in the pool). Default is the
   * newest introduced milestone.
   */
  frontierKey?: string;
}

export const STAGE_METAS: StageMeta[] = [
  { id: 1, title: "First Contact", theme: "j meets J juggling; learns the handoff", intro: "bespoke" },
  { id: 2, title: "First Toss", theme: "the ball leaves j's hand for the first time", intro: "demo" },
  { id: 3, title: "Both Hands", theme: "tiny tosses settle in; both hands take turns", intro: "consolidation" },
  { id: 4, title: "Catch It!", theme: "a real throw — both hands swallow the catch", intro: "demo" },
  { id: 5, title: "Higher", theme: "same catch, braver throw", intro: "demo" },
  { id: 6, title: "One Hand Waits", theme: "ball drops from one hand into the other below", intro: "demo" },
  { id: 7, title: "One-Handed", theme: "throw and catch with the SAME hand", intro: "demo" },
  { id: 8, title: "Steady Hands", theme: "the one-handed wobble fades", intro: "consolidation" },
  { id: 9, title: "Across", theme: "the ball hops hand to hand through the air", intro: "demo" },
  { id: 10, title: "The Arc", theme: "a proper rainbow arc", intro: "demo" },
  { id: 11, title: "Quick Rhythm", theme: "faster, taller, confident tempo", intro: "demo" },
  { id: 12, title: "Two Balls!", theme: "TWO balls in the air at once", intro: "demo" },
  { id: 13, title: "Steady Columns", theme: "two-ball columns without panic", intro: "consolidation" },
  { id: 14, title: "Off-Beat", theme: "hands take turns — staggered rhythm", intro: "demo" },
  { id: 15, title: "Drumming", theme: "the stagger becomes a groove", intro: "consolidation" },
  { id: 16, title: "The Exchange", theme: "balls CROSS in the air", intro: "demo" },
  { id: 17, title: "Clean Crossing", theme: "the crossing stops colliding", intro: "consolidation" },
  { id: 18, title: "Keep It Going", theme: "crossing repeats without pause", intro: "demo" },
  { id: 19, title: "Endurance", theme: "longer and longer two-ball runs", intro: "consolidation" },
  { id: 20, title: "The Reveal", theme: "J shows the full 3-ball cascade; j studies it", intro: "reveal" },
  { id: 21, title: "Courage", theme: "j tries THREE balls — three throws, gather", intro: "demo" },
  { id: 22, title: "Three Throws Clean", theme: "the flash lands more than it drops", intro: "consolidation" },
  { id: 23, title: "Four, Five", theme: "each extra throw is a milestone", intro: "demo" },
  { id: 24, title: "Full Cycle", theme: "each hand throws three times — it's juggling!", intro: "demo" },
  { id: 25, title: "Stretching", theme: "the pattern holds longer", intro: "demo" },
  { id: 26, title: "It Doesn't Stop", theme: "the cascade just keeps going", intro: "demo" },
  { id: 27, title: "Relaxed", theme: "drops become rare; shoulders drop", intro: "consolidation" },
  { id: 28, title: "Sky Hooks", theme: "lazy, high, floaty style", intro: "demo" },
  { id: 29, title: "Quicksilver", theme: "tight, rapid style", intro: "demo" },
  { id: 30, title: "Graduation", theme: "J and j cascade side by side — terminal stage, loops forever", intro: "graduation", frontierKey: "cascade.run" },
];

export const STAGE_COUNT = STAGE_METAS.length;
