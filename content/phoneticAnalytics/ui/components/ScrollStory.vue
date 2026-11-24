<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import BlurryPreview from './BlurryPreview.vue';
import { getProfileForStep, getStepInfo, MAX_SIMULATION_DAYS } from '../composables/useProgression';

// Props to control display parameters
const props = defineProps<{
  minOpacity?: number;
  maxBlur?: number;
}>();

// --- Progression Logic ---
// We replicate the logic from LearnerConfig but tied to scroll
const progressionStep = ref(0);

const learnerProfile = ref(new Map<string, number>());

const updateProfile = (step: number) => {
  learnerProfile.value = getProfileForStep(step);
};

// Initial update
updateProfile(0);

// --- Scroll Logic ---
const scrollContainer = ref<HTMLElement | null>(null);

const handleScroll = () => {
  if (!scrollContainer.value) return;
  
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const maxScroll = scrollHeight - clientHeight;
  
  if (maxScroll <= 0) return;
  
  const scrollPercent = Math.min(1, Math.max(0, scrollTop / maxScroll));
  
  // Map 0-1 to 0-MAX_SIMULATION_DAYS
  const newStep = Math.floor(scrollPercent * MAX_SIMULATION_DAYS);
  
  if (newStep !== progressionStep.value) {
    progressionStep.value = newStep;
    updateProfile(newStep);
  }
};

// --- Content ---
const storyText = `
The Adventures of the Emerging Reader

Once upon a time, in a land of fuzzy shapes and blurry lines, there lived a learner named Pip. Pip wanted to read the great books of the world, but the letters played tricks on him. Some stood tall and clear, like soldiers at attention, while others hid in the mist, refusing to speak their names.

"Why is the 'c' in 'cat' like a crisp cracker," Pip wondered, "but the 'c' in 'city' hisses like a snake?"

He started his journey with simple steps. "S", "N", "I", and "T" were his first friends. "It is in it," he could say, and felt a spark of joy. "Sit," he commanded the dog, and the dog sat.

As he walked further down the path of knowledge, more friends appeared. 'P' popped up to join 'I' and 'N'. "Pin," Pip whispered. Then came 'A', flat and wide. "Pan," he said. "Nap." "Tap." The world was growing larger.

But the forest of words was deep. Soon he encountered the twin guardians, 'SH' and 'TH'. They looked like two letters but spoke with one voice. "This," said the first. "Ship," said the second. Pip stumbled, but he practiced. He learned that 'T' and 'H' together could be soft as a feather in 'thin' or buzzy as a bee in 'that'.

One day, he found a Magic 'E' sitting at the end of a word. It made no sound of its own, but it reached back over a consonant to pinch the vowel before it. "Tim," said Pip. The Magic E winked. "Time," it corrected. "Kit" became "Kite". "Hop" became "Hope". It was a powerful magic indeed.

Pip walked on, finding 'ING' ringing like a bell at the end of verbs. He found 'IGHT' lighting up the night. He met the unruly 'OUGH' family, who could never agree on how to pronounce their name—sometimes like 'off', sometimes like 'stuff', sometimes like 'bough'.

With every step, the fog lifted. The blurry smudges sharpened into clear, distinct forms. The silent letters stopped hiding and revealed their purpose. The ghost of 'K' in 'Knight' bowed to him. The 'W' in 'Write' waved.

And finally, Pip stood at the top of the mountain. He looked down at the pages that had once baffled him. They were no longer a sea of gray fog. They were crisp, black rivers of thought, flowing clearly from the page to his mind. He was a Reader.
`.trim();

</script>

<template>
  <div class="scroll-story-wrapper">
    <div class="status-bar">
      <strong>Progression Step:</strong> {{ progressionStep }} / {{ MAX_SIMULATION_DAYS }}
      <span class="coverage">
        Coverage: {{ getStepInfo(progressionStep).coverage }}%
      </span>
    </div>
    
    <div 
      class="scroll-container" 
      ref="scrollContainer"
      @scroll="handleScroll"
    >
      <div class="content-spacer">
        <BlurryPreview 
          :text="storyText"
          :profile="learnerProfile"
          :minOpacity="props.minOpacity"
          :maxBlur="props.maxBlur"
        />
        
        <div class="continue-reading">
          <p><em>Scroll down to learn more...</em></p>
          <div class="scroll-arrow">↓</div>
        </div>
        
        <!-- Repeat content to ensure enough scrollable area -->
        <BlurryPreview 
          v-for="i in 3" 
          :key="i"
          :text="storyText"
          :profile="learnerProfile"
          :minOpacity="props.minOpacity"
          :maxBlur="props.maxBlur"
        />
        
        <div class="end-message">
          <h3>The End</h3>
          <p>You have mastered all {{ maxSteps }} steps!</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scroll-story-wrapper {
  display: flex;
  flex-direction: column;
  height: 80vh; /* Fixed height for inner scrolling */
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.status-bar {
  padding: 0.5em 1em;
  background: #f0f4f8;
  border-bottom: 1px solid #ddd;
  font-family: sans-serif;
  display: flex;
  gap: 1em;
  align-items: center;
}

.coverage {
  font-size: 0.9em;
  color: #666;
  background: #fff;
  padding: 0.2em 0.5em;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 2em;
  scroll-behavior: smooth;
}

.content-spacer {
  /* Ensure plenty of space to scroll */
  padding-bottom: 50vh; 
  max-width: 800px;
  margin: 0 auto;
}

.continue-reading {
  text-align: center;
  margin: 4em 0;
  color: #999;
}

.scroll-arrow {
  font-size: 2em;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
  40% {transform: translateY(-10px);}
  60% {transform: translateY(-5px);}
}

.end-message {
  text-align: center;
  margin-top: 4em;
  padding: 2em;
  background: #f9f9f9;
  border-radius: 8px;
}
</style>
