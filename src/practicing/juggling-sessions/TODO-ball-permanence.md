# Ball Object Permanence — Implementation TODO

**Approach**: Option B (Persistent PhysicsContext per Actor)
**Assessment**: See `a.assessment.ball-object-permanence.md` for full analysis.
**Status**: Phase 1 ✅ — Phase 2 ✅ — Phase 3 ✅ — Phase 4 ✅

---

## Phase 1: Session 1 — Ball Persists Through Intro + Idle Loop ✅

### 1a. Port `handoff` to physics-core ✅

The `handoff` phrase is the only phrase using `PhraseControllerContext` (anime.js) instead of `PhysicsContext`. It must support `existingContext`/`existingBall` to participate in the persistent-context pattern.

**Strategy**: Rewrite `handoff` internals to use `moveHand()` + `placeBallInHand()` from physics-core. The physics tick automatically moves held balls with their holding hand — no manual ball animation needed.

**File**: `src/letterpeople/transforms/juggling/phrases/handoff.ts`

- [x] Add to `HandoffOptions` (in `shared.ts`):
  - `existingContext?: PhysicsContext`
  - `existingLoop?: PhysicsLoop`
  - `existingBall?: PhysicsBall`
- [x] When `existingContext` provided:
  - Set `ownsContext = false`, `ownsBall = false`
  - Use the provided context + ball
  - Do NOT create `PhraseControllerContext`
- [x] When NOT provided (backward compat):
  - Create own `PhysicsContext`, `PhysicsLoop`, `addBall()` — same self-contained lifecycle as before
  - Set `ownsContext = true`, `ownsBall = true`
- [x] Core animation loop:
  - Compute `fromRest`, `toRest`, `fromMid`, `toMid`, `transferPoint` (same geometry as current)
  - `moveHand(ctx, from, fromMid, carryInDuration)` ∥ `moveHand(ctx, to, toMid, carryInDuration)` — ball follows `from` hand automatically
  - `await waitForHandIdle(ctx, from)` + `await waitForHandIdle(ctx, to)`
  - `placeBallInHand(ctx, ball, to)` — ball now tracks `to` hand
  - `moveHand(ctx, from, fromRest, carryOutDuration)` ∥ `moveHand(ctx, to, toRest, carryOutDuration)` — ball follows `to` hand back to rest
  - `await waitForHandIdle(ctx, to)` + `await waitForHandIdle(ctx, from)`
  - Repeat for `count` reps
- [x] `finish()`:
  - Move both hands to rest via `moveHand` + `waitForHandIdle`
  - If `ownsBall`: `removeAllBalls(ctx)`
  - If `ownsLoop`: `loop.stop()`
  - `lifecycle.markStopped()`, `resolveStoppedOnce()`
- [x] `destroy()`:
  - If `ownsContext`: `removeAllBalls(ctx)`, `loop.stop()`
  - `lifecycle.markDestroyed()`, `resolveStoppedOnce()`
- [x] Gaze tracking: `getGazeTarget(ctx)` in the physics loop tick callback (same pattern as cascadePhrase). Uses `setInterval(50ms)` fallback when reusing an external loop.
- [x] Ball visibility: ensure ball element has `opacity: '1'` at start (physics `addBall` starts at opacity 0)
- [ ] **Test**: standalone handoff in `/dbg/juggling` (no external context) — should look identical to current
- [ ] **Test**: confirm `moveHand` smoothstep easing looks acceptable for the handoff carry motion. Duration params may need tuning vs old anime.js `inOutSine`.

### 1b. Thread persistent context through idle runner ✅

**File**: `src/practicing/juggling-sessions/idle-runner.ts`

- [x] `runIdleLoop()`: create persistent `PhysicsContext` + `PhysicsLoop` for j at loop start
- [x] Create one persistent ball: `addBall(jCtx, startHand, ballColor)` + set element `opacity: '1'`
- [x] Add `existingContext`, `existingLoop`, `existingBall` params to `executeIdleSkill()` signature (via `persistent?: { context, loop, ball }`)
- [x] Pass through to `handoff()` call inside the switch
- [x] On abort / loop exit: `loop.stop()`, `removeAllBalls(jCtx)` (gated by `ownsJContext`)
- [x] Accept pre-created `PhysicsContext` + ball from caller (for intro → idle handoff) via `persistentJContext` param
- [ ] **Test**: ball visible continuously between idle skill iterations (no flicker)

### 1c. Thread persistent context through session 1 intro ✅

**File**: `src/practicing/JJugglingVignette.vue`

- [x] After `createScene()`, create j's persistent `PhysicsContext` + `PhysicsLoop` (created in `runSession1Intro()` step 9 after j is characterized)
- [x] J's cascade uses its own ephemeral context (J is the expert — ball continuity on J is less critical, and cascade already self-contains)
- [x] After cascade gathers + destroys, create a ball in j's persistent context (`addBall(jCtx, "left", ballColor)`) positioned at j's hand
- [x] Remove `propBallJ` and `propBallj` workarounds — confirmed gone from all source files
- [x] Pass j's persistent context + ball to `runIdleLoop()` (via the optional `{ context, loop, ball }` param)
- [x] On `destroyScene()` / abort: `jLoop.stop()`, `removeAllBalls(jCtx)` with null checks

### 1d. Cleanup ✅

- [x] Remove `createBallElement` import from `JJugglingVignette.vue` (no more prop balls) — confirmed absent
- [x] Verify no regressions in standalone phrase debug views — `JugglingDebug.vue` uses standalone phrase launches (no persistent context), unaffected by changes

---

## Phase 2: All Single-Ball Phrases Support Persistent Context ✅

**Goal**: Every single-ball phrase accepts `existingContext`/`existingBall`, enabling the idle runner to use any skill without ball flicker.

**Status**: ✅ Complete. All phrase files ported, idle runner wired.

**Pattern** (applied uniformly to each phrase):
1. Add `existingContext?: PhysicsContext`, `existingLoop?: PhysicsLoop`, `existingBall?: PhysicsBall` to options
2. `const ownsContext = !options.existingContext;` / `const ownsBall = !options.existingBall;` / `const ownsLoop = !options.existingLoop;`
3. Use external or create own context/ball/loop
4. `finish()`: skip `removeAllBalls` when `!ownsBall`; skip `loop.stop()` when `!ownsLoop`
5. `destroy()`: only full cleanup when owning
6. Gaze polling (50ms `setInterval`) when `!ownsLoop`, cleaned up in both finish/destroy

**Files**:

- [x] `tossToSelf.ts` — ownership flags, conditional create/reuse, gaze polling, conditional cleanup
- [x] `tossTo2HandedCatch.ts` — same pattern
- [x] `arcPass.ts` — same pattern
- [x] `oneHandedTossAndCatch.ts` — same pattern, with gaze polling fallback
- [x] `drop.ts` — same pattern; `DropOptions` in `shared.ts` updated
- [x] `failedCatch.ts` — reconciled with `leaveBallOnFloor`: when persistent context + leaveBallOnFloor, ball stays in shared context (no orphaning). When `!ownsContext`, drops tracked inline via `waitForBallStatus` rather than `onBallGrounded` callback.
- [x] `dropToFloor.ts` — reconciled with `keepBallOnGround`: when shared context provided, `groundedBall`/`physicsContext`/`physicsLoop` result fields alias the shared refs. Gaze polling added for `!ownsLoop`.
- [x] `pickUp.ts` — added `existingLoop` support (`ownsLoop` flag, conditional loop stop, gaze polling)

**Idle runner integration**:
- [x] `executeIdleSkill` switch passes `existingContext`/`existingLoop`/`existingBall` for ALL single-ball skill types: `handoff`, `tossToSelf`, `tossTo2HandedCatch`, `arcPass`/`arcPassEasy`, `oneHandedTossAndCatch`
- [x] Ball hand positioning: `placeBallInHand()` called before the switch when `persistent.ball.heldBy !== targetHand`, ensuring the ball starts in the correct hand for each phrase
- [x] Backward compat: when no persistent context, each phrase works standalone (all `owns*` flags true → original behavior)
- [ ] **Test**: each phrase standalone (no external context) — visual regression check in `/dbg/juggling`
- [ ] **Test**: each phrase with external context — use `/dbg/juggling-persistent` to verify ball survives across phrase boundaries without flicker
- [ ] **Test**: idle loop end-to-end — ball persists across phrase boundaries in `/dbg/practicing` vignette view
- [ ] **Test**: drop remediation flow — `handleIdleDrop` still works (uses standalone phrases without persistent context)

### Framework Enhancement: `JugglingController.completed`

Added `readonly completed: Promise<void>` to the `JugglingController` interface — resolves when the phrase finishes for any reason (natural completion, stop request, or destroy) WITHOUT triggering early termination. Unlike `stop()`, accessing this does not request early termination.

**Motivation**: `prepareBalls()` in the persistent debug view needed to await animated `pickUp()` / `dropToFloor()` completion without short-circuiting the animation.

**Implementation**: All 16 controller implementations expose `completed: lifecycle.state.stopped` — the promise was already there internally, just not exposed.

### Debug View: Persistent Ball Debug (`/dbg/juggling-persistent`)

**File**: `src/dbg/JugglingPersistentDebug.vue`
**Route**: `/dbg/juggling-persistent`

Purpose-built test harness for ball object permanence. Key differences from `/dbg/juggling`:

- **One persistent `PhysicsContext` + `PhysicsLoop`** shared across all phrase launches (not recreated per phrase)
- **3 balls start grounded** in front of the letter
- **`prepareBalls(needed)`** orchestrator — before each phrase, auto-picks up or drops balls to reach the right count via animated `pickUp()` / `dropToFloor()` with persistent context, awaiting `ctrl.completed`
- **Ball status bar** — reactive 100ms polling shows each ball's state (🟢 held-left/right, 🔴 grounded, 🟡 in-flight)
- **Single-ball phrases**: pass `existingContext`/`existingLoop`/`existingBall` — ball persists between phrase switches
- **Multi-ball phrases**: pass `existingContext`/`existingLoop`/`existingBalls` — all balls persist (Phase 3)
- **Utility phrases** (dropToFloor, pickUp): always use persistent context
- **Transport**: "Stop Phrase" leaves balls in current state; "Reset Balls" recreates 3 grounded; "Reset All" full teardown

**Interfaces updated in `shared.ts`**: `TossToSelfOptions`, `ArcPassOptions`, `DropOptions` — all now include the three `existing*` fields. `HandoffOptions` already had them from Phase 1.

---

## Phase 3: Multi-Ball Phrases Support Persistent Context ✅

**Goal**: Every multi-ball phrase accepts `existingContext`/`existingLoop`/`existingBalls`, enabling ball persistence through multi-ball skills.

**Status**: ✅ Complete. All 4 multi-ball phrase files ported, idle runner wired, debug view updated.

**Pattern** (same as Phase 2 but with `existingBalls?: PhysicsBall[]` instead of `existingBall`):
1. Add `existingContext?: PhysicsContext`, `existingLoop?: PhysicsLoop`, `existingBalls?: PhysicsBall[]` to options
2. `const ownsContext = !options.existingContext;` / `const ownsBalls = !options.existingBalls;` / `const ownsLoop = !options.existingLoop;`
3. Use external balls array or create own balls
4. `finish()`: skip `removeAllBalls` when `!ownsBalls`; skip `loop.stop()` when `!ownsLoop`
5. `destroy()`: only full cleanup when owning
6. Gaze polling (50ms `setInterval`) when `!ownsLoop`

**Files**:

- [x] `syncColumns.ts` — 2-ball, `existingBalls[0]`→left, `existingBalls[1]`→right. `AsyncColumnsOptions extends SyncColumnsOptions` so fields inherit automatically.
- [x] `twoBallExchange.ts` — 2-ball, `existingBalls[0]`→from hand, `existingBalls[1]`→other hand
- [x] `twoBallContinuous.ts` — 2-ball, same pattern as exchange
- [x] `cascadePhrase.ts` — N-ball (default 3). Already had `existingContext`/`existingLoop` from Phase 1. Added `existingBalls?: PhysicsBall[]` with `ownsBalls` flag. Ball creation loop gated by `if (ownsBalls)`. `gatherAndStop()` works with shared balls — catches everything in-flight, leaves balls held without removing.

**Idle runner integration**:
- [x] Multi-ball switch cases (`syncColumns`, `asyncColumns`, `2ballExchange`, `2ballContinuous`, `cascade`, `cascadeFlash`) now create temporary extra balls from the persistent context, pass them as `existingBalls`, and clean up extras after `controller.stop()`
- [x] `extraBalls: PhysicsBall[]` tracker — populated during switch, cleaned up after `await controller.stop()` via `removeBall()` for each extra
- [x] Post-cleanup: persistent ball ensured back in held state via `placeBallInHand` if needed
- [x] `isMultiBall` guard skips the pre-switch `placeBallInHand` for multi-ball skills (handled per-case instead)
- [ ] **Test**: each multi-ball phrase in `/dbg/juggling-persistent` — balls persist across phrase boundaries
- [ ] **Test**: cascade with persistent context — gather leaves balls held, not removed
- [ ] **Test**: idle runner with multi-ball skills — extra balls created/cleaned properly

**Debug view updated** (`/dbg/juggling-persistent`):
- [x] Multi-ball phrases now use persistent context (removed standalone fallback as default)
- [x] Template: Two Ball and Three Ball cards updated — `⚠️ Phase 3` → `✅ persistent`, buttons call `launchPhrase` instead of `launchPhraseStandalone`
- [x] `prepareBalls` hand alternation fixed for 3+ balls: uses `held.length` index for L, R, L, R, ... pattern (correct for cascade)
- [x] `launchPhrase` handles all phrase types: syncColumns, asyncColumns, twoBallExchange, twoBallContinuous, cascade — all passing `existingContext`, `existingLoop`, `existingBalls: held`

---

## Phase 4: Cross-Actor Ball Transfer ✅

**Goal**: Transfer balls between actors' physics contexts with coordinate-space conversion, enabling J→j and j→J ball passing.

**Status**: ✅ Core complete. Arc visual, coordinate conversion, and ball sizing verified in debug view. Known polish items below.

**Mechanism**: Coordinate-space bridge using Actor's SVG-local ↔ stage-pixel conversion, NOT SVG element reparenting.

### Implementation

**`Actor.toStagePoint()` added** — `src/letterpeople/scene/Stage.ts`
- [x] Inverse of existing `toLocalPoint()`: SVG-local coords → stage-pixel coords
- [x] Accounts for actor position, z-depth projection scale, SVG viewBox mapping, and bottom-center transform origin

**`ball-transfer.ts` created** — `src/letterpeople/transforms/juggling/phrases/ball-transfer.ts`

Two exported functions:

- [x] **`transferBallInstant(fromCtx, toCtx, ball, fromActor, toActor, destinationHand?)`**
  - Reads ball position in source actor's SVG-local coords
  - Converts to stage-pixel coords via `fromActor.toStagePoint()`
  - Converts to destination SVG-local coords via `toActor.toLocalPoint()`
  - Removes ball from source context (including DOM element)
  - Creates new ball in destination context via `addBallAt()`
  - Optionally places in specified hand via `placeBallInHand()`

- [x] **`transferBallAnimated(fromCtx, toCtx, ball, fromActor, toActor, stageContainer, options?)`**
  - Same coordinate conversion as instant
  - Removes source ball, creates temporary HTML div positioned absolutely in stage container
  - Animates div along parabolic arc in stage-pixel space (configurable duration, arcHeight)
  - On arrival: removes temp div, creates new ball in destination context
  - Returns the new `PhysicsBall` in the destination context

### Debug View: Cross-Actor Ball Transfer (`/dbg/ball-transfer`)

**File**: `src/dbg/CrossActorTransferDebug.vue`
**Route**: `/dbg/ball-transfer`

Minimal two-actor Stage-based view:

- [x] Stage with two actors: J (left, 30%) and j (right, 70%), each with own `PhysicsContext` + `PhysicsLoop`
- [x] Left actor starts with 1 ball in left hand
- [x] "Animated" transfer buttons: configurable arc height (20–200px) and duration (200–1500ms) via sliders
- [x] "Instant" transfer buttons for immediate coordinate-space conversion
- [x] Ball status polling (100ms) per actor
- [x] "+ Ball" buttons to add extra balls to either actor
- [x] Reset button for full teardown + rebuild
- [x] **Test**: animated transfer — ball follows smooth arc between actors ✓ (arc shape, position, and ball size all visually correct after `toStagePoint`/`toLocalPoint` fix and SVG-aware radius scaling)
- [ ] **Test**: instant transfer — ball appears in correct hand position
- [ ] **Test**: multiple transfers back and forth — no coordinate drift
- [ ] **Test**: transfer with different z-depths — scale conversion correct

### Known polish items

- [ ] **Not physics-based**: The animated arc is a parametric parabola on a timer (`-4h·t·(1-t)`), not a real projectile. Duration scales time linearly. To make it physical: compute launch velocity from distance + desired peak height, let gravity simulate the trajectory.
- [ ] **Stone catching hand**: The destination actor's arms don't move during the transfer. A proper catch should have the receiving hand track the incoming ball — reach toward the arrival point timed to intercept, using `moveHand()` on the destination context.
- [ ] **Descender height offset**: Transferring to letters with descenders (e.g. `j`) lands the ball ~DESCENDER_OFFSET px above the actual catching hand, then it snaps into hand on `placeBallInHand`. Likely the viewBox `y` origin shift for descender letters isn't fully accounted for in `toStagePoint`/`toLocalPoint`.

---

## Notes

- `waitForHandIdle` already exists in physics-core.ts (L1307). No need to add it.
- `moveHand` uses smoothstep easing (3t²-2t³). If handoff needs different easing, the `positioning` intent in `tickHand` could be extended with an easing option. Try smoothstep first — it's close to the anime.js `inOutSine` currently used.
- After Phase 2, `PhraseControllerContext` in `shared.ts` still exists (used by `buildPhraseController`, `destroyPhraseContext`, and the anime.js helper functions). Can be cleaned up now that all phrases use physics-core.
- `shared.ts` still exports broadly-used utilities (`getHandRestPosition`, `oppositeHand`, `clamp`, etc.) — only the anime.js ball-animation helpers are dead code.
- The animated transfer uses a temporary HTML `div` (not SVG reparenting) to avoid coordinate system complexity. The div has `z-index: 9999` and is positioned absolutely in the stage container. Visual radius is computed from `svgRadius * (hPx/vbHeight) * projScale`.
- `JugglingController.completed` was added as a framework-level enhancement: exposes `lifecycle.state.stopped` without triggering early termination. Implemented across all 16 controller instances.