<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h3 mb-4">Scene Staging & Speech Balloons</h1>
        <p class="text-body-1 mb-6">
          Testing the new Stage and Actor abstractions with speech balloons.
        </p>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card class="mb-6">
          <v-card-title>Stage</v-card-title>
          <v-card-text>
            <div 
              ref="stageContainer" 
              class="stage-container mb-4"
              style="height: 400px; border: 1px solid #ccc; position: relative;"
            ></div>

            <div class="d-flex flex-wrap gap-2 mb-4">
               <v-btn color="primary" @click="addActors" :disabled="!!stage">
                 Init Stage & Actors
               </v-btn>
               <v-btn color="error" @click="destroyStage" :disabled="!stage">
                 Destroy
               </v-btn>
            </div>
            
            <div class="d-flex flex-wrap gap-2 mb-4">
               <v-btn @click="makeSay('A', 'Hello!')" :disabled="!stage">
                 A: Hello
               </v-btn>
               <v-btn @click="makeSay('A', 'How are you today?')" :disabled="!stage">
                 A: Question
               </v-btn>
               <v-btn @click="makeSay('B', 'I am doing great!')" :disabled="!stage">
                 B: Reply
               </v-btn>
               <v-btn @click="makeSay('B', 'This is a longer message to test wrapping capabilities of the speech balloon.')" :disabled="!stage">
                 B: Long Reply
               </v-btn>
               <v-btn @click="silenceAll" :disabled="!stage">
                 Silence All
               </v-btn>
            </div>
            
            <!-- Controls for Actor A -->
            <div class="d-flex flex-column gap-2 mb-4" v-if="stage">
              <div class="text-subtitle-1">Actor A Controls</div>
              <div class="d-flex gap-2">
                <v-btn size="small" variant="outlined" @click="moveActor('A', -50, 0)">← Left</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('A', 50, 0)">Right →</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('A', 0, -20)">↑ Back</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('A', 0, 20)">Front ↓</v-btn>
                <v-btn size="small" color="primary" @click="resetActor('A', 100, 50)">Reset</v-btn>
                <v-btn size="small" color="info" @click="toggleGait('A')">Toggle Gait</v-btn>
              </div>
            </div>

            <!-- Controls for Actor B -->
            <div class="d-flex flex-column gap-2 mb-4" v-if="stage">
              <div class="text-subtitle-1">Actor B Controls</div>
              <div class="d-flex gap-2">
                <v-btn size="small" variant="outlined" @click="moveActor('B', -50, 0)">← Left</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('B', 50, 0)">Right →</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('B', 0, -20)">↑ Back</v-btn>
                <v-btn size="small" variant="outlined" @click="moveActor('B', 0, 20)">Front ↓</v-btn>
                <v-btn size="small" color="secondary" @click="resetActor('B', 400, 90)">Reset</v-btn>
              </div>
            </div>

          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { Stage } from '../letterpeople/scene/Stage';

const stageContainer = ref<HTMLElement | null>(null);
const stage = ref<Stage | null>(null);

const addActors = () => {
  if (!stageContainer.value) return;
  
  stage.value = new Stage(stageContainer.value, { 
    width: 800, 
    height: 400,
    backgroundColor: '#f0f4f8',
    horizonRatio: 0.3
  });
  
  // Add Actor A (Mid-stage)
  const actorA = stage.value.addActor('A', 'A', {
    x: 100,
    z: 50,
    letterOptions: {
      color: '#FF6B6B',
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true
    }
  });
  
  // Add Actor B (Front-stage)
  const actorB = stage.value.addActor('B', 'B', {
    x: 400,
    z: 90,
    letterOptions: {
      color: '#5C6BC0',
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true
    }
  });
  
  // Face each other
  if (actorA && actorB) {
     actorA.lookAt(actorB);
     actorB.lookAt(actorA);
     actorA.instance.body.turnToward(actorB.instance);
     actorB.instance.body.turnToward(actorA.instance);
  }
};

const destroyStage = () => {
  if (stage.value) {
    stage.value.destroy();
    stage.value = null;
  }
};

const makeSay = (id: string, text: string) => {
  if (!stage.value) return;
  const actor = stage.value.getActor(id);
  if (actor) {
    actor.say(text);
  }
};

const silenceAll = () => {
  if (!stage.value) return;
  stage.value.actors.forEach(actor => actor.silence());
};

const moveActor = async (id: string, dx: number, dz: number) => {
  if (!stage.value) return;
  const actor = stage.value.getActor(id);
  if (actor) {
     // Clamp Z between 0 and 100
     const newZ = Math.max(0, Math.min(100, actor.z + dz));
     const newX = actor.x + dx;
     await actor.walkTo(newX, newZ, 1000);
  }
};

const resetActor = async (id: string, x: number, z: number) => {
  if (!stage.value) return;
  const actor = stage.value.getActor(id);
  if (actor) {
     await actor.walkTo(x, z, 1000);
  }
};

const isGaitActive = ref<Record<string, boolean>>({});

const toggleGait = (id: string) => {
  if (!stage.value) return;
  const actor = stage.value.getActor(id);
  if (!actor) return;
  
  if (isGaitActive.value[id]) {
    actor.instance.body.stopWalking();
    isGaitActive.value[id] = false;
  } else {
    actor.instance.body.startWalking();
    isGaitActive.value[id] = true;
  }
};

onBeforeUnmount(() => {
  destroyStage();
});
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>
