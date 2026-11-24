<template>
  <v-card>
    <v-card-title>Walk Animation</v-card-title>
    <v-card-text>
      <div class="animation-container mb-4">
        <WordDisplay
          ref="wordRef"
          text="Walk"
          :height="150"
          :options="wordOptions"
          @word-created="onWordCreated"
        />
      </div>

      <div class="d-flex flex-wrap gap-2 mb-4">
        <v-btn
          color="primary"
          @click="playWalkRight"
          :disabled="!wordInstance || isAnimating"
        >
          Walk Right →
        </v-btn>
        <v-btn
          color="primary"
          @click="playWalkLeft"
          :disabled="!wordInstance || isAnimating"
        >
          ← Walk Left
        </v-btn>
        <v-btn
          color="secondary"
          @click="playStroll"
          :disabled="!wordInstance || isAnimating"
        >
          Stroll
        </v-btn>
        <v-btn
          color="accent"
          @click="playMarch"
          :disabled="!wordInstance || isAnimating"
        >
          March
        </v-btn>
      </div>

      <div class="d-flex flex-wrap gap-2 mb-4">
        <v-btn
          color="warning"
          @click="toggleTreadmill"
          :disabled="!wordInstance"
        >
          {{ isTreadmilling ? 'Stop' : 'Start' }} Treadmill
        </v-btn>
        <v-btn
          color="info"
          @click="playWalkToward"
          :disabled="!wordInstance || isAnimating"
        >
          Walk Toward ↓
        </v-btn>
        <v-btn
          color="info"
          @click="playWalkAway"
          :disabled="!wordInstance || isAnimating"
        >
          Walk Away ↑
        </v-btn>
      </div>

      <v-divider class="my-4" />

      <h4 class="text-subtitle-1 mb-2">Custom Walk Parameters</h4>
      <v-row>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customSpeed"
            label="Speed (px/s)"
            :min="30"
            :max="200"
            :step="10"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customDistance"
            label="Distance (px)"
            :min="50"
            :max="400"
            :step="25"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customWobble"
            label="Wobble (°)"
            :min="2"
            :max="20"
            :step="1"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customBob"
            label="Bob (px)"
            :min="2"
            :max="15"
            :step="1"
            thumb-label
          />
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="6" md="4">
          <v-select
            v-model="customDirection"
            label="Direction"
            :items="['left', 'right', 'toward', 'away']"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-checkbox
            v-model="customTranslate"
            label="Translate position"
            density="compact"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-btn
            color="primary"
            variant="outlined"
            @click="playCustomWalk"
            :disabled="!wordInstance || isAnimating"
          >
            Play Custom Walk
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onUnmounted, shallowRef } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../../letterpeople/Word";
import {
  createWalkTransform,
  createStrollTransform,
  createMarchTransform,
  createTreadmillTransform,
  type WalkOptions,
} from "../../letterpeople/transforms/locomotion";

// Refs
const wordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const wordInstance = shallowRef<Word | null>(null);
const isAnimating = ref(false);
const isTreadmilling = ref(false);
let treadmillCleanup: (() => void) | null = null;

// Custom parameters
const customSpeed = ref(100);
const customDistance = ref(200);
const customWobble = ref(10);
const customBob = ref(6);
const customDirection = ref<WalkOptions["direction"]>("right");
const customTranslate = ref(true);

// Word display options
const wordOptions: WordOptions = {
  spacing: 12,
  letterOptions: {
    color: "#4CAF50",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
    eyebrowsWithEyes: true,
  },
};

// Capture Word instance when created
const onWordCreated = (word: Word) => {
  wordInstance.value = word;
  console.log("[AnimationWalk] Word instance created:", word);
};

// Calculate animation duration for timeout
const calculateDuration = (distance: number, speed: number): number => {
  return (distance / speed) * 1000 + 200; // Add buffer
};

// Animation functions
const playWalkRight = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const walk = createWalkTransform({ direction: "right" });
  walk(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(200, 100));
};

const playWalkLeft = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const walk = createWalkTransform({ direction: "left" });
  walk(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(200, 100));
};

const playStroll = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const stroll = createStrollTransform("right");
  stroll(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(150, 60));
};

const playMarch = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const march = createMarchTransform("right");
  march(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(200, 150));
};

const toggleTreadmill = () => {
  if (!wordInstance.value) return;

  if (isTreadmilling.value && treadmillCleanup) {
    treadmillCleanup();
    treadmillCleanup = null;
    isTreadmilling.value = false;
  } else {
    const treadmill = createTreadmillTransform("right");
    treadmillCleanup = treadmill(wordInstance.value) as (() => void) | undefined ?? null;
    isTreadmilling.value = true;
  }
};

const playWalkToward = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const walk = createWalkTransform({
    direction: "toward",
    distance: 150,
    speed: 80,
  });
  walk(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(150, 80));
};

const playWalkAway = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const walk = createWalkTransform({
    direction: "away",
    distance: 150,
    speed: 80,
  });
  walk(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(150, 80));
};

const playCustomWalk = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const custom = createWalkTransform({
    direction: customDirection.value,
    speed: customSpeed.value,
    distance: customDistance.value,
    wobbleAngle: customWobble.value,
    bobHeight: customBob.value,
    translate: customTranslate.value,
  });
  custom(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, calculateDuration(customDistance.value, customSpeed.value));
};

// Cleanup on unmount
onUnmounted(() => {
  if (treadmillCleanup) {
    treadmillCleanup();
  }
});
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
  overflow: visible;
}

.gap-2 {
  gap: 0.5rem;
}
</style>
