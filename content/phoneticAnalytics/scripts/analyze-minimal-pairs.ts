/**
 * Analyze Minimal Pairs (GPC-Level)
 * ==================================
 *
 * Analyzes the GPC-level minimal pair structure of the teaching corpus.
 *
 * IMPORTANT: This uses GPC-level comparison, not phoneme-level.
 * Two words are GPC minimal pairs if they have the same GPC structure
 * except for exactly one GPC position.
 *
 * Example of GPC minimal pair: cat [c-K, a-AE, t-T] ↔ bat [b-B, a-AE, t-T]
 * NOT a GPC minimal pair: you [GPC-WORD-you] ↔ to [GPC-WORD-to] (different structure)
 *
 * OUTPUTS:
 * - Console report with statistics
 * - outputs-v2/gpc-minimal-pairs.json (serialized index)
 * - outputs-v2/gpc-minimal-pair-stats.json (statistics)
 *
 * USAGE:
 *   npx tsx scripts/analyze-minimal-pairs.ts
 *   yarn analyze:pairs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  // GPC-level (recommended)
  buildGpcMinimalPairIndex,
  findGpcMinimalPairClusters,
  getGpcMinimalPairStats,
  exportGpcMinimalPairIndex,
  type WordWithGpcs,
  type GpcMinimalPairIndex,
  // Legacy phoneme-level (for comparison)
  buildMinimalPairIndex,
  getMinimalPairStats,
  type WordWithPhonemes,
} from "../lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS = resolve(__dirname, "..", "outputs-v2");

// =============================================================================
// Main
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

function main() {
  console.log("=".repeat(60));
  console.log("GPC-LEVEL MINIMAL PAIRS ANALYSIS");
  console.log("=".repeat(60));
  console.log();

  // Load teaching words
  console.log("Loading teaching words...");
  const teachingData = JSON.parse(
    readFileSync(resolve(OUTPUTS, "teaching-words.json"), "utf-8"),
  );
  const teachingWords: TeachingWord[] = teachingData.words;

  console.log(`Loaded ${teachingWords.length} teaching words`);
  console.log();

  // Convert to WordWithGpcs format
  const wordsWithGpcs: WordWithGpcs[] = teachingWords.map((w) => ({
    word: w.word,
    phonemes: w.phonemes as any,
    gpcs: w.gpcs,
    frequency: w.frequency,
  }));

  // Also convert to WordWithPhonemes for comparison
  const wordsWithPhonemes: WordWithPhonemes[] = teachingWords.map((w) => ({
    word: w.word,
    phonemes: w.phonemes as any,
    frequency: w.frequency,
    gpcs: w.gpcs,
  }));

  // Build GPC-level minimal pair index
  console.log("Building GPC-level minimal pair index...");
  console.log("  (excluding whole-word GPCs like 'you', 'the', 'to')");
  const startTime = Date.now();
  const gpcIndex = buildGpcMinimalPairIndex(wordsWithGpcs, {
    excludeWholeWordGpcs: true,
    minFrequency: 0,
  });
  const buildTime = Date.now() - startTime;
  console.log(`Built index in ${buildTime}ms`);
  console.log();

  // Build phoneme-level index for comparison
  console.log("Building phoneme-level index for comparison...");
  const phonemeIndex = buildMinimalPairIndex(wordsWithPhonemes);
  const phonemeStats = getMinimalPairStats(phonemeIndex);

  // Get GPC statistics
  const gpcStats = getGpcMinimalPairStats(gpcIndex);

  console.log();
  console.log("=".repeat(60));
  console.log("COMPARISON: GPC vs PHONEME LEVEL");
  console.log("=".repeat(60));
  console.log();
  console.log("                              GPC-Level    Phoneme-Level");
  console.log("-".repeat(60));
  console.log(
    `Total words:              ${gpcStats.totalWords.toLocaleString().padStart(10)}    ${phonemeStats.totalWords.toLocaleString().padStart(10)}`,
  );
  console.log(
    `Words with pairs:         ${gpcStats.wordsWithPairs.toLocaleString().padStart(10)}    ${phonemeStats.wordsWithPairs.toLocaleString().padStart(10)}`,
  );
  console.log(
    `Total pair relations:     ${gpcStats.totalPairs.toLocaleString().padStart(10)}    ${phonemeStats.totalPairs.toLocaleString().padStart(10)}`,
  );
  console.log(
    `Avg pairs per word:       ${gpcStats.avgPairsPerWord.toFixed(2).padStart(10)}    ${phonemeStats.avgPairsPerWord.toFixed(2).padStart(10)}`,
  );
  console.log();
  console.log("Note: GPC-level has fewer words because whole-word GPCs");
  console.log("(sight words like 'you', 'the', 'to') are excluded.");
  console.log();

  console.log("=".repeat(60));
  console.log("GPC-LEVEL STATISTICS (DETAILED)");
  console.log("=".repeat(60));
  console.log();

  console.log("By contrast position:");
  for (const [position, count] of Object.entries(gpcStats.byPosition)) {
    if (count > 0) {
      console.log(`  ${position.padEnd(15)} ${count.toLocaleString()}`);
    }
  }
  console.log();

  console.log("Most connected words (most GPC minimal pairs):");
  for (const { word, pairCount } of gpcStats.mostConnected) {
    console.log(`  ${word.padEnd(15)} ${pairCount} pairs`);
  }
  console.log();

  // Find clusters
  console.log("=".repeat(60));
  console.log("GPC MINIMAL PAIR CLUSTERS");
  console.log("=".repeat(60));
  console.log();

  const clusters = findGpcMinimalPairClusters(gpcIndex, 4);
  console.log(`Found ${clusters.length} clusters of size 4+`);
  console.log();

  // Show top 20 largest clusters
  const sortedClusters = clusters.sort((a, b) => b.length - a.length);
  console.log("Top 20 largest clusters:");
  for (let i = 0; i < Math.min(20, sortedClusters.length); i++) {
    const cluster = sortedClusters[i];
    console.log(
      `  ${i + 1}. [${cluster.length}] ${cluster.slice(0, 10).join(", ")}${cluster.length > 10 ? "..." : ""}`,
    );
  }
  console.log();

  // Show examples by contrast type
  console.log("=".repeat(60));
  console.log("EXAMPLES BY CONTRAST TYPE (GPC-Level)");
  console.log("=".repeat(60));
  console.log();

  showGpcExamplesForPosition(gpcIndex, wordsWithGpcs, "onset", 10);
  showGpcExamplesForPosition(gpcIndex, wordsWithGpcs, "nucleus", 10);
  showGpcExamplesForPosition(gpcIndex, wordsWithGpcs, "coda", 10);

  // High-frequency pairs
  console.log("=".repeat(60));
  console.log("HIGH-FREQUENCY GPC MINIMAL PAIRS");
  console.log("=".repeat(60));
  console.log();

  const freqMap = new Map(wordsWithGpcs.map((w) => [w.word, w.frequency ?? 0]));
  const highFreqPairs = findHighFrequencyGpcPairs(gpcIndex, freqMap, 30);

  console.log("Top 30 GPC minimal pairs by combined frequency:");
  for (let i = 0; i < highFreqPairs.length; i++) {
    const { wordA, wordB, freqA, freqB, position, gpcA, gpcB } =
      highFreqPairs[i];
    const combined = freqA + freqB;
    console.log(
      `  ${(i + 1).toString().padStart(2)}. ${wordA.padEnd(10)} ↔ ${wordB.padEnd(10)} [${position}] ${gpcA} vs ${gpcB}  freq=${combined.toLocaleString()}`,
    );
  }
  console.log();

  // GPC-specific pairs (for curriculum design)
  console.log("=".repeat(60));
  console.log("GPC-SPECIFIC PAIRS (VOWEL CONTRASTS)");
  console.log("=".repeat(60));
  console.log();

  const vowelPairs = [
    { a: "AE", b: "IH", name: "a/i (short)" },
    { a: "AE", b: "EH", name: "a/e (short)" },
    { a: "AE", b: "AH", name: "a/u (short)" },
    { a: "IH", b: "EH", name: "i/e (short)" },
    { a: "AA", b: "AH", name: "o/u (short)" },
    { a: "AE", b: "EY", name: "short-a/long-a" },
    { a: "IH", b: "AY", name: "short-i/long-i" },
    { a: "AA", b: "OW", name: "short-o/long-o" },
  ];

  for (const { a, b, name } of vowelPairs) {
    const examples = findGpcPairsByPhonemeContrast(
      gpcIndex,
      wordsWithGpcs,
      a,
      b,
      5,
    );
    if (examples.length > 0) {
      console.log(`${name} (${a}/${b}):`);
      for (const ex of examples) {
        console.log(
          `  ${ex.wordA.padEnd(10)} ↔ ${ex.wordB.padEnd(10)} (${ex.gpcA} vs ${ex.gpcB})`,
        );
      }
      console.log();
    }
  }

  // Consonant contrast examples
  console.log("=".repeat(60));
  console.log("GPC-SPECIFIC PAIRS (CONSONANT CONTRASTS)");
  console.log("=".repeat(60));
  console.log();

  const consonantPairs = [
    { a: "B", b: "P", name: "b/p (voiced/voiceless)" },
    { a: "D", b: "T", name: "d/t (voiced/voiceless)" },
    { a: "G", b: "K", name: "g/k (voiced/voiceless)" },
    { a: "S", b: "Z", name: "s/z (voiced/voiceless)" },
    { a: "M", b: "N", name: "m/n (nasals)" },
    { a: "B", b: "D", name: "b/d (common confusion)" },
  ];

  for (const { a, b, name } of consonantPairs) {
    const examples = findGpcPairsByPhonemeContrast(
      gpcIndex,
      wordsWithGpcs,
      a,
      b,
      5,
    );
    if (examples.length > 0) {
      console.log(`${name} (${a}/${b}):`);
      for (const ex of examples) {
        console.log(
          `  ${ex.wordA.padEnd(10)} ↔ ${ex.wordB.padEnd(10)} (${ex.gpcA} vs ${ex.gpcB})`,
        );
      }
      console.log();
    }
  }

  // Save outputs
  console.log("=".repeat(60));
  console.log("SAVING OUTPUTS");
  console.log("=".repeat(60));
  console.log();

  // Save full GPC index
  const indexData = exportGpcMinimalPairIndex(gpcIndex);
  writeFileSync(
    resolve(OUTPUTS, "gpc-minimal-pairs.json"),
    JSON.stringify(indexData, null, 2),
  );
  console.log("  → gpc-minimal-pairs.json");

  // Save statistics
  const statsOutput = {
    meta: {
      generatedAt: new Date().toISOString(),
      buildTimeMs: buildTime,
      description: "GPC-level minimal pairs (excludes whole-word GPCs)",
    },
    comparison: {
      gpcLevel: {
        totalWords: gpcStats.totalWords,
        wordsWithPairs: gpcStats.wordsWithPairs,
        totalPairs: gpcStats.totalPairs,
        avgPairsPerWord: gpcStats.avgPairsPerWord,
      },
      phonemeLevel: {
        totalWords: phonemeStats.totalWords,
        wordsWithPairs: phonemeStats.wordsWithPairs,
        totalPairs: phonemeStats.totalPairs,
        avgPairsPerWord: phonemeStats.avgPairsPerWord,
      },
    },
    stats: gpcStats,
    clusters: {
      total: clusters.length,
      largest: sortedClusters.slice(0, 50),
    },
    highFrequencyPairs: highFreqPairs,
  };
  writeFileSync(
    resolve(OUTPUTS, "gpc-minimal-pair-stats.json"),
    JSON.stringify(statsOutput, null, 2),
  );
  console.log("  → gpc-minimal-pair-stats.json");

  console.log();
  console.log("Done!");
}

// =============================================================================
// Helper Functions
// =============================================================================

function showGpcExamplesForPosition(
  index: GpcMinimalPairIndex,
  words: WordWithGpcs[],
  position: string,
  count: number,
): void {
  console.log(`${position.toUpperCase()} contrasts (first ${count}):`);

  const seen = new Set<string>();
  let shown = 0;

  for (const word of words) {
    if (shown >= count) break;

    const pairs = index.get(word.word) ?? [];
    for (const pair of pairs) {
      if (pair.position === position) {
        const key = [word.word, pair.partner].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          console.log(
            `  ${word.word.padEnd(10)} ↔ ${pair.partner.padEnd(10)} (${pair.graphemeA} vs ${pair.graphemeB}) [${pair.gpcA} vs ${pair.gpcB}]`,
          );
          shown++;
          break;
        }
      }
    }
  }
  console.log();
}

interface HighFreqGpcPair {
  wordA: string;
  wordB: string;
  freqA: number;
  freqB: number;
  position: string;
  gpcA: string;
  gpcB: string;
  graphemeA: string;
  graphemeB: string;
}

function findHighFrequencyGpcPairs(
  index: GpcMinimalPairIndex,
  frequencies: Map<string, number>,
  limit: number,
): HighFreqGpcPair[] {
  const pairs: HighFreqGpcPair[] = [];
  const seen = new Set<string>();

  for (const [word, pairInfos] of index) {
    const freqA = frequencies.get(word) ?? 0;

    for (const pair of pairInfos) {
      const key = [word, pair.partner].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      const freqB = frequencies.get(pair.partner) ?? 0;
      pairs.push({
        wordA: word,
        wordB: pair.partner,
        freqA,
        freqB,
        position: pair.position,
        gpcA: pair.gpcA,
        gpcB: pair.gpcB,
        graphemeA: pair.graphemeA,
        graphemeB: pair.graphemeB,
      });
    }
  }

  // Sort by combined frequency
  pairs.sort((a, b) => b.freqA + b.freqB - (a.freqA + a.freqB));

  return pairs.slice(0, limit);
}

interface GpcContrastExample {
  wordA: string;
  wordB: string;
  gpcA: string;
  gpcB: string;
}

function findGpcPairsByPhonemeContrast(
  index: GpcMinimalPairIndex,
  words: WordWithGpcs[],
  phonemeA: string,
  phonemeB: string,
  limit: number,
): GpcContrastExample[] {
  const examples: GpcContrastExample[] = [];
  const seen = new Set<string>();

  for (const [word, pairs] of index) {
    if (examples.length >= limit) break;

    for (const pair of pairs) {
      // Check if this pair contrasts the specified phonemes
      if (
        (pair.phonemeA === phonemeA && pair.phonemeB === phonemeB) ||
        (pair.phonemeA === phonemeB && pair.phonemeB === phonemeA)
      ) {
        const key = [word, pair.partner].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          examples.push({
            wordA: word,
            wordB: pair.partner,
            gpcA: pair.gpcA,
            gpcB: pair.gpcB,
          });
          break;
        }
      }
    }
  }

  return examples;
}

main();
