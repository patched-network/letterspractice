<template>
  <div class="pic-gallery">
    <div ref="host" class="pic-gallery__stage" @click="onClick" />
    <div v-if="labels" class="pic-gallery__labels">
      <span
        v-for="l in labelSpots"
        :key="l.word"
        class="pic-gallery__label"
        :class="{ 'pic-gallery__label--selected': l.word === selected }"
        :style="{ left: `${l.x}px`, top: `${l.y}px` }"
        >{{ l.word }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Every 3D word picture on one stage (one WebGL context), in a grid, each
 * scaled to the same size. Click a picture to select its word. Labels can be
 * hidden, to try naming the pictures cold.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { Stage3D } from "../../letterpeople/three/stage3d";
import { PICTURES_3D, disposePicture } from "../../letterpeople/three/pictures/index";
import { roundRect } from "../../letterpeople/three/pictures/kit";

const props = defineProps<{ selected: string; labels: boolean }>();
const emit = defineEmits<{ select: [word: string] }>();

/** Cell pitch and the size each picture is scaled to fit, world units. */
const PITCH = 150;
const FIT = 104;
const LABEL_DROP = PITCH * 0.44;

const host = ref<HTMLElement | null>(null);
const labelSpots = ref<{ word: string; x: number; y: number }[]>([]);

const words = Object.keys(PICTURES_3D);
let stage: Stage3D | null = null;
let resizeObs: ResizeObserver | null = null;
const cells = new Map<string, THREE.Group>();
const built: THREE.Object3D[] = [];
let highlight: THREE.Mesh | null = null;
let grid = { cols: 1, rows: 1 };

function build() {
  if (!stage) return;
  for (const word of words) {
    const pic = PICTURES_3D[word]();
    const box = new THREE.Box3().setFromObject(pic);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    pic.position.set(-center.x, -center.y, -center.z);
    const cell = new THREE.Group();
    const fit = new THREE.Group();
    fit.scale.setScalar(FIT / Math.max(size.x, size.y));
    fit.add(pic);
    cell.add(fit);
    stage.scene.add(cell);
    cells.set(word, cell);
    built.push(pic);
  }
  highlight = new THREE.Mesh(
    new THREE.ShapeGeometry(roundRect(0, 0, PITCH * 0.94, PITCH * 0.94, 14), 6),
    new THREE.MeshBasicMaterial({ color: "#e6ecfa" }),
  );
  highlight.position.z = -20;
  stage.scene.add(highlight);
}

/** Cell centre for grid position i (rows top to bottom; content spans y 0 … rows·PITCH). */
function cellCenter(i: number): [number, number] {
  const c = i % grid.cols;
  const r = Math.floor(i / grid.cols);
  return [(c - (grid.cols - 1) / 2) * PITCH, (grid.rows - 1 - r) * PITCH + PITCH / 2];
}

function layout() {
  if (!stage || !host.value) return;
  const aspect = host.value.clientWidth / Math.max(1, host.value.clientHeight);
  const cols = Math.max(1, Math.round(Math.sqrt(words.length * aspect)));
  grid = { cols, rows: Math.ceil(words.length / cols) };
  words.forEach((w, i) => {
    const [x, y] = cellCenter(i);
    cells.get(w)!.position.set(x, y, 0);
  });
  stage.frame((grid.cols * PITCH) / 2, {
    top: grid.rows * PITCH,
    heightFactor: 2,
    lookFactor: 0.5,
    elevation: 0,
  });
  placeHighlight();
  placeLabels();
}

function placeHighlight() {
  if (!highlight || !stage) return;
  const i = words.indexOf(props.selected);
  highlight.visible = i >= 0;
  if (i >= 0) {
    const [x, y] = cellCenter(i);
    highlight.position.set(x, y, -20);
  }
  stage.invalidate();
}

function placeLabels() {
  if (!stage || !host.value) return;
  const w = host.value.clientWidth;
  const h = host.value.clientHeight;
  const v = new THREE.Vector3();
  labelSpots.value = words.map((word, i) => {
    const [x, y] = cellCenter(i);
    v.set(x, y - LABEL_DROP, 0).project(stage!.camera);
    return { word, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  });
}

function onClick(e: MouseEvent) {
  if (!stage) return;
  const ray = stage.rayFromClient(e.clientX, e.clientY);
  const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
  if (!hit) return;
  const c = Math.round(hit.x / PITCH + (grid.cols - 1) / 2);
  const r = grid.rows - 1 - Math.floor(hit.y / PITCH);
  if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return;
  const word = words[r * grid.cols + c];
  if (word) emit("select", word);
}

onMounted(() => {
  stage = new Stage3D(host.value!, { transparent: true });
  build();
  layout();
  // Created after the stage's own observer, so it runs after the stage has
  // resized its camera
  resizeObs = new ResizeObserver(() => layout());
  resizeObs.observe(host.value!);
});

watch(() => props.selected, placeHighlight);
watch(
  () => props.labels,
  (on) => on && placeLabels(),
);

onBeforeUnmount(() => {
  resizeObs?.disconnect();
  for (const pic of built) disposePicture(pic);
  if (highlight) disposePicture(highlight);
  stage?.destroy();
  stage = null;
});
</script>

<style scoped>
.pic-gallery {
  position: relative;
  width: 100%;
  height: 62vh;
  min-height: 360px;
  background: #fffef7;
  border-radius: 8px;
  border: 1px solid #eee7d6;
}
/* Sized, not positioned: Stage3D sets position: relative on its container */
.pic-gallery__stage {
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.pic-gallery__labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.pic-gallery__label {
  position: absolute;
  transform: translate(-50%, -50%);
  font: 600 12px/1 system-ui, sans-serif;
  color: #777;
}
.pic-gallery__label--selected {
  color: rgb(var(--v-theme-primary));
}
</style>
