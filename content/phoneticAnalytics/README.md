# Phonetic Analytics Engine

## Motivation

This directory contains the **GPC (Grapheme-Phoneme Correspondence) Engine**, a structured engineering approach to curriculum planning.

## Important Distinctions

> ⚠️ **Read this first if you're modifying the analytics or curriculum.**

### Analytics Infrastructure ≠ Teaching Curriculum

This codebase serves two **distinct purposes**:

| Analytics ("Backend") | Teaching Curriculum |
|-----------------------|---------------------|
| Parse real usage to *inform* curriculum | Define what we actually teach |
| Comprehensive (cover all English patterns) | Selective (what's teachable) |
| "What patterns exist in English?" | "What patterns should we teach, in what order?" |

**The analytics catalogue should be comprehensive.** We need accurate corpus descriptions to make good curriculum decisions. If `ar → /ɑːr/` exists in English, it belongs in the analysis catalogue—even if we don't teach it in lesson 1.

**The teaching curriculum can be a subset.** We're not obligated to teach everything we can analyze. Simple, clear patterns first; complex patterns later or never.

**Common Error**: "We're teaching monosyllabic words, so we should only analyze GPCs in monosyllabic contexts." This is **wrong**. The monosyllabic focus is a *teaching constraint*, not an *analysis constraint*. We analyze GPCs across the full corpus to understand their utility, then teach them in a monosyllabic context.

### Word Filters vs Catalogue Scope

- **Word filters** (monosyllables, high-frequency, CVC-only) constrain which **words** we use for instruction.
- **Catalogue scope** determines which **patterns** we can recognize in analysis.

These are orthogonal. Use a comprehensive catalogue to analyze monosyllables. Use word filters to select monosyllables for teaching.

### "Exception" vs "Not Yet Taught"

- An **exception word** genuinely doesn't follow any pattern (e.g., "colonel").
- A word like "car" uses the `ar` pattern—it's not an exception, we just haven't taught `ar` yet.

If a word aligns successfully with the comprehensive catalogue, it's regular. Whether a student can decode it depends on their current instruction level.

See `config/catalogue-design-2.md` for the full design rationale.

---

It evolved from a set of ad-hoc scripts into a cohesive library to solve the following problems:
*   **Verifiable Spelling:** Spelling is harder than reading due to "many-to-one" mappings (e.g., /k/ -> c, k, ck). We need rigorous data to schedule "disambiguation lessons" (e.g., when to use 'c' vs 'k').
*   **Single-Syllable Foundation:** We focus initially on a "closed universe" of monosyllabic words as a "decodability training ground" before introducing complex morphological rules (suffixes, etc.). **Note:** This is a *teaching* constraint, not an *analysis* constraint. The analytics engine uses a comprehensive GPC catalogue across the full corpus; we then filter to monosyllables for early instruction. See "Important Distinctions" above.
*   **Mathematical Optimization:** To inform the teaching order, we use a greedy set-cover algorithm to determine the most efficient sequence of GPCs to unlock the maximum number of high-frequency words.

## Library Usage (`lib/`)

The core logic resides in `lib/` and is designed to be imported by both the analysis scripts and the runtime application.

### Key Modules

*   **`catalogue.ts`**: The "Rulebook." Loads `config/gpc-catalogue.json`, defining all legal sound-spelling mappings.
*   **`alignment.ts`**: The "Decoder." Aligns words (e.g., "cake") with their phonemes (/K/ /EY/ /K/) to identify the GPCs used (`c`, `a_e`, `k`). Handles "Magic E" and other patterns. Also provides `decodeWord()` and `decodeText()` convenience wrappers.
*   **`cmudict.ts`**: CMU Dictionary loader and pronunciation lookup. Singleton pattern for efficient reuse.
*   **`scorer.ts`**: The "Gatekeeper." Checks if a word is decodable given a set of known GPCs. Useful for generating "Blurry Text" or filtering word lists.
*   **`coverage.ts`**: The "Strategist." Implements greedy set-cover optimization for GPC sequencing.

## Scripts (`scripts/`)

### 1. Data Extraction: `extract-gpcs.ts`
*   **Input:** `src-data/cmudict.dict` (Phonemes), `src-data/subtlex.json` (Frequency).
*   **Action:** Filters for monosyllables, aligns every word to its GPCs using the library, and identifies "Exception Words" that don't fit the rules.
*   **Output:** `outputs-v2/gpc-words.json` (The "Universe" of valid words), `gpc-exceptions.json`, `gpc-stats.json`.

### 2. Greedy Sequencer: `gpc-sequencer.ts`
*   **Input:** `outputs-v2/gpc-words.json`.
*   **Action:** Runs the greedy set-cover algorithm to order GPCs by utility (frequency of words unlocked).
*   **Output:** `outputs-v2/gpc-sequence.json` (Simple "Roadmap").

### 3. Utility: `gpc-compare.ts`
*   A utility to compare arbitrary GPCs or words for debugging alignment issues.

### 4. Phoneme Frequency: `phoneme-frequency.ts`
*   Analyzes phoneme distribution across the corpus.

## Configuration (`config/`)

### GPC Catalogues

We maintain multiple catalogue versions for different purposes:

| Catalogue | Purpose | Use For |
|-----------|---------|---------|
| `gpc-catalogue.json` (→ v0.2) | Core teaching patterns | Curriculum design, early instruction |
| `gpc-catalogue-v0.3-extended.json` | + R-controlled, more vowel teams | Intermediate teaching |
| `gpc-catalogue-v0.4-comprehensive.json` | + Silent letters, syllabics | Corpus analysis, coverage metrics |
| `gpc-catalogue-v0.5-full.json` | + Schwa, morphology | Full corpus alignment |

**Key principle:** Use comprehensive catalogues (v0.4/v0.5) for *analysis* and simpler catalogues (v0.2/v0.3) for *teaching*. See `config/catalogue-design-2.md` for rationale.

### `gpc-catalogue.json` (Default)
The definitions of Graphemes and Phonemes. JSON object with metadata and grapheme mappings:
*   **Meta section**: Version and format notes
*   **Graphemes section**: Organized by category:
    *   `consonants`: Single-letter consonants (`b`, `c`, etc.)
    *   `digraphs`: Two-letter consonants (`th`, `sh`, `ch`, etc.)
    *   `trigraphs`: Three-letter consonants (`igh`, `tch`, `dge`)
    *   `vowels_short`: Short vowel sounds (`a` → `["AE"]`)
    *   `vowels_long_split`: Split digraphs/Magic E patterns (`a_e` → `["EY"]`)
    *   `vowels_teams`: Vowel digraphs (`ai`, `ee`, `oa`, etc.)
    *   `vowels_l_controlled`: L-controlled vowel patterns (`all`, `alk`)
    *   `vowels_final_open`: Final vowel patterns (`e_final`, `y_final`)
    *   `doubled_consonants`: Geminate consonants (`bb`, `ff`, `ll`, etc.)
*   **Mapping format**: `{ "grapheme": ["PHONEME1", "PHONEME2", ...] }`
*   **Multi-phoneme sequences**: Use space-separated notation (e.g., `"x": ["K S"]`)
*   **Split digraphs**: Use underscore notation (e.g., `a_e` for "cake")
*   **Example**: `"c": ["K", "S"]` indicates 'c' can produce /k/ (cat) or /s/ (cell)

## Data Sources (`src-data/`)

### `cmudict.dict`
The CMU Pronouncing Dictionary (0.7b). Plain text format with one word per line:
*   **Format**: `<word> <phoneme1> <phoneme2> ... # optional comment`
*   **Example**: `cake K EY1 K`
*   **Phonemes**: Uppercase ARPAbet symbols with stress markers (0=unstressed, 1=primary, 2=secondary)
*   **Variants**: Words with multiple pronunciations use `(2)`, `(3)` suffixes (e.g., `read(2)`)

### `subtlex.json`
Word frequency data from subtitle corpus. JSON array of objects:
*   **Schema**: `[{ "word": string, "count": number }, ...]`
*   **Example**: `{ "word": "you", "count": 2134713 }`
*   **Purpose**: Frequency-weighted optimization to prioritize teaching high-utility words first

## Outputs (`outputs-v2/`)

*   `gpc-words.json` — Aligned word corpus (monosyllables + full corpus)
*   `gpc-exceptions.json` — Words that failed alignment
*   `gpc-stats.json` — Per-GPC frequency statistics
*   `gpc-sequence.json` — Greedy sequencer output

## Development

```bash
# From phoneticAnalytics directory
yarn install

# Run extraction pipeline (creates gpc-words.json)
npx tsx scripts/extract-gpcs.ts

# Run greedy sequencer
npx tsx scripts/gpc-sequencer.ts
```

## Pipeline Order

1. **extract-gpcs.ts** — Generate word corpus (run once, or when catalogue changes)
2. **gpc-sequencer.ts** — Generate optimized teaching sequence using greedy set-cover with stage gating and prerequisites

## Current Approach: Staged Greedy Optimization

The current sequencer (`calculate-gpc-sequence.ts`) uses a greedy set-cover algorithm enhanced with pedagogical constraints:

### Features
- **Stage gating**: GPCs are introduced in pedagogical cohorts (e.g., "Simple Consonants" → "Short Vowels" → "Consonant Digraphs"). The greedy algorithm can only select from GPCs available at the current stage.
- **Prerequisites**: Certain GPCs require prior knowledge (e.g., magic-e patterns require all short vowels first, sight word "you" requires knowing "y").
- **Decode-based coverage**: Uses alignment engine to determine decodability dynamically rather than pre-tagged GPCs.

### Characteristics
- **Locally optimal**: Within each stage, picks the GPC that unlocks the most frequency-weighted words.
- **Pedagogically structured**: Stage boundaries enforce conceptual progression ("one new idea at a time").
- **Still myopic**: Does not look ahead to evaluate alternative orderings within a stage—prone to local maxima.

## Future Directions

Two advanced features were explored but removed as they proved too complex for the current scope:

### Beam Search Sequencing
A beam search implementation could address the myopia of greedy selection by exploring multiple candidate paths simultaneously:
- **Multi-path exploration**: Maintain top-K sequences at each step instead of committing to a single choice.
- **Global optimization**: Evaluate which orderings perform better over the full sequence, not just the next step.
- **Advanced constraints**: Clarity ratios, confusion penalties, balancing rules.
- **Reproducibility**: Configuration hashing for experiment tracking.

The challenge is balancing optimization sophistication with output legibility. The current staged-greedy approach produces readable, explainable sequences that respect major pedagogical boundaries. Beam search could find better orderings within stages but at significant complexity cost.

### Confusion Analysis
Systematic analysis of "maldecoding surface area"—identifying which words will be misread when similar GPCs are taught in proximity:
- **Confusion indexing**: Quantify risks between similar patterns (e.g., `i` vs `i_e`, `c` vs `k`).
- **Time integral**: Evaluate confusion exposure over the full teaching sequence.
- **Minimal pair awareness**: Identify trap words that differ by one GPC (e.g., "bit" vs "bite").
- **Disambiguation scheduling**: Inform when to introduce clarifying lessons (e.g., "when to use 'c' vs 'k'").

This would complement sequencing by providing data-driven feedback on which orderings create confusion traps. Could be used as a scoring penalty in optimization or as a post-hoc analysis tool.

Both features remain viable future enhancements if curriculum complexity warrants the added implementation cost.

## Design Documents

| Document | Purpose |
|----------|---------|
| `config/catalogue-design-2.md` | **Current guidance.** Clarifies the distinction between analytics infrastructure and teaching curriculum. Read this first. |
