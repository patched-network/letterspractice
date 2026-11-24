/**
 * Contextual phoneme analysis for learner-produced letter strings.
 *
 * Given the word a learner actually assembled (e.g. "cace" for "cake" with a
 * wrong letter in a blank), predict what each position *sounds like in that
 * orthographic context* — soft c before e/i/y, split-digraph long vowels,
 * r-controlled teams, digraph merges — rather than the letter's canonical
 * isolated sound from LETTER_TO_ARPABET.
 *
 * Primary consumer: MissingLettersView's wrong-answer feedback, so the sayNo
 * contrast cue voices the sound the learner's string actually makes.
 *
 * Built on the oracle-free decode engine (content/phoneticAnalytics/lib/decode),
 * which simulates exactly this: what a reader would produce from spelling alone.
 */

import { decodeWord } from '../../../content/phoneticAnalytics/lib/decode';
import {
  GPC_CATALOGUE,
  buildCatalogueIndex,
  type GPCCatalogueIndex,
} from '../../../content/phoneticAnalytics/lib/catalogue';
import { phonemeSeqToId } from './arpabet';
import {
  getPhonemeAudioUrl,
  toPhonemeAudioKey,
  type PhonemeAudioKey,
} from './phonemeCache';
import { getArpabetForLetter } from '../../audio/letterToArpabet';
import type { PhoneticChunk, WordPhonetics } from '../phonetics.generated';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextualSoundKind =
  /** Decoded from the attempted string's orthographic context */
  | 'contextual'
  /** The position is silent in context (e.g. split-digraph final e) */
  | 'silent'
  /** Decode couldn't cover the position; canonical letter sound used instead */
  | 'fallback';

export interface ContextualLetterSound {
  /** Span of the decode segment containing this position [start, end) */
  span: { start: number; end: number };
  /** The grapheme the decoder grouped this position into (e.g. "ur", "ch") */
  grapheme: string;
  /** Catalogue GPC id backing the prediction (null for fallback/unknown) */
  gpcId: string | null;
  /** Raw decoded phoneme string ("K S" possible, "" when silent) */
  phoneme: string;
  /**
   * Ordered audio keys to voice this grapheme. Usually one; compound sounds
   * with recorded audio (K_S, K_W) collapse to one; other multi-phoneme
   * segments list each phoneme for sequential playback. Empty when silent.
   */
  audioKeys: PhonemeAudioKey[];
  /** Resolved audio URLs, parallel to audioKeys */
  audioUrls: string[];
  kind: ContextualSoundKind;
  /** Decoder flagged competing GPC interpretations at this position */
  ambiguous: boolean;
  confidence: number;
  alternativePhonemes: string[];
  /**
   * Category A flag: the contextual sound equals the target word's sound at
   * this position — the learner chose a *phonetically correct* grapheme that
   * this word happens not to use (k for c in "cape", z for s in "his").
   * Callers may want distinct feedback: a plain "no" while voicing the exact
   * target sound is incoherent messaging.
   */
  matchesTarget: boolean;
}

export interface AttemptAnalysis {
  /** The analyzed (lowercased) letter string */
  attempted: string;
  /** Per-position analysis; index = position in `attempted` */
  positions: ContextualLetterSound[];
}

// ---------------------------------------------------------------------------
// Decode index (sight words excluded)
// ---------------------------------------------------------------------------

/**
 * Whole-word (sight word) GPCs are excluded: if a learner's wrong letter
 * happens to assemble a sight word ("was", "one"), we still want per-grapheme
 * sounds for the position they typed, not one segment swallowing the word.
 */
let _decodeIndex: GPCCatalogueIndex | null = null;

function getContextualDecodeIndex(): GPCCatalogueIndex {
  if (!_decodeIndex) {
    _decodeIndex = buildCatalogueIndex(
      GPC_CATALOGUE.filter((gpc) => gpc.matchType !== 'whole_word'),
    );
  }
  return _decodeIndex;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a decoded phoneme string to playable audio keys.
 * Returns null when nothing playable could be resolved.
 */
function resolveAudioKeys(phoneme: string): PhonemeAudioKey[] | null {
  const trimmed = phoneme.trim();
  if (!trimmed) return [];

  // Single phoneme, or a compound with its own recording (K_S, K_W)
  try {
    return [toPhonemeAudioKey(trimmed)];
  } catch {
    // Multi-phoneme without a compound recording (e.g. "AO R"): voice each part
    const parts: PhonemeAudioKey[] = [];
    for (const part of trimmed.split(/\s+/)) {
      try {
        parts.push(toPhonemeAudioKey(part));
      } catch {
        return null;
      }
    }
    return parts.length > 0 ? parts : null;
  }
}

/** The target word's chunk covering a given position, if any. */
function targetChunkAt(
  target: WordPhonetics | null | undefined,
  pos: number,
): PhoneticChunk | null {
  if (!target) return null;
  return (
    target.chunks.find((c) =>
      Object.keys(c.letters).map(Number).includes(pos),
    ) ?? null
  );
}

/** Compare a decoded phoneme string against a target chunk's phoneme. */
function soundMatchesChunk(phoneme: string, chunk: PhoneticChunk | null): boolean {
  if (!chunk) return false;
  const decoded = phoneme.trim();
  const expected = String(chunk.phoneme).trim();
  if (!decoded || !expected) return false;
  // Normalize both through seq→id form so "K S" and "K_S" compare equal
  return phonemeSeqToId(decoded) === phonemeSeqToId(expected);
}

function fallbackSound(
  letter: string,
  pos: number,
  target: WordPhonetics | null | undefined,
): ContextualLetterSound {
  const key = getArpabetForLetter(letter);
  const audioKeys: PhonemeAudioKey[] = key ? [key] : [];
  return {
    span: { start: pos, end: pos + 1 },
    grapheme: letter,
    gpcId: null,
    phoneme: key ?? '',
    audioKeys,
    audioUrls: audioKeys.map(getPhonemeAudioUrl),
    kind: 'fallback',
    ambiguous: false,
    confidence: 0,
    alternativePhonemes: [],
    matchesTarget: soundMatchesChunk(key ?? '', targetChunkAt(target, pos)),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a learner-produced letter string, predicting the contextual sound
 * at every position.
 *
 * @param attempted The letter string the learner assembled (target word with
 *                  their typed letters substituted into the blanks)
 * @param target    Phonetics of the intended word, for matchesTarget flags
 */
export function analyzeAttempt(
  attempted: string,
  target?: WordPhonetics | null,
): AttemptAnalysis {
  const word = attempted.toLowerCase();
  const result = decodeWord(word, getContextualDecodeIndex());

  const positions: ContextualLetterSound[] = [];

  for (let pos = 0; pos < word.length; pos++) {
    const seg = result.segments.find(
      (s) => pos >= s.startPos && pos < s.endPos,
    );

    // Unknown grapheme (decoder emitted '?') or no covering segment
    if (!seg || seg.gpcId === null) {
      positions.push(fallbackSound(word[pos], pos, target));
      continue;
    }

    const chunk = targetChunkAt(target, pos);

    if (!seg.phoneme.trim()) {
      positions.push({
        span: { start: seg.startPos, end: seg.endPos },
        grapheme: seg.grapheme,
        gpcId: seg.gpcId,
        phoneme: '',
        audioKeys: [],
        audioUrls: [],
        kind: 'silent',
        ambiguous: seg.ambiguous,
        confidence: seg.confidence,
        alternativePhonemes: seg.alternativePhonemes ?? [],
        // A silent letter matches a target position that is also silent
        // (chunk phoneme belongs to the speaking member, so compare effects)
        matchesTarget: false,
      });
      continue;
    }

    const audioKeys = resolveAudioKeys(seg.phoneme);
    if (audioKeys === null) {
      positions.push(fallbackSound(word[pos], pos, target));
      continue;
    }

    positions.push({
      span: { start: seg.startPos, end: seg.endPos },
      grapheme: seg.grapheme,
      gpcId: seg.gpcId,
      phoneme: seg.phoneme,
      audioKeys,
      audioUrls: audioKeys.map(getPhonemeAudioUrl),
      kind: 'contextual',
      ambiguous: seg.ambiguous,
      confidence: seg.confidence,
      alternativePhonemes: seg.alternativePhonemes ?? [],
      matchesTarget: soundMatchesChunk(seg.phoneme, chunk),
    });
  }

  return { attempted: word, positions };
}
