<template>
  <div class="ses-debug">
    <h2>SessionEndScreen Debug</h2>

    <div class="controls">
      <div class="control-row">
        <span class="control-label">Scenario</span>
        <div class="btn-group">
          <button
            v-for="s in scenarios"
            :key="s.label"
            :class="['ctrl-btn', { active: activeLabel === s.label }]"
            @click="activeLabel = s.label"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">User tier</span>
        <div class="btn-group">
          <button
            v-for="t in tiers"
            :key="t"
            :class="['ctrl-btn', { active: userTier === t }]"
            @click="userTier = t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <!-- Free-tier progress. Both the CTA label and the empty-session copy
           branch on whether wordCount has reached the threshold, so the two
           presets below are the states worth checking. -->
      <div class="control-row">
        <span class="control-label">Purchase CTA</span>
        <div class="btn-group">
          <label class="inline-toggle">
            <input type="checkbox" v-model="showPurchaseCta" />
            show
          </label>
          <label class="inline-num">
            words
            <input type="number" min="0" v-model.number="wordCount" />
          </label>
          <button class="ctrl-btn" @click="wordCount = Math.round(wordThreshold * 0.8)">
            below ceiling
          </button>
          <button class="ctrl-btn" @click="wordCount = 1132">at ceiling</button>
          <span class="stage-readout">/ {{ wordThreshold }}</span>
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">Fridge sheet</span>
        <div class="btn-group">
          <button
            v-for="m in fridgeModes"
            :key="m"
            :class="['ctrl-btn', { active: fridgeSheetMode === m }]"
            @click="fridgeSheetMode = m"
          >
            {{ m }}
          </button>
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">Vignette stage</span>
        <div class="btn-group stage-group">
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            v-model.number="vignetteStage"
          />
          <span class="stage-readout">{{ vignetteStage }}</span>
        </div>
      </div>

      <div class="control-row">
        <span class="control-label">Viewport</span>
        <div class="btn-group">
          <button
            v-for="vp in viewports"
            :key="vp.label"
            :class="['ctrl-btn', { active: viewportWidth === vp.width }]"
            @click="viewportWidth = vp.width"
          >
            {{ vp.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="stage" :style="stageStyle">
      <SessionEndScreen
        :session-records="activeRecords"
        :vignette-stage="vignetteStage"
        :user-tier="userTier"
        :word-count="wordCount"
        :word-threshold="wordThreshold"
        :show-purchase-cta="showPurchaseCta"
        :fridge-sheet-mode="fridgeSheetMode"
        @go-home="onGoHome"
      />
    </div>

    <!-- Trophy case: the session-end keyboard (composables/useTrophyCase.ts),
         coloured by the scenario above. Keys play their sounds; digraphs
         play as two-key chords. -->
    <div class="control-row trophy-controls">
      <span class="control-label">Trophy window</span>
      <div class="btn-group">
        <button
          v-for="w in trophyWindows"
          :key="w.ms"
          :class="['ctrl-btn', { active: trophyWindowMs === w.ms }]"
          @click="trophyWindowMs = w.ms; restartTrophy()"
        >
          {{ w.label }}
        </button>
        <button class="ctrl-btn" @click="restartTrophy">restart</button>
        <span class="stage-readout">
          {{ trophyResting ? 'resting' : `${trophySecondsLeft}s left` }}
        </span>
      </div>
    </div>
    <div class="stage trophy-stage" :style="stageStyle">
      <TrophyWindowBar
        :duration-ms="trophyWindowMsActual"
        :started-at="trophyWindowStartedAt"
        :done="trophyResting"
      />
      <ProgressiveKeyboard
        :letters="trophyLetters"
        :enabled-letters="trophyEnabledLetters"
        :space-text="trophySpaceText"
        :disable-transition-ms="TROPHY_DIM_MS"
        :key-colors="trophyKeyColors"
        :highlighted-letters="trophyGlowLetters"
        :chord-definitions="trophyChordDefinitions"
        :show-full-layout="true"
        :play-phoneme-on-press="false"
        :play-phoneme-on-release="true"
        :lowercase-keycaps="true"
        :disabled="trophyResting"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import type { SessionRecordEntry } from '../composables/useSessionSummary';
import SessionEndScreen from '../components/session-end/SessionEndScreen.vue';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import { useTrophyCase, TROPHY_WINDOW_MS, TROPHY_DIM_MS } from '../composables/useTrophyCase';
import TrophyWindowBar from '../components/session-end/TrophyWindowBar.vue';
import { sessionScenarios as scenarios } from './sessionScenarios';
import { FREE_TIER_WORD_THRESHOLD } from '../services/curriculum';

type UserTier = 'funnel' | 'trial' | 'paid' | 'unknown';

const tiers: UserTier[] = ['funnel', 'trial', 'paid', 'unknown'];

type FridgeMode = 'auto' | 'none' | 'print' | 'colour';
const fridgeModes: FridgeMode[] = ['none', 'print', 'colour', 'auto'];
const fridgeSheetMode = ref<FridgeMode>('print');

const viewports = [
  { label: 'Mobile (560)', width: 560 },
  { label: 'Tablet (760)', width: 760 },
  { label: 'Desktop (960)', width: 960 },
  { label: 'Full', width: 0 },
];

const activeLabel = ref(scenarios[0].label);
const activeRecords = computed(
  () => scenarios.find((s) => s.label === activeLabel.value)!.records,
);

const userTier = ref<UserTier>('trial');
const showPurchaseCta = ref(true);
/**
 * Free-tier word progress, which replaced the trial's sessions/days countdown.
 * Drives the CTA wording and — on the "Nothing due" scenario — which of the
 * two empty-session messages renders.
 */
const wordThreshold = FREE_TIER_WORD_THRESHOLD;
const wordCount = ref(Math.round(FREE_TIER_WORD_THRESHOLD * 0.8));
const vignetteStage = ref(2);
const viewportWidth = ref(0);

const stageStyle = computed(() => {
  if (!viewportWidth.value) return { width: '100%' };
  return { width: `${viewportWidth.value}px` };
});

function onGoHome() {
  console.log('[SessionEndScreenDebug] go-home emitted');
}

// ---------------------------------------------------------------------------
// Trophy case
// ---------------------------------------------------------------------------

// useSessionSummary wants a writable Ref; mirror the scenario's records into one.
const trophyRecords = ref<SessionRecordEntry[]>([]);
watch(activeRecords, (r) => (trophyRecords.value = r), { immediate: true });

/** A mid-curriculum learner's unlocked set; the digraphs exercise chords. */
const trophyBaseLetters = ref([
  's', 'a', 't', 'p', 'i', 'n', 'm', 'd', 'g', 'o', 'c', 'k', 'e', 'u',
  'r', 'h', 'b', 'f', 'l', 'sh', 'ch', 'th',
]);
const {
  keyColors: trophyKeyColors,
  glowLetters: trophyGlowLetters,
  chordDefinitions: trophyChordDefinitions,
  resting: trophyResting,
  windowMs: trophyWindowMsActual,
  windowStartedAt: trophyWindowStartedAt,
  startWindow,
  letters: trophyLetters,
  enabledLetters: trophyEnabledLetters,
  spaceText: trophySpaceText,
} = useTrophyCase(trophyRecords, trophyBaseLetters);

const trophyWindows = [
  { label: 'real (45 s)', ms: TROPHY_WINDOW_MS },
  { label: 'quick (5 s)', ms: 5_000 },
];
const trophyWindowMs = ref(TROPHY_WINDOW_MS);
const trophyEndsAt = ref(0);
const now = ref(Date.now());
const trophySecondsLeft = computed(() => Math.max(0, Math.ceil((trophyEndsAt.value - now.value) / 1000)));
const clock = setInterval(() => (now.value = Date.now()), 250);
onBeforeUnmount(() => clearInterval(clock));

function restartTrophy() {
  trophyEndsAt.value = Date.now() + trophyWindowMs.value;
  startWindow(trophyWindowMs.value);
}
restartTrophy();
</script>

<style scoped>
.ses-debug {
  padding: 16px;
}

h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.5);
}

.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.control-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  min-width: 110px;
}

.btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.stage-group {
  gap: 10px;
}

.stage-group input[type='range'] {
  width: 180px;
}

.stage-readout {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.ctrl-btn {
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.7);
  transition: background 0.15s, color 0.15s;
}

.ctrl-btn:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.ctrl-btn.active {
  background: rgba(var(--v-theme-primary), 0.15);
  border-color: rgba(var(--v-theme-primary), 0.4);
  color: rgba(var(--v-theme-primary), 1);
  font-weight: 600;
}

.inline-toggle,
.inline-num {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.inline-num input {
  width: 64px;
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  color: inherit;
}

.trophy-controls {
  margin: 20px auto 8px;
}

.trophy-stage {
  position: relative;
  padding: 12px 0;
}

.stage {
  margin: 0 auto;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  transition: width 0.2s ease;
  overflow: hidden;
}
</style>
