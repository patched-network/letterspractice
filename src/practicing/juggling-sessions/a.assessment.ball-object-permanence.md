# Ball Object Permanence: Assessment & Plan

**Problem**: Juggling balls have no identity or continuity across phrase boundaries. Every phrase creates its own ball SVG elements on start and destroys them on finish. Between phrases, balls vanish and reappear — visible as flicker in the idle loop and as teleportation in narrative intros.

**Date**: 2026-03-22
**Status**: Assessment complete, Option B (Persistent PhysicsContext) recommended

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Where the Problem Manifests](#2-where-the-problem-manifests)
3. [Existing Persistence Mechanisms](#3-existing-persistence-mechanisms)
4. [Options](#4-options)
   - [A. Prop Ball Bridging (status quo workaround)](#option-a-prop-ball-bridging)
   - [B. Persistent PhysicsContext per Actor](#option-b-persistent-physicscontext-per-actor)
   - [C. External Ball Protocol on Every Phrase](#option-c-external-ball-protocol-on-every-phrase)
   - [D. Ball Registry / Pool Abstraction](#option-d-ball-registry--pool-abstraction)
5. [Comparison Matrix](#5-comparison-matrix)
6. [Recommendation](#6-recommendation)
7. [Implementation Plan for Option B](#7-implementation-plan)
8. [TODO Checklist](#8-todo-checklist)

---

## 1. Current Architecture

### Two Ball Ownership Systems

The phrase system has **two independent context types** that own balls:

| System | Context Type | Phrases Using It | Ball Motion | Ball Creation |
|--------|-------------|-------------------|-------------|---------------|
| **Physics-core** | `PhysicsContext` | tossToSelf, arcPass, drop, dropToFloor, pickUp, failedCatch, oneHandedTossAndCatch, tossTo2HandedCatch, syncColumns, cascadePhrase, twoBallExchange, twoBallContinuous | Gravity simulation via `startPhysicsLoop` (rAF tick) | `addBall()` → `PhysicsBall` wrapping SVG circle |
| **Anime.js** | `PhraseControllerContext` | handoff (only) | Explicit keyframe tweens via `animateHandWithBallTo` | `createBallElement()` → raw SVG circle |

Both parent SVG circles to `letter.contentGroup` (same coordinate space as arms).

### Physics Ball Lifecycle

```
addBall(ctx, hand, color)
  → creates SVGCircleElement via createBallElement()
  → wraps in PhysicsBall { position, velocity, status, heldBy, element }
  → pushes to ctx.balls[]
  → physics loop ticks it each frame:
      held:      ball.position = hand.position (follows hand)
      in-flight: kinematics (gravity, velocity)
      grounded:  static

Cleanup: removeAllBalls(ctx) → element.remove() for each, ctx.balls.length = 0
```

### Handoff Ball Lifecycle (the outlier)

```
createBallElement(letter, color)
  → raw SVGCircleElement, no PhysicsBall wrapper
  → stored in PhraseControllerContext.ballElements[]
  → position animated by anime.js tweens (cx/cy)

Cleanup: destroyPhraseContext(ctx)
  → reverts all anime.js animations
  → element.remove() for each ball
  → stops arm animations
```

### Per-Phrase Ownership Pattern

Every phrase follows the same lifecycle:

1. **Start**: Create own context + ball(s)
2. **Execute**: Animate ball(s) for N reps
3. **Finish**: `removeAllBalls()` or `destroyPhraseContext()` — balls die

No ball survives `finish()` or `destroy()` under normal operation.

---

## 2. Where the Problem Manifests

### A. Idle Loop Ball Flicker

In `idle-runner.ts`, j's practice loop calls `executeIdleSkill()` repeatedly. Each call:

1. Creates a phrase → ball appears from nothing
2. Runs N reps
3. `controller.stop()` → ball vanishes
4. Random pause (300-800ms) — no ball visible
5. Next `executeIdleSkill()` → ball appears from nothing again

**Visual result**: Ball materializes, does 3-4 passes, vanishes. Pause. Ball materializes again. Repeat forever. Looks broken.

### B. Session Intro Narrative Seams

In `JJugglingVignette.vue` session 1, the choreography has these seams:

| Seam | From | To | What Happens |
|------|------|----|-------------|
| Cascade → gather | `cascadePhrase` (3 balls) | `gatherAndStop` | Balls gathered, then `destroy()` removes all SVG elements |
| Gather → handoff demo | Nothing | `handoff` (J) | New ball appears from nowhere in J's hand |
| Handoff demo → idle | `handoff` finish | `handoff` idle (j) | J's ball vanishes; j's ball appears from nowhere |

**Current workaround**: "Prop balls" — standalone SVG circles created/positioned/hidden manually at each seam. Works, but fragile and doesn't fix the idle loop.

### C. Future Cross-Actor Transfer

Session 1 calls for J to hand/toss a ball to j. No mechanism exists for a ball to move between two `LetterInstance` coordinate spaces. The prop ball approach can fake this (hide on J, show on j) but it's a visual teleport, not a continuous motion.

---

## 3. Existing Persistence Mechanisms

The codebase already has partial persistence support in three places:

### 3a. `cascadePhrase` — `existingContext` / `existingLoop`

```typescript
// cascadePhrase.ts L83-91
interface CascadeOptions {
  existingContext?: PhysicsContext;
  existingLoop?: PhysicsLoop;
}

// When provided:
const ownsContext = !options.existingContext;  // false → won't destroy balls
const ownsLoop = !options.existingLoop;       // false → won't stop loop
```

When `ownsContext = false`, `finish()` skips `removeAllBalls()` — balls survive the phrase. This is the **primary persistence mechanism** today, but only `cascadePhrase` implements it.

### 3b. `pickUp` — `existingBall` / `existingContext`

```typescript
// pickUp.ts L53-61
interface PickUpOptions {
  existingBall?: PhysicsBall;
  existingContext?: PhysicsContext;
}
```

`pickUp` can adopt an external ball (e.g., one left on the floor by `dropToFloor`). It doesn't remove the ball on finish — the caller retains ownership.

### 3c. `dropToFloor` — `keepBallOnGround`

When `keepBallOnGround = true`, `finish()` keeps the ball element alive and exposes `physicsContext` + `physicsLoop` + `groundedBall` for chaining into `pickUp`.

### 3d. `adoptBall()` — The Bridge Function

```typescript
// physics-core.ts L351-372
export function adoptBall(
  ctx: PhysicsContext,
  element: SVGCircleElement,
  position: Point,
  velocity: Point,
  status: BallStatus,
): PhysicsBall
```

Wraps an **existing** SVG element as a `PhysicsBall` without creating a new DOM node. Used by `gatherAndStop` to bridge from siteswap → physics. Could be generalized.

### Summary: What exists vs. what's missing

| Capability | Exists? | Where |
|-----------|---------|-------|
| Phrase uses external PhysicsContext | ✅ | cascadePhrase, pickUp |
| Phrase uses external ball | ✅ | pickUp |
| Phrase skips ball cleanup when non-owning | ✅ | cascadePhrase (ownsContext=false) |
| Ball survives on floor between phrases | ✅ | dropToFloor + pickUp chain |
| Adopt existing SVG element into context | ✅ | adoptBall() |
| **handoff accepts external ball/context** | ❌ | Uses separate PhraseControllerContext |
| **tossToSelf accepts external ball/context** | ❌ | Always creates own |
| **arcPass accepts external ball/context** | ❌ | Always creates own |
| **Any phrase "returns" its ball to caller** | ❌ | All destroy on finish |
| **Idle loop reuses balls across iterations** | ❌ | Each executeIdleSkill creates fresh |
| **Cross-actor ball transfer** | ❌ | Each phrase is single-actor |

---

## 4. Options

### Option A: Prop Ball Bridging

**What**: Manual SVG circles managed by choreography code, shown/hidden at phrase boundaries. Already partially implemented in `JJugglingVignette.vue`.

**How it works**:
- Before a phrase ends, create a prop ball at the same position
- Show prop ball, let phrase destroy its ball (same frame → no visual gap)
- Before next phrase starts, hide prop ball (phrase creates its own)

**Pros**:
- Zero changes to phrase system
- Already working for the intro narrative
- Quick to implement per-seam

**Cons**:
- **Does not fix idle loop** — each `executeIdleSkill` iteration still creates/destroys. You'd need to wrap the entire idle loop in prop-ball management, essentially reimplementing ball persistence outside the phrase system.
- Complexity scales linearly with number of seams (every new session, every new phrase transition)
- Fragile — position matching between prop ball and phrase ball requires manual coordinate synchronization
- No ball identity — the prop ball and the phrase ball are unrelated DOM elements
- Cross-actor transfer is still a teleport

**Verdict**: Stopgap only. Fine for a single session intro. Unacceptable for the idle loop.

---

### Option B: Persistent PhysicsContext per Actor

**What**: Create one long-lived `PhysicsContext` per actor (J, j) at vignette start. All phrases receive this shared context. The physics loop runs for the entire vignette session. Phrases borrow balls — they don't create or destroy them.

**How it works**:

```
Vignette start:
  jCtx = createPhysicsContext(j)    // lives for entire vignette
  jLoop = startPhysicsLoop(jCtx)    // ticks continuously
  ball = addBall(jCtx, "left")      // the one ball j uses

Idle loop iteration:
  handoff(j, { existingContext: jCtx, existingBall: ball })
    → phrase animates using the shared ball
    → finish() does NOT remove ball (ownsContext = false)
  
  tossToSelf(j, { existingContext: jCtx, existingBall: ball })
    → same ball, still alive from last phrase
    → finish() does NOT remove ball

Vignette end:
  jLoop.stop()
  removeAllBalls(jCtx)    // final cleanup
```

**Key insight**: The physics engine already handles this for held balls:

```typescript
// physics-core.ts tickBall()
case "held":
  if (ball.heldBy) {
    ball.position = ctx.hands[ball.heldBy].position;  // follows hand
  }
```

Between phrases, the ball stays `"held"` in whichever hand it was last in. The physics loop keeps ticking, so the ball visually stays at the hand position. No gap, no flicker.

**What needs to change**:

1. **Every single-ball phrase** (tossToSelf, arcPass, handoff, oneHandedTossAndCatch, tossTo2HandedCatch, drop) needs `existingContext` + `existingBall` options, mirroring cascadePhrase/pickUp
2. **`handoff`** needs to be ported from `PhraseControllerContext` to `PhysicsContext` (or at minimum, accept a `PhysicsBall` and coordinate with the physics loop)
3. **Idle runner** needs to create the persistent context and pass it through to `executeIdleSkill`
4. **Session intro choreography** creates contexts up front and threads them through

**The handoff problem**: Handoff is the only phrase using anime.js instead of physics-core. Two sub-options:

- **B1: Port handoff to physics-core**. The hand-to-hand pass doesn't need gravity — the ball stays `"held"` and just switches `heldBy` at the midpoint. Physics hands move via `moveHand()` and the held ball follows automatically. This is clean but requires rewriting handoff.
  
- **B2: Hybrid bridge**. Handoff accepts a `PhysicsBall`, removes it from the physics tick temporarily (set `status = "external"`), animates with anime.js, then restores it to `"held"` status on completion. More complex, preserves existing handoff animation quality.

**Pros**:
- **Fixes both idle loop AND narrative seams** with one architectural change
- Natural extension of existing `existingContext` pattern (cascadePhrase, pickUp already do this)
- Ball identity preserved — same `PhysicsBall` object, same SVG element throughout
- Between phrases, ball stays visible at hand position (physics loop still ticking)
- Enables future cross-phrase choreography (e.g., "toss high, wait, catch" as separate phrases sharing context)
- Physics loop provides free gaze tracking between phrases

**Cons**:
- Touches every phrase (adding 2 optional parameters + ownership check)
- Handoff rewrite/bridge is non-trivial
- Caller (idle runner, choreography) now owns ball lifecycle — more responsibility
- Multi-ball phrases (syncColumns, twoBallExchange, twoBallContinuous, cascade) need `existingBalls: PhysicsBall[]` which is more complex

---

### Option C: External Ball Protocol on Every Phrase

**What**: Same as Option B but without the persistent context. Each phrase still creates its own `PhysicsContext`, but can accept/return ball SVG elements (not `PhysicsBall` — just the DOM element).

**How it works**:

```
// Phrase accepts optional SVG element
tossToSelf(letter, { existingBallElement: svgCircle })
  → skips createBallElement(), uses provided element
  → on finish: sets opacity to 0 but does NOT call element.remove()
  → returns { ballElement: svgCircle } alongside the controller

// Caller manages the element
const result = await tossToSelf(j, { existingBallElement: ball });
await result.controller.stop();
// ball still in DOM, opacity 0 → next phrase picks it up
const result2 = await handoff(j, { existingBallElement: ball });
```

**Pros**:
- Simpler than Option B — no shared physics context to manage
- Each phrase still owns its own physics simulation
- Ball SVG element survives across phrases (no DOM removal)

**Cons**:
- Ball position may jump between phrases (each phrase creates its own PhysicsContext with potentially different hand rest positions)
- No physics ticking between phrases — ball is static SVG, must be manually positioned
- Two systems still exist (physics balls vs raw SVG elements) — the protocol operates at the SVG level, losing `PhysicsBall` state (velocity, status, etc.)
- Doesn't solve the "ball visible between phrases" problem without manual position management
- The opacity hide/show is still a seam, just less visible

**Verdict**: Half-measure. Fixes DOM removal but not the visual continuity.

---

### Option D: Ball Registry / Pool Abstraction

**What**: New abstraction layer — a `BallPool` or `JuggleContext` object at the actor level that owns balls and loans them to phrases.

```typescript
interface BallPool {
  checkout(hand: Hand): ManagedBall;   // borrow a ball
  checkin(ball: ManagedBall): void;     // return a ball
  destroy(): void;                       // final cleanup
}
```

**Pros**:
- Clean separation of concerns
- Could support multi-ball management (pool of N balls)
- Single source of truth for ball state

**Cons**:
- New abstraction layer on top of existing physics system — adds complexity
- Overlaps significantly with `PhysicsContext` (which already tracks balls, positions, etc.)
- Over-engineered for current needs (1 ball per actor in most phrases)
- Doesn't solve the handoff/physics dichotomy
- Essentially reinvents Option B with extra indirection

**Verdict**: Over-engineered. `PhysicsContext` already IS the ball registry — Option B just makes it persistent.

---

## 5. Comparison Matrix

| Criterion | A: Prop Ball | B: Persistent Ctx | C: External Ball | D: Ball Registry |
|-----------|-------------|-------------------|-------------------|-----------------|
| Fixes idle loop flicker | ❌ | ✅ | ⚠️ partial | ✅ |
| Fixes narrative seams | ✅ | ✅ | ⚠️ partial | ✅ |
| Ball visible between phrases | ❌ manual | ✅ automatic | ❌ manual | ✅ automatic |
| Ball identity preserved | ❌ | ✅ | ⚠️ element only | ✅ |
| Phrases touched | 0 | All single-ball | All | All + new abstraction |
| Handoff compatibility | N/A | Needs port or bridge | Works (SVG level) | Needs adapter |
| Code complexity | Low per-seam | Medium (one-time) | Medium (per-phrase) | High |
| Scales to future sessions | ❌ linear | ✅ | ⚠️ | ✅ |
| Extends existing patterns | ❌ | ✅ (cascadePhrase) | ❌ new pattern | ❌ new abstraction |
| Implementation effort | ~1hr/seam | ~4-6hr total | ~3-4hr total | ~6-8hr total |

---

## 6. Recommendation

**Option B: Persistent PhysicsContext per Actor** is the clear winner.

Rationale:
1. It's the **natural extension** of what `cascadePhrase` and `pickUp` already do
2. It solves **both** manifestations of the problem (idle flicker + narrative seams) with one change
3. The physics loop already handles held balls correctly — between phrases, balls just sit in hands
4. Implementation is incremental: can start with the 2-3 phrases used in session 1 (handoff, cascadePhrase) and extend to others as sessions are written
5. Ball identity is fully preserved — same `PhysicsBall`, same SVG element, entire vignette

### Sub-recommendation: B1 (port handoff to physics)

Handoff should be rewritten to use `PhysicsContext` instead of `PhraseControllerContext`. The physics `moveHand()` function already does what handoff needs — move a hand to a target position. The ball follows via the held-ball tick. The transfer is just `placeBallInHand(ctx, ball, otherHand)` at the midpoint.

This eliminates the last phrase using the anime.js `PhraseControllerContext` system, simplifying the codebase to a single ball management paradigm.

---

## 7. Implementation Plan

### Phase 1: Persistent Context Infrastructure (session 1 prerequisite)

**Goal**: j's ball persists across the session 1 intro + idle loop.

#### 1a. Add `existingContext`/`existingBall` to `handoff`

Port `handoff` from `PhraseControllerContext` to `PhysicsContext`:

- Accept `existingContext?: PhysicsContext` and `existingBall?: PhysicsBall`
- When provided, use the external ball (skip `createBallElement`)
- Animate hand positions via `moveHand(ctx, hand, target, duration)` — the physics tick moves the held ball automatically
- At transfer midpoint: `placeBallInHand(ctx, ball, toHand)`
- On `finish()`: if `!ownsContext`, skip `removeAllBalls`. Leave ball held in final hand.
- On `finish()`: animate hands to rest via `moveHand` (the ball-holding hand carries the ball back to rest)

Key physics-core functions to use:
- `moveHand(ctx, hand, target, duration)` — moves hand to position, held balls follow
- `placeBallInHand(ctx, ball, hand)` — reassigns ball to other hand
- `waitForHandIdle(ctx, hand)` — waits for moveHand to complete (may need to add this)

The anime.js `animateHandWithBallTo` / `animateHandTo` calls get replaced by physics-core `moveHand()` which the physics loop ticks automatically.

**Note**: The non-owning path should still work when `existingContext` is NOT provided — create own context, own ball, destroy on finish. This preserves backward compat for any standalone usage.

#### 1b. Thread persistent context through idle runner

In `idle-runner.ts`:
- `runIdleLoop` creates `jCtx = createPhysicsContext(j)` and `jBall = addBall(jCtx, "left")`
- `executeIdleSkill` accepts optional `{ existingContext, existingBall }` and passes through to phrase calls
- On abort/cleanup: `removeAllBalls(jCtx)`, `loop.stop()`

Initially, only `handoff` needs the external ball (it's the only skill in session 1's idle pool). Other phrases can be updated incrementally.

#### 1c. Thread persistent context through session 1 intro

In `JJugglingVignette.vue`:
- Create j's persistent context after `createScene()`
- Pass through to `runSession1Intro()` 
- After cascade gather/destroy, add a ball to j's context (the "transfer" moment)
- Intro's handoff demo uses J's own ephemeral context (J's balls are less important — J is the expert, ball continuity on J is less noticeable)
- At end of intro, j's ball is in `jCtx` → idle loop picks it up seamlessly

Remove prop ball workarounds.

### Phase 2: Extend to Remaining Single-Ball Phrases

**Goal**: All single-ball phrases support the `existingContext`/`existingBall` pattern.

Phrases to update (in likely order of use across sessions):
1. `tossToSelf` — session 2+ idle pools
2. `tossTo2HandedCatch` — session 2 (first after handoff)
3. `arcPass` — session 5+
4. `oneHandedTossAndCatch` — session 4+
5. `drop` — used in remediation paths
6. `dropToFloor` — already has partial persistence (`keepBallOnGround`)
7. `failedCatch` — remediation

Each phrase change is mechanical:
1. Add `existingContext?: PhysicsContext` and `existingBall?: PhysicsBall` to options
2. `const ownsContext = !options.existingContext;`
3. `const ownsBall = !options.existingBall;`
4. Use external or create own
5. In `finish()`: skip `removeAllBalls` when `!ownsContext`
6. In `destroy()`: only `removeAllBalls` when `ownsContext`

### Phase 3: Multi-Ball Phrases (future, as needed)

Phrases with 2+ balls: `syncColumns`, `asyncColumns`, `twoBallExchange`, `twoBallContinuous`, `cascadePhrase` (already done).

These need `existingBalls?: PhysicsBall[]` — an array. Logic is the same but need to handle count mismatches (what if caller provides 1 ball but phrase needs 2?).

Not needed until sessions 9+ (syncColumns is the first multi-ball skill).

### Phase 4: Cross-Actor Ball Transfer (future)

For the J→j "hand the ball over" moment. Options:
- Animate a standalone SVG element across the Stage coordinate space (not letter-local)
- Create ball in J's context, animate to midpoint, remove from J's context, adopt into j's context

This is a separate concern from intra-actor persistence. Defer until needed.

---

## 8. TODO Checklist

### Phase 1 (session 1 prerequisite)

- [ ] **Port `handoff` to physics-core**
  - [ ] Accept `existingContext` + `existingBall` options
  - [ ] Replace `PhraseControllerContext` with `PhysicsContext` when external context provided
  - [ ] Use `moveHand()` for hand positioning, `placeBallInHand()` for transfer
  - [ ] Ensure backward compat (no external context → creates own, destroys on finish)
  - [ ] Test in `/dbg/juggling` (standalone handoff)
  - [ ] Confirm: does `moveHand` provide smooth enough animation for handoff? May need to tune duration or add an easing `moveHand` variant.

- [ ] **`waitForHandIdle` — already exists in physics-core.ts** ✅
  - Exported from `physics-core.ts` L1307-1317
  - Signature: `waitForHandIdle(ctx, hand, timeoutMs = 5000): Promise<void>`
  - Already used by cascadePhrase, drop, dropToFloor, pickUp, oneHandedTossAndCatch, tossTo2HandedCatch, failedCatch, gatherAndStop

- [ ] **Update idle runner for persistent context**
  - [ ] Create persistent `PhysicsContext` + `PhysicsLoop` for j
  - [ ] Create persistent ball: `addBall(jCtx, "left", ballColor)`
  - [ ] Pass `{ existingContext, existingBall }` to `executeIdleSkill` → `handoff`
  - [ ] Cleanup on abort: `loop.stop()`, `removeAllBalls(jCtx)`
  - [ ] Test: ball should remain visible between idle skill iterations

- [ ] **Update session 1 intro choreography**
  - [ ] Create j's persistent context at vignette start
  - [ ] After J's cascade gather, add ball to j's context (`addBall(jCtx, ...)`)
  - [ ] Remove prop ball workarounds
  - [ ] Pass j's persistent context + ball into idle loop

- [ ] **Verify in `/dbg/vignettes`**: session 1 plays with no ball flicker

### Phase 2 (before session 2)

- [ ] Add `existingContext`/`existingBall` to `tossToSelf`
- [ ] Add `existingContext`/`existingBall` to `tossTo2HandedCatch`
- [ ] Add `existingContext`/`existingBall` to `arcPass`
- [ ] Add `existingContext`/`existingBall` to `oneHandedTossAndCatch`
- [ ] Add `existingContext`/`existingBall` to `drop`
- [ ] Add `existingContext`/`existingBall` to `failedCatch`
- [ ] Update `executeIdleSkill` to pass context/ball for all skill types
- [ ] Test each phrase in standalone mode (no external context) — backward compat
- [ ] Test each phrase in persistent mode (external context) — ball survives

### Phase 3 (before session 9)

- [ ] Add `existingContext`/`existingBalls` to `syncColumns`
- [ ] Add `existingContext`/`existingBalls` to `twoBallExchange`
- [ ] Add `existingContext`/`existingBalls` to `twoBallContinuous`
- [ ] Handle ball count transitions (1 ball → 2 ball skill: need to add a ball to context)

### Phase 4 (before session 18)

- [ ] Cross-actor ball transfer mechanism
- [ ] Stage-level coordinate space for inter-actor ball animation

---

## Appendix: Aside — `PhraseControllerContext` Becomes Dead Code

After porting `handoff` to physics-core (Phase 1a), the `PhraseControllerContext` system in `shared.ts` will have **zero consumers**. Today it's used exclusively by `handoff.ts`:

- `PhraseControllerContext` interface
- `destroyPhraseContext()` — reverts anims + removes ball elements
- `buildPhraseController()` — wraps lifecycle into JugglingController
- `animateHandWithBallTo()` / `animateHandTo()` / `animateHandsTo()` — anime.js hand tweens
- `animateValue()` / `registerAnimation()` — anime.js tracking
- `moveBall()` — manual SVG cx/cy positioning

`shared.ts` also exports utilities used by OTHER phrases that do NOT depend on `PhraseControllerContext`:
- `getHandRestPosition()` — used broadly
- `oppositeHand()` — used broadly
- `clamp()` / `clamp01()` — used broadly
- `setControllerGaze()` — used broadly
- `resolveStoppedOnce()` / `resetEphemeralControllerState()` — lifecycle utils

**Action**: After handoff port, `shared.ts` can be split: keep the general utilities, remove or deprecate `PhraseControllerContext` and its anime.js helpers. The re-export in `phrases.ts` (`export type { PhraseControllerContext }`) can also be removed. Not urgent — dead code doesn't hurt, but it's cleanup worth tracking.

---

## Appendix: Key File References

| File | Role |
|------|------|
| `src/letterpeople/transforms/juggling/phrases/physics-core.ts` | Physics simulation, `PhysicsContext`, `addBall`, `adoptBall`, `removeAllBalls`, `moveHand`, `placeBallInHand`, `throwBall`, `catchBall` |
| `src/letterpeople/transforms/juggling/phrases/handoff.ts` | The one phrase using `PhraseControllerContext` — primary rewrite target |
| `src/letterpeople/transforms/juggling/phrases/shared.ts` | `PhraseControllerContext`, `destroyPhraseContext` — may become unused after handoff port |
| `src/letterpeople/transforms/juggling/phrases/cascadePhrase.ts` | Reference implementation for `existingContext`/`existingLoop` pattern |
| `src/letterpeople/transforms/juggling/phrases/pickUp.ts` | Reference implementation for `existingBall`/`existingContext` pattern |
| `src/letterpeople/transforms/juggling/ball-renderer.ts` | `createBallElement()`, `adoptBall()` bridge |
| `src/practicing/juggling-sessions/idle-runner.ts` | Idle loop — primary consumer of persistent context |
| `src/practicing/juggling-sessions/runner.ts` | Session runner — secondary consumer (may be deprecated) |
| `src/practicing/JJugglingVignette.vue` | Vignette component — creates contexts, runs intro + idle |

## Appendix: The `moveHand` → held-ball tracking chain

This is the core mechanism that makes Option B work "for free":

```
moveHand(ctx, "left", targetPos, 0.3)
  → sets ctx.hands["left"].intent = { type: "positioning", ... }

Physics tick (each rAF frame):
  tickHand(): 
    case "positioning":
      hand.position = lerp(start, target, easeT)  // hand moves smoothly
  
  tickBall():
    case "held":
      if (ball.heldBy === "left"):
        ball.position = ctx.hands["left"].position  // ball follows hand
  
  moveBall(ball):
    ball.element.setAttribute("cx", ball.position.x)  // SVG updates
    ball.element.setAttribute("cy", ball.position.y)
```

So: call `moveHand` → hand animates smoothly → held ball follows automatically → SVG updates every frame. No manual ball animation needed. This is why porting handoff to physics-core is clean — the handoff motion is just two `moveHand` calls and one `placeBallInHand` at the midpoint.