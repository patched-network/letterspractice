import { describe, it, expect } from 'vitest';
import {
  decideFridgeSheetNudge,
  describeColourTargets,
  toColourTarget,
  PRINT_PROMPT_MIN_LETTERS,
  PRINT_PROMPT_SNOOZE_DAYS,
} from './fridgeSheet';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-18T12:00:00Z');

describe('decideFridgeSheetNudge', () => {
  it('is silent for guests', () => {
    expect(
      decideFridgeSheetNudge({ state: null, userTier: 'funnel', unlockedCount: 10, newGraphemes: ['m'], now }),
    ).toEqual({ kind: 'none' });
  });

  it('waits until there are enough letters to colour', () => {
    expect(
      decideFridgeSheetNudge({ state: null, userTier: 'trial', unlockedCount: PRINT_PROMPT_MIN_LETTERS - 1, newGraphemes: [], now }),
    ).toEqual({ kind: 'none' });
    expect(
      decideFridgeSheetNudge({ state: null, userTier: 'trial', unlockedCount: PRINT_PROMPT_MIN_LETTERS, newGraphemes: [], now }),
    ).toEqual({ kind: 'print' });
  });

  it('snoozes after a dismissal, then gives up after two', () => {
    const recent = { updatedAt: '', dismissedAt: new Date(now.getTime() - 2 * day).toISOString(), dismissCount: 1 };
    expect(decideFridgeSheetNudge({ state: recent, userTier: 'paid', unlockedCount: 8, newGraphemes: [], now })).toEqual({ kind: 'none' });
    const stale = { ...recent, dismissedAt: new Date(now.getTime() - (PRINT_PROMPT_SNOOZE_DAYS + 1) * day).toISOString() };
    expect(decideFridgeSheetNudge({ state: stale, userTier: 'paid', unlockedCount: 8, newGraphemes: [], now })).toEqual({ kind: 'print' });
    expect(decideFridgeSheetNudge({ state: { ...stale, dismissCount: 2 }, userTier: 'paid', unlockedCount: 8, newGraphemes: [], now })).toEqual({ kind: 'none' });
  });

  it('once opened, asks for colouring only when something new was introduced', () => {
    const opened = { updatedAt: '', openedAt: '2026-09-01T00:00:00Z', dismissCount: 0 };
    expect(decideFridgeSheetNudge({ state: opened, userTier: 'trial', unlockedCount: 8, newGraphemes: [], now })).toEqual({ kind: 'none' });
    expect(
      decideFridgeSheetNudge({ state: opened, userTier: 'trial', unlockedCount: 8, newGraphemes: ['m', 'sh', 'm', 'a_e'], now }),
    ).toEqual({
      kind: 'colour',
      targets: [{ grapheme: 'm', kind: 'key' }],
    });
  });

  it('skips letter teams: sheet 1 is keycaps only', () => {
    const opened = { updatedAt: '', openedAt: '2026-09-01T00:00:00Z', dismissCount: 0 };
    expect(
      decideFridgeSheetNudge({ state: opened, userTier: 'trial', unlockedCount: 8, newGraphemes: ['sh', 'a_e'], now }),
    ).toEqual({ kind: 'none' });
  });
});

describe('describeColourTargets', () => {
  it('reads as a sentence fragment', () => {
    expect(describeColourTargets([toColourTarget('m')])).toBe('m');
    expect(describeColourTargets([toColourTarget('m'), toColourTarget('s')])).toBe('m, s');
    expect(describeColourTargets([toColourTarget('m'), toColourTarget('sh')])).toBe('m and the ‹sh› box');
    expect(describeColourTargets([toColourTarget('sh'), toColourTarget('a_e')])).toBe('the ‹sh› box and the ‹a_e› box');
  });
});
