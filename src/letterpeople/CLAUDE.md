# LetterPeople Library

This file provides comprehensive guidance for Claude Code when working with the LetterPeople library - an interactive TypeScript library for creating animated letter characters with faces and body language.

## Overview

LetterPeople creates personified letter characters by rendering SVG letters with animated attachments (eyes, mouth, arms). Each letter becomes an interactive character capable of emotions, expressions, and gestures through a rich animation API.

## Architecture Layers

The library has **three main abstraction levels** for controlling letters and animations:

### Level 1: Individual Letters (`LetterInstance`)
Direct access to single letter characters with full attachment control.

### Level 2: Word Collections (`Word` class)
Manages groups of letters as cohesive units with spacing, layout, and batch operations.

### Level 3: Vue Components (`WordDisplay.vue`)
Reactive Vue wrapper for `Word` class with props, events, and Vue lifecycle integration.

## Directory Structure

```
src/
├── index.ts                  # Main entry point - createLetter() API
├── Word.ts                   # Word class for managing letter collections
├── types.ts                  # Core type definitions and interfaces
├── attachments/              # Attachment system
│   ├── types.ts             # Attachment interfaces (BaseAttachment, etc.)
│   ├── BaseController.ts    # Abstract base class for attachments
│   ├── eye.ts               # Eye creation and EyeController
│   ├── eyebrow.ts           # Eyebrow creation and EyebrowController
│   ├── mouth.ts             # Mouth creation and MouthController
│   ├── arms.ts              # Arms creation and ArmsController
│   └── body.ts              # BodyController for whole-letter transforms
├── letters/                 # Letter renderers (A-Z, a-z)
│   ├── CONSTS.ts            # Shared constants for letter sizing
│   ├── A-uppercase.ts       # Uppercase A renderer
│   ├── a-lowercase.ts       # Lowercase a renderer
│   └── ...                  # Additional letter renderers
├── punctuation/             # Punctuation renderers
│   ├── period.ts
│   ├── comma.ts
│   ├── exclamation.ts
│   └── ...
├── transforms/              # Geometric transformation functions
│   ├── index.ts             # Transform registry and exports
│   ├── jiggle.ts            # Jiggle/shake effect
│   ├── scatter.ts           # Random positioning
│   ├── fan.ts               # Arc/curve arrangements
│   ├── color.ts             # Color transformations
│   ├── perspective.ts       # 3D perspective effects
│   ├── compose.ts           # Transform composition utilities
│   ├── locomotion/          # Movement animations
│   │   ├── index.ts         # Locomotion exports
│   │   ├── jump.ts          # Squash-and-stretch jump
│   │   └── walk.ts          # Bouncy waddle walk
│   └── juggling/            # Juggling animation system
│       ├── index.ts         # Main API - animateJuggling()
│       ├── prepare.ts       # Ball physics and animation preparation
│       ├── hands.ts         # Hand path extraction from ball animations
│       ├── coordinate-mapping.ts  # Sani.js to letter space conversion
│       ├── ball-renderer.ts # Ball rendering and positioning
│       ├── interpolations.ts # Hand path interpolation algorithms
│       ├── physics.ts       # Kinematic equations
│       ├── spline.ts        # Cubic spline interpolation
│       └── types.ts         # TypeScript interfaces
├── util/                    # Utility functions
│   ├── geometry.ts          # Geometric calculations and primitives
│   ├── drawing.ts           # SVG drawing helpers
│   ├── circle-letter-utils.ts # Specialized utilities for circular letters
│   └── color.ts             # Color generation and manipulation
└── vue/                     # Vue.js integration
    ├── WordDisplay.vue      # Main Vue component for words
    └── types.ts             # Vue-specific type definitions
```

## Level 1: Individual Letters (LetterInstance)

### Creating Letters

```typescript
import { createLetter } from './letterpeople'

function createLetter(
  letter: string,           // Character to render ('A', 'b', etc.)
  target: Element,          // DOM container element
  options?: LetterOptions   // Configuration options
): LetterInstance | null    // Returns null if letter not implemented
```

### LetterOptions Interface

```typescript
interface LetterOptions {
  // Base letter styling
  color?: string;           // Fill color (default: '#faf')
  borderColor?: string;     // Outline color (default: 'black')
  lineWidth?: number;       // Letter stroke thickness (default: 20)
  borderWidth?: number;     // Outline width (default: 4)
  style?: "sans-serif" | "serif";  // Currently noop

  // Attachment visibility (all default to false for clean text mode)
  showEyes?: boolean;
  showMouth?: boolean;
  showArms?: boolean;

  // Debug features
  debug?: boolean;          // Show baseline indicators and attachment points

  // Attachment configuration
  eyeSize?: number;         // Eye radius (default: 4)
  mouthParams?: Partial<MouthParameters>;
  mouthAppearance?: Partial<MouthAppearanceOptions>;
  armLength?: number;       // Arm length (default: 15)
  armThickness?: number;    // Arm stroke width (default: 3)
  armColor?: string;        // Arm color (default: borderColor)
}
```

### LetterInstance Interface

The object returned by `createLetter()`:

```typescript
interface LetterInstance {
  // Core properties
  readonly svgElement: SVGElement;      // Root SVG element
  readonly character: string;           // Letter character ('A', 'b', etc.)
  readonly parentElement: Element;      // Container element
  readonly attachmentCoords: AttachmentList; // Attachment point coordinates

  // Attachment controllers - DIRECT ACCESS for animations
  readonly mouth: MouthAttachment;
  readonly eyes: EyesAttachment;
  readonly arms: ArmsAttachment;

  // Appearance updates
  updateAppearance(
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams
  ): Promise<void>;

  // Utility methods
  getBoundingRect(): DOMRect;
  getCenter(): { x: number; y: number };
  destroy(): void;
}
```

### Attachment Controllers (The Animation API)

#### Eyes System

**EyesAttachment** - Controls both eyes as a group:

```typescript
interface EyesAttachment extends BaseAttachment {
  left: EyeAttachment;      // Individual left eye controller
  right: EyeAttachment;     // Individual right eye controller

  // Group operations
  blink(options?: AnimationParams): Promise<void>;
  lookAt(direction: {x: number, y: number} | number, options?: AnimationParams): Promise<void>;
  startTracking(options?: {intensity?: number, ease?: string}): void;
  stopTracking(): void;
  isTracking(): boolean;

  // BaseAttachment methods
  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;
}
```

**EyeAttachment** - Controls individual eyes:

```typescript
interface EyeAttachment extends BaseAttachment {
  wink(options?: AnimationParams): Promise<void>;
  lookAt(direction: {x: number, y: number} | number, options?: AnimationParams): Promise<void>;
  getPupilPosition(): {x: number, y: number};
  startTracking(options?: {intensity?: number, ease?: string}): void;
  stopTracking(): void;
  isTracking(): boolean;
}
```

#### Mouth System

**MouthAttachment** - Controls mouth shape and animations:

```typescript
interface MouthAttachment extends BaseAttachment {
  updateShape(params: Partial<MouthParameters>, options?: AnimationParams): Promise<void>;
  getCurrentShapeParams(): MouthParameters;
  animateSpeak(options?: AnimationParams): Promise<void>;
}

interface MouthParameters {
  openness: number;         // 0-1: closed to fully open
  mood: number;             // 0-1: frown to smile
}
```

#### Arms System

**ArmsAttachment** - Controls both arms as a group:

```typescript
interface ArmsAttachment {
  left: ArmAttachment;      // Individual left arm controller
  right: ArmAttachment;     // Individual right arm controller

  // Group operations
  wave(options?: AnimationParams): Promise<void>;

  // BaseAttachment methods
  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;
  isAnimating(): boolean;
  stopAnimations(): void;
}
```

**ArmAttachment** - Controls individual arms with advanced positioning:

```typescript
interface ArmAttachment extends BaseAttachment {
  rotateTo(angle: number, options?: AnimationParams): Promise<void>;
  wave(options?: AnimationParams): Promise<void>;
  setLength(newLength: number, options?: AnimationParams): Promise<void>;

  // Advanced positioning API
  getCurrentAngle(): number;
  getCurrentLength(): number;
  getShoulderPosition(): Point;
  getHandPosition(): Point;
  setHandPosition(target: Point, options?: AnimationParams): Promise<void>;
}
```

#### Legs System

**LegsAttachment** - Renders legs from hip attachment points to a fixed floor, with skew-reactive sync:

```typescript
interface LegsAttachment {
  readonly element: SVGGElement;

  show(options?: AnimationParams): Promise<void>;
  hide(options?: AnimationParams): Promise<void>;
  isVisible(): boolean;

  // rAF sync loop — polls body.getCurrentSkew() and repositions legs
  startSync(): void;
  stopSync(): void;
  isSyncing(): boolean;
  syncOnce(): void;

  // Floor / foot configuration
  setFloorY(y: number): void;
  getFloorY(): number;
  setFootPositions(left: Point, right: Point): void;
  getFootPositions(): { left: Point; right: Point };

  destroy(): void;
}
```

**Key design:** Legs live inside the skewed SVG (same transform context as body).
Hip coords are plain SVG-local — body skewX moves them on screen automatically.
Foot coords are compensated each frame (`local_x = screen_x − y·tan(θ)`) so feet
stay planted while hips sway. Legs render as quadratic bezier curves with a
configurable knee bend.

**Options:** `showLegs`, `legColor`, `legThickness`, `legFootRadius`, `legKneeBend`, `legFloorY` on `LetterOptions`.

### Example: Animating Individual Letters

```typescript
const letterH = createLetter('H', container, {
  color: '#FF6B6B',
  showEyes: false,  // Start hidden
  showMouth: false,
  showArms: false
});

if (letterH) {
  // Sequenced animation
  await letterH.eyes.show({ duration: 300 });
  await letterH.mouth.show({ duration: 300 });
  await letterH.arms.show({ duration: 300 });
  await letterH.arms.wave({ duration: 600 });

  // Start idle behavior
  letterH.eyes.startTracking({ intensity: 0.5 });
}
```

## Level 2: Word Collections (`Word` class)

The `Word` class manages groups of letters with layout, spacing, and batch operations.

### Creating Words

```typescript
import { Word } from './letterpeople/Word';

const word = new Word(text, container, options);
```

### WordOptions Interface

```typescript
interface WordOptions {
  spacing?: number;                    // Fixed spacing between letters (default: 10px)
  letterOptions?: LetterOptions;       // Default options applied to all letters
  skipInvalidChars?: boolean;          // Skip unsupported characters (default: true)
}
```

### Word Class API

```typescript
class Word {
  readonly letters: LetterInstance[];  // Array of all letter instances
  readonly element: HTMLElement;       // Container element
  readonly text: string;               // Original text
  readonly length: number;             // Number of letter instances
  readonly characters: string[];       // Array of letter characters

  // Letter access
  getLetter(index: number): LetterInstance | null;
  getLetterByChar(char: string, occurrence?: number): LetterInstance | null;

  // Layout control
  updateSpacing(spacing: number): void;
  setLetterZIndex(index: number, zIndex: number): void;
  bringLetterToFront(index: number): void;
  sendLetterToBack(index: number): void;

  // Utility
  getBoundingRect(): DOMRect;
  get container(): HTMLElement;
  destroy(): void;

  // Iterator support
  [Symbol.iterator](): Iterator<LetterInstance>;
}
```

### Example: Animating Words

```typescript
const word = new Word("Hello!", container, {
  spacing: 15,
  letterOptions: {
    color: randomVibrancyColor(),
    lineWidth: 22,
    borderWidth: 4,
    showArms: false,
    showEyes: false,
    showMouth: false
  }
});

// Animate each letter sequentially
for (let i = 0; i < word.length; i++) {
  const letter = word.getLetter(i);
  if (letter) {
    await letter.eyes.show({ duration: 300 });
    await letter.mouth.show({ duration: 300 });
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Wave all arms simultaneously
const wavePromises = [];
for (const letter of word) {
  wavePromises.push(
    letter.arms.show({ duration: 300 }).then(() =>
      letter.arms.wave({ duration: 600 })
    )
  );
}
await Promise.all(wavePromises);
```

## Level 3: Vue Integration (`WordDisplay` Component)

The Vue wrapper provides reactive bindings and lifecycle management.

### WordDisplay Component API

```vue
<WordDisplay
  text="Hello!"
  :height="200"
  :max-width="600"
  :options="wordOptions"
  :transform-fn="transformFn"
  @word-created="onWordCreated"
/>
```

### Props

```typescript
interface WordDisplayProps {
  text: string;                       // Text to render
  options?: WordOptions;              // Word-level options
  letterOptions?: { [index: number]: Partial<LetterOptions> }; // Per-letter overrides
  height?: number;                    // Container height (default: 100px)
  maxWidth?: number;                  // Max width - auto-scales if exceeded
  accessibilityText?: string;         // Screen reader text
  screenReaderMode?: boolean;         // Show only screen reader content
  transformFn?: TransformFunction;    // Geometric transformation
}
```

### Events

```typescript
interface WordDisplayEmits {
  (e: "wordCreated", instance: Word): void;
  (e: "wordDestroyed"): void;
  (e: "letterUpdated", payload: {
    index: number,
    options: Partial<LetterOptions>,
    completed: boolean
  }): void;
  (e: "textChanged", payload: { oldText: string, newText: string }): void;
  (e: "transformApplied", transformFn: TransformFunction): void;
  (e: "transformRemoved"): void;
}
```

### Exposed Methods

```typescript
// Access via ref
const wordDisplayRef = ref<InstanceType<typeof WordDisplay>>();

// Methods exposed via defineExpose()
wordDisplayRef.value.getWordInstance(): Word | null;
wordDisplayRef.value.getLetterInstance(index: number): LetterInstance | null;
wordDisplayRef.value.getTextLength(): number;
wordDisplayRef.value.updateLetterAppearance(index, options, animationParams?): Promise<void>;
wordDisplayRef.value.updateAllLettersAppearance(options, animationParams?): Promise<void>;
wordDisplayRef.value.animateSequence(optionsArray): Promise<void>;
wordDisplayRef.value.animateStagger(options, baseAnimationParams?, staggerDelay?): Promise<void>;
```

### Example: Vue Component Usage

```vue
<script setup lang="ts">
import { ref } from 'vue';
import WordDisplay from '@/letterpeople/vue/WordDisplay.vue';
import type { Word } from '@/letterpeople/Word';

const wordInstance = ref<Word | null>(null);

const wordOptions = {
  spacing: 20,
  letterOptions: {
    color: '#FF6B6B',
    lineWidth: 22,
    borderWidth: 4,
    showArms: false,
    showEyes: false,
    showMouth: false
  }
};

const onWordCreated = async (word: Word) => {
  wordInstance.value = word;

  // Custom animation sequence
  for (let i = 0; i < word.length; i++) {
    const letter = word.getLetter(i);
    if (letter) {
      await letter.eyes.show({ duration: 300 });
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
};
</script>

<template>
  <WordDisplay
    text="Hello!"
    :height="200"
    :max-width="600"
    :options="wordOptions"
    @word-created="onWordCreated"
  />
</template>
```

## Transform Functions

Transform functions provide geometric letter positioning and effects. They work with `Word` instances.

### Transform Function Pattern

```typescript
type TransformFunction = (word: Word) => (() => void) | void;
```

All transforms:
- Accept configuration options
- Return a function that takes a `Word` instance
- Return an optional undo function for cleanup
- Can be composed together

### Available Transforms

```typescript
import {
  createJiggleTransform,
  createScatterTransform,
  createFanTransform,
  createRainbowTransform,
  createColorTransform,
  createPerspectiveTransform,
  composeTransforms,
  composeTransformsSequential
} from '@/letterpeople/transforms';
```

### Transform Examples

```typescript
// Jiggle: Random rotation/position variations
const jiggle = createJiggleTransform({
  intensity: 5,           // Displacement range in px
  rotationRange: 15,      // Rotation range in degrees
  duration: 800,          // Animation duration
  ease: 'outElastic(1, .8)',
  stagger: 20            // Delay between letters
});

// Rainbow: Apply rainbow colors across letters
const rainbow = createRainbowTransform({
  duration: 500,
  animate: true          // Animate color transitions
});

// Fan: Arc arrangement
const fan = createFanTransform({
  radius: 300,           // Arc radius
  angleRange: 180,       // Total arc angle
  duration: 600,
  ease: 'outQuad'
});

// Compose multiple transforms
const combined = composeTransforms(rainbow, jiggle);
```

### Using Transforms with WordDisplay

```vue
<script setup lang="ts">
import { createJiggleTransform, createRainbowTransform, composeTransforms } from '@/letterpeople/transforms';

const jiggle = createJiggleTransform({ intensity: 5 });
const rainbow = createRainbowTransform({ duration: 0, animate: false });
const combinedTransform = composeTransforms(rainbow, jiggle);
</script>

<template>
  <WordDisplay
    text="Hello!"
    :transform-fn="combinedTransform"
  />
</template>
```

## Juggling Animation

The juggling transform animates letters juggling patterns using siteswap notation. It provides physics-based ball trajectories with synchronized arm movements.

### Basic Usage

```typescript
import { animateJuggling } from '@/letterpeople/transforms/juggling';
import { createLetter } from '@/letterpeople';

// Create letter with arms visible
const letter = createLetter('J', container, {
  showArms: true,
  armLength: 17
});

// Animate 3-ball cascade
const cleanup = await animateJuggling(letter, "3", {
  loop: true,
  beatDuration: 300,
  dwell: 0.4
});

// Stop animation when done
cleanup();
```

### Juggling Options

```typescript
interface JugglingOptions {
  loop?: boolean;              // Repeat indefinitely (default: false)
  beatDuration?: number;       // Duration of one beat in ms (default: 300)
  dwell?: number;              // Time ball spends in hand 0-1 (default: 0.4)
  reversed?: boolean;          // Reverse cascade style (default: false)
  isPaused?: () => boolean;    // Pause control function
  shouldStep?: () => boolean;  // Step one frame when paused
}
```

### Siteswap Patterns

Common juggling patterns:
- `"3"` - 3-ball cascade (basic juggling)
- `"441"` - 3-ball pattern with pause
- `"531"` - 3-ball pattern with high/low throws
- `"423"` - 3-ball pattern variation
- `"97531"` - 5-ball pattern (complex)

Pattern characteristics:
- **Async patterns** (single digit): "3", "5", "7"
- **Sync patterns** (pairs): "[43]", "[22]"
- **Valid patterns**: Average must be an integer (number of balls)

### Advanced Control

```typescript
// With pause/resume control
let paused = false;
let stepRequested = false;

const cleanup = await animateJuggling(letter, "441", {
  loop: true,
  beatDuration: 250,
  dwell: 0.5,
  reversed: false,
  isPaused: () => paused,
  shouldStep: () => {
    if (stepRequested) {
      stepRequested = false;
      return true;
    }
    return false;
  }
});

// Toggle pause
paused = !paused;

// Step forward one frame
stepRequested = true;
```

### Speed and Style Control

```typescript
// Slow motion
await animateJuggling(letter, "3", {
  beatDuration: 500,  // Slower throws
  dwell: 0.6          // Longer catches
});

// Fast juggling
await animateJuggling(letter, "531", {
  beatDuration: 150,  // Faster throws
  dwell: 0.3          // Quicker catches
});

// Reversed cascade (throw over-top instead of inside)
await animateJuggling(letter, "3", {
  reversed: true
});
```

### Error Handling

```typescript
try {
  const cleanup = await animateJuggling(letter, pattern, options);
} catch (error) {
  // Errors thrown for:
  // - Invalid siteswap patterns
  // - Patterns requiring > 2 hands
  // - Empty patterns (no throws)
  console.error('Juggling error:', error.message);
}
```

### Implementation Details

The juggling system:
1. **Parses siteswap** using siteswap.js library
2. **Calculates ball physics** using kinematic equations with gravity
3. **Extracts hand paths** from ball catch animations
4. **Maps coordinates** from physics space to letter SVG space
5. **Animates arms** to follow hand paths at 60fps
6. **Renders balls** as SVG circles synchronized with arms

Coordinate systems:
- **Physics space**: Y-up, abstract units, origin at bottom-left
- **Letter space**: Y-down, SVG pixels, origin at top-left
- **Stage**: Centered between shoulders, sized for throw height

The stage is automatically calculated based on:
- Width: 1.5× shoulder distance
- Height: 1.2× letter height
- Baseline: Shoulder y-coordinate

## Animation System

All animations use **anime.js v4** and return Promises for chaining.

### AnimationParams Interface

```typescript
interface AnimationParams {
  duration?: number;       // Animation duration in ms (default: 250)
  ease?: string;          // Easing function (default: 'outQuad')
  delay?: number;         // Delay before animation starts
  complete?: () => void;  // Callback on completion
}
```

### Common Animation Patterns

```typescript
// Sequential animations
await letter.eyes.show({ duration: 300 });
await letter.mouth.show({ duration: 300 });
await letter.arms.wave({ duration: 600 });

// Parallel animations
await Promise.all([
  letter.eyes.show({ duration: 300 }),
  letter.mouth.show({ duration: 300 })
]);

// Staggered animations across word
for (let i = 0; i < word.length; i++) {
  const letter = word.getLetter(i);
  setTimeout(() => {
    letter.eyes.blink({ duration: 150 });
  }, i * 100); // 100ms stagger
}
```

## Key Differences from Old API

1. **Word class now exists** - Previously had to manage letter arrays manually
2. **WordDisplay uses Word internally** - Not individual wrapped components
3. **Transform functions** - New system for geometric effects
4. **Direct attachment access** - `letter.eyes.show()` instead of `letter.showEyes()`
5. **Promise-based animations** - All animations return Promises for chaining
6. **Advanced arm positioning** - `setHandPosition()` for precise control
7. **Auto-scaling with maxWidth** - WordDisplay handles responsive sizing

## Common Development Patterns

### Creating Timed Letter Animations

```typescript
// Get word instance from WordDisplay
const onWordCreated = (word: Word) => {
  // Animate letter 0 at time 0
  setTimeout(() => {
    word.getLetter(0)?.eyes.show();
  }, 0);

  // Animate letter 1 at time 200ms
  setTimeout(() => {
    word.getLetter(1)?.eyes.show();
  }, 200);

  // Animate letter 2 at time 400ms
  setTimeout(() => {
    word.getLetter(2)?.eyes.show();
  }, 400);
};
```

### Different Animations Per Letter

```typescript
const word = new Word("Hello", container, options);

// Make 'H' wave
word.getLetter(0)?.arms.wave({ duration: 600 });

// Make 'e' blink
word.getLetter(1)?.eyes.blink({ duration: 200 });

// Make 'l's look at each other
const l1 = word.getLetter(2);
const l2 = word.getLetter(3);
if (l1 && l2) {
  const l2Center = l2.getCenter();
  l1.eyes.lookAt({ x: l2Center.x, y: l2Center.y });
}
```

### Responsive Scaling

```vue
<!-- WordDisplay handles auto-scaling -->
<WordDisplay
  text="Hello!"
  :height="letterHeight"
  :max-width="maxWordWidth"
/>

<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';

const display = useDisplay();

const letterHeight = computed(() => {
  if (display.xs.value) return 120;
  if (display.sm.value) return 160;
  return 200;
});

const maxWordWidth = computed(() => {
  return window.innerWidth * 0.8;
});
</script>
```

## Performance Considerations

- **SVG optimization**: Minimal DOM elements per letter
- **Animation batching**: Use `Promise.all()` for parallel animations
- **Memory management**: Call `destroy()` on unused words/letters
- **Transform composition**: Compose transforms before applying to avoid multiple passes
- **Large text**: Word class manages layout efficiently, but consider pagination for very long text

## Locomotion Transforms

The locomotion system provides jump and walk animations for letters and words.

### Jump Transform

Creates a squash-and-stretch jump animation.

```typescript
import { createJumpTransform } from '@/letterpeople/transforms/locomotion';

// Basic usage
const jump = createJumpTransform();
const cleanup = jump(word);

// With options
const jump = createJumpTransform({
  height: 50,           // Jump height in pixels (default: 50)
  duration: 700,        // Total animation duration ms (default: 700)
  squashFactor: 0.7,    // Squash on anticipation/landing (default: 0.7)
  stretchFactor: 1.25,  // Stretch at peak (default: 1.25)
  stagger: 40,          // Delay between letters ms (default: 40)
});
jump(word);
```

**Animation phases**:
1. Anticipation (15%) - Squash down
2. Launch (25%) - Stretch + translate up
3. Air (20%) - Slight relaxation at peak
4. Fall (25%) - Translate down
5. Land (15%) - Squash + elastic recovery

### Walk Transform

Creates a bouncy waddle walking animation (no legs required).

```typescript
import { createWalkTransform } from '@/letterpeople/transforms/locomotion';

// Walk right
const walk = createWalkTransform({
  direction: 'right',   // 'left' | 'right' | 'toward' | 'away'
  speed: 100,           // Pixels per second (default: 100)
  distance: 200,        // Total distance in pixels (default: 200)
  translate: true,      // Actually move, or walk in place (default: true)
  wobbleAngle: 10,      // Rotation angle in degrees (default: 10)
  bobHeight: 6,         // Vertical bob in pixels (default: 6)
  stepDuration: 280,    // Duration of one step ms (default: 280)
  loop: false,          // Loop indefinitely (default: false)
  stagger: 30,          // Delay between letters ms (default: 30)
});

const cleanup = walk(word);

// Stop walking
cleanup();
```

**Directions**:
- `left` / `right`: Lateral movement with wobble
- `toward` / `away`: Depth movement with scaling

## BodyController API

The BodyController handles whole-letter 3D transforms for scene choreography.

### Interface

```typescript
interface BodyController {
  // Core transforms
  turnTo(degrees: number, options?: AnimationParams): Promise<void>;
  lookAt(target: Point | { getCenter(): Point }, options?: AnimationParams): Promise<void>;
  resetPose(options?: AnimationParams): Promise<void>;
  
  // Convenience methods
  faceCamera(options?: AnimationParams): Promise<void>;
  turnToward(target: Point | { getCenter(): Point }, options?: AnimationParams): Promise<void>;
  turnAwayFrom(target: Point | { getCenter(): Point }, options?: AnimationParams): Promise<void>;
  
  // State queries
  getCurrentTurnAngle(): number;
  isFacingCamera(): boolean;
  getFacingDirection(): 'camera' | 'left' | 'right' | 'away';
  getCenter(): Point;
  
  // Animation control
  stopAnimations(): void;
  isAnimating(): boolean;
}
```

### Usage Examples

```typescript
// Get two letters
const H = word.getLetter(0);
const I = word.getLetter(1);

// Face each other
await H.body.turnToward(I, { duration: 300 });
await I.body.turnToward(H, { duration: 300 });

// Turn away from each other
await H.body.turnAwayFrom(I, { duration: 300 });

// Both face camera
await Promise.all([
  H.body.faceCamera({ duration: 300 }),
  I.body.faceCamera({ duration: 300 }),
]);

// Check facing state
if (H.body.isFacingCamera()) {
  console.log('H is facing the camera');
}

console.log(H.body.getFacingDirection()); // 'camera' | 'left' | 'right' | 'away'

// 180° turn (letter becomes edge-on, then mirrored)
await H.body.turnTo(180, { duration: 800 });
```

### Facing Direction Thresholds

- `camera`: |angle| < 15°
- `left`: angle < -15°
- `right`: angle > 15° and < 165°
- `away`: |angle| > 165°

## Eyebrows System

Eyebrows add expressiveness to letter characters with emotion presets.

### Enabling Eyebrows

```typescript
const letter = createLetter('A', container, {
  showEyes: true,
  showEyebrows: true,        // Enable eyebrows (default: false)
  eyebrowsWithEyes: true,    // Auto-show brows when eyes shown (default: true)
});
```

### Expression Presets

```typescript
// Access via eyes attachment
letter.eyes.brows.express('happy', { duration: 300 });

// Available presets: 'neutral', 'happy', 'sad', 'angry', 'surprised'
await letter.eyes.brows.express('surprised');
await letter.eyes.brows.express('angry');
await letter.eyes.brows.express('sad');
await letter.eyes.brows.express('neutral');
```

### Individual Brow Control

```typescript
// Access individual brows
letter.eyes.brows.left.raise(3, { duration: 200 });
letter.eyes.brows.right.lower(2, { duration: 200 });

// Rotate for angled expressions
letter.eyes.brows.left.rotate(10, { duration: 200 });  // Inner end down (angry)
letter.eyes.brows.right.rotate(-10, { duration: 200 });

// Reset to neutral
await letter.eyes.brows.relax({ duration: 300 });
```

### Show/Hide

```typescript
// Eyebrows follow BaseAttachment pattern
await letter.eyes.brows.show({ duration: 300 });
await letter.eyes.brows.hide({ duration: 300 });

// Individual brows
await letter.eyes.brows.left.show({ duration: 200 });
```

## Level 4: Scene Staging (`Stage` & `Actor`)

The Scene Staging system provides a higher-level abstraction for orchestrating multiple characters ("Actors") in a shared space with depth and dialogue.

### Core Concepts

1.  **Stage**: The container and world manager. Handles the "2.5D" projection logic and global balloon layer.
2.  **Actor**: A wrapper around a `LetterInstance` that manages stage position (`x`, `z`), scaling, and speech balloons.
3.  **SpeechBalloon**: Pop-up text bubbles that automatically track their actor.

### 2.5D Coordinate System

The stage uses a simulated depth system:
*   **X (pixels)**: Horizontal position.
*   **Z (0-100)**: Depth value.
    *   `0`: Horizon line (furthest back). Actors are smallest (scale ~0.6) and positioned higher up.
    *   `100`: Stage front. Actors are largest (scale 1.0) and positioned at the bottom.
*   **Z-Index**: Automatically calculated from Z depth so closer actors render in front.

### Basic Usage

```typescript
import { Stage } from '@/letterpeople/scene/Stage';

// Initialize stage
const stage = new Stage(containerElement, {
  width: 800,
  height: 400,
  horizonRatio: 0.3 // Horizon is at 30% of height
});

// Add actors
const actorA = stage.addActor('A', 'A', {
  x: 100,
  z: 50, // Mid-stage
  letterOptions: { color: 'red', showEyes: true }
});

const actorB = stage.addActor('B', 'B', {
  x: 400,
  z: 90, // Front-stage (larger, in front)
  letterOptions: { color: 'blue', showEyes: true }
});

// Direct the scene
await actorA.say("Hello B!");
await actorA.move3D(200, 80, 1000); // Move to x=200, z=80 over 1s
await actorA.lookAt(actorB);
```

### Actor API

```typescript
class Actor {
  // Movement
  move3D(x: number, z: number, duration?: number): Promise<void>;
  
  // Speech
  say(text: string, duration?: number): Promise<void>; // Auto-hides after duration if provided
  silence(): Promise<void>;
  
  // Body Control
  lookAt(target: Actor | { x: number, y: number }): Promise<void>;
  
  // State
  get x(): number;
  get z(): number;
  get instance(): LetterInstance; // Underlying letter
}
```

## Dependencies

- **anime.js**: Animation library (4.1.3+)
- **TypeScript**: Type safety and development experience
- **Vue 3**: Optional integration framework (for WordDisplay component)

This architecture provides a flexible, three-tiered system for creating and animating letter characters. Choose the right level of abstraction for your use case:
- **Individual letters** for fine-grained control
- **Word class** for managing letter collections
- **WordDisplay component** for reactive Vue integration

## Future-Proofing: 3D Compatibility Guidelines

A potential future direction is rendering LetterPeople in true 3D (via Three.js or similar). While we're not implementing this now, new code should avoid patterns that would make such a migration painful. Follow these guidelines:

### 1. Keep Path Data Extractable

Letter geometry should be representable as path data, not just DOM elements.

**Prefer:**
```typescript
// Store path data in a retrievable form
interface LetterGeometry {
  paths: string[];           // SVG path d-strings
  viewBox: [number, number, number, number];
  anchor: { x: number, y: number };
}

// Renderer can serialize geometry
letter.getGeometry(): LetterGeometry;
```

**Avoid:**
```typescript
// Geometry buried in DOM with no extraction path
const path = document.createElementNS(...);
path.setAttribute('d', complexPath);
// ...and the path data is never stored anywhere retrievable
```

### 2. Maintain Coordinate System Consistency

Use predictable coordinate origins and units that map cleanly to 3D space.

**Conventions to follow:**
- Transform origins should be explicit and documented (center, bottom-center, etc.)
- Use consistent units (pixels in SVG space)
- Document the coordinate system in comments when non-obvious
- Avoid browser-specific transform quirks

**Example:**
```typescript
// Good: explicit, documented transform origin
element.style.transformOrigin = `${bounds.width / 2}px ${bounds.height / 2}px`; // center

// Avoid: relying on browser defaults or implicit origins
element.style.transform = 'rotateY(30deg)'; // origin unclear
```

### 3. Document Attachment Anchor Points

Attachment positions (eyes, mouth, arms) should be defined in a serializable, coordinate-based way.

**Prefer:**
```typescript
// Anchors as explicit coordinates relative to letter geometry
interface AttachmentAnchors {
  leftEye: { x: number, y: number };
  rightEye: { x: number, y: number };
  mouth: { x: number, y: number };
  leftShoulder: { x: number, y: number };
  rightShoulder: { x: number, y: number };
}
```

**Avoid:**
```typescript
// Anchors computed on-the-fly from DOM measurements with no stored reference
const eyePos = someElement.getBoundingClientRect(); // ephemeral, not serializable
```

### 4. Separate Animation Data from DOM Manipulation

Animation keyframes and timing should be expressible as data, not just imperative DOM calls.

**Prefer:**
```typescript
// Animation as data
const jumpAnimation = {
  keyframes: [
    { translateY: 0, scaleY: 0.8 },
    { translateY: -50, scaleY: 1.1 },
    { translateY: 0, scaleY: 0.9 },
  ],
  timing: { duration: 700, easing: 'ease-out' }
};

// Then apply to either SVG or 3D
applyAnimation(target, jumpAnimation);
```

**Avoid:**
```typescript
// Animation logic tightly coupled to specific DOM APIs
element.animate([...], { duration: 700 }); // Web Animations API only
```

### 5. Avoid CSS-Only 3D Features That Don't Map to WebGL

Some CSS 3D features have no direct WebGL equivalent.

**Use with caution:**
- `backface-visibility` - concept exists but implementation differs
- `perspective-origin` - works differently in true 3D
- `transform-style: preserve-3d` - CSS-specific compositing

**Safe to use (maps cleanly to 3D):**
- `rotateX/Y/Z` - direct quaternion/euler equivalents
- `translateX/Y/Z` - direct position mapping
- `scale` - direct scale mapping

### 6. Scene/Camera as First-Class Concepts

When implementing scene coordination (see assessment doc), design APIs that would translate to 3D scene graphs.

**Think in terms of:**
- Scene: contains multiple entities, has a camera
- Camera: defines viewpoint (position, rotation, FOV/perspective)
- Entity: has transform (position, rotation, scale) relative to scene

This maps directly to Three.js: `Scene`, `Camera`, `Object3D`.

### Summary

These guidelines don't require extra work now—they're about **avoiding** patterns that would create migration debt. When in doubt, ask: "Could I export this as JSON and reconstruct it in Three.js?" If yes, the pattern is 3D-compatible.
