/**
 * Default mastery threshold derivation and evaluation.
 *
 * When a lesson doesn't provide an explicit `masteryDefinition`, we derive
 * thresholds from its `gatesConceptTags`. This module also provides the
 * shared `evaluateMastery()` function used by all reporters (generic and
 * custom alike). Mastery itself is decided by the evidence read policy in
 * skillEvidence.ts — this module only maps thresholds → tags → evidence.
 *
 * See: agent/concept-gates/a.5.todo-progress-reporters.md (removed; git history)
 */

import type { LessonDefinition, MasteryThreshold } from '../../lessons.types';
import type { MasteryEvaluation, MasteryTagResult, TagScores } from './types';
import { readSkillEvidence, isMastered } from './skillEvidence';

/** Informational fallback when a tag has no ELO entry yet */
const ELO_BASELINE = 1000;

// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------

/**
 * Get the mastery thresholds for a lesson.
 *
 * If the lesson provides an explicit `masteryDefinition`, those thresholds
 * are returned directly. Otherwise, one threshold per `gatesConceptTags`
 * entry is synthesized. A threshold names a tag to grade; any `minCount` /
 * `minElo` it carries is ignored by mastery (kept on the type for the
 * lesson *availability* gates in lessons.ts, which are out of scope here).
 *
 * @param lesson - The lesson definition from the catalog
 * @returns Array of mastery thresholds to evaluate
 */
export function getMasteryThresholds(lesson: LessonDefinition): MasteryThreshold[] {
  if (lesson.masteryDefinition?.thresholds) {
    return lesson.masteryDefinition.thresholds;
  }
  return lesson.gatesConceptTags.map((tag) => ({ tag }));
}

// ---------------------------------------------------------------------------
// Mastery Evaluation
// ---------------------------------------------------------------------------

/** Evaluate one tag's evidence buffer into a MasteryTagResult. */
export function evaluateTag(tag: string, tagScores: TagScores): MasteryTagResult {
  const entry = tagScores[tag];
  const evidence = readSkillEvidence(entry?.recent);
  const fillPct =
    evidence.state.kind === 'filling'
      ? Math.round((evidence.state.have / evidence.state.need) * 100)
      : 100;
  return {
    tag,
    evidence,
    met: isMastered(evidence),
    currentCount: entry?.count ?? 0,
    currentElo: Math.round(entry?.score ?? ELO_BASELINE),
    fillPct,
  };
}

/**
 * Evaluate mastery across a set of thresholds against the user's tag entries.
 *
 * Mastery per tag is the windowed first-attempt accuracy policy in
 * skillEvidence.ts (`readSkillEvidence`) applied to `tagScores[tag].recent`.
 * Tag ELO and exposure count are NOT consulted; they are surfaced on the
 * result for display only.
 *
 * @param thresholds - Which tags to grade
 * @param tagScores  - The user's current per-tag entries
 * @returns Evaluation result with overall status and per-tag detail
 */
export function evaluateMastery(
  thresholds: MasteryThreshold[],
  tagScores: TagScores,
): MasteryEvaluation {
  if (thresholds.length === 0) {
    return { allMet: true, perTag: [] };
  }
  const perTag = thresholds.map((t) => evaluateTag(t.tag, tagScores));
  return { allMet: perTag.every((t) => t.met), perTag };
}
