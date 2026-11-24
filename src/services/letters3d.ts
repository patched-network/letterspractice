/**
 * 3D LetterPeople (three.js) or SVG: which renderer the lessons and the GPC
 * intros use.
 *
 * 3D by default, wherever WebGL 2 runs on a GPU (three.js needs WebGL 2);
 * SVG otherwise. The choice is per device: `?3d=0` or `?3d=1` on any URL sets
 * it, and it sticks (localStorage).
 *
 * The 3D code loads lazily. StudyHubView warms its chunks (`preload3D` in
 * lessons/index.ts) so a lesson or intro doesn't wait on the network. If a
 * chunk fails to load, or a stage can't start after all, that screen falls
 * back to SVG and 3D stays off until the page reloads.
 */

const PREF_KEY = 'lp.letters3d';
const PARAM = '3d';

/** A 3D stage couldn't start (WebGL refused after all). Callers fall back to SVG. */
export class Letters3DUnavailable extends Error {
  constructor(cause?: unknown) {
    super('3D letters unavailable', { cause });
    this.name = 'Letters3DUnavailable';
  }
}

/** `?3d=0|1` on the current URL → the stored preference. */
function readParam(): void {
  try {
    const v = new URLSearchParams(window.location.search).get(PARAM);
    if (v === '0' || v === '1') localStorage.setItem(PREF_KEY, v);
  } catch {
    // no storage (private window, blocked site data): the default stands
  }
}
// At load, before the router's first navigation can drop the query
readParam();

/** The device's preference: 3D unless it was turned off with `?3d=0`. */
export function prefers3D(): boolean {
  readParam();
  try {
    return localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

let webgl2: boolean | undefined;

/**
 * WebGL 2, on a GPU. `failIfMajorPerformanceCaveat` turns down software
 * rendering, where SVG is the better bet. The probe's context is handed back
 * straight away (browsers cap live contexts at about 16).
 */
export function webgl2Available(): boolean {
  if (webgl2 === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      webgl2 = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

let failed = false;

/** A 3D chunk or stage failed: SVG from here on (until reload). */
export function mark3DFailed(err?: unknown): void {
  if (!failed) console.warn('[letters3d] falling back to SVG:', err);
  failed = true;
}

/** Use the 3D renderer for lessons and GPC intros. */
export function use3DLetters(): boolean {
  return !failed && prefers3D() && webgl2Available();
}

/** The GPC intros' 3D letter (one chunk, shared by both intro views). */
export const loadGpcLetter3D = () => import('../questions/three/GpcLetter3D.vue');

/** The sight-word intro's 3D word. */
export const loadSightWord3D = () => import('../questions/three/SightWord3D.vue');
