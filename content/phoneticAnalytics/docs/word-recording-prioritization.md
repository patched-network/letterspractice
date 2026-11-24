# Word Recording Prioritization

**Status**: Implemented  
**Date**: 2026-01-28  
**Context**: LettersPractice content pipeline / phonetic analytics  

---

## Problem Statement

We need to create a **priority ordering for recording words** as raw materials for spelling exercises in LettersPractice. Recorded words serve as audio prompts for `WordSelection` exercises (minimal pair discrimination).

### Constraints

1. **Monosyllables only** (first pass) — reduces complexity, ensures clear phonetic contrasts
2. **Must enable minimal pair exercises** — each GPC/concept needs word pairs that isolate that contrast
3. **Weighted toward high-frequency and child-friendly words** — learning efficiency + appropriateness
4. **Reasonably compact set** — recording is human-intensive; minimize while covering requirements

### The Goal

For each concept (GPC) introduced in the curriculum sequence, ensure the corpus contains:
- Words demonstrating that GPC in context
- **Minimal pairs** that isolate the GPC contrast from distractors

**Examples**:
- After unlocking short vowels: `{it | at}`, `{hit | hat}`, `{did | dad}`
- After unlocking digraphs: `{win | wing | wig}`
- After unlocking magic-e: `{cap | cape}`, `{hop | hope}`

---

## Background: What We Have

### Data Sources

| Source | Count | Description |
|--------|-------|-------------|
| `corpus-words.json` | 45,361 | All words from SUBTLEX + CMUdict |
| `teaching-words.json` | 5,730 | Fully-aligned monosyllables (decodable) |
| `gpc-sequence.json` | ~150 steps | Optimal GPC teaching order |
| `catalogue.ts` | ~750 GPCs | All grapheme-phoneme correspondences |

### Existing Infrastructure

1. **GPC Catalogue** — defines all GPCs with match types, categories, priorities
2. **Alignment Engine** — maps words to their constituent GPCs
3. **Coverage Algorithm** — greedy set-cover for GPC sequence optimization
4. **`isMonosyllabic()`** — filters to single-syllable words

---

## Proposed Solution

### Definition: Minimal Pair

Two words form a **GPC-level minimal pair** if they have the same GPC structure except for **exactly one GPC position**:

- `cat` [GPC-c-K, GPC-a-AE, GPC-t-T] ↔ `bat` [GPC-b-B, GPC-a-AE, GPC-t-T] — onset GPC differs
- `cat` [GPC-c-K, GPC-a-AE, GPC-t-T] ↔ `cut` [GPC-c-K, GPC-u-AH, GPC-t-T] — nucleus GPC differs
- `cat` [GPC-c-K, GPC-a-AE, GPC-t-T] ↔ `cap` [GPC-c-K, GPC-a-AE, GPC-p-P] — coda GPC differs

**Important distinction from phoneme-level pairs:**

Phoneme-level: `you` [Y UW] ↔ `to` [T UW] would be a minimal pair (onset phoneme differs)

GPC-level: `you` [GPC-WORD-you] ↔ `to` [GPC-WORD-to] are **NOT** a minimal pair because:
- They have different GPC structures (both are whole-word GPCs)
- The graphemic representation of /UW/ differs: "ou" vs "o"

For curriculum purposes, we use **GPC-level minimal pairs** to ensure learners see consistent spelling patterns.

### Algorithm Overview

**Two-phase approach:**

#### Phase 1: GPC-Driven Minimal Pair Identification

For each GPC `g` in the teaching sequence (in order):

1. Find all monosyllables containing `g`
2. For each word `w`, find minimal pair candidates:
   - Same word shape (e.g., CVC ↔ CVC)
   - Differ by exactly one phoneme
   - The differing position involves `g` in `w`
3. Select top candidates by:
   - Word frequency (higher = better)
   - Pair partner availability (must have a recorded partner)
   - Contrast clarity (avoid confusing near-misses)

#### Phase 2: Set-Cover Optimization

Once we have GPC requirements, minimize the recording list:

1. Build a bipartite graph: Words ↔ GPCs they cover
2. Add edges for minimal pair relationships
3. Greedily select words that:
   - Satisfy the most unsatisfied GPC requirements
   - Serve as minimal pair partners for already-selected words
   - Have highest frequency (tiebreaker) >>> instead of a tiebreaking semantic here, let's aim for a sort of weighted average of goals ?

### Output Format

```json
{
  "priority": 1,
  "word": "cat",
  "phonemes": ["K", "AE", "T"],
  "gpcs_covered": ["GPC-c-K", "GPC-a-AE", "GPC-t-T"],
  "minimal_pairs": [
    { "partner": "bat", "contrast_position": "onset", "gpc_contrast": ["GPC-c-K", "GPC-b-B"] },
    { "partner": "cut", "contrast_position": "nucleus", "gpc_contrast": ["GPC-a-AE", "GPC-u-AH"] },
    { "partner": "cap", "contrast_position": "coda", "gpc_contrast": ["GPC-t-T", "GPC-p-P"] }
  ],
  "frequency": 12345,
  "unlock_step": 8
}
```

---

## Requirements Per GPC

### Minimum Viable

| Requirement | Count | Rationale |
|-------------|-------|-----------|
| Words demonstrating GPC | ≥2 | Need variety |
| Minimal pair sets | ≥1 | Core exercise type |
| Words in minimal pairs | ≥2 | By definition |

### Target

| Requirement | Count | Rationale |
|-------------|-------|-----------|
| Words demonstrating GPC | 3-5 | Variety without bloat |
| Minimal pair sets | 2-3 | Different contrast types |
| Total words per GPC | 5-10 | Sweet spot |

### Estimation

- ~100 GPCs in core curriculum (first 100 steps of sequence)
- ~5-10 words per GPC (with significant overlap)
- **Estimated corpus size: 300-500 words** for comprehensive coverage

---

## Child-Friendliness Filtering

### Approach

1. **Frequency as proxy** — SUBTLEX corpus is from subtitles; high-frequency words tend to be common vocabulary
2. **Explicit blacklist** — filter profanity, violence, adult themes
3. **Concrete noun preference** — when choosing between synonyms, prefer concrete/imageable words
4. **No proper nouns** — avoid names, places (pronunciation varies)

### Implementation

```typescript
interface ChildFriendlinessFilter {
  // Hard exclusions
  blacklist: Set<string>;
  
  // Soft preferences (scoring adjustments)
  concretenessBonus: number;  // If word appears in imagery list
  frequencyFloor: number;     // Minimum SUBTLEX frequency
}
```

---

## Algorithm Details

### Step 1: Build Minimal Pair Index

```typescript
type MinimalPairIndex = Map<string, MinimalPairInfo[]>;

interface MinimalPairInfo {
  partner: string;
  contrastPosition: 'onset' | 'nucleus' | 'coda';
  phonemeA: ArpabetPhoneme;
  phonemeB: ArpabetPhoneme;
  gpcA?: string;  // GPC in this word
  gpcB?: string;  // GPC in partner
}
```

**Computation:**
1. Load all monosyllables from `teaching-words.json`
2. Group by phoneme pattern length (e.g., all 3-phoneme words)
3. Within each group, compare pairs:
   - Count differing positions
   - If exactly 1, record the minimal pair

### Step 2: Score Words

```typescript
function scoreWord(word: WordRecord, context: ScoringContext): number {
  let score = 0;
  
  // Base frequency (log scale)
  score += Math.log10(word.frequency + 1) * 10;
  
  // GPC coverage value
  for (const gpc of word.gpcs) {
    if (context.unsatisfiedGpcs.has(gpc)) {
      score += context.gpcValue(gpc);
    }
  }
  
  // Minimal pair bonus
  const pairs = context.minimalPairIndex.get(word.word) ?? [];
  for (const pair of pairs) {
    if (context.selectedWords.has(pair.partner)) {
      score += 50;  // Synergy bonus
    }
  }
  
  // Child-friendliness adjustments
  if (context.blacklist.has(word.word)) return -Infinity;
  
  return score;
}
```

### Step 3: Greedy Selection

```typescript
function selectRecordingCorpus(
  words: WordRecord[],
  requirements: GPCRequirements,
  maxWords: number
): PrioritizedWord[] {
  const selected: PrioritizedWord[] = [];
  const context = initializeContext(words, requirements);
  
  while (selected.length < maxWords && hasUnsatisfiedRequirements(context)) {
    // Score all unselected words
    const scores = words
      .filter(w => !context.selectedWords.has(w.word))
      .map(w => ({ word: w, score: scoreWord(w, context) }))
      .sort((a, b) => b.score - a.score);
    
    // Take the best
    const best = scores[0];
    if (best.score <= 0) break;
    
    // Add to selection
    selected.push({
      priority: selected.length + 1,
      ...best.word,
      minimal_pairs: findPairs(best.word, context)
    });
    
    // Update context
    updateContext(context, best.word);
  }
  
  return selected;
}
```

---

## Phased Rollout

### Wave 1: Foundation (Priority 1-50)

Focus: Simple consonants + short vowels (Steps 1-15 of gpc-sequence)

Target words:
- CVC patterns: `cat`, `dog`, `sit`, `hat`, `bed`, `cup`, `pig`, `sun`
- High-frequency: `it`, `in`, `is`, `at`, `on`, `up`
- Classic minimal pairs: `bat/cat/hat/mat/sat`, `pin/pen/pan`, `hit/hot/hut`

### Wave 2: Digraphs (Priority 51-150)

Focus: th, sh, ch, wh, ck, ng (Steps 15-30)

Target words:
- Initial digraphs: `the`, `this`, `that`, `she`, `ship`
- Final digraphs: `with`, `fish`, `wish`, `much`, `such`
- ng patterns: `sing`, `ring`, `thing`, `wing`

### Wave 3: Long Vowels (Priority 151-300)

Focus: Magic-e, vowel teams (Steps 30-60)

Target words:
- Magic-e pairs: `cap/cape`, `hop/hope`, `cut/cute`, `bit/bite`
- Vowel teams: `rain`, `boat`, `feet`, `road`

### Wave 4: Advanced (Priority 301-500)

Focus: R-controlled, soft c/g, silent letters (Steps 60-100)

---

## Implementation Plan

### Files to Create

1. `scripts/generate-recording-priorities.ts` — main algorithm
2. `lib/minimal-pairs.ts` — minimal pair detection
3. `outputs-v2/recording-priorities.json` — output list

### Dependencies

- Existing: `teaching-words.json`, `gpc-sequence.json`, `catalogue.ts`
- New: Child-friendliness blacklist (can start minimal)

### Estimated Effort

- Core algorithm: 4-6 hours
- Testing/tuning: 2-4 hours
- Documentation: 1-2 hours

---

## Open Questions

1. **Recording format**: What audio format/quality is needed? (Affects prioritization if some words are harder to record clearly)
>>> recording at home w/ blue-yeti + audacity + some ffmpeg for enforcing 'round' onset and offset for file audio (avoid bg static 'popping in'). encoding MP3. Going for reasonable clarity + performance / bandwidth trade here on mostly unambiguous words. will normalize via vue-skuilder `packages/express/src/attachment-preprocessing/normalize-local.ts` . Rough recording plan is to start from a *list*, and record raw in audacity the entire thing. Save that project.  then cut individual words from it to their own projects, export them as mp3s, then run the batch normalization + ramp-up/ramp-down 'rounded corners' scripting.

2. **Speaker**: Single voice or multiple? (Affects variety requirements)
>>> single voice for now - will later do a full duplication w/ female voice.

3. **Existing recordings**: Are there any words already recorded that should seed the algorithm?
>>> /commercial/letterspractice/extracted-audio/words has a collection of *sufficient quality* recordings. Can serve as a basis

4. **Explicit word list input**: Should there be a way to force-include certain words regardless of algorithm?
>>> add this, yes, but for first runs keep it empty.

5. **Multi-word phrases**: Any need for phrases like "the cat" or strictly single words?
>>> This is strictly single words. 

---

## Implementation Status

### Completed

1. [x] Review and approve approach
2. [x] Implement GPC-level minimal pair detection (`lib/minimal-pairs.ts`)
3. [x] Implement word filter (`lib/word-filter.ts`)
4. [x] Implement scoring algorithm (`scripts/generate-recording-priorities.ts`)
5. [x] Generate initial priority list

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `analyze-minimal-pairs.ts` | `yarn analyze:pairs` | Analyze GPC minimal pair structure |
| `generate-recording-priorities.ts` | `yarn gen:priorities` | Generate prioritized recording list |

### Outputs

| File | Description |
|------|-------------|
| `outputs-v2/gpc-minimal-pairs.json` | Full GPC minimal pair index |
| `outputs-v2/gpc-minimal-pair-stats.json` | Statistics and analysis |
| `outputs-v2/recording-priorities.json` | Full prioritized word list |
| `outputs-v2/recording-priorities-summary.md` | Human-readable summary |
| `outputs-v2/words-to-record.txt` | Simple word list for recording sessions |

### Next Steps

1. [ ] Manual review of generated word list for child-friendliness
2. [ ] Begin recording process (Wave 1: ~200 foundational words)
3. [ ] Iterate on blacklist as issues are found
4. [ ] Re-run priority generation after recordings complete

---

## Appendix: Actual Output (2026-01-28)

### Statistics

| Metric | Value |
|--------|-------|
| Total words selected | 600 |
| Already recorded | 19 |
| **Needs recording** | **581** |
| GPCs fully covered (3+) | 90 |
| GPCs partially covered | 26 |
| Total minimal pairs | 4314 |

### Top 20 Priority Words (Phase 1: Foundational)

| Priority | Word | Frequency | Step | GPCs |
|----------|------|-----------|------|------|
| 1 | that | 719,677 | 10 | th-DH, a-AE, t-T |
| 2 | this | 406,915 | 10 | th-DH, i-IH, s-S |
| 3 | not | 276,673 | 4 | n-N, o-AA, t-T |
| 4 | can | 267,620 | 8 | c-K, a-AE, n-N |
| 5 | but | 225,291 | 29 | b-B, u-AH, t-T |
| 6 | up | 187,170 | 30 | u-AH, p-P |
| 7 | got | 168,631 | 14 | g-G, o-AA, t-T |
| 8 | back | 102,467 | 46 | b-B, a-AE, ck-K |
| 9 | time | 99,890 | 31 | t-T, i_e-AY, m-M |
| 10 | take | 96,443 | 34 | t-T, a_e-EY, k-K |
| 11 | man | 94,133 | 6 | m-M, a-AE, n-N |
| 12 | them | 90,720 | 13 | th-DH, e-EH, m-M |
| 13 | then | 75,966 | 13 | th-DH, e-EH, n-N |
| 14 | make | 70,775 | 34 | m-M, a_e-EY, k-K |
| 15 | thing | 55,522 | 49 | th-TH, i-IH, ng-NG |
| 16 | home | 39,491 | 58 | h-HH, o_e-OW, m-M |
| 17 | big | 34,824 | 28 | b-B, i-IH, g-G |
| 18 | fine | 30,502 | 31 | f-F, i_e-AY, n-N |
| 19 | lot | 29,066 | 22 | l-L, o-AA, t-T |
| 20 | made | 28,626 | 34 | m-M, a_e-EY, d-D |

### Algorithm Details

The algorithm runs in two phases:

1. **Phase 1: Foundational Words** — Force-include ~160 classic minimal pair words (cat/bat/hat, pin/pen/pan, etc.) sorted by frequency
2. **Phase 2: Greedy Selection** — Score remaining words by:
   - Frequency (log scale, weight=25)
   - GPC coverage (unsatisfied GPCs, weight=30)
   - Minimal pair synergy (pairs with selected words, weight=40)
   - Already-recorded bonus (weight=80)

Words with whole-word GPCs (sight words like "the", "you", "to") are excluded since they don't have decomposable GPC structure for minimal pairs.
