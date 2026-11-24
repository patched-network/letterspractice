/**
 * Spelling grader regression table.
 *
 * Each row is a word, a typed answer, and the judgement the grader must make.
 * Rows only check the GPCs they name, so a row stays valid when a word's other
 * chunks change. Add a row whenever a new class of answer is judged badly
 * (/dbg/grader's "copy as case" writes one), then fix the grader; the old rows
 * guard the old fixes.
 *
 * Run by grade.test.ts; shown, pass/fail, at /dbg/grader.
 */

import type { Verdict } from './grade';

export interface GradeCase {
  word: string;
  answer: string;
  /**
   * 'unjudged': no per-GPC judgement (only `_global` is recorded). Otherwise
   * the verdicts that must hold, keyed by GPC short id ('f-F', 'WORD-the').
   */
  expect: 'unjudged' | Record<string, Verdict>;
  /**
   * Whether the answer reads back as the word (grade.ts rule 0): false = it
   * mustn't; otherwise its replacements, "answer>word" ('cs>x'). Unchecked
   * when absent.
   */
  phonetic?: false | string[];
  /** Where the answer came from: learner + date for real ones, 'synthetic' otherwise. */
  source: string;
  note?: string;
}

export const GRADE_CASES: GradeCase[] = [
  // --- Real misses (Alice). All were unjudged by the wrong-length bail-out. ---
  {
    word: 'fix',
    answer: 'thix',
    expect: { 'f-F': 'miss', 'i-IH': 'hit', 'x-K_S': 'hit' },
    source: 'Alice 2026-10-04',
    note: 'f→th; she says "thour, thive" for four, five',
  },
  {
    word: 'fin',
    answer: 'thin',
    expect: { 'f-F': 'miss', 'i-IH': 'hit', 'n-N': 'hit' },
    source: 'Alice 2026-10-04',
  },
  {
    word: 'if',
    answer: 'ife',
    expect: { 'i-IH': 'miss', 'f-F': 'hit' },
    source: 'Alice 2026-10-04',
    note: 'magic e: she made the i long; the f is right',
  },
  {
    word: 'go',
    answer: 'goe',
    expect: { 'g-G': 'hit', 'o-OW-final': 'miss' },
    source: 'Alice 2026-09-03',
  },
  {
    word: 'hi',
    answer: 'hiy',
    expect: { 'h-HH': 'hit', 'i-AY-final': 'miss' },
    source: 'Alice 2026-08-25',
  },
  {
    word: 'hope',
    answer: 'hop',
    expect: { 'h-HH': 'hit', 'o_e-OW': 'miss', 'p-P': 'hit' },
    source: 'Alice 2026-09-30',
  },
  {
    word: 'rope',
    answer: 'rop',
    expect: { 'r-R': 'hit', 'o_e-OW': 'miss', 'p-P': 'hit' },
    source: 'Alice 2026-09-30, 10-02',
  },
  {
    word: 'phone',
    answer: 'fone',
    expect: { 'ph-F': 'miss', 'o_e-OW': 'hit', 'n-N': 'hit' },
    source: 'Alice 2026-08-07',
  },
  {
    word: 'just',
    answer: 'gust',
    expect: { 'j-JH': 'miss', 'u-AH': 'hit', 's-S': 'hit', 't-T': 'hit' },
    phonetic: ['g>j'],
    source: 'reported (todo-minor 8), date unknown',
    note: "letter name: g's name starts /dʒ/, though g before u reads /g/",
  },
  {
    word: 'just',
    answer: 'gist',
    expect: { 'j-JH': 'miss', 'u-AH': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'soft g reads right, but the vowel is wrong',
  },
  {
    word: 'phone',
    answer: 'fon',
    expect: { 'ph-F': 'miss', 'o_e-OW': 'miss', 'n-N': 'hit' },
    source: 'Alice 2026-08-13, 09-20',
  },
  {
    word: 'phone',
    answer: 'phn',
    expect: { 'ph-F': 'hit', 'o_e-OW': 'miss', 'n-N': 'hit' },
    source: 'Alice 2026-08-07',
  },
  {
    word: 'phone',
    answer: 'ph',
    expect: { 'ph-F': 'hit', 'o_e-OW': 'miss', 'n-N': 'miss' },
    source: 'Alice 2026-09-16',
  },
  {
    word: 'phone',
    answer: 'sh',
    expect: { 'ph-F': 'miss', 'o_e-OW': 'miss', 'n-N': 'miss' },
    source: 'Alice 2026-08-11',
  },
  {
    word: 'the',
    answer: 'th',
    expect: { 'th-DH': 'hit', 'WORD-the': 'miss' },
    source: 'Alice 2026-09-30, 10-02',
  },
  {
    word: 'us',
    answer: 'use',
    expect: { 'u-AH': 'miss', 's-S': 'hit' },
    phonetic: false,
    source: 'Alice 2026-09-28',
    note: 'silent e after s is not allowed in decoding: it would excuse exactly this',
  },
  {
    word: 'us',
    answer: 'yse',
    expect: { 'u-AH': 'miss', 's-S': 'hit' },
    source: 'Alice 2026-08-05',
  },

  // --- Synthetic: the rules' edges. ---
  {
    word: 'fix',
    answer: 'fix',
    expect: { 'f-F': 'hit', 'i-IH': 'hit', 'x-K_S': 'hit' },
    source: 'synthetic',
    note: "x's K and S chunks merge, so x-K_S is graded",
  },
  {
    word: 'fix',
    answer: 'wix',
    expect: { 'f-F': 'miss', 'i-IH': 'hit', 'x-K_S': 'hit' },
    source: 'synthetic',
    note: 'w-W is not charged: the card never asked for it',
  },
  {
    word: 'think',
    answer: 'thik',
    expect: { 'th-TH': 'hit', 'i-IH': 'hit', 'nk-NG_K': 'miss' },
    source: 'synthetic',
    note: 'n (/ŋ/) + k grade as nk-NG_K, the card\'s tag; never n-N or k-K',
  },
  {
    word: 'cat',
    answer: 'ca',
    expect: { 'c-K': 'hit', 'a-AE': 'hit', 't-T': 'miss' },
    source: 'synthetic',
  },
  {
    word: 'cat',
    answer: 'cats',
    expect: 'unjudged',
    source: 'synthetic',
    note: 'a consonant added beside right letters blames nothing',
  },
  {
    word: 'cat',
    answer: '',
    expect: 'unjudged',
    source: 'synthetic',
  },
  {
    word: 'if',
    answer: 'ifxyz',
    expect: 'unjudged',
    source: 'synthetic',
    note: 'more than twice the length: not aligned',
  },
  {
    word: 'hope',
    answer: 'hoep',
    expect: { 'h-HH': 'hit', 'o_e-OW': 'miss', 'p-P': 'hit' },
    source: 'synthetic',
    note: 'a moved e blames the split digraph, not the p',
  },
  {
    word: 'ship',
    answer: 'shipe',
    expect: { 'sh-SH': 'hit', 'i-IH': 'miss', 'p-P': 'hit' },
    source: 'synthetic',
  },
  {
    word: 'boat',
    answer: 'boet',
    expect: { 'b-B': 'hit', 'oa-OW': 'miss', 't-T': 'hit' },
    source: 'synthetic',
  },
  {
    word: 'have',
    answer: 'hav',
    expect: { 'h-HH': 'hit', 'a-AE': 'hit', 'v-V': 'hit', 'WORD-have': 'miss' },
    source: 'synthetic',
    note: "no chunk owns have's silent e, so the sight word takes the miss",
  },
  {
    word: 'said',
    answer: 'siad',
    expect: { 's-S': 'hit', 'WORD-said': 'miss', 'd-D': 'hit' },
    source: 'synthetic',
  },
  {
    word: 'cake',
    answer: 'ceke',
    expect: { 'c-K': 'hit', 'a_e-EY': 'miss', 'k-K': 'hit' },
    source: 'synthetic',
  },

  // --- Phonetic: reads back as the word (grade.ts rule 0; curriculum-log C8). ---
  {
    word: 'next',
    answer: 'necst',
    expect: { 'n-N': 'hit', 'e-EH': 'hit', 'x-K_S': 'miss', 't-T': 'hit' },
    phonetic: ['cs>x'],
    source: 'Alice 2026-10-28',
    note: "x's /k s/ spelled cs",
  },
  {
    word: 'phone',
    answer: 'fone',
    expect: { 'ph-F': 'miss', 'o_e-OW': 'hit', 'n-N': 'hit' },
    phonetic: ['f>ph'],
    source: 'synthetic',
  },
  {
    word: 'think',
    answer: 'thingk',
    expect: { 'th-TH': 'hit', 'i-IH': 'hit', 'nk-NG_K': 'miss' },
    phonetic: ['ngk>nk'],
    source: 'synthetic',
    note: 'by letters alone the extra g blamed nothing (unjudged)',
  },
  {
    word: 'fix',
    answer: 'fiks',
    expect: { 'f-F': 'hit', 'i-IH': 'hit', 'x-K_S': 'miss' },
    phonetic: ['ks>x'],
    source: 'synthetic',
  },
  {
    word: 'phone',
    answer: 'fon',
    expect: { 'ph-F': 'miss', 'o_e-OW': 'miss', 'n-N': 'hit' },
    phonetic: false,
    source: 'synthetic',
    note: 'closed-syllable o reads /ɑ/',
  },
  {
    word: 'phone',
    answer: 'phon',
    expect: { 'ph-F': 'hit', 'o_e-OW': 'miss', 'n-N': 'hit' },
    phonetic: false,
    source: 'synthetic',
  },
  {
    word: 'next',
    answer: 'nest',
    expect: { 'x-K_S': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'the /k/ is gone',
  },
  {
    word: 'ship',
    answer: 'shipe',
    expect: { 'i-IH': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'with a short i the e has nothing to do: it reads /ʃ aɪ p/',
  },
  {
    word: 'if',
    answer: 'ife',
    expect: { 'i-IH': 'miss' },
    phonetic: false,
    source: 'synthetic',
  },
  {
    word: 'phone',
    answer: 'ghone',
    expect: { 'ph-F': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'gh-F is catalogued for analysis, not taught; nobody would spell it this way anyway',
  },
  {
    word: 'said',
    answer: 'sed',
    expect: { 'WORD-said': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'sight words never count as phonetic',
  },
  {
    word: 'was',
    answer: 'wuz',
    expect: { 'WORD-was': 'miss' },
    phonetic: false,
    source: 'synthetic',
  },
  {
    word: 'kid',
    answer: 'cid',
    expect: { 'k-K': 'miss', 'i-IH': 'hit', 'd-D': 'hit' },
    phonetic: false,
    source: 'synthetic',
    note: 'c before i is soft: cid reads /s ɪ d/',
  },
  {
    word: 'kids',
    answer: 'cids',
    expect: { 'k-K': 'miss', 's-Z': 'hit' },
    phonetic: false,
    source: 'synthetic',
  },
  {
    word: 'cat',
    answer: 'kat',
    expect: { 'c-K': 'miss', 'a-AE': 'hit', 't-T': 'hit' },
    phonetic: ['k>c'],
    source: 'synthetic',
  },
  {
    word: 'kids',
    answer: 'kidz',
    expect: { 'k-K': 'hit', 'i-IH': 'hit', 'd-D': 'hit', 's-Z': 'miss' },
    phonetic: ['z>s'],
    source: 'synthetic',
    note: "s-Z is analysis-tagged; the word's own GPCs join the decoder",
  },
  {
    word: 'is',
    answer: 'iz',
    expect: { 'i-IH': 'hit', 's-Z': 'miss' },
    phonetic: ['z>s'],
    source: 'synthetic',
  },
  {
    word: 'dance',
    answer: 'danse',
    expect: { 'c-S-soft': 'miss' },
    phonetic: false,
    source: 'synthetic',
    note: 'e after s stays unsilent (see us ← use), so -nse does not read back',
  },
  {
    word: 'peace',
    answer: 'peese',
    expect: { 'p-P': 'hit' },
    phonetic: ['ee>ea', 's>c'],
    source: 'synthetic',
    note: 'silent e after a vowel team',
  },
];
