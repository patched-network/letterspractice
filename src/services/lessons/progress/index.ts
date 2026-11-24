/**
 * Lesson progress reporter system — barrel export.
 *
 * See: agent/concept-gates/a.5.todo-progress-reporters.md (removed; git history)
 */

export type {
  LessonDisplayStatus,
  LessonReportContext,
  LessonProgressReporter,
  MasteryTagResult,
  MasteryEvaluation,
  TagScore,
  TagScores,
} from './types';

export { getMasteryThresholds, evaluateMastery, evaluateTag } from './defaultMastery';
export {
  readSkillEvidence,
  mergeRecent,
  isMastered,
  EVIDENCE_WINDOW,
  MASTERY_MAX_MISSES,
  MASTERY_MIN_DISTINCT_CARDS,
} from './skillEvidence';
export type { SkillEvidence, SkillEvidenceState, EvidenceTick } from './skillEvidence';
export { labelForCardId, wordFromCardId } from './cardLabel';
export { genericReporter } from './genericReporter';
export { helloWorldReporter, LETTER_GPC_TAGS } from './helloWorldReporter';
export { getReporter, hasCustomReporter } from './registry';