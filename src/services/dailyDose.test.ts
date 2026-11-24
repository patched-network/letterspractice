import { describe, it, expect } from 'vitest';
import {
  isRestingToday,
  localDay,
  withCompletedSession,
  withUnlock,
  SESSIONS_PER_DAY,
} from './dailyDose';

// Local-time constructors, so the calendar day doesn't depend on the test box's TZ.
const morning = new Date(2026, 9, 23, 9, 0);
const evening = new Date(2026, 9, 23, 19, 30);
const nextMorning = new Date(2026, 9, 24, 7, 0);

describe('daily dose', () => {
  it('allows practice with no history', () => {
    expect(isRestingToday(null, morning)).toBe(false);
  });

  it('allows exactly one session per day', () => {
    expect(SESSIONS_PER_DAY).toBe(1);
    const done = withCompletedSession(null, morning);
    expect(isRestingToday(done, morning)).toBe(true);
    expect(isRestingToday(done, evening)).toBe(true);
  });

  it('opens again the next calendar day', () => {
    const done = withCompletedSession(null, evening);
    expect(isRestingToday(done, nextMorning)).toBe(false);
  });

  it('an unlock allows one more session, then rests again', () => {
    let s = withCompletedSession(null, morning);
    s = withUnlock(s, morning);
    expect(isRestingToday(s, morning)).toBe(false);
    s = withCompletedSession(s, evening);
    expect(isRestingToday(s, evening)).toBe(true);
  });

  it("an unlock doesn't carry over to the next day", () => {
    const s = withUnlock(withCompletedSession(null, morning), morning);
    const tomorrow = withCompletedSession(s, nextMorning);
    expect(tomorrow.unlocked).toBe(0);
    expect(isRestingToday(tomorrow, nextMorning)).toBe(true);
  });

  it('keeps the lifetime unlock count across days', () => {
    let s = withUnlock(withCompletedSession(null, morning), morning);
    s = withUnlock(withCompletedSession(s, nextMorning), nextMorning);
    expect(s.totalUnlocks).toBe(2);
  });

  it('formats the local day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
