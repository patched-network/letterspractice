<template>
  <v-container fluid class="juggling-persistent-page pa-2">
    <v-row class="juggling-row" no-gutters>
      <!-- ═══ LEFT: Letter display + ball status ═══ -->
      <v-col cols="8" class="pr-2">
        <!-- Letter selector bar -->
        <div class="d-flex align-center mb-2 ga-2">
          <span class="text-h6">🤹‍♂️ Persistent Juggling</span>
          <v-text-field
            v-model="letterChar"
            label="Letter"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 80px"
            @keydown.enter="updateLetterChar"
          />
          <v-btn size="small" color="primary" @click="updateLetterChar">
            Set
          </v-btn>
          <v-spacer />
          <v-chip
            :color="isAnimating ? 'success' : 'default'"
            size="small"
            variant="flat"
          >
            {{ isAnimating ? '▶ Running' : '⏸ Idle' }}
          </v-chip>
        </div>

        <!-- Animation container -->
        <v-card class="juggling-card" variant="outlined">
          <v-card-text class="juggling-card-content pa-0">
            <div class="animation-container">
              <div ref="letterContainer" class="letter-container" />
            </div>

            <!-- Ball status bar -->
            <div class="d-flex align-center ga-2 pa-2 ball-status-bar">
              <span class="text-caption font-weight-bold mr-1">Balls:</span>
              <v-chip
                v-for="(bs, i) in ballStates"
                :key="i"
                :color="bs.status === 'held' ? 'success' : bs.status === 'grounded' ? 'error' : 'warning'"
                size="small"
                variant="flat"
                class="ball-chip"
              >
                <span v-if="bs.status === 'held'">🟢 {{ bs.heldBy }}</span>
                <span v-else-if="bs.status === 'grounded'">🔴 ground</span>
                <span v-else-if="bs.status === 'in-flight'">🟡 flight</span>
                <span v-else>⚫ {{ bs.status }}</span>
              </v-chip>
              <v-chip v-if="ballStates.length === 0" size="small" variant="flat" color="grey">
                ⚫ no balls
              </v-chip>
              <v-spacer />
              <v-chip size="x-small" variant="text">
                held: {{ heldCount }} / grounded: {{ groundedCount }} / flight: {{ flightCount }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ═══ RIGHT: Controls ═══ -->
      <v-col cols="4" class="controls-col">
        <!-- Parameters -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">Controls</v-card-title>
          <v-card-text class="pa-2 pt-1">
            <v-text-field
              v-model.number="phraseCount"
              label="Count (0=loop)"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-1"
            />
            <v-slider
              v-model="phraseHeight"
              :min="5"
              :max="60"
              :step="1"
              label="Height"
              density="compact"
              hide-details
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 28px">{{ phraseHeight }}</span>
              </template>
            </v-slider>
            <v-slider
              v-model="phraseJitter"
              :min="0"
              :max="1"
              :step="0.05"
              label="Jitter"
              density="compact"
              hide-details
              class="mb-1"
            >
              <template #append>
                <span class="text-caption" style="min-width: 36px">{{ phraseJitter.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-slider
              v-model="phraseDwell"
              :min="0.1"
              :max="0.8"
              :step="0.05"
              label="Dwell"
              density="compact"
              hide-details
            >
              <template #append>
                <span class="text-caption" style="min-width: 36px">{{ phraseDwell.toFixed(2) }}</span>
              </template>
            </v-slider>
          </v-card-text>
        </v-card>

        <!-- Single Ball Phrases ✅ -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">
            Single Ball
            <v-chip size="x-small" color="success" variant="flat" class="ml-1">✅ persistent</v-chip>
          </v-card-title>
          <v-card-text class="pa-2 pt-1">
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                v-for="phrase in singleBallPhrases"
                :key="phrase.value"
                size="x-small"
                variant="tonal"
                :color="activePhraseKey === phrase.value ? 'primary' : undefined"
                class="phrase-btn"
                @click="launchPhrase(phrase.value)"
              >
                {{ phrase.label }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Two Ball Phrases ✅ -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">
            Two Ball
            <v-chip size="x-small" color="success" variant="flat" class="ml-1">✅ persistent</v-chip>
          </v-card-title>
          <v-card-text class="pa-2 pt-1">
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                v-for="phrase in twoBallPhrases"
                :key="phrase.value"
                size="x-small"
                variant="tonal"
                :color="activePhraseKey === phrase.value ? 'primary' : undefined"
                class="phrase-btn"
                @click="launchPhrase(phrase.value)"
              >
                {{ phrase.label }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Three Ball Phrases ✅ -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">
            Three Ball
            <v-chip size="x-small" color="success" variant="flat" class="ml-1">✅ persistent</v-chip>
          </v-card-title>
          <v-card-text class="pa-2 pt-1">
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                size="x-small"
                variant="tonal"
                :color="activePhraseKey === 'cascade' ? 'primary' : undefined"
                class="phrase-btn"
                @click="launchPhrase('cascade')"
              >
                Cascade
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Utility Phrases -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">
            Utility
            <v-chip size="x-small" color="info" variant="flat" class="ml-1">persistent</v-chip>
          </v-card-title>
          <v-card-text class="pa-2 pt-1">
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                size="x-small"
                variant="tonal"
                color="teal"
                class="phrase-btn"
                :color-active="activePhraseKey === 'dropToFloor' ? 'primary' : undefined"
                @click="launchUtilityPhrase('dropToFloor')"
              >
                Drop → Floor
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="teal"
                class="phrase-btn"
                @click="launchUtilityPhrase('pickUp')"
              >
                Pick Up
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Transport -->
        <v-card density="compact" class="mb-2" variant="outlined">
          <v-card-title class="text-subtitle-2 pa-2 pb-0">Transport</v-card-title>
          <v-card-text class="pa-2 pt-1">
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                size="x-small"
                variant="tonal"
                color="error"
                class="phrase-btn"
                @click="stopPhrase"
              >
                ⏹ Stop Phrase
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="warning"
                class="phrase-btn"
                @click="resetBalls"
              >
                🔄 Reset Balls
              </v-btn>
              <v-btn
                size="x-small"
                variant="tonal"
                color="error"
                class="phrase-btn"
                @click="resetAll"
              >
                💥 Reset All
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Log -->
        <v-card density="compact" variant="outlined">
          <v-card-text class="pa-2">
            <div class="d-flex align-center mb-1">
              <span class="text-caption font-weight-bold">Log</span>
              <v-spacer />
              <v-btn size="x-small" variant="text" @click="logs = []">Clear</v-btn>
            </div>
            <div class="log-container" ref="logContainer">
              <div v-for="(entry, i) in logs" :key="i" class="log-entry">
                <small>{{ entry }}</small>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { createLetter } from '../letterpeople';
import type { LetterInstance } from '../letterpeople/types';
import type { JugglingController } from '../letterpeople/transforms/juggling/types';

// Physics core — persistent context management
import {
  createPhysicsContext,
  addBallAt,
  removeBall,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  sleep,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from '../letterpeople/transforms/juggling/phrases/physics-core';

// Single-ball phrases (persistent context supported)
import { tossToSelf, arcPass, handoff, drop } from '../letterpeople/transforms/juggling/phrases';
import { dropToFloor } from '../letterpeople/transforms/juggling/phrases/dropToFloor';
import { pickUp } from '../letterpeople/transforms/juggling/phrases/pickUp';
import { failedCatch } from '../letterpeople/transforms/juggling/phrases/failedCatch';
import { oneHandedTossAndCatch } from '../letterpeople/transforms/juggling/phrases/oneHandedTossAndCatch';
import { tossTo2HandedCatch } from '../letterpeople/transforms/juggling/phrases/tossTo2HandedCatch';

// Multi-ball phrases (now with persistent context support)
import { cascadePhrase, type CascadeController } from '../letterpeople/transforms/juggling/phrases/cascadePhrase';
import { syncColumns, asyncColumns } from '../letterpeople/transforms/juggling/phrases/syncColumns';
import { twoBallExchange } from '../letterpeople/transforms/juggling/phrases/twoBallExchange';
import { twoBallContinuous } from '../letterpeople/transforms/juggling/phrases/twoBallContinuous';

// ── Types ────────────────────────────────────────────────────────────────────

type PhraseKey =
  | 'tossToSelf' | 'arcPass' | 'handoff' | 'drop'
  | 'dropToFloor' | 'pickUp'
  | 'failedCatch' | 'oneHandedTossAndCatch' | 'tossTo2HandedCatch'
  | 'cascade'
  | 'syncColumns' | 'asyncColumns' | 'twoBallExchange' | 'twoBallContinuous';

// ── Phrase group definitions ─────────────────────────────────────────────────

const singleBallPhrases: { value: PhraseKey; label: string }[] = [
  { value: 'tossToSelf', label: 'Toss Self' },
  { value: 'arcPass', label: 'Arc Pass' },
  { value: 'handoff', label: 'Handoff' },
  { value: 'drop', label: 'Drop' },
  { value: 'failedCatch', label: 'Failed Catch' },
  { value: 'oneHandedTossAndCatch', label: '1H Toss+Catch' },
  { value: 'tossTo2HandedCatch', label: '2H Catch' },
];

const twoBallPhrases: { value: PhraseKey; label: string }[] = [
  { value: 'syncColumns', label: 'Sync Columns' },
  { value: 'asyncColumns', label: 'Async Columns' },
  { value: 'twoBallExchange', label: '2B Exchange' },
  { value: 'twoBallContinuous', label: '2B Continuous' },
];

function getBallCount(key: PhraseKey): number {
  if (['syncColumns', 'asyncColumns', 'twoBallExchange', 'twoBallContinuous'].includes(key)) return 2;
  if (key === 'cascade') return 3;
  return 1;
}

// ── Refs ─────────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement | null>(null);
const logContainer = ref<HTMLDivElement | null>(null);
const letterInstance = ref<LetterInstance | null>(null);
const letterChar = ref('j');
const isAnimating = ref(false);
const logs = ref<string[]>([]);
const activePhraseKey = ref<PhraseKey | null>(null);

// Phrase parameters
const phraseCount = ref(3);
const phraseHeight = ref(35);
const phraseJitter = ref(0.2);
const phraseDwell = ref(0.42);

// ── Persistent physics state ─────────────────────────────────────────────────

let physCtx: PhysicsContext | null = null;
let physLoop: PhysicsLoop | null = null;
const balls: PhysicsBall[] = [];
let activeController: JugglingController | null = null;
let gazePollId: number | null = null;

// ── Reactive ball state (polled) ─────────────────────────────────────────────

const ballStates = ref<Array<{ status: string; heldBy: string | null }>>([]);
let ballPollId: number | null = null;

const heldCount = computed(() => ballStates.value.filter(b => b.status === 'held').length);
const groundedCount = computed(() => ballStates.value.filter(b => b.status === 'grounded').length);
const flightCount = computed(() => ballStates.value.filter(b => b.status === 'in-flight').length);

function startBallPoll() {
  if (ballPollId !== null) return;
  ballPollId = window.setInterval(() => {
    ballStates.value = balls.map(b => ({ status: b.status, heldBy: b.heldBy }));
  }, 100);
}

function stopBallPoll() {
  if (ballPollId !== null) {
    clearInterval(ballPollId);
    ballPollId = null;
  }
}

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  logs.value.push(`[${timestamp}] ${msg}`);
  if (logs.value.length > 200) logs.value.splice(0, logs.value.length - 200);
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

// ── Letter initialization ────────────────────────────────────────────────────

async function initializeLetter() {
  if (!letterContainer.value) return;

  // Tear down existing
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
  })!;

  if (!letter) {
    log(`❌ Failed to create letter '${letterChar.value}'`);
    return;
  }

  await letter.arms.show({ duration: 0 });
  letterInstance.value = letter;
  log(`Letter '${letterChar.value}' created`);

  // Create persistent physics context + loop
  initializePhysics();
}

function initializePhysics() {
  if (!letterInstance.value) return;

  // Create persistent physics context
  physCtx = createPhysicsContext(letterInstance.value);
  physLoop = startPhysicsLoop(physCtx, (ctx) => {
    // Gaze tracking callback in the main loop
    const gaze = getGazeTarget(ctx);
    if (gaze && letterInstance.value) {
      void letterInstance.value.eyes.lookAtPoint(gaze, { duration: 80 });
    }
  });

  log('Physics context + loop created (persistent)');

  // Place 3 balls on the ground
  placeInitialBalls();

  // Start polling ball status
  startBallPoll();
}

function placeInitialBalls() {
  if (!physCtx || !letterInstance.value) return;

  const floorY = physCtx.floorY;
  // Use SVG-local coords — average hand rest positions for horizontal center
  const leftRest = physCtx.hands.left.restPosition;
  const rightRest = physCtx.hands.right.restPosition;
  const centerX = (leftRest.x + rightRest.x) / 2;
  const spacing = 12;

  log(`floorY=${floorY.toFixed(1)}, centerX=${centerX.toFixed(1)} (SVG-local)`);

  for (let i = 0; i < 3; i++) {
    const x = centerX + (i - 1) * spacing;
    const ball = addBallAt(physCtx, { x, y: floorY - 4 }, 'grounded', '#3B82F6');
    ball.element.style.opacity = '1';
    balls.push(ball);
    log(`  ball ${i}: cx=${ball.element.getAttribute('cx')}, cy=${ball.element.getAttribute('cy')}, parent=${ball.element.parentElement?.tagName}`);
  }

  log(`Placed 3 balls on ground`);
}

async function updateLetterChar() {
  if (letterChar.value && letterChar.value.length === 1) {
    await initializeLetter();
  }
}

// ── Ball management layer ────────────────────────────────────────────────────

/**
 * Orchestrate pickup/drop to get the right number of balls held.
 * Returns the array of currently-held balls after preparation.
 */
async function prepareBalls(needed: number): Promise<PhysicsBall[]> {
  if (!physCtx || !physLoop || !letterInstance.value) return [];

  let held = balls.filter(b => b.status === 'held');
  let grounded = balls.filter(b => b.status === 'grounded');

  // Drop excess balls
  while (held.length > needed && held.length > 0) {
    const toDrop = held.pop()!;
    const hand = (toDrop.heldBy ?? 'left') as 'left' | 'right';
    log(`⬇ Dropping ball from ${hand}...`);
    try {
      const ctrl = await dropToFloor(letterInstance.value!, {
        hand,
        keepBallOnGround: true,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: toDrop,
      });
      await ctrl.completed;
      log(`  ✓ Ball dropped to floor from ${hand}`);
    } catch (e) {
      log(`  ✗ Drop failed: ${e}`);
    }
    // Re-scan after each operation
    held = balls.filter(b => b.status === 'held');
    grounded = balls.filter(b => b.status === 'grounded');
  }

  // Pick up needed balls (animated via pickUp phrase)
  while (held.length < needed && grounded.length > 0) {
    const toPickUp = grounded.shift()!;
    // Alternate hands: L, R, L, R, ... based on how many are already held
    const handIndex = held.length;
    const hand: 'left' | 'right' = handIndex % 2 === 0 ? 'left' : 'right';
    log(`⬆ Picking up ball to ${hand}...`);
    try {
      const ctrl = await pickUp(letterInstance.value!, {
        hand,
        existingContext: physCtx!,
        existingLoop: physLoop!,
        existingBall: toPickUp,
        ballPosition: { x: toPickUp.position.x, y: toPickUp.position.y },
      });
      // Await natural completion (not stop() which would short-circuit the animation)
      await ctrl.completed;
      log(`  ✓ Ball picked up to ${hand}`);
    } catch (e) {
      log(`  ✗ Pick up failed: ${e}`);
      break;
    }
    // Re-scan after each operation
    held = balls.filter(b => b.status === 'held');
    grounded = balls.filter(b => b.status === 'grounded');
  }

  return held;
}

// ── Gaze polling (for phrase controllers that set gazeTarget) ─────────────

function startGazePoll() {
  if (gazePollId !== null) clearInterval(gazePollId);
  gazePollId = window.setInterval(() => {
    if (!activeController) {
      return;
    }
    if (activeController.gazeTarget && letterInstance.value) {
      void letterInstance.value.eyes.lookAtPoint(activeController.gazeTarget, { duration: 80 });
    }
    if (!activeController.active) {
      isAnimating.value = false;
      activePhraseKey.value = null;
    }
  }, 100);
}

function stopGazePoll() {
  if (gazePollId !== null) {
    clearInterval(gazePollId);
    gazePollId = null;
  }
}

// ── Launch: persistent phrase (single-ball AND multi-ball) ───────────────────

async function launchPhrase(key: PhraseKey) {
  if (!letterInstance.value || !physCtx || !physLoop) {
    log('❌ No letter or physics context');
    return;
  }

  // Stop any running phrase controller (but keep balls + physics alive)
  if (activeController) {
    try {
      await activeController.stop();
    } catch {
      // ignore
    }
    activeController = null;
  }

  activePhraseKey.value = key;
  isAnimating.value = true;

  const ballsNeeded = getBallCount(key);

  try {
    log(`Preparing ${ballsNeeded} ball(s) for ${key}...`);
    const held = await prepareBalls(ballsNeeded);

    if (held.length < ballsNeeded) {
      log(`❌ Not enough balls for ${key} (have ${held.length}, need ${ballsNeeded})`);
      isAnimating.value = false;
      activePhraseKey.value = null;
      return;
    }

    const ball = held[0];
    const ballHand = (ball.heldBy ?? 'left') as 'left' | 'right';
    const letter = letterInstance.value!;

    if (key === 'tossToSelf') {
      activeController = await tossToSelf(letter, {
        hand: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'arcPass') {
      activeController = await arcPass(letter, {
        from: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'handoff') {
      activeController = await handoff(letter, {
        from: ballHand,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'drop') {
      activeController = await drop(letter, {
        from: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'failedCatch') {
      activeController = await failedCatch(letter, {
        from: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        throwJitter: phraseJitter.value,
        leaveBallOnFloor: true,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'oneHandedTossAndCatch') {
      activeController = await oneHandedTossAndCatch(letter, {
        hand: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'tossTo2HandedCatch') {
      activeController = await tossTo2HandedCatch(letter, {
        from: ballHand,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
    } else if (key === 'syncColumns') {
      activeController = await syncColumns(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBalls: held,
      });
    } else if (key === 'asyncColumns') {
      activeController = await asyncColumns(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBalls: held,
      });
    } else if (key === 'twoBallExchange') {
      activeController = await twoBallExchange(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        from: ballHand,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBalls: held,
      });
    } else if (key === 'twoBallContinuous') {
      activeController = await twoBallContinuous(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        from: ballHand,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBalls: held,
      });
    } else if (key === 'cascade') {
      activeController = await cascadePhrase(letter, {
        height: () => phraseHeight.value,
        throwJitter: () => phraseJitter.value,
        catchJitter: () => phraseJitter.value,
        dwell: () => phraseDwell.value,
        maxBeats: phraseCount.value > 0 ? phraseCount.value * 3 : 0,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBalls: held,
      });
    }

    startGazePoll();
    log(`▶ ${key} (persistent ctx, balls=${held.length}, hand=${ballHand}, h=${phraseHeight.value}, j=${phraseJitter.value.toFixed(2)}, d=${phraseDwell.value.toFixed(2)}, c=${phraseCount.value})`);
  } catch (error) {
    log(`❌ ERROR launching ${key}: ${error}`);
    isAnimating.value = false;
    activePhraseKey.value = null;
  }
}

// ── Launch: utility phrases (dropToFloor / pickUp) ───────────────────────────

async function launchUtilityPhrase(key: 'dropToFloor' | 'pickUp') {
  if (!letterInstance.value || !physCtx || !physLoop) {
    log('❌ No letter or physics context');
    return;
  }

  // Stop any running phrase controller
  if (activeController) {
    try {
      await activeController.stop();
    } catch {
      // ignore
    }
    activeController = null;
  }

  activePhraseKey.value = key;
  isAnimating.value = true;

  try {
    if (key === 'dropToFloor') {
      // Find a held ball to drop
      const held = balls.filter(b => b.status === 'held');
      if (held.length === 0) {
        log('⚠️ No held balls to drop');
        isAnimating.value = false;
        activePhraseKey.value = null;
        return;
      }
      const ball = held[0];
      const hand = (ball.heldBy ?? 'left') as 'left' | 'right';
      log(`⬇ dropToFloor from ${hand} (persistent)...`);
      activeController = await dropToFloor(letterInstance.value, {
        hand,
        keepBallOnGround: true,
        liftHeight: phraseHeight.value,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
      });
      startGazePoll();
      log(`▶ dropToFloor (persistent ctx)`);
    } else if (key === 'pickUp') {
      // Find a grounded ball to pick up
      const grounded = balls.filter(b => b.status === 'grounded');
      if (grounded.length === 0) {
        log('⚠️ No grounded balls to pick up');
        isAnimating.value = false;
        activePhraseKey.value = null;
        return;
      }
      const ball = grounded[0];
      const held = balls.filter(b => b.status === 'held');
      const pickHand: 'left' | 'right' = held.some(b => b.heldBy === 'left') ? 'right' : 'left';
      log(`⬆ pickUp to ${pickHand} (persistent)...`);
      activeController = await pickUp(letterInstance.value, {
        hand: pickHand,
        existingContext: physCtx,
        existingLoop: physLoop,
        existingBall: ball,
        ballPosition: { x: ball.position.x, y: ball.position.y },
      });
      startGazePoll();
      log(`▶ pickUp (persistent ctx)`);
    }
  } catch (error) {
    log(`❌ ERROR launching ${key}: ${error}`);
    isAnimating.value = false;
    activePhraseKey.value = null;
  }
}

// ── Launch: multi-ball standalone (kept for force-standalone toggle) ──────────

async function launchPhraseStandalone(key: PhraseKey) {
  if (!letterInstance.value) {
    log('❌ No letter');
    return;
  }

  // Stop persistent phrase + hide persistent balls during standalone run
  if (activeController) {
    try {
      await activeController.stop();
    } catch {
      // ignore
    }
    activeController = null;
  }

  // Temporarily hide persistent balls so they don't overlap
  for (const b of balls) {
    b.element.style.opacity = '0';
  }

  activePhraseKey.value = key;
  isAnimating.value = true;

  log(`⚠️ ${key} — standalone context (force-standalone mode)`);

  let ctrl: JugglingController | null = null;

  try {
    const letter = letterInstance.value;

    if (key === 'syncColumns') {
      ctrl = await syncColumns(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
      });
    } else if (key === 'asyncColumns') {
      ctrl = await asyncColumns(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
      });
    } else if (key === 'twoBallExchange') {
      ctrl = await twoBallExchange(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        from: 'left',
      });
    } else if (key === 'twoBallContinuous') {
      ctrl = await twoBallContinuous(letter, {
        height: phraseHeight.value,
        count: phraseCount.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        from: 'left',
      });
    } else if (key === 'cascade') {
      ctrl = await cascadePhrase(letter, {
        height: () => phraseHeight.value,
        throwJitter: () => phraseJitter.value,
        catchJitter: () => phraseJitter.value,
        dwell: () => phraseDwell.value,
        maxBeats: phraseCount.value > 0 ? phraseCount.value * 3 : 0,
      });
    }

    if (ctrl) {
      // Store a temporary standalone controller so Stop Phrase works
      activeController = ctrl;

      // Set up a watcher so we restore persistent balls when standalone finishes
      const pollId = window.setInterval(() => {
        if (!ctrl || !ctrl.active) {
          clearInterval(pollId);
          isAnimating.value = false;
          activePhraseKey.value = null;
          activeController = null;
          // Restore persistent ball visibility
          for (const b of balls) {
            b.element.style.opacity = '1';
          }
          log(`✓ ${key} standalone finished — persistent balls restored`);
        }
      }, 200);

      log(`▶ ${key} (standalone, h=${phraseHeight.value}, c=${phraseCount.value})`);
    }
  } catch (error) {
    log(`❌ ERROR launching standalone ${key}: ${error}`);
    isAnimating.value = false;
    activePhraseKey.value = null;
    // Restore persistent ball visibility on error
    for (const b of balls) {
      b.element.style.opacity = '1';
    }
  }
}

// ── Transport controls ───────────────────────────────────────────────────────

async function stopPhrase() {
  if (activeController) {
    log('⏹ Stopping phrase (balls remain in current state)...');
    try {
      await activeController.stop();
    } catch {
      // Some controllers may already be stopped
      try {
        activeController.destroy();
      } catch {
        // ignore
      }
    }
    activeController = null;
  }
  stopGazePoll();
  isAnimating.value = false;
  activePhraseKey.value = null;

  // Restore persistent ball visibility in case standalone was running
  for (const b of balls) {
    b.element.style.opacity = '1';
  }

  log('⏹ Phrase stopped');
}

/**
 * Remove all balls from the persistent context, then re-place 3 grounded balls.
 */
function resetBalls() {
  if (!physCtx) return;

  // Remove all tracked balls
  removeAllBalls(physCtx);
  balls.length = 0;

  // Re-place 3 grounded balls
  placeInitialBalls();
  log('🔄 Balls reset: 3 grounded');
}

/**
 * Full teardown and rebuild: stop everything, destroy letter, reinitialize.
 */
async function resetAll() {
  log('💥 Full reset...');
  destroyEverything();
  await initializeLetter();
  log('💥 Full reset complete');
}

// ── Cleanup / teardown ───────────────────────────────────────────────────────

function destroyEverything() {
  // Stop gaze & ball polling
  stopGazePoll();
  stopBallPoll();

  // Stop active phrase
  if (activeController) {
    try {
      activeController.destroy();
    } catch {
      // ignore
    }
    activeController = null;
  }

  // Stop physics loop
  if (physLoop) {
    physLoop.stop();
    physLoop = null;
  }

  // Clean up balls from context
  if (physCtx) {
    removeAllBalls(physCtx);
    physCtx = null;
  }
  balls.length = 0;
  ballStates.value = [];

  // Destroy letter
  if (letterInstance.value) {
    letterInstance.value.destroy();
    letterInstance.value = null;
  }

  isAnimating.value = false;
  activePhraseKey.value = null;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  log('Mounted — initializing persistent juggling debug');
  initializeLetter();
});

onBeforeUnmount(() => {
  destroyEverything();
});
</script>

<style scoped>
.juggling-persistent-page {
  height: 100vh;
  overflow: hidden;
}

.juggling-row {
  height: 100%;
}

.controls-col {
  height: 100%;
  overflow-y: auto;
}

.juggling-card {
  overflow: visible !important;
  height: 65vh;
}

.juggling-card-content {
  overflow: visible !important;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.animation-container {
  flex: 1;
  min-height: 300px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px 40px;
  position: relative;
  overflow: visible !important;
}

.letter-container {
  width: 350px;
  height: 350px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: visible !important;
  padding: 20px;
  margin: -20px;
}

.letter-container :deep(svg) {
  max-width: 350px;
  max-height: 350px;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
}

.letter-container :deep(*) {
  overflow: visible !important;
}

.ball-status-bar {
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
  flex-shrink: 0;
}

.ball-chip {
  font-size: 11px;
}

.phrase-btn {
  text-transform: none;
  letter-spacing: 0;
}

.log-container {
  max-height: 200px;
  overflow-y: auto;
  background: #f9f9f9;
  padding: 4px;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
  font-family: monospace;
  font-size: 11px;
}

.log-entry {
  padding: 1px 0;
  border-bottom: 1px solid #eee;
}

.log-entry:last-child {
  border-bottom: none;
}
</style>