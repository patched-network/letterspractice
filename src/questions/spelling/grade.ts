/**
 * Spelling grader — which of the target word's GPCs a typed answer got right.
 *
 * Pure: (word, phonetics, answer) → a verdict per GPC. SpellingQuestion.evaluate
 * turns verdicts into scores; /dbg/grader and the admin spelling-misses list
 * display them. The regression table (gradeCases.ts) pins the judgements, so a
 * rule added for one class of error can't quietly break another.
 *
 * How a wrong answer is judged:
 *   0. If it reads back as the word ("fone" for "phone", "necst" for "next"),
 *      the sounds are paired instead (phoneticMatch.ts): a chunk spelled with
 *      other letters is missed, the rest hit, and `phonetic` says so. Rules
 *      1–3 are skipped. Never for sight words. A letter-name spelling ("gust"
 *      for "just": g's name starts /dʒ/) counts as reading back here.
 *   1. Align the answer to the word letter by letter: fewest edits, and among
 *      those the fewest substitutions, so a transposition ("hoep") reads as a
 *      moved letter rather than two wrong ones.
 *   2. A chunk is missed if any of its letters was substituted or left out.
 *   3. Inserted letters next to a missed chunk are part of that error. A
 *      free-standing insertion containing a vowel letter charges the nearest
 *      vowel chunk before it (after it, if none): "ife" for "if" marks the i,
 *      "goe" for "go" the o. A free-standing consonant insertion ("cats")
 *      blames nothing.
 *   4. A wrong answer that blames no graded GPC is unjudged: only `_global` is
 *      recorded, never a guessed GPC.
 * Also unjudged: no phonetics, an empty answer, or an answer more than
 * MAX_ANSWER_LENGTH_RATIO times the word's length.
 *
 * Only the word's own GPCs are graded. "wix" for "fix" misses f-F; it says
 * nothing about w-W, which the card never asked for.
 */

import type { WordPhonetics } from '@/services/phonetics';
import { isVowel, type ArpabetWithStress } from '@/services/phonetics/arpabet';
import { exactGraphemeToGpcId, gpcTag, sightWordGpcId } from '@/services/tags';
import { phoneticMatch, type PhoneticMatch } from './phoneticMatch';

/** Answers longer than this multiple of the word's length aren't aligned. */
export const MAX_ANSWER_LENGTH_RATIO = 2;

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

export type Verdict = 'hit' | 'miss';

/** One step of the alignment. `t` indexes the word, `a` the answer. */
export type AlignOp =
  | { op: 'match'; t: number; a: number }
  | { op: 'sub'; t: number; a: number }
  | { op: 'del'; t: number }
  /** `before`: the word index the inserted letter precedes (word.length = at the end). */
  | { op: 'ins'; a: number; before: number };

export interface GradedChunk {
  label: string;
  /** Space-joined when merged ("K S" for x). */
  phoneme: string;
  /** Word letter indices the chunk owns. */
  letters: number[];
  /** `gpc:exercise:…`, or null when the chunk resolves to no catalogue GPC. */
  tag: string | null;
  verdict: Verdict;
  /** Why it was missed, in words. Empty for a hit. */
  why: string[];
}

export type UnjudgedReason = 'no-phonetics' | 'empty' | 'too-long' | 'nothing-to-blame';

export interface SpellingGrade {
  word: string;
  /** Trimmed, lower-cased. */
  answer: string;
  correct: boolean;
  /** Why no per-GPC judgement was made; null when judged. */
  unjudged: UnjudgedReason | null;
  /** Empty unless the answer was aligned (wrong, and past the gates). */
  alignment: AlignOp[];
  chunks: GradedChunk[];
  /** Per-GPC verdicts keyed by exercise tag. Empty when unjudged. */
  verdicts: Record<string, Verdict>;
  /** Grade-level remarks: uncharged insertions, the whole-word sight-word rule. */
  notes: string[];
  /** Wrong, but reads back as the word (rule 0). Null otherwise, and when
   *  correct or unjudged before alignment. */
  phonetic: PhoneticMatch | null;
}

interface GradingChunk {
  label: string;
  phoneme: string;
  letters: number[];
  tag: string | null;
}

/**
 * The word's chunks as graded, each resolved to a GPC only when its spelling
 * and sound match a catalogue entry exactly. A chunk with no exact match is
 * not graded, rather than credited to the grapheme's sole entry (the "n" of
 * "think" sounds /ŋ/; it isn't n-N). Two merges come first:
 *   - chunks splitting one grapheme into phonemes over the same letters
 *     (x → K + S, qu → K + W) rejoin, so x resolves to x-K_S;
 *   - adjacent chunks whose joined spelling and sound is a GPC, where one
 *     half has no exact GPC of its own, become that GPC: n (/ŋ/) + k is
 *     nk-NG_K, the GPC "think" is tagged with.
 */
function gradingChunks(phonetics: WordPhonetics): GradingChunk[] {
  type Raw = { label: string; phonemes: string[]; letters: number[]; gpcId?: string };
  const merged: Raw[] = [];
  for (const chunk of phonetics.chunks) {
    const label = chunk.label ?? '';
    const letters = Object.keys(chunk.letters).map(Number);
    const prev = merged[merged.length - 1];
    if (prev && prev.label === label && prev.letters.join() === letters.join()) {
      prev.phonemes.push(chunk.phoneme);
      continue;
    }
    merged.push({ label, phonemes: [chunk.phoneme], letters, gpcId: chunk.gpcId });
  }

  const resolve = (c: Raw): string | null =>
    c.gpcId ?? (c.label ? exactGraphemeToGpcId(c.label, c.phonemes.join(' ')) : null);
  for (let i = 0; i + 1 < merged.length; ) {
    const [a, b] = [merged[i], merged[i + 1]];
    const adjacent = Math.max(...a.letters) + 1 === Math.min(...b.letters);
    const joined =
      adjacent && a.label && b.label && !a.gpcId && !b.gpcId
        ? exactGraphemeToGpcId(a.label + b.label, [...a.phonemes, ...b.phonemes].join(' '))
        : null;
    if (joined && (!resolve(a) || !resolve(b))) {
      merged.splice(i, 2, {
        label: a.label + b.label,
        phonemes: [...a.phonemes, ...b.phonemes],
        letters: [...a.letters, ...b.letters],
        gpcId: joined,
      });
    } else {
      i++;
    }
  }

  return merged.map((c) => {
    const catalogueId = resolve(c);
    return {
      label: c.label,
      phoneme: c.phonemes.join(' '),
      letters: c.letters,
      tag: catalogueId ? gpcTag('exercise', catalogueId) : null,
    };
  });
}

function isVowelChunk(chunk: GradingChunk): boolean {
  return chunk.phoneme.split(' ').some((p) => isVowel(p as ArpabetWithStress));
}

/** Fewest edits, then fewest substitutions. Ties prefer match/sub, then del, then ins. */
export function alignAnswer(word: string, answer: string): AlignOp[] {
  const n = word.length;
  const m = answer.length;
  // cost = edits * SUB_SCALE + subs, so edits dominate and subs break ties.
  const SUB_SCALE = 1000;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i][0] = i * SUB_SCALE;
  for (let j = 1; j <= m; j++) cost[0][j] = j * SUB_SCALE;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = cost[i - 1][j - 1] + (word[i - 1] === answer[j - 1] ? 0 : SUB_SCALE + 1);
      cost[i][j] = Math.min(diag, cost[i - 1][j] + SUB_SCALE, cost[i][j - 1] + SUB_SCALE);
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = word[i - 1] === answer[j - 1];
      if (cost[i][j] === cost[i - 1][j - 1] + (same ? 0 : SUB_SCALE + 1)) {
        ops.push({ op: same ? 'match' : 'sub', t: i - 1, a: j - 1 });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + SUB_SCALE) {
      ops.push({ op: 'del', t: i - 1 });
      i--;
      continue;
    }
    ops.push({ op: 'ins', a: j - 1, before: i });
    j--;
  }
  return ops.reverse();
}

export function gradeSpelling(
  word: string,
  phonetics: WordPhonetics | null,
  rawAnswer: string
): SpellingGrade {
  const target = word.toLowerCase();
  const answer = rawAnswer.trim().toLowerCase();
  const correct = answer === target;
  const grade: SpellingGrade = {
    word: target,
    answer,
    correct,
    unjudged: null,
    alignment: [],
    chunks: [],
    verdicts: {},
    notes: [],
    phonetic: null,
  };

  if (!phonetics) {
    grade.unjudged = 'no-phonetics';
    return grade;
  }

  const chunks = gradingChunks(phonetics);
  const graded: GradedChunk[] = chunks.map((c) => ({ ...c, verdict: 'hit', why: [] }));
  grade.chunks = graded;

  const chunksAt = (t: number): GradedChunk[] => graded.filter((c) => c.letters.includes(t));
  const charge = (c: GradedChunk, why: string) => {
    c.verdict = 'miss';
    c.why.push(why);
  };

  if (!correct) {
    if (answer === '') {
      grade.unjudged = 'empty';
    } else if (answer.length > MAX_ANSWER_LENGTH_RATIO * target.length) {
      grade.unjudged = 'too-long';
    } else {
      const ops = alignAnswer(target, answer);
      grade.alignment = ops;
      grade.phonetic = phoneticMatch(target, chunks, answer);
    }
    if (grade.phonetic) {
      // Rule 0: chunks spelled with other letters that make the same sounds.
      for (const group of grade.phonetic.groups) {
        if (group.same) continue;
        const byName = grade.phonetic.letterNames.includes(`${group.answer.text}>${group.word.text}`);
        const why = byName ? 'its letter name has the sound' : 'sounds right';
        for (const k of group.word.chunks) charge(graded[k], `spelled "${group.answer.text}": ${why}`);
      }
      grade.notes.push(`reads back as the word: ${grade.phonetic.replacements.join(', ')}`);
      if (grade.phonetic.letterNames.length) {
        grade.notes.push(`by letter name: ${grade.phonetic.letterNames.join(', ')}`);
      }
    } else if (grade.alignment.length) {
      const ops = grade.alignment;

      // Rule 2: substituted or missing letters miss their chunks.
      for (const op of ops) {
        if (op.op === 'sub') {
          for (const c of chunksAt(op.t)) charge(c, `"${target[op.t]}" typed as "${answer[op.a]}"`);
        } else if (op.op === 'del') {
          for (const c of chunksAt(op.t)) charge(c, `"${target[op.t]}" left out`);
        }
      }

      // Rule 3: inserted runs, grouped by insertion point. Judged against the
      // misses from rule 2 only, so one run's charge can't absorb the next.
      const runs = new Map<number, string>();
      for (const op of ops) {
        if (op.op === 'ins') runs.set(op.before, (runs.get(op.before) ?? '') + answer[op.a]);
      }
      const missedByLetters = new Set(graded.filter((c) => c.verdict === 'miss'));
      for (const [before, run] of runs) {
        const neighbours = [...chunksAt(before - 1), ...chunksAt(before)];
        const absorbing = neighbours.find((c) => missedByLetters.has(c));
        if (absorbing) {
          absorbing.why.push(`extra "${run}" beside it`);
          continue;
        }
        if (![...run].some((ch) => VOWEL_LETTERS.has(ch))) {
          grade.notes.push(`extra "${run}" blames nothing`);
          continue;
        }
        const vowelAt = (t: number) => chunksAt(t).find((c) => isVowelChunk(c));
        let vowel: GradedChunk | undefined;
        for (let t = before - 1; t >= 0 && !vowel; t--) vowel = vowelAt(t);
        for (let t = before; t < target.length && !vowel; t++) vowel = vowelAt(t);
        if (vowel) charge(vowel, `extra "${run}" changes its vowel`);
        else grade.notes.push(`extra "${run}" blames nothing (no vowel chunk)`);
      }
    }
  }

  if (grade.unjudged) return grade;

  // A tag on several chunks ("dad") misses if any of them does.
  for (const c of graded) {
    if (!c.tag) continue;
    if (c.verdict === 'miss' || !(c.tag in grade.verdicts)) grade.verdicts[c.tag] = c.verdict;
  }

  // A sight word's own skill is credited by its remainder chunks above — or,
  // when the weird part makes no sound of its own ("have"'s silent e), by the
  // whole answer.
  const sightWordId = sightWordGpcId(target);
  if (sightWordId) {
    const tag = gpcTag('exercise', sightWordId);
    if (!(tag in grade.verdicts)) {
      grade.verdicts[tag] = correct ? 'hit' : 'miss';
      grade.notes.push(`${tag} graded on the whole answer`);
    }
  }

  // Rule 4.
  if (!correct && !Object.values(grade.verdicts).includes('miss')) {
    grade.unjudged = 'nothing-to-blame';
    grade.verdicts = {};
  }
  return grade;
}
