<template>
  <div class="vignette-container">
    <div ref="stageContainer" class="stage-container"></div>

    <!-- Session info overlay (top-left) -->
    <div v-if="sessionTitle" class="session-info">
      <span class="session-label">{{ sessionTitle }}</span>
    </div>

    <!-- Replay button (shown after sequence completes) -->
    <Transition name="caption-fade">
      <button v-if="sequenceComplete" class="replay-btn" @click="replaySequence">
        <v-icon icon="mdi-replay" size="18" class="mr-1"></v-icon>
        Watch again
      </button>
    </Transition>
  </div>
</template>

<script lang="ts">
import type { VignetteInfo } from './types';

/**
 * Total number of stages (0-indexed). Stage 0 is implemented;
 * stages 1–11 are stubs that fall through to the idle loop.
 */
const MAX_STAGE = 11;

export const VIGNETTE_INFO: VignetteInfo = {
  name: 'FFlosingVignette',
  maxStage: MAX_STAGE,
  description: 'f teaches F the floss dance — 12-session progressive skill acquisition.',
};
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Stage, type Actor } from '../letterpeople/scene/Stage';
import { characterize, startIdle } from '../letterpeople/animations';
import type { LetterInstance } from '../letterpeople/types';
import type { VignetteProps } from './types';

// ===========================================================================
// Props & Emits
// ===========================================================================

const props = withDefaults(defineProps<VignetteProps>(), {
  stage: 0,
  autoPlay: true,
});

const emit = defineEmits<{
  (e: 'sequence-complete'): void;
  (e: 'sequence-started'): void;
  // Fired when the scripted intro has finished and the open-ended idle
  // practice loop is about to begin (debug visibility into the handoff).
  (e: 'idle-started'): void;
  // Per-stage metadata (title) for the current stage.
  (e: 'stage-info', info: { title: string; description?: string }): void;
}>();

// ===========================================================================
// State
// ===========================================================================

const stageContainer = ref<HTMLElement | null>(null);
const sequenceComplete = ref(false);

let stageInstance: Stage | null = null;
let littleF: Actor | null = null;
let bigF: Actor | null = null;
let aborted = false;
let sequencePromise: Promise<void> | null = null;
let littleFIdleCleanup: (() => void) | null = null;
let bigFIdleCleanup: (() => void) | null = null;

// ===========================================================================
// Computed
// ===========================================================================

const sessionTitle = computed(() => {
  const titles: Record<number, string> = {
    0: 'First Contact',
    1: 'Getting the Arms Right',
    2: 'Adding the Hips',
    3: 'Coordinating Arms & Hips',
    4: 'Right Hand Behind',
    5: 'Both Hands Behind',
    6: 'Cleaning Up',
    7: 'Building Speed',
    8: 'Almost There',
    9: 'Speed Day',
    10: 'Consolidation',
    11: 'Graduation',
  };
  return titles[props.stage] ?? '';
});

// ===========================================================================
// Floss Dance Constants
// ===========================================================================

// Arm swing target angles (0 = right, 90 = down, 180 = left)
const ARM_LEFT_ANGLE_L = 200;   // left arm when both swing left
const ARM_LEFT_ANGLE_R = 120;   // right arm when both swing left
const ARM_RIGHT_ANGLE_L = 60;   // left arm when both swing right
const ARM_RIGHT_ANGLE_R = -20;  // right arm when both swing right

// ===========================================================================
// Floss Dance Mechanics
//
// The floss is a 6-beat repeating cycle:
//
//   Beat 0: Arms R→L, R-hand behind,       hips L→R
//   Beat 1: Arms L→R, R-hand returns front, hips R→L
//   Beat 2: Arms R→L, both in front,        hips L→R
//   Beat 3: Arms L→R, L-hand behind,        hips R→L
//   Beat 4: Arms R→L, L-hand returns front, hips L→R
//   Beat 5: Arms L→R, both in front,        hips R→L
//
// Every beat: arms swing one direction, hips swing the opposite.
// Z-layer (which hand goes behind body) follows a 3-beat sub-cycle per hand.
// ===========================================================================

/**
 * Apply the correct z-layer (arm in front / behind body) for the given beat phase.
 *
 * - Phase 0: Right hand goes behind (at far extreme, clean pass)
 * - Phase 3: Left hand goes behind
 * - Phases 1,4: Return-to-front (handled via delayed call)
 * - Phases 2,5: Both arms in front (neutral)
 */
function applyZLayer(inst: LetterInstance, phase: number) {
  switch (phase) {
    case 0:
      inst.arms.right.sendToBack();
      inst.arms.left.bringToFront();
      break;
    case 3:
      inst.arms.left.sendToBack();
      inst.arms.right.bringToFront();
      break;
    default:
      inst.arms.left.bringToFront();
      inst.arms.right.bringToFront();
      break;
  }
}

/**
 * Execute one beat of the floss dance.
 *
 * @param inst   - The LetterInstance performing the floss
 * @param beat   - Current beat index (wraps mod 6 internally)
 * @param dur    - Duration of this beat in ms
 * @param hipDeg - Hip sway amplitude in degrees (0 = no hip)
 * @param opts   - Optional deformation overrides
 */
async function flossOneBeat(
  inst: LetterInstance,
  beat: number,
  dur: number,
  hipDeg: number,
  opts: {
    skipZLayer?: boolean;
    skipHip?: boolean;
  } = {},
) {
  const phase = beat % 6;
  const swingLeft = beat % 2 === 0;

  // Arm targets
  const lTarget = swingLeft ? ARM_LEFT_ANGLE_L : ARM_RIGHT_ANGLE_L;
  const rTarget = swingLeft ? ARM_LEFT_ANGLE_R : ARM_RIGHT_ANGLE_R;

  // Hip target (opposite of arm direction)
  const effectiveHip = opts.skipHip ? 0 : hipDeg;
  const hipTarget = swingLeft ? effectiveHip : -effectiveHip;

  // Z-layer management
  if (!opts.skipZLayer) {
    let zTimer: ReturnType<typeof setTimeout> | undefined;
    if (phase === 1 || phase === 4) {
      // Delayed return-to-front: wait until arm has swung past body (~60% through)
      zTimer = setTimeout(() => applyZLayer(inst, phase), dur * 0.6);
    } else {
      applyZLayer(inst, phase);
    }
    // Clean up timer if aborted (best-effort)
    if (aborted && zTimer) clearTimeout(zTimer);
  }

  // Animate arms + hips in parallel
  await Promise.all([
    inst.arms.left.rotateTo(lTarget, { duration: dur, ease: 'inOutSine' }),
    inst.arms.right.rotateTo(rTarget, { duration: dur, ease: 'inOutSine' }),
    inst.body.skewTo(hipTarget, { duration: dur, ease: 'inOutSine' }),
  ]);
}

/**
 * Run a continuous floss loop until aborted.
 *
 * @param inst    - The LetterInstance
 * @param beatMs  - Ms per beat
 * @param hipDeg  - Hip amplitude
 * @param opts    - Deformation options (applied to every beat)
 */
async function flossLoop(
  inst: LetterInstance,
  beatMs: number,
  hipDeg: number,
  opts: { skipZLayer?: boolean; skipHip?: boolean } = {},
) {
  let beat = 0;
  while (!aborted) {
    await flossOneBeat(inst, beat, beatMs, hipDeg, opts);
    if (aborted) break;
    beat = (beat + 1) % 6;
  }
}

/**
 * Execute exactly N beats of the floss, then stop.
 */
async function flossNBeats(
  inst: LetterInstance,
  count: number,
  beatMs: number,
  hipDeg: number,
  opts: { skipZLayer?: boolean; skipHip?: boolean; startBeat?: number } = {},
) {
  let beat = opts.startBeat ?? 0;
  for (let i = 0; i < count; i++) {
    if (aborted) break;
    await flossOneBeat(inst, beat, beatMs, hipDeg, opts);
    if (aborted) break;
    beat = (beat + 1) % 6;
  }
}

/**
 * Reset a letter to neutral floss pose (arms relaxed, no skew, z-layers reset).
 */
async function resetFloss(inst: LetterInstance, dur = 200) {
  inst.arms.left.bringToFront();
  inst.arms.right.bringToFront();
  await Promise.all([
    inst.body.skewTo(0, { duration: dur }),
    inst.arms.relax({ duration: dur }),
  ]);
}

// ===========================================================================
// Expression Helpers
// ===========================================================================

/** Set a smile expression (mood 0–1, openness 0–1). */
function smile(inst: LetterInstance, intensity = 0.8) {
  inst.mouth.updateShape(
    { openness: 0.25 * intensity, mood: 0.5 + 0.5 * intensity },
    { duration: 250 },
  );
}

/** Set an impressed / surprised expression. */
function impressed(inst: LetterInstance) {
  inst.mouth.updateShape({ openness: 0.35, mood: 0.7 }, { duration: 200 });
  inst.eyes.brows?.express('surprised', { duration: 200 });
}

/** Return to neutral expression. */
function neutralFace(inst: LetterInstance) {
  inst.mouth.updateShape({ openness: 0.05, mood: 0.5 }, { duration: 300 });
  inst.eyes.brows?.relax({ duration: 300 });
}

// ===========================================================================
// Utility
// ===========================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      if (!aborted) resolve();
    }, ms);
    if (aborted) {
      clearTimeout(id);
      resolve();
    }
  });
}

function sleep(ms: number): Promise<void> {
  return delay(ms);
}

// ===========================================================================
// Scene Setup
// ===========================================================================

function createScene() {
  if (!stageContainer.value) return;

  destroyScene();
  aborted = false;
  sequenceComplete.value = false;

  const container = stageContainer.value;
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;

  stageInstance = new Stage(container, {
    width,
    height,
    horizonRatio: 0.25,
    backgroundColor: 'transparent',
  });

  // ── Little f — expert dancer, stage left ──────────────────────────────
  littleF = stageInstance.addActor('littleF', 'f', {
    xPercent: 30,
    z: 80,
    height: Math.min(190, height * 0.5),
    letterOptions: {
      color: '#FF7043',       // deep orange
      showEyes: false,
      showMouth: false,
      showArms: true,
      showEyebrows: false,
      eyebrowsWithEyes: true,
      borderColor: '#E64A19',
      borderWidth: 2,
      legFloorY: 135,
      legKneeBend: -2,
    },
  });

  // ── Big F — learner, stage right ──────────────────────────────────────
  bigF = stageInstance.addActor('bigF', 'F', {
    xPercent: 65,
    z: 80,
    height: Math.min(240, height * 0.6),
    letterOptions: {
      color: '#AB47BC',       // purple
      showEyes: false,
      showMouth: false,
      showArms: true,
      showEyebrows: false,
      eyebrowsWithEyes: true,
      borderColor: '#7B1FA2',
      borderWidth: 2,
      legFloorY: 135,
      legKneeBend: -2,
    },
  });

  // Show legs immediately on both characters
  if (littleF) {
    littleF.instance.legs.show({ duration: 0 });
    littleF.instance.legs.startSync();
  }
  if (bigF) {
    bigF.instance.legs.show({ duration: 0 });
    bigF.instance.legs.startSync();
  }
}

// ===========================================================================
// Session 0 — First Contact
//
// Choreography script:
//   1. f is alone on stage, starts flossing at full speed
//   2. F walks in from off-screen right, stops, watches
//   3. f notices F, stops, turns toward F, smiles
//   4. f demos: 2 slow beats
//   5. F attempts: 2 beats — arms only, slow, no hip, no z-layer
//   6. f smiles encouragingly
//   → Idle loop: F practices arm-only, f watches/demos occasionally
// ===========================================================================

async function runSession0Intro() {
  if (!littleF || !bigF || aborted) return;

  const f = littleF.instance;
  const F = bigF.instance;

  // ── Characterize f (bring to life) ──────────────────────────────────
  await characterize(f, { duration: 300, showEyes: true, showMouth: true, showBrows: true });
  if (aborted) return;
  littleFIdleCleanup = startIdle(f, { blinkInterval: 3500 });

  // Show f's arms for dancing
  await f.arms.show({ duration: 200 });
  if (aborted) return;

  // ── 1. f starts flossing at full speed (looks easy and fun) ─────────
  const fFlossPromise = flossNBeats(f, 12, 350, 7);

  // ── 2. While f is flossing, F walks in from off-screen right ────────
  await delay(800);
  if (aborted) return;

  // Characterize F (bring to life mid-walk-in)
  await characterize(F, { duration: 300, showEyes: true, showMouth: true, showBrows: true });
  if (aborted) return;
  bigFIdleCleanup = startIdle(F, { blinkInterval: 4000 });

  // Show F's arms
  await F.arms.show({ duration: 200 });
  if (aborted) return;

  // F walks in — move from far right toward stage-right position
  if (bigF) {
    const containerWidth = stageContainer.value?.clientWidth || 400;
    // Start off-screen right
    await bigF.move3D(containerWidth + 50, 80, 0);
    // Walk to stage-right position
    await bigF.walkTo(containerWidth * 0.65, 80, 1500);
  }
  if (aborted) return;

  // ── F watches f, impressed ──────────────────────────────────────────
  impressed(F);
  if (bigF && littleF) {
    try { await F.eyes.lookAt(f.getCenter()); } catch { /* ok */ }
  }
  await delay(600);
  if (aborted) return;

  // Wait for f's floss sequence to finish
  await fFlossPromise;
  if (aborted) return;

  // ── 3. f notices F, stops, turns toward F, smiles ───────────────────
  await resetFloss(f, 300);
  if (aborted) return;

  // f turns toward F
  await f.body.turnTo(15, { duration: 300 });
  if (aborted) return;
  try { await f.eyes.lookAt(F.getCenter()); } catch { /* ok */ }

  smile(f, 0.9);
  await delay(600);
  if (aborted) return;

  // F relaxes expression — neutral, attentive
  neutralFace(F);
  await delay(300);
  if (aborted) return;

  // ── 4. f demos: 2 slow beats (teaching pace) ───────────────────────
  // f turns back to face camera for the demo
  await f.body.turnTo(0, { duration: 200 });
  if (aborted) return;

  smile(f, 0.5); // mild encouraging expression
  await flossNBeats(f, 2, 800, 4);
  if (aborted) return;
  await resetFloss(f, 300);
  if (aborted) return;

  // f turns back toward F and nods encouragingly
  await f.body.turnTo(15, { duration: 200 });
  if (aborted) return;
  smile(f, 0.8);
  await delay(400);
  if (aborted) return;

  // ── 5. F attempts: 2 beats — arms only, slow, no hip, no z-layer ───
  // F faces camera to try
  await F.body.turnTo(0, { duration: 200 });
  if (aborted) return;

  // F's attempt: stiff, arms-only, slow, reduced amplitude
  await flossNBeats(F, 2, 1000, 3, { skipHip: true, skipZLayer: true });
  if (aborted) return;
  await resetFloss(F, 400);
  if (aborted) return;

  // ── 6. f smiles encouragingly ───────────────────────────────────────
  smile(f, 1.0);
  f.eyes.brows?.express('happy', { duration: 200 });
  await delay(600);
  if (aborted) return;
  neutralFace(f);
}

// ===========================================================================
// Idle Loop — F practices, f watches / demos occasionally
// ===========================================================================

/**
 * Session 0 idle: F does arm-only floss attempts with pauses.
 * f watches, occasionally demos a beat or two.
 */
async function runIdleLoop() {
  if (!littleF || !bigF || aborted) return;

  const f = littleF.instance;
  const F = bigF.instance;

  // Ensure both face camera for idle practice
  await Promise.all([
    f.body.turnTo(0, { duration: 200 }),
    F.body.turnTo(0, { duration: 200 }),
  ]);
  if (aborted) return;

  // ── Determine idle parameters from stage ──────────────────────────────
  const stageParams = getIdleParams(props.stage);

  let iteration = 0;

  while (!aborted) {
    // ── F practices: a few beats then pauses ────────────────────────────
    const beatCount = 2 + Math.floor(Math.random() * (stageParams.maxBeats - 1));
    const driftedBeatMs = stageParams.beatMs * (1 + (Math.random() - 0.5) * stageParams.drift * 2);

    await flossNBeats(F, beatCount, driftedBeatMs, stageParams.hipDeg, {
      skipHip: stageParams.skipHip,
      skipZLayer: stageParams.skipZLayer,
    });
    if (aborted) break;

    await resetFloss(F, 300);
    if (aborted) break;

    // Pause between attempts (thinking time)
    await sleep(stageParams.pauseMs + Math.random() * 400);
    if (aborted) break;

    // ── Every 3rd iteration, f demos a couple beats ─────────────────────
    if (iteration % 3 === 1) {
      smile(f, 0.6);
      await flossNBeats(f, 2, Math.max(400, stageParams.beatMs - 100), 5);
      if (aborted) break;
      await resetFloss(f, 200);
      if (aborted) break;
      neutralFace(f);
      await sleep(300);
      if (aborted) break;
    }

    // ── Every 4th iteration, f smiles at F's attempt ────────────────────
    if (iteration % 4 === 2) {
      smile(f, 0.8);
      await sleep(500);
      if (aborted) break;
      neutralFace(f);
    }

    iteration++;
  }
}

/**
 * Get idle-loop parameters based on the current stage.
 * As stage increases, F gets faster, more accurate, and adds more mechanics.
 */
function getIdleParams(stage: number) {
  // Defaults (session 0)
  const defaults = {
    beatMs: 1000,
    hipDeg: 0,
    skipHip: true,
    skipZLayer: true,
    drift: 0.2,       // timing drift ±20%
    maxBeats: 3,       // max beats per attempt
    pauseMs: 500,      // base pause between attempts
  };

  if (stage <= 0) return defaults;

  // Progressive improvement — each stage removes deformations and increases speed
  const params = { ...defaults };

  // Stage 1: faster arms, less drift
  if (stage >= 1) {
    params.beatMs = 800;
    params.drift = 0.15;
    params.maxBeats = 4;
    params.pauseMs = 400;
  }

  // Stage 2: add hips (with errors)
  if (stage >= 2) {
    params.skipHip = false;
    params.hipDeg = 3;
    params.beatMs = 700;
    params.drift = 0.1;
  }

  // Stage 3: better hip coordination
  if (stage >= 3) {
    params.hipDeg = 5;
    params.beatMs = 650;
    params.maxBeats = 6;
    params.drift = 0.08;
  }

  // Stage 4: add z-layer
  if (stage >= 4) {
    params.skipZLayer = false;
    params.beatMs = 600;
    params.pauseMs = 300;
  }

  // Stage 5-6: clean up
  if (stage >= 5) {
    params.hipDeg = 6;
    params.drift = 0.05;
  }
  if (stage >= 6) {
    params.maxBeats = 8;
  }

  // Stage 7+: speed ramp
  if (stage >= 7) { params.beatMs = 500; params.pauseMs = 250; }
  if (stage >= 8) { params.beatMs = 450; }
  if (stage >= 9) { params.beatMs = 400; params.hipDeg = 7; params.drift = 0.02; }
  if (stage >= 10) { params.beatMs = 380; params.maxBeats = 12; params.pauseMs = 200; }
  if (stage >= 11) { params.beatMs = 350; params.drift = 0; params.maxBeats = 18; }

  return params;
}

// ===========================================================================
// Sequence Orchestrator
// ===========================================================================

async function runSequence() {
  if (!littleF || !bigF || aborted) return;

  emit('sequence-started');
  emit('stage-info', { title: sessionTitle.value });

  try {
    // ── Scripted intro ────────────────────────────────────────────────
    // Currently only session 0 has a full intro script.
    // Other stages skip straight to idle with appropriate parameters.
    if (props.stage === 0) {
      await runSession0Intro();
    } else {
      // For stages 1+, quick setup: characterize both, show arms, brief pause
      await quickSetup();
    }

    if (aborted) return;

    // Scripted intro done — entering the open-ended idle practice loop.
    emit('idle-started');

    // ── Open-ended idle loop (runs until unmount) ─────────────────────
    await runIdleLoop();
  } catch (e) {
    console.warn('[FFlosingVignette] Sequence error:', e);
  }
}

/**
 * Quick setup for stages > 0 that don't have scripted intros yet.
 * Brings both characters to life and positions them.
 */
async function quickSetup() {
  if (!littleF || !bigF || aborted) return;

  const f = littleF.instance;
  const F = bigF.instance;

  // Characterize both
  await Promise.all([
    characterize(f, { duration: 300, showEyes: true, showMouth: true, showBrows: true }),
    characterize(F, { duration: 300, showEyes: true, showMouth: true, showBrows: true }),
  ]);
  if (aborted) return;

  littleFIdleCleanup = startIdle(f, { blinkInterval: 3500 });
  bigFIdleCleanup = startIdle(F, { blinkInterval: 4000 });

  await Promise.all([
    f.arms.show({ duration: 200 }),
    F.arms.show({ duration: 200 }),
  ]);
  if (aborted) return;

  await delay(300);
}

// ===========================================================================
// Replay
// ===========================================================================

async function replaySequence() {
  destroyScene();
  await delay(100);
  createScene();
  sequencePromise = runSequence();
}

// ===========================================================================
// Cleanup
// ===========================================================================

function destroyScene() {
  aborted = true;

  if (littleFIdleCleanup) {
    littleFIdleCleanup();
    littleFIdleCleanup = null;
  }
  if (bigFIdleCleanup) {
    bigFIdleCleanup();
    bigFIdleCleanup = null;
  }

  if (stageInstance) {
    stageInstance.destroy();
    stageInstance = null;
  }

  littleF = null;
  bigF = null;
  sequenceComplete.value = false;
}

// ===========================================================================
// Lifecycle
// ===========================================================================

onMounted(async () => {
  await delay(50); // Let the container get layout dimensions
  createScene();

  if (props.autoPlay) {
    sequencePromise = runSequence();
  }
});

onBeforeUnmount(() => {
  destroyScene();
});

defineExpose({
  replay: replaySequence,
  destroy: destroyScene,
});
</script>

<style scoped>
.vignette-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 220px;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-surface-variant), 0.3) 0%,
    rgba(var(--v-theme-surface-variant), 0.1) 100%
  );
}

.stage-container {
  width: 100%;
  height: 100%;
  min-height: 220px;
}

/* Session info label */
.session-info {
  position: absolute;
  top: 8px;
  left: 12px;
  pointer-events: none;
}

.session-label {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Replay button */
.replay-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.replay-btn:hover {
  background: rgba(var(--v-theme-surface), 1);
  transform: scale(1.04);
}

.replay-btn:active {
  transform: scale(0.97);
}

/* Caption transition (kept for replay button) */
.caption-fade-enter-active,
.caption-fade-leave-active {
  transition: opacity 0.3s ease;
}

.caption-fade-enter-from,
.caption-fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 600px) {
  .vignette-container {
    min-height: 180px;
  }

  .stage-container {
    min-height: 180px;
  }
}
</style>