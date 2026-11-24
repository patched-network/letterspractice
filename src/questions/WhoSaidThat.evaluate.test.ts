/**
 * WhoSaidThat.evaluate(): which GPC tags an answer grades.
 *
 * Split-digraph cards show a single vowel ("a" for a_e-EY). Building the tag from
 * letter + phoneme graded a bare `a-EY`, which no catalogue GPC or card carries
 * (agent/mastery-gating/a.1.plan.md §0, 2026-11-18).
 */

import { describe, it, expect } from 'vitest';
import type { TaggedPerformance } from '@vue-skuilder/common';
import { WhoSaidThat } from './WhoSaidThat';

const perf = (q: WhoSaidThat, answer: string) =>
  q.evaluate(answer, 3000).performance as TaggedPerformance;

describe('WhoSaidThat graded tags', () => {
  it('grades the card gpcId when present', () => {
    const q = new WhoSaidThat([{ targetPhoneme: 'EY', correctLetter: 'a', gpcId: 'a_e-EY', distractors: 'i,o' } as any]);
    expect(Object.keys(perf(q, 'a'))).toEqual(['_global', 'gpc:exercise:a_e-EY']);
  });

  it('a vowel distractor on a long-vowel card is graded as its split digraph', () => {
    const q = new WhoSaidThat([{ targetPhoneme: 'EY', correctLetter: 'a', gpcId: 'a_e-EY', distractors: 'i,o' } as any]);
    const p = perf(q, 'i');
    expect(p['gpc:exercise:i_e-AY']).toBe(0);
    expect(p['gpc:exercise:i-AY']).toBeUndefined();
  });

  it('falls back to letter + phoneme without gpcId (cards deployed before the field)', () => {
    const q = new WhoSaidThat([{ targetPhoneme: 'B', correctLetter: 'b', distractors: 'd,p' } as any]);
    expect(Object.keys(perf(q, 'b'))).toContain('gpc:exercise:b-B');
  });
});
