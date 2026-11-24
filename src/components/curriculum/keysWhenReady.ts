/**
 * The keyboard a word is practised on, from the /curriculum sim. Kept out of
 * curriculumData.ts because it needs the phonetic index, which that file must
 * not import (see its header).
 */
import { getPhonetics } from '../../services/phonetics';
import { factsForAge, keysOf } from './curriculumData';

/**
 * The keys a learner of this age has when they've met every fact in `word`
 * (by its phonetic index chunks) — the keyboard they'd practise it on. Null
 * if the word isn't indexed or the simulated learner never meets all its facts.
 */
export function keysWhenReady(age: number, word: string): string[] | null {
  const chunks = getPhonetics(word)?.chunks;
  if (!chunks) return null;
  const needed = new Set(chunks.map((c) => (c.gpcId ?? `${c.label}-${c.phoneme}`).replace(/^GPC-/, '')));
  const keys: string[] = [];
  for (const f of factsForAge(age)) {
    needed.delete(f.gpc);
    for (const k of keysOf(f)) if (!keys.includes(k)) keys.push(k);
    if (!needed.size) return keys;
  }
  return null;
}
