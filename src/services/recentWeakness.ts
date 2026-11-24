/**
 * Recent weakness — how much each skill has been missed lately, read from the
 * per-tag evidence buffer (`EloRank.recent`, the last 12 presentations) that
 * `skillStaleness.ts` and `/progress` also read.
 *
 * The read side of `RecentWeaknessFilter`. Pure, so it can be run against a
 * learner dump.
 *
 * ## Why
 *
 * It replaces the session-scoped failure boost (difficultyBooster: ×4 per
 * missed tag, multiplied across a card's tags, capped ×16, picks merged at the
 * front of the queue). That turned one miss into 3–6 siblings in a row: in
 * Alice's sessions since 10-01, 20 of the 32 with a failure boost had a
 * same-tag run of 3+, up to 11 of 12 cards (agent/curriculum-log C3). This
 * boost is gentler, persists across sessions, and relieves itself:
 *
 *   - each miss weighs 1, shrinking by {@link RECENCY_DECAY} for every later
 *     presentation of the tag, and halving every {@link HALF_LIFE_DAYS};
 *   - the multiplier is 1 + {@link GAIN} × weakness, capped at {@link CAP};
 *   - a card takes its weakest tag's multiplier, not the product.
 *
 * Practising the skill (first-attempt successes push a miss back and out of
 * the buffer) and time both relieve it. Several weak skills compete at a low
 * cap instead of one taking over.
 *
 * ## What counts as a miss
 *
 * The tag's own score: `perf === 0`. Not `ok`, which is the whole card's
 * first-attempt outcome: "kam" for "came" misses c-K and a_e-EY, not m-M.
 */

import type { CourseElo, TagPresentation } from '@vue-skuilder/common';
import { tagRole } from './tags';

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** Multiplier per unit of weakness: one fresh miss gives ×1.5. */
export const GAIN = 0.5;

/** Ceiling on the multiplier. Low on purpose: a tilt, never a takeover. */
export const CAP = 2;

/** A miss's weight shrinks by this for each later presentation of the tag. */
export const RECENCY_DECAY = 0.6;

/** A miss's weight halves every this many days. */
export const HALF_LIFE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Weakness of one tag from its buffer (oldest first): the decayed weight of
 * its misses. 0 when it has none.
 */
export function tagWeakness(recent: readonly TagPresentation[], now: number): number {
  let weakness = 0;
  recent.forEach((entry, i) => {
    if (entry.perf !== 0) return;
    const laterPresentations = recent.length - 1 - i;
    const days = Math.max(0, (now - Date.parse(entry.at)) / DAY_MS);
    weakness += RECENCY_DECAY ** laterPresentations * 0.5 ** (days / HALF_LIFE_DAYS);
  });
  return weakness;
}

export function weaknessMultiplier(weakness: number): number {
  return Math.min(CAP, 1 + GAIN * Math.max(0, weakness));
}

/** Weakness for every `gpc:exercise:` tag with a miss in its buffer, keyed by tag. */
export function readTagWeakness(elo: CourseElo, now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [tag, rank] of Object.entries(elo.tags)) {
    if (tagRole(tag) !== 'exercise' || !rank.recent?.length) continue;
    const weakness = tagWeakness(rank.recent, now);
    if (weakness > 0) out.set(tag, weakness);
  }
  return out;
}

/** The weakest tag on a card, or null if none of its tags has a recent miss. */
export function weakestTag(
  cardTags: readonly string[],
  weakness: ReadonlyMap<string, number>,
): { tag: string; weakness: number } | null {
  let best: { tag: string; weakness: number } | null = null;
  for (const tag of cardTags) {
    const w = weakness.get(tag);
    if (w !== undefined && (!best || w > best.weakness)) best = { tag, weakness: w };
  }
  return best;
}
