# Phonetic Analytics Library

A TypeScript library for phonetic analysis of English grapheme-phoneme correspondences (GPCs), optimized for early literacy curriculum design.

## Purpose

This library consolidates scattered phonetic analysis scripts into a coherent, reusable module. It supports:

1. **Curriculum Prioritization**: Determine which GPCs to teach first for maximum decodable coverage
2. **Set Cover Optimization**: Greedy selection of GPCs that unlock the most high-frequency words
3. **Confusion Analysis**: Identify "maldecoding traps" where partial knowledge leads to errors
4. **Visual/Phonetic Utility Scoring**: Combine frequency, reliability, and visual complexity factors

## Phoneme Representation: ARPAbet Standard

**All phonemes in this library use ARPAbet notation** (as defined by CMU Dictionary).

### Why ARPAbet?

| Consideration | IPA | ARPAbet | Winner |
|--------------|-----|---------|--------|
| ASCII-safe (filenames, JSON keys, code) | ❌ /æ/, /θ/, /ʃ/ | ✅ AE, TH, SH | ARPAbet |
| Unambiguous (no diacritics) | ❌ /a/ vs /ɑ/ | ✅ distinct codes | ARPAbet |
| CMUDict native format | ❌ requires conversion | ✅ direct use | ARPAbet |
| Human readable for phoneticians | ✅ standard | ❌ niche | IPA |

For our purposes (code-friendly, data-pipeline-focused), ARPAbet wins decisively.

### ARPAbet Reference

See `/ref/arpabet-phonemes.md` for the complete reference. Summary:

**Vowels (15 phonemes)**:
- Monophthongs: AA, AE, AH, AO, EH, ER, IH, IY, UH, UW
- Diphthongs: AW, AY, EY, OW, OY

**Consonants (24 phonemes)**:
- Stops: P, B, T, D, K, G
- Fricatives: F, V, TH, DH, S, Z, SH, ZH, HH
- Affricates: CH, JH
- Nasals: M, N, NG
- Liquids: L, R
- Glides: W, Y

### Stress Markers

CMUDict marks vowel stress with digits (0=unstressed, 1=primary, 2=secondary):
```
about  AH0 B AW1 T
```

**Our convention**: Strip stress markers for GPC analysis (English orthography doesn't encode stress). The `stripStress()` helper handles this.

## Architecture

```
lib/
├── README.md                 # This file
├── index.ts                  # Public API exports
├── types.ts                  # Core type definitions
├── arpabet.ts                # ARPAbet constants and utilities
├── catalogue.ts              # GPC catalogue (GPC_CATALOGUE, teaching tiers)
├── alignment.ts              # Grapheme-to-phoneme alignment engine
├── dictionary.ts             # CMUdict + SUBTLEX loaders
├── decode.ts                 # Decodability checks
├── coverage.ts               # Greedy set-cover optimization for GPC sequencing
├── minimal-pairs.ts          # Minimal-pair analysis
├── chunk-builder.ts          # Word chunking for card rendering
├── match-types.ts            # GPC match-type classification
├── word-filter.ts            # Corpus word filtering
├── srs.ts                    # SRS helpers
│
│   # Curriculum SoT (shared with the app via src/services/curriculum.ts)
├── curriculum.ts             # Lesson registry, GPC assignment, threshold policies
├── concept-tags.ts           # Mechanical concept-tag derivation
├── content-labelling.ts      # Branded tag / card-id helpers
├── curriculum-checks.ts      # Pure consistency checks (audit + admin panel)
└── curriculum-coverage.ts    # State-of-the-world report builder
```

> **History:** a constrained beam-search sequencer (`beam-search.ts`,
> `constraints.ts`, `sequencer-config.ts`, `sequencer-report.ts`,
> `confusion.ts` — top-K paths, confusion/maldecoding penalties,
> transposition-table memoization) was built on branch `beam-gpc-search`,
> merged, and removed in commit `508e2b5` in favor of the simpler
> staged-greedy approach in `coverage.ts`. Recover from git history if the
> confusion-penalty dimension is revived.

## Core Concepts

### GPC (Grapheme-Phoneme Correspondence)

A mapping from a written unit to a spoken unit:

```typescript
interface GPC {
  id: string;           // "GPC-sh-SH", "GPC-a_e-EY"
  grapheme: string;     // "sh", "a_e", "igh"
  phoneme: string;      // ARPAbet: "SH", "EY", "AY"
  category: GPCCategory;
}
```

**GPC ID format**: `GPC-{grapheme}-{phoneme}`
- Multi-phoneme sequences use underscore: `GPC-x-K_S` (x → /ks/)
- Split digraphs use underscore: `GPC-a_e-EY` (a...e → /eɪ/)

### GPC Catalogue

The source of truth for recognized graphemes and their valid phonemes:

```typescript
// config/gpc-catalogue.json
{
  "graphemes": {
    "consonants": { "b": ["B"], "c": ["K", "S"], ... },
    "digraphs": { "th": ["TH", "DH"], "sh": ["SH"], ... },
    "vowels_short": { "a": ["AE"], "e": ["EH"], ... },
    "vowels_long_split": { "a_e": ["EY"], "i_e": ["AY"], ... },
    ...
  }
}
```

### Alignment

Given a word and its phonemes (from CMUDict), produce GPC segmentation:

```typescript
alignWord("ship", ["SH", "IH", "P"])
// => [
//   { grapheme: "sh", phoneme: "SH", gpcId: "GPC-sh-SH" },
//   { grapheme: "i", phoneme: "IH", gpcId: "GPC-i-IH" },
//   { grapheme: "p", phoneme: "P", gpcId: "GPC-p-P" }
// ]
```

Alignment fails for irregular words (e.g., "said" where 'ai' → EH not EY).

### Coverage Optimization

Given frequency-weighted words tagged with required GPCs, find the teaching order that maximizes cumulative decodable coverage:

```
Step  GPC            Coverage  Sample Unlocks
1     GPC-th-DH      0.8%      the, that, this
2     GPC-a-AE       1.2%      a, at, an
3     GPC-t-T        3.4%      that, at, it
...
```

## Usage

```typescript
import {
  loadCatalogue,
  alignWord,
  GPCScorer,
  computeCoverageProgression,
  analyzeConfusion
} from './lib';

// Load the GPC catalogue
const catalogue = loadCatalogue('./config/gpc-catalogue.json');

// Align a word
const result = alignWord(catalogue, "chip", ["CH", "IH", "P"]);
// => { aligned: true, segments: [...], gpcs: ["GPC-ch-CH", "GPC-i-IH", "GPC-p-P"] }

// Compute optimal teaching sequence (staged greedy set cover)
// See scripts/calculate-gpc-sequence.ts for the full driver.
const result = computeDecodeOptimalSequence(catalogue, words, options);
// => ordered steps: { step, gpcId, marginalGain, coveragePercent, ... }
```

## Module Summary

### Core Modules

| Module | Purpose |
|--------|---------|
| `types.ts` | Core type definitions (GPC, TaggedWord, AlignmentResult, etc.) |
| `arpabet.ts` | ARPAbet constants, phoneme classification, stress handling |
| `catalogue.ts` | GPC catalogue and teaching-tier selection |
| `alignment.ts` | Word-to-GPC alignment engine |
| `dictionary.ts` | CMUdict + SUBTLEX loaders |
| `decode.ts` | Decodability checks given a known-GPC set |
| `coverage.ts` | Staged-greedy set-cover optimization (`computeDecodeOptimalSequence`) |
| `minimal-pairs.ts` | Minimal-pair analysis |

### Curriculum SoT Modules

| Module | Purpose |
|--------|---------|
| `curriculum.ts` | Lesson registry, per-GPC assignment, threshold policies |
| `concept-tags.ts` | Mechanical category/matchType → `concept:*` derivation |
| `content-labelling.ts` | Branded tag / card-id helpers |
| `curriculum-checks.ts` | Consistency checks (prod audit + admin panel) |
| `curriculum-coverage.ts` | `curriculum-coverage.md` report builder |

### Script Integration

See [`../CLAUDE.md`](../CLAUDE.md) §2 for the canonical pipeline table
(`parse-corpus-with-GPCs` → `calculate-gpc-sequence` →
`analyze-minimal-pairs` → `generate-strategy-configs` → `generate-cards` →
`deploy-content`).

## Non-ARPAbet Phoneme Spellings (Cleanup Needed)

The following files use IPA or informal spellings that should be converted to ARPAbet:

### Documentation Files (Human-readable, IPA acceptable alongside ARPAbet)

| File | Usage | Status |
|------|-------|--------|
| `agent/a.1.phoneme-recording-script.md` | IPA in tables (e.g., /æ/, /θ/) | Keep IPA for reference, ensure ARPAbet column exists |
| `content-rough/english-phonemes.md` | IPA primary | Keep as IPA reference doc |
| `content-rough/grapheme-phoneme-visual-analysis.md` | IPA (e.g., /ɪ/) | Keep as analysis doc |
| `ref/arpabet-phonemes.md` | IPA↔ARPAbet mapping | This IS the reference |

### Code/Data Files (Should be ARPAbet-only)

| File | Issue | Action |
|------|-------|--------|
| `src/audio/phonemes.ts` | Uses descriptive keys (`short_a`) not ARPAbet | Already has ARPAbet mapping via `ARPABET_TO_PHONEME` - OK |
| Recording filenames | `vowel_short_a.wav` not ARPAbet | OK for filenames; ARPAbet used in code mapping |

### Audio Asset Naming Convention

Current: `vowel_short_a.mp3`, `cons_th_unvoiced.mp3`
ARPAbet alternative: `AE.mp3`, `TH.mp3`

**Decision**: Keep descriptive filenames for human readability. The `getPhonemeByArpabet()` function provides the ARPAbet→path mapping. This is the correct abstraction.

## Integration with Runtime

The `src/audio/phonemes.ts` module already provides:

```typescript
// Get audio path by ARPAbet symbol
getPhonemeByArpabet('SH')  // => '/audio/phonemes/digraph_sh.mp3'
getPhonemeByArpabet('AE1') // => '/audio/phonemes/vowel_short_a.mp3' (stress stripped)
```

This library's analysis outputs can be consumed by the runtime via:
1. Generated JSON data files (GPC stats, word lists, progression)
2. Direct import if analysis code moves to a shared package

## Development

```bash
# From phoneticAnalytics directory
yarn install

# Full regeneration (canonical build order)
yarn gen:all

# Individual stages
yarn gen:words       # corpus parse
yarn gen:sequence    # greedy set-cover sequence
yarn gen:cards       # exercise cards + curriculum-coverage.md
yarn gen:strategies  # navigation strategy configs (reads generated-cards.json — run after gen:cards)

# Invariants
yarn test:cards
```

## References

- [CMU Pronouncing Dictionary](http://www.speech.cs.cmu.edu/cgi-bin/cmudict)
- [SUBTLEX-US](https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus)
- [ARPAbet Wikipedia](https://en.wikipedia.org/wiki/ARPABET)