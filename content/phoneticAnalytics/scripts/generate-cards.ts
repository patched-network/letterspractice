/**
 * Card Generation Script (P3)
 * ============================
 *
 * Generates card documents as JSON for bulk upload to CouchDB.
 * Produces SpellingQuestion, WhoSaidThat, and WordSelection cards
 * with computed navigation tags for the content pipeline.
 *
 * INPUTS:
 *   - outputs-v2/gpc-sequence.json       — teaching order
 *   - outputs-v2/gpc-minimal-pairs.json  — minimal pair data for WordSelection
 *   - lib/catalogue.ts                   — GPC definitions
 *   - src/audio/word-list.ts             — 585 words with recorded audio
 *   - outputs-v2/teaching-words.json     — word→GPC mapping
 *
 * OUTPUTS:
 *   - outputs-v2/generated-cards.json    — all generated card documents
 *
 * USAGE:
 *   npx tsx scripts/generate-cards.ts
 *   yarn gen:cards
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

import {
  GPC_CATALOGUE,
  getDefaultCatalogueIndex,
  isOddSightWordChunk,
  type GPCEntry,
  type GPCCategory,
  type MatchType,
} from "../lib/catalogue";

import {
  gpcShortId,
  gpcTag,
  gpcIntroCardId,
  digraphGpcIntroCardId,
  splitDigraphIntroCardId,
  sightWordIntroCardId,
  whoSaidThatCardId,
  whoSaidThatFocusGroupCardId,
} from "../lib/content-labelling";

// Concept tags come from the curriculum layer (lesson assignments + overrides),
// not the mechanical category derivation — see lib/curriculum.ts.
import {
  effectiveConceptTags,
  assignmentFor,
  POST_LESSON_SEED_CARDS,
  LESSON_GATED_CARDS,
  cardGateTags,
} from "../lib/curriculum";

// Sight-word cards chunk their word (fair letters vs the rest) and look up
// homophones / foil pronunciations the same way the app does.
import { alignmentToChunks } from "../lib/chunk-builder";
import { lookupWord } from "../lib/dictionary";
import type { ArpabetPhoneme } from "../lib/types";

// Build-time curriculum coverage report (P4.2).
import {
  buildCoverageRows,
  formatCoverageMarkdown,
  type AudioTally,
} from "../lib/curriculum-coverage";

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");
const SRC_ROOT = resolve(__dirname, "..", "..", "..", "src");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedCard {
  /** Deterministic CouchDB document ID */
  _id: string;
  /** Question type class name */
  questionType: "SpellingQuestion" | "WhoSaidThat" | "WordSelection" | "MissingLetters" | "GpcIntro" | "DigraphGpcIntro" | "SplitDigraphIntro" | "SightWordIntro";
  /** Question-specific data fields matching the DataShape */
  data: Record<string, unknown>;
  /** Computed navigation tags */
  tags: string[];
  /** Metadata (for traceability, not stored in CouchDB) */
  meta: {
    sourceWord?: string;
    sourceGpcId?: string;
    /** Sight-word intros: 0 = first in the drip (the prescribed order, deploy-content.ts) */
    dripRank?: number;
    generationReason: string;
  };
}

interface SequenceStep {
  step: number;
  gpcId: string;
  marginalGain: number;
  marginalFrequency: number;
  cumulativeGpcs: number;
  cumulativeWords: number;
  cumulativeFrequency: number;
  coveragePercent: number;
}

interface SequenceData {
  sequence: SequenceStep[];
  initialKnown: string[];
}

interface TeachingWord {
  word: string;
  phonemes: string[];
  frequency: number;
  gpcs: string[];
  pattern: string;
  issues: string[];
  fullyAligned: boolean;
}

interface TeachingWordsData {
  meta: Record<string, unknown>;
  words: TeachingWord[];
}

interface MinimalPairEntry {
  partner: string;
  gpcIndex: number;
  position: "onset" | "coda" | "nucleus" | "coda-cluster";
  gpcA: string;
  gpcB: string;
  graphemeA: string;
  graphemeB: string;
  phonemeA: string;
  phonemeB: string;
}

type MinimalPairsData = Record<string, MinimalPairEntry[]>;

// ---------------------------------------------------------------------------
// Blocked words — excluded from all card types (target and distractor)
// ---------------------------------------------------------------------------

const BLOCKED_WORDS = new Set([
  "i", // renders as lowercase "i" but the word is uppercase "I" — no uppercase teaching path yet
]);

/** Synthetic GPCs that exist for alignment purposes but are not learnable
 *  targets. Skip these when building exercise/expose tags to prevent
 *  noise in ELO tracking. */
const SYNTHETIC_GPCS = new Set(['GPC-e-silent-split']);

/** Synthetic GPCEntry for the silent-e in split digraph words.
 *  Not in the catalogue, but needed by ML generation to walk the word's GPC
 *  array without bailing on unknown entries. */
const SILENT_E_SPLIT_ENTRY: GPCEntry = {
  id: 'GPC-e-silent-split',
  grapheme: 'e',
  phoneme: '',
  category: 'vowels_long_split',
  matchType: 'silent',
};

// ---------------------------------------------------------------------------
// Vowel detection for skill tags
// ---------------------------------------------------------------------------

const VOWEL_PHONEMES = new Set([
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "EH",
  "ER",
  "EY",
  "IH",
  "IY",
  "OW",
  "OY",
  "UH",
  "UW",
]);

// ---------------------------------------------------------------------------
// UI tag constants
// ---------------------------------------------------------------------------

const UI_TAG_SPELLING = "ui:spelling";
const UI_TAG_WHO_SAID_THAT = "ui:who-said-that";
const UI_TAG_WORD_SELECTION = "ui:word-selection";
const UI_TAG_MISSING_LETTERS = "ui:missing-letters";
const UI_TAG_GPC_INTRO = "ui:gpc-intro";
const UI_TAG_DIGRAPH_GPC_INTRO = "ui:digraph-gpc-intro";
const UI_TAG_SPLIT_DIGRAPH_INTRO = "ui:split-digraph-intro";
const UI_TAG_SIGHT_WORD_INTRO = "ui:sight-word-intro";
const SRS_SKIP = "srs:skip";

// Skill concept tags
const SKILL_BLENDING = "concept:skill:blending";
const SKILL_SEGMENTING = "concept:skill:segmenting";
const SKILL_FIRST_PHONEME_DIFF = "concept:skill:first-phoneme-diff";
const SKILL_FINAL_PHONEME_DIFF = "concept:skill:final-phoneme-diff";
const SKILL_MEDIAL_VOWEL_DIFF = "concept:skill:medial-vowel-diff";

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function loadSequence(): SequenceData {
  const raw = readFileSync(resolve(OUTPUTS_V2, "gpc-sequence.json"), "utf-8");
  return JSON.parse(raw);
}

function loadTeachingWords(): TeachingWordsData {
  const raw = readFileSync(resolve(OUTPUTS_V2, "teaching-words.json"), "utf-8");
  return JSON.parse(raw);
}

function loadMinimalPairs(): MinimalPairsData {
  const raw = readFileSync(
    resolve(OUTPUTS_V2, "gpc-minimal-pairs.json"),
    "utf-8",
  );
  return JSON.parse(raw);
}

function loadAudioWordList(): Set<string> {
  // Parse word-list.ts to extract available words with recorded audio
  const filePath = resolve(SRC_ROOT, "audio", "word-list.ts");
  const content = readFileSync(filePath, "utf-8");
  const words = new Set<string>();
  const re = /^\s+'([a-z]+)'/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    words.add(match[1]);
  }
  return words;
}

// ---------------------------------------------------------------------------
// Catalogue helpers
// ---------------------------------------------------------------------------

const catalogueIndex = getDefaultCatalogueIndex();

function getEntry(gpcId: string): GPCEntry | undefined {
  return catalogueIndex.byId.get(gpcId);
}

/**
 * Get the dominant/simple phoneme for a single letter.
 * Used for WhoSaidThat card phoneme field.
 */
function getDominantPhoneme(letter: string): string {
  const LETTER_TO_PHONEME: Record<string, string> = {
    a: "AE",
    b: "B",
    c: "K",
    d: "D",
    e: "EH",
    f: "F",
    g: "G",
    h: "HH",
    i: "IH",
    j: "JH",
    k: "K",
    l: "L",
    m: "M",
    n: "N",
    o: "AA",
    p: "P",
    q: "K",
    r: "R",
    s: "S",
    t: "T",
    u: "AH",
    v: "V",
    w: "W",
    x: "K",
    y: "Y",
    z: "Z",
  };
  return LETTER_TO_PHONEME[letter.toLowerCase()] || letter.toUpperCase();
}

/**
 * Short hash for deterministic IDs
 */
function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

// ============================================================================
// SPELLING QUESTION CARDS
// ============================================================================

function generateSpellingCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
  sightWordHomophones: ReadonlySet<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  for (const tw of teachingWords.words) {
    if (BLOCKED_WORDS.has(tw.word)) continue;

    // Filter: word must have recorded audio
    if (!audioWords.has(tw.word)) continue;

    // Filter: all GPCs in the word must be in the teaching sequence. Sight
    // words are exempt: the sequencer credits a sight word with a regular
    // reading ("have") to regular GPCs, so its WORD-* may never enter the
    // sequence — but it is taught as a whole word regardless.
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g) || isWholeWordGpcId(g))) continue;

    // A sight word with an in-app homophone can't be spelled from its audio.
    if (sightWordHomophones.has(tw.word)) continue;

    // Build tags
    const tags: string[] = [UI_TAG_SPELLING, SKILL_BLENDING, SKILL_SEGMENTING];
    const conceptSet = new Set<string>();

    for (const gpcId of tw.gpcs) {
      if (SYNTHETIC_GPCS.has(gpcId)) continue;
      tags.push(gpcTag("exercise", gpcId));

      const entry = getEntry(gpcId);
      if (entry) {
        for (const ct of effectiveConceptTags(entry)) {
          conceptSet.add(ct);
        }
      }
    }

    for (const ct of conceptSet) {
      tags.push(ct);
    }

    const cardId = `c-spelling-${tw.word}`;

    cards.push({
      _id: cardId,
      questionType: "SpellingQuestion",
      data: {
        word: tw.word,
      },
      tags: [...new Set(tags)],
      meta: {
        sourceWord: tw.word,
        generationReason: `spelling-word-${tw.word}`,
      },
    });
  }

  return cards;
}

// ============================================================================
// WHO SAID THAT CARDS
// ============================================================================

/**
 * Focus groups: deliberate confusable-letter pairings for interference-tagged
 * WST cards. Each group produces one card per member (target = member,
 * distractors = rest of group).
 *
 * Two categories:
 *   - Visual: mirror/rotation confusables (b/d, p/q, etc.)
 *   - Voicing: same place of articulation, voiced/unvoiced pairs
 */
const WST_FOCUS_GROUPS: { name: string; kind: "visual" | "voicing"; letters: string[] }[] = [
  // Visual confusables
  // (p/q and b/q dropped with q-K's removal from cardgen — q is taught only in
  // 'qu' context; p and b keep their discrimination via mirror-bd/rotation-pd/voicing-pb.)
  { name: "mirror-bd",       kind: "visual",  letters: ["b", "d"] },
  { name: "rotation-pd",     kind: "visual",  letters: ["p", "d"] },
  { name: "rotation-un",     kind: "visual",  letters: ["u", "n"] },
  { name: "rotation-mw",     kind: "visual",  letters: ["m", "w"] },
  // Voicing pairs
  { name: "voicing-fv",      kind: "voicing", letters: ["f", "v"] },
  { name: "voicing-sz",      kind: "voicing", letters: ["s", "z"] },
  { name: "voicing-td",      kind: "voicing", letters: ["t", "d"] },
  { name: "voicing-pb",      kind: "voicing", letters: ["p", "b"] },
  { name: "voicing-kg",      kind: "voicing", letters: ["k", "g"] },
  { name: "voicing-cg",      kind: "voicing", letters: ["c", "g"] },
];

function generateWhoSaidThatCards(
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Get all teaching GPC entries that are appropriate for WhoSaidThat
  const teachingEntries = Array.from(sequenceGpcIds)
    .map((id) => getEntry(id))
    .filter((e): e is GPCEntry => e !== undefined);

  // WST eligibility: consonants (including soft c/g) + 2 vowels per letter.
  // WST teaches letters in isolation — obscure vowel alternations are taught
  // in context via WS/spelling.
  //
  // Consonant drops:
  //   - s→/Z/ (marginal voicing alternation, taught contextually)
  //   - x→/Z/ (rare, xylophone), replaced by x→/K_S/ (canonical)
  // Consonant includes:
  //   - c→/S/ (soft c) and g→/JH/ (soft g) — earliest phonetic ambiguity teaching
  //   - x→/K_S/ — multi-phoneme but canonical ("x says /ks/")
  const WST_CONSONANT_BLOCKLIST = new Set([
    "GPC-s-Z",   // voicing alternation — contextual
    "GPC-x-Z",   // rare — replaced by x→/K_S/
    "GPC-x-G_Z", // /gz/ (exam) — no recording, card can't render
    "GPC-q-K",   // q only occurs in 'qu'; taught in-context via qu-K_W, not as an isolated letter
  ]);

  const WST_VOWEL_ALLOWLIST = new Set([
    "GPC-a-AE",   // short a (cat)
    "GPC-a_e-EY", // long a (make)
    "GPC-e-EH",   // short e (bed)
    "GPC-e_e-IY", // long e (these)
    "GPC-i-IH",   // short i (sit)
    "GPC-i_e-AY", // long i (kite)
    "GPC-o-AA",   // short o (hot)
    "GPC-o_e-OW", // long o (home)
    "GPC-u-AH",   // short u (cup)
    "GPC-u_e-UW", // long u (flute)
  ]);

  const WST_CONSONANT_CATEGORIES = new Set(["consonants", "consonants_soft"]);

  const wstEligible = teachingEntries.filter((e) => {
    if (WST_CONSONANT_BLOCKLIST.has(e.id)) return false;
    if (e.matchType === "whole_word" || e.matchType === "silent") return false;
    if (e.phoneme === "") return false;
    // Consonants: allow both simple and soft categories
    if (WST_CONSONANT_CATEGORIES.has(e.category)) return true;
    // Vowels: only the allowlisted short/long pairs
    return WST_VOWEL_ALLOWLIST.has(e.id);
  });

  // Index eligible entries by display letter for focus group lookups
  const byLetter = new Map<string, GPCEntry>();
  for (const e of wstEligible) {
    const letter = e.grapheme.includes("_") ? e.grapheme.split("_")[0] : e.grapheme;
    // For letters with multiple GPCs (e.g., s→S and s→Z), prefer the dominant one
    // (first encountered = from teaching sequence order)
    if (!byLetter.has(letter)) byLetter.set(letter, e);
  }

  console.log(`  WhoSaidThat eligible GPCs: ${wstEligible.length}`);

  // ---- 1. Distractor-free cards: one per eligible GPC ----
  // Runtime populates distractors dynamically based on user ELO and unlocked letters.
  for (const targetEntry of wstEligible) {
    const correctLetter =
      targetEntry.matchType === "split_digraph"
        ? targetEntry.grapheme.split("_")[0]
        : targetEntry.grapheme;

    const tags: string[] = [UI_TAG_WHO_SAID_THAT];
    tags.push(gpcTag("exercise", targetEntry.id));
    for (const ct of effectiveConceptTags(targetEntry)) {
      tags.push(ct);
    }

    const cardId = whoSaidThatCardId(targetEntry.id);

    cards.push({
      _id: cardId,
      questionType: "WhoSaidThat",
      data: {
        targetPhoneme: targetEntry.phoneme,
        correctLetter,
        // The graded GPC. correctLetter alone loses it for split digraphs (a_e → "a").
        gpcId: gpcShortId(targetEntry.id),
        // No distractors — runtime selects them adaptively
      },
      tags: [...new Set(tags)],
      meta: {
        sourceGpcId: targetEntry.id,
        generationReason: `wst-auto-${gpcShortId(targetEntry.id)}`,
      },
    });
  }

  console.log(`    distractor-free: ${wstEligible.length} cards`);

  // ---- 2. Focus group cards: fixed distractors for confusable pairs ----
  // Each group member becomes a target with the rest as distractors.
  // Tagged with interference concept for navigator gating.
  let focusCount = 0;

  for (const group of WST_FOCUS_GROUPS) {
    // Verify all group members are in the eligible set
    const groupEntries = group.letters
      .map((l) => byLetter.get(l))
      .filter((e): e is GPCEntry => e !== undefined);

    if (groupEntries.length < 2) {
      console.warn(`    ⚠️ focus group "${group.name}": only ${groupEntries.length} eligible members, skipping`);
      continue;
    }

    for (const targetEntry of groupEntries) {
      const correctLetter =
        targetEntry.matchType === "split_digraph"
          ? targetEntry.grapheme.split("_")[0]
          : targetEntry.grapheme;

      const distractorLetters = groupEntries
        .filter((e) => e.id !== targetEntry.id)
        .map((e) =>
          e.matchType === "split_digraph"
            ? e.grapheme.split("_")[0]
            : e.grapheme,
        );

      const tags: string[] = [UI_TAG_WHO_SAID_THAT];
      tags.push(gpcTag("exercise", targetEntry.id));
      for (const ct of effectiveConceptTags(targetEntry)) {
        tags.push(ct);
      }
      // Tag with interference concept so navigator can gate appropriately
      tags.push(`concept:interference:${group.kind}`);
      tags.push(`concept:interference:${group.name}`);

      // Distractor GPCs get expose tags
      for (const e of groupEntries) {
        if (e.id !== targetEntry.id) {
          tags.push(gpcTag("expose", e.id));
        }
      }

      const cardId = whoSaidThatFocusGroupCardId(group.name, correctLetter);

      cards.push({
        _id: cardId,
        questionType: "WhoSaidThat",
        data: {
          targetPhoneme: targetEntry.phoneme,
          correctLetter,
          gpcId: gpcShortId(targetEntry.id),
          distractors: distractorLetters.join(","),
        },
        tags: [...new Set(tags)],
        meta: {
          sourceGpcId: targetEntry.id,
          generationReason: `wst-focus-${group.name}-${correctLetter}`,
        },
      });
      focusCount++;
    }
  }

  console.log(`    focus group: ${focusCount} cards (${WST_FOCUS_GROUPS.length} groups)`);

  return cards;
}

// ============================================================================
// WORD SELECTION CARDS
// ============================================================================

function generateWordSelectionCards(
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
  teachingWords: TeachingWordsData,
  minimalPairs: MinimalPairsData,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Build word→GPC map from teaching words
  const wordToGpcs = new Map<string, string[]>();
  for (const tw of teachingWords.words) {
    wordToGpcs.set(tw.word, tw.gpcs);
  }

  // Build word→phonemes map
  const wordToPhonemes = new Map<string, string[]>();
  for (const tw of teachingWords.words) {
    wordToPhonemes.set(tw.word, tw.phonemes);
  }

  // Track generated concept keys to enforce one card per (target, exerciseGpc)
  const generatedConceptKeys = new Set<string>();
  // Track generated card IDs to ensure uniqueness while using descriptive names
  const generatedCardIds = new Set<string>();

  /** Collect up to 3 unique distractor words from (already-sorted) pairs. */
  function collectDistractors(pairs: MinimalPairEntry[]): string[] {
    const out: string[] = [];
    for (const pair of pairs) {
      if (out.length >= 3) break;
      if (!out.includes(pair.partner)) out.push(pair.partner);
    }
    return out;
  }

  /**
   * Build one WordSelection card. When `foilGpcId` is set the card also
   * exercises that foil GPC — used for subsuming-digraph foils (ten|then),
   * which can't be solved by target recognition alone and so inherit the
   * foil digraph's intro gate (and carry its concept tags).
   */
  function buildWsCard(
    targetWord: string,
    targetGpcs: string[],
    distinguishingGpcId: string,
    distractors: string[],
    position: string,
    foilGpcId: string | null,
  ): GeneratedCard | null {
    if (distractors.length === 0) return null;

    const tags: string[] = [UI_TAG_WORD_SELECTION];
    const conceptSet = new Set<string>();

    for (const gpcId of targetGpcs) {
      if (SYNTHETIC_GPCS.has(gpcId)) continue;
      const entry = getEntry(gpcId);
      if (gpcId === distinguishingGpcId) {
        tags.push(gpcTag("exercise", gpcId));
        if (entry) for (const ct of effectiveConceptTags(entry)) conceptSet.add(ct);
      } else {
        tags.push(gpcTag("expose", gpcId));
      }
    }

    // Subsuming-digraph foil: the card actively discriminates the digraph,
    // so it exercises that GPC and carries its concept tags (gated by intro).
    if (foilGpcId) {
      tags.push(gpcTag("exercise", foilGpcId));
      const foilEntry = getEntry(foilGpcId);
      if (foilEntry) for (const ct of effectiveConceptTags(foilEntry)) conceptSet.add(ct);
    }

    // Skill concept tags based on position
    if (position === "onset" || position === "onset-cluster") {
      conceptSet.add(SKILL_FIRST_PHONEME_DIFF);
    } else if (position === "coda" || position === "coda-cluster") {
      conceptSet.add(SKILL_FINAL_PHONEME_DIFF);
    } else if (position === "nucleus" || position === "core") {
      conceptSet.add(SKILL_MEDIAL_VOWEL_DIFF);
    }
    for (const ct of conceptSet) tags.push(ct);

    // Build audio URLs for prefetching
    const allWords = [targetWord, ...distractors];
    const audioUrls = allWords.map((w) => `/audio/words/${w}.mp3`).join(",");

    // Build card ID — informative names: c-ws-target-position[-vs-foil]
    const POSITION_LABELS: Record<string, string> = {
      onset: "onset",
      "onset-cluster": "onset",
      nucleus: "core",
      coda: "coda",
      "coda-cluster": "coda",
    };
    const posLabel = POSITION_LABELS[position] || position;
    let cardId = `c-ws-${targetWord}-${posLabel}`;
    if (foilGpcId) cardId += `-vs-${gpcShortId(foilGpcId)}`;
    // Disambiguate rare same-position collisions (e.g. onset clusters).
    if (generatedCardIds.has(cardId)) cardId += `-${gpcShortId(distinguishingGpcId)}`;
    generatedCardIds.add(cardId);

    return {
      _id: cardId,
      questionType: "WordSelection",
      data: {
        target: targetWord,
        distractors: distractors.join(","),
        audioUrls,
      },
      tags: [...new Set(tags)],
      meta: {
        sourceWord: targetWord,
        generationReason: `ws-minpair-${targetWord}-${distractors.join("-")}`,
      },
    };
  }

  // Process each word that has audio and minimal pairs
  const wordsWithPairs = Object.keys(minimalPairs).filter(
    (w) => audioWords.has(w) && wordToGpcs.has(w),
  );

  console.log(`  Words with audio + minimal pairs: ${wordsWithPairs.length}`);

  for (const targetWord of wordsWithPairs) {
    if (BLOCKED_WORDS.has(targetWord)) continue;

    const targetGpcs = wordToGpcs.get(targetWord)!;

    // Filter: target word must be fully decodable
    if (!targetGpcs.every((g) => sequenceGpcIds.has(g))) continue;

    const pairs = minimalPairs[targetWord];
    if (!pairs || pairs.length === 0) continue;

    // Filter pairs to those where partner also has audio, is not a homophone, and is not blocked
    const targetPhonemeKey = (wordToPhonemes.get(targetWord) || []).join(" ");
    const validPairs = pairs.filter((p) => {
      if (BLOCKED_WORDS.has(p.partner)) return false;
      if (!audioWords.has(p.partner) || !wordToGpcs.has(p.partner)) return false;
      // Exclude homophones — same pronunciation makes the card unanswerable by ear
      const partnerPhonemes = wordToPhonemes.get(p.partner);
      if (partnerPhonemes && partnerPhonemes.join(" ") === targetPhonemeKey) return false;
      return true;
    });

    if (validPairs.length === 0) continue;

    // Group valid pairs by distinguishing GPC (the exercised concept).
    // Multiple pairs can share the same gpcA — e.g., (sit,bit) and (sit,hit)
    // both distinguish on s-S at onset. We collect all distractors for each
    // distinguishing GPC and emit one card with the richest distractor set.
    const byGpc = new Map<string, MinimalPairEntry[]>();
    for (const pair of validPairs) {
      // Filter: partner must be fully decodable
      const partnerGpcs = wordToGpcs.get(pair.partner);
      if (!partnerGpcs || !partnerGpcs.every((g) => sequenceGpcIds.has(g))) continue;
      const key = pair.gpcA;
      if (!byGpc.has(key)) byGpc.set(key, []);
      byGpc.get(key)!.push(pair);
    }

    for (const [distinguishingGpcId, gpcPairs] of byGpc.entries()) {
      // Sort distractors: prefer partners sharing more GPCs with target (cleaner minimal pairs)
      const sorted = gpcPairs.sort((a, b) => {
        const aGpcs = wordToGpcs.get(a.partner) || [];
        const bGpcs = wordToGpcs.get(b.partner) || [];
        const aShared = aGpcs.filter((g) => targetGpcs.includes(g)).length;
        const bShared = bGpcs.filter((g) => targetGpcs.includes(g)).length;
        return bShared - aShared;
      });

      // Partition foils. A foil whose distinguishing grapheme is a DIGRAPH
      // that CONTAINS the target's grapheme (ten|then: th⊇t, sip|ship: sh⊇s,
      // hat|that: th⊇h) cannot be resolved by recognizing the target alone —
      // the digraph reuses the known letter but reassigns its sound, so the
      // card genuinely requires digraph knowledge. Those are peeled into their
      // own card that exercises the foil GPC (inheriting its intro gate). Every
      // other foil (ten|hen, tip|ship, sip|zip) is solvable by target
      // recognition and stays in the plain card, exercising the target only.
      const plainPairs: MinimalPairEntry[] = [];
      const digraphFoilsByGpc = new Map<string, MinimalPairEntry[]>();
      for (const pair of sorted) {
        const foilEntry = getEntry(pair.gpcB);
        const subsumingDigraph =
          foilEntry?.matchType === "digraph" &&
          pair.graphemeB.includes(pair.graphemeA);
        if (subsumingDigraph) {
          const group = digraphFoilsByGpc.get(pair.gpcB) ?? [];
          group.push(pair);
          digraphFoilsByGpc.set(pair.gpcB, group);
        } else {
          plainPairs.push(pair);
        }
      }

      // Plain, recognition-sufficient card (one per target × distinguishing GPC).
      if (plainPairs.length > 0) {
        const conceptKey = `${targetWord}|${distinguishingGpcId}`;
        if (!generatedConceptKeys.has(conceptKey)) {
          generatedConceptKeys.add(conceptKey);
          const card = buildWsCard(
            targetWord,
            targetGpcs,
            distinguishingGpcId,
            collectDistractors(plainPairs),
            plainPairs[0].position,
            null,
          );
          if (card) cards.push(card);
        }
      }

      // Digraph-discrimination cards — one per subsuming-digraph foil GPC,
      // gated behind that digraph's intro via its exercise tag.
      for (const [foilGpcId, foilPairs] of digraphFoilsByGpc.entries()) {
        const conceptKey = `${targetWord}|${distinguishingGpcId}|${foilGpcId}`;
        if (generatedConceptKeys.has(conceptKey)) continue;
        generatedConceptKeys.add(conceptKey);
        const card = buildWsCard(
          targetWord,
          targetGpcs,
          distinguishingGpcId,
          collectDistractors(foilPairs),
          foilPairs[0].position,
          foilGpcId,
        );
        if (card) cards.push(card);
      }
    }
  }

  return cards;
}

// ============================================================================
// SPLIT DIGRAPH CONTRAST CARDS (hat↔hate)
// ============================================================================

/**
 * Short-vowel ↔ long-vowel (split digraph) GPC mapping.
 * Each entry maps the split-digraph GPC to its short-vowel counterpart.
 */
const SPLIT_DIGRAPH_SHORT_VOWEL_MAP: Record<string, string> = {
  'GPC-a_e-EY': 'GPC-a-AE',
  'GPC-i_e-AY': 'GPC-i-IH',
  'GPC-o_e-OW': 'GPC-o-AA',
  'GPC-e_e-IY': 'GPC-e-EH',
  'GPC-u_e-UW': 'GPC-u-AH',
};

/**
 * Generates WordSelection cards contrasting short-vowel CVC words with their
 * split-digraph CVC+e counterparts (e.g., hat↔hate, bit↔bite).
 *
 * Each pair produces two cards (bidirectional): one with the long-vowel word
 * as target and one with the short-vowel word as target.
 */
function generateSplitDigraphContrastCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Index words by their GPC arrays for efficient lookup
  const wordByGpcs = new Map<string, string[]>();
  for (const tw of teachingWords.words) {
    wordByGpcs.set(tw.word, tw.gpcs);
  }

  // Find all split-digraph words: [onset, split-vowel, coda, GPC-e-silent-split]
  const splitDigraphWords: Array<{
    word: string;
    onset: string;
    splitVowel: string;
    coda: string;
  }> = [];

  for (const tw of teachingWords.words) {
    if (BLOCKED_WORDS.has(tw.word)) continue;
    if (!audioWords.has(tw.word)) continue;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) continue;

    // Look for the pattern: [onset, split-vowel, coda, GPC-e-silent-split]
    if (tw.gpcs.length !== 4) continue;
    if (tw.gpcs[3] !== 'GPC-e-silent-split') continue;

    const splitVowel = tw.gpcs[1];
    if (!SPLIT_DIGRAPH_SHORT_VOWEL_MAP[splitVowel]) continue;

    splitDigraphWords.push({
      word: tw.word,
      onset: tw.gpcs[0],
      splitVowel,
      coda: tw.gpcs[2],
    });
  }

  // Build a lookup: (onset, shortVowelGpc, coda) → word
  // for finding CVC counterparts
  const cvcIndex = new Map<string, string>();
  for (const tw of teachingWords.words) {
    if (BLOCKED_WORDS.has(tw.word)) continue;
    if (!audioWords.has(tw.word)) continue;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) continue;
    if (tw.gpcs.length !== 3) continue;

    const key = tw.gpcs.join('|');
    cvcIndex.set(key, tw.word);
  }

  console.log(`  Split-digraph words with audio: ${splitDigraphWords.length}`);

  let pairCount = 0;

  for (const sd of splitDigraphWords) {
    const shortVowelGpc = SPLIT_DIGRAPH_SHORT_VOWEL_MAP[sd.splitVowel];
    const cvcKey = `${sd.onset}|${shortVowelGpc}|${sd.coda}`;
    const shortWord = cvcIndex.get(cvcKey);

    if (!shortWord) continue;
    pairCount++;

    const splitVowelEntry = getEntry(sd.splitVowel);
    const shortVowelEntry = getEntry(shortVowelGpc);

    // Shared expose tags: onset + coda (non-synthetic)
    const sharedExposeGpcs = [sd.onset, sd.coda].filter(
      (g) => !SYNTHETIC_GPCS.has(g),
    );

    // Card 1: Long-vowel target (exercises split digraph identification)
    {
      const tags: string[] = [UI_TAG_WORD_SELECTION];
      if (!SYNTHETIC_GPCS.has(sd.splitVowel)) {
        tags.push(gpcTag('exercise', sd.splitVowel));
      }
      for (const g of sharedExposeGpcs) {
        tags.push(gpcTag('expose', g));
      }
      tags.push('concept:match:split_digraph');
      tags.push(SKILL_MEDIAL_VOWEL_DIFF);

      if (splitVowelEntry) {
        for (const ct of effectiveConceptTags(splitVowelEntry)) {
          if (!tags.includes(ct)) tags.push(ct);
        }
      }

      const audioUrls = [sd.word, shortWord]
        .map((w) => `/audio/words/${w}.mp3`)
        .join(',');

      cards.push({
        _id: `c-ws-${sd.word}-split-${gpcShortId(sd.splitVowel)}`,
        questionType: 'WordSelection',
        data: {
          target: sd.word,
          distractors: shortWord,
          audioUrls,
        },
        tags: [...new Set(tags)],
        meta: {
          sourceWord: sd.word,
          generationReason: `ws-split-contrast-${sd.word}-${shortWord}`,
        },
      });
    }

    // Card 2: Short-vowel target (exercises short vowel identification)
    {
      const tags: string[] = [UI_TAG_WORD_SELECTION];
      if (!SYNTHETIC_GPCS.has(shortVowelGpc)) {
        tags.push(gpcTag('exercise', shortVowelGpc));
      }
      for (const g of sharedExposeGpcs) {
        tags.push(gpcTag('expose', g));
      }
      tags.push('concept:vowel:short');
      tags.push('concept:match:split_digraph');
      tags.push(SKILL_MEDIAL_VOWEL_DIFF);

      if (shortVowelEntry) {
        for (const ct of effectiveConceptTags(shortVowelEntry)) {
          if (!tags.includes(ct)) tags.push(ct);
        }
      }

      const audioUrls = [shortWord, sd.word]
        .map((w) => `/audio/words/${w}.mp3`)
        .join(',');

      cards.push({
        _id: `c-ws-${shortWord}-split-${gpcShortId(shortVowelGpc)}`,
        questionType: 'WordSelection',
        data: {
          target: shortWord,
          distractors: sd.word,
          audioUrls,
        },
        tags: [...new Set(tags)],
        meta: {
          sourceWord: shortWord,
          generationReason: `ws-split-contrast-${shortWord}-${sd.word}`,
        },
      });
    }
  }

  console.log(`  Found ${pairCount} short↔long pairs, generated ${cards.length} cards`);

  // ---------------------------------------------------------------------------
  // Manual "closish" contrasts — word pairs that are pedagogically useful but
  // don't match the strict CVC↔CVCe pattern the automated logic requires.
  //
  // Each entry produces two WS cards (one per target direction).
  // Both words must be in audioWords; both GPC IDs must be in sequenceGpcIds.
  // ---------------------------------------------------------------------------
  const MANUAL_CONTRASTS: Array<{
    longWord: string;
    shortWord: string;
    /** GPC id exercised when longWord is target. */
    longGpc: string;
    /** GPC id exercised when shortWord is target. */
    shortGpc: string;
    /** GPCs passively exposed in both cards (filtered to sequenceGpcIds). */
    exposeGpcs: string[];
    note: string;
  }> = [
    {
      // "here" (h + e_e-IY + r + silent-e) vs "her" (h + er-ER)
      // Not a strict CVC↔CVCe pair because "her" collapses vowel+r into er-ER.
      // Pedagogically useful for long-e split-digraph vs r-controlled vowel contrast.
      longWord: 'here',
      shortWord: 'her',
      longGpc: 'GPC-e_e-IY',
      shortGpc: 'GPC-er-ER',
      exposeGpcs: ['GPC-h-HH'],
      note: 'her-here: r-controlled vs split-digraph e_e',
    },
  ];

  for (const mc of MANUAL_CONTRASTS) {
    if (!audioWords.has(mc.longWord) || !audioWords.has(mc.shortWord)) {
      console.warn(`  [manual contrast] Skipping ${mc.note} — missing audio`);
      continue;
    }
    if (!sequenceGpcIds.has(mc.longGpc) || !sequenceGpcIds.has(mc.shortGpc)) {
      console.warn(`  [manual contrast] Skipping ${mc.note} — GPC not in sequence`);
      continue;
    }
    const exposeGpcs = mc.exposeGpcs.filter((g) => sequenceGpcIds.has(g));

    // Card 1: long-vowel word as target
    cards.push({
      _id: `c-ws-${mc.longWord}-manual-${gpcShortId(mc.longGpc)}`,
      questionType: 'WordSelection',
      data: {
        target: mc.longWord,
        distractors: mc.shortWord,
        audioUrls: [mc.longWord, mc.shortWord].map((w) => `/audio/words/${w}.mp3`).join(','),
      },
      tags: [
        ...new Set([
          UI_TAG_WORD_SELECTION,
          gpcTag('exercise', mc.longGpc),
          ...exposeGpcs.map((g) => gpcTag('expose', g)),
          'concept:match:split_digraph',
          SKILL_MEDIAL_VOWEL_DIFF,
        ]),
      ],
      meta: { sourceWord: mc.longWord, generationReason: mc.note },
    });

    // Card 2: short/r-controlled word as target
    cards.push({
      _id: `c-ws-${mc.shortWord}-manual-${gpcShortId(mc.shortGpc)}`,
      questionType: 'WordSelection',
      data: {
        target: mc.shortWord,
        distractors: mc.longWord,
        audioUrls: [mc.shortWord, mc.longWord].map((w) => `/audio/words/${w}.mp3`).join(','),
      },
      tags: [
        ...new Set([
          UI_TAG_WORD_SELECTION,
          gpcTag('exercise', mc.shortGpc),
          ...exposeGpcs.map((g) => gpcTag('expose', g)),
          'concept:match:split_digraph',
          SKILL_MEDIAL_VOWEL_DIFF,
        ]),
      ],
      meta: { sourceWord: mc.shortWord, generationReason: mc.note },
    });

    console.log(`  [manual contrast] Generated 2 cards for ${mc.note}`);
  }

  return cards;
}

// ============================================================================
// MISSING LETTERS CARDS
// ============================================================================

/**
 * Compute how many character positions a GPC occupies in a word.
 *
 * - Split digraphs (e.g., a_e → EY): 1 char (just the vowel letter;
 *   the silent-e is a separate GPC entry in teaching-words.json)
 * - Digraphs/trigraphs (e.g., sh, igh): grapheme.length chars
 * - Simple (e.g., c, a, t): 1 char
 */
function gpcCharCount(gpcId: string): number {
  const entry = getEntry(gpcId);
  if (!entry) return 1;
  if (entry.matchType === "split_digraph") return 1;
  return entry.grapheme.length;
}

/** Categories whose GPCs represent consonant sounds */
const CONSONANT_CATEGORIES = new Set([
  "consonants",
  "consonants_soft",
  "digraphs",
  "trigraphs",
  "doubled_consonants",
  "latinate_digraphs",
  "syllabic_consonants",
]);

function isConsonantGpc(entry: GPCEntry): boolean {
  return CONSONANT_CATEGORIES.has(entry.category);
}

/**
 * Per-letter-position metadata used by ML card generation.
 * Maps each character index in a word to the GPC it belongs to.
 */
interface LetterPosition {
  /** Character index in the word */
  charIndex: number;
  /** Parent GPC ID from teaching-words.json */
  gpcId: string;
  /** Index of the parent GPC in the word's gpcs array */
  gpcIndex: number;
  /** The resolved GPCEntry for this position's parent GPC */
  entry: GPCEntry;
  /** Whether this letter is part of a consonant blend (adjacent consonant) */
  inBlend: boolean;
  /** Blend position: "onset" or "coda" (only set when inBlend is true) */
  blendPosition?: "onset" | "coda";
}

/**
 * Generate MissingLetters cards — fill-in-the-blanks word exercises.
 *
 * Strategy (a.3 — letter-level + GPC-level blanking):
 *
 * Two passes per word:
 *   1. Letter-level: one card per character position (single-letter blank).
 *      Tagged with the parent GPC. Produces cards like fi_h and fis_ for
 *      the sh digraph in "fish".
 *   2. GPC-level: for multi-character GPCs only (digraphs, split digraphs),
 *      one additional card blanking all positions of that GPC as a unit.
 *      Produces cards like fi__ for "fish", m_k_ for "make".
 *
 * Blend-awareness: cards where the blanked letter sits within a consonant
 * cluster get tagged concept:blend:onset or concept:blend:coda.
 *
 * Examples:
 *   "cat"  → 3 cards: _at, c_t, ca_
 *   "fish" → 5 cards: _ish, f_sh, fi_h, fis_, fi__
 *   "make" → 5 cards: _ake, m_ke, ma_e, mak_, m_k_
 *   "blank" → 5 cards: _lank, b_ank, bl_nk, bla_k, blan_
 *     (b_ank tagged concept:blend:onset — l adjacent consonant)
 */
function generateMissingLettersCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  for (const tw of teachingWords.words) {
    if (BLOCKED_WORDS.has(tw.word)) continue;
    if (!audioWords.has(tw.word)) continue;
    if (tw.word.length < 2) continue;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) continue;

    // --- Build per-letter position map ---
    // Walk the GPC array, expanding each GPC into its character positions.
    const letterPositions: LetterPosition[] = [];
    // Also track GPC-level spans for the second pass
    const gpcSpans: { gpcId: string; positions: number[]; gpcIndex: number; entry: GPCEntry }[] = [];
    let charPos = 0;

    for (let gi = 0; gi < tw.gpcs.length; gi++) {
      const gpcId = tw.gpcs[gi];
      const entry = getEntry(gpcId) ?? (gpcId === 'GPC-e-silent-split' ? SILENT_E_SPLIT_ENTRY : undefined);
      if (!entry) {
        // Unknown GPC — skip the whole word
        charPos = -1;
        break;
      }
      const len = gpcCharCount(gpcId);
      const positions: number[] = [];
      for (let ci = 0; ci < len; ci++) {
        positions.push(charPos + ci);
        letterPositions.push({
          charIndex: charPos + ci,
          gpcId,
          gpcIndex: gi,
          entry,
          inBlend: false, // computed below
        });
      }
      gpcSpans.push({ gpcId, positions, gpcIndex: gi, entry });
      charPos += len;
    }

    if (charPos === -1) continue; // unknown GPC bail

    // Sanity: computed positions must match word length
    if (charPos !== tw.word.length) {
      console.warn(
        `  ⚠️ ML position mismatch: "${tw.word}" computed=${charPos} actual=${tw.word.length}, skipping`,
      );
      continue;
    }

    // --- Detect consonant blends ---
    // A letter is in a blend if it's a consonant and at least one adjacent
    // letter (by character position) is also a consonant from a different GPC.
    for (let li = 0; li < letterPositions.length; li++) {
      const lp = letterPositions[li];
      if (!isConsonantGpc(lp.entry)) continue;

      const prev = li > 0 ? letterPositions[li - 1] : null;
      const next = li < letterPositions.length - 1 ? letterPositions[li + 1] : null;

      // Adjacent consonant from a *different* GPC = blend
      const prevIsBlendNeighbor = prev && prev.gpcId !== lp.gpcId && isConsonantGpc(prev.entry);
      const nextIsBlendNeighbor = next && next.gpcId !== lp.gpcId && isConsonantGpc(next.entry);

      if (prevIsBlendNeighbor || nextIsBlendNeighbor) {
        lp.inBlend = true;
        // Determine blend position: is this in the onset or coda of the word?
        // Find the first vowel GPC to split onset from coda
        const firstVowelCharIdx = letterPositions.findIndex(
          (p) => !isConsonantGpc(p.entry) && p.entry.matchType !== "silent" && p.entry.phoneme !== "",
        );
        if (firstVowelCharIdx >= 0) {
          lp.blendPosition = lp.charIndex < firstVowelCharIdx ? "onset" : "coda";
        }
      }
    }

    // --- For split digraphs, find the silent-e sibling positions ---
    const splitDigraphSilentPositions = new Map<number, number[]>();
    for (const span of gpcSpans) {
      if (span.entry.matchType === "split_digraph") {
        for (let sgi = span.gpcIndex + 1; sgi < gpcSpans.length; sgi++) {
          const sibling = gpcSpans[sgi];
          if (sibling.entry.matchType === "silent" || sibling.gpcId.includes("-silent")) {
            splitDigraphSilentPositions.set(span.gpcIndex, sibling.positions);
            break;
          }
        }
      }
    }

    // --- Helper: build tags for an ML card ---
    const buildTags = (
      exerciseGpcId: string,
      exerciseEntry: GPCEntry,
      blendTag?: string,
    ): string[] => {
      const tags: string[] = [UI_TAG_MISSING_LETTERS, SKILL_SEGMENTING];
      const conceptSet = new Set<string>();

      tags.push(gpcTag("exercise", exerciseGpcId));
      for (const ct of effectiveConceptTags(exerciseEntry)) {
        conceptSet.add(ct);
      }

      // All other non-silent GPCs in the word get expose tags
      for (const span of gpcSpans) {
        if (span.gpcId === exerciseGpcId) continue;
        if (span.entry.matchType === "silent" || span.gpcId.includes("-silent")) continue;
        tags.push(gpcTag("expose", span.gpcId));
      }

      if (blendTag) conceptSet.add(blendTag);

      for (const ct of conceptSet) {
        tags.push(ct);
      }
      return [...new Set(tags)];
    };

    // ---- Pass 1: Letter-level cards (one per character position) ----
    for (const lp of letterPositions) {
      // Skip silent GPCs — blanking a silent-e alone isn't a useful exercise
      if (lp.entry.matchType === "silent" || lp.gpcId.includes("-silent")) continue;
      // Skip whole-word GPCs
      if (lp.entry.matchType === "whole_word") continue;

      const blendTag = lp.inBlend && lp.blendPosition
        ? `concept:blend:${lp.blendPosition}`
        : undefined;

      const blanksStr = String(lp.charIndex);
      const cardId = `c-ml-${tw.word}-${blanksStr}`;

      cards.push({
        _id: cardId,
        questionType: "MissingLetters",
        data: {
          word: tw.word,
          blanks: blanksStr,
        },
        tags: buildTags(lp.gpcId, lp.entry, blendTag),
        meta: {
          sourceWord: tw.word,
          generationReason: `ml-${tw.word}-letter-${lp.charIndex}`,
        },
      });
    }

    // ---- Pass 2: GPC-level cards (multi-char GPCs only) ----
    for (const span of gpcSpans) {
      // Only generate GPC-level cards for multi-character GPCs
      if (span.positions.length < 2 && !splitDigraphSilentPositions.has(span.gpcIndex)) continue;

      // Skip silent / whole-word
      if (span.entry.matchType === "silent" || span.gpcId.includes("-silent")) continue;
      if (span.entry.matchType === "whole_word") continue;

      // Compute blank positions (include split-digraph silent-e if applicable)
      const blankPositions = [...span.positions];
      const silentPositions = splitDigraphSilentPositions.get(span.gpcIndex);
      if (silentPositions) {
        blankPositions.push(...silentPositions);
      }
      blankPositions.sort((a, b) => a - b);

      // Don't blank the entire word
      if (blankPositions.length >= tw.word.length) continue;

      const blanksStr = blankPositions.join(",");
      const cardId = `c-ml-${tw.word}-${blanksStr}`;

      cards.push({
        _id: cardId,
        questionType: "MissingLetters",
        data: {
          word: tw.word,
          blanks: blanksStr,
        },
        tags: buildTags(span.gpcId, span.entry),
        meta: {
          sourceWord: tw.word,
          generationReason: `ml-${tw.word}-gpc-${gpcShortId(span.gpcId)}`,
        },
      });
    }
  }

  return cards;
}

// ============================================================================
// SIGHT-WORD CARDS
// ============================================================================
//
// A sight word parses as one whole-word GPC (GPC-WORD-said), so the regular
// ML and WS generators skip it. These cards exercise the word's *fair*
// letters — the ones that play by the rules — while exposing the sight word
// itself, ahead of spelling it outright. Which letters are fair comes from
// the sight-word chunking in lib/chunk-builder.ts (consonants + primary short
// vowels); everything else is the word's own GPC. Every card is stamped with
// the sight word's concept (concept:match:whole_word), so nothing releases
// before the sight-words lesson. Plan: agent/lessons-audit/b.3.sight-words-todo.md.

function isWholeWordGpcId(gpcId: string): boolean {
  return gpcId.startsWith("GPC-WORD-");
}

/** Teaching words that parse as a single sight-word GPC. */
function sightWords(teachingWords: TeachingWordsData): TeachingWordsData["words"] {
  return teachingWords.words.filter((tw) => tw.gpcs.length === 1 && isWholeWordGpcId(tw.gpcs[0]));
}

/** The sight word's own concept tags (concept:match:whole_word). */
function sightWordConceptTags(wordGpcId: string): string[] {
  const entry = getEntry(wordGpcId);
  return entry ? effectiveConceptTags(entry) : [];
}

/**
 * Sight words with an in-app homophone: another recorded word, or another
 * sight word, that sounds the same (to/two/too, son/sun, where/wear…). A
 * spelling card for one can't be answered from its audio, so it gets none —
 * its ML and WS cards still apply.
 */
function findSightWordHomophones(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
): Map<string, string[]> {
  const sight = sightWords(teachingWords);
  const pool = new Set([...audioWords, ...sight.map((tw) => tw.word)]);
  const byPhonemes = new Map<string, string[]>();
  for (const word of pool) {
    const phonemes = lookupWord(word)?.phonemes;
    if (!phonemes) continue;
    const key = phonemes.join(" ");
    byPhonemes.set(key, [...(byPhonemes.get(key) ?? []), word]);
  }
  const homophones = new Map<string, string[]>();
  for (const tw of sight) {
    const others = (byPhonemes.get(tw.phonemes.join(" ")) ?? []).filter((w) => w !== tw.word);
    if (others.length > 0) homophones.set(tw.word, others);
  }
  return homophones;
}

/**
 * MissingLetters on a sight word's fair letters: `_as` / `wa_` for "was",
 * `t_e` / `_he` / `__e` for "the". Same conventions as the regular generator
 * (one card per letter, plus one for a multi-letter GPC as a unit); these
 * expose the word's own GPC.
 *
 * Plus the odd part, blanked whole (`w_s`, `s__d`): recall of the spelling
 * that breaks the rules, exercising the word itself, and seeded above the
 * fair blanks (deploy-content.ts computeInitialElo). One card per odd chunk
 * (lib/catalogue.ts isOddSightWordChunk); a silent letter has no chunk, so
 * it's never blanked. Words with no fair letters (of, who, one) get only these.
 */
function generateSightWordMissingLettersCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];
  const seenIds = new Set<string>();

  for (const tw of sightWords(teachingWords)) {
    if (BLOCKED_WORDS.has(tw.word) || !audioWords.has(tw.word)) continue;
    const wordGpcId = tw.gpcs[0];
    const chunks = alignmentToChunks(tw.word, tw.phonemes as ArpabetPhoneme[]);
    const fairGpcIds = [
      ...new Set(chunks.map((c) => c.gpcId).filter((g): g is string => !!g && !isWholeWordGpcId(g))),
    ];

    for (const chunk of chunks) {
      const gpcId = chunk.gpcId;
      // Only fair letters the curriculum actually teaches get blanked.
      if (!gpcId || isWholeWordGpcId(gpcId) || !sequenceGpcIds.has(gpcId)) continue;
      const entry = getEntry(gpcId);
      if (!entry) continue;

      const positions = Object.keys(chunk.letters).map(Number).sort((a, b) => a - b);
      const blankSets = positions.map((p) => [p]);
      if (positions.length > 1) blankSets.push(positions);

      for (const blanks of blankSets) {
        if (blanks.length >= tw.word.length) continue;
        const blanksStr = blanks.join(",");
        const cardId = `c-ml-${tw.word}-${blanksStr}`;
        if (seenIds.has(cardId)) continue;
        seenIds.add(cardId);

        const tags = [
          UI_TAG_MISSING_LETTERS,
          SKILL_SEGMENTING,
          gpcTag("exercise", gpcId),
          ...effectiveConceptTags(entry),
          gpcTag("expose", wordGpcId),
          ...fairGpcIds.filter((g) => g !== gpcId).map((g) => gpcTag("expose", g)),
          ...sightWordConceptTags(wordGpcId),
        ];
        cards.push({
          _id: cardId,
          questionType: "MissingLetters",
          data: { word: tw.word, blanks: blanksStr },
          tags: [...new Set(tags)],
          meta: {
            sourceWord: tw.word,
            generationReason: `ml-sight-${tw.word}-${gpcShortId(gpcId)}`,
          },
        });
      }
    }

    for (const chunk of chunks) {
      if (!isOddSightWordChunk(tw.word, chunk)) continue;
      const blanks = Object.keys(chunk.letters).map(Number).sort((a, b) => a - b);
      if (blanks.length >= tw.word.length) continue;
      const blanksStr = blanks.join(",");
      const cardId = `c-ml-${tw.word}-${blanksStr}`;
      if (seenIds.has(cardId)) continue;
      seenIds.add(cardId);

      const tags = [
        UI_TAG_MISSING_LETTERS,
        SKILL_SEGMENTING,
        gpcTag("exercise", wordGpcId),
        gpcTag("expose", wordGpcId),
        ...fairGpcIds.map((g) => gpcTag("expose", g)),
        ...sightWordConceptTags(wordGpcId),
      ];
      cards.push({
        _id: cardId,
        questionType: "MissingLetters",
        data: { word: tw.word, blanks: blanksStr },
        tags: [...new Set(tags)],
        meta: {
          sourceWord: tw.word,
          generationReason: `ml-sight-${tw.word}-odd`,
        },
      });
    }
  }
  return cards;
}

/**
 * Hand-picked follow-ups, where the rule below finds nothing good. A
 * MissingLetters card is fine here only if its word's letters are surely
 * unlocked by the sight-words lesson (the letter-gating filter is bypassed).
 */
/** How many follow-ups a sight-word intro requires: the intro session's prescribed exposure. */
const SIGHT_WORD_FOLLOW_UPS = 2;

const SIGHT_WORD_FOLLOW_UP_OVERRIDES: Record<string, string> = {
  // _he: no word-choice card for "the"; t, h, e are among the first letters
  the: "c-ml-the-0",
  // _riend: no word-choice card for "friend"
  friend: "c-ml-friend-0",
};

/**
 * The cards a sight word's intro requires next (its completion replan): up to
 * SIGHT_WORD_FOLLOW_UPS of the word's own word-choice cards, easiest first —
 * differing at a fair letter, else at the odd part (the word's own GPC); onset
 * first within each. They are the intro session's prescribed exposure: the
 * intro adds no boost of its own (10-01; a ×10 on the word's expose tag
 * flooded the session with its cards). Only word choice: a required card bypasses the pipeline's filters, and a
 * MissingLetters card could then ask for a letter the keyboard hasn't
 * unlocked (you's y). A card whose foil is another sight word qualifies only
 * if that word is introduced by now (`introduced`: this card's family and
 * the cards before it in the drip), else it would surface ahead of that
 * word's intro: [should | good would could] follows the would family's
 * intro. None found: no required card; the prescribed group's practice debt
 * still surfaces the word's exposure cards, through the filters.
 */
function pickSightWordFollowUps(
  word: string,
  wordGpcId: string,
  cards: GeneratedCard[],
  introduced: ReadonlySet<string>,
): string[] {
  const exercise = gpcTag("exercise", wordGpcId);
  const introducedWord = (tag: string) => {
    const m = tag.match(/^gpc:[a-z]+:WORD-(.+)$/);
    return !m || introduced.has(m[1]);
  };
  // Fair-letter difference before the word's own; onset first within each
  const rung = (c: GeneratedCard): number =>
    (c.tags.includes(exercise) ? 2 : 0) + (c.tags.includes(SKILL_FIRST_PHONEME_DIFF) ? 0 : 1);
  const candidates = cards
    .filter((c) => c.questionType === "WordSelection" && c.data.target === word)
    .filter((c) => c.tags.every(introducedWord))
    .map((c) => ({ id: c._id, rung: rung(c) }))
    .sort((a, b) => a.rung - b.rung || a.id.localeCompare(b.id));
  return candidates.slice(0, SIGHT_WORD_FOLLOW_UPS).map((c) => c.id);
}

/**
 * A sight word's family key: its odd chunks (letters and sound) plus its
 * letters from the first odd one to the end. would / could / should share
 * `oul` /ʊ/ + "ould"; come / some would share `o` /ʌ/ + "ome", but love
 * (`ove`) wouldn't join them. Nothing odd but a silent letter (have, live):
 * no family.
 */
function sightWordFamilyKey(word: string, phonemes: string[]): string | null {
  const odd = alignmentToChunks(word, phonemes as ArpabetPhoneme[]).filter((c) => isOddSightWordChunk(word, c));
  if (odd.length === 0) return null;
  const positions = (c: { letters: object }) => Object.keys(c.letters).map(Number);
  const first = Math.min(...odd.flatMap(positions));
  const parts = odd.map((c) => `${positions(c).map((i) => word[i]).join("")}:${c.phoneme}`);
  return `${parts.join("|")}#${word.slice(first)}`;
}

/**
 * SightWordIntro cards: one per recorded sight word, or per family (words
 * sharing their odd part and what follows it: would / could / should). A
 * family's card stages its most used word and releases them all: it bears
 * every member's intro tag, and the view credits and unlocks each. The card
 * bears no expose tag: expose:WORD-x requires intro:WORD-x
 * (generate-strategy-configs.ts), so it would lock the card behind itself.
 *
 * Drip order (meta.dripRank, read by the prescribed group): the
 * sight-words lesson's seed first, then most used first. Follow-ups:
 * pickSightWordFollowUps; space-separated ids, as ML ids carry commas.
 */
function generateSightWordIntroCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  exposureCards: GeneratedCard[],
): GeneratedCard[] {
  const words = sightWords(teachingWords)
    .filter((tw) => !BLOCKED_WORDS.has(tw.word) && audioWords.has(tw.word) && tw.word.length > 1)
    .sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word));
  const families = new Map<string, typeof words>();
  for (const tw of words) {
    const key = sightWordFamilyKey(tw.word, tw.phonemes) ?? `solo:${tw.word}`;
    families.set(key, [...(families.get(key) ?? []), tw]);
  }
  const seeded = new Set(POST_LESSON_SEED_CARDS["sight-words"] ?? []);
  const isSeeded = (members: typeof words) => Number(seeded.has(sightWordIntroCardId(members[0].gpcs[0])));
  const drip = [...families.values()].sort(
    (a, b) => isSeeded(b) - isSeeded(a) || words.indexOf(a[0]) - words.indexOf(b[0]),
  );

  const introduced = new Set<string>();
  return drip.map((members, dripRank) => {
    const [lead, ...rest] = members;
    for (const m of members) introduced.add(m.word);
    const leadGpcId = lead.gpcs[0];
    const override = SIGHT_WORD_FOLLOW_UP_OVERRIDES[lead.word];
    if (override && !exposureCards.some((c) => c._id === override)) {
      console.warn(`  ⚠️ SightWordIntro: follow-up override ${override} for "${lead.word}" doesn't exist; using the rule`);
    }
    const followUps = override && exposureCards.some((c) => c._id === override)
      ? [override]
      : pickSightWordFollowUps(lead.word, leadGpcId, exposureCards, introduced);
    return {
      _id: sightWordIntroCardId(leadGpcId),
      questionType: "SightWordIntro" as const,
      data: {
        gpcId: leadGpcId,
        word: lead.word,
        family: rest.map((m) => m.word).join(" "),
        followUp: followUps.join(" "),
      },
      tags: [
        ...new Set([
          UI_TAG_SIGHT_WORD_INTRO,
          SRS_SKIP,
          ...members.map((m) => gpcTag("intro", m.gpcs[0])),
          ...sightWordConceptTags(leadGpcId),
        ]),
      ],
      meta: {
        sourceWord: lead.word,
        sourceGpcId: leadGpcId,
        dripRank,
        generationReason: `sight-intro-${lead.word}`,
      },
    };
  });
}

/** Letter edit distance ≤ 1, or an anagram (was / saw). */
function looksAlike(a: string, b: string): boolean {
  if ([...a].sort().join("") === [...b].sort().join("")) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diffs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
    return diffs <= 1;
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  }
  return false;
}

/**
 * WordSelection with a sight-word target and recorded foils one sound away.
 * The GPC minimal-pair generator never pairs a whole-word GPC, but many
 * sight words have clean phoneme-level neighbours. Where the difference
 * falls decides what the card exercises:
 *   - a fair letter (could / would / should differ at the onset) → that
 *     GPC, with the sight word exposed — easy, and explicit exposure to the
 *     shared odd bit;
 *   - the rest of the word (said / sad) → the sight word itself.
 * Look-alike foils (one letter away) sort first. A foil that is itself a
 * sight word is exposed too, so the card can wait on both words' intros.
 * Output is generated, then inspected / supplemented by hand.
 */
function generateSightWordSelectionCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];
  const seenIds = new Set<string>();
  const wordToGpcs = new Map(teachingWords.words.map((tw) => [tw.word, tw.gpcs]));
  const taught = (g: string) => sequenceGpcIds.has(g) || isWholeWordGpcId(g);

  const foilPool = [...audioWords]
    .filter((w) => !BLOCKED_WORDS.has(w) && (wordToGpcs.get(w) ?? []).length > 0)
    .filter((w) => wordToGpcs.get(w)!.every(taught))
    .map((w) => ({ word: w, phonemes: lookupWord(w)?.phonemes ?? [], frequency: lookupWord(w)?.frequency ?? 0 }))
    .filter((f) => f.phonemes.length > 0);

  for (const tw of sightWords(teachingWords)) {
    if (BLOCKED_WORDS.has(tw.word) || !audioWords.has(tw.word)) continue;
    const wordGpcId = tw.gpcs[0];
    const target = tw.phonemes;
    const chunks = alignmentToChunks(tw.word, target as ArpabetPhoneme[]);
    if (chunks.length !== target.length) continue; // one chunk per phoneme, or no reliable diff

    // Foils differing from the target at exactly one phoneme index.
    const byIndex = new Map<number, typeof foilPool>();
    for (const foil of foilPool) {
      if (foil.word === tw.word || foil.phonemes.length !== target.length) continue;
      const diffs = target.flatMap((ph, i) => (foil.phonemes[i] !== ph ? [i] : []));
      if (diffs.length !== 1) continue;
      byIndex.set(diffs[0], [...(byIndex.get(diffs[0]) ?? []), foil]);
    }

    const familyKey = sightWordFamilyKey(tw.word, target);
    for (const [index, allFoils] of byIndex) {
      // Where the target's own family is among the foils, the card is the
      // family: [would | could should], not [could | would good should] (the
      // family's sameness is the point, and good sits one voicing off could)
      const family = familyKey
        ? allFoils.filter((f) => sightWordFamilyKey(f.word, f.phonemes) === familyKey)
        : [];
      const foils = family.length > 0 ? family : allFoils;
      const distractors = foils
        .sort(
          (a, b) =>
            Number(looksAlike(tw.word, b.word)) - Number(looksAlike(tw.word, a.word)) ||
            b.frequency - a.frequency,
        )
        .slice(0, 3)
        .map((f) => f.word);

      const diffGpcId = chunks[index].gpcId ?? wordGpcId;
      const tags: string[] = [UI_TAG_WORD_SELECTION, gpcTag("exercise", diffGpcId)];
      const diffEntry = getEntry(diffGpcId);
      if (diffEntry) tags.push(...effectiveConceptTags(diffEntry));
      for (const chunk of chunks) {
        if (chunk.gpcId && chunk.gpcId !== diffGpcId) tags.push(gpcTag("expose", chunk.gpcId));
      }
      tags.push(gpcTag("expose", wordGpcId));
      for (const d of distractors) {
        const foilGpcs = wordToGpcs.get(d) ?? [];
        if (foilGpcs.length === 1 && isWholeWordGpcId(foilGpcs[0])) tags.push(gpcTag("expose", foilGpcs[0]));
      }
      const position = index === 0 ? "onset" : index === target.length - 1 ? "coda" : "core";
      tags.push(
        position === "onset"
          ? SKILL_FIRST_PHONEME_DIFF
          : position === "coda"
            ? SKILL_FINAL_PHONEME_DIFF
            : SKILL_MEDIAL_VOWEL_DIFF,
      );
      tags.push(...sightWordConceptTags(wordGpcId));

      let cardId = `c-ws-${tw.word}-${position}`;
      if (seenIds.has(cardId)) cardId += `-${index}`;
      seenIds.add(cardId);
      cards.push({
        _id: cardId,
        questionType: "WordSelection",
        data: {
          target: tw.word,
          distractors: distractors.join(","),
          audioUrls: [tw.word, ...distractors].map((w) => `/audio/words/${w}.mp3`).join(","),
        },
        tags: [...new Set(tags)],
        meta: {
          sourceWord: tw.word,
          generationReason: `ws-sight-${tw.word}-${position}`,
        },
      });
    }
  }
  return cards;
}

// ============================================================================
// GPC INTRO CARDS
// ============================================================================

/** Categories eligible for simple GPC intro cards */
const INTRO_ELIGIBLE_CATEGORIES = new Set(["consonants", "vowels_short"]);

/** GPCs to skip for intro generation (same as WST blocklist) */
const INTRO_BLOCKLIST = new Set([
  "GPC-s-Z",  // voicing alternation — naturally acquired
  "GPC-x-Z",  // rare — not worth an intro
]);

/**
 * GPCs allowed to generate an intro card without onset exemplars.
 * English lacks common onset monosyllables for some coda-dominant letters
 * (e.g., `x` — box/fox/six are coda, "xylophone" is multisyllabic).
 */
const INTRO_NO_ONSET_ALLOWED = new Set([
  "GPC-x-K_S",  // coda-dominant (box, fox, six)
]);

/**
 * Generate GpcIntro cards — one-time letter-sound introductions.
 *
 * One card per eligible simple-consonant or short-vowel GPC.
 * Each card includes onset, core (medial), and coda exemplar words
 * for the target letter.
 *
 * Eligible: categories `consonants` and `vowels_short` only.
 * Out of scope: digraphs, soft consonants, split digraphs, vowel teams, etc.
 */
function generateGpcIntroCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Find eligible GPCs from the teaching sequence
  const eligibleGpcs = Array.from(sequenceGpcIds)
    .map((id) => ({ id, entry: getEntry(id) }))
    .filter(({ id, entry }) => {
      if (!entry) return false;
      if (INTRO_BLOCKLIST.has(id)) return false;
      if (!INTRO_ELIGIBLE_CATEGORIES.has(entry.category)) return false;
      if (entry.matchType === "whole_word" || entry.matchType === "silent") return false;
      if (entry.phoneme === "") return false;
      return true;
    });

  console.log(`  Eligible GPCs for intro: ${eligibleGpcs.length}`);

  // Pre-filter teaching words: has audio, decodable, 3-5 letters, not blocked
  const eligibleWords = teachingWords.words.filter((tw) => {
    if (BLOCKED_WORDS.has(tw.word)) return false;
    if (!audioWords.has(tw.word)) return false;
    if (tw.word.length < 2 || tw.word.length > 5) return false;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) return false;
    return true;
  });

  for (const { id: gpcId, entry } of eligibleGpcs) {
    if (!entry) continue;
    const letter = entry.grapheme;
    const phoneme = entry.phoneme;

    // Onset words: target GPC is first in word's gpcs array
    const onsetWords = eligibleWords
      .filter((tw) => tw.gpcs[0] === gpcId)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    // Core/medial words: target GPC is in a medial position (not first, not last non-silent)
    const coreWords = eligibleWords
      .filter((tw) => {
        const idx = tw.gpcs.indexOf(gpcId);
        if (idx <= 0) return false;
        // Find last non-silent GPC index
        let lastNonSilent = tw.gpcs.length - 1;
        while (lastNonSilent >= 0) {
          const e = getEntry(tw.gpcs[lastNonSilent]);
          if (e && e.matchType !== "silent" && !tw.gpcs[lastNonSilent].includes("-silent")) break;
          lastNonSilent--;
        }
        return idx < lastNonSilent;
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 2);

    // Coda words: target GPC is last non-silent in word's gpcs array
    const codaWords = eligibleWords
      .filter((tw) => {
        let lastNonSilent = tw.gpcs.length - 1;
        while (lastNonSilent >= 0) {
          const e = getEntry(tw.gpcs[lastNonSilent]);
          if (e && e.matchType !== "silent" && !tw.gpcs[lastNonSilent].includes("-silent")) break;
          lastNonSilent--;
        }
        return lastNonSilent >= 0 && tw.gpcs[lastNonSilent] === gpcId;
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 2);

    // Must have at least one onset word (unless GPC is explicitly allowed coda-only)
    if (onsetWords.length === 0 && !INTRO_NO_ONSET_ALLOWED.has(gpcId)) {
      console.warn(`  ⚠️ GpcIntro: no onset words for ${gpcId}, skipping`);
      continue;
    }
    // For coda-only allowed GPCs, still require at least one coda word
    if (onsetWords.length === 0 && codaWords.length === 0) {
      console.warn(`  ⚠️ GpcIntro: no onset OR coda words for ${gpcId}, skipping`);
      continue;
    }

    // Build tags
    const tags: string[] = [UI_TAG_GPC_INTRO, SRS_SKIP];
    tags.push(gpcTag("intro", gpcId));
    tags.push(gpcTag("expose", gpcId));
    for (const ct of effectiveConceptTags(entry)) {
      tags.push(ct);
    }

    const shortId = gpcShortId(gpcId);
    const cardId = gpcIntroCardId(gpcId);

    cards.push({
      _id: cardId,
      questionType: "GpcIntro",
      data: {
        gpcId,
        letter,
        phoneme,
        onsetWords: onsetWords.map((tw) => tw.word).join(","),
        coreWords: coreWords.map((tw) => tw.word).join(","),
        codaWords: codaWords.map((tw) => tw.word).join(","),
      },
      tags: [...new Set(tags)],
      meta: {
        sourceGpcId: gpcId,
        generationReason: `gpc-intro-${shortId}`,
      },
    });
  }

  return cards;
}

// ============================================================================
// DIGRAPH GPC INTRO CARDS
// ============================================================================

/** Categories eligible for digraph GPC intro cards */
const DIGRAPH_INTRO_ELIGIBLE_CATEGORIES = new Set(["digraphs"]);

/**
 * Words to exclude from exemplar selection for specific digraph GPC intro cards.
 * Use when a word's recorded audio doesn't match the phoneme the card is teaching.
 * Key: gpcId, Value: set of words to exclude as exemplars for that card.
 */
const DIGRAPH_INTRO_WORD_BLOCKLIST: Map<string, Set<string>> = new Map([
  // "with" is encoded as voiced /DH/ by CMUdict but commonly recorded/pronounced
  // with voiceless /TH/ — jarring mismatch when used as a voiced-th exemplar.
  ["GPC-th-DH", new Set(["with"])],
]);

/**
 * Digraph GPCs to skip for intro generation. Origin-variant / analysis
 * entries only — curriculum-driven skips (post-lesson facts like nk, which
 * composes naturally from n+k) are read from lib/curriculum.ts instead.
 */
const DIGRAPH_INTRO_BLOCKLIST = new Set([
  "GPC-ch-K",    // Greek origin variant (chord) — not intro-worthy
  "GPC-ch-SH",   // French origin variant (chef) — not intro-worthy
  "GPC-ng-N_G",  // Analysis variant
  "GPC-ng-N_JH", // Analysis variant
  "GPC-wh-HH_W", // Analysis variant
  "GPC-gu-G",    // Analysis variant
  "GPC-gu-G_W",  // Analysis variant
  "GPC-sc-S",    // Analysis variant
  "GPC-sc-S_K",  // Analysis variant
]);

/**
 * Generate DigraphGpcIntro cards — one-time digraph introductions.
 *
 * One card per eligible digraph GPC (teaching-v0.2 tagged, single-phoneme).
 * Each card includes onset and coda exemplar words for the target digraph.
 * No medial/core words — digraphs rarely have useful medial exemplars at intro stage.
 */
function generateDigraphGpcIntroCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Find eligible digraph GPCs from the teaching sequence
  const eligibleGpcs = Array.from(sequenceGpcIds)
    .map((id) => ({ id, entry: getEntry(id) }))
    .filter(({ id, entry }) => {
      if (!entry) return false;
      if (DIGRAPH_INTRO_BLOCKLIST.has(id)) return false;
      // Curriculum post-lesson facts (nk) are gated by their lesson's concept
      // but are not lesson exemplars — no intro card (D5).
      if (assignmentFor(entry)?.postLessonFact) return false;
      if (!DIGRAPH_INTRO_ELIGIBLE_CATEGORIES.has(entry.category)) return false;
      if (entry.matchType === "whole_word" || entry.matchType === "silent") return false;
      if (entry.phoneme === "") return false;
      // Only teaching-v0.2 tagged entries (core teaching digraphs)
      if (!entry.tags?.includes("teaching-v0.2")) return false;
      return true;
    });

  console.log(`  Eligible digraph GPCs for intro: ${eligibleGpcs.length}`);

  // Pre-filter teaching words: has audio, decodable, 3-6 letters, not blocked
  const eligibleWords = teachingWords.words.filter((tw) => {
    if (BLOCKED_WORDS.has(tw.word)) return false;
    if (!audioWords.has(tw.word)) return false;
    if (tw.word.length < 3 || tw.word.length > 6) return false;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) return false;
    return true;
  });

  for (const { id: gpcId, entry } of eligibleGpcs) {
    if (!entry) continue;
    const grapheme = entry.grapheme; // Multi-char, e.g., "sh", "ch"
    const phoneme = entry.phoneme;

    const gpcWordBlocklist = DIGRAPH_INTRO_WORD_BLOCKLIST.get(gpcId) ?? new Set();

    // Onset words: target digraph GPC is first in word's gpcs array
    const onsetWords = eligibleWords
      .filter((tw) => tw.gpcs[0] === gpcId && !gpcWordBlocklist.has(tw.word))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    // Coda words: target digraph GPC is last non-silent in word's gpcs array
    const codaWords = eligibleWords
      .filter((tw) => {
        if (gpcWordBlocklist.has(tw.word)) return false;
        let lastNonSilent = tw.gpcs.length - 1;
        while (lastNonSilent >= 0) {
          const e = getEntry(tw.gpcs[lastNonSilent]);
          if (e && e.matchType !== "silent" && !tw.gpcs[lastNonSilent].includes("-silent")) break;
          lastNonSilent--;
        }
        return lastNonSilent >= 0 && tw.gpcs[lastNonSilent] === gpcId;
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 2);

    // Must have at least one onset or coda word
    if (onsetWords.length === 0 && codaWords.length === 0) {
      console.warn(`  ⚠️ DigraphGpcIntro: no exemplar words for ${gpcId}, skipping`);
      continue;
    }

    // Build tags
    const tags: string[] = [UI_TAG_DIGRAPH_GPC_INTRO, SRS_SKIP];
    tags.push(gpcTag("intro", gpcId));
    tags.push(gpcTag("expose", gpcId));
    for (const ct of effectiveConceptTags(entry)) {
      tags.push(ct);
    }

    const shortId = gpcShortId(gpcId);
    const cardId = digraphGpcIntroCardId(gpcId);

    cards.push({
      _id: cardId,
      questionType: "DigraphGpcIntro",
      data: {
        gpcId,
        grapheme,
        phoneme,
        onsetWords: onsetWords.map((tw) => tw.word).join(","),
        codaWords: codaWords.map((tw) => tw.word).join(","),
      },
      tags: [...new Set(tags)],
      meta: {
        sourceGpcId: gpcId,
        generationReason: `digraph-gpc-intro-${shortId}`,
      },
    });
  }

  return cards;
}

// ============================================================================
// SPLIT DIGRAPH (MAGIC-E) GPC INTRO CARDS
// ============================================================================

/** Categories eligible for split-digraph intro cards */
const SPLIT_INTRO_ELIGIBLE_CATEGORIES = new Set(["vowels_long_split"]);

/** Split-digraph GPCs to skip for intro generation */
const SPLIT_INTRO_BLOCKLIST = new Set([
  "GPC-u_e-Y_UW", // Variant pronunciation (cute) — shares grapheme with u_e-UW
]);

/**
 * Generate SplitDigraphIntro cards — one-time magic-e introductions.
 *
 * One card per eligible split-digraph GPC (a_e, e_e, i_e, o_e, u_e).
 * Each card includes exemplar words demonstrating the vowel...e pattern.
 * Words are selected without onset/coda distinction — all share the same
 * structural pattern (medial vowel + final silent 'e').
 */
function generateSplitDigraphIntroCards(
  teachingWords: TeachingWordsData,
  audioWords: Set<string>,
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  // Find eligible split-digraph GPCs from the teaching sequence
  const eligibleGpcs = Array.from(sequenceGpcIds)
    .map((id) => ({ id, entry: getEntry(id) }))
    .filter(({ id, entry }) => {
      if (!entry) return false;
      if (SPLIT_INTRO_BLOCKLIST.has(id)) return false;
      if (!SPLIT_INTRO_ELIGIBLE_CATEGORIES.has(entry.category)) return false;
      if (entry.matchType !== "split_digraph") return false;
      if (entry.phoneme === "") return false;
      if (!entry.tags?.includes("teaching-v0.2")) return false;
      return true;
    });

  console.log(`  Eligible split-digraph GPCs for intro: ${eligibleGpcs.length}`);

  // Pre-filter teaching words: has audio, decodable, 3-6 letters, not blocked
  const eligibleWords = teachingWords.words.filter((tw) => {
    if (BLOCKED_WORDS.has(tw.word)) return false;
    if (!audioWords.has(tw.word)) return false;
    if (tw.word.length < 3 || tw.word.length > 7) return false;
    if (!tw.gpcs.every((g) => sequenceGpcIds.has(g))) return false;
    return true;
  });

  for (const { id: gpcId, entry } of eligibleGpcs) {
    if (!entry) continue;
    const grapheme = entry.grapheme; // e.g., "a_e"
    const vowel = grapheme.charAt(0); // e.g., "a"
    const phoneme = entry.phoneme;

    // Find words containing this split-digraph GPC, sorted by frequency
    const exemplarWords = eligibleWords
      .filter((tw) => tw.gpcs.includes(gpcId))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    if (exemplarWords.length === 0) {
      console.warn(`  ⚠️ SplitDigraphIntro: no exemplar words for ${gpcId}, skipping`);
      continue;
    }

    // Build tags
    const tags: string[] = [UI_TAG_SPLIT_DIGRAPH_INTRO, SRS_SKIP];
    tags.push(gpcTag("intro", gpcId));
    tags.push(gpcTag("expose", gpcId));
    for (const ct of effectiveConceptTags(entry)) {
      tags.push(ct);
    }

    const shortId = gpcShortId(gpcId);
    const cardId = splitDigraphIntroCardId(gpcId);

    cards.push({
      _id: cardId,
      questionType: "SplitDigraphIntro",
      data: {
        gpcId,
        vowel,
        phoneme,
        words: exemplarWords.map((tw) => tw.word).join(","),
      },
      tags: [...new Set(tags)],
      meta: {
        sourceGpcId: gpcId,
        generationReason: `split-digraph-intro-${shortId}`,
      },
    });
  }

  return cards;
}

// ============================================================================
// WHO SAID THAT 2 CARDS (digraph-capable)
// ============================================================================

/**
 * WST-specific exclusions among digraph-category GPCs. Exercise-design
 * decisions, not curriculum policy (curriculum exclusions — post-lesson
 * facts like `nk` — are read from lib/curriculum.ts).
 */
const WST_DIGRAPH_EXCLUSIONS = new Set([
  // Voiced th: th-TH vs th-DH is inaudible-in-isolation territory for this
  // exercise format; the voiced variant is taught in word context instead.
  "GPC-th-DH",
]);

/**
 * Generate WhoSaidThat cards — phoneme identification with digraph suspects.
 *
 * One distractor-free card per eligible digraph GPC: every digraph-category
 * teaching GPC in the sequence, minus curriculum post-lesson facts (nk) and
 * WST-specific exclusions (th-DH). Runtime selects distractors dynamically
 * (mixing single letters and digraphs based on unlocked concepts).
 *
 * Each card carries its GPC's curriculum-effective concept tag
 * (concept:match:digraph for the blessed slate; exiles like ck/wh carry
 * their destination lesson's concept) so the lesson gate filter releases
 * it with the right lesson.
 */
function generateWhoSaidThatDigraphCards(
  sequenceGpcIds: Set<string>,
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  const eligible = Array.from(sequenceGpcIds)
    .map((id) => getEntry(id))
    .filter((e): e is GPCEntry => e !== undefined)
    .filter(
      (e) =>
        e.category === "digraphs" &&
        // Core teaching digraphs only — the sequence also carries analysis
        // variants (ch→K, gu→G, …) that must not become WST cards.
        e.tags?.includes("teaching-v0.2") &&
        !WST_DIGRAPH_EXCLUSIONS.has(e.id) &&
        !assignmentFor(e)?.postLessonFact,
    )
    .map((e) => ({ grapheme: e.grapheme, phoneme: e.phoneme, gpcId: e.id }));

  console.log(`  WhoSaidThat eligible digraph GPCs: ${eligible.length}`);

  for (const digraph of eligible) {
    const tags: string[] = [UI_TAG_WHO_SAID_THAT];
    tags.push(gpcTag("exercise", digraph.gpcId));

    const entry = getEntry(digraph.gpcId);
    if (entry) {
      for (const ct of effectiveConceptTags(entry)) {
        tags.push(ct);
      }
    }

    const shortId = gpcShortId(digraph.gpcId);
    const cardId = whoSaidThatCardId(digraph.gpcId);

    cards.push({
      _id: cardId,
      questionType: "WhoSaidThat",
      data: {
        targetPhoneme: digraph.phoneme,
        correctLetter: digraph.grapheme,
        gpcId: shortId,
        // No distractors — runtime selects them adaptively
      },
      tags: [...new Set(tags)],
      meta: {
        sourceGpcId: digraph.gpcId,
        generationReason: `wst-digraph-${shortId}`,
      },
    });
  }

  console.log(`  Generated: ${cards.length} WhoSaidThat cards`);

  return cards;
}

// ============================================================================
// VALIDATION
// ============================================================================

interface ValidationResult {
  errors: string[];
  warnings: string[];
  stats: {
    total: number;
    spelling: number;
    whoSaidThat: number;
    whoSaidThatDigraphs: number;
    wordSelection: number;
    splitDigraphContrast: number;
    missingLetters: number;
    gpcIntro: number;
    digraphGpcIntro: number;
    splitDigraphIntro: number;
    uniqueExerciseTags: number;
    uniqueExposeTags: number;
    uniqueConceptTags: number;
    wordsWithAudio: number;
    wordsDecodable: number;
  };
}

function validate(cards: GeneratedCard[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const spelling = cards.filter((c) => c.questionType === "SpellingQuestion");
  const wst = cards.filter((c) => c.questionType === "WhoSaidThat");
  const wstDigraphs = cards.filter((c) => c.questionType === "WhoSaidThat");
  const ws = cards.filter((c) => c.questionType === "WordSelection");
  const splitDigraphContrast = ws.filter((c) => c._id.includes("-split-"));
  const ml = cards.filter((c) => c.questionType === "MissingLetters");
  const intro = cards.filter((c) => c.questionType === "GpcIntro");
  const digraphIntro = cards.filter((c) => c.questionType === "DigraphGpcIntro");
  const splitIntro = cards.filter((c) => c.questionType === "SplitDigraphIntro");

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card._id)) {
      errors.push(`Duplicate card ID: ${card._id}`);
    }
    ids.add(card._id);
  }

  // Check every card has at least one gpc:exercise:* tag and one ui:* tag
  for (const card of cards) {
    const hasExercise = card.tags.some((t) => t.startsWith("gpc:exercise:"));
    const hasUi = card.tags.some((t) => t.startsWith("ui:"));

    if (!hasExercise && card.questionType !== "GpcIntro" && card.questionType !== "DigraphGpcIntro" && card.questionType !== "SplitDigraphIntro") {
      warnings.push(`Card ${card._id} has no gpc:exercise:* tag`);
    }
    if (!hasUi) {
      errors.push(`Card ${card._id} has no ui:* tag`);
    }
  }

  // Collect unique tags by type
  const exerciseTags = new Set<string>();
  const exposeTags = new Set<string>();
  const conceptTags = new Set<string>();

  for (const card of cards) {
    for (const tag of card.tags) {
      if (tag.startsWith("gpc:exercise:")) exerciseTags.add(tag);
      else if (tag.startsWith("gpc:expose:")) exposeTags.add(tag);
      else if (tag.startsWith("concept:")) conceptTags.add(tag);
    }
  }

  // Check WhoSaidThat cards have valid data
  // Distractor-free cards (c-wst-{gpc}) omit distractors intentionally — runtime fills them.
  // Focus group cards (c-wst-fg-*) must have distractors.
  for (const card of wst) {
    const data = card.data as {
      targetPhoneme: string;
      correctLetter: string;
      gpcId?: string;
      distractors?: string;
    };
    // The view grades gpc:exercise:<gpcId>; it must be the card's own exercise tag.
    if (!data.gpcId || !card.tags.includes(`gpc:exercise:${data.gpcId}`)) {
      errors.push(`WhoSaidThat card ${card._id} gpcId ${data.gpcId} is not its exercise tag`);
    }
    if (!data.targetPhoneme) {
      errors.push(`WhoSaidThat card ${card._id} missing targetPhoneme`);
    }
    if (!data.correctLetter) {
      errors.push(`WhoSaidThat card ${card._id} missing correctLetter`);
    }
    const isFocusGroup = card._id.includes("-fg-");
    if (isFocusGroup && !data.distractors) {
      errors.push(`WhoSaidThat focus group card ${card._id} missing distractors`);
    }
  }

  // Validate MissingLetters cards
  for (const card of ml) {
    const data = card.data as { word: string; blanks: string };
    if (!data.word) {
      errors.push(`MissingLetters card ${card._id} missing word`);
    }
    if (!data.blanks) {
      errors.push(`MissingLetters card ${card._id} missing blanks`);
    } else if (data.word) {
      const indices = data.blanks.split(",").map(Number);
      for (const idx of indices) {
        if (idx < 0 || idx >= data.word.length) {
          errors.push(
            `MissingLetters card ${card._id} blank index ${idx} out of range for "${data.word}" (length ${data.word.length})`,
          );
        }
      }
      if (indices.length >= data.word.length) {
        warnings.push(
          `MissingLetters card ${card._id} blanks all letters of "${data.word}" — should be SQ instead`,
        );
      }
    }
  }

  // Unique words in spelling, WS, and ML
  const spellingWords = new Set(
    spelling.map((c) => (c.data as { word: string }).word),
  );
  const wsWords = new Set(ws.map((c) => (c.data as { target: string }).target));

  return {
    errors,
    warnings,
    stats: {
      total: cards.length,
      spelling: spelling.length,
      whoSaidThat: wst.length,
      whoSaidThatDigraphs: wstDigraphs.length,
      wordSelection: ws.length,
      splitDigraphContrast: splitDigraphContrast.length,
      missingLetters: ml.length,
      gpcIntro: intro.length,
      digraphGpcIntro: digraphIntro.length,
      splitDigraphIntro: splitIntro.length,
      uniqueExerciseTags: exerciseTags.size,
      uniqueExposeTags: exposeTags.size,
      uniqueConceptTags: conceptTags.size,
      wordsWithAudio: spellingWords.size,
      wordsDecodable: wsWords.size,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log("=== Card Generation Script (P3) ===\n");
  const generatedAt = new Date().toISOString();

  // ---- Load inputs ----
  console.log("Loading inputs...");
  const sequence = loadSequence();
  const teachingWords = loadTeachingWords();
  const minimalPairs = loadMinimalPairs();
  const audioWords = loadAudioWordList();

  // Build set of teaching GPC IDs
  const sequenceGpcIds = new Set<string>([
    ...sequence.initialKnown,
    ...sequence.sequence.filter((s) => s.step > 0).map((s) => s.gpcId),
    // Silent-e in split digraph words — not a teaching target itself, but must
    // be in the set so words containing it pass the decodability filter.
    'GPC-e-silent-split',
  ]);

  console.log(`  Teaching GPCs: ${sequenceGpcIds.size}`);
  console.log(`  Teaching words: ${teachingWords.words.length}`);
  console.log(`  Audio words: ${audioWords.size}`);
  console.log(
    `  Words with minimal pairs: ${Object.keys(minimalPairs).length}`,
  );

  // ---- Generate SpellingQuestion cards ----
  console.log("\nGenerating SpellingQuestion cards...");
  const sightWordHomophones = findSightWordHomophones(teachingWords, audioWords);
  const spellingCards = generateSpellingCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
    new Set(sightWordHomophones.keys()),
  );
  console.log(
    `  Sight words withheld (in-app homophone): ` +
      [...sightWordHomophones].map(([w, others]) => `${w}(${others.join("/")})`).join(" "),
  );
  console.log(`  Generated: ${spellingCards.length} spelling cards`);

  // ---- Generate WhoSaidThat cards ----
  console.log("\nGenerating WhoSaidThat cards...");
  const wstCards = generateWhoSaidThatCards(sequenceGpcIds);
  console.log(`  Generated: ${wstCards.length} WhoSaidThat cards`);

  // ---- Generate WordSelection cards ----
  console.log("\nGenerating WordSelection cards...");
  const wsCards = generateWordSelectionCards(
    audioWords,
    sequenceGpcIds,
    teachingWords,
    minimalPairs,
  );
  console.log(`  Generated: ${wsCards.length} WordSelection cards`);

  // ---- Generate Split Digraph Contrast cards ----
  console.log("\nGenerating Split Digraph Contrast cards...");
  const splitDigraphCards = generateSplitDigraphContrastCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
  );
  console.log(`  Generated: ${splitDigraphCards.length} split digraph contrast cards`);

  // ---- Generate MissingLetters cards ----
  console.log("\nGenerating MissingLetters cards...");
  const mlCards = generateMissingLettersCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
  );
  console.log(`  Generated: ${mlCards.length} MissingLetters cards`);

  // ---- Sight-word cards (fair-letter ML + neighbour WS) ----
  console.log("\nGenerating sight-word cards...");
  const sightMlCards = generateSightWordMissingLettersCards(teachingWords, audioWords, sequenceGpcIds);
  const sightWsCards = generateSightWordSelectionCards(teachingWords, audioWords, sequenceGpcIds);
  console.log(`  Generated: ${sightMlCards.length} MissingLetters, ${sightWsCards.length} WordSelection`);
  const sightIntroCards = generateSightWordIntroCards(teachingWords, audioWords, [...sightMlCards, ...sightWsCards]);
  console.log(`  Generated: ${sightIntroCards.length} SightWordIntro (drip order: word [+ family] → follow-up):`);
  for (const c of sightIntroCards) {
    const who = [c.data.word, c.data.family].filter(Boolean).join(" + ");
    console.log(`    ${who.padEnd(22)} → ${c.data.followUp || "(none)"}`);
  }

  // ---- Generate GpcIntro cards ----
  console.log("\nGenerating GpcIntro cards...");
  const introCards = generateGpcIntroCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
  );
  console.log(`  Generated: ${introCards.length} GpcIntro cards`);

  // ---- Generate DigraphGpcIntro cards ----
  console.log("\nGenerating DigraphGpcIntro cards...");
  const digraphIntroCards = generateDigraphGpcIntroCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
  );
  console.log(`  Generated: ${digraphIntroCards.length} DigraphGpcIntro cards`);

  // ---- Generate SplitDigraphIntro cards ----
  console.log("\nGenerating SplitDigraphIntro cards...");
  const splitDigraphIntroCards = generateSplitDigraphIntroCards(
    teachingWords,
    audioWords,
    sequenceGpcIds,
  );
  console.log(`  Generated: ${splitDigraphIntroCards.length} SplitDigraphIntro cards`);

  // ---- Generate WhoSaidThat cards ----
  console.log("\nGenerating WhoSaidThat cards...");
  const wstDigraphCards = generateWhoSaidThatDigraphCards(sequenceGpcIds);

  // ---- Combine all cards ----
  const allCards = [...spellingCards, ...wstCards, ...wstDigraphCards, ...wsCards, ...splitDigraphCards, ...mlCards, ...sightMlCards, ...sightWsCards, ...sightIntroCards, ...introCards, ...digraphIntroCards, ...splitDigraphIntroCards];
  console.log(`\nTotal cards: ${allCards.length}`);

  // ---- Card gates: a lesson stands in front of named cards ----
  // (curriculum.ts LESSON_GATED_CARDS: e.g. the bed lesson holds b's intro)
  const cardById = new Map(allCards.map((c) => [c._id, c]));
  for (const [lessonId, cardIds] of Object.entries(LESSON_GATED_CARDS)) {
    for (const id of cardIds ?? []) {
      const card = cardById.get(id);
      if (!card) throw new Error(`LESSON_GATED_CARDS: "${id}" (lesson ${lessonId}) was not generated`);
      for (const tag of cardGateTags(id)) if (!card.tags.includes(tag)) card.tags.push(tag);
      console.log(`  gated by ${lessonId}: ${id}`);
    }
  }

  // ---- Validate ----
  console.log("\nValidating...");
  const validation = validate(allCards);

  if (validation.errors.length > 0) {
    console.error("\n❌ ERRORS:");
    for (const err of validation.errors) {
      console.error(`  • ${err}`);
    }
  }

  if (validation.warnings.length > 0) {
    const MAX_WARNINGS = 20;
    console.warn(
      `\n⚠️  WARNINGS (showing first ${MAX_WARNINGS} of ${validation.warnings.length}):`,
    );
    for (const warn of validation.warnings.slice(0, MAX_WARNINGS)) {
      console.warn(`  • ${warn}`);
    }
    if (validation.warnings.length > MAX_WARNINGS) {
      console.warn(
        `  ... and ${validation.warnings.length - MAX_WARNINGS} more`,
      );
    }
  }

  console.log("\n📊 Stats:");
  console.log(`  Total cards:         ${validation.stats.total}`);
  console.log(`  SpellingQuestion:    ${validation.stats.spelling}`);
  console.log(`  WhoSaidThat:         ${validation.stats.whoSaidThat}`);
  console.log(`  WordSelection:       ${validation.stats.wordSelection}`);
  console.log(`    (split contrast):  ${validation.stats.splitDigraphContrast}`);
  console.log(`  MissingLetters:      ${validation.stats.missingLetters}`);
  console.log(`  GpcIntro:            ${validation.stats.gpcIntro}`);
  console.log(`  DigraphGpcIntro:     ${validation.stats.digraphGpcIntro}`);
  console.log(`  SplitDigraphIntro:   ${validation.stats.splitDigraphIntro}`);
  console.log(`  WhoSaidThat:        ${validation.stats.whoSaidThatDigraphs}`);
  console.log(`  Exercise tags used:  ${validation.stats.uniqueExerciseTags}`);
  console.log(`  Expose tags used:    ${validation.stats.uniqueExposeTags}`);
  console.log(`  Concept tags used:   ${validation.stats.uniqueConceptTags}`);

  // ---- Spot-check a few cards ----
  console.log("\n🔍 Spot checks:");
  const spotWords = ["sit", "wish", "cat", "make"];
  for (const word of spotWords) {
    const spellingCard = spellingCards.find(
      (c) => (c.data as { word: string }).word === word,
    );
    if (spellingCard) {
      console.log(`  spelling/${word}: ${spellingCard.tags.length} tags`);
      const exerciseTags = spellingCard.tags.filter((t) =>
        t.startsWith("gpc:exercise:"),
      );
      console.log(`    exercise: ${exerciseTags.join(", ")}`);
    }

    const wsCard = wsCards.find(
      (c) => (c.data as { target: string }).target === word,
    );
    if (wsCard) {
      const data = wsCard.data as { target: string; distractors: string };
      console.log(
        `  ws/${word}: distractors=[${data.distractors}], ${wsCard.tags.length} tags`,
      );
    }

    const mlForWord = mlCards.filter(
      (c) => (c.data as { word: string }).word === word,
    );
    if (mlForWord.length > 0) {
      for (const mlCard of mlForWord) {
        const data = mlCard.data as { word: string; blanks: string };
        const display = data.word
          .split("")
          .map((ch, i) => data.blanks.split(",").map(Number).includes(i) ? "_" : ch)
          .join("");
        const exerciseTag = mlCard.tags.find((t) => t.startsWith("gpc:exercise:"));
        console.log(
          `  ml/${word}: "${display}" blanks=[${data.blanks}] exercise=${exerciseTag}`,
        );
      }
    }
  }

  // Spot-check a WhoSaidThat card
  const wstSample = wstCards.find((c) => c._id.includes("sh-SH"));
  if (wstSample) {
    const data = wstSample.data as {
      targetPhoneme: string;
      correctLetter: string;
      distractors: string;
    };
    console.log(
      `  wst/sh-SH: phoneme=${data.targetPhoneme}, letter=${data.correctLetter}, distractors=${data.distractors}`,
    );
    console.log(`    tags: ${wstSample.tags.join(", ")}`);
  }

  // Spot-check GpcIntro cards
  const introSpotIds = ["c-intro-s-S", "c-intro-a-AE", "c-intro-t-T"];
  for (const cardId of introSpotIds) {
    const card = introCards.find((c) => c._id === cardId);
    if (card) {
      const data = card.data as { letter: string; phoneme: string; onsetWords: string; coreWords: string; codaWords: string };
      console.log(
        `  intro/${data.letter}: onset=[${data.onsetWords}] core=[${data.coreWords}] coda=[${data.codaWords}]`,
      );
      console.log(`    tags: ${card.tags.join(", ")}`);
    }
  }

  // ---- Write output ----
  const outputPath = resolve(OUTPUTS_V2, "generated-cards.json");

  // Write as a structured output with metadata
  const output = {
    meta: {
      generatedAt,
      generatedBy: "generate-cards.ts",
      stats: validation.stats,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    },
    cards: allCards,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✅ Wrote ${allCards.length} cards to ${outputPath}`);

  // ---- Curriculum coverage report (P4.2) ----
  // Per-GPC audio tally: of the teaching words containing a GPC, how many have
  // recorded audio. Deterministic; the report carries no timestamp so re-tag
  // diffs are the signal.
  const audioByGpc = new Map<string, AudioTally>();
  for (const tw of teachingWords.words) {
    const hasAudio = audioWords.has(tw.word);
    for (const gpcId of tw.gpcs) {
      let tally = audioByGpc.get(gpcId);
      if (!tally) audioByGpc.set(gpcId, (tally = { withAudio: 0, total: 0 }));
      tally.total++;
      if (hasAudio) tally.withAudio++;
    }
  }
  const coverageRows = buildCoverageRows({ cards: allCards, audioByGpc });
  const coveragePath = resolve(OUTPUTS_V2, "curriculum-coverage.md");
  writeFileSync(coveragePath, formatCoverageMarkdown(coverageRows) + "\n");
  console.log(`✅ Wrote curriculum coverage report to ${coveragePath}`);

  if (validation.errors.length > 0) {
    console.error(
      `\n❌ Completed with ${validation.errors.length} error(s). Review above.`,
    );
    process.exit(1);
  } else {
    console.log("\n✅ Card generation complete!");
  }
}

main();
