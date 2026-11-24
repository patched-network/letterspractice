# GPC Catalogue Design v2: Analytics vs Curriculum

This document supersedes and clarifies an earlier catalogue-design note (not kept). It addresses a conceptual conflation that has caused confusion in earlier design discussions.

## The Core Distinction: Analysis ≠ Instruction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PHONETIC ANALYTICS ("Backend")          TEACHING CURRICULUM               │
│   ─────────────────────────────           ──────────────────               │
│                                                                             │
│   Purpose: Parse real usage               Purpose: Teach learners           │
│   Scope: Comprehensive (all English)      Scope: Selective (what to teach)  │
│   Goal: Accurate corpus description       Goal: Effective skill building    │
│   Question: "What patterns exist?"        Question: "What should we teach?" │
│                                                                             │
│   These are DIFFERENT things.                                               │
│   They may SHARE data structures, but serve different purposes.             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Conflation Error

We have repeatedly made this mistake:

> "Since we're teaching monosyllabic words, we should only analyze GPCs in monosyllabic contexts."

This is wrong. The correct framing:

> "We're teaching monosyllabic words as a **pedagogical foundation**. We analyze GPCs across the **full corpus** to inform curriculum decisions—including which monosyllables to teach, in what order, and what comes next."

### Why This Matters

| Decision Domain | Needs Full-Corpus Analysis | Uses Teaching Subset |
|-----------------|---------------------------|---------------------|
| "Which GPCs unlock the most high-frequency words?" | ✓ Yes (across all English) | — |
| "What's the confusion risk between `i` and `i_e`?" | ✓ Yes (all word types) | — |
| "Which words should a beginner practice today?" | — | ✓ Yes (monosyllables) |
| "What grapheme do we introduce in lesson 5?" | ✓ Informed by | ✓ Selected from |
| "How decodable is a given text for a student?" | Both: check against student's known GPCs | |

The analytics infrastructure must be **comprehensive** because curriculum decisions require understanding the full landscape. The curriculum itself can be as **simple** as pedagogically appropriate.

## Three Separate Inventories

We should maintain distinct (but related) inventories:

### 1. Analysis Catalogue (Comprehensive)

**Purpose**: Accurate alignment and coverage metrics across the full English corpus.

**Contents**: Every GPC pattern needed to successfully align CMUDict entries:
- All vowel teams (ea, ie, au, aw, ue, ew, ei, etc.)
- R-controlled vowels (ar, er, ir, or, ur, ear, air, are)
- Silent letter patterns (kn, wr, gn, mb, gh)
- Soft C/G contexts (ce, ci, cy, ge, gi, gy)
- Latinates (ti→SH, si→ZH)
- Schwa patterns (for polysyllabic accuracy)

**Validation Criterion**: Alignment success rate on CMUDict. Target: >95%.

### 2. Teaching Catalogue (Curated)

**Purpose**: Define what GPCs we explicitly teach, in what order.

**Contents**: A subset of the analysis catalogue, organized by:
- Teachability (can be explained simply)
- Utility (unlocks high-frequency words)
- Clarity (minimal ambiguity for beginners)

**Validation Criterion**: Pedagogical coherence, not corpus coverage.

### 3. Word Filters (Scoping)

**Purpose**: Define which words are appropriate for instruction at each stage.

**Examples**:
- "Monosyllables only" — for early decodable readers
- "No borrowed words" — avoid confusing etymological patterns
- "High-frequency only" — prioritize utility
- "CVC structure only" — phonics first-steps

**Key Insight**: These filters constrain the **word set**, not the analysis catalogue.

## The "Mental Model" Fallacy

A recurring concern:

> "If we have a detailed GPC model, won't we be forced to teach all of it?"

No. Consider an analogy:

- A **linguist** needs to know about the subjunctive mood, split infinitives, and dangling modifiers.
- A **kindergarten teacher** does not teach these things.
- The linguist's knowledge *informs* what the teacher eventually covers, but the teacher doesn't dump the full linguistic model onto 5-year-olds.

Similarly:

- Our **analytics engine** needs a comprehensive GPC model to accurately describe English.
- Our **curriculum** selects a teachable subset, introduces it in a learnable order, and makes pragmatic simplifications.

The code's detailed model is a *map*. We don't hand the full map to learners; we guide them along a chosen path.

## The "Digital Caricature" Concern

A subtler issue:

> "Humans use simple phonetic mappings literally. More obscure mappings may be less rigorously employed. Our model could drift from good-faith emulation of learners into digital caricature."

This is a valid concern, but it applies to the **teaching catalogue**, not the **analysis catalogue**.

### Analysis: Model Reality, Not Simplicity

For analysis, we want to model what English actually does:
- If `tion` → /ʃən/ in thousands of words, we should encode it.
- If `eau` → /oʊ/ only in "beau" and French loanwords, we still encode it (but note its rarity).

The analysis catalogue should be **descriptively accurate**, even for patterns humans don't consciously think about.

### Teaching: Model Learner Cognition

For teaching, we model what learners should internalize:
- Teach high-frequency, high-clarity patterns explicitly.
- Treat rare patterns as "exceptions" or defer them.
- Match the learner's cognitive level.

The teaching catalogue should be **pedagogically useful**, which often means simpler than reality.

### The Bridge

We don't need a formal "bridge function" between catalogues. Instead:

1. **Analysis catalogue** tells us: "These are all the patterns in English, with their frequencies."
2. **Curriculum designers** select: "These are the patterns worth teaching explicitly."
3. **Sequencer** optimizes: "This is an efficient order to teach the selected patterns."
4. **Word filters** constrain: "These are the words appropriate at each stage."

## Practical Implications

### For `extract-gpcs.ts`

This script should use the **analysis catalogue** (comprehensive) because:
- We want accurate alignment for all words in the corpus.
- We want honest coverage metrics.
- We want to identify words that require GPCs we haven't taught yet.

Even when filtering to monosyllables, we use the comprehensive catalogue for alignment.

### For `constrained-sequencer.ts`

The sequencer should:
- Operate on the **teaching catalogue** (the GPCs we're actually sequencing for instruction).
- Use **word filter** constraints (monosyllables, high-frequency, etc.) to scope evaluation.
- Reference **analysis catalogue** metrics to understand the full landscape.

### For Coverage Metrics

When we say "teaching `s`, `a`, `t` covers 12% of high-frequency words," that metric should be computed against the full corpus (or a reasonably broad slice), not just monosyllables. Otherwise we underestimate the utility of GPCs.

### For Confusion Analysis

Confusion analysis (can `bit` be misread as `bat`?) should consider all word pairs, not just monosyllables. Teaching happens in monosyllables; confusion happens everywhere the student encounters text.

## Revised Catalogue Strategy

### What We Already Have

| File | Role |
|------|------|
| `gpc-catalogue.json` → `v0.2-core` | Core teaching catalogue (current) |
| `v0.3-extended` | Teaching catalogue + R-controlled, more vowel teams |
| `v0.4-comprehensive` | Analysis-oriented: silent letters, syllabic consonants |
| `v0.5-full` | Full analysis: schwa, morphology, loanwords |

### Recommended Reclassification

| Purpose | Use Catalogue |
|---------|---------------|
| Alignment for corpus analysis | v0.5 (full) or v0.4 (comprehensive) |
| Coverage/utility metrics | v0.4 or v0.5 (honest accounting) |
| Sequencer input (what to teach) | v0.2 or v0.3 (teaching-appropriate) |
| Decodability scoring | Student's current teaching subset |

### Naming Clarity

Consider renaming:
- `gpc-catalogue-analysis.json` — comprehensive, for analytics
- `gpc-catalogue-teaching.json` — curated subset for curriculum

This makes the purpose explicit and prevents future conflation.

## Worked Example: Handling "car"

### With Conflated Thinking (Wrong)

> "We're teaching monosyllables. 'Car' is a monosyllable. `ar` isn't in our teaching catalogue. Therefore 'car' is an exception word."

### With Separated Thinking (Right)

1. **Analysis catalogue** includes `ar → ["AA R"]` because this pattern exists in English.
2. **Alignment** succeeds: `car` → `c`/K + `ar`/AA R → ✓
3. **Teaching catalogue** doesn't include `ar` yet (it's in v0.3, not v0.2).
4. **Decodability check** for a student who knows only v0.2 patterns: "car" is not yet decodable.
5. **Curriculum decision**: When should we teach `ar`? Analytics shows it unlocks X words at Y frequency.

The word aligns fine. The student just hasn't learned that pattern yet. This is different from "exception words" that genuinely don't follow any pattern.

## Schwa: The Hardest Case

Schwa (ə) exemplifies the analysis/teaching distinction:

### For Analysis

Schwa is essential. Without it, most polysyllabic words fail alignment:
- `banana` → /bəˈnænə/ — three syllables, two schwas
- `about` → /əˈbaʊt/ — initial schwa

The analysis catalogue must model schwa, or corpus coverage metrics are meaningless for polysyllables.

### For Teaching

Schwa is rarely taught explicitly as a "letter sound." Instead:
- Teachers might say "this vowel is unstressed and sounds like 'uh'."
- Or they rely on whole-word recognition for common unstressed syllables.
- Schwa is more about prosody than phonics.

The teaching catalogue might:
- Omit schwa entirely (focus on stressed syllables).
- Include it only in fixed patterns (`-tion`, `-ble`, `-ness`).
- Defer it to advanced levels.

This asymmetry is correct: detailed analysis, simplified teaching.

## Summary: Design Principles

1. **Analysis serves curriculum, but analysis ≠ curriculum.**
   Comprehensive analysis informs good curriculum design. But learners don't need (or want) the full analytical model.

2. **Word filters are separate from catalogue scope.**
   "Monosyllables only" is a word filter, not a catalogue constraint. Use the full catalogue to analyze monosyllables.

3. **Multiple catalogues for multiple purposes.**
   Maintain at least: a comprehensive analysis catalogue, and a teaching-appropriate subset.

4. **Alignment should succeed; decodability depends on instruction.**
   A word "aligns" if it follows known English patterns (use analysis catalogue). A word is "decodable" if the student knows those patterns (use teaching subset).

5. **"Exception" means genuinely irregular, not "pattern not yet taught."**
   Words like "colonel" are exceptions. Words like "car" just use patterns we haven't introduced yet.

6. **Metrics should be honest.**
   Coverage and utility metrics should use the comprehensive catalogue so we're not fooling ourselves about what GPCs unlock.

## Files in this Directory

| File | Purpose | Use For |
|------|---------|---------|
| `gpc-catalogue.json` | Current default (symlink to v0.2) | Teaching |
| `gpc-catalogue-v0.2-core.json` | Core phonics, highly teachable | Early curriculum |
| `gpc-catalogue-v0.3-extended.json` | + R-controlled, vowel teams | Intermediate teaching |
| `gpc-catalogue-v0.4-comprehensive.json` | + Silent letters, syllabics | Analysis/metrics |
| `gpc-catalogue-v0.5-full.json` | + Schwa, morphology | Full corpus analysis |
| `catalogue-design-2.md` | This document: clarified model | Current guidance |

## Future Considerations

### Explicit Catalogue Tagging

Each GPC entry could carry metadata:
```json
{
  "grapheme": "ar",
  "phonemes": ["AA R"],
  "tags": ["analysis", "teaching-v0.3"],
  "frequency_rank": 42
}
```

This would allow a single file to serve multiple purposes with filtering.

### Automated Catalogue Selection

Scripts could accept a `--purpose` flag:
```bash
npx tsx scripts/extract-gpcs.ts --purpose analysis   # uses v0.5
npx tsx scripts/extract-gpcs.ts --purpose teaching   # uses v0.2
```

### Learner Model Fidelity

For the "digital caricature" concern: we could research which patterns human readers actually use explicitly vs. which they handle via other mechanisms (morphological parsing, whole-word recognition, context). This would inform which patterns belong in a teaching catalogue vs. an analysis-only catalogue.

But that's future work. For now, the key insight is: **don't conflate the map with the guided tour.**