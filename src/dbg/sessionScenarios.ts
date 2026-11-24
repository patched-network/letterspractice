/**
 * Mock sessions for /dbg/session-summary and /dbg/session-end.
 *
 * Spelling cards are run through the real SpellingQuestion.evaluate, so their
 * per-GPC performance (what the summary stars) is what the grader would
 * record for those answers. Other card types are hand-built in the shape
 * their evaluate() returns: who-said-that scores the target (and a picked
 * distractor), missing letters scores each blanked chunk, word selection
 * records `_global` only.
 */
import type { TaggedPerformance } from '@vue-skuilder/common';
import type { SessionRecordEntry } from '../composables/useSessionSummary';
import { SpellingQuestion } from '../questions/SpellingQuestion';
import { gradeSpelling } from '../questions/spelling/grade';

export interface SessionScenario {
  label: string;
  records: SessionRecordEntry[];
}

type Response = { isCorrect: boolean; performance: TaggedPerformance; userAnswer: string };

const ex = (id: string) => `gpc:exercise:${id}`;
const card = (card_id: string, tags: string[], records: Response[] = []): SessionRecordEntry => ({
  card: { course_id: 'lp', card_id, card_elo: 1000, tags },
  records,
});

const intro = (id: string) => card(`c-intro-${id}`, [`gpc:intro:${id}`]);

/** A spelling card answered in turn by `answers` (the grader's own tags and scores). */
function spell(word: string, ...answers: string[]): SessionRecordEntry {
  const q = new SpellingQuestion([{ word } as never]);
  const tags = gradeSpelling(word, q.phonetics, word)
    .chunks.map((c) => c.tag)
    .filter((t): t is string => !!t);
  const records = answers.map((a) => ({ ...q.evaluate(a, 3000), userAnswer: a }) as Response);
  return card(`c-spelling-${word}`, [...new Set(tags)], records);
}

/** Who said that: `picks` are letters chosen; `distractors` maps a wrong pick to its GPC. */
function wst(id: string, picks: string[], distractors: Record<string, string> = {}): SessionRecordEntry {
  const target = id.split('-')[0];
  const records = picks.map((pick) => {
    const ok = pick === target;
    const performance: TaggedPerformance = { _global: ok ? 1 : 0, [ex(id)]: ok ? 1 : 0 };
    if (!ok && distractors[pick]) performance[ex(distractors[pick])] = 0;
    return { isCorrect: ok, performance, userAnswer: pick };
  });
  return card(`c-wst-${id}`, [ex(id)], records);
}

/** Word selection: right or wrong, `_global` only. */
function ws(word: string, ids: string[], ...correct: boolean[]): SessionRecordEntry {
  const records = correct.map((ok) => ({ isCorrect: ok, performance: { _global: ok ? 1 : 0 }, userAnswer: ok ? word : '?' }));
  return card(`c-ws-${word}-abc1`, ids.map(ex), records);
}

/** Missing letters: `missed` are the blanked GPCs got wrong on the first try (then right). */
function ml(word: string, blanked: string[], missed: string[] = []): SessionRecordEntry {
  const wrong: Response = {
    isCorrect: false,
    performance: { _global: 0, ...Object.fromEntries(blanked.map((id) => [ex(id), missed.includes(id) ? 0 : 0.9])) },
    userAnswer: '?',
  };
  const right: Response = {
    isCorrect: true,
    performance: { _global: 1, ...Object.fromEntries(blanked.map((id) => [ex(id), 1])) },
    userAnswer: word,
  };
  return card(`c-ml-${word}-1`, blanked.map(ex), missed.length ? [wrong, right] : [right]);
}

export const sessionScenarios: SessionScenario[] = [
  {
    label: 'Full session',
    records: [
      intro('sh-SH'),
      intro('a_e-EY'),
      spell('sat', 'sat'),
      wst('s-S', ['s']),
      ws('sit', ['s-S', 'i-IH', 't-T'], true),
      spell('tap', 'tap'),
      wst('a-AE', ['a']),
      ws('cat', ['a-AE', 's-S'], true),
      ml('pan', ['a-AE', 'p-P']),
      ws('pat', ['p-P'], true),
      // A real miss: only sh is charged, not i or p.
      spell('ship', 'sip', 'ship'),
    ],
  },
  {
    label: 'First session',
    records: [intro('s-S'), wst('s-S', ['s']), spell('sat', 'sat')],
  },
  {
    label: 'Review only',
    records: [
      spell('sat', 'sat'),
      wst('s-S', ['s']),
      ws('sip', ['s-S', 'i-IH'], true),
      ml('sat', ['s-S', 'a-AE']),
      wst('a-AE', ['a']),
      ml('pan', ['a-AE', 'p-P']),
      spell('tap', 'tap'),
      wst('t-T', ['t']),
      ws('tip', ['t-T'], true),
    ],
  },
  {
    label: 'Trouble heavy',
    records: [
      spell('this', 'tis', 'thes', 'this'),
      wst('th-TH', ['f', 'th'], { f: 'f-F' }),
      spell('that', 'that'),
      ws('them', ['th-TH'], false, true),
      spell('chip', 'sip', 'chip'),
      wst('ch-CH', ['sh', 'sh', 'ch'], { sh: 'sh-SH' }),
      spell('chat', 'chat'),
      ml('chin', ['ch-CH', 'i-IH'], ['i-IH']),
    ],
  },
  {
    // Each kind of wrong answer the grader tells apart.
    label: 'Grader cases',
    records: [
      spell('fix', 'fis', 'fix'), // x left out: x only
      spell('fix', 'fics'), // reads back (cs>x): correct, no star
      spell('just', 'gust'), // letter name (g>j): correct, no star
      spell('cat', 'cats', 'cat'), // nothing to blame: no star
      spell('phone', 'fon', 'phone'), // not phonetic: ph and o_e
      ws('sip', ['s-S', 'i-IH'], false, true), // no per-GPC scores: whole card
    ],
  },
  {
    // Zero cards drawn. Became a genuinely reachable state when IntroGateFilter
    // started hard-zeroing withheld intros: a free-tier account at the word
    // ceiling that has also cleared its review queue has nothing due. Toggle
    // the word count above/below the threshold to see both messages.
    label: 'Nothing due (empty)',
    records: [],
  },
];
