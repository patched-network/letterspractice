<template>
  <v-container class="family3d-dbg">
    <div class="family3d-dbg__bar">
      <strong>🧊 Family portrait — 3D port</strong>
      <v-btn size="small" @click="portrait3d?.wave()">Wave</v-btn>
      <v-btn size="small" @click="portrait3d?.sayCheese()">Say cheese</v-btn>
      <v-btn size="small" @click="portrait3d?.celebrateRandom()">Celebrate (random)</v-btn>
      <v-select
        v-model="outline"
        :items="outlineItems"
        label="Outline"
        density="compact"
        hide-details
        class="family3d-dbg__select"
      />
      <v-switch v-model="trackPointer" label="Eyes follow pointer" density="compact" hide-details color="primary" />
      <span class="family3d-dbg__hint">
        Click either portrait to celebrate. Waves also fire once when a portrait scrolls to mid-screen.
      </span>
    </div>

    <div class="family3d-dbg__row">
      <div class="family3d-dbg__col">
        <div class="family3d-dbg__label">SVG (landing page today)</div>
        <FamilyPortrait />
      </div>
      <div class="family3d-dbg__col">
        <div class="family3d-dbg__label">3D</div>
        <FamilyPortrait3D
          :key="`${trackPointer}|${outline}`"
          ref="portrait3d"
          :track-pointer="trackPointer"
          :outline="outline"
        />
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
/**
 * /dbg/family/three — the landing page's author-family portrait, SVG vs the
 * three.js port, stacked on the same background for comparison. Lazy route:
 * three.js stays out of the main bundle.
 */
import { ref } from 'vue';
import FamilyPortrait from '../components/landing/FamilyPortrait.vue';
import FamilyPortrait3D from '../components/landing/three/FamilyPortrait3D.vue';
import type { OutlineStyle } from '../letterpeople/three/letterMesh';

const portrait3d = ref<InstanceType<typeof FamilyPortrait3D> | null>(null);
const trackPointer = ref(true);
const outline = ref<OutlineStyle>('cookie');
const outlineItems: OutlineStyle[] = ['none', 'cookie', 'hull', 'edges'];
</script>

<style scoped>
.family3d-dbg {
  background: #fffef7;
  min-height: 100vh;
}
.family3d-dbg__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.family3d-dbg__select {
  max-width: 150px;
}
.family3d-dbg__hint {
  font-size: 12px;
  color: #777;
}
.family3d-dbg__row {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.family3d-dbg__label {
  font: 600 12px/1.2 system-ui, sans-serif;
  color: #666;
  margin-bottom: 6px;
}
</style>
