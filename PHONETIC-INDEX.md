# Phonetic Index System

## Overview

Automated build system that generates a runtime phonetic index from CMUdict for words with recorded audio.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Build Time (once during npm run build)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/audio/word-list.ts                                        │
│  └─> ["at", "bad", "bag", ...]  (70 words)                    │
│       │                                                         │
│       ↓                                                         │
│  scripts/build-phonetic-index.ts                               │
│  ├─> Load full CMUdict (130k+ words) from                     │
│  │   content/phoneticAnalytics/src-data/cmudict.dict          │
│  ├─> For each word in list:                                   │
│  │   ├─> Lookup phonemes: "cat" → ["K", "AE", "T"]          │
│  │   └─> Align to graphemes using GPC engine:                │
│  │       └─> "sh" → /SH/, "i" → /IH/, "p" → /P/             │
│  └─> Generate:                                                 │
│       src/services/phonetics.generated.ts (43KB)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Runtime (deployed to production)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/services/phonetics.ts                                     │
│  └─> import { PHONETIC_INDEX } from './phonetics.generated'   │
│                                                                 │
│  getPhonetics("ship")  →  {                                    │
│    phonemes: ["SH", "IH", "P"],                               │
│    chunks: [                                                   │
│      { letters: {0: 'speak', 1: 'speak'},                     │
│        audio: '/audio/phonemes/sh.mp3', label: 'sh' },       │
│      { letters: {2: 'speak'},                                 │
│        audio: '/audio/phonemes/ih.mp3', label: 'i' },        │
│      { letters: {3: 'speak'},                                 │
│        audio: '/audio/phonemes/p.mp3', label: 'p' }          │
│    ]                                                           │
│  }                                                             │
│                                                                 │
│  Bundle size: ~10KB compressed                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Single source of truth**: `src/audio/word-list.ts`
   - Strongly-typed const array
   - Used by both runtime audio loading AND build script
   - ~70 words (only words with recorded audio)

2. **Build-time processing**:
   - Loads 3.5MB CMUdict (dev-time only, never deployed)
   - Uses existing GPC alignment engine from `content/phoneticAnalytics/`
   - Handles digraphs ("sh"), split digraphs ("a_e"), multi-letter phonemes
   - Generates 43KB TypeScript file with ONLY our words

3. **Runtime lookup**:
   - Import tiny generated file
   - O(1) lookup by word
   - Ready for PhoneticWord component

## Usage

### Build Script

```bash
yarn build:phonetic-index
```

Runs automatically as part of `yarn build`.

### Runtime Service

```typescript
import { getPhonetics, findPhoneticDifference } from '@/services/phonetics';

// Get phonetic breakdown
const phonetics = getPhonetics('ship');
// {
//   phonemes: ['SH', 'IH', 'P'],
//   chunks: [ /* ready for PhoneticWord */ ],
//   audioUrl: '/audio/words/ship.mp3'
// }

// Find differences (for WordSelection)
const diffIndex = findPhoneticDifference('ship', 'shop');
// Returns 1 (index of first differing phoneme)
```

### With PhoneticWord Component

```vue
<script setup lang="ts">
import { getPhonetics } from '@/services/phonetics';
import PhoneticWord from '@/letterpeople/vue/PhoneticWord.vue';

const targetPhonetics = getPhonetics('ship');
</script>

<template>
  <PhoneticWord
    :word="targetPhonetics.word"
    :phonetic-chunks="targetPhonetics.chunks"
    :word-audio="targetPhonetics.audioUrl"
  />
</template>
```

## Files

### Source Files
- `src/audio/word-list.ts` - Single source of truth for word list
- `src/audio/words.ts` - Audio URL helpers (uses word-list)
- `scripts/build-phonetic-index.ts` - Build script
- `src/services/phonetics.ts` - Runtime service

### Generated Files (git-committed)
- `src/services/phonetics.generated.ts` - Phonetic index (43KB)

### Build-Time Data (never deployed)
- `content/phoneticAnalytics/src-data/cmudict.dict` - Full CMUdict (3.5MB)
- `content/phoneticAnalytics/lib/` - GPC alignment engine

## Benefits

✅ **Tiny runtime bundle**: Only 43KB for 70 words (~10KB gzipped)
✅ **Type-safe**: Strong TypeScript types throughout
✅ **Single source of truth**: Word list drives everything
✅ **Accurate alignments**: Uses production GPC engine
✅ **No guessing**: Framework doesn't infer URLs, only fetches explicit data
✅ **Build-time validation**: Fails fast if word missing from CMUdict

## Future Enhancements

- Add phoneme audio files to `/audio/phonemes/`
- Use phonetic chunks in WordSelection for difference highlighting
- Extend to support phoneme-by-phoneme playback in educational exercises
- Add support for alternative pronunciations (homographs)
