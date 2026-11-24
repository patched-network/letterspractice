/**
 * Phoneme Frequency Analysis
 * ==========================
 *
 * Analyzes phoneme usage in English by combining:
 * - CMUDict: word → phoneme mappings
 * - SUBTLEX: word → frequency (actual usage counts)
 * - GPC Catalogue: grapheme → phoneme mappings (how phonemes are written)
 *
 * Outputs:
 * 1. Phoneme frequency ranking (most uttered phonemes in English)
 * 2. Per-phoneme grapheme breakdown (how each phoneme is typically spelled)
 *    - Includes "undecodable" category for words that fail GPC alignment
 *
 * Usage:
 *   npx tsx scripts/phoneme-frequency.ts
 *   npx tsx scripts/phoneme-frequency.ts --output outputs-v2/phoneme-analysis.json
 */

 /**

 todo:
 - [ ] scrubbing cmu dict of non-literals. eg: `aaa` -> Triple A


 - [@] use this file to debug various "undecodables". eg, `t` claims undecodable in "abate", "abandonment"



 - [ ] exampleWords here should include the *most frequent* words

 question: what is totalFrequency vs totalOccurrences?

 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getDefaultCatalogueIndex, type GPCCatalogueIndex } from '../lib/catalogue';
import { alignWord } from '../lib/alignment';
import { stripStress, isVowel } from '../lib/arpabet';
import { loadCmudict, loadSubtlex, DEFAULT_CMUDICT_PATH, DEFAULT_SUBTLEX_PATH } from '../lib/dictionary';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = resolve(__dirname, '..', 'src-data');
const CONFIG_DIR = resolve(__dirname, '..', 'config');
const OUTPUTS = resolve(__dirname, '..', 'outputs-v2');

// =============================================================================
// Types
// =============================================================================

interface PhonemeStats {
  phoneme: string;
  type: 'vowel' | 'consonant';
  totalFrequency: number;           // Sum of word frequencies containing this phoneme
  totalOccurrences: number;         // Count of phoneme occurrences (word freq × occurrences per word)
  wordCount: number;                // Unique words containing this phoneme

  // Grapheme breakdown: how is this phoneme spelled?
  graphemes: Array<{
    grapheme: string;
    gpcId: string;
    frequency: number;              // Frequency-weighted count
    occurrences: number;            // Raw occurrence count
    percentage: number;             // % of this phoneme's total
    exampleWords: string[];         // Top examples
  }>;

  // Words where alignment failed (phoneme present but can't decode)
  undecodable: {
    frequency: number;
    occurrences: number;
    percentage: number;
    exampleWords: string[];
  };
}

interface AnalysisResult {
  meta: {
    generatedAt: string;
    generatedBy: string;
    corpusSize: {
      cmudictWords: number;
      subtlexWords: number;
      matchedWords: number;
      totalFrequency: number;
    };
  };

  // Phonemes ranked by total frequency
  phonemeRanking: Array<{
    rank: number;
    phoneme: string;
    type: 'vowel' | 'consonant';
    totalFrequency: number;
    percentOfCorpus: number;
  }>;

  // Detailed per-phoneme stats
  phonemeDetails: Record<string, PhonemeStats>;

  // Summary stats
  summary: {
    totalPhonemes: number;
    vowelCount: number;
    consonantCount: number;
    mostCommonVowel: string;
    mostCommonConsonant: string;
    averageGraphemesPerPhoneme: number;
    undecodablePercentage: number;
  };
}

// =============================================================================
// Analysis
// =============================================================================

function analyzePhonemeFrequency(
  catalogue: GPCCatalogueIndex,
  cmudict: Map<string, string[]>,
  subtlex: Map<string, number>
): AnalysisResult {
  // Track stats per phoneme
  const phonemeStats = new Map<string, {
    type: 'vowel' | 'consonant';
    totalFrequency: number;
    totalOccurrences: number;
    wordCount: number;
    words: Set<string>;
    graphemes: Map<string, {
      gpcId: string;
      frequency: number;
      occurrences: number;
      words: Array<{ word: string; freq: number }>;
    }>;
    undecodable: {
      frequency: number;
      occurrences: number;
      words: Array<{ word: string; freq: number }>;
    };
  }>();

  // Initialize phoneme entry
  const getOrCreatePhoneme = (phoneme: string) => {
    if (!phonemeStats.has(phoneme)) {
      phonemeStats.set(phoneme, {
        type: isVowel(phoneme as any) ? 'vowel' : 'consonant',
        totalFrequency: 0,
        totalOccurrences: 0,
        wordCount: 0,
        words: new Set(),
        graphemes: new Map(),
        undecodable: { frequency: 0, occurrences: 0, words: [] },
      });
    }
    return phonemeStats.get(phoneme)!;
  };

  let matchedWords = 0;
  let totalFrequency = 0;
  let totalUndecodableFreq = 0;

  // Process each word that's in both CMUDict and SUBTLEX
  for (const [word, phonemes] of cmudict) {
    const freq = subtlex.get(word);
    if (freq === undefined) continue;

    matchedWords++;
    totalFrequency += freq;

    // Try to align the word
    // const alignment = alignWord(catalogue, word, phonemes as any);
    const alignment = alignWord(word, phonemes as any);

    // Count phoneme occurrences in this word
    const phonemeCounts = new Map<string, number>();
    for (const p of phonemes) {
      phonemeCounts.set(p, (phonemeCounts.get(p) || 0) + 1);
    }

    // Update phoneme stats
    for (const [phoneme, count] of phonemeCounts) {
      const stats = getOrCreatePhoneme(phoneme);

      if (!stats.words.has(word)) {
        stats.wordCount++;
        stats.words.add(word);
      }

      stats.totalFrequency += freq;
      stats.totalOccurrences += freq * count;
    }

    // Track grapheme breakdown
    if (alignment.fullyAligned) {
      for (const segment of alignment.segments) {
        const phoneme = segment.phoneme;
        const stats = getOrCreatePhoneme(phoneme);

        const graphemeKey = segment.grapheme;
        if (!stats.graphemes.has(graphemeKey)) {
          stats.graphemes.set(graphemeKey, {
            gpcId: segment.gpcId || '',
            frequency: 0,
            occurrences: 0,
            words: [],
          });
        }

        const g = stats.graphemes.get(graphemeKey)!;
        g.frequency += freq;
        g.occurrences++;
        g.words.push({ word, freq });
      }
    } else {
      // Alignment failed - add to undecodable for each phoneme
      totalUndecodableFreq += freq;
      for (const phoneme of phonemeCounts.keys()) {
        const stats = getOrCreatePhoneme(phoneme);
        stats.undecodable.frequency += freq;
        stats.undecodable.occurrences++;
        stats.undecodable.words.push({ word, freq });
      }
    }
  }

  // Build output
  const phonemeRanking: AnalysisResult['phonemeRanking'] = [];
  const phonemeDetails: Record<string, PhonemeStats> = {};

  // Sort phonemes by frequency
  const sortedPhonemes = [...phonemeStats.entries()]
    .sort((a, b) => b[1].totalOccurrences - a[1].totalOccurrences);

  let rank = 0;
  for (const [phoneme, stats] of sortedPhonemes) {
    rank++;

    // Ranking entry
    phonemeRanking.push({
      rank,
      phoneme,
      type: stats.type,
      totalFrequency: stats.totalOccurrences,
      percentOfCorpus: (stats.totalOccurrences / totalFrequency) * 100,
    });

    // Sort graphemes by frequency
    const sortedGraphemes = [...stats.graphemes.entries()]
      .sort((a, b) => b[1].frequency - a[1].frequency);

    const totalGraphemeFreq = sortedGraphemes.reduce((sum, [, g]) => sum + g.frequency, 0)
      + stats.undecodable.frequency;

    // Detailed entry
    phonemeDetails[phoneme] = {
      phoneme,
      type: stats.type,
      totalFrequency: stats.totalFrequency,
      totalOccurrences: stats.totalOccurrences,
      wordCount: stats.wordCount,
      graphemes: sortedGraphemes.map(([grapheme, g]) => {
        // Sort words by frequency descending and take top 5
        const topWords = [...g.words]
          .sort((a, b) => b.freq - a.freq)
          .slice(0, 5)
          .map(w => w.word);

        return {
          grapheme,
          gpcId: g.gpcId,
          frequency: g.frequency,
          occurrences: g.occurrences,
          percentage: totalGraphemeFreq > 0 ? (g.frequency / totalGraphemeFreq) * 100 : 0,
          exampleWords: topWords,
        };
      }),
      undecodable: {
        frequency: stats.undecodable.frequency,
        occurrences: stats.undecodable.occurrences,
        percentage: totalGraphemeFreq > 0
          ? (stats.undecodable.frequency / totalGraphemeFreq) * 100
          : 0,
        exampleWords: [...stats.undecodable.words]
          .sort((a, b) => b.freq - a.freq)
          .slice(0, 5)
          .map(w => w.word),
      },
    };
  }

  // Summary stats
  const vowels = sortedPhonemes.filter(([, s]) => s.type === 'vowel');
  const consonants = sortedPhonemes.filter(([, s]) => s.type === 'consonant');

  const avgGraphemes = sortedPhonemes.reduce((sum, [, s]) => sum + s.graphemes.size, 0)
    / sortedPhonemes.length;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'phoneme-frequency.ts',
      corpusSize: {
        cmudictWords: cmudict.size,
        subtlexWords: subtlex.size,
        matchedWords,
        totalFrequency,
      },
    },
    phonemeRanking,
    phonemeDetails,
    summary: {
      totalPhonemes: sortedPhonemes.length,
      vowelCount: vowels.length,
      consonantCount: consonants.length,
      mostCommonVowel: vowels[0]?.[0] ?? '',
      mostCommonConsonant: consonants[0]?.[0] ?? '',
      averageGraphemesPerPhoneme: Math.round(avgGraphemes * 10) / 10,
      undecodablePercentage: (totalUndecodableFreq / totalFrequency) * 100,
    },
  };
}

// =============================================================================
// Output Formatting
// =============================================================================

function formatReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('PHONEME FREQUENCY ANALYSIS');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Corpus: ${result.meta.corpusSize.matchedWords.toLocaleString()} words`);
  lines.push(`Total frequency: ${result.meta.corpusSize.totalFrequency.toLocaleString()}`);
  lines.push(`Undecodable: ${result.summary.undecodablePercentage.toFixed(1)}%`);
  lines.push('');

  // Top 20 phonemes
  lines.push('TOP 20 PHONEMES (by frequency-weighted occurrence)');
  lines.push('-'.repeat(70));
  lines.push('Rank  Phoneme  Type        Frequency      % of Corpus');
  lines.push('-'.repeat(70));

  for (const p of result.phonemeRanking.slice(0, 20)) {
    const rank = p.rank.toString().padStart(4);
    const phoneme = p.phoneme.padEnd(8);
    const type = p.type.padEnd(10);
    const freq = p.totalFrequency.toLocaleString().padStart(14);
    const pct = p.percentOfCorpus.toFixed(2).padStart(10) + '%';
    lines.push(`${rank}  ${phoneme} ${type} ${freq}  ${pct}`);
  }

  lines.push('');
  lines.push('');

  // Detailed breakdown for top 10 phonemes
  lines.push('GRAPHEME BREAKDOWN (top 10 phonemes)');
  lines.push('='.repeat(70));

  for (const p of result.phonemeRanking.slice(0, 10)) {
    const details = result.phonemeDetails[p.phoneme];
    lines.push('');
    lines.push(`${p.phoneme} (${details.type}) — ${details.wordCount.toLocaleString()} words`);
    lines.push('-'.repeat(50));

    for (const g of details.graphemes.slice(0, 5)) {
      const grapheme = `'${g.grapheme}'`.padEnd(12);
      const pct = g.percentage.toFixed(1).padStart(6) + '%';
      const examples = g.exampleWords.slice(0, 3).join(', ');
      lines.push(`  ${grapheme} ${pct}   ${examples}`);
    }

    if (details.undecodable.percentage > 0.1) {
      const pct = details.undecodable.percentage.toFixed(1).padStart(6) + '%';
      const examples = details.undecodable.exampleWords.slice(0, 3).join(', ');
      lines.push(`  [undecodable] ${pct}   ${examples}`);
    }
  }

  lines.push('');
  lines.push('');

  // Vowels vs consonants
  lines.push('VOWELS vs CONSONANTS');
  lines.push('-'.repeat(70));
  lines.push(`Vowels: ${result.summary.vowelCount} (most common: ${result.summary.mostCommonVowel})`);
  lines.push(`Consonants: ${result.summary.consonantCount} (most common: ${result.summary.mostCommonConsonant})`);
  lines.push(`Avg graphemes per phoneme: ${result.summary.averageGraphemesPerPhoneme}`);

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const outputArg = args.indexOf('--output');
  const outputPath = outputArg >= 0 ? args[outputArg + 1] : resolve(OUTPUTS, 'phoneme-frequency.json');

  console.log('Loading data...');

  const catalogue = getDefaultCatalogueIndex();
  const cmudict = loadCmudict(DEFAULT_CMUDICT_PATH);
  const subtlex = loadSubtlex(DEFAULT_SUBTLEX_PATH);

  console.log(`  CMUDict: ${cmudict.size.toLocaleString()} words`);
  console.log(`  SUBTLEX: ${subtlex.size.toLocaleString()} words`);
  console.log(`  GPC Catalogue: ${catalogue.byId.size} GPCs`);
  console.log('');

  console.log('Analyzing phoneme frequency...');
  const result = analyzePhonemeFrequency(catalogue, cmudict, subtlex);

  // Print report
  console.log('');
  console.log(formatReport(result));

  // Save JSON
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log('');
  console.log(`Saved: ${outputPath}`);
}

main();
