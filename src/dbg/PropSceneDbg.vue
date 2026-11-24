<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12">
        <h2 class="text-h5 mb-2">Props & Scene Choreography</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Debug surface for prop decorators, actor+prop interaction, and scene presets.
        </p>
      </v-col>
    </v-row>

    <!-- Stage canvas -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Stage</span>
            <span class="text-body-2 text-medium-emphasis" v-if="currentLetter">
              Letter: {{ currentLetter.toUpperCase() }} / {{ currentLetter.toLowerCase() }}
            </span>
          </v-card-title>
          <v-card-text>
            <div
              ref="stageContainer"
              class="stage-canvas"
            ></div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Stage controls -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Stage Controls</v-card-title>
          <v-card-text>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn color="primary" size="small" @click="initStage" :disabled="!!stage">
                Init Stage
              </v-btn>
              <v-btn color="error" size="small" variant="outlined" @click="destroyStage" :disabled="!stage">
                Destroy
              </v-btn>
              <v-btn size="small" @click="randomizeLetter" :disabled="!stage">
                Randomize Letter
              </v-btn>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-3" v-if="stage">
              <v-btn size="small" variant="outlined" @click="toggleIdle('upper')"
                :color="idleActive.upper ? 'success' : undefined">
                {{ idleActive.upper ? 'Stop' : 'Start' }} Upper Idle
              </v-btn>
              <v-btn size="small" variant="outlined" @click="toggleIdle('lower')"
                :color="idleActive.lower ? 'success' : undefined">
                {{ idleActive.lower ? 'Stop' : 'Start' }} Lower Idle
              </v-btn>
            </div>

            <!-- Letter picker -->
            <div v-if="stage" class="mt-3">
              <div class="text-subtitle-2 mb-1">Pick Letter</div>
              <div class="letter-grid">
                <v-btn
                  v-for="l in alphabet"
                  :key="l"
                  size="x-small"
                  variant="outlined"
                  :color="l === currentLetter ? 'primary' : undefined"
                  @click="setLetter(l)"
                >{{ l }}</v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Actor Controls</v-card-title>
          <v-card-text v-if="stage">
            <!-- Upper -->
            <div class="text-subtitle-2 mb-1">Upper (guide)</div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn size="x-small" variant="outlined" @click="actorSay('upper', 'Hello!')">Say Hello</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSay('upper', 'Let\'s try this!')">Say Encourage</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSilence('upper')">Silence</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorLookAt('upper', 'lower')">Look at Lower</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorWave('upper')">Wave</v-btn>
            </div>

            <!-- Lower -->
            <div class="text-subtitle-2 mb-1">Lower (learner)</div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn size="x-small" variant="outlined" @click="actorSay('lower', 'OK!')">Say OK</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSay('lower', 'I did it!')">Say Success</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSilence('lower')">Silence</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorLookAt('lower', 'upper')">Look at Upper</v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorWave('lower')">Wave</v-btn>
            </div>
          </v-card-text>
          <v-card-text v-else>
            <span class="text-medium-emphasis">Init stage first</span>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Prop controls (stub) -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Staged Props</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis">
              Computer / tablet station. Mount, show anchors, trigger verbs.
            </p>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <v-btn size="small" @click="mountComputer" :disabled="!stage">Mount Computer</v-btn>
              <v-btn size="small" @click="triggerType" :disabled="!computerProp || !actors.lower">type(lower)</v-btn>
              <v-btn size="small" @click="triggerSharedGaze" :disabled="!computerProp || !actors.upper || !actors.lower">sharedGaze(upper, lower)</v-btn>
              <v-btn size="small" @click="toggleComputerAnchors" :disabled="!computerProp">Toggle Anchors</v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Held Props</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis">
              Book, knife. Attach to actor hand, trigger verbs.
            </p>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <v-btn size="small" @click="attachBook" :disabled="!stage || !actors.upper">Attach Book to Upper</v-btn>
              <v-btn size="small" @click="triggerRead" :disabled="!bookProp || !actors.upper">read(upper)</v-btn>
              <v-btn size="small" @click="triggerTurnPage" :disabled="!bookProp || !actors.upper">turnPage(upper)</v-btn>
              <v-btn size="small" @click="attachKitchen" :disabled="!stage || !actors.upper">Attach Knife to Upper</v-btn>
              <v-btn size="small" @click="triggerChop" :disabled="!kitchenProp || !actors.upper">chop(upper)</v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Scene preset controls (stub) -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>Scene Presets</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-2">
              Full learn/practice scene loops — choreography + idle + beat scheduling.
            </p>
            <div class="d-flex flex-wrap gap-2 mb-2">
              <v-btn size="small" color="success" @click="startLearn" :disabled="!!sceneCleanup">
                Start Learn Scene
              </v-btn>
              <v-btn size="small" color="warning" @click="startPracticeBook" :disabled="!!sceneCleanup">
                Practice (Book)
              </v-btn>
              <v-btn size="small" color="warning" @click="startPracticeKitchen" :disabled="!!sceneCleanup">
                Practice (Kitchen)
              </v-btn>
              <v-btn size="small" color="error" variant="outlined" @click="stopScene" :disabled="!sceneCleanup">
                Stop Scene
              </v-btn>
            </div>
            <p class="text-body-2 text-medium-emphasis" v-if="sceneCleanup">
              Scene running — beats fire every 3–8s. Hit Stop to tear down.
            </p>
            <p class="text-body-2 text-medium-emphasis" v-else>
              Launches a full scene: stage + actors + props + choreography loop.
              Uses the selected letter above (or picks random if no stage yet).
            </p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, shallowRef, onBeforeUnmount } from 'vue';
import { Stage, type Actor } from '../letterpeople/scene/Stage';
import { startIdle } from '../letterpeople/animations';
import { randomVibrancyColor } from '../letterpeople/util/color';
import { createComputerProp, type ComputerPropController } from '../letterpeople/props/computer';
import { createBookProp, type BookPropController } from '../letterpeople/props/book';
import { createKitchenProp, type KitchenPropController } from '../letterpeople/props/kitchen';
import { startLearnScene } from '../letterpeople/scene/presets/learnScene';
import { startPracticeScene } from '../letterpeople/scene/presets/practiceScene';

const stageContainer = ref<HTMLElement | null>(null);
const stage = shallowRef<Stage | null>(null);
const currentLetter = ref<string>('a');
const actors = shallowRef<{ upper: Actor | null; lower: Actor | null }>({ upper: null, lower: null });
const idleActive = ref<{ upper: boolean; lower: boolean }>({ upper: false, lower: false });
const idleCleanups: { upper: (() => void) | null; lower: (() => void) | null } = { upper: null, lower: null };

const computerProp = ref<ComputerPropController | null>(null);
const bookProp = ref<BookPropController | null>(null);
const kitchenProp = ref<KitchenPropController | null>(null);
let anchorElements: HTMLElement[] = [];

const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

function pickRandomLetter(): string {
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function initStage() {
  if (!stageContainer.value || stage.value) return;

  stage.value = new Stage(stageContainer.value, {
    backgroundColor: '#f5f5f0',
    horizonRatio: 0.15,
  });

  addActors(currentLetter.value);
}

function addActors(letter: string) {
  if (!stage.value) return;

  const upperColor = randomVibrancyColor();
  const lowerColor = randomVibrancyColor();

  const upper = stage.value.addActor('upper', letter.toUpperCase(), {
    x: 120,
    z: 60,
    height: 200,
    letterOptions: {
      color: upperColor,
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  const lower = stage.value.addActor('lower', letter.toLowerCase(), {
    x: 260,
    z: 80,
    height: 150,
    letterOptions: {
      color: lowerColor,
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  actors.value = { upper, lower };

  // Face each other
  if (upper && lower) {
    upper.lookAt(lower);
    lower.lookAt(upper);
    upper.instance.body.turnTo(15);
    lower.instance.body.turnTo(-15);
  }
}

function setLetter(letter: string) {
  currentLetter.value = letter;
  rebuildActors();
}

function randomizeLetter() {
  currentLetter.value = pickRandomLetter();
  rebuildActors();
}

function rebuildActors() {
  // Stop idles
  stopAllIdles();
  // Remove existing actors by destroying and recreating stage
  if (!stage.value || !stageContainer.value) return;
  stage.value.destroy();
  stage.value = new Stage(stageContainer.value, {
    backgroundColor: '#f5f5f0',
    horizonRatio: 0.15,
  });
  addActors(currentLetter.value);
}

function toggleIdle(which: 'upper' | 'lower') {
  const actor = actors.value[which];
  if (!actor) return;

  if (idleActive.value[which]) {
    idleCleanups[which]?.();
    idleCleanups[which] = null;
    idleActive.value[which] = false;
  } else {
    idleCleanups[which] = startIdle(actor.instance, {
      intensity: 0.3,
      enableTracking: true,
    });
    idleActive.value[which] = true;
  }
}

function stopAllIdles() {
  idleCleanups.upper?.();
  idleCleanups.lower?.();
  idleCleanups.upper = null;
  idleCleanups.lower = null;
  idleActive.value = { upper: false, lower: false };
}

function actorSay(which: 'upper' | 'lower', text: string) {
  actors.value[which]?.say(text, 3000);
}

function actorSilence(which: 'upper' | 'lower') {
  actors.value[which]?.silence();
}

function actorLookAt(from: 'upper' | 'lower', to: 'upper' | 'lower') {
  const source = actors.value[from];
  const target = actors.value[to];
  if (source && target) {
    source.lookAt(target);
  }
}

function actorWave(which: 'upper' | 'lower') {
  actors.value[which]?.instance.arms.wave({ duration: 600 });
}

function mountComputer() {
  if (!stage.value) return;
  if (computerProp.value) {
    computerProp.value.unmount();
  }
  computerProp.value = createComputerProp(stage.value, {
    kind: 'staged',
    x: 190,
    z: 70
  });
  computerProp.value.idle();
}

function triggerType() {
  if (!computerProp.value || !actors.value.lower) return;
  computerProp.value.type(actors.value.lower);
}

function triggerSharedGaze() {
  if (!computerProp.value || !actors.value.upper || !actors.value.lower) return;
  computerProp.value.sharedGaze(actors.value.upper, actors.value.lower);
}

function toggleComputerAnchors() {
  if (!computerProp.value || !stage.value) return;
  if (anchorElements.length > 0) {
    anchorElements.forEach(el => el.remove());
    anchorElements = [];
    return;
  }
  
  const anchors = ['screen', 'keyboardLeft', 'keyboardRight', 'keyboardCenter'] as const;
  anchors.forEach(a => {
    const pt = computerProp.value!.getStagePoint(a);
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = `${pt.x - 4}px`;
    el.style.top = `${pt.y - 4}px`;
    el.style.width = '8px';
    el.style.height = '8px';
    el.style.backgroundColor = 'red';
    el.style.borderRadius = '50%';
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    
    const label = document.createElement('div');
    label.innerText = a;
    label.style.position = 'absolute';
    label.style.left = '12px';
    label.style.top = '-4px';
    label.style.fontSize = '10px';
    label.style.color = 'red';
    label.style.whiteSpace = 'nowrap';
    el.appendChild(label);
    
    stage.value!.container.appendChild(el);
    anchorElements.push(el);
  });
}

function attachBook() {
  if (!stage.value || !actors.value.upper) return;
  if (bookProp.value) {
    bookProp.value.unmount();
  }
  bookProp.value = createBookProp(stage.value, {
    kind: 'held',
    actor: actors.value.upper,
    hand: 'left'
  });
}

function triggerRead() {
  if (!bookProp.value || !actors.value.upper) return;
  bookProp.value.read(actors.value.upper);
}

function triggerTurnPage() {
  if (!bookProp.value || !actors.value.upper) return;
  bookProp.value.turnPage(actors.value.upper);
}

function attachKitchen() {
  if (!stage.value || !actors.value.upper) return;
  if (kitchenProp.value) {
    kitchenProp.value.unmount();
  }
  kitchenProp.value = createKitchenProp(stage.value, {
    kind: 'held',
    actor: actors.value.upper,
    hand: 'right'
  });
}

function triggerChop() {
  if (!kitchenProp.value || !actors.value.upper) return;
  kitchenProp.value.chop(actors.value.upper);
}

// ─── Scene presets ─────────────────────────────────────────────
const sceneCleanup = ref<(() => void) | null>(null);

function stopScene() {
  if (sceneCleanup.value) {
    sceneCleanup.value();
    sceneCleanup.value = null;
  }
  // Clear refs since scene owns its own stage
  stage.value = null;
  actors.value = { upper: null, lower: null };
  computerProp.value = null;
  bookProp.value = null;
  kitchenProp.value = null;
}

function startLearn() {
  if (!stageContainer.value) return;
  // Tear down any existing state
  stopScene();
  destroyStage();

  const sceneStage = new Stage(stageContainer.value, {
    backgroundColor: '#f0f7f0',
    horizonRatio: 0.15,
  });

  const handle = startLearnScene(sceneStage, currentLetter.value);
  stage.value = sceneStage;
  sceneCleanup.value = handle.cleanup;
}

function startPracticeBook() {
  startPractice('book');
}

function startPracticeKitchen() {
  startPractice('kitchen');
}

function startPractice(prop: 'book' | 'kitchen') {
  if (!stageContainer.value) return;
  stopScene();
  destroyStage();

  const sceneStage = new Stage(stageContainer.value, {
    backgroundColor: '#f7f5f0',
    horizonRatio: 0.15,
  });

  const handle = startPracticeScene(sceneStage, currentLetter.value, {
    secondaryProp: prop,
  });
  stage.value = sceneStage;
  sceneCleanup.value = handle.cleanup;
}

function destroyStage() {
  stopScene();
  stopAllIdles();
  if (computerProp.value) {
    computerProp.value.unmount();
    computerProp.value = null;
  }
  if (bookProp.value) {
    bookProp.value.unmount();
    bookProp.value = null;
  }
  if (kitchenProp.value) {
    kitchenProp.value.unmount();
    kitchenProp.value = null;
  }
  if (anchorElements.length > 0) {
    anchorElements.forEach(el => el.remove());
    anchorElements = [];
  }
  stage.value?.destroy();
  stage.value = null;
  actors.value = { upper: null, lower: null };
}

onBeforeUnmount(() => {
  destroyStage();
});
</script>

<style scoped>
.stage-canvas {
  height: 450px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  position: relative;
  overflow: visible;
}

.letter-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.gap-2 {
  gap: 8px;
}
</style>
