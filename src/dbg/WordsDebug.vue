<template>
  <div class="words-debug-container">
    <div class="controls">
      <h3>Words Debug Playground</h3>

      <label>
        Text to Render:
        <input
          v-model="textInput"
          type="text"
          class="text-input"
          placeholder="Enter words..."
        />
      </label>

      <!-- Word Configuration -->
      <div class="control-section">
        <h4>Word Settings</h4>

        <label>
          Spacing:
          <span class="range-value">{{ spacing }}px</span>
          <input
            v-model.number="spacing"
            type="range"
            min="5"
            max="50"
            step="1"
          />
        </label>

        <label>
          Letter Height:
          <span class="range-value">{{ letterHeight }}px</span>
          <input
            v-model.number="letterHeight"
            type="range"
            min="40"
            max="300"
            step="5"
          />
        </label>

        <label class="checkbox-label">
          <input v-model="skipInvalidChars" type="checkbox" />
          <span>Skip Invalid Characters</span>
        </label>
      </div>

      <!-- Letter Configuration -->
      <div class="control-section">
        <h4>Letter Settings</h4>

        <div class="controls-row">
          <label class="control-item">
            Fill Color:
            <input
              v-model="fillColor"
              type="color"
              style="width: 100%"
            />
          </label>
          <label class="control-item">
            Outline Color:
            <input
              v-model="strokeColor"
              type="color"
              style="width: 100%"
            />
          </label>
        </div>

        <div class="controls-row">
          <label class="control-item">
            Line Width:
            <input
              v-model.number="lineWidth"
              type="number"
              min="5"
              max="40"
              step="1"
              style="width: 100%"
            />
          </label>
          <label class="control-item">
            Eye Size:
            <input
              v-model.number="eyeSize"
              type="number"
              min="2"
              max="12"
              step="1"
              style="width: 100%"
            />
          </label>
        </div>
      </div>

      <!-- Word Actions -->
      <div class="control-section">
        <h4>Word Actions</h4>

        <div class="action-buttons">
          <button @click="recreateWord" type="button">Recreate Word</button>
          <button @click="testHandPositions" type="button">Test Hand Positions</button>
          <button @click="animateAllLetters" type="button">Animate All</button>
          <button @click="clearWord" type="button">Clear</button>
        </div>
      </div>

      <!-- Z-Index Control -->
      <div class="control-section">
        <h4>Z-Index Control</h4>

        <div class="controls-row">
          <label class="control-item">
            Letter Index:
            <input
              v-model.number="zIndexLetterIndex"
              type="number"
              min="0"
              :max="currentWord?.length! - 1 || 0"
              style="width: 100%"
            />
          </label>
          <div class="control-item">
            <button @click="bringToFront" type="button">Bring to Front</button>
            <button @click="sendToBack" type="button">Send to Back</button>
          </div>
        </div>
      </div>

      <!-- Letter Access -->
      <div class="control-section">
        <h4>Letter Access</h4>

        <div class="controls-row">
          <label class="control-item">
            Get Letter by Index:
            <input
              v-model.number="letterIndex"
              type="number"
              min="0"
              :max="currentWord?.length! - 1 || 0"
              style="width: 100%"
            />
          </label>
          <button @click="testLetterAccess" type="button">Test Access</button>
        </div>

        <div class="controls-row">
          <label class="control-item">
            Find Character:
            <input
              v-model="findChar"
              type="text"
              maxlength="1"
              style="width: 100%"
              placeholder="A"
            />
          </label>
          <button @click="testCharAccess" type="button">Find & Animate</button>
        </div>
      </div>

      <!-- Debug Info -->
      <div class="control-section">
        <h4>Debug Info</h4>
        <div class="debug-info">
          <p><strong>Word Length:</strong> {{ currentWord?.length || 0 }}</p>
          <p><strong>Characters:</strong> {{ currentWord?.characters.join(', ') || 'None' }}</p>
          <p><strong>Current Spacing:</strong> {{ currentWord ? spacing + 'px' : 'N/A' }}</p>
        </div>
      </div>
    </div>

    <div class="word-display-area">
      <div ref="wordContainer" class="word-container">
        <!-- Word will be rendered here -->
      </div>

      <div class="hand-positions" v-if="showHandPositions">
        <h4>Hand Positions (for debugging)</h4>
        <div v-for="(letter, index) in handPositions" :key="index" class="hand-info">
          <strong>{{ letter.char }} ({{ index }}):</strong>
          <span>Left: ({{ letter.leftHand.x.toFixed(1) }}, {{ letter.leftHand.y.toFixed(1) }})</span>
          <span>Right: ({{ letter.rightHand.x.toFixed(1) }}, {{ letter.rightHand.y.toFixed(1) }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { Word } from '../letterpeople'
import type { WordOptions } from '../letterpeople/Word'
import type { LetterInstance } from '../letterpeople/types'

// Reactive data
const textInput = ref('HELLO WORLD')
const spacing = ref(12)
const letterHeight = ref(100)
const skipInvalidChars = ref(true)

// Letter options
const fillColor = ref('#4dabf7')
const strokeColor = ref('#1971c2')
const lineWidth = ref(20)
const eyeSize = ref(6)

// Word access testing
const letterIndex = ref(0)
const findChar = ref('L')

// Z-index control
const zIndexLetterIndex = ref(0)

// Debug state
const showHandPositions = ref(false)
const handPositions = ref<Array<{char: string, leftHand: any, rightHand: any}>>([])

// Word instance
const wordContainer = ref<HTMLElement | null>(null)
const currentWord = shallowRef<Word | null>(null)

// Methods
const getWordOptions = (): WordOptions => ({
  spacing: spacing.value,
  skipInvalidChars: skipInvalidChars.value,
  letterOptions: {
    color: fillColor.value,
    borderColor: strokeColor.value,
    lineWidth: lineWidth.value,
    eyeSize: eyeSize.value,
    armColor: strokeColor.value
  }
})

const recreateWord = () => {
  clearWord()

  if (!wordContainer.value || !textInput.value.trim()) return

  try {
    currentWord.value = new Word(textInput.value, wordContainer.value, getWordOptions())
    console.log('Word created:', currentWord.value)
  } catch (error) {
    console.error('Failed to create word:', error)
  }
}

const clearWord = () => {
  if (currentWord.value) {
    currentWord.value.destroy()
    currentWord.value = null
  }
  handPositions.value = []
  showHandPositions.value = false
}

const testHandPositions = () => {
  if (!currentWord.value) return

  const positions: Array<{char: string, leftHand: any, rightHand: any}> = []

  for (let i = 0; i < currentWord.value.length; i++) {
    const letter = currentWord.value.getLetter(i)
    if (letter && letter.arms) {
      try {
        const leftHand = letter.arms.left.getHandPosition()
        const rightHand = letter.arms.right.getHandPosition()

        positions.push({
          char: letter.character,
          leftHand,
          rightHand
        })

        console.log(`Letter ${letter.character}:`, {
          left: leftHand,
          right: rightHand
        })
      } catch (error) {
        console.error(`Failed to get hand positions for letter ${letter.character}:`, error)
      }
    }
  }

  handPositions.value = positions
  showHandPositions.value = true
}

const animateAllLetters = async () => {
  if (!currentWord.value) return

  // Simple sequential blink animation
  for (let i = 0; i < currentWord.value.length; i++) {
    const letter = currentWord.value.getLetter(i)
    if (letter?.eyes) {
      await letter.eyes.blink()
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
}

const testLetterAccess = () => {
  if (!currentWord.value) return

  const letter = currentWord.value.getLetter(letterIndex.value)
  if (letter) {
    console.log(`Letter at index ${letterIndex.value}:`, letter)
    letter.eyes?.blink()
    letter.mouth?.animateSpeak()
  } else {
    console.log(`No letter at index ${letterIndex.value}`)
  }
}

const testCharAccess = () => {
  if (!currentWord.value || !findChar.value) return

  const letter = currentWord.value.getLetterByChar(findChar.value.toUpperCase())
  if (letter) {
    console.log(`Found letter '${findChar.value}':`, letter)
    letter.eyes?.blink()
    letter.arms?.wave()
  } else {
    console.log(`Letter '${findChar.value}' not found`)
  }
}

// Z-index control methods
const bringToFront = () => {
  if (!currentWord.value) return

  currentWord.value.bringLetterToFront(zIndexLetterIndex.value)
  console.log(`Brought letter at index ${zIndexLetterIndex.value} to front`)
}

const sendToBack = () => {
  if (!currentWord.value) return

  currentWord.value.sendLetterToBack(zIndexLetterIndex.value)
  console.log(`Sent letter at index ${zIndexLetterIndex.value} to back`)
}

// Watchers
watch([spacing], () => {
  if (currentWord.value) {
    currentWord.value.updateSpacing(spacing.value)
  }
})

watch([textInput, fillColor, strokeColor, lineWidth, eyeSize, skipInvalidChars, letterHeight], () => {
  recreateWord()
})

// Lifecycle
onMounted(() => {
  recreateWord()
})

onBeforeUnmount(() => {
  clearWord()
})
</script>

<style scoped>
.words-debug-container {
  display: flex;
  gap: 30px;
  padding: 20px;
  font-family: sans-serif;
  min-height: 100vh;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
  border: 1px solid #eee;
  padding: 20px;
  border-radius: 8px;
  height: fit-content;
  min-width: 320px;
  max-width: 400px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background: white;
}

.control-section {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  background: #fafafa;
}

.control-section h4 {
  margin: 0 0 10px 0;
  font-size: 0.9em;
  color: #444;
}

.controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.9em;
  margin-bottom: 8px;
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}

.controls input[type="text"],
.controls input[type="number"],
.controls input[type="color"],
.controls input[type="range"] {
  padding: 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9em;
}

.controls input[type="color"] {
  height: 32px;
  padding: 2px;
}

.range-value {
  font-size: 0.8em;
  color: #666;
  text-align: right;
}

.controls-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.control-item {
  flex: 1;
  min-width: 0;
}

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action-buttons button {
  padding: 8px 12px;
  background-color: #4dabf7;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background-color 0.2s;
}

.action-buttons button:hover {
  background-color: #339af0;
}

.debug-info {
  font-size: 0.85em;
  color: #555;
}

.debug-info p {
  margin: 4px 0;
}

.word-display-area {
  flex-grow: 1;
  border: 2px dashed #4dabf7;
  border-radius: 8px;
  padding: 20px;
  background: #f8f9ff;
  overflow: auto;
}

.word-container {
  min-height: 120px;
  height: v-bind(letterHeight + 'px');
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ensure letter wrappers and SVGs size properly */
.word-container :deep(.letterpeople-word) {
  display: flex;
  align-items: center;
  gap: inherit;
}

.word-container :deep(.letterpeople-letter-wrapper) {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 50px;
  /* Width is now set dynamically by Word.ts based on letter + arm padding */
}

.word-container :deep(.letterpeople-letter-wrapper svg) {
  /* SVG positioning and sizing now handled by Word.ts */
  max-width: 80px;
  max-height: 80px;
}

.hand-positions {
  margin-top: 20px;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.hand-positions h4 {
  margin: 0 0 10px 0;
  color: #444;
}

.hand-info {
  display: flex;
  gap: 15px;
  margin-bottom: 8px;
  font-size: 0.85em;
  font-family: monospace;
}

.hand-info strong {
  min-width: 60px;
}

.hand-info span {
  color: #666;
}
</style>