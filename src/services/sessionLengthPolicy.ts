/**
 * Session length policy.
 *
 * Computes the per-session time limit (in minutes) for the study loop.
 *
 * Default (auto) policy:
 *   - Start at 2 minutes regardless of onboarded age.
 *   - Converge linearly over the first CONVERGENCE_SESSIONS completed sessions
 *     to `n` minutes, where `n` = the child's current age in years.
 *   - "Current age" tracks real time: childAge bucket (lower bound) at
 *     onboarding completion + (now - completedAt) in years. Because n is in
 *     minutes and age in years, the post-convergence aging adds ~60 sec/year
 *     (~1.15 sec/week) — naturally imperceptible session-to-session.
 *
 * Manual override:
 *   - If the user has flipped /account to manual mode, the manual value
 *     (held in `UserConfig.sessionTimeLimit`) is used verbatim.
 *
 * Pure functions; no Vue / store dependencies. The mode is persisted per
 * account in UserDB (`getSessionLengthMode` / `setSessionLengthMode` in
 * userState.ts). Wiring lives in StudyPracticeView (resolution at session
 * start) and AccountView (Auto/Manual toggle UI).
 */

/** Convergence horizon: number of completed study sessions to reach target. */
export const CONVERGENCE_SESSIONS = 20;

/** Floor / ceiling for the resolved session length. */
export const MIN_SESSION_MINUTES = 2;
export const MAX_SESSION_MINUTES = 6;

/** Approximate year length in ms (calendar year average). */
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export type SessionLengthMode = 'auto' | 'manual';

/**
 * Parse a childAge bucket label (as captured in OnboardingAge.vue) into a
 * numeric age-in-years anchor. Uses the bucket's lower bound:
 *
 *   "2 years"      -> 2
 *   "2.5-3 years"  -> 2.5
 *   "3-3.5 years"  -> 3
 *   "3.5-4 years"  -> 3.5
 *   "4-4.5 years"  -> 4
 *   "4.5-5 years"  -> 4.5
 *   "5+ years"     -> 5
 *
 * Unknown / unparseable buckets fall back to MIN_SESSION_MINUTES (conservative).
 */
export function parseAgeBucketYears(bucket: string | undefined | null): number {
  if (!bucket) return MIN_SESSION_MINUTES;
  const match = bucket.match(/(\d+(?:\.\d+)?)/);
  if (!match) return MIN_SESSION_MINUTES;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return MIN_SESSION_MINUTES;
  return n;
}

/**
 * Compute the child's current age in years given the onboarded bucket and the
 * ISO timestamp of onboarding completion. If `completedAt` is missing or
 * invalid, returns the bucket lower bound (no aging applied).
 */
export function getCurrentAgeYears(
  childAge: string | undefined | null,
  completedAt: string | undefined | null,
  now: Date = new Date(),
): number {
  const baseAge = parseAgeBucketYears(childAge);
  if (!completedAt) return baseAge;
  const t = Date.parse(completedAt);
  if (!Number.isFinite(t)) return baseAge;
  const deltaYears = Math.max(0, (now.getTime() - t) / YEAR_MS);
  return baseAge + deltaYears;
}

/**
 * Compute the auto-mode session length in minutes, given the child's current
 * age (in years) and the number of completed study sessions so far.
 *
 * Linear interpolation: starts at MIN_SESSION_MINUTES, converges to
 * `currentAgeYears` minutes after CONVERGENCE_SESSIONS completed sessions.
 * Clamped to [MIN_SESSION_MINUTES, MAX_SESSION_MINUTES].
 */
export function computeAutoSessionMinutes(
  currentAgeYears: number,
  sessionsCount: number,
): number {
  const target = Math.max(MIN_SESSION_MINUTES, currentAgeYears);
  const progress = Math.min(1, Math.max(0, sessionsCount / CONVERGENCE_SESSIONS));
  const raw = MIN_SESSION_MINUTES + (target - MIN_SESSION_MINUTES) * progress;
  return clamp(raw, MIN_SESSION_MINUTES, MAX_SESSION_MINUTES);
}

export interface ResolveSessionMinutesInput {
  mode: SessionLengthMode;
  /** Manual override (minutes). Used only when mode === 'manual'. */
  manualMinutes: number;
  /** Onboarding `childAge` bucket label. */
  childAge: string | undefined | null;
  /** ISO timestamp from onboarding completion (anchor for date-offset aging). */
  completedAt: string | undefined | null;
  /** Completed study sessions so far (for convergence ramp). */
  sessionsCount: number;
  /** Override "now" for testing. */
  now?: Date;
}

/**
 * Single entry point used by the study view to resolve the active session
 * length in minutes.
 */
export function resolveSessionMinutes(input: ResolveSessionMinutesInput): number {
  if (input.mode === 'manual') {
    return clamp(input.manualMinutes, MIN_SESSION_MINUTES, MAX_SESSION_MINUTES);
  }
  const ageNow = getCurrentAgeYears(input.childAge, input.completedAt, input.now);
  return computeAutoSessionMinutes(ageNow, input.sessionsCount);
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
