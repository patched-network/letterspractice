# GPC Extraction Pipeline

## Mission

Extract **Grapheme-Phoneme Correspondences (GPCs)** from monosyllabic words to build a phonics curriculum. The GPCs form the basis for:

1. **Tagging content** with prerequisite knowledge (e.g., `GPC-sh-SH`, `GPC-a_e-EY`)
2. **Prioritizing instruction** by GPC frequency/utility
3. **Sequencing curriculum** to maximize decodable word coverage

We use monosyllables as the primary teaching vehicle (cleaner alignment, immediate feedback), but measure coverage against the full corpus (real-world reading).

## Quick Start

```bash
cd letterspractice/content
yarn install

yarn extract    # Run extraction pipeline
yarn sequence   # Compute optimal teaching order
yarn compare    # Compare scoring strategies side-by-side
yarn confusion  # Analyze maldecoding/confusion traps
yarn viewer     # Serve viewer at localhost:8080
```

## Data Sources

| Source | Path | Description |
|--------|------|-------------|
| CMUDict | `src-data/cmudict.dict` | Word → Arpabet phonemes |
| SUBTLEX | `src-data/subtlex.json` | Word → frequency (movie/TV subtitles) |
| GPC Catalogue | `config/gpc-catalogue.json` | Canonical grapheme definitions |

See `ref/arpabet-phonemes.md` for Arpabet phoneme reference.

### SUBTLEX Cleaning

Contraction fragments (s, t, m, d from "it's", "can't", "I'm", "I'd") have been removed. Single-letter words "I" and "a" retained.

## GPC Catalogue Structure

The catalogue (v0.2) groups graphemes by **teachable idea**:

```
consonants           b, c, d, f, ... (single letters)
doubled_consonants   bb, dd, ff, ... (gemination)
digraphs             th, sh, ch, ck, ng, ph, wh
trigraphs            igh, tch, dge
vowels_short         a→AE, e→EH, i→IH, o→AA, u→AH
vowels_long_split    a_e→EY, e_e→IY, i_e→AY, o_e→OW, u_e→UW (magic-e)
vowels_teams         ay, ee, oo, ai, oa, ow, ou, oi, oy
vowels_l_controlled  all→AO L, alk→AO K (multi-phoneme)
vowels_final_open    e_final→IY, y_final→AY, o_final→OW
```

**Notation:**
- Split digraphs use underscore: `a_e` for "cake"
- Multi-phoneme sequences use space: `"AO L"` means grapheme produces two phonemes
- GPC IDs use underscore for multi-phoneme: `GPC-all-AO_L`

## Pipeline

### Core Module: `scripts/gpc-scorer.ts`

Reusable scorer for words and text based on weighted GPC competencies.

```typescript
import { GPCScorer } from './gpc-scorer.js';

const scorer = GPCScorer.fromCatalogue('config/gpc-catalogue.json');

// Binary scoring (all GPCs fully known)
scorer.setAllKnown();
const result = scorer.scoreWord('cat', ['K', 'AE', 'T']);
// => { word: 'cat', score: 1.0, segments: [...], aligned: true }

// Weighted competencies (simulate partial learning)
scorer.setWeights({
  'GPC-th-DH': 0.5,   // 'th' half-learned
  'GPC-a_e-EY': 0.7,  // magic-e 70% learned
});
scorer.setDefaultWeight(1.0);

// Blurry-compatible output
const segments = scorer.annotateWordForBlurry('cake', ['K', 'EY', 'K']);
// => [{ text: 'c', score: 1.0 }, { text: 'a', score: 0.7 }, { text: 'k', score: 1.0 }]
```

**Aggregation modes** for word scores:
- `product`: multiply segment scores (harsh - one unknown tanks word)
- `min`: minimum segment score (very harsh)
- `mean`: average (lenient)
- `geometric`: geometric mean (balanced)

### Extraction: `scripts/extract-gpcs.ts`

```bash
yarn extract
```

**Process:**
1. Load catalogue, CMUDict, SUBTLEX
2. Filter to monosyllables (one vowel phoneme)
3. Attempt left-to-right grapheme→phoneme alignment
4. Output aligned words, exceptions, and aggregated stats

**Alignment strategy:**
- Check longest graphemes first (trigraphs → digraphs → single letters)
- Handle CVCe (magic-e) pattern specially with split digraph
- Handle multi-phoneme graphemes (all→AO L, x→K S)
- Check `*_final` patterns at word-final position
- Flag as exception if alignment fails

### Sequencer: `scripts/gpc-sequencer.ts`

Computes optimal GPC teaching order using greedy set-cover algorithm.

```typescript
import { GPCSequencer } from './gpc-sequencer.js';

const sequencer = new GPCSequencer(alignedWords);

// Optional constraints
sequencer.setInitialKnown(['GPC-t-T', 'GPC-n-N']);  // baseline knowledge
sequencer.setExcluded(['GPC-x-K_S']);              // skip these
sequencer.setMinFrequency(100);                     // word threshold

const result = sequencer.computeGreedySequence();
// => { sequence: [{ step: 1, gpcId: 'GPC-i-IH', coveragePercent: 8.1 }, ...] }
```

```bash
yarn sequence
```

### Comparison: `scripts/gpc-compare.ts`

Runs multiple scoring strategies side-by-side to evaluate which best models learner experience.

```bash
yarn compare                   # All GPCs, all strategies
yarn compare --single-letter   # Constrain to single-letter GPCs only
yarn compare --top=15          # Limit output rows
```

**Strategies compared:**
- `binary`: Word counts only when ALL GPCs known (current sequencer behavior)
- `mean`: Partial credit via fraction of known GPCs (lenient)
- `geometric`: Geometric mean of segment scores (balanced)

**Key finding:** Binary and geometric produce identical sequences for 0/1 weights. Mean diverges significantly, prioritizing high-frequency consonants first.

### Confusion Analysis: `scripts/gpc-confusion.ts`

Analyzes "maldecoding surface area" — words where applying a known GPC produces incorrect pronunciation.

```bash
yarn confusion
```

**Three types of confusion traps:**

1. **Same-grapheme**: `s-S` learned, but word uses `s-Z` (e.g., "is" pronounced /ɪs/ instead of /ɪz/)
2. **Substring**: `i-IH` learned, but word uses `igh-AY` (e.g., "right" decoded as /rɪt/)
3. **Magic-e**: `i-IH` learned, but word uses `i_e-AY` (e.g., "like" decoded as /lɪk/)

**Key metrics:**
- **Clarity ratio**: correct_freq / confusion_freq (higher = more "well-behaved")
- **Confusion-time integral**: cumulative confusion × steps (minimize this)

**Example output for short-i:**
```
GPC-i-IH (short i):
  Correct: 3.95M freq
  Substring confusion: 453K (right, night, high)
  Magic-e confusion: 599K (like, time, life)
  Clarity ratio: 3.75
```

**Insight:** Teaching `i-IH` at step 5 and `i_e-AY` at step 31 means learners carry ~600K confusion for 26 steps. Teaching them closer together reduces confusion-time.

### Viewer: `viewer.html`

Interactive HTML viewer for exploring pipeline outputs.

```bash
yarn viewer
# Open http://localhost:8080/viewer.html
```

### Outputs

| File | Description |
|------|-------------|
| `outputs/gpc-words.json` | Successfully aligned words with GPCs |
| `outputs/gpc-exceptions.json` | Failed alignments, sorted by frequency |
| `outputs/gpc-stats.json` | Aggregated GPC statistics, progressive coverage |
| `outputs/gpc-sequence.json` | Optimal teaching order (greedy) |
| `outputs/gpc-comparison.json` | Side-by-side strategy comparison |
| `outputs/gpc-confusion.json` | Confusion profiles and sequence analysis |

## Current Status

**77 GPCs** extracted, covering:

| Scope | Words | Coverage |
|-------|-------|----------|
| Monosyllables | 4,003 | 56.4% |
| Full corpus | 7,952 | 47.3% |

### Progressive Coverage (Full Corpus)

| Level | GPCs | Binary | Weighted |
|-------|------|--------|----------|
| Basic (single letters) | 31 | 16.9% | 33.9% |
| + Digraphs (th, sh...) | 56 | 25.2% | 37.4% |
| + Vowel teams (ay, ee...) | 70 | 36.1% | 42.5% |
| + Split/final (a_e, e_final) | 80 | 47.3% | 47.3% |

**Key insight:** With just basic letter knowledge, learners can partially decode ~34% of text even though only ~17% of words are fully decodable. This validates the incremental value of phonics instruction.

The 47.3% ceiling reflects that ~53% of corpus frequency is in irregular words (the, was, said, have...) requiring sight word recognition or additional GPC patterns.

### Sight Word Accommodation

Teaching high-frequency irregular words as sight words dramatically improves coverage:

| Strategy | Coverage | Gain |
|----------|----------|------|
| Phonics only | 47.3% | — |
| + Top 10 sight words | 65.4% | +18.1 |
| + Top 20 sight words | 70.2% | +22.9 |
| + Dolch preprimer (13 words) | 62.4% | +15.2 |

### Top GPCs by Frequency

| GPC | Words | Total Freq | Examples |
|-----|-------|------------|----------|
| GPC-t-T | 1,074 | 5.3M | it, that, not, just |
| GPC-i-IH | 592 | 3.9M | it, in, is, this |
| GPC-n-N | 675 | 3.5M | in, on, don, not |
| GPC-s-S | 1,317 | 2.3M | so, just, us, yes |
| GPC-a-AE | 589 | 2.3M | at, that, back, man |

### Top Exceptions

High-frequency words that fail alignment:

| Word | Freq | Issue |
|------|------|-------|
| i | 2.0M | `i` vs phoneme `AY` (standalone long-I) |
| the | 1.5M | `e` vs phoneme `AH` (schwa) |
| to | 1.2M | `o` vs phoneme `UW` (irregular) |
| a | 1.0M | `a` vs phoneme `AH` (schwa) |
| and | 683k | `and` vs phoneme `AH` (schwa) |
| of | 590k | `of` vs phoneme `AH` (schwa) |

Most exceptions involve **schwa** (unstressed vowel reduction) — a systematic irregularity in English.

## Extending Coverage

To add new patterns:

1. **Edit catalogue** (`config/gpc-catalogue.json`)
   - Add grapheme to appropriate group
   - List valid Arpabet phoneme(s)
   - Use space for multi-phoneme: `"AO L"`

2. **Re-run pipeline** (`yarn extract`)

3. **Review exceptions** - high-frequency failures indicate missing patterns

### Candidates for Future Addition

| Pattern | Examples | Notes |
|---------|----------|-------|
| R-controlled | ar, er, ir, ur, or | "car", "her", "bird" |
| Silent consonants | kn→N, wr→R | "know", "write" |
| `ould` trigraph | would, could, should | ould→UH D (silent L) |

## Design Decisions

1. **Monosyllable focus**: Cleaner alignment, avoids syllable boundary complexity
2. **Frequency weighting**: SUBTLEX (subtitle corpus) for real-world usage
3. **Grouped graphemes**: Categories represent teachable concepts
4. **Position notation**: `e_final` vs `e` distinguishes context-dependent sounds
5. **Multi-phoneme support**: `all→AO L` captures L-controlled vowels as units
6. **Exceptions are OK**: High-freq sight words (the, of, to) are expected irregulars

## Integration Points

### Blurry Visualization

The scorer produces output compatible with the `~/dev/blurry` visualization tool:
- Text segments with scores in [0, 1]
- Score represents "readability" given learner's GPC competencies
- Low scores render as blurred/faded text

```typescript
const segments = scorer.annotateWordForBlurry('cake', ['K', 'EY', 'K']);
// => [{ text: 'c', score: 1.0 }, { text: 'a', score: 0.7 }, { text: 'k', score: 1.0 }]
```

### Curriculum Sequencing

The sequencer outputs optimal teaching order:

```typescript
const result = sequencer.computeGreedySequence();
// Step 1: GPC-t-T      → 9.97% coverage
// Step 2: GPC-i-IH     → 15.3% coverage
// ...
```

This can drive:
1. **Lesson ordering** — which GPC to teach next
2. **Content gating** — unlock texts when prerequisite GPCs are mastered
3. **Progress visualization** — show coverage gains as learner advances

## File Structure

```
content/
├── package.json              # yarn 4.6, tsx
├── tsconfig.json
├── viewer.html               # Interactive data explorer
├── gpc-parsing.md            # This file
├── src-data/
│   ├── cmudict.dict          # CMU Pronouncing Dictionary
│   ├── subtlex.json          # Word frequencies
│   └── gpc-catalogue.json    # Grapheme definitions
├── outputs/
│   ├── gpc-words.json        # Aligned words
│   ├── gpc-exceptions.json   # Failed alignments
│   ├── gpc-stats.json        # Statistics
│   ├── gpc-sequence.json     # Optimal teaching order
│   ├── gpc-comparison.json   # Strategy comparison
│   └── gpc-confusion.json    # Confusion analysis
├── scripts/
│   ├── gpc-scorer.ts         # Core alignment/scoring
│   ├── extract-gpcs.ts       # Extraction pipeline
│   ├── gpc-sequencer.ts      # Curriculum sequencing
│   ├── gpc-compare.ts        # Strategy comparison harness
│   └── gpc-confusion.ts      # Maldecoding/confusion analysis
└── ref/
    └── arpabet-phonemes.md   # Phoneme reference
```
