/**
 * SkillStalenessFilter — boosts cards for skills that haven't been practiced
 * lately, so the session mixes in basics that SRS and the hotspots crowd out.
 *
 * Fourth filter in the LettersPractice set, beside the three gates. This one
 * is a `signal`: it only boosts, by ×(1 + days / 7) on the card's stalest
 * practiced `gpc:exercise:` tag, uncapped. Showing any card on that tag
 * resets the clock, so the valve closes itself. Policy and constants live in
 * `skillStaleness.ts`.
 *
 * Per card, so filter order doesn't matter. Several cards sharing one stale
 * tag get the same boost; the pipeline's diversity re-rank (stage 3, after
 * filters) spreads them out of the head of the queue.
 *
 * Why: in Alice's records (dump of 2026-10-02) f-F, z-Z and x-K_S went 13+
 * days with no first attempt while th/sh and the raised long i took ~30% of
 * presentations.
 */

import type { CourseDBInterface, UserDBInterface } from '@vue-skuilder/db';
import { ContentNavigator } from '@vue-skuilder/db';
import type { WeightedCard, GeneratorResult } from '@vue-skuilder/db';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import type { CardFilter, FilterContext } from '@vue-skuilder/db';
import { readTagStaleness, stalenessMultiplier, stalestTag } from './skillStaleness';

const STRATEGY_ID = 'NAVIGATION_STRATEGY-skill-staleness';

export class SkillStalenessFilter extends ContentNavigator implements CardFilter {
  /** Human-readable name surfaced in pipeline logs / provenance */
  name: string;

  /** Expresses preference only; it never penalizes. */
  static readonly kind = 'signal' as const;
  readonly kind = SkillStalenessFilter.kind;

  constructor(
    user: UserDBInterface,
    course: CourseDBInterface,
    strategyData: ContentNavigationStrategyData,
  ) {
    super(user, course, strategyData);
    this.name = strategyData.name || 'Skill Staleness Boost';
  }

  async transform(cards: WeightedCard[], context: FilterContext): Promise<WeightedCard[]> {
    const elo = context.userCourseElo;
    if (!elo) {
      return cards.map((card) => this.contribute(card, card.score, 'passed', 'No course ELO to read'));
    }

    // One read per pipeline pass, not per card.
    const staleness = readTagStaleness(elo, Date.now());

    return cards.map((card) => {
      const stalest = stalestTag(card.tags ?? [], staleness);
      if (!stalest) {
        return this.contribute(card, card.score, 'passed', 'No practiced exercise tag');
      }

      const { tag, staleness: s } = stalest;
      const multiplier = stalenessMultiplier(s.days);
      const since = s.lastSeen ? 'last practiced' : 'not practiced since records began,';
      return this.contribute(
        card,
        card.score * multiplier,
        multiplier > 1 ? 'boosted' : 'passed',
        `${tag.replace('gpc:exercise:', '')} ${since} ${s.days.toFixed(1)}d ago → ×${multiplier.toFixed(2)}`,
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
          strategy: 'skillStalenessFilter',
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
      'SkillStalenessFilter is a filter and should not be used as a generator. ' +
        'Use Pipeline with a generator and this filter via transform().',
    );
  }
}
