/**
 * Coverage Optimization Module
 *
 * Implements set cover optimization for GPC teaching sequence.
 * The goal is to find an ordering of GPCs that maximizes cumulative
 * decodable coverage of a frequency-weighted word corpus.
 *
 * Key insight: Each new GPC taught should unlock the maximum additional
 * weighted coverage of decodable words.
 *
 * Algorithm: Greedy weighted set cover
 * 1. Start with empty set of known GPCs
 * 2. Find the GPC that would unlock the most frequency-weighted new words
 * 3. Add it to known set, record the coverage gain
 * 4. Repeat until all GPCs are taught or coverage plateaus
 *
 * @example
 * ```ts
 * import { computeOptimalSequence } from './coverage';
 * import { loadCatalogue } from './catalogue';
 *
 * const catalogue = loadCatalogue('./src-data/gpc-catalogue.json');
 * const words = loadTaggedWords('./outputs/gpc-words.json');
 *
 * const sequence = computeOptimalSequence(catalogue, words);
 * // => [
 * //   { step: 1, gpcId: 'GPC-th-DH', addedFrequency: 1234567, ... },
 * //   { step: 2, gpcId: 'GPC-a-AE', addedFrequency: 456789, ... },
 * //   ...
 * // ]
 * ```
 */

import { parseGpcId } from './arpabet';
import type { GPCCatalogueIndex, GPCEntry } from './catalogue';
import { buildCatalogueIndex } from './catalogue';
import { canDecodeToPhonemes } from './decode';
import type {
    ArpabetPhoneme,
    CoverageResult,
    ProgressionStep,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Word tagged with its GPCs (for legacy greedy coverage algorithm)
 */
interface TaggedWord {
  word: string;
  frequency: number;
  gpcs: string[];
}

/**
 * Configuration options for coverage optimization
 */
export interface CoverageOptions {
  /**
   * Minimum frequency threshold for words to consider
   * Words below this frequency are ignored
   */
  minFrequency?: number;

  /**
   * Maximum number of steps to compute
   * Useful for limiting computation or focusing on early curriculum
   */
  maxSteps?: number;

  /**
   * GPCs to exclude from consideration
   * Useful for rare or advanced patterns
   */
  excludeGpcs?: Set<string>;

  /**
   * GPCs that are already known at the start of sequencing.
   * Useful for "What comes next?" analysis or starting after a fixed curriculum.
   */
  initialKnown?: string[];

  /**
   * GPCs that must be taught in a specific order (prerequisites)
   * Map from GPC to its prerequisites
   */
  prerequisites?: Map<string, string[]>;

  /**
   * Stop when this coverage percentage is reached
   */
  targetCoverage?: number;
}

/**
 * Result of coverage optimization
 */
export interface CoverageSequence {
  /** Ordered steps of GPC introduction */
  steps: ProgressionStep[];

  /** Final coverage statistics */
  finalCoverage: CoverageResult;

  /** GPCs not included in sequence (excluded or low value) */
  unusedGpcs: string[];

  /** Total frequency of input corpus */
  totalCorpusFrequency: number;
}

/**
 * Internal tracking for optimization algorithm
 */
interface OptimizationState {
  knownGpcs: Set<string>;
  coveredFrequency: number;
  coveredWords: Set<string>;
  remainingGpcs: Set<string>;
  wordsByGpc: Map<string, TaggedWord[]>;
}

// =============================================================================
// Main Optimization Function
// =============================================================================

/**
 * Compute the optimal GPC teaching sequence using greedy set cover
 *
 * @param catalogue - The indexed GPC catalogue
 * @param words - Array of tagged words with frequencies
 * @param options - Optimization options
 * @returns The optimal sequence with coverage metrics
 */
export function computeOptimalSequence(
  catalogue: GPCCatalogueIndex,
  words: TaggedWord[],
  options: CoverageOptions = {}
): CoverageSequence {
  const {
    minFrequency = 0,
    maxSteps = Infinity,
    excludeGpcs = new Set(),
    prerequisites = new Map(),
    targetCoverage = 100,
    initialKnown = [],
  } = options;

  // Filter words by minimum frequency
  const filteredWords = words.filter(w => w.frequency >= minFrequency);

  // Calculate total corpus frequency
  const totalFrequency = filteredWords.reduce((sum, w) => sum + w.frequency, 0);

  // Build index: for each GPC, which words require it?
  const wordsByGpc = buildWordsByGpcIndex(filteredWords);

  // Get GPCs from catalogue as the universe of available GPCs
  // A GPC must be in the catalogue to be considered for sequencing
  const catalogueGpcs = new Set(catalogue.byId.keys());

  // Find GPCs that appear in corpus AND are in catalogue (excluding specified ones)
  const allGpcs = new Set<string>();
  for (const word of filteredWords) {
    for (const gpc of word.gpcs) {
      if (!excludeGpcs.has(gpc) && catalogueGpcs.has(gpc)) {
        allGpcs.add(gpc);
      }
    }
  }

  // Initialize state
  const state: OptimizationState = {
    knownGpcs: new Set(initialKnown),
    coveredFrequency: 0,
    coveredWords: new Set(),
    remainingGpcs: new Set(allGpcs),
    wordsByGpc,
  };

  // Remove initialKnown from remainingGpcs
  for (const gpc of initialKnown) {
    state.remainingGpcs.delete(gpc);
  }

  // Calculate baseline coverage from initial GPCs
  const initiallyDecodable: TaggedWord[] = [];
  for (const word of filteredWords) {
    // Check if word is fully decodable with initial GPCs
    const isDecodable = word.gpcs.every(gpc => state.knownGpcs.has(gpc));

    if (isDecodable) {
      state.coveredWords.add(word.word);
      state.coveredFrequency += word.frequency;
      initiallyDecodable.push(word);
    }
  }

  const steps: ProgressionStep[] = [];
  // Add step 0 if there are initial GPCs
  if (initialKnown.length > 0) {
    // Sort by frequency descending to get high-frequency samples
    const sortedInitial = [...initiallyDecodable].sort((a, b) => b.frequency - a.frequency);

    steps.push({
      step: 0,
      gpcId: `(initial: ${initialKnown.join(', ')})`,
      grapheme: '',
      phoneme: '',
      newWords: sortedInitial.slice(0, 10).map(w => w.word),
      newWordCount: initiallyDecodable.length,
      addedFrequency: state.coveredFrequency,
      cumulativeFrequency: state.coveredFrequency,
      coveragePercent: (state.coveredFrequency / totalFrequency) * 100,
    });
  }

  let stepNum = 0;

  // Greedy optimization loop
  while (
    state.remainingGpcs.size > 0 &&
    stepNum < maxSteps &&
    (state.coveredFrequency / totalFrequency) * 100 < targetCoverage
  ) {
    // Find the GPC that provides maximum marginal gain
    const bestGpc = findBestNextGpc(state, filteredWords, prerequisites);

    if (!bestGpc) {
      // No more GPCs provide value
      break;
    }

    // "Teach" this GPC
    state.knownGpcs.add(bestGpc.gpcId);
    state.remainingGpcs.delete(bestGpc.gpcId);

    // Update covered words and frequency
    for (const word of bestGpc.newlyDecodable) {
      if (!state.coveredWords.has(word.word)) {
        state.coveredWords.add(word.word);
        state.coveredFrequency += word.frequency;
      }
    }

    // Record the step
    stepNum++;
    const parsed = parseGpcId(bestGpc.gpcId);

    steps.push({
      step: stepNum,
      gpcId: bestGpc.gpcId,
      grapheme: parsed?.grapheme ?? '',
      phoneme: parsed?.phoneme ?? '',
      newWords: bestGpc.newlyDecodable.map(w => w.word).slice(0, 10), // Top 10
      newWordCount: bestGpc.newlyDecodable.length,
      addedFrequency: bestGpc.addedFrequency,
      cumulativeFrequency: state.coveredFrequency,
      coveragePercent: (state.coveredFrequency / totalFrequency) * 100,
    });
  }

  // Collect unused GPCs
  const unusedGpcs = [...state.remainingGpcs];

  // Build final coverage result
  const finalCoverage: CoverageResult = {
    totalFrequency,
    coveredFrequency: state.coveredFrequency,
    coveragePercent: totalFrequency > 0
      ? (state.coveredFrequency / totalFrequency) * 100
      : 0,
    weightedScore: totalFrequency > 0
      ? state.coveredFrequency / totalFrequency
      : 0,
    coveredWords: state.coveredWords.size,
    partialWords: 0, // Not tracked in this simple implementation
    failedWords: filteredWords.length - state.coveredWords.size,
  };

  return {
    steps,
    finalCoverage,
    unusedGpcs,
    totalCorpusFrequency: totalFrequency,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build an index mapping each GPC to words that contain it
 */
function buildWordsByGpcIndex(words: TaggedWord[]): Map<string, TaggedWord[]> {
  const index = new Map<string, TaggedWord[]>();

  for (const word of words) {
    for (const gpc of word.gpcs) {
      if (!index.has(gpc)) {
        index.set(gpc, []);
      }
      index.get(gpc)!.push(word);
    }
  }

  return index;
}

/**
 * Candidate GPC with its marginal value
 */
interface GpcCandidate {
  gpcId: string;
  addedFrequency: number;
  newlyDecodable: TaggedWord[];
}

/**
 * Find the GPC that provides the maximum marginal frequency gain
 *
 * A word becomes "newly decodable" when all its required GPCs are known.
 *
 * Fallback: If no words become fully decodable, choose the GPC that appears
 * in the most frequency-weighted words (moving toward future decodability).
 */
function findBestNextGpc(
  state: OptimizationState,
  words: TaggedWord[],
  prerequisites: Map<string, string[]> // Added prerequisites parameter
): GpcCandidate | null {
  let bestCandidate: GpcCandidate | null = null;
  let bestGain = 0;

  // Track fallback: GPC with highest potential (appears in most frequency)
  let fallbackGpc: string | null = null;
  let fallbackFrequency = 0;

  for (const gpcId of state.remainingGpcs) {
    // Check prerequisites
    const prereqs = prerequisites.get(gpcId) ?? [];
    const prereqsMet = prereqs.every(p => state.knownGpcs.has(p));
    if (!prereqsMet) continue;

    // Calculate words that would become decodable
    const newlyDecodable: TaggedWord[] = [];
    let addedFrequency = 0;
    let potentialFrequency = 0; // Frequency of all words containing this GPC

    for (const word of words) {
      // Skip already covered words
      if (state.coveredWords.has(word.word)) continue;

      // Check if word requires this GPC
      if (!word.gpcs.includes(gpcId)) continue;

      // Track potential frequency for fallback
      potentialFrequency += word.frequency;

      // Check if all OTHER required GPCs are already known
      const allOthersKnown = word.gpcs.every(
        gpc => gpc === gpcId || state.knownGpcs.has(gpc)
      );

      if (allOthersKnown) {
        newlyDecodable.push(word);
        addedFrequency += word.frequency;
      }
    }

    if (addedFrequency > bestGain) {
      bestGain = addedFrequency;
      bestCandidate = {
        gpcId,
        addedFrequency,
        newlyDecodable,
      };
    }

    // Track fallback candidate
    if (potentialFrequency > fallbackFrequency) {
      fallbackFrequency = potentialFrequency;
      fallbackGpc = gpcId;
    }
  }

  // If no words become fully decodable, use fallback (progress toward future decodability)
  if (bestCandidate === null && fallbackGpc !== null) {
    return {
      gpcId: fallbackGpc,
      addedFrequency: 0,
      newlyDecodable: [],
    };
  }

  return bestCandidate;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Find "gateway" GPCs - those that unlock many other GPCs
 *
 * A gateway GPC is one that appears in many words alongside GPCs
 * that only appear in those words. Learning the gateway unlocks
 * the ability to teach those other GPCs.
 */
export function findGatewayGpcs(words: TaggedWord[]): Map<string, number> {
  // Count co-occurrences: how often does each pair of GPCs appear together?
  const cooccurrence = new Map<string, Map<string, number>>();

  for (const word of words) {
    for (const gpc1 of word.gpcs) {
      if (!cooccurrence.has(gpc1)) {
        cooccurrence.set(gpc1, new Map());
      }
      for (const gpc2 of word.gpcs) {
        if (gpc1 !== gpc2) {
          const map = cooccurrence.get(gpc1)!;
          map.set(gpc2, (map.get(gpc2) ?? 0) + word.frequency);
        }
      }
    }
  }

  // Score each GPC by how much total co-occurrence frequency it has
  const gatewayScores = new Map<string, number>();
  for (const [gpc, coocs] of cooccurrence) {
    let totalCooc = 0;
    for (const freq of coocs.values()) {
      totalCooc += freq;
    }
    gatewayScores.set(gpc, totalCooc);
  }

  return gatewayScores;
}

/**
 * Identify "foundation" GPCs - those that appear in the most words
 *
 * These are often high-utility consonants and short vowels.
 */
export function findFoundationGpcs(
  words: TaggedWord[],
  topN: number = 20
): Array<{ gpcId: string; wordCount: number; totalFrequency: number }> {
  const stats = new Map<string, { wordCount: number; totalFrequency: number }>();

  for (const word of words) {
    for (const gpc of word.gpcs) {
      if (!stats.has(gpc)) {
        stats.set(gpc, { wordCount: 0, totalFrequency: 0 });
      }
      const s = stats.get(gpc)!;
      s.wordCount++;
      s.totalFrequency += word.frequency;
    }
  }

  // Sort by total frequency
  const sorted = [...stats.entries()]
    .map(([gpcId, s]) => ({ gpcId, ...s }))
    .sort((a, b) => b.totalFrequency - a.totalFrequency);

  return sorted.slice(0, topN);
}

/**
 * Find the coverage plateau - where adding more GPCs yields diminishing returns
 *
 * Returns the step number where coverage gain drops below threshold
 */
export function findCoveragePlateau(
  sequence: CoverageSequence,
  thresholdPercent: number = 0.5
): number | null {
  for (let i = 1; i < sequence.steps.length; i++) {
    const gain = sequence.steps[i].coveragePercent - sequence.steps[i - 1].coveragePercent;
    if (gain < thresholdPercent) {
      return i;
    }
  }
  return null;
}

/**
 * Generate a coverage report as formatted text
 */
export function formatCoverageReport(sequence: CoverageSequence): string {
  const lines: string[] = [];

  lines.push('GPC COVERAGE OPTIMIZATION REPORT');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Total corpus frequency: ${sequence.totalCorpusFrequency.toLocaleString()}`);
  lines.push(`Final coverage: ${sequence.finalCoverage.coveragePercent.toFixed(1)}%`);
  lines.push(`Words covered: ${sequence.finalCoverage.coveredWords}`);
  lines.push(`Unused GPCs: ${sequence.unusedGpcs.length}`);
  lines.push('');
  lines.push('Step  GPC              Added Freq    Coverage%  Sample Words');
  lines.push('-'.repeat(60));

  for (const step of sequence.steps.slice(0, 50)) { // First 50 steps
    const gpcPad = step.gpcId.padEnd(16);
    const freqPad = step.addedFrequency.toLocaleString().padStart(12);
    const covPad = step.coveragePercent.toFixed(1).padStart(8);
    const samples = step.newWords.slice(0, 3).join(', ');

    lines.push(`${step.step.toString().padStart(4)}  ${gpcPad} ${freqPad}  ${covPad}%  ${samples}`);
  }

  if (sequence.steps.length > 50) {
    lines.push(`... and ${sequence.steps.length - 50} more steps`);
  }

  return lines.join('\n');
}

// =============================================================================
// Decode-Based Coverage (v2)
// =============================================================================

/**
 * A word with its actual pronunciation for decode-based coverage
 */
export interface WordWithPhonemes {
  word: string;
  phonemes: ArpabetPhoneme[];
  frequency: number;
}

/**
 * A curriculum stage with title and GPCs
 */
export interface CurriculumStage {
  title: string;
  gpcs: readonly GPCEntry[];
}

/**
 * Configuration for decode-based coverage
 */
export interface DecodeCoverageOptions {
  /** Minimum frequency threshold for words to consider */
  minFrequency?: number;
  /** Maximum number of steps to compute */
  maxSteps?: number;
  /** GPCs that are already known at the start */
  initialKnown?: GPCEntry[];
  /** Stop when this coverage percentage is reached */
  targetCoverage?: number;
  /** Callback for progress reporting (called after each step) */
  onStep?: (step: ProgressionStep) => void;
  /**
   * GPCs that must be taught in a specific order (prerequisites)
   * Map from GPC ID to array of required GPC IDs
   */
  prerequisites?: Map<string, string[]>;
  /**
   * GPCs that become available only after a certain step number.
   * Map from step number (1-based) to stage info (title + GPCs).
   * These are ADDITIVE to the initial `availableGpcs`.
   */
  stageGating?: Map<number, CurriculumStage>;
  /**
   * Callback when a new stage is unlocked
   */
  onStageUnlock?: (step: number, stage: CurriculumStage) => void;
}

/**
 * Result of decode-based coverage analysis
 */
export interface DecodeCoverageResult {
  /** Total words in corpus */
  totalWords: number;
  /** Total frequency in corpus */
  totalFrequency: number;
  /** Words that decode correctly */
  decodableWords: number;
  /** Frequency of correctly decoded words */
  decodableFrequency: number;
  /** Coverage percentage (by frequency) */
  coveragePercent: number;
  /** Words that failed to decode correctly */
  failedWords: WordWithPhonemes[];
}

/**
 * Compute coverage using decode logic (no pre-tagging required)
 *
 * This directly answers: "If a learner knows these GPCs, what percentage
 * of the corpus can they correctly decode?"
 *
 * @param candidateGpcs - The GPCs the learner knows
 * @param words - Words with their actual pronunciations
 * @param options - Configuration options
 */
export function computeDecodeCoverage(
  candidateGpcs: GPCEntry[],
  words: WordWithPhonemes[],
  options: DecodeCoverageOptions = {}
): DecodeCoverageResult {
  const { minFrequency = 0 } = options;

  // Build decode index from candidate GPCs
  const decodeIndex = buildCatalogueIndex(candidateGpcs);

  // Filter words by minimum frequency
  const filteredWords = words.filter((w) => w.frequency >= minFrequency);

  const totalWords = filteredWords.length;
  const totalFrequency = filteredWords.reduce((sum, w) => sum + w.frequency, 0);

  let decodableWords = 0;
  let decodableFrequency = 0;
  const failedWords: WordWithPhonemes[] = [];

  for (const wordEntry of filteredWords) {
    const isCorrect = canDecodeToPhonemes(wordEntry.word, wordEntry.phonemes, decodeIndex);

    if (isCorrect) {
      decodableWords++;
      decodableFrequency += wordEntry.frequency;
    } else {
      failedWords.push(wordEntry);
    }
  }

  return {
    totalWords,
    totalFrequency,
    decodableWords,
    decodableFrequency,
    coveragePercent: totalFrequency > 0 ? (decodableFrequency / totalFrequency) * 100 : 0,
    failedWords,
  };
}

/**
 * Result of decode-based optimal sequencing
 */
export interface DecodeSequenceResult {
  /** Ordered steps of GPC introduction */
  steps: ProgressionStep[];
  /** Final coverage statistics */
  finalCoverage: DecodeCoverageResult;
  /** GPCs not included in sequence */
  unusedGpcs: GPCEntry[];
  /** Total frequency of input corpus */
  totalCorpusFrequency: number;
}

/**
 * Compute optimal GPC teaching sequence using decode-based coverage
 *
 * At each step, selects the GPC that maximizes newly-decodable frequency.
 * This is more accurate than tag-based coverage because it doesn't depend
 * on alignment path choices.
 *
 * @param availableGpcs - The universe of GPCs that can be taught
 * @param words - Words with their actual pronunciations
 * @param options - Configuration options
 */
export function computeDecodeOptimalSequence(
  availableGpcs: GPCEntry[],
  words: WordWithPhonemes[],
  options: DecodeCoverageOptions = {}
): DecodeSequenceResult {
  const {
    minFrequency = 0,
    maxSteps = Infinity,
    initialKnown = [],
    targetCoverage = 100,
    onStep,
    onStageUnlock,
    prerequisites = new Map<string, string[]>(),
    stageGating = new Map(),
  } = options;

  // Filter words by minimum frequency
  const filteredWords = words.filter((w) => w.frequency >= minFrequency);
  const totalFrequency = filteredWords.reduce((sum, w) => sum + w.frequency, 0);

  // Track state
  const knownGpcs: GPCEntry[] = [...initialKnown];
  const knownGpcIds = new Set(knownGpcs.map(g => g.id));

  // Initialize remaining with "Stage 0" (initially available) items
  // Ensure we don't include items that are already known
  const remainingGpcs = new Set(availableGpcs.filter(
    (g) => !knownGpcIds.has(g.id)
  ));

  let uncoveredWords = [...filteredWords];
  let coveredFrequency = 0;

  const steps: ProgressionStep[] = [];

  // Compute initial coverage
  if (knownGpcs.length > 0) {
    const initialIndex = buildCatalogueIndex(knownGpcs);
    const initiallyDecodable: WordWithPhonemes[] = [];
    const stillUncovered: WordWithPhonemes[] = [];

    for (const wordEntry of uncoveredWords) {
      if (canDecodeToPhonemes(wordEntry.word, wordEntry.phonemes, initialIndex)) {
        coveredFrequency += wordEntry.frequency;
        initiallyDecodable.push(wordEntry);
      } else {
        stillUncovered.push(wordEntry);
      }
    }
    uncoveredWords = stillUncovered;

    // Add step 0 for initial GPCs
    const sortedInitial = [...initiallyDecodable].sort((a, b) => b.frequency - a.frequency);
    const step0: ProgressionStep = {
      step: 0,
      gpcId: `(initial: ${knownGpcs.length} GPCs)`,
      grapheme: '',
      phoneme: '',
      newWords: sortedInitial.slice(0, 10).map((w) => w.word),
      newWordCount: initiallyDecodable.length,
      addedFrequency: coveredFrequency,
      cumulativeFrequency: coveredFrequency,
      coveragePercent: (coveredFrequency / totalFrequency) * 100,
    };
    steps.push(step0);
    onStep?.(step0);
  }

  let stepNum = 0;

  // Greedy optimization loop
  while (
    (remainingGpcs.size > 0 || stageGating.size > 0) && // Continue if gating has items pending
    stepNum < maxSteps &&
    (coveredFrequency / totalFrequency) * 100 < targetCoverage
  ) {
    // Check for Stage Gating unlocks
    // We are about to compute stepNum + 1
    const nextStep = stepNum + 1;
    const stage = stageGating.get(nextStep);
    if (stage) {
      for (const gpc of stage.gpcs) {
        if (!knownGpcIds.has(gpc.id)) {
           remainingGpcs.add(gpc);
        }
      }
      // Notify caller of stage unlock
      onStageUnlock?.(nextStep, stage);
      // Remove from map so we know when it's empty
      stageGating.delete(nextStep);
    }

    // Safety check: if remaining is empty (and we just cleared gating or it's empty), break
    // BUT: We might have future gates.
    // If remaining is empty but we have future gates, we should essentially "fast forward"
    // or stop? Usually stop, unless the user explicitly wants to wait.
    // For now, if remaining is empty, we stop, assuming gap in curriculum is not intended.
    if (remainingGpcs.size === 0) {
        // Edge case: check if there are future gates we might want to wait for?
        // Simplest behavior: Stop. The user responsible for ensuring continuity.
        break;
    }

    // Find the GPC that provides maximum marginal gain
    let bestGpc: GPCEntry | null = null;
    let bestGain = 0;
    let bestNewlyDecodable: WordWithPhonemes[] = [];

    for (const candidateGpc of remainingGpcs) {
      // Check prerequisites
      const reqs = prerequisites.get(candidateGpc.id) ?? [];
      const prereqsMet = reqs.every(reqId => knownGpcIds.has(reqId));
      if (!prereqsMet) continue;

      // Build temporary index with candidate
      const testGpcs = [...knownGpcs, candidateGpc];
      const testIndex = buildCatalogueIndex(testGpcs);

      const newlyDecodable: WordWithPhonemes[] = [];
      let addedFrequency = 0;

      // OPTIMIZATION: Only check words that COULD contain this GPC
      // A word only becomes decodable by adding this GPC if it contains both
      // the grapheme and the phoneme(s).
      const gpcPhonemes = candidateGpc.phoneme.split(' ').filter(p => p);
      const candidateWords = uncoveredWords.filter(w => {
        // Check all phonemes in the GPC are present in the word
        const hasPhonemes = gpcPhonemes.every(p => (w.phonemes as readonly string[]).includes(p));
        // Split digraphs use notation like 'a_e' which won't match literal word text
        if (candidateGpc.matchType === 'split_digraph') {
          return hasPhonemes;
        }
        return w.word.includes(candidateGpc.grapheme) && hasPhonemes;
      });

      // Check which of these candidate words become decodable
      for (const wordEntry of candidateWords) {
        if (canDecodeToPhonemes(wordEntry.word, wordEntry.phonemes, testIndex)) {
          newlyDecodable.push(wordEntry);
          addedFrequency += wordEntry.frequency;
        }
      }

      if (addedFrequency > bestGain) {
        bestGain = addedFrequency;
        bestGpc = candidateGpc;
        bestNewlyDecodable = newlyDecodable;
      }
    }

    if (!bestGpc) {
      // No more GPCs provide value - try fallback
      // Pick a GPC that appears in the most uncovered words (for future progress)
      break;
    }

    // "Teach" this GPC
    knownGpcs.push(bestGpc);
    knownGpcIds.add(bestGpc.id);
    remainingGpcs.delete(bestGpc);

    // Update uncovered words
    const newlyDecodableWords = new Set(bestNewlyDecodable.map(w => w.word));
    uncoveredWords = uncoveredWords.filter(w => !newlyDecodableWords.has(w.word));
    coveredFrequency += bestGain;

    // Record the step
    stepNum++;
    const sortedNew = [...bestNewlyDecodable].sort((a, b) => b.frequency - a.frequency);

    const stepRecord: ProgressionStep = {
      step: stepNum,
      gpcId: bestGpc.id,
      grapheme: bestGpc.grapheme,
      phoneme: bestGpc.phoneme,
      newWords: sortedNew.slice(0, 10).map((w) => w.word),
      newWordCount: bestNewlyDecodable.length,
      addedFrequency: bestGain,
      cumulativeFrequency: coveredFrequency,
      coveragePercent: (coveredFrequency / totalFrequency) * 100,
    };
    steps.push(stepRecord);
    onStep?.(stepRecord);
  }

  // Build final coverage result
  const finalCoverage = computeDecodeCoverage(knownGpcs, filteredWords);

  return {
    steps,
    finalCoverage,
    unusedGpcs: [...remainingGpcs],
    totalCorpusFrequency: totalFrequency,
  };
}

/**
 * Format decode sequence report as text
 */
export function formatDecodeSequenceReport(result: DecodeSequenceResult): string {
  const lines: string[] = [];

  lines.push('DECODE-BASED GPC COVERAGE REPORT');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Total corpus frequency: ${result.totalCorpusFrequency.toLocaleString()}`);
  lines.push(`Final coverage: ${result.finalCoverage.coveragePercent.toFixed(1)}%`);
  lines.push(`Words decodable: ${result.finalCoverage.decodableWords}`);
  lines.push(`Unused GPCs: ${result.unusedGpcs.length}`);
  lines.push('');
  lines.push('Step  GPC              Added Freq    Coverage%  Sample Words');
  lines.push('-'.repeat(70));

  for (const step of result.steps.slice(0, 50)) {
    const gpcPad = step.gpcId.slice(0, 20).padEnd(20);
    const freqPad = step.addedFrequency.toLocaleString().padStart(12);
    const covPad = step.coveragePercent.toFixed(1).padStart(8);
    const samples = step.newWords.slice(0, 3).join(', ');

    lines.push(
      `${step.step.toString().padStart(4)}  ${gpcPad} ${freqPad}  ${covPad}%  ${samples}`
    );
  }

  if (result.steps.length > 50) {
    lines.push(`... and ${result.steps.length - 50} more steps`);
  }

  return lines.join('\n');
}
