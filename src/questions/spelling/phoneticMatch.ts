/**
 * Phonetic match — does a misspelling read back as the target word?
 *
 * "fone" for "phone" and "necst" for "next" spell every sound right with the
 * wrong letters: a strong decoder would read them as the word. "fon" and
 * "phon" don't (closed-syllable o reads /ɑ/). The spelling grader uses this to
 * tell the two apart (grade.ts); see agent/curriculum-log/concerns.md C8 for
 * what callers do with it.
 *
 * An answer reads back if some way of splitting it into the course's teaching
 * GPCs, plus the word's own, gives exactly the word's phonemes. Teaching GPCs:
 * gh-F is catalogued (enough) but kept for analysis, so "ghone" doesn't count.
 * The word's own: an answer can always reuse a spelling the word uses, even
 * an analysis-tagged one (s-Z in "kids", so "kidz" reads back via z-Z and
 * the s of "kids" itself can be read at all). Soft c is applied: "cid" reads
 * /s ɪ d/, so it doesn't count for "kid" (decode.ts).
 * Sight words are never matched: "wuz" gets no credit for "was", because those
 * words need explicit spelling as much as explicit decoding.
 *
 * Letter-name spellings are let in too, though a decoder wouldn't read them
 * back: "gust" for "just" spells /dʒ/ with g, whose name ("jee") starts with
 * it. Early spellers do this; it shows the sound was heard and placed, which
 * is the decoding signal the grader is after, so it shouldn't leech the card.
 * Kept to the readings in LETTER_NAME_READINGS, added as learners show them;
 * a reading with fewer of them wins, and `letterNames` lists those used.
 */

import {
  buildCatalogueIndex,
  buildGpcId,
  getComprehensiveCatalogue,
  getDefaultCatalogueIndex,
  type GPCCatalogueIndex,
  type GPCEntry,
} from '../../../content/phoneticAnalytics/lib/catalogue';
import { decodePathsToPhonemes, type DecodePathStep } from '../../../content/phoneticAnalytics/lib/decode';
import { parseGpcTag, sightWordGpcId } from '@/services/tags';

/** The word as the grader chunks it. */
export interface WordChunk {
  label: string;
  /** Space-joined ("K S" for x). */
  phoneme: string;
  letters: number[];
  /** `gpc:exercise:…`, or null when the chunk resolves to no catalogue GPC. */
  tag: string | null;
}

export interface SoundGroup {
  /** Sounds the group spells. Empty for a silent letter on one side only. */
  phonemes: string[];
  /** `chunks`: indices into the word's chunk list. */
  word: { text: string; letters: number[]; chunks: number[] };
  /** `gpcIds`: the catalogue GPCs the answer was read with; `parts`: each
   *  one's letters and sounds (cs → c /k/, s /s/). */
  answer: { text: string; letters: number[]; gpcIds: string[]; parts: { letters: number[]; phonemes: string[] }[] };
  same: boolean;
}

export interface PhoneticMatch {
  /** Word and answer split up and paired by sound, in word order. Every
   *  letter of both belongs to exactly one group. */
  groups: SoundGroup[];
  /** The groups spelled differently, as "answer>word": ['cs>x'], ['f>ph']. */
  replacements: string[];
  /** The replacements that lean on a letter's name, not its sound: ['g>j']. */
  letterNames: string[];
}

/**
 * A letter read as the sound its name starts with, where the course's rules
 * wouldn't read it that way. Only g for now (seen: "gust" for "just"; soft g
 * already covers g before e, i, y). Candidates if learners show them: y for
 * /w/ ("wye"), c for /s/ before a, o, u ("see").
 */
export const LETTER_NAME_READINGS: readonly GPCEntry[] = [
  { id: buildGpcId('g', 'JH', 'letter-name'), grapheme: 'g', phoneme: 'JH', category: 'consonants', matchType: 'simple' },
];
const letterNameIds = new Set(LETTER_NAME_READINGS.map((g) => g.id));

const wordIndexes = new Map<string, GPCCatalogueIndex>();
/** The teaching GPCs plus the word's own, cached per word. */
function decodeIndexFor(word: string, chunks: WordChunk[]): GPCCatalogueIndex {
  let index = wordIndexes.get(word);
  if (!index) {
    const teaching = getComprehensiveCatalogue();
    const taught = new Set(teaching.map((g) => g.id));
    const byId = getDefaultCatalogueIndex().byId;
    const own = chunks
      .map((c) => (c.tag ? byId.get(parseGpcTag(c.tag)?.gpcId ?? '') : undefined))
      .filter((g): g is GPCEntry => !!g && !taught.has(g.id));
    index = buildCatalogueIndex([...teaching, ...own, ...LETTER_NAME_READINGS]);
    wordIndexes.set(word, index);
  }
  return index;
}

interface Unit {
  text: string;
  letters: number[];
  phonemes: string[];
  /** Word side: chunk index. Answer side: catalogue id. */
  ref: number | string;
}

const splitPhonemes = (phoneme: string): string[] =>
  phoneme.split(' ').filter((p) => p).map((p) => p.replace(/\d/g, ''));

/** A split digraph keeps its "o_e" name; anything else is its letters. */
function spellingText(source: string, letters: number[], grapheme: string): string {
  return grapheme.includes('_') ? grapheme : letters.map((i) => source[i]).join('');
}

/** Units' letters, each once, in order. Chunks can share a letter (charge's
 *  a owns the r it colours, and so does the r). */
const unitLetters = (units: Unit[]): number[] => [...new Set(units.flatMap((u) => u.letters))].sort((x, y) => x - y);

/** A lone split digraph keeps its name; otherwise the group's letters. */
const groupText = (source: string, units: Unit[]): string =>
  units.length === 1 ? units[0].text : unitLetters(units).map((i) => source[i]).join('');

/**
 * Pair word units with answer units along the sounds: where the two split
 * the sounds differently (x = K S against c + s), they merge into one group.
 * Silent units become groups of their own, with the other side empty.
 */
function pairUnits(wordUnits: Unit[], answerUnits: Unit[], word: string, answer: string): SoundGroup[] {
  const makeGroup = (ws: Unit[], as: Unit[]): SoundGroup => {
    const wordText = groupText(word, ws);
    const answerText = groupText(answer, as);
    return {
      phonemes: (ws.length ? ws : as).flatMap((u) => u.phonemes),
      word: { text: wordText, letters: unitLetters(ws), chunks: ws.map((u) => u.ref as number) },
      answer: {
        text: answerText,
        letters: unitLetters(as),
        gpcIds: as.map((u) => u.ref as string),
        parts: as.map((u) => ({ letters: u.letters, phonemes: u.phonemes })),
      },
      same: ws.length > 0 && as.length > 0 && wordText === answerText,
    };
  };

  const groups: SoundGroup[] = [];
  const voiced = (u: Unit) => u.phonemes.length > 0;
  const w = wordUnits.filter(voiced);
  const a = answerUnits.filter(voiced);

  let i = 0;
  let j = 0;
  while (i < w.length || j < a.length) {
    const ws: Unit[] = [];
    const as: Unit[] = [];
    let wn = 0;
    let an = 0;
    do {
      if (wn <= an && i < w.length) {
        ws.push(w[i]);
        wn += w[i++].phonemes.length;
      } else if (j < a.length) {
        as.push(a[j]);
        an += a[j++].phonemes.length;
      } else {
        break;
      }
    } while (wn !== an);
    groups.push(makeGroup(ws, as));
  }

  // Silent letters pair with a silent letter spelled the same on the other
  // side (dance's final e against an answer's); the rest stand alone.
  const answerSilent = answerUnits.filter((u) => !voiced(u));
  for (const u of wordUnits.filter((u) => !voiced(u))) {
    const k = answerSilent.findIndex((a) => a.text === u.text);
    groups.push(makeGroup([u], k >= 0 ? answerSilent.splice(k, 1) : []));
  }
  for (const u of answerSilent) groups.push(makeGroup([], [u]));

  // Word order; an answer-only group sits after the group holding the answer
  // letter before it.
  const key = (g: SoundGroup): number => {
    if (g.word.letters.length) return Math.min(...g.word.letters);
    const prev = Math.min(...g.answer.letters) - 1;
    const host = groups.find((h) => h.word.letters.length && h.answer.letters.includes(prev));
    return host ? Math.min(...host.word.letters) + 0.5 : -0.5;
  };
  return groups.sort((x, y) => key(x) - key(y));
}

/** The word's letters no chunk owns, as runs of adjacent letters (straight's "gh"). */
function silentRuns(word: string, owned: Set<number>): Unit[] {
  const runs: Unit[] = [];
  for (let t = 0; t < word.length; t++) {
    if (owned.has(t)) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.letters[prev.letters.length - 1] === t - 1) {
      prev.letters.push(t);
      prev.text += word[t];
    } else {
      runs.push({ text: word[t], letters: [t], phonemes: [], ref: -1 });
    }
  }
  return runs;
}

const letterNameSteps = (groups: SoundGroup[]): number =>
  groups.reduce((n, g) => n + g.answer.gpcIds.filter((id) => letterNameIds.has(id)).length, 0);

/** Fewest letter-name readings; then letters in matching groups, the more
 *  the better; then fewer groups. */
function pairingScore(groups: SoundGroup[]): number {
  const kept = groups.filter((g) => g.same).reduce((n, g) => n + g.word.letters.length, 0);
  return -letterNameSteps(groups) * 1e6 + kept * 1000 - groups.length;
}

/**
 * How `answer` reads back as `word`, or null if it doesn't (or `word` is a
 * sight word). For a wrong answer only: a correct one trivially matches.
 */
export function phoneticMatch(word: string, chunks: WordChunk[], answer: string): PhoneticMatch | null {
  if (sightWordGpcId(word)) return null;
  const phonemes = chunks.flatMap((c) => splitPhonemes(c.phoneme));
  if (!phonemes.length) return null;

  const paths = decodePathsToPhonemes(answer, phonemes, decodeIndexFor(word, chunks));
  if (!paths.length) return null;

  const owned = new Set(chunks.flatMap((c) => c.letters));
  const wordUnits: Unit[] = [
    ...chunks.map((c, k) => ({
      text: spellingText(word, c.letters, c.label),
      letters: c.letters,
      phonemes: splitPhonemes(c.phoneme),
      ref: k,
    })),
    ...silentRuns(word, owned),
  ];
  const answerUnits = (path: DecodePathStep[]): Unit[] =>
    path.map((s) => ({
      text: spellingText(answer, s.letters, s.grapheme),
      letters: s.letters,
      phonemes: s.phonemes,
      ref: s.gpcId,
    }));

  let best: SoundGroup[] | null = null;
  for (const path of paths) {
    const groups = pairUnits(wordUnits, answerUnits(path), word, answer);
    if (!best || pairingScore(groups) > pairingScore(best)) best = groups;
  }
  const groups = best!;
  for (const g of groups) g.word.chunks = g.word.chunks.filter((k) => k >= 0);
  const replacement = (g: SoundGroup) => `${g.answer.text}>${g.word.text}`;
  return {
    groups,
    replacements: groups.filter((g) => !g.same).map(replacement),
    letterNames: groups.filter((g) => letterNameSteps([g]) > 0).map(replacement),
  };
}
