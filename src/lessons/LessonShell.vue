<template>
  <div class="lesson-shell">
    <div class="lesson__stage-area">
      <!-- The sound cue: the overhead button, or the rail under the letters (soundRail.ts).
           RETIRE(overhead-audio-button): the <button> branch and .lesson__audio-btn* below. -->
      <Transition name="audio-btn">
        <SoundRail
          v-if="rail && runner.audioButtonShown.value"
          v-bind="rail"
          interactive
          @puck-down="runner.railPuck.down"
          @puck-move="runner.railPuck.move"
          @puck-up="runner.railPuck.up"
          @puck-cancel="runner.railPuck.cancel"
        />
        <button
          v-else-if="soundCueStyle === 'button' && runner.audioButtonShown.value && runner.audioButtonReady.value"
          class="lesson__audio-btn"
          :class="{ 'lesson__audio-btn--playing': runner.isPlayingAudio.value }"
          :style="runner.audioButtonStyle.value"
          :disabled="runner.isPlayingAudio.value || !runner.hasAudioButton.value"
          @click="runner.handleAdvance"
        >
          <v-icon size="22">mdi-volume-high</v-icon>
        </button>
      </Transition>

      <!-- Touch-replay hint: a ghost finger sweeping the word (runner-driven) -->
      <div
        v-if="runner.touchHint.value.visible"
        class="lesson__touch-hint"
        :class="{ 'lesson__touch-hint--pressed': runner.touchHint.value.pressed }"
        :style="{
          left: `${runner.touchHint.value.x}px`,
          top: `${runner.touchHint.value.y}px`,
          opacity: runner.touchHint.value.opacity,
        }"
        aria-hidden="true"
      >
        <v-icon size="52">mdi-hand-pointing-up</v-icon>
      </div>

      <div
        :ref="setStageEl"
        class="lesson__stage"
        :class="{ 'lesson__stage--hidden': runner.isComplete.value }"
      ></div>
    </div>

    <Transition name="complete-fade">
      <LessonCompletePane
        v-if="runner.isComplete.value"
        @practice-now="$emit('practice-now')"
        @back-to-menu="$emit('back-to-menu')"
      />
    </Transition>

    <audio :ref="setAudioEl" />
  </div>
</template>

<script setup lang="ts">
/**
 * LessonShell — shared chrome for step-driven lessons.
 *
 * Renders the stage area, the sound cue (audio overlay button or sound rail),
 * and completion pane.
 * Binds the stage and audio element refs back into the runner.
 *
 * The lesson component owns stage population (via Stage / Actors) and
 * choreography. This shell is purely presentational.
 */
import { computed } from 'vue';
import LessonCompletePane from './LessonCompletePane.vue';
import SoundRail from './SoundRail.vue';
import { soundCueStyle } from './soundRail';
import type { LessonRunner } from './useLessonRunner';

const props = defineProps<{
  runner: LessonRunner<string>;
}>();

defineEmits<{
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

const rail = computed(() => props.runner.soundRail.value);

function setStageEl(el: unknown): void {
  props.runner.stageContainerRef.value = (el as HTMLElement | null) ?? null;
}
function setAudioEl(el: unknown): void {
  props.runner.audioElement.value = (el as HTMLAudioElement | null) ?? null;
}
</script>

<style scoped>
.lesson-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.lesson__stage-area {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
}

.lesson__stage {
  width: 100%;
  height: 100%;
  background: #FFFEF7;
  transition: opacity 0.35s ease-out;
}
.lesson__stage--hidden {
  opacity: 0;
  pointer-events: none;
}

/* Fingertip at (left, top): the icon's fingertip sits ~42% across, ~6% down */
.lesson__touch-hint {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.92);
  filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.75)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3));
  transform: translate(-42%, -6%);
  transition: transform 0.12s ease-out;
}
.lesson__touch-hint--pressed {
  transform: translate(-42%, -6%) translateY(3px) scale(0.92);
}

/* RETIRE(overhead-audio-button): every .lesson__audio-btn rule (keep the
   audio-btn-* transition classes: the rail enters and leaves with them) */
.lesson__audio-btn {
  position: absolute;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.25);
  transition: opacity 0.3s ease, filter 0.1s ease-out, transform 0.1s ease-out, box-shadow 0.1s ease-out;
  z-index: 5;
  overflow: hidden;
}

.lesson__audio-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.lesson__audio-btn:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.25);
  filter: brightness(0.9);
}

.lesson__audio-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.lesson__audio-btn--playing {
  animation: lesson-btn-pulse 1s infinite;
}

.audio-btn-enter-active {
  transition: opacity 0.22s ease-out, transform 0.22s ease-out;
}
.audio-btn-leave-active {
  transition: opacity 0.45s ease-in, transform 0.45s ease-in;
}
.audio-btn-enter-from,
.audio-btn-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

@keyframes lesson-btn-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.lesson__stage :deep(.lesson-actor--active) {
  animation: lesson-actor-pulse 0.9s ease-in-out infinite;
  filter: drop-shadow(0 0 8px rgba(33, 150, 243, 0.55));
}

@keyframes lesson-actor-pulse {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(33, 150, 243, 0.4)); }
  50% { filter: drop-shadow(0 0 14px rgba(33, 150, 243, 0.8)); }
}

.complete-fade-enter-active {
  transition: opacity 0.45s ease-out, transform 0.45s ease-out;
}
.complete-fade-leave-active {
  transition: opacity 0.25s ease-in, transform 0.25s ease-in;
}
.complete-fade-enter-from {
  opacity: 0;
  transform: scale(0.97);
}
.complete-fade-leave-to {
  opacity: 0;
  transform: scale(1.02);
}

@media (max-width: 500px) {
  .lesson__audio-btn {
    height: 42px;
    border-radius: 10px;
  }
}
</style>
