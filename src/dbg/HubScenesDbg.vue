<template>
  <div class="scenes-dbg">
    <div class="scene-row">
      <div class="scene-frame scene-frame--learn">
        <div class="scene-label">LearnScene — co-use (S + s)</div>
        <LearnScene letter="S" />
      </div>
      <div class="scene-frame scene-frame--practice">
        <div class="scene-label">PracticeScene — independent (s + S faded)</div>
        <PracticeScene letter="S" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LearnScene from '../components/hub/LearnScene.vue';
import PracticeScene from '../components/hub/PracticeScene.vue';
</script>

<style scoped>
.scenes-dbg {
  padding: 32px 24px;
}

.scene-row {
  display: flex;
  gap: 32px;
  justify-content: center;
  flex-wrap: wrap;
}

.scene-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 16px;
  padding: 24px;
  width: 220px;
  min-height: 200px;
}

.scene-frame--learn {
  background: linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%);
}

.scene-frame--practice {
  background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%);
}

.scene-label {
  font-size: 0.72rem;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 8px;
  text-align: center;
}
</style>
