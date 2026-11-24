<template>
  <div class="gesture-dbg">
    <div class="gesture-dbg__bar">
      <strong>👆 Touch gesture reading</strong>
      <v-autocomplete
        v-model="word"
        :items="words"
        label="Word"
        density="compact"
        hide-details
        auto-select-first
        class="gesture-dbg__word"
      />
      <v-switch
        v-model="wordHeard"
        label="Word already heard (fast sweep may play it)"
        density="compact"
        hide-details
        color="primary"
      />
      <v-switch v-model="soundOn" label="Sound" density="compact" hide-details color="primary" />
      <v-switch v-model="showTrace" label="Trace" density="compact" hide-details color="primary" />
      <v-btn size="small" variant="tonal" @click="clearTrace">Clear trace</v-btn>
    </div>

    <!-- Sound rail prototype (todo-minor #8) -->
    <div class="gesture-dbg__bar">
      <strong>Rail</strong>
      <v-switch v-model="railOn" label="Show" density="compact" hide-details color="primary" />
      <v-select
        v-model="cue"
        :items="cueItems"
        label="Speaker is on"
        density="compact"
        hide-details
        class="gesture-dbg__cue"
      />
      <v-switch v-model="tapAdvances" label="Tapping it moves it on" density="compact" hide-details color="primary" />
      <v-switch v-model="letterTouch" label="Letters take touches too" density="compact" hide-details color="primary" />
      <div class="gesture-dbg__slider gesture-dbg__slider--short">
        <span>Height <b>{{ railHeight }}</b> px</span>
        <v-slider v-model="railHeight" :min="20" :max="72" :step="2" density="compact" hide-details />
      </div>
      <div class="gesture-dbg__slider gesture-dbg__slider--short">
        <span>Gap under letters <b>{{ railGap }}</b> px</span>
        <v-slider v-model="railGap" :min="0" :max="60" :step="2" density="compact" hide-details />
      </div>
    </div>

    <div class="gesture-dbg__tuning">
      <div class="gesture-dbg__slider">
        <span>Fast ≥ <b>{{ config.fastPxPerS }}</b> px/s</span>
        <v-slider v-model="config.fastPxPerS" :min="150" :max="2500" :step="25" density="compact" hide-details />
      </div>
      <div class="gesture-dbg__slider">
        <span>Stall <b>{{ config.stallMs }}</b> ms</span>
        <v-slider v-model="config.stallMs" :min="50" :max="800" :step="10" density="compact" hide-details />
      </div>
      <div class="gesture-dbg__slider">
        <span>Speed smoothing <b>{{ config.speedTauMs }}</b> ms</span>
        <v-slider v-model="config.speedTauMs" :min="5" :max="200" :step="5" density="compact" hide-details />
      </div>
      <div class="gesture-dbg__slider">
        <span>Drag starts at <b>{{ config.dragStartPx }}</b> px</span>
        <v-slider v-model="config.dragStartPx" :min="2" :max="40" :step="1" density="compact" hide-details />
      </div>
      <v-btn size="small" variant="text" @click="resetConfig">Runner defaults</v-btn>
    </div>

    <div
      ref="stageEl"
      class="gesture-dbg__stage"
      :style="{ '--label-drop': `${railOn ? railGap + railHeight + 20 : 0}px` }"
    >
      <div class="gesture-dbg__row">
        <div v-for="(ch, i) in letters" :key="`${word}-${i}`" :ref="(el) => setLetterEl(i, el)" class="gesture-dbg__letter">
          <div class="gesture-dbg__team-label" :style="{ color: teamColor(teamIndexOf(i)) }">
            {{ teamIndexOf(i) >= 0 ? teams[teamIndexOf(i)].label : '' }}
          </div>
        </div>
      </div>

      <SoundRail v-if="railOn && rail.view.value" v-bind="rail.view.value" />

      <!-- Trace: the finger's path coloured by speed (blue slow → red fast, white at the threshold) -->
      <svg v-if="showTrace" class="gesture-dbg__trace" :width="stageSize.w" :height="stageSize.h">
        <line
          v-for="(seg, k) in segments"
          :key="k"
          :x1="seg.x1"
          :y1="seg.y1"
          :x2="seg.x2"
          :y2="seg.y2"
          :stroke="seg.color"
          stroke-width="5"
          stroke-linecap="round"
        />
        <g v-for="(m, k) in markers" :key="`m${k}`">
          <circle
            v-if="m.kind === 'live' || m.kind === 'held'"
            :cx="m.x"
            :cy="m.y"
            r="9"
            :fill="m.kind === 'live' ? '#2e7d32' : 'white'"
            stroke="#2e7d32"
            stroke-width="3"
          />
          <text v-else :x="m.x" :y="m.y - 12" text-anchor="middle" class="gesture-dbg__mark">{{ m.label }}</text>
        </g>
      </svg>
    </div>

    <div class="gesture-dbg__bottom">
      <div class="gesture-dbg__legend">
        <div><b>Speed now:</b> {{ Math.round(speedNow) }} px/s</div>
        <div><span class="dot dot--live" /> team played live (slow)</div>
        <div><span class="dot dot--held" /> team held (fast)</div>
        <div><b>⇣</b> held teams played (slowed / stalled / lifted / before a live one)</div>
        <div><b>★</b> the word</div>
        <div class="gesture-dbg__hint">Tap a letter: its team's sound. Drag: read by speed. Left to right only.</div>
        <div class="gesture-dbg__hint">
          Rail: tap the speaker (or press space) to play what it's on; drag it (or anywhere in the rail) across. Milestones: outlined =
          waiting, pale = reached fast and held, solid = reached, raised = sounding now.
        </div>
      </div>
      <ol class="gesture-dbg__log" reversed>
        <li v-for="(line, k) in log" :key="k">{{ line }}</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * /dbg/lesson/gesture — tune how a finger across a word is read
 * (lessons/touchGesture.ts, used by useLessonRunner's touch replay).
 *
 * Any word from the phonetic index, as SVG LetterPeople coloured by team
 * (GPC chunk). The trace shows the finger's path coloured by smoothed speed
 * against the fast threshold, with a marker for every decision; the log lists
 * them with timings. Sliders change the interpreter's thresholds live;
 * carry settled values back to DEFAULT_GESTURE_CONFIG.
 *
 * Also the bench for the sound rail prototype (lessons/SoundRail.vue,
 * todo-minor #8): a groove under the word holding the speaker and one
 * milestone per team, lit from the same trace. The rail itself is
 * lessons/useSoundRail.ts, the same code lessons run; this page only supplies
 * the letters, the teams and what's playing. The interpreter is untouched; the
 * rail only adds its band to the hit test.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { createLetter, type LetterInstance } from '../letterpeople';
import type { ActorBounds } from '../lessons/lessonActor';
import { applyLetterEffect } from '../letterpeople/animations';
import { oklch } from '../letterpeople/util/color';
import { getAvailableWords, getPhonemeAudioUrl, getPhonetics } from '../services/phonetics';
import SoundRail from '../lessons/SoundRail.vue';
import { RAIL_GAP, RAIL_HEIGHT, slideAt, useSoundRail, type SoundRailModel } from '../lessons/useSoundRail';
import {
  createGestureInterpreter,
  DEFAULT_GESTURE_CONFIG,
  type GestureTrace,
} from '../lessons/touchGesture';

interface Team {
  index: number;
  label: string;
  letters: number[];
  audioUrl: string;
}

const LETTER_HEIGHT = 150;
const PICK_PAD_PX = 14; // as the runner

const words = getAvailableWords().sort();
const word = ref('ship');
const wordHeard = ref(true);
const soundOn = ref(true);
const config = reactive({ ...DEFAULT_GESTURE_CONFIG });

const phonetics = computed(() => getPhonetics(word.value));
const letters = computed(() => (phonetics.value?.word ?? word.value).split(''));
const teams = computed<Team[]>(() =>
  (phonetics.value?.chunks ?? []).map((c, index) => ({
    index,
    label: c.label ?? c.phoneme,
    letters: Object.keys(c.letters).map(Number),
    audioUrl: getPhonemeAudioUrl(c.phoneme),
  })),
);
function teamIndexOf(letter: number): number {
  return teams.value.findIndex((t) => t.letters.includes(letter));
}
function teamColor(team: number): string {
  return team < 0 ? '#bbb' : oklch(0.62, 0.15, (team * 67 + 20) % 360);
}

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------

const stageEl = ref<HTMLElement | null>(null);
const letterEls: (HTMLElement | null)[] = [];
let instances: (LetterInstance | null)[] = [];
function setLetterEl(i: number, el: unknown) {
  letterEls[i] = (el as HTMLElement | null) ?? null;
}

function buildLetters(): void {
  instances.forEach((l) => l?.destroy?.());
  instances = letters.value.map((ch, i) => {
    const el = letterEls[i];
    if (!el) return null;
    el.querySelectorAll('svg').forEach((s) => s.remove());
    const inst = createLetter(ch, el, {
      color: oklch(0.75, 0.13, (teamIndexOf(i) * 67 + 20) % 360),
      lineWidth: 20,
      borderWidth: 4,
      showEyes: true,
      showMouth: true,
      showArms: false,
    });
    if (!inst) return null;
    const svg = inst.svgElement as SVGSVGElement;
    const vb = svg.viewBox?.baseVal;
    el.style.width = `${vb && vb.height ? (LETTER_HEIGHT * vb.width) / vb.height : LETTER_HEIGHT * 0.6}px`;
    svg.style.width = '100%';
    svg.style.height = `${LETTER_HEIGHT}px`;
    return inst;
  });
  measureStage();
}

watch(word, async () => {
  clearTrace();
  clearRail();
  cue.value = CUE_WORD;
  await nextTick();
  buildLetters();
});

// ---------------------------------------------------------------------------
// Audio (a simple queue, as the runner's)
// ---------------------------------------------------------------------------

const queue: (() => Promise<void>)[] = [];
let draining = false;
function playUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.addEventListener('ended', () => resolve());
    a.addEventListener('error', () => resolve());
    a.play().catch(() => resolve());
  });
}
async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    await queue.shift()!();
    if (queue.length) await new Promise((r) => setTimeout(r, 120));
  }
  draining = false;
  if (!pressed) clearRail(); // the milestones a finished gesture lit go back to waiting
}
function enqueue(fn: () => Promise<void>) {
  if (queue.length >= 8) return;
  queue.push(fn);
  void drain();
}

function playTeam(team: Team, after?: () => void) {
  enqueue(async () => {
    rail.speaking.value = team;
    for (const i of team.letters) {
      const inst = instances[i];
      if (inst) void applyLetterEffect(inst, 'speak', { duration: 280 });
    }
    if (soundOn.value) await playUrl(team.audioUrl);
    else await new Promise((r) => setTimeout(r, 350));
    rail.speaking.value = null;
    after?.();
  });
}

/**
 * The word, with the speaker sliding through the rail in time with it. Each
 * team gets an equal slice of the recording's speech window (the same
 * assumption as services/phonetics/speakerTimings): the puck is over a team
 * at the middle of its slice, and the team's mouths open to peak there.
 */
const SPEAK_PEAK_MS = 200;
function playWord(after?: () => void) {
  const url = phonetics.value?.audioUrl;
  enqueue(async () => {
    const ts = teams.value;
    const n = ts.length;
    if (!n) return;
    const audio = soundOn.value && url ? new Audio(url) : null;
    const timing = phonetics.value?.audioTimingMs;
    let start = audio ? (timing?.speechStart ?? 0) : 0;
    let end = audio ? (timing?.speechEnd ?? 0) : Math.max(600, n * 220);
    const clock0 = performance.now();
    const spoken = new Set<number>();
    let raf = 0;
    const tick = () => {
      const t = audio ? audio.currentTime * 1000 : performance.now() - clock0;
      if (end <= start && audio && isFinite(audio.duration)) end = audio.duration * 1000; // no measured window
      if (end > start) {
        const slot = (end - start) / n;
        ts.forEach((team, i) => {
          if (spoken.has(i) || t < start + (i + 0.5) * slot - SPEAK_PEAK_MS) return;
          spoken.add(i);
          for (const li of team.letters) {
            const inst = instances[li];
            if (inst) void applyLetterEffect(inst, 'speak', { duration: 280 });
          }
        });
        slide.value = slideAt(t, start, end, n);
      }
      raf = requestAnimationFrame(tick);
    };
    slide.value = { f: 0, active: -1 };
    tick();
    if (audio) {
      await new Promise<void>((resolve) => {
        audio.addEventListener('ended', () => resolve());
        audio.addEventListener('error', () => resolve());
        audio.play().catch(() => resolve());
      });
    } else await new Promise((r) => setTimeout(r, end + 150));
    cancelAnimationFrame(raf);
    slide.value = null;
    after?.();
  });
}

// ---------------------------------------------------------------------------
// Picking (padded boxes, nearest centre: as the runner)
// ---------------------------------------------------------------------------

function letterBox(i: number): ActorBounds | null {
  const el = letterEls[i];
  const stage = stageEl.value;
  if (!el || !stage) return null;
  const r = el.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { left: r.left - s.left, right: r.right - s.left, top: r.top - s.top, bottom: r.bottom - s.top };
}
function pickLetter(x: number, y: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  letters.value.forEach((_, i) => {
    const b = letterBox(i);
    if (!b) return;
    if (x < b.left - PICK_PAD_PX || x > b.right + PICK_PAD_PX) return;
    // In the rail's band a letter is picked by x alone; on the letters, as the runner
    const onLetter = letterTouch.value && y >= b.top - PICK_PAD_PX && y <= b.bottom + PICK_PAD_PX;
    if (!onLetter && !inRailBand(y)) return;
    const d = Math.abs(x - (b.left + b.right) / 2);
    if (d < bestD) (bestD = d), (best = i);
  });
  return best;
}

// ---------------------------------------------------------------------------
// Sound rail (prototype): geometry from the letters, state from the trace
// ---------------------------------------------------------------------------

const CUE_WORD = -1;
const PUCK_ACCENT = '#2196f3'; // SoundRail's default: the speaker docked before the word

const railOn = ref(true);
const railHeight = ref(RAIL_HEIGHT);
const railGap = ref(RAIL_GAP);
const letterTouch = ref(true);
const tapAdvances = ref(true);
const showTrace = ref(false);
/** What the speaker is on: a team index, or the whole word (docked at the rail's start). */
const cue = ref(CUE_WORD);
const cueItems = computed(() => [
  { title: 'the word', value: CUE_WORD },
  ...teams.value.map((t) => ({ title: `${t.index + 1}: ${t.label}`, value: t.index })),
]);

/** Bumped whenever the letters may have moved (built, resized). */
const geomTick = ref(0);
const boxes = computed(() => {
  void geomTick.value;
  const out = new Map<number, ActorBounds>();
  letters.value.forEach((_, i) => {
    const b = letterBox(i);
    if (b) out.set(i, b);
  });
  return out;
});

/** A word playing (the rail's speaker rides it). */
const slide = shallowRef<{ f: number; active: number } | null>(null);

const rail: SoundRailModel<number> = useSoundRail<number>({
  input: () =>
    railOn.value
      ? {
          boxes: boxes.value,
          teams: teams.value.map((t) => ({ ids: t.letters, key: t })),
          colors: new Map(letters.value.map((_, i) => [i, teamColor(teamIndexOf(i))])),
          dock: true,
          cue: cue.value === CUE_WORD ? null : cue.value,
          slide: slide.value,
        }
      : null,
  accent: () => PUCK_ACCENT,
  playing: (): boolean => !!slide.value || (rail.speaking.value !== null && rail.speaking.value === teams.value[cue.value]),
  height: () => railHeight.value,
  gap: () => railGap.value,
});

function inRailBand(y: number): boolean {
  return rail.inBand(y);
}
function clearRail() {
  rail.clearMarks();
}

/** A tap on the speaker: play what it's on, then (optionally) move on, as a lesson's steps would. */
function playCue() {
  if (draining) return rail.nudge(); // as the button it replaces: not while something is playing
  const n = teams.value.length;
  const from = cue.value;
  // It stays put while its sound plays, and only then moves on
  const after = () => {
    if (!tapAdvances.value || !n || cue.value !== from) return;
    cue.value = from === CUE_WORD ? 0 : from + 1 < n ? from + 1 : CUE_WORD;
  };
  if (from === CUE_WORD) playWord(after);
  else if (teams.value[from]) playTeam(teams.value[from], after);
}

// ---------------------------------------------------------------------------
// Interpreter + trace
// ---------------------------------------------------------------------------

interface Sample {
  t: number;
  x: number;
  y: number;
  speed: number;
  /** Which press it belongs to: the trail never joins two gestures. */
  gid: number;
}
let gid = 0;
const samples = ref<Sample[]>([]);
const markers = ref<{ kind: string; x: number; y: number; label?: string }[]>([]);
const log = ref<string[]>([]);
const speedNow = ref(0);
let t0 = 0;
let lastSample: Sample | null = null;

function clearTrace() {
  samples.value = [];
  markers.value = [];
  log.value = [];
}

function speedColor(v: number): string {
  // blue (slow) → white at the threshold → red (fast)
  const r = Math.max(-1, Math.min(1, Math.log2(Math.max(1, v) / config.fastPxPerS)));
  return r < 0 ? oklch(0.55 + 0.4 * (1 + r), 0.15 * -r, 250) : oklch(0.95 - 0.35 * r, 0.2 * r, 25);
}
const segments = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  const s = samples.value;
  for (let k = 1; k < s.length; k++) {
    if (s[k].gid !== s[k - 1].gid) continue; // a new gesture
    out.push({ x1: s[k - 1].x, y1: s[k - 1].y, x2: s[k].x, y2: s[k].y, color: speedColor(s[k].speed) });
  }
  return out;
});

const logLine = (t: number, text: string) => {
  log.value = [`${Math.round(t - t0).toString().padStart(5)} ms  ${text}`, ...log.value].slice(0, 60);
};

function onTrace(e: GestureTrace<Team>) {
  rail.trace(e); // the milestones follow the reading
  const at = lastSample ?? { x: 0, y: 0 };
  switch (e.kind) {
    case 'sample': {
      const sample = { ...e, gid };
      lastSample = sample;
      speedNow.value = e.speed;
      samples.value = [...samples.value, sample].slice(-600);
      break;
    }
    case 'drag-start':
      logLine(e.t, 'drag');
      break;
    case 'team':
      markers.value = [...markers.value, { kind: e.mode, x: at.x, y: at.y }];
      logLine(e.t, `${e.team.label}  ${e.mode}  @ ${Math.round(e.speed)} px/s`);
      break;
    case 'flush': {
      markers.value = [...markers.value, { kind: 'flush', x: at.x, y: at.y, label: '⇣' }];
      logLine(e.t, `held → play ${e.teams.map((t) => t.label).join(' ')}  (${e.reason})`);
      break;
    }
    case 'word':
      markers.value = [...markers.value, { kind: 'word', x: at.x, y: at.y, label: '★' }];
      logLine(e.t, `WORD "${word.value}"`);
      break;
    case 'end':
      logLine(e.t, 'lift');
      break;
  }
}

const interpreter = createGestureInterpreter<Team>(
  {
    hit: (x, y) => {
      const i = pickLetter(x, y);
      if (i === null) return null;
      const ti = teamIndexOf(i);
      const b = letterBox(i);
      return ti >= 0 && b ? { team: teams.value[ti], centreX: (b.left + b.right) / 2 } : null;
    },
    wordOf: () => (wordHeard.value ? teams.value : null),
    playTeam,
    playWord: () => playWord(),
    trace: onTrace,
  },
  config,
);

// ---------------------------------------------------------------------------
// Pointer wiring
// ---------------------------------------------------------------------------

let pressed: { id: number; x: number; y: number; onSpeaker: boolean } | null = null;
function local(e: PointerEvent) {
  const r = stageEl.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function onDown(e: PointerEvent) {
  if (!e.isPrimary) return;
  const raw = local(e);
  const onSpeaker = railOn.value && rail.onPuck(raw.x, raw.y);
  // A press on the speaker takes hold of it: the gesture is read from the speaker
  const p = rail.press(raw, onSpeaker);
  pressed = { id: e.pointerId, ...p, onSpeaker };
  t0 = e.timeStamp;
  gid++;
  stageEl.value?.setPointerCapture(e.pointerId);
  interpreter.down(p.x, p.y, e.timeStamp);
}
function onMove(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const p = rail.follow(local(e), config.dragStartPx);
  interpreter.move(p.x, p.y, e.timeStamp);
}
function onUp(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const start = pressed;
  pressed = null;
  const p = rail.follow(local(e), config.dragStartPx);
  rail.release();
  if (interpreter.up(p.x, p.y, e.timeStamp)) {
    if (!draining) clearRail(); // a drag that played nothing
    return;
  }
  // A tap: the speaker plays its cue; else a letter (or its milestone) plays its team
  if (start.onSpeaker) {
    logLine(e.timeStamp, `tap speaker → ${cue.value === CUE_WORD ? 'word' : teams.value[cue.value]?.label}`);
    playCue();
    return;
  }
  const i = pickLetter(start.x, start.y);
  const ti = i === null ? -1 : teamIndexOf(i);
  logLine(e.timeStamp, ti >= 0 ? `tap → ${teams.value[ti].label}` : 'tap (nothing)');
  if (ti >= 0) playTeam(teams.value[ti]);
}
function onCancel() {
  pressed = null;
  rail.release();
  clearRail();
  interpreter.cancel();
}

/** Spacebar is the speaker, as the keyboard's advance key is a lesson's audio button. */
function onKey(e: KeyboardEvent) {
  if (e.code !== 'Space' || e.repeat || !railOn.value) return;
  if ((e.target as HTMLElement | null)?.closest?.('input, textarea, button, [role="combobox"], [role="slider"]')) return;
  e.preventDefault();
  logLine(e.timeStamp, `space → ${cue.value === CUE_WORD ? 'word' : teams.value[cue.value]?.label}`);
  playCue();
}

const stageSize = reactive({ w: 0, h: 0 });
function measureStage() {
  const el = stageEl.value;
  if (el) (stageSize.w = el.clientWidth), (stageSize.h = el.clientHeight);
  geomTick.value++;
}
function resetConfig() {
  Object.assign(config, DEFAULT_GESTURE_CONFIG);
}

let ro: ResizeObserver | null = null;
onMounted(async () => {
  await nextTick();
  buildLetters();
  const el = stageEl.value!;
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  ro = new ResizeObserver(measureStage);
  ro.observe(el);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('keydown', onKey);
  interpreter.cancel();
  queue.length = 0;
  instances.forEach((l) => l?.destroy?.());
});
</script>

<style scoped>
.gesture-dbg {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f8f9fa;
}
.gesture-dbg__bar,
.gesture-dbg__tuning {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  flex-wrap: wrap;
}
.gesture-dbg__word {
  max-width: 220px;
  min-width: 160px;
}
.gesture-dbg__slider {
  display: flex;
  flex-direction: column;
  min-width: 200px;
  flex: 1;
  font-size: 13px;
}
.gesture-dbg__cue {
  max-width: 170px;
  min-width: 140px;
}
.gesture-dbg__slider--short {
  min-width: 150px;
  flex: 0 1 200px;
}
.gesture-dbg__stage {
  position: relative;
  flex: 1;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fffef7;
  touch-action: none;
  user-select: none;
  cursor: pointer;
}
.gesture-dbg__row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.gesture-dbg__letter {
  position: relative;
  height: 150px;
}
.gesture-dbg__team-label {
  position: absolute;
  bottom: calc(-28px - var(--label-drop, 0px));
  left: 0;
  right: 0;
  text-align: center;
  font: 600 15px/1 monospace;
}
.gesture-dbg__trace {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.gesture-dbg__mark {
  font-size: 22px;
  font-weight: 700;
  fill: #6a1b9a;
}
.gesture-dbg__bottom {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  max-height: 32vh;
  min-height: 160px;
}
.gesture-dbg__legend {
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 280px;
}
.gesture-dbg__hint {
  color: #777;
  margin-top: 6px;
}
.gesture-dbg__log {
  flex: 1;
  overflow-y: auto;
  font: 12px/1.5 monospace;
  margin: 0;
}
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 3px solid #2e7d32;
  vertical-align: middle;
  margin-right: 4px;
}
.dot--live {
  background: #2e7d32;
}
.dot--held {
  background: white;
}
</style>
