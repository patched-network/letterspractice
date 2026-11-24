/**
 * Type definitions for the lesson system.
 *
 * Lessons are short, guided introductions to phonetic concepts,
 * driven by Stage-based narrative with LetterPeople actors and
 * speech balloons. They are designed to be consumed with an adult
 * reader present (comic-book style dialogue).
 *
 * (Originating working docs — agent/study-split, agent/concept-gates —
 * were removed from the tree; see git history.)
 */

import { ConceptTag } from "./tags";
import type { LessonId, MasteryGate } from "./curriculum";

// ---------------------------------------------------------------------------
// Mastery Threshold (shared shape)
// ---------------------------------------------------------------------------

/**
 * A single ELO-based mastery threshold against a tag.
 *
 * Used in both `LessonAvailabilityConditions.masteryPrereqs` (when does a
 * lesson become available?) and `LessonDefinition.masteryDefinition` (when
 * is a lesson's gated content considered "mature"?).
 */
export interface MasteryThreshold {
  tag: string;
  minCount?: number;
  minElo?: number;
}

// ---------------------------------------------------------------------------
// Lesson Availability Conditions
// ---------------------------------------------------------------------------

/**
 * Conditions governing when a lesson becomes available in the UI.
 *
 * The intended pattern is to mirror the hierarchy-concept.json thresholds
 * here, so that lesson availability aligns with pipeline readiness.
 * If omitted from a LessonDefinition, the lesson becomes available as
 * soon as its `prerequisites` (other lesson IDs) are met.
 */
export interface LessonAvailabilityConditions {
  /**
   * ELO-based mastery thresholds. Checked against the user's course ELO state.
   * Mirrors the structure in hierarchy-concept.json prerequisites.
   *
   * When all masteryPrereqs are satisfied AND all lesson prerequisites
   * are completed, the lesson surfaces in the UI.
   */
  masteryPrereqs?: MasteryThreshold[];

  /**
   * Breadth gate: minimum number of distinct letters the user must have
   * *introduced* (GPC-intro completed) before this lesson surfaces.
   *
   * Checked against `LetterProgressionState.unlockedLetters.length`.
   *
   * This complements (and is deliberately distinct from) `masteryPrereqs`,
   * which measure aggregate practice *volume* on concept tags. A volume gate
   * like `concept:match:simple minCount:20` can be satisfied by drilling just
   * 4-5 letters repeatedly; a breadth gate ensures the learner has met a
   * spread of letters before a "new idea" (e.g. digraphs) is introduced.
   */
  minUnlockedLetters?: number;

  /**
   * In-rotation breadth gate: at least `count` distinct GPCs from the named
   * lesson's slate must have their intro completed (checked against the
   * graphemes recorded in `LetterProgressionState.unlockedLetters`).
   *
   * Guards against a prerequisite lesson being *passed* (completed or
   * dismissed) with zero actual exposure to its content — e.g.
   * split-digraphs requires a few digraphs genuinely in rotation, not just
   * the digraphs lesson ceremony.
   */
  minUnlockedFromLesson?: { lesson: LessonId; count: number };

  /**
   * Mastery gate: while mastery gating is on (`masteryGating` in lessons.ts),
   * replaces the conditions above and the spacer. See `MasteryGate` in the
   * curriculum SoT.
   */
  mastery?: MasteryGate;

  /**
   * Minimum practice sessions since the last concept lesson was passed.
   * Prevents concept overload. Default: 0 (no spacing).
   */
  minSessionsSinceLastLesson?: number;

  /**
   * Withhold the lesson when tag ELO can't be read, rather than skipping
   * `masteryPrereqs` (the default). For lessons whose copy depends on what
   * the learner already knows (bed: "two letters you already know").
   */
  failClosed?: true;
}

// ---------------------------------------------------------------------------
// Lesson Definition (metadata)
// ---------------------------------------------------------------------------

/**
 * Metadata for a lesson — used by the hub, progress tracking, and
 * curriculum sequencing.
 *
 * Each lesson's *content* (Stage setup, dialogue, PhoneticWord
 * interactions, keyboard configuration) lives in a hand-rolled Vue
 * component under `src/lessons/`. There is no DSL or schema for
 * lesson content — each component is free to structure its own
 * interaction patterns. This type only carries the catalog metadata.
 *
 * The mapping from `id` → Vue component lives in `src/lessons/index.ts`.
 */
export interface LessonDefinition {
  /** Unique stable identifier (used in routes, progress tracking, and component registry) */
  id: string;

  /** Human-readable title (shown on the hub card, read by the adult) */
  title: string;

  /** Short description for the hub / lesson list (parent-facing) */
  description: string;

  /** Description for the /progess view */
  progressDescription?: string;

  /**
   * Optional prerequisite lesson IDs.
   * This lesson won't be offered until all prerequisites are completed.
   */
  prerequisites?: string[];

  /**
   * A sub-lesson of this lesson: not a new decoding idea, but a fuller
   * introduction to something the parent lesson releases (bed: b, a
   * hello-world letter). Numbered after its parent (1a), in its colour.
   */
  subOf?: string;

  /**
   * Concept tags this lesson gates. Cards carrying these concept tags
   * are hard-suppressed by LessonGateFilter until this lesson is passed.
   *
   * Maps directly to tags from CONCEPT_TAGS in conceptTags.ts.
   * Typically a single concept tag, but allows for multi-concept lessons.
   */
  gatesConceptTags: ConceptTag[];

  /**
   * Conditions governing when this lesson becomes available in the UI.
   * If omitted, the lesson becomes available as soon as its `prerequisites`
   * (other lesson IDs) are met.
   *
   * The intended pattern is to mirror the hierarchy-concept.json thresholds
   * here, so that lesson availability aligns with pipeline readiness.
   */
  availabilityConditions?: LessonAvailabilityConditions;

  /**
   * Defines when this lesson's gated content is considered "mature" —
   * i.e., the learner has demonstrated sufficient mastery over the
   * concepts this lesson introduces.
   *
   * Used by the progress reporter system to distinguish "ongoing"
   * (content flowing but mastery not yet achieved) from "mature"
   * (mastery threshold met). Mature status can regress to ongoing
   * if ELO drops below threshold (e.g., after poor SRS reviews).
   *
   * When absent, a default is derived automatically from the lesson's
   * `gatesConceptTags`: each gated concept tag gets a threshold of
   * `{ minCount: 10, minElo: 1050 }`. This default is intentionally
   * conservative — lessons with specific knowledge of their domain
   * (like hello-world's 26 individual letter tags) should provide
   * explicit thresholds.
   */
  masteryDefinition?: {
    thresholds: MasteryThreshold[];
  };
}

// ---------------------------------------------------------------------------
// Lesson Progress (per-user state, persisted via userState)
// ---------------------------------------------------------------------------

/**
 * Tracks a user's progress through the lesson curriculum.
 *
 * Stored via `putStrategyState()` under the `LessonProgress` key.
 */
export interface LessonProgressState {
  /** IDs of lessons the user has completed (viewed in full) */
  completedLessons: string[];

  /**
   * Lessons that have been dismissed/acknowledged by the parent
   * without viewing. Treated identically to completedLessons for
   * gating purposes (the gate opens), but tracked separately for
   * analytics / potential re-offering.
   */
  dismissedLessons: string[];

  /**
   * The lesson currently "queued" for the user (next up in curriculum).
   * null if no lesson is currently suggested.
   */
  currentLesson: string | null;

  /**
   * How many times the user has navigated to Practice while a lesson
   * was queued (i.e., skipped the lesson). Used by the nag system
   * to escalate urgency.
   */
  skippedCount: number;

  /** ISO timestamp of the last skip, or null if never skipped */
  lastSkippedAt: string | null;

  /**
   * When set, indicates that the user just finished a lesson and the
   * next practice session should be hint-annotated to emphasize the
   * lesson's gated concept tags. Contains the lesson ID.
   *
   * Set on lesson completion or dismissal, cleared when the user
   * engages with a practice session past a threshold (or on next hub load).
   */
  postLessonPracticeFlag: string | null;

  /**
   * Count of practice sessions since the last lesson was passed
   * (completed or dismissed). Used by spacing constraints in
   * availabilityConditions.
   */
  sessionsSinceLastLesson: number;

  /**
   * ISO timestamp of when each lesson was first passed (completed or
   * dismissed), keyed by lesson ID. Re-viewing a passed lesson does not
   * move it. Optional: state docs written before this field existed have
   * no dates for their already-passed lessons.
   */
  passedAt?: Record<string, string>;

  /** ISO timestamp of last state update */
  updatedAt: string;
}
