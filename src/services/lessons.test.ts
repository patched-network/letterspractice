import { describe, expect, it } from 'vitest';
import type { LessonProgressState } from './lessons.types';
import {
  LESSON_CATALOG,
  getLessonById,
  getNextLesson,
  lessonMasteryConditionsMet,
  lessonNumber,
  lessonPaletteIndex,
  breadthProgress,
  letterSoundSecurity,
  masteryGating,
} from './lessons';
import { GPC_CATALOGUE, exerciseTagsForLesson } from './curriculum';

/** Progress with these lessons completed, `sessions` practice sessions since the last. */
const progress = (completed: string[], sessions = 10): LessonProgressState => ({
  completedLessons: completed,
  dismissedLessons: [],
  currentLesson: null,
  skippedCount: 0,
  lastSkippedAt: null,
  postLessonPracticeFlag: null,
  sessionsSinceLastLesson: sessions,
  updatedAt: '2026-11-02T00:00:00Z',
});

const elo = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).map(([tag, count]) => [tag, { score: 1000, count }]));

/** Enough d practice and exposure, and e introduced: the bed lesson's gate. */
const BED_READY = { 'gpc:exercise:d-D': 3, 'gpc:expose:d-D': 6, 'gpc:intro:e-EH': 1 };

describe('lesson numbers and colours', () => {
  it('numbers top-level lessons in order and a sub-lesson after its parent', () => {
    expect(lessonNumber('hello-world')).toBe('1');
    expect(lessonNumber('bed')).toBe('1a');
    expect(lessonNumber('digraphs')).toBe('2');
    expect(lessonNumber('sight-words')).toBe(String(LESSON_CATALOG.filter((l) => !l.subOf).length));
    expect(lessonNumber('no-such-lesson')).toBeNull();
  });

  it('gives a sub-lesson its parent colour slot, leaving the rest where they were', () => {
    expect(lessonPaletteIndex('bed')).toBe(lessonPaletteIndex('hello-world'));
    expect(lessonPaletteIndex('digraphs')).toBe(1);
    expect(lessonPaletteIndex('no-such-lesson')).toBe(-1);
  });
});

describe('the bed lesson', () => {
  const bed = getLessonById('bed')!;

  it('opens once d has some use and exposure and e is introduced', () => {
    const met = (counts: Record<string, number>) =>
      lessonMasteryConditionsMet(bed.availabilityConditions, { tagElo: elo(counts) });
    expect(met(BED_READY)).toBe(true);
    expect(met({ ...BED_READY, 'gpc:intro:e-EH': 0 })).toBe(false);
    expect(met({ ...BED_READY, 'gpc:exercise:d-D': 2 })).toBe(false);
    expect(met({ ...BED_READY, 'gpc:expose:d-D': 5 })).toBe(false);
  });

  it('is withheld when tag ELO is missing (fail-closed), unlike other lessons', () => {
    expect(lessonMasteryConditionsMet(bed.availabilityConditions, {})).toBe(false);
    expect(lessonMasteryConditionsMet(bed.availabilityConditions, { tagElo: {} })).toBe(false);
    // A fail-open lesson skips its mastery prereqs without data
    const splitDigraphs = getLessonById('split-digraphs')!;
    expect(lessonMasteryConditionsMet(splitDigraphs.availabilityConditions, {})).toBe(true);
  });

  it('is offered ahead of digraphs when both are ready (catalog order)', () => {
    const next = getNextLesson({
      progress: progress(['hello-world']),
      tagElo: elo({ ...BED_READY, 'concept:match:simple': 50, 'concept:vowel:short': 50 }),
      unlockedLetterCount: 13,
      unlockedGraphemes: [],
    });
    expect(next?.id).toBe('bed');
  });

  it('is not offered without tag ELO, so digraphs can go first', () => {
    const next = getNextLesson({ progress: progress(['hello-world']), unlockedLetterCount: 13 });
    expect(next?.id).toBe('digraphs');
  });
});

describe('mastery gating', () => {
  /** `n` first attempts, all right (or all wrong), over two days. */
  const rank = (n: number, right = true) => ({
    score: 1500,
    count: n,
    recent: Array.from({ length: n }, (_, i) => ({
      at: `2026-11-0${1 + (i % 2)}T12:00:00.000Z`,
      ok: right,
      tagOk: right,
      perf: right ? 0.8 : 0,
      card: `c${i}`,
    })),
  });
  const helloWorld = exerciseTagsForLesson('hello-world', GPC_CATALOGUE);
  /** The first `n` Hello World sounds met and secure, plus `shaky` more met and shaky. */
  const learner = (n: number, shaky = 0) =>
    Object.fromEntries([
      ...helloWorld.slice(0, n).map((t) => [t, rank(6)]),
      ...helloWorld.slice(n, n + shaky).map((t) => [t, rank(6, false)]),
    ]);
  const digraphs = getLessonById('digraphs')!;
  const needed = breadthProgress(digraphs.availabilityConditions!.mastery!.breadth[0], {}).needed;

  const withGating = (fn: () => void) => {
    masteryGating.enabled = true;
    try {
      fn();
    } finally {
      masteryGating.enabled = false;
    }
  };

  it('off by default: the mastery block changes nothing', () => {
    expect(masteryGating.enabled).toBe(false);
    expect(lessonMasteryConditionsMet(digraphs.availabilityConditions, { unlockedLetterCount: 13 })).toBe(true);
  });

  it('on: digraphs needs breadth, and fails closed without ratings', () =>
    withGating(() => {
      const c = digraphs.availabilityConditions;
      expect(lessonMasteryConditionsMet(c, { unlockedLetterCount: 26 })).toBe(false);
      expect(lessonMasteryConditionsMet(c, { tagElo: learner(needed - 1) })).toBe(false);
      expect(lessonMasteryConditionsMet(c, { tagElo: learner(needed) })).toBe(true);
    }));

  it('on: too many insecure letter-sounds hold the lesson, however broad', () =>
    withGating(() => {
      const c = digraphs.availabilityConditions;
      const cap = c!.mastery!.maxInsecure;
      expect(lessonMasteryConditionsMet(c, { tagElo: learner(needed, cap) })).toBe(true);
      expect(lessonMasteryConditionsMet(c, { tagElo: learner(needed, cap + 1) })).toBe(false);
    }));

  it('tags the catalogue no longer defines are not debt', () => {
    // Alice, 2026-11: bare split-digraph vowels left by retagged WhoSaidThat cards.
    const stale = Object.fromEntries(
      ['a-EY', 'i-AY', 'o-OW', 'u-UW', 'e-IY'].map((g) => [`gpc:exercise:${g}`, { score: 1320, count: 4 }]),
    );
    const sec = letterSoundSecurity({ ...learner(needed), ...stale });
    expect(sec.unproven).toBe(0);
    expect(sec.tags.map((t) => t.tag)).not.toContain('gpc:exercise:a-EY');
    // Live tags with no buffer still count as unproven.
    expect(letterSoundSecurity({ [helloWorld[0]]: { score: 1320, count: 4 } }).unproven).toBe(1);
  });

  it('on: the mastery spacer replaces the older one', () =>
    withGating(() => {
      const ctx = { tagElo: learner(needed), progress: progress(['hello-world', 'bed'], 2) };
      expect(getNextLesson(ctx)?.id).toBe('digraphs');
    }));
});
