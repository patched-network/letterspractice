/**
 * The spelling grader against its regression table (gradeCases.ts).
 * Add rows there, not tests here.
 */

import { describe, it, expect } from 'vitest';
import { GRADE_CASES } from './gradeCases';
import { checkCase } from './gradeCheck';

describe('spelling grader regression table', () => {
  it.each(GRADE_CASES.map((c) => [`${c.word} ← "${c.answer}"`, c] as const))('%s', (_, c) => {
    expect(checkCase(c).failures).toEqual([]);
  });
});
