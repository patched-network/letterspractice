import { describe, expect, it } from 'vitest';
import { DEFERRED_LESSON_CATALOG, LESSON_CATALOG, lessonNumber } from './lessons';
import { lessonShortPaths, resolveLessonShortKey } from './lessonShortLinks';

describe('resolveLessonShortKey', () => {
  it('resolves every active lesson by id and by display number', () => {
    for (const { id } of LESSON_CATALOG) {
      expect(resolveLessonShortKey(id)).toBe(id);
      expect(resolveLessonShortKey(lessonNumber(id)!)).toBe(id);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveLessonShortKey('BED')).toBe('bed');
    expect(resolveLessonShortKey('1A')).toBe('bed');
    expect(resolveLessonShortKey(' bed ')).toBe('bed');
  });

  it('rejects unknown keys, empty keys and deferred lessons', () => {
    expect(resolveLessonShortKey('nope')).toBeNull();
    expect(resolveLessonShortKey('')).toBeNull();
    expect(resolveLessonShortKey('99')).toBeNull();
    for (const { id } of DEFERRED_LESSON_CATALOG) {
      expect(resolveLessonShortKey(id)).toBeNull();
    }
  });

  it('no lesson id looks like a display number (keys stay unambiguous)', () => {
    const numbers = new Set(LESSON_CATALOG.map((l) => lessonNumber(l.id)));
    expect(LESSON_CATALOG.filter((l) => numbers.has(l.id))).toEqual([]);
  });

  // Number links get posted publicly and can't be recalled. If this fails,
  // the catalog was renumbered and existing /c/l/<number> links now open a
  // different lesson. Decide whether that's acceptable before updating it.
  it('number links still open the lessons they opened when posted', () => {
    const numberToId = Object.fromEntries(LESSON_CATALOG.map((l) => [lessonNumber(l.id), l.id]));
    expect(numberToId).toEqual({
      '1': 'hello-world',
      '1a': 'bed',
      '2': 'digraphs',
      '3': 'split-digraphs',
      '4': 'final-open-vowels',
      '5': 'sight-words',
    });
  });
});

describe('lessonShortPaths', () => {
  it('lists the id path and the number path, each resolving back to the lesson', () => {
    for (const { id } of LESSON_CATALOG) {
      const paths = lessonShortPaths(id);
      expect(paths).toEqual([`/c/l/${id}`, `/c/l/${lessonNumber(id)}`]);
      for (const p of paths) expect(resolveLessonShortKey(p.slice('/c/l/'.length))).toBe(id);
    }
  });
});
