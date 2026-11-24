/**
 * Parse Corpus with GPCs
 * ======================
 *
 * AIM
 * ---
 * 1. Build a **Teaching Corpus** of fully-decodable monosyllables.
 * 2. Build an **Irregular Corpus** of monosyllables with some irregularities.
 * 3. Build a **Full Corpus** list of all analyzed words.
 * 4. Measure **GPC Utility** (Supply-side) by counting ALL valid GPC usages.
 *
 * OUTPUTS (to outputs-v2/)
 * ------------------------
 * - teaching-words.json:  Fully aligned monosyllables.
 * - irregular-words.json: Partially aligned monosyllables.
 * - corpus-words.json:    All analyzed words (mono + poly).
 * - gpc-usage.json:       Aggregated GPC statistics.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Library imports
import {
  alignWord,
  stripStress,
  isMonosyllabic,
  type AlignmentResult,
  type AlignmentSegment,
  loadCmudict,
  loadSubtlex,
  DEFAULT_CMUDICT_PATH,
  DEFAULT_SUBTLEX_PATH
} from '../lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = resolve(__dirname, '..', 'src-data');
const OUTPUTS = resolve(__dirname, '..', 'outputs-v2');

// Helper for consistent rounding
const round2 = (n: number) => Math.round(n * 100) / 100;

// Types
interface GpcStat {
  id: string;
  grapheme: string;
  phoneme: string;
  wordCount: number;
  totalFrequency: number;
  topWords: string[];
}

interface AnalyzedWord {
  word: string;
  phonemes: string[];
  frequency: number;
  gpcs: string[]; // Only the valid ones
  pattern: string;
  issues: string[];
  fullyAligned: boolean;
}

class GpcStatAggregator {
  private stats = new Map<string, {
    wordCount: number;
    totalFreq: number;
    words: Array<{ word: string; freq: number }>;
  }>();

  add(gpcId: string, word: string, freq: number) {
    if (!this.stats.has(gpcId)) {
      this.stats.set(gpcId, { wordCount: 0, totalFreq: 0, words: [] });
    }
    const data = this.stats.get(gpcId)!;
    data.wordCount++;
    data.totalFreq += freq;
    data.words.push({ word, freq });
  }

  processWord(result: AlignmentResult, frequency: number) {
    // Iterate segments to capture every usage
    for (const segment of result.segments) {
      if (segment.aligned && segment.gpcId) {
        this.add(segment.gpcId, result.word, frequency);
      }
    }
  }

  getResults(): GpcStat[] {
    const result: GpcStat[] = [];
    for (const [gpcId, data] of this.stats) {
      // Parse GPC-grapheme-phoneme
      const parts = gpcId.split('-');
      const grapheme = parts[1] || '';
      const phoneme = parts.slice(2).join('-') || '';

      // Unique words for the example list
      const uniqueWords = new Map<string, number>();
      for (const w of data.words) {
        uniqueWords.set(w.word, w.freq);
      }

      const sortedWords = Array.from(uniqueWords.entries())
        .sort((a, b) => b[1] - a[1])
        .map(x => x[0])
        .slice(0, 5);

      result.push({
        id: gpcId,
        grapheme,
        phoneme,
        wordCount: uniqueWords.size, // distinct words
        totalFrequency: data.totalFreq, // total token frequency (occurrences)
        topWords: sortedWords
      });
    }

    // Sort by total frequency
    result.sort((a, b) => b.totalFrequency - a.totalFrequency);
    return result;
  }
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('Loading data...');
  const cmudict = loadCmudict(DEFAULT_CMUDICT_PATH);
  const subtlex = loadSubtlex(DEFAULT_SUBTLEX_PATH);

  console.log(`  CMUDict: ${cmudict.size} words`);
  console.log(`  SUBTLEX: ${subtlex.size} entries`);

  // alignWord will use the default catalogue index (v2)

  // Storage
  const teachingCorpus: AnalyzedWord[] = [];
  const irregularCorpus: AnalyzedWord[] = [];
  const fullCorpus: AnalyzedWord[] = [];

  const monoAggregator = new GpcStatAggregator();
  const fullAggregator = new GpcStatAggregator();

  console.log('\nProcessing corpus...');

  let monoCount = 0;

  for (const [word, phonemes] of cmudict) {
    const freq = subtlex.get(word) ?? 0;
    if (freq === 0) continue; // Skip words not in SUBTLEX

    // EXCLUDE ANNOYING AND NON-TEACHWORTHY IRREGULAR
    if (word === 'a') continue;
    // Same for "I" — and the app's pedagogy is all lowercase, while I is
    // always capitalised.
    if (word === 'i') continue;

    // Align
    const result = alignWord(word, phonemes as any);

    const analyzed: AnalyzedWord = {
      word,
      phonemes: phonemes as any,
      frequency: freq,
      gpcs: result.segments.filter(s => s.aligned && s.gpcId).map(s => s.gpcId!),
      pattern: result.pattern,
      issues: result.issues,
      fullyAligned: result.fullyAligned
    };

    // 1. Full Corpus Analysis
    fullAggregator.processWord(result, freq);
    fullCorpus.push(analyzed);

    // 2. Monosyllable Analysis
    if (isMonosyllabic(phonemes as any)) {
      monoCount++;
      monoAggregator.processWord(result, freq);

      if (result.fullyAligned) {
        teachingCorpus.push(analyzed);
      } else {
        irregularCorpus.push(analyzed);
      }
    }
  }

  // Sort corpora by frequency
  teachingCorpus.sort((a, b) => b.frequency - a.frequency);
  irregularCorpus.sort((a, b) => b.frequency - a.frequency);
  fullCorpus.sort((a, b) => b.frequency - a.frequency);

  // Compile Stats
  const monoStats = monoAggregator.getResults();
  const fullStats = fullAggregator.getResults();

  // Metrics
  const teachingFreq = teachingCorpus.reduce((s, w) => s + w.frequency, 0);
  const irregularFreq = irregularCorpus.reduce((s, w) => s + w.frequency, 0);
  const totalMonoFreq = teachingFreq + irregularFreq;
  const coverage = round2(100 * teachingFreq / totalMonoFreq);

  console.log('\n' + '='.repeat(60));
  console.log('CORPUS ANALYSIS SUMMARY (V2)');
  console.log('='.repeat(60));
  console.log(`Monosyllables:  ${monoCount}`);
  console.log(`  Teaching:     ${teachingCorpus.length} words (${teachingFreq.toLocaleString()} freq)`);
  console.log(`  Irregular:    ${irregularCorpus.length} words (${irregularFreq.toLocaleString()} freq)`);
  console.log(`  Coverage:     ${coverage}% (by frequency)`);
  console.log();
  console.log(`Full Corpus:    ${fullCorpus.length} words`);
  console.log(`Unique GPCs:    ${monoStats.length} (in monos), ${fullStats.length} (in full)`);

  // Write outputs
  console.log('\nWriting outputs...');

  const meta = {
    generatedAt: new Date().toISOString(),
    stats: {
      monosyllables: {
        total: monoCount,
        teaching: teachingCorpus.length,
        irregular: irregularCorpus.length,
        coverage
      },
      fullCorpus: {
        total: fullCorpus.length
      }
    }
  };

  writeFileSync(
    resolve(OUTPUTS, 'teaching-words.json'),
    JSON.stringify({ meta, words: teachingCorpus }, null, 2)
  );

  writeFileSync(
    resolve(OUTPUTS, 'irregular-words.json'),
    JSON.stringify({ meta, words: irregularCorpus }, null, 2)
  );

  writeFileSync(
    resolve(OUTPUTS, 'corpus-words.json'),
    JSON.stringify({ meta, words: fullCorpus }, null, 2)
  );

  writeFileSync(
    resolve(OUTPUTS, 'gpc-usage.json'),
    JSON.stringify({
      meta,
      monosyllableUsage: monoStats,
      fullCorpusUsage: fullStats
    }, null, 2)
  );

  console.log('  teaching-words.json');
  console.log('  irregular-words.json');
  console.log('  corpus-words.json');
  console.log('  gpc-usage.json');
  console.log('\nDone!');
}

main();
