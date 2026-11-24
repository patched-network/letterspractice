<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getTeachingCatalogue, GPCEntry } from '@lib/catalogue';
import { getProfileForStep, getStepInfo, MAX_SIMULATION_DAYS } from '../composables/useProgression';

const props = defineProps<{
  modelValue: Map<string, number> // Map of GPC ID -> Mastery Score (0-1)
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Map<string, number>): void
}>();

// Grouping logic
const catalogue = getTeachingCatalogue();
const categories = computed(() => {
  const groups = new Map<string, GPCEntry[]>();
  catalogue.forEach(gpc => {
    const cat = gpc.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(gpc);
  });
  return groups;
});

// Local state for checkboxes/sliders to avoid excessive prop mutations
// We initialize from the prop
const localProfile = ref(new Map<string, number>(props.modelValue));

const updateScore = (id: string, score: number) => {
  localProfile.value.set(id, score);
  // Emit a new Map to trigger reactivity in parent
  emit('update:modelValue', new Map(localProfile.value));
};

const toggleGpc = (id: string, active: boolean) => {
  const currentScore = localProfile.value.get(id) ?? 0;
  if (active) {
    if (currentScore === 0) updateScore(id, 1); // Default to mastered on check
  } else {
    updateScore(id, 0);
  }
};

// Helper to format category names
const formatCategory = (cat: string) => cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

// --- Progression Logic ---
const progressionStep = ref(0);

const applyProgression = (step: number) => {
  const newProfile = getProfileForStep(step);
  localProfile.value = newProfile;
  emit('update:modelValue', newProfile);
};

// Computed to show what the current step unlocks
const currentStepInfo = computed(() => {
  const info = getStepInfo(progressionStep.value);
  return `Step ${progressionStep.value}: ${info.description} (${info.coverage}% Coverage)`;
});

</script>

<template>
  <div class="learner-config">
    <h3>Learner Knowledge Bank</h3>
    <p class="description">Configure which graphemes the learner has mastered.</p>
    
    <div class="progression-control">
      <label>
        <strong>Curriculum Progression</strong>
        <span class="step-info">{{ currentStepInfo }}</span>
      </label>
      <div class="slider-row">
        <span>Start</span>
        <input 
          type="range" 
          min="0" 
          :max="MAX_SIMULATION_DAYS" 
          v-model.number="progressionStep"
          @input="applyProgression(progressionStep)"
        >
        <span>End</span>
      </div>
    </div>

    <div v-for="[category, gpcs] in categories" :key="category" class="category-group">
      <h4>{{ formatCategory(category) }}</h4>
      <div class="gpc-grid">
        <div v-for="gpc in gpcs" :key="gpc.id" class="gpc-item">
          <div class="gpc-header">
            <input 
              type="checkbox" 
              :id="`cb-${gpc.id}`" 
              :checked="(localProfile.get(gpc.id) ?? 0) > 0"
              @change="(e) => toggleGpc(gpc.id, (e.target as HTMLInputElement).checked)"
            >
            <label :for="`cb-${gpc.id}`">
              <span class="grapheme">{{ gpc.grapheme }}</span>
              <span class="phoneme">/{{ gpc.phoneme }}/</span>
            </label>
          </div>
          
          <div class="score-control" v-if="(localProfile.get(gpc.id) ?? 0) > 0">
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.1"
              :value="localProfile.get(gpc.id)"
              @input="(e) => updateScore(gpc.id, parseFloat((e.target as HTMLInputElement).value))"
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.learner-config {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5em;
  color: #333;
}

.description {
  margin-bottom: 1.5em;
  color: #666;
  font-size: 0.9em;
}

.progression-control {
  background: #eef2f5;
  padding: 1em;
  border-radius: 6px;
  margin-bottom: 2em;
  border: 1px solid #dde;
}

.progression-control label {
  display: block;
  margin-bottom: 0.5em;
  display: flex;
  justify-content: space-between;
}

.step-info {
  font-family: monospace;
  color: #555;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 1em;
  font-size: 0.8em;
  color: #666;
}

.slider-row input {
  flex: 1;
}

.category-group {
  margin-bottom: 1.5em;
}

h4 {
  margin: 0 0 0.5em 0;
  font-size: 1em;
  color: #555;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.2em;
}

.gpc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.8em;
}

.gpc-item {
  background: #fff;
  padding: 0.5em;
  border-radius: 4px;
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}

.gpc-header {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.grapheme {
  font-weight: bold;
  font-size: 1.1em;
}

.phoneme {
  color: #888;
  font-family: monospace;
  font-size: 0.9em;
}

.score-control input {
  width: 100%;
}
</style>
