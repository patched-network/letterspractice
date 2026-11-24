/**
 * touchGesture — reads a finger across a word as sounds or as the word.
 *
 * Renderer- and audio-free: feed it pointer samples (stage px + ms) and it
 * says what to play, through hooks. useLessonRunner wires it to the lesson;
 * /dbg/lesson/gesture wires it to a tuning view (the trace hook).
 *
 * The reading:
 *   - A tap (no drag) is the caller's business; this only reads drags.
 *   - Letters fire left to right only: a letter counts once the finger
 *     reaches it past the last one counted, and each team (a GPC: s+h, a-e)
 *     fires once per drag, from whichever of its letters is reached first.
 *     A backwards sweep fires only where it started.
 *   - Speed decides sounds vs word ("say it slowly, say it fast"):
 *       slow finger → each team plays as it's reached ("live");
 *       fast finger → teams are held back. If the fast run reaches every
 *       team of a playable word with nothing played live, the word plays.
 *       If it slows, stalls (no new team for stallMs) or lifts first, the
 *       held teams play in order.
 */

export interface GestureConfig {
  /** Finger speed (px/s) at or above which teams are held back, not played live. */
  fastPxPerS: number;
  /** A held run that reaches no new team for this long plays its held teams. */
  stallMs: number;
  /** Movement (px) before a press counts as a drag. */
  dragStartPx: number;
  /** Speed smoothing time constant (ms). */
  speedTauMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  fastPxPerS: 500, // tuned on /dbg/lesson/gesture (was 700)
  stallMs: 200,
  dragStartPx: 10,
  speedTauMs: 50,
};

/** A letter under the finger, and the team (GPC) it belongs to. */
export interface GestureHit<Team> {
  team: Team;
  /** The letter's centre x (stage px): the left-to-right frontier. */
  centreX: number;
}

export type GestureTrace<Team> =
  | { kind: 'sample'; t: number; x: number; y: number; speed: number }
  | { kind: 'drag-start'; t: number }
  | { kind: 'team'; t: number; team: Team; mode: 'live' | 'held'; speed: number }
  | { kind: 'flush'; t: number; teams: Team[]; reason: 'slowed' | 'stalled' | 'lifted' | 'live-after' }
  | { kind: 'word'; t: number; teams: Team[] }
  | { kind: 'end'; t: number };

export interface GestureHooks<Team> {
  /** The letter under a point, if it has a sound to play. */
  hit(x: number, y: number): GestureHit<Team> | null;
  /**
   * The word a team belongs to, as its ordered teams, if the whole word may
   * be played now (it has been heard). null: sounds only.
   */
  wordOf(team: Team): Team[] | null;
  playTeam(team: Team): void;
  playWord(teams: Team[]): void;
  trace?(event: GestureTrace<Team>): void;
}

export interface GestureInterpreter {
  down(x: number, y: number, t: number): void;
  move(x: number, y: number, t: number): void;
  /** Lift. Returns true if it was a drag (so not a tap). */
  up(x: number, y: number, t: number): boolean;
  cancel(): void;
  /** Tweak thresholds live (dbg). */
  config: GestureConfig;
}

export function createGestureInterpreter<Team>(
  hooks: GestureHooks<Team>,
  config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG },
): GestureInterpreter {
  let g: {
    x0: number;
    y0: number;
    lastX: number;
    lastY: number;
    lastT: number;
    speed: number;
    moved: boolean;
    dragging: boolean;
    frontierX: number;
    fired: Set<Team>;
    held: Team[];
    anyLive: boolean;
  } | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const now = () => performance.now();

  const clearStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };

  function flush(reason: 'slowed' | 'stalled' | 'lifted' | 'live-after'): void {
    clearStall();
    if (!g || !g.held.length) return;
    const teams = g.held;
    g.held = [];
    g.anyLive = true; // held sounds played: this gesture can no longer be the word
    hooks.trace?.({ kind: 'flush', t: now(), teams, reason });
    for (const team of teams) hooks.playTeam(team);
  }

  function armStall(): void {
    clearStall();
    stallTimer = setTimeout(() => flush('stalled'), config.stallMs);
  }

  /** The word, if this held run has reached all of it with nothing played live. */
  function completedWord(): Team[] | null {
    if (!g || g.anyLive || !g.held.length) return null;
    const word = hooks.wordOf(g.held[0]);
    if (!word || word.length < 2) return null;
    return word.every((team) => g!.fired.has(team)) ? word : null;
  }

  function reach(x: number, y: number, t: number): void {
    if (!g) return;
    const h = hooks.hit(x, y);
    if (!h || h.centreX <= g.frontierX) return;
    g.frontierX = h.centreX;
    if (g.fired.has(h.team)) return; // its team already fired from an earlier letter
    g.fired.add(h.team);
    if (g.speed >= config.fastPxPerS) {
      g.held.push(h.team);
      hooks.trace?.({ kind: 'team', t, team: h.team, mode: 'held', speed: g.speed });
      const word = completedWord();
      if (word) {
        clearStall();
        g.held = [];
        g.anyLive = true; // the word has played; nothing more from this drag
        hooks.trace?.({ kind: 'word', t, teams: word });
        hooks.playWord(word);
        return;
      }
      armStall();
    } else {
      flush('live-after'); // anything held plays first, in order
      g.anyLive = true;
      hooks.trace?.({ kind: 'team', t, team: h.team, mode: 'live', speed: g.speed });
      hooks.playTeam(h.team);
    }
  }

  return {
    config,
    down(x, y, t) {
      clearStall();
      g = {
        x0: x,
        y0: y,
        lastX: x,
        lastY: y,
        lastT: t,
        speed: 0,
        moved: false,
        dragging: false,
        frontierX: -Infinity,
        fired: new Set(),
        held: [],
        anyLive: false,
      };
      hooks.trace?.({ kind: 'sample', t, x, y, speed: 0 });
    },
    move(x, y, t) {
      if (!g) return;
      const dt = Math.max(1, t - g.lastT);
      const v = (Math.hypot(x - g.lastX, y - g.lastY) / dt) * 1000;
      // Smoothed, but the first move seeds it: from 0, a quick flick would
      // still read slow at its first letter and could never be the word.
      const k = g.moved ? 1 - Math.exp(-dt / config.speedTauMs) : 1;
      g.speed += (v - g.speed) * k;
      g.moved = true;
      g.lastX = x;
      g.lastY = y;
      g.lastT = t;
      hooks.trace?.({ kind: 'sample', t, x, y, speed: g.speed });
      if (!g.dragging) {
        if (Math.hypot(x - g.x0, y - g.y0) < config.dragStartPx) return;
        g.dragging = true;
        hooks.trace?.({ kind: 'drag-start', t });
        reach(g.x0, g.y0, t); // the letter the drag started on
      }
      if (g.held.length && g.speed < config.fastPxPerS) flush('slowed');
      reach(x, y, t);
    },
    up(_x, _y, t) {
      if (!g) return false;
      const dragged = g.dragging;
      if (dragged) flush('lifted');
      hooks.trace?.({ kind: 'end', t });
      clearStall();
      g = null;
      return dragged;
    },
    cancel() {
      clearStall();
      g = null;
    },
  };
}
