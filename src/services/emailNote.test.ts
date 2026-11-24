import { describe, expect, it } from 'vitest';
import { emailNoteDue, registeredAt } from './emailNote';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-10T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * day);

describe('emailNoteDue', () => {
  it('waits out the grace period after registration', () => {
    expect(emailNoteDue(ago(0), null, now)).toBe(false);
    expect(emailNoteDue(ago(2.9), null, now)).toBe(false);
    expect(emailNoteDue(ago(3), null, now)).toBe(true);
  });

  it('shows with no known registration date', () => {
    expect(emailNoteDue(null, null, now)).toBe(true);
  });

  it('stays hidden for two weeks after hiding, then returns', () => {
    expect(emailNoteDue(ago(30), ago(13), now)).toBe(false);
    expect(emailNoteDue(ago(30), ago(14), now)).toBe(true);
  });
});

describe('registeredAt', () => {
  it('takes the earliest valid registration date', () => {
    const r = registeredAt({
      a: { registrationDate: '2026-11-05T00:00:00Z' },
      b: { registrationDate: '2026-10-01T00:00:00Z' },
      c: { registrationDate: 'nonsense' },
    });
    expect(r?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('is null without entitlements', () => {
    expect(registeredAt(undefined)).toBeNull();
    expect(registeredAt({})).toBeNull();
  });
});
