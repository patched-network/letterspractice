<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h3 mb-4">Locomotion & Body Control</h1>
        <p class="text-body-1 mb-6">
          Demos for body transforms, jumping, and walking animations
        </p>
      </v-col>
    </v-row>

    <!-- Body Control Section -->
    <v-row>
      <v-col cols="12">
        <v-card class="mb-6">
          <v-card-title>Body Controller</v-card-title>
          <v-card-subtitle>
            Turn, face, and orient letters in a scene
          </v-card-subtitle>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="bodyWordRef"
                text="A  B"
                :height="150"
                :options="bodyWordOptions"
                @word-created="onBodyWordCreated"
              />
            </div>

            <!-- Current state display -->
            <div class="mb-4 d-flex gap-4">
              <v-chip color="primary" variant="outlined">
                A: {{ letterAFacing }}
              </v-chip>
              <v-chip color="secondary" variant="outlined">
                B: {{ letterBFacing }}
              </v-chip>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn color="primary" @click="faceCamera" :disabled="!bodyWord">
                Both Face Camera
              </v-btn>
              <v-btn
                color="secondary"
                @click="faceEachOther"
                :disabled="!bodyWord"
              >
                Face Each Other
              </v-btn>
              <v-btn color="warning" @click="turnAway" :disabled="!bodyWord">
                Turn Away
              </v-btn>
              <v-btn color="info" @click="rotate180" :disabled="!bodyWord">
                180° Turn (A)
              </v-btn>
            </div>

            <!-- Angle slider -->
            <div class="mt-4">
              <v-slider
                v-model="manualAngle"
                :min="-180"
                :max="180"
                :step="5"
                label="Manual Angle (A)"
                thumb-label
                @update:model-value="applyManualAngle"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Jump Animation Section -->
    <v-row>
      <v-col cols="12">
        <v-card class="mb-6">
          <v-card-title>Jump Animation</v-card-title>
          <v-card-subtitle>
            Squash and stretch jump with parametric control
          </v-card-subtitle>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="jumpWordRef"
                text="Jump"
                :height="150"
                :options="jumpWordOptions"
                @word-created="onJumpWordCreated"
              />
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn color="primary" @click="playJump" :disabled="!jumpWord">
                Jump!
              </v-btn>
              <v-btn
                color="secondary"
                @click="playBigJump"
                :disabled="!jumpWord"
              >
                Big Jump
              </v-btn>
              <v-btn color="info" @click="playSubtleJump" :disabled="!jumpWord">
                Subtle Jump
              </v-btn>
            </div>

            <!-- Jump parameters -->
            <v-row>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="jumpHeight"
                  :min="20"
                  :max="120"
                  :step="5"
                  label="Height"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="jumpSquash"
                  :min="0.5"
                  :max="0.95"
                  :step="0.05"
                  label="Squash"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="jumpStretch"
                  :min="1.05"
                  :max="1.5"
                  :step="0.05"
                  label="Stretch"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="jumpDuration"
                  :min="300"
                  :max="1200"
                  :step="50"
                  label="Duration (ms)"
                  thumb-label
                />
              </v-col>
            </v-row>

            <v-btn
              color="success"
              @click="playCustomJump"
              :disabled="!jumpWord"
            >
              Play Custom Jump
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Walk Animation Section -->
    <v-row>
      <v-col cols="12">
        <v-card class="mb-6">
          <v-card-title>Walk Animation</v-card-title>
          <v-card-subtitle>
            Bouncy waddle walk with direction control
          </v-card-subtitle>
          <v-card-text>
            <div
              class="animation-container mb-4"
              style="overflow: hidden; position: relative"
            >
              <div ref="walkContainerRef" class="walk-stage">
                <WordDisplay
                  ref="walkWordRef"
                  text="Go"
                  :height="120"
                  :options="walkWordOptions"
                  @word-created="onWalkWordCreated"
                />
              </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="primary"
                @click="walkRight"
                :disabled="!walkWord || isWalking"
              >
                Walk Right →
              </v-btn>
              <v-btn
                color="primary"
                @click="walkLeft"
                :disabled="!walkWord || isWalking"
              >
                ← Walk Left
              </v-btn>
              <v-btn
                color="info"
                @click="walkToward"
                :disabled="!walkWord || isWalking"
              >
                Walk Toward ↓
              </v-btn>
              <v-btn
                color="info"
                @click="walkAway"
                :disabled="!walkWord || isWalking"
              >
                Walk Away ↑
              </v-btn>
              <v-btn
                color="secondary"
                @click="walkInPlace"
                :disabled="!walkWord || isWalking"
              >
                Walk In Place
              </v-btn>
              <v-btn color="error" @click="stopWalk" :disabled="!isWalking">
                Stop
              </v-btn>
              <v-btn
                color="warning"
                variant="outlined"
                @click="resetWalkPosition"
                :disabled="!walkWord || isWalking || (walkPosition.x === 0 && walkPosition.scale === 1)"
              >
                Reset Position
              </v-btn>
            </div>

            <!-- Position state display -->
            <div class="mb-4 d-flex gap-4">
              <v-chip color="primary" variant="outlined" size="small">
                X: {{ walkPosition.x.toFixed(0) }}px
              </v-chip>
              <v-chip color="secondary" variant="outlined" size="small">
                Scale: {{ walkPosition.scale.toFixed(2) }}
              </v-chip>
            </div>

            <!-- Walk parameters -->
            <v-row>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="walkWobble"
                  :min="3"
                  :max="20"
                  :step="1"
                  label="Wobble (°)"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="walkBob"
                  :min="2"
                  :max="15"
                  :step="1"
                  label="Bob (px)"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-slider
                  v-model="walkSpeed"
                  :min="30"
                  :max="200"
                  :step="10"
                  label="Speed (px/s)"
                  thumb-label
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-switch v-model="walkLoop" label="Loop" color="primary" />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Combined Scene Section -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>Combined Scene</v-card-title>
          <v-card-subtitle>
            Multi-letter choreography with body, jump, and walk
          </v-card-subtitle>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="sceneWordRef"
                text="Hi"
                :height="150"
                :options="sceneWordOptions"
                @word-created="onSceneWordCreated"
              />
            </div>

            <v-btn
              color="primary"
              @click="playScene"
              :disabled="!sceneWord || sceneRunning"
            >
              Play Greeting Scene
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../../letterpeople/Word";
import { createJumpTransform } from "../../letterpeople/transforms/locomotion/jump";
import { createWalkTransform, createResetTransform } from "../../letterpeople/transforms/locomotion/walk";

// ===== Body Control Section =====
const bodyWordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const bodyWord = shallowRef<Word | null>(null);
const manualAngle = ref(0);

const bodyWordOptions: WordOptions = {
  spacing: 10,
  letterOptions: {
    color: "#5C6BC0",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
  },
};

const onBodyWordCreated = (word: Word) => {
  bodyWord.value = word;
};

const letterAFacing = computed(() => {
  if (!bodyWord.value) return "—";
  const A = bodyWord.value.getLetter(0);
  return A?.body.getFacingDirection() ?? "—";
});

const letterBFacing = computed(() => {
  if (!bodyWord.value) return "—";
  const B = bodyWord.value.getLetter(1);
  return B?.body.getFacingDirection() ?? "—";
});

const faceCamera = async () => {
  if (!bodyWord.value) return;
  const A = bodyWord.value.getLetter(0);
  const B = bodyWord.value.getLetter(1);
  await Promise.all([
    A?.body.faceCamera({ duration: 400 }),
    B?.body.faceCamera({ duration: 400 }),
  ]);
  manualAngle.value = 0;
};

const faceEachOther = async () => {
  if (!bodyWord.value) return;
  const A = bodyWord.value.getLetter(0);
  const B = bodyWord.value.getLetter(1);
  if (A && B) {
    await Promise.all([
      A.body.turnToward(B, { duration: 400 }),
      B.body.turnToward(A, { duration: 400 }),
    ]);
  }
};

const turnAway = async () => {
  if (!bodyWord.value) return;
  const A = bodyWord.value.getLetter(0);
  const B = bodyWord.value.getLetter(1);
  if (A && B) {
    await Promise.all([
      A.body.turnAwayFrom(B, { duration: 400 }),
      B.body.turnAwayFrom(A, { duration: 400 }),
    ]);
  }
};

const rotate180 = async () => {
  if (!bodyWord.value) return;
  const A = bodyWord.value.getLetter(0);
  await A?.body.turnTo(180, { duration: 800 });
  manualAngle.value = 180;
};

const applyManualAngle = async (angle: number) => {
  if (!bodyWord.value) return;
  const A = bodyWord.value.getLetter(0);
  await A?.body.turnTo(angle, { duration: 200 });
};

// ===== Jump Section =====
const jumpWordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const jumpWord = shallowRef<Word | null>(null);
const jumpHeight = ref(50);
const jumpSquash = ref(0.7);
const jumpStretch = ref(1.25);
const jumpDuration = ref(700);

const jumpWordOptions: WordOptions = {
  spacing: 8,
  letterOptions: {
    color: "#FF7043",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
  },
};

const onJumpWordCreated = (word: Word) => {
  jumpWord.value = word;
};

const playJump = () => {
  if (!jumpWord.value) return;
  const jump = createJumpTransform({
    height: 50,
    squashFactor: 0.7,
    stretchFactor: 1.25,
    duration: 700,
  });
  jump(jumpWord.value);
};

const playBigJump = () => {
  if (!jumpWord.value) return;
  const jump = createJumpTransform({
    height: 100,
    squashFactor: 0.6,
    stretchFactor: 1.4,
    duration: 900,
  });
  jump(jumpWord.value);
};

const playSubtleJump = () => {
  if (!jumpWord.value) return;
  const jump = createJumpTransform({
    height: 25,
    squashFactor: 0.85,
    stretchFactor: 1.1,
    duration: 500,
  });
  jump(jumpWord.value);
};

const playCustomJump = () => {
  if (!jumpWord.value) return;
  const jump = createJumpTransform({
    height: jumpHeight.value,
    squashFactor: jumpSquash.value,
    stretchFactor: jumpStretch.value,
    duration: jumpDuration.value,
  });
  jump(jumpWord.value);
};

// ===== Walk Section =====
const walkWordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const walkContainerRef = ref<HTMLElement | null>(null);
const walkWord = shallowRef<Word | null>(null);
const walkWobble = ref(10);
const walkBob = ref(6);
const walkSpeed = ref(100);
const walkLoop = ref(false);
const isWalking = ref(false);
let walkCleanup: (() => void) | null = null;

// Stateful position tracking
const walkPosition = ref({ x: 0, scale: 1 });

const walkWordOptions: WordOptions = {
  spacing: 8,
  letterOptions: {
    color: "#66BB6A",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
  },
};

const onWalkWordCreated = (word: Word) => {
  walkWord.value = word;
};

const walkRight = () => {
  if (!walkWord.value) return;
  isWalking.value = true;
  const walk = createWalkTransform({
    direction: "right",
    speed: walkSpeed.value,
    distance: 200,
    wobbleAngle: walkWobble.value,
    bobHeight: walkBob.value,
    loop: walkLoop.value,
    translate: true,
    startX: walkPosition.value.x,
    startScale: walkPosition.value.scale,
    onComplete: (state) => {
      walkPosition.value = state;
      isWalking.value = false;
    },
  });
  walkCleanup = () => walk(walkWord.value!);
};

const walkLeft = () => {
  if (!walkWord.value) return;
  isWalking.value = true;
  const walk = createWalkTransform({
    direction: "left",
    speed: walkSpeed.value,
    distance: 200,
    wobbleAngle: walkWobble.value,
    bobHeight: walkBob.value,
    loop: walkLoop.value,
    translate: true,
    startX: walkPosition.value.x,
    startScale: walkPosition.value.scale,
    onComplete: (state) => {
      walkPosition.value = state;
      isWalking.value = false;
    },
  });
  walkCleanup = () => walk(walkWord.value!);
};

const walkInPlace = () => {
  if (!walkWord.value) return;
  isWalking.value = true;
  const walk = createWalkTransform({
    direction: "right",
    speed: walkSpeed.value,
    distance: 200,
    wobbleAngle: walkWobble.value,
    bobHeight: walkBob.value,
    loop: true,
    translate: false,
  });
  walkCleanup = () => walk(walkWord.value!);
};

const walkToward = () => {
  if (!walkWord.value) return;
  isWalking.value = true;
  const walk = createWalkTransform({
    direction: "toward",
    speed: walkSpeed.value,
    distance: 150,
    wobbleAngle: walkWobble.value,
    bobHeight: walkBob.value,
    loop: walkLoop.value,
    translate: true,
    startX: walkPosition.value.x,
    startScale: walkPosition.value.scale,
    onComplete: (state) => {
      walkPosition.value = state;
      isWalking.value = false;
    },
  });
  walkCleanup = () => walk(walkWord.value!);
};

const walkAway = () => {
  if (!walkWord.value) return;
  isWalking.value = true;
  const walk = createWalkTransform({
    direction: "away",
    speed: walkSpeed.value,
    distance: 150,
    wobbleAngle: walkWobble.value,
    bobHeight: walkBob.value,
    loop: walkLoop.value,
    translate: true,
    startX: walkPosition.value.x,
    startScale: walkPosition.value.scale,
    onComplete: (state) => {
      walkPosition.value = state;
      isWalking.value = false;
    },
  });
  walkCleanup = () => walk(walkWord.value!);
};

const stopWalk = () => {
  if (walkCleanup) {
    walkCleanup();
    walkCleanup = null;
  }
  isWalking.value = false;
};

const resetWalkPosition = () => {
  if (!walkWord.value || isWalking.value) return;
  isWalking.value = true;
  const reset = createResetTransform(walkPosition.value, {
    duration: 400,
    onComplete: () => {
      walkPosition.value = { x: 0, scale: 1 };
      isWalking.value = false;
    },
  });
  reset(walkWord.value);
};

// ===== Combined Scene =====
const sceneWordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const sceneWord = shallowRef<Word | null>(null);
const sceneRunning = ref(false);

const sceneWordOptions: WordOptions = {
  spacing: 15,
  letterOptions: {
    color: "#AB47BC",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: true,
    showEyebrows: true,
  },
};

const onSceneWordCreated = (word: Word) => {
  sceneWord.value = word;
};

const playScene = async () => {
  if (!sceneWord.value) return;
  sceneRunning.value = true;

  const H = sceneWord.value.getLetter(0);
  const I = sceneWord.value.getLetter(1);

  if (!H || !I) {
    sceneRunning.value = false;
    return;
  }

  try {
    // H gets excited and jumps
    H.eyes.brows?.express("surprised", { duration: 300 });
    const jump = createJumpTransform({ height: 40, duration: 600 });
    jump(sceneWord.value);

    await new Promise((r) => setTimeout(r, 700));

    // H turns to I
    await H.body.turnToward(I, { duration: 300 });

    // H waves
    await H.arms.wave({ duration: 500 });

    // I responds
    I.eyes.brows?.express("happy", { duration: 300 });
    await I.body.turnToward(H, { duration: 300 });
    await I.arms.wave({ duration: 500 });

    // Both face camera
    await Promise.all([
      H.body.faceCamera({ duration: 300 }),
      I.body.faceCamera({ duration: 300 }),
      H.eyes.brows?.express("happy", { duration: 300 }),
    ]);

    // Final jump together
    const finalJump = createJumpTransform({ height: 30, duration: 500 });
    finalJump(sceneWord.value);

    await new Promise((r) => setTimeout(r, 600));
  } finally {
    sceneRunning.value = false;
  }
};
</script>

<style scoped>
.animation-container {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 2rem;
}

.walk-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 400px;
}

.gap-2 {
  gap: 8px;
}

.gap-4 {
  gap: 16px;
}
</style>
