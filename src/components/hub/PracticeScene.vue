<template>
  <div class="practice-scene" ref="containerRef"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Stage } from '../../letterpeople/scene/Stage';
import { startPracticeScene, type PracticeSceneHandle } from '../../letterpeople/scene/presets/practiceScene';

const props = defineProps<{
  letter: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let sceneHandle: PracticeSceneHandle | null = null;

onMounted(() => {
  const el = containerRef.value;
  if (!el) return;

  const stage = new Stage(el, {
    horizonRatio: 0.15,
    referenceWidth: 100,
    referenceHeight: 100,
  });
  sceneHandle = startPracticeScene(stage, props.letter);
});

onBeforeUnmount(() => {
  sceneHandle?.cleanup();
  sceneHandle = null;
});
</script>

<style scoped>
.practice-scene {
  flex: 1;
  width: 100%;
  min-height: 120px;
  overflow: hidden;
}
</style>
