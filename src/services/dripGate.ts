/**
 * Drip gate — the reachable-words entitlement boundary
 * ====================================================
 *
 * One question, asked from three places: **is this account's supply of NEW
 * content frozen?**
 *
 *   drip frozen  ⇔  reachableWordCount ≥ wordLimit  ∧  not paid
 *
 * When frozen, the app stops offering new lessons (`StudyHubView`) and stops
 * surfacing intros for graphemes the child hasn't met (`IntroGateFilter`).
 * Nothing already introduced is ever withdrawn: practice, SRS and mastery on
 * the existing rotation continue untouched, forever. The wall stops the
 * supply; it does not repossess.
 *
 * The ceiling and the paid-access lookup come from the entitlement provider
 * (src/entitlement/). With the default open provider there is no ceiling, so
 * the drip never freezes.
 *
 * ## Fail-open, deliberately
 *
 * Every uncertainty resolves to *not frozen*: no entitlement record, a
 * network failure, an unreadable progression document, an identity we can't
 * name. Wrongly walling a paying family is a far worse error than briefly
 * over-serving an unpaid one, and it is the error a child would experience as
 * the app breaking. (This inherits the fail-open stance of the retired
 * `router/trialGuard.ts`, which is the one thing worth keeping from it.)
 */

import { entitlement } from '../entitlement';
import { FREE_TIER_WORD_THRESHOLD } from './curriculum';
import type { LetterProgressionState } from './userState.types';
import { countReachableWords } from './reachableWords/freeSlateCount';

export { FREE_TIER_WORD_THRESHOLD };

/**
 * Drop the memoized entitlement status. Call after a purchase completes, so
 * the wall lifts without a reload.
 */
export function invalidatePaidAccess(): void {
  entitlement.invalidate();
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

export interface DripState {
  /** Words the introduced graphemes make decodable. */
  count: number;
  /** The free-tier ceiling; null when this deployment has none. */
  threshold: number | null;
  /** Has the count reached the ceiling? True regardless of payment. */
  reachedThreshold: boolean;
  /** Account holds a paid entitlement. */
  paid: boolean;
  /** New lessons and new GPC intros are withheld. */
  frozen: boolean;
}

/**
 * Evaluate the gate against an already-loaded progression document.
 *
 * Synchronous in the part that matters (the count is persisted on the
 * document); only the entitlement lookup awaits, and that is memoized.
 * Callers holding a progression state should prefer this over
 * {@link getDripState} so the document is read once.
 */
export async function evaluateDripState(
  state: LetterProgressionState | null,
): Promise<DripState> {
  const threshold = entitlement.wordLimit;

  let count = state?.reachableWordCount;
  if (typeof count !== 'number') {
    // Pre-counter account, or a write that failed to compute. Derive rather
    // than assume zero — assuming zero would silently un-wall an account that
    // has long since passed the threshold.
    try {
      count = await countReachableWords(state?.unlockedLetters ?? []);
    } catch {
      count = 0;
    }
  }

  const reachedThreshold = threshold !== null && count >= threshold;
  // Skip the entitlement round-trip entirely below the threshold — the answer
  // cannot change the outcome, and this is the common case by far.
  const paid = reachedThreshold ? await entitlement.hasPaidAccess() : false;

  return { count, threshold, reachedThreshold, paid, frozen: reachedThreshold && !paid };
}

/** Is the drip frozen for this progression state? */
export async function isDripFrozen(
  state: LetterProgressionState | null,
): Promise<boolean> {
  return (await evaluateDripState(state)).frozen;
}
