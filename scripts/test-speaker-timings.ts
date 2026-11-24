#!/usr/bin/env tsx
/**
 * Test script: Verify speaker timing computation
 *
 * Displays computed speaker timings for sample words to verify that
 * the speech-region-aware timing algorithm produces sensible results.
 *
 * Run: npx tsx scripts/test-speaker-timings.ts
 */

import { computeSpeakerTimingsForWord } from '../src/services/phonetics/speakerTimings';
import { PHONETIC_INDEX } from '../src/services/phonetics.generated';

const SPEAK_PEAK_OFFSET = 200;

const testWords = [
  // Simple CVC
  'cat', 'dog', 'hat', 'bug',
  // Digraphs
  'ship', 'fish', 'chat', 'thin',
  // Silent-e
  'cake', 'age', 'made', 'ride',
  // R-controlled
  'car', 'her', 'sir',
  // Multi-letter patterns
  'chair', 'school', 'knight',
  // Short words
  'am', 'is', 'go', 'be',
];

let passCount = 0;
let warnCount = 0;
let failCount = 0;

for (const word of testWords) {
  const entry = PHONETIC_INDEX[word];
  if (!entry) {
    console.log(`\n❌ ${word}: NOT FOUND in phonetic index`);
    failCount++;
    continue;
  }

  if (!entry.audioTimingMs) {
    console.log(`\n⚠️  ${word}: no audio timing data`);
    warnCount++;
    continue;
  }

  const timing = entry.audioTimingMs;
  const timings = computeSpeakerTimingsForWord(entry);

  if (!timings || timings.length === 0) {
    console.log(`\n⚠️  ${word}: computeSpeakerTimingsForWord returned null/empty`);
    warnCount++;
    continue;
  }

  const fileDur = timing.fileDuration;
  const speechStart = timing.speechStart;
  const speechEnd = timing.speechEnd;
  const speechDur = speechEnd - speechStart;

  console.log(`\n=== ${word} (file=${fileDur}ms, speech=${speechStart}→${speechEnd}ms [${speechDur}ms], ${entry.chunks.length} chunks) ===`);
  console.log(`  Chunks: ${entry.chunks.map(c => c.label || '?').join(' · ')}`);
  console.log(`  Timings:`);

  for (const t of timings) {
    const letter = word[t.index] ?? '?';
    const peakAt = t.time + SPEAK_PEAK_OFFSET;
    const pctOfSpeech = speechDur > 0 ? (((peakAt - speechStart) / speechDur) * 100).toFixed(0) : '?';
    console.log(
      `    [${t.index}] '${letter}' trigger=${t.time}ms  peak≈${peakAt}ms  (${pctOfSpeech}% of speech window)  effect=${t.effect}`
    );
  }

  // Sanity checks
  const speakTimings = timings.filter(t => t.effect === 'speak');
  const issues: string[] = [];

  // Check that timings are non-negative
  if (timings.some(t => t.time < 0)) {
    issues.push('negative trigger time');
  }

  // Check that no trigger is beyond speech end (with some tolerance for the peak offset)
  if (timings.some(t => t.time > speechEnd + SPEAK_PEAK_OFFSET)) {
    issues.push(`trigger time far beyond speech end (${speechEnd}ms)`);
  }

  // Check that speak timings are monotonically non-decreasing by letter index
  for (let i = 1; i < speakTimings.length; i++) {
    if (speakTimings[i].index > speakTimings[i - 1].index && speakTimings[i].time < speakTimings[i - 1].time) {
      issues.push(`non-monotonic: letter[${speakTimings[i].index}] triggers before letter[${speakTimings[i - 1].index}]`);
    }
  }

  // Check that the first speak trigger is near or after speechStart
  if (speakTimings.length > 0) {
    const firstPeak = speakTimings[0].time + SPEAK_PEAK_OFFSET;
    if (firstPeak < speechStart - 50) {
      issues.push(`first peak (${firstPeak}ms) is well before speech start (${speechStart}ms)`);
    }
  }

  // Check that last peak is within a reasonable range of speechEnd
  if (speakTimings.length > 0) {
    const lastPeak = speakTimings[speakTimings.length - 1].time + SPEAK_PEAK_OFFSET;
    if (lastPeak > speechEnd + SPEAK_PEAK_OFFSET) {
      issues.push(`last peak (${lastPeak}ms) is well beyond speech end (${speechEnd}ms)`);
    }
  }

  if (issues.length > 0) {
    console.log(`  ⚠️  Issues: ${issues.join('; ')}`);
    warnCount++;
  } else {
    console.log(`  ✅ OK`);
    passCount++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
console.log(`Total words in index: ${Object.keys(PHONETIC_INDEX).length}`);

// Summary stats across all words
console.log(`\n${'─'.repeat(60)}`);
console.log('Audio timing distribution across entire index:');

const entries = Object.values(PHONETIC_INDEX).filter(e => e.audioTimingMs);

if (entries.length > 0) {
  const speechDurations = entries.map(e => e.audioTimingMs!.speechEnd - e.audioTimingMs!.speechStart).sort((a, b) => a - b);
  const fileDurations = entries.map(e => e.audioTimingMs!.fileDuration).sort((a, b) => a - b);
  const leadPaddings = entries.map(e => e.audioTimingMs!.speechStart).sort((a, b) => a - b);
  const trailPaddings = entries.map(e => e.audioTimingMs!.fileDuration - e.audioTimingMs!.speechEnd).sort((a, b) => a - b);

  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const mean = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  console.log(`  Words with timing data: ${entries.length}`);
  console.log(`\n  File duration:    min=${fileDurations[0]}ms  median=${median(fileDurations)}ms  mean=${mean(fileDurations)}ms  max=${fileDurations[fileDurations.length - 1]}ms`);
  console.log(`  Speech duration:  min=${speechDurations[0]}ms  median=${median(speechDurations)}ms  mean=${mean(speechDurations)}ms  max=${speechDurations[speechDurations.length - 1]}ms`);
  console.log(`  Lead padding:     min=${leadPaddings[0]}ms  median=${median(leadPaddings)}ms  mean=${mean(leadPaddings)}ms  max=${leadPaddings[leadPaddings.length - 1]}ms`);
  console.log(`  Trail padding:    min=${trailPaddings[0]}ms  median=${median(trailPaddings)}ms  mean=${mean(trailPaddings)}ms  max=${trailPaddings[trailPaddings.length - 1]}ms`);
}