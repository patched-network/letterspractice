<!--
  Lesson3DUnavailable.vue — stands in for a 3D-only lesson (one with no SVG
  version; see THREE_D_ONLY in ./index.ts) when 3D can't run here: no WebGL 2,
  software rendering, or a stage that failed. The lesson counts as passed on
  mount, so what it gates isn't locked away; practice carries on from there.
-->
<template>
  <div class="lesson-3d-unavailable">
    <p class="lesson-3d-unavailable__note text-body-1 text-medium-emphasis">
      This lesson needs 3D graphics, which this device can't show, so we've
      skipped it and marked it done. Practice carries on as usual.
    </p>
    <LessonCompletePane @practice-now="emit('practice-now')" @back-to-menu="emit('back-to-menu')" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import LessonCompletePane from './LessonCompletePane.vue';

const emit = defineEmits<{
  (e: 'lesson-complete'): void;
  (e: 'practice-now'): void;
  (e: 'back-to-menu'): void;
}>();

onMounted(() => emit('lesson-complete'));
</script>

<style scoped>
.lesson-3d-unavailable {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px 16px;
}

.lesson-3d-unavailable__note {
  max-width: 480px;
  text-align: center;
  margin: 0;
}
</style>
