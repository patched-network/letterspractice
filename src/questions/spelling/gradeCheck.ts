/**
 * Checks a regression-table row against the current grader. Shared by
 * grade.test.ts and /dbg/grader so both report the same pass/fail.
 */

import { getPhonetics } from '@/services/phonetics';
import { parseGpcTag } from '@/services/tags';
import { gradeSpelling, type SpellingGrade, type Verdict } from './grade';
import type { GradeCase } from './gradeCases';

export interface CaseCheck {
  grade: SpellingGrade;
  /** What the grader said, in the row's terms: 'unjudged' or short-id verdicts. */
  actual: 'unjudged' | Record<string, Verdict>;
  /** Empty when the row passes. */
  failures: string[];
}

export function checkCase(c: GradeCase): CaseCheck {
  const grade = gradeSpelling(c.word, getPhonetics(c.word), c.answer);
  const actual: CaseCheck['actual'] = grade.unjudged
    ? 'unjudged'
    : Object.fromEntries(Object.entries(grade.verdicts).map(([tag, v]) => [parseGpcTag(tag)?.gpcShortId ?? tag, v]));

  const failures: string[] = [];
  if (c.expect === 'unjudged') {
    if (actual !== 'unjudged') failures.push('expected unjudged, got a judgement');
  } else if (actual === 'unjudged') {
    failures.push(`expected a judgement, got unjudged (${grade.unjudged})`);
  } else {
    for (const [gpc, want] of Object.entries(c.expect)) {
      const got = actual[gpc];
      if (got !== want) failures.push(`${gpc}: expected ${want}, got ${got ?? 'nothing'}`);
    }
  }
  if (c.phonetic !== undefined) {
    const got = grade.phonetic?.replacements ?? false;
    if (JSON.stringify(got) !== JSON.stringify(c.phonetic)) {
      failures.push(`phonetic: expected ${JSON.stringify(c.phonetic)}, got ${JSON.stringify(got)}`);
    }
  }
  return { grade, actual, failures };
}

/** A row as TS source, for pasting into GRADE_CASES. */
export function caseSource(c: GradeCase): string {
  const expect =
    c.expect === 'unjudged'
      ? `'unjudged'`
      : `{ ${Object.entries(c.expect)
          .map(([gpc, v]) => `'${gpc}': '${v}'`)
          .join(', ')} }`;
  const lines = [
    `  {`,
    `    word: '${c.word}',`,
    `    answer: '${c.answer}',`,
    `    expect: ${expect},`,
    ...(c.phonetic === undefined
      ? []
      : [`    phonetic: ${c.phonetic ? `[${c.phonetic.map((r) => `'${r}'`).join(', ')}]` : 'false'},`]),
    `    source: '${c.source}',`,
  ];
  if (c.note) lines.push(`    note: '${c.note.replace(/'/g, "\\'")}',`);
  lines.push(`  },`);
  return lines.join('\n');
}
