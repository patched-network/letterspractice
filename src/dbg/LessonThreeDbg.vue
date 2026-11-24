<template>
  <div class="lesson3d-dbg">
    <div class="lesson3d-dbg__bar">
      <strong>🧊 Lessons — 3D rework</strong>
      <v-select
        v-model="lessonId"
        :items="lessonItems"
        item-title="title"
        item-value="value"
        label="Lesson"
        density="compact"
        hide-details
        class="lesson3d-dbg__env"
      />
      <v-btn-toggle v-model="renderer" density="compact" mandatory variant="outlined">
        <v-btn value="3d" size="small">3D</v-btn>
        <v-btn value="svg" size="small">SVG (current)</v-btn>
      </v-btn-toggle>
      <v-select
        v-if="renderer === '3d'"
        v-model="gait"
        :items="gaitItems"
        label="Walk gait"
        density="compact"
        hide-details
        class="lesson3d-dbg__gait"
      />
      <v-select
        v-if="renderer === '3d'"
        v-model="outline"
        :items="outlineItems"
        label="Outline"
        density="compact"
        hide-details
        class="lesson3d-dbg__gait"
      />
      <div v-if="renderer === '3d'" class="lesson3d-dbg__width">
        <span>Outline width <b>{{ outlineWidth }}</b></span>
        <v-slider v-model="outlineWidth" :min="0.5" :max="5" :step="0.25" density="compact" hide-details />
      </div>
      <v-select
        v-if="renderer === '3d'"
        v-model="environment"
        :items="environmentItems"
        item-title="title"
        item-value="value"
        label="Environment (live)"
        density="compact"
        hide-details
        class="lesson3d-dbg__env"
      />
      <v-switch
        v-if="renderer === '3d'"
        v-model="trackPointer"
        label="Eyes follow pointer"
        density="compact"
        hide-details
        color="primary"
      />
      <v-switch
        v-if="renderer === '3d'"
        v-model="freeCamera"
        label="Free camera (drag · right-drag pans · wheel)"
        density="compact"
        hide-details
        color="primary"
      />
      <v-switch
        v-if="renderer === '3d'"
        v-model="stageGrid"
        label="Stage grid (world x, z)"
        density="compact"
        hide-details
        color="primary"
      />
      <!-- RETIRE(overhead-audio-button): this toggle. Live; remembered per browser. -->
      <v-btn-toggle v-model="soundCueStyle" density="compact" mandatory variant="outlined">
        <v-btn value="button" size="small">Overhead button</v-btn>
        <v-btn value="rail" size="small">Sound rail</v-btn>
      </v-btn-toggle>
      <v-btn size="small" variant="tonal" @click="restart">Restart</v-btn>
      <span class="lesson3d-dbg__hint">Space / the advance key to step · {{ lastEvent }}</span>
    </div>

    <div class="lesson3d-dbg__main">
      <div class="lesson3d-dbg__content">
        <div v-if="!currentComponent" class="lesson3d-dbg__none">No SVG version (3D only).</div>
        <component
          :is="currentComponent"
          v-else
          :key="lessonKey"
          v-bind="renderer === '3d' ? {
            gait: gait === 'default' ? undefined : gait,
            outline,
            outlineWidth,
            trackPointer,
            freeCamera,
            stageGrid,
            environment: environment === 'default' ? undefined : environment,
          } : {}"
          @lesson-complete="lastEvent = 'lesson-complete'"
          @practice-now="lastEvent = 'practice-now'; restart()"
          @back-to-menu="lastEvent = 'back-to-menu'; restart()"
        />
      </div>

      <!-- Keyboard: same wiring as /dbg/lesson, so the stage gets the app's size -->
      <div class="lesson3d-dbg__keyboard">
        <ProgressiveKeyboard
          ref="keyboardRef"
          :letters="keyboardLetters"
          :enabled-letters="keyboardEnabledLetters"
          :key-colors="keyboardColors"
          :space-text="keyboardContext.advanceText.value"
          :show-full-layout="keyboardContext.showFullLayout.value"
          :play-phoneme-on-press="false"
          :capture-keyboard="true"
          :lowercase-keycaps="true"
          :disabled="keyboardContext.disabled.value"
          @keypress="keyboardContext.dispatchKeyPress($event)"
          @keyrelease="keyboardContext.dispatchKeyRelease($event)"
          @keytap="keyboardContext.dispatchKeyTap($event)"
          @kbd-space="keyboardContext.dispatchAdvance()"
          @kbd-enter="keyboardContext.dispatchEnter()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * /dbg/lesson/three — HelloWorld on the three.js stage, with a toggle to the
 * current SVG lesson for side-by-side comparison. Both run the same step
 * script (lessons/helloWorldSteps.ts) through the same runner and shell.
 */
import { computed, ref, watch } from 'vue';
import HelloWorldLesson from '../lessons/01.HelloWorldLesson.vue';
import DigraphLesson from '../lessons/02.DigraphLesson.vue';
import SplitDigraphLesson from '../lessons/03.SplitDigraphLesson.vue';
import FinalOpenVowelsLesson from '../lessons/04.FinalOpenVowelsLesson.vue';
import HelloWorldLesson3D from '../lessons/three/HelloWorldLesson3D.vue';
import DigraphLesson3D from '../lessons/three/DigraphLesson3D.vue';
import SplitDigraphLesson3D from '../lessons/three/SplitDigraphLesson3D.vue';
import FinalOpenVowelsLesson3D from '../lessons/three/FinalOpenVowelsLesson3D.vue';
import SightWordsLesson3D from '../lessons/three/SightWordsLesson3D.vue';
import BedLesson3D from '../lessons/three/BedLesson3D.vue';
import { soundCueStyle } from '../lessons/soundRail';
import type { Gait } from '../letterpeople/three/locomotion';
import type { OutlineStyle } from '../letterpeople/three/letterMesh';
import { ENVIRONMENTS, type EnvironmentName } from '../letterpeople/three/environments';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import {
  createKeyboardContext,
  provideKeyboardContext,
} from '../composables/useKeyboardContext';

const LESSONS = {
  'hello-world': { title: '01 · Hello World', svg: HelloWorldLesson, three: HelloWorldLesson3D },
  // WIP, 3D only, not in the curriculum yet: the b/d bed mnemonic (bedSteps.ts)
  bed: { title: '1a · Making our bed (b/d)', svg: null, three: BedLesson3D },
  digraph: { title: '02 · Digraphs (sh)', svg: DigraphLesson, three: DigraphLesson3D },
  'split-digraph': { title: '03 · Split digraphs (magic e)', svg: SplitDigraphLesson, three: SplitDigraphLesson3D },
  'final-open-vowels': {
    title: '04 · Final open vowels',
    svg: FinalOpenVowelsLesson,
    three: FinalOpenVowelsLesson3D,
  },
  // 3D only (THREE_D_ONLY in src/lessons/index.ts)
  'sight-words': {
    title: '05 · Sight words',
    svg: null,
    three: SightWordsLesson3D,
  },
} as const;
type LessonKey = keyof typeof LESSONS;
const lessonId = ref<LessonKey>('hello-world');
const lessonItems = (Object.keys(LESSONS) as LessonKey[]).map((value) => ({
  value,
  title: LESSONS[value].title,
}));

const renderer = ref<'3d' | 'svg'>('3d');
// 'default' passes no gait, so each lesson walks in its own preferred gait
const gait = ref<Gait | 'default'>('default');
const gaitItems = [{ value: 'default', title: 'Lesson default' }, 'waddle', 'hop'];
const outline = ref<OutlineStyle>('cookie');
const trackPointer = ref(true);
// Live (no restart): off snaps back to the lesson's framing
const freeCamera = ref(false);
// Live: a world-coordinate floor grid and a readout under each letter
const stageGrid = ref(false);
// 'default' passes no environment, so each lesson gets its own set
const environment = ref<EnvironmentName | 'default'>('default');
const environmentItems = [{ value: 'default', title: 'Lesson default' }, ...ENVIRONMENTS];
const outlineItems: OutlineStyle[] = ['none', 'cookie', 'hull', 'edges'];
// Starts at the 3D default; the outline is built into each letter, so changes restart
const outlineWidth = ref(1);
const lessonKey = ref(1);
const lastEvent = ref('');

const currentComponent = computed(() =>
  renderer.value === '3d' ? LESSONS[lessonId.value].three : LESSONS[lessonId.value].svg,
);

function restart() {
  lessonKey.value++;
}
watch([lessonId, renderer, gait, outline, outlineWidth, trackPointer], restart);

// --- keyboard context (as /dbg/lesson) ---
const keyboardContext = createKeyboardContext();
provideKeyboardContext(keyboardContext);
const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);
watch(keyboardRef, (k) => {
  if (k) keyboardContext.connectKeyboard(k);
});

const keyboardLetters = computed(() => {
  const active = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.activeLetters.value]
    : [];
  if (!active.includes('enter')) active.push('enter');
  if (keyboardContext.showAdvance.value && !active.includes('space')) active.push('space');
  return active;
});
const keyboardEnabledLetters = computed(() => {
  const enabled = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.enabledLetters.value]
    : [];
  if (keyboardContext.showAdvance.value && !enabled.includes('space')) enabled.push('space');
  return enabled;
});
const keyboardColors = computed(() => {
  const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
  if (keyboardContext.advanceColor.value) colors['space'] = keyboardContext.advanceColor.value;
  return colors;
});
</script>

<style scoped>
.lesson3d-dbg {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f8f9fa;
}
.lesson3d-dbg__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  flex-wrap: wrap;
}
.lesson3d-dbg__gait {
  max-width: 140px;
}
.lesson3d-dbg__width {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  font-size: 12px;
}
.lesson3d-dbg__env {
  max-width: 220px;
}
.lesson3d-dbg__none {
  margin: auto;
  color: #777;
}
.lesson3d-dbg__hint {
  font-size: 12px;
  color: #777;
}
.lesson3d-dbg__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lesson3d-dbg__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  position: relative;
}
.lesson3d-dbg__keyboard {
  flex-shrink: 0;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 8px 16px 16px;
  display: flex;
  justify-content: center;
}
</style>
