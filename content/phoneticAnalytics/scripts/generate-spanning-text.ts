
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeWord } from '../lib/decode';
import { getDefaultCatalogueIndex } from '../lib/catalogue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Data
const usageData = JSON.parse(fs.readFileSync(path.join(__dirname, '../outputs-v2/gpc-usage.json'), 'utf-8'));

interface GPCWeight {
  id: string;
  weight: number; // Total frequency in corpus
}

interface CandidateWord {
  word: string;
  gpcs: Set<string>;
}

async function generateSpanningSet() {
  console.log("Initializing Spanning Set Generator...");
  
  const index = getDefaultCatalogueIndex();
  const gpcWeights = new Map<string, number>();
  let totalSystemWeight = 0;

  // 1. Build Weight Map from Usage Data
  // (We combine monosyllable and potentially other categories if the JSON had them, 
  // but based on previous turns, we look at what's available)
  const allUsage = [...(usageData.monosyllableUsage || [])];
  
  for (const entry of allUsage) {
    gpcWeights.set(entry.id, entry.totalFrequency);
    totalSystemWeight += entry.totalFrequency;
  }

  console.log(`Total System Weight (Frequency): ${totalSystemWeight.toLocaleString()}`);
  console.log(`Tracking ${gpcWeights.size} unique GPCs.`);

  // 2. Gather Candidate Words
  // We collect every "topWord" mentioned in the usage statistics
  const uniqueWords = new Set<string>();
  for (const entry of allUsage) {
    if (entry.topWords) {
      entry.topWords.forEach((w: string) => uniqueWords.add(w.toLowerCase()));
    }
  }

  console.log(`Analyzing ${uniqueWords.size} candidate words...`);

  // 3. Analyze Candidates (Decode them to find their GPCs)
  const candidates: CandidateWord[] = [];
  
  for (const word of uniqueWords) {
    const result = decodeWord(word, index);
    const wordGpcs = new Set<string>();
    
    // Collect GPCs used in this word
    result.segments.forEach(seg => {
      if (seg.gpcId) wordGpcs.add(seg.gpcId);
    });

    candidates.push({ word, gpcs: wordGpcs });
  }

  // 4. Greedy Selection
  const selectedWords: string[] = [];
  const coveredGpcs = new Set<string>();
  let currentCoveredWeight = 0;
  let iteration = 0;

  console.log("\nStarting Selection (Target: 99% Weighted Coverage)...");

  while (true) {
    let bestWord: CandidateWord | null = null;
    let bestGain = -1;

    for (const candidate of candidates) {
      // Calculate marginal gain for this word
      let gain = 0;
      for (const gpc of candidate.gpcs) {
        if (!coveredGpcs.has(gpc)) {
          gain += (gpcWeights.get(gpc) || 0);
        }
      }

      if (gain > bestGain) {
        bestGain = gain;
        bestWord = candidate;
      }
    }

    // Stop if no gain (everything covered or candidates exhausted)
    if (!bestWord || bestGain <= 0) break;

    // Commit Selection
    selectedWords.push(bestWord.word);
    for (const gpc of bestWord.gpcs) {
      coveredGpcs.add(gpc);
    }
    currentCoveredWeight += bestGain;

    iteration++;
    const pct = (currentCoveredWeight / totalSystemWeight) * 100;
    
    // Log checkpoints
    if (pct >= 99 && (currentCoveredWeight - bestGain) / totalSystemWeight < 0.99) {
       console.log(`Hit 99% coverage at word #${iteration}: ${bestWord.word}`);
       break; 
    }
  }

  console.log(`\nFinal Selection: ${selectedWords.length} words.`);
  console.log(`Weighted Coverage: ${((currentCoveredWeight / totalSystemWeight) * 100).toFixed(2)}%`);
  console.log(`GPCs Covered: ${coveredGpcs.size} / ${gpcWeights.size}`);

  // Output the list for composition
  console.log("\n--- Top 50 High-Value Words (Order of Addition) ---");
  console.log(selectedWords.slice(0, 50).join(", "));

  console.log("\n--- The Long Tail (Sample) ---");
  console.log(selectedWords.slice(selectedWords.length - 20).join(", "));
  
  // Categorize selected words by "Phase" for structure
  return selectedWords;
}

generateSpanningSet();
