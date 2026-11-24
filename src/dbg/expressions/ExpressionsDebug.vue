<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h3 mb-4">Expressions Debug</h1>
        <p class="text-body-1 mb-6">
          Testing eyebrow expressions and facial feature coordination
        </p>
      </v-col>
    </v-row>

    <!-- Single Letter Expression Demo -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Single Letter Expressions</v-card-title>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="singleLetterRef"
                text="H"
                :height="200"
                :options="singleLetterOptions"
                @word-created="onSingleLetterCreated"
              />
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                v-for="emotion in emotions"
                :key="emotion"
                :color="currentEmotion === emotion ? 'primary' : 'default'"
                size="small"
                @click="setEmotion(emotion)"
                :disabled="!singleLetterInstance"
              >
                {{ emotion }}
              </v-btn>
            </div>

            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-2">Individual Brow Control</h4>
            <v-row>
              <v-col cols="6">
                <p class="text-caption">Left Brow</p>
                <v-slider
                  v-model="leftBrowRaise"
                  label="Raise"
                  :min="-8"
                  :max="8"
                  :step="1"
                  thumb-label
                  @update:model-value="updateLeftBrow"
                />
                <v-slider
                  v-model="leftBrowRotate"
                  label="Rotate"
                  :min="-20"
                  :max="20"
                  :step="1"
                  thumb-label
                  @update:model-value="updateLeftBrow"
                />
              </v-col>
              <v-col cols="6">
                <p class="text-caption">Right Brow</p>
                <v-slider
                  v-model="rightBrowRaise"
                  label="Raise"
                  :min="-8"
                  :max="8"
                  :step="1"
                  thumb-label
                  @update:model-value="updateRightBrow"
                />
                <v-slider
                  v-model="rightBrowRotate"
                  label="Rotate"
                  :min="-20"
                  :max="20"
                  :step="1"
                  thumb-label
                  @update:model-value="updateRightBrow"
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Word Expression Demo -->
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Word Expressions</v-card-title>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="wordRef"
                text="Hi"
                :height="150"
                :options="wordOptions"
                @word-created="onWordCreated"
              />
            </div>

            <v-btn
              color="primary"
              class="mb-4"
              @click="playExpressionSequence"
              :disabled="!wordInstance"
            >
              Play Expression Sequence
            </v-btn>

            <v-btn
              color="secondary"
              class="mb-4 ml-2"
              @click="toggleTracking"
              :disabled="!wordInstance"
            >
              {{ isTracking ? 'Stop' : 'Start' }} Eye Tracking
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Expression Cycle Demo -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>Expression Cycle</v-card-title>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="cycleRef"
                text="Joy"
                :height="150"
                :options="cycleOptions"
                @word-created="onCycleCreated"
              />
            </div>

            <div class="d-flex align-center gap-4">
              <v-btn
                color="primary"
                @click="startCycle"
                :disabled="!cycleInstance || isCycling"
              >
                Start Cycle
              </v-btn>
              <v-btn
                color="error"
                @click="stopCycle"
                :disabled="!isCycling"
              >
                Stop Cycle
              </v-btn>
              <v-chip v-if="isCycling" color="primary">
                Current: {{ cycleEmotion }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onUnmounted, shallowRef } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../../letterpeople/Word";
import type { EmotionPreset } from "../../letterpeople/attachments/eyebrow";

// Emotion list
const emotions: EmotionPreset[] = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
];

// Single letter demo
const singleLetterRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const singleLetterInstance = shallowRef<Word | null>(null);
const currentEmotion = ref<EmotionPreset>("neutral");

// Individual brow control
const leftBrowRaise = ref(0);
const leftBrowRotate = ref(0);
const rightBrowRaise = ref(0);
const rightBrowRotate = ref(0);

const singleLetterOptions: WordOptions = {
  spacing: 10,
  letterOptions: {
    color: "#FF6B6B",
    lineWidth: 24,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
    eyebrowsWithEyes: true, // Auto-show brows with eyes
  },
};

const onSingleLetterCreated = (word: Word) => {
  singleLetterInstance.value = word;
  console.log("[ExpressionsDebug] Single letter created:", word);
};

const setEmotion = async (emotion: EmotionPreset) => {
  if (!singleLetterInstance.value) return;

  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  // Update button state immediately
  currentEmotion.value = emotion;

  // Define mouth shapes for each emotion
  const mouthShapes: Record<EmotionPreset, { openness: number; mood: number }> = {
    neutral: { openness: 0.1, mood: 0.5 },
    happy: { openness: 0.2, mood: 0.85 },
    sad: { openness: 0.05, mood: 0.2 },
    angry: { openness: 0.3, mood: 0.15 },
    surprised: { openness: 0.6, mood: 0.55 },
  };

  // Update both eyebrows and mouth
  await Promise.all([
    letter.eyes.brows?.express(emotion, { duration: 300 }),
    letter.mouth.updateShape(mouthShapes[emotion], { duration: 300 }),
  ]);

  // Reset sliders to match preset (approximate)
  if (letter.eyes.brows) {
    const state = letter.eyes.brows.left.getState();
    leftBrowRaise.value = state.raise;
    leftBrowRotate.value = state.rotate;
    const rightState = letter.eyes.brows.right.getState();
    rightBrowRaise.value = rightState.raise;
    rightBrowRotate.value = rightState.rotate;
  }
};

const updateLeftBrow = () => {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (letter?.eyes.brows) {
    letter.eyes.brows.left.setState(
      { raise: leftBrowRaise.value, rotate: leftBrowRotate.value },
      { duration: 150 }
    );
  }
};

const updateRightBrow = () => {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (letter?.eyes.brows) {
    letter.eyes.brows.right.setState(
      { raise: rightBrowRaise.value, rotate: rightBrowRotate.value },
      { duration: 150 }
    );
  }
};

// Word demo
const wordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const wordInstance = shallowRef<Word | null>(null);
const isTracking = ref(false);

const wordOptions: WordOptions = {
  spacing: 15,
  letterOptions: {
    color: "#4CAF50",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: true,
    eyebrowsWithEyes: true,
  },
};

const onWordCreated = (word: Word) => {
  wordInstance.value = word;
  console.log("[ExpressionsDebug] Word created:", word);
};

const playExpressionSequence = async () => {
  if (!wordInstance.value) return;

  const H = wordInstance.value.getLetter(0);
  const I = wordInstance.value.getLetter(1);

  if (!H || !I) return;

  // H starts neutral, then gets surprised
  await H.eyes.brows?.express("neutral", { duration: 200 });
  await new Promise((r) => setTimeout(r, 500));

  // H gets surprised
  await H.eyes.brows?.express("surprised", { duration: 300 });
  await H.mouth.updateShape({ openness: 0.6, mood: 0.5 }, { duration: 300 });
  await new Promise((r) => setTimeout(r, 600));

  // I responds happily
  await I.eyes.brows?.express("happy", { duration: 300 });
  await I.mouth.updateShape({ openness: 0.3, mood: 0.9 }, { duration: 300 });
  I.arms.wave({ duration: 600 });
  await new Promise((r) => setTimeout(r, 800));

  // Both become happy
  await Promise.all([
    H.eyes.brows?.express("happy", { duration: 300 }),
    H.mouth.updateShape({ openness: 0.2, mood: 0.8 }, { duration: 300 }),
  ]);

  await new Promise((r) => setTimeout(r, 1000));

  // Return to neutral
  await Promise.all([
    H.eyes.brows?.relax({ duration: 400 }),
    I.eyes.brows?.relax({ duration: 400 }),
    H.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 400 }),
    I.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 400 }),
  ]);
};

const toggleTracking = () => {
  if (!wordInstance.value) return;

  if (isTracking.value) {
    wordInstance.value.letters.forEach((letter) => {
      letter.eyes.stopTracking();
    });
    isTracking.value = false;
  } else {
    wordInstance.value.letters.forEach((letter) => {
      letter.eyes.startTracking({ intensity: 0.7 });
    });
    isTracking.value = true;
  }
};

// Cycle demo
const cycleRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const cycleInstance = shallowRef<Word | null>(null);
const isCycling = ref(false);
const cycleEmotion = ref<EmotionPreset>("neutral");
let cycleInterval: ReturnType<typeof setInterval> | null = null;

const cycleOptions: WordOptions = {
  spacing: 12,
  letterOptions: {
    color: "#9C27B0",
    lineWidth: 22,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: false,
    eyebrowsWithEyes: true,
  },
};

const onCycleCreated = (word: Word) => {
  cycleInstance.value = word;
  console.log("[ExpressionsDebug] Cycle word created:", word);
};

const startCycle = () => {
  if (!cycleInstance.value || isCycling.value) return;

  isCycling.value = true;
  let index = 0;

  const cycle = async () => {
    if (!cycleInstance.value) return;

    const emotion = emotions[index];
    cycleEmotion.value = emotion;

    // Apply emotion to all letters
    const promises = cycleInstance.value.letters.map((letter) =>
      letter.eyes.brows?.express(emotion, { duration: 400 })
    );
    await Promise.all(promises);

    index = (index + 1) % emotions.length;
  };

  // Run immediately, then every 1.5 seconds
  cycle();
  cycleInterval = setInterval(cycle, 1500);
};

const stopCycle = () => {
  if (cycleInterval) {
    clearInterval(cycleInterval);
    cycleInterval = null;
  }
  isCycling.value = false;

  // Reset to neutral
  if (cycleInstance.value) {
    cycleInstance.value.letters.forEach((letter) => {
      letter.eyes.brows?.relax({ duration: 300 });
    });
  }
};

// Cleanup on unmount
onUnmounted(() => {
  if (cycleInterval) {
    clearInterval(cycleInterval);
  }
});
</script>

<style scoped>
.animation-container {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 2rem;
}

.gap-2 {
  gap: 0.5rem;
}

.gap-4 {
  gap: 1rem;
}
</style>
