/**
 * Types for the lesson progress reporter system.
 *
 * Reporters compute live display status and render inline progress
 * reports for each lesson in the curriculum. The reporter pattern
 * separates per-lesson rendering intelligence from the lesson catalog
 * metadata (LessonDefinition) and from the ProgressView layout.
 *
 * See: agent/concept-gates/a.5.todo-progress-reporters.md (removed; git history)
 */

import type { Component } from 'vue';
import type { TagPresentation } from '@vue-skuilder/common';
import type { LessonDefinition, MasteryThreshold } from '../../lessons.types';
import type { SkillEvidence } from './skillEvidence';

// ---------------------------------------------------------------------------
// Tag scores
// ---------------------------------------------------------------------------

/**
 * A user's per-tag entry as copied from the course registration doc's
 * `elo.tags[tag]`. `recent` is the mastery signal (ring buffer of recent
 * presentations); `score`/`count` are the tag ELO, which mastery ignores.
 * `recent` is absent on docs written before the buffer existed.
 */
export interface TagScore {
  score: number;
  count: number;
  recent?: TagPresentation[];
}

export type TagScores = Record<string, TagScore>;

// ---------------------------------------------------------------------------
// Display Status
// ---------------------------------------------------------------------------

/**
 * The four curriculum display states for a lesson.
 *
 * - `locked`:     prereqs unmet (cannot regress)
 * - `available`:  prereqs met, lesson unhandled (cannot regress)
 * - `ongoing`:    lesson handled, content flowing, mastery not yet met (can regress from mature)
 * - `mature`:     lesson-defined mastery threshold met (can regress to ongoing)
 */
export type LessonDisplayStatus = 'locked' | 'available' | 'ongoing' | 'mature';

// ---------------------------------------------------------------------------
// Report Context
// ---------------------------------------------------------------------------

/**
 * All data a reporter needs to compute status and render its inline report.
 *
 * Built once per lesson by ProgressView and passed into both
 * `getStatus()` and the inline Vue component as a prop.
 */
export interface LessonReportContext {
  /** The lesson definition from the catalog */
  lesson: LessonDefinition;

  /** The user's per-tag entries (from ProgressSummary.elo.tagScores) */
  tagScores: TagScores;

  /** Whether this lesson has been passed (completed or dismissed) */
  passed: boolean;

  /** Whether all prerequisite lessons have been passed */
  prereqsMet: boolean;

  /** Whether all mastery prereqs for availability are met */
  availabilityMet: boolean;

  /**
   * Whether the spacing constraint is satisfied.
   * Only relevant for the locked→available transition.
   */
  spacingMet: boolean;

  /**
   * If locked because a prerequisite lesson isn't passed, its title.
   * Null when not blocked by a lesson prerequisite.
   */
  blockedByLesson: string | null;
}

// ---------------------------------------------------------------------------
// Mastery Evaluation Result
// ---------------------------------------------------------------------------

/**
 * Per-tag mastery evaluation detail, returned by `evaluateMastery()`.
 *
 * `met` and `evidence` are the mastery signal (windowed first-attempt
 * accuracy over the tag's recent presentations; see skillEvidence.ts).
 * `currentCount` / `currentElo` are carried for display and debugging only —
 * neither participates in the decision.
 */
export interface MasteryTagResult {
  tag: string;
  /** The read-policy result for this tag's evidence buffer */
  evidence: SkillEvidence;
  /** evidence.state.kind === 'mastered' */
  met: boolean;
  /** Tag ELO count (informational) */
  currentCount: number;
  /** Tag ELO score (informational) */
  currentElo: number;
  /** Fill progress toward the evidence window, 0–100 (100 once filled) */
  fillPct: number;
}

/**
 * Full mastery evaluation result across all thresholds.
 */
export interface MasteryEvaluation {
  /** Whether all thresholds are met */
  allMet: boolean;
  /** Per-tag detail */
  perTag: MasteryTagResult[];
}

// ---------------------------------------------------------------------------
// Reporter Interface
// ---------------------------------------------------------------------------

/**
 * A lesson progress reporter computes display status and provides
 * a Vue component for rendering an inline progress report.
 *
 * Each lesson can have a custom reporter (e.g., hello-world's 26-letter
 * badge grid) or fall back to the generic reporter (concept-tag progress
 * bars derived from mastery thresholds).
 *
 * Reporters are pure functions of current state — no side effects,
 * no data fetching. The ProgressView provides all data via
 * `LessonReportContext`.
 */
export interface LessonProgressReporter {
  /**
   * Compute the display status for this lesson.
   *
   * For locked/available, this typically delegates to the standard
   * prereq/availability checks. The reporter's main value-add is
   * distinguishing ongoing vs. mature based on domain-specific
   * mastery criteria.
   */
  getStatus(ctx: LessonReportContext): LessonDisplayStatus;

  /**
   * Vue component for the inline report rendered inside CurriculumEntry.
   *
   * Receives `{ context: LessonReportContext }` as its sole prop.
   * Should be compact — renders inside a curriculum list row.
   */
  readonly inlineComponent: Component;

  /**
   * The mastery thresholds this reporter evaluates.
   *
   * Exposed so that the debug view can inspect what the reporter
   * considers "mature" without calling getStatus().
   */
  getMasteryThresholds(lesson: LessonDefinition): MasteryThreshold[];

  /**
   * Evaluate mastery in detail. Returns per-tag progress information
   * suitable for rendering progress bars or debug inspection.
   */
  evaluateMastery(thresholds: MasteryThreshold[], tagScores: TagScores): MasteryEvaluation;

  /**
   * Optional human-readable label for the maturity state.
   * E.g., "26/26 letters mastered" or "3 concept tags mature".
   * If not provided, a generic label is derived from the evaluation.
   */
  maturityLabel?: (ctx: LessonReportContext) => string | null;
}