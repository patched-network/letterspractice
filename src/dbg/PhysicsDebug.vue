<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-2">⚛️ Physics Core Debug</h1>
        <p class="text-body-2 mb-4 text-medium-emphasis">
          Gravity-based throw/catch simulation. Ball flight = pure kinematics. No beziers.
          Separate throw &amp; catch jitter sliders to independently tune accuracy.
        </p>
      </v-col>
    </v-row>

    <v-row>
      <!-- Controls Column -->
      <v-col cols="12" md="5">
        <!-- Letter Setup -->
        <v-card class="mb-4" density="compact">
          <v-card-title class="text-subtitle-1 py-2">Letter</v-card-title>
          <v-card-text class="pt-0">
            <v-row dense>
              <v-col cols="4">
                <v-text-field
                  v-model="letterChar"
                  label="Char"
                  variant="outlined"
                  density="compact"
                  hide-details
                  maxlength="1"
                  @blur="reinitLetter"
                  @keyup.enter="reinitLetter"
                />
              </v-col>
              <v-col cols="4">
                <v-btn color="warning" size="small" block @click="resetAll">
                  Reset All
                </v-btn>
              </v-col>
              <v-col cols="4">
                <v-btn
                  :color="loopRunning ? 'error' : 'success'"
                  size="small"
                  block
                  @click="toggleLoop"
                >
                  {{ loopRunning ? 'Stop Loop' : 'Start Loop' }}
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Throw Parameters -->
        <v-card class="mb-4" density="compact">
          <v-card-title class="text-subtitle-1 py-2">Throw Parameters</v-card-title>
          <v-card-text class="pt-0">
            <v-slider
              v-model="targetHeight"
              label="Peak Height"
              min="3"
              max="80"
              step="1"
              thumb-label
              density="compact"
              hide-details
              class="mb-2"
            >
              <template v-slot:append>
                <span class="text-caption text-medium-emphasis" style="min-width: 36px">{{ targetHeight }}px</span>
              </template>
            </v-slider>
            <v-slider
              v-model="throwJitter"
              label="Throw Jitter"
              min="0"
              max="1"
              step="0.05"
              thumb-label
              density="compact"
              hide-details
              class="mb-2"
            >
              <template v-slot:append>
                <span class="text-caption text-medium-emphasis" style="min-width: 36px">{{ throwJitter.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-slider
              v-model="catchJitter"
              label="Catch Jitter"
              min="0"
              max="1"
              step="0.05"
              thumb-label
              density="compact"
              hide-details
            >
              <template v-slot:append>
                <span class="text-caption text-medium-emphasis" style="min-width: 36px">{{ catchJitter.toFixed(2) }}</span>
              </template>
            </v-slider>
          </v-card-text>
        </v-card>

        <!-- Single Actions -->
        <v-card class="mb-4" density="compact">
          <v-card-title class="text-subtitle-1 py-2">Single Actions</v-card-title>
          <v-card-text class="pt-0">
            <v-row dense>
              <v-col cols="6">
                <v-btn
                  color="blue-lighten-1"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doFreeFall"
                >
                  🪂 Free Fall
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="teal"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doThrowOnly('left')"
                >
                  🏀 Throw L (no catch)
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="orange"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doThrowAndCatch('left', 'right')"
                >
                  ➡️ Throw L → Catch R
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="orange"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doThrowAndCatch('right', 'left')"
                >
                  ⬅️ Throw R → Catch L
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="purple"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doTossToSelf('left')"
                >
                  🔄 Toss Self (L)
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="purple"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="doTossToSelf('right')"
                >
                  🔄 Toss Self (R)
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Looping Sequences -->
        <v-card class="mb-4" density="compact">
          <v-card-title class="text-subtitle-1 py-2">Looping Sequences</v-card-title>
          <v-card-text class="pt-0">
            <v-row dense>
              <v-col cols="6">
                <v-btn
                  color="deep-purple"
                  size="small"
                  block
                  :disabled="!letterReady || sequenceRunning"
                  @click="doArcPassLoop"
                >
                  🔁 Arc Pass Loop
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="deep-purple"
                  size="small"
                  block
                  :disabled="!letterReady || sequenceRunning"
                  @click="doTossToSelfLoop('left')"
                >
                  🔁 Toss Self Loop (L)
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="red"
                  size="small"
                  block
                  :disabled="!sequenceRunning"
                  @click="stopSequence"
                >
                  ⏹ Stop Sequence
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="grey"
                  size="small"
                  block
                  :disabled="!letterReady"
                  @click="clearBalls"
                >
                  🗑 Clear Balls
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Live Status -->
        <v-card density="compact">
          <v-card-title class="text-subtitle-1 py-2">Simulation State</v-card-title>
          <v-card-text class="pt-0">
            <div class="debug-output text-caption" style="font-family: monospace; line-height: 1.6">
              <div><strong>Time:</strong> {{ simSnapshot.time.toFixed(2) }}s</div>
              <div><strong>Gravity:</strong> {{ gravityDisplay }} px/s²</div>
              <div><strong>Floor Y:</strong> {{ floorYDisplay }}</div>
              <v-divider class="my-1" />
              <div v-for="ball in simSnapshot.balls" :key="ball.id">
                <strong>Ball {{ ball.id }}:</strong>
                {{ ball.status }}
                <span v-if="ball.heldBy"> ({{ ball.heldBy }})</span>
                &nbsp;pos=({{ ball.position.x.toFixed(1) }}, {{ ball.position.y.toFixed(1) }})
                <span v-if="ball.status === 'in-flight'">
                  vel=({{ ball.velocity.x.toFixed(0) }}, {{ ball.velocity.y.toFixed(0) }})
                </span>
              </div>
              <div v-if="simSnapshot.balls.length === 0" class="text-disabled">No balls</div>
              <v-divider class="my-1" />
              <div>
                <strong>Left:</strong> {{ simSnapshot.hands.left.intent }}
                &nbsp;({{ simSnapshot.hands.left.position.x.toFixed(1) }}, {{ simSnapshot.hands.left.position.y.toFixed(1) }})
              </div>
              <div>
                <strong>Right:</strong> {{ simSnapshot.hands.right.intent }}
                &nbsp;({{ simSnapshot.hands.right.position.x.toFixed(1) }}, {{ simSnapshot.hands.right.position.y.toFixed(1) }})
              </div>
              <v-divider class="my-1" />
              <div><strong>Gaze:</strong>
                <span v-if="gazePos">
                  ({{ gazePos.x.toFixed(1) }}, {{ gazePos.y.toFixed(1) }})
                </span>
                <span v-else class="text-disabled">none</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Letter Display Column -->
      <v-col cols="12" md="7">
        <v-card class="physics-card">
          <v-card-text class="physics-card-content">
            <div class="animation-container">
              <div ref="letterContainer" class="letter-container" />
              <!-- Floor line indicator -->
              <div
                v-if="floorYPx !== null"
                class="floor-line"
                :style="{ bottom: '0px' }"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Event Log -->
    <v-row class="mt-2">
      <v-col cols="12">
        <v-card density="compact">
          <v-card-title class="text-subtitle-1 py-2 d-flex align-center">
            Event Log
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="logs = []">Clear</v-btn>
          </v-card-title>
          <v-card-text class="pt-0">
            <div class="log-container">
              <div
                v-for="(entry, i) in logs"
                :key="i"
                class="log-entry text-caption"
                :class="entry.type"
              >
                <span class="text-disabled mr-1">{{ entry.time }}</span>
                <span :class="`text-${entry.color}`">{{ entry.message }}</span>
              </div>
              <div v-if="logs.length === 0" class="text-disabled text-caption">No events yet</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue';
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
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
  type Hand,
} from '../letterpeople/transforms/juggling/phrases/physics-core';

// ── Refs ──────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement | null>(null);
const letterChar = ref('J');
const targetHeight = ref(30);
const throwJitter = ref(0);
const catchJitter = ref(0);

let letterInstance: LetterInstance | null = null;
let physicsCtx: PhysicsContext | null = null;
let physicsLoop: PhysicsLoop | null = null;

const letterReady = ref(false);
const loopRunning = ref(false);
const sequenceRunning = ref(false);
let sequenceAbort = false;

const gravityDisplay = ref('—');
const floorYDisplay = ref('—');
const floorYPx = ref<number | null>(null);
const gazePos = ref<{ x: number; y: number } | null>(null);
let gazeIntervalId: number | null = null;

// Ball color palette for multiple balls
const BALL_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
let nextColorIdx = 0;

function nextBallColor(): string {
  const c = BALL_COLORS[nextColorIdx % BALL_COLORS.length];
  nextColorIdx++;
  return c;
}

// ── Simulation Snapshot (reactive for template) ───────────────────────────

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

// ── Event Log ─────────────────────────────────────────────────────────────

interface LogEntry {
  time: string;
  message: string;
  type: string;
  color: string;
}

const logs = ref<LogEntry[]>([]);

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const colorMap = { info: 'white', success: 'green', warn: 'orange', error: 'red' };
  const now = new Date();
  const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  logs.value.unshift({ time, message, type, color: colorMap[type] });
  if (logs.value.length > 50) logs.value.length = 50;
}

// ── Letter Init ───────────────────────────────────────────────────────────

async function initLetter() {
  if (!letterContainer.value) return;

  // Cleanup previous
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
    return;
  }

  letterInstance = letter;
  await letter.arms.show({ duration: 0 });

  // Create physics context
  physicsCtx = createPhysicsContext(letter, {
    onBallGrounded: (ball) => {
      log(`Ball ${ball.id} hit the floor! 💥`, 'warn');
    },
    onBallCaught: (ball, hand) => {
      log(`Ball ${ball.id} caught by ${hand} hand ✓`, 'success');
    },
    onBallReleased: (ball, hand) => {
      log(`Ball ${ball.id} released by ${hand} hand →`, 'info');
    },
  });

  gravityDisplay.value = physicsCtx.gravity.toFixed(1);
  floorYDisplay.value = physicsCtx.floorY.toFixed(1);
  floorYPx.value = physicsCtx.floorY;

  letterReady.value = true;
  nextColorIdx = 0;

  log(`Letter '${letterChar.value}' initialized. pxPerMeter=${physicsCtx.pxPerMeter.toFixed(1)}`, 'success');

  // Start gaze tracking
  startGazeTracking();
}

async function reinitLetter() {
  await initLetter();
}

// ── Gaze Tracking ─────────────────────────────────────────────────────────

function startGazeTracking() {
  stopGazeTracking();
  gazeIntervalId = window.setInterval(() => {
    if (!physicsCtx || !letterInstance) return;
    const target = getGazeTarget(physicsCtx);
    gazePos.value = target;
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

// ── Physics Loop Control ──────────────────────────────────────────────────

function startLoop() {
  if (!physicsCtx || physicsLoop?.running) return;
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

function toggleLoop() {
  if (loopRunning.value) {
    stopLoop();
  } else {
    startLoop();
  }
}

function ensureLoopRunning() {
  if (!loopRunning.value) startLoop();
}

// ── Actions ───────────────────────────────────────────────────────────────

function doFreeFall() {
  if (!physicsCtx) return;
  ensureLoopRunning();

  // Create a ball at the left hand and immediately release it
  const ball = addBall(physicsCtx, 'left', nextBallColor());
  // Manually set to in-flight with zero velocity → pure free fall
  ball.status = 'in-flight';
  ball.heldBy = null;
  ball.velocity = { x: 0, y: 0 };

  log(`Free fall: ball ${ball.id} released from left hand`, 'info');
}

function doThrowOnly(fromHand: Hand) {
  if (!physicsCtx) return;
  ensureLoopRunning();

  const toHand: Hand = fromHand === 'left' ? 'right' : 'left';
  const ball = addBall(physicsCtx, fromHand, nextBallColor());
  const target = { ...physicsCtx.hands[toHand].restPosition };

  throwBall(physicsCtx, fromHand, ball, {
    target,
    targetHeight: targetHeight.value,
    jitter: throwJitter.value,
  });

  log(`Throw (no catch): ${fromHand} → target, height=${targetHeight.value}px, throwJitter=${throwJitter.value.toFixed(2)}`, 'info');
}

function doThrowAndCatch(fromHand: Hand, toHand: Hand) {
  if (!physicsCtx) return;
  ensureLoopRunning();

  const ball = addBall(physicsCtx, fromHand, nextBallColor());
  const target = { ...physicsCtx.hands[toHand].restPosition };

  // Throw from one hand
  throwBall(physicsCtx, fromHand, ball, {
    target,
    targetHeight: targetHeight.value,
    jitter: throwJitter.value,
  });

  // Catch with the other hand (preemptive — will wait for ball to enter flight)
  catchBall(physicsCtx, toHand, ball, {
    jitter: catchJitter.value,
  });

  log(`Throw+Catch: ${fromHand} → ${toHand}, height=${targetHeight.value}px, throwJ=${throwJitter.value.toFixed(2)}, catchJ=${catchJitter.value.toFixed(2)}`, 'info');
}

async function doTossToSelf(hand: Hand) {
  if (!physicsCtx) return;
  ensureLoopRunning();

  const ball = addBall(physicsCtx, hand, nextBallColor());
  const target = { ...physicsCtx.hands[hand].restPosition };

  // Throw up from this hand
  throwBall(physicsCtx, hand, ball, {
    target,
    targetHeight: targetHeight.value,
    jitter: throwJitter.value,
  });

  log(`Toss to self (${hand}): height=${targetHeight.value}px, throwJ=${throwJitter.value.toFixed(2)}, catchJ=${catchJitter.value.toFixed(2)}`, 'info');

  // Wait for ball to become in-flight (throw release), THEN set catch on same hand
  try {
    await waitForBallStatus(ball, 'in-flight', undefined, 2000);
    if (physicsCtx) {
      catchBall(physicsCtx, hand, ball, { jitter: catchJitter.value });
    }
  } catch (e) {
    log(`Toss to self: failed to wait for release — ${e}`, 'warn');
  }
}

// ── Looping Sequences ─────────────────────────────────────────────────────

async function doArcPassLoop() {
  if (!physicsCtx) return;
  ensureLoopRunning();

  sequenceRunning.value = true;
  sequenceAbort = false;

  const ctx = physicsCtx;
  const ball = addBall(ctx, 'left', nextBallColor());

  log('Arc Pass Loop started (press Stop to end)', 'success');

  let fromHand: Hand = 'left';

  try {
    while (!sequenceAbort) {
      const toHand: Hand = fromHand === 'left' ? 'right' : 'left';
      const target = { ...ctx.hands[toHand].restPosition };

      throwBall(ctx, fromHand, ball, {
        target,
        targetHeight: targetHeight.value,
        jitter: throwJitter.value,
      });

      catchBall(ctx, toHand, ball, { jitter: catchJitter.value });

      // Wait for the ball to be caught
      await waitForBallStatus(ball, 'held', toHand, 6000);

      if (sequenceAbort) break;

      // Brief dwell in hand before next throw
      await sleep(80);

      fromHand = toHand;
    }
  } catch (e) {
    log(`Arc Pass Loop ended: ${e}`, 'warn');
  }

  sequenceRunning.value = false;
  log('Arc Pass Loop stopped', 'info');
}

async function doTossToSelfLoop(hand: Hand) {
  if (!physicsCtx) return;
  ensureLoopRunning();

  sequenceRunning.value = true;
  sequenceAbort = false;

  const ctx = physicsCtx;
  const ball = addBall(ctx, hand, nextBallColor());

  log(`Toss to Self Loop (${hand}) started`, 'success');

  try {
    while (!sequenceAbort) {
      const target = { ...ctx.hands[hand].restPosition };

      throwBall(ctx, hand, ball, {
        target,
        targetHeight: targetHeight.value,
        jitter: throwJitter.value,
      });

      await waitForBallStatus(ball, 'in-flight', undefined, 2000);
      if (sequenceAbort) break;

      catchBall(ctx, hand, ball, { jitter: catchJitter.value });

      await waitForBallStatus(ball, 'held', hand, 6000);
      if (sequenceAbort) break;

      await sleep(60);
    }
  } catch (e) {
    log(`Toss to Self Loop ended: ${e}`, 'warn');
  }

  sequenceRunning.value = false;
  log('Toss to Self Loop stopped', 'info');
}

function stopSequence() {
  sequenceAbort = true;
  log('Sequence stop requested', 'warn');
}

// ── Cleanup ───────────────────────────────────────────────────────────────

function clearBalls() {
  if (!physicsCtx) return;
  stopSequence();
  removeAllBalls(physicsCtx);
  nextColorIdx = 0;
  log('All balls cleared', 'info');
}

function resetAll() {
  stopSequence();
  stopLoop();
  stopGazeTracking();

  if (physicsCtx) {
    removeAllBalls(physicsCtx);
  }

  physicsCtx = null;
  letterReady.value = false;
  nextColorIdx = 0;
  gazePos.value = null;

  simSnapshot.time = 0;
  simSnapshot.balls = [];
  simSnapshot.hands.left.intent = 'idle';
  simSnapshot.hands.right.intent = 'idle';

  log('Full reset', 'warn');

  // Reinitialize
  void initLetter();
}

function destroyEverything() {
  stopSequence();
  stopLoop();
  stopGazeTracking();

  if (physicsCtx) {
    removeAllBalls(physicsCtx);
    physicsCtx = null;
  }

  if (letterInstance) {
    letterInstance.destroy();
    letterInstance = null;
  }

  letterReady.value = false;
}

// ── Utility ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(() => {
  void initLetter();
});

onBeforeUnmount(() => {
  destroyEverything();
});
</script>

<style scoped>
.physics-card {
  overflow: visible !important;
}

.physics-card-content {
  overflow: visible !important;
  padding: 0 !important;
}

.animation-container {
  min-height: 600px;
  height: 600px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 8px;
  padding: 80px 40px 20px 40px;
  position: relative;
  overflow: visible !important;
}

.letter-container {
  width: 320px;
  height: 320px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: visible !important;
  padding: 20px;
  margin: -20px;
}

.letter-container :deep(svg) {
  max-width: 320px;
  max-height: 320px;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
}

.letter-container :deep(*) {
  overflow: visible !important;
}

.floor-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    #ef5350 0px,
    #ef5350 8px,
    transparent 8px,
    transparent 16px
  );
  opacity: 0.5;
  pointer-events: none;
}

.log-container {
  max-height: 180px;
  overflow-y: auto;
  background: #1e1e1e;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.log-entry {
  padding: 1px 0;
  line-height: 1.5;
}

.log-entry.warn {
  opacity: 0.9;
}

.log-entry.error {
  font-weight: 600;
}
</style>