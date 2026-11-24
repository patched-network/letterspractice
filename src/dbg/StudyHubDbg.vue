<template>
  <div class="hub-dbg">
    <div class="hub-dbg__controls">
      <button
        v-for="s in scenarios"
        :key="s.label"
        :class="['scenario-btn', { active: activeLabel === s.label }]"
        @click="activeLabel = s.label"
      >
        {{ s.label }}
      </button>
    </div>

    <div class="hub-dbg__frame">
      <HubChoices
        :next-lesson="scenario.nextLesson"
        :practice-blocked="scenario.practiceBlocked"
        :resting="scenario.resting ?? false"
        @learn="logEvent('learn')"
        @practice="logEvent('practice')"
        @unlock="logEvent('unlock'); gateOpen = true"
      />
      <AdultGateDialog v-model="gateOpen" @passed="logEvent('gate passed')" />
    </div>

    <div v-if="eventLog.length" class="hub-dbg__events">
      <h4>Emitted events</h4>
      <ul>
        <li v-for="(ev, i) in eventLog" :key="i">{{ ev }}</li>
      </ul>
      <button class="scenario-btn" @click="eventLog = []">Clear</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import HubChoices from '../components/hub/HubChoices.vue';
import AdultGateDialog from '../components/hub/AdultGateDialog.vue';
import { LESSON_CATALOG } from '../services/lessons';
import type { LessonDefinition } from '../services/lessons.types';

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface HubScenario {
  label: string;
  nextLesson: LessonDefinition | null;
  practiceBlocked: boolean;
  resting?: boolean;
}

const scenarios: HubScenario[] = [
  {
    label: 'No pending lesson',
    nextLesson: null,
    practiceBlocked: false,
  },
  {
    label: 'Lesson pending: Digraphs',
    nextLesson: LESSON_CATALOG.find(l => l.id === 'digraphs') ?? null,
    practiceBlocked: false,
  },
  {
    label: 'Lesson pending: Hello World (blocked)',
    nextLesson: LESSON_CATALOG.find(l => l.id === 'hello-world') ?? null,
    practiceBlocked: true,
  },
  {
    label: 'Resting (today\'s practice done)',
    nextLesson: LESSON_CATALOG.find(l => l.id === 'digraphs') ?? null,
    practiceBlocked: false,
    resting: true,
  },
];

const gateOpen = ref(false);

const activeLabel = ref(scenarios[1].label);
const scenario = computed(() => scenarios.find(s => s.label === activeLabel.value)!);

// ---------------------------------------------------------------------------
// Event log — shows that HubChoices emits, without performing side effects.
// ---------------------------------------------------------------------------

const eventLog = ref<string[]>([]);
const logEvent = (name: string) => {
  const ts = new Date().toLocaleTimeString();
  eventLog.value.unshift(`[${ts}] ${name}`);
  if (eventLog.value.length > 10) eventLog.value.length = 10;
};
</script>

<style scoped>
.hub-dbg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 24px 16px;
}

.hub-dbg__controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.scenario-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.scenario-btn.active {
  background: #2980b9;
  color: white;
  border-color: #2980b9;
}

.hub-dbg__frame {
  width: 100%;
  max-width: 460px;
}

.hub-dbg__events {
  width: 100%;
  max-width: 460px;
  font-size: 0.8rem;
  padding: 12px 16px;
  background: #f7f7f7;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.hub-dbg__events h4 {
  margin: 0 0 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #555;
}

.hub-dbg__events ul {
  margin: 0 0 8px;
  padding-left: 18px;
  color: #444;
}
</style>
