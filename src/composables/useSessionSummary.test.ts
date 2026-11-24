import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { missedShortIds, useSessionSummary, type SessionRecordEntry } from './useSessionSummary';
import { SpellingQuestion } from '../questions/SpellingQuestion';

const FIX = ['f-F', 'i-IH', 'x-K_S'];

describe('missedShortIds', () => {
  it('charges only the GPCs scored 0', () => {
    const perf = { _global: 0, 'gpc:exercise:f-F': 0.9, 'gpc:exercise:i-IH': 0.9, 'gpc:exercise:x-K_S': 0 };
    expect(missedShortIds('spelling', FIX, perf)).toEqual(['x-K_S']);
  });

  it('ignores graded GPCs the card is not tagged with (a who-said-that distractor)', () => {
    const perf = { _global: 0, 'gpc:exercise:f-F': 0, 'gpc:exercise:m-M': 0 };
    expect(missedShortIds('wst', ['f-F'], perf)).toEqual(['f-F']);
  });

  it('falls back to every GPC on the card when none were graded', () => {
    expect(missedShortIds('ws', FIX, { _global: 0 })).toEqual(FIX);
    expect(missedShortIds('ws', FIX, 0)).toEqual(FIX);
  });

  it('charges nothing for an unjudged spelling', () => {
    expect(missedShortIds('spelling', FIX, { _global: 0 })).toEqual([]);
  });
});

describe('useSessionSummary trouble spots', () => {
  it('"fis" for "fix" marks x only', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = new SpellingQuestion([{ word: 'fix' } as any]);
    const wrong = q.evaluate('fis', 1000);
    const right = q.evaluate('fix', 1000);
    expect(wrong.isCorrect).toBe(false);

    const records: SessionRecordEntry[] = [
      {
        card: {
          course_id: 'c',
          card_id: 'c-spelling-fix',
          card_elo: 1000,
          tags: FIX.map((id) => `gpc:exercise:${id}`),
        },
        records: [{ ...wrong, userAnswer: 'fis' }, { ...right, userAnswer: 'fix' }],
      },
    ];
    const { summary } = useSessionSummary(ref(records));
    expect(summary.value.troubleSpots.map((t) => t.gpcShortId)).toEqual(['x-K_S']);
    expect(summary.value.troubleSpots[0]).toMatchObject({ failCount: 1, totalAttempts: 2 });
    expect(summary.value.troubleSpots[0].misses).toEqual([{ kind: 'spelled', word: 'fix', answer: 'fis' }]);
  });

  it('who-said-that records the pick; word select records none', () => {
    const wrong = { isCorrect: false, performance: { _global: 0, 'gpc:exercise:ch-CH': 0, 'gpc:exercise:sh-SH': 0 }, userAnswer: 'sh' };
    const records: SessionRecordEntry[] = [
      { card: { course_id: 'c', card_id: 'c-wst-ch-CH', card_elo: 1000, tags: ['gpc:exercise:ch-CH'] }, records: [wrong] },
      {
        card: { course_id: 'c', card_id: 'c-ws-sip-abc1', card_elo: 1000, tags: ['gpc:exercise:s-S'] },
        records: [{ isCorrect: false, performance: { _global: 0 }, userAnswer: 'sap' }],
      },
    ];
    const { summary } = useSessionSummary(ref(records));
    const byId = new Map(summary.value.troubleSpots.map((t) => [t.gpcShortId, t]));
    expect(byId.get('ch-CH')?.misses).toEqual([{ kind: 'picked', target: 'ch', answer: 'sh' }]);
    expect(byId.get('s-S')?.misses).toEqual([]);
  });
});
