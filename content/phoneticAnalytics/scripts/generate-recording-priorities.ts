/**
 * Generate Recording Priorities
 * ==============================
 *
 * Generates a prioritized list of words to record for WordSelection exercises.
 * Uses GPC-level minimal pairs to ensure proper curriculum alignment.
 *
 * ALGORITHM OVERVIEW:
 * 1. Load teaching words, GPC sequence, existing recordings
 * 2. Build GPC minimal pair index
 * 3. Apply word filters (blacklist, frequency, etc.)
 * 4. Score words based on:
 *    - GPC coverage value (unsatisfied GPCs = higher value)
 *    - Minimal pair synergy (pairs with already-selected words)
 *    - Word frequency (higher frequency = more useful)
 * 5. Greedily select words until requirements are met
 *
 * OUTPUTS (to outputs-v2/):
 * - recording-priorities.json — Full prioritized list with metadata
 * - recording-priorities-summary.md — Human-readable summary
 *
 * USAGE:
 *   npx tsx scripts/generate-recording-priorities.ts
 *   yarn generate:priorities
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  buildGpcMinimalPairIndex,
  findGpcMinimalPairs,
  type WordWithGpcs,
  type GpcMinimalPairIndex,
  type GpcMinimalPairInfo,
} from "../lib";

import {
  createWordFilter,
  DEFAULT_BLACKLIST,
  DEFAULT_PROPER_NOUNS,
  extendBlacklist,
  type WordFilter,
} from "../lib/word-filter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS = resolve(__dirname, "..", "outputs-v2");
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
// Canonical source of "what audio exists" — the runtime word list gates card
// generation, so it's the source of truth for the priorities script too.
// (Previously this scanned extracted-audio/words/ on disk, which could drift.)
const AUDIO_WORD_LIST_PATH = resolve(
  PROJECT_ROOT,
  "src",
  "audio",
  "word-list.ts",
);

// =============================================================================
// Types
// =============================================================================

interface TeachingWord {
  word: string;
  phonemes: string[];
  frequency: number;
  gpcs: string[];
  pattern: string;
  issues: string[];
  fullyAligned: boolean;
}

interface GpcSequenceStep {
  step: number;
  gpcId: string;
  marginalGain: number;
  marginalFrequency: number;
  cumulativeGpcs: number;
  cumulativeWords: number;
  cumulativeFrequency: number;
  coveragePercent: number;
}

interface GpcSequenceData {
  sequence: GpcSequenceStep[];
  initialKnown: string[];
  totalWords: number;
  totalFrequency: number;
  finalCoverage: number;
  meta: {
    generatedBy: string;
    generatedAt: string;
    options: {
      minFrequency: number;
      maxSteps: number;
      targetCoverage: number;
      initialKnownCount: number;
    };
    plateau: number | null;
    unusedGpcs: number;
  };
}

interface PrioritizedWord {
  priority: number;
  word: string;
  phonemes: string[];
  gpcs: string[];
  frequency: number;
  unlockStep: number;
  gpcsCovered: string[];
  minimalPairs: {
    partner: string;
    position: string;
    gpcContrast: [string, string];
    graphemeContrast: [string, string];
  }[];
  alreadyRecorded: boolean;
  score: number;
  scoreBreakdown: {
    frequency: number;
    gpcCoverage: number;
    minimalPairSynergy: number;
  };
}

interface ScoringContext {
  /** GPCs that still need coverage (haven't been satisfied yet) */
  unsatisfiedGpcs: Set<string>;

  /** Words already selected for recording */
  selectedWords: Set<string>;

  /** GPC minimal pair index */
  minimalPairIndex: GpcMinimalPairIndex;

  /** Word frequency map */
  frequencies: Map<string, number>;

  /** GPC → unlock step mapping */
  gpcUnlockStep: Map<string, number>;

  /** Already recorded words */
  alreadyRecorded: Set<string>;

  /** GPC priority/value (based on sequence position) */
  gpcValue: Map<string, number>;

  /** Words per GPC count (for requirement tracking) */
  wordsPerGpc: Map<string, number>;

  /** Minimum words required per GPC */
  minWordsPerGpc: number;
}

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  /** Minimum words to record per GPC */
  minWordsPerGpc: 3,

  /** Maximum words to select (cap the output) */
  maxWords: 600,

  /** Target coverage of curriculum GPCs (first N steps) */
  targetCurriculumSteps: 100,

  /** Minimum word frequency to consider */
  minFrequency: 1000,

  /** Frequency threshold for "common" words (gets bonus) */
  commonWordThreshold: 2500,

  /** Frequency threshold for "very common" words (gets bigger bonus) */
  veryCommonWordThreshold: 10000,

  /** Scoring weights */
  weights: {
    /** Weight for log frequency (higher = prefer common words) */
    frequency: 40,

    /** Bonus for words above commonWordThreshold */
    commonWordBonus: 100,

    /** Bonus for words above veryCommonWordThreshold */
    veryCommonWordBonus: 200,

    /** Weight for covering unsatisfied GPCs (higher = prefer useful words) */
    gpcCoverage: 30,

    /** Weight for minimal pair synergy (higher = prefer words that pair well) */
    minimalPairSynergy: 25,

    /** Bonus for already-recorded words (reduces recording work) */
    alreadyRecordedBonus: 80,
  },

  /**
   * Pedagogically-aspirational words to force-include even if the scoring
   * doesn't surface them. Kept small and explicit. Previously this set
   * duplicated ~150 words from `src/audio/word-list.ts`; those are now
   * handled by the `alreadyRecordedBonus` instead.
   *
   * Each entry should complete a high-value minimal-pair family or magic-e
   * pair that the existing recordings don't yet support.
   */
  forceInclude: new Set<string>([
    "gut", // completes -ut family (cut, but, hut, nut)
    "gun", // completes -un family (run, fun, sun, bun)
    "cute", // magic-e pair with cut
    "cube", // magic-e pair with cub
    "time", // anchors -ime family (lime, dime, mine)
  ]),

  /** Additional blacklist words beyond DEFAULT_BLACKLIST */
  additionalBlacklist: [
    // Words found during manual review
    "douche",
    "dweeb",
    "hoc",
    "kwan",
    "skulk",
    "blithe",
    "tho",
    "jeanne",
    "yale",
    "salle",
    "twas",
    "schnook",
    "nene",
    "gere",
    "kirsch",
    "chou",
    "mousse",
    // Uncommon/archaic words
    "bey",
    "ley",
    "mea",
    "yer",
    "faux",
    // Names that slipped through
    "kong",
    "gene",
    // Words that may confuse young learners
    "thong",
    "verge",
    "gouge",
    "squeal",
  ],
};

// =============================================================================
// Main
// =============================================================================

function main() {
  console.log("=".repeat(60));
  console.log("RECORDING PRIORITY GENERATOR");
  console.log("=".repeat(60));
  console.log();

  // Load data
  console.log("Loading data...");

  const teachingData = JSON.parse(
    readFileSync(resolve(OUTPUTS, "teaching-words.json"), "utf-8"),
  );
  const teachingWords: TeachingWord[] = teachingData.words;
  console.log(`  Teaching words: ${teachingWords.length}`);

  const sequenceData: GpcSequenceData = JSON.parse(
    readFileSync(resolve(OUTPUTS, "gpc-sequence.json"), "utf-8"),
  );
  console.log(`  GPC sequence steps: ${sequenceData.sequence.length}`);

  // Load existing recordings
  const existingRecordings = loadExistingRecordings();
  console.log(`  Existing recordings: ${existingRecordings.size}`);

  console.log();

  // Create word filter
  console.log("Creating word filter...");
  const filter = createWordFilter({
    blacklist: extendBlacklist(DEFAULT_BLACKLIST, CONFIG.additionalBlacklist),
    properNouns: DEFAULT_PROPER_NOUNS,
    minFrequency: CONFIG.minFrequency,
    excludeProperNouns: true,
    whitelist: CONFIG.forceInclude,
  });

  // Convert to WordWithGpcs and filter
  const wordsWithGpcs: WordWithGpcs[] = teachingWords
    .map((w) => ({
      word: w.word,
      phonemes: w.phonemes as any,
      gpcs: w.gpcs,
      frequency: w.frequency,
    }))
    .filter((w) => {
      // Exclude whole-word GPCs (sight words)
      if (w.gpcs.some((g) => g.startsWith("GPC-WORD-"))) {
        return false;
      }
      // Apply word filter
      return filter.isAllowed(w.word, w.frequency);
    });

  const filterStats = filter.getStats();
  console.log(`  Filtered words: ${wordsWithGpcs.length}`);
  console.log(`  Removed: ${filterStats.totalFiltered}`);
  if (Object.keys(filterStats.byReason).length > 0) {
    for (const [reason, count] of Object.entries(filterStats.byReason)) {
      console.log(`    - ${reason}: ${count}`);
    }
  }
  console.log();

  // Build GPC minimal pair index
  console.log("Building GPC minimal pair index...");
  const minimalPairIndex = buildGpcMinimalPairIndex(wordsWithGpcs);
  console.log(`  Index size: ${minimalPairIndex.size} words`);
  console.log();

  // Build GPC unlock step mapping from sequence
  const gpcUnlockStep = new Map<string, number>();
  const gpcValue = new Map<string, number>();

  // Add initial known GPCs at step 0
  for (const gpcId of sequenceData.initialKnown) {
    gpcUnlockStep.set(gpcId, 0);
    gpcValue.set(gpcId, CONFIG.targetCurriculumSteps); // High value for foundation
  }

  // Add sequence GPCs
  for (const step of sequenceData.sequence) {
    if (step.gpcId.startsWith("(initial")) continue; // Skip the initial step marker

    gpcUnlockStep.set(step.gpcId, step.step);
    // Value decreases with step (earlier GPCs are more important)
    gpcValue.set(
      step.gpcId,
      Math.max(1, CONFIG.targetCurriculumSteps - step.step),
    );
  }

  console.log(`  GPCs in curriculum: ${gpcUnlockStep.size}`);

  // Initialize scoring context
  const context: ScoringContext = {
    unsatisfiedGpcs: new Set(gpcUnlockStep.keys()),
    selectedWords: new Set(),
    minimalPairIndex,
    frequencies: new Map(wordsWithGpcs.map((w) => [w.word, w.frequency ?? 0])),
    gpcUnlockStep,
    alreadyRecorded: existingRecordings,
    gpcValue,
    wordsPerGpc: new Map(),
    minWordsPerGpc: CONFIG.minWordsPerGpc,
  };

  // Initialize words per GPC counter
  for (const gpc of gpcUnlockStep.keys()) {
    context.wordsPerGpc.set(gpc, 0);
  }

  // Create word map for quick lookup
  const wordMap = new Map(wordsWithGpcs.map((w) => [w.word, w]));

  // Phase 1: Force-include foundational words first
  console.log("=".repeat(60));
  console.log("PHASE 1: FOUNDATIONAL WORDS");
  console.log("=".repeat(60));
  console.log();

  const selected: PrioritizedWord[] = [];

  // Add force-included words first (if they exist in our filtered set)
  const forceIncludeWords = [...CONFIG.forceInclude]
    .filter((w) => wordMap.has(w))
    .map((w) => wordMap.get(w)!)
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

  console.log(`Adding ${forceIncludeWords.length} foundational words...`);

  for (const word of forceIncludeWords) {
    if (context.selectedWords.has(word.word)) continue;

    const unlockStep = getWordUnlockStep(word, context);
    const pairs = findGpcMinimalPairs(word.word, minimalPairIndex);
    const selectedPairs = pairs.filter((p) =>
      context.selectedWords.has(p.partner),
    );
    const { score, breakdown } = scoreWord(word, context);

    const prioritizedWord: PrioritizedWord = {
      priority: selected.length + 1,
      word: word.word,
      phonemes: word.phonemes,
      gpcs: word.gpcs,
      frequency: word.frequency ?? 0,
      unlockStep,
      gpcsCovered: word.gpcs.filter((g) => context.gpcUnlockStep.has(g)),
      minimalPairs: selectedPairs.map((p) => ({
        partner: p.partner,
        position: p.position,
        gpcContrast: [p.gpcA, p.gpcB] as [string, string],
        graphemeContrast: [p.graphemeA, p.graphemeB] as [string, string],
      })),
      alreadyRecorded: context.alreadyRecorded.has(word.word),
      score,
      scoreBreakdown: breakdown,
    };

    selected.push(prioritizedWord);

    // Update context
    context.selectedWords.add(word.word);
    for (const gpc of word.gpcs) {
      const count = (context.wordsPerGpc.get(gpc) ?? 0) + 1;
      context.wordsPerGpc.set(gpc, count);
      if (count >= context.minWordsPerGpc) {
        context.unsatisfiedGpcs.delete(gpc);
      }
    }

    if (selected.length <= 20) {
      console.log(
        `${selected.length.toString().padStart(3)}. ${word.word.padEnd(12)} ` +
          `freq=${(word.frequency ?? 0).toLocaleString().padStart(8)} ` +
          `step=${unlockStep.toString().padStart(3)} ` +
          `${prioritizedWord.alreadyRecorded ? "[recorded]" : ""}`,
      );
    }
  }

  console.log(`  Added ${selected.length} foundational words`);
  console.log();

  // Phase 2: Greedy selection for remaining coverage
  console.log("=".repeat(60));
  console.log("PHASE 2: GREEDY WORD SELECTION");
  console.log("=".repeat(60));
  console.log();

  let iteration = 0;

  while (
    selected.length < CONFIG.maxWords &&
    hasUnsatisfiedRequirements(context)
  ) {
    iteration++;

    // Score all unselected words
    let bestWord: WordWithGpcs | null = null;
    let bestScore = -Infinity;
    let bestBreakdown = { frequency: 0, gpcCoverage: 0, minimalPairSynergy: 0 };

    for (const word of wordsWithGpcs) {
      if (context.selectedWords.has(word.word)) continue;

      const { score, breakdown } = scoreWord(word, context);

      if (score > bestScore) {
        bestScore = score;
        bestWord = word;
        bestBreakdown = breakdown;
      }
    }

    if (!bestWord || bestScore <= 0) {
      console.log(
        `Stopping: no more valuable words (best score: ${bestScore})`,
      );
      break;
    }

    // Add to selection
    const unlockStep = getWordUnlockStep(bestWord, context);
    const pairs = findGpcMinimalPairs(bestWord.word, minimalPairIndex);
    const selectedPairs = pairs.filter((p) =>
      context.selectedWords.has(p.partner),
    );

    const prioritizedWord: PrioritizedWord = {
      priority: selected.length + 1,
      word: bestWord.word,
      phonemes: bestWord.phonemes,
      gpcs: bestWord.gpcs,
      frequency: bestWord.frequency ?? 0,
      unlockStep,
      gpcsCovered: bestWord.gpcs.filter((g) => context.gpcUnlockStep.has(g)),
      minimalPairs: selectedPairs.map((p) => ({
        partner: p.partner,
        position: p.position,
        gpcContrast: [p.gpcA, p.gpcB] as [string, string],
        graphemeContrast: [p.graphemeA, p.graphemeB] as [string, string],
      })),
      alreadyRecorded: context.alreadyRecorded.has(bestWord.word),
      score: bestScore,
      scoreBreakdown: bestBreakdown,
    };

    selected.push(prioritizedWord);

    // Update context
    context.selectedWords.add(bestWord.word);

    for (const gpc of bestWord.gpcs) {
      const count = (context.wordsPerGpc.get(gpc) ?? 0) + 1;
      context.wordsPerGpc.set(gpc, count);

      // Mark GPC as satisfied if we have enough words
      if (count >= context.minWordsPerGpc) {
        context.unsatisfiedGpcs.delete(gpc);
      }
    }

    // Progress logging
    if (selected.length <= 20 || selected.length % 50 === 0) {
      const pairInfo =
        selectedPairs.length > 0
          ? ` (pairs: ${selectedPairs.map((p) => p.partner).join(", ")})`
          : "";
      console.log(
        `${selected.length.toString().padStart(3)}. ${bestWord.word.padEnd(12)} ` +
          `score=${bestScore.toFixed(1).padStart(6)} ` +
          `freq=${(bestWord.frequency ?? 0).toLocaleString().padStart(8)} ` +
          `step=${unlockStep.toString().padStart(3)} ` +
          `${prioritizedWord.alreadyRecorded ? "[recorded]" : ""}${pairInfo}`,
      );
    }
  }

  console.log();
  console.log(`Selected ${selected.length} words`);

  // Statistics
  console.log();
  console.log("=".repeat(60));
  console.log("STATISTICS");
  console.log("=".repeat(60));
  console.log();

  const alreadyRecordedCount = selected.filter((w) => w.alreadyRecorded).length;
  const needsRecording = selected.length - alreadyRecordedCount;

  console.log(`Total words selected: ${selected.length}`);
  console.log(`Already recorded: ${alreadyRecordedCount}`);
  console.log(`Needs recording: ${needsRecording}`);
  console.log();

  // GPC coverage
  const gpcCoverage = new Map<string, number>();
  for (const word of selected) {
    for (const gpc of word.gpcs) {
      gpcCoverage.set(gpc, (gpcCoverage.get(gpc) ?? 0) + 1);
    }
  }

  const coveredGpcs = [...gpcCoverage.entries()].filter(
    ([_, count]) => count >= CONFIG.minWordsPerGpc,
  );
  const partialGpcs = [...gpcCoverage.entries()].filter(
    ([_, count]) => count > 0 && count < CONFIG.minWordsPerGpc,
  );
  const uncoveredGpcs = [...context.gpcUnlockStep.keys()].filter(
    (gpc) => !gpcCoverage.has(gpc),
  );

  console.log(
    `GPCs fully covered (${CONFIG.minWordsPerGpc}+ words): ${coveredGpcs.length}`,
  );
  console.log(`GPCs partially covered: ${partialGpcs.length}`);
  console.log(`GPCs uncovered: ${uncoveredGpcs.length}`);

  if (uncoveredGpcs.length > 0 && uncoveredGpcs.length <= 20) {
    console.log(`  Uncovered: ${uncoveredGpcs.join(", ")}`);
  }
  console.log();

  // Minimal pair coverage
  let totalPairs = 0;
  for (const word of selected) {
    totalPairs += word.minimalPairs.length;
  }
  console.log(`Total minimal pair relationships: ${totalPairs}`);
  console.log();

  // Save outputs
  console.log("=".repeat(60));
  console.log("SAVING OUTPUTS");
  console.log("=".repeat(60));
  console.log();

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      config: CONFIG,
      stats: {
        totalSelected: selected.length,
        alreadyRecorded: alreadyRecordedCount,
        needsRecording,
        gpcsCovered: coveredGpcs.length,
        gpcsPartial: partialGpcs.length,
        gpcsUncovered: uncoveredGpcs.length,
        totalMinimalPairs: totalPairs,
      },
    },
    words: selected,
  };

  writeFileSync(
    resolve(OUTPUTS, "recording-priorities.json"),
    JSON.stringify(output, null, 2),
  );
  console.log("  → recording-priorities.json");

  // Generate summary markdown
  const summary = generateSummaryMarkdown(selected, output.meta.stats);
  writeFileSync(resolve(OUTPUTS, "recording-priorities-summary.md"), summary);
  console.log("  → recording-priorities-summary.md");

  // Generate simple word list for recording session
  const wordList = selected
    .filter((w) => !w.alreadyRecorded)
    .map((w) => w.word)
    .join("\n");
  writeFileSync(resolve(OUTPUTS, "words-to-record.txt"), wordList);
  console.log("  → words-to-record.txt");

  console.log();
  console.log("Done!");
}

// =============================================================================
// Helper Functions
// =============================================================================

function loadExistingRecordings(): Set<string> {
  const recordings = new Set<string>();
  const source = readFileSync(AUDIO_WORD_LIST_PATH, "utf-8");
  // WORD_LIST entries are single-quoted lowercase words inside the `as const` array.
  for (const match of source.matchAll(/'([a-z][a-z_]*)'/g)) {
    recordings.add(match[1]);
  }
  return recordings;
}

function scoreWord(
  word: WordWithGpcs,
  context: ScoringContext,
): {
  score: number;
  breakdown: {
    frequency: number;
    gpcCoverage: number;
    minimalPairSynergy: number;
  };
} {
  let frequencyScore = 0;
  let gpcCoverageScore = 0;
  let minimalPairScore = 0;

  const freq = word.frequency ?? 1;

  // Frequency score (log scale base)
  frequencyScore = Math.log10(freq + 1) * CONFIG.weights.frequency;

  // Bonus for common words (frequency > 1000)
  if (freq >= CONFIG.veryCommonWordThreshold) {
    frequencyScore += CONFIG.weights.veryCommonWordBonus;
  } else if (freq >= CONFIG.commonWordThreshold) {
    frequencyScore += CONFIG.weights.commonWordBonus;
  }

  // GPC coverage score
  for (const gpc of word.gpcs) {
    if (context.unsatisfiedGpcs.has(gpc)) {
      const value = context.gpcValue.get(gpc) ?? 1;
      gpcCoverageScore += value * CONFIG.weights.gpcCoverage;
    }
  }

  // Minimal pair synergy score — fires when a partner is either already
  // selected this run, or already has audio. Recording a word that pairs
  // with an existing recording unlocks a new WordSelection card immediately.
  const pairs = findGpcMinimalPairs(word.word, context.minimalPairIndex);
  for (const pair of pairs) {
    if (
      context.selectedWords.has(pair.partner) ||
      context.alreadyRecorded.has(pair.partner)
    ) {
      minimalPairScore += CONFIG.weights.minimalPairSynergy;
    }
  }

  // Already recorded bonus
  let bonusScore = 0;
  if (context.alreadyRecorded.has(word.word)) {
    bonusScore = CONFIG.weights.alreadyRecordedBonus;
  }

  const totalScore =
    frequencyScore + gpcCoverageScore + minimalPairScore + bonusScore;

  return {
    score: totalScore,
    breakdown: {
      frequency: frequencyScore,
      gpcCoverage: gpcCoverageScore,
      minimalPairSynergy: minimalPairScore,
    },
  };
}

function getWordUnlockStep(
  word: WordWithGpcs,
  context: ScoringContext,
): number {
  let maxStep = 0;
  for (const gpc of word.gpcs) {
    const step = context.gpcUnlockStep.get(gpc) ?? 0;
    if (step > maxStep) {
      maxStep = step;
    }
  }
  return maxStep;
}

function hasUnsatisfiedRequirements(context: ScoringContext): boolean {
  return context.unsatisfiedGpcs.size > 0;
}

function generateSummaryMarkdown(
  words: PrioritizedWord[],
  stats: {
    totalSelected: number;
    alreadyRecorded: number;
    needsRecording: number;
    gpcsCovered: number;
    gpcsPartial: number;
    gpcsUncovered: number;
    totalMinimalPairs: number;
  },
): string {
  const lines: string[] = [];

  lines.push("# Recording Priorities Summary");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Statistics");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total words selected | ${stats.totalSelected} |`);
  lines.push(`| Already recorded | ${stats.alreadyRecorded} |`);
  lines.push(`| **Needs recording** | **${stats.needsRecording}** |`);
  lines.push(`| GPCs fully covered | ${stats.gpcsCovered} |`);
  lines.push(`| GPCs partially covered | ${stats.gpcsPartial} |`);
  lines.push(`| GPCs uncovered | ${stats.gpcsUncovered} |`);
  lines.push(`| Total minimal pairs | ${stats.totalMinimalPairs} |`);
  lines.push("");

  lines.push("## Words to Record");
  lines.push("");
  lines.push(
    "Words that need recording (not already in src/audio/word-list.ts):",
  );
  lines.push("");

  const toRecord = words.filter((w) => !w.alreadyRecorded);
  const byUnlockStep = new Map<number, PrioritizedWord[]>();

  for (const word of toRecord) {
    const step = word.unlockStep;
    if (!byUnlockStep.has(step)) {
      byUnlockStep.set(step, []);
    }
    byUnlockStep.get(step)!.push(word);
  }

  const sortedSteps = [...byUnlockStep.keys()].sort((a, b) => a - b);

  for (const step of sortedSteps) {
    const stepWords = byUnlockStep.get(step)!;
    lines.push(`### Step ${step} (${stepWords.length} words)`);
    lines.push("");
    lines.push("| Word | Frequency | GPCs | Pairs With |");
    lines.push("|------|-----------|------|------------|");

    for (const word of stepWords.slice(0, 50)) {
      // Limit per step
      const pairs = word.minimalPairs
        .slice(0, 3)
        .map((p) => p.partner)
        .join(", ");
      const gpcs = word.gpcs.slice(0, 3).join(", ");
      lines.push(
        `| ${word.word} | ${word.frequency.toLocaleString()} | ${gpcs} | ${pairs} |`,
      );
    }

    if (stepWords.length > 50) {
      lines.push(`| ... | (${stepWords.length - 50} more) | | |`);
    }
    lines.push("");
  }

  lines.push("## Already Recorded Words");
  lines.push("");

  const recorded = words.filter((w) => w.alreadyRecorded);
  if (recorded.length > 0) {
    lines.push(
      `These ${recorded.length} words are already recorded and don't need re-recording:`,
    );
    lines.push("");
    lines.push(
      recorded
        .slice(0, 100)
        .map((w) => w.word)
        .join(", "),
    );
    if (recorded.length > 100) {
      lines.push(`... and ${recorded.length - 100} more`);
    }
  } else {
    lines.push("No words are already recorded.");
  }
  lines.push("");

  lines.push("## Top 50 Priority Words");
  lines.push("");
  lines.push("| # | Word | Freq | Step | Recorded | Score | Pairs |");
  lines.push("|---|------|------|------|----------|-------|-------|");

  for (const word of words.slice(0, 50)) {
    const recorded = word.alreadyRecorded ? "✓" : "";
    const pairs = word.minimalPairs.length;
    lines.push(
      `| ${word.priority} | ${word.word} | ${word.frequency.toLocaleString()} | ${word.unlockStep} | ${recorded} | ${word.score.toFixed(0)} | ${pairs} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

// =============================================================================
// Entry Point
// =============================================================================

main();
