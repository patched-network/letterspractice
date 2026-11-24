import { describe, expect, it } from 'vitest';
import type { CourseElo, TagPresentation } from '@vue-skuilder/common';
import {
  CAP,
  GAIN,
  HALF_LIFE_DAYS,
  RECENCY_DECAY,
  readTagWeakness,
  tagWeakness,
  weakestTag,
  weaknessMultiplier,
} from './recentWeakness';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** One presentation `daysAgo` days before NOW; `miss` scores the tag 0. */
const at = (daysAgo: number, miss: boolean, ok = !miss): TagPresentation => ({
  at: new Date(NOW - daysAgo * DAY).toISOString(),
  ok,
  perf: miss ? 0 : 0.9,
  card: 'c-test',
});

describe('tagWeakness', () => {
  it('is 0 with no misses', () => {
    expect(tagWeakness([at(0, false), at(0, false)], NOW)).toBe(0);
  });

  it('weighs a fresh miss 1', () => {
    expect(tagWeakness([at(0, true)], NOW)).toBeCloseTo(1, 6);
  });

  it('relieves with each later presentation', () => {
    const one = tagWeakness([at(0, true), at(0, false)], NOW);
    const three = tagWeakness([at(0, true), at(0, false), at(0, false), at(0, false)], NOW);
    expect(one).toBeCloseTo(RECENCY_DECAY, 6);
    expect(three).toBeCloseTo(RECENCY_DECAY ** 3, 6);
  });

  it('relieves with time: halves every HALF_LIFE_DAYS', () => {
    expect(tagWeakness([at(HALF_LIFE_DAYS, true)], NOW)).toBeCloseTo(0.5, 6);
  });

  it("counts the tag's own score, not the card's outcome", () => {
    // "kam" for "came": the card was wrong, but m-M scored 0.9
    expect(tagWeakness([at(0, false, false)], NOW)).toBe(0);
  });
});

describe('weaknessMultiplier', () => {
  it('is ×1 at no weakness and grows by GAIN', () => {
    expect(weaknessMultiplier(0)).toBe(1);
    expect(weaknessMultiplier(1)).toBeCloseTo(1 + GAIN, 6);
  });

  it('is capped', () => {
    expect(weaknessMultiplier(10)).toBe(CAP);
  });
});

describe('readTagWeakness', () => {
  const elo = (tags: CourseElo['tags']): CourseElo => ({ global: { score: 1500, count: 10 }, tags, misc: {} });

  it('reads exercise tags with a recent miss, and nothing else', () => {
    const weakness = readTagWeakness(
      elo({
        'gpc:exercise:a_e-EY': { score: 1500, count: 5, recent: [at(0, true)] },
        'gpc:exercise:m-M': { score: 1500, count: 5, recent: [at(0, false)] },
        'gpc:intro:a_e-EY': { score: 1500, count: 1, recent: [at(0, true)] },
        'gpc:exercise:t-T': { score: 1500, count: 5 },
      }),
      NOW,
    );
    expect([...weakness.keys()]).toEqual(['gpc:exercise:a_e-EY']);
  });
});

describe('weakestTag', () => {
  it("takes the card's weakest tag, so two weak tags don't multiply", () => {
    const weakness = new Map([
      ['gpc:exercise:c-K', 0.6],
      ['gpc:exercise:a_e-EY', 1],
    ]);
    const cape = ['gpc:exercise:c-K', 'gpc:exercise:a_e-EY', 'gpc:exercise:p-P'];
    expect(weakestTag(cape, weakness)).toEqual({ tag: 'gpc:exercise:a_e-EY', weakness: 1 });
    expect(weakestTag(['gpc:exercise:p-P'], weakness)).toBeNull();
  });
});
