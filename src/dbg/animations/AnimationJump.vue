<template>
  <v-card>
    <v-card-title>Jump Animation</v-card-title>
    <v-card-text>
      <div class="animation-container mb-4">
        <WordDisplay
          ref="wordRef"
          text="Jump!"
          :height="150"
          :options="wordOptions"
          @word-created="onWordCreated"
        />
      </div>

      <div class="d-flex flex-wrap gap-2 mb-4">
        <v-btn
          color="primary"
          @click="playJump"
          :disabled="!wordInstance || isAnimating"
        >
          Jump
        </v-btn>
        <v-btn
          color="secondary"
          @click="playHop"
          :disabled="!wordInstance || isAnimating"
        >
          Hop
        </v-btn>
        <v-btn
          color="accent"
          @click="playBouncyJump"
          :disabled="!wordInstance || isAnimating"
        >
          Bouncy Jump
        </v-btn>
        <v-btn
          color="warning"
          @click="playMultipleJumps"
          :disabled="!wordInstance || isAnimating"
        >
          Triple Jump
        </v-btn>
      </div>

      <v-divider class="my-4" />

      <h4 class="text-subtitle-1 mb-2">Gravity Style</h4>
      <v-radio-group v-model="gravityStyle" inline class="mb-4">
        <v-radio label="Realistic" value="realistic" />
        <v-radio label="Princess Peach" value="princess-peach" />
      </v-radio-group>

      <v-divider class="my-4" />

      <h4 class="text-subtitle-1 mb-2">Custom Jump Parameters</h4>
      <v-row>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customHeight"
            label="Height"
            :min="20"
            :max="100"
            :step="5"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customDuration"
            label="Duration (ms)"
            :min="300"
            :max="1200"
            :step="50"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customSquash"
            label="Squash %"
            :min="50"
            :max="95"
            :step="5"
            thumb-label
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-slider
            v-model="customStretch"
            label="Stretch %"
            :min="105"
            :max="150"
            :step="5"
            thumb-label
          />
        </v-col>
      </v-row>
      <v-btn
        color="primary"
        variant="outlined"
        @click="playCustomJump"
        :disabled="!wordInstance || isAnimating"
      >
        Play Custom Jump
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, shallowRef } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../../letterpeople/Word";
import {
  createJumpTransform,
  createHopTransform,
  createBouncyJumpTransform,
  type GravityStyle,
} from "../../letterpeople/transforms/locomotion";

// Refs
const wordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const wordInstance = shallowRef<Word | null>(null);
const isAnimating = ref(false);

// Gravity style
const gravityStyle = ref<GravityStyle>('realistic');

// Custom parameters
const customHeight = ref(50);
const customDuration = ref(700);
const customSquash = ref(70);
const customStretch = ref(125);

// Word display options
const wordOptions: WordOptions = {
  spacing: 12,
  letterOptions: {
    color: "#2196F3",
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
  console.log("[AnimationJump] Word instance created:", word);
};

// Animation functions
const playJump = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const jump = createJumpTransform({ gravityStyle: gravityStyle.value });
  jump(wordInstance.value);

  // Wait for animation to complete
  setTimeout(() => {
    isAnimating.value = false;
  }, 800);
};

const playHop = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const hop = createHopTransform();
  hop(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, 500);
};

const playBouncyJump = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const bouncy = createBouncyJumpTransform();
  bouncy(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, 900);
};

const playMultipleJumps = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const multiJump = createJumpTransform({
    height: 40,
    duration: 500,
    count: 3,
    gravityStyle: gravityStyle.value,
  });
  multiJump(wordInstance.value);

  // 3 jumps * 500ms + pauses
  setTimeout(() => {
    isAnimating.value = false;
  }, 1800);
};

const playCustomJump = async () => {
  if (!wordInstance.value || isAnimating.value) return;
  isAnimating.value = true;

  const custom = createJumpTransform({
    height: customHeight.value,
    duration: customDuration.value,
    squashFactor: customSquash.value / 100,
    stretchFactor: customStretch.value / 100,
    gravityStyle: gravityStyle.value,
  });
  custom(wordInstance.value);

  setTimeout(() => {
    isAnimating.value = false;
  }, customDuration.value + 100);
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

.gap-2 {
  gap: 0.5rem;
}
</style>
