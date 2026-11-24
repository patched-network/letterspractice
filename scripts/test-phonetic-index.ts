#!/usr/bin/env tsx
/**
 * Test script: Verify phonetic index alignments
 *
 * Displays phonetic breakdowns in a readable format to verify
 * that grapheme-phoneme mappings are correct.
 */

import { PHONETIC_INDEX } from '../src/services/phonetics.generated.js';

/**
 * Pretty-print a phonetic breakdown
 */
function printWordBreakdown(word: string) {
  const entry = PHONETIC_INDEX[word];

  if (!entry) {
    console.log(`❌ "${word}" not found in index\n`);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Word: "${entry.word}"`);
  console.log(`Phonemes: [${entry.phonemes.join(' ')}]`);
  console.log(`Audio: ${entry.audioUrl}`);
  console.log(`${'='.repeat(60)}`);

  console.log('\nGrapheme → Phoneme Mappings:');
  console.log('-'.repeat(60));

  entry.chunks.forEach((chunk, i) => {
    const letterIndices = Object.keys(chunk.letters).map(k => parseInt(k));
    const letterRange = letterIndices.length === 1
      ? `[${letterIndices[0]}]`
      : `[${Math.min(...letterIndices)}-${Math.max(...letterIndices)}]`;

    const letters = letterIndices.map(i => entry.word[i]).join('');

    console.log(`  ${i + 1}. "${chunk.label}" ${letterRange} → /${chunk.audio.split('/').pop()?.replace('.mp3', '').toUpperCase()}/`);
    console.log(`     Letters: "${letters}" (positions ${letterIndices.join(', ')})`);
    console.log(`     Audio: ${chunk.audio}`);
  });
}

/**
 * Test cases covering different phonetic patterns
 */
const testCases = [
  // Simple CVC words
  { word: 'cat', description: 'Simple CVC (if cat were in our list)' },
  { word: 'bat', description: 'Simple CVC' },

  // Digraphs
  { word: 'ship', description: 'Initial digraph (sh)' },
  { word: 'fish', description: 'Final digraph (sh)' },
  { word: 'shock', description: 'Initial digraph (sh) + CK' },

  // Split digraphs (magic e)
  { word: 'cape', description: 'Split digraph (a_e)' },
  { word: 'line', description: 'Split digraph (i_e)' },
  { word: 'bone', description: 'Split digraph (o_e)' },
  { word: 'mule', description: 'Split digraph (u_e) with consonant y glide' },

  // Consonant clusters
  { word: 'brown', description: 'Br- cluster + ow' },
  { word: 'crown', description: 'Cr- cluster + ow' },
  { word: 'string', description: 'Str- cluster + ng' },

  // Vowel teams
  { word: 'could', description: 'Irregular vowel (ould)' },
  { word: 'should', description: 'Irregular vowel (ould)' },
];

console.log('🔊 Phonetic Index Alignment Test\n');
console.log(`Testing ${testCases.length} words...\n`);

testCases.forEach(({ word, description }) => {
  console.log(`\n📝 ${description.toUpperCase()}`);
  printWordBreakdown(word);
});

console.log('\n\n✅ Test complete!\n');
