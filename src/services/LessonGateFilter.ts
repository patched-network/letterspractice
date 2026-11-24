/**
 * LessonGateFilter — gates concept cards behind lesson completion.
 *
 * DEFAULT-DENY: the gated set is derived from the curriculum registry
 * (content/phoneticAnalytics/lib/curriculum.ts) and covers the concept tags
 * of EVERY registry lesson — active AND deferred — plus the
 * `concept:unassigned` holding tag. A concept whose lesson hasn't been
 * passed is suppressed; deferred-lesson concepts are suppressed for everyone
 * (their lessons are never offered); unassigned is suppressed
 * unconditionally. Exercise-design tag families (`concept:skill:*`,
 * `concept:interference:*`, `concept:blend:*`) are not lesson-gated and
 * never appear in the registry.
 *
 * ## Three-phase lifecycle
 *
 * Phase 1: Concept prerequisites NOT met
 *   - hierarchy-concept.json: cards penalized (×0.02)
 *   - LessonGateFilter: PENALIZE (×0.01) — lesson not passed either
 *   - Net: cards suppressed by both
 *
 * Phase 2: Concept prerequisites met, lesson NOT passed
 *   - hierarchy-concept.json: cards pass through (×1.0)
 *   - LessonGateFilter: PENALIZE (×0.01)
 *   - Net: cards near-suppressed by lesson gate
 *
 * Phase 3: Lesson passed (viewed or dismissed)
 *   - hierarchy-concept.json: cards pass through (×1.0)
 *   - LessonGateFilter: pass through (×1.0)
 *   - Net: cards flow freely
 *
 * ## Bootstrap exception
 *
 * `hello-world` is always treated as passed (see getPassedLessonIds), so the
 * concepts it gates — `concept:match:simple` and `concept:vowel:short` —
 * always flow. Basic letter content must work for first-time users before
 * any lesson is completed. The hello-world lesson is purely onboarding.
 *
 * ## Pipeline role
 *
 * Registered as a FILTER via `registerNavigator`. Receives candidate cards
 * from the generator(s) and penalizes scores for cards whose concept
 * lesson hasn't been passed.
 *
 * See: agent/concept-gates/a.3.plan-revised.md (removed; git history)
 * See: agent/devlog/2026-06-16-curriculum-sot-closeout.md (curriculum-sot docs removed; full log in git history) (P3.1 default-deny)
 */

import type { CourseDBInterface, UserDBInterface } from '@vue-skuilder/db';
import { ContentNavigator } from '@vue-skuilder/db';
import type { WeightedCard, GeneratorResult } from '@vue-skuilder/db';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import type { CardFilter, FilterContext } from '@vue-skuilder/db';
import type { LessonProgressState } from './lessons.types';
import { getPassedLessonIds } from './lessons';
import { LESSON_REGISTRY, CONCEPT_UNASSIGNED } from './curriculum';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Penalty multiplier for cards whose concept lesson hasn't been passed.
 *
 * Using 0.01 rather than 0.0 to avoid deadlocks — a general principle
 * is to let the system's intended hierarchies define user progression
 * but never create absolute blocks.
 */
const LESSON_GATE_PENALTY = 0.01;

/**
 * Precomputed map: concept tag → lesson ID.
 *
 * Built once at module load from the curriculum registry — active AND
 * deferred lessons (default-deny: a deferred lesson's concepts are gated
 * even though the lesson can't currently be passed). `concept:unassigned`
 * is handled separately: it maps to no lesson and never opens.
 */
const CONCEPT_TAG_TO_LESSON_ID: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const lesson of LESSON_REGISTRY) {
    for (const tag of lesson.gatesConcepts) {
      map.set(tag, lesson.id);
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Navigation filter that penalizes cards whose concept lesson hasn't
 * been completed or dismissed.
 *
 * Extends `ContentNavigator` (required by `registerNavigator`) and implements
 * `CardFilter` (required by `PipelineAssembler`).
 */
export class LessonGateFilter extends ContentNavigator implements CardFilter {
  /** Human-readable name surfaced in pipeline logs / provenance */
  name: string;

  /** Its penalties mean not ready (a card's lesson is not done yet): regulators won't lift them. */
  static readonly kind = 'gate' as const;
  readonly kind = LessonGateFilter.kind;

  constructor(
    user: UserDBInterface,
    course: CourseDBInterface,
    strategyData: ContentNavigationStrategyData,
  ) {
    super(user, course, strategyData);
    this.name = strategyData.name || 'Lesson Gate Filter';
  }

  // ---------------------------------------------------------------------------
  // Strategy state — reads the LessonProgress doc
  // ---------------------------------------------------------------------------

  /**
   * Override the default strategy key so that `getStrategyState()` reads the
   * `LessonProgress` document written by the lesson system.
   */
  protected override get strategyKey(): string {
    return 'LessonProgress';
  }

  // ---------------------------------------------------------------------------
  // CardFilter implementation
  // ---------------------------------------------------------------------------

  async transform(cards: WeightedCard[], _context: FilterContext): Promise<WeightedCard[]> {
    // Load lesson progress to determine which lessons have been passed
    const progress = await this.getStrategyState<LessonProgressState>();
    const passedLessons = getPassedLessonIds(progress);

    // Build the set of concept tags that are currently gated
    // (lesson exists for the concept but hasn't been passed).
    // The unassigned holding tag is always gated — no lesson releases it.
    const gatedTags = new Set<string>([CONCEPT_UNASSIGNED]);
    for (const [conceptTag, lessonId] of CONCEPT_TAG_TO_LESSON_ID) {
      if (!passedLessons.has(lessonId)) {
        gatedTags.add(conceptTag);
      }
    }

    return cards.map((card) => {
      const tags = card.tags ?? [];

      // Check if any of the card's tags are gated concept tags
      let gatedByTag: string | null = null;
      for (const tag of tags) {
        if (gatedTags.has(tag)) {
          gatedByTag = tag;
          break;
        }
      }

      if (gatedByTag === null) {
        // Card doesn't carry any gated concept tags — pass through
        return {
          ...card,
          provenance: [
            ...card.provenance,
            {
              strategy: 'lessonGateFilter',
              strategyName: this.name,
              strategyId: this.strategyId || 'NAVIGATION_STRATEGY-lesson-gate',
              action: 'passed' as const,
              score: card.score,
              reason: 'No gated concept tags on card',
            },
          ],
        };
      }

      // Card is gated — apply penalty
      const lessonId = CONCEPT_TAG_TO_LESSON_ID.get(gatedByTag) ?? '(unassigned)';
      const newScore = card.score * LESSON_GATE_PENALTY;

      return {
        ...card,
        score: newScore,
        provenance: [
          ...card.provenance,
          {
            strategy: 'lessonGateFilter',
            strategyName: this.name,
            strategyId: this.strategyId || 'NAVIGATION_STRATEGY-lesson-gate',
            action: 'penalized' as const,
            score: newScore,
            reason: `Lesson "${lessonId}" not passed — concept "${gatedByTag}" gated (×${LESSON_GATE_PENALTY})`,
          },
        ],
      };
    });
  }

  // ---------------------------------------------------------------------------
  // ContentNavigator — filters must not be used as generators
  // ---------------------------------------------------------------------------

  override async getWeightedCards(_limit: number): Promise<GeneratorResult> {
    throw new Error(
      'LessonGateFilter is a filter and should not be used as a generator. ' +
        'Use Pipeline with a generator and this filter via transform().',
    );
  }
}