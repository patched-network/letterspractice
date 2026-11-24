# LetterPeople Asset Export

One-shot script that produces a static, versionable library of LetterPerson renders for downstream use (Design System project, marketing site, printables, OG images, etc.). Output is **gitignored** — regenerate locally as needed.

## Run it

```bash
# All 52 letters × 4 poses × 2 hue modes (~10 min, ~600 files)
yarn export:letterpeople

# Subset for iteration
LP_LETTERS=A,b,j,p,Z LP_POSES=resting,waving yarn export:letterpeople

# Reuse an already-running dev server (skips ~3s vite spawn)
LP_EXPORT_SERVER=http://localhost:5173 yarn export:letterpeople
```

First run on a new machine needs Playwright's Chromium binary:

```bash
yarn playwright install chromium
```

## Env knobs

| Variable | Default | Effect |
|---|---|---|
| `LP_LETTERS` | all 52 | Comma-separated letters or letter-ids (e.g. `A,a` or `A-upper,a-lower`) |
| `LP_POSES` | all 4 | Subset of `resting,talking,waving,arms-out` |
| `LP_OUT` | `assets-export/` | Output directory for canonical (auto-hue) tree; neutral tree lands at `${LP_OUT}-neutral` |
| `LP_NO_PNG` | unset | Set to `1` to skip PNG generation (SVG-only, faster) |
| `LP_EXPORT_SERVER` | unset | Reuse a running dev server URL instead of spawning one |
| `LP_FROZEN_TIME` | now (ISO) | Fixes the manifest's `generated` timestamp for byte-identical re-runs |

## Output shape

```
assets-export/                           ← canonical, hue-locked-by-seed
├── manifest.json                        ← version + flat letter index
├── A-upper/
│   ├── meta.json                        ← per-letter: hue, poses, file map
│   ├── resting.svg
│   ├── resting.png         (256px tall)
│   ├── resting@2x.png      (512px tall)
│   ├── talking.{svg,png,@2x.png}
│   ├── waving.{svg,png,@2x.png}
│   └── arms-out.{svg,png,@2x.png}
├── a-lower/ … z-lower/
└── …

assets-export-neutral/                   ← parallel tree with chroma=0 (gray)
└── …                                    ← consumers re-tint via CSS hue-rotate or feColorMatrix
```

## How it works

- The script drives a headless Chromium via Playwright against the dev-only `/__letter-export` route ([`src/views/__LetterExport.vue`](../../src/views/__LetterExport.vue)).
- The harness mounts a single `LetterInstance` ([`src/letterpeople/index.ts`](../../src/letterpeople/index.ts)) per request, applies a pose recipe (`poses.ts`) with `duration: 0`, and signals readiness via `window.__letterReady`.
- Hues are deterministic: a djb2 hash of `${letter}-${case}` (`seed.ts`) feeds the `vibrancyHigh` OKLCH preset (`oklchToRgb(0.7, 0.15, hue)`). Neutral mode forces chroma 0.
- SVG goes through SVGO `preset-default`. PNGs come from Playwright element screenshots, resized via sharp to 256px / 512px tall.

## Idempotency

With `LP_FROZEN_TIME` set, two consecutive runs produce byte-identical output. Useful for CI checks or release tagging. Without it, only the manifest's `generated` field differs between runs.

## Adding a pose

Edit [`poses.ts`](./poses.ts) — add a new entry to `POSES` and `POSE_NAMES`. The harness picks it up automatically.

## Adding a letter

The script iterates whatever `createLetter()` supports. Add a new renderer to `src/letterpeople/letters/` and register it in `src/letterpeople/index.ts` — the export script needs no changes.
