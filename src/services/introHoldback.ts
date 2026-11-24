/**
 * Intro hold-back — spaces out new intros while letter-sound debt is high.
 *
 * Debt is the mastery gate's measure: met letter-sounds that are shaky or
 * unproven (`letterSoundSecurity`). While it is over `MASTERY_MAX_INSECURE`,
 * a new intro (a grapheme or sight word not yet in `unlockedLetters`) is
 * allowed only once `introGapDays(debt)` local days have passed since the
 * last one. Each insecure letter-sound over the cap adds a day, up to
 * {@link INTRO_HOLDBACK_MAX_GAP_DAYS}. Agent doc:
 * `agent/mastery-gating/a.1.plan.md` §0.
 *
 * Why spacing and not a score penalty: the prescribed generator's target
 * pressure climbs (to ×8) for as long as an intro goes unshown, so a fixed
 * multiplier wears off within days. A held intro is zeroed instead, and the
 * gap is what lets intake keep moving. The gap is also the release valve if
 * some debt never clears (spelling-choice misses keep c-K / j-JH / ph-F shaky).
 *
 * Fails open, like the entitlement wall: no ratings, or no `lastIntroAt`
 * (accounts whose last unlock predates this), means not held.
 *
 * Separate from `masteryGating` on purpose: the hold-back is on while the
 * lesson gate stays off. Off via `VITE_INTRO_HOLDBACK=false` at build time or
 * `localStorage['lp:introHoldback'] = 'false'` in one browser.
 */

import type { CourseSecurity } from '@vue-skuilder/common';
import { MASTERY_MAX_INSECURE } from './curriculum';
import { letterSoundSecurity, type LessonTagElo } from './lessons';

/** Longest gap between new intros, however high debt gets. */
export const INTRO_HOLDBACK_MAX_GAP_DAYS = 7;

export const introHoldback = { enabled: readIntroHoldbackFlag() };

function readIntroHoldbackFlag(): boolean {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (env?.VITE_INTRO_HOLDBACK === 'false') return false;
  } catch {
    // no import.meta.env outside vite
  }
  try {
    return !(typeof localStorage !== 'undefined' && localStorage.getItem('lp:introHoldback') === 'false');
  } catch {
    return true;
  }
}

/** Local days required between new intros at this debt. 0 = no hold. */
export function introGapDays(debt: number, cap = MASTERY_MAX_INSECURE): number {
  return Math.min(INTRO_HOLDBACK_MAX_GAP_DAYS, Math.max(0, debt - cap));
}

export interface IntroHoldbackState {
  /** New intros are withheld right now. */
  held: boolean;
  /** Met letter-sounds shaky + unproven. */
  debt: number;
  cap: number;
  /** Required gap at this debt, in local days (0 = none). */
  gapDays: number;
  /** When the last new intro was recorded, if known. */
  lastIntroAt?: string;
  /** Local days since then (0 = today). */
  daysSinceIntro?: number;
  /** First local day (YYYY-MM-DD) a new intro is allowed, when held. */
  nextIntroDay?: string;
  security: CourseSecurity;
}

/** Midnight of the local day containing `d`. */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDayString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Whole local calendar days from `from` to `to` (DST-safe: rounds). */
function localDaysBetween(from: Date, to: Date): number {
  return Math.round((localMidnight(to).getTime() - localMidnight(from).getTime()) / 86_400_000);
}

/**
 * Evaluate the hold-back. Pure: `now` is a parameter so tests (and the
 * overlay) agree on what day it is.
 */
export function evaluateIntroHoldback(
  tagElo: LessonTagElo | undefined,
  lastIntroAt: string | undefined,
  now: Date = new Date(),
  cap = MASTERY_MAX_INSECURE,
): IntroHoldbackState {
  const security = letterSoundSecurity(tagElo);
  const debt = security.debt;
  const gapDays = introGapDays(debt, cap);
  const base: IntroHoldbackState = { held: false, debt, cap, gapDays, security };

  const last = lastIntroAt ? new Date(lastIntroAt) : null;
  if (!last || Number.isNaN(last.getTime())) return base;

  const daysSinceIntro = localDaysBetween(last, now);
  const withLast = { ...base, lastIntroAt, daysSinceIntro };
  // No ratings at all: fail open rather than read an empty buffer as "no debt"
  // or as "all debt". (Empty ratings give debt 0 anyway; this is explicit.)
  if (!tagElo || Object.keys(tagElo).length === 0) return withLast;
  if (gapDays === 0 || daysSinceIntro >= gapDays) return withLast;

  const next = localMidnight(last);
  next.setDate(next.getDate() + gapDays);
  return { ...withLast, held: true, nextIntroDay: localDayString(next) };
}

/** Matches a sight-word intro tag: `gpc:intro:WORD-are` → `are`. */
const SIGHT_WORD_INTRO = /^gpc:intro:WORD-(.+)$/;

/**
 * The sight word this card would introduce for the first time, or null.
 * Sight-word intros record each word into `unlockedLetters`
 * (SightWordIntroView), so "introduced" is the same set as for graphemes.
 */
export function newSightWord(tags: readonly string[], introduced: ReadonlySet<string>): string | null {
  for (const tag of tags) {
    const m = SIGHT_WORD_INTRO.exec(tag);
    if (!m) continue;
    const word = m[1].toLowerCase();
    if (!introduced.has(word)) return word;
  }
  return null;
}
