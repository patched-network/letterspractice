/**
 * introReplan — the *seed* half of the session `intro:*` policy.
 *
 * Every `gpc:intro:*` view (GpcIntro, DigraphGpcIntro, SplitDigraphIntro,
 * SightWordIntro) fires the same replan on completion: boost the just-introduced
 * concept's practice (not sight words: their required follow-ups are the whole
 * prescription), require its follow-up card(s), and suppress a back-to-back
 * intro for the immediate burst.
 * This builder is the single source of truth for that payload so the three views
 * can't drift (they previously copy-pasted it, comments included).
 *
 * Kept PURE: it only assembles the `ReplanOptions`. View-specific side effects
 * (`recordGpcIntroComplete`, `introModeState.set`, `submitAnswer`) stay in each
 * view.
 *
 * --- Why these specific hint shapes ---
 *
 * Under the single supply queue (SessionController draws one rank-ordered
 * `supplyQ` of new + review interleaved), this replan is a normal *full*
 * re-rank: default working-set `limit`, `mode:'replace'`. We deliberately do
 * NOT carry the old `limit:3 + mode:'replace'` queue-surgery — on one queue
 * that meant "3 cards *total*", which would nuke the review working set to 3.
 * Instead the curated emphasis lives in the *ranking* via durable hints; the
 * re-rank surfaces it in competition with everything else (reviews included),
 * and it can't be clobbered because it's durable.
 *
 * The just-introduced exercise's boost MERGES into durable session hints
 * (`mergeSessionHints`) so it survives every later replan (the depletion and
 * quality auto-replans, a *later* intro's replan) — a one-shot `hints` boost
 * would evaporate on the next replace-mode rebuild. Merge (not replace) so a
 * prior concept's boost and any conceptBackoff state on other
 * concepts survive this intro — required for multiple intros per session.
 *
 * `requireCards` (the WST / word-context follow-ups) ALSO go durable: a one-shot
 * require is clobbered by any replace-mode replan that fires before it's drawn — a
 * depletion auto-replan, the quality auto-replan, or a *later* intro's replan
 * (the sequential-intro cascade). As durable requirements they are re-asserted at
 * +INF by every replan and self-clear the instant each is drawn (SessionController
 * clears them in removeItemFromQueue), so they can't accumulate. The +INF floats
 * to the head of `supplyQ` at build time, so the required follow-up is drawn next
 * on rank alone; `minFollowUpCards` keeps the session open past the timer so the
 * follow-up + a practice card still surface (the WST-at-t≈0 bug this all fixes).
 *
 * Subsequent-intro suppression is TWO layers, deliberately:
 *
 *   1. `excludeTags` (one-shot): hard-remove intros from *this* burst only — no
 *      back-to-back intro while the follow-up cards are being seeded.
 *   2. A durable, *fractional* `boostTags[gpc:intro:*]` discourage that survives
 *      later replans and keeps further intros demoted into the session tail, so
 *      the just-introduced concept gets room to be practised before the learner
 *      meets a new one. Unlike the hard exclude this keeps intros *eligible* (just
 *      pushed down), and {@link introBackoff} relaxes it back toward 1.0 as the
 *      learner practises the current target — "done some follow-up work → okay to
 *      meet someone new". The two are a matched seed/relax pair.
 *
 * Note the merge contract compounds this: a *second* intro multiplies another
 * `× INTRO_DISCOURAGE_FACTOR` onto whatever the discourage has relaxed to, so
 * stacking intros suppresses progressively harder — intended, and bounded because
 * `introBackoff` always climbs the factor back to a clean 1.0 (entry removed).
 */
import type { ReplanOptions } from '@vue-skuilder/db';

/** Durable boost applied to the just-introduced concept's practice tag. */
export const INTRO_EXERCISE_BOOST = 10.0;

/** Tag pattern matching all intro cards. */
export const INTRO_TAG_PATTERN = 'gpc:intro:*';

/** Tag pattern matching the sight-word intros (at most one per session). */
export const SIGHT_WORD_INTRO_TAG_PATTERN = 'gpc:intro:WORD-*';

/**
 * Durable score multiplier (<1) seeded on `gpc:intro:*` to discourage — but not
 * forbid — further intros while the just-introduced concept is being practised.
 * Relaxed back toward 1.0 by {@link introBackoff} on practice-target successes.
 * Tunable: lower = more aggressive suppression; verify against intro vs exercise
 * scores in the dbg pipeline overlay.
 */
export const INTRO_DISCOURAGE_FACTOR = 0.1;

export interface IntroReplanParams {
  /** Provenance label, e.g. `gpc-intro-s-complete`. */
  label: string;
  /**
   * The tag of the just-introduced concept's first practice, boosted: its
   * exercise tag for a GPC (`gpc:exercise:s-S`). Omitted for no boost: sight
   * words, whose required follow-ups are their prescribed exposure (a ×10 on
   * the word's expose tag flooded the intro session with its cards, 10-01).
   */
  practiceTag?: string | readonly string[];
  /** Follow-up card id(s) the intro carves space for (WST and/or word-context). */
  followUpCards: string[];
  /**
   * Tags removed for the rest of the session (durable, unlike the one-shot
   * exclude below): sight-word intros pass `gpc:intro:WORD-*`, one per session.
   */
  sessionExcludeTags?: string[];
}

/**
 * Build the completion replan an intro view emits via `request-replan`.
 */
export function buildIntroReplanRequest(params: IntroReplanParams): ReplanOptions {
  const { label, practiceTag, followUpCards, sessionExcludeTags } = params;
  const practiceTags = typeof practiceTag === 'string' ? [practiceTag] : (practiceTag ?? []);
  return {
    label,
    mergeSessionHints: {
      boostTags: {
        ...Object.fromEntries(practiceTags.map((tag) => [tag, INTRO_EXERCISE_BOOST])),
        [INTRO_TAG_PATTERN]: INTRO_DISCOURAGE_FACTOR,
      },
      requireCards: followUpCards,
      ...(sessionExcludeTags?.length ? { excludeTags: sessionExcludeTags } : {}),
    },
    hints: {
      excludeTags: [INTRO_TAG_PATTERN],
    },
    // No `limit`/`mode`: defaults (full working-set, replace) give a complete
    // re-rank under the durable hints above. The old `limit:3 + mode:'replace'`
    // burst would nuke the single supplyQ (reviews included) to 3 cards.
    minFollowUpCards: 2,
  };
}
