/**
 * Free-slate reachable-word counter — the entitlement metric
 * ==========================================================
 *
 * Answers one question, cheaply: **how many words can this child decode with
 * the graphemes they have been introduced to?** That number is the entitlement
 * boundary — the drip of new intros and lessons freezes for unpaid accounts
 * once it crosses `FREE_TIER_WORD_THRESHOLD`.
 *
 * ## Why this is not `../reachableWords`
 *
 * The sibling module answers a richer question for the /progress card —
 * per-word mastery tiers, one-away groups, showcase ordering — over the full
 * 5,627-word table (429 KB). That is fine on a route the parent opened
 * deliberately, and wrong on the study path, which is where the entitlement
 * count has to run.
 *
 * So the pipeline emits a second, much smaller artifact
 * (`free-slate-masks.generated.json`, ~34 KB): only the words the free tier
 * can ever reach, each reduced to a bitmask over the free slate's graphemes.
 * Counting is then a couple of thousand integer ops — ~0.03 ms — with no
 * allocation. Both artifacts come from `generate-reachable-words.ts`, so they
 * cannot describe different corpora.
 *
 * ## The predicate: introduced, not mastered
 *
 * This counts **introduced** graphemes (`LetterProgressionState.unlockedLetters`,
 * written by `recordGpcIntroComplete`), deliberately — *not* the `solid`
 * (mastered) or `stretch` (seen) tiers the /progress card uses. The free
 * tier's job is to master what it introduced, so the gate closes on
 * introduction and mastery is left free forever.
 *
 * Consequence worth knowing when the two numbers are shown near each other:
 * this count is always ≥ the /progress card's "can likely sound out" figure.
 */

import { FREE_TIER_WORD_THRESHOLD } from '../curriculum';

export { FREE_TIER_WORD_THRESHOLD };

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------

export interface FreeSlateTable {
  /** Grapheme at bit index i. */
  graphemes: string[];
  /** Word at row i (frequency-descending). */
  words: string[];
  /** Row i's required-grapheme mask, bits 0-31. */
  lo: number[];
  /** Row i's required-grapheme mask, bits 32-63. */
  hi: number[];
  meta: { threshold: number; graphemeCount: number; wordCount: number };
}

let _table: FreeSlateTable | null = null;
let _loading: Promise<FreeSlateTable> | null = null;

/**
 * Load (once) the free-slate mask table.
 *
 * Concurrent callers share one import — the study path can ask for this from
 * several places in the same tick (intro completion, hub render, filter).
 */
export async function loadFreeSlateTable(): Promise<FreeSlateTable> {
  if (_table) return _table;
  if (_loading) return _loading;
  _loading = import('./free-slate-masks.generated.json').then((mod) => {
    _table = (mod.default ?? mod) as unknown as FreeSlateTable;
    _loading = null;
    return _table;
  });
  return _loading;
}

/** The loaded table, or null if it hasn't been loaded yet. */
export function getFreeSlateTableSync(): FreeSlateTable | null {
  return _table;
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/**
 * Build the two-word "known" mask for a set of introduced graphemes.
 *
 * Graphemes outside the free slate (there are none today, but a re-home could
 * introduce some) are ignored rather than throwing: they cannot make a
 * free-slate word decodable, so they cannot change the count.
 *
 * Split across two words because JS bitwise operators coerce to 32-bit signed
 * ints, and the slate is 34 graphemes wide — see the generator's
 * `writeFreeSlateMasks` docblock.
 */
function knownMask(
  table: FreeSlateTable,
  graphemes: readonly string[],
): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (const raw of graphemes) {
    const bit = table.graphemes.indexOf(raw.toLowerCase());
    if (bit < 0) continue;
    if (bit < 32) lo |= 1 << bit;
    else hi |= 1 << (bit - 32);
  }
  return { lo, hi };
}

/**
 * Count the words decodable with exactly this set of introduced graphemes.
 *
 * A word counts when every grapheme it requires is introduced — a conjunctive
 * test, which is why the count grows convexly rather than linearly as
 * graphemes accumulate.
 */
export function countReachable(
  table: FreeSlateTable,
  graphemes: readonly string[],
): number {
  const { lo: kl, hi: kh } = knownMask(table, graphemes);
  const { lo, hi } = table;
  let n = 0;
  for (let i = 0; i < lo.length; i++) {
    if ((lo[i] & ~kl) === 0 && (hi[i] & ~kh) === 0) n++;
  }
  return n;
}

/** Convenience: load the table if needed, then count. */
export async function countReachableWords(
  graphemes: readonly string[],
): Promise<number> {
  if (!graphemes.length) return 0;
  const table = await loadFreeSlateTable();
  return countReachable(table, graphemes);
}

/**
 * The highest-frequency decodable words for this grapheme set.
 *
 * For the milestone surface — "here is some of what they can read now."
 * Rows are already frequency-descending, so this is a prefix scan.
 */
export function reachableSample(
  table: FreeSlateTable,
  graphemes: readonly string[],
  limit = 12,
): string[] {
  const { lo: kl, hi: kh } = knownMask(table, graphemes);
  const { lo, hi, words } = table;
  const out: string[] = [];
  for (let i = 0; i < lo.length && out.length < limit; i++) {
    if ((lo[i] & ~kl) === 0 && (hi[i] & ~kh) === 0) out.push(words[i]);
  }
  return out;
}

/** Has this grapheme set reached the free-tier ceiling? */
export function isAtThreshold(count: number): boolean {
  return count >= FREE_TIER_WORD_THRESHOLD;
}
