/**
 * Skill evidence — the read-side policy over a tag's ring buffer of recent
 * presentations (`EloRank.recent`, written by the framework's EloService on
 * every first-attempt response; see `@vue-skuilder/common` `TagPresentation`).
 *
 * This is the ONLY place mastery is decided. Reporters and the /progress
 * tiles all call `readSkillEvidence`; tag ELO plays no part in the decision.
 * Every number is a named constant below so the policy stays tunable.
 *
 * An entry is read per tag, not per card: inside a wrong answer, a GPC the
 * question still credited (perf > 0 — "ife" for "if" credits the f) counts as
 * a hit for that GPC. See `tagHit`.
 *
 * A correct re-show of a card shortly after its last presentation ("warm",
 * see WARM_WINDOW_MS) is left out: it tests recall of an answer just seen.
 *
 * Design record: agent/skill-grading/findings.md, fable.dayplan.md §A (D4).
 */

import type { TagPresentation } from '@vue-skuilder/common';

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** Presentations considered at read time (the buffer stores up to 12). */
export const EVIDENCE_WINDOW = 8;

/** Below this many entries the state is 'filling', never a colour. */
export const EVIDENCE_FILL_FLOOR = EVIDENCE_WINDOW;

/**
 * A presentation of a card within this long of the same card's previous
 * presentation is warm: typically the session re-showing a card just missed
 * and corrected. A warm hit is left out of the window; a warm miss counts in
 * full. Same card only — another word with the same GPC in the same session
 * is fair evidence. Shorter than the gap between a day's sessions, so the
 * next session's re-show counts.
 */
export const WARM_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Mastered iff misses in the window ≤ this... */
export const MASTERY_MAX_MISSES = 1;

/** ...AND the window spans at least this many distinct cards. */
export const MASTERY_MIN_DISTINCT_CARDS = 3;

/**
 * Linear recency weights over the window: oldest entry weighs 1, newest
 * weighs EVIDENCE_WINDOW. Used only for the gradient accuracy.
 */
export function recencyWeight(indexInWindow: number): number {
  return indexInWindow + 1;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillEvidenceState =
  | { kind: 'filling'; have: number; need: number }
  | { kind: 'mastered' }
  | { kind: 'gradient'; accuracy: number };

/** One tick of the hit/miss strip, oldest first. */
export interface EvidenceTick {
  ok: boolean;
  card: string;
  at: string;
}

export interface SkillEvidence {
  state: SkillEvidenceState;
  /** Entries in the buffer (not just the window). */
  total: number;
  /** Distinct card ids within the window. */
  distinctCards: number;
  /** ISO timestamp of the newest entry, or null when empty. */
  lastSeen: string | null;
  /** Recency-weighted first-attempt accuracy over the window (0..1); 0 when empty. */
  weightedAccuracy: number;
  /** Misses within the window. */
  misses: number;
  /** The window, oldest first, for the evidence hover. */
  strip: EvidenceTick[];
  /** Warm hits left out since the window's oldest entry (all of them when the window is empty). */
  warmHits: number;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Read a tag's evidence buffer into a display/decision state.
 *
 * Pure. Accepts `undefined` (docs written before the buffer existed) and
 * treats it as empty → 'filling' 0 of 8.
 */
export function readSkillEvidence(recent: readonly TagPresentation[] | undefined): SkillEvidence {
  const all = recent ?? [];
  const counted: TagPresentation[] = [];
  const warmHitTimes: number[] = [];
  all.forEach((entry, i) => {
    if (tagHit(entry) && isWarm(all, i)) warmHitTimes.push(Date.parse(entry.at));
    else counted.push(entry);
  });
  const window = counted.slice(Math.max(0, counted.length - EVIDENCE_WINDOW));
  const windowStart = window.length ? Date.parse(window[0].at) : -Infinity;
  const warmHits = warmHitTimes.filter((t) => t >= windowStart).length;

  let weightSum = 0;
  let weightedHits = 0;
  let misses = 0;
  const cards = new Set<string>();
  const strip: EvidenceTick[] = [];

  window.forEach((entry, i) => {
    const w = recencyWeight(i);
    const ok = tagHit(entry);
    weightSum += w;
    if (ok) weightedHits += w;
    else misses += 1;
    cards.add(entry.card);
    strip.push({ ok, card: entry.card, at: entry.at });
  });

  const weightedAccuracy = weightSum > 0 ? weightedHits / weightSum : 0;
  const distinctCards = cards.size;
  const lastSeen = all.length ? all[all.length - 1].at : null;

  let state: SkillEvidenceState;
  if (window.length < EVIDENCE_FILL_FLOOR) {
    state = { kind: 'filling', have: window.length, need: EVIDENCE_FILL_FLOOR };
  } else if (misses <= MASTERY_MAX_MISSES && distinctCards >= MASTERY_MIN_DISTINCT_CARDS) {
    state = { kind: 'mastered' };
  } else {
    state = { kind: 'gradient', accuracy: weightedAccuracy };
  }

  return { state, total: all.length, distinctCards, lastSeen, weightedAccuracy, misses, strip, warmHits };
}

/**
 * Whether the presentation got this tag right. `ok` is the card's first-attempt
 * correctness; `perf` is the score the question gave this tag. Question types
 * score a tag above 0 inside a wrong answer only when that tag was right
 * (spelling, missing letters), so a wrong card can still be a hit here.
 */
export function tagHit(entry: TagPresentation): boolean {
  return entry.ok || entry.perf > 0;
}

/**
 * Whether `entries[i]` re-shows a card presented within WARM_WINDOW_MS before
 * it. Identical timestamps are the same presentation (merged buffers), not a
 * re-show.
 */
export function isWarm(entries: readonly TagPresentation[], i: number): boolean {
  const at = Date.parse(entries[i].at);
  for (let j = i - 1; j >= 0; j--) {
    const gap = at - Date.parse(entries[j].at);
    if (gap >= WARM_WINDOW_MS) break;
    if (entries[j].card === entries[i].card && gap > 0) return true;
  }
  return false;
}

/**
 * Merge several buffers (e.g. two phoneme readings of one grapheme) into one
 * chronological buffer, so a combined badge can be read with the same policy.
 */
export function mergeRecent(
  buffers: ReadonlyArray<readonly TagPresentation[] | undefined>,
): TagPresentation[] {
  return buffers
    .flatMap((b) => b ?? [])
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Convenience: is this evidence in the 'mastered' state? */
export function isMastered(evidence: SkillEvidence): boolean {
  return evidence.state.kind === 'mastered';
}
