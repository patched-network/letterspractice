# Vignette Session Script: F's Floss Dance Skill Acquisition

> **Characters**: lowercase `f` (expert dancer, left) teaches uppercase `F` (learner, right)
>
> This inverts the usual uppercase-teaches-lowercase pattern — f is the cool little
> sibling who already knows the floss, F is the eager big sibling learning it.

## Implementation Status

### Architecture

Unlike the juggling vignette (which uses a runner/stages/idle-runner abstraction),
the floss vignette uses **direct inline choreography** in `FFlosingVignette.vue`.

- All floss mechanics (beat execution, z-layer, hip sway) are defined as local
  helper functions in the component, extracted from `src/dbg/FlossDebug.vue`.
- Session progression is controlled by the `stage` prop (0-indexed).
- Each stage has a scripted intro → open-ended idle practice loop.

### Stage Status

| Stage | Status | Notes |
|-------|--------|-------|
| 0 | ✅ Implemented | First contact — f demos, F tries arm swing only |
| 1–11 | 🔲 TODO | See session scripts below |

### Files

| File | Purpose |
|------|---------|
| `FFlosingVignette.vue` | Main component — choreography, stage setup, floss helpers |
| `flossing-sessions/TODO-floss-progression.md` | This document — progression design |

---

## Floss Dance Mechanics Reference

### Constants

```
ARM_LEFT_ANGLE_L  = 200   // left arm target when both swing left
ARM_LEFT_ANGLE_R  = 120   // right arm target when both swing left
ARM_RIGHT_ANGLE_L = 60    // left arm target when both swing right
ARM_RIGHT_ANGLE_R = -20   // right arm target when both swing right
```

### Beat Pattern (6-beat repeating cycle)

```
Beat 0: Arms R→L, R-hand behind,       hips L→R
Beat 1: Arms L→R, R-hand returns front, hips R→L
Beat 2: Arms R→L, both in front,        hips L→R
Beat 3: Arms L→R, L-hand behind,        hips R→L
Beat 4: Arms R→L, L-hand returns front, hips L→R
Beat 5: Arms L→R, both in front,        hips R→L
```

### Z-Layer Logic

- **Beat 0**: Right arm behind, left arm front (arm at far extreme, clean pass)
- **Beat 3**: Left arm behind, right arm front
- **Beats 1, 4**: Return-to-front — delayed 60% through the beat (arm has swung past body)
- **Beats 2, 5**: Both arms front (neutral, no z-layer change)

### Key Timing Parameters

| Parameter | Description | Range |
|-----------|-------------|-------|
| `beatMs` | Duration of one beat | 250–1000ms |
| `hipDeg` | Hip sway amplitude (degrees) | 0–10 |
| Arm angles | Defined by the 4 constants above | Fixed |

---

## Skill Decomposition

The floss has these component skills that can be isolated and taught incrementally:

### 1. Arm Swing
Arms swing L↔R in unison. No hip motion, no z-layer changes.
Just `rotateTo()` on both arms alternating between left-target and right-target angles.

**What it looks like**: Stiff side-to-side arm movement, robot-like.

### 2. Hip Sway
Body `skewTo()` alternating left/right. No arm movement.
Isolates the counter-motion that makes the floss look fluid.

**What it looks like**: Letter rocks side to side.

### 3. Arm + Hip Coordination
Arms and hips move together but in opposite directions — the core motion.
Arms swing left while hips go right, and vice versa.

**What it looks like**: Starting to look like the floss, but flat (no depth).

### 4. Z-Layer (Arm-Behind-Body Pass)
Adding the behind-body pass via `sendToBack()` / `bringToFront()`.
First just one arm (beats 0–2), then the other (beats 3–5).

**What it looks like**: The signature floss "wrap around" effect.

### 5. Full Floss Cycle
All 6 beats with correct z-layering, hip counter-motion, arm angles.

**What it looks like**: Recognizable floss dance at slow speed.

### 6. Speed Ramp
Reducing `beatMs` from slow (~1000ms) to normal (~400ms) to fast (~250ms).

**What it looks like**: From careful practice to confident performance.

---

## CTS-Deformation Hooks (Graduated Mistake Modeling)

For F's learning progression, we need ways to make the floss look "wrong" or "learning".
These deformations are applied to F's floss execution and gradually removed as stage increases.

### Deformation Catalog

| Deformation | Implementation | Visual Effect |
|-------------|---------------|---------------|
| **No hip motion** | `body.skewTo(0)` — skip hip entirely | Stiff, arms-only |
| **Wrong z-layer** | Skip `sendToBack()`, both arms always front | Flat, no depth |
| **Late z-layer** | Delay `sendToBack()` by extra ms beyond 60% | Arms clip through body |
| **Reduced amplitude** | Smaller arm angles (lerp toward center), small `hipDeg` | Timid, small movements |
| **Wrong direction** | Occasional beat where arms and hips go same direction | Coordination fail |
| **Timing drift** | Variable `beatMs` per beat (±30%) | Uneven, jerky rhythm |
| **Partial cycle** | Only 2–4 beats before stopping/resetting | Can't sustain the pattern |
| **Pause-and-think** | Insert 200–500ms pause between beats | Thinking about next step |

### Implementation Pattern

```typescript
interface FlossDeformations {
  skipHip: boolean;           // No hip sway
  skipZLayer: boolean;        // Both arms always front
  lateZLayerMs: number;       // Extra delay on z-layer transitions (0 = correct)
  amplitudeScale: number;     // 0–1 multiplier on arm angle range and hipDeg
  wrongDirectionRate: number; // 0–1 probability of same-direction error per beat
  timingDriftPct: number;     // 0–0.5 random ± percentage on beatMs
  maxBeatsBeforeReset: number | null; // null = full cycle, 2–5 = partial
  pauseBetweenBeats: number;  // Extra ms pause between beats (0 = fluid)
}
```

Each stage defines a `FlossDeformations` config for F's practice attempts.
The deformations are applied inside a modified `flossOneBeat()` variant.

---

## Session Progression (~12 sessions)

### Session 0: First Contact

**Intro script:**
1. f is on stage, starts flossing at full speed (beatMs ~350, hipDeg ~7) — looks easy and fun
2. F walks in from off-screen right, stops, watches f
3. f notices F, stops flossing, turns toward F, smiles
4. f demos: 2 beats slowly (beatMs ~800, hipDeg ~4) — deliberate teaching pace
5. F attempts: 1–2 beats (beatMs ~1000, hipDeg ~3) — arms only, no hip, no z-layer
6. f smiles encouragingly

**Idle loop:**
- F: Arm swing only (no hip, no z-layer), slow, with timing drift and pause-between-beats
- f: Watches F, occasionally demos a slow beat or two

**F deformations:** `{ skipHip: true, skipZLayer: true, amplitudeScale: 0.5, timingDriftPct: 0.2, maxBeatsBeforeReset: 2, pauseBetweenBeats: 300 }`

---

### Session 1: Getting the Arms Right

**Intro script:**
1. Both on stage. f waves hello.
2. f demos: arm swing only, slow (beatMs ~700), 4 beats
3. F mirrors: arm swing, slightly faster than session 0

**Idle loop:**
- F: Arm swing with reduced timing drift
- f: Demos arm swing, watches

**F deformations:** `{ skipHip: true, skipZLayer: true, amplitudeScale: 0.65, timingDriftPct: 0.15, maxBeatsBeforeReset: 4, pauseBetweenBeats: 150 }`

---

### Session 2: Adding the Hips

**Intro script:**
1. f demos: arm swing + hip sway, slow (beatMs ~700, hipDeg ~5), 4 beats
2. F attempts: arms + hips — but occasionally wrong direction (hips go with arms instead of against)

**Idle loop:**
- F: Arm + hip, with wrongDirectionRate ~0.3
- f: Demos arm + hip, occasionally matches F's pace

**F deformations:** `{ skipHip: false, skipZLayer: true, amplitudeScale: 0.7, wrongDirectionRate: 0.3, timingDriftPct: 0.1, maxBeatsBeforeReset: 4, pauseBetweenBeats: 100 }`

---

### Session 3: Coordinating Arms and Hips

**Intro script:**
1. f demos arm+hip at medium speed, F watches closely
2. F attempts: fewer wrong-direction errors, starting to get the feel

**Idle loop:**
- F: Arm + hip, wrong direction down to ~0.15, amplitude increasing
- f: Side-by-side practice

**F deformations:** `{ skipHip: false, skipZLayer: true, amplitudeScale: 0.8, wrongDirectionRate: 0.15, timingDriftPct: 0.08, maxBeatsBeforeReset: 6, pauseBetweenBeats: 50 }`

---

### Session 4: First Z-Layer (Right Hand Behind)

**Intro script:**
1. f demos full floss slowly, drawing attention to the right-hand-behind on beat 0
2. F attempts: adds z-layer for beats 0–2 only (right hand), but late timing

**Idle loop:**
- F: Arm + hip + R-hand z-layer (beats 0–2), late z-layer (~150ms)
- f: Full floss slow

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 150, amplitudeScale: 0.85, wrongDirectionRate: 0.05, timingDriftPct: 0.05, maxBeatsBeforeReset: null, pauseBetweenBeats: 0 }`

*Note: z-layer implementation may need a "partial z-layer" mode where only beats 0–2 get z-layer and beats 3–5 stay both-front.*

---

### Session 5: Both Hands Behind

**Intro script:**
1. f demos full cycle including beat 3 (left hand behind)
2. F attempts full 6-beat cycle — z-layer on both sides, still slightly late

**Idle loop:**
- F: Full cycle, z-layer on ~70% of beats (occasionally misses), late by ~100ms
- f: Full floss at medium speed

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 100, amplitudeScale: 0.9, timingDriftPct: 0.05, maxBeatsBeforeReset: null }`

---

### Session 6: Cleaning Up

**Intro script:**
1. f does a full floss at medium speed (beatMs ~450)
2. F follows along — noticeably better

**Idle loop:**
- F: Full cycle, z-layer mostly correct (~80%), speed ~600ms
- f: Full floss medium speed, occasional smile

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 50, amplitudeScale: 0.92, timingDriftPct: 0.04, maxBeatsBeforeReset: null }`

---

### Session 7: Building Speed

**Intro script:**
1. f does a fast floss, then slows down to F's pace, they sync up

**Idle loop:**
- F: Full floss at ~500ms, minor timing drift
- f: Matches F's pace, occasionally speeds up to tease

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 20, amplitudeScale: 0.95, timingDriftPct: 0.03, maxBeatsBeforeReset: null }`

---

### Session 8: Almost There

**Intro script:**
1. Both start flossing together at medium speed

**Idle loop:**
- F: Full floss at ~450ms, very minor imperfections
- f: Full floss matching F

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 10, amplitudeScale: 0.97, timingDriftPct: 0.02 }`

---

### Session 9: Speed Day

**Intro script:**
1. f challenges F — does fast floss (beatMs ~300)
2. F tries to keep up

**Idle loop:**
- F: Full floss at ~400ms, occasional timing hiccup
- f: Full floss fast, cheering

**F deformations:** `{ skipHip: false, skipZLayer: false, lateZLayerMs: 0, amplitudeScale: 0.98, timingDriftPct: 0.02 }`

---

### Session 10: Consolidation

**Intro script:**
1. F starts flossing before f — showing initiative!
2. f joins in, they sync up

**Idle loop:**
- F: Full floss at ~380ms, near-expert
- f: Full floss matching

**F deformations:** `{ skipHip: false, skipZLayer: false, amplitudeScale: 1.0, timingDriftPct: 0.01 }`

---

### Session 11: Graduation

**Intro script:**
1. Side-by-side floss at full speed
2. Both floss in perfect sync — F has graduated!

**Idle loop:**
- Both: Full floss at ~350ms, F matches f perfectly
- Occasional sync break where one speeds up, then they re-sync (visual interest)

**F deformations:** `{ skipHip: false, skipZLayer: false, amplitudeScale: 1.0, timingDriftPct: 0 }` ← effectively no deformations

---

## Session-Skill Matrix

| Session | Arm Swing | Hip Sway | Coordination | R-Hand Z | L-Hand Z | Speed (beatMs) |
|---------|-----------|----------|-------------|----------|----------|----------------|
| 0 | Learning | — | — | — | — | ~1000 |
| 1 | Improving | — | — | — | — | ~800 |
| 2 | ✓ | Learning | Wrong-dir | — | — | ~700 |
| 3 | ✓ | Improving | Improving | — | — | ~650 |
| 4 | ✓ | ✓ | ✓ | Learning (late) | — | ~600 |
| 5 | ✓ | ✓ | ✓ | Improving | Learning (late) | ~600 |
| 6 | ✓ | ✓ | ✓ | ~80% correct | ~80% correct | ~600 |
| 7 | ✓ | ✓ | ✓ | ✓ | ✓ | ~500 |
| 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ~450 |
| 9 | ✓ | ✓ | ✓ | ✓ | ✓ | ~400 |
| 10 | ✓ | ✓ | ✓ | ✓ | ✓ | ~380 |
| 11 | ✓ | ✓ | ✓ | ✓ | ✓ | ~350 (=expert) |

---

## Implementation Gaps

### Implemented now
- [x] Full floss mechanics (flossOneBeat, flossLoop, applyZLayer)
- [x] Stage setup with legs
- [x] Session 0 intro choreography
- [x] Session 0 idle loop (basic)
- [x] Characterize/startIdle for both letters

### Needs implementation
- [ ] `FlossDeformations` system — modified `flossOneBeat` that applies deformations
- [ ] Per-stage deformation configs
- [ ] Per-stage intro choreography (sessions 1–11)
- [ ] f's teaching behaviors in idle loop (demo, react, match pace)
- [ ] Walking in/out animations for later sessions
- [ ] "F starts first" behavior for session 10+
- [ ] Sync/re-sync mechanic for session 11

### Nice-to-have
- [ ] Expression changes during practice (concentration → satisfaction)
- [ ] f occasionally doing a faster demo then slowing back down (showing off)
- [ ] Subtle camera/stage zoom when both are in sync
- [ ] Sound effects (rhythmic beat cue)

---

## Design Principles

### Why Inline Choreography (Not a Runner)?

The juggling vignette needed a runner abstraction because juggling has a complex physics
system (balls, arcs, catch timing) with many discrete "phrases" that can be composed.

The floss is a single repeating motion with parametric deformations. The choreography is
better expressed as a simple while-loop with config objects than as a segment/runner DSL.

If we later need more complex floss scenes (multiple letters, formation dancing, etc.),
we can extract a runner then. YAGNI for now.

### Emotional Arc

- **Sessions 0–2**: Discovery and curiosity. F is intrigued, f is encouraging.
- **Sessions 3–5**: Focused practice. F concentrates, makes progress, occasional frustration (but never shown — we keep it positive).
- **Sessions 6–8**: Growing confidence. F's movements become smoother, expressions shift from concentration to enjoyment.
- **Sessions 9–11**: Mastery and celebration. F floss with confidence, f shows pride.

### The Inverted Teaching Dynamic

f teaching F (lowercase teaches uppercase) is intentionally unusual:
- Models that expertise isn't about size/status
- Shows that anyone can be a teacher in their domain
- The floss is "f's thing" — it starts with f's letter, it's a skill f owns