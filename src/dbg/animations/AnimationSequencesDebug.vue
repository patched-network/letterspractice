<!--
  AnimationSequencesDebug.vue - Debug view for testing letterpeople animation sequences

  Tests the new animation sequences:
  - headShakeNo
  - sayNo
  - celebrate (random-pool types + explicit-only phew)
  - characterize / decharacterize
  - startIdle
-->

<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h3 mb-4">Animation Sequences Debug</h1>
        <p class="text-body-1 mb-6">
          Testing high-level animation sequences for LetterPeople
        </p>
      </v-col>
    </v-row>

    <!-- Single Letter Test -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Single Letter Animations</v-card-title>
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

            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-3">Characterization</h4>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="primary"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCharacterize"
              >
                Characterize
              </v-btn>
              <v-btn
                color="secondary"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runDecharacterize"
              >
                De-characterize
              </v-btn>
              <v-btn
                :color="isIdling ? 'warning' : 'success'"
                size="small"
                :disabled="!singleLetterInstance"
                @click="toggleIdle"
              >
                {{ isIdling ? 'Stop Idle' : 'Start Idle' }}
              </v-btn>
            </div>

            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-3">Negative Feedback</h4>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="error"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runHeadShake"
              >
                Head Shake
              </v-btn>
              <v-btn
                color="error"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runSayNo"
              >
                Say No
              </v-btn>
            </div>

            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-3">Celebrations</h4>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="success"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('random')"
              >
                Random 🎲
              </v-btn>
              <v-btn
                color="success"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('jump')"
              >
                Jump 🦘
              </v-btn>
              <v-btn
                color="success"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('spin')"
              >
                Spin 🌀
              </v-btn>
              <v-btn
                color="success"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('victory')"
              >
                Victory 🏆
              </v-btn>
              <v-btn
                color="success"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('bounce')"
              >
                Bounce 🎾
              </v-btn>
              <v-btn
                v-for="c in newPoolCelebrations"
                :key="c.type"
                color="success"
                variant="outlined"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate(c.type)"
              >
                {{ c.label }}
              </v-btn>
            </div>

            <p class="text-caption text-medium-emphasis mb-2">
              Explicit-only — not in the random pool
            </p>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="teal"
                variant="tonal"
                size="small"
                :disabled="!singleLetterInstance || isAnimating"
                @click="runCelebrate('phew')"
              >
                Phew 😅
              </v-btn>
            </div>
            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-3">Speed Control</h4>
            <v-slider
              v-model="animationSpeed"
              label="Speed"
              :min="0.25"
              :max="2"
              :step="0.25"
              thumb-label
              class="mt-2"
            >
              <template #append>
                <span class="text-body-2">{{ animationSpeed }}x</span>
              </template>
            </v-slider>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Multiple Letters Test -->
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Word Animations</v-card-title>
          <v-card-text>
            <div class="animation-container mb-4">
              <WordDisplay
                ref="wordRef"
                text="Yes"
                :height="150"
                :options="wordOptions"
                @word-created="onWordCreated"
              />
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="primary"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="characterizeWord"
              >
                Characterize All
              </v-btn>
              <v-btn
                color="secondary"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="decharacterizeWord"
              >
                De-characterize All
              </v-btn>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="success"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="celebrateWord"
              >
                Celebrate All! 🎉
              </v-btn>
              <v-btn
                color="error"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="sayNoWord"
              >
                All Say No
              </v-btn>
            </div>

            <v-divider class="my-4" />

            <h4 class="text-subtitle-1 mb-3">Staggered Animations</h4>
            <div class="d-flex flex-wrap gap-2 mb-4">
              <v-btn
                color="primary"
                variant="outlined"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="staggeredCelebrate"
              >
                Wave Celebrate
              </v-btn>
              <v-btn
                color="error"
                variant="outlined"
                size="small"
                :disabled="!wordInstance || isAnimating"
                @click="staggeredShake"
              >
                Wave Shake
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Animation Log -->
        <v-card class="mt-4">
          <v-card-title>Animation Log</v-card-title>
          <v-card-text>
            <div class="log-container">
              <div v-if="animationLog.length === 0" class="text-grey">
                No animations logged yet
              </div>
              <div
                v-for="(entry, i) in animationLog"
                :key="i"
                class="log-entry"
              >
                <v-chip
                  :color="entry.type === 'start' ? 'primary' : 'success'"
                  size="x-small"
                  class="mr-2"
                >
                  {{ entry.type === 'start' ? '▶' : '✓' }}
                </v-chip>
                <span class="log-text">{{ entry.message }}</span>
                <span class="log-time">{{ entry.time }}</span>
              </div>
            </div>
            <v-btn
              variant="text"
              size="small"
              class="mt-2"
              @click="animationLog = []"
            >
              Clear Log
            </v-btn>
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
import {
  headShakeNo,
  sayNo,
  celebrate,
  characterize,
  decharacterize,
  startIdle,
  type CelebrateOptions,
  type CelebrationType,
} from "../../letterpeople/animations";

// ============================================================================
// State
// ============================================================================

const singleLetterRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const singleLetterInstance = shallowRef<Word | null>(null);
const wordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const wordInstance = shallowRef<Word | null>(null);

const isAnimating = ref(false);
const isIdling = ref(false);
const animationSpeed = ref(1);

let idleCleanup: (() => void) | null = null;

interface LogEntry {
  type: "start" | "end";
  message: string;
  time: string;
}
const animationLog = ref<LogEntry[]>([]);

const newPoolCelebrations: { type: CelebrationType; label: string }[] = [
  { type: "confetti", label: "Confetti 🎊" },
  { type: "somersault", label: "Somersault 🤸" },
  { type: "nod", label: "Nod 🙂" },
];

// ============================================================================
// Options
// ============================================================================

const singleLetterOptions: WordOptions = {
  spacing: 10,
  letterOptions: {
    color: "#FF6B6B",
    lineWidth: 24,
    borderWidth: 4,
    showEyes: true,
    showMouth: true,
    showArms: true,
    eyebrowsWithEyes: true,
  },
};

const wordOptions: WordOptions = {
  spacing: 12,
  letterOptions: {
    color: "#4CAF50",
    lineWidth: 20,
    borderWidth: 3,
    showEyes: false,
    showMouth: false,
    showArms: false,
    eyebrowsWithEyes: true,
  },
};

// ============================================================================
// Event Handlers
// ============================================================================

function onSingleLetterCreated(word: Word): void {
  singleLetterInstance.value = word;
  log("start", "Single letter created");
}

function onWordCreated(word: Word): void {
  wordInstance.value = word;
  log("start", "Word created");
}

// ============================================================================
// Logging
// ============================================================================

function log(type: "start" | "end", message: string): void {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
  animationLog.value.unshift({ type, message, time });
  if (animationLog.value.length > 20) {
    animationLog.value.pop();
  }
}

// ============================================================================
// Single Letter Animations
// ============================================================================

async function runCharacterize(): Promise<void> {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  isAnimating.value = true;
  log("start", "Characterizing...");

  await characterize(letter, {
    duration: 300,
    showEyes: true,
    showMouth: true,
    showBrows: true,
    startTracking: true,
  });

  log("end", "Characterize complete");
  isAnimating.value = false;
}

async function runDecharacterize(): Promise<void> {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  isAnimating.value = true;
  log("start", "De-characterizing...");

  await decharacterize(letter, { duration: 250 });

  log("end", "De-characterize complete");
  isAnimating.value = false;
}

function toggleIdle(): void {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  if (isIdling.value && idleCleanup) {
    idleCleanup();
    idleCleanup = null;
    isIdling.value = false;
    log("end", "Idle stopped");
  } else {
    log("start", "Starting idle...");
    idleCleanup = startIdle(letter, {
      intensity: 0.6,
      enableTracking: true,
    });
    isIdling.value = true;
  }
}

async function runHeadShake(): Promise<void> {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  isAnimating.value = true;
  log("start", "Head shake...");

  await headShakeNo(letter, {
    speed: animationSpeed.value,
    cycles: 3,
    angle: 12,
  });

  log("end", "Head shake complete");
  isAnimating.value = false;
}

async function runSayNo(): Promise<void> {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  isAnimating.value = true;
  log("start", "Say no...");

  await sayNo(letter, {
    speed: animationSpeed.value,
    speakCount: 2,
  });

  log("end", "Say no complete");
  isAnimating.value = false;
}

async function runCelebrate(
  type: CelebrateOptions["type"]
): Promise<void> {
  if (!singleLetterInstance.value) return;
  const letter = singleLetterInstance.value.getLetter(0);
  if (!letter) return;

  isAnimating.value = true;
  log("start", `Celebrate (${type})...`);

  await celebrate(letter, {
    speed: animationSpeed.value,
    type,
  });

  log("end", `Celebrate (${type}) complete`);
  isAnimating.value = false;
}

// ============================================================================
// Word Animations
// ============================================================================

async function characterizeWord(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "Characterizing word...");

  await Promise.all(
    wordInstance.value.letters.map((letter) =>
      characterize(letter, {
        duration: 300,
        showEyes: true,
        showMouth: true,
        showBrows: true,
      })
    )
  );

  log("end", "Word characterized");
  isAnimating.value = false;
}

async function decharacterizeWord(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "De-characterizing word...");

  await Promise.all(
    wordInstance.value.letters.map((letter) =>
      decharacterize(letter, { duration: 250 })
    )
  );

  log("end", "Word de-characterized");
  isAnimating.value = false;
}

async function celebrateWord(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "Word celebrating...");

  await Promise.all(
    wordInstance.value.letters.map((letter) =>
      celebrate(letter, { speed: animationSpeed.value, type: "random" })
    )
  );

  log("end", "Word celebration complete");
  isAnimating.value = false;
}

async function sayNoWord(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "Word saying no...");

  await Promise.all(
    wordInstance.value.letters.map((letter) =>
      sayNo(letter, { speed: animationSpeed.value })
    )
  );

  log("end", "Word said no");
  isAnimating.value = false;
}

async function staggeredCelebrate(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "Staggered celebrate...");

  for (const letter of wordInstance.value.letters) {
    await celebrate(letter, { speed: animationSpeed.value * 1.5, type: "jump" });
  }

  log("end", "Staggered celebrate complete");
  isAnimating.value = false;
}

async function staggeredShake(): Promise<void> {
  if (!wordInstance.value) return;

  isAnimating.value = true;
  log("start", "Staggered shake...");

  for (const letter of wordInstance.value.letters) {
    await headShakeNo(letter, { speed: animationSpeed.value * 1.5, cycles: 2 });
  }

  log("end", "Staggered shake complete");
  isAnimating.value = false;
}

// ============================================================================
// Cleanup
// ============================================================================

onUnmounted(() => {
  if (idleCleanup) {
    idleCleanup();
  }
});
</script>

<style scoped>
.animation-container {
  min-height: 220px;
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

.log-container {
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.875rem;
}

.log-entry {
  display: flex;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-text {
  flex: 1;
  font-family: monospace;
  font-size: 0.8rem;
}

.log-time {
  color: #999;
  font-size: 0.7rem;
  font-family: monospace;
}
</style>
