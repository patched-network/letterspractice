/**
 * Daily dose policy.
 *
 * One completed practice session per calendar day. Once it's done, the study
 * hub rests until tomorrow: no Practice, and no Learn either (a finished lesson
 * runs straight into practice, and lessons are spaced weeks apart, so a day's
 * wait costs nothing).
 *
 * This is the other half of the per-session dose (sessionLengthPolicy.ts). A
 * fixed-length session that can be restarted on demand still puts the parent
 * in the position of saying "no more" to a child asking for another go. The
 * app holding the line itself is the point.
 *
 * A grown-up can unlock one more session for today behind an adult gate
 * (AdultGateDialog.vue). Each unlock allows exactly one further session and is
 * counted, so heavy unlocking is visible rather than silent.
 *
 * "Today" is the device's local calendar day. A session counts when it
 * *finishes*; an abandoned session doesn't use up the day.
 *
 * Pure functions; persistence lives in userState.ts (`getDailyDose`,
 * `recordPracticeSessionCompleted`, `recordDailyDoseUnlock`). Wiring:
 * StudyHubView (rest state + unlock), StudyPracticeView (count + route guard).
 */

/** Practice sessions allowed per calendar day before the hub rests. */
export const SESSIONS_PER_DAY = 1;

export interface DailyDoseState {
  updatedAt: string;
  /** Local calendar day (YYYY-MM-DD) the counts below belong to. */
  day: string;
  /** Practice sessions completed on `day`. */
  completed: number;
  /** Grown-up unlocks granted on `day`; each allows one extra session. */
  unlocked: number;
  /** Lifetime unlock count, for /admin visibility. */
  totalUnlocks: number;
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The state as it applies to today: counts from an earlier day reset to zero. */
function forToday(state: DailyDoseState | null, now: Date): DailyDoseState {
  const day = localDay(now);
  if (state && state.day === day) return state;
  return {
    updatedAt: now.toISOString(),
    day,
    completed: 0,
    unlocked: 0,
    totalUnlocks: state?.totalUnlocks ?? 0,
  };
}

/** True when today's dose (plus any unlocks) is used up. */
export function isRestingToday(state: DailyDoseState | null, now: Date = new Date()): boolean {
  const today = forToday(state, now);
  return today.completed >= SESSIONS_PER_DAY + today.unlocked;
}

export function withCompletedSession(
  state: DailyDoseState | null,
  now: Date = new Date(),
): DailyDoseState {
  const today = forToday(state, now);
  return { ...today, updatedAt: now.toISOString(), completed: today.completed + 1 };
}

export function withUnlock(state: DailyDoseState | null, now: Date = new Date()): DailyDoseState {
  const today = forToday(state, now);
  return {
    ...today,
    updatedAt: now.toISOString(),
    unlocked: today.unlocked + 1,
    totalUnlocks: today.totalUnlocks + 1,
  };
}
