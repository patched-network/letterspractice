<script setup lang="ts">
import { computed } from 'vue';
import { decodeWord, DecodeResult } from '@lib/decode';

const props = defineProps<{
  text: string;
  profile: Map<string, number>; // GPC ID -> Score
  minOpacity?: number;
  maxBlur?: number;
}>();

const MIN_OPACITY = computed(() => props.minOpacity ?? 0.3);
const MAX_BLUR = computed(() => props.maxBlur ?? 0.2);

// Tokenize and decode
const processedContent = computed(() => {
  // Split preserving whitespace and punctuation roughly
  // We want to decode "words" but pass punctuation through as-is if possible
  // Or just rely on decodeWord returning unknown segments for punctuation.
  // decodeWord handles "unknown" by returning a segment with gpcId: null.

  // However, decodeWord might treat "hello." as a word and fail to find "o."
  // It's safer to split by non-word characters for the decoding purpose,
  // but we need to reconstruct the original string visually.

  // Strategy: Split by boundary, decode "words", leave others as raw text.
  const tokens = props.text.split(/([a-zA-Z0-9_']+(?:-[a-zA-Z0-9_']+)*)/g);

  return tokens.map(token => {
    // If it's a word (has letters), decode it
    if (/[a-zA-Z]/.test(token)) {
      const result = decodeWord(token);
      return {
        type: 'word',
        segments: result.segments.map(seg => {
          // Determine score
          let score = 0;
          if (seg.gpcId) {
             score = props.profile.get(seg.gpcId) ?? 0;
          } else {
             // Unknown GPC (shouldn't happen for known letters if catalogue is complete)
             // For safety, if it's a letter, assume 0. If it's something else, 1?
             // Actually, if gpcId matches a "whole word" or simple letter, we use profile.
             // If gpcId is null, it's unknown.
             score = 0;
          }

          return {
            text: seg.grapheme,
            score,
            gpcId: seg.gpcId
          };
        })
      };
    } else {
      // Punctuation/Whitespace - assume fully visible
      return {
        type: 'text',
        content: token
      };
    }
  });
});

const getStyle = (score: number) => {
  const minOp = MIN_OPACITY.value;
  const opacity = minOp + (Math.pow(score, 1.5) * (1 - minOp));
  const blur = (1 - score) * MAX_BLUR.value;

  return {
    opacity: opacity,
    filter: `blur(${blur}em)`,
    display: 'inline-block',
    transition: 'all 0.3s ease'
  };
};

</script>

<template>
  <div class="blurry-preview">
    <template v-for="(token, idx) in processedContent" :key="idx">

      <template v-if="token.type === 'word'">
        <span class="word-wrapper">
          <span
            v-for="(seg, sIdx) in token.segments"
            :key="sIdx"
            class="segment"
            :style="getStyle(seg.score)"
            :title="seg.gpcId || 'Unknown'"
          >{{ seg.text }}</span>
        </span>
      </template>

      <template v-else>
        <span class="punctuation">{{ token.content }}</span>
      </template>

    </template>
  </div>
</template>

<style scoped>
.blurry-preview {
  font-family: 'Georgia', serif;
  font-size: 1.5rem;
  line-height: 1.6;
  color: #333;
  background: white;
  padding: 2em;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  white-space: pre-wrap; /* Preserve whitespace */
}

.word-wrapper {
  display: inline-block; /* Keep word segments together */
}

.punctuation {
  display: inline;
  opacity: 1; /* Always clear */
}
</style>
