<!--
  SoundRail — a groove under a word that the speaker "puck" sits in and slides
  through, with one milestone per sound (a GPC team: s+h, a-e).

  One of the two sound-cue styles (see soundRail.ts); lessons show it in place
  of the overhead audio button, and /dbg/lesson/gesture is its bench.

  Presentational: useSoundRail.ts works out what it draws (geometry in the px
  space of this element's offset parent, milestone states, the speaker); bind
  its `view` with v-bind. Taps and drags on the rail fall
  through to whatever is under it (the owner reads them on the stage, as
  useLessonRunner does). Only the speaker itself can take the pointer, when
  `interactive`: it hands every event to the owner, which decides tap vs drag.
-->

<template>
  <div
    class="sound-rail"
    :style="{
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    }"
    :aria-hidden="interactive ? undefined : 'true'"
  >
    <div v-if="fillTo !== null" class="sound-rail__fill" :style="{ width: `${Math.max(0, fillTo - left)}px` }" />

    <template v-for="seg in segments" :key="seg.key">
      <!-- A team whose letters don't touch (a-e): a bracket joins its pads, passing
           under the pads between them, in the rail's bottom margin -->
      <div
        v-for="(b, k) in bridges(seg)"
        :key="`${seg.key}-b${k}`"
        class="sound-rail__bridge"
        :class="`sound-rail__bridge--${seg.state}`"
        :style="{ left: `${b.left - left}px`, width: `${b.width}px`, '--c': seg.color }"
      />
      <div
        v-for="(p, k) in seg.pads"
        :key="`${seg.key}-p${k}`"
        class="sound-rail__pad"
        :class="`sound-rail__pad--${seg.state}`"
        :style="{ left: `${p.left - left}px`, width: `${p.width}px`, '--c': seg.color }"
      >
        <span v-if="k === 0 && seg.mark" class="sound-rail__mark">
          <v-icon v-if="seg.mark === 'speaker'" size="18">mdi-volume-medium</v-icon>
          <template v-else>{{ seg.mark.key }}</template>
        </span>
      </div>
    </template>

    <button
      v-if="puck"
      type="button"
      tabindex="-1"
      aria-label="Play sound"
      class="sound-rail__puck"
      :class="{
        'sound-rail__puck--playing': puck.playing,
        'sound-rail__puck--interactive': interactive,
        'sound-rail__puck--pressed': (pressed || puck.pressed) && !puck.held,
        'sound-rail__puck--held': puck.held,
      }"
      :style="{
        left: `${puck.left - left}px`,
        width: `${puck.width}px`,
        '--settle': SETTLE.easing,
        '--settle-ms': `${SETTLE.ms}ms`,
      }"
      @pointerdown.prevent="onDown"
      @pointermove="$emit('puck-move', $event)"
      @pointerup="$emit('puck-up', $event)"
      @pointercancel="$emit('puck-cancel', $event)"
      @click="$emit('puck-click', $event)"
    >
      <span
        class="sound-rail__cap"
        :style="{
          backgroundColor: puck.color ?? '#2196f3',
          transform: puck.stretch ? `scale(${1 + puck.stretch}, ${1 - puck.stretch * 0.6})` : undefined,
        }"
      >
        <v-icon size="22">mdi-volume-high</v-icon>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { RailPuck, RailSegment, RailSpan } from './soundRail';
import { springEasing } from '../utils/springMotion';

/**
 * The speaker setting down after a press or a drag: a spring with a little
 * give (it dips about 10% past rest and comes back), baked into a CSS easing
 * so the browser runs it with no per-frame JS. (Its position and width are
 * springs too, in useSoundRail.)
 */
const SETTLE = springEasing({ stiffness: 420, damping: 24 });

/**
 * A press on the speaker, seen here so every owner gets the keycap push
 * (the owner only gets the events). Released by any pointerup on the page:
 * the owner may have captured the pointer elsewhere.
 */
const pressed = ref(false);
function release(): void {
  pressed.value = false;
  window.removeEventListener('pointerup', release, true);
  window.removeEventListener('pointercancel', release, true);
}
function onDown(e: PointerEvent): void {
  pressed.value = true;
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  emit('puck-down', e);
}
onBeforeUnmount(release);

const emit = defineEmits<{
  (e: 'puck-down', ev: PointerEvent): void;
  (e: 'puck-move', ev: PointerEvent): void;
  (e: 'puck-up', ev: PointerEvent): void;
  (e: 'puck-cancel', ev: PointerEvent): void;
  /** A plain click: for an owner whose speaker is only a button (no drag). */
  (e: 'puck-click', ev: MouseEvent): void;
}>();

withDefaults(
  defineProps<{
    left: number;
    top: number;
    width: number;
    height: number;
    segments: RailSegment[];
    puck?: RailPuck | null;
    /** x the rail is "used up" to (a drag's or a word playback's progress), or null. */
    fillTo?: number | null;
    /** The speaker takes the pointer (and emits puck-*). Off: it's drawn only. */
    interactive?: boolean;
  }>(),
  { puck: null, fillTo: null, interactive: false },
);

function bridges(seg: RailSegment): RailSpan[] {
  const out: RailSpan[] = [];
  for (let k = 1; k < seg.pads.length; k++) {
    // centre to centre: its two legs rise into the pads it joins
    const from = seg.pads[k - 1].left + seg.pads[k - 1].width / 2;
    out.push({ left: from, width: Math.max(0, seg.pads[k].left + seg.pads[k].width / 2 - from) });
  }
  return out;
}
</script>

<style scoped>
.sound-rail {
  position: absolute;
  z-index: 4;
  pointer-events: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.07);
  /* carved in: shaded upper lip, lit lower lip */
  box-shadow:
    inset 0 3px 6px rgba(0, 0, 0, 0.22),
    inset 0 -1px 0 rgba(255, 255, 255, 0.8),
    0 1px 0 rgba(255, 255, 255, 0.9);
  /* From one group of letters to the next, rail, pads and speaker glide as one */
  transition:
    left 0.28s ease-out,
    top 0.28s ease-out,
    width 0.28s ease-out;
}

.sound-rail__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}

.sound-rail__pad {
  position: absolute;
  top: 6px;
  bottom: 6px;
  box-sizing: border-box;
  border-radius: 999px;
  border: 3px solid color-mix(in srgb, var(--c) 70%, transparent);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  transition:
    left 0.28s ease-out,
    width 0.28s ease-out,
    background-color 0.18s ease-out,
    border-color 0.18s ease-out,
    opacity 0.18s ease-out,
    transform 0.18s ease-out;
}
/* A milestone that plays on its own: its key, or a small speaker, in the middle */
.sound-rail__pad {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* A number key: a little keycap, as on the keyboard (whose own number keys
   can't show beside the letters), in the milestone's colour */
.sound-rail__mark {
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  color: white;
  background: var(--c);
  box-shadow:
    0 2px 2px rgba(0, 0, 0, 0.25),
    inset 0 -2px 0 rgba(0, 0, 0, 0.25);
  translate: 0 -1px;
}
/* A touch screen: a small speaker, no cap */
.sound-rail__mark:has(.v-icon) {
  background: none;
  box-shadow: none;
  color: var(--c);
}
.sound-rail__pad--fired .sound-rail__mark:has(.v-icon),
.sound-rail__pad--speaking .sound-rail__mark:has(.v-icon) {
  color: white;
}
/* Pressed while its sound plays */
.sound-rail__pad--speaking .sound-rail__mark:not(:has(.v-icon)) {
  translate: 0 1px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.25);
  outline: 2px solid white;
}
.sound-rail__pad--held {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 40%, white);
}
.sound-rail__pad--fired {
  border-color: var(--c);
  background: var(--c);
}
.sound-rail__pad--speaking {
  border-color: var(--c);
  background: var(--c);
  transform: scaleY(1.18);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c) 80%, transparent);
}
.sound-rail__pad--quiet {
  border-style: dotted;
  opacity: 0.35;
}

/* Pads end 6px above the rail's floor. The bracket's legs start there and it
   loops out below the rail, so it is plain to see and never crosses a pad
   (or the speaker resting on one) that it passes. */
.sound-rail__bridge {
  position: absolute;
  bottom: -12px;
  height: 19px;
  box-sizing: border-box;
  border: 4px solid var(--c);
  border-top: none;
  border-radius: 0 0 12px 12px;
  transition:
    left 0.28s ease-out,
    width 0.28s ease-out,
    border-color 0.18s ease-out;
}
.sound-rail__bridge--quiet {
  opacity: 0.35;
}

/* The speaker: the same keycap as the audio button it replaces, standing a
   little proud of the groove it rides in.
   Layers, so no two motions fight over one property:
     - the button: where it is and how wide (left/width: useSoundRail's
       springs, set every frame, no CSS transition), and the press and lift
       (translate/scale, CSS, settling on a spring);
     - the cap: what it looks like (colour, shadow), its stretch at speed
       (transform, inline) and the playing pulse (scale, keyframes). */
.sound-rail__puck {
  position: absolute;
  top: -4px;
  bottom: -4px;
  box-sizing: border-box;
  border: none;
  padding: 0;
  background: none;
  pointer-events: none;
  translate: 0 0;
  scale: 1;
  transition:
    translate var(--settle-ms) var(--settle),
    scale var(--settle-ms) var(--settle);
}
.sound-rail__cap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  border-radius: 12px;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.3),
    inset 0 -4px 0 rgba(0, 0, 0, 0.25);
  transition:
    background-color 0.28s ease-out,
    box-shadow 0.2s ease-out,
    filter 0.2s ease-out;
}
.sound-rail__puck--interactive {
  pointer-events: auto;
  cursor: pointer;
  touch-action: none; /* a drag that starts on it must not scroll */
}
/* Pressed: pushed into the groove at once, as the keycap it replaces */
.sound-rail__puck--pressed {
  translate: 0 3px;
  transition: translate 0.06s ease-out;
}
.sound-rail__puck--pressed .sound-rail__cap {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    inset 0 -2px 0 rgba(0, 0, 0, 0.25);
  filter: brightness(0.93);
  transition:
    background-color 0.28s ease-out,
    box-shadow 0.06s ease-out,
    filter 0.06s ease-out;
}
/* Held and moving: picked up off the groove, a little bigger, its shadow
   further below it */
.sound-rail__puck--held {
  translate: 0 -5px;
  scale: 1.08;
  transition:
    translate 0.12s ease-out,
    scale 0.12s ease-out;
}
.sound-rail__puck--held .sound-rail__cap {
  box-shadow:
    0 12px 16px rgba(0, 0, 0, 0.22),
    inset 0 -4px 0 rgba(0, 0, 0, 0.25);
  transition:
    background-color 0.28s ease-out,
    box-shadow 0.12s ease-out;
}
.sound-rail__puck--playing .sound-rail__cap {
  animation: sound-rail-pulse 1s infinite;
}
@keyframes sound-rail-pulse {
  0%,
  100% {
    scale: 1;
  }
  50% {
    scale: 1.06;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sound-rail__puck--playing .sound-rail__cap {
    animation: none;
  }
}
</style>
