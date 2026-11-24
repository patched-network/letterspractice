/**
 * useLessonRunner — shared mechanics for step-driven lesson components.
 *
 * Owns:
 *   - step sequencing + advance() (sound→sound vs sound→dialogue gating)
 *   - audio playback + isPlayingAudio (+ fetch-ahead of every clip STEPS can play)
 *   - mouth-speak loop (speakWhile, dialogue auto-stop)
 *   - the sound cue's geometry: the overhead audio button, or the sound rail
 *     under the letters (soundRail.ts picks; both measured at the same moments)
 *   - keyboard wiring (spacebar/advance + ProgressiveKeyboard config)
 *   - blink-only idle loop (auto-started for any actor whose eyes become visible)
 *   - touch replay (opt-in): tap / drag letters to hear sounds they've made
 *
 * Lessons own:
 *   - the STEPS array and choreography (via Step.onEnter callbacks)
 *   - the actors Map and stage population
 *   - the accentHue ref (drives the cue's color, where it isn't a letter's own)
 */

import { animate } from 'animejs';
import {
    computed,
    nextTick,
    ref,
    shallowRef,
    watch,
    type ComputedRef,
    type CSSProperties,
    type Ref,
} from 'vue';
import type { Unsubscribe } from '../composables/keyboardContext.types';
import { useKeyboardContextOptional } from '../composables/useKeyboardContext';
import {
    useTimedWordPlayback,
    type LetterEffect,
} from '../composables/useTimedWordPlayback';
import type { LetterInstance } from '../letterpeople';
import type { Actor } from '../letterpeople/scene/Stage';
import { asLessonActor, type ActorBounds, type LessonActor } from './lessonActor';
import { soundCueStyle, type SoundRailView } from './soundRail';
import { slideAt, useSoundRail } from './useSoundRail';
import { createGestureInterpreter } from './touchGesture';
import { colorToOklch, oklch } from '../letterpeople/util/color';
import { createAudioPrefetch } from '../services/audioPrefetch';
import { getPhonemeAudioUrl, getPhonetics } from '../services/phonetics';
import { computeSpeakerTimingsForWord } from '../services/phonetics/speakerTimings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-actor timing for a 'word' step. Adapter over SpeakerTiming that
 * indexes by actor identifier rather than numeric letter index — runner-local
 * because the playback composable is identifier-agnostic.
 */
export interface ActorTiming<TActorId extends string> {
  actorId: TActorId;
  time: number;
  effect?: LetterEffect;
}

export type LessonStep<TActorId extends string> =
  | {
      kind: 'dialogue';
      actorId: TActorId;
      text: string;
      /**
       * Choreography fired alongside the dialogue's say().
       * If it returns a Promise, runCurrentStep awaits it together with say()
       * — use this when advance must be gated on the choreography finishing.
       * Return void to fire-and-forget.
       */
      onEnter?: () => void | Promise<void>;
    }
  | {
      // A team of actors say a single sound together (looped mouth-speak).
      kind: 'phoneme';
      actorIds: TActorId[];
      audioUrl: string;
      /** Set when this step stands in for a 'word' step (see buildWordStep's fallback). */
      word?: string;
      onEnter?: () => void | Promise<void>;
    }
  | {
      // Ordered actors fire on a timeline against a word recording.
      kind: 'word';
      word: string;
      timings: ActorTiming<TActorId>[];
      /** The word's letters in spelling order (touch replay maps GPCs onto them). */
      actorOrder?: TActorId[];
      audioUrl: string | string[];
      onEnter?: () => void | Promise<void>;
    }
  | {
      // A beat with no line and no sound: the advance just moves the scene on
      // (the lamp goes on, someone wakes). If onEnter returns a Promise, the
      // next press waits for it.
      kind: 'beat';
      onEnter?: () => void | Promise<void>;
    }
  | { kind: 'complete' };

/**
 * A content report derived from a lesson's STEPS array — dialogue length and
 * audio-playback load, plus the target words those playbacks cover. Pure and
 * STEPS-driven, so it can't drift from the lesson itself the way a
 * hand-maintained word list could.
 */
export interface LessonContentSummary {
  beatCount: number;
  /** Words spoken across all dialogue text (whitespace-tokenized). */
  dialogueWordCount: number;
  /** 'word' steps: one audio playback per timed-word recording. */
  wordAudioCount: number;
  /** 'phoneme' steps: one audio playback per isolated sound. */
  phonemeAudioCount: number;
  /** wordAudioCount + phonemeAudioCount. */
  audioEventCount: number;
  /** Target word spellings, drawn from 'word' steps (+ phoneme fallbacks that carry one). */
  targetWords: string[];
}

export function summarizeLessonSteps<TActorId extends string>(
  steps: LessonStep<TActorId>[],
): LessonContentSummary {
  let dialogueWordCount = 0;
  let wordAudioCount = 0;
  let phonemeAudioCount = 0;
  const targetWords: string[] = [];

  for (const step of steps) {
    if (step.kind === 'dialogue') {
      dialogueWordCount += step.text.trim().split(/\s+/).filter(Boolean).length;
    } else if (step.kind === 'word') {
      wordAudioCount++;
      targetWords.push(step.word);
    } else if (step.kind === 'phoneme') {
      phonemeAudioCount++;
      if (step.word) targetWords.push(step.word);
    }
  }

  return {
    beatCount: steps.filter((s) => s.kind !== 'complete').length,
    dialogueWordCount,
    wordAudioCount,
    phonemeAudioCount,
    audioEventCount: wordAudioCount + phonemeAudioCount,
    targetWords,
  };
}

/**
 * Every clip a lesson's STEPS can play, in the order each is first needed:
 * sound steps, every take of each word recording (the take is picked at play
 * time), and — with `replaySounds` — the GPC sounds a heard word binds to its
 * letters for touch replay (see bindWordSounds), queued after that word since
 * they're only tappable once it has played.
 */
export function collectLessonAudioUrls<TActorId extends string>(
  steps: LessonStep<TActorId>[],
  opts: { replaySounds?: boolean } = {},
): string[] {
  const urls = new Set<string>();
  for (const step of steps) {
    if (step.kind !== 'phoneme' && step.kind !== 'word') continue;
    for (const url of Array.isArray(step.audioUrl) ? step.audioUrl : [step.audioUrl]) {
      if (url) urls.add(url);
    }
    if (opts.replaySounds && step.word) {
      for (const chunk of getPhonetics(step.word)?.chunks ?? []) {
        urls.add(getPhonemeAudioUrl(chunk.phoneme));
      }
    }
  }
  return [...urls];
}

export interface LessonRunnerOptions<TActorId extends string> {
  steps: LessonStep<TActorId>[];
  /** SVG stage Actors, or any LessonActor (e.g. a three.js stage's actors). */
  actors: Map<TActorId, Actor | LessonActor>;
  /** Drives audio-button color and (via configureKeyboard) the spacebar color on sound steps. */
  accentHue: Ref<number>;
  emit: {
    lessonComplete: () => void;
    practiceNow: () => void;
  };
  /** ms-per-character heuristic for dialogue mouth-speak duration. */
  msPerChar?: number;
  minSpeakMs?: number;
  speakCycleMs?: number;
  /**
   * Touch replay (opt-in). Once a sound step has played, tapping any of its
   * letters plays that sound again (a team, like s+h, answers together);
   * dragging a finger across a word plays each sound it crosses, left to
   * right only, so a sweep sounds the word out and a backwards one can't.
   * A fast sweep across a word already heard as a word plays the word
   * instead (touchGesture.ts).
   * Once a word step has played, `pickWord` may map a tap on something else
   * (a picture: the digraph's ship) to that word's recording. Replays wait
   * for the lesson to be idle and hold advance until they finish.
   * `hint: false` turns off the ghost finger that sweeps a heard word.
   */
  touchReplay?:
    | boolean
    | { pickWord?: (clientX: number, clientY: number) => string | null; hint?: boolean };
}

/** The touch-replay hint: a ghost finger, in stage px (fingertip position). */
export interface TouchHintState {
  visible: boolean;
  x: number;
  y: number;
  opacity: number;
  pressed: boolean;
}

export interface LessonRunner<TActorId extends string> {
  // Refs the shell binds to its DOM
  stageContainerRef: Ref<HTMLElement | null>;
  audioElement: Ref<HTMLAudioElement | null>;

  // Step state
  stepIndex: Ref<number>;
  currentStep: ComputedRef<LessonStep<TActorId> | null>;
  isPhonemeStep: ComputedRef<boolean>;
  isWordStep: ComputedRef<boolean>;
  /** True when the current step mounts the audio button (phoneme or word). */
  hasAudioButton: ComputedRef<boolean>;
  isComplete: ComputedRef<boolean>;
  isPlayingAudio: Ref<boolean>;

  // Audio button presentation
  audioButtonShown: Ref<boolean>;
  audioButtonReady: Ref<boolean>;
  audioButtonStyle: ComputedRef<CSSProperties>;
  audioButtonBgColor: ComputedRef<string>;
  /** The sound rail to draw (the 'rail' cue style, on a sound step), or null. */
  soundRail: ComputedRef<SoundRailView | null>;
  /** The rail's speaker hands its pointer events here: a tap advances, a drag is a drag across the word. */
  railPuck: {
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    cancel: (e: PointerEvent) => void;
  };
  /** Touch-replay hint finger (shell renders it). */
  touchHint: Ref<TouchHintState>;

  // Actions
  start: () => Promise<void>;
  handleAdvance: () => void;

  // Choreography helpers (lessons need these for their own walks/animations)
  speakWhile: (
    target: LetterInstance | LessonActor,
    opts: { ms?: number; until?: Promise<void> },
  ) => () => void;
  recomputeAudioButton: (instant?: boolean) => void;

  // Lifecycle
  attach: () => void;
  detach: () => void;
}

// ---------------------------------------------------------------------------
// Step builders
// ---------------------------------------------------------------------------

/**
 * Build a 'word' step from a spelling + actor ordering, resolving phonetic
 * data and audio timings from the phonetic index.
 *
 * Falls back to a `kind: 'phoneme'` team mouth-loop step if the recording
 * lacks `audioTimingMs` (timed pulses can't be computed without it). Throws
 * if the word has no phonetic entry at all — that's a curriculum bug, not
 * a missing-asset condition.
 *
 * Lessons just declare `buildWordStep('cape', ['c','a','p','e'])` instead of
 * branching on timing availability at each site.
 */
export function buildWordStep<TActorId extends string>(
  word: string,
  wordOrder: TActorId[],
  options?: { onEnter?: () => void | Promise<void> },
): LessonStep<TActorId> {
  const phonetics = getPhonetics(word);
  if (!phonetics) {
    throw new Error(`[lessonRunner] no phonetics for "${word}"`);
  }
  const speakerTimings = computeSpeakerTimingsForWord(phonetics);
  if (!speakerTimings) {
    console.warn(
      `[lessonRunner] no audio timings for "${word}"; falling back to phoneme-style step`,
    );
    return {
      kind: 'phoneme',
      actorIds: wordOrder,
      audioUrl: phonetics.audioUrl,
      word,
      onEnter: options?.onEnter,
    };
  }
  const timings: ActorTiming<TActorId>[] = speakerTimings.map((t) => ({
    actorId: wordOrder[t.index],
    time: t.time,
    effect: t.effect,
  }));
  return {
    kind: 'word',
    word,
    timings,
    actorOrder: wordOrder,
    audioUrl: phonetics.audioUrl,
    onEnter: options?.onEnter,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADVANCE_COLOR_DEFAULT = '#4CAF50';
const ADVANCE_TEXT_DEFAULT = '→';
const ADVANCE_TEXT_AUDIO = 'mdi-volume-high';

// RETIRE(overhead-audio-button): the button's size, for placing it above the letters
const AUDIO_BTN_HEIGHT = 48;
const AUDIO_BTN_GAP = 20;

function buttonColor(hue: number): string {
  return oklch(0.63, 0.23, hue);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function useLessonRunner<TActorId extends string>(
  options: LessonRunnerOptions<TActorId>,
): LessonRunner<TActorId> {
  const {
    steps,
    actors,
    accentHue,
    emit,
    msPerChar = 60,
    minSpeakMs = 700,
    speakCycleMs = 280,
  } = options;

  const stageContainerRef = ref<HTMLElement | null>(null);
  const audioElement = ref<HTMLAudioElement | null>(null);

  const stepIndex = ref(-1);
  const isPlayingAudio = ref(false);

  const currentStep = computed<LessonStep<TActorId> | null>(() => {
    const i = stepIndex.value;
    if (i < 0 || i >= steps.length) return null;
    return steps[i];
  });
  const isPhonemeStep = computed(() => currentStep.value?.kind === 'phoneme');
  const isWordStep = computed(() => currentStep.value?.kind === 'word');
  const hasAudioButton = computed(
    () => isPhonemeStep.value || isWordStep.value,
  );
  const isComplete = computed(() => currentStep.value?.kind === 'complete');

  // -------------------------------------------------------------------------
  // Mouth-speak loop
  // -------------------------------------------------------------------------

  const activeSpeakStops = new Set<() => void>();
  let dialogueSpeakStop: (() => void) | null = null;

  function estimateSpeakMs(text: string): number {
    return Math.max(minSpeakMs, text.length * msPerChar);
  }

  function speakWhile(
    target: LetterInstance | LessonActor,
    opts: { ms?: number; until?: Promise<void> },
  ): () => void {
    const pulse =
      'svgElement' in target
        ? target.mouth
          ? (p: { duration: number }) => target.mouth.animateSpeak(p)
          : null
        : target.canSpeak()
          ? (p: { duration: number }) => target.speakPulse(p)
          : null;
    if (!pulse) return () => {};
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      activeSpeakStops.delete(stop);
    };
    activeSpeakStops.add(stop);

    if (opts.ms !== undefined) setTimeout(stop, opts.ms);
    opts.until?.then(stop);

    void (async () => {
      while (!stopped) {
        await pulse({ duration: speakCycleMs });
      }
    })();

    return stop;
  }


  function startDialogueSpeak(actor: LessonActor, text: string): void {
    stopDialogueSpeak();
    dialogueSpeakStop = speakWhile(actor, { ms: estimateSpeakMs(text) });
  }

  function stopDialogueSpeak(): void {
    dialogueSpeakStop?.();
    dialogueSpeakStop = null;
  }

  function stopAllSpeak(): void {
    for (const cancel of [...activeSpeakStops]) cancel();
  }

  async function silenceAll(): Promise<void> {
    stopDialogueSpeak();
    for (const actor of actors.values()) await asLessonActor(actor).silence();
  }

  // -------------------------------------------------------------------------
  // Blink-only idle loop
  // -------------------------------------------------------------------------

  const idleStops = new Map<TActorId, () => void>();

  function startIdleForVisibleActors(): void {
    for (const [id, actor] of actors) {
      if (idleStops.has(id)) continue;
      const a = asLessonActor(actor);
      if (!a.eyesVisible()) continue;
      idleStops.set(id, a.startIdle());
    }
  }

  function stopAllIdle(): void {
    for (const stop of idleStops.values()) stop();
    idleStops.clear();
  }

  // -------------------------------------------------------------------------
  // Audio button geometry
  // RETIRE(overhead-audio-button): left/top/width, the style and the glide go;
  // audioButtonReady / audioButtonShown stay (they gate the rail too).
  // -------------------------------------------------------------------------

  const audioButtonLeft = ref(0);
  const audioButtonTop = ref(0);
  const audioButtonWidth = ref(0);
  const audioButtonReady = ref(false);
  let activeButtonAnim: { pause: () => void } | null = null;

  const audioButtonBgColor = computed<string>(() => buttonColor(accentHue.value));

  const audioButtonStyle = computed<CSSProperties>(() => {
    if (!audioButtonReady.value) return { opacity: 0 };
    return {
      left: `${audioButtonLeft.value}px`,
      top: `${audioButtonTop.value}px`,
      width: `${audioButtonWidth.value}px`,
      backgroundColor: audioButtonBgColor.value,
    };
  });

  // (The rail's; declared here because the watcher below clears it on its first run.)
  /** A word playing: progress through its speech window, and the sound whose slice it's in. */
  const wordSlide = ref<{ word: string; f: number; active: number } | null>(null);

  // Audio button lingers after a sound step ends until in-flight audio finishes,
  // so it doesn't disappear mid-playback when the user has already advanced.
  const audioButtonShown = ref(false);
  watch(
    [hasAudioButton, isPlayingAudio],
    ([hasButton, playing]) => {
      if (hasButton) audioButtonShown.value = true;
      else if (!playing) {
        audioButtonShown.value = false;
        // Drop the stale measurement once the button is truly hidden (e.g.
        // across a dialogue step). Otherwise its next appearance renders at the
        // prior position for a frame — a visible flash — before runCurrentStep
        // re-measures. Clearing ready keeps it unmounted (v-if gates on it)
        // until the post-onEnter recompute snaps it onto the settled letters.
        // Consecutive sound steps never hit this branch, so their button glide
        // (which relies on ready staying true) is preserved.
        audioButtonReady.value = false;
        wordSlide.value = null;
      }
    },
    { immediate: true },
  );

  function measureActorBounds(
    actorId: TActorId,
  ): ActorBounds | null {
    const actor = actors.get(actorId);
    const stageEl = stageContainerRef.value;
    if (!actor || !stageEl) return null;
    return asLessonActor(actor).boundsIn(stageEl);
  }

  function audioButtonActorIds(): TActorId[] {
    const step = currentStep.value;
    if (!step) return [];
    if (step.kind === 'phoneme') return step.actorIds;
    if (step.kind === 'word') {
      const seen = new Set<TActorId>();
      const ids: TActorId[] = [];
      for (const t of step.timings) {
        if (!seen.has(t.actorId)) {
          seen.add(t.actorId);
          ids.push(t.actorId);
        }
      }
      return ids;
    }
    return [];
  }

  function computeAudioButtonTarget():
    | { left: number; width: number; top: number }
    | null {
    const ids = audioButtonActorIds();
    if (ids.length === 0) return null;

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    for (const id of ids) {
      const b = measureActorBounds(id);
      if (!b) continue;
      if (b.left < left) left = b.left;
      if (b.right > right) right = b.right;
      if (b.top < top) top = b.top;
    }
    if (!isFinite(left) || !isFinite(right)) return null;

    const PAD = 14;
    return {
      left: left - PAD,
      width: right - left + PAD * 2,
      top: Math.max(8, top - AUDIO_BTN_HEIGHT - AUDIO_BTN_GAP),
    };
  }

  function recomputeAudioButton(instant = false): void {
    const target = computeAudioButtonTarget();
    if (!target) return;
    measureRail();

    if (instant || !audioButtonReady.value) {
      activeButtonAnim?.pause();
      activeButtonAnim = null;
      audioButtonLeft.value = target.left;
      audioButtonWidth.value = target.width;
      audioButtonTop.value = target.top;
      audioButtonReady.value = true;
      return;
    }

    activeButtonAnim?.pause();
    const proxy = {
      left: audioButtonLeft.value,
      width: audioButtonWidth.value,
      top: audioButtonTop.value,
    };
    activeButtonAnim = animate(proxy, {
      left: target.left,
      width: target.width,
      top: target.top,
      duration: 280,
      ease: 'outQuad',
      onUpdate: () => {
        audioButtonLeft.value = proxy.left;
        audioButtonWidth.value = proxy.width;
        audioButtonTop.value = proxy.top;
      },
      onComplete: () => {
        activeButtonAnim = null;
      },
    }) as { pause: () => void };
  }

  // -------------------------------------------------------------------------
  // Sound rail: the same cue, under the letters (SoundRail.vue)
  // -------------------------------------------------------------------------
  //
  // Measured whenever the button is (recomputeAudioButton): once a step's
  // letters have settled, and when the lesson says they've moved. On a sound
  // step the rail is one milestone under the letters about to speak, with the
  // speaker on it. On a word step it runs under the whole word, one milestone
  // per sound, the speaker docked at its start; the speaker then slides
  // through in time with the recording. A drag across lights the milestones
  // from the gesture interpreter's trace.

  interface RailSnapshot {
    step: LessonStep<TActorId>;
    /** The word the rail runs under, if the step's letters stand in one. */
    word?: string;
    /** The rail's letters, in spelling order. */
    ids: TActorId[];
    /** The letters the step will sound (the speaker rests on them); null: the whole word, from the dock. */
    cue: TActorId[] | null;
    boxes: Map<TActorId, ActorBounds>;
    /** Each letter's own colour, deepened to carry a white icon; absent: the accent. */
    colors: Map<TActorId, string>;
    /** Letters that won't answer a touch just now (see quietIds). */
    quiet: Set<TActorId>;
    stageHeight: number;
  }
  const railSnap = shallowRef<RailSnapshot | null>(null);
  /**
   * The word a sound step's letters are standing in: the next word step, if
   * it's already formed on stage and they're part of it (ship, while sh, i, p
   * are sounded out one by one). Then the step shares the word's rail, and the
   * speaker moves along it from sound to sound.
   */
  function standingWord(step: LessonStep<TActorId>): { word: string; ids: TActorId[] } | null {
    if (step.kind !== 'phoneme' || step.word) return null;
    for (let i = stepIndex.value + 1; i < steps.length; i++) {
      const next = steps[i];
      if (next.kind !== 'word') continue;
      const ids = next.actorOrder ?? [...new Set(next.timings.map((t) => t.actorId))];
      return step.actorIds.every((id) => ids.includes(id)) && formedOnStage(ids) ? { word: next.word, ids } : null;
    }
    return null;
  }

  function measureRail(): void {
    const step = currentStep.value;
    const stageEl = stageContainerRef.value;
    if (!stageEl || !step || (step.kind !== 'phoneme' && step.kind !== 'word')) return;
    const standing = standingWord(step);
    const word = step.kind === 'word' ? step.word : standing?.word;
    const ids =
      step.kind === 'word' ? (step.actorOrder ?? audioButtonActorIds()) : (standing?.ids ?? step.actorIds);
    const boxes = new Map<TActorId, ActorBounds>();
    const colors = new Map<TActorId, string>();
    for (const id of ids) {
      const b = measureActorBounds(id);
      if (!b || b.right - b.left < 1) continue;
      boxes.set(id, b);
      const actor = actors.get(id);
      const fill = actor ? asLessonActor(actor).fillColor?.() : null;
      const c = fill ? colorToOklch(fill) : null;
      if (c) colors.set(id, oklch(0.62, Math.max(c.c, 0.15), c.h));
    }
    if (!boxes.size) return;
    wordSlide.value = null; // a word's speaker, held at its end, lets go
    railSnap.value = {
      step,
      word,
      ids,
      cue: step.kind === 'phoneme' && word ? step.actorIds : null,
      boxes,
      colors,
      quiet: quietIds(),
      stageHeight: stageEl.clientHeight,
    };
  }

  /** The rail's sounds, as teams of letters: a word's GPCs, or the step's one sound. */
  function railTeams(snap: RailSnapshot): TActorId[][] {
    if (snap.word) {
      const teams = (getPhonetics(snap.word)?.chunks ?? [])
        .map((chunk) =>
          Object.keys(chunk.letters)
            .map((k) => snap.ids[Number(k)])
            .filter((id): id is TActorId => id !== undefined && snap.boxes.has(id)),
        )
        .filter((team) => team.length);
      if (teams.length) return teams;
    }
    return [snap.ids.filter((id) => snap.boxes.has(id))];
  }

  const rail = useSoundRail<TActorId>({
    input: () => {
      const snap = railSnap.value;
      if (soundCueStyle.value !== 'rail' || !audioButtonReady.value || !snap) return null;
      // A sound's marks go by its replay (the interpreter's team), else by its letters
      const teams = railTeams(snap).map((ids) => ({ ids, key: soundByActor.get(ids[0]) ?? ids }));
      const cue = snap.cue;
      return {
        boxes: snap.boxes,
        teams,
        colors: snap.colors,
        quiet: snap.quiet,
        dock: !!snap.word,
        // on a word step: docked; a sound step: on its sound (the word's, if it stands in one)
        cue: snap.word ? (cue ? teams.findIndex((t) => t.ids.includes(cue[0])) : null) : 0,
        slide: snap.step.kind === 'word' && wordSlide.value?.word === snap.word ? wordSlide.value : null,
        stageHeight: snap.stageHeight,
      };
    },
    accent: () => audioButtonBgColor.value,
    playing: () => isPlayingAudio.value,
    cueSpeaking: () => isPlayingAudio.value && railSnap.value?.step.kind === 'phoneme',
  });
  const soundRail = rail.view;

  /**
   * The cue's colour: the letter the speaker is resting on, or the accent
   * (docked before a word, or the overhead button). The speaker at rest and
   * the keyboard's advance key both wear it, so they change together.
   */
  const soundCueColor = computed<string>(() => rail.restColor.value ?? audioButtonBgColor.value);

  /** The letter whose milestone is under a point in the rail's band (by x alone), if the rail is up. */
  function pickInRail(x: number, y: number): TActorId | null | undefined {
    return audioButtonShown.value ? rail.pickInBand(x, y, PICK_PAD_PX) : undefined;
  }

  // -------------------------------------------------------------------------
  // Active-actor focus class
  // -------------------------------------------------------------------------

  function updateActiveActors(): void {
    const activeIds = new Set<TActorId>(audioButtonActorIds());
    for (const [id, actor] of actors) {
      asLessonActor(actor).setActive(activeIds.has(id));
    }
  }

  watch(currentStep, () => {
    updateActiveActors();
    // NB: don't recompute the audio button here. The new step's onEnter may
    // walk letters into position; runCurrentStep retargets after that resolves.
    // First-appearance: audioButtonReady stays false → button is hidden via
    // opacity:0 until the post-onEnter measurement.
    // Cross-step (button → button): position lingers on prior measurement
    // through the walk, then animates to the new group once it settles.
  });

  // -------------------------------------------------------------------------
  // Audio playback
  // -------------------------------------------------------------------------

  // Fetch every clip the lesson can play up front, so a press plays from
  // memory. Steps keep their network URLs (touch replay compares them);
  // only the play sites swap in the cached copy.
  const audioCache = createAudioPrefetch();
  audioCache.prefetch(collectLessonAudioUrls(steps, { replaySounds: !!options.touchReplay }));

  function playPhonemeAudio(
    url: string,
    speakers: TActorId[] = [],
  ): Promise<void> {
    const audio = audioElement.value;
    if (!audio) return Promise.resolve();

    isPlayingAudio.value = true;
    audio.src = audioCache.resolve(url);

    const audioDone = new Promise<void>((resolve) => {
      const cleanup = () => {
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('error', onEnd);
        isPlayingAudio.value = false;
        resolve();
      };
      const onEnd = cleanup;
      audio.addEventListener('ended', onEnd);
      audio.addEventListener('error', onEnd);
    });

    // Mouths open with the sound, not with the press (a cold fetch sits between).
    audio.play().then(
      () => {
        for (const id of speakers) {
          const actor = actors.get(id);
          if (actor) void asLessonActor(actor).applyEffect('speak', { duration: speakCycleMs });
        }
      },
      (e) => {
        console.warn('[lessonRunner] audio play failed:', e);
        isPlayingAudio.value = false;
      },
    );

    return audioDone;
  }

  const wordPlayback = useTimedWordPlayback();

  /**
   * `ride`: the word, so the rail's speaker can ride the recording (each sound
   * an equal slice of its speech window, as speakerTimings assumes). `hold`
   * leaves the speaker at the rail's end afterwards (the step is over and the
   * rail is about to go or move on), rather than gliding back to its dock.
   */
  async function playWordAudio(
    audioUrl: string | string[],
    timings: ActorTiming<TActorId>[],
    ride?: { word: string; hold?: boolean },
  ): Promise<void> {
    const audio = audioElement.value;
    if (!audio) return;

    let raf = 0;
    let sounds = 0;
    const phonetics = ride && soundCueStyle.value === 'rail' ? getPhonetics(ride.word) : undefined;
    const speech = phonetics?.audioTimingMs;
    if (ride && phonetics && speech && speech.speechEnd > speech.speechStart) {
      sounds = phonetics.chunks.length;
      const tick = () => {
        // paused: not started yet (currentTime may still be the last clip's)
        const t = audio.paused ? 0 : audio.currentTime * 1000;
        wordSlide.value = { word: ride.word, ...slideAt(t, speech.speechStart, speech.speechEnd, sounds) };
        raf = requestAnimationFrame(tick);
      };
      tick();
    }

    // Index actorIds so SpeakerTiming.index can address them.
    const actorIdByIndex: TActorId[] = [];
    const indexByActorId = new Map<TActorId, number>();
    for (const t of timings) {
      if (!indexByActorId.has(t.actorId)) {
        indexByActorId.set(t.actorId, actorIdByIndex.length);
        actorIdByIndex.push(t.actorId);
      }
    }
    const speakerTimings = timings.map((t) => ({
      index: indexByActorId.get(t.actorId)!,
      time: t.time,
      effect: t.effect,
    }));

    isPlayingAudio.value = true;
    try {
      await wordPlayback.play({
        audio,
        audioUrl: Array.isArray(audioUrl)
          ? audioUrl.map((u) => audioCache.resolve(u))
          : audioCache.resolve(audioUrl),
        timings: speakerTimings,
        onTrigger: (timing) => {
          const actorId = actorIdByIndex[timing.index];
          const actor = actors.get(actorId);
          if (!actor) return;
          // Discrete timed strike — fire-and-forget. Pass speakCycleMs so the
          // 'speak' effect's mouth pulse matches the runner's mouth-loop cadence.
          void asLessonActor(actor).applyEffect(timing.effect ?? 'speak', {
            duration: speakCycleMs,
          });
        },
      });
    } finally {
      cancelAnimationFrame(raf);
      if (sounds) wordSlide.value = ride?.hold ? { word: ride.word, f: 1, active: sounds } : null;
      isPlayingAudio.value = false;
    }
  }

  // -------------------------------------------------------------------------
  // Step execution
  // -------------------------------------------------------------------------

  async function runCurrentStep(): Promise<void> {
    stepBusy = true;
    try {
      await runCurrentStepInner();
    } finally {
      stepBusy = false;
      updateCursor();
      scheduleHint();
    }
  }

  async function runCurrentStepInner(): Promise<void> {
    const step = currentStep.value;
    if (!step) return;

    // Silence the previous dialogue's balloon + mouth loop. Audio-driven mouth
    // loops self-terminate via their `until` promise, so we don't touch them.
    await silenceAll();

    if (step.kind === 'dialogue') {
      const raw = actors.get(step.actorId);
      if (!raw) return;
      const actor = asLessonActor(raw);

      const enterResult = step.onEnter?.();
      const enterPromise =
        enterResult instanceof Promise ? enterResult : Promise.resolve();

      startDialogueSpeak(actor, step.text);
      await Promise.all([actor.say(step.text), enterPromise]);
      startIdleForVisibleActors();
      return;
    }

    if (step.kind === 'beat') {
      await step.onEnter?.();
      startIdleForVisibleActors();
      return;
    }

    if (step.kind === 'phoneme' || step.kind === 'word') {
      const enterResult = step.onEnter?.();
      if (enterResult instanceof Promise) {
        // Awaited choreography moves letters (e.g. walking them together to
        // form the word). Hide the button for the duration: leaving it visible
        // parks it at its now-stale prior measurement for the whole animation
        // before it glides over. Clearing ready makes the post-walk recompute
        // an instant snap onto the settled group instead. (Sync onEnter — e.g.
        // a lesson that only re-tints the accent — keeps the linger-then-glide,
        // which reads fine when there's no movement to wait on.)
        audioButtonReady.value = false;
        await enterResult;
      }
      // Choreography may have walked new letters into the audio-button group
      // (e.g. phoneme → word transition adds the rest of the spelling). The
      // currentStep watcher already snapped the button to a measurement taken
      // before walk-in; retarget now that letters have settled.
      await nextTick();
      recomputeAudioButton();
    }
    startIdleForVisibleActors();
    // 'complete' just lets the CTA render — no actor work.
  }

  async function advance(): Promise<void> {
    if (isPlayingAudio.value || replaying) return;

    if (isComplete.value) {
      emit.practiceNow();
      return;
    }

    const step = currentStep.value;
    const next = stepIndex.value + 1;
    if (next >= steps.length) return;
    const nextStep = steps[next];

    if (step?.kind === 'phoneme' && step.audioUrl) {
      await playPhonemeAudio(step.audioUrl, step.actorIds);
      recordPlayed(step);
      stepIndex.value = next;
      await runCurrentStep();
      return;
    }

    if (step?.kind === 'word') {
      await playWordAudio(step.audioUrl, step.timings, { word: step.word, hold: true });
      recordPlayed(step);
      stepIndex.value = next;
      await runCurrentStep();
      return;
    }

    stepIndex.value = next;
    await runCurrentStep();
  }

  function handleAdvance(): void {
    void advance();
  }

  // -------------------------------------------------------------------------
  // Touch replay
  // -------------------------------------------------------------------------

  /**
   * A team's sound. `effects`: per-letter effect when it plays (default
   * 'speak'; a split digraph's e gets 'silent-e', as in the word playback).
   */
  type SoundReplay = { audioUrl: string; actorIds: TActorId[]; effects?: Map<TActorId, LetterEffect> };
  type WordReplay =
    | { kind: 'word'; audioUrl: string | string[]; timings: ActorTiming<TActorId>[] }
    | ({ kind: 'phoneme' } & SoundReplay);
  /** Each actor's most recently played sound (its team's). */
  const soundByActor = new Map<TActorId, SoundReplay>();
  const wordReplays = new Map<string, WordReplay>();

  /** Called as each sound / word step's audio finishes: it's now replayable. */
  function recordPlayed(step: LessonStep<TActorId>): void {
    if (step.kind === 'word') {
      wordReplays.set(step.word, { kind: 'word', audioUrl: step.audioUrl, timings: step.timings });
      const ids = step.actorOrder ?? [...new Set(step.timings.map((t) => t.actorId))];
      hintWord = { word: step.word, ids };
      bindWordSounds(step.word, ids);
    } else if (step.kind === 'phoneme') {
      const sound = { audioUrl: step.audioUrl, actorIds: step.actorIds };
      if (step.word) {
        wordReplays.set(step.word, { kind: 'phoneme', ...sound });
        hintWord = { word: step.word, ids: step.actorIds };
        bindWordSounds(step.word, step.actorIds);
      } else for (const id of step.actorIds) soundByActor.set(id, sound);
    }
  }

  /**
   * A heard word also teaches its letters' sounds: each GPC chunk becomes a
   * team (split digraphs too: after "cape", a and e are one team saying EY,
   * so tapping the a plays the sound the e gave it). Lessons with no sound
   * steps (split digraph) get their replays this way.
   */
  function bindWordSounds(word: string, order: TActorId[]): void {
    const chunks = getPhonetics(word)?.chunks;
    if (!chunks) return;
    for (const chunk of chunks) {
      const ids = Object.keys(chunk.letters)
        .map((k) => order[Number(k)])
        .filter((id): id is TActorId => id !== undefined);
      if (!ids.length) continue;
      const effects = new Map<TActorId, LetterEffect>();
      for (const [k, effect] of Object.entries(chunk.letters)) {
        const id = order[Number(k)];
        if (id !== undefined && typeof effect === 'string') effects.set(id, effect as LetterEffect);
      }
      const sound = { audioUrl: getPhonemeAudioUrl(chunk.phoneme), actorIds: ids, effects };
      for (const id of ids) soundByActor.set(id, sound);
    }
  }
  /** The last word heard as a word: the hint's candidate while it stays formed. */
  let hintWord: { word: string; ids: TActorId[] } | null = null;

  /** Choreography (a step's onEnter, a dialogue) in flight: no replays. */
  let stepBusy = false;
  const REPLAY_QUEUE_MAX = 8; // a long word's worth of sounds from one sweep
  const REPLAY_GAP_MS = 120;
  const replayQueue: (() => Promise<void>)[] = [];
  let replaying = false;

  /** Idle enough to take a replay (or already playing replays). */
  function replayOpen(): boolean {
    if (stepBusy || isComplete.value) return false;
    return !isPlayingAudio.value || replaying; // not during the lesson's own audio
  }

  function enqueueReplay(play: () => Promise<void>): boolean {
    if (!replayOpen()) return false;
    if (replayQueue.length >= REPLAY_QUEUE_MAX) return false;
    replayQueue.push(play);
    if (!replaying) void drainReplays();
    return true;
  }

  async function drainReplays(): Promise<void> {
    replaying = true;
    try {
      while (replayQueue.length) {
        await replayQueue.shift()!();
        if (replayQueue.length) await new Promise((r) => setTimeout(r, REPLAY_GAP_MS));
      }
    } finally {
      replaying = false;
      if (!gesture) rail.clearMarks(); // the milestones a finished drag lit go back to waiting
      updateCursor();
      scheduleHint();
    }
  }

  function replaySound(sound: SoundReplay): boolean {
    return enqueueReplay(() => {
      const speakers = sound.actorIds.filter((id) => (sound.effects?.get(id) ?? 'speak') === 'speak');
      for (const id of sound.actorIds) {
        const effect = sound.effects?.get(id);
        const actor = actors.get(id);
        if (effect && effect !== 'speak' && actor) void asLessonActor(actor).applyEffect(effect);
      }
      rail.speaking.value = sound;
      return playPhonemeAudio(sound.audioUrl, speakers).finally(() => {
        if (rail.speaking.value === sound) rail.speaking.value = null;
      });
    });
  }

  /** Letters standing in word order, closely spaced (a formed word, not a parked neighbour). */
  function formedOnStage(ids: TActorId[]): boolean {
    const bs = ids.map((id) => measureActorBounds(id));
    if (bs.some((b) => !b || b.right - b.left < 1)) return false;
    const boxes = bs as { left: number; right: number; top: number; bottom: number }[];
    const height = Math.min(...boxes.map((b) => b.bottom - b.top));
    for (let k = 1; k < boxes.length; k++) {
      const prev = boxes[k - 1];
      const cur = boxes[k];
      if ((cur.left + cur.right) / 2 <= (prev.left + prev.right) / 2) return false; // out of order
      if (cur.left - prev.right > height * 0.25) return false; // a gap: not joined yet
    }
    return true;
  }

  /**
   * Letters that go quiet: a word formed on stage but not yet heard, which
   * would change what its letters say (cap → cape: the a becomes EY) or
   * extends the last word heard. Until it plays, replaying its letters' old
   * sounds (or the old word) would contradict what's standing there. (A word
   * built from sounds it keeps, like ship during its sounding-out, stays live.)
   */
  function quietIds(): Set<TActorId> {
    for (let i = Math.max(0, stepIndex.value); i < steps.length; i++) {
      const step = steps[i];
      let word: string;
      let ids: TActorId[];
      if (step.kind === 'word') (word = step.word), (ids = step.actorOrder ?? [...new Set(step.timings.map((t) => t.actorId))]);
      else if (step.kind === 'phoneme' && step.word) (word = step.word), (ids = step.actorIds);
      else continue;
      if (wordReplays.has(word) || !formedOnStage(ids)) return new Set();
      let changes = !!hintWord && hintWord.word !== word && hintWord.ids.every((id) => ids.includes(id));
      for (const chunk of getPhonetics(word)?.chunks ?? []) {
        const team = Object.keys(chunk.letters).map((k) => ids[Number(k)]);
        const url = getPhonemeAudioUrl(chunk.phoneme);
        for (const id of team) {
          const bound = soundByActor.get(id);
          if (bound && (bound.audioUrl !== url || bound.actorIds.length !== team.length)) changes = true;
        }
      }
      return changes ? new Set(ids) : new Set();
    }
    return new Set();
  }

  /**
   * An actor's team sound, if the whole team is on stage. (After "cape" the
   * e is teamed with the a; once the a has left, a lone e has nothing to say.)
   */
  function liveSound(id: TActorId): SoundReplay | undefined {
    const sound = soundByActor.get(id);
    if (!sound || quietIds().has(id)) return undefined;
    const onStage = sound.actorIds.every((a) => {
      const b = measureActorBounds(a);
      return !!b && b.right - b.left >= 1;
    });
    return onStage ? sound : undefined;
  }

  function replayWord(word: string): boolean {
    const w = wordReplays.get(word);
    if (!w) return false;
    return enqueueReplay(() =>
      w.kind === 'word' ? playWordAudio(w.audioUrl, w.timings, { word }) : playPhonemeAudio(w.audioUrl, w.actorIds),
    );
  }

  /** Padded on-screen boxes: a toddler's finger, and a sliver of an i. */
  const PICK_PAD_PX = 14;

  function actorCentreX(id: TActorId): number | null {
    const b = measureActorBounds(id);
    return b ? (b.left + b.right) / 2 : null;
  }

  /** The letter under a point (stage px), nearest centre winning among overlaps. */
  function pickActor(x: number, y: number): TActorId | null {
    const stageEl = stageContainerRef.value;
    if (!stageEl) return null;
    const inRail = pickInRail(x, y);
    if (inRail !== undefined) return inRail;
    let best: TActorId | null = null;
    let bestDist = Infinity;
    for (const [id, actor] of actors) {
      const b = asLessonActor(actor).boundsIn(stageEl);
      if (!b || b.right - b.left < 1) continue; // off stage / display: none
      if (x < b.left - PICK_PAD_PX || x > b.right + PICK_PAD_PX) continue;
      if (y < b.top - PICK_PAD_PX || y > b.bottom + PICK_PAD_PX) continue;
      const d = Math.abs(x - (b.left + b.right) / 2);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  const touchOpts = typeof options.touchReplay === 'object' ? options.touchReplay : {};
  /** The press being read (the interpreter holds the drag's state). */
  let gesture: { pointerId: number; x0: number; y0: number; fromPuck?: boolean } | null = null;

  function localPoint(e: PointerEvent): { x: number; y: number } | null {
    const stageEl = stageContainerRef.value;
    if (!stageEl) return null;
    const r = stageEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** The heard word the team's letters stand in, as ordered teams (for a fast sweep). */
  function wordTeams(team: SoundReplay): SoundReplay[] | null {
    const w = hintWord; // the last word heard as a word
    if (!w || !team.actorIds.some((id) => w.ids.includes(id))) return null;
    const quiet = quietIds();
    if (w.ids.some((id) => quiet.has(id))) return null; // it's become another word
    const teams: SoundReplay[] = [];
    for (const id of w.ids) {
      const t = soundByActor.get(id);
      const b = measureActorBounds(id);
      if (!t || !b || b.right - b.left < 1) return null; // a letter has left
      if (!teams.includes(t)) teams.push(t);
    }
    return teams;
  }

  // Drags: slow → each sound as it's reached; a fast sweep of a heard word →
  // the word (touchGesture.ts; tuned on /dbg/lesson/gesture).
  const interpreter = createGestureInterpreter<SoundReplay>({
    hit: (x, y) => {
      if (!options.touchReplay) return null; // the rail's speaker still reads its own taps here
      const id = pickActor(x, y);
      const team = id ? liveSound(id) : undefined;
      const centreX = id ? actorCentreX(id) : null;
      return team && centreX !== null ? { team, centreX } : null;
    },
    wordOf: wordTeams,
    playTeam: (team) => {
      if (replaySound(team)) engaged();
    },
    playWord: () => {
      if (hintWord && replayWord(hintWord.word)) engaged();
    },
    // The rail's milestones follow the reading
    trace: (e) => rail.trace(e),
  });

  function onPointerDown(e: PointerEvent, fromPuck = false): void {
    const raw = localPoint(e);
    if (!raw || !e.isPrimary) return;
    cancelHint();
    // A press on the speaker takes hold of it: the gesture is read from the
    // speaker. (Without touch replay it's only a button, and stays put.)
    const p = rail.press(raw, fromPuck && !!options.touchReplay);
    // No pointer capture: touch already captures to the canvas / svg (events
    // bubble here), and taking it would steal the dbg free camera's drags.
    gesture = { pointerId: e.pointerId, x0: p.x, y0: p.y, fromPuck };
    interpreter.down(p.x, p.y, e.timeStamp);
  }

  /**
   * Mouse hover: a pointing finger over anything a tap would play right now.
   * Re-checked on mouse moves and when the lesson's state changes under a
   * still mouse (a step starts or ends, audio starts or stops).
   */
  let hover: { clientX: number; clientY: number; x: number; y: number } | null = null;
  function updateCursor(): void {
    const el = touchEl;
    if (!el) return;
    let playable = false;
    if (hover && replayOpen()) {
      const id = pickActor(hover.x, hover.y);
      if (id) playable = !!liveSound(id);
      else {
        const word = touchOpts.pickWord?.(hover.clientX, hover.clientY);
        playable = !!word && wordReplays.has(word);
      }
    }
    el.style.cursor = playable ? 'pointer' : '';
  }
  watch([stepIndex, isPlayingAudio], () => void nextTick(updateCursor));

  function onPointerMove(e: PointerEvent): void {
    if (!gesture) {
      const p = localPoint(e);
      if (!p || e.pointerType !== 'mouse') return;
      hover = { clientX: e.clientX, clientY: e.clientY, ...p };
      updateCursor();
      return;
    }
    if (e.pointerId !== gesture.pointerId) return;
    const raw = localPoint(e);
    if (!raw) return;
    // Without touch replay the speaker is only a button: it doesn't move
    const p = options.touchReplay ? rail.follow(raw, interpreter.config.dragStartPx) : raw;
    interpreter.move(p.x, p.y, e.timeStamp);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const g = gesture;
    gesture = null;
    const raw = localPoint(e);
    const p = raw && options.touchReplay ? rail.follow(raw, interpreter.config.dragStartPx) : (raw ?? { x: g.x0, y: g.y0 });
    rail.release();
    if (interpreter.up(p.x, p.y, e.timeStamp)) {
      if (!replaying) rail.clearMarks(); // a drag that played nothing
      return; // a drag, already played
    }
    if (g.fromPuck) {
      // a tap on the rail's speaker: as the audio button (which ignores a press while audio plays)
      if (isPlayingAudio.value || replaying) rail.nudge();
      return handleAdvance();
    }
    // A tap: a letter's sound, else (a picture) a word
    const id = pickActor(g.x0, g.y0);
    const sound = id ? liveSound(id) : undefined;
    if (sound) {
      // mashing doesn't pile up
      if ((!replaying || replayQueue.length === 0) && replaySound(sound)) engaged();
      return;
    }
    if (id) return scheduleHint(); // a letter with nothing to say yet
    const word = touchOpts.pickWord?.(e.clientX, e.clientY);
    if (word && (!replaying || replayQueue.length === 0) && replayWord(word)) engaged();
    else scheduleHint();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (gesture?.pointerId !== e.pointerId) return;
    gesture = null;
    rail.release();
    rail.clearMarks();
    interpreter.cancel();
  }

  /**
   * The rail's speaker is its own element (the shell's, over the stage), so
   * its presses don't reach the stage's listeners: it hands them here. It
   * captures the pointer, so a drag that starts on it keeps arriving.
   */
  const railPuck = {
    down: (e: PointerEvent) => {
      (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
      onPointerDown(e, true);
    },
    move: (e: PointerEvent) => {
      if (gesture?.fromPuck) onPointerMove(e);
    },
    up: (e: PointerEvent) => {
      if (gesture?.fromPuck) onPointerUp(e);
    },
    cancel: (e: PointerEvent) => {
      if (gesture?.fromPuck) onPointerCancel(e);
    },
  };

  function onPointerLeave(): void {
    hover = null;
    updateCursor();
  }

  // --- The hint: a ghost finger sweeps a formed word, silently ---
  //
  // Once a word has been heard as a word (its word step's audio played), and
  // while it still stands formed with every letter's sound heard, the first
  // time the lesson sits idle for HINT_IDLE_MS a translucent finger glides
  // under it left to right and each letter team bounces as it passes: "you
  // can touch these, and drag". After the word's playback, so the sweep never
  // shows a blend before the lesson has. (A word whose letters leave straight
  // after, like the digraph's ship, gets none.) Silent, so it's a hint, not
  // the lesson sounding the word out again. Once per word; never again once
  // the child has played something by touch.

  const HINT_IDLE_MS = 3000;
  const HINT_PX_PER_S = 240;
  const touchHint = ref<TouchHintState>({ visible: false, x: 0, y: 0, opacity: 0, pressed: false });
  let touchEngaged = false;
  const hintShownFor = new Set<string>();
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  let hintAnim: { pause: () => void } | null = null;

  function engaged(): void {
    touchEngaged = true;
    cancelHint();
  }

  /** The heard word's letters, if it's still standing and each has a sound to replay. */
  function hintActorIds(): TActorId[] | null {
    if (!hintWord || hintShownFor.has(hintWord.word)) return null;
    const ids = hintWord.ids;
    if (ids.length < 2 || !ids.every((id) => liveSound(id))) return null;
    const onStage = ids.every((id) => {
      const b = measureActorBounds(id);
      return !!b && b.right - b.left >= 1; // not walked off / display: none
    });
    return onStage ? ids : null;
  }

  /** (Re)start the idle countdown toward a hint, if one is due. */
  function scheduleHint(): void {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    if (!options.touchReplay || touchOpts.hint === false || touchEngaged || !touchEl) return;
    const at = stepIndex.value;
    if (!hintActorIds()) return;
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (stepIndex.value !== at || gesture || replaying || !replayOpen()) return scheduleHint();
      const ids = hintActorIds();
      if (ids && hintWord) runHint(hintWord.word, ids);
    }, HINT_IDLE_MS);
  }

  function cancelHint(): void {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    hintAnim?.pause();
    hintAnim = null;
    touchHint.value = { ...touchHint.value, visible: false, opacity: 0, pressed: false };
  }

  function runHint(word: string, ids: TActorId[]): void {
    const boxes = ids.map((id) => measureActorBounds(id));
    if (boxes.some((b) => !b)) return;
    hintShownFor.add(word);
    const bs = boxes as { left: number; right: number; top: number; bottom: number }[];
    const left = Math.min(...bs.map((b) => b.left));
    const right = Math.max(...bs.map((b) => b.right));
    const top = Math.min(...bs.map((b) => b.top));
    const bottom = Math.max(...bs.map((b) => b.bottom));
    // Fingertip on the letters' lower bodies (clear of balloons and the audio button)
    const y = top + (bottom - top) * 0.65;
    // Each team bounces together as the fingertip reaches its first letter's centre
    const teams: { x: number; ids: TActorId[] }[] = [];
    const seen = new Set<SoundReplay>();
    ids.forEach((id, k) => {
      const sound = soundByActor.get(id)!;
      if (seen.has(sound)) return;
      seen.add(sound);
      teams.push({ x: (bs[k].left + bs[k].right) / 2, ids: sound.actorIds.filter((a) => ids.includes(a)) });
    });
    const x0 = left - 40;
    const x1 = right + 30;
    const proxy = { x: x0, opacity: 0 };
    const show = (pressed: boolean) =>
      (touchHint.value = { visible: true, x: proxy.x, y, opacity: proxy.opacity, pressed });
    let next = 0;
    const step = (fn: () => { pause: () => void }) => (hintAnim = fn());
    // fade in → press → glide (bouncing teams) → lift → fade out
    step(() =>
      animate(proxy, {
        opacity: 1,
        duration: 250,
        ease: 'outQuad',
        onUpdate: () => show(false),
        onComplete: () =>
          step(() =>
            animate(proxy, {
              x: x1,
              duration: ((x1 - x0) / HINT_PX_PER_S) * 1000,
              delay: 120,
              ease: 'inOutSine',
              onUpdate: () => {
                show(true);
                while (next < teams.length && proxy.x >= teams[next].x) {
                  for (const id of teams[next].ids) {
                    const actor = actors.get(id);
                    if (actor) void asLessonActor(actor).applyEffect('bounce');
                  }
                  next++;
                }
              },
              onComplete: () =>
                step(() =>
                  animate(proxy, {
                    opacity: 0,
                    duration: 300,
                    delay: 120,
                    onUpdate: () => show(false),
                    onComplete: () => {
                      hintAnim = null;
                      touchHint.value = { ...touchHint.value, visible: false };
                    },
                  }) as { pause: () => void },
                ),
            }) as { pause: () => void },
          ),
      }) as { pause: () => void },
    );
  }

  watch(stepIndex, () => cancelHint());

  let touchEl: HTMLElement | null = null;
  function attachTouch(): void {
    const el = stageContainerRef.value;
    if (!options.touchReplay || !el) return;
    touchEl = el;
    el.style.touchAction = 'none'; // a drag across the word must not scroll
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave', onPointerLeave);
  }

  function detachTouch(): void {
    const el = touchEl;
    cancelHint();
    touchEl = null;
    gesture = null;
    rail.release();
    interpreter.cancel();
    hover = null;
    replayQueue.length = 0;
    if (!el) return;
    el.style.touchAction = '';
    el.style.cursor = '';
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    el.removeEventListener('pointerleave', onPointerLeave);
  }

  function start(): Promise<void> {
    return advance();
  }

  // -------------------------------------------------------------------------
  // Keyboard wiring
  // -------------------------------------------------------------------------

  const keyboard = useKeyboardContextOptional();
  const keyboardUnsubscribers: Unsubscribe[] = [];

  function configureKeyboard(): void {
    if (!keyboard) return;
    const audioMode = hasAudioButton.value;
    keyboard.requestConfig({
      letters: [],
      overrideBase: true,
      enabledLetters: [],
      showAdvance: true,
      advanceColor: audioMode ? soundCueColor.value : ADVANCE_COLOR_DEFAULT,
      advanceText: audioMode ? ADVANCE_TEXT_AUDIO : ADVANCE_TEXT_DEFAULT,
      showFullLayout: false,
      showArrows: false,
      disabled: false,
    });
  }

  watch(currentStep, () => configureKeyboard());
  watch(soundCueColor, () => configureKeyboard());
  watch(isComplete, (complete) => {
    configureKeyboard();
    if (complete) emit.lessonComplete();
  });

  function handleNativeKeydown(e: KeyboardEvent): void {
    if (e.key !== ' ') return;
    if (keyboard) return;
    e.preventDefault();
    handleAdvance();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  function attach(): void {
    configureKeyboard();
    attachTouch();
    if (keyboard) {
      keyboardUnsubscribers.push(keyboard.onAdvance(() => handleAdvance()));
    }
    document.addEventListener('keydown', handleNativeKeydown);
  }

  function detach(): void {
    detachTouch();
    document.removeEventListener('keydown', handleNativeKeydown);
    keyboardUnsubscribers.forEach((u) => u());
    keyboardUnsubscribers.length = 0;
    if (keyboard) keyboard.clearQuestionConfig();
    activeButtonAnim?.pause();
    activeButtonAnim = null;
    stopAllSpeak();
    stopAllIdle();
    audioCache.dispose();
  }

  return {
    stageContainerRef,
    audioElement,
    stepIndex,
    currentStep,
    isPhonemeStep,
    isWordStep,
    hasAudioButton,
    isComplete,
    isPlayingAudio,
    audioButtonShown,
    audioButtonReady,
    audioButtonStyle,
    audioButtonBgColor,
    soundRail,
    railPuck,
    touchHint,
    start,
    handleAdvance,
    speakWhile,
    recomputeAudioButton,
    attach,
    detach,
  };
}
