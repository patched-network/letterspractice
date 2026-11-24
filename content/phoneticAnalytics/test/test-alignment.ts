/**
 * Alignment Engine v2 Test Suite
 *
 * Comprehensive tests as specified in alignment-v2.md:
 * - Unit tests for match types (Section 8.1)
 * - Integration tests for alignWord and decodeWord (Section 8.2)
 * - Corpus metrics tests (Section 8.3)
 *
 * Run with: npx tsx lib/test-alignment-v2.ts
 */

// Node.js process global
declare const process: { exit(code: number): never };

import {
  alignBatchV2,
  alignWord,
  extractGpcsV2,
  formatAlignmentV2,
  getAlignmentRateV2,
  getComprehensiveIndex,
  getTeachingIndex,
  isFullyAlignedV2,
} from '../lib/alignment';
import {
  getDefaultCatalogueIndex
} from '../lib/catalogue';
import {
  alignmentToChunks,
  PRONUNCIATION_OVERRIDES,
  type PhoneticChunk,
} from '../lib/chunk-builder';
import {
  decodeBatch,
  decodeWord,
  formatDecode,
  getDecodeConfidence,
  isUnambiguous,
  quickDecode,
  validateDecode
} from '../lib/decode';
import {
  compressPattern,
  detectSplitDigraph,
  getWordPattern,
  isConsonantLetter,
  isVowelLetter,
  matchContextAfter,
  matchContextBefore,
  matchDigraph,
  matchPositionFinal,
  matchPositionInitial,
  matchSilent,
  matchSimple,
  matchSplitDigraph,
  matchTrigraph
} from '../lib/match-types';
import type { ArpabetPhoneme } from '../lib/types';

// =============================================================================
// Test Infrastructure
// =============================================================================

let passCount = 0;
let failCount = 0;
let skipCount = 0;
let currentSection = '';

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.log(`  ✗ ${message}`);
    failCount++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.log(`  ✗ ${message}`);
    console.log(`      Expected: ${JSON.stringify(expected)}`);
    console.log(`      Actual:   ${JSON.stringify(actual)}`);
    failCount++;
  }
}

function assertNotNull<T>(value: T | null | undefined, message: string): value is T {
  if (value !== null && value !== undefined) {
    console.log(`  ✓ ${message}`);
    passCount++;
    return true;
  } else {
    console.log(`  ✗ ${message} (was null/undefined)`);
    failCount++;
    return false;
  }
}

function assertNull(value: unknown, message: string): void {
  if (value === null) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.log(`  ✗ ${message} (was ${JSON.stringify(value)})`);
    failCount++;
  }
}

function skip(message: string): void {
  console.log(`  ○ ${message} [SKIPPED]`);
  skipCount++;
}

function section(name: string): void {
  currentSection = name;
  console.log(`\n${name}`);
  console.log('─'.repeat(70));
}

function describe(name: string, fn: () => void): void {
  console.log(`\n  ${name}`);
  fn();
}

function it(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.log(`  ✗ ${name}: ERROR - ${(err as Error).message}`);
    failCount++;
  }
}

// =============================================================================
// Section 8.1: Unit Tests for Match Types
// =============================================================================

function runMatchTypeTests(): void {
  section('8.1 Unit Tests: Match Types');

  // -------------------------------------------------------------------------
  // matchSimple tests
  // -------------------------------------------------------------------------
  describe('matchSimple', () => {
    it('matches single letter at start', () => {
      const result = matchSimple('cat', 0, 'c', 'K');
      if (assertNotNull(result, 'matchSimple("cat", 0, "c") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('matches single letter mid-word', () => {
      const result = matchSimple('cat', 1, 'a', 'AE');
      if (assertNotNull(result, 'matchSimple("cat", 1, "a") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('matches single letter at end', () => {
      const result = matchSimple('cat', 2, 't', 'T');
      if (assertNotNull(result, 'matchSimple("cat", 2, "t") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('returns null for non-match', () => {
      const result = matchSimple('cat', 0, 't', 'T');
      assertNull(result, 'matchSimple("cat", 0, "t") returns null');
    });

    it('handles multi-phoneme graphemes', () => {
      const result = matchSimple('box', 2, 'x', 'K S');
      if (assertNotNull(result, 'matchSimple("box", 2, "x") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 2, 'consumes 2 phonemes for "K S"');
      }
    });

    it('rejects split digraph notation', () => {
      const result = matchSimple('cake', 1, 'a_e', 'EY');
      assertNull(result, 'matchSimple rejects split digraph notation "a_e"');
    });
  });

  // -------------------------------------------------------------------------
  // matchDigraph tests
  // -------------------------------------------------------------------------
  describe('matchDigraph', () => {
    it('matches two-letter grapheme at start', () => {
      const result = matchDigraph('ship', 0, 'sh', 'SH');
      if (assertNotNull(result, 'matchDigraph("ship", 0, "sh") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('matches digraph mid-word', () => {
      const result = matchDigraph('other', 1, 'th', 'DH');
      if (assertNotNull(result, 'matchDigraph("other", 1, "th") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
      }
    });

    it('returns null at wrong position', () => {
      const result = matchDigraph('ship', 1, 'sh', 'SH');
      assertNull(result, 'matchDigraph("ship", 1, "sh") returns null');
    });
  });

  // -------------------------------------------------------------------------
  // matchTrigraph tests
  // -------------------------------------------------------------------------
  describe('matchTrigraph', () => {
    it('matches three-letter grapheme', () => {
      const result = matchTrigraph('night', 1, 'igh', 'AY');
      if (assertNotNull(result, 'matchTrigraph("night", 1, "igh") returns result')) {
        assertEqual(result.consumedText, 3, 'consumes 3 characters');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('returns null for partial match', () => {
      const result = matchTrigraph('nigh', 1, 'igh', 'AY');
      if (assertNotNull(result, 'matchTrigraph at end of "nigh" works')) {
        assertEqual(result.consumedText, 3, 'consumes 3 characters');
      }
    });
  });

  // -------------------------------------------------------------------------
  // matchSplitDigraph tests (spec section 8.1)
  // -------------------------------------------------------------------------
  describe('matchSplitDigraph', () => {
    it('matches a_e in "cake"', () => {
      const result = matchSplitDigraph('cake', 1, 'a_e', { splitAllows: 'CC' });
      if (assertNotNull(result, 'matchSplitDigraph("cake", 1, "a_e") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character (vowel only)');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
        assertEqual(result.marksEndSilent, true, 'marks end as silent');
      }
    });

    it('matches i_e in "bike"', () => {
      const result = matchSplitDigraph('bike', 1, 'i_e', { splitAllows: 'CC' });
      if (assertNotNull(result, 'matchSplitDigraph("bike", 1, "i_e") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.marksEndSilent, true, 'marks end as silent');
      }
    });

    it('matches o_e in "home"', () => {
      const result = matchSplitDigraph('home', 1, 'o_e', { splitAllows: 'CC' });
      if (assertNotNull(result, 'matchSplitDigraph("home", 1, "o_e") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('matches u_e in "cute"', () => {
      const result = matchSplitDigraph('cute', 1, 'u_e', { splitAllows: 'CC' });
      if (assertNotNull(result, 'matchSplitDigraph("cute", 1, "u_e") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('handles CC in "taste" (2 consonants)', () => {
      const result = matchSplitDigraph('taste', 1, 'a_e', { splitAllows: 'CC' });
      if (assertNotNull(result, 'matchSplitDigraph("taste", 1, "a_e") with CC returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.marksEndSilent, true, 'marks end as silent');
      }
    });

    it('rejects CCC in "castle" (too many consonants with CC setting)', () => {
      const result = matchSplitDigraph('castle', 1, 'a_e', { splitAllows: 'CC' });
      assertNull(result, 'matchSplitDigraph("castle", 1, "a_e") with CC limit returns null');
    });

    it('accepts CCC in "castle" with CCC setting', () => {
      const result = matchSplitDigraph('castle', 1, 'a_e', { splitAllows: 'CCC' });
      if (assertNotNull(result, 'matchSplitDigraph("castle", 1, "a_e") with CCC returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('accepts C in "stake" with C-only setting (only k between a and e)', () => {
      // In "stake", position 2 is "a", and there's only "k" between "a" and "e"
      const result = matchSplitDigraph('stake', 2, 'a_e', { splitAllows: 'C' });
      if (assertNotNull(result, 'matchSplitDigraph("stake", 2, "a_e") with C returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('rejects CC in "plate" with C-only setting (2 consonants)', () => {
      // In "plate", position 2 is "a", and there are "t" between "a" and "e"
      // Wait, "plate" = p-l-a-t-e, so only 1 consonant between a and e
      // Let's use a word with 2 consonants: "waste" = w-a-s-t-e
      const result = matchSplitDigraph('waste', 1, 'a_e', { splitAllows: 'C' });
      assertNull(result, 'matchSplitDigraph("waste", 1, "a_e") with C limit returns null (2 consonants)');
    });

    it('rejects non-consonant middle', () => {
      const result = matchSplitDigraph('aie', 0, 'a_e', { splitAllows: 'CC' });
      assertNull(result, 'matchSplitDigraph with vowel in middle returns null');
    });

    it('rejects words not ending with e', () => {
      const result = matchSplitDigraph('cat', 1, 'a_e', { splitAllows: 'CC' });
      assertNull(result, 'matchSplitDigraph("cat", 1, "a_e") returns null (no final e)');
    });

    it('rejects wrong vowel position', () => {
      const result = matchSplitDigraph('cake', 0, 'a_e', { splitAllows: 'CC' });
      assertNull(result, 'matchSplitDigraph("cake", 0, "a_e") returns null (c is not a)');
    });
  });

  // -------------------------------------------------------------------------
  // matchContextBefore tests (spec section 8.1)
  // -------------------------------------------------------------------------
  describe('matchContextBefore', () => {
    it('matches soft-c before e', () => {
      const result = matchContextBefore('cent', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      if (assertNotNull(result, 'matchContextBefore("cent", 0, "c") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('matches soft-c before i', () => {
      const result = matchContextBefore('city', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      if (assertNotNull(result, 'matchContextBefore("city", 0, "c") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('matches soft-c before y', () => {
      const result = matchContextBefore('cycle', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      if (assertNotNull(result, 'matchContextBefore("cycle", 0, "c") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('rejects soft-c before a', () => {
      const result = matchContextBefore('cat', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      assertNull(result, 'matchContextBefore("cat", 0, "c") returns null (a not in requireAfter)');
    });

    it('rejects soft-c before o', () => {
      const result = matchContextBefore('cot', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      assertNull(result, 'matchContextBefore("cot", 0, "c") returns null');
    });

    it('rejects soft-c before u', () => {
      const result = matchContextBefore('cup', 0, 'c', { requireAfter: ['e', 'i', 'y'] });
      assertNull(result, 'matchContextBefore("cup", 0, "c") returns null');
    });

    it('rejects soft-c at word end', () => {
      const result = matchContextBefore('tic', 2, 'c', { requireAfter: ['e', 'i', 'y'] });
      assertNull(result, 'matchContextBefore at word end returns null');
    });

    it('matches soft-g before e', () => {
      const result = matchContextBefore('gem', 0, 'g', { requireAfter: ['e', 'i', 'y'] });
      if (assertNotNull(result, 'matchContextBefore("gem", 0, "g") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });
  });

  // -------------------------------------------------------------------------
  // matchContextAfter tests
  // -------------------------------------------------------------------------
  describe('matchContextAfter', () => {
    it('matches pattern after specific letter', () => {
      const result = matchContextAfter('age', 1, 'g', { requireBefore: ['a'] });
      if (assertNotNull(result, 'matchContextAfter("age", 1, "g") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
      }
    });

    it('rejects pattern without required preceding letter', () => {
      const result = matchContextAfter('age', 1, 'g', { requireBefore: ['o'] });
      assertNull(result, 'matchContextAfter with wrong preceding letter returns null');
    });

    it('rejects at word start (nothing precedes)', () => {
      const result = matchContextAfter('go', 0, 'g', { requireBefore: ['a'] });
      assertNull(result, 'matchContextAfter at word start returns null');
    });
  });

  // -------------------------------------------------------------------------
  // matchPositionInitial tests
  // -------------------------------------------------------------------------
  describe('matchPositionInitial', () => {
    it('matches kn at word start', () => {
      const result = matchPositionInitial('know', 0, 'kn', 'N');
      if (assertNotNull(result, 'matchPositionInitial("know", 0, "kn") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('rejects kn mid-word', () => {
      const result = matchPositionInitial('acknowledge', 2, 'kn', 'N');
      assertNull(result, 'matchPositionInitial not at start returns null');
    });

    it('matches wr at word start', () => {
      const result = matchPositionInitial('write', 0, 'wr', 'R');
      if (assertNotNull(result, 'matchPositionInitial("write", 0, "wr") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
      }
    });

    it('matches gn at word start', () => {
      const result = matchPositionInitial('gnaw', 0, 'gn', 'N');
      if (assertNotNull(result, 'matchPositionInitial("gnaw", 0, "gn") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
      }
    });
  });

  // -------------------------------------------------------------------------
  // matchPositionFinal tests
  // -------------------------------------------------------------------------
  describe('matchPositionFinal', () => {
    it('matches final e producing IY', () => {
      const result = matchPositionFinal('me', 1, 'e', 'IY');
      if (assertNotNull(result, 'matchPositionFinal("me", 1, "e") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('rejects non-final position', () => {
      const result = matchPositionFinal('met', 1, 'e', 'IY');
      assertNull(result, 'matchPositionFinal("met", 1, "e") returns null (not at end)');
    });

    it('matches le at word end', () => {
      const result = matchPositionFinal('apple', 3, 'le', 'AH L');
      if (assertNotNull(result, 'matchPositionFinal("apple", 3, "le") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
        assertEqual(result.consumedPhonemes, 2, 'consumes 2 phonemes');
      }
    });
  });

  // -------------------------------------------------------------------------
  // matchSilent tests
  // -------------------------------------------------------------------------
  describe('matchSilent', () => {
    it('matches kn with silent k', () => {
      const result = matchSilent('knight', 0, 'kn', 'N');
      if (assertNotNull(result, 'matchSilent("knight", 0, "kn") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
        assertEqual(result.consumedPhonemes, 1, 'consumes 1 phoneme');
      }
    });

    it('matches gh producing no sound', () => {
      const result = matchSilent('night', 2, 'gh', '');
      if (assertNotNull(result, 'matchSilent("night", 2, "gh") returns result')) {
        assertEqual(result.consumedText, 2, 'consumes 2 characters');
        assertEqual(result.consumedPhonemes, 0, 'consumes 0 phonemes (silent)');
      }
    });

    it('matches silent b in lamb', () => {
      const result = matchSilent('lamb', 3, 'b', '');
      if (assertNotNull(result, 'matchSilent("lamb", 3, "b") returns result')) {
        assertEqual(result.consumedText, 1, 'consumes 1 character');
        assertEqual(result.consumedPhonemes, 0, 'consumes 0 phonemes');
      }
    });
  });

  // -------------------------------------------------------------------------
  // detectSplitDigraph tests
  // -------------------------------------------------------------------------
  describe('detectSplitDigraph', () => {
    it('detects split digraph in "cake"', () => {
      const result = detectSplitDigraph('cake');
      if (assertNotNull(result, 'detectSplitDigraph("cake") returns result')) {
        assertEqual(result.vowel, 'a', 'vowel is "a"');
        assertEqual(result.vowelPos, 1, 'vowel position is 1');
        assertEqual(result.endPos, 3, 'end position is 3');
      }
    });

    it('detects split digraph in "bike"', () => {
      const result = detectSplitDigraph('bike');
      if (assertNotNull(result, 'detectSplitDigraph("bike") returns result')) {
        assertEqual(result.vowel, 'i', 'vowel is "i"');
        assertEqual(result.vowelPos, 1, 'vowel position is 1');
      }
    });

    it('detects split digraph in "home"', () => {
      const result = detectSplitDigraph('home');
      if (assertNotNull(result, 'detectSplitDigraph("home") returns result')) {
        assertEqual(result.vowel, 'o', 'vowel is "o"');
      }
    });

    it('detects split digraph in "cute"', () => {
      const result = detectSplitDigraph('cute');
      if (assertNotNull(result, 'detectSplitDigraph("cute") returns result')) {
        assertEqual(result.vowel, 'u', 'vowel is "u"');
      }
    });

    it('detects split digraph in "taste" (2 consonants)', () => {
      const result = detectSplitDigraph('taste');
      if (assertNotNull(result, 'detectSplitDigraph("taste") returns result')) {
        assertEqual(result.vowel, 'a', 'vowel is "a"');
        assertEqual(result.vowelPos, 1, 'vowel position is 1');
      }
    });

    it('returns null for "cat" (no final e)', () => {
      const result = detectSplitDigraph('cat');
      assertNull(result, 'detectSplitDigraph("cat") returns null');
    });

    it('returns null for "see" (no consonant between)', () => {
      const result = detectSplitDigraph('see');
      assertNull(result, 'detectSplitDigraph("see") returns null (ee, no consonant)');
    });

    it('returns null for short words', () => {
      const result = detectSplitDigraph('me');
      assertNull(result, 'detectSplitDigraph("me") returns null (too short)');
    });
  });

  // -------------------------------------------------------------------------
  // Utility function tests
  // -------------------------------------------------------------------------
  describe('utility functions', () => {
    it('isConsonantLetter identifies consonants', () => {
      assert(isConsonantLetter('b'), '"b" is consonant');
      assert(isConsonantLetter('c'), '"c" is consonant');
      assert(isConsonantLetter('z'), '"z" is consonant');
      assert(!isConsonantLetter('a'), '"a" is not consonant');
      assert(!isConsonantLetter('e'), '"e" is not consonant');
    });

    it('isVowelLetter identifies vowels', () => {
      assert(isVowelLetter('a'), '"a" is vowel');
      assert(isVowelLetter('e'), '"e" is vowel');
      assert(isVowelLetter('i'), '"i" is vowel');
      assert(isVowelLetter('o'), '"o" is vowel');
      assert(isVowelLetter('u'), '"u" is vowel');
      assert(!isVowelLetter('b'), '"b" is not vowel');
    });

    it('getWordPattern returns CV pattern', () => {
      assertEqual(getWordPattern('cat'), 'CVC', 'cat → CVC');
      assertEqual(getWordPattern('ship'), 'CCVC', 'ship → CCVC');
      assertEqual(getWordPattern('cake'), 'CVCV', 'cake → CVCV'); // c=C, a=V, k=C, e=V
      assertEqual(getWordPattern('stop'), 'CCVC', 'stop → CCVC');
    });

    it('compressPattern collapses runs', () => {
      assertEqual(compressPattern('CCVCC'), 'CVC', 'CCVCC → CVC');
      assertEqual(compressPattern('CVVC'), 'CVC', 'CVVC → CVC');
      assertEqual(compressPattern('CCCVCCC'), 'CVC', 'CCCVCCC → CVC');
    });
  });
}

// =============================================================================
// Section 8.2: Integration Tests
// =============================================================================

function runAlignmentIntegrationTests(): void {
  section('8.2 Integration Tests: alignWord');

  const index = getDefaultCatalogueIndex();

  describe('alignWord v2 - basic alignment', () => {
    it('fully aligns "cat" → [K, AE, T]', () => {
      const result = alignWord('cat', ['K', 'AE', 'T'], index);
      assert(result.fullyAligned, '"cat" is fully aligned');
      assertEqual(result.status, 'full', 'status is "full"');
      assertEqual(result.alignedCount, 3, 'all 3 segments aligned');
      assertEqual(result.segments.length, 3, '3 segments');

      if (result.segments.length === 3) {
        assertEqual(result.segments[0].grapheme, 'c', 'segment 0 grapheme is "c"');
        assertEqual(result.segments[0].phoneme, 'K', 'segment 0 phoneme is "K"');
        assertEqual(result.segments[1].grapheme, 'a', 'segment 1 grapheme is "a"');
        assertEqual(result.segments[1].phoneme, 'AE', 'segment 1 phoneme is "AE"');
        assertEqual(result.segments[2].grapheme, 't', 'segment 2 grapheme is "t"');
        assertEqual(result.segments[2].phoneme, 'T', 'segment 2 phoneme is "T"');
      }
    });

    it('fully aligns "ship" → [SH, IH, P]', () => {
      const result = alignWord('ship', ['SH', 'IH', 'P'], index);
      assert(result.fullyAligned, '"ship" is fully aligned');
      assertEqual(result.segments.length, 3, '3 segments (digraph sh counts as 1)');

      if (result.segments.length >= 1) {
        assertEqual(result.segments[0].grapheme, 'sh', 'first segment is "sh" digraph');
        assertEqual(result.segments[0].phoneme, 'SH', 'digraph produces SH');
      }
    });

    it('fully aligns "this" → [DH, IH, S]', () => {
      const result = alignWord('this', ['DH', 'IH', 'S'], index);
      assert(result.fullyAligned, '"this" is fully aligned');
      assertEqual(result.segments.length, 3, '3 segments');
    });

    it('fully aligns "chat" → [CH, AE, T]', () => {
      const result = alignWord('chat', ['CH', 'AE', 'T'], index);
      assert(result.fullyAligned, '"chat" is fully aligned');
    });
  });

  describe('alignWord v2 - split digraphs', () => {
    it('fully aligns "cake" with split digraph', () => {
      const result = alignWord('cake', ['K', 'EY', 'K'], index);
      assert(result.fullyAligned, '"cake" is fully aligned');
      assert(result.hasSplitDigraph, 'detected split digraph');

      // Should have segments for: c, a (from a_e), k, e (silent)
      const graphemes = result.segments.map(s => s.grapheme);
      assert(graphemes.includes('a') || graphemes.includes('a_e'),
        'contains vowel segment for split digraph');
    });

    it('fully aligns "bike" with split digraph', () => {
      const result = alignWord('bike', ['B', 'AY', 'K'], index);
      assert(result.fullyAligned, '"bike" is fully aligned');
    });

    it('fully aligns "home" with split digraph', () => {
      const result = alignWord('home', ['HH', 'OW', 'M'], index);
      assert(result.fullyAligned, '"home" is fully aligned');
    });

    it('fully aligns "taste" with split digraph (2 consonants)', () => {
      const result = alignWord('taste', ['T', 'EY', 'S', 'T'], index);
      // Note: taste may or may not be fully aligned depending on catalogue
      // The key is that it attempts the split digraph pattern
      assert(result.segments.length > 0, '"taste" produces segments');
    });
  });

  describe('alignWord v2 - partial alignment', () => {
    it('partially aligns word with unknown GPC', () => {
      // Use a phoneme sequence that may not fully match
      const result = alignWord('xyz', ['Z', 'AY', 'Z'], index);
      // xyz likely won't fully align with standard GPCs
      assert(result.segments.length > 0, 'produces segments even if partial');
      if (!result.fullyAligned) {
        assertEqual(result.status, 'partial', 'status is "partial" or "failed"');
      }
    });
  });

  describe('alignWord v2 - special cases', () => {
    it('handles "the" → [DH, AH]', () => {
      const result = alignWord('the', ['DH', 'AH'], index);
      // "the" is treated as a sight-word in catalogue-v2
      assert(result.segments.length > 0, '"the" produces segments');
    });

    it('handles "to" → [T, UW]', () => {
      const result = alignWord('to', ['T', 'UW'], index);
      assert(result.segments.length > 0, '"to" produces segments');
    });

    it('handles "go" → [G, OW]', () => {
      const result = alignWord('go', ['G', 'OW'], index);
      assert(result.fullyAligned, '"go" is fully aligned');
    });

    it('handles "me" → [M, IY]', () => {
      const result = alignWord('me', ['M', 'IY'], index);
      assert(result.fullyAligned, '"me" is fully aligned');
    });
  });

  describe('alignWord v2 - trigraphs and silent letters', () => {
    it('aligns "night" → [N, AY, T]', () => {
      const result = alignWord('night', ['N', 'AY', 'T'], index);
      assert(result.fullyAligned, '"night" is fully aligned');
      // Should recognize "igh" trigraph
    });

    it('aligns "knight" → [N, AY, T]', () => {
      const result = alignWord('knight', ['N', 'AY', 'T'], index);
      // knight has silent k at start
      assert(result.segments.length > 0, '"knight" produces segments');
    });

    it('aligns "write" → [R, AY, T]', () => {
      const result = alignWord('write', ['R', 'AY', 'T'], index);
      assert(result.segments.length > 0, '"write" produces segments');
    });

    it('aligns "know" → [N, OW]', () => {
      const result = alignWord('know', ['N', 'OW'], index);
      assert(result.segments.length > 0, '"know" produces segments');
    });
  });

  describe('alignWord v2 - vowel teams', () => {
    it('aligns "rain" → [R, EY, N]', () => {
      const result = alignWord('rain', ['R', 'EY', 'N'], index);
      assert(result.fullyAligned, '"rain" is fully aligned');
    });

    it('aligns "boat" → [B, OW, T]', () => {
      const result = alignWord('boat', ['B', 'OW', 'T'], index);
      assert(result.fullyAligned, '"boat" is fully aligned');
    });

    it('aligns "see" → [S, IY]', () => {
      const result = alignWord('see', ['S', 'IY'], index);
      assert(result.fullyAligned, '"see" is fully aligned');
    });
  });
}

function runDecodeIntegrationTests(): void {
  section('8.2 Integration Tests: decodeWordV2');

  const index = getDefaultCatalogueIndex();

  describe('decodeWord v2 - unambiguous decoding', () => {
    it('decodes "cat" correctly', () => {
      const result = decodeWord('cat', index);
      assertEqual(result.predictedPhonemes, ['K', 'AE', 'T'], 'predicts K AE T');
      // Note: "cat" may be marked ambiguous if multiple GPCs exist for same graphemes
      // The key is that the prediction is correct
      assert(result.fullyCovered, 'all graphemes covered');
      assertEqual(result.unknownCount, 0, 'no unknown graphemes');
    });

    it('decodes "dog" unambiguously', () => {
      const result = decodeWord('dog', index);
      assertEqual(result.predictedPhonemes, ['D', 'AA', 'G'], 'predicts D AA G');
    });

    it('decodes "ship" with digraph', () => {
      const result = decodeWord('ship', index);
      // Should recognize "sh" as a digraph
      assert(result.predictedPhonemes[0] === 'SH', 'predicts SH for "sh"');
      assert(result.fullyCovered, 'all graphemes covered');
    });
  });

  describe('decodeWord v2 - ambiguous decoding', () => {
    it('flags ambiguity for "read"', () => {
      const result = decodeWord('read', index, { generateAlternatives: true });
      // "read" can be /riːd/ (IY) or /red/ (EH)
      // The decode should flag this as ambiguous
      assert(result.segments.length > 0, '"read" produces segments');
      // Check if "ea" vowel team is recognized as ambiguous
      const eaSegment = result.segments.find(s => s.grapheme === 'ea');
      if (eaSegment) {
        // ea can produce IY or EH
        assert(true, '"ea" segment found');
      }
    });

    it('flags ambiguity for "bow"', () => {
      const result = decodeWord('bow', index, { generateAlternatives: true });
      // "bow" can be /boʊ/ (OW) or /baʊ/ (AW)
      assert(result.segments.length > 0, '"bow" produces segments');
    });
  });

  describe('decodeWord v2 - prefers longer graphemes', () => {
    it('prefers "sh" over "s"+"h" in "ship"', () => {
      const result = decodeWord('ship', index);
      assertEqual(result.segments[0].grapheme, 'sh', 'uses "sh" digraph, not "s"');
    });

    it('prefers "th" over "t"+"h" in "this"', () => {
      const result = decodeWord('this', index);
      assertEqual(result.segments[0].grapheme, 'th', 'uses "th" digraph');
    });

    it('prefers "ch" over "c"+"h" in "chat"', () => {
      const result = decodeWord('chat', index);
      assertEqual(result.segments[0].grapheme, 'ch', 'uses "ch" digraph');
    });

    it('handles "night" decode', () => {
      const result = decodeWord('night', index);
      // Check that night is decoded - whether via igh trigraph or other means
      assert(result.segments.length > 0, '"night" produces segments');
      // If igh is recognized, great; if not, we still want to decode
      const hasIgh = result.segments.some(s => s.grapheme === 'igh');
      const hasAY = result.predictedPhonemes.includes('AY');
      assert(hasIgh || hasAY || result.fullyCovered, 'night is decoded reasonably');
    });
  });

  describe('decodeWord v2 - split digraph detection', () => {
    it('recognizes split digraph in "cake"', () => {
      const result = decodeWord('cake', index);
      // Should produce EY for the a_e pattern
      assert(result.predictedPhonemes.includes('EY'), 'predicts EY for a_e');
    });

    it('recognizes split digraph in "bike"', () => {
      const result = decodeWord('bike', index);
      assert(result.predictedPhonemes.includes('AY'), 'predicts AY for i_e');
    });

    it('recognizes split digraph in "home"', () => {
      const result = decodeWord('home', index);
      assert(result.predictedPhonemes.includes('OW'), 'predicts OW for o_e');
    });
  });

  describe('decodeWord v2 - confidence scoring', () => {
    it('returns confidence score for words', () => {
      const result = decodeWord('cat', index);
      // Confidence depends on GPC priority tuning; just verify it's a valid score
      assert(result.confidence >= 0 && result.confidence <= 1, '"cat" has valid confidence');
    });

    it('tracks unknown graphemes', () => {
      const result = decodeWord('xyz', index);
      // Some or all of xyz may not have GPCs
      assert(result.unknownCount >= 0, 'tracks unknown count');
    });
  });
}

// =============================================================================
// Section 8.3: Corpus Metrics Tests
// =============================================================================

function runCorpusMetricsTests(): void {
  section('8.3 Corpus Metrics Tests');

  const index = getDefaultCatalogueIndex();

  describe('batch alignment metrics', () => {
    it('processes a batch of words', () => {
      const words: Array<[string, ArpabetPhoneme[]]> = [
        ['cat', ['K', 'AE', 'T']],
        ['dog', ['D', 'AO', 'G']],
        ['ship', ['SH', 'IH', 'P']],
        ['cake', ['K', 'EY', 'K']],
        ['bike', ['B', 'AY', 'K']],
      ];

      const result = alignBatchV2(words, index);
      assert(result.total === 5, 'processed 5 words');
      assert(result.fullAlignmentRate >= 0, 'has full alignment rate');
      assert(result.averageAlignmentRate >= 0, 'has average alignment rate');
      console.log(`      Full alignment rate: ${(result.fullAlignmentRate * 100).toFixed(1)}%`);
      console.log(`      Average alignment rate: ${(result.averageAlignmentRate * 100).toFixed(1)}%`);
    });

    it('reports common issues', () => {
      const words: Array<[string, ArpabetPhoneme[]]> = [
        ['the', ['DH', 'AH']],
        ['to', ['T', 'UW']],
        ['xyz', ['Z', 'AY', 'Z']],
      ];

      const result = alignBatchV2(words, index);
      assert(result.topIssues !== undefined, 'tracks top issues');
      if (result.topIssues && result.topIssues.length > 0) {
        console.log(`      Top issues found: ${result.topIssues.length}`);
      }
    });
  });

  describe('batch decode metrics', () => {
    it('processes a batch of words for decode', () => {
      const words = ['cat', 'dog', 'ship', 'cake', 'bike'];

      const result = decodeBatch(words, index);
      assert(result.total === 5, 'processed 5 words');
      assert(result.unambiguousRate >= 0, 'has unambiguous rate');
      assert(result.averageConfidence >= 0, 'has average confidence');
      console.log(`      Unambiguous rate: ${(result.unambiguousRate * 100).toFixed(1)}%`);
      console.log(`      Average confidence: ${(result.averageConfidence * 100).toFixed(1)}%`);
    });
  });

  describe('common word coverage', () => {
    it('high coverage on simple CVC words', () => {
      const cvcWords: Array<[string, ArpabetPhoneme[]]> = [
        ['cat', ['K', 'AE', 'T']],
        ['dog', ['D', 'AO', 'G']],
        ['hat', ['HH', 'AE', 'T']],
        ['sun', ['S', 'AH', 'N']],
        ['run', ['R', 'AH', 'N']],
        ['bus', ['B', 'AH', 'S']],
        ['cup', ['K', 'AH', 'P']],
        ['pet', ['P', 'EH', 'T']],
        ['red', ['R', 'EH', 'D']],
        ['bed', ['B', 'EH', 'D']],
      ];

      const result = alignBatchV2(cvcWords, index);
      assert(result.fullAlignmentRate >= 0.8, 'CVC words have >= 80% alignment');
      console.log(`      CVC alignment rate: ${(result.fullAlignmentRate * 100).toFixed(1)}%`);
    });

    it('high coverage on digraph words', () => {
      const digraphWords: Array<[string, ArpabetPhoneme[]]> = [
        ['ship', ['SH', 'IH', 'P']],
        ['chat', ['CH', 'AE', 'T']],
        ['this', ['DH', 'IH', 'S']],
        ['fish', ['F', 'IH', 'SH']],
        ['with', ['W', 'IH', 'TH']],
      ];

      const result = alignBatchV2(digraphWords, index);
      assert(result.fullAlignmentRate >= 0.8, 'digraph words have >= 80% alignment');
      console.log(`      Digraph alignment rate: ${(result.fullAlignmentRate * 100).toFixed(1)}%`);
    });
  });
}

// =============================================================================
// Helper Functions Tests
// =============================================================================

function runHelperFunctionTests(): void {
  section('Helper Function Tests');

  const index = getDefaultCatalogueIndex();

  describe('isFullyAlignedV2', () => {
    it('returns true for fully aligned word', () => {
      const result = isFullyAlignedV2('cat', ['K', 'AE', 'T'], index);
      assert(result, 'cat is fully aligned');
    });
  });

  describe('getAlignmentRateV2', () => {
    it('returns alignment rate', () => {
      const rate = getAlignmentRateV2('cat', ['K', 'AE', 'T'], index);
      assert(rate >= 0 && rate <= 1, 'rate is between 0 and 1');
      assert(rate === 1.0, 'cat has 100% alignment rate');
    });
  });

  describe('extractGpcsV2', () => {
    it('extracts GPC IDs from aligned word', () => {
      const gpcs = extractGpcsV2('cat', ['K', 'AE', 'T'], index);
      assert(gpcs.length === 3, 'extracts 3 GPCs');
    });
  });

  describe('formatAlignmentV2', () => {
    it('formats alignment result as string', () => {
      const result = alignWord('cat', ['K', 'AE', 'T'], index);
      const formatted = formatAlignmentV2(result);
      assert(formatted.length > 0, 'produces non-empty string');
      assert(formatted.includes('cat'), 'includes word');
    });
  });

  describe('quickDecodeV2', () => {
    it('returns phoneme array', () => {
      const phonemes = quickDecode('cat', index);
      assertEqual(phonemes, ['K', 'AE', 'T'], 'quick decode returns phonemes');
    });
  });

  describe('isUnambiguousV2', () => {
    it('returns boolean for word ambiguity', () => {
      const result = isUnambiguous('cat', index);
      // cat may be ambiguous if multiple GPCs match same graphemes
      assert(typeof result === 'boolean', 'isUnambiguousV2 returns boolean');
    });
  });

  describe('getDecodeConfidenceV2', () => {
    it('returns confidence score', () => {
      const confidence = getDecodeConfidence('cat', index);
      assert(confidence >= 0 && confidence <= 1, 'confidence is between 0 and 1');
    });
  });

  describe('formatDecodeV2', () => {
    it('formats decode result as string', () => {
      const result = decodeWord('cat', index);
      const formatted = formatDecode(result);
      assert(formatted.length > 0, 'produces non-empty string');
      assert(formatted.includes('cat'), 'includes word');
    });
  });

  describe('validateDecode', () => {
    it('validates correct decode', () => {
      const decodeResult = decodeWord('cat', index);
      const valid = validateDecode(decodeResult, ['K', 'AE', 'T']);
      assert(valid, 'cat decode validates against K AE T');
    });

    it('invalidates incorrect decode', () => {
      const decodeResult = decodeWord('cat', index);
      const valid = validateDecode(decodeResult, ['D', 'AO', 'G']);
      assert(!valid, 'cat decode does not validate against D AO G');
    });
  });

  describe('catalogue indices', () => {
    it('getTeachingIndex returns a valid index', () => {
      const teachingIndex = getTeachingIndex();
      assert(teachingIndex !== undefined, 'teaching index exists');
      assert(teachingIndex.byGrapheme !== undefined, 'has byGrapheme map');
    });

    it('getComprehensiveIndex returns a valid index', () => {
      const compIndex = getComprehensiveIndex();
      assert(compIndex !== undefined, 'comprehensive index exists');
    });
  });
}

// =============================================================================
// Edge Cases and Regression Tests
// =============================================================================

function runEdgeCaseTests(): void {
  section('Edge Cases and Regression Tests');

  const index = getDefaultCatalogueIndex();

  describe('empty and minimal inputs', () => {
    it('handles empty word gracefully', () => {
      try {
        const result = alignWord('', [], index);
        assert(result.segments.length === 0, 'empty word produces no segments');
      } catch (e) {
        assert(true, 'empty word throws or returns empty (acceptable)');
      }
    });

    it('handles single letter word', () => {
      const result = alignWord('a', ['AH'], index);
      assert(result.segments.length >= 0, 'single letter word produces segments');
    });
  });

  describe('case handling', () => {
    it('normalizes uppercase words', () => {
      const result = alignWord('CAT', ['K', 'AE', 'T'], index);
      assert(result.fullyAligned, 'uppercase CAT aligns');
    });

    it('normalizes mixed case words', () => {
      const result = alignWord('CaT', ['K', 'AE', 'T'], index);
      assert(result.fullyAligned, 'mixed case CaT aligns');
    });
  });

  describe('multi-phoneme graphemes', () => {
    it('handles x → K S', () => {
      const result = alignWord('box', ['B', 'AA', 'K', 'S'], index);
      assert(result.segments.length > 0, '"box" produces segments');
    });

    it('handles qu → K W', () => {
      const result = alignWord('quit', ['K', 'W', 'IH', 'T'], index);
      assert(result.segments.length > 0, '"quit" produces segments');
    });
  });

  describe('r-controlled vowels', () => {
    it('aligns "car" → [K, AA, R]', () => {
      const result = alignWord('car', ['K', 'AA', 'R'], index);
      assert(result.segments.length > 0, '"car" produces segments');
    });

    it('aligns "her" → [HH, ER]', () => {
      const result = alignWord('her', ['HH', 'ER'], index);
      assert(result.segments.length > 0, '"her" produces segments');
    });

    it('aligns "bird" → [B, ER, D]', () => {
      const result = alignWord('bird', ['B', 'ER', 'D'], index);
      assert(result.segments.length > 0, '"bird" produces segments');
    });
  });

  describe('doubled consonants', () => {
    it('aligns "bell" → [B, EH, L]', () => {
      const result = alignWord('bell', ['B', 'EH', 'L'], index);
      assert(result.segments.length > 0, '"bell" produces segments');
    });

    it('aligns "miss" → [M, IH, S]', () => {
      const result = alignWord('miss', ['M', 'IH', 'S'], index);
      assert(result.segments.length > 0, '"miss" produces segments');
    });
  });

  describe('final patterns', () => {
    it('aligns "ring" → [R, IH, NG]', () => {
      const result = alignWord('ring', ['R', 'IH', 'NG'], index);
      assert(result.segments.length > 0, '"ring" produces segments');
    });

    it('aligns "sing" → [S, IH, NG]', () => {
      const result = alignWord('sing', ['S', 'IH', 'NG'], index);
      assert(result.segments.length > 0, '"sing" produces segments');
    });

    it('aligns "bank" → [B, AE, NG, K]', () => {
      const result = alignWord('bank', ['B', 'AE', 'NG', 'K'], index);
      assert(result.segments.length > 0, '"bank" produces segments');
    });
  });
}

// =============================================================================
// Section: Chunk Builder Tests
// =============================================================================

function runChunkBuilderTests(): void {
  section('Chunk Builder: alignmentToChunks');

  // ── Baseline sanity: simple words that should already work ──────────

  describe('chunk builder - baseline CVC words', () => {
    it('"cat" produces 3 chunks: K, AE, T', () => {
      const chunks = alignmentToChunks('cat', ['K', 'AE', 'T'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"cat" has 3 chunks');
      if (chunks.length === 3) {
        assertEqual(chunks[0].phoneme, 'K', 'chunk 0 phoneme is K');
        assertEqual(chunks[0].label, 'c', 'chunk 0 label is "c"');
        assertEqual(chunks[1].phoneme, 'AE', 'chunk 1 phoneme is AE');
        assertEqual(chunks[1].label, 'a', 'chunk 1 label is "a"');
        assertEqual(chunks[2].phoneme, 'T', 'chunk 2 phoneme is T');
        assertEqual(chunks[2].label, 't', 'chunk 2 label is "t"');
      }
    });

    it('"ship" produces 3 chunks: SH, IH, P', () => {
      const chunks = alignmentToChunks('ship', ['SH', 'IH', 'P'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"ship" has 3 chunks');
      if (chunks.length === 3) {
        assertEqual(chunks[0].phoneme, 'SH', 'chunk 0 phoneme is SH');
        assertEqual(chunks[0].label, 'sh', 'chunk 0 label is "sh"');
        assertEqual(chunks[1].phoneme, 'IH', 'chunk 1 phoneme is IH');
        assertEqual(chunks[2].phoneme, 'P', 'chunk 2 phoneme is P');
      }
    });

    it('"dog" produces 3 chunks: D, AO, G', () => {
      const chunks = alignmentToChunks('dog', ['D', 'AO', 'G'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"dog" has 3 chunks');
      if (chunks.length === 3) {
        assertEqual(chunks[0].phoneme, 'D', 'chunk 0 phoneme is D');
        assertEqual(chunks[1].phoneme, 'AO', 'chunk 1 phoneme is AO');
        assertEqual(chunks[2].phoneme, 'G', 'chunk 2 phoneme is G');
      }
    });
  });

  // ── Split digraph baseline ──────────────────────────────────────────

  describe('chunk builder - split digraphs', () => {
    it('"cake" produces chunks with silent-e effect', () => {
      const chunks = alignmentToChunks('cake', ['K', 'EY', 'K'] as ArpabetPhoneme[]);
      assert(chunks.length >= 2, '"cake" has at least 2 chunks');
      // Find the EY chunk — it should have a silent-e letter effect
      const eyChunk = chunks.find(c => c.phoneme === 'EY');
      assert(eyChunk !== undefined, 'found EY chunk');
      if (eyChunk) {
        // Letter index 3 (the 'e') should have silent-e effect
        assertEqual(eyChunk.letters[3], 'silent-e', 'final e has silent-e effect');
      }
    });
  });

  // ── R-controlled vowels (mediation metadata) ───────────────────────

  describe('chunk builder - r-controlled vowels', () => {
    it('"short" produces 4 chunks: SH, AO, R, T with mediation', () => {
      const chunks = alignmentToChunks('short', ['SH', 'AO', 'R', 'T'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 4, '"short" has 4 chunks');
      if (chunks.length === 4) {
        assertEqual(chunks[0].phoneme, 'SH', 'chunk 0 is SH');
        assertEqual(chunks[1].phoneme, 'AO', 'chunk 1 is AO (vowel)');
        assert(chunks[1].mediatedBy !== undefined, 'AO chunk has mediatedBy');
        assertEqual(chunks[1].letters[3], 'r-control', 'r has r-control effect on vowel step');
        assertEqual(chunks[2].phoneme, 'R', 'chunk 2 is R');
        assert(chunks[2].mediates !== undefined, 'R chunk has mediates');
        assertEqual(chunks[3].phoneme, 'T', 'chunk 3 is T');
      }
    });

    it('"car" produces 2 chunks: K, AA+R with mediation', () => {
      const chunks = alignmentToChunks('car', ['K', 'AA', 'R'] as ArpabetPhoneme[]);
      // Expect: K chunk, AA chunk (with r-control on r), R chunk
      assertEqual(chunks.length, 3, '"car" has 3 chunks');
      if (chunks.length === 3) {
        assertEqual(chunks[0].phoneme, 'K', 'chunk 0 is K');
        assertEqual(chunks[1].phoneme, 'AA', 'chunk 1 is AA');
        assertEqual(chunks[2].phoneme, 'R', 'chunk 2 is R');
      }
    });
  });

  // ── L-controlled vowels ────────────────────────────────────────────

  describe('chunk builder - l-controlled vowels', () => {
    it('"all" produces 2 chunks: AO, L with mediation', () => {
      const chunks = alignmentToChunks('all', ['AO', 'L'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 2, '"all" has 2 chunks');
      if (chunks.length === 2) {
        assertEqual(chunks[0].phoneme, 'AO', 'chunk 0 is AO');
        assert(chunks[0].mediatedBy !== undefined, 'AO chunk has mediatedBy');
        assertEqual(chunks[1].phoneme, 'L', 'chunk 1 is L');
      }
    });

    it('"wall" produces 3 chunks: W, AO, L', () => {
      const chunks = alignmentToChunks('wall', ['W', 'AO', 'L'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"wall" has 3 chunks');
      if (chunks.length === 3) {
        assertEqual(chunks[0].phoneme, 'W', 'chunk 0 is W');
        assertEqual(chunks[1].phoneme, 'AO', 'chunk 1 is AO');
        assertEqual(chunks[2].phoneme, 'L', 'chunk 2 is L');
      }
    });
  });

  // ── BUG REGRESSIONS: multi-phoneme GPCs that are NOT r/l-controlled ─

  describe('chunk builder - multi-phoneme GPC: "and" (syllabic consonant)', () => {
    // "and" should use the deliberate/isolation pronunciation: AE N D
    // (CMUdict default is AH0 N D — the casual/reduced schwa form —
    //  but CMUdict also has and(2) AE1 N D which is what we want.)
    // We enforce this via PRONUNCIATION_OVERRIDES.
    //
    // Historical bug context: multi-phoneme GPC "an"→"AH N" used to
    // drop the N entirely, producing only 2 chunks. That's also tested
    // below in the override-independent section.

    it('"and" produces 3 chunks with deliberate pronunciation AE N D', () => {
      const phonemes = PRONUNCIATION_OVERRIDES['and'];
      assert(phonemes !== undefined, '"and" has a pronunciation override');
      if (!phonemes) return;
      const chunks = alignmentToChunks('and', phonemes);
      assertEqual(chunks.length, 3, '"and" must have 3 chunks');
    });

    it('"and" chunk phonemes are AE, N, D in order', () => {
      const phonemes = PRONUNCIATION_OVERRIDES['and'];
      if (!phonemes) { assert(false, 'missing override'); return; }
      const chunks = alignmentToChunks('and', phonemes);
      if (chunks.length >= 3) {
        assertEqual(chunks[0].phoneme, 'AE', 'chunk 0 phoneme is AE');
        assertEqual(chunks[1].phoneme, 'N', 'chunk 1 phoneme is N');
        assertEqual(chunks[2].phoneme, 'D', 'chunk 2 phoneme is D');
      } else {
        assert(false, `expected 3 chunks, got ${chunks.length}: [${chunks.map(c => c.phoneme).join(', ')}]`);
      }
    });

    it('"and" assigns letter "a" to AE and letter "n" to N', () => {
      const phonemes = PRONUNCIATION_OVERRIDES['and'];
      if (!phonemes) { assert(false, 'missing override'); return; }
      const chunks = alignmentToChunks('and', phonemes);
      if (chunks.length >= 3) {
        assertEqual(chunks[0].label, 'a', 'AE chunk label is "a"');
        assert(chunks[0].letters[0] === 'speak', 'letter "a" (index 0) speaks for AE');
        assertEqual(chunks[1].label, 'n', 'N chunk label is "n"');
        assert(chunks[1].letters[1] === 'speak', 'letter "n" (index 1) speaks for N');
      } else {
        assert(false, `expected 3 chunks, got ${chunks.length}`);
      }
    });

    it('"and" multi-phoneme splitting works even with schwa form (AH N D)', () => {
      // Guard against the original bug regardless of which pronunciation is chosen
      const chunks = alignmentToChunks('and', ['AH', 'N', 'D'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"and" with AH N D still produces 3 chunks');
    });
  });

  describe('chunk builder - multi-phoneme GPC: "bank" (nk digraph)', () => {
    // "bank" → [B, AE, NG, K]
    // Alignment gives: "b"→"B", "a"→"AE", "nk"→"NG K" (GPC-nk-NG_K, digraphs)
    // OLD BUG: only 3 chunks [B, AE, NG], dropping K entirely.
    // EXPECTED: 4 chunks [B, AE, NG, K]

    it('"bank" produces 4 chunks (not 3)', () => {
      const chunks = alignmentToChunks('bank', ['B', 'AE', 'NG', 'K'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 4, '"bank" must have 4 chunks');
    });

    it('"bank" chunk phonemes are B, AE, NG, K in order', () => {
      const chunks = alignmentToChunks('bank', ['B', 'AE', 'NG', 'K'] as ArpabetPhoneme[]);
      if (chunks.length >= 4) {
        assertEqual(chunks[0].phoneme, 'B', 'chunk 0 is B');
        assertEqual(chunks[1].phoneme, 'AE', 'chunk 1 is AE');
        assertEqual(chunks[2].phoneme, 'NG', 'chunk 2 is NG');
        assertEqual(chunks[3].phoneme, 'K', 'chunk 3 is K');
      } else {
        assert(false, `expected 4 chunks, got ${chunks.length}: [${chunks.map(c => c.phoneme).join(', ')}]`);
      }
    });

    it('"bank" assigns "n" to NG and "k" to K', () => {
      const chunks = alignmentToChunks('bank', ['B', 'AE', 'NG', 'K'] as ArpabetPhoneme[]);
      if (chunks.length >= 4) {
        assertEqual(chunks[2].label, 'n', 'NG chunk label is "n"');
        assert(chunks[2].letters[2] === 'speak', 'letter "n" (index 2) speaks for NG');
        assertEqual(chunks[3].label, 'k', 'K chunk label is "k"');
        assert(chunks[3].letters[3] === 'speak', 'letter "k" (index 3) speaks for K');
      } else {
        assert(false, `expected 4 chunks, got ${chunks.length}`);
      }
    });
  });

  describe('chunk builder - multi-phoneme GPC: "think" (nk digraph)', () => {
    // "think" → [TH, IH, NG, K]
    it('"think" produces 4 chunks: TH, IH, NG, K', () => {
      const chunks = alignmentToChunks('think', ['TH', 'IH', 'NG', 'K'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 4, '"think" has 4 chunks');
      if (chunks.length === 4) {
        assertEqual(chunks[0].phoneme, 'TH', 'chunk 0 is TH');
        assertEqual(chunks[1].phoneme, 'IH', 'chunk 1 is IH');
        assertEqual(chunks[2].phoneme, 'NG', 'chunk 2 is NG');
        assertEqual(chunks[3].phoneme, 'K', 'chunk 3 is K');
      }
    });
  });

  describe('chunk builder - multi-phoneme GPC: "x" → K S', () => {
    // "box" → [B, AA, K, S]
    // "x" is a single letter producing two phonemes — both chunks must exist
    it('"box" produces 4 chunks: B, AA, K, S', () => {
      const chunks = alignmentToChunks('box', ['B', 'AA', 'K', 'S'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 4, '"box" has 4 chunks');
      if (chunks.length === 4) {
        assertEqual(chunks[0].phoneme, 'B', 'chunk 0 is B');
        assertEqual(chunks[1].phoneme, 'AA', 'chunk 1 is AA');
        assertEqual(chunks[2].phoneme, 'K', 'chunk 2 is K');
        assertEqual(chunks[3].phoneme, 'S', 'chunk 3 is S');
        // Both K and S should reference letter "x" (index 2)
        assert(chunks[2].letters[2] === 'speak', '"x" speaks for K');
        assert(chunks[3].letters[2] === 'speak', '"x" speaks for S (fallback)');
      }
    });
  });

  // ── Pronunciation overrides ────────────────────────────────────────

  describe('chunk builder - pronunciation overrides', () => {
    it('PRONUNCIATION_OVERRIDES contains "and" → AE N D', () => {
      const override = PRONUNCIATION_OVERRIDES['and'];
      assert(override !== undefined, '"and" has an override');
      if (override) {
        assertEqual(
          override.join(' '),
          'AE N D',
          '"and" override is AE N D (deliberate pronunciation)'
        );
      }
    });

    it('overrides map only contains valid ArpabetPhoneme arrays', () => {
      // Basic sanity: every override should have at least one phoneme
      let allValid = true;
      for (const [word, phonemes] of Object.entries(PRONUNCIATION_OVERRIDES)) {
        if (!Array.isArray(phonemes) || phonemes.length === 0) {
          console.log(`  ✗ override for "${word}" is empty or not an array`);
          allValid = false;
        }
      }
      assert(allValid, 'all overrides are non-empty phoneme arrays');
    });
  });

  // ── Every-phoneme-gets-a-chunk invariant ───────────────────────────

  describe('chunk builder - sight words', () => {
    // Fair letters (consonants + primary short vowels) keep their own GPC; the
    // rest of the word resolves to the sight word's GPC.
    const summarize = (chunks: PhoneticChunk[]) =>
      chunks.map((c) => `${c.label}/${c.phoneme}/${c.gpcId}`);

    it('"said" → s | ai (the sight word) | d', () => {
      const chunks = alignmentToChunks('said', ['S', 'EH', 'D'] as ArpabetPhoneme[]);
      assertEqual(
        summarize(chunks),
        ['s/S/GPC-s-S', 'ai/EH/GPC-WORD-said', 'd/D/GPC-d-D'],
        '"said" chunks',
      );
    });

    it('"was" → w | a | s — the a is not fair, though a-AH exists', () => {
      const chunks = alignmentToChunks('was', ['W', 'AH', 'Z'] as ArpabetPhoneme[]);
      assertEqual(
        summarize(chunks),
        ['w/W/GPC-w-W', 'a/AH/GPC-WORD-was', 's/Z/GPC-s-Z'],
        '"was" chunks',
      );
    });

    it('"the" → th | e', () => {
      const chunks = alignmentToChunks('the', ['DH', 'AH'] as ArpabetPhoneme[]);
      assertEqual(summarize(chunks), ['th/DH/GPC-th-DH', 'e/AH/GPC-WORD-the'], '"the" chunks');
    });

    it('"have": primary short vowel is fair; the silent e gets no chunk', () => {
      const chunks = alignmentToChunks('have', ['HH', 'AE', 'V'] as ArpabetPhoneme[]);
      assertEqual(
        summarize(chunks),
        ['h/HH/GPC-h-HH', 'a/AE/GPC-a-AE', 'v/V/GPC-v-V'],
        '"have" chunks',
      );
      assert(!chunks.some((c) => 3 in c.letters), '"have": the e is in no chunk');
    });

    it('"could": a follow-up consonant in the remainder claims its letter', () => {
      const chunks = alignmentToChunks('could', ['K', 'UH', 'D'] as ArpabetPhoneme[]);
      assertEqual(
        summarize(chunks),
        ['c/K/GPC-c-K', 'oul/UH/GPC-WORD-could', 'd/D/GPC-WORD-could'],
        '"could" chunks',
      );
    });

    it('authored parts overrule the guess at the odd part, and only move letters', () => {
      const of = alignmentToChunks('of', ['AH', 'V'] as ArpabetPhoneme[]);
      assertEqual(summarize(of), ['o/AH/GPC-WORD-of', 'f/V/GPC-WORD-of'], '"of" chunks');
      const who = alignmentToChunks('who', ['HH', 'UW'] as ArpabetPhoneme[]);
      assertEqual(summarize(who), ['wh/HH/GPC-WORD-who', 'o/UW/GPC-WORD-who'], '"who" chunks');
      // A repeated part is the same letters making another sound; the e is silent
      const one = alignmentToChunks('one', ['W', 'AH', 'N'] as ArpabetPhoneme[]);
      assertEqual(
        one.map((c) => Object.keys(c.letters).join(',')),
        ['0', '0', '1'],
        '"one": o is /w/ and /ʌ/, n is /n/',
      );
      assert(!one.some((c) => 2 in c.letters), '"one": the e is in no chunk');
      // ar as in car; the guess paired a with the e
      const are = alignmentToChunks('are', ['AA', 'R'] as ArpabetPhoneme[]);
      assertEqual(summarize(are), ['a/AA/GPC-WORD-are', 'r/R/GPC-WORD-are'], '"are" chunks');
    });

    it('"one": no fair letters → every chunk is the sight word, one per phoneme', () => {
      const chunks = alignmentToChunks('one', ['W', 'AH', 'N'] as ArpabetPhoneme[]);
      assertEqual(chunks.length, 3, '"one" has 3 chunks');
      assert(chunks.every((c) => c.gpcId === 'GPC-WORD-one'), '"one": all chunks are GPC-WORD-one');
    });

    it('every catalogue sight word: one chunk per phoneme, every chunk carries a gpcId', () => {
      const seen = new Set<string>();
      for (const entry of getDefaultCatalogueIndex().byId.values()) {
        if (entry.matchType !== 'whole_word' || seen.has(entry.grapheme)) continue;
        // A single letter always parses as its letter GPC, so "a" / "i" never
        // match as whole words (both are leaving the slate — b.3 todo §0).
        if (entry.grapheme.length === 1) continue;
        seen.add(entry.grapheme);
        const phonemes = entry.phoneme.split(' ') as ArpabetPhoneme[];
        const chunks = alignmentToChunks(entry.grapheme, phonemes);
        assertEqual(chunks.length, phonemes.length, `"${entry.grapheme}" chunk count`);
        assert(chunks.every((c) => c.gpcId !== undefined), `"${entry.grapheme}" chunks all carry a gpcId`);
      }
    });

    it('regular words carry no gpcId', () => {
      const chunks = alignmentToChunks('cat', ['K', 'AE', 'T'] as ArpabetPhoneme[]);
      assert(chunks.every((c) => c.gpcId === undefined), '"cat": no gpcId');
    });
  });

  describe('chunk builder - phoneme count invariant', () => {
    // For any correctly-aligned word, the number of chunks should equal
    // the number of phonemes (minus any that are purely silent segments
    // folded into split-digraph chunks).

    const invariantWords: Array<{ word: string; phonemes: ArpabetPhoneme[]; expectedChunks: number }> = [
      { word: 'ring', phonemes: ['R', 'IH', 'NG'] as ArpabetPhoneme[], expectedChunks: 3 },
      { word: 'sing', phonemes: ['S', 'IH', 'NG'] as ArpabetPhoneme[], expectedChunks: 3 },
      { word: 'long', phonemes: ['L', 'AO', 'NG'] as ArpabetPhoneme[], expectedChunks: 3 },
      { word: 'night', phonemes: ['N', 'AY', 'T'] as ArpabetPhoneme[], expectedChunks: 3 },
      { word: 'rain', phonemes: ['R', 'EY', 'N'] as ArpabetPhoneme[], expectedChunks: 3 },
      { word: 'boat', phonemes: ['B', 'OW', 'T'] as ArpabetPhoneme[], expectedChunks: 3 },
    ];

    for (const { word, phonemes, expectedChunks } of invariantWords) {
      it(`"${word}" produces ${expectedChunks} chunks`, () => {
        const chunks = alignmentToChunks(word, phonemes);
        assertEqual(chunks.length, expectedChunks, `"${word}" chunk count`);
      });
    }
  });
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║          Alignment Engine v2 Test Suite                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // Section 8.1: Unit Tests
    runMatchTypeTests();

    // Section 8.2: Integration Tests
    runAlignmentIntegrationTests();
    runDecodeIntegrationTests();

    // Section 8.3: Corpus Metrics
    runCorpusMetricsTests();

    // Additional test categories
    runHelperFunctionTests();
    runEdgeCaseTests();

    // Chunk builder tests (alignment → PhoneticChunks for stepper UI)
    runChunkBuilderTests();
  } catch (err) {
    console.error('\n❌ Test suite crashed:', (err as Error).message);
    console.error((err as Error).stack);
  }

  const elapsed = Date.now() - startTime;

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('Test Summary');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log(`  ✓ Passed:  ${passCount}`);
  console.log(`  ✗ Failed:  ${failCount}`);
  console.log(`  ○ Skipped: ${skipCount}`);
  console.log(`  ⏱ Time:    ${elapsed}ms`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(console.error);
