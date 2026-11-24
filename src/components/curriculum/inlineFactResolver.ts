/**
 * Resolves copy's fact spans (grammar: inlineFacts.ts) to curriculum facts.
 *
 * Split from the parsing because it needs the phonetic index (~180 KB) and
 * the curriculum: inlineMarkup.ts imports this on first need, so copy
 * without fact spans (the landing page's hero) never downloads either.
 */
import { getPhonetics } from '../../services/phonetics';
import { DEFAULT_AGE, factsForAge, findFact, lessonColor, type FactInfo } from './curriculumData';
import type { FactResolver, ResolvedFact } from './inlineFacts';
import { hasSound } from './playFact';

const NEUTRAL = '#9e9e9e';

const withColor = (fact: FactInfo | null): ResolvedFact | null =>
  fact ? { fact, color: lessonColor(fact.lesson) ?? NEUTRAL } : null;

export const factResolver: FactResolver = {
  starred: (tokens) => withColor(tokens.length === 1 ? resolveSpelling(tokens[0]) : resolve(tokens)),
  bare: (spelling) => withColor(resolveSpelling(spelling)),
};

/** A spelling and example words: the example says which sound */
function resolve([grapheme, ...examples]: string[]): FactInfo | null {
  const chunk = getPhonetics(examples[0])?.chunks.find((c) => c.label === grapheme);
  if (!chunk) return null;
  let gpc = (chunk.gpcId ?? `${chunk.label}-${chunk.phoneme}`).replace(/^GPC-/, '');
  // A vowel at the end of a word (*e* in *me*) is its own fact in the
  // curriculum (e-IY-final), though the word's chunk says e-IY
  if (!findFact(gpc) && findFact(`${gpc}-final`)) gpc = `${gpc}-final`;
  const known = findFact(gpc);
  return {
    gpc,
    grapheme,
    phoneme: known?.phoneme ?? chunk.phoneme,
    // The copy's own words, so a tap says the example the reader just read
    examples,
    lesson: known?.lesson ?? '',
    kind: known?.kind ?? 'intro',
  };
}

/** A spelling alone: the first fact a learner meets with it, sound only */
function resolveSpelling(grapheme: string): FactInfo | null {
  const fact = factsForAge(DEFAULT_AGE).find((f) => f.grapheme === grapheme);
  if (!fact) return null;
  return { ...fact, examples: hasSound(fact) ? [] : fact.examples.slice(0, 1) };
}
