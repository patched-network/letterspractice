<template>
  <v-container fluid class="vignettes-page">
    <v-row class="vignettes-row" no-gutters>
      <!-- Controls Column -->
      <v-col cols="12" md="3" class="controls-col">
        <v-card class="controls-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">Vignette</v-card-title>
          <v-card-text class="controls-card-content">
            <v-select
              v-model="selectedVignetteName"
              :items="vignetteNames"
              label="Selected Vignette"
              density="compact"
              variant="outlined"
              hide-details
            ></v-select>
            <div v-if="selectedVignetteMetadata" class="text-caption mt-1 text-grey">
              {{ selectedVignetteMetadata.description }}
            </div>
          </v-card-text>
        </v-card>

        <v-card class="controls-card mb-2" variant="outlined">
          <v-card-title class="py-1 text-subtitle-2">Session (Stage)</v-card-title>
          <v-card-text class="controls-card-content">
            <div class="d-flex align-center mb-1">
              <span class="text-h6 font-weight-bold" style="min-width: 50px;">
                {{ stage }}
              </span>
              <span class="text-caption text-grey ml-1">/ {{ maxStage }}</span>
            </div>
            <div v-if="stageInfo" class="mb-1">
              <div class="text-caption font-weight-medium">{{ stageInfo.title }}</div>
              <div v-if="stageInfo.description" class="text-caption text-grey" style="line-height: 1.2;">
                {{ stageInfo.description }}
              </div>
            </div>
            <v-slider
              v-model="stage"
              min="0"
              :max="maxStage"
              step="1"
              hide-details
              color="primary"
              show-ticks="always"
              tick-size="4"
            ></v-slider>
            <v-btn
              block
              size="small"
              color="secondary"
              class="mt-2"
              @click="resetVignette"
            >
              <v-icon icon="mdi-replay" start size="small"></v-icon>
              Replay
            </v-btn>

            <div class="d-flex align-center mt-2">
              <span class="text-caption text-grey mr-1">Phase:</span>
              <v-chip size="x-small" :color="phaseColor" label>
                <v-icon :icon="phaseIcon" start size="x-small"></v-icon>
                {{ phaseLabel }}
              </v-chip>
              <span v-if="phase === 'idle'" class="text-caption text-grey ml-2">
                +{{ idleElapsed }}s
              </span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Vignette Display Column -->
      <v-col cols="12" md="9" class="d-flex align-center justify-center">
        <div class="vignette-container">
          <component
            v-if="selectedVignetteMetadata"
            :is="selectedVignetteMetadata.component"
            :key="vignetteKey"
            :stage="stage"
            auto-play
            @sequence-started="onSequenceStarted"
            @idle-started="onIdleStarted"
            @stage-info="onStageInfo"
          />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import JJugglingVignette, { VIGNETTE_INFO as J_INFO } from '../../practicing/JJugglingVignette.vue';
import FFlosingVignette, { VIGNETTE_INFO as F_INFO } from '../../practicing/FFlosingVignette.vue';
import type { VignetteMetadata } from '../../practicing/types';

const stage = ref(0);
const vignetteKey = ref(0);

// ── Phase tracking (intro → idle) ────────────────────────────────────────
// Vignettes emit `sequence-started` (intro begins) and `idle-started` (the
// scripted intro has ended, open-ended practice loop begins). Surfaced here
// so it's obvious when the scripted choreography hands off to the idle loop.
const phase = ref<'starting' | 'intro' | 'idle'>('starting');
const idleStartedAt = ref(0);
const idleElapsed = ref(0);
let idleTimer: ReturnType<typeof setInterval> | null = null;

// Per-stage metadata emitted by the vignette (title + optional one-line theme).
const stageInfo = ref<{ title: string; description?: string } | null>(null);
function onStageInfo(info: { title: string; description?: string }) {
  stageInfo.value = info;
}

function stopIdleTimer() {
  if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
}

function onSequenceStarted() {
  phase.value = 'intro';
  idleElapsed.value = 0;
  stopIdleTimer();
}

function onIdleStarted() {
  phase.value = 'idle';
  idleStartedAt.value = Date.now();
  idleElapsed.value = 0;
  stopIdleTimer();
  idleTimer = setInterval(() => {
    idleElapsed.value = Math.round((Date.now() - idleStartedAt.value) / 1000);
  }, 250);
}

const phaseLabel = computed(() =>
  phase.value === 'idle' ? 'Idle loop'
  : phase.value === 'intro' ? 'Scripted intro'
  : 'Starting…',
);
const phaseColor = computed(() =>
  phase.value === 'idle' ? 'success'
  : phase.value === 'intro' ? 'info'
  : 'grey',
);
const phaseIcon = computed(() =>
  phase.value === 'idle' ? 'mdi-autorenew'
  : phase.value === 'intro' ? 'mdi-script-text-play'
  : 'mdi-timer-sand',
);

onBeforeUnmount(stopIdleTimer);

const vignettes: VignetteMetadata[] = [
  { ...J_INFO, component: JJugglingVignette },
  { ...F_INFO, component: FFlosingVignette },
];

const selectedVignetteName = ref(vignettes[0].name);

const selectedVignetteMetadata = computed(() => {
  return vignettes.find(v => v.name === selectedVignetteName.value) || null;
});

const maxStage = computed(() => {
  return selectedVignetteMetadata.value?.maxStage || 0;
});

const vignetteNames = computed(() => vignettes.map(v => v.name));

// Reset stage if it exceeds new vignette's maxStage
watch(selectedVignetteMetadata, (newMeta) => {
  if (newMeta && stage.value > newMeta.maxStage) {
    stage.value = newMeta.maxStage;
  }
  resetVignette();
});

// Reset vignette when stage changes to re-run animation
watch(stage, () => {
  resetVignette();
});

function resetVignette() {
  phase.value = 'starting';
  idleElapsed.value = 0;
  stopIdleTimer();
  stageInfo.value = null;
  vignetteKey.value++;
}
</script>

<style scoped>
.vignettes-page {
  padding: 4px;
  height: 100vh;
}

.vignettes-row {
  height: 100%;
}

.controls-col {
  overflow-y: auto;
  max-height: 100vh;
  padding: 4px;
}

.controls-card {
  border-radius: 8px;
}

.controls-card-content {
  padding: 8px 12px !important;
}

.vignette-container {
  position: relative;
  width: 100%;
  /* Match VIGNETTE_FRAME (800×450): at max-width the scene renders at
     exactly 1:1 scale, making this the canonical authoring view. */
  max-width: 800px;
  aspect-ratio: 16/9;
  border: 2px dashed rgba(100, 149, 237, 0.3);
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(240, 248, 255, 0.4) 0%,
    rgba(220, 235, 250, 0.6) 100%
  );
}
</style>
