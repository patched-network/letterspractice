<template>
  <div ref="vignetteContainer" class="vignette-container">
    <!-- Fixed logical frame (VIGNETTE_FRAME), contain-fit scaled to the
         container. The scene inside never sees the real container size. -->
    <div class="stage-frame" :style="frameStyle">
      <div ref="stageContainer" class="stage-container"></div>
    </div>

    <!-- Session info overlay (top-left, unscaled) -->
    <div v-if="sessionTitle" class="session-info">
      <span class="session-label">{{ sessionTitle }}</span>
    </div>

  </div>
</template>

<script lang="ts">
import type { VignetteInfo } from './types';
import { MAX_STAGE } from './juggling-sessions';

export const VIGNETTE_INFO: VignetteInfo = {
  name: 'JJugglingVignette',
  maxStage: MAX_STAGE,
  description: 'J teaches j how to juggle — 30-stage progressive skill acquisition.',
};
</script>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from 'vue';
import { Stage, type Actor } from '../letterpeople/scene/Stage';
import { loadStageConfig } from './juggling-sessions/stages';
import { runIdleLoop } from './juggling-sessions/idle-runner';
import { runSession, type RunnerActors, type RunnerCallbacks } from './juggling-sessions/runner';
import { VIGNETTE_FRAME, type VignetteProps } from './types';
import { useContainScale } from './useContainScale';
import type { VignetteStageConfig } from './juggling-sessions/types';

// Animation APIs — direct imports for choreography
import { characterize } from '../letterpeople/animations';
import {
  cascadePhrase,
  type CascadeController,
} from '../letterpeople/transforms/juggling/phrases/cascadePhrase';
import { handoff } from '../letterpeople/transforms/juggling/phrases/handoff';
import {
  createPhysicsContext,
  addBall,
  removeAllBalls,
  startPhysicsLoop,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from '../letterpeople/transforms/juggling/phrases/physics-core';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(defineProps<VignetteProps>(), {
  stage: 0,
  autoPlay: true,
});

const emit = defineEmits<{
  (e: 'sequence-complete'): void;
  (e: 'sequence-started'): void;
  // Fired when the scripted intro has finished and the open-ended idle
  // practice loop is about to begin. Useful for debug visibility into the
  // intro → idle handoff.
  (e: 'idle-started'): void;
  // Per-stage metadata (title + one-line theme) for the current stage.
  (e: 'stage-info', info: { title: string; description?: string }): void;
}>();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const vignetteContainer = ref<HTMLElement | null>(null);
const stageContainer = ref<HTMLElement | null>(null);
const sequenceComplete = ref(false);

// Contain-fit: the fixed logical frame scales to fill the container.
const { scale } = useContainScale(
  vignetteContainer,
  VIGNETTE_FRAME.width,
  VIGNETTE_FRAME.height,
);

const frameStyle = computed(() => ({
  width: `${VIGNETTE_FRAME.width}px`,
  height: `${VIGNETTE_FRAME.height}px`,
  transform: `translate(-50%, -50%) scale(${scale.value})`,
}));

let stageInstance: Stage | null = null;
let bigJ: Actor | null = null;
let littleJ: Actor | null = null;
let animationAborted = false;
let sequencePromise: Promise<void> | null = null;

// Persistent physics context for j — lives across intro → idle loop
let jPhysCtx: PhysicsContext | null = null;
let jPhysLoop: PhysicsLoop | null = null;
let jBall: PhysicsBall | null = null;

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const currentStageConfig = computed(() => loadStageConfig(props.stage));
const sessionTitle = computed(() => currentStageConfig.value?.title ?? '');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Abortable delay — resolves immediately if animation is aborted. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (animationAborted) { resolve(); return; }
    const id = setTimeout(() => {
      resolve();
    }, ms);
    // If aborted before timeout fires, we still resolve (don't hang)
    if (animationAborted) {
      clearTimeout(id);
      resolve();
    }
  });
}

/** Guard: throws if aborted so we can bail out of the choreography. */
function checkAbort(): void {
  if (animationAborted) throw new AbortError();
}

class AbortError extends Error {
  constructor() { super('Animation aborted'); this.name = 'AbortError'; }
}

// ---------------------------------------------------------------------------
// Scene Setup
// ---------------------------------------------------------------------------

function createScene() {
  if (!stageContainer.value) return;

  // Clear any previous scene
  destroyScene();
  animationAborted = false;
  sequenceComplete.value = false;

  const container = stageContainer.value;

  // The scene is authored in the fixed logical frame; the wrapper's CSS
  // scale does the fitting. Container dimensions are never consulted.
  stageInstance = new Stage(container, {
    width: VIGNETTE_FRAME.width,
    height: VIGNETTE_FRAME.height,
    horizonRatio: 0.25,
    backgroundColor: 'transparent',
  });

  // ── Big J — experienced juggler, left-center ──
  bigJ = stageInstance.addActor('bigJ', 'J', {
    xPercent: 30,
    z: 80,
    height: 288,
    letterOptions: {
      color: '#5C6BC0',
      showEyes: false,
      showMouth: false,
      showArms: false,
      showEyebrows: false,
      eyebrowsWithEyes: true,
      borderColor: '#3949AB',
      borderWidth: 2,
    },
  });

  // ── Little j — beginner ──
  // Stage 1 only: starts OFF-SCREEN at 120% (clipped by overflow:hidden) and
  // the bespoke intro walks it in. Stages 2+: j is already on stage at 60%.
  const isFirstStage = (currentStageConfig.value?.id ?? 1) === 1;
  littleJ = stageInstance.addActor('littleJ', 'j', {
    xPercent: isFirstStage ? 120 : 60,
    z: 80,
    height: 228,
    letterOptions: {
      color: '#66BB6A',
      showEyes: false,
      showMouth: false,
      showArms: false,
      showEyebrows: false,
      eyebrowsWithEyes: true,
      borderColor: '#43A047',
      borderWidth: 2,
    },
  });
}

// ---------------------------------------------------------------------------
// Session 1 Intro — Direct Choreography
// ---------------------------------------------------------------------------
//
// This reads like a script: each step is a direct API call, executed
// sequentially. No runner, no phrase-boundary physics context issues.
//

async function runSession1Intro() {
  if (!bigJ || !littleJ || animationAborted) return;

  const J = bigJ.instance;  // LetterInstance for uppercase J
  const j = littleJ.instance; // LetterInstance for lowercase j

  // j's final on-stage x position (60% of the logical frame width)
  const jTargetX = (60 / 100) * VIGNETTE_FRAME.width;

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 1: Characterize J — fade in eyes, mouth, brows               │
  // └─────────────────────────────────────────────────────────────────────┘
  await characterize(J, { duration: 400, showEyes: true, showMouth: true, showBrows: true });
  await J.arms.show({ duration: 300 });
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 2: J cascades — start a 3-ball cascade, let it run ~3s       │
  // └─────────────────────────────────────────────────────────────────────┘
  const cascadeCtrl: CascadeController = await cascadePhrase(J, {
    height: 42,
    throwJitter: 0.02,
    catchJitter: 0.02,
    beatTiming: 0.55,
    maxBeats: 0, // indefinite — we'll stop it manually
  });
  checkAbort();

  await delay(3000);
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 3: j walks in from off-screen right                          │
  // │         Eyes track J during the walk.                              │
  // └─────────────────────────────────────────────────────────────────────┘
  // Show j's eyes early so they can gaze at J during the walk-in
  await j.eyes.show({ duration: 200 });
  checkAbort();

  // Start eye tracking toward J's center during the walk
  const gazeInterval = setInterval(() => {
    if (!animationAborted) {
      try { j.eyes.lookAt(J.getCenter()); } catch { /* ok */ }
    }
  }, 100);

  await littleJ!.walkTo(jTargetX, 80, 1800);
  clearInterval(gazeInterval);
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 4: j is impressed — gapes at J's cascade                     │
  // └─────────────────────────────────────────────────────────────────────┘
  await j.mouth.show({ duration: 200 });
  checkAbort();

  // Impressed face: wide-ish open mouth, slightly positive mood
  await j.mouth.updateShape({ openness: 0.7, mood: 0.3 }, { duration: 300 });
  j.eyes.lookAt(J.getCenter());
  checkAbort();

  // Hold the impressed look
  await delay(1000);
  checkAbort();

  // Close mouth back to neutral
  await j.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 5: J gathers and stops the cascade                           │
  // │         J is the expert — ball continuity through this transition  │
  // │         is not critical. Cascade balls vanish on destroy.          │
  // └─────────────────────────────────────────────────────────────────────┘
  try {
    await cascadeCtrl.gatherAndStop();
  } catch {
    // If gather fails (e.g. balls already settled), that's fine
  }

  // Now destroy cascade — its balls vanish; J is the expert, no continuity needed
  cascadeCtrl.destroy();
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 6: J notices j — turns toward j, smiles                      │
  // └─────────────────────────────────────────────────────────────────────┘
  await J.body.turnToward(j, { duration: 400 });
  J.eyes.lookAt(j.getCenter());
  await J.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 7: Brief pause — let the moment land                         │
  // └─────────────────────────────────────────────────────────────────────┘
  await delay(400);
  checkAbort();

  // J faces forward again for the demo
  await J.body.faceCamera({ duration: 300 });
  checkAbort();

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 8: J demos a handoff                                         │
  // └─────────────────────────────────────────────────────────────────────┘
  // j watches the handoff
  const handoffGazeInterval = setInterval(() => {
    if (!animationAborted) {
      try { j.eyes.lookAt(J.getCenter()); } catch { /* ok */ }
    }
  }, 100);

  const handoffCtrl = await handoff(J, {
    count: 3,
    width: 0.3,
    dwell: 0.5,
    from: 'left',
  });

  // Wait for the handoff phrase to complete
  await handoffCtrl.stop();
  clearInterval(handoffGazeInterval);
  checkAbort();


  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ Step 9: "Transfer" to j — characterize j, show a ball moving over │
  // └─────────────────────────────────────────────────────────────────────┘
  // j's eyes are already visible from step 3; now add mouth + brows + arms
  await characterize(j, { duration: 400, showEyes: true, showMouth: true, showBrows: true });
  await j.arms.show({ duration: 300 });
  checkAbort();

  // Create j's persistent physics context — this ball will live through the idle loop
  jPhysCtx = createPhysicsContext(j);
  jPhysLoop = startPhysicsLoop(jPhysCtx, () => {});
  jBall = addBall(jPhysCtx, 'left', '#3B82F6');
  jBall.element.style.opacity = '1';

  // Brief beat — j has the ball, ready to practice
  await delay(300);
  checkAbort();

  // J settles into a neutral smile for the idle loop
  await J.mouth.updateShape({ openness: 0, mood: 0.7 }, { duration: 200 });
  checkAbort();
}

// ---------------------------------------------------------------------------
// Generic intro for stages 2+ — segment templates played by the runner
// ---------------------------------------------------------------------------

async function runGenericIntro(stageConfig: VignetteStageConfig) {
  if (!bigJ || !littleJ || animationAborted) return;

  const J = bigJ.instance;
  const j = littleJ.instance;

  const actors: RunnerActors = { bigJ, littleJ };
  const callbacks: RunnerCallbacks = {
    showCaption: () => {}, // Vignettes are show-not-tell
    isAborted: () => animationAborted,
  };

  // runSession characterizes both actors (eyes/mouth/brows), runs idle blinks
  // for the duration of the intro, and plays the segments sequentially.
  await runSession(
    {
      id: stageConfig.id,
      title: stageConfig.title,
      theme: stageConfig.theme,
      segments: stageConfig.intro,
    },
    actors,
    callbacks,
  );
  checkAbort();

  // Arms on before ball creation — the persistent ball spawns held in a hand
  await Promise.all([
    J.arms.show({ duration: 300 }),
    j.arms.show({ duration: 300 }),
  ]);
  checkAbort();

  // j's persistent physics context — this ball lives through the idle loop
  jPhysCtx = createPhysicsContext(j);
  jPhysLoop = startPhysicsLoop(jPhysCtx, () => {});
  jBall = addBall(jPhysCtx, 'left', '#3B82F6');
  jBall.element.style.opacity = '1';

  await delay(300);
}

// ---------------------------------------------------------------------------
// Main sequence orchestrator
// ---------------------------------------------------------------------------

async function runSequence() {
  if (!bigJ || !littleJ || animationAborted) return;

  emit('sequence-started');

  const stageConfig = currentStageConfig.value;
  if (!stageConfig) {
    console.warn(`[JJugglingVignette] No stage config for stage ${props.stage}`);
    sequenceComplete.value = true;
    return;
  }

  emit('stage-info', { title: stageConfig.title, description: stageConfig.theme });

  const actors: RunnerActors = { bigJ: bigJ!, littleJ: littleJ! };
  const callbacks: RunnerCallbacks = {
    showCaption: () => {},  // Vignettes are show-not-tell
    isAborted: () => animationAborted,
  };

  try {
    // ── Phase 1: Scripted intro ──
    // Stage 1: bespoke direct choreography (walk-in narrative).
    // Stages 2+: segment templates from the stage config, via the runner.
    if (stageConfig.id === 1) {
      await runSession1Intro();
    } else {
      await runGenericIntro(stageConfig);
    }

    if (animationAborted) return;

    // Scripted intro done — entering the open-ended idle practice loop.
    emit('idle-started');

    // ── Phase 2: Open-ended idle loop ──
    // j practices handoffs from the skillPool; J watches and reacts.
    // This runs until the component unmounts (animationAborted → true).
    await runIdleLoop(stageConfig, actors, callbacks,
      jPhysCtx && jPhysLoop && jBall ? {
        context: jPhysCtx,
        loop: jPhysLoop,
        ball: jBall,
      } : undefined
    );

  } catch (e) {
    if (e instanceof AbortError) {
      // Normal — component unmounted or replay triggered
      return;
    }
    console.warn('[JJugglingVignette] Sequence error:', e);
  }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

async function replaySequence() {
  destroyScene();
  await delay(100);
  createScene();
  sequencePromise = runSequence();
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function destroyScene() {
  animationAborted = true;

  // Clean up j's persistent physics context
  if (jPhysLoop) { jPhysLoop.stop(); jPhysLoop = null; }
  if (jPhysCtx) { removeAllBalls(jPhysCtx); jPhysCtx = null; }
  jBall = null;

  if (stageInstance) {
    stageInstance.destroy();
    stageInstance = null;
  }

  bigJ = null;
  littleJ = null;
  sequenceComplete.value = false;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  // Small delay to let the container get its layout dimensions
  await delay(50);
  createScene();

  if (props.autoPlay) {
    sequencePromise = runSequence();
  }
});

// React to stage changes (e.g. from the debug viewer's stage slider).
// replaySequence handles destroy → recreate → run, and the rebuilt scene
// reads the updated currentStageConfig via the computed.
watch(
  () => props.stage,
  () => {
    void replaySequence();
  },
);

onBeforeUnmount(() => {
  destroyScene();
});

// Expose for parent control
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

/* The fixed logical frame, centered and contain-fit scaled (width/height/
   transform are bound inline from VIGNETTE_FRAME + useContainScale). */
.stage-frame {
  position: absolute;
  left: 50%;
  top: 50%;
}

.stage-container {
  width: 100%;
  height: 100%;
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

/* Responsive */
@media (max-width: 600px) {
  .vignette-container {
    min-height: 180px;
  }
}
</style>