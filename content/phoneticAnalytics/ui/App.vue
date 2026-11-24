<script setup lang="ts">
import { ref } from 'vue';
import LearnerConfig from './components/LearnerConfig.vue';
import BlurryPreview from './components/BlurryPreview.vue';
import ScrollStory from './components/ScrollStory.vue';
import MorphingLetters from './components/MorphingLetters.vue';
import { getTeachingCatalogue } from '@lib/catalogue';

// View switching
const currentView = ref<'config' | 'story' | 'morph'>('config');

// Spanning Text calculated to cover ~85% of weighted GPCs
const spanningText = `The night course was set. Jack walked through the bush, looking for the grand prize. "You know," he said to Scott, "there is no change without three steps."

They left the school and went off the road. "Why here?" asked Scott. "Well, what my rhyme says is: Have the will to do, think who you are, and come one way."

They wrote it down. "Wait," said Ms. Wright. "Who is from the queue?" Phew! It was weird. "Hey," she shouted, "Where would you have been?"

Some were lost. Some stopped. But four men planned to push past the doubt. They climbed the hill, though their legs were full of pain. "Damn," said Jack. "None of this makes sense."

But then, a light! Eight feet ahead, a weird buzzing sound filled the air. It was not a bomb. It was not a bull. It was the prize: a golden psych badge, resting on a bough.

They had robbed the night of its secret. The walk was done.`;

// Initial state
const text = ref(spanningText);


  The quick brown fox jumped over the lazy dog.

  pig
  dog
  cat
  hat
  hate
  kit
  kite
  fill
  lick

  butter
  better


  fight

  const initializeProfile = () => {
    const map = new Map<string, number>();
    getTeachingCatalogue().forEach(gpc => {
      // Default: Consonants and
      //          Short Vowels mastered,
      //          others unknown
      if (gpc.category === 'consonants' ||
          gpc.category === 'vowels_short') {
        map.set(gpc.id, 1);
      } else {
        map.set(gpc.id, 0.2);
      }
    });
    return map;
  };


  `);

const minOpacity = ref(0.3);
const maxBlur = ref(0.2);

const initializeProfile = () => {
  const map = new Map<string, number>();
  getTeachingCatalogue().forEach(gpc => {
    // Default: Consonants and Short Vowels mastered, others unknown
    if (gpc.category === 'consonants' || gpc.category === 'vowels_short') {
      map.set(gpc.id, 1);
    } else {
      map.set(gpc.id, 0.2); // A little visible by default to see they are there
    }
  });
  return map;
};

const learnerProfile = ref(initializeProfile());

</script>

<template>
  <div class="container">
    <header>
      <h1>Phonetic Analytics UI</h1>
      <p>Simulating learner perception based on GPC mastery.</p>
      
      <div class="tabs">
        <button 
          :class="{ active: currentView === 'config' }" 
          @click="currentView = 'config'"
        >Configurator</button>
        <button 
          :class="{ active: currentView === 'story' }" 
          @click="currentView = 'story'"
        >Scroll Story</button>
        <button 
          :class="{ active: currentView === 'morph' }" 
          @click="currentView = 'morph'"
        >Morphing Lab</button>
      </div>
    </header>

    <main v-if="currentView === 'config'">
      <section class="preview-section">
        <h2>Preview</h2>
        <div class="controls">
          <label>
            Min Opacity: {{ minOpacity }}
            <input type="range" min="0" max="1" step="0.05" v-model.number="minOpacity">
          </label>
          <label>
            Max Blur: {{ maxBlur }}em
            <input type="range" min="0" max="1" step="0.05" v-model.number="maxBlur">
          </label>
        </div>

        <textarea v-model="text" rows="4" class="text-input"></textarea>

        <BlurryPreview
          :text="text"
          :profile="learnerProfile"
          :minOpacity="minOpacity"
          :maxBlur="maxBlur"
        />
      </section>

      <section class="config-section">
        <LearnerConfig v-model="learnerProfile" />
      </section>
    </main>
    
    <main v-else-if="currentView === 'story'" class="story-view">
      <ScrollStory :minOpacity="minOpacity" :maxBlur="maxBlur" />
    </main>

    <main v-else-if="currentView === 'morph'" class="morph-view">
      <div class="morph-layout">
        <section class="preview-section">
          <h2>Morphing SVG Distortion</h2>
          <p>Letters warp and melt based on mastery score. No external fonts required.</p>
          <div class="toolbar">
            <button @click="text = spanningText">Load High-Density Spanning Text</button>
          </div>
          <textarea v-model="text" rows="4" class="text-input"></textarea>
          <MorphingLetters :text="text" :profile="learnerProfile" />
        </section>
        
        <section class="config-section">
          <LearnerConfig v-model="learnerProfile" />
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ... existing styles ... */
.morph-view {
  display: block;
}

.morph-layout {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 2rem;
  align-items: start;
}

@media (max-width: 900px) {
  .morph-layout {
    grid-template-columns: 1fr;
  }
}


<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
}

header {
  margin-bottom: 2rem;
  text-align: center;
}

.tabs {
  margin-top: 1.5rem;
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.tabs button {
  padding: 0.5rem 1.5rem;
  font-size: 1.1rem;
  cursor: pointer;
  background: transparent;
  border: 2px solid #ddd;
  border-radius: 4px;
  color: #555;
  transition: all 0.2s;
}

.tabs button.active {
  background: #42b983;
  color: white;
  border-color: #42b983;
}

main {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

.story-view {
  /* Scroll story takes full width */
  display: block;
}

@media (min-width: 900px) {
  main {
    grid-template-columns: 1fr 350px;
    align-items: start;
  }
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.controls {
  display: flex;
  gap: 2rem;
  background: #f0f0f0;
  padding: 1rem;
  border-radius: 8px;
  color: #333;
}

.toolbar {
  margin-bottom: 1rem;
}

.toolbar button {
  padding: 0.5rem 1rem;
  background: #eee;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.toolbar button:hover {
  background: #e0e0e0;
}

.text-input {
  width: 100%;
  padding: 1rem;
  font-family: inherit;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
}

.config-section {
  position: sticky;
  top: 1rem;
  max-height: 90vh;
  overflow-y: auto;
}
</style>
