/**
 * Chunk Builder — converts alignment segments into PhoneticChunks
 *
 * Extracted from scripts/build-phonetic-index.ts so it can be unit-tested
 * from the phoneticAnalytics test suite.
 *
 * A PhoneticChunk is the atomic unit of the phonetic stepper UI:
 *   one chunk = one step = one phoneme playback + one set of visual letter effects.
 *
 * Key design decisions:
 *   - Every phoneme in the word gets its own chunk (flat structure).
 *   - Multi-phoneme GPC segments (e.g., "nk" → NG K) are split into
 *     multiple chunks, one per phoneme.
 *   - R-controlled and L-controlled vowels use mediation metadata
 *     (mediatedBy / mediates) to preserve the teaching relationship.
 *   - Split digraphs (e.g., a_e) merge the vowel and silent-e into one chunk.
 */

import { alignWord } from './alignment.js';
import { buildCatalogueIndex, GPC_CATALOGUE, type GPCCatalogueIndex } from './catalogue.js';
import type { AlignmentSegment, ArpabetPhoneme } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pronunciation overrides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard-coded pronunciation overrides that take precedence over CMUdict.
 *
 * Use this for words where CMUdict's default (first) pronunciation is the
 * casual/reduced form but we want the deliberate/isolation form for teaching.
 *
 * Each entry maps a lowercase word to its preferred ArpabetPhoneme array.
 * The build script should check this map before falling back to CMUdict.
 *
 * Sight words are included wholesale: the catalogue's whole-word pronunciation
 * is the one we teach (and record). Without this, a word whose CMUdict default
 * is some *other* variant never matches its whole-word GPC and silently falls
 * through to a per-grapheme parse — "was" (default W AA1 Z) was being tagged
 * a-AA, "live" (default L AY1 V, recorded short-i) i_e-AY.
 *
 * A word listed more than once (e.g. "ms": Miz, Miss) takes its first-listed
 * pronunciation — the catalogue lists the preferred reading first.
 */
const SIGHT_WORD_PRONUNCIATIONS: Record<string, ArpabetPhoneme[]> = {};
for (const gpc of GPC_CATALOGUE) {
  if (gpc.matchType !== 'whole_word' || gpc.grapheme in SIGHT_WORD_PRONUNCIATIONS) continue;
  SIGHT_WORD_PRONUNCIATIONS[gpc.grapheme] = gpc.phoneme.split(' ') as ArpabetPhoneme[];
}

export const PRONUNCIATION_OVERRIDES: Record<string, ArpabetPhoneme[]> = {
  ...SIGHT_WORD_PRONUNCIATIONS,

  // CMUdict default: AH0 N D (schwa — casual connected speech)
  // CMUdict alt:     AE1 N D (deliberate — said in isolation)
  // We prefer the deliberate form for phonics teaching.
  'and': ['AE', 'N', 'D'] as ArpabetPhoneme[],

  // CMUdict default: W IH1 DH (voiced /ð/ — common in connected speech)
  // CMUdict alt:     W IH1 TH  (voiceless /θ/ — deliberate/isolation form)
  // Our recorded audio uses voiceless TH; mismatch is jarring for learners.
  'with': ['W', 'IH', 'TH'] as ArpabetPhoneme[],
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PhoneticChunk {
  letters: { [index: number]: string | string[] };
  /** ARPAbet phoneme for this step (e.g., "SH", "AE", "K") */
  phoneme: string;
  /** Human-readable label — the grapheme text for this step */
  label?: string;
  /** Letter index of the controlling consonant that mediates this vowel's sound */
  mediatedBy?: number;
  /** Chunk index of the vowel step that this controller mediates */
  mediates?: number;
  /**
   * The chunk's GPC, when `label` + `phoneme` can't be trusted to resolve it.
   * Set on every sight-word chunk: the fair letters carry their regular GPC,
   * and the rest of the word carries the sight word's own (`GPC-WORD-said`),
   * so graders never credit e.g. `ai-EH` for the `ai` in "said".
   */
  gpcId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** GPC ID → category lookup, built once at module load */
const GPC_CATEGORY_MAP = new Map<string, string>();
for (const gpc of GPC_CATALOGUE) {
  GPC_CATEGORY_MAP.set(gpc.id, gpc.category);
}

/**
 * Map a consonant phoneme to the letter position(s) within a grapheme span
 * that most likely produce it.
 *
 * Returns absolute letter positions (not relative to grapheme start).
 */
function mapPhonemeToLetters(
  phoneme: string,
  word: string,
  startPos: number,
  endPos: number,
  alreadyClaimed: Set<number>,
): number[] {
  const phonemeToChar: Record<string, string> = {
    R: 'r', L: 'l', K: 'k', D: 'd', N: 'n', T: 't',
    B: 'b', F: 'f', G: 'g', M: 'm', P: 'p', S: 's',
    V: 'v', Z: 'z', W: 'w', H: 'h',
  };

  const expectedChar = phonemeToChar[phoneme];
  if (!expectedChar) return [];

  const positions: number[] = [];
  for (let pos = startPos; pos < endPos; pos++) {
    if (!alreadyClaimed.has(pos) && word[pos].toLowerCase() === expectedChar) {
      positions.push(pos);
    }
  }
  return positions;
}

/** Letter positions → `{ pos: 'speak' }`. */
function speakAt(positions: number[]): { [index: number]: string } {
  const letters: { [index: number]: string } = {};
  for (const pos of positions) letters[pos] = 'speak';
  return letters;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sight words
// ─────────────────────────────────────────────────────────────────────────────
//
// A sight word aligns as one whole-word segment. To let its fair letters step
// and grade like any other word's, it is re-aligned against the regular
// catalogue: fair segments keep their own GPC, and everything else — the part
// that doesn't play by the rules — resolves to the sight word's GPC. Which
// letters are fair falls out of the rule below; how the odd part's letters
// share its sounds is a guess, which a catalogue entry can overrule
// (GPCEntry.parts: of's f is its /v/, which no rule would say).

/**
 * Categories whose GPCs count as fair inside a sight word: the consonant
 * families. Vowels are where sight words break the rules, so only the primary
 * short vowels join them — the a in "have", the i in "live" — never a
 * secondary reading like the a in "was" (a-AH) or the o in "of" (o-AH).
 */
const FAIR_CATEGORIES: ReadonlySet<string> = new Set([
  'consonants',
  'consonants_soft',
  'digraphs',
  'trigraphs',
  'doubled_consonants',
  'silent_patterns',
  'latinate_digraphs',
]);
const PRIMARY_SHORT_VOWELS: ReadonlySet<string> = new Set([
  'GPC-a-AE',
  'GPC-e-EH',
  'GPC-i-IH',
  'GPC-o-AA',
  'GPC-u-AH',
]);

let regularIndex: GPCCatalogueIndex | null = null;

/** The catalogue minus whole-word GPCs: how a sight word would parse if it played fair. */
function getRegularIndex(): GPCCatalogueIndex {
  regularIndex ??= buildCatalogueIndex(GPC_CATALOGUE.filter((g) => g.matchType !== 'whole_word'));
  return regularIndex;
}

/** A single-sound segment governed by a fair GPC. */
function isFairSegment(segment: AlignmentSegment): boolean {
  if (!segment.aligned || !segment.gpcId || segment.grapheme.includes('_')) return false;
  if (segment.phoneme.split(' ').filter(Boolean).length !== 1) return false;
  const category = GPC_CATEGORY_MAP.get(segment.gpcId) ?? '';
  return FAIR_CATEGORIES.has(category) || PRIMARY_SHORT_VOWELS.has(segment.gpcId);
}

/**
 * Consonant letters in a run that make this phoneme by one of their own regular
 * readings: the s of "does" (s → /z/), which spelling alone doesn't place.
 */
function consonantsMaking(
  phoneme: string,
  word: string,
  start: number,
  end: number,
  alreadyClaimed: Set<number>,
): number[] {
  const byGrapheme = getRegularIndex().byGrapheme;
  return range(start, end).filter(
    (pos) =>
      !alreadyClaimed.has(pos) &&
      !'aeiou'.includes(word[pos]) &&
      (byGrapheme.get(word[pos]) ?? []).some((e) => e.phoneme === phoneme),
  );
}

/**
 * Chunks for a run of a sight word between fair letters: one per phoneme, all
 * carrying the sight word's GPC. A consonant phoneme after the first claims its
 * own letter where one matches (the d of "could"), or failing that one that
 * regularly makes it (the s of "does"); otherwise a phoneme spans the whole run.
 * A run with no phonemes ("have"'s e) gets no chunk.
 */
function remainderChunks(
  word: string,
  start: number,
  end: number,
  phonemes: string[],
  gpcId: string,
): PhoneticChunk[] {
  if (phonemes.length === 0) return [];
  const run = range(start, end);
  const claimed = new Set<number>();
  const followUps = phonemes.slice(1).map((phoneme) => {
    let positions = mapPhonemeToLetters(phoneme, word, start, end, claimed);
    if (positions.length === 0) positions = consonantsMaking(phoneme, word, start, end, claimed);
    for (const p of positions) claimed.add(p);
    return { phoneme, positions: positions.length > 0 ? positions : run };
  });
  const unclaimed = run.filter((p) => !claimed.has(p));
  const chunkOf = (phoneme: string, positions: number[]): PhoneticChunk => ({
    letters: speakAt(positions),
    phoneme,
    label: positions.map((p) => word[p]).join(''),
    gpcId,
  });
  return [
    chunkOf(phonemes[0], unclaimed.length > 0 ? unclaimed : run),
    ...followUps.map((f) => chunkOf(f.phoneme, f.positions)),
  ];
}

/**
 * Fair-letter chunks + remainder chunks for a sight word, in phoneme order, or
 * null when the fair letters can't be placed against the pronunciation (the
 * caller then falls back to whole-word chunks).
 */
function sightWordChunks(word: string, phonemes: string[], gpcId: string): PhoneticChunk[] | null {
  const alignment = alignWord(word, phonemes as ArpabetPhoneme[], getRegularIndex());
  const chunks: PhoneticChunk[] = [];
  let letterPos = 0;
  let phonemePos = 0;

  for (const segment of alignment.segments) {
    if (!isFairSegment(segment)) continue;
    const phoneme = segment.phoneme.trim();
    const at = phonemes.indexOf(phoneme, phonemePos);
    if (at < 0) return null;
    // Sounds before this fair letter with no letters left to carry them.
    if (segment.startPos === letterPos && at > phonemePos) return null;

    chunks.push(...remainderChunks(word, letterPos, segment.startPos, phonemes.slice(phonemePos, at), gpcId));
    chunks.push({
      letters: speakAt(range(segment.startPos, segment.endPos)),
      phoneme,
      label: segment.grapheme,
      gpcId: segment.gpcId!,
    });
    letterPos = segment.endPos;
    phonemePos = at + 1;
  }

  if (letterPos === word.length && phonemePos < phonemes.length) return null;
  chunks.push(...remainderChunks(word, letterPos, word.length, phonemes.slice(phonemePos), gpcId));
  return chunks;
}

/** Authored divisions (GPCEntry.parts), by word and pronunciation: "of:AH V" → "o|f". */
const SIGHT_WORD_PARTS = new Map<string, string>();
for (const gpc of GPC_CATALOGUE) {
  if (gpc.matchType === 'whole_word' && gpc.parts) SIGHT_WORD_PARTS.set(`${gpc.grapheme}:${gpc.phoneme}`, gpc.parts);
}

/** Where each part sits, left to right; a part repeating the one before reuses its letters. */
function placeParts(word: string, parts: string[]): number[][] | null {
  const placed: number[][] = [];
  let cursor = 0;
  for (const [i, part] of parts.entries()) {
    if (i > 0 && part === parts[i - 1]) {
      placed.push(placed[i - 1]);
      continue;
    }
    const at = word.indexOf(part, cursor);
    if (!part || at < 0) return null;
    placed.push(range(at, at + part.length));
    cursor = at + part.length;
  }
  return placed;
}

/**
 * A sight word's chunks as its catalogue entry divides it (GPCEntry.parts),
 * or null when it has no division. Only letters move: a chunk keeps the
 * guess's GPC where the guess had the same letters making the same sound (so
 * a fair letter stays fair), and otherwise carries the sight word's.
 */
function authoredSightWordChunks(
  word: string,
  phonemes: string[],
  gpcId: string,
  guessed: PhoneticChunk[] | null,
): PhoneticChunk[] | null {
  const spec = SIGHT_WORD_PARTS.get(`${word}:${phonemes.join(' ')}`);
  if (!spec) return null;
  const parts = spec.split('|');
  const placed = parts.length === phonemes.length ? placeParts(word, parts) : null;
  if (!placed) throw new Error(`Sight word "${word}": parts "${spec}" don't fit its letters and ${phonemes.length} sounds`);

  const key = (letters: object, phoneme: string) => `${Object.keys(letters).join(',')}:${phoneme}`;
  const guessedGpcs = new Map((guessed ?? []).map((c) => [key(c.letters, c.phoneme), c.gpcId]));
  return placed.map((positions, i) => {
    const letters = speakAt(positions);
    return { letters, phoneme: phonemes[i], label: parts[i], gpcId: guessedGpcs.get(key(letters, phonemes[i])) ?? gpcId };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert alignment segments to a flat array of PhoneticChunks.
 *
 * Each phoneme in the pronunciation gets exactly one chunk.
 * Multi-phoneme GPCs are handled as follows:
 *
 *   • r-controlled / l-controlled vowels:
 *       The vowel phoneme gets one chunk (with controller letters shown as
 *       r-control / l-control effects and a `mediatedBy` pointer).
 *       Each follow-up consonant phoneme gets its own chunk (with `mediates`
 *       pointing back to the vowel chunk index).
 *
 *   • Other multi-phoneme GPCs (e.g., "nk" → NG K, "an" → AH N, "x" → K S):
 *       Each phoneme gets its own chunk.  Letters are assigned to the phoneme
 *       they most likely produce (via `mapPhonemeToLetters`).  Letters that
 *       can't be assigned to a specific follow-up phoneme stay with the
 *       primary (first) phoneme.
 *
 *   • Split digraphs (e.g., a_e → EY):
 *       The vowel letter gets `speak` and the silent-e gets `silent-e`, all
 *       in a single chunk.
 */
export function alignmentToChunks(word: string, phonemes: ArpabetPhoneme[]): PhoneticChunk[] {
  const alignment = alignWord(word, phonemes);

  if (!alignment.fullyAligned) {
    // We still produce chunks — the caller (build script) can warn separately.
  }

  // ── Sight words (see "Sight words" above) ─────────────────────────────
  const sole = alignment.segments.length === 1 ? alignment.segments[0] : null;
  const sightWordGpcId = sole?.matchType === 'whole_word' ? sole.gpcId : null;
  if (sightWordGpcId) {
    const sightChunks = sightWordChunks(word, phonemes, sightWordGpcId);
    const authored = authoredSightWordChunks(word, phonemes, sightWordGpcId, sightChunks);
    if (authored) return authored;
    if (sightChunks) return sightChunks;
    // Otherwise whole-word chunks below, stamped with the sight word's GPC.
  }

  const chunks: PhoneticChunk[] = [];
  const processedSegmentIndices = new Set<number>();

  for (let i = 0; i < alignment.segments.length; i++) {
    if (processedSegmentIndices.has(i)) continue;

    const segment = alignment.segments[i];

    // ── Split digraph handling ──────────────────────────────────────────
    const isSplitDigraph = segment.grapheme.includes('_');

    if (isSplitDigraph) {
      const silentLetterChar = segment.grapheme.split('_')[1]; // e.g., "a_e" → "e"
      let silentSegmentIndex = -1;

      for (let j = i + 1; j < alignment.segments.length; j++) {
        if (
          alignment.segments[j].grapheme === silentLetterChar &&
          alignment.segments[j].phoneme === ''
        ) {
          silentSegmentIndex = j;
          break;
        }
      }

      const letterIndices: { [index: number]: string | string[] } = {};

      // Vowel letters → speak
      for (let pos = segment.startPos; pos < segment.endPos; pos++) {
        letterIndices[pos] = 'speak';
      }

      // Silent-e → silent-e
      if (silentSegmentIndex >= 0) {
        const silentSegment = alignment.segments[silentSegmentIndex];
        for (let pos = silentSegment.startPos; pos < silentSegment.endPos; pos++) {
          letterIndices[pos] = 'silent-e';
        }
        processedSegmentIndices.add(silentSegmentIndex);
      }

      const segmentPhonemes = segment.phoneme.split(' ');
      chunks.push({
        letters: letterIndices,
        phoneme: segmentPhonemes[0],
        label: segment.grapheme,
      });

      processedSegmentIndices.add(i);
      continue;
    }

    // ── Regular segments ────────────────────────────────────────────────
    const segmentPhonemes = segment.phoneme.split(' ');
    const primaryPhoneme = segmentPhonemes[0];

    // Skip segments with empty phonemes (orphaned silent letters)
    if (!primaryPhoneme) {
      processedSegmentIndices.add(i);
      continue;
    }

    const category = segment.gpcId ? GPC_CATEGORY_MAP.get(segment.gpcId) : null;
    const isRControlled = category === 'vowels_r_controlled' && segmentPhonemes.length > 1;
    const isLControlled = category === 'vowels_l_controlled' && segmentPhonemes.length > 1;

    if ((isRControlled || isLControlled) && segmentPhonemes.length > 1) {
      // ── R/L-controlled vowel (with mediation metadata) ──────────────
      const controlEffect = isRControlled ? 'r-control' : 'l-control';

      // Figure out which letters belong to follow-up phonemes
      const claimedByFollowUp = new Set<number>();
      const followUpAssignments: Array<{ phoneme: string; letterPositions: number[] }> = [];

      for (let pi = 1; pi < segmentPhonemes.length; pi++) {
        const ph = segmentPhonemes[pi];
        const positions = mapPhonemeToLetters(ph, word, segment.startPos, segment.endPos, claimedByFollowUp);
        for (const p of positions) claimedByFollowUp.add(p);
        followUpAssignments.push({ phoneme: ph, letterPositions: positions });
      }

      // Unclaimed letters are vowel letters for the primary phoneme.
      // Consonant-like unclaimed letters after the vowel cluster → controllers.
      const vowelPositions: number[] = [];
      const controllerPositions: number[] = [];

      for (let pos = segment.startPos; pos < segment.endPos; pos++) {
        if (claimedByFollowUp.has(pos)) {
          controllerPositions.push(pos);
        } else {
          const ch = word[pos].toLowerCase();
          const isConsonantLike = 'bcdfghjklmnpqrstvwxyz'.includes(ch);
          if (isConsonantLike && vowelPositions.length > 0) {
            controllerPositions.push(pos);
          } else {
            vowelPositions.push(pos);
          }
        }
      }

      // Build the vowel step (primary phoneme)
      const vowelLetterEffects: { [index: number]: string } = {};
      for (const pos of vowelPositions) vowelLetterEffects[pos] = 'speak';
      for (const pos of controllerPositions) vowelLetterEffects[pos] = controlEffect;

      const vowelLabel = vowelPositions.map((p) => word[p]).join('');
      const vowelChunkIndex = chunks.length;
      const firstControllerPos = controllerPositions.length > 0 ? controllerPositions[0] : undefined;

      const vowelChunk: PhoneticChunk = {
        letters: vowelLetterEffects,
        phoneme: primaryPhoneme,
        label: vowelLabel,
      };
      if (firstControllerPos !== undefined) {
        vowelChunk.mediatedBy = firstControllerPos;
      }
      chunks.push(vowelChunk);

      // Build follow-up steps
      for (const fu of followUpAssignments) {
        if (fu.letterPositions.length === 0) continue;

        const fuLetterEffects: { [index: number]: string } = {};
        for (const pos of fu.letterPositions) fuLetterEffects[pos] = 'speak';

        chunks.push({
          letters: fuLetterEffects,
          phoneme: fu.phoneme,
          label: fu.letterPositions.map((p) => word[p]).join(''),
          mediates: vowelChunkIndex,
        });
      }
    } else if (segmentPhonemes.length > 1) {
      // ── General multi-phoneme GPC (NOT r/l-controlled) ──────────────
      // Examples:
      //   "nk" → NG K   (digraph)
      //   "an" → AH N   (syllabic consonant)
      //   "x"  → K S    (single letter, two phonemes)
      //   "qu" → K W    (digraph, two phonemes)

      // Strategy: assign follow-up phonemes to specific letters first,
      // then give all remaining letters to the primary phoneme.
      const claimedByFollowUp = new Set<number>();
      const followUpAssignments: Array<{ phoneme: string; letterPositions: number[] }> = [];

      for (let pi = 1; pi < segmentPhonemes.length; pi++) {
        const ph = segmentPhonemes[pi];
        const positions = mapPhonemeToLetters(ph, word, segment.startPos, segment.endPos, claimedByFollowUp);
        for (const p of positions) claimedByFollowUp.add(p);
        followUpAssignments.push({ phoneme: ph, letterPositions: positions });
      }

      // All unclaimed letters belong to the primary phoneme
      const primaryPositions: number[] = [];
      for (let pos = segment.startPos; pos < segment.endPos; pos++) {
        if (!claimedByFollowUp.has(pos)) {
          primaryPositions.push(pos);
        }
      }

      // Primary phoneme chunk
      const primaryLetterEffects: { [index: number]: string } = {};
      for (const pos of primaryPositions) primaryLetterEffects[pos] = 'speak';

      chunks.push({
        letters: primaryLetterEffects,
        phoneme: primaryPhoneme,
        label: primaryPositions.map((p) => word[p]).join(''),
      });

      // Follow-up phoneme chunks
      for (const fu of followUpAssignments) {
        if (fu.letterPositions.length === 0) {
          // No specific letter matched (e.g., "x" → K S: S has no "s" letter).
          // Reuse all segment letters so the stepper still has something to highlight.
          const fallbackEffects: { [index: number]: string } = {};
          for (let pos = segment.startPos; pos < segment.endPos; pos++) {
            fallbackEffects[pos] = 'speak';
          }
          chunks.push({
            letters: fallbackEffects,
            phoneme: fu.phoneme,
            label: word.slice(segment.startPos, segment.endPos),
          });
        } else {
          const fuLetterEffects: { [index: number]: string } = {};
          for (const pos of fu.letterPositions) fuLetterEffects[pos] = 'speak';

          chunks.push({
            letters: fuLetterEffects,
            phoneme: fu.phoneme,
            label: fu.letterPositions.map((p) => word[p]).join(''),
          });
        }
      }
    } else {
      // ── Standard single-phoneme segment ─────────────────────────────
      const letterIndices: { [index: number]: string } = {};
      for (let pos = segment.startPos; pos < segment.endPos; pos++) {
        letterIndices[pos] = 'speak';
      }

      chunks.push({
        letters: letterIndices,
        phoneme: primaryPhoneme,
        label: segment.grapheme,
      });
    }

    processedSegmentIndices.add(i);
  }

  if (sightWordGpcId) {
    for (const chunk of chunks) chunk.gpcId = sightWordGpcId;
  }

  return chunks;
}