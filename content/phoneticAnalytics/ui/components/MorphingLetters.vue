<script setup lang="ts">
import { ref, computed } from 'vue';
import { decodeWord, DecodeResult } from '@lib/decode';

const props = defineProps<{
  text: string;
  profile: Map<string, number>;
}>();

// We need a unique ID for the filter to avoid collisions if multiple instances exist
const filterId = `distortion-filter-${Math.random().toString(36).substr(2, 9)}`;

// Tokenize and decode (reused logic)
const processedContent = computed(() => {
  const tokens = props.text.split(/([a-zA-Z0-9_']+(?:-[a-zA-Z0-9_']+)*)/g);
  
  return tokens.map(token => {
    if (/[a-zA-Z]/.test(token)) {
      const result = decodeWord(token);
      return {
        type: 'word',
        segments: result.segments.map(seg => {
          let score = 0;
          if (seg.gpcId) {
             score = props.profile.get(seg.gpcId) ?? 0;
          }
          return {
            text: seg.grapheme,
            score,
            gpcId: seg.gpcId
          };
        })
      };
    } else {
      return {
        type: 'text',
        content: token
      };
    }
  });
});

// Map score (0-1) to distortion scale (High-0)
// 0 -> 40 (Heavy distortion)
// 1 -> 0 (No distortion)
const getDistortion = (score: number) => {
  return 40 * (1 - Math.pow(score, 0.5)); // Non-linear falloff looks better
};

// We need to generate a unique filter for EACH varying score level if we want fine-grained control per letter.
// However, SVG filters on inline elements can be tricky. 
// A better approach for per-letter control is simpler: 
// We CANNOT easily apply different filter parameters to different parts of a single text string 
// without breaking them into distinct DOM elements each with their own unique filter ID.
// That is DOM-heavy. 
//
// OPTIMIZATION:
// Instead of 100 filters, we can bin the scores into ~10 levels (0.0, 0.1, ... 1.0).
// Create 10 reusable filters. Assign the class corresponding to the nearest bin.

const scoreBins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const getBin = (score: number) => {
  // Find nearest bin
  return scoreBins.reduce((prev, curr) => 
    Math.abs(curr - score) < Math.abs(prev - score) ? curr : prev
  );
};

const getFilterId = (score: number) => {
  const bin = getBin(score);
  return `${filterId}-${Math.round(bin * 10)}`;
};

</script>

<template>
  <div class="morphing-container">
    
    <!-- Define Reusable Filters for Score Bins -->
    <svg style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true">
      <defs>
        <filter v-for="bin in scoreBins" :key="bin" :id="`${filterId}-${Math.round(bin * 10)}`">
          <!-- Turbulence creates the noise texture -->
          <feTurbulence 
            type="fractalNoise" 
            baseFrequency="0.1" 
            numOctaves="1" 
            result="noise" 
          />
          <!-- DisplacementMap moves pixels of SourceGraphic based on the noise -->
          <feDisplacementMap 
            in="SourceGraphic" 
            in2="noise" 
            :scale="getDistortion(bin)" 
            xChannelSelector="R" 
            yChannelSelector="G" 
          />
          <!-- Optional: Gaussian Blur for very low scores to smooth the jagged noise -->
          <feGaussianBlur 
            v-if="bin < 0.3" 
            :stdDeviation="(0.3 - bin) * 3" 
          />
        </filter>
      </defs>
    </svg>

    <div class="text-content">
      <template v-for="(token, idx) in processedContent" :key="idx">
        <template v-if="token.type === 'word'">
          <span class="word-wrapper">
            <span 
              v-for="(seg, sIdx) in token.segments" 
              :key="sIdx"
              class="morph-segment"
              :style="{ filter: `url(#${getFilterId(seg.score)})` }"
            >{{ seg.text }}</span>
          </span>
        </template>
        <template v-else>
          <span class="punctuation">{{ token.content }}</span>
        </template>
      </template>
    </div>

  </div>
</template>

<style scoped>
.morphing-container {
  font-family: 'Times New Roman', serif; /* Serif fonts morph interestingly */
  font-size: 2rem;
  line-height: 1.6;
  padding: 2em;
  background: white;
  color: #222;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  min-height: 200px;
  white-space: pre-wrap;
}

.word-wrapper {
  display: inline-block;
  white-space: nowrap;
}

.morph-segment {
  display: inline-block;
  transition: filter 0.5s ease; /* Smooth transition when score changes */
  will-change: filter;
}

.punctuation {
  display: inline; /* Changed from inline-block to preserve natural spacing behavior */
}
</style>
