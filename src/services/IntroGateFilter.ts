/**
 * IntroGateFilter — the valve on NEW intros. Two reasons to close it:
 *
 *   1. The entitlement wall (below): new graphemes freeze for an unpaid
 *      account at the word ceiling.
 *   2. The intro hold-back (`services/introHoldback.ts`): while letter-sound
 *      debt is over the mastery cap, new intros (graphemes and sight words)
 *      are spaced a day apart per insecure letter-sound over the cap. Its
 *      state shows in the session overlay's "strategy backpressure" panel.
 *
 * Both leave reviews and everything already introduced alone. The rest of
 * this header is about the wall.
 *
 * Third filter in the LettersPractice set, beside `LetterGatingFilter`
 * (spelling behind unlocked keycaps) and `LessonGateFilter` (concepts behind
 * lessons). This one gates on *entitlement*: once an unpaid account can decode
 * `FREE_TIER_WORD_THRESHOLD` words, intro cards for graphemes the child has
 * not yet met are withheld. See `services/dripGate.ts` for the boundary. It
 * is a word count, not a lesson, so the free tier is measured in what the
 * child can actually read.
 *
 * ## What it must NOT touch
 *
 * Everything already in rotation. Exercise cards, WhoSaidThat, spelling,
 * missing-letters, reviews — for any grapheme already introduced — pass
 * through untouched, forever. The product promise is that the wall stops new
 * supply and never repossesses; this filter is where that promise is either
 * kept or broken, so the eligibility test is deliberately narrow:
 *
 *   penalize  ⇔  frozen  ∧  card carries `gpc:intro:*`  ∧  that grapheme is
 *                not in `unlockedLetters`
 *
 * An intro card for an *already-introduced* grapheme is not new content — a
 * re-surfaced intro is revision — so it is left alone.
 *
 * ## Zero, don't penalize
 *
 * Hard `score: 0`, so the pipeline's zero-score filter removes the card —
 * following `LetterGatingFilter`'s treatment of uncompletable cards rather
 * than `LessonGateFilter`'s ×0.01.
 *
 * The soft-penalty convention exists to avoid deadlock on gates the learner is
 * *about to pass*: a lesson gate opens in a session or two, so a starved
 * pipeline serving slightly-early content is a better failure than serving
 * nothing. This gate has no such horizon. It stays shut until someone pays,
 * which turns "wins when nothing else is available" into "wins eventually" —
 * a child who drains their review queue and works through the cards for their
 * existing graphemes would simply start popping new intros, quietly undoing
 * the boundary. A soft penalty is not a gate when the gate is permanent.
 *
 * The trade is a genuinely empty candidate set for a frozen account that
 * exhausts everything it owns. That is the correct outcome (there is nothing
 * further to legitimately serve) and remote in practice — the account retains
 * every exercise card for ~22 graphemes plus its SRS queue.
 *
 * ## Grapheme, not GPC id
 *
 * `unlockedLetters` is grapheme-keyed, so `gpc:intro:th-DH` resolves through
 * the catalogue to grapheme `th` and is considered introduced if `th` is —
 * even though it was `th-TH`'s intro that unlocked it. That over-credit is the
 * accepted approximation documented on `freeTierGraphemes()` in curriculum.ts.
 */

import type { CourseDBInterface, UserDBInterface } from '@vue-skuilder/db';
import { ContentNavigator } from '@vue-skuilder/db';
import type { WeightedCard, GeneratorResult } from '@vue-skuilder/db';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import type { CardFilter, FilterContext } from '@vue-skuilder/db';
import type { LetterProgressionState } from './userState.types';
import { parseGpcTag } from './tags';
import { getGpcEntry } from './tags/gpcCatalogue';
import { isDripFrozen } from './dripGate';
import { captureStrategyPressure } from '@vue-skuilder/db';
import {
  evaluateIntroHoldback,
  introHoldback,
  newSightWord,
  type IntroHoldbackState,
} from './introHoldback';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Withheld intro cards are hard-zeroed, not penalized — see the "Zero, don't
 * penalize" note above. The pipeline drops zero-score cards, so this removes
 * them from the pool rather than sorting them to the bottom of it.
 */
const WITHHELD_SCORE = 0;

const STRATEGY_ID = 'NAVIGATION_STRATEGY-intro-gate';

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export class IntroGateFilter extends ContentNavigator implements CardFilter {
  /** Human-readable name surfaced in pipeline logs / provenance */
  name: string;

  /** Its penalties mean not ready (a card waits on an intro): regulators won't lift them. */
  static readonly kind = 'gate' as const;
  readonly kind = IntroGateFilter.kind;

  constructor(
    user: UserDBInterface,
    course: CourseDBInterface,
    strategyData: ContentNavigationStrategyData,
  ) {
    super(user, course, strategyData);
    this.name = strategyData.name || 'Intro Gate Filter';
  }

  /**
   * Read the `LetterProgression` document — it carries both halves of the
   * decision: the persisted `reachableWordCount` and the `unlockedLetters`
   * that say which intros would be *new*.
   */
  protected override get strategyKey(): string {
    return 'LetterProgression';
  }

  async transform(cards: WeightedCard[], context: FilterContext): Promise<WeightedCard[]> {
    const state = await this.getStrategyState<LetterProgressionState>();

    // One entitlement evaluation per pipeline pass, not per card.
    let frozen = false;
    try {
      frozen = await isDripFrozen(state);
    } catch (e) {
      // Fail open — see dripGate's docblock. A gate that errors must not wall
      // a paying family.
      console.warn('[IntroGateFilter] Gate evaluation failed, passing through:', e);
    }

    // Second valve: the settledness hold-back (services/introHoldback.ts).
    // Fails open on any error, like the wall.
    let hold: IntroHoldbackState | null = null;
    if (introHoldback.enabled) {
      try {
        hold = evaluateIntroHoldback(context.userCourseElo?.tags, state?.lastIntroAt);
      } catch (e) {
        console.warn('[IntroGateFilter] Hold-back evaluation failed, passing through:', e);
      }
    }

    const introduced = new Set(
      (state?.unlockedLetters ?? []).map((l) => l.toLowerCase()),
    );

    const withheld: string[] = [];
    let topIntroScore: number | null = null;

    const out = cards.map((card) => {
      const tags = card.tags ?? [];
      const grapheme = newIntroGrapheme(tags, introduced);

      if (frozen && grapheme !== null) {
        return this.withhold(
          card,
          `Free tier at word ceiling — intro for new grapheme "${grapheme}" withheld (score 0)`,
        );
      }

      // Reviews of intro cards are revision, never new supply.
      const newIntro = card.reviewID ? null : (grapheme ?? newSightWord(tags, introduced));
      if (newIntro !== null && hold?.held) {
        withheld.push(newIntro);
        return this.withhold(
          card,
          `Intro hold-back — ${hold.debt} letter-sounds insecure (cap ${hold.cap}), ` +
            `${hold.gapDays}d between intros; next from ${hold.nextIntroDay}. ` +
            `"${newIntro}" withheld (score 0)`,
        );
      }

      if (newIntro !== null) {
        topIntroScore = Math.max(topIntroScore ?? 0, card.score);
      }
      return this.pass(card, frozen ? 'Not a new-grapheme intro' : 'Drip not frozen');
    });

    this.captureHoldback(cards[0]?.courseId ?? this.course.getCourseID(), hold, withheld, topIntroScore);
    return out;
  }

  /**
   * Push the hold-back's state to the session overlay's "strategy
   * backpressure" panel (`window.skuilder.session.dbgOverlay()`). The gauge
   * multiplier is debt over cap (×1.00 = at the cap); the items list the
   * insecure letter-sounds, then any intros withheld this run.
   */
  private captureHoldback(
    courseId: string,
    hold: IntroHoldbackState | null,
    withheld: string[],
    topIntroScore: number | null,
  ): void {
    try {
      if (!hold) {
        captureStrategyPressure({
          source: 'introHoldback',
          courseId,
          gauges: [
            {
              id: 'debt',
              label: 'intro hold-back',
              multiplier: 1,
              detail: introHoldback.enabled ? 'not evaluated (error)' : 'off (lp:introHoldback=false)',
            },
          ],
          topScore: topIntroScore,
          timestamp: Date.now(),
        });
        return;
      }

      const last = hold.lastIntroAt
        ? `last intro ${hold.lastIntroAt.slice(0, 10)} (${hold.daysSinceIntro}d ago)`
        : 'no last-intro stamp';
      const verdict = hold.held
        ? `HELD until ${hold.nextIntroDay}`
        : hold.gapDays === 0
          ? 'open (at or under cap)'
          : 'open (gap elapsed)';
      const insecure = hold.security.tags
        .filter((t) => t.status !== 'secure')
        .sort((a, b) => a.accuracy - b.accuracy)
        .map((t) => ({
          label: t.tag.replace('gpc:exercise:', ''),
          value: `${t.status} ${t.right}/${Math.min(t.attempts, 12)} · ${t.days}d`,
        }));

      captureStrategyPressure({
        source: 'introHoldback',
        courseId,
        gauges: [
          {
            id: 'debt',
            label: 'letter-sound debt',
            multiplier: hold.cap > 0 ? hold.debt / hold.cap : hold.debt,
            detail:
              `${hold.debt} insecure / cap ${hold.cap} · gap ${hold.gapDays}d · ${last} · ${verdict}` +
              (withheld.length ? ` · withheld ${withheld.length}` : ''),
            items: [
              ...insecure,
              ...withheld.map((w) => ({ label: `withheld: ${w}` })),
            ],
          },
        ],
        topScore: topIntroScore,
        timestamp: Date.now(),
      });
    } catch {
      // Debug channel only; never let it affect a run.
    }
  }

  private withhold(card: WeightedCard, reason: string): WeightedCard {
    return {
      ...card,
      score: WITHHELD_SCORE,
      provenance: [
        ...card.provenance,
        {
          strategy: 'introGateFilter',
          strategyName: this.name,
          strategyId: this.strategyId || STRATEGY_ID,
          action: 'penalized' as const,
          score: WITHHELD_SCORE,
          reason,
        },
      ],
    };
  }

  private pass(card: WeightedCard, reason: string): WeightedCard {
    return {
      ...card,
      provenance: [
        ...card.provenance,
        {
          strategy: 'introGateFilter',
          strategyName: this.name,
          strategyId: this.strategyId || STRATEGY_ID,
          action: 'passed' as const,
          score: card.score,
          reason,
        },
      ],
    };
  }

  override async getWeightedCards(_limit: number): Promise<GeneratorResult> {
    throw new Error(
      'IntroGateFilter is a filter and should not be used as a generator. ' +
        'Use Pipeline with a generator and this filter via transform().',
    );
  }
}

// ---------------------------------------------------------------------------
// Card classification
// ---------------------------------------------------------------------------

/**
 * The grapheme this card would introduce for the first time, or null.
 *
 * Null covers every card that is not a withheld intro: non-intro cards, and
 * intros for graphemes the child has already met (revision, not new supply).
 */
function newIntroGrapheme(
  tags: readonly string[],
  introduced: ReadonlySet<string>,
): string | null {
  for (const tag of tags) {
    const parsed = parseGpcTag(tag);
    if (!parsed || parsed.role !== 'intro') continue;

    // Resolve through the catalogue rather than splitting the short id:
    // graphemes contain hyphens-adjacent forms (`a_e`, `x-K_S`) that string
    // surgery gets wrong.
    const grapheme = getGpcEntry(parsed.gpcId)?.grapheme.toLowerCase();
    if (!grapheme) continue;
    if (introduced.has(grapheme)) continue;

    return grapheme;
  }
  return null;
}
