# Vignette Session Script: j's Juggling Skill Acquisition (v4 — 30 stages, derived configs)

**30 stages** of progressive skill development. `J` (uppercase, teacher) demos and guides; `j` (lowercase, learner) attempts with jitter that smooths over practice.

Vignettes are **post-study-session decor** — something for younger eyes while an adult optionally reviews the session report. They concretely demonstrate *deliberate practice* in a parent-child teaching context. They are show, not tell — **no captions or narration**.

---

## Design Rules (v4)

These supersede the v3 per-session hand-authored tables:

1. **One viewer-perceptible increment per stage.** Every stage adds exactly one thing a casual viewer can notice: a new skill, a new ball, a new height regime, or a milestone beat. Consolidation ("clean") stages count — their visible increment is *fewer drops, smoother motion* on yesterday's skill.
2. **Configs are derived, not hand-authored.** A compact **skill timeline** (milestone table) is the single source of truth. Pool weights, jitter floors, and remediation fall out of formulas. Hand-tuning happens in the timeline, not in 30 config files.
3. **Callback play is structural.** Every previously-introduced skill stays in the idle pool forever with an age-decayed weight and a small floor — old skills resurface intermittently by construction. (Superseded variants of the same skill are removed — see `supersedes`.)
4. **The intro carries the increment.** Each stage opens with a short scripted intro (J demos the new/frontier thing; j watches). The idle loop is texture; the intro is the message.
5. **Failure must not dominate the viewing window.** Jitter smoothing counts *attempts* (with partial credit for failures), not just successes — j cannot stall in a drop-remediation loop. First-exposure catch jitter ≤ ~0.55 so a 30–60s window contains 2–3 clean reps of the frontier skill.
6. **J guides, not just performs.** After 2 consecutive drops on a skill, J pauses his own practice, slowly re-demos that skill, j watches, then retries. The mentor relationship is legible in the idle loop, not just the intro.
7. **Terminal stage loops forever.** Stage indexes past the last config clamp to the final stage (graduation — J and j cascade side by side). No blank scenes.

---

## Implementation Status

Viewable at `/dbg/practicing` (select "JJugglingVignette", use stage slider).
Stage prop is 0-based: stage 0 = Stage Config 1, etc.

### Architecture

Each stage is a `VignetteStageConfig`:
1. A scripted **intro sequence** (`VignetteSegment[]`) — played once by `runner.ts` (stage 1 keeps its bespoke direct choreography in `JJugglingVignette.vue`)
2. An open-ended **idle practice loop** — j practices from a weighted skill pool until unmount; J cascades/watches and intervenes with guidance re-demos

Files:
- **Skill timeline (SOT)**: `stages/skill-timeline.ts` — milestone table + per-stage metadata (titles, themes, intro overrides)
- **Derivation**: `stages/derive.ts` — formulas below → `VignetteStageConfig`
- Stage loader: `stages/index.ts`
- Idle runner: `idle-runner.ts` (attempt-based smoothing, guidance)
- Intro playback: `runner.ts` (segment interpreter)
- Types: `types.ts`
- Vignette component: `JJugglingVignette.vue`

### App wiring

`SessionEndScreen` receives `vignetteStage` from `StudyPracticeView`, driven by a dedicated
vignette-progress counter in `userState` (NOT the sessionTracker funnel counters — those gate
signup and must not change semantics). Counter increments each time a session-end vignette is
shown; stage = min(count, MAX_STAGE).

---

## 30-Stage Skeleton

| Stage | Title | Frontier increment | What the viewer notices |
|-------|-------|--------------------|------------------------|
| 1 | First Contact | handoff | J juggles; j walks in; learns to pass ball hand-to-hand |
| 2 | First Toss | tossToSelf (tiny, h≈10) | The ball leaves j's hand for the first time |
| 3 | Both Hands | tossToSelf clean | Fewer fumbles; both hands take turns |
| 4 | Catch It! | tossTo2HandedCatch (h≈18) | A real throw — both hands swallow the catch |
| 5 | Higher | tossTo2HandedCatch (h≈28) | Same catch, braver throw |
| 6 | One Hand Waits | dropCatch (bridge) | Ball drops from one hand into the other below |
| 7 | One-Handed | oneHandedTossAndCatch (h≈22) | Throw and catch with the SAME hand |
| 8 | Steady Hands | oneHandedTossAndCatch clean | The wobble is gone |
| 9 | Across | arcPass easy (h≈12) | Ball hops hand to hand through the air |
| 10 | The Arc | arcPass (h≈26) | A proper rainbow arc |
| 11 | Quick Rhythm | arcPass tall+quick (h≈34, low dwell) | Faster, taller, confident tempo |
| 12 | Two Balls! | syncColumns (h≈20) | TWO balls in the air at once |
| 13 | Steady Columns | syncColumns clean | Two-ball columns without panic |
| 14 | Off-Beat | asyncColumns | Hands take turns — staggered rhythm |
| 15 | Drumming | asyncColumns clean | The stagger becomes a groove |
| 16 | The Exchange | 2ballExchange | Balls CROSS in the air |
| 17 | Clean Crossing | 2ballExchange clean | The crossing stops colliding |
| 18 | Keep It Going | 2ballContinuous | Crossing repeats without pause |
| 19 | Endurance | 2ballContinuous sustained | Longer and longer runs |
| 20 | The Reveal | (none — J showcase) | J shows the full 3-ball cascade, slow and high; j studies it |
| 21 | Courage | cascadeFlash 3 | j tries THREE balls — three throws, gather |
| 22 | Three Throws Clean | cascadeFlash 3 clean | The flash lands more than it drops |
| 23 | Four, Five | cascadeFlash 4-5 | Each extra throw is a milestone |
| 24 | Full Cycle | cascadeFlash 6 | Each hand throws three times — it's juggling! |
| 25 | Stretching | cascadeFlash 8-10 | The pattern holds longer |
| 26 | It Doesn't Stop | cascade sustained | The cascade just… keeps going |
| 27 | Relaxed | cascade sustained clean | Drops become rare; shoulders drop |
| 28 | Sky Hooks | cascade high (h≈50) | Lazy, high, floaty style |
| 29 | Quicksilver | cascade low+fast (h≈28) | Tight, rapid style |
| 30 | Graduation | together cascade | J and j cascade side by side, matched rhythm. **Terminal — loops forever.** |

Stages with no new milestone (3, 5*, 8, 13, 15, 17, 19, 22, 27) are consolidation stages:
frontier stays the newest milestone, jitter has decayed one step, intro is a brief
"nod and continue" beat instead of a full demo. (*5 is a height-growth variant, see timeline.)

**Peer/teaching arc (old sessions 18–20) is deferred to stages 31+.** All 30 stages are j's
incremental skill adds with J demoing/guiding.

---

## Skill Tree (with the bridge skill named)

```
handoff
 └─> tossToSelf (tiny)
      └─> tossTo2HandedCatch
           ├─> dropCatch        ← NEW SkillId: 2H-catch mixed w/ drop-to-single-hand
           │    └─> oneHandedTossAndCatch
           └─> arcPass (easy → medium → tall)
                └─> syncColumns
                     └─> asyncColumns
                          └─> 2ballExchange
                               └─> 2ballContinuous
                                    └─> cascadeFlash (3 → 4-5 → 6 → 8-10)
                                         └─> cascade (sustained → high → low/fast → together)
```

`dropCatch` maps to the existing `drop` phrase (gentle vertical release from one hand to the
opposite hand below). At stage 6 the pool mixes `dropCatch` with `tossTo2HandedCatch` — the
"mix" IS the pool's weighted alternation.

---

## Derivation Formulas

### Pool weights

For stage N, every milestone with `stage_m ≤ N` (and not superseded by an introduced milestone)
enters the pool:

```
age = N - stage_m
frontier (newest milestone, regardless of age): weight = 1.0
otherwise: weight = max(0.30 * exp(-age * 0.35), 0.04)
```

The 0.04 floor is the **callback-play guarantee** — handoffs and tiny tosses still appear
occasionally at stage 25. Weighted-pick normalizes implicitly.

### Cross-stage jitter

```
jitter(N) = max(floor_j, introJitter * (0.3 + 0.7 * exp(-age * 0.35)))
floor_j = 0.04   (j keeps perceptible human noise; J demos at 0.02–0.03)
```

### In-session smoothing (attempt-based — replaces success-only counting)

```
effectiveReps = successes + 0.5 * failures
jitter(rep) = jitterStart * (0.6 + 0.4 * exp(-effectiveReps * 0.4))
```

Failures still slow improvement (half credit) but can no longer freeze it. Remediation
sequences also count as 0.5 toward the remediated skill.

### Jitter ceilings

First-exposure (intro) jitter in the timeline obeys: `catch ≤ 0.55`, `throw ≤ 0.5`.
(0.85 catch = guaranteed miss; 0.55 ≈ a miss every 2-3 attempts — drama without despair.)

### Remediation

Per-milestone `remediation: { key, reps }` pointing at a prerequisite milestone. Derived into
`remediationMap`. Executed at jitter 0.1 as today.

### J behavior

Default: `watch` for stages 1–3, `cascade` (h 45, jitter 0.03) for 4+. Reactions always on.
**Guidance** (all stages): after 2 consecutive drops of one skill by j, J gathers (if
cascading), re-demos that skill slowly (count 2, jitter 0.03), j's gaze tracks the demo,
then j retries. Implemented in `idle-runner.ts` via shared coordination state between the
two concurrent loops.

---

## Skill Timeline (the table that matters)

| key | skill | stage | params | introJitter (t/c) | supersedes | remediation |
|-----|-------|-------|--------|-------------------|------------|-------------|
| handoff | handoff | 1 | width .3, count 4, dwell .5 | 0 / 0 | — | — |
| tossToSelf.tiny | tossToSelf | 2 | h 10, count 3, alternating | .40 / .50 | — | handoff ×2 |
| catch2H.low | tossTo2HandedCatch | 4 | h 18, count 3, alternating | .40 / .45 | — | tossToSelf.tiny ×2 |
| catch2H.high | tossTo2HandedCatch | 5 | h 28, count 3, alternating | .30 / .35 | catch2H.low | tossToSelf.tiny ×2 |
| dropCatch | dropCatch | 6 | count 3, width .3 | .35 / .45 | — | catch2H.high ×2 |
| oneHand | oneHandedTossAndCatch | 7 | h 22, count 3, offset .3, alternating | .45 / .55 | — | dropCatch ×2 |
| arcPass.easy | arcPass | 9 | h 12, count 4, alternating | .40 / .45 | — | oneHand ×2 |
| arcPass.med | arcPass | 10 | h 26, count 4, alternating | .35 / .40 | arcPass.easy | arcPass.easy ×2 |
| arcPass.tall | arcPass | 11 | h 34, count 5, dwell .22, alternating | .30 / .35 | arcPass.med | — |
| syncCol | syncColumns | 12 | h 20, count 3 | .40 / .50 | — | tossToSelf.tiny ×2 |
| asyncCol | asyncColumns | 14 | h 20, count 4, beatTiming .5 | .35 / .45 | — | syncCol ×2 |
| exchange | 2ballExchange | 16 | h 28, count 1, beatTiming .55 | .40 / .50 | — | arcPass.tall ×3 |
| continuous | 2ballContinuous | 18 | h 28, count 4, beatTiming .55 | .30 / .40 | — | exchange ×1 |
| flash3 | cascadeFlash | 21 | h 38, maxBeats 3 | .40 / .50 | — | continuous ×2 |
| flash5 | cascadeFlash | 23 | h 40, maxBeats 5 | .30 / .38 | flash3 | continuous ×2 |
| flash6 | cascadeFlash | 24 | h 42, maxBeats 6 | .25 / .30 | flash5 | continuous ×2 |
| flash10 | cascadeFlash | 25 | h 40, maxBeats 10 | .20 / .25 | flash6 | continuous ×2 |
| cascade.run | cascade | 26 | h 40, maxBeats 0 | .15 / .18 | flash10 | continuous ×2 |
| cascade.high | cascade | 28 | h 50, maxBeats 10 | .15 / .18 | — | cascade.run ×0* |
| cascade.fast | cascade | 29 | h 28, beatTiming .48, maxBeats 8 | .15 / .18 | — | cascade.run ×0* |

(*no remediation — by 28+ a drop is just picked up and play continues.)

Stage 20 (Reveal) introduces **no milestone** — its increment is J's showcase intro and an
unusually 2-ball-heavy pool (frontier remains `continuous`).
Stage 30 (Graduation) likewise: frontier `cascade.run` at near-floor jitter; intro is the
together-cascade; J behavior `cascade` matched-height.

Note for variant milestones (same skill, new params — e.g. `catch2H.high`, `arcPass.med`):
these are real timeline entries so the param growth and partial jitter reset are visible,
and `supersedes` retires the old variant from pools.

---

## Intro Templates (hybrid: templates + escape hatch)

Authored in `stages/intro-templates.ts` as `VignetteSegment[]` builders, played by `runner.ts`:

| Template | Used by | Shape |
|----------|---------|-------|
| `demoIntro(milestone)` | every stage introducing a milestone | J turns to j → J demos skill slowly (jitter .03) → demos once at tempo → encouragement beat |
| `consolidationIntro(milestone)` | stages w/o new milestone | J nod + smile → single quick reminder demo |
| `revealIntro()` | stage 20 | J slow high cascade showcase (~5s) → gatherAndStop → cascadeFlash 3 demo → j anticipation beat |
| `graduationIntro()` | stage 30 | together-cascade (J jitter .03 / j .05, ~5s) → synchronized gather → celebrate |

Escape hatch: per-stage metadata may name a custom intro. Stage 1 keeps its bespoke direct
choreography (`runSession1Intro` in `JJugglingVignette.vue`) — it predates the templates and
includes the walk-in narrative.

Component flow for stages 2+: j starts **on stage** (no walk-in), both actors characterize,
intro segments play via `runSession`, then j's persistent physics ctx + ball are created and
the idle loop takes over.

---

## Emotional Arc (unchanged from v3 — these are constraints, not suggestions)

- J celebrates j's successes (smiles, nods) more than showcasing own ability
- Drops are treated gently — J looks supportive, not disappointed; guidance re-demo is patient, never exasperated
- j's expressions shift tentative → focused → proud across stages
- Stage 30's together-moment is shared joy, not comparison

---

## Phrase Vocabulary

All phrases live in `src/letterpeople/transforms/juggling/phrases/`. Every phrase returns a `JugglingController`. All support persistent context (`existingContext`/`existingLoop`/`existingBall(s)`).

### Single-Ball

| Phrase | Description |
|--------|-------------|
| `handoff` | Carry ball hand to hand, no throw |
| `tossToSelf` | Toss and catch, same hand |
| `oneHandedTossAndCatch` | Toss with lateral offset, catch same hand |
| `arcPass` | Throw from one hand, arc to opposite |
| `tossTo2HandedCatch` | Throw; both hands converge to catch |
| `drop` | Gentle vertical release to opposite hand below (**`dropCatch` SkillId**) |
| `dropToFloor` / `pickUp` | Ground transitions (remediation, narrative) |
| `failedCatch` | Scripted miss (jitter ≥ .85) — narrative only |

### Multi-Ball

| Phrase | Balls | Description |
|--------|-------|-------------|
| `syncColumns` / `asyncColumns` | 2 | Simultaneous / staggered columns |
| `twoBallExchange` / `twoBallContinuous` | 2 | Crossing throws, single / sustained |
| `cascadePhrase` | 3 | Full cascade; `maxBeats`, `gatherAndStop()` |

---

## Implementation Gaps

### This effort
- [ ] `dropCatch` SkillId + idle-runner / runner cases (maps to `drop` phrase)
- [ ] `stages/skill-timeline.ts` + `stages/derive.ts` + regenerate `stages/index.ts` (30 configs)
- [ ] `stages/intro-templates.ts` + generic intro playback for stages 2+ in `JJugglingVignette.vue`
- [ ] Attempt-based smoothing in `idle-runner.ts`
- [ ] J guidance re-demo (coordination between J/j idle loops)
- [ ] Stage clamping (terminal stage) in component + loader
- [ ] `vignetteStage` wiring: userState counter → StudyPracticeView → SessionEndScreen

### Later
- [ ] **Peer/teaching arc** (stages 31+): third actor, `teach` segments, j-as-mentor mirror of stage 1
- [ ] **`tossToward`** — inter-character ball pass for narrative polish
- [ ] **Scoop throw animation** — cascade visual authenticity (stages 20+)
- [ ] **Proficiency persistence** — replaying a stage could resume smoothed jitter
- [ ] **Synchronized cascade beat-matching** for stage 30

---

## Debug / Display Targets

- `/dbg/practicing` — stage slider, vignette selection
- `/dbg/juggling` — phrase-level controls
- `/dbg/juggling-persistent` — persistent-ball test harness
- `/dbg/ball-transfer` — cross-actor transfer
- `/dbg/physics`, `/dbg/siteswap-physics` — physics playgrounds

---

## Deprecation Note

The old siteswap renderer (`animateJuggling`, `siteswap-patterns.ts`, `ball-renderer.ts`) is
fully deprecated; `cascadePhrase` replaces it. v3 of this doc (20 hand-authored session tables)
is superseded by the timeline + derivation scheme above — see git history for the old tables.
