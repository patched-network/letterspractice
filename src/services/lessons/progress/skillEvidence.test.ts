/**
 * Run with: npx vitest run src/services/lessons/progress/skillEvidence.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { TagPresentation } from '@vue-skuilder/common';
import {
  readSkillEvidence,
  mergeRecent,
  EVIDENCE_WINDOW,
  MASTERY_MAX_MISSES,
  MASTERY_MIN_DISTINCT_CARDS,
  WARM_WINDOW_MS,
} from './skillEvidence';

// One presentation a day, so repeated cards are cold re-shows unless a test
// says otherwise.
let clock = 0;
const p = (ok: boolean, card = `card-${clock}`): TagPresentation => ({
  at: new Date(Date.UTC(2026, 8, 1 + clock++)).toISOString(),
  ok,
  perf: ok ? 1 : 0,
  card,
});
const many = (n: number, ok: boolean | ((i: number) => boolean), card?: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => p(typeof ok === 'function' ? ok(i) : ok, card ? card(i) : undefined));

describe('readSkillEvidence — filling', () => {
  it('treats undefined and empty as filling 0 of N', () => {
    for (const input of [undefined, []]) {
      const e = readSkillEvidence(input);
      expect(e.state).toEqual({ kind: 'filling', have: 0, need: EVIDENCE_WINDOW });
      expect(e.total).toBe(0);
      expect(e.lastSeen).toBeNull();
      expect(e.strip).toEqual([]);
    }
  });

  it('stays filling at N-1 entries even when all correct and broad', () => {
    const e = readSkillEvidence(many(EVIDENCE_WINDOW - 1, true));
    expect(e.state).toEqual({ kind: 'filling', have: EVIDENCE_WINDOW - 1, need: EVIDENCE_WINDOW });
    expect(e.distinctCards).toBe(EVIDENCE_WINDOW - 1);
  });
});

describe('readSkillEvidence — mastered', () => {
  it('is mastered at exactly N entries, 0 misses, ≥ min distinct cards', () => {
    const e = readSkillEvidence(many(EVIDENCE_WINDOW, true));
    expect(e.state).toEqual({ kind: 'mastered' });
    expect(e.weightedAccuracy).toBe(1);
  });

  it('tolerates exactly MASTERY_MAX_MISSES misses in the window', () => {
    const entries = many(EVIDENCE_WINDOW, (i) => i >= MASTERY_MAX_MISSES);
    expect(readSkillEvidence(entries).state).toEqual({ kind: 'mastered' });
  });

  it('is gradient with one miss more than allowed', () => {
    const entries = many(EVIDENCE_WINDOW, (i) => i > MASTERY_MAX_MISSES);
    const e = readSkillEvidence(entries);
    expect(e.state.kind).toBe('gradient');
    expect(e.misses).toBe(MASTERY_MAX_MISSES + 1);
  });

  it('applies the distinct-card rule: all-correct on too few cards is gradient, not mastered', () => {
    const narrow = many(EVIDENCE_WINDOW, true, (i) => `card-${i % (MASTERY_MIN_DISTINCT_CARDS - 1)}`);
    const e = readSkillEvidence(narrow);
    expect(e.distinctCards).toBe(MASTERY_MIN_DISTINCT_CARDS - 1);
    expect(e.state).toEqual({ kind: 'gradient', accuracy: 1 });

    const justEnough = many(EVIDENCE_WINDOW, true, (i) => `card-${i % MASTERY_MIN_DISTINCT_CARDS}`);
    expect(readSkillEvidence(justEnough).state).toEqual({ kind: 'mastered' });
  });
});

describe('readSkillEvidence — window & recency', () => {
  it('only the last N entries count; older misses age out', () => {
    const entries = [...many(4, false), ...many(EVIDENCE_WINDOW, true)];
    const e = readSkillEvidence(entries);
    expect(e.total).toBe(EVIDENCE_WINDOW + 4);
    expect(e.misses).toBe(0);
    expect(e.state).toEqual({ kind: 'mastered' });
    expect(e.strip).toHaveLength(EVIDENCE_WINDOW);
    expect(e.strip.every((t) => t.ok)).toBe(true);
  });

  it('weights recent outcomes more: a recent miss costs more than an old one', () => {
    const oldMiss = many(EVIDENCE_WINDOW, (i) => i !== 0);
    const newMiss = many(EVIDENCE_WINDOW, (i) => i !== EVIDENCE_WINDOW - 1);
    // Force gradient by narrowing cards so the accuracy is observable in the state.
    const narrowOld = oldMiss.map((x) => ({ ...x, card: 'one' }));
    const narrowNew = newMiss.map((x) => ({ ...x, card: 'one' }));
    const a = readSkillEvidence(narrowOld);
    const b = readSkillEvidence(narrowNew);
    expect(a.state.kind).toBe('gradient');
    expect(b.state.kind).toBe('gradient');
    expect(a.weightedAccuracy).toBeGreaterThan(b.weightedAccuracy);
    // Linear weights 1..8 sum to 36: oldest miss → 35/36, newest miss → 28/36.
    const sum = (EVIDENCE_WINDOW * (EVIDENCE_WINDOW + 1)) / 2;
    expect(a.weightedAccuracy).toBeCloseTo((sum - 1) / sum, 10);
    expect(b.weightedAccuracy).toBeCloseTo((sum - EVIDENCE_WINDOW) / sum, 10);
  });

  it('reports lastSeen as the newest entry and preserves strip order', () => {
    const entries = many(EVIDENCE_WINDOW + 2, (i) => i % 3 !== 0);
    const e = readSkillEvidence(entries);
    expect(e.lastSeen).toBe(entries[entries.length - 1].at);
    expect(e.strip.map((t) => t.at)).toEqual(entries.slice(2).map((t) => t.at));
  });
});

describe('mergeRecent', () => {
  it('interleaves buffers chronologically and tolerates undefined', () => {
    const a = [p(true, 'a1'), p(true, 'a2')];
    const b = [p(false, 'b1')];
    const c = [p(true, 'a3')];
    const merged = mergeRecent([a, undefined, c, b]);
    expect(merged.map((x) => x.card)).toEqual(['a1', 'a2', 'b1', 'a3']);
  });
});

describe('readSkillEvidence — warm re-shows', () => {
  const T0 = Date.UTC(2026, 9, 4, 22, 0);
  const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
  const e = (minutes: number, ok: boolean, card: string): TagPresentation => ({ at: at(minutes), ok, perf: ok ? 1 : 0, card });

  it('leaves out a correct re-show of a card missed minutes earlier (fix: thix, then fix)', () => {
    const r = readSkillEvidence([e(0, false, 'fix'), e(3, true, 'fix')]);
    expect(r.strip.map((t) => t.ok)).toEqual([false]);
    expect(r.misses).toBe(1);
    expect(r.weightedAccuracy).toBe(0);
    expect(r.warmHits).toBe(1);
    expect(r.total).toBe(2);
    expect(r.lastSeen).toBe(at(3));
  });

  it('counts a warm miss in full', () => {
    const r = readSkillEvidence([e(0, false, 'fix'), e(3, false, 'fix')]);
    expect(r.misses).toBe(2);
    expect(r.warmHits).toBe(0);
  });

  it('counts a different word with the same GPC in the same session', () => {
    const r = readSkillEvidence([e(0, false, 'fix'), e(1, true, 'fin')]);
    expect(r.strip.map((t) => t.card)).toEqual(['fix', 'fin']);
    expect(r.warmHits).toBe(0);
  });

  it('counts a re-show at or past WARM_WINDOW_MS as cold', () => {
    const later = WARM_WINDOW_MS / 60_000;
    const r = readSkillEvidence([e(0, false, 'fix'), e(later, true, 'fix')]);
    expect(r.strip.map((t) => t.ok)).toEqual([false, true]);
  });

  it('treats an identical timestamp as the same presentation (merged buffers), not a re-show', () => {
    const r = readSkillEvidence([e(0, true, 'fix'), e(0, true, 'fix')]);
    expect(r.warmHits).toBe(0);
    expect(r.strip).toHaveLength(2);
  });

  it('counts only warm hits since the window began', () => {
    const old = [e(0, false, 'a'), e(1, true, 'a')]; // warm hit, then the window fills past it
    const fresh = Array.from({ length: EVIDENCE_WINDOW }, (_, i) => e(24 * 60 * (i + 1), true, `c${i}`));
    const r = readSkillEvidence([...old, ...fresh]);
    expect(r.warmHits).toBe(0);
    expect(r.state).toEqual({ kind: 'mastered' });
  });
});

describe('readSkillEvidence — per-tag reading', () => {
  it('counts a tag the question credited inside a wrong answer as a hit ("ife": f right, card wrong)', () => {
    const credited: TagPresentation = { at: '2026-10-04T22:23:19.000Z', ok: false, perf: 0.8, card: 'c-spelling-if' };
    const missed: TagPresentation = { at: '2026-10-04T22:23:19.000Z', ok: false, perf: 0, card: 'c-spelling-if' };
    expect(readSkillEvidence([credited]).strip[0].ok).toBe(true);
    expect(readSkillEvidence([missed]).strip[0].ok).toBe(false);
    expect(readSkillEvidence([missed]).misses).toBe(1);
  });
});
