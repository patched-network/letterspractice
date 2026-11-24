import { describe, expect, it, vi } from 'vitest';
import type { LearnerDataset, LearnerDump } from '@vue-skuilder/db/diagnostics';

// The study-session composable pulls in the whole common-ui; only the curve is needed.
vi.mock('@/composables/useStudySession', () => ({
  batchLimitForSessionCount: (n: number) => (n <= 2 ? 6 : n <= 5 ? 8 : 12),
}));
vi.mock('./lessons', () => ({
  getPostLessonHints: (id: string) => ({ boostTags: { [`concept:${id}`]: 2 } }),
}));

import {
  compareRuns,
  createReadonlyLearnerDB,
  eloDistanceOf,
  sessionRunupFor,
  withTagAwareElo,
} from './adminPipelineRun';

const COURSE = 'course1';
const past = new Date(Date.now() - 3_600_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

const dump = {
  username: 'kid',
  fetchedAt: new Date().toISOString(),
  docs: [
    { _id: 'CONFIG', sessionTracking: { 'letterspractice-basic': { studySessionCount: 4 } } },
    { _id: `card_review_a`, cardId: 'c-due', courseId: COURSE, reviewTime: past },
    { _id: `card_review_b`, cardId: 'c-later', courseId: COURSE, reviewTime: future },
    { _id: `STRATEGY_STATE::${COURSE}::LetterProgression`, data: { unlockedLetters: ['a'] } },
  ],
} as unknown as LearnerDump;

const dataset = {
  username: 'kid',
  courseId: COURSE,
  sessions: [],
  cardHistories: [{ cardID: 'c-seen' }],
  scheduled: [],
  registration: { courses: [{ courseID: COURSE, elo: 1100 }], studyWeight: {} },
  strategyState: { LessonProgress: { postLessonPracticeFlag: 'digraphs' } },
} as unknown as LearnerDataset;

describe('createReadonlyLearnerDB', () => {
  it('serves reads from the dump', async () => {
    const { user } = createReadonlyLearnerDB(dump, dataset);
    expect(user.getUsername()).toBe('kid');
    expect(await user.getSeenCards(COURSE)).toEqual(['c-seen']);
    expect((await user.getPendingReviews(COURSE)).map((r) => r.cardId)).toEqual(['c-due']);
    expect((await user.getActiveCards()).map((c) => c.cardID)).toEqual(['c-due', 'c-later']);
    expect((await user.getCourseRegDoc(COURSE)).elo).toBe(1100);
    expect(await user.getStrategyState(COURSE, 'LetterProgression')).toEqual({ unlockedLetters: ['a'] });
    expect(await user.getStrategyState(COURSE, 'Nope')).toBeNull();
  });

  it('records writes instead of applying them', async () => {
    const { user, writes } = createReadonlyLearnerDB(dump, dataset);
    await user.putStrategyState(COURSE, 'IntakeClock', { t: 1 });
    await user.removeScheduledCardReview('card_review_x');
    expect(writes).toEqual([
      { method: 'putStrategyState', detail: 'IntakeClock' },
      { method: 'removeScheduledCardReview', detail: 'card_review_x' },
    ]);
    expect(await user.getStrategyState(COURSE, 'IntakeClock')).toBeNull();
  });

  it('fails loudly on anything else, and is not a thenable', async () => {
    const { user } = createReadonlyLearnerDB(dump, dataset);
    expect(() => user.logout()).toThrow(/read-only/);
    expect(await Promise.resolve(user)).toBe(user);
  });
});

describe('sessionRunupFor', () => {
  it('mirrors the practice route: batch curve from session count, post-lesson hints', () => {
    expect(sessionRunupFor(dump, dataset)).toEqual({
      sessionCount: 4,
      batchLimit: 8,
      postLessonFlag: 'digraphs',
      hints: { boostTags: { 'concept:digraphs': 2 } },
    });
  });
});

describe('withTagAwareElo', () => {
  it('adds a tag-aware default when the course declares no eloDistance doc', () => {
    const out = withTagAwareElo([{ implementingClass: 'elo' } as never], COURSE);
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[1].serializedData)).toEqual({ tagAware: true });
  });

  it('keeps a declared config and turns tagAware on', () => {
    const out = withTagAwareElo(
      [{ implementingClass: 'eloDistance', serializedData: '{"halfLife":250}' } as never],
      COURSE,
    );
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0].serializedData)).toEqual({ halfLife: 250, tagAware: true });
  });
});

describe('eloDistanceOf', () => {
  const entry = (reason: string) => [{ strategy: 'eloDistance', reason } as never];

  it('parses a global reading', () => {
    expect(eloDistanceOf(entry('ELO distance 212 (card: 1312, user: 1100) → 0.61x'))).toMatchObject({
      multiplier: 0.61,
      distance: 212,
      sharedTags: 0,
    });
  });

  it('parses a tag-aware reading', () => {
    const r = eloDistanceOf(
      entry(
        'ELO distance 90 (card: 1312, user: 1100), tag-aware on 3 shared tag(s) [gpc:exercise:sh-SH +120, x -40, y +3] (global +212) → 0.91x',
      ),
    );
    expect(r).toMatchObject({ multiplier: 0.91, distance: 90, sharedTags: 3, globalGap: 212 });
  });

  it('is null without an eloDistance entry', () => {
    expect(eloDistanceOf([])).toBeNull();
  });
});

describe('compareRuns', () => {
  const card = (cardId: string, finalScore: number, selected: boolean, mult: number) => ({
    cardId,
    finalScore,
    selected,
    provenance: [{ strategy: 'eloDistance', reason: `ELO distance 1 (card: 1, user: 1) → ${mult}x` }],
  });
  const report = (cards: ReturnType<typeof card>[]) => ({ cards }) as never;

  it('ranks by score, splits the selection, and orders movers by multiplier change', () => {
    const a = report([card('x', 0.5, true, 0.5), card('y', 0.9, true, 0.9), card('z', 0.2, false, 0.2)]);
    const b = report([card('x', 0.4, true, 0.4), card('z', 0.8, true, 0.8), card('w', 0.1, false, 0.1)]);
    const cmp = compareRuns(a, b);

    expect(cmp.cards.get('y')).toMatchObject({ rankA: 1, selectedA: true, selectedB: false });
    expect(cmp.cards.get('y')!.rankB).toBeUndefined();
    expect(cmp.cards.get('z')).toMatchObject({ rankA: 3, rankB: 1, multA: 0.2, multB: 0.8 });
    expect(cmp.kept).toEqual(['x']);
    expect(cmp.entered).toEqual(['z']);
    expect(cmp.left).toEqual(['y']);
    expect(cmp.overlap).toBeCloseTo(1 / 3);
    expect(cmp.movers).toEqual(['z', 'x']);
  });

  it('diffs filter impact, counting cards whose action changed', () => {
    const withActions = (cardId: string, gateAction: string) => ({
      cardId,
      finalScore: 1,
      selected: true,
      provenance: [
        { strategy: 'eloDistance', strategyName: 'ELO', action: 'penalized', reason: '→ 0.5x' },
        { strategy: 'gate', strategyName: 'Gate', action: gateAction },
      ],
    });
    const impact = (name: string, penalized: number) => ({ name, boosted: 0, penalized, passed: 0, removed: 0 });
    const a = { cards: [withActions('x', 'passed'), withActions('y', 'passed')], filters: [impact('ELO', 5), impact('Gate', 0)] };
    const b = { cards: [withActions('x', 'penalized'), withActions('y', 'passed')], filters: [impact('ELO', 7), impact('Gate', 1)] };
    const f = compareRuns(a as never, b as never).filters;
    expect(f.map((d) => [d.name, d.a?.penalized, d.b?.penalized, d.changedActions])).toEqual([
      ['ELO', 5, 7, 0],
      ['Gate', 0, 1, 1],
    ]);
  });

  it('rolls up selection and multipliers per included tag, biggest selection shift first', () => {
    const t = (cardId: string, selected: boolean, mult: number, tags: string[]) => ({
      ...card(cardId, mult, selected, mult),
      tags,
    });
    const a = report([t('x', true, 0.5, ['s:a', 'ui:x']), t('y', true, 0.6, ['s:b'])] as never);
    const b = report([t('x', true, 0.7, ['s:a', 'ui:x']), t('y', false, 0.2, ['s:b'])] as never);
    const tags = compareRuns(a, b, (tag) => tag.startsWith('s:')).tags;
    expect(tags.map((r) => r.tag)).toEqual(['s:b', 's:a']);
    expect(tags[0]).toMatchObject({ shared: 1, selectedA: 1, selectedB: 0, meanMultA: 0.6, meanMultB: 0.2 });
    expect(tags[1]).toMatchObject({ selectedA: 1, selectedB: 1, meanMultA: 0.5, meanMultB: 0.7 });
  });

  it('treats two empty selections as identical', () => {
    expect(compareRuns(null, null).overlap).toBe(1);
  });
});
