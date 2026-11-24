/**
 * Tap-to-hear facts inside /curriculum copy. A bracketed span in a copy string
 *
 *   [*sh* as in *ship*]      [*th* as in *this*, *that*]
 *
 * becomes a button: the first starred token is the spelling, the starred
 * words after it the examples. Which fact it is comes from the first
 * example's phonetic index chunks (*th* in *this* is th-DH, in *thin* th-TH),
 * so the copy names a fact the way a reader would. A tap plays the sound,
 * then the first example (playFact). Coloured by the fact's lesson when the
 * sim knows it.
 *
 * A spelling alone — [*j*] or [j] — plays just its sound: the first fact a
 * learner meets with that spelling (s → /s/, not /z/; th → the voiced one).
 * Where there's no sound to play (a sight word; nk) it plays the word.
 *
 * A fact span that doesn't resolve (an unindexed word, a spelling the word
 * doesn't chunk as) renders as its plain text, and warns in dev. Other
 * brackets ("[sic]") are left as they are.
 *
 * [text](/path) is a link, as in Markdown (a router link for a /path).
 *
 * This file is the parsing, and needs nothing. Resolving a fact needs the
 * phonetic index and the curriculum (inlineFactResolver.ts), which are big,
 * so the caller passes a resolver in, or null until it has one (inlineMarkup
 * loads it on first need). Without one, a starred span renders as its plain
 * label and a bare one ([j]) as its literal text.
 */

import type { FactInfo } from './curriculumData';

export type CopySegment =
  | { kind: 'text'; text: string }
  | { kind: 'fact'; label: string; fact: FactInfo; color: string }
  | { kind: 'link'; label: string; to: string };

/** A resolved fact span: the fact, and the colour to draw its badge in. */
export interface ResolvedFact {
  fact: FactInfo;
  color: string;
}

/** Turns fact spans into facts (inlineFactResolver.ts). */
export interface FactResolver {
  /** [*g* as in *word*, …] or [*g*]: the starred tokens, lowercased. */
  starred(tokens: string[]): ResolvedFact | null;
  /** [g]: a bare spelling, lowercased; null when it isn't one ([sic]). */
  bare(spelling: string): ResolvedFact | null;
}

export function splitInlineFacts(text: string, resolver: FactResolver | null): CopySegment[] {
  const out: CopySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\](?:\(([^)\s]+)\))?/g)) {
    const label = m[1];
    if (m[2]) {
      if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
      out.push({ kind: 'link', label, to: m[2] });
      last = m.index + m[0].length;
      continue;
    }
    const tokens = starred(label);
    const bare =
      !tokens.length && /^[a-z_]+$/i.test(label.trim()) ? (resolver?.bare(label.trim().toLowerCase()) ?? null) : null;
    if (!tokens.length && !bare) continue; // not a fact span: stays in the text
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    const resolved = bare ?? resolver?.starred(tokens) ?? null;
    if (resolved) {
      out.push({ kind: 'fact', label, ...resolved });
    } else {
      if (resolver && import.meta.env?.DEV) console.warn(`[curriculum copy] can't resolve "[${label}]" to a fact`);
      out.push({ kind: 'text', text: label });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const starred = (label: string) => [...label.matchAll(/\*([^*]+)\*/g)].map((t) => t[1].toLowerCase());
