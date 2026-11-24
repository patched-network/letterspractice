/**
 * sessionManagement — session `OutcomeObserver`s that tune the study session's
 * durable scoring hints in reaction to learner outcomes.
 *
 * These observers are the application's "session policy" layer: they key off a
 * card's tags (not any view's identity), so every exercise view is covered
 * without per-view wiring. Registered via `StudySessionConfig.outcomeObservers`
 * in `useStudySession`.
 *
 * - {@link conceptBackoff} — success side: relax a boosted concept (an intro's
 *   durable boost) as mastery is demonstrated, so one concept can't monopolise
 *   the session.
 *
 * There is no failure-side observer any more. Missed skills are boosted by
 * `RecentWeaknessFilter` (services/), gently and across sessions, from the
 * per-tag evidence the framework already records; the session boost it replaced
 * (difficultyBooster) produced runs of same-skill cards (curriculum-log C3).
 * - {@link introBackoff} — success side: relax the durable `gpc:intro:*` discourage
 *   as the learner practises the current target, so the next intro can surface.
 *
 * Alongside the observers, {@link buildIntroReplanRequest} is the shared *seed*
 * for the completion replan every `gpc:intro:*` view emits (single source of truth
 * for that payload, so the views don't drift). It also seeds the durable intro
 * discourage that `introBackoff` relaxes — a matched seed/relax pair.
 */
export { conceptBackoff } from './conceptBackoff';
export { introBackoff } from './introBackoff';
export {
  buildIntroReplanRequest,
  INTRO_EXERCISE_BOOST,
  INTRO_TAG_PATTERN,
  SIGHT_WORD_INTRO_TAG_PATTERN,
  INTRO_DISCOURAGE_FACTOR,
  type IntroReplanParams,
} from './introReplan';
