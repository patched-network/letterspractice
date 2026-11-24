<template>
  <v-container fluid class="styles-dbg">
    <div class="styles-dbg__head">
      <h2 class="text-h5">🎨 Word picture styles</h2>
      <router-link to="/dbg/word-pictures" class="text-body-2">← Word pictures</router-link>
      <span class="text-body-2 text-medium-emphasis">
        One subject per row, one style per column. Builders: <code>letterpeople/three/pictures/styles.ts</code>.
      </span>
    </div>
    <div class="styles-dbg__bar">
      <v-switch v-model="motion" label="Motion" density="compact" hide-details color="primary" />
      <v-switch v-model="freeCamera" label="Free camera" density="compact" hide-details color="primary" />
      <v-select
        v-model="solo"
        :items="soloItems"
        label="Show"
        density="compact"
        hide-details
        class="styles-dbg__select"
      />
    </div>
    <div class="styles-dbg__panel">
      <div ref="host" class="styles-dbg__stage" />
      <div class="styles-dbg__labels">
        <span
          v-for="l in labels"
          :key="l.text"
          class="styles-dbg__label"
          :style="{ left: `${l.x}px`, top: `${l.y}px` }"
          >{{ l.text }}</span
        >
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
/**
 * /dbg/word-pictures/styles: the pig and the car in each picture style
 * (letterpeople/three/pictures/styles.ts), side by side on one stage, with
 * their motion loops. Lazy route (three.js).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { Stage3D } from "../../letterpeople/three/stage3d";
import {
  PICTURE_STYLES,
  buildStyled,
  type PictureStyle,
  type StyleSubject,
  type StyledPicture,
} from "../../letterpeople/three/pictures/styles";

const SUBJECTS: StyleSubject[] = ["pig", "car"];
const PITCH = 170;
const FIT = 120;

interface Cell {
  style: PictureStyle;
  subject: StyleSubject;
  styled: StyledPicture;
  cell: THREE.Group;
  pivot: THREE.Group;
}

const host = ref<HTMLElement | null>(null);
const motion = ref(true);
const freeCamera = ref(false);
const solo = ref<PictureStyle | "all">("all");
const soloItems = [{ title: "All styles", value: "all" }, ...PICTURE_STYLES.map((s) => ({ title: s.label, value: s.id }))];
const labels = ref<{ text: string; x: number; y: number }[]>([]);

const visibleStyles = computed(() => PICTURE_STYLES.filter((s) => solo.value === "all" || s.id === solo.value));

let stage: Stage3D | null = null;
let resizeObs: ResizeObserver | null = null;
let stopTicker: (() => void) | null = null;
const cells: Cell[] = [];

function build() {
  if (!stage) return;
  for (const { id: style } of PICTURE_STYLES) {
    for (const subject of SUBJECTS) {
      const styled = buildStyled(subject, style);
      // cell (grid spot) → fit (scale; bottom at the cell's foot) → pivot (motion; origin at the
      // picture's bottom centre) → holder (puts the picture's bottom centre on the origin)
      const box = new THREE.Box3().setFromObject(styled.object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      holder.position.set(-center.x, -box.min.y, -center.z);
      holder.add(styled.object);
      const pivot = new THREE.Group();
      pivot.add(holder);
      const fit = new THREE.Group();
      const k = FIT / Math.max(size.x, size.y);
      fit.scale.setScalar(k);
      fit.position.y = -(size.y * k) / 2;
      fit.add(pivot);
      const cell = new THREE.Group();
      cell.add(fit);
      stage.scene.add(cell);
      cells.push({ style, subject, styled, cell, pivot });
    }
  }
}

function layout() {
  if (!stage) return;
  const cols = visibleStyles.value.map((s) => s.id);
  const rows = SUBJECTS.length;
  for (const c of cells) {
    const col = cols.indexOf(c.style);
    c.cell.visible = col >= 0;
    if (col < 0) continue;
    const row = SUBJECTS.indexOf(c.subject);
    c.cell.position.set((col - (cols.length - 1) / 2) * PITCH, (rows - 1 - row) * PITCH + PITCH / 2, 0);
  }
  stage.frame((cols.length * PITCH) / 2, { top: rows * PITCH + 30, heightFactor: 2.1, lookFactor: 0.5, elevation: 0.12 });
  placeLabels(cols);
}

function placeLabels(cols: PictureStyle[] = visibleStyles.value.map((s) => s.id)) {
  if (!stage || !host.value) return;
  const w = host.value.clientWidth;
  const h = host.value.clientHeight;
  const v = new THREE.Vector3();
  labels.value = cols.map((id, col) => {
    v.set((col - (cols.length - 1) / 2) * PITCH, SUBJECTS.length * PITCH + 14, 0).project(stage!.camera);
    return { text: PICTURE_STYLES.find((s) => s.id === id)!.label, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  });
}

function setMotion(on: boolean) {
  stopTicker?.();
  stopTicker = null;
  if (!stage) return;
  if (on) {
    stopTicker = stage.addTicker((t) => {
      for (const c of cells) if (c.cell.visible) c.styled.motion(t, c.pivot);
    });
  } else {
    for (const c of cells) c.styled.rest(c.pivot);
    stage.invalidate();
  }
}

onMounted(() => {
  stage = new Stage3D(host.value!, { transparent: true });
  build();
  layout();
  setMotion(motion.value);
  resizeObs = new ResizeObserver(() => layout());
  resizeObs.observe(host.value!);
});

watch(motion, setMotion);
watch(solo, () => layout());
watch(freeCamera, (on) => {
  stage?.setFreeCamera(on);
  if (!on) placeLabels();
});

onBeforeUnmount(() => {
  stopTicker?.();
  resizeObs?.disconnect();
  for (const c of cells) {
    c.styled.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
    });
  }
  stage?.destroy();
  stage = null;
});
</script>

<style scoped>
.styles-dbg {
  background: #fffef7;
  min-height: 100vh;
}
.styles-dbg__head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.styles-dbg__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.styles-dbg__select {
  max-width: 220px;
}
.styles-dbg__panel {
  position: relative;
  height: 72vh;
  min-height: 380px;
  border: 1px solid #eee7d6;
  border-radius: 8px;
}
/* Sized, not positioned: Stage3D sets position: relative on its container */
.styles-dbg__stage {
  width: 100%;
  height: 100%;
}
.styles-dbg__labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.styles-dbg__label {
  position: absolute;
  transform: translate(-50%, -50%);
  font: 600 13px/1 system-ui, sans-serif;
  color: #666;
  white-space: nowrap;
}
</style>
