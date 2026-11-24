# TODO: WST Singleton Card Rotation / Repeated Exposure

## Problem

After the WST restructure, each GPC has exactly one distractor-free card. A brand-new learner should encounter `wst-n-N` more than 3 times in the first month, even with correct answers each time. The current SRS scheduling may graduate a card to long intervals after just a few successful encounters.

## Why not solve at the card generation level

Previously we had 3 variants per GPC, which provided incidental repetition. But those variants were identical (same distractors), so the "variety" was illusory. Generating more cards to force repetition is the wrong lever — it conflates content authoring with scheduling policy.

## Why not solve with time-gated grading

Considered: celebrate visually but internally grade WST as incorrect unless answered within a time limit, keeping cards in rotation longer. Problems:
- **Motor vs knowledge**: A 3-year-old who takes 4 seconds to navigate a touchscreen *knows* the answer. A hard cutoff punishes UI navigation speed, not phonemic knowledge.
- **Calibration**: Would need per-user baseline response time calibration (how fast does this kid respond to *anything*?), which is a project unto itself.
- **Existing gradient is adequate**: `evaluate()` already scores 1.0 at 5s tapering to 0.6 at 15s. This gives partial credit for slow-but-correct, which is appropriate.

## Correct solution: SRS scheduling parameters

The fix belongs in the navigator/scheduler, not the card generation or scoring:
- **Minimum encounter count**: A card should not graduate to long SRS intervals until it has been seen N times (e.g., 5-8 exposures regardless of performance).
- **Initial interval cap**: Even with perfect scores, early cards should not space beyond X days for the first month.
- **This is especially critical for WST** since these are the foundational letter-recognition cards and the unlock gate for keyboard keys.

## Breadcrumbs

- WST card generation: `content/phoneticAnalytics/scripts/generate-cards.ts`
- WST evaluate / time gradient: `src/questions/WhoSaidThat.ts` → `evaluate()`
- SRS scheduling: framework-level, likely `@vue-skuilder/db` study services
