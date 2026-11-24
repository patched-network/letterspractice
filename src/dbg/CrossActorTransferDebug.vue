<template>
  <v-container fluid class="transfer-page pa-4">
    <div class="d-flex align-center mb-3 ga-2">
      <span class="text-h6">🏐↔️ Cross-Actor Ball Transfer</span>
      <v-chip size="small" color="info" variant="flat">Phase 4</v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" @click="resetAll">🔄 Reset</v-btn>
    </div>

    <!-- Stage container -->
    <v-card variant="outlined" class="mb-3">
      <v-card-text class="pa-0">
        <div ref="stageContainer" class="stage-container" />
      </v-card-text>
    </v-card>

    <!-- Ball status -->
    <div class="d-flex align-center ga-3 mb-3">
      <div>
        <strong>{{ leftChar }}:</strong>
        <v-chip
          v-for="(bs, i) in leftBallStates"
          :key="'l' + i"
          :color="
            bs.status === 'held'
              ? 'success'
              : bs.status === 'grounded'
                ? 'error'
                : 'warning'
          "
          size="small"
          variant="flat"
          class="ml-1"
        >
          {{
            bs.status === 'held'
              ? '🟢 ' + bs.heldBy
              : bs.status === 'grounded'
                ? '🔴 ground'
                : '🟡 flight'
          }}
        </v-chip>
        <v-chip
          v-if="leftBallStates.length === 0"
          size="small"
          variant="flat"
          color="grey"
          >no balls</v-chip
        >
      </div>
      <div>
        <strong>{{ rightChar }}:</strong>
        <v-chip
          v-for="(bs, i) in rightBallStates"
          :key="'r' + i"
          :color="
            bs.status === 'held'
              ? 'success'
              : bs.status === 'grounded'
                ? 'error'
                : 'warning'
          "
          size="small"
          variant="flat"
          class="ml-1"
        >
          {{
            bs.status === 'held'
              ? '🟢 ' + bs.heldBy
              : bs.status === 'grounded'
                ? '🔴 ground'
                : '🟡 flight'
          }}
        </v-chip>
        <v-chip
          v-if="rightBallStates.length === 0"
          size="small"
          variant="flat"
          color="grey"
          >no balls</v-chip
        >
      </div>
    </div>

    <!-- Transfer controls -->
    <v-card variant="outlined" class="mb-3">
      <v-card-title class="text-subtitle-2 pa-2 pb-0"
        >Transfer Controls</v-card-title
      >
      <v-card-text class="pa-2">
        <div class="d-flex ga-2 flex-wrap align-center">
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            :disabled="isTransferring || !hasLeftBall"
            @click="transferLeftToRight"
          >
            {{ leftChar }} → {{ rightChar }} (animated)
          </v-btn>
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            :disabled="isTransferring || !hasRightBall"
            @click="transferRightToLeft"
          >
            {{ leftChar }} ← {{ rightChar }} (animated)
          </v-btn>
          <v-btn
            size="small"
            color="secondary"
            variant="tonal"
            :disabled="isTransferring || !hasLeftBall"
            @click="transferLeftToRightInstant"
          >
            Instant →
          </v-btn>
          <v-btn
            size="small"
            color="secondary"
            variant="tonal"
            :disabled="isTransferring || !hasRightBall"
            @click="transferRightToLeftInstant"
          >
            ← Instant
          </v-btn>
        </div>

        <div class="d-flex ga-2 mt-2 align-center">
          <span class="text-caption">Arc height:</span>
          <v-slider
            v-model="arcHeight"
            :min="20"
            :max="200"
            :step="10"
            hide-details
            density="compact"
            style="max-width: 200px"
          >
            <template #append
              ><span class="text-caption">{{ arcHeight }}px</span></template
            >
          </v-slider>
          <span class="text-caption">Duration:</span>
          <v-slider
            v-model="arcDuration"
            :min="200"
            :max="1500"
            :step="50"
            hide-details
            density="compact"
            style="max-width: 200px"
          >
            <template #append
              ><span class="text-caption">{{ arcDuration }}ms</span></template
            >
          </v-slider>
        </div>

        <div class="d-flex ga-2 mt-2">
          <v-btn size="x-small" variant="text" @click="addBallToLeft"
            >+ Ball to {{ leftChar }}</v-btn
          >
          <v-btn size="x-small" variant="text" @click="addBallToRight"
            >+ Ball to {{ rightChar }}</v-btn
          >
        </div>
      </v-card-text>
    </v-card>

    <!-- Log -->
    <v-card density="compact" variant="outlined">
      <v-card-text class="pa-2">
        <div class="d-flex align-center mb-1">
          <span class="text-caption font-weight-bold">Log</span>
          <v-spacer />
          <v-btn size="x-small" variant="text" @click="logs = []"
            >Clear</v-btn
          >
        </div>
        <div class="log-container">
          <div v-for="(entry, i) in logs" :key="i" class="log-entry">
            <small>{{ entry }}</small>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { Stage, type Actor } from "../letterpeople/scene/Stage";
import {
  createPhysicsContext,
  addBall,
  removeAllBalls,
  startPhysicsLoop,
  getGazeTarget,
  placeBallInHand,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from "../letterpeople/transforms/juggling/phrases/physics-core";
import {
  transferBallInstant,
  transferBallAnimated,
} from "../letterpeople/transforms/juggling/phrases/ball-transfer";

// ── Config ──────────────────────────────────────────────────────────────

const leftChar = ref("J");
const rightChar = ref("j");
const arcHeight = ref(80);
const arcDuration = ref(600);

// ── Refs ────────────────────────────────────────────────────────────────

const stageContainer = ref<HTMLDivElement | null>(null);
const logs = ref<string[]>([]);
const isTransferring = ref(false);

let stage: Stage | null = null;
let leftActor: Actor | null = null;
let rightActor: Actor | null = null;

let leftCtx: PhysicsContext | null = null;
let rightCtx: PhysicsContext | null = null;
let leftLoop: PhysicsLoop | null = null;
let rightLoop: PhysicsLoop | null = null;

const leftBalls: PhysicsBall[] = [];
const rightBalls: PhysicsBall[] = [];

const leftBallStates = ref<Array<{ status: string; heldBy: string | null }>>(
  [],
);
const rightBallStates = ref<Array<{ status: string; heldBy: string | null }>>(
  [],
);
let pollId: number | null = null;

const hasLeftBall = computed(() => leftBallStates.value.length > 0);
const hasRightBall = computed(() => rightBallStates.value.length > 0);

// ── Logging ─────────────────────────────────────────────────────────────

function log(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  logs.value.push(`[${t}] ${msg}`);
}

// ── Setup ───────────────────────────────────────────────────────────────

function createScene() {
  if (!stageContainer.value) return;
  stageContainer.value.innerHTML = "";

  stage = new Stage(stageContainer.value, {
    width: stageContainer.value.clientWidth || 700,
    height: 350,
    backgroundColor: "#f8f9fa",
    horizonRatio: 0.15,
  });

  // Add two actors
  leftActor = stage.addActor("left", leftChar.value, {
    xPercent: 30,
    z: 60,
    height: 180,
    letterOptions: {
      color: "#FF6B6B",
      lineWidth: 22,
      borderWidth: 4,
      showEyes: true,
      showMouth: true,
      showArms: true,
      armLength: 17,
      armThickness: 3,
    },
  });

  rightActor = stage.addActor("right", rightChar.value, {
    xPercent: 70,
    z: 60,
    height: 150,
    letterOptions: {
      color: "#6BAFFF",
      lineWidth: 18,
      borderWidth: 3,
      showEyes: true,
      showMouth: true,
      showArms: true,
      armLength: 17,
      armThickness: 3,
    },
  });

  if (!leftActor || !rightActor) {
    log("❌ Failed to create actors");
    return;
  }

  // Show arms
  leftActor.instance.arms.show({ duration: 0 });
  rightActor.instance.arms.show({ duration: 0 });

  // Create physics contexts
  leftCtx = createPhysicsContext(leftActor.instance);
  leftLoop = startPhysicsLoop(leftCtx, (ctx) => {
    const gaze = getGazeTarget(ctx);
    if (gaze && leftActor) {
      void leftActor.instance.eyes.lookAtPoint(gaze, { duration: 80 });
    }
  });

  rightCtx = createPhysicsContext(rightActor.instance);
  rightLoop = startPhysicsLoop(rightCtx, (ctx) => {
    const gaze = getGazeTarget(ctx);
    if (gaze && rightActor) {
      void rightActor.instance.eyes.lookAtPoint(gaze, { duration: 80 });
    }
  });

  // Give left actor a ball in left hand
  const ball = addBall(leftCtx, "left", "#3B82F6");
  ball.element.style.opacity = "1";
  leftBalls.push(ball);

  // Start polling ball state
  startPoll();

  log(
    `Scene created: ${leftChar.value} (left) + ${rightChar.value} (right)`,
  );
  log(`${leftChar.value} has 1 ball in left hand`);
}

function startPoll() {
  if (pollId !== null) return;
  pollId = window.setInterval(() => {
    leftBallStates.value = leftBalls.map((b) => ({
      status: b.status,
      heldBy: b.heldBy,
    }));
    rightBallStates.value = rightBalls.map((b) => ({
      status: b.status,
      heldBy: b.heldBy,
    }));
  }, 100);
}

function stopPoll() {
  if (pollId !== null) {
    clearInterval(pollId);
    pollId = null;
  }
}

// ── Transfer functions ──────────────────────────────────────────────────

async function transferLeftToRight() {
  if (
    !leftCtx ||
    !rightCtx ||
    !leftActor ||
    !rightActor ||
    !stage ||
    leftBalls.length === 0
  )
    return;
  isTransferring.value = true;

  const ball = leftBalls.shift()!;
  log(
    `🏐→ Transferring ball from ${leftChar.value} to ${rightChar.value} (animated)...`,
  );

  try {
    const newBall = await transferBallAnimated(
      leftCtx,
      rightCtx,
      ball,
      leftActor,
      rightActor,
      stage.container,
      {
        duration: arcDuration.value,
        arcHeight: arcHeight.value,
        destinationHand: "left",
      },
    );
    rightBalls.push(newBall);
    log(`  ✓ Ball arrived in ${rightChar.value}'s left hand`);
  } catch (e) {
    log(`  ✗ Transfer failed: ${e}`);
  }

  isTransferring.value = false;
}

async function transferRightToLeft() {
  if (
    !leftCtx ||
    !rightCtx ||
    !leftActor ||
    !rightActor ||
    !stage ||
    rightBalls.length === 0
  )
    return;
  isTransferring.value = true;

  const ball = rightBalls.shift()!;
  log(
    `←🏐 Transferring ball from ${rightChar.value} to ${leftChar.value} (animated)...`,
  );

  try {
    const newBall = await transferBallAnimated(
      rightCtx,
      leftCtx,
      ball,
      rightActor,
      leftActor,
      stage.container,
      {
        duration: arcDuration.value,
        arcHeight: arcHeight.value,
        destinationHand: "right",
      },
    );
    leftBalls.push(newBall);
    log(`  ✓ Ball arrived in ${leftChar.value}'s right hand`);
  } catch (e) {
    log(`  ✗ Transfer failed: ${e}`);
  }

  isTransferring.value = false;
}

function transferLeftToRightInstant() {
  if (
    !leftCtx ||
    !rightCtx ||
    !leftActor ||
    !rightActor ||
    leftBalls.length === 0
  )
    return;

  const ball = leftBalls.shift()!;
  const newBall = transferBallInstant(
    leftCtx,
    rightCtx,
    ball,
    leftActor,
    rightActor,
    "left",
  );
  rightBalls.push(newBall);
  log(`⚡ Instant transfer: ${leftChar.value} → ${rightChar.value}`);
}

function transferRightToLeftInstant() {
  if (
    !leftCtx ||
    !rightCtx ||
    !leftActor ||
    !rightActor ||
    rightBalls.length === 0
  )
    return;

  const ball = rightBalls.shift()!;
  const newBall = transferBallInstant(
    rightCtx,
    leftCtx,
    ball,
    rightActor,
    leftActor,
    "right",
  );
  leftBalls.push(newBall);
  log(`⚡ Instant transfer: ${rightChar.value} → ${leftChar.value}`);
}

// ── Add balls utility ───────────────────────────────────────────────────

function addBallToLeft() {
  if (!leftCtx) return;
  const hand = leftBalls.some((b) => b.heldBy === "left") ? "right" : "left";
  const ball = addBall(leftCtx, hand as "left" | "right", "#3B82F6");
  ball.element.style.opacity = "1";
  leftBalls.push(ball);
  log(`+ Added ball to ${leftChar.value} (${hand} hand)`);
}

function addBallToRight() {
  if (!rightCtx) return;
  const hand = rightBalls.some((b) => b.heldBy === "left") ? "right" : "left";
  const ball = addBall(rightCtx, hand as "left" | "right", "#EF4444");
  ball.element.style.opacity = "1";
  rightBalls.push(ball);
  log(`+ Added ball to ${rightChar.value} (${hand} hand)`);
}

// ── Reset ───────────────────────────────────────────────────────────────

function resetAll() {
  destroyScene();
  createScene();
  log("🔄 Reset complete");
}

function destroyScene() {
  stopPoll();

  if (leftCtx) {
    removeAllBalls(leftCtx);
  }
  if (rightCtx) {
    removeAllBalls(rightCtx);
  }
  if (leftLoop) {
    leftLoop.stop();
    leftLoop = null;
  }
  if (rightLoop) {
    rightLoop.stop();
    rightLoop = null;
  }
  leftCtx = null;
  rightCtx = null;
  leftBalls.length = 0;
  rightBalls.length = 0;
  leftBallStates.value = [];
  rightBallStates.value = [];

  if (stage) {
    stage.destroy();
    stage = null;
  }
  leftActor = null;
  rightActor = null;
}

// ── Lifecycle ───────────────────────────────────────────────────────────

onMounted(() => {
  log("Mounted — creating cross-actor transfer scene");
  // Small delay to ensure container is rendered and has dimensions
  setTimeout(createScene, 100);
});

onBeforeUnmount(() => {
  destroyScene();
});
</script>

<style scoped>
.transfer-page :deep(.v-btn) {
  text-transform: none;
  letter-spacing: normal;
}

.transfer-page {
  max-width: 800px;
  margin: 0 auto;
}

.stage-container {
  width: 100%;
  height: 350px;
  position: relative;
  background: #f8f9fa;
  border-radius: 8px;
}

.log-container {
  max-height: 150px;
  overflow-y: auto;
  background: #fafafa;
  border-radius: 4px;
  padding: 4px 8px;
}

.log-entry {
  font-family: monospace;
  line-height: 1.4;
  border-bottom: 1px solid #f0f0f0;
}
</style>