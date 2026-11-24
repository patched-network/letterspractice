#!/usr/bin/env tsx
/**
 * Build script: Generate phonetic index from CMUdict
 *
 * This script:
 * 1. Loads the word list from src/audio/word-list.ts (single source of truth)
 * 2. For each word, looks up phonemes in CMUdict
 * 3. Uses alignment engine to map phonemes to graphemes (GPC mappings)
 * 4. Analyzes audio files to detect speech onset/offset via ffmpeg silencedetect
 * 5. Generates phonetic chunks for PhoneticWord component
 * 6. Outputs src/services/phonetics.generated.ts
 *
 * Run: npm run build:phonetic-index
 * Or: tsx scripts/build-phonetic-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';
import { WORD_LIST } from '../src/audio/word-list.js';
import { loadCmudict } from '../content/phoneticAnalytics/lib/dictionary.js';
import type { ArpabetPhoneme } from '../content/phoneticAnalytics/lib/types.js';
import { alignmentToChunks, PRONUNCIATION_OVERRIDES, type PhoneticChunk } from '../content/phoneticAnalytics/lib/chunk-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Timing data extracted from a word's audio file.
 * Describes where actual speech occurs within the recording.
 */
interface AudioTimingMs {
  /** Total duration of the audio file in milliseconds */
  fileDuration: number;
  /** Milliseconds from file start to speech onset */
  speechStart: number;
  /** Milliseconds from file start to speech end */
  speechEnd: number;
}

interface WordPhonetics {
  word: string;
  phonemes: string[];
  chunks: PhoneticChunk[];
  audioUrl: string;
  audioTimingMs?: AudioTimingMs;
}

// ---------------------------------------------------------------------------
// Audio analysis
// ---------------------------------------------------------------------------

// Optional second place to look: a checkout of the audio repo's words/ (e.g. new
// recordings not yet in the pinned pack). public/audio/ comes from setup-audio.sh.
const AUDIO_SOURCE_DIR = process.env.AUDIO_SOURCE_DIR;
const PUBLIC_AUDIO_DIR = path.join(__dirname, '../public/audio/words');

/**
 * Silence detection configuration.
 *
 * These values were chosen empirically against the current word recordings,
 * which are spoken-word single-syllable words with variable padding.
 */
const SILENCE_CONFIG = {
  /** dB threshold below which audio is considered silence */
  noiseThresholdDb: -30,
  /** Minimum duration (seconds) for a region to count as silence */
  minSilenceDurationSec: 0.03,
  /** Max gap (ms) between adjacent silence regions to merge them */
  mergeGapMs: 30,
  /**
   * A trailing silence region qualifies if its end is within this many ms
   * of file end. Empirically, recordings have a ~90-110ms noise/fade tail
   * after the last silence block.
   */
  trailingProximityMs: 120,
  /** A leading silence region must start within this many ms of file start */
  leadingProximityMs: 10,
};

/**
 * Check that ffmpeg/ffprobe are available on the system.
 */
function checkFfmpeg(): { ffprobe: boolean; ffmpeg: boolean } {
  const check = (cmd: string) => {
    try {
      execSync(`${cmd} -version`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };
  return { ffprobe: check('ffprobe'), ffmpeg: check('ffmpeg') };
}

/**
 * Resolve the path to a word's mp3 file: public/audio first, then
 * AUDIO_SOURCE_DIR if set.
 */
function resolveAudioPath(word: string): string | null {
  const publicPath = path.join(PUBLIC_AUDIO_DIR, `${word}.mp3`);
  if (fs.existsSync(publicPath)) return publicPath;

  if (AUDIO_SOURCE_DIR) {
    const sourcePath = path.join(AUDIO_SOURCE_DIR, `${word}.mp3`);
    if (fs.existsSync(sourcePath)) return sourcePath;
  }

  return null;
}

/**
 * Extract audio file duration in milliseconds using ffprobe.
 */
function getFileDurationMs(audioPath: string): number | undefined {
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    const seconds = parseFloat(result);
    if (isNaN(seconds) || seconds <= 0) return undefined;

    return Math.round(seconds * 1000);
  } catch {
    return undefined;
  }
}

/**
 * A contiguous region of silence within an audio file.
 */
interface SilenceRegion {
  startMs: number;
  endMs: number;
}

/**
 * Run ffmpeg silencedetect and parse the output into silence regions.
 */
function detectSilenceRegions(audioPath: string): SilenceRegion[] {
  const { noiseThresholdDb, minSilenceDurationSec } = SILENCE_CONFIG;

  let output: string;
  try {
    output = execSync(
      `ffmpeg -i "${audioPath}" -af silencedetect=noise=${noiseThresholdDb}dB:d=${minSilenceDurationSec} -f null - 2>&1`,
      { encoding: 'utf-8', timeout: 10000 },
    );
  } catch {
    return [];
  }

  // Parse silence_start / silence_end lines
  // Lines look like:
  //   [silencedetect @ 0x...] silence_start: 0.123
  //   [silencedetect @ 0x...] silence_end: 0.456 | silence_duration: 0.333
  const regions: SilenceRegion[] = [];
  let pendingStart: number | null = null;

  for (const line of output.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch) {
      const endSec = parseFloat(endMatch[1]);
      const startSec = pendingStart ?? 0;
      regions.push({
        startMs: Math.round(startSec * 1000),
        endMs: Math.round(endSec * 1000),
      });
      pendingStart = null;
    }
  }

  // Handle case where silence extends to end of file (silence_start with no matching silence_end)
  if (pendingStart !== null) {
    // This silence extends to the end of the file — we'll set endMs later when we know file duration
    regions.push({
      startMs: Math.round(pendingStart * 1000),
      endMs: Infinity,  // sentinel; resolved by caller
    });
  }

  return regions;
}

/**
 * Merge adjacent silence regions whose gap is smaller than the merge threshold.
 *
 * This handles cases like "is" where two silence blocks are back-to-back
 * at the start of the file with only ~1ms between them.
 */
function mergeSilenceRegions(regions: SilenceRegion[]): SilenceRegion[] {
  if (regions.length === 0) return [];

  // Sort by start time
  const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);

  const merged: SilenceRegion[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    // Merge if the gap between prev.end and curr.start is small enough
    if (curr.startMs - prev.endMs <= SILENCE_CONFIG.mergeGapMs) {
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Determine speech onset and offset from silence regions.
 *
 * - Speech onset = end of the (merged) leading silence block that starts at/near t=0.
 *   If no leading silence, onset = 0.
 * - Speech offset = start of the (merged) trailing silence block that ends at/near file end.
 *   If no trailing silence, offset = fileDuration.
 */
function findSpeechBounds(
  mergedRegions: SilenceRegion[],
  fileDurationMs: number,
): { speechStart: number; speechEnd: number } {
  const { leadingProximityMs, trailingProximityMs } = SILENCE_CONFIG;

  // Resolve any Infinity sentinels
  for (const r of mergedRegions) {
    if (r.endMs === Infinity) {
      r.endMs = fileDurationMs;
    }
  }

  // Find leading silence: a merged region that starts within leadingProximityMs of 0
  let speechStart = 0;
  for (const r of mergedRegions) {
    if (r.startMs <= leadingProximityMs) {
      speechStart = r.endMs;
    }
  }

  // Find trailing silence: a merged region near the end of the file.
  // Two criteria (either qualifies):
  //   1. The region's end is within trailingProximityMs of file end.
  //   2. The remaining audio after the region is shorter than the region
  //      itself — i.e., it's a noise/decay tail, not real speech.
  let speechEnd = fileDurationMs;
  for (const r of mergedRegions) {
    if (r.startMs <= speechStart) continue;

    const remainingAfter = fileDurationMs - r.endMs;
    const silenceDuration = r.endMs - r.startMs;
    const nearFileEnd = r.endMs >= fileDurationMs - trailingProximityMs;
    const noiseTail = remainingAfter > 0 && remainingAfter < silenceDuration;

    if (nearFileEnd || noiseTail) {
      speechEnd = r.startMs;
      break;  // take the earliest qualifying trailing block
    }
  }

  // Sanity: ensure speechEnd > speechStart
  if (speechEnd <= speechStart) {
    // Fallback: use full file
    speechStart = 0;
    speechEnd = fileDurationMs;
  }

  return { speechStart, speechEnd };
}

/**
 * Full audio timing analysis for a word.
 *
 * Extracts file duration via ffprobe and speech bounds via ffmpeg silencedetect.
 */
function analyzeAudioTiming(word: string): AudioTimingMs | undefined {
  const audioPath = resolveAudioPath(word);
  if (!audioPath) return undefined;

  const fileDuration = getFileDurationMs(audioPath);
  if (fileDuration == null) return undefined;

  const rawRegions = detectSilenceRegions(audioPath);
  const mergedRegions = mergeSilenceRegions(rawRegions);
  const { speechStart, speechEnd } = findSpeechBounds(mergedRegions, fileDuration);

  return { fileDuration, speechStart, speechEnd };
}

// ---------------------------------------------------------------------------
// Phonetic index generation
// ---------------------------------------------------------------------------

/**
 * Generate the phonetic index
 */
function generatePhoneticIndex(): Record<string, WordPhonetics> {
  console.log('Loading CMUdict...');
  const cmudict = loadCmudict();
  console.log(`✅ Loaded ${cmudict.size} words from CMUdict\n`);

  const tools = checkFfmpeg();
  const canAnalyzeAudio = tools.ffprobe && tools.ffmpeg;

  if (canAnalyzeAudio) {
    console.log('🎵 ffmpeg + ffprobe detected — will analyze audio timing\n');
  } else {
    const missing = [!tools.ffprobe && 'ffprobe', !tools.ffmpeg && 'ffmpeg'].filter(Boolean);
    console.warn(`⚠️  Missing: ${missing.join(', ')} — audio timing will be omitted`);
    console.warn('   Install ffmpeg to enable audio analysis\n');
  }

  const index: Record<string, WordPhonetics> = {};
  let successCount = 0;
  let failCount = 0;
  let timingCount = 0;

  // Collect timing stats for summary
  const speechDurations: number[] = [];
  const leadPaddings: number[] = [];
  const trailPaddings: number[] = [];

  for (const word of WORD_LIST) {
    // Check pronunciation overrides first, then fall back to CMUdict
    const override = PRONUNCIATION_OVERRIDES[word.toLowerCase()];
    const phonemes = override ?? cmudict.get(word.toLowerCase());

    if (!phonemes) {
      console.warn(`❌ No CMUdict entry for "${word}" - skipping`);
      failCount++;
      continue;
    }

    if (override) {
      console.log(`  ↪ Using pronunciation override for "${word}"`);
    }

    try {
      const chunks = alignmentToChunks(word, phonemes);

      const entry: WordPhonetics = {
        word,
        phonemes,
        chunks,
        audioUrl: `/audio/words/${word}.mp3`,
      };

      // Analyze audio timing if tools are available
      if (canAnalyzeAudio) {
        const timing = analyzeAudioTiming(word);
        if (timing) {
          entry.audioTimingMs = timing;
          timingCount++;

          const speechMs = timing.speechEnd - timing.speechStart;
          speechDurations.push(speechMs);
          leadPaddings.push(timing.speechStart);
          trailPaddings.push(timing.fileDuration - timing.speechEnd);
        }
      }

      index[word] = entry;

      const timingStr = entry.audioTimingMs
        ? ` [${entry.audioTimingMs.speechStart}→${entry.audioTimingMs.speechEnd}ms of ${entry.audioTimingMs.fileDuration}ms]`
        : '';
      console.log(`✓ ${word} -> [${phonemes.join(' ')}] (${chunks.length} chunks)${timingStr}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to align "${word}":`, error);
      failCount++;
    }
  }

  console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`);
  if (canAnalyzeAudio) {
    console.log(`🎵 Audio timing: ${timingCount}/${successCount} words analyzed`);

    if (speechDurations.length > 0) {
      const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
      const median = (arr: number[]) => {
        const s = sorted(arr);
        return s[Math.floor(s.length / 2)];
      };
      const mean = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

      console.log(`\n   Speech duration:  median=${median(speechDurations)}ms  mean=${mean(speechDurations)}ms  range=[${Math.min(...speechDurations)}ms, ${Math.max(...speechDurations)}ms]`);
      console.log(`   Lead padding:     median=${median(leadPaddings)}ms  mean=${mean(leadPaddings)}ms  range=[${Math.min(...leadPaddings)}ms, ${Math.max(...leadPaddings)}ms]`);
      console.log(`   Trail padding:    median=${median(trailPaddings)}ms  mean=${mean(trailPaddings)}ms  range=[${Math.min(...trailPaddings)}ms, ${Math.max(...trailPaddings)}ms]`);
    }
  }

  return index;
}

/**
 * Generate TypeScript source file
 */
function generateSourceFile(index: Record<string, WordPhonetics>): string {
  return `/**
 * Auto-generated phonetic index
 *
 * DO NOT EDIT MANUALLY
 * Generated by: scripts/build-phonetic-index.ts
 * Source: src/audio/word-list.ts
 * Generated: ${new Date().toISOString()}
 *
 * This file contains phonetic breakdowns for all words with recorded audio.
 * Phonemes are from CMUdict, aligned to graphemes using the GPC alignment engine.
 * Audio timing data is extracted via ffmpeg silencedetect analysis.
 */

import type { ArpabetPhoneme } from './phonetics/arpabet';

export interface PhoneticChunk {
  letters: { [index: number]: string | string[] };
  phoneme: ArpabetPhoneme; // Strongly-typed ARPAbet phoneme
  label?: string;
  /** Letter index of the controlling consonant that mediates this vowel's sound (r/l-control) */
  mediatedBy?: number;
  /** Chunk index of the vowel step that this controller mediates (r/l-control) */
  mediates?: number;
  /** The chunk's GPC when label + phoneme can't resolve it (every sight-word chunk) */
  gpcId?: string;
}

/**
 * Timing data extracted from the word's audio file.
 * Describes where actual speech occurs within the recording,
 * excluding leading/trailing silence and fade.
 */
export interface AudioTimingMs {
  /** Total duration of the audio file in milliseconds */
  fileDuration: number;
  /** Milliseconds from file start to speech onset */
  speechStart: number;
  /** Milliseconds from file start to speech end */
  speechEnd: number;
}

export interface WordPhonetics {
  word: string;
  phonemes: ArpabetPhoneme[];
  chunks: PhoneticChunk[];
  audioUrl: string;
  /** Timing data describing the speech region within the audio file */
  audioTimingMs?: AudioTimingMs;
}

export const PHONETIC_INDEX: Record<string, WordPhonetics> = ${JSON.stringify(index, null, 2)};
`;
}

/**
 * Main execution
 */
function main() {
  console.log('🔊 Building phonetic index...');
  console.log(`📝 Processing ${WORD_LIST.length} words\n`);

  const index = generatePhoneticIndex();
  const sourceCode = generateSourceFile(index);

  const outPath = path.join(__dirname, '../src/services/phonetics.generated.ts');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sourceCode, 'utf-8');

  console.log(`\n✅ Generated ${outPath}`);
  console.log(`📊 Indexed ${Object.keys(index).length}/${WORD_LIST.length} words`);
}

main();