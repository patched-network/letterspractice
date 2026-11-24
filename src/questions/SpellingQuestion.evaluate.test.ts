/**
 * SpellingQuestion.evaluate() — Regression Test Suite
 *
 * Run with: npx vitest run src/questions/SpellingQuestion.evaluate.test.ts
 *
 * Covers:
 *   - Simple words (cat, sit, dog) — correct and incorrect
 *   - Digraphs (ship, chin) — correct and per-position wrong
 *   - Split digraphs (cake) — verify chunk spans both positions
 *   - Wrong-length answers (rules pinned in spelling/gradeCases.ts)
 *   - Time scaling — fast vs slow response scores
 *   - Score ceiling applied for non-Level-3
 *   - Phonetic misspellings (isCorrect, _global 0)
 *
 * Ref: agent/spelling-question/a.3.plan.md §3.5
 */

import { describe, it, expect } from 'vitest';
import { SpellingQuestion } from './SpellingQuestion';
import { SCORE_CEILING, type ScaffoldLevel } from './spelling/types';
import type { TaggedPerformance } from '@vue-skuilder/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SpellingQuestion.evaluate() always returns TaggedPerformance — narrow once. */
const perf = (result: { performance: unknown }): TaggedPerformance =>
  result.performance as TaggedPerformance;

/**
 * Create a SpellingQuestion for a given word.
 * Optionally set achievedLevel and scoreCeiling before evaluation.
 */
function makeQuestion(
  word: string,
  opts?: { level?: ScaffoldLevel; ceiling?: number },
): SpellingQuestion {
  const q = new SpellingQuestion([{ word } as any]);
  if (opts?.level !== undefined) {
    q.achievedLevel = opts.level;
    q.scoreCeiling = opts.ceiling ?? SCORE_CEILING[opts.level];
  }
  return q;
}

/** A "fast" time for a short word — within the fast threshold. */
const FAST_TIME = 1000;

/** A midrange time — between fast and slow for a 3-letter word. */
const MID_TIME = 8000;

/** A very slow time — past the slow threshold for any word. */
const SLOW_TIME = 50000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Simple words — correct answer', () => {
  it('"cat" → "cat"', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('cat', FAST_TIME);

    expect(result.isCorrect).toBe(true);
    expect(perf(result)._global).toBeGreaterThan(0.9);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    expect(tags.length).toBeGreaterThan(0);

    for (const tag of tags) {
      expect(perf(result)[tag] as number).toBeCloseTo(perf(result)._global, 2);
    }
  });

  it('"sit" → "sit"', () => {
    const q = makeQuestion('sit');
    const result = q.evaluate('sit', FAST_TIME);

    expect(result.isCorrect).toBe(true);
    expect(perf(result)._global).toBeGreaterThan(0.9);
  });

  it('"dog" → "dog"', () => {
    const q = makeQuestion('dog');
    const result = q.evaluate('dog', FAST_TIME);

    expect(result.isCorrect).toBe(true);
  });
});

describe('Simple words — incorrect answer', () => {
  it('"cat" → "bat" — wrong initial consonant', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('bat', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    expect(tags.length).toBeGreaterThan(0);

    let foundZero = false;
    let foundNonZero = false;
    for (const tag of tags) {
      const score = perf(result)[tag];
      if (score === 0) foundZero = true;
      if (typeof score === 'number' && score > 0) foundNonZero = true;
    }
    expect(foundZero).toBe(true);
    expect(foundNonZero).toBe(true);
  });

  it('"cat" → "cot" — wrong vowel', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('cot', FAST_TIME);

    expect(result.isCorrect).toBe(false);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    let aTagScore: number | null = null;
    let cTagScore: number | null = null;
    for (const tag of tags) {
      if (tag.includes('a-AE')) aTagScore = perf(result)[tag] as number;
      if (tag.includes('c-K')) cTagScore = perf(result)[tag] as number;
    }
    if (aTagScore !== null) {
      expect(aTagScore).toBe(0);
    }
    if (cTagScore !== null) {
      expect(cTagScore).toBeGreaterThan(0);
    }
  });
});

describe('Digraphs', () => {
  it('"ship" → "ship" — correct', () => {
    const q = makeQuestion('ship');
    const result = q.evaluate('ship', FAST_TIME);

    expect(result.isCorrect).toBe(true);
    expect(perf(result)._global).toBeGreaterThan(0.9);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    expect(tags.some(t => t.includes('sh-SH'))).toBe(true);
  });

  it('"ship" → "thip" — wrong at digraph position', () => {
    const q = makeQuestion('ship');
    const result = q.evaluate('thip', FAST_TIME);

    expect(result.isCorrect).toBe(false);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    const shTag = tags.find(t => t.includes('sh-SH'));
    if (shTag) {
      expect(perf(result)[shTag]).toBe(0);
    }

    const iTag = tags.find(t => t.includes('i-IH'));
    if (iTag) {
      expect(perf(result)[iTag] as number).toBeGreaterThan(0);
    }
    const pTag = tags.find(t => t.includes('p-P'));
    if (pTag) {
      expect(perf(result)[pTag] as number).toBeGreaterThan(0);
    }
  });

  it('"ship" → "shap" — wrong at non-digraph position', () => {
    const q = makeQuestion('ship');
    const result = q.evaluate('shap', FAST_TIME);

    expect(result.isCorrect).toBe(false);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');

    const shTag = tags.find(t => t.includes('sh-SH'));
    if (shTag) {
      expect(perf(result)[shTag] as number).toBeGreaterThan(0);
    }

    const iTag = tags.find(t => t.includes('i-IH'));
    if (iTag) {
      expect(perf(result)[iTag]).toBe(0);
    }
  });
});

describe('Split digraphs', () => {
  it('"cake" → "cake" — correct', () => {
    const q = makeQuestion('cake');
    const result = q.evaluate('cake', FAST_TIME);

    expect(result.isCorrect).toBe(true);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    expect(tags.some(t => t.includes('a_e-EY'))).toBe(true);
  });

  it('"cake" → "ceke" — wrong at split position', () => {
    const q = makeQuestion('cake');
    const result = q.evaluate('ceke', FAST_TIME);

    expect(result.isCorrect).toBe(false);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');

    const aeTag = tags.find(t => t.includes('a_e-EY'));
    if (aeTag) {
      expect(perf(result)[aeTag]).toBe(0);
    }

    const cTag = tags.find(t => t.includes('c-K'));
    if (cTag) {
      expect(perf(result)[cTag] as number).toBeGreaterThan(0);
    }

    const kTag = tags.find(t => t.includes('k-K'));
    if (kTag) {
      expect(perf(result)[kTag] as number).toBeGreaterThan(0);
    }
  });

  it('"cake" → "cako" — wrong at silent-e position', () => {
    const q = makeQuestion('cake');
    const result = q.evaluate('cako', FAST_TIME);

    expect(result.isCorrect).toBe(false);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    const aeTag = tags.find(t => t.includes('a_e-EY'));
    if (aeTag) {
      expect(perf(result)[aeTag]).toBe(0);
    }
  });
});

describe('Wrong-length answers', () => {
  // Judged by alignment; the cases that pin the rules live in
  // spelling/gradeCases.ts. These check the scores evaluate() writes.
  it('"cat" → "ca" — too short: the missing t is a miss, c and a are hits', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('ca', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);
    expect(perf(result)['gpc:exercise:t-T']).toBe(0);
    expect(perf(result)['gpc:exercise:c-K'] as number).toBeGreaterThan(0);
    expect(perf(result)['gpc:exercise:a-AE'] as number).toBeGreaterThan(0);
  });

  it('"cat" → "cats" — too long, nothing to blame: _global only', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('cats', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    for (const tag of tags) {
      expect(perf(result)[tag]).toBe(null);
    }
  });

  it('"cat" → "" — empty', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);
  });
});

describe('Time scaling', () => {
  it('fast correct scores higher than slow correct', () => {
    const q1 = makeQuestion('cat');
    const fast = q1.evaluate('cat', FAST_TIME);

    const q2 = makeQuestion('cat');
    const slow = q2.evaluate('cat', SLOW_TIME);

    expect(perf(fast)._global).toBeGreaterThan(perf(slow)._global as number);
    expect(perf(fast)._global).toBeGreaterThan(0.9);
    expect(perf(slow)._global).toBeGreaterThan(0.5);
  });

  it('fast > mid > slow', () => {
    const fast = makeQuestion('cat').evaluate('cat', FAST_TIME);
    const mid = makeQuestion('cat').evaluate('cat', MID_TIME);
    const slow = makeQuestion('cat').evaluate('cat', SLOW_TIME);

    expect(perf(fast)._global).toBeGreaterThan(perf(mid)._global as number);
    expect(perf(mid)._global).toBeGreaterThan(perf(slow)._global as number);
  });

  it('incorrect always scores 0 regardless of time', () => {
    const fastWrong = makeQuestion('cat').evaluate('bat', FAST_TIME);
    expect(perf(fastWrong)._global).toBe(0);
  });
});

describe('Score ceiling — achievedLevel', () => {
  it('Level 3 (unaided) — near 1.0', () => {
    const r3 = makeQuestion('cat', { level: 3 }).evaluate('cat', FAST_TIME);
    expect(perf(r3)._global).toBeGreaterThan(0.9);
  });

  it('Level 2 (guided) — ceiling 0.70', () => {
    const r2 = makeQuestion('cat', { level: 2 }).evaluate('cat', FAST_TIME);
    expect(perf(r2)._global).toBeLessThan(0.71);
    expect(perf(r2)._global).toBeGreaterThan(0.5);
  });

  it('Level 1 (restricted) — ceiling 0.55', () => {
    const r1 = makeQuestion('cat', { level: 1 }).evaluate('cat', FAST_TIME);
    expect(perf(r1)._global).toBeLessThan(0.56);
    expect(perf(r1)._global).toBeGreaterThan(0.4);
  });

  it('Level 0 (copy) — ceiling 0.50', () => {
    const r0 = makeQuestion('cat', { level: 0 }).evaluate('cat', FAST_TIME);
    expect(perf(r0)._global).toBeLessThan(0.51);
    expect(perf(r0)._global).toBeGreaterThan(0.3);
  });
});

describe('Score ceiling — custom scoreCeiling (hint penalty)', () => {
  it('reduced ceiling from hints', () => {
    const q = makeQuestion('cat', { level: 3 });
    q.scoreCeiling = 0.8;
    const result = q.evaluate('cat', FAST_TIME);

    expect(perf(result)._global).toBeLessThan(0.81);
    expect(perf(result)._global).toBeGreaterThan(0.7);
  });

  it('scoreCeiling lower than level ceiling — scoreCeiling wins', () => {
    const q = makeQuestion('cat', { level: 2 });
    q.scoreCeiling = 0.5;
    const result = q.evaluate('cat', FAST_TIME);

    expect(perf(result)._global).toBeLessThan(0.51);
  });
});

describe('Per-GPC scores respect ceiling', () => {
  it('Level 2 correct — all tags ≤ 0.70', () => {
    const q = makeQuestion('cat', { level: 2 });
    const result = q.evaluate('cat', FAST_TIME);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    for (const tag of tags) {
      expect(perf(result)[tag] as number).toBeLessThan(0.71);
    }
  });

  it('Level 2 incorrect — correct chunks capped at ceiling', () => {
    const q = makeQuestion('cat', { level: 2 });
    const result = q.evaluate('cot', FAST_TIME);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    for (const tag of tags) {
      const score = perf(result)[tag];
      if (typeof score === 'number' && score > 0) {
        expect(score).toBeLessThan(0.71);
      }
    }
  });
});

describe('Time scaling varies with word length', () => {
  it('longer words have more generous time windows', () => {
    const shortResult = makeQuestion('cat').evaluate('cat', 10000);
    const longResult = makeQuestion('hand').evaluate('hand', 10000);

    expect(shortResult.isCorrect).toBe(true);
    expect(longResult.isCorrect).toBe(true);

    expect(perf(longResult)._global).toBeGreaterThan(0);
    expect(perf(shortResult)._global).toBeGreaterThan(0);
  });
});

describe('Edge cases', () => {
  it('case insensitive — "cat" → "CAT"', () => {
    const result = makeQuestion('cat').evaluate('CAT', FAST_TIME);
    expect(result.isCorrect).toBe(true);
  });

  it('mixed case — "cat" → "CaT"', () => {
    const result = makeQuestion('cat').evaluate('CaT', FAST_TIME);
    expect(result.isCorrect).toBe(true);
  });

  it('surrounding whitespace is ignored, as in isCorrect', () => {
    const result = makeQuestion('cat').evaluate(' cat ', FAST_TIME);
    expect(result.isCorrect).toBe(true);
  });

  it('phonetics present for test words', () => {
    const q = makeQuestion('cat');
    expect(q.phonetics).not.toBeNull();
    expect(q.chunks.length).toBeGreaterThan(0);

    expect(makeQuestion('ship').phonetics).not.toBeNull();
    expect(makeQuestion('cake').phonetics).not.toBeNull();
  });
});

describe('Fully wrong answer — all GPCs score 0', () => {
  it('"cat" → "dog"', () => {
    const q = makeQuestion('cat');
    const result = q.evaluate('dog', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);

    const tags = Object.keys(perf(result)).filter(k => k !== '_global');
    for (const tag of tags) {
      expect(perf(result)[tag]).toBe(0);
    }
  });
});

describe('Sight words — the tricky part credits the sight word', () => {
  it('"said" → "said": fair letters credit their GPCs, ai credits GPC-WORD-said', () => {
    const q = makeQuestion('said');
    const p = perf(q.evaluate('said', FAST_TIME));

    expect(p['gpc:exercise:s-S']).toBeCloseTo(p._global, 5);
    expect(p['gpc:exercise:d-D']).toBeCloseTo(p._global, 5);
    expect(p['gpc:exercise:WORD-said']).toBeCloseTo(p._global, 5);
    // The ai is the sight word's weird part, not the vowel team.
    expect(p['gpc:exercise:ai-EH']).toBeUndefined();
  });

  it('"said" → "siad": the tricky part fails, the fair letters pass', () => {
    const q = makeQuestion('said');
    const p = perf(q.evaluate('siad', FAST_TIME));

    expect(p._global).toBe(0);
    expect(p['gpc:exercise:WORD-said']).toBe(0);
    expect(p['gpc:exercise:s-S'] as number).toBeGreaterThan(0);
    expect(p['gpc:exercise:d-D'] as number).toBeGreaterThan(0);
  });

  it('"have" → "have": no chunk carries the sight word, so the whole answer credits it', () => {
    const q = makeQuestion('have');
    const p = perf(q.evaluate('have', FAST_TIME));

    expect(p['gpc:exercise:a-AE']).toBeCloseTo(p._global, 5);
    expect(p['gpc:exercise:WORD-have']).toBeCloseTo(p._global, 5);
  });

  it('"have" → "havi": the silent e is wrong → the sight word scores 0', () => {
    const q = makeQuestion('have');
    const p = perf(q.evaluate('havi', FAST_TIME));

    expect(p._global).toBe(0);
    expect(p['gpc:exercise:WORD-have']).toBe(0);
  });
});

describe('Phonetic misspellings — correct for SRS, wrong for ELO (curriculum-log C8)', () => {
  it('"next" → "necst": isCorrect, _global 0, only x-K_S missed', () => {
    const q = makeQuestion('next');
    const result = q.evaluate('necst', FAST_TIME);
    const p = perf(result);

    expect(result.isCorrect).toBe(true);
    expect(p._global).toBe(0);
    expect(p['gpc:exercise:x-K_S']).toBe(0);
    expect(p['gpc:exercise:n-N'] as number).toBeGreaterThan(0);
    expect(p['gpc:exercise:e-EH'] as number).toBeGreaterThan(0);
    expect(p['gpc:exercise:t-T'] as number).toBeGreaterThan(0);
  });

  it('"just" → "gust": letter-name g is forgiven like a phonetic spelling', () => {
    const q = makeQuestion('just');
    const result = q.evaluate('gust', FAST_TIME);
    const p = perf(result);

    expect(result.isCorrect).toBe(true);
    expect(p._global).toBe(0);
    expect(p['gpc:exercise:j-JH']).toBe(0);
    expect(p['gpc:exercise:u-AH'] as number).toBeGreaterThan(0);
  });

  it('"just" → "gost": a letter-name g with a wrong vowel is just wrong', () => {
    const q = makeQuestion('just');
    expect(q.evaluate('gost', FAST_TIME).isCorrect).toBe(false);
  });

  it('"phone" → "fone": isCorrect, ph-F missed, the vowel credited', () => {
    const q = makeQuestion('phone');
    const result = q.evaluate('fone', FAST_TIME);
    const p = perf(result);

    expect(result.isCorrect).toBe(true);
    expect(p._global).toBe(0);
    expect(p['gpc:exercise:ph-F']).toBe(0);
    expect(p['gpc:exercise:o_e-OW'] as number).toBeGreaterThan(0);
  });

  it('"phone" → "fon": the vowel is wrong too, so it is just wrong', () => {
    const q = makeQuestion('phone');
    const result = q.evaluate('fon', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)._global).toBe(0);
  });

  it('"ship" → "shipe": a stray silent e is not phonetic', () => {
    const q = makeQuestion('ship');
    expect(q.evaluate('shipe', FAST_TIME).isCorrect).toBe(false);
  });

  it('"was" → "wuz": sight words never count as phonetic', () => {
    const q = makeQuestion('was');
    const result = q.evaluate('wuz', FAST_TIME);

    expect(result.isCorrect).toBe(false);
    expect(perf(result)['gpc:exercise:WORD-was']).toBe(0);
  });
});
