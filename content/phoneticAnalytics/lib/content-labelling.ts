/**
 * Shared content labelling types and constructors
 *
 * Centralises typed helpers for:
 * - GPC-derived navigation tags
 * - deterministic GPC-derived card IDs
 *
 * The semantic baseline is the catalogue GPC id (`GPC-*`).
 * Tags and deterministic card IDs should flow from that baseline rather than
 * being hand-assembled at call sites.
 *
 * This is the canonical home, importable by both the content pipeline
 * (scripts/) and the app (src/services/contentLabelling re-exports this
 * module as a façade).
 */

import type { ArpabetPhoneme } from './types';

export const GPC_PREFIX = 'GPC-' as const;
export const CARD_PREFIX_INTRO = 'c-intro-' as const;
export const CARD_PREFIX_DIGRAPH_INTRO = 'c-digraph-intro-' as const;
export const CARD_PREFIX_SPLIT_INTRO = 'c-split-intro-' as const;
export const CARD_PREFIX_SIGHT_INTRO = 'c-sight-intro-' as const;
export const CARD_PREFIX_WST = 'c-wst-' as const;
export const CARD_PREFIX_WST_FG = 'c-wst-fg-' as const;
export const CARD_PREFIX_ML = 'c-ml-' as const;
export const CARD_PREFIX_SPELLING = 'c-spelling-' as const;
export const GPC_TAG_PREFIX = 'gpc:' as const;

/**
 * Minimal branded helper.
 * Brands improve intent at compile time without changing runtime values.
 */
type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/**
 * ARPAbet token fragment used in GPC catalogue ids after the grapheme dash.
 *
 * Note:
 * - catalogue ids may include underscore-joined multi-phoneme forms such as `K_S`
 * - some ids also include suffixes such as `-final`
 *
 * This type intentionally stays permissive enough to cover current catalogue
 * reality without pretending to fully validate every semantic variant.
 */
export type ArpabetTokenFragment =
  | ArpabetPhoneme
  | `${ArpabetPhoneme}_${ArpabetPhoneme}`
  | `${ArpabetPhoneme}_${ArpabetPhoneme}_${ArpabetPhoneme}`;

/**
 * Canonical catalogue identity.
 *
 * We keep the suffix wide because catalogue ids can contain:
 * - simple grapheme + phoneme: `GPC-sh-SH`
 * - multi-phoneme values: `GPC-x-K_S`
 * - position suffixes: `GPC-e-IY-final`
 * - whole-word ids: `GPC-WORD-the`
 *
 * Runtime validation helpers below provide the practical guardrails.
 */
export type GpcId = Brand<`GPC-${string}`, 'GpcId'>;
export type GpcShortId = Brand<string, 'GpcShortId'>;

export type GpcRole = 'intro' | 'exercise' | 'expose';
export type GpcTag<R extends GpcRole = GpcRole> = Brand<
  `gpc:${R}:${string}`,
  'GpcTag'
>;

export type IntroTag = GpcTag<'intro'>;
export type ExerciseTag = GpcTag<'exercise'>;
export type ExposeTag = GpcTag<'expose'>;

export type GpcIntroCardId = Brand<
  `c-intro-${string}`,
  'GpcIntroCardId'
>;
export type DigraphGpcIntroCardId = Brand<
  `c-digraph-intro-${string}`,
  'DigraphGpcIntroCardId'
>;
export type SplitDigraphIntroCardId = Brand<
  `c-split-intro-${string}`,
  'SplitDigraphIntroCardId'
>;
/** `c-sight-intro-<word>`: keyed by the word, not the GPC short id (`WORD-<word>`). */
export type SightWordIntroCardId = Brand<
  `c-sight-intro-${string}`,
  'SightWordIntroCardId'
>;
export type WhoSaidThatCardId = Brand<
  `c-wst-${string}`,
  'WhoSaidThatCardId'
>;
export type WhoSaidThatFocusGroupCardId = Brand<
  `c-wst-fg-${string}`,
  'WhoSaidThatFocusGroupCardId'
>;
export type MissingLettersCardId = Brand<
  `c-ml-${string}`,
  'MissingLettersCardId'
>;
export type SpellingCardId = Brand<
  `c-spelling-${string}`,
  'SpellingCardId'
>;

export type DeterministicGpcCardId =
  | GpcIntroCardId
  | DigraphGpcIntroCardId
  | SplitDigraphIntroCardId
  | SightWordIntroCardId
  | WhoSaidThatCardId;

export interface ParsedGpcTag<R extends GpcRole = GpcRole> {
  role: R;
  gpcId: GpcId;
  gpcShortId: GpcShortId;
}

export interface ParsedGpcIntroCardId {
  family: 'intro';
  cardId: GpcIntroCardId;
  gpcShortId: GpcShortId;
}

export interface ParsedDigraphGpcIntroCardId {
  family: 'digraph-intro';
  cardId: DigraphGpcIntroCardId;
  gpcShortId: GpcShortId;
}

export interface ParsedSplitDigraphIntroCardId {
  family: 'split-intro';
  cardId: SplitDigraphIntroCardId;
  gpcShortId: GpcShortId;
}

export interface ParsedSightWordIntroCardId {
  family: 'sight-intro';
  cardId: SightWordIntroCardId;
  /** `WORD-<word>` */
  gpcShortId: GpcShortId;
  word: string;
}

export interface ParsedWhoSaidThatCardId {
  family: 'wst';
  cardId: WhoSaidThatCardId;
  gpcShortId: GpcShortId;
}

export type ParsedDeterministicGpcCardId =
  | ParsedGpcIntroCardId
  | ParsedDigraphGpcIntroCardId
  | ParsedSplitDigraphIntroCardId
  | ParsedSightWordIntroCardId
  | ParsedWhoSaidThatCardId;

// ---------------------------------------------------------------------------
// Basic GPC identity helpers
// ---------------------------------------------------------------------------

export function asGpcId(value: string): GpcId {
  if (!isGpcId(value)) {
    throw new Error(`Invalid GPC id: ${value}`);
  }
  return value as GpcId;
}

export function isGpcId(value: string): value is GpcId {
  return value.startsWith(GPC_PREFIX) && value.length > GPC_PREFIX.length;
}

export function asGpcShortId(value: string): GpcShortId {
  return value as GpcShortId;
}

export function gpcShortId(gpcIdOrShortId: string): GpcShortId {
  const shortId = gpcIdOrShortId.startsWith(GPC_PREFIX)
    ? gpcIdOrShortId.slice(GPC_PREFIX.length)
    : gpcIdOrShortId;
  return shortId as GpcShortId;
}

export function gpcIdFromShortId(shortId: string): GpcId {
  return `${GPC_PREFIX}${shortId}` as GpcId;
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

export function gpcTag<R extends GpcRole>(role: R, gpcId: string): GpcTag<R> {
  return `gpc:${role}:${gpcShortId(gpcId)}` as GpcTag<R>;
}

export function gpcIntroTag(gpcId: string): IntroTag {
  return gpcTag('intro', gpcId);
}

export function gpcExerciseTag(gpcId: string): ExerciseTag {
  return gpcTag('exercise', gpcId);
}

export function gpcExposeTag(gpcId: string): ExposeTag {
  return gpcTag('expose', gpcId);
}

export function isGpcTag(value: string): value is GpcTag {
  return /^(gpc):(intro|exercise|expose):.+$/.test(value);
}

export function tagRole(tag: string): GpcRole | null {
  const match = tag.match(/^gpc:(intro|exercise|expose):.+$/);
  return match ? (match[1] as GpcRole) : null;
}

export function tagToGpcId(tag: string): GpcId | null {
  const match = tag.match(/^gpc:(intro|exercise|expose):(.+)$/);
  return match ? gpcIdFromShortId(match[2]) : null;
}

export function parseGpcTag(tag: string): ParsedGpcTag | null {
  const match = tag.match(/^gpc:(intro|exercise|expose):(.+)$/);
  if (!match) return null;

  const role = match[1] as GpcRole;
  const shortId = asGpcShortId(match[2]);

  return {
    role,
    gpcShortId: shortId,
    gpcId: gpcIdFromShortId(shortId),
  };
}

// ---------------------------------------------------------------------------
// Deterministic GPC-derived card id helpers
// ---------------------------------------------------------------------------

export function gpcIntroCardId(gpcId: string): GpcIntroCardId {
  return `${CARD_PREFIX_INTRO}${gpcShortId(gpcId)}` as GpcIntroCardId;
}

export function digraphGpcIntroCardId(gpcId: string): DigraphGpcIntroCardId {
  return `${CARD_PREFIX_DIGRAPH_INTRO}${gpcShortId(gpcId)}` as DigraphGpcIntroCardId;
}

export function splitDigraphIntroCardId(gpcId: string): SplitDigraphIntroCardId {
  return `${CARD_PREFIX_SPLIT_INTRO}${gpcShortId(gpcId)}` as SplitDigraphIntroCardId;
}

const SIGHT_WORD_SHORT_ID_PREFIX = 'WORD-';

/** A sight word's intro card: `GPC-WORD-said` → `c-sight-intro-said`. */
export function sightWordIntroCardId(gpcId: string): SightWordIntroCardId {
  const shortId = gpcShortId(gpcId);
  const word = shortId.startsWith(SIGHT_WORD_SHORT_ID_PREFIX)
    ? shortId.slice(SIGHT_WORD_SHORT_ID_PREFIX.length)
    : shortId;
  return `${CARD_PREFIX_SIGHT_INTRO}${word}` as SightWordIntroCardId;
}

export function whoSaidThatCardId(gpcId: string): WhoSaidThatCardId {
  return `${CARD_PREFIX_WST}${gpcShortId(gpcId)}` as WhoSaidThatCardId;
}

export function whoSaidThatFocusGroupCardId(
  groupName: string,
  correctLetter: string,
): WhoSaidThatFocusGroupCardId {
  return `${CARD_PREFIX_WST_FG}${groupName}-${correctLetter}` as WhoSaidThatFocusGroupCardId;
}

/**
 * MissingLetters exercise card id: `c-ml-<word>-<blanks>` where `blanks` is
 * the 0-based character position blanked (comma-joined when several blank
 * together, e.g. `c-ml-she-0,1` blanks the digraph). Mirrors the emission in
 * generate-cards.ts; test-cards asserts that ids referenced from
 * POST_LESSON_SEED_CARDS exist in the generated output, guarding drift.
 */
export function missingLettersCardId(
  word: string,
  blankIndices: number | readonly number[],
): MissingLettersCardId {
  const blanks = Array.isArray(blankIndices)
    ? blankIndices.join(',')
    : String(blankIndices);
  return `${CARD_PREFIX_ML}${word}-${blanks}` as MissingLettersCardId;
}

/** SpellingQuestion card id: `c-spelling-<word>` (generate-cards.ts). */
export function spellingCardId(word: string): SpellingCardId {
  return `${CARD_PREFIX_SPELLING}${word}` as SpellingCardId;
}

export function isGpcIntroCardId(value: string): value is GpcIntroCardId {
  return value.startsWith(CARD_PREFIX_INTRO);
}

export function isDigraphGpcIntroCardId(
  value: string,
): value is DigraphGpcIntroCardId {
  return value.startsWith(CARD_PREFIX_DIGRAPH_INTRO);
}

export function isSplitDigraphIntroCardId(
  value: string,
): value is SplitDigraphIntroCardId {
  return value.startsWith(CARD_PREFIX_SPLIT_INTRO);
}

export function isSightWordIntroCardId(value: string): value is SightWordIntroCardId {
  return value.startsWith(CARD_PREFIX_SIGHT_INTRO);
}

export function isWhoSaidThatCardId(value: string): value is WhoSaidThatCardId {
  return (
    value.startsWith(CARD_PREFIX_WST) &&
    !value.startsWith(CARD_PREFIX_WST_FG)
  );
}

export function isWhoSaidThatFocusGroupCardId(
  value: string,
): value is WhoSaidThatFocusGroupCardId {
  return value.startsWith(CARD_PREFIX_WST_FG);
}

export function parseGpcIntroCardId(
  cardId: string,
): ParsedGpcIntroCardId | null {
  if (!isGpcIntroCardId(cardId)) return null;

  const shortId = asGpcShortId(cardId.slice(CARD_PREFIX_INTRO.length));
  return {
    family: 'intro',
    cardId,
    gpcShortId: shortId,
  };
}

export function parseDigraphGpcIntroCardId(
  cardId: string,
): ParsedDigraphGpcIntroCardId | null {
  if (!isDigraphGpcIntroCardId(cardId)) return null;

  const shortId = asGpcShortId(cardId.slice(CARD_PREFIX_DIGRAPH_INTRO.length));
  return {
    family: 'digraph-intro',
    cardId,
    gpcShortId: shortId,
  };
}

export function parseSplitDigraphIntroCardId(
  cardId: string,
): ParsedSplitDigraphIntroCardId | null {
  if (!isSplitDigraphIntroCardId(cardId)) return null;

  const shortId = asGpcShortId(cardId.slice(CARD_PREFIX_SPLIT_INTRO.length));
  return {
    family: 'split-intro',
    cardId,
    gpcShortId: shortId,
  };
}

export function parseSightWordIntroCardId(
  cardId: string,
): ParsedSightWordIntroCardId | null {
  if (!isSightWordIntroCardId(cardId)) return null;

  const word = cardId.slice(CARD_PREFIX_SIGHT_INTRO.length);
  if (!word) return null;
  return {
    family: 'sight-intro',
    cardId,
    gpcShortId: asGpcShortId(`${SIGHT_WORD_SHORT_ID_PREFIX}${word}`),
    word,
  };
}

export function parseWhoSaidThatCardId(
  cardId: string,
): ParsedWhoSaidThatCardId | null {
  if (!isWhoSaidThatCardId(cardId)) return null;

  const shortId = asGpcShortId(cardId.slice(CARD_PREFIX_WST.length));
  return {
    family: 'wst',
    cardId,
    gpcShortId: shortId,
  };
}

export function parseDeterministicGpcCardId(
  cardId: string,
): ParsedDeterministicGpcCardId | null {
  return (
    parseSplitDigraphIntroCardId(cardId) ??
    parseDigraphGpcIntroCardId(cardId) ??
    parseGpcIntroCardId(cardId) ??
    parseSightWordIntroCardId(cardId) ??
    parseWhoSaidThatCardId(cardId)
  );
}