/**
 * conceptBackoff — a session `OutcomeObserver` that relaxes durable boosts on
 * success. (Its failure-side twin, difficultyBooster, is retired; recent misses
 * are boosted by RecentWeaknessFilter instead.)
 *
 * A GPC intro seeds a strong *durable* boost on its `gpc:exercise:*` tag (10× via
 * `sessionHints` in `GpcIntroView`) so the just-introduced concept gets immediate
 * exposure + SRS seeding. Left flat, that boost monopolises the rest of the
 * session: the queue fills with one concept, the learner stops having to
 * *discriminate* between sounds, and no second intro can surface. See
 * `packages/db/.../todo`-adjacent notes / the session-scheduling discussion.
 *
 * This observer *relaxes* that boost as the learner demonstrates mastery: on each
 * terminal SUCCESS of a boosted exercise tag it decays the tag's factor toward
 * {@link DECAY_FLOOR}. Net effect — a kid who nails the new concept quickly frees
 * the session back up for discrimination + the next intro; a kid who keeps
 * missing it keeps the emphasis.
 *
 * Cheap-vs-expensive split (CPU matters — replans are heavy, see the DB-perf
 * todo): the *decay itself* is pure session-hint state (free), applied on every
 * qualifying success. A *replan* (the expensive part) is only requested while the
 * boost is still high enough to dominate the queue ({@link REPLAN_WHILE_ABOVE}) —
 * that's where a rebuild actually diversifies. The tail (small residual boost) is
 * left to ride the natural depletion/quality auto-replans. The requested replan is
 * intentionally *bare* (`label` only) so it COALESCES with any in-flight
 * auto-replan rather than stacking a second pipeline run — the decayed value
 * already lives in `sessionHints`, so any run picks it up.
 *
 * Registered via `StudySessionConfig.outcomeObservers` in `useStudySession`,
 * alongside `introBackoff`; they compose on the shared `boostTags` map.
 */
import type { OutcomeObserver, ReplanHints } from '@vue-skuilder/db';

/** Matches the exercise tags this observer relaxes (e.g. `gpc:exercise:s-S`). */
const EXERCISE_TAG_PREFIX = /^gpc:exercise:/;

/** Multiplier applied to a boosted exercise tag's factor, per terminal success. */
const DECAY_FACTOR = 0.5;

/** Baseline a tag decays toward. At/below this there is no emphasis left to relax. */
const DECAY_FLOOR = 1.0;

/**
 * Only force a replan while the *pre-decay* boost still exceeds this — i.e. while
 * the concept is dominant enough that a rebuild meaningfully diversifies the
 * queue. Below it, skip the (expensive) replan and let the residual boost ride
 * the natural auto-replan cadence. Tunes "split the difference" between
 * never-replan (stale queue) and replan-per-success (CPU/audio jank).
 */
const REPLAN_WHILE_ABOVE = 2.0;

export const conceptBackoff: OutcomeObserver = (outcome, controls) => {
  // React only to genuine terminal successes leaving the view. A correct answer
  // that advances the card reports `dismiss-success`; retries-in-progress and
  // deferred advances report `none` and are ignored.
  if (!outcome.record.isCorrect) return;
  if (outcome.result.nextCardAction !== 'dismiss-success') return;

  const tags = outcome.card.tags.filter((t) => EXERCISE_TAG_PREFIX.test(t));
  if (tags.length === 0) return;

  const current = controls.getSessionHints();
  const boostTags: Record<string, number> = { ...(current?.boostTags ?? {}) };

  let decayedAny = false;
  let replanWorthwhile = false;
  const relaxed: Record<string, number> = {};
  for (const tag of tags) {
    const prev = boostTags[tag] ?? DECAY_FLOOR;
    if (prev <= DECAY_FLOOR) continue; // nothing to relax for this tag
    const next = Math.max(DECAY_FLOOR, prev * DECAY_FACTOR);
    if (next <= DECAY_FLOOR) {
      // Fully relaxed — drop the entry so it stops being a (×1, no-op) line in
      // the dbgOverlay hints panel.
      delete boostTags[tag];
    } else {
      boostTags[tag] = next;
    }
    decayedAny = true;
    relaxed[tag] = next;
    if (prev > REPLAN_WHILE_ABOVE) replanWorthwhile = true;
  }

  // No boosted tag on this card (already at floor, or never introduced this
  // session) — fully free no-op, no state write, no replan.
  if (!decayedAny) return;

  const next: ReplanHints = { ...current, boostTags };
  controls.setSessionHints(next);

  console.debug(`[conceptBackoff] success on boosted [${Object.keys(relaxed).join(', ')}] → relax`, relaxed);

  // Surface the relaxed scoring only while it still reshapes the queue; otherwise
  // let it ride the natural cadence. Bare request → coalesces with any in-flight
  // auto-replan (the decay already lives in sessionHints).
  if (replanWorthwhile) {
    void controls.requestReplan({ label: 'concept-backoff' });
  }
};
