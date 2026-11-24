/**
 * useSoundRail — everything SoundRail.vue draws, and the speaker as an object
 * a finger can hold.
 *
 * One implementation for every owner: useLessonRunner (lessons) and
 * /dbg/lesson/gesture (the tuning bench). The owner measures its letters and
 * says what the rail is for right now (`input`); this works out
 *   - the geometry: the rail past the letters' ends, a dock for the speaker
 *     before a word, one milestone per sound (a split team like a-e gets two
 *     pads, bracketed);
 *   - each milestone's state, from a drag's reading (the gesture
 *     interpreter's trace), the sound replaying now, or a word's playback;
 *   - the speaker: at rest on the sound it will play, riding a word's
 *     recording, or held by a finger.
 *
 * Holding the speaker: a press on it takes hold where the finger is (the
 * grip) and the speaker follows from the first pixel, keeping its size and
 * colour, held to the groove. The owner feeds the gesture interpreter the
 * speaker's centre rather than the raw finger (`press` / `follow` return it),
 * so the milestone under the speaker is the one that sounds, and a finger
 * drifting off the rail doesn't take the speaker with it. A drag that starts
 * elsewhere (across the letters) picks the speaker up only once it is plainly
 * a drag, so a tap on a letter doesn't twitch it.
 *
 * Motion (utils/springMotion.ts): the speaker's position and width are springs that
 * keep their velocity, so it can be caught mid-glide where it's drawn, a
 * release carries the finger's speed into the settle, and a retarget never
 * restarts from rest. It stretches a little along its travel when it's
 * moving fast, gives at the rail's ends when dragged past them, and shakes
 * its head on a `nudge`. Following a finger or a word's audio clock it
 * tracks exactly (no lag), with its speed measured for the release.
 *
 * Audio, the interpreter, pointer listeners and taps stay with the owner.
 * Positions are px in the space of the rail's offset parent (the stage).
 */

import { computed, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { ActorBounds } from './lessonActor';
import type { RailMark, RailPuck, RailSegment, RailSegmentState, RailSpan, SoundRailView } from './soundRail';
import { prefersReducedMotion, runSpring, Spring, SPRINGS, stopSpring } from '../utils/springMotion';
import type { GestureTrace } from './touchGesture';

// Tuned on /dbg/lesson/gesture
export const RAIL_HEIGHT = 50; // a toddler's fingertip
export const RAIL_GAP = 12; // clear of the letters' feet (the speaker stands 4px proud of the rail)
export const RAIL_PAD = 10; // rail past the letters' ends
export const RAIL_PUCK = 56; // the speaker when it isn't sized to a milestone
export const RAIL_BAND_PAD = 12; // a finger slightly off the rail still counts
/** Room under the rail for a split team's bracket. */
const RAIL_BRACKET_ROOM = 16;
/** Dragged past the rail's end, the speaker gives this fraction of the overshoot, up to RUBBER_MAX px. */
const RUBBER = 0.2;
const RUBBER_MAX = 24;
/** Speed (px/s) at which the speaker is stretched along its travel by 1 (it caps well before). */
const STRETCH_PX_S = 12000;
const STRETCH_MAX = 0.1;

/** One sound on the rail: its letters, and the key its marks go by (the interpreter's team). */
export interface RailTeam<Id> {
  ids: Id[];
  key: unknown;
  /** Shown on its milestone: it plays on its own (see RailMark). */
  mark?: RailMark;
}

/** A word playing: progress through its speech window, and the sound whose slice it's in (-1: not yet). */
export interface RailSlide {
  f: number;
  active: number;
}

/** What the rail is for right now. */
export interface SoundRailInput<Id> {
  /** The letters' boxes (stage px). Only measured letters get a stretch of rail. */
  boxes: Map<Id, ActorBounds>;
  /** The sounds, in spelling order. */
  teams: RailTeam<Id>[];
  /** Each letter's colour (deep enough to carry a white icon); absent: the accent. */
  colors?: Map<Id, string>;
  /** Letters that won't answer a touch just now: their milestones go pale. */
  quiet?: Set<Id>;
  /** A word: the rail starts with a dock for the speaker. */
  dock: boolean;
  /**
   * Where the speaker rests: on a team (index), in the dock (null: it will
   * play the word, and rides it), or 'all': stretched over every milestone
   * (it will play the word, as a whole; MissingLetters' word mode).
   */
  cue: number | null | 'all';
  /** A word playing: the speaker rides it. */
  slide?: RailSlide | null;
  /** The stage's height: the rail (and a bracket under it) stays inside. */
  stageHeight?: number;
}

export interface SoundRailOptions<Id> {
  input: () => SoundRailInput<Id> | null;
  /** The cue's colour where it isn't a letter's own (docked, riding a word). */
  accent: () => string;
  /** The speaker shows "sounding". */
  playing: () => boolean;
  /** The cue's own sound is playing (not a replay): its milestone shows it. */
  cueSpeaking?: () => boolean;
  height?: () => number;
  gap?: () => number;
}

export interface SoundRailModel<Id> {
  view: ComputedRef<SoundRailView | null>;
  /** The speaker's colour at rest (so the keyboard's advance key can match), or null: no rail. */
  restColor: ComputedRef<string | null>;
  /** The team replaying now (by key): its milestone is raised. The owner sets it. */
  speaking: ShallowRef<unknown>;
  /** Milestones a drag has lit. Cleared by a new press, or by the owner once its sounds are done. */
  clearMarks(): void;
  /** Hand the gesture interpreter's trace here: the milestones follow the reading. */
  trace(e: GestureTrace<unknown>): void;
  /** Whether y is in the rail's band (on it, or a finger slightly off it). */
  inBand(y: number): boolean;
  /** The letter whose stretch of rail is under x, if y is in the rail's band; undefined: not in the band. */
  pickInBand(x: number, y: number, padPx: number): Id | null | undefined;
  /** Whether a point is on the speaker. */
  onPuck(x: number, y: number): boolean;
  /**
   * A press: on the speaker (`onPuck`) it takes hold. Returns the point to
   * read the gesture from: the speaker's centre when held, else the press.
   */
  press(p: Point, onPuck: boolean): Point;
  /** A move of the press. Moves the speaker (see the header) and returns the point to read from. */
  follow(p: Point, dragStartPx: number): Point;
  /** Whether the press in hand is holding the speaker. */
  holding: () => boolean;
  /** The press is over (lifted or cancelled): the speaker goes back to rest. */
  release(): void;
  /** The speaker's centre while it is dragged, or null. */
  dragX: Ref<number | null>;
  /** "No": the speaker shakes its head (a tap it can't answer just now). */
  nudge(): void;
}

interface Point {
  x: number;
  y: number;
}

/** Where a word's playback is at time t (ms), each sound an equal slice of its speech window (as speakerTimings assumes). */
export function slideAt(t: number, speechStart: number, speechEnd: number, sounds: number): RailSlide {
  const f = Math.max(0, Math.min(1, (t - speechStart) / Math.max(1e-6, speechEnd - speechStart)));
  return { f, active: t < speechStart ? -1 : Math.min(sounds - 1, Math.floor(f * sounds)) };
}

export function useSoundRail<Id>(opts: SoundRailOptions<Id>): SoundRailModel<Id> {
  const height = () => opts.height?.() ?? RAIL_HEIGHT;
  const gap = () => opts.gap?.() ?? RAIL_GAP;

  // What the drag in hand has done to each sound (by key), and the replay sounding now
  const fired = shallowRef(new Set<unknown>());
  const held = shallowRef(new Set<unknown>());
  const speaking = shallowRef<unknown>(null);

  function clearMarks(): void {
    if (fired.value.size) fired.value = new Set();
    if (held.value.size) held.value = new Set();
  }

  function trace(e: GestureTrace<unknown>): void {
    if (e.kind === 'team') {
      if (e.mode === 'live') fired.value = new Set(fired.value).add(e.team);
      else held.value = new Set(held.value).add(e.team);
    } else if (e.kind === 'flush') {
      const h = new Set(held.value);
      const f = new Set(fired.value);
      for (const team of e.teams) h.delete(team), f.add(team);
      held.value = h;
      fired.value = f;
    } else if (e.kind === 'word') {
      held.value = new Set(); // the word's own playback lights them
    }
  }

  /**
   * Each letter's stretch of the rail. A letter's on-screen box takes in its
   * arms (and, in 3D, its depth), so neighbours in a word overlap: letters
   * standing together meet half way instead, with a sliver between.
   */
  function cells(input: SoundRailInput<Id>): { id: Id; left: number; right: number; joinsPrev: boolean }[] {
    const row = [...input.boxes.entries()]
      .map(([id, b]) => ({ id, b }))
      .sort((p, q) => p.b.left + p.b.right - (q.b.left + q.b.right));
    const out = row.map(({ id, b }) => ({ id, left: b.left, right: b.right, joinsPrev: false }));
    for (let k = 1; k < row.length; k++) {
      const prev = row[k - 1].b;
      const cur = row[k].b;
      if (cur.left - prev.right > Math.max(12, (cur.bottom - cur.top) * 0.3)) continue; // standing apart
      const mid = (prev.right + cur.left) / 2;
      out[k - 1].right = mid - 2;
      out[k].left = mid + 2;
      out[k].joinsPrev = true;
    }
    return out;
  }

  /** The rail and its milestones, without the speaker. */
  const layout = computed(() => {
    const input = opts.input();
    if (!input || !input.boxes.size) return null;
    const all = [...input.boxes.values()];
    // Past the letters' ends, with a dock for the speaker before a word
    let left = Math.min(...all.map((b) => b.left)) - RAIL_PAD - (input.dock ? RAIL_PUCK + RAIL_PAD : 0);
    let right = Math.max(...all.map((b) => b.right)) + RAIL_PAD;
    const short = RAIL_PUCK + RAIL_PAD * 2 - (right - left); // under an i: still room for the speaker
    if (short > 0) (left -= short / 2), (right += short / 2);
    const h = height();
    let top = Math.max(...all.map((b) => b.bottom)) + gap();
    if (input.stageHeight !== undefined) top = Math.min(top, input.stageHeight - h - RAIL_BRACKET_ROOM);

    const accent = opts.accent();
    const row = cells(input);
    /** A team's pads: one per run of its letters standing together (sh: one; a-e: two). */
    const padsOf = (ids: Id[]): RailSpan[] => {
      const pads: RailSpan[] = [];
      let lastK = -2;
      row.forEach((cell, k) => {
        if (!ids.includes(cell.id)) return;
        const last = pads[pads.length - 1];
        if (last && lastK === k - 1 && cell.joinsPrev) last.width = cell.right - last.left;
        else pads.push({ left: cell.left, width: cell.right - cell.left });
        lastK = k;
      });
      return pads;
    };
    const slide = input.slide ?? null;
    const teams = input.teams.filter((t) => t.ids.some((id) => input.boxes.has(id)));
    const spanAll = input.cue === 'all';
    const cueTeam = typeof input.cue === 'number' ? teams.indexOf(input.teams[input.cue]) : -1;
    const state = (team: RailTeam<Id>, i: number): RailSegmentState => {
      if (slide) return i < slide.active ? 'fired' : i === slide.active ? 'speaking' : 'idle';
      if (speaking.value !== null && speaking.value === team.key) return 'speaking';
      if (fired.value.has(team.key)) return 'fired';
      if (held.value.has(team.key)) return 'held';
      if ((spanAll || i === cueTeam) && speaking.value === null && opts.cueSpeaking?.()) return 'speaking';
      return team.ids.some((id) => input.quiet?.has(id)) ? 'quiet' : 'idle';
    };
    const segments: RailSegment[] = teams.map((team, i) => ({
      key: i,
      color: input.colors?.get(team.ids[0]) ?? accent,
      pads: padsOf(team.ids),
      state: state(team, i),
      mark: team.mark,
    }));
    return { input, left, right, top, height: h, accent, segments, slide, cue: cueTeam, all: spanAll };
  });

  const restColor = computed<string | null>(() => {
    const l = layout.value;
    if (!l) return null;
    return l.cue >= 0 ? l.segments[l.cue].color : l.accent;
  });

  /** The speaker's centre x at fraction f of a word: dock → over each sound mid-slice → the rail's end. */
  function slideX(l: NonNullable<typeof layout.value>, f: number): number {
    const n = l.segments.length;
    const stops = [{ f: 0, x: l.left + RAIL_PAD + RAIL_PUCK / 2 }];
    l.segments.forEach((seg, i) => {
      const pad = seg.pads[0];
      if (pad) stops.push({ f: (i + 0.5) / n, x: pad.left + pad.width / 2 });
    });
    stops.push({ f: 1, x: l.right - RAIL_PAD - RAIL_PUCK / 2 });
    for (let k = 1; k < stops.length; k++) {
      if (f > stops[k].f) continue;
      const a = stops[k - 1];
      const b = stops[k];
      return a.x + ((f - a.f) / Math.max(1e-6, b.f - a.f)) * (b.x - a.x);
    }
    return stops[stops.length - 1].x;
  }

  // The press in hand: where it started (as read), and its grip if it holds the speaker
  const dragX = ref<number | null>(null);
  let origin: Point | null = null;
  /**
   * Where on the speaker the finger took hold, and how it looked then. It
   * keeps that grip, size and colour while dragged, so it moves as one object
   * instead of jumping to centre itself under the finger.
   */
  const grip = shallowRef<{ dx: number; width: number; color?: string } | null>(null);
  /** The held speaker has moved far enough to be a drag: it lifts off the groove (until then it's pressed in). */
  const lifted = ref(false);

  /** Where the speaker should be (and how it should look); `track`: follow it exactly, else spring to it. */
  const target = computed<{ l: NonNullable<typeof layout.value>; puck: RailPuck; track: boolean } | null>(() => {
    const l = layout.value;
    if (!l) return null;
    const clampCentre = (x: number, w: number) => Math.max(l.left + w / 2, Math.min(l.right - w / 2, x));
    let puck: RailPuck;
    if (dragX.value !== null) {
      const w = grip.value?.width ?? RAIL_PUCK;
      // A held speaker dragged past the rail's end gives a little; else it stops there
      const clamped = clampCentre(dragX.value, w);
      const over = dragX.value - clamped;
      const x = grip.value ? clamped + Math.sign(over) * Math.min(RUBBER_MAX, Math.abs(over) * RUBBER) : clamped;
      // held (lifted) when it's the speaker a finger took hold of; else it rides under a drag across the word
      puck = {
        left: x - w / 2,
        width: w,
        color: grip.value?.color ?? l.accent,
        pressed: grip.value !== null && !lifted.value,
        held: lifted.value,
      };
    } else if (l.slide) {
      const x = clampCentre(slideX(l, l.slide.f), RAIL_PUCK);
      puck = { left: x - RAIL_PUCK / 2, width: RAIL_PUCK, color: l.accent, playing: opts.playing() };
    } else {
      // At rest: on (as wide as, and the colour of) the sound it will play, or
      // docked before the word in the accent (the spacebar's colour)
      const pads = l.segments.flatMap((seg) => seg.pads);
      const pad = l.all
        ? // over every milestone, first pad to last
          pads.length
          ? {
              left: Math.min(...pads.map((p) => p.left)),
              width: Math.max(...pads.map((p) => p.left + p.width)) - Math.min(...pads.map((p) => p.left)),
            }
          : undefined
        : l.cue >= 0
          ? l.segments[l.cue].pads[0]
          : undefined;
      const rest = !pad
        ? { left: l.left + RAIL_PAD, width: RAIL_PUCK }
        : pad.width >= RAIL_PUCK
          ? pad
          : { left: pad.left + pad.width / 2 - RAIL_PUCK / 2, width: RAIL_PUCK };
      puck = { ...rest, color: restColor.value ?? l.accent, playing: opts.playing() };
    }
    return { l, puck, track: dragX.value !== null || !!l.slide };
  });

  // ---------------------------------------------------------------------------
  // Motion: the drawn speaker (centre x relative to the rail, and width)
  // ---------------------------------------------------------------------------

  const cx = new Spring(0, SPRINGS.enter);
  const cw = new Spring(RAIL_PUCK, SPRINGS.morph);
  const shake = new Spring(0, SPRINGS.shake);
  /** Measured speed while tracking (px/s, smoothed), handed to the spring on release. */
  let trackV = 0;
  const drawn = shallowRef<{ cx: number; w: number; v: number; shake: number } | null>(null);

  function frame(dt: number): boolean {
    const t = target.value;
    if (!t) {
      drawn.value = null;
      return false;
    }
    const toX = t.puck.left + t.puck.width / 2 - t.l.left;
    if (!drawn.value || prefersReducedMotion()) {
      // first sight (or no motion wanted): it is where it belongs
      cx.snap(toX);
      cw.snap(t.puck.width);
      shake.snap(0);
      trackV = 0;
      drawn.value = { cx: toX, w: t.puck.width, v: 0, shake: 0 };
      return false;
    }
    let moving = false;
    if (t.track) {
      const v = dt > 0 ? (toX - cx.x) / dt : 0;
      trackV += (v - trackV) * Math.min(1, dt / 0.05);
      cx.x = cx.to = toX;
      cx.v = trackV;
      moving = Math.abs(trackV) > 0.5; // still, it rests until the target moves again (the watch kicks it)
    } else {
      cx.to = toX;
      moving = cx.step(dt);
    }
    cw.to = t.puck.width;
    moving = cw.step(dt) || moving;
    moving = shake.step(dt) || moving;
    drawn.value = { cx: cx.x, w: cw.x, v: cx.v, shake: shake.x };
    return moving;
  }
  const kick = () => runSpring(frame);
  watch(target, kick, { immediate: true });
  onScopeDispose(() => stopSpring(frame));

  function nudge(): void {
    if (prefersReducedMotion()) return;
    shake.v = 380;
    kick();
  }

  const view = computed<SoundRailView | null>(() => {
    const t = target.value;
    if (!t) return null;
    const { l } = t;
    const d = drawn.value;
    let puck = t.puck;
    if (d) {
      const s = Math.min(STRETCH_MAX, Math.abs(d.v) / STRETCH_PX_S);
      puck = { ...puck, left: l.left + d.cx - d.w / 2 + d.shake, width: d.w, stretch: s > 0.005 ? s : 0 };
    }
    const filling = (dragX.value !== null && (!grip.value || lifted.value)) || !!l.slide;
    const fillTo = filling ? puck.left + puck.width / 2 : null;
    return { left: l.left, top: l.top, width: l.right - l.left, height: l.height, segments: l.segments, puck, fillTo };
  });

  function inBand(y: number): boolean {
    const v = view.value;
    return !!v && y >= v.top - RAIL_BAND_PAD && y <= v.top + v.height + RAIL_BAND_PAD;
  }

  function pickInBand(x: number, y: number, padPx: number): Id | null | undefined {
    const l = layout.value;
    if (!l || !inBand(y)) return undefined;
    let best: Id | null = null;
    let bestDist = Infinity;
    for (const [id, b] of l.input.boxes) {
      if (x < b.left - padPx || x > b.right + padPx) continue;
      const d = Math.abs(x - (b.left + b.right) / 2);
      if (d < bestDist) (bestDist = d), (best = id);
    }
    return best;
  }

  function onPuck(x: number, y: number): boolean {
    const p = view.value?.puck;
    return !!p && inBand(y) && x >= p.left - 6 && x <= p.left + p.width + 6;
  }

  /** A held speaker's centre for a finger at p: minus the grip, held to the groove. */
  function asSpeaker(p: Point): Point {
    const v = view.value;
    const g = grip.value;
    if (!g || !v) return p;
    const half = g.width / 2;
    return {
      x: Math.max(v.left + half, Math.min(v.left + v.width - half, p.x - g.dx)),
      y: v.top + v.height / 2,
    };
  }

  function press(p: Point, takesHold: boolean): Point {
    clearMarks();
    dragX.value = null;
    grip.value = null;
    lifted.value = false;
    const puck = takesHold ? view.value?.puck : null;
    if (puck) {
      // Caught where it's drawn (mid-glide too): it stops under the finger
      const centre = puck.left + puck.width / 2;
      grip.value = { dx: p.x - centre, width: puck.width, color: puck.color };
      trackV = 0;
      dragX.value = centre;
    }
    origin = asSpeaker(p);
    return origin;
  }

  function follow(p: Point, dragStartPx: number): Point {
    const q = asSpeaker(p);
    const far = !!origin && Math.hypot(q.x - origin.x, q.y - origin.y) >= dragStartPx;
    if (grip.value) {
      dragX.value = p.x - grip.value.dx; // unclamped: past the ends it gives (target)
      if (far) lifted.value = true;
    } else if (dragX.value !== null || far) {
      dragX.value = q.x;
    }
    return q;
  }

  function release(): void {
    dragX.value = null;
    grip.value = null;
    lifted.value = false;
    origin = null;
  }

  return {
    view,
    restColor,
    speaking,
    clearMarks,
    trace: trace as (e: GestureTrace<unknown>) => void,
    inBand,
    pickInBand,
    onPuck,
    press,
    follow,
    holding: () => grip.value !== null,
    release,
    dragX,
    nudge,
  };
}
