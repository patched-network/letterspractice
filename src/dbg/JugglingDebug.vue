<template>
  <v-container fluid class="pa-2 juggling-page">
    <v-row no-gutters class="juggling-row">
      <!-- LEFT: Controls -->
      <v-col cols="5" class="pr-2 controls-col">
        <!-- Header + Letter -->
        <div class="d-flex align-center mb-2 ga-2">
          <span class="text-subtitle-2 font-weight-bold">Juggling Debug</span>
          <v-text-field
            v-model="letterChar"
            label="Letter"
            variant="outlined"
            density="compact"
            hide-details
            maxlength="1"
            style="max-width: 60px"
            @blur="updateLetterChar"
            @keyup.enter="updateLetterChar"
          />
          <v-btn size="x-small" color="warning" variant="tonal" @click="resetLetter" :disabled="!letterInstance">
            Reset
          </v-btn>
          <v-spacer />
          <v-chip size="x-small" :color="isAnimating ? 'success' : 'default'">
            {{ isAnimating ? 'Active' : 'Idle' }}
          </v-chip>
        </div>

        <!-- Phrase Quick-Launch -->
        <v-card density="compact" class="mb-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis mb-1">Phrases (keyboard 1-{{ phrases.length }})</div>
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                v-for="(p, i) in phrases"
                :key="p.value"
                :color="activePhraseKey === p.value ? 'primary' : 'default'"
                :variant="activePhraseKey === p.value ? 'flat' : 'tonal'"
                size="small"
                @click="launchPhrase(p.value)"
                :disabled="!letterInstance"
                class="phrase-btn"
              >
                <template #prepend>
                  <span class="text-caption font-weight-bold">{{ i + 1 }}</span>
                </template>
                {{ p.label }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Siteswap -->
        <v-card density="compact" class="mb-2">
          <v-card-text class="pa-2">
            <div class="d-flex align-center ga-2">
              <span class="text-caption text-medium-emphasis">Siteswap</span>
              <v-text-field
                v-model="pattern"
                variant="outlined"
                density="compact"
                hide-details
                style="max-width: 100px"
                @update:model-value="onPatternChange"
              />
              <v-btn-toggle
                v-model="jugglingSpeed"
                color="primary"
                variant="outlined"
                mandatory
                density="compact"
                divided
              >
                <v-btn value="slow" size="x-small">Slow</v-btn>
                <v-btn value="normal" size="x-small">Norm</v-btn>
                <v-btn value="fast" size="x-small">Fast</v-btn>
              </v-btn-toggle>
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                @click="launchSiteswap"
                :disabled="!letterInstance"
              >
                Go
              </v-btn>
            </div>
            <div class="d-flex align-center ga-2 mt-1">
              <v-slider
                v-model="dwellTime"
                label="Dwell"
                min="10" max="90" step="5"
                density="compact" hide-details thumb-label
                class="flex-grow-1"
              />
              <v-btn-toggle
                v-model="reversed"
                color="primary"
                variant="outlined"
                mandatory
                density="compact"
                divided
              >
                <v-btn :value="false" size="x-small">Norm</v-btn>
                <v-btn :value="true" size="x-small">Rev</v-btn>
              </v-btn-toggle>
              <v-switch
                v-model="loopAnimation"
                label="Loop"
                color="primary"
                density="compact"
                hide-details
              />
            </div>
          </v-card-text>
        </v-card>

        <!-- Shared Params -->
        <v-card density="compact" class="mb-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis mb-1">Parameters</div>
            <v-row dense>
              <v-col cols="4">
                <v-btn-toggle
                  v-model="phraseHand"
                  color="primary"
                  variant="outlined"
                  mandatory
                  density="compact"
                  divided
                  class="w-100"
                >
                  <v-btn value="left" size="x-small" class="flex-grow-1">L</v-btn>
                  <v-btn value="right" size="x-small" class="flex-grow-1">R</v-btn>
                </v-btn-toggle>
              </v-col>
              <v-col cols="4">
                <v-text-field
                  ref="countField"
                  v-model.number="phraseCount"
                  type="number"
                  label="Count"
                  variant="outlined"
                  density="compact"
                  hide-details
                  min="0"
                />
              </v-col>
              <v-col cols="4">
                <v-switch
                  v-model="phraseAlternating"
                  label="Alt"
                  color="primary"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>
            <v-slider
              v-if="activePhraseKey === 'cascade' || activePhraseKey === 'asyncColumns' || activePhraseKey === 'twoBallExchange' || activePhraseKey === 'twoBallContinuous'"
              v-model="phraseBeatTiming"
              :label="activePhraseKey === 'asyncColumns' ? 'Offset' : 'Beat Timing'"
              min="0.3" max="1.0" step="0.01"
              density="compact" hide-details thumb-label
              color="purple"
              class="mt-1"
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseBeatTiming.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-text-field
              v-if="activePhraseKey === 'cascade' || activePhraseKey === 'asyncColumns' || activePhraseKey === 'twoBallExchange' || activePhraseKey === 'twoBallContinuous'"
              v-model.number="phraseMaxBeats"
              type="number"
              label="Max Beats (0=∞)"
              variant="outlined"
              density="compact"
              hide-details
              min="0"
              class="mt-1"
              style="max-width: 160px"
            />
            <v-slider
              v-model="phraseHeight"
              label="Height (h)"
              min="5" max="80" step="1"
              density="compact" hide-details thumb-label
              class="mt-1"
              :class="{ 'param-selected': selectedParam === 'height' }"
              :color="selectedParam === 'height' ? 'primary' : undefined"
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseHeight }}</span>
              </template>
            </v-slider>
            <v-slider
              v-model="phraseJitter"
              label="Jitter (j)"
              min="0" max="1" step="0.05"
              density="compact" hide-details thumb-label
              :class="{ 'param-selected': selectedParam === 'jitter' }"
              :color="selectedParam === 'jitter' ? 'primary' : undefined"
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseJitter.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-slider
              v-model="phraseDwell"
              label="Dwell (d)"
              min="0.2" max="0.8" step="0.05"
              density="compact" hide-details thumb-label
              :class="{ 'param-selected': selectedParam === 'dwell' }"
              :color="selectedParam === 'dwell' ? 'primary' : undefined"
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseDwell.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-slider
              v-if="activePhraseKey === 'drop' || activePhraseKey === 'handoff'"
              v-model="phraseWidth"
              label="Width"
              min="0" max="1" step="0.05"
              density="compact" hide-details thumb-label
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseWidth.toFixed(2) }}</span>
              </template>
            </v-slider>
            <v-slider
              v-if="activePhraseKey === 'oneHandedTossAndCatch'"
              v-model="phraseOffset"
              label="Offset"
              min="0" max="1" step="0.05"
              density="compact" hide-details thumb-label
            >
              <template #append>
                <span class="text-caption text-medium-emphasis" style="min-width:28px">{{ phraseOffset.toFixed(2) }}</span>
              </template>
            </v-slider>
          </v-card-text>
        </v-card>

        <!-- Transport -->
        <v-card density="compact" class="mb-2">
          <v-card-text class="pa-2">
            <div class="d-flex ga-1">
              <v-btn size="x-small" color="secondary" variant="tonal" @click="gracefulStopJuggling" :disabled="!isAnimating">
                Stop
              </v-btn>
              <v-btn size="x-small" color="error" variant="tonal" @click="stopJuggling" :disabled="!isAnimating">
                Destroy
              </v-btn>
              <v-btn size="x-small" color="info" variant="tonal" @click="togglePause" :disabled="!isAnimating">
                {{ isPaused ? 'Resume' : 'Pause' }}
              </v-btn>
              <v-btn size="x-small" color="success" variant="tonal" @click="stepForward" :disabled="!isPaused">
                +16ms
              </v-btn>
              <v-btn size="x-small" color="deep-purple" variant="tonal" @click="doGatherAndStop" :disabled="!isAnimating || (activePhraseKey !== 'siteswap' && activePhraseKey !== 'cascade')">
                Gather
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Log -->
        <v-card density="compact">
          <v-card-text class="pa-2">
            <div class="d-flex align-center mb-1">
              <span class="text-caption text-medium-emphasis">Log</span>
              <v-spacer />
              <v-btn size="x-small" icon="mdi-content-copy" variant="text" density="compact" @click="copyLogs" />
            </div>
            <div class="log-container">
              <div v-for="(entry, idx) in logs" :key="idx" class="log-entry">
                <small>{{ entry }}</small>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- RIGHT: Render -->
      <v-col cols="7">
        <v-card class="juggling-card fill-height">
          <v-card-text class="juggling-card-content pa-0">
            <div class="animation-container">
              <div ref="letterContainer" class="letter-container"></div>
            </div>
            <!-- Overlay status -->
            <div class="status-overlay">
              <v-chip size="x-small" :color="isPaused ? 'warning' : 'default'" v-if="isPaused">PAUSED</v-chip>
              <v-chip size="x-small" v-if="gazeTarget" class="ml-1">
                Gaze ({{ gazeTarget.x.toFixed(0) }}, {{ gazeTarget.y.toFixed(0) }})
              </v-chip>
              <v-chip size="x-small" v-if="patternMetadata" class="ml-1">
                {{ patternMetadata.balls }}b / p{{ patternMetadata.period }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { createLetter } from '../letterpeople';
import type { LetterInstance } from '../letterpeople/types';
import {
  animateJuggling,
  prepareSiteswap,
  extractHandPaths,
  type JugglingController,
  type SiteswapController,
  type GatherResult,
} from '../letterpeople/transforms/juggling';
import {
  tossToSelf,
  arcPass,
  handoff,
  drop,
} from '../letterpeople/transforms/juggling/phrases';
import { dropToFloor } from '../letterpeople/transforms/juggling/phrases/dropToFloor';
import { pickUp } from '../letterpeople/transforms/juggling/phrases/pickUp';
import { failedCatch } from '../letterpeople/transforms/juggling/phrases/failedCatch';
import { oneHandedTossAndCatch } from '../letterpeople/transforms/juggling/phrases/oneHandedTossAndCatch';
import { tossTo2HandedCatch } from '../letterpeople/transforms/juggling/phrases/tossTo2HandedCatch';
import { cascadePhrase, type CascadeController } from '../letterpeople/transforms/juggling/phrases/cascadePhrase';
import { syncColumns, asyncColumns } from '../letterpeople/transforms/juggling/phrases/syncColumns';
import { twoBallExchange } from '../letterpeople/transforms/juggling/phrases/twoBallExchange';
import { twoBallContinuous } from '../letterpeople/transforms/juggling/phrases/twoBallContinuous';
// @ts-ignore - siteswap.js doesn't have types
import Siteswap from 'siteswap.js';

// ── Phrase definitions ──────────────────────────────────────────────────────

type PhraseKey = 'tossToSelf' | 'arcPass' | 'handoff' | 'drop' | 'dropToFloor' | 'pickUp' | 'failedCatch' | 'oneHandedTossAndCatch' | 'tossTo2HandedCatch' | 'cascade' | 'syncColumns' | 'asyncColumns' | 'twoBallExchange' | 'twoBallContinuous';

const phrases: { value: PhraseKey; label: string }[] = [
  { value: 'tossToSelf', label: 'Toss Self' },
  { value: 'arcPass', label: 'Arc Pass' },
  { value: 'handoff', label: 'Handoff' },
  { value: 'drop', label: 'Drop' },
  { value: 'dropToFloor', label: 'Drop→Floor' },
  { value: 'pickUp', label: 'Pick Up' },
  { value: 'failedCatch', label: 'Failed Catch' },
  { value: 'oneHandedTossAndCatch', label: '1H Toss+Catch' },
  { value: 'tossTo2HandedCatch', label: '2H Catch' },
  { value: 'cascade', label: 'Cascade' },
  { value: 'syncColumns', label: 'Sync Columns' },
  { value: 'asyncColumns', label: 'Async Columns' },
  { value: 'twoBallExchange', label: '2B Exchange' },
  { value: 'twoBallContinuous', label: '2B Continuous' },
];

// ── Refs ─────────────────────────────────────────────────────────────────────

const letterContainer = ref<HTMLDivElement | null>(null);
const letterInstance = ref<LetterInstance | null>(null);
const pattern = ref('3');
const isAnimating = ref(false);
const logs = ref<string[]>([]);
const letterChar = ref('J');
const loopAnimation = ref(true);
const jugglingController = ref<JugglingController | null>(null);
let siteswapController: SiteswapController | null = null;
let cascadeController: CascadeController | null = null;
let lastGatherResult: GatherResult | null = null;
const isPaused = ref(false);
const stepRequested = ref(false);
const gazeTarget = ref<{ x: number; y: number } | null>(null);
let gazePollId: number | null = null;

// Active phrase tracking
const activePhraseKey = ref<PhraseKey | 'siteswap' | null>(null);

// Hotkey-selected parameter for arrow key adjustment
type AdjustableParam = 'height' | 'jitter' | 'dwell' | null;
const selectedParam = ref<AdjustableParam>(null);

const countField = ref<{ $el?: HTMLElement } | null>(null);

function focusVuetifyInput(comp: { $el?: HTMLElement } | null) {
  const input = comp?.$el?.querySelector('input');
  input?.focus();
}

// Siteswap params
const jugglingSpeed = ref<'slow' | 'normal' | 'fast'>('normal');
const dwellTime = ref(40);
const reversed = ref(false);

// Phrase params
const phraseHand = ref<'left' | 'right'>('left');
const phraseCount = ref(3);
const phraseHeight = ref(35);
const phraseJitter = ref(0.2);
const phraseDwell = ref(0.42);
const phraseAlternating = ref(true);
const phraseWidth = ref(0.4);
const phraseOffset = ref(0.35);
const phraseBeatTiming = ref(0.55);
const phraseMaxBeats = ref(0);

// Arrow-key adjustment config (must be after ref declarations)
const paramConfig: Record<Exclude<AdjustableParam, null>, { ref: typeof phraseHeight; min: number; max: number; step: number }> = {
  height: { ref: phraseHeight, min: 5, max: 80, step: 1 },
  jitter: { ref: phraseJitter, min: 0, max: 1, step: 0.05 },
  dwell: { ref: phraseDwell, min: 0.2, max: 0.8, step: 0.05 },
};

function adjustSelectedParam(direction: 1 | -1) {
  if (!selectedParam.value) return;
  const cfg = paramConfig[selectedParam.value];
  const raw = cfg.ref.value + direction * cfg.step;
  cfg.ref.value = Math.round(Math.min(cfg.max, Math.max(cfg.min, raw)) * 1000) / 1000;
}

// Pattern metadata
const patternMetadata = ref<{
  type: string;
  balls: number;
  period: number;
  fullPeriod: number;
} | null>(null);

// ── Logging ──────────────────────────────────────────────────────────────────

const log = (message: string) => {
  const timestamp = new Date().toLocaleTimeString();
  logs.value.unshift(`[${timestamp}] ${message}`);
  if (logs.value.length > 20) logs.value.pop();
  console.log(`[JugglingDebug] ${message}`);
};

const copyLogs = async () => {
  try {
    await navigator.clipboard.writeText(logs.value.join('\n'));
    log('Logs copied');
  } catch {
    log('Copy failed');
  }
};

// ── Letter lifecycle ─────────────────────────────────────────────────────────

const initializeLetter = async () => {
  if (!letterContainer.value) return;

  if (letterInstance.value) {
    letterInstance.value.destroy();
    letterInstance.value = null;
  }

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

  await letter.arms.show({ duration: 0 });

  if (!letter) {
    log(`Failed to create letter '${letterChar.value}'`);
    return;
  }

  letterInstance.value = letter;
  log(`Letter '${letterChar.value}' created`);
};

const updateLetterChar = async () => {
  if (letterChar.value && letterChar.value.length === 1) {
    stopJuggling();
    await initializeLetter();
  }
};

const resetLetter = async () => {
  if (!letterInstance.value) return;
  stopJuggling();
  const debugNodes = letterInstance.value.svgElement.querySelectorAll('.juggling-stage-debug');
  debugNodes.forEach((node) => node.remove());
  await Promise.all([
    letterInstance.value.arms.left.relax({ duration: 300 }),
    letterInstance.value.arms.right.relax({ duration: 300 }),
  ]);
  log('Reset');
};

// ── Gaze polling ─────────────────────────────────────────────────────────────

const startGazePoll = () => {
  if (gazePollId !== null) clearInterval(gazePollId);
  gazePollId = window.setInterval(() => {
    if (!jugglingController.value) {
      gazeTarget.value = null;
      return;
    }
    const t = jugglingController.value.gazeTarget;
    gazeTarget.value = t ? { x: t.x, y: t.y } : null;
    if (gazeTarget.value && letterInstance.value) {
      void letterInstance.value.eyes.lookAtPoint(gazeTarget.value, { duration: 80 });
    }
    if (!jugglingController.value.active) {
      isAnimating.value = false;
    }
  }, 100);
};

// ── Transport ────────────────────────────────────────────────────────────────

const stopJuggling = () => {
  if (gazePollId !== null) { clearInterval(gazePollId); gazePollId = null; }
  if (lastGatherResult) { lastGatherResult.destroy(); lastGatherResult = null; }
  if (jugglingController.value) {
    jugglingController.value.destroy();
    jugglingController.value = null;
  } else if (letterInstance.value) {
    letterInstance.value.arms.stopAnimations();
  }
  siteswapController = null;
  cascadeController = null;
  gazeTarget.value = null;
  isAnimating.value = false;
  isPaused.value = false;
  activePhraseKey.value = null;
};

const gracefulStopJuggling = async () => {
  if (!jugglingController.value) return;
  log('Graceful stop');
  await jugglingController.value.stop();
  jugglingController.value = null;
  if (gazePollId !== null) { clearInterval(gazePollId); gazePollId = null; }
  gazeTarget.value = null;
  isAnimating.value = false;
  isPaused.value = false;
  activePhraseKey.value = null;
};

const togglePause = () => {
  isPaused.value = !isPaused.value;
};

const doGatherAndStop = async () => {
  if (cascadeController) {
    log('Cascade gather and stop requested...');
    try {
      await cascadeController.gatherAndStop();
      jugglingController.value = null;
      cascadeController = null;
      if (gazePollId !== null) { clearInterval(gazePollId); gazePollId = null; }
      isAnimating.value = false;
      activePhraseKey.value = null;
      log('Cascade gathered');
    } catch (e) {
      log(`Cascade gather failed: ${e}`);
    }
    return;
  }
  if (!siteswapController) return;
  log('Gather and stop requested...');
  try {
    const result = await siteswapController.gatherAndStop();
    lastGatherResult = result;
    jugglingController.value = null;
    siteswapController = null;
    if (gazePollId !== null) { clearInterval(gazePollId); gazePollId = null; }
    isAnimating.value = false;
    log(`Gathered: ${result.heldBalls.length} held, ${result.groundedBalls.length} grounded`);
  } catch (e) {
    log(`Gather failed: ${e}`);
  }
};

const stepForward = () => {
  if (isPaused.value) stepRequested.value = true;
};

// ── Phrase launch ────────────────────────────────────────────────────────────

const launchPhrase = async (key: PhraseKey) => {
  if (!letterInstance.value) return;

  stopJuggling();
  activePhraseKey.value = key;
  isAnimating.value = true;
  patternMetadata.value = null;

  try {
    if (key === 'tossToSelf') {
      jugglingController.value = await tossToSelf(letterInstance.value, {
        hand: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
      });
    } else if (key === 'arcPass') {
      jugglingController.value = await arcPass(letterInstance.value, {
        from: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        alternating: phraseAlternating.value,
      });
    } else if (key === 'handoff') {
      jugglingController.value = await handoff(letterInstance.value, {
        from: phraseHand.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        alternating: phraseAlternating.value,
        width: phraseWidth.value,
      });
    } else if (key === 'drop') {
      jugglingController.value = await drop(letterInstance.value, {
        from: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        width: phraseWidth.value,
      });
    } else if (key === 'dropToFloor') {
      jugglingController.value = await dropToFloor(letterInstance.value, {
        hand: phraseHand.value,
        liftHeight: phraseHeight.value,
        ballColor: undefined,
        keepBallOnGround: false,
      });
    } else if (key === 'pickUp') {
      jugglingController.value = await pickUp(letterInstance.value, {
        hand: phraseHand.value,
      });
    } else if (key === 'failedCatch') {
      jugglingController.value = await failedCatch(letterInstance.value, {
        from: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        throwJitter: phraseJitter.value,
        alternating: phraseAlternating.value,
        leaveBallOnFloor: true,
      });
    } else if (key === 'oneHandedTossAndCatch') {
      jugglingController.value = await oneHandedTossAndCatch(letterInstance.value, {
        hand: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        offset: phraseOffset.value,
        alternating: phraseAlternating.value,
      });
    } else if (key === 'tossTo2HandedCatch') {
      jugglingController.value = await tossTo2HandedCatch(letterInstance.value, {
        from: phraseHand.value,
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        jitter: phraseJitter.value,
        alternating: phraseAlternating.value,
      });
    } else if (key === 'cascade') {
      const ctrl = await cascadePhrase(letterInstance.value, {
        height: () => phraseHeight.value,
        throwJitter: () => phraseJitter.value,
        catchJitter: () => phraseJitter.value,
        beatTiming: () => phraseBeatTiming.value,
        dwell: () => phraseDwell.value,
        maxBeats: phraseMaxBeats.value,
      });
      jugglingController.value = ctrl;
      cascadeController = ctrl;
    } else if (key === 'syncColumns') {
      jugglingController.value = await syncColumns(letterInstance.value, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
      });
    } else if (key === 'asyncColumns') {
      jugglingController.value = await asyncColumns(letterInstance.value, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        offset: phraseBeatTiming.value,
      });
    } else if (key === 'twoBallExchange') {
      jugglingController.value = await twoBallExchange(letterInstance.value, {
        height: phraseHeight.value,
        count: phraseCount.value,
        dwell: phraseDwell.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        beatTiming: phraseBeatTiming.value,
        from: phraseHand.value,
      });
    } else if (key === 'twoBallContinuous') {
      jugglingController.value = await twoBallContinuous(letterInstance.value, {
        height: phraseHeight.value,
        count: phraseCount.value,
        throwJitter: phraseJitter.value,
        catchJitter: phraseJitter.value,
        beatTiming: phraseBeatTiming.value,
        from: phraseHand.value,
      });
    }

    log(`${key} (hand=${phraseHand.value} h=${phraseHeight.value} j=${phraseJitter.value.toFixed(2)} d=${phraseDwell.value.toFixed(2)} c=${phraseCount.value})`);
    startGazePoll();
  } catch (error) {
    log(`ERROR: ${error}`);
    isAnimating.value = false;
    activePhraseKey.value = null;
  }
};

// ── Siteswap launch ─────────────────────────────────────────────────────────

const launchSiteswap = async () => {
  if (!letterInstance.value) return;

  stopJuggling();
  activePhraseKey.value = 'siteswap';
  isAnimating.value = true;

  try {
    const siteswap = new Siteswap(pattern.value);
    if (!siteswap.valid) {
      log(`Invalid siteswap: ${pattern.value}`);
      isAnimating.value = false;
      activePhraseKey.value = null;
      return;
    }

    patternMetadata.value = {
      type: siteswap.degree === 1 ? 'async' : 'sync',
      balls: siteswap.props,
      period: siteswap.period,
      fullPeriod: siteswap.fullPeriod || siteswap.period,
    };

    const beatDurationMap = { slow: 500, normal: 300, fast: 150 };
    const beatDuration = beatDurationMap[jugglingSpeed.value];
    const dwell = dwellTime.value / 100;

    const ctrl = await animateJuggling(letterInstance.value, pattern.value, {
      loop: loopAnimation.value,
      beatDuration,
      dwell,
      reversed: reversed.value,
      isPaused: () => isPaused.value,
      shouldStep: () => {
        if (stepRequested.value) { stepRequested.value = false; return true; }
        return false;
      },
      onFrame: () => {
        if (jugglingController.value) {
          const target = jugglingController.value.gazeTarget;
          gazeTarget.value = target ? { x: target.x, y: target.y } : null;
          if (target && letterInstance.value) {
            void letterInstance.value.eyes.lookAtPoint(target, { duration: 80 });
          }
        }
      },
    });

    jugglingController.value = ctrl;
    siteswapController = ctrl;

    log(`Siteswap '${pattern.value}' (${siteswap.props}b, ${jugglingSpeed.value})`);
    startGazePoll();

    if (!loopAnimation.value && jugglingController.value) {
      void jugglingController.value.stop().then(() => {
        isAnimating.value = false;
        activePhraseKey.value = null;
      });
    }
  } catch (error) {
    log(`ERROR: ${error}`);
    isAnimating.value = false;
    activePhraseKey.value = null;
  }
};

const onPatternChange = () => {
  try {
    const siteswap = new Siteswap(pattern.value);
    if (siteswap.valid && siteswap.degree <= 2 && siteswap.greatestValue > 0) {
      if (isAnimating.value) stopJuggling();
      setTimeout(() => launchSiteswap(), 100);
    }
  } catch {
    // ignore parse errors
  }
};

// ── Keyboard hotkeys ─────────────────────────────────────────────────────────

const handleKeydown = (e: KeyboardEvent) => {
  // Ignore when typing in inputs
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

  const num = parseInt(e.key);
  if (num >= 1 && num <= phrases.length) {
    e.preventDefault();
    launchPhrase(phrases[num - 1].value);
    return;
  }

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      stopJuggling();
      break;
    case ' ':
      e.preventDefault();
      if (isAnimating.value) togglePause();
      break;
    case 's':
      e.preventDefault();
      launchSiteswap();
      break;
    case 'g':
      e.preventDefault();
      if ((siteswapController || cascadeController) && isAnimating.value) doGatherAndStop();
      break;
    case 'h':
      e.preventDefault();
      selectedParam.value = selectedParam.value === 'height' ? null : 'height';
      break;
    case 'j':
      e.preventDefault();
      selectedParam.value = selectedParam.value === 'jitter' ? null : 'jitter';
      break;
    case 'd':
      e.preventDefault();
      selectedParam.value = selectedParam.value === 'dwell' ? null : 'dwell';
      break;
    case 'c':
      e.preventDefault();
      selectedParam.value = null;
      focusVuetifyInput(countField.value);
      break;
    case 'ArrowUp':
    case 'ArrowRight':
      if (selectedParam.value) { e.preventDefault(); adjustSelectedParam(1); }
      break;
    case 'ArrowDown':
    case 'ArrowLeft':
      if (selectedParam.value) { e.preventDefault(); adjustSelectedParam(-1); }
      break;
    case 'l':
      e.preventDefault();
      phraseHand.value = 'left';
      break;
    case 'r':
      e.preventDefault();
      phraseHand.value = 'right';
      break;
  }
};

// ── Watch for siteswap param changes ─────────────────────────────────────────

watch([jugglingSpeed, dwellTime, reversed], () => {
  if (isAnimating.value && activePhraseKey.value === 'siteswap') {
    stopJuggling();
    setTimeout(() => launchSiteswap(), 100);
  }
});

// ── Reactive parameter updates for running phrases ──────────────────────────

let relaunchTimeout: ReturnType<typeof setTimeout> | null = null;

watch(
  [phraseHeight, phraseJitter, phraseDwell, phraseWidth, phraseOffset, phraseBeatTiming, phraseCount, phraseHand, phraseAlternating],
  () => {
    // Only relaunch for phrase-based animations (not siteswap)
    if (!activePhraseKey.value || activePhraseKey.value === 'siteswap') return;
    // Skip for cascade since it already uses reactive getters
    if (activePhraseKey.value === 'cascade') return;
    // Don't relaunch one-shot phrases (dropToFloor, pickUp)
    if (activePhraseKey.value === 'dropToFloor' || activePhraseKey.value === 'pickUp') return;

    if (relaunchTimeout) clearTimeout(relaunchTimeout);
    relaunchTimeout = setTimeout(() => {
      const key = activePhraseKey.value;
      if (key && key !== 'siteswap' && key !== 'cascade') {
        launchPhrase(key as PhraseKey);
      }
    }, 300);
  },
);

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  log('Mounted');
  initializeLetter();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  stopJuggling();
  if (letterInstance.value) letterInstance.value.destroy();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.juggling-page {
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
  height: 100%;
}

.juggling-card-content {
  overflow: visible !important;
  position: relative;
  height: 100%;
}

.animation-container {
  height: 75%;
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

.status-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
}

.phrase-btn {
  text-transform: none;
  letter-spacing: 0;
}

.param-selected {
  background: rgba(var(--v-theme-primary), 0.08);
  border-radius: 4px;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
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
