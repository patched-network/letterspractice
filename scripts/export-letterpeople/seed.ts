// Deterministic seed → hue derivation for the LetterPeople export pipeline.
//
// The brand identity is "playful randomness" (see DESIGN_SYSTEM.md and
// CourseHeader.vue's BRAND_COLOR_TRANSFORM), so there is no canonical per-letter
// hue. Instead, this seeds the existing `vibrancyHigh` color preset
// deterministically from a string so re-runs are byte-identical.

export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function seedToHue(seed: string): number {
  return djb2(seed) % 360;
}
