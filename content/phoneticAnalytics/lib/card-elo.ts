/**
 * Seed ELO for a generated card — the pipeline's difficulty estimate.
 *
 * Shared by deploy-content (the card's `seedElo`) and the app's curriculum
 * simulation (scripts/simulate-curriculum.ts), which needs the same
 * difficulty ladder to model which cards a learner meets when.
 *
 * Users start at ELO 1000. Card ELO floor is 1100 (100 above user) so the
 * learner always "reaches up" into the content. The spread is wide enough
 * for the ELO navigator (rawScore = 1 - distance/500) and eloDistance filter
 * (Gaussian halfLife=200) to create meaningful differentiation, while keeping
 * substantial cross-type overlap so users encounter a mix of question types.
 *
 * Tiers (conservative spread, overlapping by design):
 *   GpcIntro  1000        — gates, not scored
 *   WST       1100–1250   — letter/phoneme recognition (foundational)
 *   WS        1200–1450   — minimal-pair word discrimination
 *   ML        1350–1600   — fill-in-the-blank with visible context
 *   SQ        1500–1900   — full word spelling from constituent phonemes,
 *                           then −120…+240 for spelling ambiguity
 *
 * Cross-type overlap is intentional: simple spelling ("it", "cat") should be
 * reachable before complex ML cards ("s___t" for "sight"). Users should
 * encounter a mix of question types within a few sessions.
 *
 * SQ also carries a spelling-ambiguity term (see {@link spellingAmbiguityElo}),
 * which spreads the tier by −120…+240 around its structural score.
 *
 * ±10 jitter to break ties without obscuring the difficulty signal. `rng`
 * defaults to Math.random; pass a seeded one for deterministic output
 * (deploy-content uses {@link seededRng} on the card id, so a redeploy
 * re-stamps the same seed and a seed change is exactly the authored change).
 */
export interface EloSeedableCard {
  questionType: string;
  data: Record<string, unknown>;
  tags: string[];
}

/**
 * P(grapheme | phoneme) per GPC short id (`k-K` → 0.37), as the GPC catalogue
 * carves phonemes (so `i-AY-final` is its own class, apart from `i_e-AY`).
 */
export type GpcSpellingOdds = ReadonlyMap<string, number>;

export interface SeedContext {
  /** Enables the SQ ambiguity term. Without it, seeds are structural only. */
  spellingOdds?: GpcSpellingOdds;
}

/** ELO per bit of spelling surprisal, relative to {@link AMBIGUITY_CENTER_BITS}. */
export const AMBIGUITY_ELO_PER_BIT = 60;
/**
 * Median surprisal over the non-sight-word SQ cards (2026-10-26: 1.23), so
 * the term reorders cards within the SQ tier rather than moving the tier.
 */
export const AMBIGUITY_CENTER_BITS = 1.2;
export const AMBIGUITY_MIN_ELO = -120;
export const AMBIGUITY_MAX_ELO = 240;
/** Floor on P(grapheme | phoneme), so one rare GPC can't dominate the sum. */
const MIN_SPELLING_ODDS = 1e-3;

/** A corpus word as `outputs-v2/teaching-words.json` lists it. */
export interface CorpusWord {
  word: string;
  /** GPC ids in spelling order, e.g. `["GPC-d-D", "GPC-o-AA", "GPC-g-G", "GPC-s-Z"]`. */
  gpcs: string[];
}

/**
 * Whether a word's final `s` is the plural / third-person suffix ("dogs",
 * "looks"): its stem is itself a corpus word of 3+ letters. Short stems are
 * left alone, so "has", "his", "yes", "us" keep their `s`.
 */
function hasInflectionalS(word: string, lastGpc: string, known: ReadonlySet<string>): boolean {
  if (lastGpc !== "s-Z" && lastGpc !== "s-S") return false;
  if (!word.endsWith("s") || word.endsWith("ss")) return false;
  const stem = word.slice(0, -1);
  return stem.length >= 3 && known.has(stem);
}

/**
 * Build {@link GpcSpellingOdds} from `outputs-v2/teaching-words.json`, by
 * word type (a speller chooses per word, not per token). A GPC's phoneme
 * class is its id after the grapheme (`i-AY-final` → `AY-final`), as the
 * catalogue carves it.
 *
 * The plural / third-person `s` is left out. Grammar picks it, not a spelling
 * choice, and counting it would make /z/ look like an `s` sound (90% of /z/
 * words), so `z` in "zip" and `zz` in "buzz" would read as wildly unlikely.
 */
export function gpcSpellingOdds(words: readonly CorpusWord[]): GpcSpellingOdds {
  const known = new Set(words.map((w) => w.word));
  const byGpc = new Map<string, number>();
  const byClass = new Map<string, number>();
  for (const w of words) {
    const gpcs = w.gpcs.map((g) => g.replace(/^GPC-/, ""));
    const skipLast = hasInflectionalS(w.word, gpcs[gpcs.length - 1], known);
    gpcs.forEach((gpc, i) => {
      if (skipLast && i === gpcs.length - 1) return;
      if (gpc.startsWith("WORD-") || gpc.endsWith("-silent-split")) return;
      const cls = gpc.slice(gpc.indexOf("-") + 1);
      byGpc.set(gpc, (byGpc.get(gpc) ?? 0) + 1);
      byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
    });
  }
  const odds = new Map<string, number>();
  for (const [gpc, n] of byGpc) {
    odds.set(gpc, n / byClass.get(gpc.slice(gpc.indexOf("-") + 1))!);
  }
  return odds;
}

/**
 * Spelling surprisal of a card's exercise GPCs: Σ −log₂ P(grapheme | phoneme).
 * How many plausible spellings the learner must choose between, with no
 * positional rules (c before a/o/u, k before e/i/y): LP doesn't teach them.
 */
export function spellingAmbiguityBits(tags: string[], odds: GpcSpellingOdds): number {
  let bits = 0;
  for (const tag of tags) {
    if (!tag.startsWith("gpc:exercise:")) continue;
    const p = odds.get(tag.slice("gpc:exercise:".length));
    if (p !== undefined) bits -= Math.log2(Math.max(p, MIN_SPELLING_ODDS));
  }
  return bits;
}

/**
 * The SQ ambiguity term: a word whose sounds have several common spellings
 * ("kids": c or k? s or z?) is harder to spell than one with a single sensible
 * spelling ("pig"), even when the two are equally long. Sight words are left
 * out: their odd part is a recall, not a choice among spellings.
 */
export function spellingAmbiguityElo(tags: string[], odds: GpcSpellingOdds | undefined): number {
  if (!odds || tags.some((t) => t.startsWith("gpc:exercise:WORD-"))) return 0;
  const bits = spellingAmbiguityBits(tags, odds);
  const elo = Math.round(AMBIGUITY_ELO_PER_BIT * (bits - AMBIGUITY_CENTER_BITS));
  return Math.min(AMBIGUITY_MAX_ELO, Math.max(AMBIGUITY_MIN_ELO, elo));
}

/** A jitter source that always lands mid-range: the seed with jitter removed. */
export const NO_JITTER = (): number => 0.5;

/** Deterministic rng in [0, 1) keyed by a string (FNV-1a → mulberry32). */
export function seededRng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeInitialElo(
  card: EloSeedableCard,
  rng: () => number = Math.random,
  ctx: SeedContext = {},
): number {
  const tags = new Set(card.tags);
  const jitter = Math.round((rng() - 0.5) * 20);

  if (card.questionType === "MissingLetters") {
    // ML: 1350–1600 — bridges WS and SQ.
    // Single-blank fill-in-the-blank with visible context letters.
    let score = 1350;
    // Blank position: onset is easiest (most salient), coda harder, medial vowel hardest
    const blankStr = card.data.blanks as string || "";
    const word = card.data.word as string || "";
    const blankIndices = blankStr.split(",").map(Number);
    const isOnset = blankIndices.includes(0);
    const isCoda = blankIndices.includes(word.length - 1);
    if (!isOnset && !isCoda) score += 60; // medial — hardest
    else if (isCoda) score += 30;
    // else onset: +0
    // Complex GPC blank (digraph, split digraph, soft consonant) is harder
    if (tags.has("concept:match:digraph")) score += 35;
    if (tags.has("concept:match:split_digraph")) score += 35;
    if (tags.has("concept:consonant:soft")) score += 30;
    if (tags.has("concept:vowel:teams")) score += 30;
    if (tags.has("concept:vowel:r_controlled")) score += 30;
    // More blanks (e.g., digraph = 2 positions) slightly harder
    if (blankIndices.length >= 2) score += 15;
    // A sight word's odd part (w_s): recalling the spelling that breaks the
    // rules, above its fair blanks and short of spelling it outright
    if (card.tags.some((t) => t.startsWith("gpc:exercise:WORD-"))) score += 80;
    return score + jitter;
  }

  if (card.questionType === "WhoSaidThat") {
    // WST: 1100–1250 — foundation tier, closest to user's init ELO.
    let score = 1100;
    // Long vowels (split digraph) are harder — short/long distinction
    if (tags.has("concept:match:split_digraph")) score += 35;
    // Soft c/g — earliest phonetic ambiguity
    if (tags.has("concept:consonant:soft")) score += 40;
    // Focus group cards: visual confusables (b/d, p/q) are the canonical
    // early-literacy struggle; voicing pairs are a smaller bump
    if (tags.has("concept:interference:visual")) score += 70;
    else if (tags.has("concept:interference:voicing")) score += 35;
    return score + jitter;
  }

  if (card.questionType === "WordSelection") {
    // WS: 1200–1450 — mid tier, onset-diff easiest.
    let score = 1200;
    // Diff position: onset is easiest, final harder, medial vowel hardest
    if (tags.has("concept:skill:final-phoneme-diff")) score += 60;
    if (tags.has("concept:skill:medial-vowel-diff")) score += 120;
    // More distractors = harder
    const distractors = (card.data.distractors as string || "").split(",").filter(Boolean);
    if (distractors.length >= 3) score += 50;
    else if (distractors.length >= 2) score += 25;
    return score + jitter;
  }

  if (card.questionType === "SpellingQuestion") {
    // SQ: 1500–1900 — top tier, but simple words overlap with ML range.
    let score = 1500;
    // More GPCs = longer word = harder
    const gpcCount = card.tags.filter((t) => t.startsWith("gpc:exercise:")).length;
    score += Math.max(0, gpcCount - 2) * 45;
    // Non-simple GPC concepts add difficulty (digraphs, vowel teams, etc.)
    const complexConcepts = [
      "concept:match:digraph",
      "concept:match:split_digraph",
      "concept:match:silent",
      "concept:match:whole_word",
      "concept:vowel:teams",
      "concept:vowel:r_controlled",
      "concept:vowel:l_controlled",
      "concept:consonant:doubled",
      "concept:consonant:soft",
    ];
    const complexCount = complexConcepts.filter((c) => tags.has(c)).length;
    score += complexCount * 35;
    score += spellingAmbiguityElo(card.tags, ctx.spellingOdds);
    return score + jitter;
  }

  if (
    card.questionType === "GpcIntro" ||
    card.questionType === "DigraphGpcIntro" ||
    card.questionType === "SplitDigraphIntro" ||
    card.questionType === "SightWordIntro"
  ) {
    // Intro cards are binary completion gates, not scored exercises.
    // ELO is irrelevant — evaluate() always returns 1.
    return 1000;
  }

  // Fallback for any future question types
  return 1100 + jitter;
}
