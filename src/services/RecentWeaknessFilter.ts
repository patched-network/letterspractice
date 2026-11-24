/**
 * RecentWeaknessFilter — boosts cards for skills the learner has missed lately,
 * gently and across sessions.
 *
 * Fifth filter in the LettersPractice set, beside the three gates and skill
 * staleness. A `signal`: it only boosts, by up to ×2 on the card's weakest
 * `gpc:exercise:` tag (misses in the tag's last 12 presentations, decayed by
 * later presentations and by time). Practising the skill relieves it, so it
 * closes itself. Policy and constants live in `recentWeakness.ts`.
 *
 * Per card, so filter order doesn't matter. It reads the evidence buffer the
 * framework writes on every graded presentation, so a miss reaches the next
 * pipeline run, in this session or a later one, with no replan of its own.
 *
 * Why: it replaces difficultyBooster's session boost (×4 per missed tag,
 * multiplied across tags, picks merged at the front of the queue), which
 * turned one miss into a run of 3–6 siblings (agent/curriculum-log C3).
 */

import type { CourseDBInterface, UserDBInterface } from '@vue-skuilder/db';
import { ContentNavigator } from '@vue-skuilder/db';
import type { WeightedCard, GeneratorResult } from '@vue-skuilder/db';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import type { CardFilter, FilterContext } from '@vue-skuilder/db';
import { readTagWeakness, weakestTag, weaknessMultiplier } from './recentWeakness';

const STRATEGY_ID = 'NAVIGATION_STRATEGY-recent-weakness';

export class RecentWeaknessFilter extends ContentNavigator implements CardFilter {
  /** Human-readable name surfaced in pipeline logs / provenance */
  name: string;

  /** Expresses preference only; it never penalizes. */
  static readonly kind = 'signal' as const;
  readonly kind = RecentWeaknessFilter.kind;

  constructor(
    user: UserDBInterface,
    course: CourseDBInterface,
    strategyData: ContentNavigationStrategyData,
  ) {
    super(user, course, strategyData);
    this.name = strategyData.name || 'Recent Weakness Boost';
  }

  async transform(cards: WeightedCard[], context: FilterContext): Promise<WeightedCard[]> {
    const elo = context.userCourseElo;
    if (!elo) {
      return cards.map((card) => this.contribute(card, card.score, 'passed', 'No course ELO to read'));
    }

    // One read per pipeline pass, not per card.
    const weakness = readTagWeakness(elo, Date.now());

    return cards.map((card) => {
      const weakest = weakestTag(card.tags ?? [], weakness);
      if (!weakest) {
        return this.contribute(card, card.score, 'passed', 'No recently missed exercise tag');
      }

      const multiplier = weaknessMultiplier(weakest.weakness);
      return this.contribute(
        card,
        card.score * multiplier,
        'boosted',
        `${weakest.tag.replace('gpc:exercise:', '')} missed lately (weakness ${weakest.weakness.toFixed(2)}) → ×${multiplier.toFixed(2)}`,
      );
    });
  }

  private contribute(
    card: WeightedCard,
    score: number,
    action: 'boosted' | 'passed',
    reason: string,
  ): WeightedCard {
    return {
      ...card,
      score,
      provenance: [
        ...card.provenance,
        {
          strategy: 'recentWeaknessFilter',
          strategyName: this.name,
          strategyId: this.strategyId || STRATEGY_ID,
          action,
          score,
          reason,
        },
      ],
    };
  }

  override async getWeightedCards(_limit: number): Promise<GeneratorResult> {
    throw new Error(
      'RecentWeaknessFilter is a filter and should not be used as a generator. ' +
        'Use Pipeline with a generator and this filter via transform().',
    );
  }
}
