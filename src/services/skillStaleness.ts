/**
 * Skill staleness — how long since each practiced skill last had a first
 * attempt, read from the per-tag evidence buffer (`EloRank.recent`) that
 * `/progress` also reads (see `lessons/progress/skillEvidence.ts`).
 *
 * The read side of `SkillStalenessFilter`. Pure, so it can be run against a
 * learner dump.
 *
 * ## What counts
 *
 * Only `gpc:exercise:` tags, and only practiced ones (`count > 0`). A tag
 * never practiced is locked or not yet introduced: it has no history to go
 * stale, and boosting it would lean against the gates.
 *
 * ## Empty buffers
 *
 * Buffers began when the framework started writing them (2026-09-19 for
 * accounts that existed then), so a tag practiced before that and not since
 * has `count > 0` and an empty buffer. Its staleness runs from the buffer
 * epoch: the oldest entry across all the learner's buffers. With no entries
 * anywhere there's no information, and nothing is stale.
 */

import type { CourseElo } from '@vue-skuilder/common';
import { tagRole } from './tags';

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/**
 * Days of staleness per +1 on the multiplier: ×(1 + days / this). Linear and
 * uncapped: serving any card on the tag resets the clock, so the boost
 * closes itself. Gate penalties (×0.02 hierarchy, ×0.01 lesson) are
 * outgrown only after ~1–2 years stale.
 */
export const STALENESS_DAYS_PER_UNIT = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagStaleness {
  /** Days since the newest first attempt (or since the buffer epoch). */
  days: number;
  /** ISO time of the newest first attempt; null when the epoch stood in. */
  lastSeen: string | null;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export function stalenessMultiplier(days: number): number {
  return 1 + Math.max(0, days) / STALENESS_DAYS_PER_UNIT;
}

/** Staleness for every practiced `gpc:exercise:` tag, keyed by tag. */
export function readTagStaleness(elo: CourseElo, now: number): Map<string, TagStaleness> {
  const out = new Map<string, TagStaleness>();

  let epoch = Infinity;
  for (const rank of Object.values(elo.tags)) {
    const first = rank.recent?.[0];
    if (first) epoch = Math.min(epoch, Date.parse(first.at));
  }
  if (!Number.isFinite(epoch)) return out;

  for (const [tag, rank] of Object.entries(elo.tags)) {
    if (tagRole(tag) !== 'exercise' || !(rank.count > 0)) continue;
    const newest = rank.recent?.[rank.recent.length - 1];
    const since = newest ? Date.parse(newest.at) : epoch;
    out.set(tag, { days: (now - since) / DAY_MS, lastSeen: newest?.at ?? null });
  }
  return out;
}

/** The stalest practiced tag on a card, or null if it carries none. */
export function stalestTag(
  cardTags: readonly string[],
  staleness: ReadonlyMap<string, TagStaleness>,
): { tag: string; staleness: TagStaleness } | null {
  let best: { tag: string; staleness: TagStaleness } | null = null;
  for (const tag of cardTags) {
    const s = staleness.get(tag);
    if (s && (!best || s.days > best.staleness.days)) best = { tag, staleness: s };
  }
  return best;
}
