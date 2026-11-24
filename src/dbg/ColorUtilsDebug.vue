<!--
  ColorUtilsDebug.vue - Interactive debug view for color utilities

  Demonstrates and tests all color utility functions from letterpeople/util/color.ts
-->

<template>
  <div class="color-utils-debug">
    <h1>Color Utilities Debug</h1>

    <!-- OKLCH Basics -->
    <section class="debug-section">
      <h2>OKLCH Color Space</h2>
      <p class="description">
        OKLCH is a perceptually uniform color space. Adjusting L (lightness) by the same amount
        produces the same perceived brightness change across all hues.
      </p>

      <div class="controls">
        <div class="control-group">
          <label>Lightness (L): {{ lightness.toFixed(2) }}</label>
          <input v-model.number="lightness" type="range" min="0" max="1" step="0.01" />
        </div>
        <div class="control-group">
          <label>Chroma (C): {{ chroma.toFixed(2) }}</label>
          <input v-model.number="chroma" type="range" min="0" max="0.4" step="0.01" />
        </div>
        <div class="control-group">
          <label>Hue (H): {{ hue.toFixed(0) }}°</label>
          <input v-model.number="hue" type="range" min="0" max="360" step="1" />
        </div>
      </div>

      <div class="color-display">
        <div class="color-swatch" :style="{ background: currentColor }"></div>
        <div class="color-info">
          <div><strong>RGB:</strong> {{ currentColor }}</div>
          <div><strong>OKLCH:</strong> L={{ lightness.toFixed(2) }}, C={{ chroma.toFixed(2) }}, H={{ hue.toFixed(0) }}°</div>
        </div>
      </div>
    </section>

    <!-- Rainbow Generation -->
    <section class="debug-section">
      <h2>Rainbow Generation</h2>
      <div class="controls">
        <div class="control-group">
          <label>Count: {{ rainbowCount }}</label>
          <input v-model.number="rainbowCount" type="range" min="2" max="20" step="1" />
        </div>
        <div class="control-group">
          <label>Start Hue: {{ rainbowStartHue.toFixed(0) }}°</label>
          <input v-model.number="rainbowStartHue" type="range" min="0" max="360" step="1" />
        </div>
        <div class="control-group">
          <label>Lightness: {{ rainbowLightness.toFixed(2) }}</label>
          <input v-model.number="rainbowLightness" type="range" min="0" max="1" step="0.01" />
        </div>
        <div class="control-group">
          <label>Chroma: {{ rainbowChroma.toFixed(2) }}</label>
          <input v-model.number="rainbowChroma" type="range" min="0" max="0.4" step="0.01" />
        </div>
      </div>

      <div class="rainbow-display">
        <div
          v-for="(color, i) in rainbowColors"
          :key="i"
          class="rainbow-swatch"
          :style="{ background: color }"
        >
          <span class="swatch-label">{{ i + 1 }}</span>
        </div>
      </div>
    </section>

    <!-- Lightness Adjustment -->
    <section class="debug-section">
      <h2>Lightness Adjustment</h2>
      <p class="description">
        Adjust lightness of a base color. Note: L is clamped to 0-1 range.
      </p>

      <div class="controls">
        <div class="control-group">
          <label>Base Color</label>
          <input v-model="baseColorHex" type="color" />
          <span>{{ baseColorHex }}</span>
        </div>
        <div class="control-group">
          <label>Lightness Delta: {{ lightnessDelta.toFixed(2) }}</label>
          <input v-model.number="lightnessDelta" type="range" min="-1" max="1" step="0.05" />
          <span v-if="Math.abs(lightnessDelta) > 0.5" class="warning">
            ⚠️ Large adjustments may clamp to white/black
          </span>
        </div>
      </div>

      <div class="adjustment-display">
        <div class="adjustment-item">
          <div class="color-swatch" :style="{ background: baseColorHex }"></div>
          <div class="adjustment-label">Original</div>
          <div class="adjustment-info">{{ baseOklchInfo }}</div>
        </div>
        <div class="adjustment-arrow">→</div>
        <div class="adjustment-item">
          <div class="color-swatch" :style="{ background: adjustedColor }"></div>
          <div class="adjustment-label">Adjusted ({{ lightnessDelta >= 0 ? '+' : '' }}{{ lightnessDelta.toFixed(2) }})</div>
          <div class="adjustment-info">{{ adjustedOklchInfo }}</div>
        </div>
      </div>
    </section>

    <!-- Chroma Adjustment -->
    <section class="debug-section">
      <h2>Chroma (Saturation) Adjustment</h2>
      <div class="controls">
        <div class="control-group">
          <label>Chroma Delta: {{ chromaDelta.toFixed(2) }}</label>
          <input v-model.number="chromaDelta" type="range" min="-0.4" max="0.4" step="0.02" />
        </div>
      </div>

      <div class="adjustment-display">
        <div class="adjustment-item">
          <div class="color-swatch" :style="{ background: baseColorHex }"></div>
          <div class="adjustment-label">Original</div>
        </div>
        <div class="adjustment-arrow">→</div>
        <div class="adjustment-item">
          <div class="color-swatch" :style="{ background: chromaAdjustedColor }"></div>
          <div class="adjustment-label">Adjusted ({{ chromaDelta >= 0 ? '+' : '' }}{{ chromaDelta.toFixed(2) }})</div>
        </div>
      </div>
    </section>

    <!-- Color Blending -->
    <section class="debug-section">
      <h2>Color Blending (OKLCH Space)</h2>
      <div class="controls">
        <div class="control-group">
          <label>Color 1</label>
          <input v-model="blendColor1" type="color" />
        </div>
        <div class="control-group">
          <label>Color 2</label>
          <input v-model="blendColor2" type="color" />
        </div>
        <div class="control-group">
          <label>Blend Ratio: {{ blendRatio.toFixed(2) }}</label>
          <input v-model.number="blendRatio" type="range" min="0" max="1" step="0.05" />
        </div>
      </div>

      <div class="blend-display">
        <div class="blend-gradient">
          <div
            v-for="i in 11"
            :key="i"
            class="blend-swatch"
            :style="{ background: getBlendedColor((i - 1) / 10) }"
          ></div>
        </div>
        <div class="blend-current">
          <div class="color-swatch large" :style="{ background: blendedColor }"></div>
          <div>Ratio: {{ blendRatio.toFixed(2) }} ({{ (blendRatio * 100).toFixed(0) }}% color 2)</div>
        </div>
      </div>
    </section>

    <!-- Presets -->
    <section class="debug-section">
      <h2>Color Presets</h2>
      <div class="presets-display">
        <div v-for="(preset, name) in colorPresets" :key="name" class="preset-item">
          <div class="preset-name">{{ name }}</div>
          <div class="preset-colors">
            <div
              v-for="(color, i) in getPresetColors(preset)"
              :key="i"
              class="color-swatch small"
              :style="{ background: color }"
            ></div>
          </div>
          <div class="preset-info">L={{ preset.lightness }}, C={{ preset.chroma }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  oklchToRgb,
  generateVibrancyRainbow,
  colorToOklch,
  adjustLightness,
  adjustChroma,
  oklchToRgbString,
  blendColors,
  ColorPresets,
  type OklchColor,
} from '../letterpeople/util/color';

// OKLCH Basics
const lightness = ref(0.7);
const chroma = ref(0.15);
const hue = ref(0);

const currentColor = computed(() => oklchToRgb(lightness.value, chroma.value, hue.value));

// Rainbow Generation
const rainbowCount = ref(6);
const rainbowStartHue = ref(0);
const rainbowLightness = ref(0.7);
const rainbowChroma = ref(0.15);

const rainbowColors = computed(() =>
  generateVibrancyRainbow(rainbowCount.value, rainbowLightness.value, rainbowChroma.value, rainbowStartHue.value)
);

// Lightness Adjustment
const baseColorHex = ref('#4caf50');
const lightnessDelta = ref(0.2);
const chromaDelta = ref(0);

const baseOklch = computed(() => colorToOklch(baseColorHex.value));
const baseOklchInfo = computed(() => {
  const oklch = baseOklch.value;
  if (!oklch) return 'Invalid color';
  return `L=${oklch.l.toFixed(2)}, C=${oklch.c.toFixed(2)}, H=${oklch.h.toFixed(0)}°`;
});

const adjustedColor = computed(() => {
  const oklch = baseOklch.value;
  if (!oklch) return baseColorHex.value;
  const adjusted = adjustLightness(oklch, lightnessDelta.value);
  return oklchToRgbString(adjusted);
});

const adjustedOklchInfo = computed(() => {
  const oklch = baseOklch.value;
  if (!oklch) return 'Invalid color';
  const adjusted = adjustLightness(oklch, lightnessDelta.value);
  return `L=${adjusted.l.toFixed(2)}, C=${adjusted.c.toFixed(2)}, H=${adjusted.h.toFixed(0)}°`;
});

const chromaAdjustedColor = computed(() => {
  const oklch = baseOklch.value;
  if (!oklch) return baseColorHex.value;
  const adjusted = adjustChroma(oklch, chromaDelta.value);
  return oklchToRgbString(adjusted);
});

// Color Blending
const blendColor1 = ref('#ff0000');
const blendColor2 = ref('#0000ff');
const blendRatio = ref(0.5);

const blendedColor = computed(() =>
  blendColors(blendColor1.value, blendColor2.value, blendRatio.value)
);

function getBlendedColor(ratio: number): string {
  return blendColors(blendColor1.value, blendColor2.value, ratio);
}

// Presets
const colorPresets = ColorPresets;

function getPresetColors(preset: { lightness: number; chroma: number }): string[] {
  return generateVibrancyRainbow(8, preset.lightness, preset.chroma, 0);
}
</script>

<style scoped>
.color-utils-debug {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

h1 {
  font-size: 2rem;
  margin-bottom: 32px;
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 16px;
  color: #333;
}

.description {
  color: #666;
  margin-bottom: 16px;
  font-size: 0.875rem;
  line-height: 1.5;
}

.debug-section {
  background: white;
  padding: 24px;
  margin-bottom: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-weight: 600;
  font-size: 0.875rem;
  color: #555;
}

.control-group input[type="range"] {
  width: 100%;
}

.control-group input[type="color"] {
  width: 100px;
  height: 40px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.warning {
  color: #ff9800;
  font-size: 0.75rem;
  font-weight: 600;
}

.color-display {
  display: flex;
  gap: 24px;
  align-items: center;
}

.color-swatch {
  width: 100px;
  height: 100px;
  border-radius: 8px;
  border: 2px solid #ddd;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.color-swatch.large {
  width: 150px;
  height: 150px;
}

.color-swatch.small {
  width: 40px;
  height: 40px;
}

.color-info {
  font-family: monospace;
  font-size: 0.875rem;
  color: #555;
}

.rainbow-display {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.rainbow-swatch {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  border: 2px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.swatch-label {
  font-size: 1.25rem;
}

.adjustment-display {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
}

.adjustment-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.adjustment-label {
  font-weight: 600;
  font-size: 0.875rem;
}

.adjustment-info {
  font-family: monospace;
  font-size: 0.75rem;
  color: #666;
}

.adjustment-arrow {
  font-size: 2rem;
  color: #999;
}

.blend-display {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.blend-gradient {
  display: flex;
  gap: 4px;
}

.blend-swatch {
  flex: 1;
  height: 60px;
  border-radius: 4px;
}

.blend-current {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.presets-display {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.preset-item {
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
}

.preset-name {
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: capitalize;
}

.preset-colors {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.preset-info {
  font-family: monospace;
  font-size: 0.75rem;
  color: #666;
}

@media (max-width: 768px) {
  .adjustment-display {
    flex-direction: column;
  }

  .adjustment-arrow {
    transform: rotate(90deg);
  }
}
</style>
