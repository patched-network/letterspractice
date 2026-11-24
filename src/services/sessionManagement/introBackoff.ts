/**
 * introBackoff — a session `OutcomeObserver`. The relax half of the `intro:*`
 * suppression policy whose seed lives in {@link buildIntroReplanRequest}.
 *
 * A completed intro seeds a durable, fractional discourage on `gpc:intro:*`
 * (`INTRO_DISCOURAGE_FACTOR` via `mergeSessionHints`) so further intros stay
 * demoted while the just-introduced concept gets practised. Left flat, that
 * discourage would persist for the whole session and the learner could never meet
 * a new concept. This observer *relaxes* it as the learner practises: on each
 * terminal SUCCESS of any `gpc:exercise:*` card it multiplies the `gpc:intro:*`
 * factor back up toward 1.0. A few good reps clear the discourage and let the next
 * intro surface.
 *
 * Success-side sibling of {@link conceptBackoff} (which relaxes the *per-concept*
 * boost down; this relaxes the *single global* `gpc:intro:*` knob up). It fires on
 * the same outcomes — but deliberately keys off *any* exercise success, NOT the
 * boosted-tag-only gate conceptBackoff uses, to avoid coupling to conceptBackoff's
 * decay schedule: conceptBackoff deletes a concept's boost once it decays to floor,
 * so a boosted-tag gate would go blind on the very rep that deletion lands and
 * could strand the discourage mid-relax (e.g. stuck at 0.8) if it hadn't cleared by
 * then. Relaxing on any exercise success is robust for any `INTRO_DISCOURAGE_FACTOR`
 * / `RELAX_FACTOR`. In practice it's still target-tied: during the post-intro window
 * the 10× target boost dominates the queue, so the successes that land ARE the
 * target's (its exercises + the WST follow-up, which carries `gpc:exercise:{target}`).
 *
 * Cheap-vs-expensive split, matching conceptBackoff: the relax itself is pure
 * session-hint state (free), applied on every qualifying success. A *replan* (the
 * expensive part — and the thing that actually injects an intro into the queue) is
 * requested only on the step that fully *clears* the discourage; until then intros
 * stay demoted, so rebuilding earlier would just re-suppress them. The request is
 * bare (`label` only) so it COALESCES with any in-flight auto-replan.
 *
 * Registered via `StudySessionConfig.outcomeObservers` AFTER conceptBackoff. They
 * each do a full read-modify-write of the shared `boostTags` map on disjoint keys,
 * and observers run sequentially with a shared `controls`, so they compose without
 * clobbering.
 */
import type { OutcomeObserver, ReplanHints } from '@vue-skuilder/db';
import { INTRO_TAG_PATTERN } from './introReplan';

/** Matches the exercise tags whose success counts as practice (e.g. `gpc:exercise:s-S`). */
const EXERCISE_TAG_PREFIX = /^gpc:exercise:/;

/** Ceiling the discourage relaxes toward; at/above it there is nothing left to relax. */
const RELAX_CEILING = 1.0;

/** Multiplier applied to the `gpc:intro:*` discourage, per practice success. */
const RELAX_FACTOR = 2.0;

export const introBackoff: OutcomeObserver = (outcome, controls) => {
  // React only to genuine terminal successes leaving the view (mirror conceptBackoff).
  if (!outcome.record.isCorrect) return;
  if (outcome.result.nextCardAction !== 'dismiss-success') return;

  const isExerciseSuccess = outcome.card.tags.some((t) => EXERCISE_TAG_PREFIX.test(t));
  if (!isExerciseSuccess) return;

  const current = controls.getSessionHints();
  const boostTags = current?.boostTags;
  if (!boostTags) return;

  // Nothing to relax unless the discourage is currently active (<1).
  const discourage = boostTags[INTRO_TAG_PATTERN];
  if (discourage == null || discourage >= RELAX_CEILING) return;

  const next = Math.min(RELAX_CEILING, discourage * RELAX_FACTOR);
  const nextBoost: Record<string, number> = { ...boostTags };
  const cleared = next >= RELAX_CEILING;
  if (cleared) {
    // Fully relaxed — drop the entry so it stops being a (×1, no-op) line and
    // intros score at par again.
    delete nextBoost[INTRO_TAG_PATTERN];
  } else {
    nextBoost[INTRO_TAG_PATTERN] = next;
  }

  const updated: ReplanHints = { ...current, boostTags: nextBoost };
  controls.setSessionHints(updated);

  console.debug(
    `[introBackoff] exercise success → relax ${INTRO_TAG_PATTERN}`,
    { from: discourage, to: cleared ? '(cleared)' : next },
  );

  // Replan only on the clearing step: that's when a rebuilt queue would finally
  // admit a new intro. Bare → coalesces with any in-flight auto-replan.
  if (cleared) {
    void controls.requestReplan({ label: 'intro-backoff' });
  }
};
