<template>
  <v-container fluid class="siteswap-page">
    <v-row class="siteswap-row" no-gutters>
      <!-- Controls Column -->
      <v-col cols="12" md="4" class="controls-col">
        <!-- Letter Setup -->
        <v-card class="siteswap-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">Letter Setup</v-card-title>
          <v-card-text class="siteswap-card-content">
            <v-row dense align="center">
              <v-col cols="4">
                <v-text-field
                  v-model="letterChar"
                  label="Letter"
                  density="compact"
                  variant="outlined"
                  hide-details
                  maxlength="1"
                  @keydown.enter="initLetter"
                />
              </v-col>
              <v-col cols="4">
                <v-btn
                  block
                  size="small"
                  color="primary"
                  :loading="initializing"
                  @click="initLetter"
                >
                  Init
                </v-btn>
              </v-col>
              <v-col cols="4">
                <v-chip
                  :color="letterReady ? 'success' : 'default'"
                  size="small"
                  label
                >
                  {{ letterReady ? '✓ Ready' : '—' }}
                </v-chip>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Cascade Controls -->
        <v-card class="siteswap-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">3-Ball Cascade</v-card-title>
          <v-card-text class="siteswap-card-content">
            <v-row dense>
              <v-col cols="3">
                <v-btn
                  block
                  size="small"
                  :color="cascadeRunning ? 'warning' : 'success'"
                  :disabled="!letterReady"
                  @click="toggleCascade"
                >
                  {{ cascadeRunning ? '⏹ Stop' : '▶ Start' }}
                </v-btn>
              </v-col>
              <v-col cols="3">
                <v-btn
                  block
                  size="small"
                  color="teal"
                  :disabled="!cascadeRunning"
                  @click="gatherAndStopCascade"
                >
                  Gather
                </v-btn>
              </v-col>
              <v-col cols="3">
                <v-btn
                  block
                  size="small"
                  color="error"
                  :disabled="!letterReady"
                  @click="resetAll"
                >
                  Reset
                </v-btn>
              </v-col>
              <v-col cols="3">
                <v-chip
                  :color="cascadeRunning ? 'success' : 'default'"
                  size="small"
                  label
                >
                  {{ cascadeRunning ? `#${beatCount}` : 'Stopped' }}
                </v-chip>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Physics Sliders -->
        <v-card class="siteswap-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">Physics Parameters</v-card-title>
          <v-card-text class="siteswap-card-content">
            <v-slider
              v-model="throwHeight"
              label="Throw Height"
              :min="10"
              :max="120"
              :step="1"
              density="compact"
              hide-details
              color="blue"
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 40px; text-align: right;">{{ throwHeight }}px</span>
              </template>
            </v-slider>

            <v-slider
              v-model="throwJitter"
              label="Throw Jitter"
              :min="0"
              :max="1"
              :step="0.01"
              density="compact"
              hide-details
              color="orange"
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 40px; text-align: right;">{{ throwJitter.toFixed(2) }}</span>
              </template>
            </v-slider>

            <v-slider
              v-model="catchJitter"
              label="Catch Jitter"
              :min="0"
              :max="1"
              :step="0.01"
              density="compact"
              hide-details
              color="red"
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 40px; text-align: right;">{{ catchJitter.toFixed(2) }}</span>
              </template>
            </v-slider>

            <v-slider
              v-model="dwellRatio"
              label="Dwell Ratio"
              :min="0.05"
              :max="0.7"
              :step="0.01"
              density="compact"
              hide-details
              color="green"
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 40px; text-align: right;">{{ dwellRatio.toFixed(2) }}</span>
              </template>
            </v-slider>

            <v-slider
              v-model="beatTiming"
              label="Beat Timing"
              :min="0.3"
              :max="1.0"
              :step="0.01"
              density="compact"
              hide-details
              color="purple"
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 40px; text-align: right;">{{ beatTiming.toFixed(2) }}</span>
              </template>
            </v-slider>
          </v-card-text>
        </v-card>

        <!-- Quick Actions -->
        <v-card class="siteswap-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">Quick Actions</v-card-title>
          <v-card-text class="siteswap-card-content">
            <v-row dense>
              <v-col cols="6">
                <v-btn
                  block
                  size="small"
                  color="teal"
                  :disabled="!letterReady || cascadeRunning"
                  @click="doSingleThrow('left')"
                >
                  Throw L→R
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  block
                  size="small"
                  color="teal"
                  :disabled="!letterReady || cascadeRunning"
                  @click="doSingleThrow('right')"
                >
                  Throw R→L
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  block
                  size="small"
                  color="indigo"
                  :disabled="!letterReady || cascadeRunning"
                  @click="doTwoHandExchange"
                >
                  2-Ball Exchange
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  block
                  size="small"
                  color="deep-orange"
                  :disabled="!letterReady"
                  @click="clearBalls"
                >
                  Clear Balls
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Sim State -->
        <v-card class="siteswap-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">
            Simulation State
            <v-spacer />
            <v-chip size="x-small" :color="loopRunning ? 'success' : 'default'" label>
              {{ loopRunning ? 'TICKING' : 'PAUSED' }}
            </v-chip>
          </v-card-title>
          <v-card-text class="siteswap-card-content">
            <div class="sim-state">
              <div><strong>Time:</strong> {{ simSnapshot.time.toFixed(2) }}s</div>
              <div><strong>Balls:</strong> {{ simSnapshot.balls.length }}</div>
              <v-divider class="my-1" />
              <div v-for="ball in simSnapshot.balls" :key="ball.id" class="ball-info">
                <v-chip size="x-small" :color="ballStatusColor(ball.status)" label class="mr-1">
                  B{{ ball.id }}
                </v-chip>
                <span class="text-caption">
                  {{ ball.status }}
                  <span v-if="ball.heldBy"> ({{ ball.heldBy }})</span>
                  — pos({{ ball.position.x.toFixed(0) }}, {{ ball.position.y.toFixed(0) }})
                </span>
              </div>
              <v-divider class="my-1" />
              <div class="text-caption">
                <strong>L:</strong> {{ simSnapshot.hands.left.intent }}
                &nbsp;|&nbsp;
                <strong>R:</strong> {{ simSnapshot.hands.right.intent }}
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Animation Column -->
      <v-col cols="12" md="5" class="d-flex flex-column align-center">
        <div class="animation-container">
          <div ref="letterContainer" class="letter-container"></div>
          <div v-if="floorYPx !== null" class="floor-line" :style="{ bottom: '0px' }"></div>
        </div>
      </v-col>

      <!-- Log Column -->
      <v-col cols="12" md="3">
        <v-card class="siteswap-card" variant="outlined" style="height: 100%;">
          <v-card-title class="py-1 text-subtitle-2">
            Event Log
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="logs = []">Clear</v-btn>
          </v-card-title>
          <v-card-text class="pa-0">
            <div class="log-container">
              <div
                v-for="(entry, idx) in logs"
                :key="idx"
                class="log-entry"
                :class="entry.type"
              >
                <span class="text-caption" style="opacity: 0.6;">{{ entry.time }}</span>
                <span class="text-caption ml-1">{{ entry.message }}</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { createLetter } from '../letterpeople';
import type { LetterInstance } from '../letterpeople/types';
import {
  createPhysicsContext,
  addBall,
  throwBall,
  catchBall,
  startPhysicsLoop,
  removeAllBalls,
  getGazeTarget,
  getDebugSnapshot,
  waitForBallStatus,
  waitForHandIdle,
  computeFlightTime,
  computeDwellWaitMs,
  sleep,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
  type Hand,
} from '../letterpeople/transforms/juggling/phrases/physics-core';

// ── Refs ──────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement | null>(null);
const letterChar = ref('J');
const letterReady = ref(false);
const initializing = ref(false);
const loopRunning = ref(false);
const cascadeRunning = ref(false);
const beatCount = ref(0);

let letterInstance: LetterInstance | null = null;
let physicsCtx: PhysicsContext | null = null;
let physicsLoop: PhysicsLoop | null = null;
let cascadeAbort = false;
let gatherRequested = false;

const floorYPx = ref<number | null>(null);
let gazeIntervalId: number | null = null;

// ── Physics Parameters ────────────────────────────────────────────────────

const throwHeight = ref(45);
const throwJitter = ref(0.0);
const catchJitter = ref(0.0);
const dwellRatio = ref(0.25);
/**
 * beatTiming controls when the next throw fires relative to the previous
 * ball's flight. 0.5 = throw when previous ball is near peak. Lower = faster
 * rhythm, higher = more relaxed.
 */
const beatTiming = ref(0.55);

// Ball colors for cascade
const BALL_COLORS = ['#3B82F6', '#EF4444', '#10B981']; // blue, red, green

// ── Sim Snapshot ──────────────────────────────────────────────────────────

const simSnapshot = reactive({
  time: 0,
  balls: [] as Array<{
    id: number;
    status: string;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    heldBy: string | null;
  }>,
  hands: {
    left: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, intent: 'idle' },
    right: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, intent: 'idle' },
  },
});

function updateSnapshot() {
  if (!physicsCtx) return;
  const snap = getDebugSnapshot(physicsCtx);
  simSnapshot.time = snap.time;
  simSnapshot.balls = snap.balls;
  simSnapshot.hands = snap.hands as any;
}

// ── Logging ───────────────────────────────────────────────────────────────

interface LogEntry {
  time: string;
  message: string;
  type: string;
}

const logs = ref<LogEntry[]>([]);

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const now = new Date();
  const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  logs.value.unshift({ time, message, type });
  if (logs.value.length > 80) logs.value.length = 80;
}

function ballStatusColor(status: string): string {
  if (status === 'in-flight') return 'blue';
  if (status === 'held') return 'green';
  if (status === 'grounded') return 'red';
  return 'default';
}

// ── Letter Init ───────────────────────────────────────────────────────────

async function initLetter() {
  if (!letterContainer.value) return;
  initializing.value = true;

  destroyEverything();
  letterContainer.value.innerHTML = '';

  const letter = createLetter(letterChar.value, letterContainer.value, {
    color: '#FF6B6B',
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: true,
    armLength: 17,
    armThickness: 3,
  });

  if (!letter) {
    log(`Failed to create letter '${letterChar.value}'`, 'error');
    initializing.value = false;
    return;
  }

  letterInstance = letter;
  await letter.arms.show({ duration: 0 });

  physicsCtx = createPhysicsContext(letter, {
    onBallGrounded: (ball) => {
      log(`Ball ${ball.id} grounded 💥`, 'warn');
    },
    onBallCaught: (ball, hand) => {
      log(`Ball ${ball.id} caught by ${hand} ✓`, 'success');
    },
    onBallReleased: (ball, hand) => {
      log(`Ball ${ball.id} released by ${hand} →`, 'info');
    },
  });

  floorYPx.value = physicsCtx.floorY;
  letterReady.value = true;
  initializing.value = false;

  startGazeTracking();
  log(`Letter '${letterChar.value}' ready. gravity=${physicsCtx.gravity.toFixed(0)} px/s²`, 'success');
}

// ── Physics Loop ──────────────────────────────────────────────────────────

function ensureLoopRunning() {
  if (physicsLoop?.running) return;
  if (!physicsCtx) return;
  physicsLoop = startPhysicsLoop(physicsCtx, () => {
    updateSnapshot();
  });
  loopRunning.value = true;
}

function stopLoop() {
  if (physicsLoop) {
    physicsLoop.stop();
    physicsLoop = null;
  }
  loopRunning.value = false;
}

// ── Gaze Tracking ─────────────────────────────────────────────────────────

function startGazeTracking() {
  stopGazeTracking();
  gazeIntervalId = window.setInterval(() => {
    if (!physicsCtx || !letterInstance) return;
    const target = getGazeTarget(physicsCtx);
    if (target) {
      void letterInstance.eyes.lookAtPoint(target, { duration: 0 });
    }
  }, 50);
}

function stopGazeTracking() {
  if (gazeIntervalId !== null) {
    clearInterval(gazeIntervalId);
    gazeIntervalId = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CASCADE ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════
//
// A 3-ball cascade (siteswap "3"):
//   - Two hands alternate throws.
//   - Each hand holds ≤1 ball; a third ball is in the air.
//   - When a ball arrives at a hand, that hand must have already thrown
//     its held ball ("throw to make room"), then catch the incoming one.
//
// The physics engine is ONE-INTENT-PER-HAND. A hand can't simultaneously
// throw AND catch. So we must sequence: throw → wait for release → catch.
//
// Per-beat flow:
//   1. THROW from currentHand toward otherHand
//   2. Wait for the ball to actually release (intent: throwing → returning)
//   3. If there's a ball incoming TO currentHand, set currentHand to catch it
//      (overwrites the returning intent — that's fine, catching is higher priority)
//   4. Wait for beat timing (fraction of flight time) before next beat
//   5. Switch hands, repeat
//
// Startup (3 balls: L has B0+B2, R has B1):
//   Beat 0: L throws B0 → R.  No incoming to L yet.
//   Beat 1: R throws B1 → L.  B0 incoming to R → R catches B0.
//   Beat 2: L throws B2 → R.  B1 incoming to L → L catches B1.
//   Beat 3: R throws B0 → L.  B2 incoming to R → R catches B2.  (steady state)
//
// ═══════════════════════════════════════════════════════════════════════════

async function startCascade() {
  if (!physicsCtx) return;
  ensureLoopRunning();

  cascadeRunning.value = true;
  cascadeAbort = false;
  gatherRequested = false;
  beatCount.value = 0;

  const ctx = physicsCtx;

  // Create 3 balls: B0 in left, B1 in right, B2 in left
  const ball0 = addBall(ctx, 'left', BALL_COLORS[0], 4);
  const ball1 = addBall(ctx, 'right', BALL_COLORS[1], 4);
  const ball2 = addBall(ctx, 'left', BALL_COLORS[2], 4);

  ball0.element.style.opacity = '1';
  ball1.element.style.opacity = '1';
  ball2.element.style.opacity = '1';

  log('Cascade starting: 3 balls placed (L: B0+B2, R: B1)', 'success');

  // Track what ball is in-flight toward each hand. When a hand finishes
  // its throw, we tell it to catch whatever is incoming.
  const incomingTo: Record<Hand, PhysicsBall | null> = { left: null, right: null };

  let currentHand: Hand = 'left';

  try {
    await sleep(400);
    if (cascadeAbort) return;

    while (!cascadeAbort && !gatherRequested) {
      const otherHand: Hand = currentHand === 'left' ? 'right' : 'left';

      // ── Find a ball held by the current hand ──────────────────────
      let ballToThrow = ctx.balls.find(
        (b) => b.status === 'held' && b.heldBy === currentHand
      );

      if (!ballToThrow) {
        // Hand might still be finishing a catch. Wait up to ~500ms.
        log(`${currentHand} has no ball yet, waiting for catch...`, 'warn');
        for (let i = 0; i < 25 && !cascadeAbort && !gatherRequested; i++) {
          await sleep(20);
          ballToThrow = ctx.balls.find(
            (b) => b.status === 'held' && b.heldBy === currentHand
          );
          if (ballToThrow) break;
        }
        if (!ballToThrow) {
          log(`${currentHand} still empty — cascade may have dropped`, 'error');
          currentHand = otherHand;
          continue;
        }
      }

      if (cascadeAbort || gatherRequested) break;

      // ── Compute timing ────────────────────────────────────────────
      const target = { ...ctx.hands[otherHand].restPosition };
      const flightTime = computeFlightTime(
        ctx.hands[currentHand].position,
        target,
        throwHeight.value,
        ctx.gravity,
      );

      const throwStartTime = performance.now();

      // ── 1. THROW from currentHand → otherHand ────────────────────
      throwBall(ctx, currentHand, ballToThrow, {
        target,
        targetHeight: throwHeight.value,
        jitter: throwJitter.value,
      });

      // Record that this ball is now incoming to otherHand
      incomingTo[otherHand] = ballToThrow;

      beatCount.value++;

      // ── 2. Wait for ball release ─────────────────────────────────
      // The throw wind-up is ~100-150ms. Once the ball enters flight,
      // the hand transitions to "returning". We can now reassign it.
      try {
        await waitForBallStatus(ballToThrow, 'in-flight', undefined, 2000);
      } catch (e) {
        log(`Throw release timeout: ${e}`, 'error');
        break;
      }

      if (cascadeAbort || gatherRequested) break;

      // ── 3. Catch incoming ball (if any) on currentHand ───────────
      // After release, currentHand is in "returning" state. If a ball
      // was thrown TO currentHand on a previous beat, set catch now.
      const incoming = incomingTo[currentHand];
      if (incoming && incoming.status === 'in-flight') {
        catchBall(ctx, currentHand, incoming, {
          jitter: catchJitter.value,
        });
        incomingTo[currentHand] = null;
      }

      // ── 4. Beat timing: wait until it's time for the next throw ──
      const elapsed = performance.now() - throwStartTime;
      const beatMs = flightTime * beatTiming.value * 1000;
      const remaining = Math.max(beatMs - elapsed, 30);
      await sleep(remaining);

      if (cascadeAbort || gatherRequested) break;

      // ── 5. Switch hands ──────────────────────────────────────────
      currentHand = otherHand;
    }

    // ── Gather: catch all in-flight balls, no new throws ───────────
    if (gatherRequested && !cascadeAbort) {
      log('Gathering — catching in-flight balls...', 'info');

      // Issue catch commands for any in-flight balls that don't
      // already have a catch scheduled via incomingTo
      const alreadyTargeted = new Set(
        Object.values(incomingTo).filter(Boolean).map((b) => b!.id),
      );

      // First, ensure already-tracked incoming balls have catches issued
      for (const [hand, ball] of Object.entries(incomingTo) as [Hand, PhysicsBall | null][]) {
        if (ball && ball.status === 'in-flight') {
          catchBall(ctx, hand, ball, { jitter: 0 });
        }
      }

      // Then pick up any remaining in-flight balls (shouldn't normally
      // happen in a clean cascade, but handles edge cases)
      const untracked = ctx.balls.filter(
        (b) => b.status === 'in-flight' && !alreadyTargeted.has(b.id),
      );
      for (const ball of untracked) {
        // Find a free hand (not already catching)
        const freeHand: Hand | null =
          ctx.hands.left.intent.type !== 'catching' ? 'left' :
          ctx.hands.right.intent.type !== 'catching' ? 'right' :
          null;
        if (freeHand) {
          catchBall(ctx, freeHand, ball, { jitter: 0 });
          // Wait for that hand to finish before assigning the next
          await waitForHandIdle(ctx, freeHand, 4000).catch(() => {});
        }
      }

      // Wait for all balls to settle (held or grounded)
      for (let i = 0; i < 200; i++) {
        const anyInFlight = ctx.balls.some((b) => b.status === 'in-flight');
        if (!anyInFlight) break;
        await sleep(25);
      }

      const held = ctx.balls.filter((b) => b.status === 'held').length;
      const grounded = ctx.balls.filter((b) => b.status === 'grounded').length;
      log(`Gather complete: ${held} held, ${grounded} grounded`, 'success');
    }
  } catch (e) {
    log(`Cascade error: ${e}`, 'error');
  }

  gatherRequested = false;
  cascadeRunning.value = false;
  log('Cascade stopped', 'info');
}

function stopCascade() {
  cascadeAbort = true;
}

function gatherAndStopCascade() {
  gatherRequested = true;
}

function toggleCascade() {
  if (cascadeRunning.value) {
    stopCascade();
  } else {
    clearBalls();
    startCascade();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS — single throws and 2-ball exchange
// ═══════════════════════════════════════════════════════════════════════════

function doSingleThrow(fromHand: Hand) {
  if (!physicsCtx) return;
  ensureLoopRunning();

  const toHand: Hand = fromHand === 'left' ? 'right' : 'left';
  const ball = addBall(physicsCtx, fromHand, BALL_COLORS[0], 4);
  ball.element.style.opacity = '1';
  const target = { ...physicsCtx.hands[toHand].restPosition };

  throwBall(physicsCtx, fromHand, ball, {
    target,
    targetHeight: throwHeight.value,
    jitter: throwJitter.value,
  });

  catchBall(physicsCtx, toHand, ball, {
    jitter: catchJitter.value,
  });

  log(`Single throw: ${fromHand} → ${toHand}`, 'info');
}

async function doTwoHandExchange() {
  if (!physicsCtx) return;
  ensureLoopRunning();

  const ctx = physicsCtx;
  const ballA = addBall(ctx, 'left', BALL_COLORS[0], 4);
  const ballB = addBall(ctx, 'right', BALL_COLORS[1], 4);
  ballA.element.style.opacity = '1';
  ballB.element.style.opacity = '1';

  const rightTarget = { ...ctx.hands.right.restPosition };
  const leftTarget = { ...ctx.hands.left.restPosition };

  // Left throws first
  throwBall(ctx, 'left', ballA, {
    target: rightTarget,
    targetHeight: throwHeight.value,
    jitter: throwJitter.value,
  });
  catchBall(ctx, 'right', ballA, { jitter: catchJitter.value });

  // Wait a beat, then right throws
  const ft = computeFlightTime(
    ctx.hands.left.position,
    rightTarget,
    throwHeight.value,
    ctx.gravity,
  );
  await sleep(ft * beatTiming.value * 1000);

  if (!physicsCtx) return;

  throwBall(ctx, 'right', ballB, {
    target: leftTarget,
    targetHeight: throwHeight.value,
    jitter: throwJitter.value,
  });
  catchBall(ctx, 'left', ballB, { jitter: catchJitter.value });

  log('2-ball exchange fired', 'info');
}

// ── Cleanup ───────────────────────────────────────────────────────────────

function clearBalls() {
  if (!physicsCtx) return;

  // Stop cascade if running
  if (cascadeRunning.value) {
    stopCascade();
  }

  removeAllBalls(physicsCtx);
  log('All balls cleared', 'info');
}

function resetAll() {
  stopCascade();
  setTimeout(() => {
    if (physicsCtx) {
      removeAllBalls(physicsCtx);
    }
    stopLoop();
    beatCount.value = 0;
    log('Reset complete', 'info');
  }, 100);
}

function destroyEverything() {
  cascadeAbort = true;
  gatherRequested = false;
  cascadeRunning.value = false;
  stopGazeTracking();
  stopLoop();

  if (physicsCtx) {
    removeAllBalls(physicsCtx);
    physicsCtx = null;
  }

  if (letterInstance) {
    try {
      letterInstance.arms.stopAnimations();
    } catch { /* ignore */ }
    letterInstance = null;
  }

  letterReady.value = false;
  floorYPx.value = null;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(() => {
  initLetter();
});

onBeforeUnmount(() => {
  destroyEverything();
});
</script>

<style scoped>
.siteswap-page {
  padding: 4px;
  height: 100vh;
}

.siteswap-row {
  height: 100%;
}

.controls-col {
  overflow-y: auto;
  max-height: 100vh;
  padding: 4px;
}

.siteswap-card {
  border-radius: 8px;
}

.siteswap-card-content {
  padding: 8px 12px !important;
}

.animation-container {
  position: relative;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 3/4;
  background: linear-gradient(
    180deg,
    rgba(240, 248, 255, 0.4) 0%,
    rgba(220, 235, 250, 0.6) 100%
  );
  border-radius: 12px;
  border: 2px dashed rgba(100, 149, 237, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.letter-container {
  width: 80%;
  height: 80%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.letter-container :deep(svg) {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.letter-container :deep(*) {
  transition: none !important;
}

.floor-line {
  position: absolute;
  left: 5%;
  right: 5%;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    rgba(139, 69, 19, 0.4),
    rgba(139, 69, 19, 0.4) 8px,
    transparent 8px,
    transparent 16px
  );
}

.sim-state {
  font-family: monospace;
  font-size: 0.75rem;
  line-height: 1.4;
}

.ball-info {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

.log-container {
  max-height: 70vh;
  overflow-y: auto;
  padding: 4px 8px;
  font-family: 'Consolas', 'Fira Code', monospace;
}

.log-entry {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding: 2px 0;
  line-height: 1.3;
}

.log-entry.success {
  color: #2e7d32;
}

.log-entry.warn {
  color: #e65100;
}

.log-entry.error {
  color: #c62828;
}

.log-entry.info {
  color: #37474f;
}
</style>