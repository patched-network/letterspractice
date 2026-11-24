/**
 * Generate Reachable-Words Table
 * ==============================
 *
 * Emits a TRIMMED, child-independent word table for the LettersPractice
 * webapp's /progress "words within reach" feature.
 *
 * The table is static: each row is a candidate word plus the catalogue GPC
 * IDs it requires (`g`), its SUBTLEX frequency (`f`) and its phonics pattern
 * (`p`). The per-child, over-time question — "which of these can THIS reader
 * decode right now?" — is answered live in the browser by intersecting this
 * table with the child's known-GPC set (derived from their ELO tag scores).
 * Nothing here is personalized; it is just a slimmed copy of teaching-words.
 *
 * Source : outputs-v2/teaching-words.json  (full analytics record, ~1.7 MB)
 * Output : ../../../src/services/reachableWords/reachable-words.generated.json
 *
 * Run:  yarn gen:reachable   (from content/phoneticAnalytics)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  createWordFilter,
  DEFAULT_BLACKLIST,
  DEFAULT_PROPER_NOUNS,
} from '../lib/word-filter';
import { GPC_CATALOGUE } from '../lib/catalogue';
import {
  FREE_TIER_WORD_THRESHOLD,
  freeTierGraphemes,
} from '../lib/curriculum';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEACHING_WORDS_PATH = resolve(__dirname, '..', 'outputs-v2', 'teaching-words.json');
const OUTPUT_PATH = resolve(
  __dirname,
  '..', '..', '..',
  'src', 'services', 'reachableWords', 'reachable-words.generated.json',
);

/**
 * Companion artifact for the ENTITLEMENT counter (see writeFreeSlateMasks).
 * Deliberately separate from the table above: the entitlement count runs on
 * the study path, where paying 429 KB to load the full table would be absurd.
 */
const MASK_OUTPUT_PATH = resolve(
  __dirname,
  '..', '..', '..',
  'src', 'services', 'reachableWords', 'free-slate-masks.generated.json',
);

/**
 * GPCs treated as satisfied for free-tier reachability. Deliberately EMPTY.
 *
 * `src/services/reachableWords/index.ts` has an `ALWAYS_KNOWN` set containing
 * `GPC-e-silent-split`, on the reasoning that a silent final e rides along
 * with the split vowel that gates it. That reasoning does not hold here, for
 * two reasons:
 *
 *  1. **Nothing gates it inside the free tier.** The split-digraph vowels are
 *     released by the `split-digraphs` lesson ("The Sneaky e"), which is not a
 *     free-tier lesson. Treating the silent e as free let 48 words into the
 *     free-slate table that no free-tier child has been taught to read —
 *     inflating the entitlement count by ~35 words at the wall.
 *  2. **Those 48 aren't sneaky-e words anyway.** They are `-nse`/`-lve`/`-nge`
 *     finals (`sense`, `solve`, `twelve`, `fringe`, `plunge`) where the e is
 *     silent for orthographic reasons — no English word ends in v, -ge keeps
 *     the soft g — a fact the curriculum never teaches at any point. A third
 *     of them were loanword noise the word filter had already let through
 *     (`blanche`, `frere`, `boche`, `tete`).
 *
 * So: no freebies. A word counts only when every GPC it needs is genuinely
 * released by a free-tier lesson. Ceiling 1,953 → 1,905.
 */
const ALWAYS_KNOWN = new Set<string>();

/** Minimum SUBTLEX frequency to include (drops ultra-rare junk). */
const MIN_FREQUENCY = 1;

interface TeachingWord {
  word: string;
  phonemes: string[];
  frequency: number;
  gpcs: string[];
  pattern: string;
  issues: string[];
  fullyAligned: boolean;
}

interface ReachableRow {
  /** word */
  w: string;
  /** frequency (SUBTLEX) */
  f: number;
  /** required catalogue GPC ids */
  g: string[];
  /** phonics pattern, e.g. CVC */
  p: string;
}

function main(): void {
  const raw = JSON.parse(readFileSync(TEACHING_WORDS_PATH, 'utf-8')) as {
    words: TeachingWord[];
  };

  // Conservative child-content filter: blacklist + proper nouns + freq floor.
  // We keep length unconstrained so genuinely-decodable longer words survive.
  const filter = createWordFilter({
    blacklist: DEFAULT_BLACKLIST,
    excludeProperNouns: true,
    properNouns: DEFAULT_PROPER_NOUNS,
    minFrequency: MIN_FREQUENCY,
  });

  const seen = new Set<string>();
  const rows: ReachableRow[] = [];
  let droppedUnaligned = 0;
  let droppedFiltered = 0;

  for (const tw of raw.words) {
    // Only words whose GPC decomposition is known-good — otherwise the
    // "all required GPCs known ⇒ decodable" inference does not hold.
    if (!tw.fullyAligned) {
      droppedUnaligned++;
      continue;
    }
    if (!filter.isAllowed(tw.word, tw.frequency)) {
      droppedFiltered++;
      continue;
    }
    const w = tw.word.toLowerCase();
    if (seen.has(w)) continue;
    seen.add(w);

    rows.push({ w, f: tw.frequency, g: tw.gpcs, p: tw.pattern });
  }

  // Most-relevant first; the app slices from the top.
  rows.sort((a, b) => b.f - a.f);

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'generate-reachable-words.ts',
      source: 'outputs-v2/teaching-words.json',
      wordCount: rows.length,
      droppedUnaligned,
      droppedFiltered,
      minFrequency: MIN_FREQUENCY,
    },
    words: rows,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(out));

  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`✓ Wrote ${rows.length} words → ${OUTPUT_PATH}`);
  console.log(`  ${(bytes / 1024).toFixed(0)} KB  (dropped ${droppedUnaligned} unaligned, ${droppedFiltered} filtered)`);

  writeFreeSlateMasks(rows);
}

/**
 * Emit the free-slate grapheme-bitmask table — the artifact the entitlement
 * counter runs on.
 *
 * ## What it is
 *
 * Only the words decodable with the free tier's whole slate survive (a word
 * needing anything outside it can never count before the wall fires, so it is
 * dead weight). Each survivor is reduced to a bitmask over the free slate's
 * *graphemes* — the predicate `LetterProgressionState.unlockedLetters`
 * actually supports; see `freeTierGraphemes()` for why grapheme and not GPC
 * id, and what that over-credits.
 *
 * Counting is then `(lo & ~knownLo) === 0 && (hi & ~knownHi) === 0` per row:
 * a couple of thousand integer ops, no allocation, ~30 KB of payload instead
 * of 429.
 *
 * ## Why two mask words
 *
 * JS bitwise operators coerce to **32-bit signed** ints, so a single-number
 * mask silently corrupts at the 32nd grapheme (`1 << 31` is negative). The
 * free slate is 34 graphemes today and grows if a GPC is ever re-homed into
 * it, so the mask is split across `lo` (bits 0-31) and `hi` (bits 32-63).
 * The 64-grapheme ceiling is asserted below rather than left to be discovered.
 */
function writeFreeSlateMasks(rows: ReachableRow[]): void {
  const byGrapheme = freeTierGraphemes(GPC_CATALOGUE);

  // Alphabetical bit assignment: deterministic, so the artifact diffs cleanly.
  const graphemes = [...byGrapheme.keys()].sort();
  if (graphemes.length > 64) {
    throw new Error(
      `Free slate has ${graphemes.length} graphemes; the two-word mask holds 64. ` +
        `Widen the encoding (BigInt or a third word) before growing the slate.`,
    );
  }

  const bitOf = new Map<string, number>(graphemes.map((g, i) => [g, i]));
  // Every released GPC id maps to its grapheme's bit — unlocking a grapheme
  // credits all the ids it carries (th → th-TH *and* th-DH).
  const bitOfGpc = new Map<string, number>();
  for (const [grapheme, ids] of byGrapheme) {
    for (const id of ids) bitOfGpc.set(id, bitOf.get(grapheme)!);
  }

  const words: string[] = [];
  const lo: number[] = [];
  const hi: number[] = [];

  for (const row of rows) {
    let maskLo = 0;
    let maskHi = 0;
    let inSlate = true;

    for (const id of row.g) {
      if (ALWAYS_KNOWN.has(id)) continue;
      const bit = bitOfGpc.get(id);
      if (bit === undefined) {
        inSlate = false; // needs a GPC the free tier never releases
        break;
      }
      if (bit < 32) maskLo |= 1 << bit;
      else maskHi |= 1 << (bit - 32);
    }

    if (!inSlate) continue;
    words.push(row.w); // rows are already frequency-desc
    lo.push(maskLo);
    hi.push(maskHi);
  }

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'generate-reachable-words.ts',
      threshold: FREE_TIER_WORD_THRESHOLD,
      graphemeCount: graphemes.length,
      wordCount: words.length,
      note:
        'Entitlement counter input. Bit i of (hi<<32|lo) = graphemes[i] required. ' +
        'Count = rows where every required grapheme is introduced.',
    },
    graphemes,
    words,
    lo,
    hi,
  };

  mkdirSync(dirname(MASK_OUTPUT_PATH), { recursive: true });
  writeFileSync(MASK_OUTPUT_PATH, JSON.stringify(out));

  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(
    `✓ Wrote ${words.length} free-slate words over ${graphemes.length} graphemes → ${MASK_OUTPUT_PATH}`,
  );
  console.log(
    `  ${(bytes / 1024).toFixed(0)} KB  (threshold ${FREE_TIER_WORD_THRESHOLD}; ceiling ${words.length})`,
  );
}

main();
