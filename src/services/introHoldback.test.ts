import { describe, expect, it } from 'vitest';
import { evaluateIntroHoldback, introGapDays, newSightWord, INTRO_HOLDBACK_MAX_GAP_DAYS } from './introHoldback';
import { MASTERY_MAX_INSECURE, GPC_CATALOGUE } from './curriculum';
import { gpcExerciseTag } from './tags';
import type { LessonTagElo } from './lessons';

const CAP = MASTERY_MAX_INSECURE;
const tags = GPC_CATALOGUE.map((e) => gpcExerciseTag(e.id)).filter((t) => !t.includes(':WORD-'));

/** Local-time ISO-ish stamp so day arithmetic is zone-independent in tests. */
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

/** 12 right first attempts over two days: secure. */
const secureRank = () => ({
  score: 1500,
  count: 12,
  recent: Array.from({ length: 12 }, (_, i) => ({
    at: at(2026, 11, 10 + (i % 2)),
    ok: true,
    perf: 1,
    card: `c${i}`,
  })),
});

/** A learner with `secure` secure and `insecure` unproven letter-sounds. */
function learner(secure: number, insecure: number): LessonTagElo {
  const out: LessonTagElo = {};
  tags.slice(0, secure).forEach((t) => (out[t] = secureRank()));
  tags.slice(secure, secure + insecure).forEach((t) => (out[t] = { score: 1300, count: 2, recent: [] }));
  return out;
}

describe('introGapDays', () => {
  it('is zero at or under the cap, a day per insecure over it, capped', () => {
    expect(introGapDays(CAP)).toBe(0);
    expect(introGapDays(CAP + 1)).toBe(1);
    expect(introGapDays(CAP + 5)).toBe(5);
    expect(introGapDays(CAP + 50)).toBe(INTRO_HOLDBACK_MAX_GAP_DAYS);
  });
});

describe('evaluateIntroHoldback', () => {
  const now = new Date(2026, 10, 18, 9);

  it('holds within the gap and names the first open day', () => {
    const h = evaluateIntroHoldback(learner(20, CAP + 5), at(2026, 11, 17, 18), now);
    expect(h.debt).toBe(CAP + 5);
    expect(h.gapDays).toBe(5);
    expect(h.daysSinceIntro).toBe(1);
    expect(h.held).toBe(true);
    expect(h.nextIntroDay).toBe('2026-11-22');
  });

  it('opens once the gap has elapsed', () => {
    const h = evaluateIntroHoldback(learner(20, CAP + 2), at(2026, 11, 16), now);
    expect(h.held).toBe(false);
  });

  it('never holds at or under the cap', () => {
    expect(evaluateIntroHoldback(learner(20, CAP), at(2026, 11, 18, 8), now).held).toBe(false);
  });

  it('fails open without a last-intro stamp or ratings', () => {
    expect(evaluateIntroHoldback(learner(20, CAP + 5), undefined, now).held).toBe(false);
    expect(evaluateIntroHoldback(undefined, at(2026, 11, 18, 8), now).held).toBe(false);
    expect(evaluateIntroHoldback({}, at(2026, 11, 18, 8), now).held).toBe(false);
  });

  it('ignores stale tags the catalogue does not define', () => {
    const stale: LessonTagElo = Object.fromEntries(
      ['a-EY', 'i-AY', 'o-OW', 'u-UW', 'e-IY', 'x-ZZ'].map((g) => [`gpc:exercise:${g}`, { score: 1300, count: 1 }]),
    );
    const h = evaluateIntroHoldback({ ...learner(20, CAP), ...stale }, at(2026, 11, 18, 8), now);
    expect(h.debt).toBe(CAP);
    expect(h.held).toBe(false);
  });
});

describe('newSightWord', () => {
  it('returns a sight word not yet introduced, ignoring met ones and GPC intros', () => {
    const met = new Set(['are']);
    expect(newSightWord(['gpc:intro:WORD-are'], met)).toBeNull();
    expect(newSightWord(['gpc:intro:WORD-Could'], met)).toBe('could');
    expect(newSightWord(['gpc:intro:s-S'], met)).toBeNull();
  });
});
