/**
 * Slide play: letters taking turns on the playground slide, the sight-words
 * lesson's background activity (SPIKE; seen in /dbg/lesson/three's
 * playground sketch). Each letter runs a loop: wait in line at the foot of
 * the steps, hop up them, pause on the platform, slide down and sail off the
 * end onto the sand, hop back round behind the slide and join the end of the
 * line.
 *
 * Each step, the platform and the chute hold one letter at a time: a letter
 * claims the next place before it leaves the one it's on, so they never pile
 * up. The pauses run on anime's clock, with every tween.
 *
 * The lesson's acts take letters out of the loop and direct them: one runs
 * back up the slide while another waits at the top, then they come down and
 * step forward into a row as a word.
 */

import * as THREE from 'three';
import type { Actor3D, CameraShot } from '../../letterpeople/three/stage3d';
import { rowCenters } from './lesson3d';
import { PLAYGROUND_SLIDE_X, PLAYGROUND_SLIDE_Z } from '../../letterpeople/three/environments';
import { SLIDE, chuteAngle, chuteY, slideMetrics, type SlideTread } from '../../letterpeople/three/slideProp';
import {
  ARMS_UP,
  appeal,
  glare,
  grin,
  headOf,
  jab,
  restMouth,
  sheepish,
  smugWiggle,
  stamp,
  tauntWave,
  wait,
} from '../../letterpeople/three/reactions';

export { wait };

// --- Tuning -----------------------------------------------------------------

/**
 * Letters stand this far right of the platform's middle (toward the chute):
 * clear of a wide letter (w, 80) on the top step, whose tread it overhangs.
 */
const PLATFORM_STAND = 6;
/** Gaps in the line at the foot of the steps (centre to centre). */
const LINE_SPACING = 80;
/** The front of the line: this far left of the first step (centre). */
const LINE_FRONT_GAP = 55;
/** The way back runs behind the slide, this far behind its centre line. */
const BACK_Z = -85;
/** The hop back along the slide's length (a few long bounds). */
const BACK_TRIP_MS = 2200;

// Slide physics, world units and seconds. A letter scoots along the level top
// to the lip, slides (gravity against friction), slows on the run-out, sails
// off the end, drops to the sand and skids to a stop.
const SLIDE_GRAVITY = 900;
// Tuned for the 144 platform (48° at the steepest): tops out ~3.2 letter
// heights/s, leaves the end at ~170/s, rests ~77 past it, 2.5 s in all
const SLIDE_FRICTION = 0.5;
/** Scooting along the top, until the slope is steep enough to take over. */
const SCOOT_SPEED = 80;
const SCOOT_UNTIL = 30; // past the lip
/** The least speed further down, so it never stalls. */
const SLIDE_MIN_SPEED = 30;
const RUNOUT_FRICTION = 0.45;
/** The drop off the end: the hops' gravity (locomotion.ts GRAVITY, per s²). */
const FALL_GRAVITY = 2137;
/** Tipping forward mid-drop, radians at most. */
const FALL_TIP = 0.15;
const SAND_DECEL = 600;
/** Slide arms: up and out ("wheee"). */

// The lesson's acts
/** Gaps between the word's letters. */
const WORD_ROW_GAP = 8;
/**
 * Jumping down off the back of the steps lands this far behind them (clear
 * of them even turned part-way, as a hopper is).
 */
const STEP_OFF = 40;
/** Left of this far past the run-out's end, a letter goes to its place in the word round behind the slide. */
const FOOT_CLEAR = 30;
/** Climbing back up the chute: turned this far up-slope (radians, ~34°), over this long. */
const CLIMB_YAW = -0.6;
const CLIMB_MS = 2400;
/** The climber stops this far short of the letter waiting on top. */
const CLIMB_GAP = 10;
/**
 * The climber keeps this far back of the chute's centre line (a wall's
 * width). Turned up-slope it spreads across the chute: centred, it cut into
 * the near wall (up to 4.5). Back here it clears the near wall all the way up
 * and dips into the far one instead (up to 7), hidden behind itself.
 */
const CLIMB_DZ = -SLIDE.wallThickness;
/**
 * The climber's bounces on the slope, world units: small, since the sound
 * button is placed over it once and doesn't follow.
 */
const TAUNT_BOUNCE = 12;

/**
 * The sight-words lesson's view: fitted to the play (the line on the left,
 * the landing on the right), with the narrator inside it, in front of the
 * steps (Colin, 2026-09-28: compacted from a lane of its own on the left).
 */
export const PLAYGROUND_FRAME = { halfWidth: 290, centerX: PLAYGROUND_SLIDE_X - 25, top: 215, heightFactor: 3 };
export const PLAYGROUND_NARRATOR = { x: PLAYGROUND_SLIDE_X - 150, z: PLAYGROUND_SLIDE_Z + 200, scale: 1.1 };
/**
 * Where the narrator moves during the face-off close-up (out of shot), to
 * narrate the word from: in front of it and to its left (the word forms at
 * the slide's foot; neither the narrator nor its balloon overlaps it at 2.2,
 * 1.4 or 0.9 aspect, and the word fills 31–42% of the view's width).
 */
export const PLAYGROUND_NARRATOR_FOR_WORD = {
  x: PLAYGROUND_SLIDE_X + slideMetrics().chute.x2 - 52,
  z: PLAYGROUND_SLIDE_Z + 120,
};

// --- Helpers ----------------------------------------------------------------

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const mid = (t: SlideTread) => (t.x0 + t.x1) / 2;

/** A place one letter at a time may be: a step, the platform, the chute. */
class Place {
  private holder: Actor3D | null = null;
  private waiting: (() => void)[] = [];

  holds(who: Actor3D): boolean {
    return this.holder === who;
  }

  /** Wait for the place, then take it; false (without taking it) if `abort` says so on waking. */
  async claim(who: Actor3D, abort: () => boolean = () => false): Promise<boolean> {
    while (this.holder !== null && this.holder !== who) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
      if (abort()) return false;
    }
    this.holder = who;
    return true;
  }

  release(): void {
    this.holder = null;
    this.wake();
  }

  /** Wake everyone waiting, to look again (and maybe give up). */
  wake(): void {
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}

/** The line at the foot of the steps. */
class Line {
  private readonly order: Actor3D[] = [];
  private listeners: (() => void)[] = [];

  join(who: Actor3D): void {
    this.order.push(who);
    this.notify();
  }

  leave(who: Actor3D): void {
    const i = this.order.indexOf(who);
    if (i >= 0) this.order.splice(i, 1);
    this.notify();
  }

  indexOf(who: Actor3D): number {
    return this.order.indexOf(who);
  }

  /** Resolves on the next join or leave (or poke). */
  changed(): Promise<void> {
    return new Promise((resolve) => this.listeners.push(resolve));
  }

  /** Wake everyone waiting on the line, to look again. */
  poke(): void {
    this.notify();
  }

  private notify(): void {
    for (const resolve of this.listeners.splice(0)) resolve();
  }
}

interface SlideSample {
  x: number;
  y: number;
  roll: number;
}

/**
 * A letter `width` wide sliding to a stop on the sand, as its base centre and
 * tilt over time (slide-local): from the platform's middle with a scoot, or
 * from anywhere down the chute at a speed. It keeps its footing on the
 * run-out until its trailing edge is past the end (cartoon physics: no
 * tumbling off the lip).
 */
export function slideRun(width: number, fromX?: number, fromSpeed = SCOOT_SPEED) {
  const m = slideMetrics();
  const dt = 1 / 240;
  const samples: SlideSample[] = [];
  let x = fromX ?? (m.platform.x0 + m.platform.x1) / 2 + PLATFORM_STAND;
  let v = fromSpeed;
  const push = () => samples.push({ x, y: chuteY(x), roll: chuteAngle(x) });
  push();
  // Along the top and down the chute
  while (x < m.chute.x1) {
    const down = -chuteAngle(x);
    const least = x < m.chute.x0 + SCOOT_UNTIL ? SCOOT_SPEED : SLIDE_MIN_SPEED;
    v = Math.max(least, v + SLIDE_GRAVITY * (Math.sin(down) - SLIDE_FRICTION * Math.cos(down)) * dt);
    x += v * Math.cos(down) * dt;
    push();
  }
  // The run-out, until the trailing edge leaves it
  const edge = m.chute.x2 + width / 2;
  while (x < edge && v > 0) {
    v = Math.max(0, v - RUNOUT_FRICTION * SLIDE_GRAVITY * dt);
    x += v * dt;
    push();
  }
  if (v > 0) {
    // Off the end, onto the sand
    const h = SLIDE.runoutY;
    const dropS = Math.sqrt((2 * h) / FALL_GRAVITY);
    let t = 0;
    let y: number = h;
    while (y > 0) {
      t += dt;
      y = Math.max(0, h - 0.5 * FALL_GRAVITY * t * t);
      x += v * dt;
      samples.push({ x, y, roll: -FALL_TIP * Math.sin(Math.PI * Math.min(1, t / dropS)) });
    }
    while (v > 0) {
      v = Math.max(0, v - SAND_DECEL * dt);
      x += v * dt;
      samples.push({ x, y: 0, roll: 0 });
    }
  }
  const last = samples.length - 1;
  return {
    ms: last * dt * 1000,
    /** Where it is at t in 0…1. */
    at(t: number): SlideSample {
      const f = t * last;
      const i = Math.min(last - 1, Math.floor(f));
      const a = samples[i];
      const b = samples[i + 1];
      const k = f - i;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, roll: a.roll + (b.roll - a.roll) * k };
    },
    /** When (0…1) it first passes x. */
    when(px: number): number {
      const i = samples.findIndex((s) => s.x >= px);
      return i < 0 ? 1 : i / last;
    },
  };
}

// --- The close-up on the face-off ---------------------------------------------

/** How steeply the face-off close-up looks down (the play's view: about 0.16). */
const FACE_OFF_ELEVATION = 0.4;
/** Room around the pair in the close-up, world units (the sound button sits above the climber). */
const FACE_OFF_MARGIN = 45;

/**
 * The close-up on the face-off: the climber and the one above it, looked
 * down on a little more steeply than the play's view (from the play's low
 * angle, the climber's mouth was hard to make out).
 */
export function faceOffShot(cast: SlideCast): CameraShot {
  const box = new THREE.Box3();
  for (const a of [cast.climber, cast.above]) box.union(new THREE.Box3().setFromObject(a.letter.root));
  const size = box.getSize(new THREE.Vector3());
  return {
    target: box.getCenter(new THREE.Vector3()),
    halfWidth: size.x / 2 + FACE_OFF_MARGIN,
    halfHeight: size.y / 2 + FACE_OFF_MARGIN,
    elevation: FACE_OFF_ELEVATION,
  };
}

/**
 * Where each letter of the word stands: a row along the slide's centre line,
 * past its foot, anchored on where `above` (the last down, and the word's
 * first letter) comes to rest after its slide, so it can stay put there.
 */
function wordRow(cast: SlideCast) {
  const aboveAt = cast.word.indexOf(cast.above);
  const rest = PLAYGROUND_SLIDE_X + slideRun(Math.round(cast.above.letter.width)).at(1).x;
  const before = cast.word.slice(0, aboveAt).reduce((sum, a) => sum + a.width + WORD_ROW_GAP, 0);
  let left = rest - cast.above.width / 2 - before;
  return cast.word.map((a) => {
    const spot = { x: left + a.width / 2, z: PLAYGROUND_SLIDE_Z, width: a.width };
    left += a.width + WORD_ROW_GAP;
    return spot;
  });
}

/** Room above the narrator's head in the word shot, for its balloon, world units. */
const WORD_SHOT_BALLOON_ROOM = 60;
const WORD_SHOT_MARGIN = 40;
/** The word shot looks down a touch more than the play's view (0.16). */
const WORD_SHOT_ELEVATION = 0.2;

/**
 * The shot the camera pulls back to for the word: the narrator (standing at
 * `at`) and the word's row, with room above the narrator for its balloon.
 * From known places, so the camera can head there while the letters are
 * still on their way in.
 */
export function wordShot(cast: SlideCast, narrator: Actor3D, at: { x: number; z: number }): CameraShot {
  const tall = new THREE.Box3().setFromObject(narrator.letter.root).getSize(new THREE.Vector3()).y;
  const box = new THREE.Box3();
  box.expandByPoint(new THREE.Vector3(at.x - narrator.width / 2, 0, at.z));
  box.expandByPoint(new THREE.Vector3(at.x + narrator.width / 2, tall + WORD_SHOT_BALLOON_ROOM, at.z));
  for (const spot of wordRow(cast)) {
    box.expandByPoint(new THREE.Vector3(spot.x - spot.width / 2, 0, spot.z));
    box.expandByPoint(new THREE.Vector3(spot.x + spot.width / 2, 70, spot.z));
  }
  const size = box.getSize(new THREE.Vector3());
  return {
    target: box.getCenter(new THREE.Vector3()),
    halfWidth: size.x / 2 + WORD_SHOT_MARGIN,
    halfHeight: size.y / 2 + WORD_SHOT_MARGIN,
    elevation: WORD_SHOT_ELEVATION,
  };
}

// --- The play ---------------------------------------------------------------

export interface SlidePlay {
  /**
   * Hold the play: no one starts a new move, and each letter finishes the
   * one it's in (at most a slide, about 2.6 s, or the hop along behind the
   * slide), turns to face the audience and stays put. Every place a letter
   * can stop is in view: the hop behind the slide runs on into the line.
   * Resolves once they're all still.
   */
  hold(): Promise<void>;
  /** Carry on from wherever each letter was held. */
  resume(): void;
  /** Letters finish the move they're in, then stop for good. */
  stop(): void;
  /**
   * Run on until `who` stands on top of the slide, then hold the play there
   * (as hold(): all still, facing out). Resolves once they're held.
   */
  holdWhenOnTop(who: Actor3D): Promise<void>;
  /**
   * Bring `who` to the nearer end of the slide and hold the play there: if
   * it has just slid (sliding, or on its first hop back), to the bottom where
   * it landed, keeping the chute; otherwise on to the top. Resolves (with
   * which end) once they're held.
   */
  holdAtAnEnd(who: Actor3D): Promise<'top' | 'bottom'>;
  /**
   * The rule bent (from holdAtAnEnd(cast.climber)): the one below steps
   * forward to its place in the word and waits; the climber (sliding down
   * first if it's on top) runs straight back up the chute (trying, slipping
   * back once) and stops just short of the top, where `above`, carrying on up
   * the steps, arrives to find it. Resolves once they're face to face; the
   * face-off then plays on until formWord: `above` irate (stamping hops,
   * jabbing an arm, appealing to `appealTo` or `below` with arms spread),
   * the climber obnoxious (bouncing on the slope laughing, a taunting wave, a
   * grin at the audience), `below` watching. `climbing` cues the start of
   * the climb.
   */
  misbehave(cast: SlideCast, cues?: { climbing?: () => void; appealTo?: Actor3D }): Promise<void>;
  /**
   * While true, the face-off (misbehave → formWord) starts no new moves: for
   * the climber's sound playing.
   */
  quiet(on: boolean): void;
  /**
   * The word (after misbehave): the climber gives up and slides down, then
   * `above`; each steps forward into its place beside `below`. Resolves once
   * the word stands in a row in front of the slide's foot, facing out.
   */
  formWord(cast: SlideCast): Promise<void>;
}

/** Who does what in the lesson's acts. */
export interface SlideCast {
  /** The word the players end up as, in spelling order. */
  word: Actor3D[];
  /** Bends the rule: runs back up the slide. */
  climber: Actor3D;
  /** Next after the climber: comes up the steps and waits at the top. */
  above: Actor3D;
  /** Just before the climber: stays at the bottom. */
  below: Actor3D;
}

/** A held letter turned further than this from the audience turns to face it. */
const FACE_TOLERANCE = (15 * Math.PI) / 180;

/**
 * Start the letters playing on the playground's slide. They're placed at
 * staggered points of the loop (the first on the platform, the next on the
 * bottom step, the rest in line), so the play is already going.
 */
export function startSlidePlay(actors: Actor3D[]): SlidePlay {
  const m = slideMetrics();
  const X = PLAYGROUND_SLIDE_X;
  const Z = PLAYGROUND_SLIDE_Z;
  const places = m.treads.map(() => new Place());
  const top = places.length - 1; // the platform
  const chute = new Place();
  const line = new Line();
  let stopped = false;

  const lineSpot = (i: number) => ({ x: X + m.x0 - LINE_FRONT_GAP - i * LINE_SPACING, z: Z });
  const runs = new Map<number, ReturnType<typeof slideRun>>();
  const runFor = (width: number) => {
    const key = Math.round(width);
    if (!runs.has(key)) runs.set(key, slideRun(key));
    return runs.get(key)!;
  };

  // --- Holding ---
  let holding = false;
  let released: Promise<void> = Promise.resolve();
  let release = () => {};
  /** Letters mid-move (hold() waits for this to empty). */
  const moving = new Set<Actor3D>();
  let settled: (() => void)[] = [];
  const checkSettled = () => {
    if (holding && moving.size === 0) for (const done of settled.splice(0)) done();
  };

  // --- Taking letters out of the play (the lesson's acts) ---
  const RETIRED = new Error('taken out of the play');
  const retired = new Set<Actor3D>();
  const exited = new Map<Actor3D, () => void>();
  const nudges = new Map<Actor3D, () => void>();

  /**
   * Take `a` out of the play at its next stop (at once if it's held).
   * Resolves once it's out; it still holds any places it had.
   */
  function retire(a: Actor3D): Promise<void> {
    retired.add(a);
    const out = new Promise<void>((resolve) => exited.set(a, resolve));
    // Wherever it's waiting (held, on a place, on the line), it wakes and leaves
    nudges.get(a)?.();
    for (const p of [...places, chute]) p.wake();
    line.poke();
    return out;
  }
  const leaving = (a: Actor3D) => () => retired.has(a);

  /** Let go of every place `a` holds. */
  function releaseHeld(a: Actor3D) {
    for (const p of [...places, chute]) if (p.holds(a)) p.release();
  }

  /** Where each letter is in its turn (for choosing the nearer end of the slide). */
  type Phase = 'line' | 'steps' | 'top' | 'sliding' | 'backLeg1' | 'bottom' | 'corner' | 'backPath';
  const phase = new Map<Actor3D, Phase>();
  /** Where each letter last came to rest after sliding. */
  const landedAt = new Map<Actor3D, { x: number; z: number }>();
  /** A request to bring a letter on its first hop back to where it landed. */
  let backToBottom: { who: Actor3D; done: () => void } | null = null;

  /** Who is standing on the platform, and who's waiting to hear they've arrived. */
  let atTop: Actor3D | null = null;
  const topWaiters: { who: Actor3D; done: () => void }[] = [];
  function arrivedOnTop(a: Actor3D) {
    atTop = a;
    phase.set(a, 'top');
    for (const w of topWaiters.splice(0)) {
      if (w.who === a) w.done();
      else topWaiters.push(w);
    }
  }
  const whenOnTop = (who: Actor3D) =>
    new Promise<void>((done) => (atTop === who ? done() : topWaiters.push({ who, done })));

  /** Turn to the audience (a small hop), unless already facing it. */
  async function faceOut(a: Actor3D) {
    if (Math.abs(a.walker.getYaw()) <= FACE_TOLERANCE) return;
    moving.add(a);
    await a.walker.turnTo(0, { gait: 'hop' });
    moving.delete(a);
    checkSettled();
  }

  /** While the play is held: face the audience, then wait to carry on. */
  async function checkpoint(a: Actor3D) {
    if (retired.has(a)) throw RETIRED;
    if (!holding) return;
    await faceOut(a);
    checkSettled();
    while (holding && !retired.has(a)) {
      await Promise.race([released, new Promise<void>((resolve) => nudges.set(a, resolve))]);
    }
    nudges.delete(a);
    if (retired.has(a)) throw RETIRED;
  }

  /**
   * A move, with a chance to hold before and after it. `before: false` for a
   * move that carries straight on from the last; `after: false` where
   * stopping would leave the letter out of sight.
   */
  async function move(a: Actor3D, go: () => Promise<unknown>, { before = true, after = true } = {}) {
    if (before) await checkpoint(a);
    if (stopped) return;
    moving.add(a);
    try {
      await go();
    } finally {
      moving.delete(a);
    }
    if (after) await checkpoint(a);
    else checkSettled();
  }

  /** Where a letter stands on tread k (the platform is the top one). */
  const standX = (k: number) => X + mid(m.treads[k]) + (k === top ? PLATFORM_STAND : 0);
  const hopUpTo = (a: Actor3D, k: number) => a.walker.hopOnto({ x: standX(k), z: Z, floorY: m.treads[k].y });

  /** In line: move up as the line moves, until at the front. */
  async function waitInLine(a: Actor3D) {
    let spot = line.indexOf(a);
    while (!stopped) {
      const i = line.indexOf(a);
      if (i !== spot) {
        spot = i;
        await move(a, () => a.walker.walkTo(lineSpot(i), { gait: 'hop' }));
        continue; // the line may have moved meanwhile
      }
      if (i === 0) return;
      await line.changed();
      if (retired.has(a)) throw RETIRED;
    }
  }

  /**
   * Down the chute and off the end onto the sand, arms up and mouth open.
   * The platform frees once its trailing edge is clear of it.
   */
  async function slide(a: Actor3D, run = runFor(a.letter.width)) {
    const { letter, walker } = a;
    // Off the top from the first scoot: a hold asked for now waits for its next turn
    if (atTop === a) atTop = null;
    phase.set(a, 'sliding');
    const yaw0 = walker.getYaw();
    const z0 = walker.getPosition().z; // off the centre line if it gave up mid-climb
    const rest = letter.mouth?.getCurrentShapeParams();
    const mouthRest = rest ? { ...rest } : undefined;
    letter.arms?.left.rotateTo(ARMS_UP[0], { duration: 300, ease: 'outSine' });
    letter.arms?.right.rotateTo(ARMS_UP[1], { duration: 300, ease: 'outSine' });
    void letter.mouth?.updateShape({ openness: 0.7, mood: 1 }, { duration: 250 });
    const ride = walker.ride((t) => {
      const p = run.at(t);
      // Square to the camera (and onto the centre line) during the first of it
      const turn = Math.min(1, t / 0.2);
      const left = 1 - turn * turn * (3 - 2 * turn);
      return { x: X + p.x, y: p.y, z: Z + (z0 - Z) * left, roll: p.roll, yaw: yaw0 * left };
    }, run.ms);
    await wait(run.ms * run.when(m.platform.x1 + letter.width / 2));
    if (places[top].holds(a)) places[top].release();
    await ride;
    // Came to rest on the run-out (a slow start, a wide letter): hop down off its end
    if (walker.getFloorY() > 0) {
      await walker.hopOnto({ x: X + m.chute.x2 + letter.width / 2 + 20, z: Z, floorY: 0 });
    }
    landedAt.set(a, walker.getPosition());
    letter.arms?.relax({ duration: 300 });
    if (mouthRest) void letter.mouth?.updateShape(mouthRest, { duration: 250 });
  }

  /**
   * Back round behind the slide and into the line. The chute frees once it's
   * off the landing spot. It can be held at the corner past the slide's end,
   * but not along the back (out of sight) or at the far corner (behind the
   * line): that stretch runs straight on into its place in line.
   */
  async function goBack(a: Actor3D) {
    const backZ = Z + BACK_Z;
    const firstHop = () =>
      move(a, () => a.walker.walkTo({ x: a.walker.getPosition().x, z: backZ }, { gait: 'hop', faceCamera: false }), {
        before: false,
        after: false,
      });
    phase.set(a, 'backLeg1');
    await firstHop();
    if (backToBottom?.who === a) {
      // Asked back to the bottom: return to where it landed (it still has the chute) and hold there
      const request = backToBottom;
      backToBottom = null;
      await move(a, () => a.walker.walkTo(landedAt.get(a)!, { gait: 'hop' }), { before: false, after: false });
      phase.set(a, 'bottom');
      void hold().then(request.done);
      await checkpoint(a);
      // Resumed without being taken out of the play: off round the back again
      phase.set(a, 'backLeg1');
      await firstHop();
    }
    chute.release();
    phase.set(a, 'corner');
    await checkpoint(a);
    phase.set(a, 'backPath');
    await move(
      a,
      async () => {
        await a.walker.walkTo(
          { x: lineSpot(0).x - LINE_SPACING / 2, z: backZ },
          { gait: 'hop', faceCamera: false, durationMs: BACK_TRIP_MS },
        );
        line.join(a);
        phase.set(a, 'line');
        await a.walker.walkTo(lineSpot(line.indexOf(a)), { gait: 'hop' });
      },
      { before: false },
    );
  }

  async function play(a: Actor3D, startOn: number) {
    try {
      await loop(a, startOn);
    } catch (e) {
      if (e !== RETIRED) throw e;
      exited.get(a)?.();
    }
  }

  async function loop(a: Actor3D, startOn: number) {
    let k = startOn; // -1: in line
    while (!stopped) {
      if (k < 0) {
        await waitInLine(a);
        if (stopped) return;
        await wait(between(200, 600));
        if (!(await places[0].claim(a, leaving(a)))) throw RETIRED;
        await move(a, () => hopUpTo(a, 0));
        phase.set(a, 'steps');
        line.leave(a); // only now: the next in line hops up to where it stood
        k = 0;
      }
      while (k < top) {
        if (!(await places[k + 1].claim(a, leaving(a)))) throw RETIRED;
        await wait(between(80, 250));
        await move(a, () => hopUpTo(a, k + 1));
        places[k].release();
        k++;
        if (k === top) arrivedOnTop(a);
        if (stopped) return;
      }
      // On top: a beat, sometimes a wave
      if (Math.random() < 0.35) await move(a, async () => a.letter.arms?.wave({ arm: 'right' }));
      else await wait(between(300, 800));
      if (!(await chute.claim(a, leaving(a)))) throw RETIRED;
      await move(a, () => slide(a));
      if (stopped) return;
      await goBack(a);
      k = -1;
    }
  }

  // Staggered start
  actors.forEach((a, i) => {
    const on = i === 0 ? top : i === 1 ? 0 : -1;
    if (on >= 0) {
      void places[on].claim(a);
      a.walker.setPosition(standX(on), Z, 0, m.treads[on].y);
      phase.set(a, on === top ? 'top' : 'steps');
      if (on === top) atTop = a;
    } else {
      line.join(a);
      phase.set(a, 'line');
      const p = lineSpot(line.indexOf(a));
      a.walker.setPosition(p.x, p.z, 0, 0);
    }
    void play(a, on);
  });

  function hold(): Promise<void> {
    if (!holding) {
      holding = true;
      released = new Promise((resolve) => (release = resolve));
      // Those standing still (waiting on a place, the line or a beat) face out now
      for (const a of actors) if (!moving.has(a) && !retired.has(a)) void faceOut(a);
    }
    return new Promise<void>((resolve) => {
      settled.push(resolve);
      checkSettled();
    });
  }

  function resume() {
    holding = false;
    release();
  }

  function holdWhenOnTop(who: Actor3D): Promise<void> {
    if (holding && atTop !== who) resume();
    return new Promise<void>((resolve) => {
      const go = () => void hold().then(resolve);
      if (atTop === who) go();
      else topWaiters.push({ who, done: go });
    });
  }

  // --- The acts ---

  /** Where `who` stands in the word. */
  function wordSpot(cast: SlideCast, who: Actor3D) {
    return wordRow(cast)[cast.word.indexOf(who)];
  }

  /**
   * Walk to its place in the word (along the slide's centre line, past its
   * foot). From left of the run-out's end (the line, or the steps, jumping
   * down off their back): round behind the slide, the way letters go back,
   * then forward into place. From the foot itself: straight along (the
   * places further along are the later arrivals').
   */
  async function toWordSpot(cast: SlideCast, who: Actor3D) {
    const spot = wordSpot(cast, who);
    const backZ = Z + BACK_Z;
    if (who.walker.getFloorY() > 0) {
      // Up on the steps (taken out of the play mid-climb)
      const up = who.walker.getPosition();
      await who.walker.hopOnto({ x: up.x, z: Z - SLIDE.depth / 2 - STEP_OFF, floorY: 0 });
    }
    const here = who.walker.getPosition();
    if (here.x < X + m.chute.x2 + FOOT_CLEAR) {
      if (here.z > backZ + 1) {
        await who.walker.walkTo({ x: here.x, z: backZ }, { gait: 'hop', faceCamera: false });
      }
      await who.walker.walkTo({ x: spot.x, z: backZ }, { gait: 'hop', faceCamera: false, durationMs: BACK_TRIP_MS });
    }
    await who.walker.walkTo(spot, { gait: 'hop' });
  }

  /** `h` off the chute's surface at slide-local x, along its normal (up and down-slope). */
  function offSlope(x: number, h: number) {
    const angle = chuteAngle(x);
    return { dx: -Math.sin(angle) * h, dy: Math.cos(angle) * h };
  }

  /**
   * Up the chute from the run-out: a few effortful bobs, a slip back, then
   * on up to just short of `above` on the platform. Turned part-way up-slope,
   * tilted to the chute.
   */
  async function climb(a: Actor3D, above: Actor3D) {
    const from = (m.chute.x1 + m.chute.x2) / 2;
    const stop = mid(m.platform) + PLATFORM_STAND + above.width / 2 + CLIMB_GAP + a.width / 2;
    const upTo = from + (stop - from) * 0.7;
    const slipTo = upTo - 28;
    const yaw0 = a.walker.getYaw();
    void a.letter.brows?.express('angry', { duration: 250 });
    await a.walker.ride((t) => {
      let x: number;
      let bob = 0;
      if (t < 0.5) {
        const u = t / 0.5;
        x = from + (upTo - from) * easeInOut(u);
        bob = Math.abs(Math.sin(u * Math.PI * 4));
      } else if (t < 0.64) {
        const u = (t - 0.5) / 0.14;
        x = upTo + (slipTo - upTo) * u * u;
      } else {
        const u = (t - 0.64) / 0.36;
        x = slipTo + (stop - slipTo) * easeInOut(u);
        bob = Math.abs(Math.sin(u * Math.PI * 3));
      }
      const settle = Math.min(1, t / 0.15);
      const yaw = yaw0 + (CLIMB_YAW - yaw0) * settle;
      // Tilt in its own (turned) plane so its base still lies along the chute
      const roll = Math.atan(Math.tan(chuteAngle(x)) * Math.cos(yaw));
      const off = offSlope(x, 5 * bob);
      return { x: X + x + off.dx, y: chuteY(x) + off.dy, z: Z + CLIMB_DZ * settle, roll, yaw };
    }, CLIMB_MS);
  }

  /** The one below, on its way to its place in the word (misbehave → formWord). */
  let belowThere: Promise<void> = Promise.resolve();

  async function misbehave(cast: SlideCast, cues: { climbing?: () => void; appealTo?: Actor3D } = {}) {
    const { climber, above, below } = cast;
    const fromTop = atTop === climber;
    // Below may be partway round the back (that stretch runs on into the
    // line): it goes to its place when it's out, without holding things up
    const belowOut = retire(below);
    await retire(climber);
    resume(); // `above` carries on up the steps
    // Below makes its own way to its place in the word; only formWord waits for it
    belowThere = belowOut.then(async () => {
      const there = toWordSpot(cast, below);
      releaseHeld(below);
      await there;
    });
    // The climber: down the chute if it's on top, then straight back up it
    await chute.claim(climber);
    if (fromTop) await slide(climber);
    await climber.walker.hopOnto({ x: X + (m.chute.x1 + m.chute.x2) / 2, z: Z, floorY: SLIDE.runoutY });
    cues.climbing?.();
    await climb(climber, above);
    await whenOnTop(above);
    // Face to face: a cheeky grin below, a glare from the top
    grin(climber, above);
    glare(above, climber);
    startStandoff(cast, cues.appealTo);
  }

  // --- The face-off: from misbehave until formWord ---

  interface Standoff {
    on: boolean;
    quiet: boolean;
  }
  let standoff: Standoff | null = null;

  function startStandoff(cast: SlideCast, appealTo?: Actor3D) {
    const state: Standoff = { on: true, quiet: false };
    standoff = state;
    cast.below.lookAtPoint(headOf(cast.climber)); // watching from below
    void rant(cast.above, cast.climber, appealTo ?? cast.below, state);
    void taunt(cast.climber, cast.above, state);
  }

  /** End the face-off: no new moves (each checks between steps); arms and poses let go. */
  function stopStandoff(cast: SlideCast) {
    if (!standoff) return;
    standoff.on = false;
    standoff = null;
    for (const a of [cast.climber, cast.above]) {
      a.letter.arms?.stopAnimations();
      void a.letter.arms?.relax({ duration: 250 });
      a.letter.resetPose();
    }
    cast.below.lookAtPoint(null);
  }

  /** The one kept waiting at the top: stamps, jabs an arm at the climber, appeals to someone. */
  async function rant(w: Actor3D, climber: Actor3D, appealTo: Actor3D, state: Standoff) {
    const alive = () => state.on;
    while (state.on) {
      await wait(between(400, 1000));
      if (!state.on) return;
      if (state.quiet) continue;
      const r = Math.random();
      if (r < 0.4) await stamp(w, alive);
      else if (r < 0.75) await jab(w, alive);
      else await appeal(w, appealTo, climber, alive);
    }
  }

  /** Bounce on the spot on the chute: off the slope and back (along its normal), keeping its tilt. */
  function bounce(a: Actor3D, times: number) {
    const { x: wx, z } = a.walker.getPosition();
    const x = wx - X;
    const yaw = a.walker.getYaw();
    const roll = Math.atan(Math.tan(chuteAngle(x)) * Math.cos(yaw));
    return a.walker.ride((t) => {
      const off = offSlope(x, TAUNT_BOUNCE * Math.abs(Math.sin(Math.PI * times * t)));
      return { x: X + x + off.dx, y: chuteY(x) + off.dy, z, roll, yaw };
    }, 330 * times);
  }

  /** The climber on the chute: bounces laughing, waves at `w`, grins at the audience. */
  async function taunt(a: Actor3D, w: Actor3D, state: Standoff) {
    const arms = a.letter.arms;
    while (state.on) {
      await wait(between(500, 1100));
      if (!state.on) return;
      if (state.quiet) continue;
      const r = Math.random();
      if (r < 0.45) {
        // Bouncing, arms up, laughing
        void arms?.left.rotateTo(ARMS_UP[0], { duration: 150 });
        void arms?.right.rotateTo(ARMS_UP[1], { duration: 150 });
        void a.letter.mouth?.animateSpeak({ duration: 600 });
        await bounce(a, 2);
        if (!state.on) return;
        void arms?.relax({ duration: 250 });
      } else if (r < 0.75) {
        await tauntWave(a); // up at w
      } else {
        await smugWiggle(a, w, () => state.on);
      }
    }
  }

  async function formWord(cast: SlideCast) {
    stopStandoff(cast);
    const { climber, above, below } = cast;
    // Arms fold away as each settles into its place (three letters' arms together are busy)
    const settleIn = (a: Actor3D) => void a.letter.hidePart('arms', { duration: 300 });
    void belowThere.then(() => settleIn(below));
    for (const a of [climber, above]) a.lookAtPoint(null);
    // The climber gives up (sheepish) and slides down from where it got to...
    sheepish(climber);
    restMouth(climber);
    void above.letter.brows?.relax({ duration: 300 });
    restMouth(above);
    const x = climber.walker.getPosition().x - X;
    await slide(climber, slideRun(climber.letter.width, x, SLIDE_MIN_SPEED));
    void climber.letter.brows?.relax({ duration: 300 });
    // ...and hops along to its place, clearing the way for the one on top,
    // which comes down after it and stays where it stops: its place
    const climberThere = toWordSpot(cast, climber).then(() => settleIn(climber));
    const aboveOut = retire(above);
    chute.release();
    await aboveOut;
    await slide(above);
    releaseHeld(above);
    settleIn(above);
    await Promise.all([climberThere, belowThere]);
  }

  return {
    hold,
    resume,
    stop() {
      stopped = true;
      holding = false;
      release();
    },
    holdWhenOnTop,
    holdAtAnEnd(who) {
      if (holding && atTop !== who) resume();
      if (atTop === who) return holdWhenOnTop(who).then(() => 'top' as const);
      const p = phase.get(who);
      if (p === 'sliding') return hold().then(() => 'bottom' as const);
      if (p === 'backLeg1') {
        return new Promise<'top' | 'bottom'>((resolve) => {
          backToBottom = { who, done: () => resolve('bottom') };
        });
      }
      return holdWhenOnTop(who).then(() => 'top' as const);
    },
    misbehave,
    quiet(on) {
      if (standoff) standoff.quiet = on;
    },
    formWord,
  };
}
