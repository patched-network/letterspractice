/**
 * Shared bits for the three.js lesson reworks (SPIKE, dbg-only:
 * /dbg/lesson/three). Each 3D lesson runs its lesson's shared step script
 * through the usual runner + shell; this module holds the staging they have
 * in common.
 */

import { watch } from 'vue';
import type { Gait } from '../../letterpeople/three/locomotion';
import type { OutlineStyle } from '../../letterpeople/three/letterMesh';
import type { EnvironmentName } from '../../letterpeople/three/environments';
import * as THREE from 'three';
import { Stage3D, type Actor3D } from '../../letterpeople/three/stage3d';
import type { Letter3D } from '../../letterpeople/three/letterMesh';
import { oklch } from '../../letterpeople/util/color';
import { Letters3DUnavailable, mark3DFailed } from '../../services/letters3d';
import { createStageGrid } from '../../letterpeople/three/stageGrid';

/** Knobs the dbg viewer passes to every 3D lesson. */
export interface Lesson3DProps {
  gait?: Gait;
  outline?: OutlineStyle;
  /** Outline width in letter units; unset → the 3D default (DEFAULT_LOOK). */
  outlineWidth?: number;
  trackPointer?: boolean;
  environment?: EnvironmentName;
  /** DBG: orbit / pan / zoom the camera by hand (live). */
  freeCamera?: boolean;
  /** DBG: a world-coordinate grid on the floor and a position readout under each letter (live). */
  stageGrid?: boolean;
}

export const LESSON3D_DEFAULTS = {
  gait: 'waddle' as Gait,
  outline: 'cookie' as OutlineStyle,
  trackPointer: false,
  environment: 'bookshelf' as EnvironmentName,
  freeCamera: false,
  stageGrid: false,
};

/** The look props every lesson actor gets (outline style, and width if set). */
export function lessonLook(props: Lesson3DProps): { outline?: OutlineStyle; outlineWidth?: number } {
  return props.outlineWidth === undefined
    ? { outline: props.outline }
    : { outline: props.outline, outlineWidth: props.outlineWidth };
}

/** Same letter colour rule as the SVG lessons. */
export function letterColor(hue: number): string {
  return oklch(0.75, 0.13, hue);
}

/** Gap between letters standing in a word, world units (letter height 100). */
export const WORD_GAP = 6;

/**
 * The lesson's stage. If WebGL refuses it, 3D is marked failed and this throws
 * Letters3DUnavailable, on which LessonView re-mounts the SVG lesson.
 */
export function createLessonStage(el: HTMLElement, props: Lesson3DProps): Stage3D {
  let stage: Stage3D;
  try {
    stage = new Stage3D(el, {
      background: '#FFFEF7',
      trackPointer: props.trackPointer,
      environment: props.environment,
      freeCamera: props.freeCamera,
    });
  } catch (err) {
    mark3DFailed(err);
    throw new Letters3DUnavailable(err);
  }
  if (props.stageGrid) setStageGrid(stage, true);
  return stage;
}

const grids = new WeakMap<Stage3D, { dispose(): void }>();

/** DBG: show or hide the stage grid (stageGrid.ts). */
function setStageGrid(stage: Stage3D, on: boolean) {
  const grid = grids.get(stage);
  if (on && !grid) grids.set(stage, createStageGrid(stage));
  if (!on && grid) {
    grid.dispose();
    grids.delete(stage);
  }
}

/** The dbg stage grid toggles live. */
export function watchStageGrid(props: Lesson3DProps, getStage: () => Stage3D | null) {
  watch(
    () => props.stageGrid,
    (on) => {
      const stage = getStage();
      if (stage) setStageGrid(stage, !!on);
    },
  );
}

/** The dbg free camera toggles live. */
export function watchFreeCamera(props: Lesson3DProps, getStage: () => Stage3D | null) {
  watch(
    () => props.freeCamera,
    (on) => getStage()?.setFreeCamera(!!on),
  );
}

/** Set dressing swaps live (no restart), for flipping between looks. */
export function watchEnvironment(props: Lesson3DProps, getStage: () => Stage3D | null) {
  watch(
    () => props.environment,
    (env) => {
      if (env) getStage()?.setEnvironment(env);
    },
  );
}

/** Centre x of each letter in a row of `widths`, the row centred on `centerX`. */
export function rowCenters(widths: number[], gap = WORD_GAP, centerX = 0): number[] {
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
  let left = centerX - total / 2;
  return widths.map((w) => {
    const c = left + w / 2;
    left += w + gap;
    return c;
  });
}

/** Walk somewhere, then leave the stage (the SVG lessons' display: none). */
export async function walkOffAndHide(
  actor: Actor3D,
  x: number,
  z: number,
  options: { gait?: Gait; durationMs?: number },
): Promise<void> {
  await actor.walkTo(x, z, { ...options, faceCamera: false });
  actor.setVisible(false);
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How far below the shoulders held hands meet, letter units (arms angle down, as children's do). */
const HOLD_DROP = 12;
/** Each hand stops this far short of the meeting point, so the two overlap as a clasp. */
const HOLD_CLASP = 1.2;

/**
 * Two letters standing side by side hold hands: `left`'s right hand and
 * `right`'s left hand meet between them, a little below the shoulders. The
 * hands are placed once, not tracked, so both letters should stay put while
 * holding (moving either one lets go).
 */
export async function holdHands(left: Letter3D, right: Letter3D, ms = 450): Promise<void> {
  const a = left.arms?.right;
  const b = right.arms?.left;
  if (!a || !b) return;
  left.content.updateWorldMatrix(true, false);
  right.content.updateWorldMatrix(true, false);
  const shoulder = (l: Letter3D, p: { x: number; y: number }) => l.content.localToWorld(new THREE.Vector3(p.x, p.y, 0));
  const meet = shoulder(left, a.getShoulderPosition())
    .add(shoulder(right, b.getShoulderPosition()))
    .multiplyScalar(0.5);
  meet.y -= HOLD_DROP;
  const handAt = (l: Letter3D, dx: number) => {
    const v = l.content.worldToLocal(meet.clone().setX(meet.x + dx));
    return { x: v.x, y: v.y };
  };
  const options = ms > 0 ? { duration: ms, ease: 'inOutSine' } : undefined;
  await Promise.all([
    a.setHandPosition(handAt(left, -HOLD_CLASP), options),
    b.setHandPosition(handAt(right, HOLD_CLASP), options),
  ]);
}
