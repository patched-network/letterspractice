/**
 * GPC Sequencer (V2)
 * ==================
 *
 * AIM
 * ---
 * Determine the optimal order for teaching GPCs to maximize decodable coverage
 * as quickly as possible. Answer: "If I can only teach N GPCs, which N should
 * they be to unlock the most high-frequency words?"
 *
 * This is the "Strategist" — it produces the curriculum roadmap.
 *
 * METHOD
 * ------
 * Greedy Set-Cover Algorithm:
 * 1. Start with no GPCs known, 0% coverage
 * 2. At each step, find the GPC that unlocks the most NEW frequency-weighted words
 *    - A word is "unlocked" when ALL its GPCs are known (binary decodability)
 * 3. Add that GPC, record the marginal gain, repeat until diminishing returns
 *
 * INPUTS
 * ------
 * - outputs-v2/corpus-words.json — All aligned words (full utility measurement).
 * - config/gpc-catalogue.json — GPC definitions
 *
 * OUTPUTS (to outputs-v2/)
 * ------------------------
 * - gpc-sequence.json    — Ordered list: step, GPC, marginal gain, cumulative coverage
 *
 * USAGE
 * -----
 *   npx tsx scripts/calculate-gpc-sequence.ts
 *   yarn sequence
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Library imports
import {
  findCoveragePlateau,
  buildGpcId,
} from '../lib';
import {
  SIMPLE_GPCS,
  GPC_CATALOGUE,
  type GPCEntry,
  // Stage 1: Foundation
  CONSONANTS_SIMPLE,      // b, c, d, f, g... basic 1:1 consonants
  VOWELS_SHORT,           // a, e, i, o, u short sounds
  // Stage 2: Common patterns
  DIGRAPHS,               // th, sh, ch, wh, ck, ng... consonant teams
  VOWELS_LONG_SPLIT,      // a_e, i_e, o_e... magic-e patterns
  VOWELS_FINAL_OPEN,      // final y→/ee/, final e→/ee/, etc.
  // Stage 3: Vowel complexity
  VOWELS_TEAMS,           // ai, ay, ee, ea, oa, ow, ou, oi, oy...
  VOWELS_R_CONTROLLED,    // ar, er, ir, or, ur... bossy-r
  VOWELS_L_CONTROLLED,    // all, alk, old, ild... l-influenced vowels
  // Stage 4: Advanced consonants
  CONSONANTS_SOFT,        // c→/s/ before e/i, g→/j/ before e/i
  DOUBLED_CONSONANTS,     // ff, ll, ss, zz
  TRIGRAPHS,              // tch, dge...
  SILENT_PATTERNS,        // kn, wr, gn, mb...
  LATINATE_DIGRAPHS,      // ph, ch→/k/, etc.
  // Stage 5: Advanced patterns
  VOWELS_DIPHTHONG_EXTENDED, // ough, augh, eigh...
  SYLLABIC_CONSONANTS,    // -le, -el, -en... unstressed syllables
  // Sight words
  SIGHT_WORDS,            // the, to, of, one, two... irregular high-freq words
} from '../lib/catalogue';
import {
  computeDecodeOptimalSequence,
  type WordWithPhonemes,
  type DecodeCoverageOptions,
  type CurriculumStage,
} from '../lib/coverage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = resolve(__dirname, '..', 'src-data');
const CONFIG_DIR = resolve(__dirname, '..', 'config');
const OUTPUTS = resolve(__dirname, '..', 'outputs-v2');

// Helper
const round2 = (n: number) => Math.round(n * 100) / 100;

// ============================================================================
// CONFIGURATION: INSERTION POINT
// ============================================================================

// Add GPCs here to assume they are already known before sequencing starts.
// The sequencer will maximize coverage *given* these are already taught.
// Helper to find a GPC by id from the catalogue
const findGpc = (id: string): GPCEntry => {
  const gpc = GPC_CATALOGUE.find(g => g.id === id);
  if (!gpc) throw new Error(`GPC not found: ${id}`);
  return gpc;
};

// ============================================================================
// Main
// ============================================================================

interface AnalyzedWord {
  word: string;
  phonemes: string[];
  frequency: number;
  gpcs: string[];
  pattern: string;
  issues: string[];
  fullyAligned: boolean;
}

const SHORT_VOWELS = [
  'GPC-a-AE', 'GPC-e-EH', 'GPC-i-IH', 'GPC-o-AA', 'GPC-u-AH'
];
const MAGIC_E_GPCS = [
  'GPC-a_e-EY', 'GPC-e_e-IY', 'GPC-i_e-AY', 'GPC-o_e-OW', 'GPC-u_e-UW'
];
const prereqs = new Map<string, string[]>();
for (const magicE of MAGIC_E_GPCS) {
    // "To learn a_e, you must first know ALL short vowels"
    prereqs.set(magicE, SHORT_VOWELS);
}

prereqs.set(
  findGpc('GPC-WORD-you').id, ['GPC-y-Y']
)

function main() {
  console.log('Loading data...');


  // Load corpus words
  const corpusData = JSON.parse(readFileSync(resolve(OUTPUTS, 'corpus-words.json'), 'utf-8'));
  const rawWords: AnalyzedWord[] = corpusData.words;

  // Map to WordWithPhonemes structure (decode-based coverage uses phonemes, not pre-tagged GPCs)
  // We use ALL words with phonemes, not just "fully aligned" ones - decode will determine coverage
  const words: WordWithPhonemes[] = rawWords
    .map(w => ({
      word: w.word,
      phonemes: w.phonemes as any,
      frequency: w.frequency,
    }));

  console.log(`Loaded ${rawWords.length} words from corpus.`);
  console.log(`Using decode-based coverage (no pre-tagging required).\n`);

  const INITIAL_KNOWN_GPCS: GPCEntry[] = [
    // // Example: `if`, `it`, `is`, `in` sequence
    findGpc(buildGpcId('s', 'S')),
    findGpc(buildGpcId('n', 'N')),
    findGpc(buildGpcId('i', 'IH')),
    findGpc(buildGpcId('t', 'T')),
    // findGpc(buildGpcId('f', 'F')),
  ];

  // ============================================================================
  // CURRICULUM STAGES
  // ============================================================================
  // Each stage introduces a new "idea" about how letters work in words.
  // The greedy optimizer picks the best GPC from the available pool at each step,
  // but new categories only become available at designated stages.
  //
  // Pedagogical principle: one new *concept* at a time, but mixed *facts* within.
  // Stages are preceded by implicit exposure (e.g., 'wing-sing-thing' before ng).

  const stages = new Map<number, CurriculumStage>([
    // STAGE 1: Foundation (steps 1-10)
    // Idea: "Letters make sounds" - basic 1:1 correspondences
    [1, { title: 'Simple Consonants', gpcs: CONSONANTS_SIMPLE }],
    [4, { title: 'Short Vowels', gpcs: VOWELS_SHORT }],

    // STAGE 2: Consonant Teams (steps 10-20)
    // Idea: "Two letters can work together to make one sound"
    [10, { title: 'Consonant Digraphs', gpcs: DIGRAPHS }],

    // STAGE 2b: Sight Words (step 15)
    // Idea: "Some words we learn to recognize by sight"
    // Introduced after basic phonetic patterns, to pepper in high-frequency irregulars
    [15, { title: 'Sight Words', gpcs: SIGHT_WORDS }],

    // STAGE 3: Long Vowels (steps 20-35)
    // Idea: "Vowels have two sounds - the 'magic e' makes them say their name"
    [20, { title: 'Magic-E (Split Digraphs)', gpcs: VOWELS_LONG_SPLIT }],
    [25, { title: 'Final Open Vowels', gpcs: VOWELS_FINAL_OPEN }],

    // STAGE 4: Vowel Teams (steps 35-50)
    // Idea: "Two vowels can work together too"
    [35, { title: 'Vowel Teams', gpcs: VOWELS_TEAMS }],

    // STAGE 5: R-Controlled & L-Controlled (steps 50-65)
    // Idea: "R and L are 'bossy' - they change the vowel sound"
    [50, { title: 'R-Controlled Vowels', gpcs: VOWELS_R_CONTROLLED }],
    [55, { title: 'L-Controlled Vowels', gpcs: VOWELS_L_CONTROLLED }],

    // STAGE 6: Soft Consonants (steps 65-75)
    // Idea: "C and G have two sounds - soft before e/i/y"
    [65, { title: 'Soft C and G', gpcs: CONSONANTS_SOFT }],

    // STAGE 7: Double Letters & Silent Patterns (steps 75-90)
    // Idea: "Some letters are doubled; some letters are silent"
    [75, { title: 'Doubled Consonants', gpcs: DOUBLED_CONSONANTS }],
    [80, { title: 'Silent Letter Patterns', gpcs: SILENT_PATTERNS }],
    [85, { title: 'Trigraphs', gpcs: TRIGRAPHS }],

    // STAGE 8: Latin/Greek Patterns (steps 90-100)
    // Idea: "English borrowed words from other languages"
    [90, { title: 'Latin/Greek Digraphs', gpcs: LATINATE_DIGRAPHS }],

    // STAGE 9: Advanced Patterns (steps 100+)
    // Idea: "Some patterns are tricky and need memorization"
    [100, { title: 'Extended Diphthongs (ough, augh)', gpcs: VOWELS_DIPHTHONG_EXTENDED }],
    [110, { title: 'Syllabic Consonants (-le, -el)', gpcs: SYLLABIC_CONSONANTS }],
  ])



  if (INITIAL_KNOWN_GPCS.length > 0) {
    console.log(`Initial known GPCs (${INITIAL_KNOWN_GPCS.length}):`);
    console.log(INITIAL_KNOWN_GPCS.map(g => g.id).join(', '));
    console.log();
  }

  // Compute pure greedy sequence using decode-based coverage
  console.log('Computing greedy sequence (decode-based)...\n');
  console.log('Step  GPC                  Added Freq  Words  Coverage%  Sample Words');
  console.log('-'.repeat(85));

  const startTime = Date.now();

  const options: DecodeCoverageOptions = {
    minFrequency: 0,
    maxSteps: 200,
    targetCoverage: 99.9,
    initialKnown: INITIAL_KNOWN_GPCS,
    onStep: (step) => {
      // Print each step as it's computed
      const gpcPad = step.gpcId.slice(0, 20).padEnd(20);
      const freqPad = step.addedFrequency.toLocaleString().padStart(12);
      const wordsPad = step.newWordCount.toString().padStart(5);
      const covPad = step.coveragePercent.toFixed(1).padStart(8);
      const samples = step.newWords.slice(0, 3).join(', ');
      console.log(
        `${step.step.toString().padStart(4)}  ${gpcPad} ${freqPad}  ${wordsPad}  ${covPad}%  ${samples}`
      );
    },
    onStageUnlock: (step, stage) => {
      console.log();
      console.log(`>>> Step ${step}: Unlocking "${stage.title}" (${stage.gpcs.length} GPCs)`);
      console.log();
    },
    prerequisites: prereqs,
    stageGating: stages
  };


  const sequence = computeDecodeOptimalSequence([], words, options);

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  console.log();
  console.log(`Final coverage: ${sequence.finalCoverage.coveragePercent.toFixed(1)}%`);
  console.log(`Words decodable: ${sequence.finalCoverage.decodableWords}`);
  console.log(`Unused GPCs: ${sequence.unusedGpcs.length}`);
  if (sequence.unusedGpcs.length > 0) {
    console.log('  ' + sequence.unusedGpcs.map(g => g.id).join(', '));
  }
  console.log();

  // Find plateau (cast to any since DecodeSequenceResult has same steps structure)
  const plateau = findCoveragePlateau(sequence as any, 0.5);
  if (plateau !== null) {
    console.log(`\nCoverage plateau detected at step ${plateau}`);
    console.log(`  Coverage at plateau: ${round2(sequence.steps[plateau - 1].coveragePercent)}%`);
  }

  // Category-based sequencing example
  console.log('\n' + '='.repeat(60));
  console.log('CATEGORY BREAKDOWN');
  console.log('='.repeat(60));

  // Group sequence steps by GPC category
  const categoryStats = new Map<string, { count: number; totalFreq: number; firstStep: number }>();

  for (const step of sequence.steps) {
    // Extract category from GPC (rough heuristic)
    let category = 'other';
    const gpcId = step.gpcId;

    if (gpcId.includes('_e-') && !gpcId.includes('_final')) {
      category = 'split_digraphs';
    } else if (gpcId.includes('_final')) {
      category = 'final_patterns';
    } else if (['AE', 'EH', 'IH', 'AH', 'UH'].some(v => gpcId.endsWith(`-${v}`))) {
      category = 'short_vowels';
    } else if (['EY', 'IY', 'AY', 'OW', 'UW'].some(v => gpcId.endsWith(`-${v}`))) {
      category = 'long_vowels';
    } else if (['AA', 'AO', 'ER', 'AW', 'OY'].some(v => gpcId.endsWith(`-${v}`))) {
      category = 'other_vowels';
    } else if (step.grapheme.length === 1) {
      category = 'single_consonants';
    } else if (step.grapheme.length >= 2) {
      category = 'consonant_digraphs';
    }

    if (!categoryStats.has(category)) {
      categoryStats.set(category, { count: 0, totalFreq: 0, firstStep: step.step });
    }
    const stats = categoryStats.get(category)!;
    stats.count++;
    stats.totalFreq += step.addedFrequency;
  }

  console.log();
  for (const [cat, stats] of categoryStats) {
    console.log(
      `  ${cat.padEnd(20)} ${stats.count.toString().padStart(3)} GPCs  ${stats.totalFreq.toLocaleString().padStart(12)} freq  first at step ${stats.firstStep}`
    );
  }

  // Top uncovered words
  console.log('\n' + '='.repeat(60));
  console.log('TOP 50 UNCOVERED WORDS (by frequency)');
  console.log('='.repeat(60));

  const uncoveredWords = sequence.finalCoverage.failedWords
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 50);

  console.log();
  console.log('Rank  Word                Frequency');
  console.log('-'.repeat(45));
  for (let i = 0; i < uncoveredWords.length; i++) {
    const w = uncoveredWords[i];
    console.log(
      `${(i + 1).toString().padStart(4)}  ${w.word.padEnd(18)} ${w.frequency.toLocaleString().padStart(12)}`
    );
  }

  // Running time
  console.log('\n' + '='.repeat(60));
  console.log(`Running time: ${elapsedSec}s`);
  console.log('='.repeat(60));

  // Save outputs
  console.log('\n' + '='.repeat(60));
  console.log('SAVING OUTPUTS');
  console.log('='.repeat(60));

  // Convert to the format expected by other scripts
  const outputSequence = {
    sequence: sequence.steps.map(s => ({
      step: s.step,
      gpcId: s.gpcId,
      marginalGain: s.newWords.length,
      marginalFrequency: s.addedFrequency,
      cumulativeGpcs: s.step + INITIAL_KNOWN_GPCS.length,
      cumulativeWords: 0, // Would need to track
      cumulativeFrequency: s.cumulativeFrequency,
      coveragePercent: round2(s.coveragePercent),
    })),
    initialKnown: INITIAL_KNOWN_GPCS.map(g => g.id),
    totalWords: words.length,
    totalFrequency: sequence.totalCorpusFrequency,
    finalCoverage: round2(sequence.finalCoverage.coveragePercent),
    meta: {
      generatedBy: 'calculate-gpc-sequence.ts (decode-based)',
      generatedAt: new Date().toISOString(),
      options: {
        minFrequency: options.minFrequency,
        maxSteps: options.maxSteps,
        targetCoverage: options.targetCoverage,
        initialKnownCount: INITIAL_KNOWN_GPCS.length
      },
      plateau: plateau,
      unusedGpcs: sequence.unusedGpcs.length,
    }
  };

  writeFileSync(
    resolve(OUTPUTS, 'gpc-sequence.json'),
    JSON.stringify(outputSequence, null, 2)
  );
  console.log('  → gpc-sequence.json');

  console.log('\nDone!');
}

main();
