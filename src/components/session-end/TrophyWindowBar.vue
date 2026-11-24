<!--
  TrophyWindowBar.vue

  A thin bar along the top edge of the trophy-case keyboard that drains over
  the play window (composables/useTrophyCase.ts), so the end is visible coming
  rather than sudden. Pure CSS animation; `startedAt` changing restarts it.
  The parent must be positioned (the bar is absolutely placed at its top).
-->
<template>
  <div class="trophy-window-bar" :class="{ 'trophy-window-bar--done': done }">
    <div
      :key="startedAt"
      class="trophy-window-bar__fill"
      :style="{ animationDuration: `${durationMs}ms` }"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Window length (ms). */
  durationMs: number;
  /** Window start (epoch ms); a new value restarts the drain. */
  startedAt: number;
  /** Window over: the bar fades away. */
  done: boolean;
}>();
</script>

<style scoped>
.trophy-window-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  overflow: hidden;
  pointer-events: none;
  transition: opacity 1s ease;
}

.trophy-window-bar--done {
  opacity: 0;
}

.trophy-window-bar__fill {
  height: 100%;
  background: rgb(var(--v-theme-primary));
  opacity: 0.55;
  transform-origin: center;
  animation-name: trophy-window-drain;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes trophy-window-drain {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>
