/**
 * Parent-legible label for a card id, for the /progress evidence hover.
 *
 * Id conventions (content/phoneticAnalytics/lib/content-labelling.ts,
 * generate-cards.ts):
 *   c-spelling-{word}          → the word
 *   c-ml-{word}-{blanks}       → the word  (blanks: "3" or "0,1")
 *   c-ws-{word}-{hash}         → the word
 *   c-wst-{gpcShortId}, c-wst-fg-…, c-intro-…, c-digraph-intro-…,
 *   c-split-intro-…            → the GPC's grapheme in quotes ("'sh' sound")
 *   c-sight-intro-{word}       → the word
 * Anything else falls back to the raw id.
 */

import {
  CARD_PREFIX_ML,
  CARD_PREFIX_SPELLING,
  CARD_PREFIX_WST_FG,
  parseDeterministicGpcCardId,
} from '../../tags';

const CARD_PREFIX_WS = 'c-ws-';

/** Word-bearing prefixes and whether the id carries a trailing `-segment`. */
const WORD_PREFIXES: ReadonlyArray<{ prefix: string; trailingSegment: boolean }> = [
  { prefix: CARD_PREFIX_SPELLING, trailingSegment: false },
  { prefix: CARD_PREFIX_ML, trailingSegment: true },
  { prefix: CARD_PREFIX_WS, trailingSegment: true },
];

/** The word a word-bearing card exercises, or null. */
export function wordFromCardId(cardId: string): string | null {
  for (const { prefix, trailingSegment } of WORD_PREFIXES) {
    if (!cardId.startsWith(prefix)) continue;
    const rest = cardId.slice(prefix.length);
    if (!trailingSegment) return rest || null;
    const cut = rest.lastIndexOf('-');
    const word = cut > 0 ? rest.slice(0, cut) : rest;
    return word || null;
  }
  return null;
}

/** Short label for the evidence strip: the word, a sound, or the raw id. */
export function labelForCardId(cardId: string): string {
  const word = wordFromCardId(cardId);
  if (word) return word;
  if (cardId.startsWith(CARD_PREFIX_WST_FG)) {
    // c-wst-fg-{group}-{letter}
    const letter = cardId.slice(cardId.lastIndexOf('-') + 1);
    return letter ? `'${letter}' sound` : cardId;
  }
  const gpc = parseDeterministicGpcCardId(cardId);
  if (gpc?.family === 'sight-intro') return gpc.word;
  if (gpc) {
    const grapheme = gpc.gpcShortId.split('-')[0];
    return grapheme ? `'${grapheme}' sound` : cardId;
  }
  return cardId;
}
