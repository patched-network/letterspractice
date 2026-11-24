/**
 * Curriculum — app-side façade.
 *
 * The canonical implementation lives in the content pipeline's lib
 * (`content/phoneticAnalytics/lib/curriculum.ts`) so that pipeline scripts
 * and the app share one source of truth for lesson topology, per-GPC lesson
 * assignment, and threshold policy.
 */

export {
  LESSON_REGISTRY,
  CONCEPT_POLICIES,
  GPC_OVERRIDES,
  CATEGORY_DEFAULT_LESSON,
  UNASSIGNED,
  CONCEPT_UNASSIGNED,
  LESSON_GATING_EXEMPT_PREFIXES,
  POST_LESSON_SEED_CARDS,
  LESSON_GATED_CARDS,
  cardGateTags,
  introGatedBy,
  FREE_TIER_LESSONS,
  FREE_TIER_WORD_THRESHOLD,
  freeTierGraphemes,
  getLessonEntry,
  assignmentFor,
  effectiveConceptTags,
  gpcIdsForLesson,
  exerciseTagsForLesson,
  introGraphemesForLesson,
  lessonGatedConceptTags,
  isLessonGatingExempt,
  type LessonId,
  type LessonStatus,
  type LessonEntry,
  type GpcAssignment,
  type ResolvedAssignment,
  type ConceptPolicy,
  type LessonAvailabilityPolicy,
  type MasteryGate,
  type BreadthRule,
  MASTERY_MAX_INSECURE,
} from '../../content/phoneticAnalytics/lib/curriculum';

// Curriculum consistency checks (P4.1) — shared pure functions, consumed by
// the admin Curriculum surface (P4.3) and the prod audit script.
export {
  EXPECTED_STRATEGY_IDS,
  buildExpectedTopology,
  invertTagDocs,
  runCurriculumChecks,
  checkConceptTagsMapped,
  checkGatedTagsHaveCards,
  checkMustMatch,
  checkStrategies,
  checkStaleness,
  checkConceptTraceability,
  type ExpectedTopology,
  type ObservedContent,
  type CardRecord,
  type Finding,
  type Severity,
} from '../../content/phoneticAnalytics/lib/curriculum-checks';

// GPC catalogue — for catalogue-driven views (e.g. the admin Parked pool,
// which must surface parked GPCs even when they have zero cards — D7).
export {
  GPC_CATALOGUE,
  type GPCEntry,
} from '../../content/phoneticAnalytics/lib/catalogue';
