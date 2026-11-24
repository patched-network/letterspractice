# Phonetics Service

**Strongly-typed phonetics system for phoneme-based word analysis and audio playback.**

## Overview

- **Location**: `src/services/phonetics/`
- **Purpose**: Provides phonetic data (ARPAbet phonemes, grapheme-phoneme correspondences) for words with recorded audio
- **Build-time generation**: Phonetic index built from CMUdict during `npm run build:phonetic-index`
- **Runtime**: Minimal ~43KB generated index with 70 words (no dictionary bundling)

## Architecture

### ARPAbet Type System

**Location**: `src/services/phonetics/arpabet.ts`

Re-exports ARPAbet types from `content/phoneticAnalytics/lib/arpabet.ts` (safe - no data bundling).

```typescript
import { ArpabetPhoneme, VOWELS, CONSONANTS } from '@/services/phonetics/arpabet';

// Strongly-typed phonemes
const phoneme: ArpabetPhoneme = "SH"; // ✅ Type-safe
const phoneme: ArpabetPhoneme = "XY"; // ❌ Type error

// Utilities
isVowel("AE")        // => true
isConsonant("K")     // => true
stripStress("AE1")   // => "AE"
```

### Phoneme Audio Cache

**Location**: `src/services/phonetics/phonemeCache.ts`

Prefetches all 39 ARPAbet phoneme audio files (~4MB total) with staggered loading.

```typescript
import { prefetchPhonemeAudio, getPhonemeAudioUrl } from '@/services/phonetics/phonemeCache';

// In view component onMounted:
prefetchPhonemeAudio(50); // 50ms stagger = ~2 seconds total

// Get phoneme audio URL — uppercase filename, /audio/arpa/ path
const url = getPhonemeAudioUrl("SH"); // => "/audio/arpa/SH.mp3"
```

**Features**:
- Staggered requests (50ms delay) to avoid rate-limit spikes
- Browser caching via HTTP headers (0-cost on subsequent loads)
- Audio objects cached in memory to prevent garbage collection

### Phonetic Index

**Location**: `src/services/phonetics/index.ts`

Runtime API for looking up phonetic data.

```typescript
import { getPhonetics, getAvailableWords, findPhoneticDifference } from '@/services/phonetics';

// Get phonetic data for a word
const phonetics = getPhonetics("ship");
// Returns: {
//   word: "ship",
//   phonemes: ["SH", "IH", "P"],
//   chunks: [
//     { letters: {0: "speak", 1: "speak"}, phoneme: "SH", label: "sh" },
//     { letters: {2: "speak"}, phoneme: "IH", label: "i" },
//     { letters: {3: "speak"}, phoneme: "P", label: "p" }
//   ],
//   audioUrl: "/audio/words/ship.mp3"
// }

// Get all available words
const words = getAvailableWords(); // => ["at", "bad", "bag", ...]

// Find phonetic difference
const diffIndex = findPhoneticDifference("ship", "shop");
// Returns: 1 (second phoneme differs: IH vs AA)
```

## Data Structures

### WordPhonetics

```typescript
interface WordPhonetics {
  word: string;                  // "ship"
  phonemes: ArpabetPhoneme[];    // ["SH", "IH", "P"]
  chunks: PhoneticChunk[];       // Grapheme-phoneme correspondences
  audioUrl: string;              // "/audio/words/ship.mp3"
}
```

### PhoneticChunk

Defines a grapheme-phoneme correspondence (GPC) with letter positions and effects.

```typescript
interface PhoneticChunk {
  letters: { [index: number]: LetterEffect | LetterEffect[] };
  phoneme: ArpabetPhoneme;  // "SH" (strongly-typed, not URL)
  label?: string;           // "sh" (grapheme representation)
}

// Example: "sh" digraph in "ship"
{
  letters: { 0: "speak", 1: "speak" },  // Both 's' and 'h' animate
  phoneme: "SH",
  label: "sh"
}

// Example: Split digraph "a_e" in "cape"
{
  letters: { 1: "speak", 3: "silent-e" },  // 'a' speaks, 'e' is silent
  phoneme: "EY",
  label: "a_e"
}
```

**Letter Effects**: `'speak' | 'highlight' | 'bounce' | 'glow' | 'silent-e'`

## Build Process

### Source Files

1. **Word list**: `src/audio/word-list.ts`
   - Single source of truth for available words
   - Strongly-typed: `export type WordKey = typeof WORD_LIST[number]`

2. **Build script**: `scripts/build-phonetic-index.ts`
   - Runs during `npm run build:phonetic-index`
   - Loads CMUdict (~117k words)
   - For each word in WORD_LIST:
     - Looks up phonemes in CMUdict
     - Aligns phonemes to graphemes using GPC engine
     - Generates PhoneticChunk data
   - Outputs `src/services/phonetics.generated.ts`

3. **CMUdict & alignment**: `content/phoneticAnalytics/`
   - `lib/dictionary.ts` - CMUdict parser
   - `lib/alignment.ts` - GPC alignment engine
   - `lib/arpabet.ts` - ARPAbet type definitions
   - **Data files (CMUdict/Subtlex) are NOT bundled in production** — but the
     dictionary-free `lib/` code IS a runtime citizen: `lib/decode.ts` and
     `lib/catalogue.ts` are imported by `reachableWords`, `tags/gpcCatalogue`,
     and `contextualPhoneme` (below)

### Regenerating the Index

```bash
npm run build:phonetic-index
```

This is automatically run as part of the main build process.

### Contextual Phoneme Analysis

**Location**: `src/services/phonetics/contextualPhoneme.ts`

Predicts what a letter *sounds like in context* for learner-produced strings
(wrong-answer feedback in MissingLetters): soft c before e/i/y, split-digraph
long vowels, digraph merges, r-controlled teams. Wraps the oracle-free decode
engine (`content/phoneticAnalytics/lib/decode.ts`) with audio-key resolution
and a `matchesTarget` flag for "wrong letter, exact target sound" cases
(k for c in "cape" — reserved for a distinct feedback treatment).

```typescript
import { analyzeAttempt } from '@/services/phonetics';

const a = analyzeAttempt('cace', getPhonetics('cake'));
a.positions[2]; // { audioKeys: ['S'], gpcId: 'GPC-c-S-soft', kind: 'contextual', ... }
```

**Explorer**: `/dbg/contextual-phoneme` — full a–z substitution grid for any
recorded word/position, with audio and decode segmentation.

## Integration with PhoneticWord Component

**Component**: `src/letterpeople/vue/PhoneticWord.vue`

Uses phonetic chunks for interactive word exploration:

```vue
<PhoneticWord
  word="ship"
  :phonetic-chunks="phonetics.chunks"
  :word-audio="phonetics.audioUrl"
  :height="200"
/>
```

**How it works**:
1. Component receives `PhoneticChunk[]` with ARPAbet phonemes
2. On chunk playback, converts phoneme to URL: `getPhonemeAudioUrl(chunk.phoneme)`
3. Applies letter effects based on `chunk.letters` mapping
4. Plays phoneme audio and animates letters simultaneously

**Effects**:
- `'speak'` - Mouth animates, letter may pulse
- `'silent-e'` - Subtle indication without speaking
- `'highlight'` - Color emphasis
- `'bounce'` - Vertical animation
- `'glow'` - Filter effect

## Future Expansion

This foundation supports future phonics features:

### Comprehensive GPC Rules
- Full grapheme-phoneme correspondence database
- Context-sensitive rules (e.g., "c" → /k/ before "a", /s/ before "i")
- Multi-grapheme patterns (vowel teams, r-controlled vowels)

### Decoding Algorithms
- **Syllabification**: Break words into syllables using phonotactic rules
- **Onset-rime analysis**: Separate initial consonants from vowel+ending
- **Phoneme blending**: Synthesize word pronunciation from phoneme sequence
- **Grapheme segmentation**: Identify grapheme boundaries in spelling

### Phonological Awareness
- **Rhyme detection**: Compare phoneme sequences for rhyming patterns
- **Phoneme manipulation**: Add/delete/substitute phonemes (e.g., "cat" → "bat")
- **Sound isolation**: Identify initial, medial, final phonemes
- **Phoneme counting**: Number of phonemes in a word (vs. number of letters)

### Reading Analytics
- Track which GPCs the learner has mastered
- Identify struggling phoneme patterns
- Generate targeted intervention cards
- Adaptive difficulty based on phonics knowledge

## Design Philosophy

**Keep the framework "dumb"**: All phonetic data is explicitly stored in card DataShapes or generated at build-time. No runtime inference or guessing.

**Type safety**: ARPAbet phonemes are strongly typed, preventing typos and enabling autocomplete.

**Minimal runtime bundle**: Only include phonetic data for words with recorded audio (currently 70 words, ~43KB).

**Build-time preprocessing**: Use full CMUdict (117k words) at build time, generate minimal runtime index.
