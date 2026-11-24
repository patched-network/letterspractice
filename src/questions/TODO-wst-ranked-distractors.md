# TODO: WST Ranked Distractor Selection

## Current State

Distractor-free WST cards (c-wst-{gpc}) select distractors at runtime from all 26 letters, randomly, with count scaled by `modifyDifficulty`. This works but treats all distractors as equally difficult.

## Proposed Enhancement

Each target letter could name/rank its distractors by difficulty along two axes:

- **Phonetic similarity**: letters whose dominant phoneme is acoustically close to the target (e.g., for /B/: /P/ voicing pair, /D/ same manner, /M/ same place)
- **Visual similarity**: letters that are graphically confusable (e.g., for b: d mirror, p rotation, q rotation)

A ranked distractor list per letter would let `modifyDifficulty` inform *which* distractors are selected, not just *how many*:

- Low user ELO (large negative `modifyDifficulty`): few distractors, all maximally distinct from target
- Matched ELO: moderate count, mix of easy and confusable
- High user ELO (positive `modifyDifficulty`): many distractors including the hardest confusables

## Shape

Could be a static map in WhoSaidThat.ts:

```ts
const DISTRACTOR_RANKINGS: Record<string, string[]> = {
  // Ordered easiest → hardest for target "b"
  b: ["z", "k", "f", "m", "n", "g", "p", "d", "q"],
  // ...
};
```

Or derived from the GPC catalogue's interference sets + a phonetic distance metric.

## Related

- Focus group WST cards (c-wst-fg-*) already handle the highest-difficulty confusable pairs with fixed distractors — this enhancement would create a smoother difficulty gradient for the auto cards.
- The `concept:interference:*` tags on focus group cards are not yet referenced by any navigator strategy — that's separate follow-on work.
