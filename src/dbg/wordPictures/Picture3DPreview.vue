<template>
  <div class="pic3d">
    <div ref="host" class="pic3d__stage" />
    <div class="pic3d__bar">
      <v-switch v-model="turntable" label="Turntable" density="compact" hide-details color="primary" />
      <v-switch v-model="freeCamera" label="Free camera" density="compact" hide-details color="primary" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One 3D stage showing the selected word's picture (letterpeople/three/
 * pictures.ts), rebuilt on each change of word: one WebGL context however
 * many words are browsed.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { Stage3D } from "../../letterpeople/three/stage3d";
import { PICTURES_3D, disposePicture } from "../../letterpeople/three/pictures/index";

const props = defineProps<{ word: string }>();

const host = ref<HTMLElement | null>(null);
const turntable = ref(false);
const freeCamera = ref(false);

let stage: Stage3D | null = null;
let current: THREE.Object3D | null = null;
let pivot: THREE.Group | null = null;
let stopTurn: (() => void) | null = null;

function show(word: string) {
  if (!stage) return;
  if (pivot) {
    stage.scene.remove(pivot);
    if (current) disposePicture(current);
    pivot = current = null;
  }
  const build = PICTURES_3D[word];
  if (!build) return stage.invalidate();

  // Stand it on the floor, centred on x = 0, turning about its own middle
  current = build();
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  current.position.set(-center.x, -box.min.y, -center.z);
  pivot = new THREE.Group();
  pivot.add(current);
  stage.scene.add(pivot);
  stage.frame(Math.max(size.x / 2, size.y * 0.6), { top: size.y, heightFactor: 2.6, lookFactor: 0.5 });
  stage.invalidate();
}

function setTurntable(on: boolean) {
  stopTurn?.();
  stopTurn = null;
  if (pivot) pivot.rotation.y = 0;
  if (!on || !stage) return stage?.invalidate();
  stopTurn = stage.addTicker((t) => {
    if (pivot) pivot.rotation.y = t * 0.6;
  });
}

onMounted(() => {
  stage = new Stage3D(host.value!);
  show(props.word);
});

watch(
  () => props.word,
  (w) => {
    show(w);
    if (turntable.value) setTurntable(true);
  },
);
watch(turntable, setTurntable);
watch(freeCamera, (on) => stage?.setFreeCamera(on));

onBeforeUnmount(() => {
  stopTurn?.();
  if (current) disposePicture(current);
  stage?.destroy();
  stage = null;
});
</script>

<style scoped>
.pic3d__stage {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
}
.pic3d__bar {
  display: flex;
  gap: 16px;
}
</style>
